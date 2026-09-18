/**
 * End-to-end investigation pipeline — SIH26183 Phases 4–16.
 *
 * Orchestrates real wallet analysis: validate → ingest → graph → paths →
 * entity correlation → findings, persisting progress to Supabase.
 */

import type { InvestigationRecord } from "@/lib/domain";
import { updateInvestigation, createFinding } from "@/lib/api/queries";
import { validateAddress } from "./blockchain/liveAdapter";
import { buildLiveInvestigationGraph, type GraphBuildResult, type GraphBuildSnapshot } from "./blockchain/graphEngine";
import { scoreInvestigationRisk } from "./riskEngine";

export const PIPELINE_STAGES = [
  { key: "validate", label: "Target Address Validated", progress: 10 },
  { key: "connect", label: "Blockchain Source Connected", progress: 18 },
  { key: "retrieve", label: "Retrieving On-Chain Transactions", progress: 35 },
  { key: "normalize", label: "Normalizing Transaction Data", progress: 48 },
  { key: "graph", label: "Constructing Bounded Investigation Graph", progress: 65 },
  { key: "paths", label: "Analyzing Fund Flow & Value Continuity", progress: 78 },
  { key: "correlate", label: "Correlating Entity Intelligence", progress: 88 },
  { key: "findings", label: "Generating Investigative Findings", progress: 96 },
  { key: "ready", label: "Investigation Ready", progress: 100 },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]["key"];

export interface PipelineProgress {
  stage: PipelineStageKey;
  progress: number;
  note: string;
}

export type PipelineProgressCallback = (progress: PipelineProgress) => void;
export type PipelineGraphProgressCallback = (snapshot: GraphBuildSnapshot) => void;

export interface PipelineRunOptions {
  onProgress?: PipelineProgressCallback;
  onGraphProgress?: PipelineGraphProgressCallback;
}

function stageInfo(key: PipelineStageKey) {
  return PIPELINE_STAGES.find((s) => s.key === key)!;
}

async function persistProgress(
  investigationId: string,
  stage: PipelineStageKey,
  note: string,
  extra: Record<string, unknown> = {},
) {
  const info = stageInfo(stage);
  await updateInvestigation(investigationId, {
    status: stage === "ready" ? "complete" : "processing",
    summary: {
      pipelineStage: stage,
      progress: info.progress,
      pipelineNote: note,
      ...extra,
    },
    ...(stage === "ready" ? { completed_at: new Date().toISOString() } : {}),
  });
}

/** Runs the full investigation pipeline and persists results to Supabase. */
export async function runInvestigationPipeline(
  investigation: InvestigationRecord,
  options?: PipelineRunOptions | PipelineProgressCallback,
): Promise<GraphBuildResult> {
  const opts: PipelineRunOptions =
    typeof options === "function" ? { onProgress: options } : (options ?? {});
  const onProgress = opts.onProgress;
  const onGraphProgress = opts.onGraphProgress;

  let persistGraphTimer: ReturnType<typeof setTimeout> | null = null;
  const schedulePartialGraphPersist = (snapshot: GraphBuildSnapshot) => {
    onGraphProgress?.(snapshot);
    if (persistGraphTimer) clearTimeout(persistGraphTimer);
    persistGraphTimer = setTimeout(() => {
      void updateInvestigation(investigation.id, {
        status: "processing",
        summary: {
          pipelineStage: "graph",
          progress: stageInfo("graph").progress,
          pipelineNote: `Discovering addresses… ${snapshot.nodeCount} node${snapshot.nodeCount === 1 ? "" : "s"}, ${snapshot.edgeCount} transfer${snapshot.edgeCount === 1 ? "" : "s"}`,
          graph: snapshot.graph,
          buildingGraph: true,
        },
      });
    }, 200);
  };

  const emit = (stage: PipelineStageKey, note: string) => {
    const info = stageInfo(stage);
    onProgress?.({ stage, progress: info.progress, note });
  };

  try {
    // Phase 4: Address validation
    emit("validate", "Checking address format and chain compatibility…");
    const validation = validateAddress(investigation.target_address, investigation.blockchain);
    if (!validation.valid) {
      throw new Error(validation.error ?? "Invalid wallet address");
    }
    await persistProgress(investigation.id, "validate", validation.format);

    // Phase 5: Blockchain connection
    emit("connect", `Connecting to ${investigation.blockchain.toUpperCase()} indexer…`);
    await persistProgress(investigation.id, "connect", `EVM adapter ready for ${investigation.blockchain}`);

    // Phases 6–7: Retrieve & normalize (handled inside graphEngine)
    emit("retrieve", "Fetching live on-chain transaction history…");
    await updateInvestigation(investigation.id, { status: "processing" });

    emit("normalize", "Cleaning, deduplicating and scoring transactions…");

    // Phases 8–12: Graph construction + path analysis (90s budget)
    emit("graph", `Expanding bounded graph to ${investigation.trace_depth} hops…`);
    const result = await buildLiveInvestigationGraph(investigation, {
      onHopProgress: (hop, total) => {
        emit("graph", `Tracing hop ${hop} of ${total}…`);
      },
      onGraphProgress: schedulePartialGraphPersist,
    });

    if (persistGraphTimer) clearTimeout(persistGraphTimer);

    emit("paths", `Ranked ${result.paths.length} value-continuity paths`);
    emit("correlate", `Matched ${result.entities.length} entity/VASP candidates`);

    // Phase 16: Auto-generate findings (parallel)
    emit("findings", "Recording evidence-backed investigative findings…");
    await Promise.allSettled(
      result.generatedFindings.slice(0, 5).map((finding) =>
        createFinding({
          investigation_id: investigation.id,
          case_id: investigation.case_id,
          title: finding.title,
          description: finding.description,
          severity: finding.severity,
          confidence: Math.round(finding.confidence * 100),
          finding_type: finding.type,
          related: {
            addresses: finding.relatedAddresses,
            txHashes: finding.relatedTxHashes,
          },
        }),
      ),
    );

    // Persist full analysis artifact in summary JSONB
    const summaryPayload = {
      pipelineStage: "ready" as const,
      progress: 100,
      pipelineNote: "Analysis complete",
      buildingGraph: false,
      dataSource: result.rawTransactions.length > 0 ? "live" : "fallback",
      isLive: result.rawTransactions.length > 0,
      hops: result.graph.bounds.hops,
      addresses: result.graph.nodes.length,
      transactions: result.graph.edges.length,
      relevantPaths: result.paths.length,
      vaspCandidates: result.entities.length,
      valueTraced: result.paths[0]?.valuePreserved ?? "—",
      continuity: result.paths[0]?.continuity ?? 0,
      rawTxCount: result.rawTransactions.length,
      graph: result.graph,
      paths: result.paths,
      entities: result.entities,
      signals: result.signals,
      timeline: result.timeline,
      generatedFindings: result.generatedFindings,
      riskScore: result.risk.score,
      riskBand: result.risk.band,
      riskFactors: result.risk.factors,
      riskNodeScores: result.risk.nodeScores,
    };

    emit("ready", `Complete — ${result.graph.nodes.length} addresses, ${result.paths.length} paths`);
    await updateInvestigation(investigation.id, {
      status: "complete",
      completed_at: new Date().toISOString(),
      summary: summaryPayload,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Investigation pipeline failed";
    await updateInvestigation(investigation.id, {
      status: "failed",
      summary: {
        pipelineStage: "failed",
        progress: 0,
        pipelineNote: message,
        error: message,
      },
    });
    throw error;
  }
}

/** Rehydrate partial graph while pipeline is still running. */
export function loadPartialGraph(
  investigation: InvestigationRecord,
): GraphBuildSnapshot["graph"] | null {
  const s = investigation.summary as Record<string, unknown> | null;
  if (!s?.graph || typeof s.graph !== "object") return null;
  return s.graph as GraphBuildSnapshot["graph"];
}

/** Rehydrate a stored analysis result from investigation summary. */
export function loadStoredAnalysis(
  investigation: InvestigationRecord,
): GraphBuildResult | null {
  const s = investigation.summary as Record<string, unknown> | null;
  if (!s?.graph) return null;

  const graph = s.graph as GraphBuildResult["graph"];

  // Rebuild when trace depth changed since the graph was persisted
  if (graph.bounds?.hops !== investigation.trace_depth) return null;

  // Full result only when paths are present (analysis complete)
  if (!s.paths) return null;

  const paths = s.paths as GraphBuildResult["paths"];
  const signals = (s.signals as GraphBuildResult["signals"]) ?? [];

  const risk =
    typeof s.riskScore === "number"
      ? {
          score: s.riskScore,
          band:
            (s.riskBand as GraphBuildResult["risk"]["band"]) ??
            (s.riskScore >= 81
              ? "critical"
              : s.riskScore >= 61
                ? "high"
                : s.riskScore >= 31
                  ? "medium"
                  : "low"),
          factors: (s.riskFactors as GraphBuildResult["risk"]["factors"]) ?? [],
          nodeScores:
            (s.riskNodeScores as GraphBuildResult["risk"]["nodeScores"]) ?? {},
          provenance: "TRACIFY heuristic risk score",
        }
      : scoreInvestigationRisk({
          nodes: graph.nodes,
          signals,
          paths,
          chain: investigation.blockchain || "ethereum",
        });

  return {
    graph,
    paths,
    entities: (s.entities as GraphBuildResult["entities"]) ?? [],
    signals,
    timeline: (s.timeline as GraphBuildResult["timeline"]) ?? [],
    rawTransactions: [],
    risk,
    generatedFindings: (s.generatedFindings as GraphBuildResult["generatedFindings"]) ?? [],
  };
}
