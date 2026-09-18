/**
 * Victim complaint ingested from a cybercrime reporting platform (NCRP), a
 * VASP coordination portal (SAHYOG), an integrating LEA system, or manually by
 * an investigator.
 *
 * A complaint is the *entry point* of the attribution pipeline: it carries the
 * suspect wallet addresses a victim reported, and stores the automated
 * attribution verdict produced for each of them so an investigator sees the
 * nearest exchange/VASP without re-running the trace.
 */
import { Schema, Types, model, type Document, type Model } from "mongoose";
import { CHAINS, type Chain } from "./Investigation.model";

export const COMPLAINT_SOURCES = ["ncrp", "sahyog", "lea-api", "manual"] as const;
export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number];

/** Fraud typologies used by I4C-aligned reporting. */
export const FRAUD_TYPES = [
  "investment-scam",
  "task-based-fraud",
  "sextortion",
  "ransomware",
  "phishing",
  "darknet",
  "impersonation",
  "other",
] as const;
export type FraudType = (typeof FRAUD_TYPES)[number];

export const TRIAGE_STATUSES = [
  "received",
  "attributing",
  "attributed",
  "escalated",
  "closed",
  "failed",
] as const;
export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export const RISK_CATEGORIES = ["low", "moderate", "elevated", "high", "severe"] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export interface SuspectAddress {
  address: string;
  chain: Chain;
  /** Free-text note from the complaint, e.g. "UPI receipt referenced this". */
  note?: string;
  /** Attribution verdict for this address, produced by attribution.service. */
  attribution?: Record<string, unknown>;
  attributedAt?: Date;
}

export interface ComplaintDoc extends Document {
  _id: Types.ObjectId;
  reference: string;
  source: ComplaintSource;
  /** Acknowledgement number from the originating platform (NCRP ack, etc.). */
  externalRef?: string;
  reportedAt: Date;
  jurisdiction?: string;
  /** Only non-identifying victim context is stored — never raw PII. */
  victim: {
    maskedName?: string;
    state?: string;
    district?: string;
  };
  fraudType: FraudType;
  lossInr: number;
  narrative?: string;
  suspectAddresses: SuspectAddress[];
  triageStatus: TriageStatus;
  riskScore: number;
  riskCategory: RiskCategory;
  /** Denormalised headline: the nearest VASP found across all addresses. */
  primaryVasp?: {
    entity: string;
    address: string;
    chain: Chain;
    hops: number;
    confidence: number;
  };
  linkedCase?: Types.ObjectId;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const suspectAddressSchema = new Schema<SuspectAddress>(
  {
    address: { type: String, required: true, trim: true, maxlength: 128 },
    chain: { type: String, enum: CHAINS, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    attribution: { type: Schema.Types.Mixed },
    attributedAt: { type: Date },
  },
  { _id: false },
);

const complaintSchema = new Schema<ComplaintDoc>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, trim: true },
    source: { type: String, enum: COMPLAINT_SOURCES, required: true, index: true },
    externalRef: { type: String, trim: true, maxlength: 80, index: true },
    reportedAt: { type: Date, required: true, default: () => new Date() },
    jurisdiction: { type: String, trim: true, maxlength: 120 },
    victim: {
      maskedName: { type: String, trim: true, maxlength: 120 },
      state: { type: String, trim: true, maxlength: 80 },
      district: { type: String, trim: true, maxlength: 80 },
    },
    fraudType: { type: String, enum: FRAUD_TYPES, default: "other", required: true },
    lossInr: { type: Number, default: 0, min: 0 },
    narrative: { type: String, trim: true, maxlength: 4000 },
    suspectAddresses: { type: [suspectAddressSchema], default: [] },
    triageStatus: { type: String, enum: TRIAGE_STATUSES, default: "received", required: true, index: true },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskCategory: { type: String, enum: RISK_CATEGORIES, default: "low", required: true },
    primaryVasp: {
      entity: { type: String, trim: true },
      address: { type: String, trim: true },
      chain: { type: String, enum: CHAINS },
      hops: { type: Number, min: 0 },
      confidence: { type: Number, min: 0, max: 1 },
    },
    linkedCase: { type: Schema.Types.ObjectId, ref: "Case", index: true },
    failureReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

complaintSchema.index({ "suspectAddresses.address": 1 });
complaintSchema.index({ triageStatus: 1, riskScore: -1, createdAt: -1 });

export const Complaint: Model<ComplaintDoc> = model<ComplaintDoc>("Complaint", complaintSchema);
