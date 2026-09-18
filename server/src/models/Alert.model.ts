/**
 * Automated alert raised by the attribution pipeline.
 *
 * Alerts are the actionable output for a law-enforcement operator: they say what
 * was detected, how urgent it is, and what to do next (freeze request, VASP
 * information request, escalation) — with the evidence attached.
 */
import { Schema, Types, model, type Document, type Model } from "mongoose";

export const ALERT_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["open", "acknowledged", "actioned", "dismissed"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface AlertDoc extends Document {
  _id: Types.ObjectId;
  /** Stable machine code, e.g. `VASP_DIRECT_DEPOSIT`, `MIXER_EXPOSURE`. */
  code: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  summary: string;
  /** What the operator should do, in priority order. */
  recommendedActions: string[];
  chain?: string;
  addresses: string[];
  complaint?: Types.ObjectId;
  case?: Types.ObjectId;
  investigation?: Types.ObjectId;
  /** Detector payload kept verbatim so the alert is self-evidencing. */
  evidence: Record<string, unknown>;
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<AlertDoc>(
  {
    code: { type: String, required: true, uppercase: true, trim: true, maxlength: 60, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    severity: { type: String, enum: ALERT_SEVERITIES, required: true, default: "medium", index: true },
    status: { type: String, enum: ALERT_STATUSES, required: true, default: "open", index: true },
    summary: { type: String, required: true, maxlength: 4000 },
    recommendedActions: { type: [String], default: [] },
    chain: { type: String, trim: true, maxlength: 40 },
    addresses: { type: [String], default: [] },
    complaint: { type: Schema.Types.ObjectId, ref: "Complaint", index: true },
    case: { type: Schema.Types.ObjectId, ref: "Case", index: true },
    investigation: { type: Schema.Types.ObjectId, ref: "Investigation", index: true },
    evidence: { type: Schema.Types.Mixed, default: {} },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
  },
  { timestamps: true },
);

alertSchema.index({ status: 1, severity: 1, createdAt: -1 });

export const Alert: Model<AlertDoc> = model<AlertDoc>("Alert", alertSchema);
