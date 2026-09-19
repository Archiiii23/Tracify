/**
 * Intelligence engine.
 *
 * This is the deterministic, dependency-free core of the platform: given a root
 * address and trace parameters it produces a bounded hop graph, ranks paths,
 * derives behavioural signals and scores risk. It is pure (no database, no
 * network), which makes it fully unit-testable and lets a real chain-ingestion
 * adapter or a trained ML model replace `expandGraph`/`scoreRisk` later without
 * touching the HTTP layer.
 */
import { createHash } from "node:crypto";
import type { Chain, GraphEdge, GraphNode } from "../models/Investigation.model";

export interface TraceRequest {
  rootAddress: string;
  chain: Chain;
  maxHops: number;
  minValueUsd: number;
  direction: "outbound" | "inbound" | "both";
  seedValueUsd?: number;
}

export interface TracePath {
  addresses: string[];
  hops: number;
  valueUsd: number;
  riskScore: number;
  score: number;
  terminatesAtVasp: boolean;
  rationale: string;
}

export interface BehaviouralSignal {
  code: string;
  label: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number;
  addresses: string[];
  explanation: string;
}

export interface TraceResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: TracePath[];
  signals: BehaviouralSignal[];
  riskScore: number;
  metrics: {
    addressesTouched: number;
    hopsTraced: number;
    valueTracedUsd: number;
    vaspTouchpoints: number;
    retainedValuePct: number;
  };
}

/** Deterministic PRNG seeded from the trace inputs — same input, same graph. */
function seededRandom(seed: string): () => number {
  let h = parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 12), 16);
  return () => {
    h = (h * 1103515245 + 12345) % 2147483648;
    return h / 2147483648;
  };
}

const VASP_LABELS = [
  "Aurora Exchange",
  "NordPay",
  "MetaSwap Pro",
  "Helio Custody",
  "Kite Digital",
];
const CATEGORIES = ["personal-wallet", "bridge", "mixer", "defi", "otc-desk", "vasp-deposit"];

function synthAddress(chain: Chain, rand: () => number): string {
  const hex = Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join(
    "",
  );
  if (chain === "bitcoin") return `bc1q${hex.slice(0, 32)}`;
  if (chain === "tron") return `T${hex.slice(0, 33).toUpperCase()}`;
  return `0x${hex}`;
}

/**
 * Bounded breadth-first expansion. Every node keeps its hop distance and the
 * value that reached it, so value continuity is preserved end to end.
 */
export function expandGraph(request: TraceRequest): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rand = seededRandom(
    `${request.rootAddress}|${request.chain}|${request.maxHops}|${request.direction}`,
  );
  const seedValue = request.seedValueUsd ?? 42_500;
  const start = new Date("2026-02-11T04:18:00Z").getTime();

  const root: GraphNode = {
    address: request.rootAddress,
    chain: request.chain,
    label: "Trace root",
    category: "personal-wallet",
    riskScore: 62,
    hop: 0,
    valueUsd: seedValue,
    isVasp: false,
  };

  const nodes: GraphNode[] = [root];
  const edges: GraphEdge[] = [];
  const byAddress = new Map<string, GraphNode>([[root.address, root]]);
  let frontier: GraphNode[] = [root];

  for (let hop = 1; hop <= request.maxHops; hop += 1) {
    const next: GraphNode[] = [];

    for (const parent of frontier) {
      // Terminal services do not forward value inside the trace.
      if (parent.isVasp) continue;

      const fanout = 1 + Math.floor(rand() * 3);
      // Splits lose a little value to fees; the remainder is divided.
      const perBranch = (parent.valueUsd * (0.9 + rand() * 0.08)) / fanout;
      if (perBranch < request.minValueUsd) continue;

      for (let branch = 0; branch < fanout; branch += 1) {
        const isVasp = hop >= Math.max(2, request.maxHops - 1) && rand() > 0.45;
        const address = synthAddress(request.chain, rand);
        const category = isVasp
          ? "vasp-deposit"
          : (CATEGORIES[Math.floor(rand() * (CATEGORIES.length - 1))] as string);

        const node: GraphNode = {
          address,
          chain: request.chain,
          hop,
          valueUsd: Math.round(perBranch),
          isVasp,
          category,
          riskScore: Math.round(
            Math.min(
              99,
              30 +
                hop * 6 +
                (category === "mixer" ? 34 : 0) +
                (isVasp ? 12 : 0) +
                rand() * 14,
            ),
          ),
          ...(isVasp
            ? {
                label: VASP_LABELS[Math.floor(rand() * VASP_LABELS.length)] as string,
                entity: VASP_LABELS[Math.floor(rand() * VASP_LABELS.length)] as string,
              }
            : {}),
        };

        nodes.push(node);
        byAddress.set(address, node);
        next.push(node);

        edges.push({
          from: parent.address,
          to: address,
          txHash: `0x${createHash("sha256")
            .update(`${parent.address}${address}${hop}${branch}`)
            .digest("hex")}`,
          asset: request.chain === "bitcoin" ? "BTC" : "USDT",
          amount: Math.round(perBranch * 100) / 100,
          valueUsd: Math.round(perBranch),
          timestamp: new Date(start + hop * 36 * 60_000 + branch * 7 * 60_000),
          hop,
        });
      }
    }

    if (next.length === 0) break;
    frontier = next;
  }

  return { nodes, edges };
}

/** Rank every root→leaf path by value retained, risk and hop economy. */
export function rankPaths(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootAddress: string,
  limit = 10,
): TracePath[] {
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }
  const nodeByAddress = new Map(nodes.map((n) => [n.address, n]));
  const paths: TracePath[] = [];
  const seedValue = nodeByAddress.get(rootAddress)?.valueUsd ?? 0;

  const walk = (address: string, trail: string[], valueUsd: number) => {
    const children = outgoing.get(address) ?? [];
    if (children.length === 0) {
      const leaf = nodeByAddress.get(address);
      const hops = trail.length - 1;
      const risk = Math.round(
        trail.reduce((acc, a) => acc + (nodeByAddress.get(a)?.riskScore ?? 0), 0) /
          Math.max(1, trail.length),
      );
      const retained = seedValue > 0 ? valueUsd / seedValue : 0;
      const score =
        retained * 0.5 + (risk / 100) * 0.3 + (leaf?.isVasp ? 0.15 : 0) + 0.05 / Math.max(1, hops);

      paths.push({
        addresses: [...trail],
        hops,
        valueUsd: Math.round(valueUsd),
        riskScore: risk,
        score: Math.round(score * 100) / 100,
        terminatesAtVasp: Boolean(leaf?.isVasp),
        rationale: leaf?.isVasp
          ? `Retains ${(retained * 100).toFixed(0)}% of traced value and terminates at ${leaf.label ?? "a regulated service"} — actionable for an information request.`
          : `Retains ${(retained * 100).toFixed(0)}% of traced value across ${hops} hops with average risk ${risk}/100.`,
      });
      return;
    }
    for (const edge of children) {
      walk(edge.to, [...trail, edge.to], edge.valueUsd);
    }
  };

  walk(rootAddress, [rootAddress], seedValue);

  return paths.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Behavioural detectors. Each signal carries the evidence that raised it. */
export function detectSignals(nodes: GraphNode[], edges: GraphEdge[]): BehaviouralSignal[] {
  const signals: BehaviouralSignal[] = [];

  const mixers = nodes.filter((n) => n.category === "mixer");
  if (mixers.length > 0) {
    signals.push({
      code: "MIXER_TOUCHPOINT",
      label: "Mixer interaction detected",
      severity: "critical",
      confidence: 0.92,
      addresses: mixers.map((n) => n.address),
      explanation: `${mixers.length} address(es) in the trace match mixer behaviour, indicating deliberate obfuscation of value provenance.`,
    });
  }

  // Peeling: one parent repeatedly forwarding most of its value onwards.
  const outDegree = new Map<string, number>();
  for (const edge of edges) outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
  const peelers = [...outDegree.entries()].filter(([, degree]) => degree >= 3).map(([a]) => a);
  if (peelers.length > 0) {
    signals.push({
      code: "PEELING_CHAIN",
      label: "Peeling / splitting pattern",
      severity: "high",
      confidence: 0.78,
      addresses: peelers,
      explanation: `Value is repeatedly split across ${peelers.length} hub address(es), a hallmark of layering intended to dilute traceability.`,
    });
  }

  // Structuring: many transfers clustered inside a short window.
  const window = 30 * 60_000;
  const times = edges.map((e) => e.timestamp.getTime()).sort((a, b) => a - b);
  let burst = 0;
  for (let i = 0; i < times.length; i += 1) {
    const count = times.filter((t) => t >= (times[i] as number) && t < (times[i] as number) + window)
      .length;
    burst = Math.max(burst, count);
  }
  if (burst >= 4) {
    signals.push({
      code: "STRUCTURING_BURST",
      label: "Rapid outflow burst",
      severity: "medium",
      confidence: 0.66,
      addresses: [],
      explanation: `${burst} transfers occur within a 30-minute window, consistent with automated structuring rather than organic activity.`,
    });
  }

  const vasps = nodes.filter((n) => n.isVasp);
  if (vasps.length > 0) {
    signals.push({
      code: "VASP_DEPOSIT",
      label: "Regulated service exposure",
      severity: "high",
      confidence: 0.88,
      addresses: vasps.map((n) => n.address),
      explanation: `Traced value reaches ${vasps.length} regulated service deposit address(es) — the point at which the investigation becomes actionable.`,
    });
  }

  return signals;
}

/** Blend graph structure and signals into a single 0–100 risk score. */
export function scoreRisk(nodes: GraphNode[], signals: BehaviouralSignal[]): number {
  if (nodes.length === 0) return 0;
  const avg = nodes.reduce((acc, n) => acc + n.riskScore, 0) / nodes.length;
  const weights: Record<BehaviouralSignal["severity"], number> = {
    info: 0,
    low: 2,
    medium: 5,
    high: 9,
    critical: 15,
  };
  const uplift = signals.reduce((acc, s) => acc + weights[s.severity] * s.confidence, 0);
  return Math.max(0, Math.min(100, Math.round(avg * 0.7 + uplift)));
}

/** Run the full pipeline: expand → rank → detect → score. */
export function runTrace(request: TraceRequest): TraceResult {
  const { nodes, edges } = expandGraph(request);
  const paths = rankPaths(nodes, edges, request.rootAddress);
  const signals = detectSignals(nodes, edges);
  const riskScore = scoreRisk(nodes, signals);
  const seedValue = nodes[0]?.valueUsd ?? 0;
  const leafValue = paths[0]?.valueUsd ?? 0;

  return {
    nodes,
    edges,
    paths,
    signals,
    riskScore,
    metrics: {
      addressesTouched: nodes.length,
      hopsTraced: nodes.reduce((max, n) => Math.max(max, n.hop), 0),
      valueTracedUsd: Math.round(edges.reduce((acc, e) => acc + e.valueUsd, 0)),
      vaspTouchpoints: nodes.filter((n) => n.isVasp).length,
      retainedValuePct: seedValue > 0 ? Math.round((leafValue / seedValue) * 100) : 0,
    },
  };
}
