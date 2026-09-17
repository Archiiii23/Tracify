import { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  Copy,
  FileText,
  Fingerprint,
  Pin,
  Route as RouteIcon,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  Vault,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Chip,
  InvestigationStatusBadge,
  Mono,
  SeverityBadge,
} from "@/components/vt/badges";
import { BreadcrumbNav } from "@/components/vt/BreadcrumbNav";
import { GraphCanvas, NODE_KIND_LABEL } from "@/components/vt/GraphCanvas";
import { ContextualInspector } from "@/components/vt/ContextualInspector";
import { DeleteInvestigationButton } from "@/components/vt/DeleteInvestigationButton";
import { TraceDepthSelect } from "@/components/vt/TraceDepthSelect";
import { MAX_TRACE_DEPTH } from "@/lib/domain";
import { InvestigationContextBar } from "@/components/vt/investigation/InvestigationContextBar";
import { InvestigationAgentPanel } from "@/components/vt/investigation/InvestigationAgentPanel";
import { InvestigationTransactionsTab } from "@/components/vt/InvestigationTransactionsTab";
import type { InvestigationTabId } from "@/components/vt/investigation/tabs";
import { ReportBuilderDialog } from "@/components/vt/ReportBuilderDialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatTile,
} from "@/components/vt/states";
import {
  createEvidence,
  createFinding,
  evidenceQuery,
  findingsQuery,
  investigationQuery,
  investigationTransactionsQuery,
  casesQuery,
  updateInvestigation,
} from "@/lib/api/queries";
import { chainLabel, truncateAddress } from "@/lib/domain";
import { intelligence } from "@/services/intelligence";
import { loadPartialGraph, loadStoredAnalysis, runInvestigationPipeline } from "@/services/investigationPipeline";
import {
  riskBandLabel,
  riskBandTone,
  riskFromSummary,
  scoreInvestigationRisk,
  type InvestigationRiskAssessment,
} from "@/services/riskEngine";
import { RiskRing } from "@/components/vt/clay";
import { getExplorerTxUrl, getExplorerAddressUrl } from "@/lib/explorer";
import { useUIStore, useWorkspaceStore } from "@/stores/ui";
import { FORENSIC_COPY } from "@/lib/provenance";

function copy(value: string) {
  void navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard.");
}

export function InvestigationWorkspacePage({
  investigationId,
  activeTab,
}: {
  investigationId: string;
  activeTab: InvestigationTabId;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selection = useWorkspaceStore((s) => s.selection);
  const select = useWorkspaceStore((s) => s.select);
  const focusedPath = useWorkspaceStore((s) => s.focusedPath);
  const setFocusedPath = useWorkspaceStore((s) => s.setFocusedPath);
  const openInvestigationModal = useUIStore((s) => s.openInvestigationModal);

  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [activeTimelineFilter, setActiveTimelineFilter] = useState<string | null>(null);

  const investigation = useQuery({
    ...investigationQuery(investigationId),
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.status;
      const summary = data?.summary as Record<string, unknown> | undefined;
      const isBuilding = Boolean(summary?.buildingGraph);
      if (status === "processing" || status === "queued") {
        return isBuilding ? 400 : 2000;
      }
      return false;
    },
  });
  const cases = useQuery(casesQuery());
  const invFindings = useQuery(findingsQuery({ investigationId }));
  const invEvidence = useQuery(evidenceQuery({ investigationId }));

  const liveTransactions = useQuery({
    ...investigationTransactionsQuery(investigation.data),
  });

  useEffect(() => {
    if (activeTab === "transactions" && investigation.data?.target_address) {
      void liveTransactions.refetch();
    }
  }, [activeTab, investigation.data?.id, investigation.data?.target_address]);

  const liveAnalysis = useQuery({
    queryKey: [
      "live-investigation-graph",
      investigation.data?.id,
      investigation.data?.target_address,
      investigation.data?.blockchain,
      investigation.data?.trace_depth,
      investigation.data?.status,
    ],
    queryFn: async () => {
      if (!investigation.data) return null;

      // Prefer persisted pipeline result from Supabase summary
      const stored = loadStoredAnalysis(investigation.data);
      if (stored) return stored;

      // Still processing — don't rebuild yet
      if (
        investigation.data.status === "processing" ||
        investigation.data.status === "queued"
      ) {
        return null;
      }

      // Fallback: run live graph build client-side
      return intelligence.buildLiveGraph(investigation.data);
    },
    enabled: Boolean(investigation.data?.target_address),
    staleTime: 5 * 60 * 1000,
  });

  const analysis = useMemo(() => {
    if (!investigation.data) return null;
    const findings = Array.isArray(invFindings.data) ? invFindings.data : [];
    const evidence = Array.isArray(invEvidence.data) ? invEvidence.data : [];

    if (liveAnalysis.data) {
      const live = liveAnalysis.data;
      const combinedEntities =
        live.entities.length > 0
          ? live.entities
          : intelligence.entities.candidates(live.graph, findings.length > 0 ? findings : undefined);

      const combinedSignals =
        live.signals.length > 0
          ? live.signals
          : intelligence.risk.signals(live.graph, findings.length > 0 ? findings : undefined);

      const combinedTimeline =
        evidence.length > 0
          ? intelligence.timeline(live.graph, evidence)
          : live.timeline;

      return {
        graph: live.graph,
        paths: live.paths,
        entities: combinedEntities,
        signals: combinedSignals,
        timeline: combinedTimeline,
        isLive: true,
        rawTxs: liveTransactions.data ?? [],
        generatedFindings: live.generatedFindings,
        risk: live.risk,
      };
    }

    try {
      const graph = intelligence.graph.build(investigation.data);
      const paths = intelligence.paths.rank(graph, investigation.data);
      const signals = intelligence.risk.signals(graph, findings.length > 0 ? findings : undefined);
      const risk = scoreInvestigationRisk({
        nodes: graph.nodes,
        signals,
        paths,
        chain: investigation.data.blockchain || "ethereum",
      });
      return {
        graph,
        paths,
        entities: intelligence.entities.candidates(graph, findings.length > 0 ? findings : undefined),
        signals,
        timeline: intelligence.timeline(graph, evidence.length > 0 ? evidence : undefined),
        isLive: false,
        rawTxs: liveTransactions.data ?? [],
        generatedFindings: [],
        risk,
      };
    } catch (err) {
      console.error("[Workspace] Failed to construct analysis graph:", err);
      return null;
    }
  }, [investigation.data, liveAnalysis.data, liveTransactions.data, invFindings.data, invEvidence.data]);

  const riskAssessment = useMemo((): InvestigationRiskAssessment | null => {
    if (analysis?.risk) return analysis.risk;
    if (!investigation.data) return null;
    const stored = riskFromSummary(
      investigation.data.summary as Record<string, unknown> | null,
    );
    if (stored) return stored;
    if (analysis) {
      return scoreInvestigationRisk({
        nodes: analysis.graph.nodes,
        signals: analysis.signals,
        paths: analysis.paths,
        chain: investigation.data.blockchain || "ethereum",
      });
    }
    return null;
  }, [analysis, investigation.data]);

  const caseObj = useMemo(() => {
    if (!investigation.data || !cases.data) return null;
    return cases.data.find((c) => c.id === investigation.data?.case_id) ?? null;
  }, [investigation.data, cases.data]);

  const pinEvidence = useMutation({
    mutationFn: (input: { title: string; description: string; type: string }) =>
      createEvidence({
        investigation_id: investigationId,
        case_id: investigation.data?.case_id ?? null,
        title: input.title,
        evidence_type: input.type,
        description: input.description,
        source: `TRACIFY workspace · ${investigation.data?.investigation_ref ?? ""}`,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["evidence"] });
      toast.success("Pinned to the evidence vault.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoPinEvidence = useMutation({
    mutationFn: async () => {
      if (!investigation.data) return;
      const inv = investigation.data;
      const caseId = inv.case_id ?? null;
      const rawTxs = analysis?.rawTxs ?? [];

      // 1. Pin Target Wallet Profile
      await createEvidence({
        investigation_id: investigationId,
        case_id: caseId,
        title: `Target Wallet: ${truncateAddress(inv.target_address)}`,
        evidence_type: "wallet",
        description: `Suspect address on ${chainLabel(inv.blockchain)}: ${inv.target_address}. Traced with ${rawTxs.length} direct transfers indexed via live explorer.`,
        source: `Blockscout · ${chainLabel(inv.blockchain)}`,
        metadata: {
          address: inv.target_address,
          blockchain: inv.blockchain,
          explorerUrl: getExplorerAddressUrl(inv.blockchain, inv.target_address),
          indexedAt: new Date().toISOString(),
        },
      });

      // 2. Pin up to 4 significant transactions
      for (const tx of rawTxs.slice(0, 4)) {
        await createEvidence({
          investigation_id: investigationId,
          case_id: caseId,
          title: `On-Chain Transfer: ${truncateAddress(tx.hash)}`,
          evidence_type: "transaction",
          description: `Cryptographic proof: ${Number(tx.value || 0).toFixed(4)} native units from ${truncateAddress(tx.from)} to ${truncateAddress(tx.to)}. Block: ${tx.blockNumber}.`,
          source: `Blockscout · ${chainLabel(inv.blockchain)}`,
          metadata: {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            blockNumber: tx.blockNumber,
            timestamp: tx.timestamp,
            explorerUrl: getExplorerTxUrl(inv.blockchain, tx.hash),
          },
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["evidence"] });
      toast.success("Pinned on-chain wallet & key transactions to Evidence Vault!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rerunAnalysis = useMutation({
    mutationFn: async (recordOverride?: typeof investigation.data) => {
      const inv = recordOverride ?? investigation.data;
      if (!inv) return;
      await updateInvestigation(inv.id, {
        status: "queued",
        summary: { pipelineStage: "validate", progress: 0 },
      });
      await runInvestigationPipeline(inv);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      void queryClient.invalidateQueries({ queryKey: ["live-investigation-graph"] });
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
      toast.success("Live on-chain analysis re-run complete.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTraceDepth = useMutation({
    mutationFn: async (traceDepth: number) => {
      if (!investigation.data) return null;
      const updated = await updateInvestigation(investigation.data.id, {
        trace_depth: traceDepth,
      });
      return updated;
    },
    onSuccess: (updated) => {
      if (!updated) return;
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      void queryClient.invalidateQueries({ queryKey: ["live-investigation-graph"] });
      toast.message("Trace depth updated", {
        description: `Re-running live trace at ${updated.trace_depth} hops…`,
      });
      rerunAnalysis.mutate(updated);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordFinding = useMutation({
    mutationFn: (input: {
      title: string;
      description: string;
      severity: string;
      confidence: number;
      type: string;
    }) =>
      createFinding({
        investigation_id: investigationId,
        case_id: investigation.data?.case_id ?? null,
        title: input.title,
        description: input.description,
        severity: input.severity,
        confidence: input.confidence,
        finding_type: input.type,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
      toast.success("Finding recorded against this case.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Hooks must run on every render — selection is resolved inside ContextualInspector.
  if (investigation.isLoading) return <LoadingState rows={5} />;
  if (investigation.error)
    return <ErrorState message={investigation.error.message} />;
  if (!investigation.data)
    return <ErrorState message="Investigation not found." />;

  const record = investigation.data;

  // Show pipeline progress while analysis is running
  if (
    (record.status === "processing" || record.status === "queued") &&
    !liveAnalysis.data
  ) {
    const summary = record.summary as Record<string, unknown>;
    const progress = (summary?.progress as number) ?? 10;
    const note = (summary?.pipelineNote as string) ?? "Running live on-chain analysis…";
    const partialGraph = loadPartialGraph(record);

    if (partialGraph && partialGraph.nodes.length > 0) {
      return (
        <div className="space-y-5">
          <BreadcrumbNav
            segments={[
              { label: "Investigations", to: "/investigations" },
              { label: record.investigation_ref },
              { label: "Graph (building)" },
            ]}
          />
          <InvestigationContextBar
            investigationId={investigationId}
            activeTab="graph"
            counts={{ transactions: 0, risk: 0, attribution: 0, evidence: 0 }}
          />
          <div className="panel px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Mono className="text-primary font-semibold">{record.investigation_ref}</Mono>
                <h2 className="mt-1 text-lg font-bold">{record.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </div>
              <div className="min-w-[200px]">
                <Progress value={progress} className="h-2" />
              </div>
            </div>
          </div>
          <div className="min-h-[min(780px,72vh)]">
            <GraphCanvas
              graph={partialGraph}
              paths={[]}
              focusedPath={null}
              selectedId={null}
              building
              onSelectNode={() => undefined}
              onSelectEdge={() => undefined}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 p-6">
        <Link
          to="/cases/$caseId"
          params={{ caseId: record.case_id }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to case file
        </Link>
        <div className="panel p-8 max-w-lg mx-auto space-y-4">
          <div className="text-center space-y-1">
            <Mono className="text-primary font-semibold">{record.investigation_ref}</Mono>
            <h2 className="text-lg font-bold">{record.name}</h2>
            <p className="text-xs text-muted-foreground mono">{record.target_address}</p>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-center text-muted-foreground">{note}</p>
          <LoadingState rows={3} />
        </div>
      </div>
    );
  }

  if (!analysis)
    return <ErrorState message="Failed to load investigation analysis." />;
  const { graph, paths, entities, signals, timeline } = analysis;

  const observedHops =
    graph.bounds.observedHops ??
    (graph.nodes.length > 0 ? Math.max(...graph.nodes.map((n) => n.hop)) : 0);
  const maxTraceHops = graph.bounds.hops;

  const primaryPath = paths ? paths[0] : null;


  const handleTraceFromNode = (address: string) => {
    openInvestigationModal(record.case_id);
    toast.info(`Opening new trace starting from ${truncateAddress(address, 6, 4)}`);
  };

  const handleTimelineClick = (eventId: string, nodeId?: string, pathId?: string) => {
    setActiveTimelineFilter((prev) => (prev === eventId ? null : eventId));
    if (nodeId) {
      const targetNode = graph.nodes.find((n) => n.id === nodeId);
      if (targetNode) select("wallet", targetNode.id);
    }
    if (pathId) {
      setFocusedPath(pathId);
    }
  };

  return (
    <div className="space-y-5">
      <BreadcrumbNav
        segments={[
          { label: "Investigations", to: "/investigations" },
          {
            label: record.investigation_ref,
            to: "/investigations/$investigationId/$tab",
            params: { investigationId, tab: "overview" },
          },
          { label: activeTab === "risk" ? "Risk & Findings" : activeTab.charAt(0).toUpperCase() + activeTab.slice(1) },
        ]}
      />

      <InvestigationContextBar
        investigationId={investigationId}
        activeTab={activeTab}
        counts={{
          transactions: liveTransactions.data?.length ?? analysis.rawTxs?.length ?? 0,
          risk: signals.length + (invFindings.data?.length ?? 0),
          attribution: entities.length,
          evidence: invEvidence.data?.length ?? 0,
        }}
      />

      {/* Workspace header actions */}
      <div className="flex items-center justify-between">
        <Link
          to="/cases/$caseId"
          params={{ caseId: record.case_id }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to case file ({caseObj?.case_ref || "Case"})
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-32 shrink-0">
            <TraceDepthSelect
              value={record.trace_depth}
              onChange={(v) => {
                if (v !== record.trace_depth) updateTraceDepth.mutate(v);
              }}
              disabled={updateTraceDepth.isPending || rerunAnalysis.isPending}
              triggerClassName="h-8 text-xs"
              compact
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={rerunAnalysis.isPending}
            onClick={() => rerunAnalysis.mutate()}
            className="text-xs gap-1.5 border-border hover:border-primary/50"
          >
            <RefreshCw className={`size-3.5 text-primary ${rerunAnalysis.isPending ? "animate-spin" : ""}`} />
            Re-run Live Trace
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportDialogOpen(true)}
            className="text-xs gap-1.5 border-border hover:border-primary/50"
          >
            <FileText className="size-3.5 text-primary" />
            Generate Dossier Report
          </Button>
          <DeleteInvestigationButton
            investigation={record}
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 border-border text-destructive hover:border-destructive/50 hover:bg-destructive/10"
            onDeleted={() =>
              navigate({ to: "/cases/$caseId", params: { caseId: record.case_id } })
            }
          />
        </div>
      </div>

      {/* Workspace header */}
      <header className="panel px-5 py-4.5 bg-surface/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Mono className="text-muted-foreground font-semibold">
                {record.investigation_ref}
              </Mono>
              <InvestigationStatusBadge status={record.status} />
              <Chip tone="neutral">{chainLabel(record.blockchain)}</Chip>
              <Chip tone="intel">{observedHops} hops traced · max {maxTraceHops}</Chip>
              {riskAssessment ? (
                <Chip tone={riskBandTone(riskAssessment.band)}>
                  Risk {riskAssessment.score}/100 · {riskBandLabel(riskAssessment.band)}
                </Chip>
              ) : null}
              {analysis.isLive || (record.summary as Record<string, unknown>)?.isLive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-0.5 text-[11px] font-semibold text-positive">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-positive"></span>
                  </span>
                  Real On-Chain Data ({liveTransactions.data?.length ?? analysis.rawTxs?.length ?? 0} txs live)
                </span>
              ) : liveAnalysis.isLoading ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-400">
                  <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
                  Syncing Live On-Chain Data...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  Deterministic Baseline
                </span>
              )}
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {record.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => copy(record.target_address)}
                className="mono inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground group"
                title="Click to copy target address"
              >
                <span>Subject Root:</span>
                <span className="text-foreground group-hover:underline font-medium">
                  {record.target_address}
                </span>
                <Copy className="size-3 text-muted-foreground group-hover:text-foreground" />
              </button>
              <a
                href={getExplorerAddressUrl(record.blockchain, record.target_address)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                Explorer <ExternalLink className="size-3" />
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pinEvidence.isPending}
              onClick={() =>
                pinEvidence.mutate({
                  title: `Graph snapshot — ${record.investigation_ref}`,
                  description: `Bounded graph at ${graph.bounds.hops} hops: ${graph.nodes.length} addresses, ${graph.edges.length} traced transfers.`,
                  type: "graph_snapshot",
                })
              }
            >
              <Pin className="size-3.5" />
              Pin Snapshot
            </Button>
            <Button
              size="sm"
              disabled={recordFinding.isPending || !primaryPath}
              onClick={() =>
                primaryPath &&
                recordFinding.mutate({
                  title: `Primary path terminates at ${(NODE_KIND_LABEL[primaryPath.endpointKind] ?? "unknown endpoint").toLowerCase()}`,
                  description: `${primaryPath.verdict} ${primaryPath.valuePreserved} preserved across ${primaryPath.hops} hops (continuity ${(primaryPath.continuity * 100).toFixed(0)}%).`,
                  severity: primaryPath.continuity > 0.7 ? "high" : "medium",
                  confidence: Math.round(
                    primaryPath.confidence <= 1
                      ? primaryPath.confidence * 100
                      : primaryPath.confidence,
                  ),
                  type: "path_continuity",
                })
              }
            >
              <Sparkles className="size-3.5" />
              Record Finding
            </Button>
          </div>
        </div>

        {record.status === "processing" ? (() => {
          const summary = record.summary as Record<string, unknown>;
          const progressPct = (summary?.progress as number) ?? 50;
          const note = (summary?.pipelineNote as string) ?? "Running pipeline…";
          return (
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>{note}</span>
                <span className="mono">{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-1.5" />
            </div>
          );
        })() : null}
      </header>

      {(activeTab === "overview" || activeTab === "graph" || activeTab === "risk") && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {riskAssessment ? (
            <StatTile
              label="Heuristic Risk Score"
              value={`${riskAssessment.score}/100`}
              hint={riskBandLabel(riskAssessment.band)}
              tone={riskBandTone(riskAssessment.band) === "critical" ? "critical" : riskBandTone(riskAssessment.band) === "warning" ? "warning" : "intel"}
            />
          ) : null}
          <StatTile label="Addresses in Scope" value={graph.nodes.length} hint={`${observedHops} hops observed · max ${maxTraceHops}`} />
          <StatTile label="Traced Transfers" value={graph.edges.length} hint="verified on-chain records" />
          <StatTile label="Value Paths" value={paths.length} hint="ranked by continuity score" tone="intel" />
          <StatTile label="Likely VASP Candidates" value={entities.length} hint="requires evidence review" tone="positive" />
        </div>
      )}

      {activeTab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="panel p-5 space-y-3">
            <h2 className="text-sm font-semibold">Case summary</h2>
            <p className="text-xs text-muted-foreground">{FORENSIC_COPY.publicDataNote}</p>
            <dl className="grid gap-2 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Wallet</dt><dd className="mono">{truncateAddress(record.target_address)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Chain</dt><dd>{chainLabel(record.blockchain)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Transactions indexed</dt><dd>{analysis.rawTxs?.length ?? 0}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Trace depth</dt><dd>{observedHops} observed / {record.trace_depth} max</dd></div>
            </dl>
            {primaryPath && (
              <div className="rounded-lg border border-border/60 bg-elevated/30 p-3 text-xs">
                <p className="font-semibold text-foreground">Primary candidate path</p>
                <p className="mt-1 text-muted-foreground">{primaryPath.verdict}</p>
              </div>
            )}
            <Button size="sm" asChild>
              <Link to="/investigations/$investigationId/$tab" params={{ investigationId, tab: "graph" }}>
                Open fund-flow graph →
              </Link>
            </Button>
          </div>
          <div className="panel p-5 space-y-3">
            <h2 className="text-sm font-semibold">Key findings</h2>
            {(invFindings.data ?? []).slice(0, 3).map((f) => (
              <div key={f.id} className="rounded-lg border border-border/50 p-3">
                <SeverityBadge severity={f.severity} />
                <p className="mt-2 text-sm font-medium">{f.title}</p>
              </div>
            ))}
            {(invFindings.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No recorded findings yet — check Risk & Findings after analysis completes.</p>
            )}
          </div>
          <InvestigationAgentPanel
            investigationId={investigationId}
            chain={record.blockchain}
            address={record.target_address}
            traceDepth={record.trace_depth}
          />
        </div>
      )}

      {activeTab === "graph" && observedHops < maxTraceHops && (
        <p className="rounded-lg border border-border/60 bg-elevated/40 px-3 py-2 text-xs text-muted-foreground">
          On-chain activity stopped at hop {observedHops} — no further qualifying transfers were found within the {maxTraceHops}-hop budget.
          Re-run live trace after changing depth or minimum value filters.
        </p>
      )}

      {activeTab === "graph" && (
        <div className="grid gap-5 overflow-hidden xl:h-[calc(100vh-220px)] xl:min-h-[480px] xl:max-h-[calc(100vh-220px)] xl:grid-cols-[minmax(0,1fr)_340px] xl:items-stretch">
          <div className="min-h-[min(560px,60vh)] xl:h-full xl:min-h-0">
            <GraphCanvas
              graph={graph}
              paths={paths}
              focusedPath={focusedPath}
              selectedId={selection.id}
              onSelectNode={(node) => select("wallet", node.id)}
              onSelectEdge={(edge) => select("transaction", edge.id)}
              onFocusPath={setFocusedPath}
              onToggleFocus={() => setFocusedPath(null)}
            />
          </div>
          <div className="min-h-0 max-h-[min(420px,50vh)] overflow-hidden xl:h-full xl:max-h-none">
            <ContextualInspector
              record={record}
              graph={graph}
              paths={paths}
              entities={entities}
              rawTxs={analysis.rawTxs}
              selection={selection}
              investigationRisk={riskAssessment}
              focusedPath={focusedPath}
              onFocusPath={setFocusedPath}
              onTraceFrom={handleTraceFromNode}
              onPinEvidence={(input) => pinEvidence.mutate(input)}
              pinPending={pinEvidence.isPending}
            />
          </div>
        </div>
      )}

      {activeTab === "transactions" && (
        <InvestigationTransactionsTab
          blockchain={record.blockchain}
          targetAddress={record.target_address}
          transactions={liveTransactions.data ?? []}
          isLoading={liveTransactions.isLoading}
          isFetching={liveTransactions.isFetching}
          error={liveTransactions.error instanceof Error ? liveTransactions.error.message : null}
          onRefresh={() => void liveTransactions.refetch()}
        />
      )}

      {activeTab === "timeline" && (
        <div className="panel p-4 bg-surface/30">
          <ol className="space-y-3">
            {timeline.map((event) => {
              const isSelected = activeTimelineFilter === event.id;
              return (
                <li
                  key={event.id}
                  onClick={() => handleTimelineClick(event.id, event.nodeId, event.pathId)}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-all ${
                    isSelected ? "border-primary bg-primary/10" : "border-transparent hover:border-border hover:bg-elevated/40"
                  }`}
                >
                  <div className="mono w-20 shrink-0 pt-0.5 text-[11px] text-muted-foreground">
                    <span className="block font-semibold text-foreground">{event.clock}</span>
                    <span>{event.at}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">{event.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{event.detail}</p>
                  </div>
                  <Chip tone="neutral" className="text-[10px] uppercase">{event.kind}</Chip>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {activeTab === "risk" && (
        <div className="space-y-4">
          {riskAssessment ? <RiskScorePanel assessment={riskAssessment} /> : null}
          <PathsPanel paths={paths} focusedPath={focusedPath} setFocusedPath={setFocusedPath} />
          <SignalsPanel
            signals={signals}
            generatedFindings={analysis.generatedFindings}
            autoPinEvidence={autoPinEvidence}
            recordFinding={recordFinding}
          />
        </div>
      )}

      {activeTab === "attribution" && (
        <EntitiesPanel entities={entities} />
      )}

      {activeTab === "evidence" && (
        <div className="space-y-3">
          {(invEvidence.data ?? []).length === 0 ? (
            <EmptyState icon={Vault} title="No evidence pinned" description="Pin transactions or graph snapshots from the Graph tab or Risk panel." />
          ) : (
            (invEvidence.data ?? []).map((ev) => (
              <article key={ev.id} className="panel p-4">
                <p className="text-sm font-semibold">{ev.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{ev.description}</p>
                <p className="mono mt-2 text-[10px] text-muted-foreground">{ev.source}</p>
              </article>
            ))
          )}
        </div>
      )}

      {activeTab === "report" && (
        <div className="panel p-6 space-y-4 max-w-lg">
          <h2 className="text-sm font-semibold">Investigation report</h2>
          <p className="text-xs text-muted-foreground">
            Generate a dossier with observed facts, derived analysis, and evidence references — separated by provenance.
          </p>
          <Button onClick={() => setReportDialogOpen(true)}>
            <FileText className="size-4" />
            Generate dossier report
          </Button>
        </div>
      )}

      {/* Interactive Report Builder Dialog */}
      <ReportBuilderDialog
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
        data={{
          investigation: record,
          caseRef: caseObj?.case_ref,
          paths,
          entities,
          signals,
          timeline,
          findingsCount: 0,
          evidenceCount: 0,
        }}
      />
    </div>
  );
}

function RiskScorePanel({
  assessment,
}: {
  assessment: InvestigationRiskAssessment;
}) {
  return (
    <div className="panel grid gap-6 bg-surface/30 p-5 lg:grid-cols-[auto_1fr]">
      <RiskRing score={assessment.score} label={FORENSIC_COPY.heuristicRisk} size={140} />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">Investigation risk assessment</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {assessment.provenance} — derived from entity labels and behavioural signals, not validated ML.
        </p>
        {assessment.factors.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {assessment.factors.map((factor) => (
              <li
                key={factor.id}
                className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 text-xs last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{factor.label}</p>
                  <p className="mt-0.5 text-muted-foreground">{factor.description}</p>
                </div>
                <span className="mono shrink-0 font-semibold text-primary">+{factor.contribution}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">No risk factors recorded yet.</p>
        )}
      </div>
    </div>
  );
}

function PathsPanel({
  paths,
  focusedPath,
  setFocusedPath,
}: {
  paths: Array<{
    id: string;
    label: string;
    continuity: number;
    verdict: string;
    valuePreserved: string;
    hops: number;
    endpointKind: string;
    confidence: number;
  }>;
  focusedPath: string | null;
  setFocusedPath: (id: string | null) => void;
}) {
  return (
    <div className="space-y-2.5">
      {paths.map((p, idx) => {
        const active = focusedPath === p.id;
        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => setFocusedPath(active ? null : p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFocusedPath(active ? null : p.id);
              }
            }}
            className={`panel cursor-pointer p-4 transition-colors ${active ? "border-primary bg-primary/5" : "bg-surface/30 hover:border-border-strong"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="mono text-xs font-semibold text-primary">#{String(idx + 1).padStart(2, "0")}</span>
                <span className="text-sm font-semibold">{p.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <Chip tone={p.continuity > 0.7 ? "positive" : p.continuity > 0.4 ? "warning" : "neutral"}>
                  {(p.continuity * 100).toFixed(0)}% continuity
                </Chip>
                <Button
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-[10px]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFocusedPath(active ? null : p.id);
                  }}
                >
                  {active ? "Focused on graph" : "Focus on graph"}
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{p.verdict}</p>
            <p className="mono mt-2 text-[11px] text-muted-foreground">
              {p.valuePreserved} · {p.hops} hops · {NODE_KIND_LABEL[p.endpointKind as keyof typeof NODE_KIND_LABEL]}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function EntitiesPanel({
  entities,
}: {
  entities: Array<{
    id: string;
    name: string;
    type: string;
    proximityHops: number;
    attributionStrength: number;
    rationale: string[];
  }>;
}) {
  if (entities.length === 0) {
    return (
      <EmptyState
        icon={Fingerprint}
        title="No likely VASP candidates"
        description="No endpoint in scope matches a known service label. Extend hop depth or review graph paths."
      />
    );
  }
  return (
    <div className="space-y-2.5">
      {entities.map((e) => (
        <article key={e.id} className="panel space-y-3 bg-surface/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{e.name}</h3>
              <p className="text-xs text-muted-foreground">Likely VASP · {e.proximityHops} hops from target</p>
            </div>
            <Chip tone={e.attributionStrength > 0.7 ? "positive" : "warning"}>
              {(e.attributionStrength * 100).toFixed(0)}% confidence
            </Chip>
          </div>
          <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
            {e.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function SignalsPanel({
  signals,
  generatedFindings,
  autoPinEvidence,
  recordFinding,
}: {
  signals: Array<{ id: string; pattern: string; description: string; severity: string }>;
  generatedFindings: Array<{ title: string; description: string; severity: string; confidence: number; type: string }>;
  autoPinEvidence: { isPending: boolean; mutate: () => void };
  recordFinding: { isPending: boolean; mutate: (input: { title: string; description: string; severity: string; confidence: number; type: string }) => void };
}) {
  return (
    <div className="space-y-2.5">
      {generatedFindings.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
          <p className="text-xs font-semibold">{generatedFindings.length} derived risk patterns detected</p>
          <Button size="sm" variant="outline" disabled={autoPinEvidence.isPending} onClick={() => autoPinEvidence.mutate()}>
            Pin on-chain evidence
          </Button>
        </div>
      )}
      {signals.map((sig) => (
        <article key={sig.id} className="panel space-y-2 bg-surface/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SeverityBadge severity={sig.severity as "low" | "medium" | "high" | "critical"} />
              <span className="text-sm font-semibold">{sig.pattern}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() =>
                recordFinding.mutate({
                  title: sig.pattern,
                  description: sig.description,
                  severity: sig.severity,
                  confidence: 85,
                  type: "behavioural_pattern",
                })
              }
            >
              Record finding
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{sig.description}</p>
        </article>
      ))}
    </div>
  );
}
