import { z } from "zod";
import { boundedText, listQuery, objectId } from "../middleware/validate.middleware";
import { REPORT_STATUSES } from "../models/Report.model";

const audience = z.enum(["internal", "law-enforcement", "vasp", "regulator"]);

export const reportListQuery = listQuery(["createdAt", "updatedAt", "status"] as const).extend({
  caseId: objectId.optional(),
  status: z.enum(REPORT_STATUSES).optional(),
});

export const generateReportSchema = z.object({
  caseId: objectId,
  title: boundedText(3, 200).optional(),
  audience: audience.optional(),
});

export const updateReportSchema = z.object({
  title: boundedText(3, 200).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  audience: audience.optional(),
  executiveSummary: boundedText(0, 8000).optional(),
  sections: z
    .array(z.object({ heading: boundedText(2, 200), body: boundedText(1, 20_000) }))
    .max(40)
    .optional(),
});
