import type { Response } from "express";
import type { ApiErrorDetail } from "./ApiError";

export interface SuccessBody<T> {
  success: true;
  message: string;
  data: T;
}

export interface ErrorBody {
  success: false;
  message: string;
  errors: ApiErrorDetail[];
  stack?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: PaginationMeta;
}

/** Send the canonical success envelope. */
export function sendSuccess<T>(
  res: Response,
  message: string,
  data: T,
  statusCode = 200,
): Response<SuccessBody<T>> {
  return res.status(statusCode).json({ success: true, message, data });
}

/** Send a paginated success envelope with pagination metadata. */
export function sendPaginated<T>(
  res: Response,
  message: string,
  items: T[],
  meta: { page: number; limit: number; total: number },
): Response<SuccessBody<PaginatedData<T>>> {
  return sendSuccess<PaginatedData<T>>(res, message, {
    items,
    pagination: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.limit > 0 ? Math.ceil(meta.total / meta.limit) : 0,
    },
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  errors: ApiErrorDetail[] = [],
  stack?: string,
): Response<ErrorBody> {
  const body: ErrorBody = { success: false, message, errors };
  if (stack) body.stack = stack;
  return res.status(statusCode).json(body);
}
