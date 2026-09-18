/**
 * Google Gemini AI integration for TRACIFY.
 *
 * Provides grounded narrative generation and natural language forensic Q&A
 * for blockchain investigators. Key is read from local storage or VITE_GEMINI_API_KEY.
 */

const GEMINI_KEY_STORAGE = "tracify.gemini.key";
const GEMINI_MODEL = "gemini-2.5-flash";

export function getGeminiApiKey(): string | null {
  if (typeof window !== "undefined") {
    const local = window.localStorage.getItem(GEMINI_KEY_STORAGE);
    if (local && local.trim().length > 0) return local.trim();
  }
  const envKey = (import.meta.env["VITE_GEMINI_API_KEY"] as string | undefined) ?? "";
  return envKey.trim().length > 0 ? envKey.trim() : null;
}

export function setGeminiApiKey(key: string | null): void {
  if (typeof window === "undefined") return;
  if (key && key.trim().length > 0) {
    window.localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
  } else {
    window.localStorage.removeItem(GEMINI_KEY_STORAGE);
  }
  window.dispatchEvent(new Event("tracify:gemini-key"));
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

export interface ForensicSummaryContext {
  investigationName: string;
  targetAddress: string;
  blockchain: string;
  totalTxs?: number;
  valueTracedUsd?: number;
  entities?: Array<{ name: string; category?: string; address: string; confidence?: number }>;
  signals?: Array<{ title: string; severity?: string; description?: string | null }>;
  findings?: Array<{ title: string; severity: string; description?: string | null }>;
  evidenceCount?: number;
  narrative?: string;
}

function extractGeminiText(data: unknown): string {
  const payload = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  const validText = parts
    .filter((p) => !p.thought && typeof p.text === "string" && p.text.trim().length > 0)
    .map((p) => (p.text as string).trim());
  if (validText.length > 0) return validText.join("\n\n");
  const fallback = parts[0]?.text;
  if (typeof fallback === "string" && fallback.trim().length > 0) return fallback.trim();
  throw new Error("Received empty response from Gemini.");
}

/**
 * Generate a court-ready forensic intelligence executive summary
 */
export async function generateForensicSummary(
  ctx: ForensicSummaryContext
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "Gemini API key is not configured. Please add your key in Settings or the AI tab."
    );
  }

  const prompt = `You are a Senior Blockchain Forensics Specialist assisting Law Enforcement and Regulated Financial Institutions.
Write a formal, legally defensible, and rigorous Forensic Executive Summary based strictly on the following on-chain observations:

INVESTIGATION DETAILS:
- Case / Investigation Name: ${ctx.investigationName}
- Target Suspect Address: ${ctx.targetAddress} (${ctx.blockchain})
- Direct On-Chain Transactions Indexed: ${ctx.totalTxs ?? "N/A"}
- Estimated Value Traced: $${ctx.valueTracedUsd?.toLocaleString() ?? "0"} USD
- Key Identified Entities & VASPs: ${
    ctx.entities && ctx.entities.length > 0
      ? ctx.entities.map((e) => `${e.name} (${e.category || "Service"}, ${e.address})`).join(", ")
      : "None attributed to date"
  }
- Key Behavioral Signals: ${
    ctx.signals && ctx.signals.length > 0
      ? ctx.signals.map((s) => `[${s.severity || "INFO"}] ${s.title}: ${s.description || ""}`).join("; ")
      : "Standard peer-to-peer movements"
  }
- Confirmed Findings: ${
    ctx.findings && ctx.findings.length > 0
      ? ctx.findings.map((f) => `[${f.severity.toUpperCase()}] ${f.title}`).join("; ")
      : "Preliminary staging phase"
  }
- Chain of Custody Held Items: ${ctx.evidenceCount ?? 0} cryptographic artefacts

INSTRUCTIONS:
1. Provide a 2-3 paragraph objective summary:
   - Paragraph 1: Target Profile & Direct Fund Flows (quantifying transaction volume and directionality).
   - Paragraph 2: Laundering Typology & Entity Touchpoints (e.g. peel chains, exchange deposit addresses, privacy mixers).
   - Paragraph 3: Actionable Recommendation (e.g. emergency preservation letters, mutual legal assistance treaties / 28 U.S.C. § 1782, VASP subpoena targets).
2. Avoid speculative assumptions; strictly isolate verifiable blockchain transactions from investigative hypotheses.
3. Keep tone authoritative, objective, and court-ready. Do not use conversational intros or markdown headers.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
        thinkingConfig: {
          thinkingBudget: 256,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `Gemini API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) msg = parsed.error.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = await response.json();
  return extractGeminiText(data);
}

/**
 * Ask the investigator copilot with active case context
 */
export async function askGeminiCopilot(
  question: string,
  context: {
    activeCasesCount: number;
    investigations: Array<{ name: string; target: string; chain: string; status: string }>;
    findings: Array<{ title: string; severity: string }>;
    evidenceCount: number;
  }
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const systemContext = `You are TRACIFY AI Investigator Copilot, an expert AI embedded inside a professional crypto forensics console.
Current Workspace Context:
- Active Cases: ${context.activeCasesCount}
- Active Investigations: ${context.investigations.map((i) => `${i.name} (${i.chain}: ${i.target}) [${i.status}]`).join("; ")}
- Documented Findings: ${context.findings.map((f) => `[${f.severity}] ${f.title}`).join(", ")}
- Evidence Vault Items: ${context.evidenceCount}

Answer the investigator's question with precise forensic terminology (e.g. UTXO, Account-based state, peels, hop-distance, VASP attribution, OFAC sanctions, Travel Rule). Always recommend actionable next steps (e.g. preservation requests, sub-graph bounds, AML indicators).`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemContext}\n\nInvestigator Question: ${question}` }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        thinkingConfig: {
          thinkingBudget: 256,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `Gemini API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) msg = parsed.error.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const data = await response.json();
  return extractGeminiText(data);
}
