import { z } from "zod";
import { CHAINS } from "../models/Investigation.model";
import {
  COMPLAINT_SOURCES,
  FRAUD_TYPES,
  RISK_CATEGORIES,
  TRIAGE_STATUSES,
} from "../models/Complaint.model";
import { ALERT_SEVERITIES, ALERT_STATUSES } from "../models/Alert.model";
import { boundedText, listQuery } from "../middleware/validate.middleware";

const address = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9:_-]+$/, "Address contains unsupported characters");

const suspectAddress = z
  .object({
    address,
    chain: z.enum(CHAINS),
    note: boundedText(1, 500).optional(),
  })
  .strict();

/** Shared complaint payload; the intake route pins `source` from the API key. */
const complaintBody = z.object({
  externalRef: boundedText(1, 80).optional(),
  reportedAt: z.string().datetime().optional(),
  jurisdiction: boundedText(1, 120).optional(),
  victim: z
    .object({
      maskedName: boundedText(1, 120).optional(),
      state: boundedText(1, 80).optional(),
      district: boundedText(1, 80).optional(),
    })
    .strict()
    .optional(),
  fraudType: z.enum(FRAUD_TYPES).default("other"),
  lossInr: z.coerce.number().min(0).max(1e14).default(0),
  narrative: boundedText(1, 4000).optional(),
  addresses: z.array(suspectAddress).min(1).max(25),
});

export const intakeComplaintBody = complaintBody
  .extend({ source: z.enum(COMPLAINT_SOURCES).default("ncrp") })
  .strict();

export const createComplaintBody = complaintBody
  .extend({ source: z.enum(COMPLAINT_SOURCES).default("manual") })
  .strict();

export const complaintListQuery = listQuery(["createdAt", "riskScore", "lossInr", "reportedAt"])
  .extend({
    status: z.enum(TRIAGE_STATUSES).optional(),
    source: z.enum(COMPLAINT_SOURCES).optional(),
    riskCategory: z.enum(RISK_CATEGORIES).optional(),
  })
  .strict();

export const alertListQuery = listQuery(["createdAt", "severity", "status"])
  .extend({
    status: z.enum(ALERT_STATUSES).optional(),
    severity: z.enum(ALERT_SEVERITIES).optional(),
    complaintId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  })
  .strict();

export const alertStatusBody = z
  .object({ status: z.enum(ALERT_STATUSES) })
  .strict();

/** Ad-hoc attribution of a single address, without filing a complaint. */
export const attributeBody = z
  .object({
    address,
    chain: z.enum(CHAINS),
    maxHops: z.coerce.number().int().min(1).max(8).default(5),
    minValueUsd: z.coerce.number().min(0).max(1e9).default(0),
    direction: z.enum(["outbound", "inbound", "both"]).default("outbound"),
    seedValueUsd: z.coerce.number().min(0).max(1e12).optional(),
    fraudType: z.enum(FRAUD_TYPES).optional(),
  })
  .strict();
