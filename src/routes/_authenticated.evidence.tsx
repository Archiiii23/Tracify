import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Vault } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, Mono } from "@/components/vt/badges";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from "@/components/vt/states";
import { casesQuery, evidenceQuery } from "@/lib/api/queries";
import { EVIDENCE_TYPES } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence vault — TRACIFY" },
      {
        name: "description",
        content:
          "Immutable, time-stamped evidence for every case: pinned transactions, wallets, graph snapshots, documents and analyst notes.",
      },
      { property: "og:title", content: "Evidence vault — TRACIFY" },
      {
        property: "og:description",
        content:
          "Time-stamped, attributable evidence supporting each investigative conclusion.",
      },
    ],
  }),
  component: EvidencePage,
});

function EvidencePage() {
  const [type, setType] = useState("all");
  const evidence = useQuery(evidenceQuery());
  const cases = useQuery(casesQuery());

  const caseRef = (id: string | null) =>
    id ? ((cases.data ?? []).find((c) => c.id === id)?.case_ref ?? null) : null;

  const filtered = (evidence.data ?? []).filter(
    (e) => type === "all" || e.evidence_type === type,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Chain of custody"
        title="Evidence"
        description="Every artefact is time-stamped and attributed to the investigator who pinned it, so conclusions stay defensible outside this tool."
        actions={
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All evidence types</SelectItem>
              {EVIDENCE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Items held"
          value={(evidence.data ?? []).length}
          hint="across all cases"
        />
        <StatTile
          label="On-chain artefacts"
          value={
            (evidence.data ?? []).filter((e) =>
              ["transaction", "wallet", "graph_snapshot"].includes(
                e.evidence_type,
              ),
            ).length
          }
          hint="transactions, wallets, snapshots"
          tone="intel"
        />
        <StatTile
          label="Analyst records"
          value={
            (evidence.data ?? []).filter((e) =>
              ["note", "document", "screenshot", "reference"].includes(
                e.evidence_type,
              ),
            ).length
          }
          hint="notes, documents, references"
        />
      </div>

      {evidence.error ? <ErrorState message={evidence.error.message} /> : null}

      {evidence.isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Vault}
          title="No evidence of this type"
          description="Pin transactions, wallets and graph snapshots from the investigation workspace to build the case record."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((e) => (
            <article key={e.id} className="clay clay-lift rounded-2xl p-5 shadow-clay transition-all hover:border-border-strong">
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="text-muted-foreground">{e.evidence_ref}</Mono>
                <Chip tone="intel">{e.evidence_type.replace(/_/g, " ")}</Chip>
                {caseRef(e.case_id) ? (
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: e.case_id! }}
                    className="mono text-[11px] text-primary hover:underline"
                  >
                    {caseRef(e.case_id)}
                  </Link>
                ) : null}
              </div>
              <h2 className="mt-2.5 text-sm font-semibold">{e.title}</h2>
              {e.description ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {e.description}
                </p>
              ) : null}
              <dl className="mono mt-3 space-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <dt>captured</dt>
                  <dd>{new Date(e.created_at).toLocaleString()}</dd>
                </div>
                {e.source ? (
                  <div className="flex justify-between gap-3">
                    <dt>source</dt>
                    <dd className="truncate">{e.source}</dd>
                  </div>
                ) : null}
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
