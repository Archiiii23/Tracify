/**
 * Remote ML provider — adapter for the model deployed at https://tracify-new.streamlit.app
 *
 * Supports POST /api/predict or POST /predict with all 13 features:
 *   text, value_ratio, time_delta, same_asset, hop_count, amount_similarity,
 *   degree, fanout, fanin, address_age, transaction_frequency, entity_evidence, path_length
 *
 * Extracts the 5 predicted outputs:
 *   1. relevance
 *   2. anomaly (score, flag)
 *   3. risk_score
 *   4. candidate_ranking
 *   5. behavior_classification
 *
 * Falls back gracefully to baseline calculation on connection/timeout error.
 */
import { logger } from "../../utils/logger";
import { baselineMlProvider } from "./baseline.provider";
import type { MlProvider, PathFeatureVector, RoutePredictionOutputs } from "./types";
import { FEATURE_KEYS_13 } from "./types";

export function createRemoteMlProvider(
  url: string,
  apiKey?: string,
  timeoutMs = 10_000,
): MlProvider {
  const cleanUrl = url.replace(/\/$/, "");
  const targetEndpoints = [
    `${cleanUrl}/api/predict`,
    `${cleanUrl}/predict`,
    `${cleanUrl}/v1/score-routes`,
  ];

  return {
    id: "tracify-streamlit-model",
    kind: "remote",
    version: "remote-streamlit-v1",
    async score(featureSets: PathFeatureVector[]): Promise<RoutePredictionOutputs[]> {
      const baselineOutputs = await baselineMlProvider.score(featureSets);

      // Attempt calling the remote endpoint
      let lastError: unknown = null;
      for (const endpoint of targetEndpoints) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
            },
            body: JSON.stringify({
              features: featureSets,
              featureKeys: FEATURE_KEYS_13,
            }),
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`Remote model returned HTTP ${res.status}`);
          }

          const rawBody = (await res.json()) as Record<string, unknown>;
          const remoteList = (
            Array.isArray(rawBody)
              ? rawBody
              : Array.isArray(rawBody.predictions)
                ? rawBody.predictions
                : Array.isArray(rawBody.results)
                  ? rawBody.results
                  : Array.isArray(rawBody.scores)
                    ? rawBody.scores
                    : null
          ) as unknown[] | null;

          if (!remoteList || remoteList.length !== featureSets.length) {
            throw new Error("Model response did not contain matching items array");
          }

          // Map the remote response to the 5 prediction outputs, filling in baseline where needed
          return remoteList.map((item, idx) => {
            const fallback = baselineOutputs[idx]!;
            if (typeof item === "number") {
              const score = Math.max(0, Math.min(1, item));
              return {
                ...fallback,
                riskScore: score,
              };
            }

            const rec = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
            const risk = typeof rec.risk_score === "number" ? rec.risk_score : typeof rec.riskScore === "number" ? rec.riskScore : fallback.riskScore;
            const rel = typeof rec.relevance === "number" ? rec.relevance : typeof rec.path_relevance === "number" ? rec.path_relevance : fallback.relevance;
            const rank = typeof rec.candidate_ranking === "number" ? rec.candidate_ranking : typeof rec.rank === "number" ? rec.rank : fallback.candidateRanking;
            const behavior = typeof rec.behavior_classification === "string" ? rec.behavior_classification : typeof rec.behavior === "string" ? rec.behavior : fallback.behaviorClassification;

            const anomalyRaw = rec.anomaly;
            let anomaly = fallback.anomaly;
            if (typeof anomalyRaw === "number") {
              anomaly = {
                score: anomalyRaw,
                isAnomaly: anomalyRaw >= 0.5,
                flag: anomalyRaw >= 0.75 ? "anomalous" : anomalyRaw >= 0.45 ? "suspicious" : "normal",
              };
            } else if (typeof anomalyRaw === "object" && anomalyRaw !== null) {
              const aObj = anomalyRaw as Record<string, unknown>;
              anomaly = {
                score: typeof aObj.score === "number" ? aObj.score : fallback.anomaly.score,
                isAnomaly: Boolean(aObj.isAnomaly ?? fallback.anomaly.isAnomaly),
                flag: (aObj.flag as "normal" | "suspicious" | "anomalous") ?? fallback.anomaly.flag,
                reasons: Array.isArray(aObj.reasons) ? (aObj.reasons as string[]) : fallback.anomaly.reasons,
              };
            }

            return {
              relevance: Math.max(0, Math.min(1, rel)),
              anomaly,
              riskScore: Math.max(0, Math.min(1, risk)),
              candidateRanking: rank,
              candidateConfidence: typeof rec.candidate_confidence === "number" ? rec.candidate_confidence : fallback.candidateConfidence,
              behaviorClassification: behavior,
              contributions: Array.isArray(rec.contributions) ? (rec.contributions as RoutePredictionOutputs["contributions"]) : fallback.contributions,
            };
          });
        } catch (err) {
          lastError = err;
          // Try next endpoint candidate
          continue;
        } finally {
          clearTimeout(timer);
        }
      }

      logger.warn("Remote Streamlit ML model unreachable — falling back to in-process baseline", {
        reason: lastError instanceof Error ? lastError.message : String(lastError),
      });
      return baselineOutputs;
    },
  };
}
