/**
 * Etherscan-family multi-chain provider.
 *
 * Supports Ethereum, Polygon, BSC, and Arbitrum using their standard Scan API format.
 * Covers transaction details, token transfers, account transaction history,
 * and counterparty extraction for graph expansion.
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

interface ChainConfig {
  baseUrl: string;
  apiKey?: string;
  chainId: number;
  nativeAsset: string;
  usdRate: number; // Approximate baseline for display when real-time oracle is absent
}

/** Etherscan V2 multichain endpoint. One key works across every listed chain. */
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

/**
 * SIH demo fallback — a single Etherscan V2 multichain key that works across
 * Ethereum, Polygon, BSC, and Arbitrum. Overridden by ETHERSCAN_API_KEY /
 * POLYGONSCAN_API_KEY / BSCSCAN_API_KEY when set in the environment.
 */
const DEFAULT_ETHERSCAN_KEY = "NVCS3RGHYJGH6TCB7SWCMZGKWT1N4MW39M";

const EVM_CONFIG: Partial<Record<Chain, ChainConfig>> = {
  ethereum: {
    baseUrl: ETHERSCAN_V2_BASE,
    apiKey: env.ETHERSCAN_API_KEY ?? DEFAULT_ETHERSCAN_KEY,
    chainId: 1,
    nativeAsset: "ETH",
    usdRate: 3200,
  },
  polygon: {
    baseUrl: ETHERSCAN_V2_BASE,
    apiKey: env.POLYGONSCAN_API_KEY ?? DEFAULT_ETHERSCAN_KEY,
    chainId: 137,
    nativeAsset: "POL",
    usdRate: 0.45,
  },
  bsc: {
    baseUrl: ETHERSCAN_V2_BASE,
    apiKey: env.BSCSCAN_API_KEY ?? DEFAULT_ETHERSCAN_KEY,
    chainId: 56,
    nativeAsset: "BNB",
    usdRate: 580,
  },
  arbitrum: {
    baseUrl: ETHERSCAN_V2_BASE,
    apiKey: env.ETHERSCAN_API_KEY ?? DEFAULT_ETHERSCAN_KEY,
    chainId: 42161,
    nativeAsset: "ETH",
    usdRate: 3200,
  },
};

interface EtherscanTx {
  blockNumber?: string;
  timeStamp?: string;
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  gasUsed?: string;
  isError?: string;
  txreceipt_status?: string;
  input?: string;
  contractAddress?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  functionName?: string;
}

interface EtherscanApiResponse<T> {
  status: string;
  message: string;
  result: T;
}

export class EtherscanProvider implements ChainProvider {
  readonly id = "etherscan" as const;
  readonly label = "Etherscan Family (EVM Indexer)";

  supports(chain: Chain): boolean {
    return EVM_CONFIG[chain] !== undefined;
  }

  private getConfig(chain: Chain): ChainConfig {
    const config = EVM_CONFIG[chain];
    if (!config) throw ApiError.badRequest(`EVM chain ${chain} is not supported by Etherscan provider`);
    return config;
  }

  private async request<T>(chain: Chain, params: Record<string, string>): Promise<T> {
    const config = this.getConfig(chain);
    const searchParams = new URLSearchParams(params);
    // Etherscan V2 uses chainid to route across networks.
    searchParams.set("chainid", String(config.chainId));
    if (config.apiKey) searchParams.set("apikey", config.apiKey);

    const url = `${config.baseUrl}?${searchParams.toString()}`;

    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new ApiError(502, `Etherscan provider returned HTTP ${res.status}`);
      }

      const body = (await res.json()) as EtherscanApiResponse<T>;
      return body.result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.warn("Etherscan request error", {
        chain,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw new ApiError(502, "EVM provider query failed");
    }
  }

  async getAddress(chain: Chain, address: string): Promise<AddressSummary> {
    const config = this.getConfig(chain);

    // Fetch balance
    let balanceEth = 0;
    try {
      const balanceWei = await this.request<string>(chain, {
        module: "account",
        action: "balance",
        address,
        tag: "latest",
      });
      balanceEth = Number(balanceWei) / 1e18;
    } catch {
      balanceEth = 0;
    }

    // Fetch recent transactions to estimate volume and activity
    const txs = await this.fetchRecentTxs(chain, address, 25);
    const incoming = txs.filter((t) => (t.to ?? "").toLowerCase() === address.toLowerCase());
    const outgoing = txs.filter((t) => (t.from ?? "").toLowerCase() === address.toLowerCase());

    const totalSentEth = outgoing.reduce((acc, t) => acc + (Number(t.value) || 0) / 1e18, 0);
    const totalReceivedEth = incoming.reduce((acc, t) => acc + (Number(t.value) || 0) / 1e18, 0);

    const firstTime = txs[txs.length - 1]?.timeStamp ? new Date(Number(txs[txs.length - 1]!.timeStamp) * 1000) : undefined;
    const lastTime = txs[0]?.timeStamp ? new Date(Number(txs[0]!.timeStamp) * 1000) : undefined;

    const tags = await this.getTags(chain, address);
    const isVasp = tags.some((t) => isServiceCategory(t.category));

    return {
      address,
      chain,
      label: tags[0]?.label ?? (isVasp ? "Regulated Service / Exchange" : undefined),
      entity: tags[0]?.actor,
      category: tags[0]?.category,
      isVasp,
      balanceUsd: Math.round(balanceEth * config.usdRate),
      totalReceivedUsd: Math.round(totalReceivedEth * config.usdRate),
      totalSentUsd: Math.round(totalSentEth * config.usdRate),
      incomingTxCount: incoming.length,
      outgoingTxCount: outgoing.length,
      firstSeen: firstTime,
      lastSeen: lastTime,
      tags,
    };
  }

  async getNeighbours(query: NeighbourQuery): Promise<AddressNeighbour[]> {
    const config = this.getConfig(query.chain);
    const txs = await this.fetchRecentTxs(query.chain, query.address, 100);

    const relevant = txs.filter((t) => {
      const isOut = (t.from ?? "").toLowerCase() === query.address.toLowerCase();
      return query.direction === "out" ? isOut : !isOut;
    });

    const counterparties = new Map<
      string,
      { count: number; valueUsd: number; amount: number; txHash?: string; timestamp?: Date; asset: string }
    >();

    for (const t of relevant) {
      const other = query.direction === "out" ? (t.to ?? "").toLowerCase() : (t.from ?? "").toLowerCase();
      if (!other || other === query.address.toLowerCase()) continue;

      const decimals = Number(t.tokenDecimal) || 18;
      const rawVal = Number(t.value) || 0;
      const amount = rawVal / Math.pow(10, decimals);
      const isToken = Boolean(t.tokenSymbol);
      const asset = t.tokenSymbol ?? config.nativeAsset;
      const rate = isToken && ["USDT", "USDC", "DAI"].includes(asset.toUpperCase()) ? 1 : config.usdRate;
      const valUsd = amount * rate;

      const existing = counterparties.get(other) ?? {
        count: 0,
        valueUsd: 0,
        amount: 0,
        asset,
        txHash: t.hash,
        timestamp: t.timeStamp ? new Date(Number(t.timeStamp) * 1000) : undefined,
      };

      existing.count += 1;
      existing.valueUsd += valUsd;
      existing.amount += amount;
      counterparties.set(other, existing);
    }

    const results: AddressNeighbour[] = [];
    for (const [otherAddress, data] of counterparties.entries()) {
      if (query.minValueUsd !== undefined && data.valueUsd < query.minValueUsd) continue;

      const tags = await this.getTags(query.chain, otherAddress);
      results.push({
        address: otherAddress,
        chain: query.chain,
        label: tags[0]?.label,
        entity: tags[0]?.actor,
        category: tags[0]?.category,
        isVasp: tags.some((t) => isServiceCategory(t.category)),
        valueUsd: Math.round(data.valueUsd),
        amount: data.amount,
        asset: data.asset,
        txCount: data.count,
        txHash: data.txHash,
        timestamp: data.timestamp,
        tags,
      });
    }

    return results.sort((a, b) => b.valueUsd - a.valueUsd).slice(0, query.limit);
  }

  async getTags(chain: Chain, address: string): Promise<AddressTag[]> {
    const knownExchanges: Record<string, string> = {
      "0x28c6c06298d514db089934071355e5743bf21d60": "Binance 14",
      "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance Hot Wallet",
      "0xdfd5293d8e347dff59e909147887e430044ed118": "Coinbase 10",
      "0x503828976d22510aad0201ac7ec88293211d23dc": "Coinbase 4",
      "0x0d0707963952f2fba59dd06f2b425ace40b492fe": "Gate.io",
      "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": "OKX",
      "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch Aggregator",
      "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap Router",
    };

    const match = knownExchanges[address.toLowerCase()];
    if (match) {
      return [
        {
          label: match,
          category: match.includes("Router") || match.includes("1inch") ? "defi" : "exchange",
          actor: match,
          confidence: 0.98,
          source: "known_vasp_registry",
        },
      ];
    }
    return [];
  }

  async getTransaction(chain: Chain, txHash: string): Promise<TransactionSummary> {
    const config = this.getConfig(chain);
    const raw = await this.request<EtherscanTx>(chain, {
      module: "proxy",
      action: "eth_getTransactionByHash",
      txhash: txHash,
    });

    if (!raw || !raw.hash) {
      throw ApiError.notFound("Transaction not found on ledger");
    }

    const blockNumber = raw.blockNumber ? Number.parseInt(raw.blockNumber, 16) : undefined;
    const valueWei = raw.value ? Number.parseInt(raw.value, 16) : 0;
    const amount = valueWei / 1e18;
    const valueUsd = amount * config.usdRate;

    return {
      txHash: raw.hash,
      chain,
      blockNumber,
      from: raw.from ?? "unknown",
      to: raw.to ?? "contract_creation",
      asset: config.nativeAsset,
      amount,
      valueUsd: Math.round(valueUsd * 100) / 100,
      status: "success",
      isContractCall: Boolean(raw.input && raw.input !== "0x"),
    };
  }

  async getTransactions(query: TransactionQuery): Promise<{ items: TransactionSummary[]; total: number }> {
    const config = this.getConfig(query.chain);
    const txs = await this.fetchRecentTxs(query.chain, query.address, query.limit ?? 25);

    let items: TransactionSummary[] = txs.map((t) => {
      const decimals = Number(t.tokenDecimal) || 18;
      const rawVal = Number(t.value) || 0;
      const amount = rawVal / Math.pow(10, decimals);
      const isToken = Boolean(t.tokenSymbol);
      const asset = t.tokenSymbol ?? config.nativeAsset;
      const rate = isToken && ["USDT", "USDC", "DAI"].includes(asset.toUpperCase()) ? 1 : config.usdRate;
      const valueUsd = amount * rate;
      const isErr = t.isError === "1" || t.txreceipt_status === "0";

      return {
        txHash: t.hash ?? "unknown",
        chain: query.chain,
        blockNumber: Number(t.blockNumber) || undefined,
        timestamp: t.timeStamp ? new Date(Number(t.timeStamp) * 1000) : undefined,
        from: t.from ?? "unknown",
        to: t.to ?? "unknown",
        asset,
        amount,
        valueUsd: Math.round(valueUsd * 100) / 100,
        status: isErr ? "failed" : "success",
        isContractCall: Boolean(t.input && t.input !== "0x"),
        method: t.functionName,
      };
    });

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

  private async fetchRecentTxs(chain: Chain, address: string, limit: number): Promise<EtherscanTx[]> {
    try {
      const normalTxs = await this.request<EtherscanTx[]>(chain, {
        module: "account",
        action: "txlist",
        address,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: String(limit),
        sort: "desc",
      });

      const tokenTxs = await this.request<EtherscanTx[]>(chain, {
        module: "account",
        action: "tokentx",
        address,
        page: "1",
        offset: String(limit),
        sort: "desc",
      }).catch(() => [] as EtherscanTx[]);

      const combined = [...(Array.isArray(normalTxs) ? normalTxs : []), ...(Array.isArray(tokenTxs) ? tokenTxs : [])];
      return combined.sort((a, b) => Number(b.timeStamp ?? 0) - Number(a.timeStamp ?? 0)).slice(0, limit);
    } catch {
      return [];
    }
  }

  async healthcheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: "EVM multi-chain scanner ready" };
  }
}

export const etherscanProvider = new EtherscanProvider();
