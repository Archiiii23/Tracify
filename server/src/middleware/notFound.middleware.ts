import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

/** Convert unmatched routes into a consistent 404 ApiError. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
