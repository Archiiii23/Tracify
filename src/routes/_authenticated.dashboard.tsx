import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  Bot,
  Compass,
  FileText,
  Flag,
  FolderOpen,
  FolderPlus,
  Gauge,
  Layers,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkle,
  Split,
  Vault,
  Wallet,
  Waves,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Chip,
  InvestigationStatusBadge,
  Mono,
  PriorityBadge,
  SeverityBadge,
  StatusBadge,
} from "@/components/vt/badges";
import { DeleteInvestigationButton } from "@/components/vt/DeleteInvestigationButton";
import {
  ActivityRow,
  ClayCard,
  ClayIcon,
  ClayProgress,
  DistributionPieChart,
  KpiCard,
  QuickAction,
  SectionHeading,
  TrendChart,
  type PieSlice,
  type TrendPoint,
} from "@/components/vt/clay";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/vt/states";
import {
  casesQuery,
  evidenceQuery,
  findingsQuery,
  investigationsQuery,
} from "@/lib/api/queries";
import { chainLabel, truncateAddress } from "@/lib/domain";
import { useAuth } from "@/hooks/useAuth";
import { useUIStore } from "@/stores/ui";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Investigator command center — TRACIFY" },
      {
        name: "description",
        content:
          "A claymorphic command center for blockchain investigations: live traces, risk scoring, AI insights, priority cases and evidence-backed findings.",
      },
      { property: "og:title", content: "Investigator command center — TRACIFY" },
      {
        property: "og:description",
        content:
          "Live traces, risk scoring, AI insights and priority caseload in one intelligence console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) {
    const hours = Math.floor(diff / 3_600_000);
    return hours <= 1 ? "just now" : `${hours}h ago`;
  }
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardPage() {
  const setStartInvestigationOpen = useUIStore(
    (s) => s.setStartInvestigationOpen,
  );
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);
  const { user, profile } = useAuth();
  const name =
    (profile as { full_name?: string } | null)?.full_name ??
    user?.email?.split("@")[0] ??
    "Investigator";

  const cases = useQuery(casesQuery());
  const investigations = useQuery(investigationsQuery());
  const findings = useQuery(findingsQuery());
  const evidence = useQuery(evidenceQuery());

  const error = cases.error ?? investigations.error ?? findings.error;
  const loading = cases.isLoading || investigations.isLoading;

  const activeInvestigations = (investigations.data ?? []).filter((i) =>
    ["queued", "processing"].includes(i.status),
  );
  const priorityCases = (cases.data ?? []).filter(
    (c) => ["critical", "high"].includes(c.priority) && c.status !== "closed",
  );
  const criticalFindings = (findings.data ?? []).filter((f) =>
    ["critical", "high"].includes(f.severity),
  );

  // --- FEED from most-recent investigations + evidence ---
  const FEED = useMemo(() => {
    const feedItems: { icon: typeof Waves; tone: "primary" | "intel" | "critical" | "teal"; title: string; detail: string; meta: string; time: string }[] = [];
    const recentInv = (investigations.data ?? []).slice(0, 2);
    const recentEvidence = (evidence.data ?? []).slice(0, 2);
    for (const inv of recentInv) {
      const sev = inv.status === "complete" ? "teal" as const
        : inv.status === "processing" ? "primary" as const
        : "intel" as const;
      feedItems.push({
        icon: inv.status === "complete" ? Layers : Waves,
        tone: sev,
        title: inv.status === "complete" ? `Trace completed: ${inv.name}` : `Trace in progress: ${inv.name}`,
        detail: inv.target_address ? `${inv.target_address.slice(0, 12)}…${inv.target_address.slice(-6)}` : inv.investigation_ref,
        meta: inv.blockchain ?? "ethereum",
        time: relative(inv.updated_at ?? inv.created_at),
      });
    }
    for (const ev of recentEvidence) {
      feedItems.push({
        icon: ShieldAlert,
        tone: "critical" as const,
        title: ev.title,
        detail: ev.description?.slice(0, 60) ?? ev.evidence_type,
        meta: ev.source ?? "evidence vault",
        time: relative(ev.created_at),
      });
    }
    // Always show at least 1 item with placeholder if empty
    if (feedItems.length === 0) {
      feedItems.push({
        icon: Waves,
        tone: "primary" as const,
        title: "No recent activity",
        detail: "Start an investigation to begin tracing.",
        meta: "—",
        time: "—",
      });
    }
    return feedItems;
  }, [investigations.data, evidence.data]);

  // --- INSIGHTS from top 3 findings by severity ---
  const INSIGHTS = useMemo(() => {
    const severityOrder = ["critical", "high", "medium", "low"];
    const top = [...(findings.data ?? [])]
      .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
      .slice(0, 3);
    return top.map((f) => ({
      icon: f.severity === "critical" ? Siren
        : f.severity === "high" ? ShieldAlert
        : f.finding_type === "attribution" || f.finding_type === "vasp_endpoint" ? ShieldCheck
        : Split,
      tone: f.severity === "critical" ? "critical" as const
        : f.severity === "high" ? "warning" as const
        : f.finding_type === "attribution" ? "teal" as const
        : "intel" as const,
      title: f.title,
      body: f.description ?? `${f.severity} severity · ${f.confidence}% confidence`,
      time: relative(f.created_at),
    }));
  }, [findings.data]);

  const topRiskSignals = useMemo(() => {
    const all = findings.data ?? [];
    const byType = all.reduce<Record<string, number>>((acc, f) => {
      const key = f.finding_type || "other";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type: type.replace(/_/g, " "), count }));
  }, [findings.data]);

  const investigationRiskBands = useMemo(() => {
    const bands = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const inv of investigations.data ?? []) {
      if (inv.status !== "complete") continue;
      const summary = inv.summary as Record<string, unknown> | null;
      const score = typeof summary?.riskScore === "number" ? summary.riskScore : null;
      if (score === null) continue;
      if (score >= 81) bands.critical += 1;
      else if (score >= 61) bands.high += 1;
      else if (score >= 31) bands.medium += 1;
      else bands.low += 1;
    }
    return bands;
  }, [investigations.data]);

  const investigationTrend = useMemo((): TrendPoint[] => {
    const days = 7;
    const buckets: TrendPoint[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const label = d.toLocaleDateString(undefined, { weekday: "short" });
      let completed = 0;
      let ongoing = 0;
      for (const inv of investigations.data ?? []) {
        const ts = new Date(inv.updated_at ?? inv.created_at).getTime();
        if (ts >= d.getTime() && ts < next.getTime()) {
          if (inv.status === "complete") completed += 1;
          else if (inv.status === "processing" || inv.status === "queued") ongoing += 1;
        }
      }
      buckets.push({ label, completed, ongoing });
    }
    return buckets;
  }, [investigations.data]);

  const findingSeverityPie = useMemo((): PieSlice[] => {
    const sevColors = {
      critical: "var(--critical)",
      high: "var(--warning)",
      medium: "var(--intel)",
      low: "var(--teal)",
    } as const;
    return (["critical", "high", "medium", "low"] as const)
      .map((sev) => ({
        name: sev.charAt(0).toUpperCase() + sev.slice(1),
        value: (findings.data ?? []).filter((f) => f.severity === sev).length,
        color: sevColors[sev],
      }))
      .filter((s) => s.value > 0);
  }, [findings.data]);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <ClayCard className="ambient-glow overflow-hidden p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="label-caps mb-2">Investigator command center</p>
            <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">
              {greeting()}, <span className="text-gradient-intel">{name}</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {activeInvestigations.length} traces are building right now, and{" "}
              {criticalFindings.length} findings are waiting on your review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button asChild>
              <Link to="/investigations/new">
                <Radar className="size-4" />
                New investigation
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setCommandOpen(true)}>
              <Search className="size-4" />
              Search
            </Button>
            <Button variant="secondary" onClick={() => setCommandOpen(true)}>
              <Sparkle className="size-4" />
              AI copilot
            </Button>
          </div>
        </div>
      </ClayCard>

      {error ? <ErrorState message={error.message} /> : null}

      {/* Priority metrics — real counts only, no fabricated trends */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active investigations"
          value={activeInvestigations.length}
          icon={Activity}
          tone="primary"
          trendLabel={`${activeInvestigations.length} currently active`}
          delay={0}
        />
        <KpiCard
          label="High-risk findings"
          value={criticalFindings.length}
          icon={ShieldAlert}
          tone="critical"
          trendLabel={criticalFindings.length > 0 ? "Requires review" : "No critical items"}
          delay={0.05}
        />
        <KpiCard
          label="Findings to review"
          value={(findings.data ?? []).filter((f) => f.status !== "closed").length}
          icon={Flag}
          tone="warning"
          trendLabel={`${(findings.data ?? []).length} total recorded`}
          delay={0.1}
        />
        <KpiCard
          label="Open cases"
          value={priorityCases.length}
          icon={FolderOpen}
          tone="teal"
          trendLabel="High / critical priority"
          delay={0.15}
        />
      </div>

      {/* Analytics — one trend + one pie from live caseload */}
      <div className="grid gap-4 xl:grid-cols-2">
        <ClayCard className="p-5 sm:p-6" delay={0.05}>
          <SectionHeading
            title="Investigation activity"
            description="Completed vs active traces over the last 7 days"
          />
          <TrendChart data={investigationTrend} />
        </ClayCard>

        <ClayCard className="p-5 sm:p-6" delay={0.08}>
          <SectionHeading
            title="Finding severity"
            description="All recorded findings by severity band"
          />
          <DistributionPieChart data={findingSeverityPie} emptyLabel="No findings recorded yet" />
        </ClayCard>
      </div>

      {/* Investigation status + priority queue */}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <ClayCard className="p-5 sm:p-6" delay={0.05}>
          <SectionHeading
            title="Investigation status"
            description="Queued, processing, and completed traces"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Queued", count: (investigations.data ?? []).filter((i) => i.status === "queued").length },
              { label: "Analyzing", count: (investigations.data ?? []).filter((i) => i.status === "processing").length },
              { label: "Complete", count: (investigations.data ?? []).filter((i) => i.status === "complete").length },
              { label: "Failed", count: (investigations.data ?? []).filter((i) => i.status === "failed").length },
            ].map((s) => (
              <div key={s.label} className="clay-inset p-3 text-center">
                <p className="text-2xl font-semibold tabular-nums">{s.count}</p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </ClayCard>

        <ClayCard className="p-5 sm:p-6" delay={0.1}>
          <SectionHeading
            title="Risk distribution"
            description="Completed investigations by heuristic risk band"
          />
          <ul className="space-y-2">
            {(["critical", "high", "medium", "low"] as const).map((band) => {
              const count = investigationRiskBands[band];
              return (
                <li key={band} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{band}</span>
                  <span className="mono font-medium">{count}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-border/50 pt-3 text-[10px] text-muted-foreground">
            Finding severity breakdown
          </p>
          <ul className="mt-2 space-y-2">
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const count = (findings.data ?? []).filter((f) => f.severity === sev).length;
              return (
                <li key={sev} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{sev} findings</span>
                  <span className="mono font-medium">{count}</span>
                </li>
              );
            })}
          </ul>
          {topRiskSignals.length > 0 && (
            <div className="mt-4 border-t border-border/50 pt-3">
              <p className="label-caps mb-2 text-[10px]">Top risk signals</p>
              <ul className="space-y-1.5">
                {topRiskSignals.map((s) => (
                  <li key={s.type} className="flex justify-between text-[11px]">
                    <span className="capitalize text-muted-foreground">{s.type}</span>
                    <span className="mono">{s.count} finding{s.count === 1 ? "" : "s"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ClayCard>
      </div>

      {/* Feed + AI insights + cases */}
      <div className="grid gap-4 xl:grid-cols-3">
        <ClayCard className="p-5" delay={0.05}>
          <SectionHeading
            title="Live activity feed"
            action={
              <span className="clay-pill flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold text-positive">
                <span className="pulse-ring size-1.5 rounded-full bg-positive" />
                LIVE
              </span>
            }
          />
          <div className="space-y-1">
            {FEED.map((f) => (
              <ActivityRow key={f.title} {...f} />
            ))}
          </div>
        </ClayCard>

        <ClayCard className="p-5" delay={0.1}>
          <SectionHeading
            title="AI insights"
            action={
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="text-[11px] text-primary hover:underline"
              >
                View all
              </button>
            }
          />
          <div className="space-y-2.5">
            {INSIGHTS.length === 0 ? (
              <p className="text-[12px] text-muted-foreground px-1">
                No findings recorded yet — complete an investigation to see AI-powered insights here.
              </p>
            ) : (
              INSIGHTS.map((i) => (
                <div key={i.title} className="clay-inset flex gap-3 p-3">
                  <ClayIcon icon={i.icon} tone={i.tone} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{i.title}</p>
                    <p className="text-[11px] text-muted-foreground">{i.body}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {i.time}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="clay-inset mt-3 flex items-center gap-3 p-3">
            <ClayIcon icon={Bot} tone="intel" className="size-8" />
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              Ask the copilot anything about your investigations.
            </p>
            <Button size="sm" onClick={() => setCommandOpen(true)}>
              Ask
            </Button>
          </div>
        </ClayCard>

        <ClayCard className="p-5" delay={0.15}>
          <SectionHeading
            title="High-priority cases"
            action={
              <Link to="/cases" className="text-[11px] text-primary hover:underline">
                View all
              </Link>
            }
          />
          {priorityCases.length === 0 ? (
            <EmptyState
              icon={FolderPlus}
              title="No priority cases"
              description="Nothing is flagged high or critical right now."
            />
          ) : (
            <ul className="space-y-2.5">
              {priorityCases.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: c.id }}
                    className="clay-inset block p-3.5 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={c.priority} />
                      <Mono className="text-muted-foreground">{c.case_ref}</Mono>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {relative(c.updated_at)}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] font-medium leading-snug">
                      {c.title}
                    </p>
                    {c.reported_loss ? (
                      <p className="mono mt-1.5 text-[11px] text-muted-foreground">
                        reported loss ${c.reported_loss.toLocaleString()}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ClayCard>
      </div>

      {/* Active traces + findings */}
      {loading ? (
        <LoadingState rows={3} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <ClayCard className="p-5 sm:p-6" delay={0.05}>
            <SectionHeading
              title="Active investigations"
              description="Traces currently building or awaiting analysis."
              action={
                <Link
                  to="/investigations"
                  className="text-[11px] text-primary hover:underline"
                >
                  All investigations
                </Link>
              }
            />
            {activeInvestigations.length === 0 ? (
              <EmptyState
                icon={Radar}
                title="No traces in flight"
                description="Every queued trace has completed. Start a new investigation from a case to begin tracing fund movement."
                action={
                  <Button
                    size="sm"
                    onClick={() => setStartInvestigationOpen(true)}
                  >
                    Start investigation
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {activeInvestigations.map((inv, i) => (
                  <motion.li
                    key={inv.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    className="flex items-start gap-2"
                  >
                    <Link
                      to="/investigations/$investigationId/$tab"
                      params={{ investigationId: inv.id, tab: "graph" }}
                      className="block min-w-0 flex-1 clay-inset p-4 transition-colors hover:border-border-strong"
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
                          {truncateAddress(inv.target_address, 12, 8)}
                        </p>
                        {inv.status === "processing" ? (
                          <div className="mt-3">
                            <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground">
                              <span>{(inv.summary as Record<string, unknown>)?.pipelineNote as string ?? "Processing"}</span>
                              <span className="mono">
                                {((inv.summary as Record<string, unknown>)?.progress as number) ?? 0}%
                              </span>
                            </div>
                            <ClayProgress
                              value={((inv.summary as Record<string, unknown>)?.progress as number) ?? 0}
                              tone="intel"
                            />
                          </div>
                        ) : null}
                      </Link>
                    <DeleteInvestigationButton
                      investigation={inv}
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    />
                  </motion.li>
                ))}
              </ul>
            )}

            <div className="mt-6">
              <SectionHeading
                title="Recent case activity"
                action={
                  <Link
                    to="/cases"
                    className="text-[11px] text-primary hover:underline"
                  >
                    All cases
                  </Link>
                }
              />
              <ul className="clay-inset divide-y divide-border overflow-hidden">
                {(cases.data ?? []).slice(0, 5).map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: c.id }}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated/60"
                    >
                      <Mono className="w-[112px] shrink-0 text-muted-foreground">
                        {c.case_ref}
                      </Mono>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {c.title}
                      </span>
                      <StatusBadge status={c.status} />
                      <span className="hidden w-16 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                        {relative(c.updated_at)}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </ClayCard>

          <ClayCard className="p-5 sm:p-6" delay={0.1}>
            <SectionHeading
              title="Recent findings"
              description="Analyst conclusions with confidence scoring."
              action={
                <Link
                  to="/findings"
                  className="text-[11px] text-primary hover:underline"
                >
                  View all
                </Link>
              }
            />
            {(findings.data ?? []).length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="No findings recorded"
                description="Findings are produced as investigations complete path and entity analysis."
              />
            ) : (
              <ul className="space-y-3">
                {(findings.data ?? []).slice(0, 5).map((f) => (
                  <li key={f.id} className="clay-inset p-4">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <Mono className="text-muted-foreground">
                        {f.finding_ref}
                      </Mono>
                      <span className="mono ml-auto text-[11px] text-muted-foreground">
                        {f.confidence}% conf.
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] font-medium leading-snug">
                      {f.title}
                    </p>
                    <div className="mt-2.5">
                      <ClayProgress
                        value={f.confidence}
                        tone={
                          f.severity === "critical"
                            ? "critical"
                            : f.severity === "high"
                              ? "warning"
                              : "primary"
                        }
                        className="h-1.5"
                      />
                    </div>
                    {f.investigation_id ? (
                      <Link
                        to="/investigations/$investigationId/$tab"
                        params={{ investigationId: f.investigation_id, tab: "risk" }}
                        className="mt-2.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                      >
                        Open in workspace
                        <ArrowRight className="size-3" />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </ClayCard>
        </div>
      )}

      {/* Quick investigation actions */}
      <ClayCard className="p-5 sm:p-6" delay={0.05}>
        <SectionHeading title="Quick investigation actions" description="Jump into common analyst workflows." />
        <div className="flex flex-wrap gap-2.5">
          <QuickAction icon={Radar} label="New investigation" onClick={() => setStartInvestigationOpen(true)} />
          <QuickAction icon={Wallet} label="Wallet lookup" onClick={() => setCommandOpen(true)} />
          <QuickAction icon={Search} label="Transaction search" onClick={() => setCommandOpen(true)} />
          <QuickAction icon={Compass} label="Entity search" onClick={() => setCommandOpen(true)} />
          <QuickAction icon={FileText} label="Generate report" onClick={() => setCommandOpen(true)} />
        </div>
      </ClayCard>
    </div>
  );
}
