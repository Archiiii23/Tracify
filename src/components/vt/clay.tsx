import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

type Tone = "primary" | "intel" | "teal" | "warning" | "critical" | "positive";

const TONE_TEXT: Record<Tone, string> = {
  primary: "text-primary",
  intel: "text-intel",
  teal: "text-teal",
  warning: "text-warning",
  critical: "text-critical",
  positive: "text-positive",
};

const TONE_GLOW: Record<Tone, string> = {
  primary: "shadow-[0_10px_30px_-12px_var(--primary-glow)]",
  intel: "shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--intel)_60%,transparent)]",
  teal: "shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--teal)_55%,transparent)]",
  warning:
    "shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--warning)_55%,transparent)]",
  critical:
    "shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--critical)_60%,transparent)]",
  positive:
    "shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--positive)_55%,transparent)]",
};

export function ClayCard({
  className,
  children,
  interactive = false,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn("clay", interactive && "clay-lift", className)}
    >
      {children}
    </motion.div>
  );
}

export function ClayIcon({
  icon: Icon,
  tone = "primary",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={cn("clay-icon size-11", TONE_GLOW[tone], className)}>
      <Icon className={cn("size-5", TONE_TEXT[tone])} />
    </span>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  icon,
  tone = "primary",
  trend,
  trendLabel,
  delay = 0,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: Tone;
  trend?: number;
  trendLabel?: string;
  delay?: number;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <ClayCard interactive delay={delay} className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">{label}</p>
          <p className="mt-2.5 text-[34px] font-semibold leading-none tabular-nums">
            {typeof value === "number"
              ? String(value).padStart(2, "0")
              : value}
          </p>
        </div>
        <ClayIcon icon={icon} tone={tone} />
      </div>
      {trend !== undefined || trendLabel ? (
        <div className="mt-4 flex items-center gap-1.5 text-[11px]">
          {trend !== undefined ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                up ? "text-positive" : "text-critical",
              )}
            >
              {up ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {up ? "+" : ""}
              {trend}
              {typeof trend === "number" ? "%" : ""}
            </span>
          ) : null}
          <span className="text-muted-foreground">{trendLabel}</span>
        </div>
      ) : null}
    </ClayCard>
  );
}

/** Soft clay progress bar sitting in an inset well. */
export function ClayProgress({
  value,
  tone = "primary",
  className,
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) {
  const bg: Record<Tone, string> = {
    primary: "bg-primary",
    intel: "bg-intel",
    teal: "bg-teal",
    warning: "bg-warning",
    critical: "bg-critical",
    positive: "bg-positive",
  };
  return (
    <div className={cn("clay-inset h-2.5 w-full overflow-hidden", className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className={cn("h-full rounded-full", bg[tone])}
        style={{ boxShadow: "0 0 14px -2px currentColor" }}
      />
    </div>
  );
}

/** Circular risk score ring with a soft clay track. */
export function RiskRing({
  score,
  label = "Risk score",
  size = 168,
}: {
  score: number;
  label?: string;
  size?: number;
}) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const band =
    pct >= 81
      ? "Critical risk"
      : pct >= 61
        ? "High risk"
        : pct >= 31
          ? "Elevated"
          : "Low risk";

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id="risk-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--teal)" />
              <stop offset="55%" stopColor="var(--intel)" />
              <stop offset="100%" stopColor="var(--critical)" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#risk-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - (c * pct) / 100 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[38px] font-semibold leading-none tabular-nums">
            {pct}
          </span>
          <span className="mt-1 text-[10px] text-muted-foreground">{label}</span>
          <span
            className={cn(
              "mt-0.5 text-[11px] font-semibold",
              pct >= 81
                ? "text-critical"
                : pct >= 61
                  ? "text-critical"
                  : pct >= 31
                    ? "text-warning"
                    : "text-positive",
            )}
          >
            {band}
          </span>
        </div>
      </div>
    </div>
  );
}

export type TrendPoint = { label: string; completed: number; ongoing: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="areaOngoing" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--intel)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--intel)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="areaCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border-strong)",
              borderRadius: 14,
              boxShadow: "var(--shadow-float)",
              fontSize: 12,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--foreground)" }}
            itemStyle={{ color: "var(--foreground)" }}
          />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="circle"
            formatter={(value) => (
              <span className="text-[11px] text-foreground">{value}</span>
            )}
          />
          <Area
            type="monotone"
            dataKey="completed"
            name="Completed"
            stroke="var(--primary)"
            strokeWidth={2.5}
            fill="url(#areaCompleted)"
          />
          <Area
            type="monotone"
            dataKey="ongoing"
            name="Active"
            stroke="var(--intel)"
            strokeWidth={2.5}
            fill="url(#areaOngoing)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export type PieSlice = { name: string; value: number; color: string };

const PIE_PALETTE = [
  "var(--primary)",
  "var(--intel)",
  "var(--teal)",
  "var(--warning)",
  "var(--critical)",
  "var(--positive)",
  "#5c667a",
];

function PieChartTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: PieSlice }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = Number(item?.value ?? 0);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border-strong bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">{item?.name}</p>
      <p className="mt-0.5 text-muted-foreground">
        {value} · {pct}%
      </p>
    </div>
  );
}

export function DistributionPieChart({
  data,
  emptyLabel = "No data yet",
}: {
  data: PieSlice[];
  emptyLabel?: string;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex h-[200px] w-full items-center gap-4">
      <div className="h-full min-w-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={68}
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={entry.color || PIE_PALETTE[i % PIE_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<PieChartTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="max-h-[180px] shrink-0 space-y-2 overflow-y-auto pr-1 text-[11px]">
        {data.map((entry) => {
          const pct = Math.round((entry.value / total) * 100);
          return (
            <li key={entry.name} className="flex items-start gap-2 leading-tight">
              <span
                className="mt-0.5 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="font-medium text-foreground">{entry.name}</p>
                <p className="text-muted-foreground tabular-nums">
                  {entry.value} · {pct}%
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SimpleBarChart({
  data,
  dataKey = "count",
  emptyLabel = "No data yet",
}: {
  data: Array<{ label: string; count: number }>;
  dataKey?: string;
  emptyLabel?: string;
}) {
  if (data.every((d) => d.count === 0)) {
    return (
      <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border-strong)",
              borderRadius: 14,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--foreground)" }}
            itemStyle={{ color: "var(--foreground)" }}
          />
          <Bar dataKey={dataKey} fill="var(--intel)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActivityRow({
  icon,
  tone = "primary",
  title,
  detail,
  meta,
  time,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: string;
  detail?: string;
  meta?: string;
  time: string;
}) {
  const Icon = icon;
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-elevated/70">
      <span className={cn("clay-icon size-8 shrink-0", TONE_GLOW[tone])}>
        <Icon className={cn("size-4", TONE_TEXT[tone])} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{title}</p>
        {detail ? (
          <p className="mono truncate text-[11px] text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] text-muted-foreground">{time}</p>
        {meta ? (
          <p className="text-[10px] text-muted-foreground/70">{meta}</p>
        ) : null}
      </div>
    </div>
  );
}

export function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="clay clay-lift flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium"
    >
      <Icon className="size-4 text-primary" />
      {label}
    </button>
  );
}
