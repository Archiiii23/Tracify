import { CHAINS, type Chain } from "../../models/Investigation.model";
import { getChainProvider, traceWithProvider } from "../blockchain";
import { validateAddressForChain } from "../blockchain/validators";
import {
  lookupAddress,
  lookupTransaction,
  lookupTransactions,
} from "../intelligence.query.service";
import type { BudgetTracker } from "./budget";
import type { AgentContext, ToolResult } from "./types";

function asChain(value: string): Chain {
  const c = value.toLowerCase() as Chain;
  if (!(CHAINS as readonly string[]).includes(c)) {
    throw new Error(`Unsupported chain: ${value}`);
  }
  return c;
}

function dedupePaths<T extends { addresses: string[] }>(paths: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of paths) {
    const key = p.addresses.join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
  budget: BudgetTracker,
): Promise<ToolResult> {
  switch (toolName) {
    case "validate_wallet":
      return validateWallet(args, ctx);
    case "get_wallet_summary":
      return getWalletSummary(args, ctx, budget);
    case "get_transaction_history":
      return getTransactionHistory(args, ctx, budget);
    case "get_transaction_details":
      return getTransactionDetails(args, ctx, budget);
    case "trace_fund_flow":
      return traceFundFlow(args, ctx, budget);
    case "analyze_risk":
      return analyzeRisk(ctx);
    case "get_vasp_candidates":
      return getVaspCandidates(ctx);
    case "get_investigation_status":
      return getInvestigationStatus(ctx, budget);
    default:
      return {
        success: false,
        summary: `Unknown tool: ${toolName}`,
        data: { error: "UNKNOWN_TOOL" },
      };
  }
}

function validateWallet(args: Record<string, unknown>, ctx: AgentContext): ToolResult {
  const chain = asChain(String(args.chain ?? ctx.chain));
  const address = String(args.address ?? ctx.rootAddress).trim();
  const result = validateAddressForChain(chain, address);
  const data = {
    valid: result.valid,
    normalized_address: result.normalized || address.toLowerCase(),
    chain,
    address_type: result.valid ? result.format : "INVALID",
    error: result.error,
  };
  ctx.facts.validation = data;
  return {
    success: result.valid,
    summary: result.valid ? `Address valid on ${chain}` : `Invalid address: ${result.error}`,
    data,
  };
}

async function getWalletSummary(
  args: Record<string, unknown>,
  ctx: AgentContext,
  budget: BudgetTracker,
): Promise<ToolResult> {
  const chain = asChain(String(args.chain ?? ctx.chain));
  const address = String(args.address ?? ctx.rootAddress).trim().toLowerCase();
  budget.recordProviderRequest();
  const result = await lookupAddress(chain, address);
  const summary = result.address;
  const data = {
    address: summary.address,
    chain: summary.chain,
    provider: result.sourceLabel,
    first_seen: summary.firstSeen?.toISOString() ?? null,
    last_seen: summary.lastSeen?.toISOString() ?? null,
    balance_usd: summary.balanceUsd ?? null,
    incoming_count: summary.incomingTxCount ?? null,
    outgoing_count: summary.outgoingTxCount ?? null,
    known_entity_labels: summary.tags.map((t) => t.label),
    is_vasp: summary.isVasp,
    is_contract: summary.isContract ?? false,
    coverage: {
      type: "SCOPED",
      reason: "Provider summary — not necessarily complete wallet history",
      provider: result.source,
    },
  };
  ctx.facts.walletSummary = data;
  return {
    success: true,
    summary: `Wallet summary from ${result.sourceLabel}: ${summary.incomingTxCount ?? 0} in / ${summary.outgoingTxCount ?? 0} out`,
    data,
  };
}

async function getTransactionHistory(
  args: Record<string, unknown>,
  ctx: AgentContext,
  budget: BudgetTracker,
): Promise<ToolResult> {
  const chain = asChain(String(args.chain ?? ctx.chain));
  const address = String(args.address ?? ctx.rootAddress).trim().toLowerCase();
  const direction = (args.direction as "in" | "out" | "all") ?? "all";
  const limit = Math.min(Number(args.limit ?? 25), 50);
  const page = Math.max(1, Number(args.page ?? 1));
  const minValueUsd = args.min_value_usd !== undefined ? Number(args.min_value_usd) : undefined;

  budget.recordProviderRequest();
  budget.recordPage();

  const result = await lookupTransactions(chain, address, {
    direction,
    limit,
    page,
    ...(minValueUsd !== undefined ? { minValueUsd } : {}),
  });

  const total = result.total ?? result.items.length;
  const hasMore = page * limit < total;

  const records = result.items.map((tx) => ({
    tx_hash: tx.txHash,
    from: tx.from,
    to: tx.to,
    asset: tx.asset,
    amount: tx.amount,
    value_usd: tx.valueUsd,
    timestamp: tx.timestamp?.toISOString() ?? null,
    status: tx.status,
    direction: tx.to.toLowerCase() === address ? "INCOMING" : "OUTGOING",
    provider: result.source,
  }));

  const data = {
    records,
    page,
    total,
    has_more: hasMore,
    coverage: {
      retrieved: records.length,
      pagination_complete: !hasMore,
      provider: result.sourceLabel,
      note: hasMore
        ? `Partial page ${page} — use page ${page + 1} for more (${total} total in scope)`
        : `${records.length} records retrieved within scope (page ${page})`,
    },
  };

  const existing = (ctx.facts.transactions as unknown[]) ?? [];
  ctx.facts.transactions = [...existing, ...records];

  return {
    success: true,
    summary: `Retrieved ${records.length} transactions (page ${page}, has_more=${hasMore})`,
    data,
  };
}

async function getTransactionDetails(
  args: Record<string, unknown>,
  ctx: AgentContext,
  budget: BudgetTracker,
): Promise<ToolResult> {
  const chain = asChain(String(args.chain ?? ctx.chain));
  const txHash = String(args.tx_hash ?? "").trim();
  if (!txHash) {
    return { success: false, summary: "tx_hash required", data: {} };
  }
  budget.recordProviderRequest();
  const result = await lookupTransaction(chain, txHash);
  const tx = result.transaction;
  const evidenceId = `EV-${tx.txHash.slice(2, 10).toUpperCase()}`;
  const data = {
    hash: tx.txHash,
    block: tx.blockNumber,
    timestamp: tx.timestamp?.toISOString() ?? null,
    from: tx.from,
    to: tx.to,
    asset: tx.asset,
    amount: tx.amount,
    value_usd: tx.valueUsd,
    status: tx.status,
    provider: result.sourceLabel,
    evidence_id: evidenceId,
  };
  return {
    success: true,
    summary: `Transaction ${txHash.slice(0, 10)}… from ${result.sourceLabel}`,
    data,
  };
}

async function traceFundFlow(
  args: Record<string, unknown>,
  ctx: AgentContext,
  budget: BudgetTracker,
): Promise<ToolResult> {
  const chain = asChain(String(args.chain ?? ctx.chain));
  const address = String(args.address ?? ctx.rootAddress).trim().toLowerCase();
  const direction = (args.direction as "outbound" | "inbound" | "both") ?? ctx.direction;
  const maxHops = Math.min(Number(args.max_hops ?? ctx.maxHops), ctx.maxHops);

  budget.recordProviderRequest();
  const provider = getChainProvider(chain);
  const trace = await traceWithProvider(provider, {
    rootAddress: address,
    chain,
    maxHops,
    minValueUsd: 0,
    direction,
  });

  const uniquePaths = dedupePaths(trace.paths).slice(0, 10);
  const currentDepth = trace.nodes.reduce((max, n) => Math.max(max, n.hop), 0);

  const data = {
    provider: trace.source,
    data_source: trace.source === "synthetic" ? "DEMO" : "LIVE",
    graph: {
      node_count: trace.nodes.length,
      edge_count: trace.edges.length,
      max_depth_configured: maxHops,
      current_depth_observed: currentDepth,
      nodes: trace.nodes.slice(0, 40).map((n) => ({
        address: n.address,
        hop: n.hop,
        label: n.label ?? null,
        entity: n.entity ?? null,
        is_vasp: n.isVasp,
        risk_score: n.riskScore,
      })),
      edges: trace.edges.slice(0, 60).map((e) => ({
        from: e.from,
        to: e.to,
        tx_hash: e.txHash,
        asset: e.asset,
        amount: e.amount,
        value_usd: e.valueUsd,
        timestamp: e.timestamp?.toISOString?.() ?? e.timestamp,
      })),
    },
    paths: uniquePaths.map((p, i) => ({
      path_id: `PATH-${String(i + 1).padStart(3, "0")}`,
      addresses: p.addresses,
      hops: p.hops,
      value_usd: p.valueUsd,
      risk_score: p.riskScore,
      value_continuity_pct: trace.metrics.retainedValuePct,
      terminates_at_vasp: p.terminatesAtVasp,
      rationale: p.rationale,
    })),
    risk_score: trace.riskScore,
    metrics: trace.metrics,
    coverage: {
      provider: trace.source,
      bounded: true,
      max_hops: maxHops,
      max_nodes: trace.nodes.length,
    },
  };

  ctx.facts.trace = data;
  ctx.facts.riskScore = trace.riskScore;
  ctx.facts.signals = trace.signals;

  return {
    success: true,
    summary: `Trace complete: ${trace.nodes.length} nodes, ${uniquePaths.length} unique paths, risk ${trace.riskScore}/100`,
    data,
  };
}

function analyzeRisk(ctx: AgentContext): ToolResult {
  const trace = ctx.facts.trace as Record<string, unknown> | undefined;
  if (!trace) {
    return {
      success: false,
      summary: "No trace available — call trace_fund_flow first",
      data: { error: "NO_TRACE" },
    };
  }
  const signals = (ctx.facts.signals as Array<Record<string, unknown>>) ?? [];
  const data = {
    risk_score: ctx.facts.riskScore ?? 0,
    signals: signals.map((s, i) => ({
      signal_id: s.code ?? `SIG-${i + 1}`,
      pattern: s.label,
      severity: s.severity,
      description: s.explanation,
      addresses: s.addresses ?? [],
    })),
  };
  ctx.facts.riskAnalysis = data;
  return {
    success: true,
    summary: `Risk score ${data.risk_score}/100 with ${signals.length} signals`,
    data,
  };
}

function getVaspCandidates(ctx: AgentContext): ToolResult {
  const trace = ctx.facts.trace as { graph?: { nodes?: Array<{ address: string; entity?: string; label?: string; is_vasp: boolean; hop: number }> } } | undefined;
  const nodes = trace?.graph?.nodes ?? [];
  const candidates = nodes
    .filter((n) => n.is_vasp || n.entity || n.label)
    .map((n) => ({
      entity: n.entity ?? n.label ?? "Unknown",
      entity_type: n.is_vasp ? "VASP" : "CANDIDATE",
      address: n.address,
      proximity_hops: n.hop,
      basis: n.is_vasp ? ["public entity label", "provider attribution"] : ["graph proximity"],
      confidence: n.is_vasp ? 0.85 : 0.6,
      note: "Likely VASP candidate — requires investigator review before external action",
    }));

  const data = { candidates, count: candidates.length };
  ctx.facts.vaspCandidates = data;

  if (candidates.length === 0) {
    return {
      success: true,
      summary: "No VASP attribution established within current evidence scope",
      data: {
        ...data,
        conclusion:
          "No VASP attribution was established within the current evidence scope.",
      },
    };
  }

  return {
    success: true,
    summary: `${candidates.length} VASP/entity candidate(s) identified`,
    data,
  };
}

function getInvestigationStatus(ctx: AgentContext, budget: BudgetTracker): ToolResult {
  return {
    success: true,
    summary: `Tool calls: ${budget.toolCalls}, stage facts accumulated: ${Object.keys(ctx.facts).length}`,
    data: {
      tool_calls: budget.toolCalls,
      provider_requests: budget.providerRequests,
      pages: budget.pages,
      budget_exceeded: budget.isExceeded(),
      facts_keys: Object.keys(ctx.facts),
      has_trace: Boolean(ctx.facts.trace),
      has_wallet_summary: Boolean(ctx.facts.walletSummary),
    },
  };
}
