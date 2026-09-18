import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { env } from "../config/env";
import { ApiError, type ApiErrorDetail } from "../utils/ApiError";
import { sendError } from "../utils/ApiResponse";
import { logger } from "../utils/logger";

interface NormalizedError {
  statusCode: number;
  message: string;
  errors: ApiErrorDetail[];
}

function normalize(error: unknown): NormalizedError {
  if (error instanceof ApiError) {
    return { statusCode: error.statusCode, message: error.message, errors: error.errors };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      message: "Validation failed",
      errors: error.issues.map((issue) => ({
        field: issue.path.join(".") || undefined,
        message: issue.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      message: "Validation failed",
      errors: Object.values(error.errors).map((issue) => ({
        field: issue.path,
        message: issue.message,
      })),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      message: `Invalid value for "${error.path}"`,
      errors: [{ field: error.path, message: `"${String(error.value)}" is not a valid identifier` }],
    };
  }

  // MongoDB duplicate key
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  ) {
    const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue ?? {};
    const fields = Object.keys(keyValue);
    return {
      statusCode: 409,
      message: "A record with these details already exists",
      errors: fields.map((field) => ({
        field,
        message: `"${String(keyValue[field])}" is already in use`,
      })),
    };
  }

  if (typeof error === "object" && error !== null) {
    const name = (error as { name?: string }).name;
    if (name === "JsonWebTokenError") {
      return { statusCode: 401, message: "Invalid authentication token", errors: [] };
    }
    if (name === "TokenExpiredError") {
      return { statusCode: 401, message: "Authentication token has expired", errors: [] };
    }
  }

  return { statusCode: 500, message: "Something went wrong", errors: [] };
}

/** Terminal error middleware — the single place that formats error responses. */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const { statusCode, message, errors } = normalize(error);

  if (statusCode >= 500) {
    logger.error("unhandled request error", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split("?")[0],
      reason: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  // Stack traces leak file paths and dependency internals: development only,
  // never in test or production responses.
  const stack = env.isDevelopment && error instanceof Error ? error.stack : undefined;

  sendError(res, statusCode, message, errors, stack);
}
