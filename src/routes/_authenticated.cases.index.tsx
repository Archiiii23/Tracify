import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderPlus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, Mono, PriorityBadge, StatusBadge } from "@/components/vt/badges";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/vt/states";
import { casesQuery, investigationsQuery } from "@/lib/api/queries";
import { CASE_STATUS_LABEL, CASE_STATUSES } from "@/lib/domain";
import { useUIStore } from "@/stores/ui";

export const Route = createFileRoute("/_authenticated/cases/")({
  head: () => ({
    meta: [
      { title: "Case management — TRACIFY" },
      {
        name: "description",
        content:
          "Manage cybercrime and fraud cases: priority, jurisdiction, reported loss, linked investigations and evidence, all in one investigative record.",
      },
      { property: "og:title", content: "Case management — TRACIFY" },
      {
        property: "og:description",
        content:
          "Every case, its priority, jurisdiction, reported loss and linked blockchain investigations.",
      },
    ],
  }),
  component: CasesPage,
});

function CasesPage() {
  const setCreateCaseOpen = useUIStore((s) => s.setCreateCaseOpen);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<string>("all");

  const cases = useQuery(casesQuery());
  const investigations = useQuery(investigationsQuery());

  const countByCase = useMemo(() => {
    const map = new Map<string, number>();
    (investigations.data ?? []).forEach((i) =>
      map.set(i.case_id, (map.get(i.case_id) ?? 0) + 1),
    );
    return map;
  }, [investigations.data]);

  const filtered = (cases.data ?? []).filter((c) => {
    const matchesStatus = status === "all" || c.status === status;
    const q = term.trim().toLowerCase();
    const matchesTerm =
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.case_ref.toLowerCase().includes(q) ||
      (c.jurisdiction ?? "").toLowerCase().includes(q);
    return matchesStatus && matchesTerm;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Case management"
        title="Cases"
        description="A case is the investigative container: victims, reported loss, jurisdiction, traces, findings and evidence."
        actions={
          <Button onClick={() => setCreateCaseOpen(true)}>
            <FolderPlus className="size-4" />
            New case
          </Button>
        }
      />

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by case reference, title or jurisdiction"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-[190px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CASE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CASE_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cases.error ? <ErrorState message={cases.error.message} /> : null}

      {cases.isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title={term || status !== "all" ? "No matching cases" : "No cases yet"}
          description={
            term || status !== "all"
              ? "Adjust your search or status filter to widen the result set."
              : "Create your first case to start recording victims, losses and traced fund movement."
          }
          action={
            <Button size="sm" onClick={() => setCreateCaseOpen(true)}>
              New case
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to="/cases/$caseId"
              params={{ caseId: c.id }}
              className="clay clay-lift flex flex-col gap-3 rounded-2xl p-5 shadow-clay transition-all hover:border-border-strong cursor-pointer"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="text-muted-foreground">{c.case_ref}</Mono>
                <PriorityBadge priority={c.priority} />
                <StatusBadge status={c.status} />
              </div>
              <div>
                <p className="text-sm font-semibold leading-snug">{c.title}</p>
                {c.description ? (
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                ) : null}
              </div>
              <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <span>
                  loss{" "}
                  {c.reported_loss
                    ? `$${c.reported_loss.toLocaleString()}`
                    : "not quantified"}
                </span>
                <span>{c.jurisdiction ?? "jurisdiction unset"}</span>
                <Chip className="ml-auto" tone="intel">
                  {countByCase.get(c.id) ?? 0} investigations
                </Chip>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
