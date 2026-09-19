import { Types } from "mongoose";
import { AiAgentEvent } from "../../models/AiAgentEvent.model";
import { AiAgentRun } from "../../models/AiAgentRun.model";
import type { Chain } from "../../models/Investigation.model";
import { validateAddressForChain } from "../blockchain/validators";
import { BudgetTracker } from "./budget";
import { runGeminiInvestigationLoop } from "./geminiOrchestrator";
import type { AgentChatInput, AgentContext, AgentInvestigateInput } from "./types";
import { env } from "../../config/env";
import { askCopilot } from "../llm";

const INVESTIGATION_PLAN = [
  "Validate target wallet",
  "Retrieve wallet summary",
  "Fetch transaction history",
  "Trace fund flow (bounded graph)",
  "Analyze risk signals",
  "Check entity / VASP intelligence",
  "Produce AI assessment for review",
];

export async function startAgentInvestigation(
  userId: string,
  input: AgentInvestigateInput,
) {
  const chain = input.chain as Chain;
  const validation = validateAddressForChain(chain, input.address);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Invalid wallet address");
  }

  const run = await AiAgentRun.create({
    externalInvestigationId: input.externalInvestigationId,
    mongoInvestigationId: input.mongoInvestigationId
      ? new Types.ObjectId(input.mongoInvestigationId)
      : undefined,
    startedBy: new Types.ObjectId(userId),
    chain,
    rootAddress: validation.normalized,
    objective: input.objective ?? "Investigate suspicious fund movement",
    direction: input.direction ?? "outbound",
    maxHops: Math.min(input.maxHops ?? 3, env.MAX_AGENT_HOPS),
    status: "RUNNING",
    stage: "VALIDATING",
    investigationPlan: INVESTIGATION_PLAN,
    agentModel: env.GEMINI_MODEL,
  });

  void executeAgentRun(String(run._id)).catch(() => undefined);

  return {
    agent_run_id: String(run._id),
    investigation_id: input.externalInvestigationId ?? String(run._id),
    status: "RUNNING",
    stage: "VALIDATING",
    plan: INVESTIGATION_PLAN,
    gemini_configured: env.hasGeminiAgent,
  };
}

async function executeAgentRun(runId: string): Promise<void> {
  const run = await AiAgentRun.findById(runId);
  if (!run) return;

  const budget = new BudgetTracker();
  const ctx: AgentContext = {
    runId: run._id,
    externalInvestigationId: run.externalInvestigationId,
    chain: run.chain,
    rootAddress: run.rootAddress,
    direction: run.direction,
    maxHops: run.maxHops,
    userId: run.startedBy,
    facts: {},
    onToolEvent: async (event) => {
      run.toolCalls += 1;
      await logEvent(run, {
        eventType: "TOOL_CALL",
        toolName: event.toolName,
        arguments: event.arguments,
        resultSummary: event.resultSummary,
        success: event.success,
        latencyMs: event.latencyMs,
      });
      await run.save();
    },
  };

  try {
    await setStage(run, "FETCHING_HISTORY");
    const result = await runGeminiInvestigationLoop(ctx, budget, run.objective);

    run.assessment = result.assessment;
    run.structuredContext = ctx.facts;
    run.toolCalls = result.toolCalls;
    run.status = budget.isExceeded() ? "BUDGET_EXCEEDED" : "AWAITING_REVIEW";
    run.stage = "COMPLETED";
    run.completedAt = new Date();

    await logEvent(run, {
      eventType: "ASSESSMENT",
      resultSummary: result.assessment.slice(0, 500),
      success: true,
    });

    await run.save();
  } catch (err) {
    run.status = "FAILED";
    run.stage = "FAILED";
    run.error = err instanceof Error ? err.message : String(err);
    await logEvent(run, {
      eventType: "ERROR",
      resultSummary: run.error,
      success: false,
    });
    await run.save();
  }
}

async function setStage(
  run: InstanceType<typeof AiAgentRun>,
  stage: InstanceType<typeof AiAgentRun>["stage"],
) {
  run.stage = stage;
  await logEvent(run, { eventType: "STAGE", stage, success: true });
  await run.save();
}

async function logEvent(
  run: InstanceType<typeof AiAgentRun>,
  event: {
    eventType: InstanceType<typeof AiAgentEvent>["eventType"];
    toolName?: string;
    arguments?: Record<string, unknown>;
    resultSummary?: string;
    success: boolean;
    latencyMs?: number;
    stage?: string;
  },
) {
  await AiAgentEvent.create({
    runId: run._id,
    externalInvestigationId: run.externalInvestigationId,
    agentModel: run.agentModel,
    eventType: event.eventType,
    toolName: event.toolName,
    arguments: event.arguments,
    resultSummary: event.resultSummary,
    success: event.success,
    latencyMs: event.latencyMs,
    stage: event.stage,
  });
}

export async function getAgentRun(runId: string) {
  const run = await AiAgentRun.findById(runId).lean();
  if (!run) return null;
  return {
    id: String(run._id),
    status: run.status,
    stage: run.stage,
    chain: run.chain,
    rootAddress: run.rootAddress,
    objective: run.objective,
    toolCalls: run.toolCalls,
    assessment: run.assessment,
    plan: run.investigationPlan,
    structuredContext: run.structuredContext,
    error: run.error,
    geminiConfigured: env.hasGeminiAgent,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
  };
}

export async function getAgentEvents(runId: string, limit = 50) {
  const events = await AiAgentEvent.find({ runId: new Types.ObjectId(runId) })
    .sort({ timestamp: 1 })
    .limit(limit)
    .lean();

  return events.map((e) => ({
    id: String(e._id),
    timestamp: e.timestamp,
    eventType: e.eventType,
    toolName: e.toolName,
    resultSummary: e.resultSummary,
    success: e.success,
    latencyMs: e.latencyMs,
    stage: e.stage,
  }));
}

export async function agentChat(userId: string, input: AgentChatInput) {
  const run = await AiAgentRun.findById(input.runId);
  if (!run) throw new Error("Agent run not found");
  if (String(run.startedBy) !== userId) throw new Error("Unauthorized");

  const facts: string[] = [];
  const ctx = run.structuredContext as Record<string, unknown> | undefined;
  if (ctx?.walletSummary) {
    facts.push(`Wallet summary: ${JSON.stringify(ctx.walletSummary)}`);
  }
  if (ctx?.trace) {
    const trace = ctx.trace as Record<string, unknown>;
    facts.push(`Risk score: ${trace.risk_score}/100`);
    facts.push(`Graph nodes: ${(trace.graph as Record<string, number>)?.node_count ?? 0}`);
    facts.push(`Paths: ${((trace.paths as unknown[]) ?? []).length} unique`);
  }
  if (ctx?.vaspCandidates) {
    facts.push(`VASP candidates: ${JSON.stringify(ctx.vaspCandidates)}`);
  }
  if (run.assessment) {
    facts.push(`Prior assessment excerpt: ${run.assessment.slice(0, 800)}`);
  }

  const response = await askCopilot(input.question, { facts });

  await AiAgentEvent.create({
    runId: run._id,
    externalInvestigationId: run.externalInvestigationId,
    agentModel: response.model,
    eventType: "ASSESSMENT",
    resultSummary: input.question.slice(0, 200),
    success: true,
  });

  return {
    answer: response.answer,
    provider: response.provider,
    model: response.model,
    provenance: response.external ? "AI-ASSISTED" : "DERIVED",
  };
}

export async function listActiveAgentRuns(userId: string) {
  const runs = await AiAgentRun.find({
    startedBy: new Types.ObjectId(userId),
    status: { $in: ["RUNNING", "AWAITING_REVIEW"] },
  })
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();

  return runs.map((r) => ({
    id: String(r._id),
    status: r.status,
    stage: r.stage,
    rootAddress: r.rootAddress,
    chain: r.chain,
    externalInvestigationId: r.externalInvestigationId,
    updatedAt: r.updatedAt,
  }));
}
