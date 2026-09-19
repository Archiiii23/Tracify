import { z } from "zod";
import { boundedText, listQuery, objectId } from "../middleware/validate.middleware";
import { EVIDENCE_KINDS } from "../models/Evidence.model";

export const evidenceListQuery = listQuery(["createdAt", "kind"] as const).extend({
  caseId: objectId.optional(),
  investigationId: objectId.optional(),
  kind: z.enum(EVIDENCE_KINDS).optional(),
});

export const pinEvidenceSchema = z.object({
  caseId: objectId,
  investigationId: objectId.optional(),
  findingId: objectId.optional(),
  kind: z.enum(EVIDENCE_KINDS),
  label: boundedText(3, 200),
  description: boundedText(0, 4000).optional(),
  // Payload is opaque investigator-pinned data; depth/size is bounded by the
  // 512kb body limit and Mongo operators are stripped before this point.
  payload: z.record(z.unknown()).optional(),
});

export const relabelEvidenceSchema = z.object({
  label: boundedText(3, 200).optional(),
  description: boundedText(0, 4000).optional(),
});
