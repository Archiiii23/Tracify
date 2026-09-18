import { Schema, Types, model, type Document, type Model } from "mongoose";

export const AGENT_EVENT_TYPES = [
  "PLAN",
  "TOOL_CALL",
  "TOOL_RESULT",
  "STAGE",
  "ASSESSMENT",
  "ERROR",
  "BUDGET",
] as const;
export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export interface AiAgentEventDoc extends Document {
  _id: Types.ObjectId;
  runId: Types.ObjectId;
  /** Supabase or external investigation reference when applicable */
  externalInvestigationId?: string;
  timestamp: Date;
  agentModel: string;
  eventType: AgentEventType;
  toolName?: string;
  arguments?: Record<string, unknown>;
  resultSummary?: string;
  success: boolean;
  latencyMs?: number;
  stage?: string;
  tokenUsage?: { prompt?: number; completion?: number };
  createdAt: Date;
}

const aiAgentEventSchema = new Schema<AiAgentEventDoc>(
  {
    runId: { type: Schema.Types.ObjectId, ref: "AiAgentRun", required: true, index: true },
    externalInvestigationId: { type: String, index: true },
    timestamp: { type: Date, default: Date.now, index: true },
    agentModel: { type: String, required: true },
    eventType: { type: String, enum: AGENT_EVENT_TYPES, required: true },
    toolName: String,
    arguments: Schema.Types.Mixed,
    resultSummary: String,
    success: { type: Boolean, default: true },
    latencyMs: Number,
    stage: String,
    tokenUsage: {
      prompt: Number,
      completion: Number,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const AiAgentEvent: Model<AiAgentEventDoc> =
  model<AiAgentEventDoc>("AiAgentEvent", aiAgentEventSchema);
