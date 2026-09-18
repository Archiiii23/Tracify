import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_TRACE_DEPTH, MIN_TRACE_DEPTH, TRACE_DEPTH_OPTIONS } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface TraceDepthSelectProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  /** Hide helper copy — for compact toolbars */
  compact?: boolean;
}

export function TraceDepthSelect({
  value,
  onChange,
  disabled,
  className,
  triggerClassName,
  compact = false,
}: TraceDepthSelectProps) {
  return (
    <div className={cn(compact ? className : cn("space-y-1", className))}>
      <Select
        disabled={disabled}
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
      >
        <SelectTrigger className={cn("w-full", triggerClassName)}>
          <SelectValue placeholder="Select hop depth" />
        </SelectTrigger>
        <SelectContent>
          {TRACE_DEPTH_OPTIONS.map((hops) => (
            <SelectItem key={hops} value={String(hops)}>
              {hops} hop{hops === 1 ? "" : "s"}
              {hops === MAX_TRACE_DEPTH ? " (max)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact ? (
        <p className="text-[11px] text-muted-foreground">
          Trace depth {MIN_TRACE_DEPTH}–{MAX_TRACE_DEPTH}. Higher values expand the graph but take
          longer to build.
        </p>
      ) : null}
    </div>
  );
}
