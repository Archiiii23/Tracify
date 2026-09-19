/**
 * Real-time VASP attribution.
 *
 * Given a victim-reported wallet address, this service answers the single
 * question that unblocks an investigation: *which exchange or VASP receives
 * these funds, and how far away is it?* It runs the bounded trace against the
 * live chain-data provider, then walks the resulting graph to find regulated
 * touchpoints, intermediary laundering wallets, bridge (cross-chain) hops and
 * obfuscation services — and turns all of that into ranked, explainable
 * intelligence with concrete investigative recommendations.
 */
import type { Chain, GraphEdge, GraphNode } from "../models/Investigation.model";
import type { FraudType, RiskCategory } from "../models/Complaint.model";
import { logger } from "../utils/logger";
import { getChainProvider, syntheticProvider, traceWithProvider } from "./blockchain";
import { OBFUSCATION_CATEGORIES, isServiceCategory } from "./blockchain/types";
import {
  detectSignals,
  rankPaths,
  runTrace,
  type BehaviouralSignal,
  type TracePath,
  type TraceRequest,
} from "./intelligence.service";
import {
  assessRisk,
  classifyTypology,
  extractFeatures,
  type GraphFeatures,
  type TypologyPrediction,
} from "./typology.service";

export interface VaspAttribution {
  /** The deposit address controlled by the service. */
  address: string;
  chain: Chain;
  entity: string;
  category?: string;
  /** Hops between the reported address and this deposit address. */
  hops: number;
  /** True when the victim's funds land at the service without any intermediary. */
  directDeposit: boolean;
  valueUsd: number;
  /** 0–1. Combines attribution strength, proximity and value continuity. */
  confidence: number;
  /** Full address trail, for the information request annexure. */
  path: string[];
  txHashes: string[];
  firstSeen?: Date;
  lastSeen?: Date;
}

export interface IntermediaryWallet {
  address: string;
  hop: number;
  valueUsd: number;
  role: "layering" | "splitter" | "consolidator" | "pass-through";
  reason: string;
}

export interface CrossChainMovement {
  detected: boolean;
  bridgeHops: {
    address: string;
    hop: number;
    entity?: string;
    valueUsd: number;
  }[];
  note: string;
}

export interface ObfuscationExposure {
  detected: boolean;
  services: { address: string; hop: number; entity?: string; valueUsd: number }[];
  note: string;
}

export interface AttributionResult {
  address: string;
  chain: Chain;
  dataSource: "graphsense" | "synthetic";
  /** True when the graph came from a live chain index rather than the fallback. */
  live: boolean;
  generatedAt: Date;
  riskScore: number;
  riskCategory: RiskCategory;
  riskReasons: string[];
  typology: TypologyPrediction;
  features: GraphFeatures;
  nearestVasp: VaspAttribution | null;
  vaspCandidates: VaspAttribution[];
  intermediaries: IntermediaryWallet[];
  crossChain: CrossChainMovement;
  obfuscation: ObfuscationExposure;
  signals: BehaviouralSignal[];
  topPaths: TracePath[];
  metrics: {
    addressesTouched: number;
    hopsTraced: number;
    valueTracedUsd: number;
    vaspTouchpoints: number;
    retainedValuePct: number;
  };
  /** True when there is a concrete, freezable regulated touchpoint. */
  freezeActionable: boolean;
  recommendations: string[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

export interface AttributionOptions {
  maxHops?: number;
  minValueUsd?: number;
  direction?: "outbound" | "inbound" | "both";
  seedValueUsd?: number;
  reportedType?: FraudType;
}

function isBridge(node: GraphNode): boolean {
  const key = (node.category ?? "").toLowerCase();
  return key === "bridge" || key === "cross-chain" || key === "cross_chain";
}

function isObfuscation(node: GraphNode): boolean {
  return OBFUSCATION_CATEGORIES.has((node.category ?? "").toLowerCase());
}

/** Shortest value-bearing trail from the root to each address in the graph. */
function shortestTrails(
  rootAddress: string,
  edges: GraphEdge[],
): Map<string, { path: string[]; txHashes: string[]; valueUsd: number }> {
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  const trails = new Map<string, { path: string[]; txHashes: string[]; valueUsd: number }>();
  trails.set(rootAddress, { path: [rootAddress], txHashes: [], valueUsd: 0 });

  const queue: string[] = [rootAddress];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const trail = trails.get(current);
    if (!trail) continue;

    for (const edge of outgoing.get(current) ?? []) {
      if (trails.has(edge.to)) continue;
      trails.set(edge.to, {
        path: [...trail.path, edge.to],
        txHashes: [...trail.txHashes, edge.txHash],
        valueUsd: edge.valueUsd,
      });
      queue.push(edge.to);
    }
  }

  return trails;
}

/**
 * Confidence in a VASP attribution. Proximity dominates: a direct deposit is
 * near-certain, while a service eight hops away may be unrelated to the fraud.
 */
function attributionConfidence(node: GraphNode, hops: number, retained: number): number {
  const proximity = 1 / (1 + Math.max(0, hops - 1) * 0.35);
  const labelled = node.entity || node.label ? 1 : 0.6;
  const categorical = isServiceCategory(node.category) ? 1 : 0.85;
  const continuity = 0.6 + Math.min(0.4, retained * 0.4);
  return Math.round(proximity * labelled * categorical * continuity * 100) / 100;
}

function classifyIntermediary(
  node: GraphNode,
  outDegree: number,
  inDegree: number,
): IntermediaryWallet["role"] {
  if (outDegree >= 3) return "splitter";
  if (inDegree >= 3) return "consolidator";
  if (outDegree === 1 && inDegree === 1) return "pass-through";
  return "layering";
}

function buildRecommendations(result: {
  nearestVasp: VaspAttribution | null;
  obfuscation: ObfuscationExposure;
  crossChain: CrossChainMovement;
  riskCategory: RiskCategory;
  typology: TypologyPrediction;
  chain: Chain;
  live: boolean;
}): string[] {
  const actions: string[] = [];

  if (result.nearestVasp) {
    const v = result.nearestVasp;
    actions.push(
      v.directDeposit
        ? `Issue an immediate freeze and KYC request to ${v.entity} for deposit address ${v.address} — funds arrive directly from the reported wallet.`
        : `Issue a freeze and KYC request to ${v.entity} for deposit address ${v.address}, reached ${v.hops} hops from the reported wallet.`,
    );
    actions.push(
      `Attach the ${v.path.length}-address trail and ${v.txHashes.length} transaction reference(s) to the SAHYOG request for evidentiary continuity.`,
    );
  } else {
    actions.push(
      "No regulated touchpoint was reached within the hop bound — widen the hop limit and re-run, or monitor the wallet for the first outbound deposit.",
    );
  }

  if (result.obfuscation.detected) {
    actions.push(
      "Preserve pre-mixer transaction records now: value entering a mixing service becomes materially harder to attribute afterwards.",
    );
  }
  if (result.crossChain.detected) {
    actions.push(
      "Raise a parallel trace on the destination chain of the identified bridge hop(s) to continue the value trail cross-chain.",
    );
  }
  if (result.riskCategory === "high" || result.riskCategory === "severe") {
    actions.push(
      "Escalate to the nodal cyber cell — risk categorisation warrants priority handling and immediate asset-preservation action.",
    );
  }
  if (!result.live) {
    actions.push(
      "This trace used the offline deterministic ledger; re-run once live chain indexing is reachable before relying on it as evidence.",
    );
  }

  actions.push(
    `Record the working hypothesis as "${result.typology.label}" (confidence ${Math.round(result.typology.confidence * 100)}%) and log it against the complaint.`,
  );

  return actions;
}

/**
 * Attribute a single reported wallet address in real time.
 *
 * A live-provider failure degrades to the deterministic ledger rather than
 * failing the complaint, and `dataSource`/`live` state exactly which was used so
 * synthetic output is never mistaken for chain evidence.
 */
export async function attributeAddress(
  chain: Chain,
  address: string,
  options: AttributionOptions = {},
): Promise<AttributionResult> {
  const provider = getChainProvider(chain);
  const request: TraceRequest = {
    rootAddress: address,
    chain,
    maxHops: options.maxHops ?? 5,
    minValueUsd: options.minValueUsd ?? 0,
    direction: options.direction ?? "outbound",
    ...(options.seedValueUsd !== undefined ? { seedValueUsd: options.seedValueUsd } : {}),
  };

  let nodes: GraphNode[];
  let edges: GraphEdge[];
  let source: "graphsense" | "synthetic" = syntheticProvider.id;

  if (provider.id === "graphsense") {
    try {
      const traced = await traceWithProvider(provider, request);
      nodes = traced.nodes;
      edges = traced.edges;
      source = "graphsense";
    } catch (error) {
      logger.warn("live attribution failed — falling back to deterministic ledger", {
        chain,
        reason: error instanceof Error ? error.message : String(error),
      });
      const traced = runTrace(request);
      nodes = traced.nodes;
      edges = traced.edges;
    }
  } else {
    const traced = runTrace(request);
    nodes = traced.nodes;
    edges = traced.edges;
  }

  const normalisedEdges = edges.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  const signals = detectSignals(nodes, normalisedEdges);
  const topPaths = rankPaths(nodes, normalisedEdges, address, 5);
  const features = extractFeatures(nodes, normalisedEdges);
  const risk = assessRisk(features, signals);
  const typology = classifyTypology(features, options.reportedType);

  const trails = shortestTrails(address, normalisedEdges);
  const seedValue = nodes.find((n) => n.hop === 0)?.valueUsd ?? 0;

  const edgeTimes = new Map<string, Date[]>();
  for (const edge of normalisedEdges) {
    const list = edgeTimes.get(edge.to) ?? [];
    list.push(edge.timestamp);
    edgeTimes.set(edge.to, list);
  }

  const vaspCandidates: VaspAttribution[] = nodes
    .filter((node) => node.isVasp || isServiceCategory(node.category))
    .map((node) => {
      const trail = trails.get(node.address);
      const hops = trail ? trail.path.length - 1 : node.hop;
      const retained = seedValue > 0 ? node.valueUsd / seedValue : 0;
      const times = (edgeTimes.get(node.address) ?? []).sort(
        (a, b) => a.getTime() - b.getTime(),
      );
      const first = times[0];
      const last = times[times.length - 1];

      return {
        address: node.address,
        chain: node.chain,
        entity: node.entity ?? node.label ?? "Unattributed regulated service",
        ...(node.category ? { category: node.category } : {}),
        hops,
        directDeposit: hops === 1,
        valueUsd: node.valueUsd,
        confidence: attributionConfidence(node, hops, retained),
        path: trail?.path ?? [address, node.address],
        txHashes: trail?.txHashes ?? [],
        ...(first ? { firstSeen: first } : {}),
        ...(last ? { lastSeen: last } : {}),
      } satisfies VaspAttribution;
    })
    // Nearest first; break ties on value, then attribution confidence.
    .sort(
      (a, b) =>
        a.hops - b.hops || b.valueUsd - a.valueUsd || b.confidence - a.confidence,
    );

  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const edge of normalisedEdges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const intermediaries: IntermediaryWallet[] = nodes
    .filter(
      (node) =>
        node.hop > 0 &&
        !node.isVasp &&
        !isServiceCategory(node.category) &&
        (outDegree.get(node.address) ?? 0) > 0,
    )
    .map((node) => {
      const out = outDegree.get(node.address) ?? 0;
      const inn = inDegree.get(node.address) ?? 0;
      const role = classifyIntermediary(node, out, inn);
      const reason =
        role === "splitter"
          ? `Splits incoming value across ${out} counterparties — layering hub.`
          : role === "consolidator"
            ? `Consolidates value from ${inn} sources before forwarding — collection wallet.`
            : role === "pass-through"
              ? "Receives and immediately forwards the full value — burner/pass-through wallet."
              : "Sits on the value path between the reported wallet and a regulated service.";
      return { address: node.address, hop: node.hop, valueUsd: node.valueUsd, role, reason };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 25);

  const bridges = nodes.filter(isBridge);
  const crossChain: CrossChainMovement = {
    detected: bridges.length > 0,
    bridgeHops: bridges.map((node) => ({
      address: node.address,
      hop: node.hop,
      ...(node.entity ?? node.label ? { entity: node.entity ?? node.label } : {}),
      valueUsd: node.valueUsd,
    })),
    note:
      bridges.length > 0
        ? `${bridges.length} bridge interaction(s) detected — value leaves ${chain} and must be picked up on the destination chain.`
        : "No cross-chain bridge interaction detected inside the hop bound.",
  };

  const mixers = nodes.filter(isObfuscation);
  const obfuscation: ObfuscationExposure = {
    detected: mixers.length > 0,
    services: mixers.map((node) => ({
      address: node.address,
      hop: node.hop,
      ...(node.entity ?? node.label ? { entity: node.entity ?? node.label } : {}),
      valueUsd: node.valueUsd,
    })),
    note:
      mixers.length > 0
        ? `${mixers.length} mixing/privacy service interaction(s) detected — provenance is being deliberately obscured.`
        : "No mixer or privacy-service interaction detected inside the hop bound.",
  };

  const nearestVasp = vaspCandidates[0] ?? null;
  const live = source === "graphsense";

  return {
    address,
    chain,
    dataSource: source,
    live,
    generatedAt: new Date(),
    riskScore: risk.score,
    riskCategory: risk.category,
    riskReasons: risk.reasons,
    typology,
    features,
    nearestVasp,
    vaspCandidates: vaspCandidates.slice(0, 10),
    intermediaries,
    crossChain,
    obfuscation,
    signals,
    topPaths,
    metrics: {
      addressesTouched: nodes.length,
      hopsTraced: nodes.reduce((max, n) => Math.max(max, n.hop), 0),
      valueTracedUsd: Math.round(normalisedEdges.reduce((acc, e) => acc + e.valueUsd, 0)),
      vaspTouchpoints: vaspCandidates.length,
      retainedValuePct:
        seedValue > 0 ? Math.round(((topPaths[0]?.valueUsd ?? 0) / seedValue) * 100) : 0,
    },
    freezeActionable: Boolean(nearestVasp && nearestVasp.confidence >= 0.5),
    recommendations: buildRecommendations({
      nearestVasp,
      obfuscation,
      crossChain,
      riskCategory: risk.category,
      typology,
      chain,
      live,
    }),
    graph: { nodes, edges: normalisedEdges },
  };
}

/** Compact form persisted on a complaint — excludes the full graph. */
export function summariseAttribution(result: AttributionResult) {
  const { graph: _graph, ...rest } = result;
  return rest;
}
