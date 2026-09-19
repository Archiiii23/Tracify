import { z } from "zod";
import { boundedText, listQuery, objectId } from "../middleware/validate.middleware";
import { CHAINS, TRACE_STATUSES } from "../models/Investigation.model";

/**
 * Addresses are validated per chain: the trace engine must never be handed a
 * string that cannot be a real address.
 */
const addressByChain = {
  ethereum: /^0x[a-fA-F0-9]{40}$/,
  polygon: /^0x[a-fA-F0-9]{40}$/,
  bsc: /^0x[a-fA-F0-9]{40}$/,
  arbitrum: /^0x[a-fA-F0-9]{40}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  bitcoin: /^(bc1[a-z0-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
} as const;

export const investigationListQuery = listQuery([
  "updatedAt",
  "createdAt",
  "riskScore",
] as const).extend({
  status: z.enum(TRACE_STATUSES).optional(),
  caseId: objectId.optional(),
});

export const startInvestigationSchema = z
  .object({
    caseId: objectId,
    title: boundedText(3, 200),
    rootAddress: z.string().trim().min(20).max(128),
    chain: z.enum(CHAINS),
    direction: z.enum(["outbound", "inbound", "both"]).optional(),
    maxHops: z.coerce.number().int().min(1).max(10).optional(),
    minValueUsd: z.coerce.number().min(0).max(1e9).optional(),
    seedValueUsd: z.coerce.number().min(0).max(1e12).optional(),
  })
  .superRefine((value, ctx) => {
    if (!addressByChain[value.chain].test(value.rootAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rootAddress"],
        message: `Not a valid ${value.chain} address`,
      });
    }
  });
