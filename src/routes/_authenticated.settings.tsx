import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, CircleSlash } from "lucide-react";

import { Chip, Mono } from "@/components/vt/badges";
import { PageHeader } from "@/components/vt/states";
import { useAuth } from "@/hooks/useAuth";
import { BLOCKCHAINS } from "@/lib/domain";
import { intelligence } from "@/services/intelligence";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Workspace settings — TRACIFY" },
      {
        name: "description",
        content:
          "Your investigator profile and role, supported blockchain networks, and the intelligence services currently bound to this workspace.",
      },
      { property: "og:title", content: "Workspace settings — TRACIFY" },
      {
        property: "og:description",
        content:
          "Investigator profile, network coverage and bound intelligence services.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, roles } = useAuth();

  const services = [
    { name: "Blockchain provider", id: intelligence.provider.id },
    { name: "Graph construction", id: "bounded-hop-graph" },
    { name: "Path analysis", id: "value-continuity-ranker" },
    { name: "Entity resolution", id: "attribution-candidate-ranker" },
    { name: "Behaviour analysis", id: "pattern-characteriser" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Who you are in this workspace, which networks are covered, and which intelligence services are currently bound."
      />

      <section className="clay rounded-2xl p-6 shadow-clay">
        <h2 className="text-sm font-semibold">Investigator profile</h2>
        <dl className="mono mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 border-b border-border pb-2">
            <dt className="text-muted-foreground">display name</dt>
            <dd>
              {(profile as { full_name?: string } | null)?.full_name ??
                "not set"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border pb-2">
            <dt className="text-muted-foreground">email</dt>
            <dd className="truncate">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border pb-2">
            <dt className="text-muted-foreground">roles</dt>
            <dd>{roles.length > 0 ? roles.join(", ") : "investigator"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-border pb-2">
            <dt className="text-muted-foreground">user id</dt>
            <dd className="truncate">{user?.id ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Roles are enforced server-side by row-level security. Elevated
          permissions cannot be granted from this screen.
        </p>
      </section>

      <section className="clay rounded-2xl p-6 shadow-clay">
        <h2 className="text-sm font-semibold">Network coverage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Traces can only be bounded on chains with an active ingestion adapter.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {BLOCKCHAINS.map((c) => (
            <li
              key={c.id}
              className="clay flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 shadow-clay"
            >
              {c.supported ? (
                <CircleCheck className="size-4 text-positive" />
              ) : (
                <CircleSlash className="size-4 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{c.label}</span>
              <Mono className="ml-auto text-muted-foreground">{c.symbol}</Mono>
              <Chip tone={c.supported ? "positive" : "neutral"}>
                {c.supported ? "active" : "planned"}
              </Chip>
            </li>
          ))}
        </ul>
      </section>

      <section className="clay rounded-2xl p-6 shadow-clay">
        <h2 className="text-sm font-semibold">Bound intelligence services</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each analysis stage is a swappable service behind a fixed contract, so
          providers can be replaced without changing the investigation surface.
        </p>
        <ul className="mono mt-3 divide-y divide-border text-[12px]">
          {services.map((s) => (
            <li key={s.name} className="flex items-center gap-3 py-2.5">
              <span className="flex-1 text-foreground font-medium">{s.name}</span>
              <span className="text-muted-foreground">{s.id}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
