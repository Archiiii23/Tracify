import { Schema, Types, model, type Document, type Model } from "mongoose";

export const CASE_STATUSES = ["open", "active", "escalated", "closed"] as const;
export const CASE_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export interface CaseDoc extends Document {
  _id: Types.ObjectId;
  reference: string;
  title: string;
  summary?: string;
  status: CaseStatus;
  priority: CasePriority;
  jurisdiction?: string;
  reportedLossUsd: number;
  chains: string[];
  tags: string[];
  createdBy: Types.ObjectId;
  assignedTo: Types.ObjectId[];
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const caseSchema = new Schema<CaseDoc>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, trim: true, maxlength: 4000 },
    status: { type: String, enum: CASE_STATUSES, default: "open", required: true },
    priority: { type: String, enum: CASE_PRIORITIES, default: "medium", required: true },
    jurisdiction: { type: String, trim: true, maxlength: 120 },
    reportedLossUsd: { type: Number, default: 0, min: 0 },
    chains: [{ type: String, trim: true, maxlength: 40 }],
    tags: [{ type: String, trim: true, maxlength: 40 }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    assignedTo: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    closedAt: { type: Date },
  },
  { timestamps: true },
);

// Text index powers the case search box without regex table scans.
caseSchema.index({ title: "text", summary: "text", reference: "text" });
caseSchema.index({ status: 1, priority: 1, updatedAt: -1 });

export const Case: Model<CaseDoc> = model<CaseDoc>("Case", caseSchema);
