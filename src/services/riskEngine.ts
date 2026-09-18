/**
 * Unified TRACIFY heuristic risk scoring — frontend pipeline + UI.
 *
 * Blends structural node exposure (entity labels, hop distance) with
 * behavioural signal severity. Mirrors server `scoreRisk` weights so
 * investigation scores stay consistent across client and API paths.
 */

import type { Severity } from "@/lib/domain";
import { FORENSIC_COPY } from "@/lib/provenance";
import { resolveEntity } from "./blockchain/attributionDb";
import type {
  BehaviourSignal,
  GraphNode,
  NodeKind,
  TracePath,
} from "./intelligence";

export type RiskBand = "low" | "medium" | "high" | "critical";

export interface RiskFactor {
  id: string;
  label: string;
  contribution: number;
  description: string;
}

export interface InvestigationRiskAssessment {
  score: number;
  band: RiskBand;
  factors: RiskFactor[];
  nodeScores: Record<string, number>;
  provenance: string;
}

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  low: 2,
  medium: 5,
  high: 9,
  critical: 15,
};

const SIGNAL_CONFIDENCE: Record<Severity, number> = {
  low: 0.6,
  medium: 0.75,
  high: 0.85,
  critical: 0.92,
};

export function riskBandFromScore(score: number): RiskBand {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  return "low";
}

export function riskBandLabel(band: RiskBand): string {
  switch (band) {
    case "critical":
      return "Critical risk";
    case "high":
      return "High risk";
    case "medium":
      return "Elevated";
    case "low":
      return "Low risk";
  }
}

export function riskBandTone(
  band: RiskBand,
): "positive" | "warning" | "critical" | "neutral" {
  switch (band) {
    case "critical":
    case "high":
      return "critical";
    case "medium":
      return "warning";
    default:
      return "positive";
  }
}

function baselineNodeRisk(
  address: string,
  chain: string,
  kind: NodeKind,
  hop: number,
): number {
  const entity = resolveEntity(address, chain);
  if (entity) {
    if (entity.type === "Mixer") return Math.min(99, 92 + hop * 2);
    if (entity.type === "Bridge") return Math.min(99, 78 + hop * 2);
    if (entity.type === "VASP") return Math.min(99, 48 + hop * 2);
    return Math.min(99, 55 + hop * 3);
  }

  switch (kind) {
    case "bridge":
      return Math.min(99, 75 + hop * 2);
    case "vasp":
      return Math.min(99, 48 + hop * 2);
    case "candidate_entity":
      return Math.min(99, 52 + hop * 2);
    case "target":
      return 38;
    default:
      return Math.min(99, 34 + hop * 3);
  }
}

/** Assign per-node baseline scores and return the id → score map. */
export function assignNodeRiskScores(
  nodes: GraphNode[],
  chain: string,
): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const node of nodes) {
    const score = baselineNodeRisk(node.address, chain, node.kind, node.hop);
    node.riskScore = score;
    scores[node.id] = score;
  }
  return scores;
}

export function scoreInvestigationRisk(input: {
  nodes: GraphNode[];
  signals: BehaviourSignal[];
  paths: TracePath[];
  chain: string;
}): InvestigationRiskAssessment {
  const { nodes, signals, paths, chain } = input;

  if (nodes.length === 0) {
    return {
      score: 0,
      band: "low",
      factors: [],
      nodeScores: {},
      provenance: FORENSIC_COPY.heuristicRisk,
    };
  }

  const nodeScores = assignNodeRiskScores(nodes, chain);
  const avgNode =
    nodes.reduce((acc, n) => acc + (n.riskScore ?? 34), 0) / nodes.length;
  const structuralComponent = avgNode * 0.7;

  const factors: RiskFactor[] = [
    {
      id: "structural",
      label: "Structural exposure",
      contribution: Math.round(structuralComponent),
      description: `Average baseline risk across ${nodes.length} traced addresses, weighted by entity labels and hop distance.`,
    },
  ];

  let signalUplift = 0;
  for (const signal of signals) {
    if (signal.id === "sig_baseline") continue;

    const weight = SEVERITY_WEIGHTS[signal.severity] ?? 5;
    const conf = SIGNAL_CONFIDENCE[signal.severity] ?? 0.75;
    const contrib = weight * conf;
    signalUplift += contrib;
    factors.push({
      id: signal.id,
      label: signal.pattern,
      contribution: Math.round(contrib),
      description: signal.description,
    });
  }

  const primary = paths[0];
  if (primary?.endpointKind === "bridge") {
    const extra = 6;
    signalUplift += extra;
    factors.push({
      id: "path_bridge",
      label: "Bridge boundary on primary path",
      contribution: extra,
      description:
        "Primary fund flow terminates at cross-chain infrastructure — continuity degrades.",
    });
  }

  const obfuscationCount = nodes.filter(
    (n) =>
      n.kind === "bridge" ||
      n.riskNote?.includes("Mixer") ||
      resolveEntity(n.address, chain)?.type === "Mixer",
  ).length;
  if (obfuscationCount >= 2) {
    const extra = 8;
    signalUplift += extra;
    factors.push({
      id: "multi_obfuscation",
      label: "Multiple obfuscation touchpoints",
      contribution: extra,
      description: `${obfuscationCount} privacy or bridge nodes in trace scope.`,
    });
  }

  const score = Math.max(
    0,
    Math.min(100, Math.round(structuralComponent + signalUplift)),
  );

  return {
    score,
    band: riskBandFromScore(score),
    factors,
    nodeScores,
    provenance: FORENSIC_COPY.heuristicRisk,
  };
}

/** Rehydrate a stored assessment from investigation summary JSON. */
export function riskFromSummary(
  summary: Record<string, unknown> | null | undefined,
): InvestigationRiskAssessment | null {
  if (!summary || typeof summary.riskScore !== "number") return null;

  const band =
    typeof summary.riskBand === "string"
      ? (summary.riskBand as RiskBand)
      : riskBandFromScore(summary.riskScore);

  return {
    score: summary.riskScore,
    band,
    factors: Array.isArray(summary.riskFactors)
      ? (summary.riskFactors as RiskFactor[])
      : [],
    nodeScores:
      typeof summary.riskNodeScores === "object" && summary.riskNodeScores
        ? (summary.riskNodeScores as Record<string, number>)
        : {},
    provenance: FORENSIC_COPY.heuristicRisk,
  };
}
