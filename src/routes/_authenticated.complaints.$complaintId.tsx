import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Siren,
  FolderOpen,
} from "lucide-react";
import { toast } from "sonner";
import { createCase, createInvestigation } from "@/lib/api/queries";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chip, Mono } from "@/components/vt/badges";
import { BackendGate, BackendStatusChip } from "@/components/vt/BackendGate";
import { ErrorState, LoadingState, PageHeader, StatTile } from "@/components/vt/states";
import {
  alertsQuery,
  complaintQuery,
  escalateComplaint,
  leaReportQuery,
  retriageComplaint,
} from "@/lib/api/backend";
import {
  COMPLAINT_SOURCE_LABEL,
  FRAUD_TYPE_LABEL,
  type AttributionSummary,
  type Complaint,
} from "@/lib/api/backend-types";
import { truncateAddress } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/complaints/$complaintId")({
  head: () => ({
    meta: [
      { title: "Complaint attribution — TRACIFY" },
      {
        name: "description",
        content:
          "Automated attribution for a reported complaint: nearest exchange deposit address, traced value trail, intermediary roles, typology and the standardised law-enforcement report.",
      },
      { property: "og:title", content: "Complaint attribution — TRACIFY" },
      {
        property: "og:description",
        content:
          "Nearest-VASP attribution, value trail and freeze-ready reporting for a victim complaint.",
      },
    ],
  }),
  component: ComplaintDetailPage,
});

function ComplaintDetailPage() {
  const { complaintId } = Route.useParams();

  return (
    <div className="space-y-6">
      <Link
        to="/complaints"
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All complaints
      </Link>
      <BackendGate>
        <ComplaintDetail id={complaintId} />
      </BackendGate>
    </div>
  );
}

function ComplaintDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const complaint = useQuery(complaintQuery(id));
  const alerts = useQuery(alertsQuery({ complaintId: id }));

  const retriage = useMutation({
    mutationFn: () => retriageComplaint(id),
    onSuccess: async () => {
      toast.success("Re-attribution queued");
      await queryClient.invalidateQueries({ queryKey: ["backend", "complaints"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const escalate = useMutation({
    mutationFn: async () => {
      const c = complaint.data;
      if (!c) throw new Error("Complaint data not loaded.");

      // 1. Escalate on backend service
      try {
        await escalateComplaint(id);
      } catch (err) {
        console.warn("Backend escalate error (proceeding with workspace case):", err);
      }

      // 2. Map priority from risk category
      const priority =
        c.riskCategory === "severe" || c.riskCategory === "high"
          ? "critical"
          : c.riskCategory === "elevated"
          ? "high"
          : "medium";

      // 3. Create Case record in Supabase
      const newCase = await createCase({
        title: `[${COMPLAINT_SOURCE_LABEL[c.source]} · ${c.reference}] ${FRAUD_TYPE_LABEL[c.fraudType] ?? "Fraud Incident"}`,
        description: `Source: ${COMPLAINT_SOURCE_LABEL[c.source]}\nReference: ${c.reference}\nReported Loss: ₹${c.lossInr?.toLocaleString("en-IN")}\nTypology: ${FRAUD_TYPE_LABEL[c.fraudType]}\nJurisdiction: ${c.jurisdiction || "Cybercrime Unit"}\nSuspects: ${c.suspectAddresses.map((s) => `${s.address} (${s.chain})`).join(", ")}\n\nVictim Statement:\n${c.narrative || "No narrative provided."}`,
        priority,
        status: "active",
        jurisdiction: c.jurisdiction || "Cybercrime Division",
        reported_loss: c.lossInr,
      });

      // 4. If suspect addresses exist, create the initial investigation automatically
      let targetInvId: string | null = null;
      if (c.suspectAddresses.length > 0) {
        const primary = c.suspectAddresses[0]!;
        try {
          const inv = await createInvestigation({
            case_id: newCase.id,
            name: `${c.reference} — Suspect ${primary.chain.toUpperCase()} Trace`,
            description: `Auto-ingested from ${COMPLAINT_SOURCE_LABEL[c.source]} complaint ${c.reference}. Primary target: ${primary.address}`,
            target_address: primary.address,
            blockchain: primary.chain,
            trace_depth: 3,
            status: "active",
          });
          targetInvId = inv.id;
        } catch (invErr) {
          console.warn("Failed to auto-create linked investigation:", invErr);
        }
      }

      return { caseId: newCase.id, investigationId: targetInvId };
    },
    onSuccess: async ({ caseId, investigationId }) => {
      toast.success("Complaint successfully escalated to active Case!");
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      await queryClient.invalidateQueries({ queryKey: ["investigations"] });
      await queryClient.invalidateQueries({ queryKey: ["backend", "complaints"] });

      if (investigationId) {
        void navigate({
          to: "/investigations/$investigationId/$tab",
          params: { investigationId, tab: "graph" },
        });
      } else {
        void navigate({
          to: "/cases/$caseId",
          params: { caseId },
        });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Escalation failed"),
  });

  if (complaint.isLoading) return <LoadingState />;
  if (complaint.error) return <ErrorState message={complaint.error.message} />;
  const c = complaint.data;
  if (!c) return <ErrorState message="Complaint not found." />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${COMPLAINT_SOURCE_LABEL[c.source]} intake`}
        title={c.reference}
        description={c.narrative ?? "No narrative supplied with this complaint."}
        actions={
          <>
            <BackendStatusChip />
            <Button
              variant="outline"
              onClick={() => retriage.mutate()}
              disabled={retriage.isPending}
            >
              {retriage.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Re-attribute
            </Button>
            <Button onClick={() => escalate.mutate()} disabled={escalate.isPending}>
              <Siren className="size-4" />
              Escalate to case
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Risk score" value={c.riskScore} hint={c.riskCategory} tone="critical" />
        <StatTile
          label="Reported loss"
          value={`₹${c.lossInr.toLocaleString("en-IN")}`}
          hint={FRAUD_TYPE_LABEL[c.fraudType]}
        />
        <StatTile
          label="Suspect wallets"
          value={c.suspectAddresses.length}
          hint={c.jurisdiction ?? "jurisdiction not stated"}
        />
        <StatTile
          label="Triage"
          value={c.triageStatus}
          hint={c.primaryVasp ? c.primaryVasp.entity : "no VASP yet"}
          tone="intel"
        />
      </div>

      <Tabs defaultValue="attribution">
        <TabsList>
          <TabsTrigger value="attribution">Attribution</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.data?.items.length ?? 0})</TabsTrigger>
          <TabsTrigger value="report">LEA report</TabsTrigger>
        </TabsList>

        <TabsContent value="attribution" className="mt-4 space-y-4">
          {c.suspectAddresses.map((a) => (
            <AddressAttribution key={`${a.chain}:${a.address}`} chain={a.chain} address={a.address} attribution={a.attribution} note={a.note} />
          ))}
        </TabsContent>

        <TabsContent value="alerts" className="mt-4 space-y-3">
          {(alerts.data?.items ?? []).length === 0 ? (
            <p className="clay-inset px-4 py-8 text-center text-sm text-muted-foreground">
              No alerts were raised for this complaint.
            </p>
          ) : (
            (alerts.data?.items ?? []).map((al) => (
              <article key={al.id} className="clay clay-lift rounded-2xl p-5 shadow-clay transition-all hover:border-border-strong">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldAlert className="size-4 text-warning" />
                  <span className="text-sm font-semibold">{al.title}</span>
                  <Mono className="text-muted-foreground">{al.code}</Mono>
                  <Chip tone={al.severity === "critical" || al.severity === "high" ? "critical" : "warning"} dot>
                    {al.severity}
                  </Chip>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{al.summary}</p>
                {al.recommendedActions.length > 0 ? (
                  <ul className="mt-2.5 space-y-1 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
                    {al.recommendedActions.map((r) => (
                      <li key={r}>→ {r}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))
          )}
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <LeaReportView id={id} complaint={c} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AddressAttribution({
  chain,
  address,
  note,
  attribution,
}: {
  chain: string;
  address: string;
  note?: string | undefined;
  attribution?: AttributionSummary | undefined;
}) {
  return (
    <section className="clay rounded-2xl p-5 shadow-clay">
      <div className="flex flex-wrap items-center gap-2">
        <Mono className="text-foreground">{truncateAddress(address, 12, 8)}</Mono>
        <Chip tone="info">{chain}</Chip>
        {attribution ? (
          <>
            <Chip tone={attribution.live ? "positive" : "neutral"} dot>
              {attribution.live ? "live chain index" : "offline model"}
            </Chip>
            <Chip tone="intel">{attribution.typology.label}</Chip>
            <span className="mono ml-auto text-[11px] text-muted-foreground">
              risk {attribution.riskScore} · {attribution.riskCategory}
            </span>
          </>
        ) : (
          <Chip tone="warning">Not yet attributed</Chip>
        )}
      </div>

      {note ? <p className="mt-2 text-[12px] text-muted-foreground">{note}</p> : null}

      {!attribution ? null : (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {attribution.nearestVasp ? (
            <div className="clay-inset px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="size-4 text-intel" />
                <span className="text-sm font-semibold">{attribution.nearestVasp.entity}</span>
                {attribution.nearestVasp.directDeposit ? (
                  <Chip tone="positive">direct deposit</Chip>
                ) : (
                  <Chip>{attribution.nearestVasp.hops} hops</Chip>
                )}
                <span className="mono ml-auto text-[11px] text-muted-foreground">
                  {Math.round(attribution.nearestVasp.confidence * 100)}% confidence · $
                  {Math.round(attribution.nearestVasp.valueUsd).toLocaleString()}
                </span>
              </div>
              <p className="mono mt-2 text-[11px] text-muted-foreground">
                deposit {truncateAddress(attribution.nearestVasp.address, 10, 8)}
              </p>
              <p className="mono mt-1.5 break-all text-[11px] text-muted-foreground">
                {attribution.nearestVasp.path.map((p) => truncateAddress(p, 6, 4)).join(" → ")}
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              No regulated touchpoint within the traced boundary — funds remain in
              unattributed wallets.
            </p>
          )}

          <div className="grid gap-2 text-[11px] sm:grid-cols-4">
            <Metric label="Addresses" value={attribution.metrics.addressesTouched} />
            <Metric label="Hops traced" value={attribution.metrics.hopsTraced} />
            <Metric
              label="Value traced"
              value={`$${Math.round(attribution.metrics.valueTracedUsd).toLocaleString()}`}
            />
            <Metric label="VASP touchpoints" value={attribution.metrics.vaspTouchpoints} />
          </div>

          {attribution.vaspCandidates.length > 1 ? (
            <div>
              <p className="label-caps mb-1.5">Other exchange candidates</p>
              <div className="flex flex-wrap gap-1.5">
                {attribution.vaspCandidates.slice(1, 6).map((v) => (
                  <Chip key={`${v.entity}:${v.address}`}>
                    {v.entity} · {v.hops}h · {Math.round(v.confidence * 100)}%
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {attribution.intermediaries.length > 0 ? (
            <div>
              <p className="label-caps mb-1.5">Intermediary wallets</p>
              <div className="space-y-1.5">
                {attribution.intermediaries.slice(0, 5).map((w) => (
                  <p key={w.address} className="mono text-[11px] text-muted-foreground">
                    hop {w.hop} · {truncateAddress(w.address, 8, 6)} · {w.role} — {w.reason}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            {attribution.obfuscation.detected ? (
              <Chip tone="critical" dot>
                mixer exposure
              </Chip>
            ) : null}
            {attribution.crossChain.detected ? (
              <Chip tone="warning" dot>
                cross-chain movement
              </Chip>
            ) : null}
            {attribution.freezeActionable ? (
              <Chip tone="positive" dot>
                freeze actionable
              </Chip>
            ) : null}
            {attribution.signals.slice(0, 4).map((s) => (
              <Chip key={s.code} tone="intel">
                {s.label}
              </Chip>
            ))}
          </div>

          {attribution.recommendations.length > 0 ? (
            <ul className="space-y-1 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
              {attribution.recommendations.map((r) => (
                <li key={r}>→ {r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="clay-inset px-3 py-2">
      <p className="label-caps">{label}</p>
      <p className="mono mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function LeaReportView({ id, complaint }: { id: string; complaint: Complaint }) {
  const report = useQuery(leaReportQuery(id));

  if (report.isLoading) return <LoadingState rows={3} />;
  if (report.error) return <ErrorState message={report.error.message} />;
  const r = report.data;
  if (!r) return null;

  const download = () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${complaint.reference}-attribution-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="clay flex flex-wrap items-center gap-3 p-5">
        <div className="clay-icon flex size-10 text-primary">
          <FileText className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{r.title}</p>
          <p className="mono text-[11px] text-muted-foreground">
            {r.reference} · classification {r.classification} ·{" "}
            {new Date(r.generatedAt).toLocaleString()}
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={download}>
          Export JSON
        </Button>
      </div>

      <section className="clay rounded-2xl p-5 shadow-clay">
        <p className="label-caps mb-2">Serve on</p>
        {r.attributedVasps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No attributed exchange yet — a freeze request cannot be raised from this report.
          </p>
        ) : (
          <div className="space-y-2">
            {r.attributedVasps.map((v) => (
              <div key={`${v.entity}:${v.depositAddress}`} className="clay-inset px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{v.entity}</span>
                  <Chip tone="info">{v.chain}</Chip>
                  {v.directDeposit ? <Chip tone="positive">direct</Chip> : <Chip>{v.hops} hops</Chip>}
                  <span className="mono ml-auto text-[11px] text-muted-foreground">
                    {Math.round(v.confidence * 100)}% · ${Math.round(v.valueUsd).toLocaleString()}
                  </span>
                </div>
                <p className="mono mt-1.5 break-all text-[11px] text-muted-foreground">
                  {v.depositAddress}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="clay rounded-2xl p-5 shadow-clay">
        <p className="label-caps mb-2">Annexure A — value trails</p>
        <div className="space-y-3">
          {r.transactionTrails.map((t) => (
            <div key={t.reportedAddress}>
              <p className="mono text-[11px] text-foreground">
                {truncateAddress(t.reportedAddress, 10, 8)} · {t.chain} · source {t.dataSource}
              </p>
              <p className="mono mt-1 break-all text-[11px] text-muted-foreground">
                {t.trail.map((p) => truncateAddress(p, 6, 4)).join(" → ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="clay rounded-2xl p-5 shadow-clay">
        <p className="label-caps mb-2">Indicators</p>
        <p className="text-[12px] text-muted-foreground">{r.indicators.crossChain}</p>
        <p className="text-[12px] text-muted-foreground">{r.indicators.obfuscation}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.indicators.behavioural.map((b) => (
            <Chip key={b.code} tone="intel">
              {b.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="clay rounded-2xl p-5 shadow-clay">
        <p className="label-caps mb-2">Recommended actions</p>
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          {r.recommendedActions.map((a) => (
            <li key={a}>→ {a}</li>
          ))}
        </ul>
        <p className="label-caps mt-3 mb-2">Caveats</p>
        <ul className="space-y-1 text-[12px] text-muted-foreground">
          {r.caveats.map((a) => (
            <li key={a}>· {a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
