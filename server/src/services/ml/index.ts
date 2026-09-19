/**
 * Money-route prediction pipeline (AI System 1).
 *
 * Candidate paths are enumerated algorithmically from the traced graph; the
 * configured ML provider (Streamlit remote or in-process baseline) scores the 13-feature
 * vectors and returns 5 multi-task predictions:
 *   1. relevance
 *   2. anomaly detection
 *   3. risk scoring
 *   4. candidate ranking
 *   5. behavior classification
 */
import { env } from "../../config/env";
import type { Chain, GraphEdge, GraphNode } from "../../models/Investigation.model";
import { logger } from "../../utils/logger";
import { baselineMlProvider } from "./baseline.provider";
import { enumeratePaths, extractPathFeatures } from "./features";
import { createRemoteMlProvider } from "./remote.provider";
import type { MlProvider, RoutePredictionOutputs, RoutePredictionResult, ScoredRoute } from "./types";

function resolveProvider(): MlProvider {
  if (env.hasRemoteMl && env.TRACIFY_ML_URL) {
    return createRemoteMlProvider(env.TRACIFY_ML_URL, env.TRACIFY_ML_API_KEY, env.TRACIFY_ML_TIMEOUT_MS);
  }
  return baselineMlProvider;
}

function priority(score: number): ScoredRoute["priority"] {
  if (score >= 0.85) return "critical";
  if (score >= 0.65) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export async function predictMoneyRoutes(input: {
  chain: Chain;
  rootAddress: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxRoutes?: number;
  narrativeText?: string;
}): Promise<RoutePredictionResult> {
  const seedValue = input.nodes.find((n) => n.hop === 0)?.valueUsd ?? 0;
  const rawPaths = enumeratePaths(input.rootAddress, input.edges);
  const byAddress = new Map(input.nodes.map((n) => [n.address, n]));

  const provider = resolveProvider();
  let usedProvider = provider;
  const featureSets = rawPaths.map((p) =>
    extractPathFeatures(p, input.nodes, input.edges, seedValue, input.narrativeText)
  );

  let predictions: RoutePredictionOutputs[];
  try {
    predictions = await provider.score(featureSets);
  } catch (error) {
    logger.warn("Remote ML unavailable — degrading to in-process multi-task baseline model", {
      reason: error instanceof Error ? error.message : String(error),
    });
    usedProvider = baselineMlProvider;
    predictions = await baselineMlProvider.score(featureSets);
  }

  const routes: ScoredRoute[] = rawPaths
    .map((p, i) => {
      const endpoint = p.path[p.path.length - 1] as string;
      const endNode = byAddress.get(endpoint);
      const s = predictions[i] as RoutePredictionOutputs;
      return {
        path: p.path,
        txHashes: p.txHashes,
        endpoint,
        ...(endNode?.entity || endNode?.label
          ? { endpointEntity: endNode.entity ?? endNode.label }
          : {}),
        endpointIsVasp: Boolean(endNode?.isVasp),
        valueUsd: Math.round(p.valueUsd),
        hops: p.path.length - 1,
        features: featureSets[i] as ScoredRoute["features"],
        riskScore: s.riskScore,
        priority: priority(s.riskScore),
        relevance: s.relevance,
        anomaly: s.anomaly,
        candidateRanking: s.candidateRanking,
        candidateConfidence: s.candidateConfidence,
        behaviorClassification: s.behaviorClassification,
        contributions: s.contributions,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore || b.relevance - a.relevance || b.valueUsd - a.valueUsd)
    .slice(0, input.maxRoutes ?? 10);

  const winning = routes[0] ?? null;
  return {
    rootAddress: input.rootAddress,
    generatedAt: new Date(),
    model: { id: usedProvider.id, kind: usedProvider.kind, version: usedProvider.version },
    winningRoute: winning,
    routes,
    note: winning
      ? `Primary flagged route (#${winning.candidateRanking}): ${winning.path.length} addresses, ${winning.hops} hops, ~$${winning.valueUsd.toLocaleString()} reaching ${winning.endpointEntity ?? "an unattributed endpoint"} · Typology: ${winning.behaviorClassification} · Anomaly: ${winning.anomaly.flag.toUpperCase()} (${Math.round(winning.anomaly.score * 100)}%) · Forensic Risk: ${Math.round(winning.riskScore * 100)}/100.`
      : "No outbound value path was found within the hop bound.",
  };
}
