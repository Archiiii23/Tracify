/**
 * Chain-data provider contract.
 *
 * The intelligence engine never talks to a chain directly: it consumes this
 * narrow interface. That keeps the engine pure and deterministic while letting
 * the data source be GraphSense in production, the synthetic generator in
 * development/tests, or another vendor later — without touching the HTTP layer.
 */
import type { Chain } from "../../models/Investigation.model";

/** An attribution tag attached to an address or entity. */
export interface AddressTag {
  label: string;
  /** Provider taxonomy, e.g. `exchange`, `mixer`, `defi`. */
  category?: string;
  /** Named actor/service the tag resolves to, when the provider supplies one. */
  actor?: string;
  /** 0–1. Providers report 0–100; adapters normalise. */
  confidence: number;
  source?: string;
}

/** Provider-agnostic address summary. */
export interface AddressSummary {
  address: string;
  chain: Chain;
  /** Best human-readable name, from tags or entity attribution. */
  label?: string;
  entity?: string;
  category?: string;
  /** True when the address belongs to a custodial/regulated service. */
  isVasp: boolean;
  isContract?: boolean;
  balanceUsd?: number;
  totalReceivedUsd?: number;
  totalSentUsd?: number;
  incomingTxCount?: number;
  outgoingTxCount?: number;
  inDegree?: number;
  outDegree?: number;
  firstSeen?: Date;
  lastSeen?: Date;
  tags: AddressTag[];
}

/** One counterparty of an address, aggregated over all transfers between them. */
export interface AddressNeighbour {
  address: string;
  chain: Chain;
  label?: string;
  entity?: string;
  category?: string;
  isVasp: boolean;
  /** Aggregate fiat value moved between the pair, in USD. */
  valueUsd: number;
  /** Native/token amount when the provider exposes it. */
  amount?: number;
  asset?: string;
  txCount: number;
  /** Representative transfer hash, when the provider exposes one. */
  txHash?: string;
  timestamp?: Date;
  tags: AddressTag[];
}

export type NeighbourDirection = "in" | "out";

export interface NeighbourQuery {
  chain: Chain;
  address: string;
  direction: NeighbourDirection;
  /** Upper bound on counterparties returned per address. */
  limit: number;
  /** Ignore counterparties below this USD value. */
  minValueUsd?: number;
}

/** Transaction record across chains */
export interface TransactionSummary {
  txHash: string;
  chain: Chain;
  blockNumber?: number;
  timestamp?: Date;
  from: string;
  to: string;
  asset: string;
  amount: number;
  valueUsd?: number;
  fee?: number;
  feeUsd?: number;
  status: "success" | "failed" | "pending";
  confirmations?: number;
  isContractCall?: boolean;
  method?: string;
}

export interface TransactionQuery {
  chain: Chain;
  address: string;
  direction?: NeighbourDirection | "all";
  limit?: number;
  page?: number;
  minValueUsd?: number;
  asset?: string;
}

export interface ChainProvider {
  /** Stable identifier surfaced to the client, e.g. `graphsense`. */
  readonly id: "graphsense" | "synthetic" | "etherscan";
  readonly label: string;
  /** Whether this provider can serve the given chain. */
  supports(chain: Chain): boolean;
  getAddress(chain: Chain, address: string): Promise<AddressSummary>;
  getNeighbours(query: NeighbourQuery): Promise<AddressNeighbour[]>;
  getTags(chain: Chain, address: string): Promise<AddressTag[]>;
  getTransaction(chain: Chain, txHash: string): Promise<TransactionSummary>;
  getTransactions(query: TransactionQuery): Promise<{ items: TransactionSummary[]; total: number }>;
  /** Cheap reachability probe used by the provider status endpoint. */
  healthcheck(): Promise<{ ok: boolean; detail?: string }>;
}

/** Provider categories that mean "custodial or regulated service". */
export const SERVICE_CATEGORIES = new Set([
  "exchange",
  "vasp",
  "custodial_wallet",
  "custodial wallet",
  "hosted_wallet",
  "payment_processor",
  "payment processor",
  "merchant_services",
  "otc_desk",
  "otc desk",
  "broker",
  "atm",
  "gambling",
]);

/** Provider categories that indicate deliberate obfuscation. */
export const OBFUSCATION_CATEGORIES = new Set([
  "mixer",
  "mixing_service",
  "mixing service",
  "tumbler",
  "coinjoin",
  "privacy_wallet",
]);

/** Highest-risk categories: sanctions, theft and darknet attribution. */
export const ILLICIT_CATEGORIES = new Set([
  "sanctions",
  "sanctioned_entity",
  "darknet_market",
  "darknet market",
  "ransomware",
  "scam",
  "stolen_funds",
  "theft",
  "terrorism_financing",
]);

/**
 * Category-driven baseline risk. Attribution is the strongest risk signal a
 * chain-data provider gives us, so it dominates the node's starting score;
 * the intelligence engine layers structural and behavioural risk on top.
 */
export function baselineRisk(category: string | undefined, hop: number): number {
  const key = (category ?? "").toLowerCase();
  let base = 34;
  if (ILLICIT_CATEGORIES.has(key)) base = 92;
  else if (OBFUSCATION_CATEGORIES.has(key)) base = 78;
  else if (key === "defi" || key === "bridge" || key === "dex") base = 52;
  else if (SERVICE_CATEGORIES.has(key)) base = 45;
  return Math.max(0, Math.min(99, Math.round(base + hop * 3)));
}

export function isServiceCategory(category: string | undefined): boolean {
  return SERVICE_CATEGORIES.has((category ?? "").toLowerCase());
}
