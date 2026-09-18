/**
 * Contract mirror for the TRACIFY intelligence backend (`/server`).
 *
 * These types are hand-mirrored from the Express/Mongoose domain so the UI has
 * a single, explicit contract for the attribution pipeline: complaint intake →
 * nearest-VASP attribution → alerts → standardised LEA report.
 */

export const COMPLAINT_SOURCES = ["ncrp", "sahyog", "lea-api", "manual"] as const;
export type ComplaintSource = (typeof COMPLAINT_SOURCES)[number];

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

export const ALERT_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = ["open", "acknowledged", "actioned", "dismissed"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const FRAUD_TYPE_LABEL: Record<FraudType, string> = {
  "investment-scam": "Investment scam",
  "task-based-fraud": "Task-based fraud",
  sextortion: "Sextortion",
  ransomware: "Ransomware",
  phishing: "Phishing",
  darknet: "Darknet market",
  impersonation: "Impersonation",
  other: "Other",
};

export const COMPLAINT_SOURCE_LABEL: Record<ComplaintSource, string> = {
  ncrp: "NCRP",
  sahyog: "SAHYOG",
  "lea-api": "LEA API",
  manual: "Manual",
};

export interface VaspAttribution {
  address: string;
  chain: string;
  entity: string;
  category?: string;
  hops: number;
  directDeposit: boolean;
  valueUsd: number;
  confidence: number;
  path: string[];
  txHashes: string[];
  firstSeen?: string;
  lastSeen?: string;
}

export interface IntermediaryWallet {
  address: string;
  hop: number;
  valueUsd: number;
  role: "layering" | "splitter" | "consolidator" | "pass-through";
  reason: string;
}

export interface TypologyPrediction {
  /** Backend field name for the predicted typology. */
  typology: FraudType | "unknown";
  label: string;
  confidence: number;
  drivers: { feature: string; contribution: number; note: string }[];
}

export interface BehaviouralSignal {
  code: string;
  label: string;
  severity: string;
  explanation: string;
}

export interface AttributionSummary {
  address: string;
  chain: string;
  dataSource: "graphsense" | "synthetic";
  live: boolean;
  generatedAt: string;
  riskScore: number;
  riskCategory: RiskCategory;
  riskReasons: string[];
  typology: TypologyPrediction;
  nearestVasp: VaspAttribution | null;
  vaspCandidates: VaspAttribution[];
  intermediaries: IntermediaryWallet[];
  crossChain: { detected: boolean; note: string; bridgeHops: { address: string; hop: number; entity?: string; valueUsd: number }[] };
  obfuscation: { detected: boolean; note: string; services: { address: string; hop: number; entity?: string; valueUsd: number }[] };
  signals: BehaviouralSignal[];
  metrics: {
    addressesTouched: number;
    hopsTraced: number;
    valueTracedUsd: number;
    vaspTouchpoints: number;
    retainedValuePct: number;
  };
  freezeActionable: boolean;
  recommendations: string[];
}

export interface SuspectAddress {
  address: string;
  chain: string;
  note?: string;
  attribution?: AttributionSummary;
  attributedAt?: string;
}

export interface Complaint {
  id: string;
  reference: string;
  source: ComplaintSource;
  externalRef?: string;
  reportedAt: string;
  jurisdiction?: string;
  victim: { maskedName?: string; state?: string; district?: string };
  fraudType: FraudType;
  lossInr: number;
  narrative?: string;
  suspectAddresses: SuspectAddress[];
  triageStatus: TriageStatus;
  riskScore: number;
  riskCategory: RiskCategory;
  primaryVasp?: {
    entity: string;
    address: string;
    chain: string;
    hops: number;
    confidence: number;
  };
  linkedCase?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  code: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  summary: string;
  recommendedActions: string[];
  chain?: string;
  addresses: string[];
  complaint?: string;
  case?: string;
  investigation?: string;
  evidence: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LeaReport {
  title: string;
  reference: string;
  generatedAt: string;
  classification: "restricted";
  complaint: {
    reference: string;
    source: string;
    externalRef?: string;
    reportedAt: string;
    jurisdiction?: string;
    fraudType: string;
    lossInr: number;
    victimState?: string;
  };
  assessment: {
    riskScore: number;
    riskCategory: string;
    typology: string;
    typologyConfidence: number;
    freezeActionable: boolean;
  };
  attributedVasps: {
    entity: string;
    depositAddress: string;
    chain: string;
    hops: number;
    directDeposit: boolean;
    valueUsd: number;
    confidence: number;
    transactionReferences: string[];
  }[];
  transactionTrails: {
    reportedAddress: string;
    chain: string;
    dataSource: string;
    trail: string[];
    intermediaries: { address: string; hop: number; role: string; reason: string }[];
  }[];
  indicators: {
    crossChain: string;
    obfuscation: string;
    behavioural: BehaviouralSignal[];
  };
  alerts: { code: string; title: string; severity: string; summary: string }[];
  recommendedActions: string[];
  caveats: string[];
}

export interface TriageQueue {
  received: number;
  attributing: number;
  attributed: number;
  escalated: number;
  failed: number;
  [key: string]: number;
}

export interface BackendUser {
  id: string;
  name?: string;
  email: string;
  role: string;
}

/* ---------------- AI systems ---------------- */

export interface AiSystemsStatus {
  routeModel: { configured: "baseline" | "remote"; id: string; healthy: boolean };
  copilot: {
    configured: string;
    model: string;
    egress: { fullAddresses: boolean; victimDetails: boolean };
  };
  investigationAgent?: {
    configured: boolean;
    model: string;
    mode: string;
    budgets: { maxToolCalls: number; maxRuntimeSeconds: number; maxHops: number };
  };
}

export type AgentRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_REVIEW"
  | "COMPLETED"
  | "FAILED"
  | "BUDGET_EXCEEDED";

export interface AgentRunSummary {
  id: string;
  status: AgentRunStatus;
  stage: string;
  chain: string;
  rootAddress: string;
  objective?: string;
  toolCalls?: number;
  assessment?: string;
  plan?: string[];
  geminiConfigured?: boolean;
  error?: string;
  completedAt?: string;
  createdAt?: string;
  externalInvestigationId?: string;
  updatedAt?: string;
}

export interface AgentEventRecord {
  id: string;
  timestamp: string;
  eventType: string;
  toolName?: string;
  resultSummary?: string;
  success: boolean;
  latencyMs?: number;
  stage?: string;
}

export interface RouteAnomalyPrediction {
  score: number;
  isAnomaly: boolean;
  flag: "normal" | "suspicious" | "anomalous";
  reasons?: string[];
}

export interface Route13Features {
  text: string;
  value_ratio: number;
  time_delta: number;
  same_asset: number;
  hop_count: number;
  amount_similarity: number;
  degree: number;
  fanout: number;
  fanin: number;
  address_age: number;
  transaction_frequency: number;
  entity_evidence: number;
  path_length: number;
  [key: string]: unknown;
}

export interface RouteFeatureContribution {
  feature: string;
  weight: number;
  value: number | string;
  contribution: number;
}

export interface ScoredRoute {
  path: string[];
  txHashes: string[];
  endpoint: string;
  endpointEntity?: string;
  endpointIsVasp: boolean;
  valueUsd: number;
  hops: number;
  features: Route13Features;
  riskScore: number;
  priority: "critical" | "high" | "medium" | "low";
  relevance?: number;
  anomaly?: RouteAnomalyPrediction;
  candidateRanking?: number;
  candidateConfidence?: number;
  behaviorClassification?: string;
  contributions: RouteFeatureContribution[];
}

export interface RoutePrediction {
  rootAddress: string;
  generatedAt: string;
  model: { id: string; kind: "baseline" | "remote"; version: string };
  winningRoute: ScoredRoute | null;
  routes: ScoredRoute[];
  note: string;
}

export interface CopilotAnswer {
  answer: string;
  provider: string;
  model: string;
  external: boolean;
  dataPolicy: { fullAddresses: boolean; victimDetails: boolean };
  groundingKeys: number;
}
