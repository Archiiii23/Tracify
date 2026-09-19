/**
 * Read-only chain intelligence lookups.
 *
 * These power the workspace's address inspector: a single address summary with
 * attribution tags, and its ranked counterparties. They are provider-backed,
 * so the same endpoints serve GraphSense data in production and deterministic
 * data locally.
 */
import { CHAINS, type Chain } from "../models/Investigation.model";
import { expandGraphFromProvider, getChainProvider } from "./blockchain";
import { baselineRisk } from "./blockchain/types";

export async function lookupAddress(chain: Chain, address: string) {
  const provider = getChainProvider(chain);
  const summary = await provider.getAddress(chain, address);

  return {
    source: provider.id,
    sourceLabel: provider.label,
    address: summary,
    riskScore: baselineRisk(summary.category, 0),
    /** Attribution is the actionable part: surface it explicitly. */
    attribution: {
      isVasp: summary.isVasp,
      topLabel: summary.label ?? null,
      tagCount: summary.tags.length,
    },
  };
}

export async function lookupNeighbours(
  chain: Chain,
  address: string,
  options: { direction: "in" | "out"; limit: number; minValueUsd?: number },
) {
  const provider = getChainProvider(chain);
  const neighbours = await provider.getNeighbours({
    chain,
    address,
    direction: options.direction,
    limit: options.limit,
    ...(options.minValueUsd !== undefined ? { minValueUsd: options.minValueUsd } : {}),
  });

  return {
    source: provider.id,
    sourceLabel: provider.label,
    address,
    direction: options.direction,
    neighbours,
    totalValueUsd: Math.round(neighbours.reduce((acc, n) => acc + n.valueUsd, 0)),
  };
}

export async function lookupTransaction(chain: Chain, txHash: string) {
  const provider = getChainProvider(chain);
  const transaction = await provider.getTransaction(chain, txHash);
  return {
    source: provider.id,
    sourceLabel: provider.label,
    transaction,
  };
}

export async function lookupTransactions(
  chain: Chain,
  address: string,
  options: {
    direction?: "in" | "out" | "all";
    limit?: number;
    page?: number;
    minValueUsd?: number;
    asset?: string;
  },
) {
  const provider = getChainProvider(chain);
  const result = await provider.getTransactions({
    chain,
    address,
    direction: options.direction ?? "all",
    limit: options.limit ?? 25,
    page: options.page ?? 1,
    minValueUsd: options.minValueUsd,
    asset: options.asset,
  });

  return {
    source: provider.id,
    sourceLabel: provider.label,
    address,
    chain,
    ...result,
  };
}

export async function multiChainSearch(address: string) {
  const settled = await Promise.allSettled(
    CHAINS.map(async (chain) => {
      const provider = getChainProvider(chain);
      const summary = await provider.getAddress(chain, address);
      return {
        chain,
        source: provider.id,
        summary,
      };
    }),
  );

  const chainsFound = settled
    .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    .filter(
      (entry) =>
        (entry.summary.balanceUsd ?? 0) > 0 ||
        (entry.summary.totalReceivedUsd ?? 0) > 0 ||
        (entry.summary.incomingTxCount ?? 0) > 0 ||
        (entry.summary.outgoingTxCount ?? 0) > 0 ||
        entry.summary.tags.length > 0,
    );

  return {
    address,
    chainsScanned: CHAINS.length,
    activeChainsCount: chainsFound.length,
    results: chainsFound,
  };
}

export async function quickTraceAddress(
  chain: Chain,
  address: string,
  options: { maxHops?: number; minValueUsd?: number; direction?: "outbound" | "inbound" | "both" } = {},
) {
  const provider = getChainProvider(chain);
  const trace = await expandGraphFromProvider(provider, {
    chain,
    rootAddress: address,
    maxHops: Math.min(options.maxHops ?? 3, 5),
    minValueUsd: options.minValueUsd ?? 0,
    direction: options.direction ?? "outbound",
  });

  return {
    source: provider.id,
    sourceLabel: provider.label,
    rootAddress: address,
    chain,
    graph: trace,
  };
}

