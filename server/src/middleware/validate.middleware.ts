/**
 * Single validation architecture for the API: every route declares Zod schemas
 * for the request parts it reads, and the parsed (typed, stripped) result
 * replaces the raw input. Unknown keys are dropped, so clients can never
 * smuggle protected fields such as `role`, `created_by` or `_id`.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z, type ZodTypeAny } from "zod";

export interface RequestSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      next();
    } catch (error) {
      // ZodError is normalised into a 400 by the terminal error handler.
      next(error);
    }
  };
}

/** A 24-character hexadecimal Mongo ObjectId — rejects `$ne`-style payloads. */
export const objectId = z
  .string()
  .trim()
  .regex(/^[a-f\d]{24}$/i, "Must be a valid resource id");

export const objectIdParam = z.object({ id: objectId });

/** Trimmed, length-bounded human text. Empty/whitespace-only input fails. */
export const boundedText = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

/**
 * Shared, safe collection query contract. `sort` is whitelisted per route so
 * arbitrary user input never reaches a database sort specification.
 */
export function listQuery<T extends readonly [string, ...string[]]>(sortableFields: T) {
  return z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(sortableFields).default(sortableFields[0]),
    order: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().trim().max(120).optional(),
  });
}

export type ListQuery = z.infer<ReturnType<typeof listQuery>>;
