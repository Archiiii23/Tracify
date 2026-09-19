import type { Chain } from "../../models/Investigation.model";
import type { Types } from "mongoose";

export interface AgentToolEvent {
  toolName: string;
  arguments: Record<string, unknown>;
  resultSummary: string;
  success: boolean;
  latencyMs: number;
}

export interface AgentContext {
  runId: Types.ObjectId;
  externalInvestigationId?: string;
  chain: Chain;
  rootAddress: string;
  direction: "outbound" | "inbound" | "both";
  maxHops: number;
  userId: Types.ObjectId;
  /** Accumulated structured facts for Gemini context (never raw blockchain dumps) */
  facts: Record<string, unknown>;
  onToolEvent?: (event: AgentToolEvent) => Promise<void>;
}

export interface ToolResult {
  success: boolean;
  summary: string;
  data: Record<string, unknown>;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentInvestigateInput {
  chain: Chain;
  address: string;
  objective?: string;
  direction?: "outbound" | "inbound" | "both";
  maxHops?: number;
  externalInvestigationId?: string;
  mongoInvestigationId?: string;
}

export interface AgentChatInput {
  runId: string;
  question: string;
}
