/**
 * Data provenance labels — forensic correctness (SIH26183 Rule 1–10).
 *
 * Every UI surface that presents analysis must distinguish observed blockchain
 * facts from derived, inferred, predicted, and AI-assisted content.
 */

export const PROVENANCE = {
  OBSERVED: "OBSERVED",
  DERIVED: "DERIVED",
  INFERRED: "INFERRED",
  PREDICTED: "PREDICTED",
  AI_ASSISTED: "AI-ASSISTED",
} as const;

export type ProvenanceKind = (typeof PROVENANCE)[keyof typeof PROVENANCE];

export const PROVENANCE_LABELS: Record<ProvenanceKind, string> = {
  OBSERVED: "Observed on-chain fact",
  DERIVED: "Derived from blockchain data",
  INFERRED: "Inferred from heuristics / labels",
  PREDICTED: "ML-ranked candidate (not evidence)",
  "AI-ASSISTED": "AI summary (not evidence)",
};

export const PROVENANCE_TONE: Record<ProvenanceKind, string> = {
  OBSERVED: "border-positive/30 bg-positive/10 text-positive",
  DERIVED: "border-primary/30 bg-primary/10 text-primary",
  INFERRED: "border-warning/30 bg-warning/10 text-warning",
  PREDICTED: "border-intel/30 bg-intel/10 text-intel",
  "AI-ASSISTED": "border-intel/40 bg-intel/15 text-intel",
};

/** Forensic wording helpers — never claim wallet ownership without authority. */
export const FORENSIC_COPY = {
  vaspLikely: "Likely VASP",
  attributedHigh: "Attributed with high confidence",
  exposure: "Evidence suggests exposure to",
  knownLabel: "Known service label",
  candidatePath: "Candidate value-flow path",
  heuristicRisk: "TRACIFY heuristic risk score",
  publicDataNote:
    "Blockchain data is public, but wallet ownership is not necessarily public.",
} as const;
