/**
 * Standardised law-enforcement report for a triaged complaint.
 *
 * The output is deliberately a plain, ordered document object: a single shape
 * that can be rendered as PDF, attached to a SAHYOG information request, or
 * exported as JSON for another LEA system, without any of them needing to know
 * about the graph internals.
 */
import type { ComplaintDoc } from "../models/Complaint.model";
import { Alert } from "../models/Alert.model";
import type { AttributionResult } from "./attribution.service";

export interface LeaReport {
  title: string;
  reference: string;
  generatedAt: Date;
  classification: "restricted";
  complaint: {
    reference: string;
    source: string;
    externalRef?: string;
    reportedAt: Date;
    jurisdiction?: string;
    fraudType: string;
    lossInr: number;
    victimState?: string;
  };
  assessment: {
    riskScore: number;
    riskCategory: string;
    typology: string;
    typologyConfidence: number;
    freezeActionable: boolean;
  };
  /** Who to serve the freeze / information request on. */
  attributedVasps: {
    entity: string;
    depositAddress: string;
    chain: string;
    hops: number;
    directDeposit: boolean;
    valueUsd: number;
    confidence: number;
    transactionReferences: string[];
  }[];
  /** Annexure A — the traced value trail, per reported address. */
  transactionTrails: {
    reportedAddress: string;
    chain: string;
    dataSource: string;
    trail: string[];
    intermediaries: { address: string; hop: number; role: string; reason: string }[];
  }[];
  indicators: {
    crossChain: string;
    obfuscation: string;
    behavioural: { code: string; label: string; severity: string; explanation: string }[];
  };
  alerts: { code: string; title: string; severity: string; summary: string }[];
  recommendedActions: string[];
  /** Evidentiary caveats — stated explicitly, never buried. */
  caveats: string[];
}

function attributionOf(value: unknown): AttributionResult | null {
  if (!value || typeof value !== "object") return null;
  return value as AttributionResult;
}

export async function buildLeaReport(complaint: ComplaintDoc): Promise<LeaReport> {
  const attributions = complaint.suspectAddresses
    .map((s) => attributionOf(s.attribution))
    .filter((a): a is AttributionResult => a !== null);

  const alerts = await Alert.find({ complaint: complaint._id })
    .select("code title severity summary")
    .sort({ severity: 1, createdAt: -1 })
    .lean();

  const best = attributions
    .map((a) => a.typology)
    .sort((a, b) => b.confidence - a.confidence)[0];

  const anySynthetic = attributions.some((a) => !a.live);

  const caveats = [
    "Attribution is derived from public blockchain data and third-party address attribution; deposit-address ownership must be confirmed by the VASP.",
    "Hop-bounded tracing may omit value paths beyond the configured hop limit.",
  ];
  if (anySynthetic) {
    caveats.unshift(
      "One or more traces in this report used the offline deterministic ledger because live chain indexing was unreachable. Re-run before evidentiary use.",
    );
  }

  return {
    title: "Crypto Fraud Attribution Report",
    reference: complaint.reference,
    generatedAt: new Date(),
    classification: "restricted",
    complaint: {
      reference: complaint.reference,
      source: complaint.source,
      ...(complaint.externalRef ? { externalRef: complaint.externalRef } : {}),
      reportedAt: complaint.reportedAt,
      ...(complaint.jurisdiction ? { jurisdiction: complaint.jurisdiction } : {}),
      fraudType: complaint.fraudType,
      lossInr: complaint.lossInr,
      ...(complaint.victim?.state ? { victimState: complaint.victim.state } : {}),
    },
    assessment: {
      riskScore: complaint.riskScore,
      riskCategory: complaint.riskCategory,
      typology: best?.label ?? "Unclassified",
      typologyConfidence: best?.confidence ?? 0,
      freezeActionable: attributions.some((a) => a.freezeActionable),
    },
    attributedVasps: attributions
      .flatMap((a) => a.vaspCandidates)
      .sort((a, b) => a.hops - b.hops || b.confidence - a.confidence)
      .slice(0, 10)
      .map((v) => ({
        entity: v.entity,
        depositAddress: v.address,
        chain: v.chain,
        hops: v.hops,
        directDeposit: v.directDeposit,
        valueUsd: v.valueUsd,
        confidence: v.confidence,
        transactionReferences: v.txHashes,
      })),
    transactionTrails: attributions.map((a) => ({
      reportedAddress: a.address,
      chain: a.chain,
      dataSource: a.dataSource,
      trail: a.nearestVasp?.path ?? a.topPaths[0]?.addresses ?? [a.address],
      intermediaries: a.intermediaries.map((i) => ({
        address: i.address,
        hop: i.hop,
        role: i.role,
        reason: i.reason,
      })),
    })),
    indicators: {
      crossChain:
        attributions.find((a) => a.crossChain.detected)?.crossChain.note ??
        "No cross-chain movement detected.",
      obfuscation:
        attributions.find((a) => a.obfuscation.detected)?.obfuscation.note ??
        "No obfuscation service exposure detected.",
      behavioural: attributions
        .flatMap((a) => a.signals)
        .map((s) => ({
          code: s.code,
          label: s.label,
          severity: s.severity,
          explanation: s.explanation,
        })),
    },
    alerts: alerts.map((a) => ({
      code: a.code,
      title: a.title,
      severity: a.severity,
      summary: a.summary,
    })),
    recommendedActions: [...new Set(attributions.flatMap((a) => a.recommendations))],
    caveats,
  };
}
