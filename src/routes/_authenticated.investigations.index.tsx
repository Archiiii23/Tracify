import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Chip,
  InvestigationStatusBadge,
  Mono,
} from "@/components/vt/badges";
import { DeleteInvestigationButton } from "@/components/vt/DeleteInvestigationButton";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/vt/states";
import { casesQuery, investigationsQuery } from "@/lib/api/queries";
import {
  INVESTIGATION_STATUSES,
  INVESTIGATION_STATUS_LABEL,
  chainLabel,
  truncateAddress,
} from "@/lib/domain";
import { useUIStore } from "@/stores/ui";

export const Route = createFileRoute("/_authenticated/investigations/")({
  head: () => ({
    meta: [
      { title: "Investigations — TRACIFY" },
      {
        name: "description",
        content:
          "Every blockchain trace you have run: target wallet, chain, hop depth, trace status and the case it belongs to.",
      },
      { property: "og:title", content: "Investigations — TRACIFY" },
      {
        property: "og:description",
        content:
          "Bounded blockchain traces with target wallet, chain, hop depth and status.",
      },
    ],
  }),
  component: InvestigationsPage,
});

function InvestigationsPage() {
  const setStartInvestigationOpen = useUIStore(
    (s) => s.setStartInvestigationOpen,
  );
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");

  const investigations = useQuery(investigationsQuery());
  const cases = useQuery(casesQuery());

  const caseRef = (id: string) =>
    (cases.data ?? []).find((c) => c.id === id)?.case_ref ?? "—";

  const filtered = (investigations.data ?? []).filter((i) => {
    const q = term.trim().toLowerCase();
    const matchesTerm =
      !q ||
      i.name.toLowerCase().includes(q) ||
      i.investigation_ref.toLowerCase().includes(q) ||
      i.target_address.toLowerCase().includes(q);
    return (status === "all" || i.status === status) && matchesTerm;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tracing"
        title="Investigations"
        description="Each investigation is a bounded trace: one target wallet, one chain, an explicit hop limit and an optional time window."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/investigations/new">
                <Radar className="size-4" />
                New investigation
              </Link>
            </Button>
            <Button onClick={() => setStartInvestigationOpen(true)}>
              Quick trace
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by reference, name or target address"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {INVESTIGATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {INVESTIGATION_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {investigations.error ? (
        <ErrorState message={investigations.error.message} />
      ) : null}

      {investigations.isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No investigations found"
          description="Start a trace from a known target wallet. TRACIFY builds a hop-limited graph rather than an unbounded crawl."
          action={
            <Button size="sm" onClick={() => setStartInvestigationOpen(true)}>
              Start investigation
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((inv) => (
            <div
              key={inv.id}
              className="clay clay-lift flex flex-col gap-2 rounded-2xl p-4.5 shadow-clay transition-all hover:border-border-strong sm:flex-row sm:items-center sm:gap-4"
            >
              <Link
                to="/investigations/$investigationId/$tab"
                params={{ investigationId: inv.id, tab: "overview" }}
                className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <Mono className="w-[86px] shrink-0 text-muted-foreground font-semibold">
                  {inv.investigation_ref}
                </Mono>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{inv.name}</p>
                  <p className="mono mt-0.5 text-[11px] text-muted-foreground">
                    {truncateAddress(inv.target_address, 14, 10)} · case{" "}
                    {caseRef(inv.case_id)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Chip>{chainLabel(inv.blockchain)}</Chip>
                  <Chip>{inv.trace_depth} hops</Chip>
                  <InvestigationStatusBadge status={inv.status} />
                </div>
              </Link>
              <DeleteInvestigationButton
                investigation={inv}
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
