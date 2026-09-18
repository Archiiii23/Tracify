/**
 * Cross-cutting request hardening: correlation IDs, query/body sanitisation,
 * request logging and rate limiting.
 */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { type Options } from "express-rate-limit";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";

/** Attach a correlation id to every request/response for traceable logs. */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get("x-request-id");
  const id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}

/**
 * NoSQL-injection guard: strip Mongo operators (`$gt`, `$ne`, …) and dotted
 * paths from anything user-controlled before it can reach a query filter.
 * Objects are mutated in place so Express' parsed `query`/`params` stay valid.
 */
function scrub(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      value[i] = scrub(item, depth + 1);
    });
    return value;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key.startsWith("$") || key.includes(".") || key === "__proto__" || key === "constructor") {
      delete record[key];
      continue;
    }
    record[key] = scrub(record[key], depth + 1);
  }
  return record;
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction) {
  scrub(req.body);
  scrub(req.params);
  scrub(req.query);
  next();
}

/** Log every completed request with status + duration, never the payload. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const context = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs),
    };
    if (res.statusCode >= 500) logger.error("request failed", context);
    else if (res.statusCode >= 400) logger.warn("request rejected", context);
    else logger.info("request", context);
  });
  next();
}

function limiter(options: Pick<Options, "windowMs" | "limit"> & { message: string }): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Tests and local development must not trip limits accidentally.
    skip: () => env.NODE_ENV === "test",
    handler: (_req, _res, next) => {
      next(new ApiError(429, options.message));
    },
  });
}

/** Broad safety net so a single client cannot saturate the API. */
export const globalLimiter = limiter({
  windowMs: 60_000,
  limit: 300,
  message: "Too many requests — slow down and try again shortly.",
});

/** Credential endpoints: strict, to blunt brute-force and enumeration. */
export const authLimiter = limiter({
  windowMs: 15 * 60_000,
  limit: 10,
  message: "Too many authentication attempts — try again in a few minutes.",
});

/** Expensive analysis / report generation. */
export const heavyLimiter = limiter({
  windowMs: 60_000,
  limit: 20,
  message: "Too many analysis requests — please wait before retrying.",
});

/** File/evidence uploads. */
export const uploadLimiter = limiter({
  windowMs: 60_000,
  limit: 30,
  message: "Too many uploads — please wait before retrying.",
});
