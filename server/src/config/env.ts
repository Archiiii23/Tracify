import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load server/.env regardless of the cwd the process was started from.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().max(65535).default(5000),
    HOST: z.string().min(1).default("0.0.0.0"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MONGODB_URI: z
      .string()
      .min(1, "MONGODB_URI is required")
      .refine((v) => v.startsWith("mongodb://") || v.startsWith("mongodb+srv://"), {
        message: "MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string",
      }),
    JWT_SECRET: z.string().min(24, "JWT_SECRET must be at least 24 characters long"),
    JWT_EXPIRES_IN: z.string().min(1).default("7d"),
    CLIENT_URL: z.string().min(1).default("http://localhost:5173"),

    // GraphSense (chain data). Absent URL = deterministic synthetic provider.
    GRAPHSENSE_API_URL: z
      .preprocess((v) => (v === "" ? undefined : v), z.string().url("GRAPHSENSE_API_URL must be an absolute http(s) URL").optional()),
    GRAPHSENSE_API_KEY: z
      .preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
    GRAPHSENSE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(12_000),

    // Etherscan / Polygonscan / BscScan keys for direct EVM transaction tracing
    ETHERSCAN_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
    POLYGONSCAN_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
    BSCSCAN_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),

    // Shared API key(s) for NCRP / SAHYOG / LEA complaint intake. Comma
    // separated so each integrator can be rotated independently.
    INTAKE_API_KEYS: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().min(16, "INTAKE_API_KEYS entries must be long random values").optional(),
    ),

    // AI System 1 — remote money-route scoring model. Absent URL = baseline
    // in-process logistic model (always available, fully explainable).
    TRACIFY_ML_URL: z
      .preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
    TRACIFY_ML_API_KEY: z
      .preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
    TRACIFY_ML_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30_000).default(8_000),

    // AI System 2 — investigator copilot (external LLM). Absent key =
    // deterministic local briefing (no data leaves the platform).
    LLM_PROVIDER: z.enum(["openai", "gemini", "anthropic"]).default("openai"),
    LLM_API_KEY: z
      .preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
    LLM_MODEL: z.string().min(1).default("gpt-4o-mini"),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
    // Egress policy: what the copilot context may contain.
    LLM_SEND_FULL_ADDRESSES: z.coerce.boolean().default(false),
    LLM_SEND_VICTIM_DETAILS: z.coerce.boolean().default(false),

    // Gemini investigation agent (uses LLM_API_KEY when LLM_PROVIDER=gemini)
    GEMINI_API_KEY: z
      .preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    MAX_AGENT_TOOL_CALLS: z.coerce.number().int().min(1).max(200).default(50),
    MAX_AGENT_PROVIDER_REQUESTS: z.coerce.number().int().min(1).max(500).default(100),
    MAX_AGENT_PAGES: z.coerce.number().int().min(1).max(100).default(20),
    MAX_AGENT_RUNTIME_SECONDS: z.coerce.number().int().min(10).max(600).default(120),
    MAX_AGENT_HOPS: z.coerce.number().int().min(1).max(6).default(3),
    MAX_AGENT_NODES: z.coerce.number().int().min(10).max(1000).default(500),
    MAX_AGENT_EDGES: z.coerce.number().int().min(10).max(3000).default(1500),

  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;

    // Production-only configuration mistakes are caught before the first request.
    const origins = value.CLIENT_URL.split(",").map((o) => o.trim());
    if (origins.some((o) => o === "*" )) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLIENT_URL"],
        message: "Wildcard CORS is not allowed in production — list explicit origins",
      });
    }
    if (origins.some((o) => o.includes("localhost") || o.includes("127.0.0.1"))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLIENT_URL"],
        message: "Production CLIENT_URL must not point at localhost",
      });
    }
    if (value.GRAPHSENSE_API_URL && !value.GRAPHSENSE_API_URL.startsWith("https://")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GRAPHSENSE_API_URL"],
        message: "Production chain-data calls must use https",
      });
    }
    if (value.GRAPHSENSE_API_URL && !value.GRAPHSENSE_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GRAPHSENSE_API_KEY"],
        message: "GRAPHSENSE_API_KEY is required when GRAPHSENSE_API_URL is set",
      });
    }
    if (/^(dev|test|change|secret|password)/i.test(value.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET looks like a placeholder — use a long random value",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");

  // Fail loudly and early: a half-configured API is worse than no API.
  console.error(
    `\n[VASPTRACE] Invalid environment configuration:\n${details}\n\nCopy server/.env.example to server/.env and fill in the missing values.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === "production",
  isDevelopment: raw.NODE_ENV === "development",
  /** True when a live chain-data provider is configured. */
  hasGraphSense: Boolean(raw.GRAPHSENSE_API_URL),
  /** True when Etherscan family keys are available */
  hasEtherscan: Boolean(raw.ETHERSCAN_API_KEY),
  hasPolygonscan: Boolean(raw.POLYGONSCAN_API_KEY),
  hasBscscan: Boolean(raw.BSCSCAN_API_KEY),
  /** True when a remote route-scoring model is configured. */
  hasRemoteMl: Boolean(raw.TRACIFY_ML_URL),
  /** True when an external LLM copilot is configured. */
  hasLlm: Boolean(raw.LLM_API_KEY),
  /** Gemini key for investigation agent — prefers GEMINI_API_KEY, falls back to LLM when provider is gemini. */
  geminiApiKey:
    raw.GEMINI_API_KEY ??
    (raw.LLM_PROVIDER === "gemini" ? raw.LLM_API_KEY : undefined),
  hasGeminiAgent: Boolean(
    raw.GEMINI_API_KEY ?? (raw.LLM_PROVIDER === "gemini" ? raw.LLM_API_KEY : undefined),
  ),
  /** Configured intake API keys; empty disables the machine intake surface. */
  intakeApiKeys: (raw.INTAKE_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean),
  /**
   * Every origin permitted by CORS. Entries may contain a single `*` wildcard
   * in the host part (e.g. `https://*.vercel.app`) so preview deployments of a
   * known host are allowed without listing every generated URL. A bare `*` is
   * still rejected in production by the schema above.
   */
  allowedOrigins: raw.CLIENT_URL.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;

/** True when `origin` matches an allowlist entry, honouring `*` wildcards. */
export function isOriginAllowed(origin: string): boolean {
  return env.allowedOrigins.some((entry) => {
    if (entry === origin) return true;
    if (!entry.includes("*")) return false;
    const pattern = entry
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^./]*");
    return new RegExp(`^${pattern}$`).test(origin);
  });
}

