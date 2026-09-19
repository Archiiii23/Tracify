/**
 * Provider-driven graph expansion.
 *
 * Mirrors the bounded breadth-first contract of the pure engine — hop limits,
 * value continuity, terminal services — but sources counterparties from a live
 * chain-data provider instead of the deterministic generator. Ranking, signal
 * detection and risk scoring stay in `intelligence.service`, so the analysis is
 * identical regardless of where the graph came from.
 */
import type { Chain, GraphEdge, GraphNode } from "../../models/Investigation.model";
import { logger } from "../../utils/logger";
import {
  detectSignals,
  rankPaths,
  scoreRisk,
  type TraceRequest,
  type TraceResult,
} from "../intelligence.service";
import { baselineRisk, type ChainProvider } from "./types";

/** Counterparties fetched per address — bounds fan-out and provider load. */
const MAX_NEIGHBOURS_PER_ADDRESS = 6;
/** Hard ceiling on graph size so one popular address cannot exhaust memory. */
const MAX_NODES = 400;

export interface ProviderTraceResult extends TraceResult {
  source: ChainProvider["id"];
}

function directionFor(request: TraceRequest): "in" | "out" {
  return request.direction === "inbound" ? "in" : "out";
}

/**
 * Expand a real graph from the provider. Value continuity is preserved by
 * distributing each parent's traced value across its counterparties in
 * proportion to the value actually observed on those edges.
 */
export async function expandGraphFromProvider(
  provider: ChainProvider,
  request: TraceRequest,
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const direction = directionFor(request);
  const seedValue = request.seedValueUsd ?? 0;

  const rootSummary = await provider.getAddress(request.chain, request.rootAddress);
  const root: GraphNode = {
    address: rootSummary.address,
    chain: request.chain,
    label: rootSummary.label ?? "Trace root",
    ...(rootSummary.entity ? { entity: rootSummary.entity } : {}),
    category: rootSummary.category ?? "personal-wallet",
    riskScore: baselineRisk(rootSummary.category, 0),
    hop: 0,
    valueUsd: seedValue || Math.round(rootSummary.totalSentUsd ?? rootSummary.balanceUsd ?? 0),
    isVasp: rootSummary.isVasp,
  };

  const nodes: GraphNode[] = [root];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>([root.address.toLowerCase()]);
  let frontier: GraphNode[] = [root];

  for (let hop = 1; hop <= request.maxHops; hop += 1) {
    const next: GraphNode[] = [];

    for (const parent of frontier) {
      // A regulated service is where the trace ends: value inside a custodial
      // system is no longer followable on-chain.
      if (parent.isVasp) continue;
      if (nodes.length >= MAX_NODES) break;

      const neighbours = await provider.getNeighbours({
        chain: request.chain,
        address: parent.address,
        direction,
        limit: MAX_NEIGHBOURS_PER_ADDRESS,
        ...(request.minValueUsd > 0 ? { minValueUsd: request.minValueUsd } : {}),
      });
      if (neighbours.length === 0) continue;

      const observed = neighbours.reduce((acc, n) => acc + n.valueUsd, 0);

      for (const neighbour of neighbours) {
        if (nodes.length >= MAX_NODES) break;

        // Attribute the parent's traced value proportionally; fall back to an
        // even split when the provider reports no fiat value at all.
        const share =
          observed > 0 ? neighbour.valueUsd / observed : 1 / neighbours.length;
        const tracedValue = Math.round(parent.valueUsd * share);
        if (tracedValue < request.minValueUsd) continue;

        const key = neighbour.address.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          const node: GraphNode = {
            address: neighbour.address,
            chain: request.chain,
            ...(neighbour.label ? { label: neighbour.label } : {}),
            ...(neighbour.entity ? { entity: neighbour.entity } : {}),
            ...(neighbour.category ? { category: neighbour.category } : {}),
            riskScore: baselineRisk(neighbour.category, hop),
            hop,
            valueUsd: tracedValue,
            isVasp: neighbour.isVasp,
          };
          nodes.push(node);
          next.push(node);
        }

        const from = direction === "out" ? parent.address : neighbour.address;
        const to = direction === "out" ? neighbour.address : parent.address;
        edges.push({
          from,
          to,
          txHash: neighbour.txHash ?? `${neighbour.txCount} transfer(s)`,
          asset: neighbour.asset ?? "NATIVE",
          amount: neighbour.amount ?? 0,
          valueUsd: tracedValue,
          timestamp: neighbour.timestamp ?? new Date(),
          hop,
        });
      }
    }

    if (next.length === 0) break;
    frontier = next;
  }

  return { nodes, edges };
}

/** Full provider-backed pipeline: expand → rank → detect → score. */
export async function traceWithProvider(
  provider: ChainProvider,
  request: TraceRequest,
): Promise<ProviderTraceResult> {
  const { nodes, edges } = await expandGraphFromProvider(provider, request);
  const paths = rankPaths(nodes, edges, request.rootAddress);
  const signals = detectSignals(nodes, edges);
  const seedValue = nodes[0]?.valueUsd ?? 0;
  const leafValue = paths[0]?.valueUsd ?? 0;

  logger.info("provider trace complete", {
    provider: provider.id,
    chain: request.chain,
    nodes: nodes.length,
    edges: edges.length,
  });

  return {
    source: provider.id,
    nodes,
    edges,
    paths,
    signals,
    riskScore: scoreRisk(nodes, signals),
    metrics: {
      addressesTouched: nodes.length,
      hopsTraced: nodes.reduce((max, n) => Math.max(max, n.hop), 0),
      valueTracedUsd: Math.round(edges.reduce((acc, e) => acc + e.valueUsd, 0)),
      vaspTouchpoints: nodes.filter((n) => n.isVasp).length,
      retainedValuePct: seedValue > 0 ? Math.round((leafValue / seedValue) * 100) : 0,
    },
  };
}

export function chainIsSupportedBy(provider: ChainProvider, chain: Chain): boolean {
  return provider.supports(chain);
}

export { MAX_NEIGHBOURS_PER_ADDRESS, MAX_NODES };
