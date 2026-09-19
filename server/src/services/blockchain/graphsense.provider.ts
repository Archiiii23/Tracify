/**
 * GraphSense adapter.
 *
 * Talks to a GraphSense REST instance (self-hosted or the Iknaio-hosted API)
 * and normalises its responses into the provider-agnostic shapes the
 * intelligence engine consumes. Everything provider-specific — currency codes,
 * fiat value arrays, tag taxonomies, pagination — is contained in this file.
 *
 * API reference: https://api.graphsense.info (OpenAPI: /openapi.json)
 */
import { env } from "../../config/env";
import type { Chain } from "../../models/Investigation.model";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import {
  baselineRisk,
  isServiceCategory,
  type AddressNeighbour,
  type AddressSummary,
  type AddressTag,
  type ChainProvider,
  type NeighbourQuery,
  type TransactionQuery,
  type TransactionSummary,
} from "./types";

/**
 * GraphSense indexes UTXO and account-model chains under short currency codes.
 * Chains absent from this map are not covered by GraphSense at all — the
 * registry falls back to the synthetic provider for them rather than issuing a
 * request that can only 404.
 */
const CURRENCY_BY_CHAIN: Partial<Record<Chain, string>> = {
  bitcoin: "btc",
  ethereum: "eth",
  tron: "trx",
};

interface GsFiatValue {
  code?: string;
  value?: number;
}

interface GsValues {
  value?: number | string;
  fiat_values?: GsFiatValue[];
}

interface GsAddressTag {
  label?: string;
  category?: string;
  actor?: string;
  confidence?: string;
  confidence_level?: number;
  tagpack_title?: string;
  source?: string;
}

interface GsAddress {
  address?: string;
  entity?: number | { entity?: number };
  balance?: GsValues;
  total_received?: GsValues;
  total_spent?: GsValues;
  no_incoming_txs?: number;
  no_outgoing_txs?: number;
  in_degree?: number;
  out_degree?: number;
  first_tx?: { timestamp?: number };
  last_tx?: { timestamp?: number };
  is_contract?: boolean;
  actors?: { label?: string; id?: string }[];
  best_address_tag?: GsAddressTag;
}

interface GsNeighbour {
  address?: GsAddress & { address?: string };
  labels?: string[];
  value?: GsValues;
  token_values?: Record<string, GsValues>;
  no_txs?: number;
}

interface GsTxIo {
  address?: string[] | string;
  value?: GsValues;
}

interface GsTx {
  tx_hash?: string;
  block_id?: number;
  height?: number;
  timestamp?: number;
  from_address?: string;
  to_address?: string;
  inputs?: GsTxIo[];
  outputs?: GsTxIo[];
  value?: GsValues;
  total_input?: GsValues;
  total_output?: GsValues;
  token_values?: Record<string, GsValues>;
  contract_creation?: boolean;
}

/** GraphSense timestamps are unix seconds. */
function toDate(seconds: number | undefined): Date | undefined {
  return typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000) : undefined;
}

/** Fiat values arrive as an array of currency-coded entries. */
function usd(values: GsValues | undefined): number | undefined {
  const match = values?.fiat_values?.find((f) => (f.code ?? "").toLowerCase() === "usd");
  return typeof match?.value === "number" ? Math.round(match.value * 100) / 100 : undefined;
}

/** Confidence is reported as a 0–100 level or a textual band. */
function toConfidence(tag: GsAddressTag | undefined): number {
  if (!tag) return 0;
  if (typeof tag.confidence_level === "number") {
    return Math.max(0, Math.min(1, tag.confidence_level / 100));
  }
  const band = (tag.confidence ?? "").toLowerCase();
  if (band.includes("ownership") || band.includes("manual")) return 0.95;
  if (band.includes("service")) return 0.85;
  if (band.includes("forensic")) return 0.7;
  if (band.includes("web_crawl") || band.includes("crawl")) return 0.55;
  return band ? 0.5 : 0;
}

function normaliseTag(tag: GsAddressTag): AddressTag {
  return {
    label: tag.label ?? tag.actor ?? "unlabelled",
    ...(tag.category ? { category: tag.category.toLowerCase() } : {}),
    ...(tag.actor ? { actor: tag.actor } : {}),
    confidence: toConfidence(tag),
    ...(tag.tagpack_title || tag.source ? { source: tag.tagpack_title ?? tag.source } : {}),
  };
}

/** The highest-confidence tag wins; ties prefer an explicit category. */
function bestTag(tags: AddressTag[]): AddressTag | undefined {
  return [...tags].sort(
    (a, b) => b.confidence - a.confidence || (b.category ? 1 : 0) - (a.category ? 1 : 0),
  )[0];
}

function normaliseTx(raw: GsTx, chain: Chain, defaultHash?: string): TransactionSummary {
  const hash = raw.tx_hash ?? defaultHash ?? "unknown";
  const from =
    raw.from_address ??
    (Array.isArray(raw.inputs?.[0]?.address)
      ? raw.inputs?.[0]?.address[0]
      : (raw.inputs?.[0]?.address as string)) ??
    "unknown";
  const to =
    raw.to_address ??
    (Array.isArray(raw.outputs?.[0]?.address)
      ? raw.outputs?.[0]?.address[0]
      : (raw.outputs?.[0]?.address as string)) ??
    "unknown";

  let tokenAsset: string | undefined;
  let tokenAmount: number | undefined;
  let tokenUsd: number | undefined;
  if (raw.token_values) {
    for (const [assetName, vals] of Object.entries(raw.token_values)) {
      const u = usd(vals);
      if (u !== undefined && (!tokenUsd || u > tokenUsd)) {
        tokenAsset = assetName;
        tokenAmount = typeof vals.value === "number" ? vals.value : Number(vals.value) || 0;
        tokenUsd = u;
      }
    }
  }

  const nativeCode = (CURRENCY_BY_CHAIN[chain] ?? "ETH").toUpperCase();
  const rawNativeVal = raw.value ?? raw.total_output ?? raw.total_input;
  const nativeAmount =
    typeof rawNativeVal?.value === "number"
      ? rawNativeVal.value
      : Number(rawNativeVal?.value) || 0;
  const nativeUsd = usd(rawNativeVal);

  const asset = tokenAsset ?? nativeCode;
  const amount = tokenAmount ?? nativeAmount;
  const valueUsd = tokenUsd ?? nativeUsd;

  return {
    txHash: hash,
    chain,
    ...(raw.block_id || raw.height ? { blockNumber: raw.block_id ?? raw.height } : {}),
    ...(toDate(raw.timestamp) ? { timestamp: toDate(raw.timestamp) } : {}),
    from,
    to,
    asset,
    amount,
    ...(valueUsd !== undefined ? { valueUsd: Math.round(valueUsd * 100) / 100 } : {}),
    status: "success",
    ...(raw.contract_creation !== undefined ? { isContractCall: raw.contract_creation } : {}),
  };
}

export class GraphSenseProvider implements ChainProvider {
  readonly id = "graphsense" as const;
  readonly label = "GraphSense";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  supports(chain: Chain): boolean {
    return CURRENCY_BY_CHAIN[chain] !== undefined;
  }

  private currency(chain: Chain): string {
    const code = CURRENCY_BY_CHAIN[chain];
    if (!code) throw ApiError.badRequest(`GraphSense does not index ${chain}`);
    return code;
  }

  /**
   * Single request path for every call: bounded timeout, one retry for
   * transient failures, and provider errors translated into ApiErrors so no
   * upstream response body is ever forwarded to a client.
   */
  private async request<T>(path: string, attempt = 1): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    // GraphSense/Iknaio expects the raw key in the Authorization header.
    if (this.apiKey) headers['Authorization'] = this.apiKey;

    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (attempt === 1) return this.request<T>(path, 2);
      logger.error("graphsense request failed", {
        path,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw new ApiError(502, "Chain data provider is unreachable");
    }

    if (response.status === 404) throw ApiError.notFound("Address not found on the ledger index");
    if (response.status === 401 || response.status === 403) {
      logger.error("graphsense rejected credentials", { status: response.status });
      throw new ApiError(502, "Chain data provider rejected the request");
    }
    if (response.status === 429) {
      throw new ApiError(429, "Chain data provider rate limit reached — retry shortly");
    }
    if (!response.ok) {
      if (response.status >= 500 && attempt === 1) return this.request<T>(path, 2);
      logger.error("graphsense returned an error", { path, status: response.status });
      throw new ApiError(502, "Chain data provider returned an error");
    }

    return (await response.json()) as T;
  }

  async getTags(chain: Chain, address: string): Promise<AddressTag[]> {
    const currency = this.currency(chain);
    const payload = await this.request<{ address_tags?: GsAddressTag[] }>(
      `/${currency}/addresses/${encodeURIComponent(address)}/tags?pagesize=20`,
    );
    return (payload.address_tags ?? []).map(normaliseTag);
  }

  async getAddress(chain: Chain, address: string): Promise<AddressSummary> {
    const currency = this.currency(chain);
    const raw = await this.request<GsAddress>(
      `/${currency}/addresses/${encodeURIComponent(address)}`,
    );

    // Tag lookup is best-effort: an unattributed address is still a valid node.
    let tags: AddressTag[] = [];
    try {
      tags = await this.getTags(chain, address);
    } catch {
      if (raw.best_address_tag) tags = [normaliseTag(raw.best_address_tag)];
    }

    const top = bestTag(tags) ?? (raw.best_address_tag ? normaliseTag(raw.best_address_tag) : undefined);
    const category = top?.category;
    const label = top?.actor ?? top?.label ?? raw.actors?.[0]?.label;

    return {
      address: raw.address ?? address,
      chain,
      ...(label ? { label } : {}),
      ...(top?.actor ? { entity: top.actor } : {}),
      ...(category ? { category } : {}),
      isVasp: isServiceCategory(category),
      ...(raw.is_contract !== undefined ? { isContract: raw.is_contract } : {}),
      ...(usd(raw.balance) !== undefined ? { balanceUsd: usd(raw.balance) } : {}),
      ...(usd(raw.total_received) !== undefined
        ? { totalReceivedUsd: usd(raw.total_received) }
        : {}),
      ...(usd(raw.total_spent) !== undefined ? { totalSentUsd: usd(raw.total_spent) } : {}),
      ...(raw.no_incoming_txs !== undefined ? { incomingTxCount: raw.no_incoming_txs } : {}),
      ...(raw.no_outgoing_txs !== undefined ? { outgoingTxCount: raw.no_outgoing_txs } : {}),
      ...(raw.in_degree !== undefined ? { inDegree: raw.in_degree } : {}),
      ...(raw.out_degree !== undefined ? { outDegree: raw.out_degree } : {}),
      ...(toDate(raw.first_tx?.timestamp) ? { firstSeen: toDate(raw.first_tx?.timestamp) } : {}),
      ...(toDate(raw.last_tx?.timestamp) ? { lastSeen: toDate(raw.last_tx?.timestamp) } : {}),
      tags,
    };
  }

  async getNeighbours(query: NeighbourQuery): Promise<AddressNeighbour[]> {
    const currency = this.currency(query.chain);
    // Ask for headroom so value filtering does not starve the frontier.
    const pagesize = Math.min(100, Math.max(query.limit * 2, query.limit));
    const payload = await this.request<{ neighbors?: GsNeighbour[] }>(
      `/${currency}/addresses/${encodeURIComponent(query.address)}/neighbors` +
        `?direction=${query.direction}&pagesize=${pagesize}`,
    );

    const neighbours: AddressNeighbour[] = [];

    for (const raw of payload.neighbors ?? []) {
      const address = raw.address?.address;
      if (!address) continue;

      const tags = raw.address?.best_address_tag ? [normaliseTag(raw.address.best_address_tag)] : [];
      const labelTags: AddressTag[] = (raw.labels ?? []).map((label) => ({
        label,
        confidence: 0.5,
      }));
      const all = [...tags, ...labelTags];
      const top = bestTag(all);
      const category = top?.category;

      // Token transfers carry their own fiat totals; prefer the largest.
      const tokenUsd = Object.values(raw.token_values ?? {})
        .map((v) => usd(v) ?? 0)
        .reduce((max, v) => Math.max(max, v), 0);
      const valueUsd = Math.max(usd(raw.value) ?? 0, tokenUsd);
      if (query.minValueUsd !== undefined && valueUsd < query.minValueUsd) continue;

      neighbours.push({
        address,
        chain: query.chain,
        ...(top?.label ? { label: top.actor ?? top.label } : {}),
        ...(top?.actor ? { entity: top.actor } : {}),
        ...(category ? { category } : {}),
        isVasp: isServiceCategory(category),
        valueUsd: Math.round(valueUsd),
        ...(typeof raw.value?.value === "number" ? { amount: raw.value.value } : {}),
        asset: currency.toUpperCase(),
        txCount: raw.no_txs ?? 1,
        tags: all,
      });
    }

    // Highest-value counterparties first: that is where the money went.
    return neighbours.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, query.limit);
  }

  async getTransaction(chain: Chain, txHash: string): Promise<TransactionSummary> {
    const currency = this.currency(chain);
    const raw = await this.request<GsTx>(
      `/${currency}/txs/${encodeURIComponent(txHash)}`,
    );
    return normaliseTx(raw, chain, txHash);
  }

  async getTransactions(query: TransactionQuery): Promise<{ items: TransactionSummary[]; total: number }> {
    const currency = this.currency(query.chain);
    const pagesize = Math.min(100, Math.max(query.limit ?? 20, 1));
    const payload = await this.request<{ address_txs?: GsTx[] }>(
      `/${currency}/addresses/${encodeURIComponent(query.address)}/txs?pagesize=${pagesize}`,
    );

    let items = (payload.address_txs ?? []).map((t) => normaliseTx(t, query.chain));
    if (query.direction && query.direction !== "all") {
      const isOut = query.direction === "out";
      items = items.filter((tx) =>
        isOut
          ? tx.from.toLowerCase() === query.address.toLowerCase()
          : tx.to.toLowerCase() === query.address.toLowerCase(),
      );
    }
    if (query.minValueUsd !== undefined) {
      items = items.filter((tx) => (tx.valueUsd ?? 0) >= (query.minValueUsd ?? 0));
    }
    if (query.asset) {
      items = items.filter((tx) => tx.asset.toLowerCase() === query.asset?.toLowerCase());
    }

    return {
      items,
      total: items.length,
    };
  }

  async healthcheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.request<unknown>("/stats");
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof ApiError ? error.message : "Provider probe failed",
      };
    }
  }
}

/** Configured instance, or `null` when GraphSense credentials are absent. */
export function createGraphSenseProvider(): GraphSenseProvider | null {
  if (!env.GRAPHSENSE_API_URL) return null;
  return new GraphSenseProvider(
    env.GRAPHSENSE_API_URL.replace(/\/+$/, ""),
    env.GRAPHSENSE_API_KEY,
    env.GRAPHSENSE_TIMEOUT_MS,
  );
}

export { CURRENCY_BY_CHAIN, normaliseTag, usd as fiatUsd, toConfidence };
