import { Router } from "express";
import { z } from "zod";
import * as agent from "../controllers/agent.controller";
import * as ai from "../controllers/ai.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { heavyLimiter } from "../middleware/security.middleware";
import { validate } from "../middleware/validate.middleware";

const chainEnum = z.enum(["bitcoin", "ethereum", "tron", "polygon", "bsc", "solana", "arbitrum"]);

const predictBody = z.object({
  chain: chainEnum,
  address: z.string().min(8).max(128),
  maxHops: z.number().int().min(1).max(10).optional(),
  seedValueUsd: z.number().nonnegative().optional(),
  text: z.string().max(4000).optional(),
});

const copilotBody = predictBody.extend({
  question: z.string().min(4).max(2000),
});

const agentInvestigateBody = z.object({
  chain: chainEnum,
  address: z.string().min(8).max(128),
  objective: z.string().max(2000).optional(),
  direction: z.enum(["outbound", "inbound", "both"]).optional(),
  maxHops: z.number().int().min(1).max(6).optional(),
  externalInvestigationId: z.string().max(128).optional(),
  mongoInvestigationId: z.string().max(128).optional(),
});

const agentChatBody = z.object({
  question: z.string().min(4).max(2000),
});

const runIdParam = z.object({
  runId: z.string().min(12).max(128),
});

export const aiRouter = Router();

aiRouter.use(requireAuth);

aiRouter.get("/status", ai.status);
aiRouter.post("/predict-route", validate({ body: predictBody }), ai.predictRoute);
aiRouter.post("/copilot", validate({ body: copilotBody }), ai.copilot);

aiRouter.get("/agent/runs/active", agent.activeRuns);
aiRouter.post(
  "/agent/investigate",
  heavyLimiter,
  validate({ body: agentInvestigateBody }),
  agent.investigate,
);
aiRouter.get("/agent/runs/:runId", validate({ params: runIdParam }), agent.runStatus);
aiRouter.get("/agent/runs/:runId/events", validate({ params: runIdParam }), agent.runEvents);
aiRouter.post(
  "/agent/runs/:runId/chat",
  validate({ params: runIdParam, body: agentChatBody }),
  agent.chat,
);
