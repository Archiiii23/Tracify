/**
 * Fraud typology classification and ML-assisted risk scoring.
 *
 * The classifier is a linear model (logistic regression) over structural graph
 * features. Weights are explicit constants rather than an opaque binary, which
 * means every prediction is fully explainable — a hard requirement for evidence
 * that may be presented in court. Swapping in trained weights later is a data
 * change, not a code change: only `TYPOLOGY_WEIGHTS` moves.
 */
import type { GraphEdge, GraphNode } from "../models/Investigation.model";
import type { FraudType, RiskCategory } from "../models/Complaint.model";
import type { BehaviouralSignal } from "./intelligence.service";
import { OBFUSCATION_CATEGORIES } from "./blockchain/types";

/** Normalised (0–1) structural features extracted from a trace graph. */
export interface GraphFeatures {
  /** Distinct addresses touched, scaled against a 200-address reference graph. */
  size: number;
  /** Deepest hop reached, scaled against an 8-hop reference. */
  depth: number;
  /** Share of nodes that are custodial/regulated services. */
  vaspShare: number;
  /** Share of nodes attributed to mixers or privacy tooling. */
  mixerShare: number;
  /** Mean out-degree — high values indicate splitting/peeling. */
  fanOut: number;
  /** Share of edges that occur inside a 30-minute burst window. */
  burstiness: number;
  /** Share of value retained on the strongest path (0 = fully dissipated). */
  valueRetention: number;
  /** Share of nodes attributed to bridges (proxy for cross-chain movement). */
  bridgeShare: number;
  /** Longest run of single-in/single-out hops — classic layering chain. */
  chainLinearity: number;
  /** Mean attribution risk across nodes. */
  attributionRisk: number;
}

export interface TypologyPrediction {
  typology: FraudType | "layering" | "unknown";
  label: string;
  confidence: number;
  /** Feature contributions, largest first — the explanation of the verdict. */
  drivers: { feature: keyof GraphFeatures; contribution: number; note: string }[];
}

export interface RiskAssessment {
  score: number;
  category: RiskCategory;
  /** Human-readable reasons, ordered by weight. */
  reasons: string[];
}

const BURST_WINDOW_MS = 30 * 60_000;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Extract explainable features from a bounded trace graph. */
export function extractFeatures(nodes: GraphNode[], edges: GraphEdge[]): GraphFeatures {
  if (nodes.length === 0) {
    return {
      size: 0,
      depth: 0,
      vaspShare: 0,
      mixerShare: 0,
      fanOut: 0,
      burstiness: 0,
      valueRetention: 0,
      bridgeShare: 0,
      chainLinearity: 0,
      attributionRisk: 0,
    };
  }

  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const edge of edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const isMixer = (n: GraphNode) =>
    OBFUSCATION_CATEGORIES.has((n.category ?? "").toLowerCase()) ||
    (n.category ?? "").toLowerCase() === "mixer";
  const isBridge = (n: GraphNode) => {
    const key = (n.category ?? "").toLowerCase();
    return key === "bridge" || key === "cross-chain" || key === "cross_chain";
  };

  const times = edges.map((e) => new Date(e.timestamp).getTime()).sort((a, b) => a - b);
  let maxBurst = 0;
  for (let i = 0; i < times.length; i += 1) {
    const start = times[i] as number;
    let count = 0;
    for (let j = i; j < times.length && (times[j] as number) < start + BURST_WINDOW_MS; j += 1) {
      count += 1;
    }
    maxBurst = Math.max(maxBurst, count);
  }

  // Longest linear run: each step forwards to exactly one counterparty.
  let linear = 0;
  let run = 0;
  const sortedByHop = [...nodes].sort((a, b) => a.hop - b.hop);
  for (const node of sortedByHop) {
    const out = outDegree.get(node.address) ?? 0;
    const inn = inDegree.get(node.address) ?? 0;
    if (out === 1 && inn <= 1) {
      run += 1;
      linear = Math.max(linear, run);
    } else {
      run = 0;
    }
  }

  const seedValue = sortedByHop[0]?.valueUsd ?? 0;
  const deepest = nodes.reduce((max, n) => Math.max(max, n.hop), 0);
  const leafValue = nodes
    .filter((n) => (outDegree.get(n.address) ?? 0) === 0)
    .reduce((max, n) => Math.max(max, n.valueUsd), 0);

  const fanOutValues = [...outDegree.values()];
  const meanFanOut =
    fanOutValues.length > 0 ? fanOutValues.reduce((a, b) => a + b, 0) / fanOutValues.length : 0;

  return {
    size: clamp01(nodes.length / 200),
    depth: clamp01(deepest / 8),
    vaspShare: clamp01(nodes.filter((n) => n.isVasp).length / nodes.length),
    mixerShare: clamp01(nodes.filter(isMixer).length / nodes.length),
    fanOut: clamp01(meanFanOut / 6),
    burstiness: clamp01(edges.length > 0 ? maxBurst / Math.max(4, edges.length) : 0),
    valueRetention: clamp01(seedValue > 0 ? leafValue / seedValue : 0),
    bridgeShare: clamp01(nodes.filter(isBridge).length / nodes.length),
    chainLinearity: clamp01(linear / 6),
    attributionRisk: clamp01(
      nodes.reduce((acc, n) => acc + n.riskScore, 0) / (nodes.length * 100),
    ),
  };
}

interface TypologyModel {
  key: TypologyPrediction["typology"];
  label: string;
  bias: number;
  weights: Partial<Record<keyof GraphFeatures, number>>;
  notes: Partial<Record<keyof GraphFeatures, string>>;
}

/**
 * One linear model per typology. Coefficients encode the on-chain fingerprint
 * each fraud class leaves behind; the highest-scoring model wins.
 */
const TYPOLOGY_WEIGHTS: TypologyModel[] = [
  {
    key: "investment-scam",
    label: "Investment / Ponzi scheme collection",
    bias: -1.1,
    weights: { size: 2.6, fanOut: 1.4, vaspShare: 1.6, depth: 0.8, valueRetention: 0.9 },
    notes: {
      size: "Large address footprint consistent with many victim deposits",
      vaspShare: "Consolidated value reaches regulated services for cash-out",
      fanOut: "Collection wallets redistribute value to multiple wallets",
    },
  },
  {
    key: "task-based-fraud",
    label: "Task-based / part-time job fraud",
    bias: -1.0,
    weights: { size: 1.8, burstiness: 2.4, fanOut: 1.6, depth: 0.5 },
    notes: {
      burstiness: "High-frequency small deposits clustered in short windows",
      fanOut: "Mule-network style redistribution across many wallets",
    },
  },
  {
    key: "ransomware",
    label: "Ransomware proceeds",
    bias: -1.2,
    weights: { chainLinearity: 2.2, mixerShare: 2.6, valueRetention: 1.4, size: -0.6 },
    notes: {
      mixerShare: "Proceeds routed through mixing services before cash-out",
      chainLinearity: "Single high-value chain moved hop-to-hop without splitting",
    },
  },
  {
    key: "sextortion",
    label: "Sextortion / extortion payment",
    bias: -1.4,
    weights: { size: -1.2, chainLinearity: 1.6, vaspShare: 1.8, depth: -0.4 },
    notes: {
      vaspShare: "Payment moved almost immediately to an exchange deposit address",
      chainLinearity: "Short, direct forwarding chain typical of one-off extortion",
    },
  },
  {
    key: "darknet",
    label: "Darknet market settlement",
    bias: -1.5,
    weights: { mixerShare: 2.2, depth: 1.6, attributionRisk: 2.0, bridgeShare: 0.8 },
    notes: {
      attributionRisk: "Counterparties carry high-risk attribution tags",
      depth: "Deep multi-hop layering before any regulated touchpoint",
    },
  },
  {
    key: "phishing",
    label: "Phishing / wallet drainer",
    bias: -1.1,
    weights: { fanOut: 1.2, burstiness: 1.8, size: 1.4, bridgeShare: 1.6 },
    notes: {
      bridgeShare: "Drained value bridged across chains to break the trail",
      burstiness: "Automated sweeps executed in rapid succession",
    },
  },
  {
    key: "layering",
    label: "Generic layering / laundering chain",
    bias: -0.7,
    weights: { depth: 1.8, chainLinearity: 1.8, bridgeShare: 1.2, mixerShare: 1.2 },
    notes: {
      depth: "Value passes through many intermediary hops",
      chainLinearity: "Sequential forwarding designed to dilute traceability",
    },
  },
];

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Classify the dominant fraud typology for a trace graph. `reportedType` from
 * the complaint acts as a weak prior: it nudges, but never overrides, on-chain
 * evidence.
 */
export function classifyTypology(
  features: GraphFeatures,
  reportedType?: FraudType,
): TypologyPrediction {
  const scored = TYPOLOGY_WEIGHTS.map((model) => {
    let z = model.bias;
    const drivers: TypologyPrediction["drivers"] = [];

    for (const [feature, weight] of Object.entries(model.weights) as [
      keyof GraphFeatures,
      number,
    ][]) {
      const contribution = features[feature] * weight;
      z += contribution;
      if (contribution > 0.15) {
        drivers.push({
          feature,
          contribution: Math.round(contribution * 100) / 100,
          note: model.notes[feature] ?? `${feature} elevated`,
        });
      }
    }

    // Weak prior from the victim's own classification.
    if (reportedType && reportedType === model.key) z += 0.45;

    return {
      typology: model.key,
      label: model.label,
      confidence: Math.round(sigmoid(z) * 100) / 100,
      drivers: drivers.sort((a, b) => b.contribution - a.contribution).slice(0, 4),
    };
  }).sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best || best.confidence < 0.35) {
    return {
      typology: "unknown",
      label: "Insufficient on-chain evidence to classify",
      confidence: best?.confidence ?? 0,
      drivers: best?.drivers ?? [],
    };
  }
  return best;
}

export function riskCategoryFor(score: number): RiskCategory {
  if (score >= 85) return "severe";
  if (score >= 70) return "high";
  if (score >= 50) return "elevated";
  if (score >= 30) return "moderate";
  return "low";
}

/**
 * ML-assisted risk score: a weighted blend of attribution risk, obfuscation
 * exposure and behavioural signal severity, with each contribution reported.
 */
export function assessRisk(
  features: GraphFeatures,
  signals: BehaviouralSignal[],
): RiskAssessment {
  const contributions: { weight: number; reason: string }[] = [];

  const push = (weight: number, reason: string) => {
    if (weight >= 1) contributions.push({ weight, reason });
  };

  push(features.attributionRisk * 45, "Counterparty attribution risk");
  push(features.mixerShare * 30, "Exposure to mixing / privacy services");
  push(features.bridgeShare * 14, "Cross-chain bridge usage");
  push(features.depth * 12, "Depth of layering");
  push(features.fanOut * 10, "Value splitting across many counterparties");
  push(features.burstiness * 8, "Automated burst transfer behaviour");

  const severityWeight: Record<BehaviouralSignal["severity"], number> = {
    info: 0,
    low: 2,
    medium: 5,
    high: 9,
    critical: 14,
  };
  for (const signal of signals) {
    push(severityWeight[signal.severity] * signal.confidence, signal.label);
  }

  const raw = contributions.reduce((acc, c) => acc + c.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    category: riskCategoryFor(score),
    reasons: contributions
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((c) => c.reason),
  };
}

export { TYPOLOGY_WEIGHTS };
