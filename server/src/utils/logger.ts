/**
 * Structured, redaction-first logging.
 *
 * Production logs are single-line JSON so they can be shipped and queried.
 * Nothing sensitive is ever logged: credentials, tokens and auth headers are
 * stripped before serialisation, and request bodies are never dumped wholesale.
 */
import { env } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";

const REDACTED = "[redacted]";
const SENSITIVE_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "jwt",
  "jwt_secret",
  "secret",
  "apikey",
  "api_key",
  "mongodb_uri",
]);

/** Deep-clone a context object with sensitive values removed. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(val, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 512) return `${value.slice(0, 512)}…`;
  return value;
}

function emit(level: Level, message: string, context?: Record<string, unknown>) {
  const entry = {
    level,
    time: new Date().toISOString(),
    service: "vasptrace-api",
    env: env.NODE_ENV,
    message,
    ...(context ? { context: redact(context) as Record<string, unknown> } : {}),
  };

  const line = env.isProduction ? JSON.stringify(entry) : `[${level}] ${message}`;
  const extra = env.isProduction || !context ? "" : JSON.stringify(redact(context));

  if (level === "error") console.error(line, extra);
  else if (level === "warn") console.warn(line, extra);
  else console.log(line, extra);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    if (!env.isProduction) emit("debug", message, context);
  },
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
