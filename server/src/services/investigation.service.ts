import { Types } from "mongoose";
import { nextSequentialId } from "../models/Counter.model";
import {
  Investigation,
  type Chain,
  type InvestigationDoc,
  type PipelineStage,
  type StoredTransaction,
} from "../models/Investigation.model";
import type { AuthenticatedUser } from "../types/express";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import { assertCaseAccess, asObjectId, caseScopeFilter } from "./access.service";
import { Case } from "../models/Case.model";
import { detectSignals, rankPaths, runTrace, type TraceRequest } from "./intelligence.service";
import { getChainProvider, syntheticProvider, traceWithProvider } from "./blockchain";
import { assertValidAddress } from "./blockchain/validators";
import type { TransactionSummary } from "./blockchain/types";

export interface StartTraceInput {
  caseId: string;
  title: string;
  rootAddress: string;
  chain: Chain;
  direction?: "outbound" | "inbound" | "both";
  maxHops?: number;
  minValueUsd?: number;
  seedValueUsd?: number;
}

const STAGE_PROGRESS: Record<PipelineStage, number> = {
  QUEUED: 0,
  VALIDATING: 5,
  CONNECTING_TO_CHAIN: 12,
  FETCHING_HISTORY: 35,
  NORMALIZING_DATA: 50,
  BUILDING_GRAPH: 65,
  ANALYZING_PATTERNS: 80,
  ATTRIBUTING_ENTITIES: 90,
  GENERATING_FINDINGS: 96,
  COMPLETED: 100,
  FAILED: 0,
};

function toStoredTransactions(
  items: TransactionSummary[],
  rootAddress: string,
  providerId: string,
): StoredTransaction[] {
  const root = rootAddress.toLowerCase();
  return items.map((tx) => ({
    txHash: tx.txHash,
    chain: tx.chain,
    ...(tx.blockNumber !== undefined ? { blockNumber: tx.blockNumber } : {}),
    ...(tx.timestamp !== undefined ? { timestamp: tx.timestamp } : {}),
    from: tx.from,
    to: tx.to,
    asset: tx.asset,
    amount: tx.amount,
    ...(tx.valueUsd !== undefined ? { valueUsd: tx.valueUsd } : {}),
    direction:
      tx.to.toLowerCase() === root ? "in" : tx.from.toLowerCase() === root ? "out" : undefined,
    status: tx.status,
    provider: providerId,
  }));
}

async function setPipelineStage(
  investigation: InvestigationDoc,
  stage: PipelineStage,
  note: string,
): Promise<void> {
  investigation.pipelineStage = stage;
  investigation.progress = STAGE_PROGRESS[stage];
  investigation.progressNote = note;
  if (stage === "FETCHING_HISTORY") investigation.status = "tracing";
  if (stage === "ANALYZING_PATTERNS") investigation.status = "analysing";
  if (stage === "COMPLETED") {
    investigation.status = "complete";
    investigation.completedAt = new Date();
  }
  if (stage === "FAILED") investigation.status = "failed";
  await investigation.save();
}

/** Investigations are only visible through cases the user can access. */
async function accessibleCaseIds(user: AuthenticatedUser): Promise<Types.ObjectId[] | null> {
  if (user.role === "admin") return null;
  const cases = await Case.find(caseScopeFilter(user)).select("_id").lean();
  return cases.map((c) => c._id as Types.ObjectId);
}

export async function listInvestigations(
  user: AuthenticatedUser,
  options: { page: number; limit: number; sort: string; order: "asc" | "desc"; status?: string; caseId?: string },
) {
  const filter: Record<string, unknown> = {};
  const ids = await accessibleCaseIds(user);
  if (ids) filter['case'] = { $in: ids };
  if (options.caseId) {
    await assertCaseAccess(options.caseId, user);
    filter['case'] = asObjectId(options.caseId);
  }
  if (options.status) filter['status'] = options.status;

  const [items, total] = await Promise.all([
    Investigation.find(filter)
      .select("-graph")
      .sort({ [options.sort]: options.order === "asc" ? 1 : -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate("case", "reference title")
      .lean(),
    Investigation.countDocuments(filter),
  ]);

  return { items, total };
}

export async function getInvestigation(id: string, user: AuthenticatedUser): Promise<InvestigationDoc> {
  const found = await Investigation.findById(asObjectId(id));
  if (!found) throw ApiError.notFound("Investigation not found");
  await assertCaseAccess(found.case, user);
  return found;
}

export async function getInvestigationStatus(id: string, user: AuthenticatedUser) {
  const investigation = await getInvestigation(id, user);
  return {
    case_id: String(investigation.case),
    investigation_id: String(investigation._id),
    reference: investigation.reference,
    stage: investigation.pipelineStage ?? "QUEUED",
    progress: investigation.progress,
    message: investigation.progressNote ?? "",
    status: investigation.status,
    dataSource: investigation.dataSource,
    transactionCount: investigation.normalizedTransactions?.length ?? 0,
    graphNodes: investigation.graph?.nodes?.length ?? 0,
    graphEdges: investigation.graph?.edges?.length ?? 0,
    completedAt: investigation.completedAt ?? null,
    failureReason: investigation.failureReason ?? null,
  };
}

/**
 * Create the investigation immediately in `queued` state and run the trace
 * asynchronously, so the API stays responsive and the client can poll progress.
 */
export async function startInvestigation(user: AuthenticatedUser, input: StartTraceInput) {
  const parent = await assertCaseAccess(input.caseId, user);
  const normalizedAddress = assertValidAddress(input.chain, input.rootAddress);
  const reference = await nextSequentialId("INV");

  const investigation = await Investigation.create({
    reference,
    case: parent._id,
    title: input.title,
    rootAddress: normalizedAddress,
    chain: input.chain,
    direction: input.direction ?? "outbound",
    maxHops: input.maxHops ?? 5,
    minValueUsd: input.minValueUsd ?? 0,
    status: "queued",
    pipelineStage: "QUEUED",
    startedBy: new Types.ObjectId(user.id),
  });

  void executeTrace(String(investigation._id), input.seedValueUsd);

  return investigation;
}

/**
 * Run the intelligence pipeline and persist the resulting graph.
 *
 * Live providers (GraphSense, Etherscan) are used whenever configured.
 * A live-provider failure degrades to the synthetic trace rather than failing
 * the investigation, and the record states which source was used.
 */
export async function executeTrace(investigationId: string, seedValueUsd?: number): Promise<void> {
  try {
    const investigation = await Investigation.findById(investigationId);
    if (!investigation) return;

    await setPipelineStage(investigation, "VALIDATING", "Validating wallet address format");
    assertValidAddress(investigation.chain, investigation.rootAddress);

    const provider = getChainProvider(investigation.chain);
    await setPipelineStage(
      investigation,
      "CONNECTING_TO_CHAIN",
      `Connecting to ${provider.label}`,
    );

    investigation.dataSource = provider.id;
    await investigation.save();

    const request: TraceRequest = {
      rootAddress: investigation.rootAddress,
      chain: investigation.chain,
      maxHops: investigation.maxHops,
      minValueUsd: investigation.minValueUsd,
      direction: investigation.direction,
      ...(seedValueUsd !== undefined ? { seedValueUsd } : {}),
    };

    let result: Awaited<ReturnType<typeof traceWithProvider>> | ReturnType<typeof runTrace> & {
      source: "graphsense" | "synthetic" | "etherscan";
    };
    let usedLive = false;

    if (provider.id !== "synthetic") {
      try {
        await setPipelineStage(
          investigation,
          "FETCHING_HISTORY",
          `Fetching paginated transaction history via ${provider.label}`,
        );

        const txResult = await provider.getTransactions({
          chain: investigation.chain,
          address: investigation.rootAddress,
          limit: 100,
          page: 1,
          direction: "all",
        });

        await setPipelineStage(
          investigation,
          "NORMALIZING_DATA",
          `Normalizing ${txResult.items.length} on-chain records`,
        );

        investigation.normalizedTransactions = toStoredTransactions(
          txResult.items,
          investigation.rootAddress,
          provider.id,
        );
        await investigation.save();

        await setPipelineStage(
          investigation,
          "BUILDING_GRAPH",
          `Expanding bounded graph (${investigation.maxHops} hops)`,
        );

        result = await traceWithProvider(provider, request);
        usedLive = true;
      } catch (error) {
        logger.warn("live provider trace failed — falling back to synthetic", {
          investigationId,
          provider: provider.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        result = { ...runTrace(request), source: syntheticProvider.id };
      }
    } else {
      result = { ...runTrace(request), source: syntheticProvider.id };
    }

    await setPipelineStage(
      investigation,
      "ANALYZING_PATTERNS",
      "Ranking value-continuity paths and behavioural signals",
    );

    investigation.graph = { nodes: result.nodes, edges: result.edges };
    investigation.metrics = result.metrics;
    investigation.riskScore = result.riskScore;
    investigation.dataSource = result.source;

    await setPipelineStage(
      investigation,
      "ATTRIBUTING_ENTITIES",
      "Checking known VASP and service labels",
    );

    await setPipelineStage(
      investigation,
      "GENERATING_FINDINGS",
      "Preparing evidence-backed investigation summary",
    );

    investigation.progressNote = usedLive
      ? `Graph sourced from ${provider.label} (live on-chain data)`
      : "Graph sourced from the deterministic synthetic ledger (demo / fallback)";

    await setPipelineStage(investigation, "COMPLETED", investigation.progressNote);
  } catch (error) {
    logger.error("trace execution failed", {
      investigationId,
      reason: error instanceof Error ? error.message : String(error),
    });
    await Investigation.findByIdAndUpdate(investigationId, {
      status: "failed",
      pipelineStage: "FAILED",
      failureReason:
        error instanceof ApiError
          ? error.message
          : "The trace could not be completed",
    });
  }
}

/** Ranked paths + behavioural signals, derived on read from the stored graph. */
export async function analyseInvestigation(id: string, user: AuthenticatedUser) {
  const investigation = await getInvestigation(id, user);
  const nodes = investigation.graph.nodes;
  const edges = investigation.graph.edges.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));

  if (nodes.length === 0) {
    return {
      paths: [],
      signals: [],
      riskScore: investigation.riskScore,
      metrics: investigation.metrics,
      dataSource: investigation.dataSource,
      transactions: investigation.normalizedTransactions ?? [],
    };
  }

  return {
    paths: rankPaths(nodes, edges, investigation.rootAddress),
    signals: detectSignals(nodes, edges),
    riskScore: investigation.riskScore,
    metrics: investigation.metrics,
    dataSource: investigation.dataSource,
    transactions: investigation.normalizedTransactions ?? [],
  };
}

export async function deleteInvestigation(id: string, user: AuthenticatedUser) {
  const investigation = await getInvestigation(id, user);
  await investigation.deleteOne();
}
