import { Schema, Types, model, type Document, type Model } from "mongoose";

export const FINDING_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export const FINDING_CATEGORIES = [
  "peeling",
  "layering",
  "structuring",
  "mixer",
  "bridge",
  "sanctions",
  "vasp-deposit",
  "attribution",
  "other",
] as const;

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export interface FindingDoc extends Document {
  _id: Types.ObjectId;
  case: Types.ObjectId;
  investigation?: Types.ObjectId;
  title: string;
  description: string;
  severity: FindingSeverity;
  category: FindingCategory;
  confidence: number;
  addresses: string[];
  txHashes: string[];
  status: "draft" | "confirmed" | "dismissed";
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const findingSchema = new Schema<FindingDoc>(
  {
    case: { type: Schema.Types.ObjectId, ref: "Case", required: true, index: true },
    investigation: { type: Schema.Types.ObjectId, ref: "Investigation", index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 6000 },
    severity: { type: String, enum: FINDING_SEVERITIES, default: "medium", required: true },
    category: { type: String, enum: FINDING_CATEGORIES, default: "other", required: true },
    confidence: { type: Number, default: 0.5, min: 0, max: 1 },
    addresses: [{ type: String, trim: true, maxlength: 128 }],
    txHashes: [{ type: String, trim: true, maxlength: 128 }],
    status: {
      type: String,
      enum: ["draft", "confirmed", "dismissed"],
      default: "draft",
      required: true,
    },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

findingSchema.index({ case: 1, severity: 1, createdAt: -1 });

export const Finding: Model<FindingDoc> = model<FindingDoc>("Finding", findingSchema);
