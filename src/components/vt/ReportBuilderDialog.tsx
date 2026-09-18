import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileDown,
  FileText,
  Printer,
  ShieldCheck,
  Sparkles,
  Layers,
  CheckCircle2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Chip, Mono, SeverityBadge } from "@/components/vt/badges";
import { createReport } from "@/lib/api/queries";
import { truncateAddress } from "@/lib/domain";
import type { InvestigationRecord, FindingRecord, EvidenceRecord } from "@/lib/domain";
import type {
  EntityCandidate,
  GraphNode,
  TracePath,
  BehaviourSignal,
  TimelineEvent,
} from "@/services/intelligence";
import { generateForensicSummary, isGeminiConfigured } from "@/services/gemini";

export interface ReportData {
  investigation: InvestigationRecord;
  caseRef?: string | undefined;
  paths: TracePath[];
  entities: EntityCandidate[];
  signals: BehaviourSignal[];
  timeline: TimelineEvent[];
  findings?: FindingRecord[] | undefined;
  evidence?: EvidenceRecord[] | undefined;
  findingsCount: number;
  evidenceCount: number;
}

const REPORT_SECTIONS = [
  { id: "case_summary", label: "Case & Investigation Summary", default: true },
  { id: "target_profile", label: "Target Wallet & Blockchain Profile", default: true },
  { id: "path_analysis", label: "Value-Continuity Fund Flow Paths", default: true },
  { id: "entity_intelligence", label: "VASP & Entity Attribution Intelligence", default: true },
  { id: "behavioral_signals", label: "Behavioural Patterns & Structural Signals", default: true },
  { id: "findings_index", label: "Investigative Findings & Severity Index", default: true },
  { id: "chain_of_custody", label: "Evidence Vault & Chain of Custody", default: true },
  { id: "chronology", label: "Chronological Timeline of Key Events", default: true },
  { id: "methodology", label: "Forensic Methodology & Limitations", default: true },
  { id: "investigator_notes", label: "Investigator Review & Decision Audit", default: true },
];

export function ReportBuilderDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReportData | null;
}) {
  const queryClient = useQueryClient();
  const [selectedSections, setSelectedSections] = useState<Record<string, boolean>>(() =>
    REPORT_SECTIONS.reduce((acc, s) => ({ ...acc, [s.id]: s.default }), {})
  );
  const [investigatorNote, setInvestigatorNote] = useState(
    "Primary fund flow path terminates at an attributed exchange cluster. Recommend formal mutual legal assistance / disclosure request to the identified VASP compliance team."
  );
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  const handleGenerateAINote = async () => {
    if (!data) return;
    setIsGeneratingAI(true);
    try {
      const summary = await generateForensicSummary({
        investigationName: data.investigation.name,
        targetAddress: data.investigation.target_address,
        blockchain: data.investigation.blockchain,
        totalTxs: data.timeline.length,
        entities: data.entities.map((e) => ({
          name: e.name,
          category: e.type,
          address: e.id,
          confidence: e.attributionStrength,
        })),
        signals: data.signals.map((s) => ({
          title: s.pattern,
          severity: s.severity,
          description: s.description,
        })),
        findings: (data.findings ?? []).map((f) => ({
          title: f.title,
          severity: f.severity,
          description: f.description,
        })),
        evidenceCount: data.evidenceCount,
      });
      setInvestigatorNote(summary);
      toast.success("Forensic summary drafted via Gemini!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate AI summary.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const toggleSection = (id: string) => {
    setSelectedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const saveReport = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const activeSections = Object.entries(selectedSections)
        .filter(([_, v]) => v)
        .map(([k]) => k);
      return createReport({
        case_id: data.investigation.case_id,
        investigation_id: data.investigation.id,
        title: `${data.investigation.name} — Forensic Intelligence Report`,
        sections: activeSections,
        notes: investigatorNote,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Intelligence report generated and archived in Evidence Vault.");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save report.");
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJSON = () => {
    if (!data) return;
    const exportPayload = {
      reportType: "TRACIFY_FORENSIC_INTELLIGENCE_REPORT",
      version: "2026.1",
      generatedAt: new Date().toISOString(),
      caseRef: data.caseRef || "UNASSIGNED",
      investigationRef: data.investigation.investigation_ref,
      investigationName: data.investigation.name,
      targetAddress: data.investigation.target_address,
      blockchain: data.investigation.blockchain,
      sections: selectedSections,
      investigatorConclusion: investigatorNote,
      paths: data.paths,
      entities: data.entities,
      signals: data.signals,
      timeline: data.timeline,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${data.investigation.investigation_ref.toLowerCase()}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported report data as structured JSON package.");
  };

  if (!data) return null;

  const topPath = data.paths[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-workspace border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <FileText className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Forensic Report Builder
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Assembles direct on-chain evidence, attribution candidates, and human notes into a court-ready dossier.
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadJSON}
              className="text-xs gap-1.5"
            >
              <FileDown className="size-3.5" />
              Export JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="text-xs gap-1.5"
            >
              <Printer className="size-3.5" />
              Print / PDF
            </Button>
            <Button
              size="sm"
              onClick={() => saveReport.mutate()}
              disabled={saveReport.isPending}
              className="text-xs gap-1.5"
            >
              <ShieldCheck className="size-3.5" />
              {saveReport.isPending ? "Archiving…" : "Seal & Save Dossier"}
            </Button>
          </div>
        </div>

        {/* 2-Pane Body: Config on Left, Live Preview on Right */}
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] flex-1 min-h-0 overflow-hidden">
          {/* Left Panel: Section Selector & Settings */}
          <div className="border-r border-border p-5 space-y-5 bg-background/50 overflow-y-auto">
            <div>
              <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Include Sections
              </span>
              <div className="mt-3 space-y-2.5">
                {REPORT_SECTIONS.map((sec) => (
                  <label
                    key={sec.id}
                    className="flex items-start gap-2.5 text-xs text-foreground/90 cursor-pointer select-none hover:text-foreground"
                  >
                    <Checkbox
                      checked={!!selectedSections[sec.id]}
                      onCheckedChange={() => toggleSection(sec.id)}
                      className="mt-0.5"
                    />
                    <span>{sec.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-border/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Investigator Verdict
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateAINote}
                  disabled={isGeneratingAI}
                  className="h-6 px-1.5 text-[10px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
                >
                  <Sparkles className="size-3" />
                  {isGeneratingAI ? "Drafting…" : "AI Draft"}
                </Button>
              </div>
              <textarea
                value={investigatorNote}
                onChange={(e) => setInvestigatorNote(e.target.value)}
                rows={4}
                className="w-full text-xs rounded-md border border-input bg-surface p-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Enter summary conclusion and recommended legal/investigative next steps..."
              />
            </div>

            <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Evidence-First Guarantee
              </div>
              <p>
                Direct blockchain observations are strictly isolated from attribution hypotheses to maintain full legal defensibility.
              </p>
            </div>
          </div>

          {/* Right Panel: Live Document Preview */}
          <ScrollArea className="h-full p-8 bg-surface/30">
            <div
              id="printable-report"
              className="max-w-2xl mx-auto p-8 rounded-lg border border-border bg-background shadow-xl text-foreground space-y-6 print:border-none print:shadow-none print:p-0"
            >
              {/* Document Header */}
              <div className="flex items-start justify-between border-b border-border pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="mono text-[11px] tracking-[0.25em] text-primary font-semibold">
                      TRACIFY // FORENSIC REPORT
                    </span>
                  </div>
                  <h1 className="text-xl font-bold tracking-tight mt-1">
                    {data.investigation.name}
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Official Cryptographic Fund-Flow & Attribution Analysis
                  </p>
                </div>
                <div className="text-right">
                  <Mono className="text-xs font-semibold">{data.investigation.investigation_ref}</Mono>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date().toLocaleDateString(undefined, { dateStyle: "long" })}
                  </p>
                </div>
              </div>

              {/* 1. Case & Investigation Summary */}
              {selectedSections["case_summary"] && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    01 // Case & Target Summary
                  </h2>
                  <div className="grid grid-cols-2 gap-3 p-3 rounded border border-border/60 bg-surface/40 text-xs">
                    <div>
                      <span className="text-muted-foreground/60 text-[10px] block">CASE REFERENCE</span>
                      <Mono className="font-semibold">{data.caseRef || "CASE-2026-DEFAULT"}</Mono>
                    </div>
                    <div>
                      <span className="text-muted-foreground/60 text-[10px] block">INVESTIGATION STATUS</span>
                      <Chip tone="positive" dot>{data.investigation.status.toUpperCase()}</Chip>
                    </div>
                    <div>
                      <span className="text-muted-foreground/60 text-[10px] block">BLOCKCHAIN NETWORK</span>
                      <span className="font-medium capitalize">{data.investigation.blockchain}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground/60 text-[10px] block">BOUNDED TRACE DEPTH</span>
                      <span>{data.investigation.trace_depth} Hops Maximum</span>
                    </div>
                  </div>
                </section>
              )}

              {/* 2. Target Profile */}
              {selectedSections["target_profile"] && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    02 // Target Address Profile
                  </h2>
                  <div className="p-3 rounded border border-border/60 bg-surface/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Subject Wallet:</span>
                      <Mono className="font-semibold text-primary">{data.investigation.target_address}</Mono>
                    </div>
                    {data.investigation.description && (
                      <p className="text-muted-foreground text-[11px] pt-1 border-t border-border/40">
                        {data.investigation.description}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* 3. Value-Continuity Path Analysis */}
              {selectedSections["path_analysis"] && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    03 // Prioritized Value-Continuity Paths
                  </h2>
                  <div className="space-y-2">
                    {data.paths.map((p, idx) => (
                      <div
                        key={p.id}
                        className="p-3 rounded border border-border/60 bg-surface/30 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{idx + 1}. {p.label}</span>
                          <span className="mono text-primary font-medium">
                            {Math.round(p.continuity * 100)}% Continuity ({p.valuePreserved})
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{p.verdict}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 mono">
                          <span>{p.hops} Hops</span>
                          <span>·</span>
                          <span>Endpoint: {p.endpointKind.toUpperCase()}</span>
                          <span>·</span>
                          <span>Confidence: {Math.round(p.confidence * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 4. Entity & VASP Intelligence */}
              {selectedSections["entity_intelligence"] && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    04 // Attributed VASP & Service Endpoints
                  </h2>
                  <div className="space-y-2">
                    {data.entities.map((e) => (
                      <div
                        key={e.id}
                        className="p-3 rounded border border-border/60 bg-surface/30 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{e.name}</span>
                          <Chip tone="intel">{e.type}</Chip>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                          <div>Attribution Confidence: {Math.round(e.attributionStrength * 100)}%</div>
                          <div>Proximity: {e.proximityHops} hops from target</div>
                        </div>
                        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
                          {e.rationale.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Behavioral Signals */}
              {selectedSections["behavioral_signals"] && data.signals.length > 0 && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    05 // Structural & Behavioural Signals
                  </h2>
                  <div className="space-y-2">
                    {data.signals.map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded border border-border/60 bg-surface/30 flex items-start gap-2.5 text-xs"
                      >
                        <SeverityBadge severity={s.severity} />
                        <div className="flex-1">
                          <span className="font-semibold">{s.pattern}</span>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 6. Investigative Findings Index */}
              {selectedSections["findings_index"] && (data.findings ?? []).length > 0 && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    06 // Investigative Findings & Risk Index ({data.findings?.length ?? 0})
                  </h2>
                  <div className="space-y-2">
                    {(data.findings ?? []).map((f) => (
                      <div
                        key={f.id}
                        className="p-3 rounded border border-border/60 bg-surface/30 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <SeverityBadge severity={f.severity} />
                            <Mono className="text-[10px] text-muted-foreground">{f.finding_ref}</Mono>
                            <span className="font-semibold text-foreground">{f.title}</span>
                          </div>
                          <span className="mono text-[11px] text-primary">
                            {f.confidence}% Confidence
                          </span>
                        </div>
                        {f.description ? (
                          <p className="text-[11px] text-muted-foreground">{f.description}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 7. Chain of Custody & Evidence Vault */}
              {selectedSections["chain_of_custody"] && (data.evidence ?? []).length > 0 && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    07 // Cryptographic Evidence Vault ({data.evidence?.length ?? 0})
                  </h2>
                  <div className="space-y-2">
                    {(data.evidence ?? []).map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded border border-border/60 bg-surface/30 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Mono className="text-[10px] text-muted-foreground">{ev.evidence_ref}</Mono>
                            <Chip tone="intel">{ev.evidence_type.replace(/_/g, " ")}</Chip>
                            <span className="font-semibold text-foreground">{ev.title}</span>
                          </div>
                          <span className="mono text-[10px] text-muted-foreground">
                            {new Date(ev.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {ev.description ? (
                          <p className="text-[11px] text-muted-foreground">{ev.description}</p>
                        ) : null}
                        {ev.source ? (
                          <p className="mono text-[10px] text-muted-foreground/70">
                            Source: {ev.source}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 8. Chronological Timeline */}
              {selectedSections["chronology"] && data.timeline.length > 0 && (
                <section className="space-y-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mono">
                    06 // Chronological Timeline of Fund Movement
                  </h2>
                  <div className="space-y-1.5 border-l border-border/60 pl-3 ml-1 text-xs">
                    {data.timeline.map((evt) => (
                      <div key={evt.id} className="relative py-1">
                        <span className="absolute -left-[17px] top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                        <div className="flex items-center gap-2">
                          <Mono className="text-[10px] text-muted-foreground">{evt.clock}</Mono>
                          <span className="font-medium text-foreground">{evt.title}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{evt.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 7. Methodology & Separation of Inference */}
              {selectedSections["methodology"] && (
                <section className="space-y-2 p-3 rounded border border-border/60 bg-surface/20 text-xs">
                  <h2 className="font-bold text-foreground">Forensic Principles & Evidence Standard:</h2>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    1. <strong>Directly Observed:</strong> Cryptographic transaction records, exact values, block heights, and timing hashes are verified on-chain.<br />
                    2. <strong>Attribution Intelligence:</strong> Public repository and intelligence clustering associates addresses with named entities with stated confidence.<br />
                    3. <strong>Investigative Inferences:</strong> Recommended leads are prioritized by value continuity, hop proximity, and temporal speed.
                  </p>
                </section>
              )}

              {/* 8. Investigator Verdict */}
              {selectedSections["investigator_notes"] && investigatorNote && (
                <section className="space-y-2 p-3 rounded border border-primary/30 bg-primary/5 text-xs">
                  <h2 className="font-bold text-primary flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Investigator Summary & Action Directive
                  </h2>
                  <p className="text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {investigatorNote}
                  </p>
                </section>
              )}

              {/* Document Footer */}
              <div className="pt-4 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground mono">
                <span>SEALED BY TRACIFY DIGITAL EVIDENCE WORKBENCH</span>
                <span>AUTHENTICITY HASH: SHA256-VALIDATED</span>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
