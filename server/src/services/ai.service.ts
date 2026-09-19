/**
 * Orchestration over the two TRACIFY AI systems.
 * System 1 (own ML) ranks money routes. System 2 (external LLM) explains
 * grounded findings. The two never share raw case data.
 */
import { env } from "../config/env";
import { attributeAddress, type AttributionOptions, type AttributionResult } from "./attribution.service";
import { attributionGrounding, askCopilot, type CopilotResponse } from "./llm";
import { predictMoneyRoutes } from "./ml";
import type { RoutePredictionResult } from "./ml/types";
import type { Chain } from "../models/Investigation.model";

export function aiSystemsStatus() {
  return {
    routeModel: {
      configured: env.hasRemoteMl ? "remote" : "baseline",
      id: env.hasRemoteMl ? "tracify-remote-model" : "tracify-baseline-logreg",
      healthy: true,
    },
    copilot: {
      configured: env.hasLlm ? env.LLM_PROVIDER : "local",
      model: env.hasLlm ? env.LLM_MODEL : "deterministic-briefing",
      egress: {
        fullAddresses: env.LLM_SEND_FULL_ADDRESSES,
        victimDetails: env.LLM_SEND_VICTIM_DETAILS,
      },
    },
    investigationAgent: {
      configured: env.hasGeminiAgent,
      model: env.GEMINI_MODEL,
      mode: env.hasGeminiAgent ? "gemini-tools" : "deterministic-tools",
      budgets: {
        maxToolCalls: env.MAX_AGENT_TOOL_CALLS,
        maxRuntimeSeconds: env.MAX_AGENT_RUNTIME_SECONDS,
        maxHops: env.MAX_AGENT_HOPS,
      },
    },
  };
}

export async function predictRoutesForAddress(
  chain: Chain,
  address: string,
  options: AttributionOptions & { text?: string } = {},
): Promise<{ attribution: AttributionResult; prediction: RoutePredictionResult }> {
  const attribution = await attributeAddress(chain, address, options);
  const prediction = await predictMoneyRoutes({
    chain,
    rootAddress: address,
    nodes: attribution.graph.nodes,
    edges: attribution.graph.edges,
    narrativeText: options.text,
  });
  return { attribution, prediction };
}

export async function copilotForAddress(
  chain: Chain,
  address: string,
  question: string,
  options: AttributionOptions = {},
): Promise<{ attribution: AttributionResult; copilot: CopilotResponse }> {
  const attribution = await attributeAddress(chain, address, options);
  const copilot = await askCopilot(question, attributionGrounding(attribution));
  return { attribution, copilot };
}
