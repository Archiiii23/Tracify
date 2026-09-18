import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Compass,
  Copy,
  ExternalLink,
  Eye,
  Layers,
  Loader2,
  Pin,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Chip } from "@/components/vt/badges";
import { NODE_KIND_LABEL } from "@/components/vt/GraphCanvas";
import {
  addressIntelligenceQuery,
  addressNeighboursQuery,
  backendConfigured,
} from "@/lib/api/backend";
import { getExplorerAddressUrl, getExplorerTxUrl } from "@/lib/explorer";
import { chainLabel, truncateAddress } from "@/lib/domain";
import type { InvestigationRecord } from "@/lib/domain";
import { resolveEntity } from "@/services/blockchain/attributionDb";
import type {
  EntityCandidate,
  GraphEdge,
  GraphNode,
  InvestigationGraph,
  TracePath,
} from "@/services/intelligence";
import type { InvestigationRiskAssessment } from "@/services/riskEngine";
import { riskBandTone } from "@/services/riskEngine";
import type { InternalTransaction } from "@/services/blockchain/liveAdapter";
import type { SelectionKind } from "@/stores/ui";

function usd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${Math.round(value).toLocaleString()}`
    : "—";
}

function pctConfidence(value: number): string {
  const n = value <= 1 ? value * 100 : value;
  return `${Math.round(n)}%`;
}

function copy(value: string) {
  void navigator.clipboard.writeText(value);
  toast.success("Copied to clipboard.");
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-1.5 last:border-b-0">
      <dt className="shrink-0 text-muted-foreground/80">{label}</dt>
      <dd className="min-w-0 max-w-[58%] break-words text-right text-foreground font-medium">{value}</dd>
    </div>
  );
}

function Section({
  title,
  tone = "primary",
  children,
}: {
  title: string;
  tone?: "primary" | "intel" | "positive";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "intel"
      ? "text-intel"
      : tone === "positive"
        ? "text-positive"
        : "text-primary";
  return (
    <div className="p-3 rounded-lg border border-border/80 bg-background/60 space-y-2">
      <span
        className={`mono text-[10px] font-semibold uppercase tracking-wider block ${toneClass}`}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

export function ContextualInspector({
  record,
  graph,
  paths,
  entities,
  rawTxs,
  selection,
  onTraceFrom,
  onPinEvidence,
  pinPending,
  investigationRisk,
  focusedPath,
  onFocusPath,
}: {
  record: InvestigationRecord;
  graph: InvestigationGraph;
  paths: TracePath[];
  entities: EntityCandidate[];
  rawTxs: InternalTransaction[];
  selection: { kind: SelectionKind; id: string | null };
  onTraceFrom: (address: string) => void;
  onPinEvidence: (input: { title: string; description: string; type: string }) => void;
  pinPending?: boolean;
  investigationRisk?: InvestigationRiskAssessment | null;
  focusedPath?: string | null;
  onFocusPath?: (pathId: string | null) => void;
}) {
  const selectedNode = useMemo(() => {
    if (selection.kind !== "wallet" || !selection.id) return null;
    return graph.nodes.find((n) => n.id === selection.id) ?? null;
  }, [selection, graph.nodes]);

  const selectedEdge = useMemo(() => {
    if (selection.kind !== "transaction" || !selection.id) return null;
    return graph.edges.find((e) => e.id === selection.id) ?? null;
  }, [selection, graph.edges]);

  const edgeFromNode = useMemo(
    () => (selectedEdge ? graph.nodes.find((n) => n.id === selectedEdge.from) : null),
    [selectedEdge, graph.nodes],
  );
  const edgeToNode = useMemo(
    () => (selectedEdge ? graph.nodes.find((n) => n.id === selectedEdge.to) : null),
    [selectedEdge, graph.nodes],
  );

  const entityMatch = useMemo(() => {
    if (!selectedNode) return null;
    return resolveEntity(selectedNode.address, record.blockchain);
  }, [selectedNode, record.blockchain]);

  const nodePaths = useMemo(() => {
    if (!selectedNode) return [];
    return paths.filter((p) => p.nodeIds.includes(selectedNode.id));
  }, [selectedNode, paths]);

  const graphCounterparties = useMemo(() => {
    if (!selectedNode) return [];
    const addr = selectedNode.address.toLowerCase();
    const seen = new Set<string>();
    const result: { address: string; label: string; value: string; direction: "in" | "out" }[] = [];

    for (const edge of graph.edges) {
      const fromNode = graph.nodes.find((n) => n.id === edge.from);
      const toNode = graph.nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;

      if (fromNode.address.toLowerCase() === addr && toNode.address !== addr) {
        const key = `out:${toNode.address}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            address: toNode.address,
            label: toNode.label,
            value: edge.value,
            direction: "out",
          });
        }
      } else if (toNode.address.toLowerCase() === addr && fromNode.address !== addr) {
        const key = `in:${fromNode.address}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({
            address: fromNode.address,
            label: fromNode.label,
            value: edge.value,
            direction: "in",
          });
        }
      }
    }
    return result;
  }, [selectedNode, graph]);

  const onChainProfile = useMemo(() => {
    if (!selectedNode) return null;
    const addr = selectedNode.address.toLowerCase();
    const txs = rawTxs.filter((t) => t.from === addr || t.to === addr);
    if (txs.length === 0) return null;

    let inUsd = 0;
    let outUsd = 0;
    for (const tx of txs) {
      const v = tx.valueUsd ?? 0;
      if (tx.to === addr) inUsd += v;
      if (tx.from === addr) outUsd += v;
    }
    return { txCount: txs.length, inUsd, outUsd };
  }, [selectedNode, rawTxs]);

  const liveIntel = useQuery(
    addressIntelligenceQuery(
      record.blockchain,
      selectedNode?.address ?? "",
      backendConfigured() && Boolean(selectedNode),
    ),
  );

  const liveNeighbours = useQuery(
    addressNeighboursQuery(
      record.blockchain,
      selectedNode?.address ?? "",
      "out",
      8,
      backendConfigured() && Boolean(selectedNode),
    ),
  );

  const modeLabel = selectedEdge
    ? "Transaction Edge"
    : selectedNode
      ? (NODE_KIND_LABEL[selectedNode.kind] ?? "Wallet")
      : "Overview Mode";

  return (
    <aside className="panel flex h-full min-h-0 max-h-full flex-col overflow-hidden bg-surface/40">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 bg-surface/60">
        <Layers className="size-4 shrink-0 text-primary" />
        <p className="min-w-0 truncate text-sm font-semibold">Contextual Inspector</p>
        <Chip className="ml-auto max-w-[120px] shrink-0 truncate text-[10px]" title={modeLabel}>
          {modeLabel}
        </Chip>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 space-y-4">
          {/* ---- Transaction edge ---- */}
          {selectedEdge ? (
            <div className="space-y-4">
              <div>
                <span className="mono text-[10px] text-muted-foreground uppercase tracking-wider block">
                  Transaction Hash
                </span>
                <button
                  type="button"
                  onClick={() => copy(selectedEdge.txHash)}
                  className="mono mt-1 flex w-full items-center gap-1.5 break-all rounded-md border border-border bg-elevated/50 px-3 py-2 text-left text-[11px] hover:text-foreground transition-colors"
                >
                  <span>{truncateAddress(selectedEdge.txHash, 16, 8)}</span>
                  <Copy className="ml-auto size-3 shrink-0 text-muted-foreground" />
                </button>
                <a
                  href={getExplorerTxUrl(record.blockchain, selectedEdge.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1.5"
                >
                  View on Explorer <ExternalLink className="size-3" />
                </a>
              </div>

              <Section title="01 // Directly Observed On-Chain">
                <dl className="mono space-y-1.5 text-[11px]">
                  <InspectorRow label="Transfer Value" value={selectedEdge.value} />
                  <InspectorRow label="Asset" value={selectedEdge.asset} />
                  <InspectorRow label="Timestamp" value={selectedEdge.timestamp} />
                  <InspectorRow
                    label="From"
                    value={edgeFromNode?.label ?? truncateAddress(edgeFromNode?.address ?? "—", 8, 6)}
                  />
                  <InspectorRow
                    label="To"
                    value={edgeToNode?.label ?? truncateAddress(edgeToNode?.address ?? "—", 8, 6)}
                  />
                </dl>
              </Section>

              <Section title="02 // Continuity & Paths" tone="positive">
                <dl className="mono space-y-1.5 text-[11px]">
                  <InspectorRow
                    label="Continuity Score"
                    value={`${(selectedEdge.continuity * 100).toFixed(0)}%`}
                  />
                  <InspectorRow
                    label="Evidence Strength"
                    value={
                      selectedEdge.continuity >= 0.7
                        ? "Strong — direct on-chain observation"
                        : selectedEdge.continuity >= 0.4
                          ? "Moderate — plausible continuation"
                          : "Weak — possible decoy branch"
                    }
                  />
                  <InspectorRow
                    label="Associated Paths"
                    value={
                      selectedEdge.pathIds.length > 0
                        ? selectedEdge.pathIds.join(", ")
                        : "Not yet assigned to a ranked path"
                    }
                  />
                </dl>
                {onFocusPath && selectedEdge.pathIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedEdge.pathIds.map((pathId) => {
                      const path = paths.find((p) => p.id === pathId);
                      if (!path) return null;
                      const active = focusedPath === pathId;
                      return (
                        <Button
                          key={pathId}
                          type="button"
                          variant={active ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-[10px]"
                          onClick={() => onFocusPath(active ? null : pathId)}
                        >
                          <Eye className="size-3" />
                          {active ? "Focused" : `Focus ${path.label}`}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs"
                disabled={pinPending}
                onClick={() =>
                  onPinEvidence({
                    title: `Transfer ${truncateAddress(selectedEdge.txHash, 10, 6)}`,
                    description: `${selectedEdge.value} ${selectedEdge.asset} from ${edgeFromNode?.label ?? "source"} to ${edgeToNode?.label ?? "destination"} at ${selectedEdge.timestamp}. Continuity ${(selectedEdge.continuity * 100).toFixed(0)}%.`,
                    type: "transaction",
                  })
                }
              >
                <Pin className="size-3.5" />
                Pin Transfer as Evidence
              </Button>
            </div>
          ) : selectedNode ? (
            /* ---- Wallet / node ---- */
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{selectedNode.label}</span>
                  <Chip tone={selectedNode.kind === "vasp" ? "positive" : "neutral"} className="text-[9px]">
                    {NODE_KIND_LABEL[selectedNode.kind] ?? "Wallet"}
                  </Chip>
                </div>
                <button
                  type="button"
                  onClick={() => copy(selectedNode.address)}
                  className="mono mt-1 flex w-full items-center gap-1.5 break-all rounded-md border border-border bg-elevated/50 px-3 py-2 text-left text-[11px] hover:text-foreground transition-colors"
                >
                  <span>{selectedNode.address}</span>
                  <Copy className="ml-auto size-3 shrink-0 text-muted-foreground" />
                </button>
                <a
                  href={getExplorerAddressUrl(record.blockchain, selectedNode.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1.5"
                >
                  View on Explorer <ExternalLink className="size-3" />
                </a>
              </div>

              <Section title="01 // Directly Observed On-Chain">
                <dl className="mono space-y-1.5 text-[11px]">
                  <InspectorRow label="Graph Hop" value={String(selectedNode.hop)} />
                  <InspectorRow label="Inflow" value={selectedNode.valueIn} />
                  <InspectorRow label="Outflow" value={selectedNode.valueOut} />
                  <InspectorRow
                    label="Connected Counterparties"
                    value={String(graphCounterparties.length || selectedNode.connectedAddresses)}
                  />
                  <InspectorRow label="First Activity" value={selectedNode.firstSeen} />
                  {onChainProfile && (
                    <>
                      <InspectorRow
                        label="Indexed Transfers"
                        value={`${onChainProfile.txCount} on-chain`}
                      />
                      {onChainProfile.inUsd > 0 && (
                        <InspectorRow label="Indexed Inflow (USD est.)" value={usd(onChainProfile.inUsd)} />
                      )}
                      {onChainProfile.outUsd > 0 && (
                        <InspectorRow label="Indexed Outflow (USD est.)" value={usd(onChainProfile.outUsd)} />
                      )}
                    </>
                  )}
                </dl>
              </Section>

              {/* Graph counterparties — always available from trace */}
              {graphCounterparties.length > 0 && (
                <Section title="02 // Graph Counterparties">
                  <div className="space-y-1.5">
                    {graphCounterparties.slice(0, 6).map((cp) => (
                      <div
                        key={`${cp.direction}:${cp.address}`}
                        className="flex items-center justify-between text-[10px] mono p-1.5 rounded bg-surface/50 border border-border/40"
                      >
                        <span className="truncate max-w-[140px]" title={cp.address}>
                          {cp.direction === "out" ? "→ " : "← "}
                          {cp.label || truncateAddress(cp.address, 6, 4)}
                        </span>
                        <span className="text-muted-foreground shrink-0 ml-2">{cp.value}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Paths this node participates in */}
              {nodePaths.length > 0 && (
                <Section title="03 // Value-Continuity Paths" tone="positive">
                  <div className="space-y-2">
                    {nodePaths.slice(0, 3).map((p) => {
                      const active = focusedPath === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`rounded-md border p-2 text-[11px] transition-colors ${
                            active ? "border-primary/50 bg-primary/10" : "border-border/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground">{p.label}</p>
                              <p className="text-muted-foreground mt-0.5">
                                {p.verdict} · {pctConfidence(p.confidence)} confidence
                              </p>
                            </div>
                            {onFocusPath ? (
                              <Button
                                type="button"
                                variant={active ? "default" : "outline"}
                                size="sm"
                                className="h-7 shrink-0 px-2 text-[10px]"
                                onClick={() => onFocusPath(active ? null : p.id)}
                              >
                                <Eye className="size-3" />
                                {active ? "Focused" : "Focus"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Attribution */}
              <Section title="04 // Attribution Intelligence" tone="intel">
                {entityMatch ? (
                  <dl className="mono space-y-1.5 text-[11px]">
                    <InspectorRow label="Entity" value={entityMatch.name} />
                    <InspectorRow label="Type" value={entityMatch.type} />
                    <InspectorRow label="Confidence" value={pctConfidence(entityMatch.confidence)} />
                    <InspectorRow label="Source" value={entityMatch.source} />
                    <InspectorRow label="Verified" value={entityMatch.verifiedAt} />
                  </dl>
                ) : (
                  <dl className="mono space-y-1.5 text-[11px]">
                    <InspectorRow
                      label="Classification"
                      value={NODE_KIND_LABEL[selectedNode.kind] ?? "Unattributed wallet"}
                    />
                    <InspectorRow label="On Critical Paths" value={`${selectedNode.relevantPaths} paths`} />
                    {typeof selectedNode.riskScore === "number" ? (
                      <InspectorRow
                        label="Node exposure"
                        value={`${selectedNode.riskScore}/100`}
                      />
                    ) : null}
                    {selectedNode.riskNote && (
                      <p className="text-[10px] text-muted-foreground pt-1 leading-relaxed">
                        {selectedNode.riskNote}
                      </p>
                    )}
                  </dl>
                )}
              </Section>

              {/* Backend enrichment when available */}
              {backendConfigured() && liveIntel.isLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading live chain telemetry…
                </div>
              )}
              {liveIntel.data && (
                <Section title="05 // Live Chain Telemetry" tone="intel">
                  <div className="flex items-center justify-between mb-2">
                    <Chip
                      tone={
                        (liveIntel.data.riskScore ?? investigationRisk?.score ?? 0) >= 61
                          ? "critical"
                          : (liveIntel.data.riskScore ?? investigationRisk?.score ?? 0) >= 31
                            ? "warning"
                            : "positive"
                      }
                    >
                      Indexer risk: {liveIntel.data.riskScore ?? 0}/100
                    </Chip>
                    {investigationRisk ? (
                      <Chip tone={riskBandTone(investigationRisk.band)}>
                        Trace: {investigationRisk.score}/100
                      </Chip>
                    ) : null}
                  </div>
                  <dl className="mono space-y-1 text-[11px]">
                    <InspectorRow
                      label="Total Received"
                      value={usd(liveIntel.data.address.totalReceivedUsd)}
                    />
                    <InspectorRow
                      label="Total Spent"
                      value={usd(liveIntel.data.address.totalSpentUsd)}
                    />
                    <InspectorRow
                      label="Current Balance"
                      value={usd(liveIntel.data.address.balanceUsd)}
                    />
                    <InspectorRow label="Provider" value={liveIntel.data.sourceLabel} />
                  </dl>
                </Section>
              )}
              {liveNeighbours.data && (liveNeighbours.data.neighbours?.length ?? 0) > 0 && (
                <Section title="06 // Indexer Neighbours">
                  <div className="space-y-1.5">
                    {(liveNeighbours.data.neighbours ?? []).slice(0, 5).map((nbr) => (
                      <div
                        key={nbr.address}
                        className="flex items-center justify-between text-[10px] mono p-1.5 rounded bg-surface/50 border border-border/40"
                      >
                        <span className="truncate max-w-[130px]" title={nbr.address}>
                          {nbr.label ?? truncateAddress(nbr.address, 6, 4)}
                        </span>
                        <span className="text-muted-foreground">
                          {usd(nbr.valueUsd)} ({nbr.txCount ?? 0} txs)
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <div className="space-y-2 pt-2 border-t border-border/60">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => onTraceFrom(selectedNode.address)}
                >
                  <Zap className="size-3.5" />
                  Trace Forward From Here →
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  disabled={pinPending}
                  onClick={() =>
                    onPinEvidence({
                      title: `Wallet ${truncateAddress(selectedNode.address, 10, 6)}`,
                      description: `${NODE_KIND_LABEL[selectedNode.kind] ?? "Wallet"} at hop ${selectedNode.hop}. In ${selectedNode.valueIn}, out ${selectedNode.valueOut}.${entityMatch ? ` Attributed: ${entityMatch.name}.` : ""}`,
                      type: "wallet",
                    })
                  }
                >
                  <Pin className="size-3.5" />
                  Pin Wallet to Evidence Vault
                </Button>
              </div>
            </div>
          ) : (
            /* ---- Overview ---- */
            <div className="space-y-3.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Compass className="size-4 text-primary" />
                Investigation Scope & Bounds
              </div>
              <p className="leading-relaxed">
                Select any wallet or transfer edge on the graph to inspect on-chain
                records, attribution intelligence, and value-continuity paths.
              </p>

              <div className="mono space-y-2 border-t border-border pt-3 text-[11px]">
                <InspectorRow label="Chain" value={chainLabel(record.blockchain)} />
                <InspectorRow
                  label="Trace Depth"
                  value={`${graph.bounds.observedHops ?? (graph.nodes.length > 0 ? Math.max(...graph.nodes.map((n) => n.hop)) : 0)} observed / ${record.trace_depth} max`}
                />
                <InspectorRow label="Addresses in Graph" value={String(graph.nodes.length)} />
                <InspectorRow label="Traced Transfers" value={String(graph.edges.length)} />
                <InspectorRow label="Ranked Paths" value={String(paths.length)} />
                <InspectorRow
                  label="Trace Window"
                  value={
                    record.window_start
                      ? `${new Date(record.window_start).toLocaleDateString()} → ${
                          record.window_end
                            ? new Date(record.window_end).toLocaleDateString()
                            : "now"
                        }`
                      : "Unbounded"
                  }
                />
                <InspectorRow
                  label="Min Value Floor"
                  value={record.min_value ? `$${record.min_value.toLocaleString()}` : "None"}
                />
              </div>

              {investigationRisk ? (
                <Section title="Investigation Risk" tone="intel">
                  <div className="flex items-center justify-between">
                    <Chip tone={riskBandTone(investigationRisk.band)}>
                      {investigationRisk.score}/100
                    </Chip>
                    <span className="text-[10px] text-muted-foreground">
                      {investigationRisk.provenance}
                    </span>
                  </div>
                </Section>
              ) : null}

              {paths.length > 0 && (
                <Section title="Ranked Value Paths" tone="positive">
                  <div className="space-y-2">
                    {paths.slice(0, 5).map((p, idx) => {
                      const active = focusedPath === p.id;
                      return (
                        <div
                          key={p.id}
                          className={`rounded-md border p-2 text-[11px] transition-colors ${
                            active ? "border-primary/50 bg-primary/10" : "border-border/40 bg-background/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground">
                                #{String(idx + 1).padStart(2, "0")} · {p.label}
                              </p>
                              <p className="text-muted-foreground mt-0.5 leading-relaxed">{p.verdict}</p>
                              <p className="mono mt-1 text-[10px] text-muted-foreground">
                                {p.valuePreserved} · {p.hops} hops · {(p.continuity * 100).toFixed(0)}% continuity
                              </p>
                            </div>
                            {onFocusPath ? (
                              <Button
                                type="button"
                                variant={active ? "default" : "outline"}
                                size="sm"
                                className="h-7 shrink-0 px-2 text-[10px]"
                                onClick={() => onFocusPath(active ? null : p.id)}
                              >
                                <Eye className="size-3" />
                                {active ? "Focused" : "Focus"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {paths[0] && !onFocusPath && (
                <Section title="Primary Fund Flow Path" tone="positive">
                  <p className="text-[11px] font-semibold text-foreground">{paths[0].label}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    {paths[0].verdict}
                  </p>
                  <dl className="mono space-y-1 mt-2 text-[11px]">
                    <InspectorRow
                      label="Continuity"
                      value={`${(paths[0].continuity * 100).toFixed(0)}%`}
                    />
                    <InspectorRow label="Confidence" value={pctConfidence(paths[0].confidence)} />
                  </dl>
                </Section>
              )}

              {entities[0] && (
                <Section title="Top VASP Candidate" tone="intel">
                  <p className="text-[11px] font-semibold text-foreground">{entities[0].name}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {entities[0].proximityHops} hop(s) ·{" "}
                    {pctConfidence(entities[0].attributionStrength)} attribution strength
                  </p>
                </Section>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
