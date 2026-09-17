import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Radar,
  ShieldAlert,
  Vault,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Chip,
  InvestigationStatusBadge,
  Mono,
  PriorityBadge,
  SeverityBadge,
} from "@/components/vt/badges";
import { DeleteInvestigationButton } from "@/components/vt/DeleteInvestigationButton";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from "@/components/vt/states";
import {
  caseQuery,
  evidenceQuery,
  findingsQuery,
  investigationsQuery,
  updateCase,
} from "@/lib/api/queries";
import {
  CASE_STATUS_LABEL,
  CASE_STATUSES,
  chainLabel,
  truncateAddress,
} from "@/lib/domain";
import { useUIStore } from "@/stores/ui";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Case file — TRACIFY" },
      {
        name: "description",
        content:
          "Full case file: linked blockchain investigations, evidence-backed findings, held evidence and generated intelligence reports.",
      },
      { property: "og:title", content: "Case file — TRACIFY" },
      {
        property: "og:description",
        content:
          "Investigations, findings, evidence and reports for a single TRACIFY case.",
      },
    ],
  }),
  component: CaseDetailPage,
});

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();
  const setStartInvestigationOpen = useUIStore(
    (s) => s.setStartInvestigationOpen,
  );
  const setPresetCaseId = useUIStore((s) => s.setPresetCaseId);

  const caseRecord = useQuery(caseQuery(caseId));
  const investigations = useQuery(investigationsQuery(caseId));
  const findings = useQuery(findingsQuery({ caseId }));
  const evidence = useQuery(evidenceQuery({ caseId }));

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateCase(caseId, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Case status updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (caseRecord.isLoading) return <LoadingState rows={5} />;
  if (caseRecord.error)
    return <ErrorState message={caseRecord.error.message} />;

  const record = caseRecord.data!;

  return (
    <div className="space-y-6">
      <Link
        to="/cases"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All cases
      </Link>

      <PageHeader
        eyebrow={record.case_ref}
        title={record.title}
        description={record.description ?? undefined}
        actions={
          <>
            <Select
              value={record.status}
              onValueChange={(v) => statusMutation.mutate(v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CASE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                setPresetCaseId(caseId);
                setStartInvestigationOpen(true);
              }}
            >
              <Radar className="size-4" />
              Start investigation
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={record.priority} />
        <Chip>{record.jurisdiction ?? "Jurisdiction unset"}</Chip>
        <Chip tone="intel">
          opened {new Date(record.created_at).toLocaleDateString()}
        </Chip>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Reported loss"
          value={
            record.reported_loss
              ? `$${record.reported_loss.toLocaleString()}`
              : "—"
          }
          hint="victim-reported total"
          tone="critical"
        />
        <StatTile
          label="Investigations"
          value={(investigations.data ?? []).length}
          hint="traces linked to this case"
          tone="intel"
        />
        <StatTile
          label="Findings"
          value={(findings.data ?? []).length}
          hint="analyst conclusions"
        />
        <StatTile
          label="Evidence items"
          value={(evidence.data ?? []).length}
          hint="held in the vault"
        />
      </div>

      <Tabs defaultValue="investigations">
        <TabsList>
          <TabsTrigger value="investigations">Investigations</TabsTrigger>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
        </TabsList>

        <TabsContent value="investigations" className="mt-4 space-y-2.5">
          {(investigations.data ?? []).length === 0 ? (
            <EmptyState
              icon={Radar}
              title="No investigations yet"
              description="Start a trace from a known target wallet to begin building the bounded investigation graph."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setPresetCaseId(caseId);
                    setStartInvestigationOpen(true);
                  }}
                >
                  Start investigation
                </Button>
              }
            />
          ) : (
            (investigations.data ?? []).map((inv) => (
              <div
                key={inv.id}
                className="panel flex items-start gap-3 px-4 py-3.5 transition-colors hover:border-border-strong"
              >
                <Link
                  to="/investigations/$investigationId/$tab"
                  params={{ investigationId: inv.id, tab: "overview" }}
                  className="min-w-0 flex-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Mono className="text-muted-foreground">
                      {inv.investigation_ref}
                    </Mono>
                    <InvestigationStatusBadge status={inv.status} />
                    <Chip>{chainLabel(inv.blockchain)}</Chip>
                    <Chip>{inv.trace_depth} hops</Chip>
                  </div>
                  <p className="mt-2 text-sm font-medium">{inv.name}</p>
                  <p className="mono mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Wallet className="size-3" />
                    {truncateAddress(inv.target_address, 14, 10)}
                  </p>
                </Link>
                <DeleteInvestigationButton
                  investigation={inv}
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                />
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="findings" className="mt-4 space-y-2.5">
          {(findings.data ?? []).length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No findings recorded"
              description="Findings capture what the evidence supports — record them from the investigation workspace."
            />
          ) : (
            (findings.data ?? []).map((f) => (
              <article key={f.id} className="panel px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <Mono className="text-muted-foreground">{f.finding_ref}</Mono>
                  {f.finding_type ? <Chip>{f.finding_type}</Chip> : null}
                  <span className="mono ml-auto text-[11px] text-muted-foreground">
                    {f.confidence}% confidence
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium">{f.title}</p>
                {f.description ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {f.description}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </TabsContent>

        <TabsContent value="evidence" className="mt-4 space-y-2.5">
          {(evidence.data ?? []).length === 0 ? (
            <EmptyState
              icon={Vault}
              title="Evidence vault is empty"
              description="Pin transactions, wallets, graph snapshots and notes from the workspace to build a defensible trail."
            />
          ) : (
            (evidence.data ?? []).map((e) => (
              <article key={e.id} className="panel px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Mono className="text-muted-foreground">{e.evidence_ref}</Mono>
                  <Chip tone="intel">{e.evidence_type.replace("_", " ")}</Chip>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium">{e.title}</p>
                {e.description ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {e.description}
                  </p>
                ) : null}
                {e.source ? (
                  <p className="mono mt-2 text-[11px] text-muted-foreground">
                    source · {e.source}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </TabsContent>
      </Tabs>

      <div className="panel flex flex-wrap items-center gap-3 px-4 py-4">
        <FileText className="size-4 text-muted-foreground" />
        <p className="flex-1 text-sm text-muted-foreground">
          When the case narrative is complete, assemble an intelligence report
          from the findings and evidence held here.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/reports">Go to reports</Link>
        </Button>
      </div>
    </div>
  );
}
