/**
 * Real on-chain Graph Construction & Value Continuity Engine.
 *
 * Implements SIH26183 Phases 8–16:
 *   - Bounded multi-hop BFS graph construction from live chain data
 *   - Value continuity scoring across transaction hops
 *   - Split/merge/fan-out/fan-in structural analysis
 *   - Noise & decoy deprioritization
 *   - Path scoring, prioritization & money-flow prediction
 *   - Entity/VASP intelligence correlation
 *   - Behavioural pattern & finding generation
 */

import type {
  GraphNode,
  GraphEdge,
  InvestigationGraph,
  TracePath,
  EntityCandidate,
  BehaviourSignal,
  TimelineEvent,
  NodeKind,
} from "../intelligence";
import { resolveEntity } from "./attributionDb";
import { fetchLiveTransactions, type InternalTransaction } from "./liveAdapter";
import type { InvestigationRecord } from "@/lib/domain";
import { DEFAULT_TRACE_DEPTH, MAX_TRACE_DEPTH } from "@/lib/domain";
import {
  scoreInvestigationRisk,
  type InvestigationRiskAssessment,
} from "../riskEngine";

const GRAPH_LAYOUT_WIDTH = 1180;
const GRAPH_LAYOUT_MIN_X = 80;
const GRAPH_CENTER_Y = 360;
const MAX_BRANCHES = 4;
const FETCH_CONCURRENCY = 5;

/** Outgoing branches per hop — allow slightly wider fan-out on deep traces. */
function maxBranchesForDepth(depth: number): number {
  return depth >= 15 ? 6 : depth >= 8 ? 5 : MAX_BRANCHES;
}

/** Tx page size scales with configured depth so deep traces see more history per wallet. */
function txFetchLimit(hop: number, depth: number): number {
  const base = hop === 0 ? 50 : 35;
  return Math.min(60, base + Math.floor(depth / 3));
}

function clampTraceDepth(depth: number): number {
  return Math.min(Math.max(depth || DEFAULT_TRACE_DEPTH, 1), MAX_TRACE_DEPTH);
}

/** Evenly space nodes across the canvas for any hop depth up to MAX_TRACE_DEPTH. */
function hopXPosition(hop: number, layoutDepth: number): number {
  if (layoutDepth <= 0) return GRAPH_LAYOUT_MIN_X;
  return GRAPH_LAYOUT_MIN_X + (hop / layoutDepth) * (GRAPH_LAYOUT_WIDTH - GRAPH_LAYOUT_MIN_X);
}

const LAYOUT_Y_TOP = 96;
const LAYOUT_Y_BOTTOM = 624;

/** Re-layout node coordinates from observed hop depth (not configured max). */
function layoutInvestigationNodes(nodes: GraphNode[]): number {
  if (nodes.length === 0) return 0;
  const observedMaxHop = nodes.reduce((max, n) => Math.max(max, n.hop), 0);
  const layoutDepth = Math.max(observedMaxHop, 1);

  const byHop = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const list = byHop.get(n.hop) ?? [];
    list.push(n);
    byHop.set(n.hop, list);
  }

  for (const [hop, hopNodes] of byHop.entries()) {
    const count = hopNodes.length;
    const span = LAYOUT_Y_BOTTOM - LAYOUT_Y_TOP;
    hopNodes.forEach((n, i) => {
      n.x = hopXPosition(hop, layoutDepth);
      n.y =
        count <= 1
          ? (LAYOUT_Y_TOP + LAYOUT_Y_BOTTOM) / 2
          : LAYOUT_Y_TOP + (span / (count + 1)) * (i + 1);
    });
  }

  return observedMaxHop;
}

function pipelineBudgetMs(depth: number): number {
  return Math.min(120_000 + depth * 6_000, 300_000);
}

/** Scale node budget with requested trace depth so BFS is not capped early. */
function nodeBudget(depth: number): number {
  return Math.min(36 + depth * 8, 220);
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

export interface GraphBuildResult {
  graph: InvestigationGraph;
  paths: TracePath[];
  entities: EntityCandidate[];
  signals: BehaviourSignal[];
  timeline: TimelineEvent[];
  rawTransactions: InternalTransaction[];
  risk: InvestigationRiskAssessment;
  generatedFindings: Array<{
    title: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    confidence: number;
    type: string;
    relatedAddresses: string[];
    relatedTxHashes: string[];
  }>;
}

type HopProgressCallback = (currentHop: number, totalHops: number) => void;

export interface GraphBuildSnapshot {
  graph: InvestigationGraph;
  latestNodeId: string | null;
  nodeCount: number;
  edgeCount: number;
}

export type GraphBuildProgressCallback = (snapshot: GraphBuildSnapshot) => void | Promise<void>;

export interface GraphBuildOptions {
  onHopProgress?: HopProgressCallback;
  onGraphProgress?: GraphBuildProgressCallback;
  /** Delay between progressive UI updates (ms). Default 280 when onGraphProgress is set. */
  buildStaggerMs?: number;
}

const DEFAULT_BUILD_STAGGER_MS = 280;

async function emitGraphProgress(
  callback: GraphBuildProgressCallback | undefined,
  nodes: GraphNode[],
  edges: GraphEdge[],
  depth: number,
  latestNodeId: string | null,
  staggerMs: number,
) {
  if (!callback) return;
  const observedHops = layoutInvestigationNodes(nodes);
  await callback({
    graph: {
      nodes: [...nodes],
      edges: [...edges],
      bounds: { hops: depth, maxNodes: nodeBudget(depth), observedHops },
    },
    latestNodeId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });
  if (staggerMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, staggerMs));
  }
}

interface BfsState {
  address: string;
  hop: number;
  parentNodeId: string;
  incomingValueUsd: number;
  incomingTx?: InternalTransaction;
}

function parseUsd(tx: InternalTransaction): number {
  if (typeof tx.valueUsd === "number" && tx.valueUsd > 0) return tx.valueUsd;
  const num = parseFloat(tx.value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function computeContinuity(incomingUsd: number, outgoingUsd: number, timeDeltaMin: number): number {
  if (incomingUsd <= 0) return 0.5;
  const ratio = Math.min(1, outgoingUsd / incomingUsd);
  const timeBonus = timeDeltaMin < 60 ? 0.08 : timeDeltaMin < 360 ? 0.04 : 0;
  return Math.min(0.99, Math.max(0.1, ratio * 0.85 + 0.1 + timeBonus));
}

function nodeKindForAddress(address: string, chain: string): NodeKind {
  const entity = resolveEntity(address, chain);
  if (!entity) return "intermediary";
  if (entity.type === "VASP") return "vasp";
  if (entity.type === "Bridge") return "bridge";
  return "candidate_entity";
}

function nodeLabel(address: string, chain: string, fallback: string): string {
  const entity = resolveEntity(address, chain);
  return entity ? entity.name : fallback;
}

function inTimeWindow(tx: InternalTransaction, start?: string | null, end?: string | null): boolean {
  if (!start && !end) return true;
  const ts = tx.unixTime;
  if (start && ts < new Date(start).getTime()) return false;
  if (end && ts > new Date(end).getTime()) return false;
  return true;
}

/** Builds a dynamic, real on-chain investigation graph via multi-hop BFS expansion. */
export async function buildLiveInvestigationGraph(
  investigation: InvestigationRecord,
  options?: GraphBuildOptions | HopProgressCallback,
): Promise<GraphBuildResult> {
  const opts: GraphBuildOptions =
    typeof options === "function" ? { onHopProgress: options } : (options ?? {});
  const onHopProgress = opts.onHopProgress;
  const onGraphProgress = opts.onGraphProgress;
  const staggerMs = onGraphProgress ? (opts.buildStaggerMs ?? DEFAULT_BUILD_STAGGER_MS) : 0;
  const targetAddress = (investigation.target_address || "").toLowerCase().trim();
  const chain = investigation.blockchain || "ethereum";
  const depth = clampTraceDepth(investigation.trace_depth);
  const maxNodes = nodeBudget(depth);
  const budgetMs = pipelineBudgetMs(depth);
  const minValue = investigation.min_value ?? 0;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const rawTransactions: InternalTransaction[] = [];
  const addressToNodeId = new Map<string, string>();
  const expandedAddresses = new Set<string>();
  let nodeCounter = 0;

  const makeNodeId = () => `n_${nodeCounter++}`;
  const startedAt = Date.now();
  const txCache = new Map<string, InternalTransaction[]>();

  async function getTransactions(address: string, hop: number): Promise<InternalTransaction[]> {
    const key = address.toLowerCase();
    const cached = txCache.get(key);
    if (cached) return cached;

    const limit = txFetchLimit(hop, depth);
    const fetched = await fetchLiveTransactions(chain, key, limit, {
      includeTokens: true,
      timeoutMs: hop === 0 ? 12000 : 9000,
    });
    txCache.set(key, fetched);
    rawTransactions.push(...fetched);
    return fetched.filter(
      (t) => inTimeWindow(t, investigation.window_start, investigation.window_end) && parseUsd(t) >= minValue,
    );
  }

  const budgetExceeded = () => Date.now() - startedAt > budgetMs;

  // --- Hop 0: Root target ---
  onHopProgress?.(0, depth);
  const filteredRootTxs = await getTransactions(targetAddress, 0);

  const targetOutSum = filteredRootTxs
    .filter((t) => t.from === targetAddress)
    .reduce((acc, t) => acc + parseUsd(t), 0);
  const targetInSum = filteredRootTxs
    .filter((t) => t.to === targetAddress)
    .reduce((acc, t) => acc + parseUsd(t), 0);

  const targetEntity = resolveEntity(targetAddress, chain);
  const rootId = makeNodeId();

  nodes.push({
    id: rootId,
    address: targetAddress,
    label: targetEntity ? targetEntity.name : "Target wallet",
    kind: targetEntity ? (targetEntity.type === "VASP" ? "vasp" : "candidate_entity") : "target",
    hop: 0,
    x: hopXPosition(0, depth),
    y: GRAPH_CENTER_Y,
    valueIn: targetInSum > 0 ? `$${targetInSum.toLocaleString()}` : "—",
    valueOut: targetOutSum > 0 ? `$${targetOutSum.toLocaleString()}` : "—",
    connectedAddresses: new Set(filteredRootTxs.flatMap((t) => [t.from, t.to])).size - 1,
    relevantPaths: 1,
    firstSeen: filteredRootTxs.length > 0 ? filteredRootTxs[filteredRootTxs.length - 1]!.timestamp : "—",
    riskNote: targetEntity ? `${targetEntity.type}: ${targetEntity.description}` : "Investigation root address.",
  });

  addressToNodeId.set(targetAddress, rootId);

  await emitGraphProgress(onGraphProgress, nodes, edges, depth, rootId, staggerMs);

  // --- Level-order BFS with parallel fetches per hop ---
  let frontier: BfsState[] = [
    { address: targetAddress, hop: 0, parentNodeId: rootId, incomingValueUsd: targetOutSum || targetInSum || 1000 },
  ];

  while (frontier.length > 0 && nodes.length < maxNodes && !budgetExceeded()) {
    const nextFrontier: BfsState[] = [];
    const nextFrontierAddrs = new Set<string>();
    const currentHop = frontier[0]!.hop;
    if (currentHop >= depth) break;

    onHopProgress?.(currentHop + 1, depth);

    // Pre-fetch all addresses at this level in parallel
    const needsFetch = frontier.filter((f) => f.hop > 0 && !expandedAddresses.has(f.address));
    if (needsFetch.length > 0) {
      await mapConcurrent(needsFetch, FETCH_CONCURRENCY, async (f) => {
        await getTransactions(f.address, f.hop);
      });
    }

    const branchLimit = maxBranchesForDepth(depth);

    for (const current of frontier) {
      if (budgetExceeded()) break;
      if (expandedAddresses.has(current.address)) continue;
      expandedAddresses.add(current.address);

      const txs =
        current.hop === 0
          ? filteredRootTxs
          : (txCache.get(current.address.toLowerCase()) ?? []).filter(
              (t) =>
                inTimeWindow(t, investigation.window_start, investigation.window_end) &&
                parseUsd(t) >= minValue,
            );

      const outgoing = txs
        .filter((t) => t.from === current.address && t.to && t.to !== current.address)
        .sort((a, b) => parseUsd(b) - parseUsd(a))
        .slice(0, branchLimit);


      for (let i = 0; i < outgoing.length; i++) {
        const tx = outgoing[i]!;
        const addr = tx.to.toLowerCase();
        const valueUsd = parseUsd(tx);
        const timeDeltaMin =
          Math.abs(tx.unixTime - (current.incomingTx?.unixTime ?? tx.unixTime)) / 60000;
        const continuity = computeContinuity(current.incomingValueUsd, valueUsd, timeDeltaMin);

        if (continuity < 0.05 && valueUsd < minValue) continue;

        let childNodeId = addressToNodeId.get(addr);
        let addedNode = false;
        if (!childNodeId) {
          childNodeId = makeNodeId();
          addedNode = true;
          const kind = nodeKindForAddress(addr, chain);
          const entity = resolveEntity(addr, chain);

          nodes.push({
            id: childNodeId,
            address: addr,
            label: nodeLabel(
              addr,
              chain,
              `Wallet ${String.fromCharCode(65 + (current.hop * branchLimit + i) % 26)}`,
            ),
            kind,
            hop: current.hop + 1,
            x: 0,
            y: 0,
            valueIn: tx.value,
            valueOut: "—",
            connectedAddresses: 1,
            relevantPaths: continuity > 0.5 ? 1 : 0,
            firstSeen: tx.timestamp,
            riskNote: entity ? `${entity.type}: ${entity.description}` : undefined,
          });

          addressToNodeId.set(addr, childNodeId);
        }

        const edgeId = `${current.parentNodeId}->${childNodeId}:${tx.hash.slice(0, 8)}`;
        let addedEdge = false;
        if (!edges.some((e) => e.id === edgeId)) {
          addedEdge = true;
          edges.push({
            id: edgeId,
            from: current.parentNodeId,
            to: childNodeId,
            txHash: tx.hash,
            value: tx.value,
            asset: tx.asset,
            timestamp: tx.timestamp,
            continuity,
            pathIds: [],
          });
        }

        if (addedNode || addedEdge) {
          await emitGraphProgress(
            onGraphProgress,
            nodes,
            edges,
            depth,
            addedNode ? childNodeId : null,
            staggerMs,
          );
        }

        if (
          current.hop < depth &&
          nodes.length < maxNodes &&
          !nextFrontierAddrs.has(addr) &&
          !expandedAddresses.has(addr)
        ) {
          nextFrontierAddrs.add(addr);
          nextFrontier.push({
            address: addr,
            hop: current.hop + 1,
            parentNodeId: childNodeId,
            incomingValueUsd: valueUsd,
            incomingTx: tx,
          });
        }
      }
    }

    frontier = nextFrontier;
  }

  const observedHops = layoutInvestigationNodes(nodes);

  // --- Path discovery: all root-to-leaf paths ranked by value continuity ---
  const paths = rankMoneyPaths(nodes, edges, rootId, observedHops);

  // Assign pathIds to edges
  for (const path of paths) {
    for (let i = 0; i < path.nodeIds.length - 1; i++) {
      const from = path.nodeIds[i]!;
      const to = path.nodeIds[i + 1]!;
      for (const edge of edges) {
        if (edge.from === from && edge.to === to && !edge.pathIds.includes(path.id)) {
          edge.pathIds.push(path.id);
        }
      }
    }
  }

  // Update relevantPaths on nodes
  for (const node of nodes) {
    node.relevantPaths = paths.filter((p) => p.nodeIds.includes(node.id)).length;
  }

  const entities = buildEntityCandidates(nodes, chain, paths);
  const signals = detectBehaviouralSignals(nodes, edges, paths, filteredRootTxs, rootId);
  const timeline = buildTimelineFromTxs(filteredRootTxs, nodes, edges);
  const generatedFindings = buildFindings(investigation, nodes, edges, paths, entities, signals, filteredRootTxs);
  const risk = scoreInvestigationRisk({
    nodes,
    signals,
    paths,
    chain,
  });

  return {
    graph: { nodes, edges, bounds: { hops: depth, maxNodes, observedHops } },
    paths,
    entities,
    signals,
    timeline,
    rawTransactions,
    risk,
    generatedFindings,
  };
}

/** Discover and rank all meaningful fund-flow paths from root to leaf nodes. */
function rankMoneyPaths(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootId: string,
  maxDepth: number,
): TracePath[] {
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }

  const paths: TracePath[] = [];
  let pathCounter = 0;

  function dfs(nodeId: string, visited: string[], continuityProduct: number, minEdgeContinuity: number) {
    const currentNode = nodes.find((n) => n.id === nodeId);
    const outEdges = (adjacency.get(nodeId) ?? []).sort((a, b) => b.continuity - a.continuity);

    if (outEdges.length === 0 || (currentNode && currentNode.hop >= maxDepth)) {
      const lastNode = currentNode ?? nodes.find((n) => n.id === nodeId);
      if (!lastNode || visited.length < 2) return;

      const avgContinuity = continuityProduct / Math.max(1, visited.length - 1);
      pathCounter++;
      paths.push({
        id: `path_${String(pathCounter).padStart(2, "0")}`,
        label: lastNode.kind === "vasp"
          ? `VASP Endpoint — ${lastNode.label}`
          : lastNode.kind === "bridge"
            ? `Bridge Exit — ${lastNode.label}`
            : `Fund Flow Path ${pathCounter}`,
        nodeIds: [...visited],
        continuity: Number(avgContinuity.toFixed(2)),
        valuePreserved: `${Math.round(minEdgeContinuity * 100)}%`,
        hops: visited.length - 1,
        endpointKind: lastNode.kind,
        verdict: verdictForEndpoint(lastNode),
        confidence: Number(Math.min(0.98, avgContinuity * 0.85 + (lastNode.kind === "vasp" ? 0.12 : 0)).toFixed(2)),
      });
      return;
    }

    for (const edge of outEdges.slice(0, 3)) {
      if (visited.includes(edge.to)) continue;
      dfs(edge.to, [...visited, edge.to], continuityProduct + edge.continuity, Math.min(minEdgeContinuity, edge.continuity));
    }
  }

  dfs(rootId, [rootId], 0, 1);

  return paths.sort((a, b) => b.continuity * b.confidence - a.continuity * a.confidence).slice(0, 8);
}

function verdictForEndpoint(node: GraphNode): string {
  switch (node.kind) {
    case "vasp":
      return "Funds traced to regulated VASP deposit endpoint — preservation request actionable";
    case "bridge":
      return "Cross-chain bridge boundary — on-chain continuity ends here";
    case "candidate_entity":
      return "Attributed entity endpoint — requires corroborating intelligence";
    default:
      return node.hop >= 3 ? "Active layering chain — extend trace recommended" : "Intermediate wallet — funds may continue";
  }
}

function buildEntityCandidates(nodes: GraphNode[], chain: string, paths: TracePath[]): EntityCandidate[] {
  const entities: EntityCandidate[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (node.kind !== "vasp" && node.kind !== "candidate_entity" && node.kind !== "bridge") continue;
    const key = node.address;
    if (seen.has(key)) continue;
    seen.add(key);

    const known = resolveEntity(node.address, chain);
    const onPaths = paths.filter((p) => p.nodeIds.includes(node.id));

    entities.push({
      id: `ent_${node.id}`,
      name: known ? known.name : node.label,
      type: known ? known.type : "Candidate VASP",
      networks: [chain.toUpperCase()],
      proximityHops: node.hop,
      attributionStrength: known ? known.confidence : 0.72,
      sourceFreshness: known ? known.source : "On-chain heuristic",
      associatedAddresses: 1,
      evidenceSources: known ? 3 : 1,
      rationale: [
        `Reachable within ${node.hop} hop(s) from investigation target`,
        onPaths.length > 0 ? `Present on ${onPaths.length} prioritized fund-flow path(s)` : "Peripheral to primary flow",
        known ? known.description : "Transaction volume profile consistent with service hub",
      ],
    });
  }

  entities.sort((a, b) => {
    const scoreA = a.attributionStrength * (1 / (a.proximityHops + 1));
    const scoreB = b.attributionStrength * (1 / (b.proximityHops + 1));
    return scoreB - scoreA;
  });

  return entities;
}

function detectBehaviouralSignals(
  nodes: GraphNode[],
  edges: GraphEdge[],
  paths: TracePath[],
  txs: InternalTransaction[],
  rootId: string,
): BehaviourSignal[] {
  const signals: BehaviourSignal[] = [];
  const rootNode = nodes.find((n) => n.id === rootId);
  const hop1Nodes = nodes.filter((n) => n.hop === 1);

  // Fan-out
  const rootOutEdges = edges.filter((e) => e.from === rootId);
  if (rootOutEdges.length >= 3) {
    signals.push({
      id: "sig_fanout",
      pattern: "Fan-Out Fragmentation",
      description: `Target split funds across ${rootOutEdges.length} separate addresses — consistent with structuring/layering.`,
      severity: "high",
      observedAt: txs[0]?.timestamp ?? "Recent",
      nodeIds: [rootId, ...hop1Nodes.map((n) => n.id)],
    });
  }

  // Fan-in
  const hop2Nodes = nodes.filter((n) => n.hop === 2);
  if (hop2Nodes.length >= 2 && hop1Nodes.length === 1) {
    signals.push({
      id: "sig_fanin",
      pattern: "Fan-In Consolidation",
      description: "Multiple upstream addresses converged into a single intermediary — consolidation pattern detected.",
      severity: "medium",
      observedAt: txs[0]?.timestamp ?? "Recent",
      nodeIds: hop2Nodes.map((n) => n.id),
    });
  }

  // Rapid movement
  if (txs.length >= 2) {
    const sorted = [...txs].sort((a, b) => a.unixTime - b.unixTime);
    for (let i = 1; i < sorted.length; i++) {
      const gapMin = (sorted[i]!.unixTime - sorted[i - 1]!.unixTime) / 60000;
      if (gapMin < 30 && gapMin >= 0) {
        const primaryPath = paths[0];
        signals.push({
          id: "sig_rapid",
          pattern: "Rapid Multi-Hop Movement",
          description: `Funds moved within ${Math.round(gapMin)} minutes of receipt — velocity consistent with automated peeling.`,
          severity: "critical",
          observedAt: sorted[i]!.timestamp,
          nodeIds: primaryPath?.nodeIds ?? [rootId],
        });
        break;
      }
    }
  }

  // Mixer/bridge exposure
  const obfuscationNodes = nodes.filter((n) => n.kind === "bridge" || (n.riskNote && n.riskNote.includes("Mixer")));
  for (const obNode of obfuscationNodes) {
    signals.push({
      id: `sig_obf_${obNode.id}`,
      pattern: "Obfuscation / Privacy Infrastructure",
      description: `Direct interaction with ${obNode.label}. Tracing continuity degrades at this boundary.`,
      severity: "critical",
      observedAt: obNode.firstSeen,
      nodeIds: [obNode.id],
    });
  }

  // VASP endpoint
  const vaspOnPath = paths.find((p) => p.endpointKind === "vasp");
  if (vaspOnPath) {
    const endpoint = nodes.find((n) => n.id === vaspOnPath.nodeIds[vaspOnPath.nodeIds.length - 1]);
    signals.push({
      id: "sig_vasp_endpoint",
      pattern: "VASP Deposit Endpoint Identified",
      description: `Primary fund flow terminates at ${endpoint?.label ?? "attributed exchange"} with ${vaspOnPath.valuePreserved} value preserved.`,
      severity: "high",
      observedAt: endpoint?.firstSeen ?? "Recent",
      nodeIds: vaspOnPath.nodeIds,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "sig_baseline",
      pattern: "Value Continuity Maintained",
      description: `${edges.length} traced transfers preserve sequential fund forwarding across ${nodes.length} addresses.`,
      severity: "medium",
      observedAt: txs[0]?.timestamp ?? "Recent",
      nodeIds: paths[0]?.nodeIds ?? [rootId],
    });
  }

  return signals;
}

function buildTimelineFromTxs(
  txs: InternalTransaction[],
  nodes: GraphNode[],
  edges: GraphEdge[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const sorted = [...txs].sort((a, b) => b.unixTime - a.unixTime).slice(0, 12);

  for (const tx of sorted) {
    const d = new Date(tx.timestamp);
    const toNode = nodes.find((n) => n.address === tx.to);
    const edge = edges.find((e) => e.txHash === tx.hash);

    events.push({
      id: `tl_${tx.hash.slice(0, 16)}`,
      at: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      clock: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      title: tx.direction === "out" ? `Outflow: ${tx.value}` : `Inflow: ${tx.value}`,
      detail: `${tx.hash.slice(0, 10)}… · Block #${tx.blockNumber}${edge ? ` · ${(edge.continuity * 100).toFixed(0)}% continuity` : ""}`,
      nodeId: toNode?.id,
      pathId: edge?.pathIds[0],
      kind: toNode?.kind === "vasp" ? "attribution" : tx.direction === "out" ? "transfer" : "attribution",
    });
  }

  return events;
}

function buildFindings(
  investigation: InvestigationRecord,
  nodes: GraphNode[],
  edges: GraphEdge[],
  paths: TracePath[],
  entities: EntityCandidate[],
  signals: BehaviourSignal[],
  txs: InternalTransaction[],
) {
  const findings: GraphBuildResult["generatedFindings"] = [];
  const target = investigation.target_address;

  findings.push({
    title: `On-Chain Trace: ${target.slice(0, 8)}…${target.slice(-4)}`,
    description: `Indexed ${txs.length} live transactions on ${investigation.blockchain.toUpperCase()}. Constructed bounded graph: ${nodes.length} addresses, ${edges.length} transfers across ${investigation.trace_depth} hops.`,
    severity: signals.some((s) => s.severity === "critical") ? "critical" : "high",
    confidence: 0.94,
    type: "trace_path",
    relatedAddresses: nodes.slice(0, 6).map((n) => n.address),
    relatedTxHashes: txs.slice(0, 5).map((t) => t.hash),
  });

  if (paths[0]) {
    const p = paths[0];
    findings.push({
      title: `Primary Fund Flow: ${p.label}`,
      description: `${p.verdict}. ${p.valuePreserved} value preserved over ${p.hops} hops (${(p.continuity * 100).toFixed(0)}% continuity).`,
      severity: p.endpointKind === "vasp" ? "critical" : "high",
      confidence: p.confidence,
      type: "path_continuity",
      relatedAddresses: p.nodeIds.map((id) => nodes.find((n) => n.id === id)?.address ?? id),
      relatedTxHashes: edges.filter((e) => p.nodeIds.includes(e.from) && p.nodeIds.includes(e.to)).map((e) => e.txHash),
    });
  }

  if (entities[0]) {
    const e = entities[0];
    findings.push({
      title: `Entity Correlation: ${e.name}`,
      description: `Attribution match within ${e.proximityHops} hop(s). Strength: ${(e.attributionStrength * 100).toFixed(0)}%. ${e.rationale[0]}`,
      severity: "high",
      confidence: e.attributionStrength,
      type: "vasp_candidate",
      relatedAddresses: nodes.filter((n) => n.label === e.name).map((n) => n.address),
      relatedTxHashes: txs.slice(0, 2).map((t) => t.hash),
    });
  }

  for (const sig of signals.filter((s) => s.severity === "critical" || s.severity === "high").slice(0, 2)) {
    findings.push({
      title: sig.pattern,
      description: sig.description,
      severity: sig.severity,
      confidence: 0.88,
      type: "behavioural_pattern",
      relatedAddresses: sig.nodeIds.map((id) => nodes.find((n) => n.id === id)?.address ?? id),
      relatedTxHashes: [],
    });
  }

  return findings;
}
