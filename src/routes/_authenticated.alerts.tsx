import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, Mono } from "@/components/vt/badges";
import { BackendGate, BackendStatusChip } from "@/components/vt/BackendGate";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from "@/components/vt/states";
import { alertsQuery, setAlertStatus } from "@/lib/api/backend";
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  type AlertSeverity,
  type AlertStatus,
} from "@/lib/api/backend-types";
import { truncateAddress } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Actionable alerts — TRACIFY" },
      {
        name: "description",
        content:
          "Real-time alerts raised by automated attribution: direct exchange deposits, mixer exposure, cross-chain flight and rapid layering, each with a recommended law-enforcement action.",
      },
      { property: "og:title", content: "Actionable alerts — TRACIFY" },
      {
        property: "og:description",
        content:
          "Deduplicated, severity-ranked alerts with recommended freeze and information-request actions.",
      },
    ],
  }),
  component: AlertsPage,
});

const SEVERITY_TONE: Record<AlertSeverity, "neutral" | "info" | "warning" | "critical"> = {
  info: "neutral",
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "critical",
};

function AlertsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Response"
        title="Actionable alerts"
        description="Alerts fire the moment attribution finds something a team can act on — a direct deposit into a regulated exchange, a mixer hop, or funds crossing chains. Each carries the recommended next step and is deduplicated per wallet."
        actions={<BackendStatusChip />}
      />
      <BackendGate>
        <AlertInbox />
      </BackendGate>
    </div>
  );
}

function AlertInbox() {
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("all");
  const alerts = useQuery(alertsQuery({ status, severity }));
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: AlertStatus }) =>
      setAlertStatus(id, next),
    onSuccess: async (alert) => {
      toast.success(`${alert.code} marked ${alert.status}`);
      await queryClient.invalidateQueries({ queryKey: ["backend", "alerts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update alert"),
  });

  const items = alerts.data?.items ?? [];
  const count = (s: AlertSeverity) => items.filter((a) => a.severity === s).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="In view" value={items.length} hint={`status: ${status}`} />
        <StatTile label="Critical" value={count("critical")} tone="critical" hint="freeze window" />
        <StatTile label="High" value={count("high")} tone="warning" hint="escalate today" />
        <StatTile
          label="Freeze-actionable"
          value={items.filter((a) => a.code.includes("VASP")).length}
          tone="positive"
          hint="exchange identified"
        />
      </div>

      <div className="clay flex flex-wrap items-center gap-2.5 p-4">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALERT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {ALERT_SEVERITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {alerts.error ? <ErrorState message={alerts.error.message} /> : null}

      {alerts.isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Nothing to action"
          description="Alerts appear automatically as complaints are attributed. Nothing in this band right now."
        />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <article key={a.id} className="clay clay-lift rounded-2xl p-5 shadow-clay transition-all hover:border-border-strong">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldAlert
                  className={
                    a.severity === "critical" ? "size-4 text-critical" : "size-4 text-warning"
                  }
                />
                <span className="text-sm font-semibold">{a.title}</span>
                <Mono className="text-muted-foreground">{a.code}</Mono>
                <Chip tone={SEVERITY_TONE[a.severity]} dot>
                  {a.severity}
                </Chip>
                <Chip>{a.status}</Chip>
                <span className="mono ml-auto text-[11px] text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">{a.summary}</p>

              {a.addresses.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {a.addresses.slice(0, 5).map((addr) => (
                    <Chip key={addr}>
                      {a.chain ? `${a.chain} · ` : ""}
                      {truncateAddress(addr, 8, 6)}
                    </Chip>
                  ))}
                </div>
              ) : null}

              {a.recommendedActions.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
                  {a.recommendedActions.map((r) => (
                    <li key={r}>→ {r}</li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {a.complaint ? (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      to="/complaints/$complaintId"
                      params={{ complaintId: a.complaint }}
                    >
                      Open complaint
                    </Link>
                  </Button>
                ) : null}
                {a.status !== "acknowledged" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: a.id, next: "acknowledged" })}
                  >
                    Acknowledge
                  </Button>
                ) : null}
                {a.status !== "actioned" ? (
                  <Button
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: a.id, next: "actioned" })}
                  >
                    Mark actioned
                  </Button>
                ) : null}
                {a.status !== "dismissed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ id: a.id, next: "dismissed" })}
                  >
                    Dismiss
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
