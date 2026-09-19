import { Types } from "mongoose";
import { Case } from "../models/Case.model";
import { nextSequentialId } from "../models/Counter.model";
import { Evidence } from "../models/Evidence.model";
import { Finding } from "../models/Finding.model";
import { Investigation } from "../models/Investigation.model";
import { Report, type ReportDoc } from "../models/Report.model";
import type { AuthenticatedUser } from "../types/express";
import { ApiError } from "../utils/ApiError";
import { asObjectId, assertCaseAccess, caseScopeFilter } from "./access.service";

async function scopeFilter(user: AuthenticatedUser): Promise<Record<string, unknown>> {
  if (user.role === "admin") return {};
  const cases = await Case.find(caseScopeFilter(user)).select("_id").lean();
  return { case: { $in: cases.map((c) => c._id) } };
}

export async function listReports(
  user: AuthenticatedUser,
  options: { page: number; limit: number; sort: string; order: "asc" | "desc"; caseId?: string; status?: string },
) {
  const filter: Record<string, unknown> = await scopeFilter(user);
  if (options.caseId) {
    await assertCaseAccess(options.caseId, user);
    filter['case'] = asObjectId(options.caseId);
  }
  if (options.status) filter['status'] = options.status;

  const [items, total] = await Promise.all([
    Report.find(filter)
      .sort({ [options.sort]: options.order === "asc" ? 1 : -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate("case", "reference title")
      .lean(),
    Report.countDocuments(filter),
  ]);

  return { items, total };
}

const money = (value: number) =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * Assemble a defensible report from what the case actually contains: findings,
 * sealed evidence and completed traces. Nothing is invented at render time.
 */
export async function generateReport(
  user: AuthenticatedUser,
  input: { caseId: string; title?: string; audience?: ReportDoc["audience"] },
) {
  const parent = await assertCaseAccess(input.caseId, user);
  const caseId = parent._id as Types.ObjectId;

  const [investigations, findings, evidence] = await Promise.all([
    Investigation.find({ case: caseId }).select("-graph").lean(),
    Finding.find({ case: caseId }).sort({ severity: -1, createdAt: 1 }).lean(),
    Evidence.find({ case: caseId }).sort({ createdAt: 1 }).lean(),
  ]);

  const tracedValue = investigations.reduce((acc, i) => acc + (i.metrics?.valueTracedUsd ?? 0), 0);
  const vaspTouchpoints = investigations.reduce(
    (acc, i) => acc + (i.metrics?.vaspTouchpoints ?? 0),
    0,
  );
  const maxRisk = investigations.reduce((acc, i) => Math.max(acc, i.riskScore ?? 0), 0);

  const executiveSummary = [
    `Case ${parent.reference} ("${parent.title}") records a reported loss of ${money(parent.reportedLossUsd)}.`,
    `${investigations.length} trace(s) followed ${money(tracedValue)} of on-chain value across ${vaspTouchpoints} regulated service touchpoint(s).`,
    `${findings.length} finding(s) and ${evidence.length} sealed exhibit(s) support the conclusions below. Highest observed path risk is ${maxRisk}/100.`,
  ].join(" ");

  const sections = [
    {
      heading: "Scope and methodology",
      body: [
        "Value was traced using bounded hop expansion from the reported origin address, preserving value continuity across swaps and splits.",
        "Each hop is timestamped and linked to its source transaction. Paths were ranked by retained value, aggregate address risk and hop economy; suppressed paths remain recoverable.",
      ].join("\n\n"),
    },
    {
      heading: "Traces performed",
      body:
        investigations
          .map(
            (i) =>
              `${i.reference} — ${i.title}\nRoot: ${i.rootAddress} (${i.chain})\nStatus: ${i.status} · Risk ${i.riskScore}/100 · ${i.metrics?.addressesTouched ?? 0} addresses · ${i.metrics?.hopsTraced ?? 0} hops · ${money(i.metrics?.valueTracedUsd ?? 0)} traced`,
          )
          .join("\n\n") || "No traces have been executed for this case.",
    },
    {
      heading: "Findings",
      body:
        findings
          .map(
            (f) =>
              `[${f.severity.toUpperCase()} · ${f.category} · confidence ${(f.confidence * 100).toFixed(0)}%] ${f.title}\n${f.description}`,
          )
          .join("\n\n") || "No findings have been recorded for this case.",
    },
    {
      heading: "Exhibits and chain of custody",
      body:
        evidence
          .map(
            (e, index) =>
              `Exhibit ${String(index + 1).padStart(2, "0")} — ${e.label} (${e.kind})\nSHA-256: ${e.checksum}\nSealed: ${new Date(e.sealedAt).toISOString()}`,
          )
          .join("\n\n") || "No exhibits have been pinned for this case.",
    },
    {
      heading: "Recommended next steps",
      body:
        vaspTouchpoints > 0
          ? "Issue information requests to the identified regulated services for the deposit addresses listed in the exhibits, and request a freeze on the retained balances where jurisdiction permits."
          : "Extend the trace by one hop bound and enrich attribution before escalating; no regulated service exposure has been established yet.",
    },
  ];

  const reference = await nextSequentialId("REP");

  return Report.create({
    reference,
    case: caseId,
    title: input.title ?? `${parent.reference} — investigation report`,
    audience: input.audience ?? "internal",
    status: "draft",
    executiveSummary,
    sections,
    findingIds: findings.map((f) => f._id as Types.ObjectId),
    evidenceIds: evidence.map((e) => e._id as Types.ObjectId),
    generatedBy: new Types.ObjectId(user.id),
  });
}

export async function getReport(id: string, user: AuthenticatedUser): Promise<ReportDoc> {
  const found = await Report.findById(asObjectId(id));
  if (!found) throw ApiError.notFound("Report not found");
  await assertCaseAccess(found.case, user);
  return found;
}

export async function updateReport(
  id: string,
  user: AuthenticatedUser,
  patch: Partial<Pick<ReportDoc, "title" | "status" | "audience" | "executiveSummary" | "sections">>,
) {
  const found = await getReport(id, user);
  if (found.status === "final" && patch.status !== "draft") {
    throw ApiError.badRequest("A finalised report cannot be edited — clone it instead");
  }
  Object.assign(found, patch);
  if (patch.status === "final") found.finalisedAt = new Date();
  await found.save();
  return found;
}

export async function deleteReport(id: string, user: AuthenticatedUser) {
  const found = await getReport(id, user);
  if (found.status === "final") throw ApiError.badRequest("Finalised reports cannot be deleted");
  await found.deleteOne();
}

/** Flat, spreadsheet-friendly rendering of a report's exhibits. */
export function reportToCsv(report: ReportDoc): string {
  const rows: string[][] = [["section", "content"]];
  rows.push(["Executive summary", report.executiveSummary]);
  for (const section of report.sections) rows.push([section.heading, section.body]);
  return rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
