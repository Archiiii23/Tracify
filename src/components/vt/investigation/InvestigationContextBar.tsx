import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { INVESTIGATION_TABS, type InvestigationTabId } from "./tabs";

interface InvestigationContextBarProps {
  investigationId: string;
  activeTab: InvestigationTabId;
  counts?: Partial<Record<InvestigationTabId, number>>;
}

export function InvestigationContextBar({
  investigationId,
  activeTab,
  counts = {},
}: InvestigationContextBarProps) {
  return (
    <nav
      className="sticky top-[76px] z-20 -mx-4 mb-5 border-b border-border/60 bg-background/95 px-4 backdrop-blur-md sm:-mx-6 sm:px-6"
      aria-label="Investigation sections"
    >
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
        {INVESTIGATION_TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          const count = counts[id];
          return (
            <Link
              key={id}
              to="/investigations/$investigationId/$tab"
              params={{ investigationId, tab: id }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-3.5" />
              {label}
              {count !== undefined && count > 0 ? (
                <span className="mono rounded-full bg-secondary px-1.5 py-0.5 text-[10px]">
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
