import { z } from "zod";
import { CHAINS } from "../models/Investigation.model";

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

export const txHashParams = z
  .object({
    chain: z.enum(CHAINS),
    txHash: z
      .string()
      .trim()
      .min(10)
      .max(128)
      .regex(/^[a-zA-Z0-9:_-]+$/, "Transaction hash contains unsupported characters"),
  })
  .strict();

export const txListQuery = z
  .object({
    direction: z.enum(["in", "out", "all"]).default("all"),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    page: z.coerce.number().int().min(1).default(1),
    minValueUsd: z.coerce.number().min(0).max(1_000_000_000).optional(),
    asset: z.string().trim().max(32).optional(),
  })
  .strict();

export const neighbourQuery = z
  .object({
    direction: z.enum(["in", "out"]).default("out"),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    minValueUsd: z.coerce.number().min(0).max(1_000_000_000).optional(),
  })
  .strict();

export const quickTraceQuery = z
  .object({
    maxHops: z.coerce.number().int().min(1).max(5).default(3),
    minValueUsd: z.coerce.number().min(0).max(1_000_000_000).default(0),
    direction: z.enum(["outbound", "inbound", "both"]).default("outbound"),
  })
  .strict();

export const multiChainSearchQuery = z
  .object({
    address: z
      .string()
      .trim()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9:_-]+$/, "Address contains unsupported characters"),
  })
  .strict();
