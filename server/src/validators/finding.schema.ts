import { z } from "zod";
import { boundedText, listQuery, objectId } from "../middleware/validate.middleware";
import { FINDING_CATEGORIES, FINDING_SEVERITIES } from "../models/Finding.model";

const hashList = z.array(z.string().trim().min(4).max(128)).max(200);

export const findingListQuery = listQuery(["createdAt", "severity", "confidence"] as const).extend({
  caseId: objectId.optional(),
  investigationId: objectId.optional(),
  severity: z.enum(FINDING_SEVERITIES).optional(),
  status: z.enum(["draft", "confirmed", "dismissed"]).optional(),
});

export const createFindingSchema = z.object({
  caseId: objectId,
  investigationId: objectId.optional(),
  title: boundedText(3, 200),
  description: boundedText(10, 6000),
  severity: z.enum(FINDING_SEVERITIES).optional(),
  category: z.enum(FINDING_CATEGORIES).optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  addresses: hashList.optional(),
  txHashes: hashList.optional(),
});

export const updateFindingSchema = createFindingSchema
  .omit({ caseId: true, investigationId: true })
  .partial()
  .extend({ status: z.enum(["draft", "confirmed", "dismissed"]).optional() });
