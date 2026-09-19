import { z } from "zod";
import { boundedText, listQuery, objectId } from "../middleware/validate.middleware";
import { CASE_PRIORITIES, CASE_STATUSES } from "../models/Case.model";

const chain = z.string().trim().min(2).max(40);

export const caseListQuery = listQuery(["updatedAt", "createdAt", "priority", "status"] as const).extend({
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
});

export const createCaseSchema = z.object({
  title: boundedText(3, 200),
  summary: boundedText(0, 4000).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  jurisdiction: boundedText(2, 120).optional(),
  reportedLossUsd: z.coerce.number().min(0).max(1e12).optional(),
  chains: z.array(chain).max(10).optional(),
  tags: z.array(boundedText(1, 40)).max(20).optional(),
});

export const updateCaseSchema = createCaseSchema.partial().extend({
  status: z.enum(CASE_STATUSES).optional(),
});

export const assignSchema = z.object({ userId: objectId });
