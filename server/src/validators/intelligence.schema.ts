import { z } from "zod";
import { CHAINS } from "../models/Investigation.model";

/** Addresses are opaque strings across chains; bound length and charset only. */
export const addressParams = z
  .object({
    chain: z.enum(CHAINS),
    address: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9:_-]+$/, "Address contains unsupported characters"),
  })
  .strict();

export const neighbourQuery = z
  .object({
    direction: z.enum(["in", "out"]).default("out"),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    minValueUsd: z.coerce.number().min(0).max(1_000_000_000).optional(),
  })
  .strict();
