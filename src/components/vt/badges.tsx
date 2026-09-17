import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import {
  CASE_STATUS_LABEL,
  INVESTIGATION_STATUS_LABEL,
  type CasePriority,
  type CaseStatus,
  type InvestigationStatus,
  type Severity,
} from "@/lib/domain";

const chip = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-secondary text-muted-foreground",
        info: "border-primary/30 bg-primary/12 text-primary",
        intel: "border-intel/30 bg-intel/12 text-intel",
        positive: "border-positive/30 bg-positive/12 text-positive",
        warning: "border-warning/30 bg-warning/12 text-warning",
        critical: "border-critical/35 bg-critical/12 text-critical",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type Tone = NonNullable<VariantProps<typeof chip>["tone"]>;

function Dot({ tone }: { tone: Tone }) {
  const map: Record<Tone, string> = {
    neutral: "bg-muted-foreground",
    info: "bg-primary",
    intel: "bg-intel",
    positive: "bg-positive",
    warning: "bg-warning",
    critical: "bg-critical",
  };
  return <span className={cn("size-1.5 rounded-full", map[tone])} />;
}

export function Chip({
  tone,
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={cn(chip({ tone }), className)}>
      {dot ? <Dot tone={tone ?? "neutral"} /> : null}
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<CasePriority, Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "critical",
};

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return (
    <Chip tone={PRIORITY_TONE[priority] ?? "neutral"} dot>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Chip>
  );
}

const CASE_STATUS_TONE: Record<CaseStatus, Tone> = {
  active: "info",
  under_review: "warning",
  report_generated: "intel",
  closed: "neutral",
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  return (
    <Chip tone={CASE_STATUS_TONE[status] ?? "neutral"} dot>
      {CASE_STATUS_LABEL[status] ?? status}
    </Chip>
  );
}

const INV_TONE: Record<InvestigationStatus, Tone> = {
  draft: "neutral",
  queued: "info",
  processing: "intel",
  complete: "positive",
  failed: "critical",
};

export function InvestigationStatusBadge({
  status,
}: {
  status: InvestigationStatus;
}) {
  const tone = INV_TONE[status] ?? "neutral";
  return (
    <Chip tone={tone} dot>
      <span className={status === "processing" ? "animate-pulse" : undefined}>
        {INVESTIGATION_STATUS_LABEL[status] ?? status}
      </span>
    </Chip>
  );
}

const SEVERITY_TONE: Record<Severity, Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "critical",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Chip tone={SEVERITY_TONE[severity] ?? "neutral"} dot>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Chip>
  );
}

export function Mono({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("mono text-[12.5px]", className)}>{children}</span>;
}
