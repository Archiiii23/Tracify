/**
 * Alert generation and lifecycle.
 *
 * Detectors turn an attribution result into operator-facing alerts. Each alert
 * is deduplicated on (code, address, complaint) so re-running a trace refreshes
 * the existing alert instead of flooding the queue.
 */
import { Types } from "mongoose";
import { Alert, type AlertDoc, type AlertSeverity } from "../models/Alert.model";
import type { AttributionResult } from "./attribution.service";
import { logger } from "../utils/logger";

interface AlertDraft {
  code: string;
  title: string;
  severity: AlertSeverity;
  summary: string;
  recommendedActions: string[];
  addresses: string[];
  evidence: Record<string, unknown>;
}

/** Turn an attribution result into the alerts an operator must act on. */
export function detectAlerts(result: AttributionResult): AlertDraft[] {
  const drafts: AlertDraft[] = [];
  const vasp = result.nearestVasp;

  if (vasp && vasp.directDeposit) {
    drafts.push({
      code: "VASP_DIRECT_DEPOSIT",
      title: `Direct deposit to ${vasp.entity}`,
      severity: "critical",
      summary: `Funds from ${result.address} move directly into ${vasp.entity} deposit address ${vasp.address}. This is the highest-value freeze opportunity: there is no intermediary wallet between the victim's funds and a regulated service.`,
      recommendedActions: [
        `Send an emergency freeze request to ${vasp.entity} for ${vasp.address}.`,
        "Request KYC, login IP logs and withdrawal history for the receiving account.",
      ],
      addresses: [result.address, vasp.address],
      evidence: { vasp, txHashes: vasp.txHashes, confidence: vasp.confidence },
    });
  } else if (vasp) {
    drafts.push({
      code: "VASP_REACHED",
      title: `Regulated touchpoint identified: ${vasp.entity}`,
      severity: vasp.hops <= 2 ? "high" : "medium",
      summary: `Value from ${result.address} reaches ${vasp.entity} after ${vasp.hops} hops (attribution confidence ${Math.round(vasp.confidence * 100)}%). The full address trail is preserved for the information request.`,
      recommendedActions: [
        `Raise a SAHYOG information request with ${vasp.entity} for ${vasp.address}.`,
        "Include the intermediary wallet trail so the VASP can match its internal deposit records.",
      ],
      addresses: [result.address, vasp.address],
      evidence: { vasp, path: vasp.path },
    });
  } else {
    drafts.push({
      code: "NO_VASP_TOUCHPOINT",
      title: "No regulated touchpoint within hop bound",
      severity: "low",
      summary: `No exchange or VASP deposit address was reached from ${result.address} within ${result.metrics.hopsTraced} hops. Funds may still be sitting in private wallets.`,
      recommendedActions: [
        "Place the address under monitoring so the first outbound deposit triggers an alert.",
        "Re-run the trace with a wider hop bound.",
      ],
      addresses: [result.address],
      evidence: { metrics: result.metrics },
    });
  }

  if (result.obfuscation.detected) {
    drafts.push({
      code: "MIXER_EXPOSURE",
      title: "Mixing / privacy service exposure",
      severity: "critical",
      summary: `${result.obfuscation.services.length} obfuscation service interaction(s) detected on the value path from ${result.address}. Provenance is being deliberately broken, which materially shortens the window for asset recovery.`,
      recommendedActions: [
        "Preserve all pre-mixer transaction records immediately.",
        "Escalate to the nodal cyber cell — mixer usage indicates organised laundering.",
      ],
      addresses: [result.address, ...result.obfuscation.services.map((s) => s.address)],
      evidence: { services: result.obfuscation.services },
    });
  }

  if (result.crossChain.detected) {
    drafts.push({
      code: "CROSS_CHAIN_MOVEMENT",
      title: "Cross-chain bridge movement detected",
      severity: "high",
      summary: `${result.crossChain.bridgeHops.length} bridge interaction(s) detected — value leaves ${result.chain} and continues on another chain, so a single-chain trace will understate the loss.`,
      recommendedActions: [
        "Open a parallel trace on the destination chain of each bridge hop.",
        "Correlate bridge deposit and withdrawal timing to link the two legs.",
      ],
      addresses: result.crossChain.bridgeHops.map((b) => b.address),
      evidence: { bridgeHops: result.crossChain.bridgeHops },
    });
  }

  const splitters = result.intermediaries.filter((i) => i.role === "splitter");
  if (splitters.length >= 2) {
    drafts.push({
      code: "LAYERING_NETWORK",
      title: "Multi-wallet layering network",
      severity: "high",
      summary: `${splitters.length} splitting wallets distribute value across the graph from ${result.address}, a structuring pattern used to dilute traceability and defeat per-address freeze requests.`,
      recommendedActions: [
        "Freeze on the entity, not the address: request all deposit addresses linked to the identified accounts.",
        "Check the splitter wallets against other open complaints for shared infrastructure.",
      ],
      addresses: splitters.map((s) => s.address),
      evidence: { splitters },
    });
  }

  if (result.riskScore >= 85) {
    drafts.push({
      code: "SEVERE_RISK_SCORE",
      title: `Severe risk score (${result.riskScore}/100)`,
      severity: "critical",
      summary: `Automated risk assessment for ${result.address} returned ${result.riskScore}/100 (${result.riskCategory}). Primary drivers: ${result.riskReasons.slice(0, 3).join("; ")}.`,
      recommendedActions: [
        "Prioritise this complaint in the triage queue.",
        "Notify the identified VASP proactively of a high-risk deposit pattern.",
      ],
      addresses: [result.address],
      evidence: { riskScore: result.riskScore, reasons: result.riskReasons },
    });
  }

  if (result.typology.typology !== "unknown" && result.typology.confidence >= 0.7) {
    drafts.push({
      code: "TYPOLOGY_MATCH",
      title: `Typology match: ${result.typology.label}`,
      severity: "medium",
      summary: `On-chain behaviour matches "${result.typology.label}" with ${Math.round(result.typology.confidence * 100)}% confidence. Drivers: ${result.typology.drivers.map((d) => d.note).join("; ") || "structural features"}.`,
      recommendedActions: [
        "Group this complaint with other reports of the same typology to build a consolidated case.",
        "Apply the typology-specific investigative playbook.",
      ],
      addresses: [result.address],
      evidence: { typology: result.typology },
    });
  }

  return drafts;
}

/** Persist detected alerts, refreshing existing ones instead of duplicating. */
export async function raiseAlerts(
  result: AttributionResult,
  links: { complaint?: Types.ObjectId; case?: Types.ObjectId; investigation?: Types.ObjectId } = {},
): Promise<AlertDoc[]> {
  const drafts = detectAlerts(result);
  const saved: AlertDoc[] = [];

  for (const draft of drafts) {
    const filter: Record<string, unknown> = {
      code: draft.code,
      addresses: draft.addresses[0],
      ...(links.complaint ? { complaint: links.complaint } : {}),
    };
    const alert = await Alert.findOneAndUpdate(
      filter,
      {
        $set: {
          ...draft,
          chain: result.chain,
          ...(links.complaint ? { complaint: links.complaint } : {}),
          ...(links.case ? { case: links.case } : {}),
          ...(links.investigation ? { investigation: links.investigation } : {}),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    if (alert) saved.push(alert);
  }

  logger.info("alerts raised", { address: result.address, count: saved.length });
  return saved;
}

export async function listAlerts(options: {
  page: number;
  limit: number;
  sort: string;
  order: "asc" | "desc";
  status?: string;
  severity?: string;
  complaintId?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (options.status) filter['status'] = options.status;
  if (options.severity) filter['severity'] = options.severity;
  if (options.complaintId) filter['complaint'] = new Types.ObjectId(options.complaintId);

  const [items, total] = await Promise.all([
    Alert.find(filter)
      .sort({ [options.sort]: options.order === "asc" ? 1 : -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    Alert.countDocuments(filter),
  ]);

  return { items, total };
}

export async function updateAlertStatus(
  id: string,
  status: "open" | "acknowledged" | "actioned" | "dismissed",
  userId: string,
) {
  const update: Record<string, unknown> = { status };
  if (status !== "open") {
    update['acknowledgedBy'] = new Types.ObjectId(userId);
    update['acknowledgedAt'] = new Date();
  }
  return Alert.findByIdAndUpdate(new Types.ObjectId(id), update, { new: true });
}
