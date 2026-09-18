/**
 * Intelligence service layer — abstraction boundary.
 *
 * Every interface below is what the UI consumes. Graph and path analysis are
 * seeded deterministically from the investigation record (target address + ID)
 * so the canvas always has something to render. The analytical overlays —
 * risk signals, entity candidates and timeline — are driven from real
 * Supabase records (findings, evidence) passed in by the caller.
 *
 *   BlockchainProvider      -> raw chain reads + normalisation
 *   GraphService            -> bounded investigation graph construction
 *   PathAnalysisService     -> value-continuity path ranking
 *   EntityResolutionService -> wallet -> entity / VASP candidate ranking
 *   RiskAnalysisService     -> behavioural pattern characterisation
 */

import type { FindingRecord, EvidenceRecord, InvestigationRecord, Severity } from "@/lib/domain";
import { DEFAULT_TRACE_DEPTH, MAX_TRACE_DEPTH } from "@/lib/domain";
import { backendConfigured, backendRequest } from "@/lib/api/client";
import { buildLiveInvestigationGraph, type GraphBuildResult } from "./blockchain/graphEngine";
export { buildLiveInvestigationGraph, type GraphBuildResult };

/* ---------------- Contracts ---------------- */

export type NodeKind =
  | "target"
  | "wallet"
  | "intermediary"
  | "candidate_entity"
  | "vasp"
  | "bridge";

export interface GraphNode {
  id: string;
  address: string;
  label: string;
  kind: NodeKind;
  hop: number;
  x: number;
  y: number;
  valueIn: string;
  valueOut: string;
  connectedAddresses: number;
  relevantPaths: number;
  firstSeen: string;
  riskNote?: string | undefined;
  /** Heuristic 0–100 node exposure score (assigned by riskEngine). */
  riskScore?: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  txHash: string;
  value: string;
  asset: string;
  timestamp: string;
  continuity: number;
  pathIds: string[];
}

export interface InvestigationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bounds: { hops: number; maxNodes: number; observedHops?: number };
}

export interface TracePath {
  id: string;
  label: string;
  nodeIds: string[];
  continuity: number;
  valuePreserved: string;
  hops: number;
  endpointKind: NodeKind;
  verdict: string;
  confidence: number;
}

export interface EntityCandidate {
  id: string;
  name: string;
  type: string;
  networks: string[];
  proximityHops: number;
  attributionStrength: number;
  sourceFreshness: string;
  associatedAddresses: number;
  evidenceSources: number;
  rationale: string[];
}

export interface BehaviourSignal {
  id: string;
  pattern: string;
  description: string;
  severity: Severity;
  observedAt: string;
  nodeIds: string[];
}

export interface TimelineEvent {
  id: string;
  at: string;
  clock: string;
  title: string;
  detail: string;
  nodeId?: string;
  pathId?: string;
  kind: "transfer" | "split" | "merge" | "attribution" | "flag";
}

export interface BlockchainProvider {
  readonly id: string;
  supports(chain: string): boolean;
  fetchAddressActivity(
    chain: string,
    address: string,
  ): Promise<{ transactions: number; firstSeen: string; lastSeen: string }>;
}

export interface GraphService {
  build(investigation: InvestigationRecord): InvestigationGraph;
}

export interface PathAnalysisService {
  rank(graph: InvestigationGraph, investigation?: InvestigationRecord): TracePath[];
}

export interface EntityResolutionService {
  candidates(graph: InvestigationGraph, findings?: FindingRecord[]): EntityCandidate[];
}

export interface RiskAnalysisService {
  signals(graph: InvestigationGraph, findings?: FindingRecord[]): BehaviourSignal[];
}

/* ---------------- Utility helpers ---------------- */

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pseudoAddress(seed: string) {
  const h = hash(seed).toString(16).padStart(8, "0");
  const h2 = hash(seed + "x").toString(16).padStart(8, "0");
  const h3 = hash(seed + "y").toString(16).padStart(8, "0");
  const h4 = hash(seed + "z").toString(16).padStart(8, "0");
  const h5 = hash(seed + "w").toString(16).padStart(8, "0");
  return `0x${(h + h2 + h3 + h4 + h5).slice(0, 40)}`;
}

/** Format a raw USD amount or number safely into a human-readable string. */
function fmtValue(raw: string | number | undefined | null, fallback = "—"): string {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const s = String(raw).trim();
  if (/[a-zA-Z]/.test(s)) return s;
  const n = parseFloat(s.replace(/,/g, ""));
  if (isNaN(n)) return fallback;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

/** Safely unpack the summary JSONB payload regardless of format. */
function parseSummary(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/* ---------------- Blockchain providers ---------------- */

export const mockBlockchainProvider: BlockchainProvider = {
  id: "mock-evm-provider",
  supports: (chain) =>
    ["ethereum", "polygon", "bsc", "arbitrum"].includes(chain),
  async fetchAddressActivity(chain, address) {
    const h = hash(chain + address);
    return {
      transactions: 20 + (h % 180),
      firstSeen: `${4 + (h % 40)} days ago`,
      lastSeen: `${1 + (h % 6)} days ago`,
    };
  },
};

export const liveBlockchainProvider: BlockchainProvider = {
  id: "live-blockchain-provider",
  supports: (chain) =>
    ["ethereum", "polygon", "bsc", "arbitrum", "bitcoin", "tron"].includes(chain),
  async fetchAddressActivity(chain, address) {
    if (backendConfigured()) {
      try {
        const res = await backendRequest<{
          address: {
            incomingTxCount?: number;
            outgoingTxCount?: number;
            firstSeen?: string;
            lastSeen?: string;
          };
        }>(`/blockchain/addresses/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`);
        const total = (res.address.incomingTxCount ?? 0) + (res.address.outgoingTxCount ?? 0);
        return {
          transactions: total || 1,
          firstSeen: res.address.firstSeen ? new Date(res.address.firstSeen).toLocaleDateString() : "Recent",
          lastSeen: res.address.lastSeen ? new Date(res.address.lastSeen).toLocaleDateString() : "Active today",
        };
      } catch {
        // Fallback gracefully
      }
    }
    return mockBlockchainProvider.fetchAddressActivity(chain, address);
  },
};

/* ---------------- Graph service ---------------- */

const GRAPH_LAYOUT_WIDTH = 1180;
const GRAPH_LAYOUT_MIN_X = 80;
const GRAPH_CENTER_Y = 360;

function mockHopX(hop: number, maxDepth: number): number {
  if (maxDepth <= 0) return GRAPH_LAYOUT_MIN_X;
  return GRAPH_LAYOUT_MIN_X + (hop / maxDepth) * (GRAPH_LAYOUT_WIDTH - GRAPH_LAYOUT_MIN_X);
}

/**
 * Build a bounded investigation graph.
 *
 * Canvas layout is always deterministic and crash-proof.
 */
export const mockGraphService: GraphService = {
  build(investigation) {
    const targetAddress = investigation.target_address || "0x0000000000000000000000000000000000000000";
    const seed = String(investigation.id ?? "") + String(targetAddress);
    const summary = parseSummary(investigation.summary);
    const depth = Math.min(Math.max(investigation.trace_depth ?? DEFAULT_TRACE_DEPTH, 1), MAX_TRACE_DEPTH);

    // Extract real metadata from summary safely
    const totalAddresses = typeof summary["addresses"] === "number" ? summary["addresses"] : 0;
    const totalTx = typeof summary["transactions"] === "number" ? summary["transactions"] : 0;
    const valueTraced = fmtValue(summary["valueTraced"] as string | number | null | undefined, "—");
    const continuity = typeof summary["continuity"] === "number" ? summary["continuity"] : 0.75;
    const vaspCandidates = typeof summary["vaspCandidates"] === "number" ? summary["vaspCandidates"] : 1;
    const relevantPaths = typeof summary["relevantPaths"] === "number" ? summary["relevantPaths"] : 3;

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Root node — always the real target address
    nodes.push({
      id: "n0",
      address: targetAddress,
      label: "Target wallet",
      kind: "target",
      hop: 0,
      x: mockHopX(0, depth),
      y: GRAPH_CENTER_Y,
      valueIn: valueTraced !== "—" ? valueTraced : "—",
      valueOut: valueTraced !== "—" ? valueTraced : "—",
      connectedAddresses: totalTx > 0 ? Math.min(totalTx, 99) : 17,
      relevantPaths,
      firstSeen: "reported",
      riskNote: `Suspect address from victim report.`,
    });

    // Branch layout
    const branchSizes = [2, 3, 2, 2];
    let previousLayer = ["n0"];

    for (let hop = 1; hop <= depth; hop++) {
      const count = branchSizes[hop - 1] ?? 2;
      const layer: string[] = [];
      const spacing = 560 / (count + 1);

      for (let i = 0; i < count; i++) {
        const id = `n${hop}_${i}`;
        const h = hash(seed + id);
        const isLast = hop === depth;

        // Last hop: place VASP candidates based on real vaspCandidates count
        const kind: NodeKind = isLast
          ? i === 0 && vaspCandidates >= 1
            ? "vasp"
            : i === 1 && vaspCandidates >= 2
              ? "candidate_entity"
              : "wallet"
          : h % 7 === 0
            ? "bridge"
            : "intermediary";

        // Derive hop value from summary proportionally
        const hopAddresses = totalAddresses > 0
          ? Math.max(1, Math.floor(totalAddresses / depth))
          : 5 + (h % 12);

        layer.push(id);
        nodes.push({
          id,
          address: pseudoAddress(seed + id),
          label:
            kind === "vasp"
              ? "Exchange deposit cluster"
              : kind === "candidate_entity"
                ? "Potential entity"
                : kind === "bridge"
                  ? "Bridge contract"
                  : `Intermediary wallet ${String.fromCharCode(65 + i)}`,
          kind,
          hop,
          x: mockHopX(hop, depth),
          y: 80 + spacing * (i + 1),
          valueIn: valueTraced !== "—" ? valueTraced : `${(180 - hop * 34 - i * 18).toFixed(1)}k`,
          valueOut: valueTraced !== "—" ? valueTraced : `${(174 - hop * 34 - i * 20).toFixed(1)}k`,
          connectedAddresses: hopAddresses,
          relevantPaths: 1 + (h % Math.max(1, relevantPaths)),
          firstSeen: `hop ${hop}`,
          riskNote:
            kind === "bridge"
              ? "Cross-chain bridge — continuation requires destination-chain ingestion."
              : kind === "vasp"
                ? "Address appears in a public exchange deposit attribution set."
                : undefined,
        } as GraphNode);
      }

      previousLayer.forEach((parent, pi) => {
        layer.forEach((child, ci) => {
          if ((pi + ci) % 2 === 1 && layer.length > 1) return;
          const h = hash(seed + parent + child);
          const edgeContinuity = Math.max(
            0.28,
            continuity - hop * 0.08 - ci * 0.1,
          );
          const edgeAsset = String(valueTraced).includes("BTC")
            ? "BTC"
            : String(valueTraced).includes("ETH")
              ? "ETH"
              : "USDT";

          edges.push({
            id: `${parent}->${child}`,
            from: parent,
            to: child,
            txHash: `0x${hash(seed + parent + child).toString(16).padStart(8, "0")}${hash(child + parent).toString(16).padStart(8, "0")}`,
            value: valueTraced !== "—" ? valueTraced : `${(180 - hop * 34 - ci * 18).toFixed(1)}k`,
            asset: edgeAsset,
            timestamp: `Day ${hop} · ${String(11 + hop).padStart(2, "0")}:${String(10 + (h % 48)).padStart(2, "0")}`,
            continuity: edgeContinuity,
            pathIds: ci === 0 ? ["PATH-A"] : ci === 1 ? ["PATH-B"] : ["PATH-C"],
          });
        });
      });

      previousLayer = layer;
    }

    return { nodes, edges, bounds: { hops: depth, maxNodes: 250 } };
  },
};

/* ---------------- Path analysis service ---------------- */

export const mockPathAnalysisService: PathAnalysisService = {
  rank(graph, investigation) {
    const summary = parseSummary(investigation?.summary);
    const realContinuity = typeof summary["continuity"] === "number" ? summary["continuity"] : undefined;
    const valueTraced = fmtValue(summary["valueTraced"] as string | number | null | undefined, "—");

    const endpoints = graph.nodes.filter(
      (n) => n.hop === graph.bounds.hops,
    );
    return endpoints.slice(0, 3).map((endpoint, index) => {
      const chain = ["n0"];
      for (let hop = 1; hop <= graph.bounds.hops; hop++) {
        const candidate =
          graph.nodes.find(
            (n) => n.hop === hop && n.id.endsWith(`_${Math.min(index, 1)}`),
          ) ?? graph.nodes.find((n) => n.hop === hop);
        if (candidate) chain.push(candidate.id);
      }
      chain[chain.length - 1] = endpoint.id;

      // Use real continuity for primary path, synthetic fallback for branches
      const baseContinuity = realContinuity ?? 0.87;
      const continuity =
        index === 0
          ? baseContinuity
          : index === 1
            ? baseContinuity * 0.48
            : baseContinuity * 0.36;

      const displayValue =
        index === 0 && valueTraced !== "—"
          ? valueTraced
          : `${(continuity * 318.9).toFixed(1)}k USDT`;

      return {
        id: ["PATH-A", "PATH-B", "PATH-C"][index] ?? `PATH-${index}`,
        label:
          ["Primary hypothesis", "Secondary branch", "Alternative branch"][
            index
          ] ?? "Branch",
        nodeIds: chain,
        continuity,
        valuePreserved: displayValue,
        hops: graph.bounds.hops,
        endpointKind: endpoint.kind,
        verdict:
          continuity > 0.7
            ? "Strong value continuity terminating at an attributed endpoint."
            : continuity > 0.4
              ? "Partial continuity. Fragmentation reduces confidence."
              : "Low continuity — consistent with decoy or dust activity.",
        confidence: Number(
          Math.min(0.98, continuity * 0.85 + (endpoint.kind === "vasp" ? 0.12 : 0)).toFixed(2),
        ),
      };
    });
  },
};

/* ---------------- Entity resolution service ---------------- */

export const mockEntityResolutionService: EntityResolutionService = {
  candidates(graph, findings) {
    // --- Real findings-backed candidates ---
    if (Array.isArray(findings) && findings.length > 0) {
      const vaspFindings = findings.filter(
        (f) => f && (f.finding_type === "vasp_endpoint" || f.finding_type === "attribution"),
      );
      const behaviourFindings = findings.filter(
        (f) => f && (f.finding_type === "behaviour" || f.finding_type === "split"),
      );

      const result: EntityCandidate[] = [];

      vaspFindings.slice(0, 2).forEach((f, i) => {
        const related = typeof f.related === "object" && f.related !== null ? (f.related as Record<string, unknown>) : {};
        const addrs = Array.isArray(related["addresses"]) ? (related["addresses"] as string[]) : [];
        const conf = typeof f.confidence === "number" ? f.confidence : 80;
        result.push({
          id: `ent-db-${f.id ?? i}`,
          name: (typeof related["entity"] === "string" ? related["entity"] : null) ?? f.title ?? "Attributed Entity",
          type: "Virtual Asset Service Provider",
          networks: ["Ethereum"],
          proximityHops: graph.bounds.hops,
          attributionStrength: Math.min(0.99, conf / 100),
          sourceFreshness: f.created_at ? `recorded ${new Date(f.created_at).toLocaleDateString()}` : "recent",
          associatedAddresses: addrs.length || 2 + i,
          evidenceSources: 1,
          rationale: [
            f.description ?? f.title ?? "Endpoint identified in attribution records",
            `Confidence: ${conf}% — ${f.severity ?? "high"} severity`,
          ].filter(Boolean) as string[],
        });
      });

      if (behaviourFindings.length > 0) {
        const bf = behaviourFindings[0]!;
        const bConf = typeof bf.confidence === "number" ? bf.confidence : 60;
        result.push({
          id: `ent-db-behaviour-${bf.id ?? "0"}`,
          name: "Unattributed high-activity service",
          type: "Candidate entity",
          networks: ["Ethereum"],
          proximityHops: Math.max(1, graph.bounds.hops - 1),
          attributionStrength: Math.min(0.6, bConf / 100),
          sourceFreshness: bf.created_at ? `inferred ${new Date(bf.created_at).toLocaleDateString()}` : "recent",
          associatedAddresses: 5,
          evidenceSources: 1,
          rationale: [
            bf.description ?? bf.title ?? "Suspicious high-activity wallet",
            "Behaviour-only inference — no direct attribution record.",
          ].filter(Boolean) as string[],
        });
      }

      if (result.length > 0) return result;
    }

    // --- Topology fallback (no findings yet) ---
    const list: EntityCandidate[] = [];
    const vasp = graph.nodes.find((n) => n.kind === "vasp");
    const other = graph.nodes.find((n) => n.kind === "candidate_entity");
    const bridge = graph.nodes.find((n) => n.kind === "bridge");

    if (vasp) {
      list.push({
        id: "ent-1",
        name: "Exchange deposit cluster",
        type: "Virtual Asset Service Provider",
        networks: ["Ethereum", "Polygon"],
        proximityHops: vasp.hop,
        attributionStrength: 0.72,
        sourceFreshness: "topology inference — no direct record",
        associatedAddresses: 12,
        evidenceSources: 1,
        rationale: [
          "Endpoint address classified as VASP by graph topology",
          "No finding recorded yet — record a finding to confirm",
        ],
      });
    }
    if (other) {
      list.push({
        id: "ent-2",
        name: "Unattributed high-activity service",
        type: "Candidate entity",
        networks: ["Ethereum"],
        proximityHops: other.hop,
        attributionStrength: 0.35,
        sourceFreshness: "no attribution record",
        associatedAddresses: 8,
        evidenceSources: 1,
        rationale: [
          "Behaviour consistent with a pooled service wallet",
          "No attribution record; inference is behavioural only",
        ],
      });
    }
    if (bridge) {
      list.push({
        id: "ent-3",
        name: "Cross-chain bridge contract",
        type: "Infrastructure",
        networks: ["Ethereum", "Arbitrum One"],
        proximityHops: bridge.hop,
        attributionStrength: 0.72,
        sourceFreshness: "contract-level attribution",
        associatedAddresses: 1,
        evidenceSources: 2,
        rationale: [
          "Known bridge contract interface",
          "Continuation beyond this hop requires destination-chain ingestion",
        ],
      });
    }
    return list;
  },
};

/* ---------------- Risk analysis service ---------------- */

export const mockRiskAnalysisService: RiskAnalysisService = {
  signals(graph, findings) {
    // --- Real findings-backed signals ---
    if (Array.isArray(findings) && findings.length > 0) {
      return findings.map((f, i) => {
        const related = typeof f.related === "object" && f.related !== null ? (f.related as Record<string, unknown>) : {};
        const addresses = Array.isArray(related["addresses"]) ? (related["addresses"] as string[]) : [];
        const nodeIds = addresses
          .map((addr) => graph.nodes.find((n) => n.address === addr)?.id)
          .filter(Boolean) as string[];
        const fallbackNodeIds = graph.nodes
          .filter((n) => n.hop === 1)
          .map((n) => n.id);

        return {
          id: `sig-db-${f.id ?? i}`,
          pattern: (typeof related["pattern"] === "string" ? related["pattern"] : null)
            ?? f.finding_type
            ?? "Signal",
          description: f.description ?? f.title ?? "Observed behavioural pattern",
          severity: f.severity ?? "medium",
          observedAt: f.created_at ? new Date(f.created_at).toLocaleDateString() : "Observed",
          nodeIds: nodeIds.length > 0 ? nodeIds : fallbackNodeIds,
        } satisfies BehaviourSignal;
      });
    }

    // --- Topology fallback ---
    const signals: BehaviourSignal[] = [];
    const hop1 = graph.nodes.filter((n) => n.hop === 1).map((n) => n.id);
    const hop2 = graph.nodes.filter((n) => n.hop === 2).map((n) => n.id);

    signals.push({
      id: "sig-1",
      pattern: "Rapid multi-hop movement",
      description:
        "Traced value moved across multiple hops within minutes of the reported deposit.",
      severity: "high",
      observedAt: "Day 1",
      nodeIds: ["n0", ...hop1],
    });
    if (hop2.length > 1) {
      signals.push({
        id: "sig-2",
        pattern: "Fan-out fragmentation",
        description:
          "One branch split into multiple low-value outputs — consistent with layering.",
        severity: "medium",
        observedAt: "Day 1",
        nodeIds: hop2,
      });
    }
    signals.push({
      id: "sig-3",
      pattern: "Short holding period",
      description:
        "Intermediary wallets held funds for a short period before onward transfer.",
      severity: "medium",
      observedAt: "Day 1 – Day 2",
      nodeIds: hop1,
    });
    if (graph.nodes.some((n) => n.kind === "bridge")) {
      signals.push({
        id: "sig-4",
        pattern: "Bridge interaction",
        description:
          "A dominant branch reaches a cross-chain bridge; on-chain continuity ends at this boundary.",
        severity: "critical",
        observedAt: "Day 2",
        nodeIds: graph.nodes.filter((n) => n.kind === "bridge").map((n) => n.id),
      });
    }
    return signals;
  },
};

/* ---------------- Timeline builder ---------------- */

export function buildTimeline(
  graph: InvestigationGraph,
  evidence?: EvidenceRecord[],
): TimelineEvent[] {
  // --- Real evidence-backed timeline ---
  if (Array.isArray(evidence) && evidence.length > 0) {
    const sorted = [...evidence].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime(),
    );
    return sorted.map((e, i) => {
      const d = e.created_at ? new Date(e.created_at) : new Date();
      return {
        id: `tl-ev-${e.id ?? i}`,
        at: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        clock: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        title: e.title ?? "Evidence logged",
        detail: e.description ?? e.evidence_type ?? "Vault item",
        kind:
          e.evidence_type === "transaction"
            ? "transfer"
            : e.evidence_type === "graph_snapshot"
              ? "attribution"
              : "flag",
      } satisfies TimelineEvent;
    });
  }

  // --- Graph-edge fallback ---
  const events: TimelineEvent[] = [
    {
      id: "tl-0",
      at: "Day 1",
      clock: "12:31",
      title: "Investigation opened",
      detail: `Target wallet: ${graph.nodes[0]?.address ?? "—"}`,
      nodeId: "n0",
      kind: "transfer",
    },
  ];

  graph.edges.slice(0, 8).forEach((edge, i) => {
    const target = graph.nodes.find((n) => n.id === edge.to);
    const tsParts = typeof edge.timestamp === "string" ? edge.timestamp.split(" · ") : ["Day 1", "--:--"];
    events.push({
      id: `tl-${i + 1}`,
      at: tsParts[0] ?? "Day 1",
      clock: tsParts[1] ?? "--:--",
      title:
        target?.kind === "vasp"
          ? "Traced value reaches attributed endpoint"
          : target?.kind === "bridge"
            ? "Branch interacts with bridge contract"
            : `Value moved to ${target?.label ?? "wallet"}`,
      detail: `${edge.value} · continuity ${(edge.continuity * 100).toFixed(0)}%`,
      nodeId: edge.to,
      pathId: edge.pathIds[0] ?? "PATH-A",
      kind:
        target?.kind === "vasp"
          ? "attribution"
          : edge.continuity < 0.5
            ? "split"
            : "transfer",
    });
  });

  return events;
}

/** Single place the UI resolves services from — swap bindings here. */
export const intelligence = {
  provider: liveBlockchainProvider,
  graph: mockGraphService,
  paths: mockPathAnalysisService,
  entities: mockEntityResolutionService,
  risk: mockRiskAnalysisService,
  timeline: buildTimeline,
  buildLiveGraph: buildLiveInvestigationGraph,
};
