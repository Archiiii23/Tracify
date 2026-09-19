import { env } from "../../config/env";

export interface AgentBudget {
  maxToolCalls: number;
  maxProviderRequests: number;
  maxPages: number;
  maxRuntimeMs: number;
  maxHops: number;
  maxNodes: number;
  maxEdges: number;
}

export function getAgentBudget(): AgentBudget {
  return {
    maxToolCalls: env.MAX_AGENT_TOOL_CALLS,
    maxProviderRequests: env.MAX_AGENT_PROVIDER_REQUESTS,
    maxPages: env.MAX_AGENT_PAGES,
    maxRuntimeMs: env.MAX_AGENT_RUNTIME_SECONDS * 1000,
    maxHops: env.MAX_AGENT_HOPS,
    maxNodes: env.MAX_AGENT_NODES,
    maxEdges: env.MAX_AGENT_EDGES,
  };
}

export class BudgetTracker {
  toolCalls = 0;
  providerRequests = 0;
  pages = 0;
  startedAt = Date.now();

  constructor(private readonly budget: AgentBudget = getAgentBudget()) {}

  canCallTool(): boolean {
    return (
      this.toolCalls < this.budget.maxToolCalls &&
      Date.now() - this.startedAt < this.budget.maxRuntimeMs
    );
  }

  recordToolCall(): void {
    this.toolCalls += 1;
  }

  recordProviderRequest(): void {
    this.providerRequests += 1;
  }

  recordPage(): void {
    this.pages += 1;
  }

  isExceeded(): boolean {
    return (
      this.toolCalls >= this.budget.maxToolCalls ||
      this.providerRequests >= this.budget.maxProviderRequests ||
      this.pages >= this.budget.maxPages ||
      Date.now() - this.startedAt >= this.budget.maxRuntimeMs
    );
  }

  exceededReason(): string {
    if (this.toolCalls >= this.budget.maxToolCalls) {
      return "Investigation budget reached: maximum tool calls exceeded.";
    }
    if (this.providerRequests >= this.budget.maxProviderRequests) {
      return "Investigation budget reached: maximum provider requests exceeded.";
    }
    if (this.pages >= this.budget.maxPages) {
      return "Investigation budget reached: maximum pagination pages exceeded.";
    }
    return "Investigation budget reached: maximum runtime exceeded.";
  }
}
