/**
 * Provider-agnostic LLM adapter for the investigator copilot.
 * Supports OpenAI-compatible, Gemini and Anthropic endpoints behind one
 * interface; a missing key or provider failure degrades to the local
 * deterministic briefing rather than failing the request.
 */
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  external: boolean;
}

interface LlmProvider {
  id: string;
  complete(messages: LlmMessage[]): Promise<string>;
}

function openAiProvider(apiKey: string, model: string): LlmProvider {
  return {
    id: "openai",
    async complete(messages) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 1200 }),
        signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (!text) throw new Error("OpenAI returned an empty completion");
      return text;
    },
  };
}

function geminiProvider(apiKey: string, model: string): LlmProvider {
  return {
    id: "gemini",
    async complete(messages) {
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents,
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
          }),
          signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
        },
      );
      if (!res.ok) throw new Error(`Gemini responded ${res.status}`);
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
      if (!text) throw new Error("Gemini returned an empty completion");
      return text;
    },
  };
}

function anthropicProvider(apiKey: string, model: string): LlmProvider {
  return {
    id: "anthropic",
    async complete(messages) {
      const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
      const rest = messages.filter((m) => m.role !== "system");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          ...(system ? { system } : {}),
          messages: rest.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Anthropic responded ${res.status}`);
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = body.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      if (!text) throw new Error("Anthropic returned an empty completion");
      return text;
    },
  };
}

/** Resolve the configured provider, or null when no external LLM is set up. */
export function resolveLlmProvider(): LlmProvider | null {
  if (!env.hasLlm || !env.LLM_API_KEY) return null;
  switch (env.LLM_PROVIDER) {
    case "gemini":
      return geminiProvider(env.LLM_API_KEY, env.LLM_MODEL);
    case "anthropic":
      return anthropicProvider(env.LLM_API_KEY, env.LLM_MODEL);
    default:
      return openAiProvider(env.LLM_API_KEY, env.LLM_MODEL);
  }
}

export async function completeWithFallback(
  provider: LlmProvider,
  messages: LlmMessage[],
  fallback: () => string,
): Promise<LlmResult> {
  try {
    const text = await provider.complete(messages);
    return { text, provider: provider.id, model: env.LLM_MODEL, external: true };
  } catch (error) {
    logger.warn("external LLM failed — using deterministic local briefing", {
      provider: provider.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    return { text: fallback(), provider: "tracify-local", model: "deterministic-briefing", external: false };
  }
}
