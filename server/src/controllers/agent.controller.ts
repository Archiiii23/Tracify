import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import {
  agentChat,
  getAgentEvents,
  getAgentRun,
  listActiveAgentRuns,
  startAgentInvestigation,
} from "../services/agent/investigationAgent.service";

export const investigate = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { chain, address, objective, direction, maxHops, externalInvestigationId, mongoInvestigationId } =
    req.body as Parameters<typeof startAgentInvestigation>[1];

  try {
    const result = await startAgentInvestigation(userId, {
      chain,
      address,
      objective,
      direction,
      maxHops,
      externalInvestigationId,
      mongoInvestigationId,
    });
    sendSuccess(res, "Agent investigation started", result, 202);
  } catch (err) {
    throw ApiError.badRequest(err instanceof Error ? err.message : "Unable to start agent run");
  }
});

export const runStatus = asyncHandler(async (req, res) => {
  const runId = req.params.runId!;
  const run = await getAgentRun(runId);
  if (!run) throw ApiError.notFound("Agent run not found");
  sendSuccess(res, "Agent run", { run });
});

export const runEvents = asyncHandler(async (req, res) => {
  const runId = req.params.runId!;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await getAgentEvents(runId, limit);
  sendSuccess(res, "Agent events", { events });
});

export const chat = asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const runId = req.params.runId!;
  const { question } = req.body as { question: string };
  try {
    const answer = await agentChat(userId, { runId, question });
    sendSuccess(res, "Agent chat", answer);
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      throw ApiError.forbidden(err.message);
    }
    if (err instanceof Error && err.message === "Agent run not found") {
      throw ApiError.notFound(err.message);
    }
    throw ApiError.badRequest(err instanceof Error ? err.message : "Chat failed");
  }
});

export const activeRuns = asyncHandler(async (req, res) => {
  const runs = await listActiveAgentRuns(req.user!.id);
  sendSuccess(res, "Active agent runs", { runs });
});
