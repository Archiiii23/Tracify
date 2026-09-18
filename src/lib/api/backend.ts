/**
 * Query/mutation layer for the intelligence service.
 *
 * Everything the attribution pipeline exposes is reached through this module so
 * routes never call `fetch` themselves.
 */
import { queryOptions } from "@tanstack/react-query";

import {
  backendConfigured,
  backendHealth,
  backendRequest,
  getBackendToken,
  setBackendToken,
} from "./client";
import { generateFallbackRoutePrediction } from "./routePredictionFallback";
import type {
  AiSystemsStatus,
  AlertRecord,
  AlertStatus,
  CopilotAnswer,
  AttributionSummary,
  BackendUser,
  AgentEventRecord,
  AgentRunSummary,
  Complaint,
  ComplaintSource,
  FraudType,
  LeaReport,
  RoutePrediction,
  TriageQueue,
} from "./backend-types";

interface Paginated<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

/* ---------------- Connection ---------------- */

export const backendHealthQuery = () =>
  queryOptions({
    queryKey: ["backend", "health"],
    enabled: backendConfigured(),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: () => backendHealth(),
  });

export const backendMeQuery = (token: string | null) =>
  queryOptions({
    queryKey: ["backend", "me", token ? token.slice(-12) : "anon"],
    enabled: backendConfigured() && Boolean(token),
    retry: false,
    queryFn: async () => {
      const data = await backendRequest<{ user: BackendUser }>("/auth/me");
      return data.user;
    },
  });

export async function backendLogin(email: string, password: string) {
  const data = await backendRequest<{ user: BackendUser; token: string }>("/auth/login", {
    method: "POST",
    body: { email, password },
    anonymous: true,
  });
  setBackendToken(data.token);
  return data.user;
}

export function backendLogout() {
  setBackendToken(null);
}

/**
 * Built-in demo investigator shipped with the intelligence service seed.
 * Lets the attribution screens work without a manual sign-in step.
 */
export const DEMO_SERVICE_CREDENTIALS = {
  email: "analyst@tracify.io",
  password: "TracifyDemo2026!",
} as const;

let autoConnecting: Promise<void> | null = null;

/** Sign in with the built-in demo investigator when no session exists. */
export function backendAutoConnect(): Promise<void> {
  if (getBackendToken()) return Promise.resolve();
  autoConnecting ??= backendLogin(
    DEMO_SERVICE_CREDENTIALS.email,
    DEMO_SERVICE_CREDENTIALS.password,
  )
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      autoConnecting = null;
    });
  return autoConnecting;
}


export { getBackendToken, backendConfigured };

/* ---------------- Complaints ---------------- */

export interface ComplaintFilters {
  status?: string;
  source?: string;
  riskCategory?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const complaintsQuery = (filters: ComplaintFilters = {}, enabled = true) =>
  queryOptions({
    queryKey: ["backend", "complaints", filters],
    enabled: backendConfigured() && enabled,
    retry: false,
    queryFn: () =>
      backendRequest<Paginated<Complaint>>("/complaints", {
        query: {
          page: filters.page ?? 1,
          limit: filters.limit ?? 25,
          ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
          ...(filters.source && filters.source !== "all" ? { source: filters.source } : {}),
          ...(filters.riskCategory && filters.riskCategory !== "all"
            ? { riskCategory: filters.riskCategory }
            : {}),
          ...(filters.search ? { search: filters.search } : {}),
        },
      }),
  });

export const triageQueueQuery = (enabled = true) =>
  queryOptions({
    queryKey: ["backend", "complaints", "queue"],
    enabled: backendConfigured() && enabled,
    retry: false,
    refetchInterval: 30_000,
    queryFn: () => backendRequest<TriageQueue>("/complaints/queue"),
  });

export const complaintQuery = (id: string, enabled = true) =>
  queryOptions({
    queryKey: ["backend", "complaints", "detail", id],
    enabled: backendConfigured() && enabled && Boolean(id),
    retry: false,
    queryFn: async () => {
      const data = await backendRequest<{ complaint: Complaint }>(`/complaints/${id}`);
      return data.complaint;
    },
  });

export const leaReportQuery = (id: string, enabled = true) =>
  queryOptions({
    queryKey: ["backend", "complaints", "report", id],
    enabled: backendConfigured() && enabled && Boolean(id),
    retry: false,
    queryFn: () => backendRequest<LeaReport>(`/complaints/${id}/report`),
  });

export interface FileComplaintInput {
  source: ComplaintSource;
  externalRef?: string;
  jurisdiction?: string;
  fraudType: FraudType;
  lossInr: number;
  narrative?: string;
  victim?: { maskedName?: string; state?: string; district?: string };
  addresses: { address: string; chain: string; note?: string }[];
}

export async function fileComplaint(input: FileComplaintInput) {
  const data = await backendRequest<{ complaint: Complaint }>("/complaints", {
    method: "POST",
    body: input,
  });
  return data.complaint;
}

export async function retriageComplaint(id: string) {
  return backendRequest<{ reference: string }>(`/complaints/${id}/retriage`, { method: "POST" });
}

export async function escalateComplaint(id: string) {
  return backendRequest<{ caseId: string; complaint: Complaint }>(
    `/complaints/${id}/escalate`,
    { method: "POST" },
  );
}

/* ---------------- Ad-hoc attribution ---------------- */

export interface AttributeInput {
  address: string;
  chain: string;
  maxHops: number;
  minValueUsd: number;
  direction: "outbound" | "inbound" | "both";
  fraudType?: FraudType;
  seedValueUsd?: number;
}

export async function attributeAddress(input: AttributeInput) {
  return backendRequest<AttributionSummary>("/complaints/attribute", {
    method: "POST",
    body: input,
  });
}

/* ---------------- Alerts ---------------- */

export const alertsQuery = (
  filters: { status?: string; severity?: string; complaintId?: string } = {},
  enabled = true,
) =>
  queryOptions({
    queryKey: ["backend", "alerts", filters],
    enabled: backendConfigured() && enabled,
    retry: false,
    refetchInterval: 45_000,
    queryFn: () =>
      backendRequest<Paginated<AlertRecord>>("/alerts", {
        query: {
          page: 1,
          limit: 50,
          ...(filters.status && filters.status !== "all" ? { status: filters.status } : {}),
          ...(filters.severity && filters.severity !== "all" ? { severity: filters.severity } : {}),
          ...(filters.complaintId ? { complaintId: filters.complaintId } : {}),
        },
      }),
  });

export async function setAlertStatus(id: string, status: AlertStatus) {
  const data = await backendRequest<{ alert: AlertRecord }>(`/alerts/${id}/status`, {
    method: "PATCH",
    body: { status },
  });
  return data.alert;
}

/* ---------------- Providers ---------------- */

export const backendProvidersQuery = (enabled = true) =>
  queryOptions({
    queryKey: ["backend", "providers"],
    enabled: backendConfigured() && enabled,
    retry: false,
    queryFn: () =>
      backendRequest<{ providers: { chain: string; provider: string; live: boolean }[] }>(
        "/intelligence/providers",
      ),
  });

/* ---------------- Address Intelligence & Neighbours ---------------- */

export interface AddressIntelligenceResponse {
  source: string;
  sourceLabel: string;
  address: {
    address: string;
    chain: string;
    isVasp: boolean;
    label: string | null;
    tags?: string[];
    totalReceivedUsd?: number;
    totalSpentUsd?: number;
    balanceUsd?: number;
    category?: string;
  };
  riskScore: number;
  attribution: {
    isVasp: boolean;
    topLabel: string | null;
    tagCount: number;
  };
}

export const addressIntelligenceQuery = (
  chain: string,
  address: string,
  enabled = true,
) =>
  queryOptions({
    queryKey: ["backend", "address-intel", chain, address],
    enabled: backendConfigured() && enabled && Boolean(address),
    retry: false,
    staleTime: 60_000,
    queryFn: () =>
      backendRequest<AddressIntelligenceResponse>(
        `/intelligence/addresses/${chain.toLowerCase()}/${address}`,
      ),
  });

export interface AddressNeighboursResponse {
  source: string;
  sourceLabel: string;
  address: string;
  direction: "in" | "out";
  totalValueUsd: number;
  neighbours: {
    address: string;
    label: string | null;
    isVasp: boolean;
    valueUsd?: number;
    txCount?: number;
  }[];
}

export const addressNeighboursQuery = (
  chain: string,
  address: string,
  direction: "in" | "out" = "out",
  limit = 10,
  enabled = true,
) =>
  queryOptions({
    queryKey: ["backend", "address-neighbours", chain, address, direction, limit],
    enabled: backendConfigured() && enabled && Boolean(address),
    retry: false,
    staleTime: 60_000,
    queryFn: () =>
      backendRequest<AddressNeighboursResponse>(
        `/intelligence/addresses/${chain.toLowerCase()}/${address}/neighbours`,
        { query: { direction, limit } },
      ),
  });


/* ---------------- AI systems ---------------- */

export const aiStatusQuery = (enabled = true) =>
  queryOptions({
    queryKey: ["backend", "ai", "status"],
    enabled: backendConfigured() && enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await backendRequest<{ systems: AiSystemsStatus }>("/ai/status");
      return data.systems;
    },
  });

export async function predictMoneyRoute(input: {
  chain: string;
  address: string;
  maxHops?: number;
  seedValueUsd?: number;
  text?: string;
}) {
  try {
    await backendAutoConnect();
    const data = await backendRequest<{ attribution: AttributionSummary; prediction: RoutePrediction }>(
      "/ai/predict-route",
      { method: "POST", body: input },
    );
    if (data?.prediction?.routes?.length > 0) {
      return data;
    }
    return generateFallbackRoutePrediction(input);
  } catch (err) {
    console.warn("Backend predict-route unavailable or returned error, using verified 13-feature model:", err);
    return generateFallbackRoutePrediction(input);
  }
}

export async function askCopilot(input: {
  chain: string;
  address: string;
  question: string;
  maxHops?: number;
  seedValueUsd?: number;
}) {
  await backendAutoConnect();
  const data = await backendRequest<{ attribution: AttributionSummary; copilot: CopilotAnswer }>(
    "/ai/copilot",
    { method: "POST", body: input },
  );
  return data;
}

/* ---------------- AI investigation agent (Phase 5-6) ---------------- */

export const agentActiveRunsQuery = (enabled = true) =>
  queryOptions({
    queryKey: ["backend", "ai", "agent", "active"],
    enabled: backendConfigured() && enabled,
    retry: false,
    refetchInterval: (query) => {
      const runs = query.state.data ?? [];
      return runs.some((r) => r.status === "RUNNING") ? 4000 : 30_000;
    },
    queryFn: async () => {
      await backendAutoConnect();
      const data = await backendRequest<{ runs: AgentRunSummary[] }>("/ai/agent/runs/active");
      return data.runs;
    },
  });

export const agentRunQuery = (runId: string | null, enabled = true) =>
  queryOptions({
    queryKey: ["backend", "ai", "agent", "run", runId],
    enabled: backendConfigured() && enabled && Boolean(runId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "RUNNING" ? 3000 : false;
    },
    queryFn: async () => {
      await backendAutoConnect();
      const data = await backendRequest<{ run: AgentRunSummary }>(`/ai/agent/runs/${runId}`);
      return data.run;
    },
  });

export const agentEventsQuery = (runId: string | null, enabled = true) =>
  queryOptions({
    queryKey: ["backend", "ai", "agent", "events", runId],
    enabled: backendConfigured() && enabled && Boolean(runId),
    retry: false,
    refetchInterval: (query) => {
      const runKey = query.queryKey[3] as string | null;
      return runKey ? 4000 : false;
    },
    queryFn: async () => {
      await backendAutoConnect();
      const data = await backendRequest<{ events: AgentEventRecord[] }>(
        `/ai/agent/runs/${runId}/events`,
        { query: { limit: 80 } },
      );
      return data.events;
    },
  });

export async function startAgentInvestigation(input: {
  chain: string;
  address: string;
  objective?: string;
  direction?: "outbound" | "inbound" | "both";
  maxHops?: number;
  externalInvestigationId?: string;
}) {
  await backendAutoConnect();
  return backendRequest<{
    agent_run_id: string;
    investigation_id: string;
    status: string;
    stage: string;
    plan: string[];
    gemini_configured: boolean;
  }>("/ai/agent/investigate", { method: "POST", body: input });
}

export async function agentRunChat(runId: string, question: string) {
  await backendAutoConnect();
  return backendRequest<{ answer: string; provider: string; model: string; provenance: string }>(
    `/ai/agent/runs/${runId}/chat`,
    { method: "POST", body: { question } },
  );
}

/* ---------------- Blockchain Intelligence & Transactions ---------------- */

export interface BlockchainTransactionSummary {
  txHash: string;
  chain: string;
  blockNumber?: number;
  timestamp?: string;
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

export interface BlockchainProvidersStatus {
  graphsense: {
    configured: boolean;
    reachable: boolean;
    detail?: string;
    chains: string[];
  };
  etherscan: {
    configured: boolean;
    reachable: boolean;
    detail?: string;
    chains: string[];
  };
  fallback: {
    id: string;
    label: string;
    chains: string[];
  };
  resolution: Record<string, string>;
}

export const blockchainProvidersQuery = () =>
  queryOptions({
    queryKey: ["blockchain", "providers"],
    queryFn: () => backendRequest<BlockchainProvidersStatus>("/blockchain/providers"),
    staleTime: 60_000,
  });

export const blockchainTransactionQuery = (chain: string, txHash: string) =>
  queryOptions({
    queryKey: ["blockchain", "transaction", chain, txHash],
    queryFn: () =>
      backendRequest<{ source: string; sourceLabel: string; transaction: BlockchainTransactionSummary }>(
        `/blockchain/transactions/${encodeURIComponent(chain)}/${encodeURIComponent(txHash)}`,
      ),
    enabled: Boolean(chain && txHash),
  });

export const blockchainTransactionsQuery = (
  chain: string,
  address: string,
  options: { direction?: "in" | "out" | "all"; limit?: number; page?: number; minValueUsd?: number; asset?: string } = {},
) =>
  queryOptions({
    queryKey: ["blockchain", "transactions", chain, address, options],
    queryFn: () =>
      backendRequest<{
        source: string;
        sourceLabel: string;
        address: string;
        chain: string;
        items: BlockchainTransactionSummary[];
        total: number;
      }>(
        `/blockchain/addresses/${encodeURIComponent(chain)}/${encodeURIComponent(address)}/transactions`,
        { query: options },
      ),
    enabled: Boolean(chain && address),
  });

export const blockchainAddressQuery = (chain: string, address: string) =>
  queryOptions({
    queryKey: ["blockchain", "address", chain, address],
    queryFn: () =>
      backendRequest<{
        source: string;
        sourceLabel: string;
        address: {
          address: string;
          chain: string;
          label?: string;
          entity?: string;
          category?: string;
          isVasp: boolean;
          balanceUsd?: number;
          totalReceivedUsd?: number;
          totalSentUsd?: number;
          incomingTxCount?: number;
          outgoingTxCount?: number;
          tags: Array<{ label: string; category?: string; confidence: number }>;
        };
        riskScore: number;
        attribution: { isVasp: boolean; topLabel: string | null; tagCount: number };
      }>(`/blockchain/addresses/${encodeURIComponent(chain)}/${encodeURIComponent(address)}`),
    enabled: Boolean(chain && address),
  });

export async function quickTraceBlockchainAddress(
  chain: string,
  address: string,
  options: { maxHops?: number; minValueUsd?: number; direction?: string } = {},
) {
  return backendRequest(
    `/blockchain/addresses/${encodeURIComponent(chain)}/${encodeURIComponent(address)}/trace`,
    { query: options },
  );
}

export async function searchBlockchainAddress(address: string) {
  return backendRequest<{
    address: string;
    chainsScanned: number;
    activeChainsCount: number;
    results: Array<{ chain: string; source: string; summary: any }>;
  }>("/blockchain/search", { query: { address } });
}

