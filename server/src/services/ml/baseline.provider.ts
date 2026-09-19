/**
 * Baseline in-process multi-task ML model.
 *
 * Implements deterministic scoring and explainable predictions across the 5 target tasks:
 *   1. transaction/path relevance
 *   2. anomaly detection
 *   3. risk scoring
 *   4. candidate ranking
 *   5. behavior classification
 */
import type {
  FeatureContribution,
  MlProvider,
  PathFeatureVector,
  RoutePredictionOutputs,
} from "./types";

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export const baselineMlProvider: MlProvider = {
  id: "tracify-baseline-multitask",
  kind: "baseline",
  version: "2.0.0",
  async score(featureSets: PathFeatureVector[]): Promise<RoutePredictionOutputs[]> {
    // 1. First pass: compute preliminary risk and anomaly scores for each path
    const results = featureSets.map((f) => {
      // Risk scoring calculation
      let zRisk = -1.8;
      const contributions: FeatureContribution[] = [];

      const weights = {
        value_ratio: 1.5,
        entity_evidence: 1.8,
        amount_similarity: 0.8,
        fanout: 0.7,
        time_delta: -0.6, // shorter time_delta -> higher risk
        same_asset: 0.4,
        degree: 0.3,
        path_length: 0.4,
      };

      // Normalized time delta factor (0 to 1, where fast = 1)
      const fastVelocity = Math.max(0, 1 - Math.min(1, Math.log10(f.time_delta + 1) / 5));

      const addContrib = (feat: string, weight: number, rawVal: number | string, normalizedVal: number) => {
        const c = weight * normalizedVal;
        zRisk += c;
        contributions.push({
          feature: feat,
          weight,
          value: rawVal,
          contribution: round(c),
        });
      };

      addContrib("value_ratio", weights.value_ratio, f.value_ratio, f.value_ratio);
      addContrib("entity_evidence", weights.entity_evidence, f.entity_evidence, f.entity_evidence);
      addContrib("amount_similarity", weights.amount_similarity, f.amount_similarity, f.amount_similarity);
      addContrib("fanout", weights.fanout, f.fanout, Math.min(1, f.fanout / 6));
      addContrib("time_delta", 0.9, `${f.time_delta}s`, fastVelocity);
      addContrib("same_asset", weights.same_asset, f.same_asset ? "yes" : "no", f.same_asset);
      addContrib("degree", weights.degree, f.degree, Math.min(1, f.degree / 20));
      addContrib("path_length", weights.path_length, f.path_length, Math.min(1, f.path_length / 6));

      contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
      const riskScore = round(sigmoid(zRisk));

      // 2. Anomaly detection: evaluates structural oddities (rapid velocity, heavy fanout, peel chain)
      const anomalyIndicators: string[] = [];
      let anomalyScore = 0.15;
      if (f.time_delta < 180) {
        anomalyScore += 0.35;
        anomalyIndicators.push(`Sub-3 minute hop velocity (${f.time_delta}s)`);
      }
      if (f.fanout >= 4) {
        anomalyScore += 0.25;
        anomalyIndicators.push(`Elevated fan-out branching (${f.fanout} outputs)`);
      }
      if (f.amount_similarity > 0.88 && f.value_ratio > 0.7) {
        anomalyScore += 0.2;
        anomalyIndicators.push("High value continuity preservation across hops");
      }
      if (f.entity_evidence >= 0.8) {
        anomalyScore += 0.25;
        anomalyIndicators.push("Attributed entity / mixer endpoint identified");
      }
      anomalyScore = Math.min(0.99, round(anomalyScore));

      const anomalyFlag =
        anomalyScore >= 0.75
          ? ("anomalous" as const)
          : anomalyScore >= 0.45
            ? ("suspicious" as const)
            : ("normal" as const);

      // 3. Relevance: How forensically relevant is this candidate trail to investigators?
      const relevance = round(
        Math.min(
          1,
          0.35 * f.value_ratio +
          0.35 * f.entity_evidence +
          0.2 * f.amount_similarity +
          0.1 * (f.path_length > 0 ? 1 : 0)
        )
      );

      // 4. Behavior classification:
      let behavior = "Direct Transfer";
      if (f.entity_evidence >= 0.85) {
        behavior = "Mixer / Obfuscation Service";
      } else if (f.same_asset === 0) {
        behavior = "Cross-Chain Bridge Hopping";
      } else if (f.fanout >= 3) {
        behavior = "Fan-out Layering";
      } else if (f.amount_similarity >= 0.85 && f.fanin > 1) {
        behavior = "Peel Chain Fragmentation";
      } else if (f.time_delta < 300) {
        behavior = "Rapid Pass-through Movement";
      } else if (f.entity_evidence >= 0.6) {
        behavior = "VASP Deposit Inflow";
      } else if (f.fanin >= 2) {
        behavior = "Fund Consolidation";
      }

      return {
        relevance,
        anomaly: {
          score: anomalyScore,
          isAnomaly: anomalyFlag !== "normal",
          flag: anomalyFlag,
          reasons: anomalyIndicators,
        },
        riskScore,
        candidateRanking: 1,
        candidateConfidence: round(Math.max(0.4, riskScore * 0.95)),
        behaviorClassification: behavior,
        contributions,
      };
    });

    // 5. Compute candidate rankings (1 = top priority) based on risk and relevance
    const indexed = results.map((r, idx) => ({ idx, score: r.riskScore * 0.6 + r.relevance * 0.4 }));
    indexed.sort((a, b) => b.score - a.score);
    indexed.forEach((item, rank) => {
      const target = results[item.idx];
      if (target) {
        target.candidateRanking = rank + 1;
        target.candidateConfidence = round(Math.max(0.45, 1 - rank * 0.12));
      }
    });

    return results;
  },
};
