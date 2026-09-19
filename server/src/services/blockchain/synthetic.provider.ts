/**
 * Synthetic provider.
 *
 * Deterministic stand-in used when GraphSense is not configured (local
 * development, CI, demos). It is built on the pure intelligence engine, so the
 * same address always yields the same neighbourhood and no network call is made.
 */
import { createHash } from "node:crypto";
import type { Chain } from "../../models/Investigation.model";
import { expandGraph } from "../intelligence.service";
import {
  isServiceCategory,
  type AddressNeighbour,
  type AddressSummary,
  type AddressTag,
  type ChainProvider,
  type NeighbourQuery,
  type TransactionQuery,
  type TransactionSummary,
} from "./types";

function hashInt(seed: string): number {
  const hex = createHash("sha256").update(seed).digest("hex");
  return Number.parseInt(hex.slice(0, 8), 16);
}

function pseudoAddress(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `0x${hex.slice(0, 40)}`;
}

function tagsFor(category: string | undefined, label: string | undefined): AddressTag[] {
  if (!category && !label) return [];
  return [
    {
      label: label ?? category ?? "unlabelled",
      ...(category ? { category } : {}),
      confidence: 0.6,
      source: "synthetic",
    },
  ];
}

export class SyntheticProvider implements ChainProvider {
  readonly id = "synthetic" as const;
  readonly label = "Synthetic ledger (deterministic)";

  supports(): boolean {
    return true;
  }

  /** One hop of the deterministic graph describes the address' neighbourhood. */
  private hop(chain: Chain, address: string) {
    return expandGraph({
      rootAddress: address,
      chain,
      maxHops: 1,
      minValueUsd: 0,
      direction: "outbound",
    });
  }

  async getAddress(chain: Chain, address: string): Promise<AddressSummary> {
    const { nodes, edges } = this.hop(chain, address);
    const root = nodes[0]!;
    const outgoing = edges.filter((e) => e.from === address);

    return {
      address,
      chain,
      ...(root.label ? { label: root.label } : {}),
      ...(root.category ? { category: root.category } : {}),
      isVasp: root.isVasp,
      balanceUsd: root.valueUsd,
      totalSentUsd: outgoing.reduce((acc, e) => acc + e.valueUsd, 0),
      outgoingTxCount: outgoing.length,
      outDegree: outgoing.length,
      ...(edges[0] ? { firstSeen: edges[0].timestamp, lastSeen: edges[edges.length - 1]!.timestamp } : {}),
      tags: tagsFor(root.category, root.label),
    };
  }

  async getNeighbours(query: NeighbourQuery): Promise<AddressNeighbour[]> {
    const { nodes, edges } = this.hop(query.chain, query.address);
    const byAddress = new Map(nodes.map((n) => [n.address, n]));

    return edges
      .filter((edge) => (query.direction === "out" ? edge.from : edge.to) === query.address)
      .map((edge) => {
        const other = query.direction === "out" ? edge.to : edge.from;
        const node = byAddress.get(other);
        const category = node?.category;
        return {
          address: other,
          chain: query.chain,
          ...(node?.label ? { label: node.label } : {}),
          ...(node?.entity ? { entity: node.entity } : {}),
          ...(category ? { category } : {}),
          isVasp: node?.isVasp ?? isServiceCategory(category),
          valueUsd: edge.valueUsd,
          amount: edge.amount,
          asset: edge.asset,
          txCount: 1,
          txHash: edge.txHash,
          timestamp: edge.timestamp,
          tags: tagsFor(category, node?.label),
        } satisfies AddressNeighbour;
      })
      .filter((n) => query.minValueUsd === undefined || n.valueUsd >= query.minValueUsd)
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, query.limit);
  }

  async getTags(chain: Chain, address: string): Promise<AddressTag[]> {
    return (await this.getAddress(chain, address)).tags;
  }

  async getTransaction(chain: Chain, txHash: string): Promise<TransactionSummary> {
    const h = hashInt(txHash);
    const from = pseudoAddress(txHash + "from");
    const to = pseudoAddress(txHash + "to");
    const amount = 5 + (h % 250);
    const asset = chain === "bitcoin" ? "BTC" : chain === "tron" ? "USDT" : "ETH";
    const valueUsd = amount * (chain === "bitcoin" ? 65000 : chain === "tron" ? 1 : 3200);

    return {
      txHash,
      chain,
      blockNumber: 18000000 + (h % 500000),
      timestamp: new Date(Date.now() - (h % (30 * 86400)) * 1000),
      from,
      to,
      asset,
      amount,
      valueUsd: Math.round(valueUsd),
      fee: 0.0021,
      feeUsd: 6.72,
      status: "success",
      confirmations: 12 + (h % 100),
      isContractCall: h % 3 === 0,
      method: h % 3 === 0 ? "transfer(address,uint256)" : undefined,
    };
  }

  async getTransactions(query: TransactionQuery): Promise<{ items: TransactionSummary[]; total: number }> {
    const { edges } = this.hop(query.chain, query.address);
    const limit = query.limit ?? 20;

    let txs: TransactionSummary[] = edges.map((edge, idx) => {
      const edgeHash = createHash("sha256").update(edge.txHash).digest("hex");
      return {
        txHash: edge.txHash.startsWith("0x") ? edge.txHash : `0x${edgeHash}`,
        chain: query.chain,
        blockNumber: 19000000 + idx * 100,
        timestamp: edge.timestamp,
        from: edge.from,
        to: edge.to,
        asset: edge.asset,
        amount: edge.amount,
        valueUsd: edge.valueUsd,
        status: "success",
        confirmations: 35 + idx * 2,
        isContractCall: false,
      };
    });

    if (query.direction && query.direction !== "all") {
      const isOut = query.direction === "out";
      txs = txs.filter((tx) =>
        isOut
          ? tx.from.toLowerCase() === query.address.toLowerCase()
          : tx.to.toLowerCase() === query.address.toLowerCase(),
      );
    }
    if (query.minValueUsd !== undefined) {
      txs = txs.filter((tx) => (tx.valueUsd ?? 0) >= (query.minValueUsd ?? 0));
    }
    if (query.asset) {
      txs = txs.filter((tx) => tx.asset.toLowerCase() === query.asset?.toLowerCase());
    }

    return {
      items: txs.slice(0, limit),
      total: txs.length,
    };
  }

  async healthcheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

export const syntheticProvider = new SyntheticProvider();
