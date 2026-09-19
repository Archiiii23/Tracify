/**
 * Deterministic feature extraction for route scoring and ML inference.
 *
 * Extracts all 13 features expected by the deployed model at tracify-new.streamlit.app:
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
 */
import type { GraphEdge, GraphNode } from "../../models/Investigation.model";
import { OBFUSCATION_CATEGORIES } from "../blockchain/types";
import type { PathFeatureVector } from "./types";

export interface RawPath {
  path: string[];
  txHashes: string[];
  valueUsd: number;
}

/** Enumerate value-bearing trails root → sinks via BFS, capped for safety. */
export function enumeratePaths(
  rootAddress: string,
  edges: GraphEdge[],
  maxPaths = 64,
): RawPath[] {
  const outgoing = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.from) ?? [];
    list.push(e);
    outgoing.set(e.from, list);
  }

  const paths: RawPath[] = [];
  const queue: RawPath[] = [{ path: [rootAddress], txHashes: [], valueUsd: 0 }];
  while (queue.length > 0 && paths.length < maxPaths) {
    const current = queue.shift() as RawPath;
    const tail = current.path[current.path.length - 1] as string;
    const next = (outgoing.get(tail) ?? []).filter(
      (e) => !current.path.includes(e.to),
    );
    if (next.length === 0) {
      if (current.path.length > 1) paths.push(current);
      continue;
    }
    for (const e of next) {
      queue.push({
        path: [...current.path, e.to],
        txHashes: [...current.txHashes, e.txHash],
        valueUsd: e.valueUsd,
      });
    }
  }
  return paths;
}

export function extractPathFeatures(
  raw: RawPath,
  nodes: GraphNode[],
  edges: GraphEdge[],
  seedValueUsd: number,
  narrativeText?: string,
): PathFeatureVector {
  const byAddress = new Map(nodes.map((n) => [n.address, n]));
  
  // In-degree and out-degree maps
  const outDegree = new Map<string, number>();
  const inDegree = new Map<string, number>();
  for (const e of edges) {
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const hops = raw.path.length - 1;
  const endValue = raw.valueUsd;
  const valueRatio = seedValueUsd > 0 ? Math.min(1, endValue / seedValueUsd) : 0;

  // 1. Edge traversal timestamps & time_delta
  const edgeList = raw.txHashes
    .map((h) => edges.find((e) => e.txHash === h))
    .filter((e): e is GraphEdge => Boolean(e));

  const times = edgeList
    .map((e) => new Date(e.timestamp).getTime())
    .sort((a, b) => a - b);
    
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push(Math.max(1, ((times[i] as number) - (times[i - 1] as number)) / 1000));
  }
  const avgTimeDeltaSec = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 3600;

  // 2. Same asset check: check if assets change across edges (e.g., USDT -> ETH or cross-chain)
  const assets = new Set(edgeList.map((e) => e.asset?.toUpperCase() ?? "USD"));
  const sameAsset = assets.size <= 1 ? 1 : 0;

  // 3. Amount similarity across consecutive hops (1 - |v1 - v2| / max(v1, v2))
  let totalAmountSim = 1;
  if (edgeList.length > 1) {
    let simSum = 0;
    for (let i = 1; i < edgeList.length; i++) {
      const vPrev = Math.max(0.01, edgeList[i - 1]?.valueUsd ?? 0);
      const vCurr = Math.max(0.01, edgeList[i]?.valueUsd ?? 0);
      const diff = Math.abs(vPrev - vCurr);
      const denom = Math.max(vPrev, vCurr);
      simSum += Math.max(0, 1 - diff / denom);
    }
    totalAmountSim = simSum / (edgeList.length - 1);
  }

  // 4. Degree, fanout, fanin, branching
  let totalDegree = 0;
  let maxFanOut = 0;
  let maxFanIn = 0;
  let branched = 0;
  for (const addr of raw.path) {
    const outD = outDegree.get(addr) ?? 0;
    const inD = inDegree.get(addr) ?? 0;
    totalDegree += outD + inD;
    if (outD > maxFanOut) maxFanOut = outD;
    if (inD > maxFanIn) maxFanIn = inD;
    if (outD > 1) branched += 1;
  }

  // 5. Address age & transaction frequency estimation
  let minTime = Date.now();
  let maxTime = 0;
  for (const e of edgeList) {
    const t = new Date(e.timestamp).getTime();
    if (t < minTime) minTime = t;
    if (t > maxTime) maxTime = t;
  }
  const spanDays = Math.max(1, Math.round((Math.max(Date.now(), maxTime) - minTime) / 86400000));
  const avgAddressAgeDays = Math.max(14, spanDays);
  const txFrequencyPerDay = round(Math.max(1, totalDegree) / Math.max(1, avgAddressAgeDays));

  // 6. Entity evidence: attribution score
  const cats = raw.path.map((a) => (byAddress.get(a)?.category ?? "").toLowerCase());
  const obfuscation = cats.some((c) => OBFUSCATION_CATEGORIES.has(c)) ? 1 : 0;
  const bridge = cats.some((c) => c === "bridge" || c === "cross-chain" || c === "cross_chain") ? 1 : 0;

  const endNode = byAddress.get(raw.path[raw.path.length - 1] as string);
  const endIsVasp = Boolean(endNode?.isVasp);
  const vaspHops = nodes.filter((n) => n.isVasp).map((n) => n.hop);
  const nearestVaspHop = endIsVasp
    ? hops
    : vaspHops.length > 0
      ? Math.min(...vaspHops)
      : hops + 4;
  const distance = Math.max(0, nearestVaspHop - hops);

  let entityEvidence = 0.1;
  if (endIsVasp) entityEvidence = 0.95;
  else if (obfuscation) entityEvidence = 0.85;
  else if (bridge) entityEvidence = 0.75;
  else if (endNode?.entity || endNode?.label) entityEvidence = 0.6;
  else if (distance <= 1) entityEvidence = 0.45;

  // 7. Context narrative text
  const startAddr = raw.path[0] ?? "";
  const endAddr = raw.path[raw.path.length - 1] ?? "";
  const endpointDesc = endNode?.entity || (endIsVasp ? "Exchange deposit cluster" : endNode?.label || "Unattributed wallet");
  const textSummary = narrativeText?.trim()
    ? narrativeText.trim()
    : `Fund transfer trail of ${hops} hops carrying ~$${Math.round(endValue).toLocaleString()} from ${startAddr.slice(0, 8)} to ${endpointDesc} (${endAddr.slice(0, 8)}).`;

  const velocityGap = 1 - Math.min(1, Math.log10(avgTimeDeltaSec + 1) / 6);

  return {
    // 13 Model Features
    text: textSummary,
    value_ratio: round(valueRatio),
    time_delta: Math.round(avgTimeDeltaSec),
    same_asset: sameAsset,
    hop_count: hops,
    amount_similarity: round(totalAmountSim),
    degree: totalDegree,
    fanout: maxFanOut,
    fanin: maxFanIn,
    address_age: avgAddressAgeDays,
    transaction_frequency: txFrequencyPerDay,
    entity_evidence: round(entityEvidence),
    path_length: hops,

    // Backward-compatibility aliases
    valueRetention: round(valueRatio),
    valueMagnitude: round(Math.min(1, Math.log10(endValue + 1) / 7)),
    pathLength: round(Math.min(1, hops / 8)),
    velocityGap: round(velocityGap),
    maxFanOut: round(Math.min(1, maxFanOut / 6)),
    linearity: branched === 0 ? 1 : round(1 - branched / raw.path.length),
    vaspProximity: round(1 / (1 + distance)),
    obfuscationExposure: obfuscation,
    bridgeExposure: bridge,
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
