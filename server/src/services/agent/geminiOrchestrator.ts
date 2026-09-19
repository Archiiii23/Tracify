import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { AGENT_SYSTEM_INSTRUCTION, AGENT_TOOL_DECLARATIONS } from "./toolRegistry";
import { executeAgentTool } from "./toolExecutor";
import type { BudgetTracker } from "./budget";
import type { AgentContext } from "./types";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface OrchestratorResult {
  assessment: string;
  toolCalls: number;
  usedGemini: boolean;
  model: string;
}

function getGeminiKey(): string | undefined {
  return env.geminiApiKey;
}

function getGeminiModel(): string {
  return env.GEMINI_MODEL ?? env.LLM_MODEL ?? "gemini-2.5-flash";
}

/** Run Gemini function-calling loop with TRACIFY tools only. */
export async function runGeminiInvestigationLoop(
  ctx: AgentContext,
  budget: BudgetTracker,
  objective: string,
): Promise<OrchestratorResult> {
  const apiKey = getGeminiKey();
  const model = getGeminiModel();

  if (!apiKey) {
    return runDeterministicInvestigation(ctx, budget, objective, model);
  }

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        {
          text: [
            `Investigation objective: ${objective}`,
            `Target chain: ${ctx.chain}`,
            `Target address: ${ctx.rootAddress}`,
            `Direction: ${ctx.direction}`,
            `Max hops: ${ctx.maxHops}`,
            "",
            "Execute the investigation using TRACIFY tools. When complete, provide a final assessment with OBSERVED, DERIVED, INFERRED, and RECOMMENDATION sections.",
          ].join("\n"),
        },
      ],
    },
  ];

  const maxTurns = 20;
  let finalText = "";

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (budget.isExceeded()) break;

    const response = await callGemini(apiKey, model, contents);
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const functionCalls = parts.filter((p) => p.functionCall?.name);
    const textParts = parts.filter((p) => p.text).map((p) => p.text!).join("\n");

    if (functionCalls.length === 0) {
      finalText = textParts || "Investigation complete — no additional assessment generated.";
      break;
    }

    contents.push({ role: "model", parts: functionCalls as GeminiPart[] });

    const responseParts: GeminiPart[] = [];

    for (const part of functionCalls) {
      const fc = part.functionCall!;
      if (!budget.canCallTool()) {
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: { error: budget.exceededReason(), success: false },
          },
        });
        continue;
      }

      budget.recordToolCall();
      const started = Date.now();
      let toolResult;
      try {
        toolResult = await executeAgentTool(fc.name, fc.args ?? {}, ctx, budget);
      } catch (err) {
        toolResult = {
          success: false,
          summary: err instanceof Error ? err.message : "Tool failed",
          data: {},
        };
      }
      const latencyMs = Date.now() - started;

      await ctx.onToolEvent?.({
        toolName: fc.name,
        arguments: fc.args ?? {},
        resultSummary: toolResult.summary,
        success: toolResult.success,
        latencyMs,
      });

      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: {
            success: toolResult.success,
            summary: toolResult.summary,
            ...toolResult.data,
          },
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });

    if (budget.isExceeded()) {
      finalText =
        budget.exceededReason() +
        "\n\nPartial assessment based on evidence gathered so far:\n" +
        summarizeFacts(ctx);
      break;
    }
  }

  if (!finalText) {
    finalText = summarizeFacts(ctx);
  }

  return {
    assessment: finalText,
    toolCalls: budget.toolCalls,
    usedGemini: true,
    model,
  };
}

/** Deterministic tool sequence when Gemini is unavailable. */
async function runDeterministicInvestigation(
  ctx: AgentContext,
  budget: BudgetTracker,
  objective: string,
  model: string,
): Promise<OrchestratorResult> {
  const sequence = [
    { name: "validate_wallet", args: { chain: ctx.chain, address: ctx.rootAddress } },
    { name: "get_wallet_summary", args: { chain: ctx.chain, address: ctx.rootAddress } },
    {
      name: "get_transaction_history",
      args: { chain: ctx.chain, address: ctx.rootAddress, direction: "all", limit: 25, page: 1 },
    },
    {
      name: "trace_fund_flow",
      args: {
        chain: ctx.chain,
        address: ctx.rootAddress,
        direction: ctx.direction,
        max_hops: ctx.maxHops,
      },
    },
    { name: "analyze_risk", args: { chain: ctx.chain, address: ctx.rootAddress } },
    { name: "get_vasp_candidates", args: { chain: ctx.chain, address: ctx.rootAddress } },
  ];

  for (const step of sequence) {
    if (!budget.canCallTool()) break;
    budget.recordToolCall();
    const started = Date.now();
    const result = await executeAgentTool(step.name, step.args, ctx, budget);
    await ctx.onToolEvent?.({
      toolName: step.name,
      arguments: step.args,
      resultSummary: result.summary,
      success: result.success,
      latencyMs: Date.now() - started,
    });
  }

  const assessment = [
    "AI-ASSISTED (local deterministic pipeline — Gemini unavailable)",
    "",
    `Objective: ${objective}`,
    "",
    summarizeFacts(ctx),
    "",
    "RECOMMENDATION: Review traced paths and evidence in the investigation workspace before external action.",
  ].join("\n");

  return {
    assessment,
    toolCalls: budget.toolCalls,
    usedGemini: false,
    model: `tracify-local (${model})`,
  };
}

function summarizeFacts(ctx: AgentContext): string {
  const lines: string[] = [];
  const ws = ctx.facts.walletSummary as Record<string, unknown> | undefined;
  if (ws) {
    lines.push(
      `OBSERVED: Wallet ${ws.address} on ${ws.chain} — provider ${ws.provider}, in/out: ${ws.incoming_count}/${ws.outgoing_count}`,
    );
  }
  const trace = ctx.facts.trace as Record<string, unknown> | undefined;
  if (trace) {
    const graph = trace.graph as Record<string, number> | undefined;
    lines.push(
      `DERIVED: Graph ${graph?.node_count ?? 0} nodes, ${graph?.edge_count ?? 0} edges, max depth configured ${graph?.max_depth_configured}, observed ${graph?.current_depth_observed}`,
    );
    lines.push(`DERIVED: Heuristic risk score ${trace.risk_score}/100 (${trace.data_source} data)`);
    const paths = (trace.paths as unknown[]) ?? [];
    if (paths.length > 0) {
      lines.push(`INFERRED: ${paths.length} unique candidate path(s) ranked by TRACIFY engine`);
    }
  }
  const vasp = ctx.facts.vaspCandidates as { count?: number; conclusion?: string } | undefined;
  if (vasp?.count === 0 || !vasp) {
    lines.push("INFERRED: No VASP attribution was established within the current evidence scope.");
  } else if (vasp.count) {
    lines.push(`INFERRED: ${vasp.count} likely VASP candidate(s) — requires investigator review`);
  }
  return lines.join("\n");
}

async function callGemini(
  apiKey: string,
  model: string,
  contents: GeminiContent[],
): Promise<{
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: AGENT_SYSTEM_INSTRUCTION }] },
    contents,
    tools: [{ functionDeclarations: AGENT_TOOL_DECLARATIONS }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    logger.warn("Gemini agent call failed", { status: res.status, errText: errText.slice(0, 200) });
    throw new Error(`Gemini API error ${res.status}`);
  }

  return res.json() as Promise<{
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  }>;
}

export { summarizeFacts };
