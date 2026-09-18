/**
 * API-key authentication for the machine-to-machine intake surface.
 *
 * Comparison is constant time so a wrong key leaks no timing information, and
 * the key is never logged. Multiple keys may be configured (comma separated) so
 * NCRP and SAHYOG can be rotated independently.
 */
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";

function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function intakeApiKey(req: Request, _res: Response, next: NextFunction) {
  const keys = env.intakeApiKeys;
  if (keys.length === 0) {
    return next(
      new ApiError(503, "Complaint intake is not configured on this deployment"),
    );
  }

  const presented = req.get("x-api-key");
  if (!presented || !keys.some((key) => matches(presented, key))) {
    logger.warn("intake rejected", { requestId: req.requestId, ip: req.ip });
    return next(new ApiError(401, "A valid intake API key is required"));
  }

  return next();
}

/** Generous enough for bulk upstream forwarding, bounded enough to be safe. */
export const intakeLimiter: RequestHandler = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, _res, next) => {
    next(new ApiError(429, "Intake rate limit exceeded — retry shortly."));
  },
});
