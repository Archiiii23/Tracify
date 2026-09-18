import { Schema, Types, model, type Document, type Model } from "mongoose";

export const TRACE_STATUSES = [
  "queued",
  "tracing",
  "analysing",
  "complete",
  "failed",
] as const;
export type TraceStatus = (typeof TRACE_STATUSES)[number];

export const CHAINS = ["ethereum", "polygon", "tron", "bitcoin", "bsc", "arbitrum"] as const;
export type Chain = (typeof CHAINS)[number];

export interface GraphNode {
  address: string;
  chain: Chain;
  label?: string;
  entity?: string;
  category?: string;
  riskScore: number;
  hop: number;
  valueUsd: number;
  isVasp: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  txHash: string;
  asset: string;
  amount: number;
  valueUsd: number;
  timestamp: Date;
  hop: number;
}

export interface StoredTransaction {
  txHash: string;
  chain: Chain;
  blockNumber?: number;
  timestamp?: Date;
  from: string;
  to: string;
  asset: string;
  amount: number;
  valueUsd?: number;
  direction?: "in" | "out";
  status: "success" | "failed" | "pending";
  provider: string;
}

export const PIPELINE_STAGES = [
  "QUEUED",
  "VALIDATING",
  "CONNECTING_TO_CHAIN",
  "FETCHING_HISTORY",
  "NORMALIZING_DATA",
  "BUILDING_GRAPH",
  "ANALYZING_PATTERNS",
  "ATTRIBUTING_ENTITIES",
  "GENERATING_FINDINGS",
  "COMPLETED",
  "FAILED",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface InvestigationDoc extends Document {
  _id: Types.ObjectId;
  reference: string;
  case: Types.ObjectId;
  title: string;
  rootAddress: string;
  chain: Chain;
  direction: "outbound" | "inbound" | "both";
  maxHops: number;
  minValueUsd: number;
  status: TraceStatus;
  progress: number;
  /** Which chain-data provider produced the stored graph. */
  dataSource: "graphsense" | "synthetic" | "etherscan";
  progressNote?: string;
  pipelineStage?: PipelineStage;
  normalizedTransactions: StoredTransaction[];
  riskScore: number;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  metrics: {
    addressesTouched: number;
    hopsTraced: number;
    valueTracedUsd: number;
    vaspTouchpoints: number;
    retainedValuePct: number;
  };
  startedBy: Types.ObjectId;
  completedAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const nodeSchema = new Schema<GraphNode>(
  {
    address: { type: String, required: true, trim: true },
    chain: { type: String, enum: CHAINS, required: true },
    label: String,
    entity: String,
    category: String,
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    hop: { type: Number, default: 0, min: 0 },
    valueUsd: { type: Number, default: 0 },
    isVasp: { type: Boolean, default: false },
  },
  { _id: false },
);

const storedTxSchema = new Schema<StoredTransaction>(
  {
    txHash: { type: String, required: true },
    chain: { type: String, enum: CHAINS, required: true },
    blockNumber: Number,
    timestamp: Date,
    from: { type: String, required: true },
    to: { type: String, required: true },
    asset: { type: String, required: true },
    amount: { type: Number, default: 0 },
    valueUsd: Number,
    direction: { type: String, enum: ["in", "out"] },
    status: { type: String, enum: ["success", "failed", "pending"], default: "success" },
    provider: { type: String, default: "synthetic" },
  },
  { _id: false },
);

const edgeSchema = new Schema<GraphEdge>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    txHash: { type: String, required: true },
    asset: { type: String, required: true },
    amount: { type: Number, default: 0 },
    valueUsd: { type: Number, default: 0 },
    timestamp: { type: Date, required: true },
    hop: { type: Number, default: 0 },
  },
  { _id: false },
);

const investigationSchema = new Schema<InvestigationDoc>(
  {
    reference: { type: String, required: true, unique: true, uppercase: true, trim: true },
    case: { type: Schema.Types.ObjectId, ref: "Case", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    rootAddress: { type: String, required: true, trim: true, maxlength: 128, index: true },
    chain: { type: String, enum: CHAINS, required: true },
    direction: { type: String, enum: ["outbound", "inbound", "both"], default: "outbound" },
    maxHops: { type: Number, default: 5, min: 1, max: 10 },
    minValueUsd: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: TRACE_STATUSES, default: "queued", index: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    dataSource: { type: String, enum: ["graphsense", "synthetic", "etherscan"], default: "synthetic" },
    progressNote: { type: String, maxlength: 200 },
    pipelineStage: { type: String, enum: PIPELINE_STAGES, default: "QUEUED" },
    normalizedTransactions: { type: [storedTxSchema], default: [] },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    graph: {
      nodes: { type: [nodeSchema], default: [] },
      edges: { type: [edgeSchema], default: [] },
    },
    metrics: {
      addressesTouched: { type: Number, default: 0 },
      hopsTraced: { type: Number, default: 0 },
      valueTracedUsd: { type: Number, default: 0 },
      vaspTouchpoints: { type: Number, default: 0 },
      retainedValuePct: { type: Number, default: 0 },
    },
    startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    completedAt: { type: Date },
    failureReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

investigationSchema.index({ case: 1, updatedAt: -1 });

export const Investigation: Model<InvestigationDoc> = model<InvestigationDoc>(
  "Investigation",
  investigationSchema,
);
