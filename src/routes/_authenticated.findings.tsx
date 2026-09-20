import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Frown,
  Meh,
  Shield,
  ShieldAlert,
  Smile,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { analyseFinding } from "@/lib/api/comprehend";
import {
  SEVERITIES,
  truncateAddress,
  type FindingRecord,
  type NlpSentiment,
} from "@/lib/domain";

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

// ---------- helpers ----------
const SENTIMENT_ICON: Record<NlpSentiment, typeof Smile> = {
  POSITIVE: Smile,
  NEGATIVE: Frown,
  NEUTRAL:  Meh,
  MIXED:    Meh,
};
const SENTIMENT_TONE: Record<
  NlpSentiment,
  "neutral" | "info" | "warning" | "critical" | "positive"
> = {
  POSITIVE: "positive",
  NEGATIVE: "critical",
  NEUTRAL:  "neutral",
  MIXED:    "warning",
};

const ENTITY_TONE: Record<string, "neutral" | "info" | "intel" | "positive"> = {
  PERSON:          "info",
  LOCATION:        "info",
  ORGANIZATION:    "intel",
  COMMERCIAL_ITEM: "intel",
  EVENT:           "neutral",
  DATE:            "neutral",
  QUANTITY:        "neutral",
  TITLE:           "neutral",
  OTHER:           "neutral",
};

function FindingsPage() {
  const [severity, setSeverity] = useState("all");
  const findings = useQuery(findingsQuery());
  const cases = useQuery(casesQuery());
  const queryClient = useQueryClient();

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

  // --- Per-finding NLP ---
  const analyseOne = useMutation({
    mutationFn: (findingId: string) => analyseFinding(findingId),
    onSuccess: (res, id) => {
      const shortRef =
        (findings.data ?? []).find((f) => f.id === id)?.finding_ref ?? id;
      const piiHit = res.pii.length > 0;
      toast[piiHit ? "warning" : "success"](
        piiHit
          ? `${shortRef}: ${res.pii.length} PII item${res.pii.length === 1 ? "" : "s"} detected`
          : `${shortRef}: ${res.entities.length} entities, ${res.sentiment.toLowerCase()} sentiment`,
      );
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Bulk: run NLP on every un-analysed finding ---
  const bulkAnalyse = useMutation({
    mutationFn: async (ids: string[]) => {
      // Small concurrency limit so we don't stampede Comprehend
      const CONCURRENCY = 3;
      let done = 0;
      const errors: string[] = [];
      const queue = [...ids];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
          const id = queue.shift()!;
          try {
            await analyseFinding(id);
          } catch (e) {
            errors.push((e as Error).message);
          }
          done++;
        }
      });
      await Promise.all(workers);
      return { total: ids.length, done, errors };
    },
    onSuccess: (res) => {
      if (res.errors.length) {
        toast.error(`${res.errors.length}/${res.total} failed — see console`);
        console.error("[comprehend bulk]", res.errors);
      } else {
        toast.success(`Analysed ${res.total} finding${res.total === 1 ? "" : "s"}`);
      }
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
    },
  });

  const unanalysed = (findings.data ?? []).filter(
    (f) => f.nlp_status !== "analysed" && f.nlp_status !== "analysing",
  );
  const piiHits = (findings.data ?? []).filter((f) => (f.nlp_pii ?? []).length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analysis"
        title="Findings"
        description="A finding is a conclusion the evidence supports — never a raw signal. Each carries severity, confidence and the artefacts it rests on."
        actions={
          <div className="flex items-center gap-2">
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
            <Button
              size="sm"
              variant="secondary"
              disabled={unanalysed.length === 0 || bulkAnalyse.isPending}
              onClick={() => bulkAnalyse.mutate(unanalysed.map((f) => f.id))}
            >
              <Sparkles className="mr-2 size-4" />
              {bulkAnalyse.isPending
                ? "Analysing…"
                : unanalysed.length > 0
                  ? `Run Comprehend on ${unanalysed.length}`
                  : "All analysed"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
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
        <StatTile
          label="PII flagged"
          value={piiHits.length}
          hint="Amazon Comprehend"
          tone={piiHits.length > 0 ? "critical" : "intel"}
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
            <FindingCard
              key={f.id}
              f={f}
              caseRef={caseRef(f.case_id)}
              onAnalyse={() => analyseOne.mutate(f.id)}
              busy={analyseOne.isPending && analyseOne.variables === f.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FindingCardProps {
  f: FindingRecord;
  caseRef: string | null;
  onAnalyse: () => void;
  busy: boolean;
}

function FindingCard({ f, caseRef, onAnalyse, busy }: FindingCardProps) {
  const analysed = f.nlp_status === "analysed";
  const piiCount = (f.nlp_pii ?? []).length;
  const SentIcon = f.nlp_sentiment ? SENTIMENT_ICON[f.nlp_sentiment] : null;

  return (
    <article className="clay clay-lift rounded-2xl p-5 shadow-clay transition-all hover:border-border-strong">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={f.severity} />
        <Mono className="text-muted-foreground">{f.finding_ref}</Mono>
        {f.finding_type ? (
          <Chip tone="intel">{f.finding_type.replace(/_/g, " ")}</Chip>
        ) : null}
        {caseRef ? (
          <Link
            to="/cases/$caseId"
            params={{ caseId: f.case_id! }}
            className="mono text-[11px] text-primary hover:underline"
          >
            {caseRef}
          </Link>
        ) : null}

        {/* --- NLP status chips --- */}
        {f.nlp_status === "analysing" || busy ? (
          <Chip tone="info" dot>Comprehend analysing…</Chip>
        ) : null}
        {analysed && piiCount > 0 ? (
          <span title={`Types: ${(f.nlp_pii ?? []).map((p) => p.type).join(", ")}`}>
            <Chip tone="critical" dot>
              PII · {piiCount}
            </Chip>
          </span>
        ) : null}
        {analysed && f.nlp_sentiment ? (
          <Chip tone={SENTIMENT_TONE[f.nlp_sentiment]} dot>
            {SentIcon ? <SentIcon className="size-3" /> : null}
            <span className="ml-1">{f.nlp_sentiment.toLowerCase()}</span>
          </Chip>
        ) : null}
        {f.nlp_status === "failed" ? (
          <span title={f.nlp_error ?? ""}>
            <Chip tone="warning" dot>Comprehend failed</Chip>
          </span>
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

      {/* --- Existing on-chain related artefacts --- */}
      {(f.related?.addresses?.length ?? f.related?.txHashes?.length ?? 0) > 0 ? (
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

      {/* --- Comprehend NLP results --- */}
      {analysed ? (
        <div className="mt-3 space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-wider text-primary">
            <Shield className="size-3" />
            Analysed by Amazon Comprehend
            {f.nlp_language ? (
              <span className="text-muted-foreground">· {f.nlp_language}</span>
            ) : null}
          </div>

          {piiCount > 0 ? (
            <div className="flex items-start gap-1.5 rounded border border-critical/40 bg-critical/10 p-2 text-[11px] text-critical">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <div>
                <strong>PII detected — redact before external sharing.</strong>{" "}
                <span className="text-critical/80">
                  {(f.nlp_pii ?? []).map((p) => p.type).join(", ")}
                </span>
              </div>
            </div>
          ) : null}

          {(f.nlp_entities ?? []).length > 0 ? (
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-[11px] text-muted-foreground">Entities:</span>
              {(f.nlp_entities ?? []).slice(0, 12).map((e, i) => (
                <Chip
                  key={`${e.type}-${e.text}-${i}`}
                  tone={ENTITY_TONE[e.type] ?? "neutral"}
                >
                  <span className="mono text-[9px] opacity-60">
                    {e.type.slice(0, 3)}
                  </span>
                  <span className="ml-1">{e.text}</span>
                </Chip>
              ))}
              {(f.nlp_entities ?? []).length > 12 ? (
                <span className="text-[10px] text-muted-foreground">
                  +{(f.nlp_entities ?? []).length - 12} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        {f.investigation_id ? (
          <Link
            to="/investigations/$investigationId/$tab"
            params={{ investigationId: f.investigation_id!, tab: "risk" }}
            className="text-[11px] text-primary hover:underline"
          >
            Open supporting trace in the workspace
          </Link>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={onAnalyse}
          disabled={busy || f.nlp_status === "analysing"}
        >
          <Sparkles className="mr-2 size-3.5" />
          {busy || f.nlp_status === "analysing"
            ? "Analysing…"
            : analysed
              ? "Re-analyse"
              : "Analyse"}
        </Button>
      </div>
    </article>
  );
}
