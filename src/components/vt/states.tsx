import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string | undefined;
  title: string;
  description?: string | undefined;
  actions?: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <header
      className={cn(
        "clay flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="label-caps mb-2">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}


export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="clay-inset flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="clay-icon flex size-12 text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}


export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="clay h-[82px] w-full overflow-hidden">
          <div className="shimmer-line size-full" />
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="clay border-critical/30 px-5 py-6">
      <p className="text-sm font-medium text-critical">Could not load data</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}


export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "critical" | "warning" | "positive" | "intel";
}) {
  const toneClass = {
    default: "text-foreground",
    critical: "text-critical",
    warning: "text-warning",
    positive: "text-positive",
    intel: "text-intel",
  }[tone];

  return (
    <div className="clay clay-lift px-5 py-4">
      <p className="label-caps">{label}</p>
      <p className={cn("mt-2 text-[28px] font-semibold tabular-nums", toneClass)}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

