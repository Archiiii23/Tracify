import { Schema, Types, model, type Document, type Model } from "mongoose";
import type { Chain } from "./Investigation.model";

export const AGENT_RUN_STATUSES = [
  "QUEUED",
  "RUNNING",
  "AWAITING_REVIEW",
  "COMPLETED",
  "FAILED",
  "BUDGET_EXCEEDED",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const AGENT_STAGES = [
  "VALIDATING",
  "FETCHING_HISTORY",
  "NORMALIZING_DATA",
  "BUILDING_GRAPH",
  "TRACING_FUNDS",
  "ANALYZING_RISK",
  "ATTRIBUTING_ENTITIES",
  "AI_ANALYSIS",
  "COMPLETED",
  "FAILED",
] as const;
export type AgentStage = (typeof AGENT_STAGES)[number];

export interface AiAgentRunDoc extends Document {
  _id: Types.ObjectId;
  externalInvestigationId?: string;
  mongoInvestigationId?: Types.ObjectId;
  startedBy: Types.ObjectId;
  chain: Chain;
  rootAddress: string;
  objective: string;
  direction: "outbound" | "inbound" | "both";
  maxHops: number;
  status: AgentRunStatus;
  stage: AgentStage;
  toolCalls: number;
  providerRequests: number;
  assessment?: string;
  investigationPlan?: string[];
  structuredContext?: Record<string, unknown>;
  error?: string;
  agentModel: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const aiAgentRunSchema = new Schema<AiAgentRunDoc>(
  {
    externalInvestigationId: { type: String, index: true },
    mongoInvestigationId: { type: Schema.Types.ObjectId, ref: "Investigation" },
    startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chain: { type: String, required: true },
    rootAddress: { type: String, required: true, lowercase: true, trim: true },
    objective: { type: String, default: "Investigate suspicious fund movement" },
    direction: { type: String, enum: ["outbound", "inbound", "both"], default: "outbound" },
    maxHops: { type: Number, default: 3, min: 1, max: 6 },
    status: { type: String, enum: AGENT_RUN_STATUSES, default: "QUEUED", index: true },
    stage: { type: String, enum: AGENT_STAGES, default: "VALIDATING" },
    toolCalls: { type: Number, default: 0 },
    providerRequests: { type: Number, default: 0 },
    assessment: String,
    investigationPlan: [String],
    structuredContext: Schema.Types.Mixed,
    error: String,
    agentModel: { type: String, default: "gemini-2.5-flash" },
    completedAt: Date,
  },
  { timestamps: true },
);

export const AiAgentRun: Model<AiAgentRunDoc> =
  model<AiAgentRunDoc>("AiAgentRun", aiAgentRunSchema);
