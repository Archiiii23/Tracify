import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, Mono, SeverityBadge } from "@/components/vt/badges";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from "@/components/vt/states";
import { casesQuery, findingsQuery } from "@/lib/api/queries";
import { SEVERITIES, truncateAddress } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/findings")({
  head: () => ({
    meta: [
      { title: "Findings — TRACIFY" },
      {
        name: "description",
        content:
          "Analyst conclusions with explicit confidence and supporting evidence: attribution, behavioural patterns and path continuity findings.",
      },
      { property: "og:title", content: "Findings — TRACIFY" },
      {
        property: "og:description",
        content:
          "Evidence-backed investigative conclusions with severity and confidence.",
      },
    ],
  }),
  component: FindingsPage,
});

function FindingsPage() {
  const [severity, setSeverity] = useState("all");
  const findings = useQuery(findingsQuery());
  const cases = useQuery(casesQuery());

  const caseRef = (id: string | null) =>
    id ? ((cases.data ?? []).find((c) => c.id === id)?.case_ref ?? null) : null;

  const filtered = (findings.data ?? []).filter(
    (f) => severity === "all" || f.severity === severity,
  );

  const avgConfidence =
    (findings.data ?? []).length > 0
      ? Math.round(
          (findings.data ?? []).reduce((sum, f) => sum + f.confidence, 0) /
            (findings.data ?? []).length,
        )
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analysis"
        title="Findings"
        description="A finding is a conclusion the evidence supports — never a raw signal. Each carries severity, confidence and the artefacts it rests on."
        actions={
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {SEVERITIES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Total findings"
          value={(findings.data ?? []).length}
          hint="across all cases"
        />
        <StatTile
          label="Critical & high"
          value={
            (findings.data ?? []).filter((f) =>
              ["critical", "high"].includes(f.severity),
            ).length
          }
          hint="escalation candidates"
          tone="critical"
        />
        <StatTile
          label="Mean confidence"
          value={`${avgConfidence}%`}
          hint="analyst-assigned"
          tone="intel"
        />
      </div>

      {findings.error ? <ErrorState message={findings.error.message} /> : null}

      {findings.isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No findings match"
          description="Findings are recorded from the investigation workspace once path, entity or behavioural analysis supports a conclusion."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((f) => (
            <article key={f.id} className="clay clay-lift rounded-2xl p-5 shadow-clay transition-all hover:border-border-strong">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={f.severity} />
                <Mono className="text-muted-foreground">{f.finding_ref}</Mono>
                {f.finding_type ? (
                  <Chip tone="intel">{f.finding_type.replace(/_/g, " ")}</Chip>
                ) : null}
                {caseRef(f.case_id) ? (
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: f.case_id! }}
                    className="mono text-[11px] text-primary hover:underline"
                  >
                    {caseRef(f.case_id)}
                  </Link>
                ) : null}
                <span className="mono ml-auto text-[11px] text-muted-foreground">
                  {f.confidence}% confidence
                </span>
              </div>

              <h2 className="mt-2.5 text-sm font-semibold">{f.title}</h2>
              {f.description ? (
                <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              ) : null}

              {(f.related?.addresses?.length ??
                f.related?.txHashes?.length ??
                0) > 0 ? (
                <div className="mono mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3 text-[11px]">
                  {(f.related.addresses ?? []).map((a) => (
                    <Chip key={a}>{truncateAddress(a, 10, 6)}</Chip>
                  ))}
                  {(f.related.txHashes ?? []).map((t) => (
                    <Chip key={t} tone="info">
                      tx {truncateAddress(t, 8, 6)}
                    </Chip>
                  ))}
                </div>
              ) : null}

              {f.investigation_id ? (
                <Link
                  to="/investigations/$investigationId/$tab"
                  params={{ investigationId: f.investigation_id!, tab: "risk" }}
                  className="mt-3 inline-block text-[11px] text-primary hover:underline"
                >
                  Open supporting trace in the workspace
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
