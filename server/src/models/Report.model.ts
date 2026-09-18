import { Schema, Types, model, type Document, type Model } from "mongoose";

export const REPORT_STATUSES = ["draft", "review", "final"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface ReportSection {
  heading: string;
  body: string;
}

export interface ReportDoc extends Document {
  _id: Types.ObjectId;
  reference: string;
  case: Types.ObjectId;
  title: string;
  status: ReportStatus;
  audience: "internal" | "law-enforcement" | "vasp" | "regulator";
  executiveSummary: string;
  sections: ReportSection[];
  findingIds: Types.ObjectId[];
  evidenceIds: Types.ObjectId[];
  generatedBy: Types.ObjectId;
  finalisedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sectionSchema = new Schema<ReportSection>(
  {
    heading: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 20_000 },
  },
  { _id: false },
);

const reportSchema = new Schema<ReportDoc>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, trim: true },
    case: { type: Schema.Types.ObjectId, ref: "Case", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: REPORT_STATUSES, default: "draft", required: true },
    audience: {
      type: String,
      enum: ["internal", "law-enforcement", "vasp", "regulator"],
      default: "internal",
    },
    executiveSummary: { type: String, default: "", maxlength: 8000 },
    sections: { type: [sectionSchema], default: [] },
    findingIds: [{ type: Schema.Types.ObjectId, ref: "Finding" }],
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: "Evidence" }],
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    finalisedAt: { type: Date },
  },
  { timestamps: true },
);

export const Report: Model<ReportDoc> = model<ReportDoc>("Report", reportSchema);
