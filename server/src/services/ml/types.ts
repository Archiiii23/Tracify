/**
 * TRACIFY AI System 1 — money-route prediction & multi-task intelligence.
 *
 * Designed to interface with the deployed model at https://tracify-new.streamlit.app
 * and provide full forensic explainability.
 *
 * 13 Input Features:
 *   1. text
 *   2. value_ratio
 *   3. time_delta
 *   4. same_asset
 *   5. hop_count
 *   6. amount_similarity
 *   7. degree
 *   8. fanout
 *   9. fanin
 *  10. address_age
 *  11. transaction_frequency
 *  12. entity_evidence
 *  13. path_length
 *
 * 5 Predicted Outputs:
 *   1. transaction/path relevance
 *   2. anomaly detection
 *   3. risk scoring
 *   4. candidate ranking
 *   5. behavior classification
 */

export interface PathFeatureVector {
  /** Textual narrative, victim description, or transaction context. */
  text: string;
  /** Fraction of seed/root value retained along the path (0.0–1.0). */
  value_ratio: number;
  /** Average or cumulative time gap in seconds between transactions. */
  time_delta: number;
  /** 1 when transfer stayed in the same token/asset, 0 if swapped/bridged. */
  same_asset: number;
  /** Number of discrete hops from root. */
  hop_count: number;
  /** Similarity ratio between consecutive transfer amounts (0.0–1.0). */
  amount_similarity: number;
  /** Cumulative degree (in-degree + out-degree) of path nodes. */
  degree: number;
  /** Max outgoing branching degree along the path. */
  fanout: number;
  /** Max incoming consolidation degree along the path. */
  fanin: number;
  /** Estimated age of path endpoints in days. */
  address_age: number;
  /** Historical transaction frequency (txs/day) across the path. */
  transaction_frequency: number;
  /** Forensic entity attribution score (0.0–1.0: VASP, mixer, bridge, sanctions). */
  entity_evidence: number;
  /** Total path length in hops. */
  path_length: number;

  // Legacy aliases for backward compatibility
  valueRetention?: number;
  valueMagnitude?: number;
  pathLength?: number;
  velocityGap?: number;
  maxFanOut?: number;
  linearity?: number;
  vaspProximity?: number;
  obfuscationExposure?: number;
  bridgeExposure?: number;
}

export const FEATURE_KEYS_13 = [
  "text",
  "value_ratio",
  "time_delta",
  "same_asset",
  "hop_count",
  "amount_similarity",
  "degree",
  "fanout",
  "fanin",
  "address_age",
  "transaction_frequency",
  "entity_evidence",
  "path_length",
] as const satisfies readonly (keyof PathFeatureVector)[];

export type FeatureKey13 = (typeof FEATURE_KEYS_13)[number];

export const FEATURE_KEYS = FEATURE_KEYS_13;
export type FeatureKey = FeatureKey13;

export interface RouteAnomalyPrediction {
  score: number; // 0–1
  isAnomaly: boolean;
  flag: "normal" | "suspicious" | "anomalous";
  reasons?: string[];
}

export interface FeatureContribution {
  feature: string;
  weight: number;
  value: number | string;
  contribution: number;
}

export interface RoutePredictionOutputs {
  /** Transaction / path investigative relevance (0–1). */
  relevance: number;
  /** Anomaly detection metrics and classification. */
  anomaly: RouteAnomalyPrediction;
  /** Composite forensic risk score (0–1). */
  riskScore: number;
  /** Candidate rank among traced routes (1 = primary target). */
  candidateRanking: number;
  /** Candidate ranking confidence (0–1). */
  candidateConfidence: number;
  /** Behavioral classification typology. */
  behaviorClassification: string;
  /** Signed per-feature contribution to the score for forensic audit. */
  contributions: FeatureContribution[];
}

export interface ScoredRoute extends RoutePredictionOutputs {
  /** Full address trail root → endpoint. */
  path: string[];
  txHashes: string[];
  endpoint: string;
  endpointEntity?: string;
  endpointIsVasp: boolean;
  valueUsd: number;
  hops: number;
  features: PathFeatureVector;
  priority: "critical" | "high" | "medium" | "low";
}

export interface RoutePredictionResult {
  rootAddress: string;
  generatedAt: Date;
  model: { id: string; kind: "baseline" | "remote"; version: string };
  winningRoute: ScoredRoute | null;
  routes: ScoredRoute[];
  note: string;
}

export interface MlProvider {
  id: string;
  kind: "baseline" | "remote";
  version: string;
  score(features: PathFeatureVector[]): Promise<RoutePredictionOutputs[]>;
}
