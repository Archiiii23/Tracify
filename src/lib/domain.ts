/**
 * TRACIFY domain model.
 *
 * These types mirror the database schema and are the single contract shared by
 * the data layer (src/lib/api), the intelligence service layer (src/services)
 * and the UI. Extending the product means extending this file first.
 */

export const CASE_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export const CASE_STATUSES = [
  "active",
  "under_review",
  "report_generated",
  "closed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const INVESTIGATION_STATUSES = [
  "draft",
  "queued",
  "processing",
  "complete",
  "failed",
] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const BLOCKCHAINS = [
  { id: "ethereum", label: "Ethereum", symbol: "ETH", supported: true },
  { id: "polygon", label: "Polygon", symbol: "MATIC", supported: true },
  { id: "bsc", label: "BNB Smart Chain", symbol: "BNB", supported: true },
  { id: "arbitrum", label: "Arbitrum One", symbol: "ETH", supported: true },
  { id: "base", label: "Base", symbol: "ETH", supported: true },
  { id: "bitcoin", label: "Bitcoin", symbol: "BTC", supported: false },
  { id: "tron", label: "Tron", symbol: "TRX", supported: false },
] as const;

export const EVIDENCE_TYPES = [
  "transaction",
  "wallet",
  "graph_snapshot",
  "note",
  "document",
  "screenshot",
  "reference",
] as const;

/** Bounded multi-hop trace limits (investigation graph). */
export const MIN_TRACE_DEPTH = 1;
export const MAX_TRACE_DEPTH = 20;
export const DEFAULT_TRACE_DEPTH = 5;
export const TRACE_DEPTH_OPTIONS = Array.from(
  { length: MAX_TRACE_DEPTH - MIN_TRACE_DEPTH + 1 },
  (_, i) => MIN_TRACE_DEPTH + i,
);
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface InvestigationSummary {
  hops?: number;
  addresses?: number;
  transactions?: number;
  relevantPaths?: number;
  vaspCandidates?: number;
  valueTraced?: string;
  continuity?: number;
  /** Pipeline orchestration state */
  pipelineStage?: string;
  progress?: number;
  pipelineNote?: string;
  dataSource?: "live" | "fallback";
  isLive?: boolean;
  rawTxCount?: number;
  error?: string;
  /** Persisted analysis artifact (graph, paths, entities, signals, timeline) */
  graph?: unknown;
  paths?: unknown;
  entities?: unknown;
  signals?: unknown;
  timeline?: unknown;
  generatedFindings?: unknown;
  /** Unified heuristic investigation risk (0–100). */
  riskScore?: number;
  riskBand?: "low" | "medium" | "high" | "critical";
  riskFactors?: Array<{
    id: string;
    label: string;
    contribution: number;
    description: string;
  }>;
  riskNodeScores?: Record<string, number>;
}

export interface CaseRecord {
  id: string;
  case_ref: string;
  title: string;
  description: string | null;
  priority: CasePriority;
  status: CaseStatus;
  jurisdiction: string | null;
  reported_loss: number | null;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestigationRecord {
  id: string;
  investigation_ref: string;
  case_id: string;
  name: string;
  description: string | null;
  target_address: string;
  blockchain: string;
  trace_depth: number;
  window_start: string | null;
  window_end: string | null;
  min_value: number | null;
  status: InvestigationStatus;
  summary: InvestigationSummary;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface FindingRelated {
  addresses?: string[];
  txHashes?: string[];
  paths?: string[];
  entity?: string;
  pattern?: string;
}

export interface FindingRecord {
  id: string;
  finding_ref: string;
  case_id: string | null;
  investigation_id: string | null;
  title: string;
  description: string | null;
  severity: Severity;
  confidence: number;
  finding_type: string | null;
  related: FindingRelated;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceRecord {
  id: string;
  evidence_ref: string;
  case_id: string | null;
  investigation_id: string | null;
  finding_id: string | null;
  title: string;
  evidence_type: EvidenceType;
  description: string | null;
  source: string | null;
  attachment_url: string | null;
  metadata: Record<string, unknown>;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRecord {
  id: string;
  report_ref: string;
  case_id: string | null;
  investigation_id: string | null;
  title: string;
  status: string;
  sections: string[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ---------- Presentation helpers ---------- */

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  active: "Active",
  under_review: "Under review",
  report_generated: "Report generated",
  closed: "Closed",
};

export const INVESTIGATION_STATUS_LABEL: Record<InvestigationStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
  failed: "Failed",
};

export function truncateAddress(address: string, lead = 6, tail = 4) {
  if (!address || address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function chainLabel(id: string) {
  return BLOCKCHAINS.find((c) => c.id === id)?.label ?? id;
}
