/**
 * Complaint intake and automated triage.
 *
 * A complaint arrives from NCRP/SAHYOG (or an investigator) carrying one or more
 * victim-reported suspect wallet addresses. Triage runs the attribution pipeline
 * on every address, stores the result, raises alerts, and rolls the per-address
 * findings up into a single risk score and primary VASP for the complaint — so
 * an operator sees "who to contact and how urgent" without opening the graph.
 */
import { Types } from "mongoose";
import {
  Complaint,
  type ComplaintDoc,
  type ComplaintSource,
  type FraudType,
} from "../models/Complaint.model";
import type { Chain } from "../models/Investigation.model";
import { nextSequentialId } from "../models/Counter.model";
import { Case } from "../models/Case.model";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import { attributeAddress, summariseAttribution, type AttributionResult } from "./attribution.service";
import { raiseAlerts } from "./alert.service";
import { riskCategoryFor } from "./typology.service";
import type { AuthenticatedUser } from "../types/express";
import { asObjectId } from "./access.service";

export interface IntakeInput {
  source: ComplaintSource;
  externalRef?: string;
  reportedAt?: string;
  jurisdiction?: string;
  victim?: { maskedName?: string; state?: string; district?: string };
  fraudType?: FraudType;
  lossInr?: number;
  narrative?: string;
  addresses: { address: string; chain: Chain; note?: string }[];
}

/** USD conversion for the trace seed; INR losses are the reporting currency. */
const INR_PER_USD = 83;

export async function createComplaint(input: IntakeInput): Promise<ComplaintDoc> {
  // Idempotent intake: the same external reference must not create duplicates.
  if (input.externalRef) {
    const existing = await Complaint.findOne({
      source: input.source,
      externalRef: input.externalRef,
    });
    if (existing) return existing;
  }

  const reference = await nextSequentialId("CMP");

  return Complaint.create({
    reference,
    source: input.source,
    ...(input.externalRef ? { externalRef: input.externalRef } : {}),
    reportedAt: input.reportedAt ? new Date(input.reportedAt) : new Date(),
    ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
    victim: input.victim ?? {},
    fraudType: input.fraudType ?? "other",
    lossInr: input.lossInr ?? 0,
    ...(input.narrative ? { narrative: input.narrative } : {}),
    suspectAddresses: input.addresses.map((a) => ({
      address: a.address,
      chain: a.chain,
      ...(a.note ? { note: a.note } : {}),
    })),
    triageStatus: "received",
  });
}

/**
 * Run attribution on every suspect address, persist results, raise alerts and
 * roll findings up onto the complaint. Errors are captured on the document
 * rather than thrown, so a single unreachable chain cannot lose the complaint.
 */
export async function triageComplaint(complaintId: string): Promise<void> {
  try {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return;

    complaint.triageStatus = "attributing";
    await complaint.save();

    const seedUsd = complaint.lossInr > 0 ? Math.round(complaint.lossInr / INR_PER_USD) : 0;
    const results: AttributionResult[] = [];

    for (const suspect of complaint.suspectAddresses) {
      const result = await attributeAddress(suspect.chain, suspect.address, {
        ...(seedUsd > 0 ? { seedValueUsd: seedUsd } : {}),
        reportedType: complaint.fraudType,
      });
      results.push(result);
      suspect.attribution = summariseAttribution(result) as unknown as Record<string, unknown>;
      suspect.attributedAt = new Date();
      await raiseAlerts(result, { complaint: complaint._id });
    }

    // Complaint-level risk is the worst address: one severe wallet makes the
    // whole complaint urgent.
    const score = results.reduce((max, r) => Math.max(max, r.riskScore), 0);
    complaint.riskScore = score;
    complaint.riskCategory = riskCategoryFor(score);

    // Primary VASP is the closest, highest-confidence regulated touchpoint
    // across every reported address — that is who gets the freeze request.
    const best = results
      .map((r) => r.nearestVasp)
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => a.hops - b.hops || b.confidence - a.confidence)[0];

    if (best) {
      complaint.primaryVasp = {
        entity: best.entity,
        address: best.address,
        chain: best.chain,
        hops: best.hops,
        confidence: best.confidence,
      };
    }

    complaint.triageStatus = score >= 70 ? "escalated" : "attributed";
    complaint.markModified("suspectAddresses");
    await complaint.save();

    logger.info("complaint triaged", {
      complaintId,
      riskScore: score,
      vasp: best?.entity ?? null,
    });
  } catch (error) {
    logger.error("complaint triage failed", {
      complaintId,
      reason: error instanceof Error ? error.message : String(error),
    });
    await Complaint.findByIdAndUpdate(complaintId, {
      triageStatus: "failed",
      failureReason: "Automated attribution could not be completed",
    });
  }
}

export async function listComplaints(options: {
  page: number;
  limit: number;
  sort: string;
  order: "asc" | "desc";
  status?: string;
  source?: string;
  riskCategory?: string;
  search?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (options.status) filter['triageStatus'] = options.status;
  if (options.source) filter['source'] = options.source;
  if (options.riskCategory) filter['riskCategory'] = options.riskCategory;
  if (options.search) {
    const escaped = options.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter['$or'] = [
      { reference: new RegExp(escaped, "i") },
      { externalRef: new RegExp(escaped, "i") },
      { "suspectAddresses.address": new RegExp(escaped, "i") },
    ];
  }

  const [items, total] = await Promise.all([
    Complaint.find(filter)
      .select("-suspectAddresses.attribution")
      .sort({ [options.sort]: options.order === "asc" ? 1 : -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    Complaint.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getComplaint(id: string): Promise<ComplaintDoc> {
  const found = await Complaint.findById(asObjectId(id));
  if (!found) throw ApiError.notFound("Complaint not found");
  return found;
}

/** Promote a triaged complaint into a full investigation case. */
export async function linkComplaintToCase(
  id: string,
  user: AuthenticatedUser,
): Promise<{ complaint: ComplaintDoc; caseId: Types.ObjectId }> {
  const complaint = await getComplaint(id);
  if (complaint.linkedCase) {
    return { complaint, caseId: complaint.linkedCase };
  }

  const reference = await nextSequentialId("CASE");
  const chains = [...new Set(complaint.suspectAddresses.map((a) => a.chain))];

  const created = await Case.create({
    reference,
    title: `${complaint.reference} — ${complaint.fraudType.replace(/-/g, " ")}`,
    summary:
      complaint.narrative ??
      `Auto-created from ${complaint.source.toUpperCase()} complaint ${complaint.reference}.`,
    status: "active",
    priority:
      complaint.riskCategory === "severe"
        ? "critical"
        : complaint.riskCategory === "high"
          ? "high"
          : "medium",
    ...(complaint.jurisdiction ? { jurisdiction: complaint.jurisdiction } : {}),
    reportedLossUsd: Math.round(complaint.lossInr / INR_PER_USD),
    chains,
    tags: [complaint.source, complaint.fraudType],
    createdBy: new Types.ObjectId(user.id),
    assignedTo: [new Types.ObjectId(user.id)],
  });

  complaint.linkedCase = created._id;
  await complaint.save();

  return { complaint, caseId: created._id };
}

/** Queue view: what an operator should work on next, worst first. */
export async function triageQueue() {
  const [byStatus, bySource, topRisk, totals] = await Promise.all([
    Complaint.aggregate([{ $group: { _id: "$triageStatus", count: { $sum: 1 } } }]),
    Complaint.aggregate([{ $group: { _id: "$source", count: { $sum: 1 } } }]),
    Complaint.find({ triageStatus: { $in: ["attributed", "escalated"] } })
      .select("reference source fraudType riskScore riskCategory primaryVasp lossInr createdAt")
      .sort({ riskScore: -1, createdAt: -1 })
      .limit(10)
      .lean(),
    Complaint.aggregate([
      {
        $group: {
          _id: null,
          complaints: { $sum: 1 },
          lossInr: { $sum: "$lossInr" },
          addresses: { $sum: { $size: "$suspectAddresses" } },
        },
      },
    ]),
  ]);

  const attributed = await Complaint.countDocuments({ primaryVasp: { $exists: true } });
  const summary = totals[0] ?? { complaints: 0, lossInr: 0, addresses: 0 };

  return {
    totals: {
      complaints: summary.complaints as number,
      lossInr: summary.lossInr as number,
      addresses: summary.addresses as number,
      vaspAttributed: attributed,
      attributionRate:
        summary.complaints > 0 ? Math.round((attributed / summary.complaints) * 100) : 0,
    },
    byStatus: Object.fromEntries(byStatus.map((b) => [b._id, b.count])),
    bySource: Object.fromEntries(bySource.map((b) => [b._id, b.count])),
    topRisk,
  };
}
