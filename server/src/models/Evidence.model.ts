import { createHash } from "node:crypto";
import { Schema, Types, model, type Document, type Model } from "mongoose";

export const EVIDENCE_KINDS = [
  "transaction",
  "address",
  "graph-snapshot",
  "screenshot",
  "document",
  "note",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface EvidenceDoc extends Document {
  _id: Types.ObjectId;
  case: Types.ObjectId;
  investigation?: Types.ObjectId;
  finding?: Types.ObjectId;
  kind: EvidenceKind;
  label: string;
  description?: string;
  /** Canonical JSON payload of the pinned artefact. */
  payload: Record<string, unknown>;
  /** SHA-256 over the payload — the chain-of-custody seal. */
  checksum: string;
  sealedAt: Date;
  pinnedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Stable stringify so the same artefact always yields the same checksum. */
export function canonicalise(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`);
  return `{${entries.join(",")}}`;
}

export function checksumOf(payload: unknown): string {
  return createHash("sha256").update(canonicalise(payload)).digest("hex");
}

const evidenceSchema = new Schema<EvidenceDoc>(
  {
    case: { type: Schema.Types.ObjectId, ref: "Case", required: true, index: true },
    investigation: { type: Schema.Types.ObjectId, ref: "Investigation", index: true },
    finding: { type: Schema.Types.ObjectId, ref: "Finding" },
    kind: { type: String, enum: EVIDENCE_KINDS, required: true },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 4000 },
    payload: { type: Schema.Types.Mixed, default: {} },
    checksum: { type: String, required: true, index: true },
    sealedAt: { type: Date, default: () => new Date() },
    pinnedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// Evidence is append-only: updates that would rewrite a sealed payload are
// rejected at the service layer, never silently allowed here.
export const Evidence: Model<EvidenceDoc> = model<EvidenceDoc>("Evidence", evidenceSchema);
