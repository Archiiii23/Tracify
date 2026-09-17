import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell,
  Boxes,
  Building2,
  ChevronsLeft,
  FileText,
  FolderOpen,
  Gauge,
  Inbox,
  Siren,

  LogOut,
  PanelLeft,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Vault,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/ui";
import { useAuth } from "@/hooks/useAuth";

const NAV_SECTIONS = [
  {
    label: "Command center",
    items: [{ to: "/dashboard", label: "Dashboard", icon: Gauge }],
  },
  {
    label: "Investigate",
    items: [
      { to: "/investigations", label: "Investigations", icon: Radar },
      { to: "/cases", label: "Cases", icon: FolderOpen },
      { to: "/alerts", label: "Alerts", icon: Siren },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/attribution", label: "Entity intelligence", icon: Building2 },
      { to: "/complaints", label: "Case intake", icon: Inbox },
    ],
  },
  {
    label: "Output",
    items: [
      { to: "/reports", label: "Reports", icon: FileText },
      { to: "/evidence", label: "Evidence", icon: Vault },
    ],
  },
  {
    label: "Tools",
    items: [{ to: "/ai", label: "AI copilot", icon: Sparkles }],
  },
  {
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
] as const;

const NAV = NAV_SECTIONS.flatMap((s) => s.items);

/** Primary destinations for mobile bottom bar */
const MOBILE_NAV = [
  { to: "/dashboard", label: "Home", icon: Gauge },
  { to: "/investigations", label: "Traces", icon: Radar },
  { to: "/cases", label: "Cases", icon: FolderOpen },
  { to: "/alerts", label: "Alerts", icon: Siren },
  { to: "/settings", label: "More", icon: Settings },
] as const;



export function TracifyMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "clay-icon relative flex size-10 shrink-0 shadow-[0_10px_26px_-10px_var(--primary-glow)]",
        className,
      )}
      style={{ backgroundImage: "var(--gradient-intel)" }}
      aria-hidden
    >
      <Boxes className="size-5 text-primary-foreground" />
    </span>
  );
}


function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 84 : 268 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="fixed inset-y-0 left-0 z-40 hidden flex-col p-3 lg:flex"
    >
      <div className="clay flex h-full flex-col overflow-hidden">
      <div className="flex h-[76px] items-center gap-2.5 border-b border-border px-4">
        <TracifyMark />
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.14 }}
              className="min-w-0"
            >
              <p className="truncate text-sm font-semibold tracking-tight">
                TRACIFY
              </p>
              <p className="mono truncate text-[10px] text-muted-foreground">
                blockchain intelligence
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="label-caps mb-1.5 px-3 text-[10px] text-muted-foreground/80">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map(({ to, label, icon: Icon }) => {
                const active =
                  pathname === to ||
                  pathname.startsWith(`${to}/`) ||
                  (to === "/investigations" && pathname.startsWith("/investigations"));
                const link = (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-300",
                      active
                        ? "bg-sidebar-accent/80 text-sidebar-accent-foreground shadow-[inset_3px_0_0_0_var(--primary)]"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                      collapsed && "justify-center px-0",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon
                      className={cn(
                        "size-[18px] shrink-0 transition-colors",
                        active && "text-primary",
                      )}
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                );

                return collapsed ? (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          </div>
        ))}
      </nav>


      <div className="border-t border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className={cn(
            "w-full justify-start gap-2 rounded-xl text-muted-foreground",
            collapsed && "justify-center",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
      </div>
    </motion.aside>

  );
}

function Topbar() {
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);
  const { user, profile, isAdmin, signOut } = useAuth();
  const name =
    (profile as { full_name?: string } | null)?.full_name ??
    user?.email?.split("@")[0] ??
    "Investigator";

  return (
    <header className="sticky top-0 z-30 px-3 pt-3">
      <div className="clay flex h-[68px] items-center gap-3 px-3 sm:px-4">
      <div className="flex items-center gap-2.5 lg:hidden">
        <TracifyMark />
        <span className="text-sm font-semibold">TRACIFY</span>
      </div>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="clay-inset hidden h-10 max-w-lg flex-1 items-center gap-2.5 px-3.5 text-sm text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:flex"
      >
        <Search className="size-4" />
        <span>Search cases, wallets, entities, tx hashes…</span>
        <kbd className="mono clay-pill ml-auto px-2 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="sm:hidden"
          onClick={() => setCommandOpen(true)}
          aria-label="Open command palette"
        >
          <Search className="size-4" />
        </Button>

        <Button variant="ghost" size="icon" className="hidden sm:flex" asChild>
          <Link to="/alerts" aria-label="Open alerts">
            <Bell className="size-4 text-muted-foreground" />
          </Link>
        </Button>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="clay clay-lift flex items-center gap-2.5 px-2.5 py-1.5 text-left"
              >
                <span
                  className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold uppercase text-primary-foreground"
                  style={{ backgroundImage: "var(--gradient-intel)" }}
                >
                  {name.slice(0, 2)}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-xs font-medium">{name}</span>
                  <span className="mono block truncate text-[10px] text-muted-foreground">
                    {isAdmin ? "admin" : "investigator"}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="mono text-[11px] font-normal text-muted-foreground">
                {user?.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild variant="default" size="sm" className="clay clay-lift gap-2 rounded-xl">
            <Link to="/auth">
              <LogOut className="size-4 rotate-180" />
              Sign in
            </Link>
          </Button>
        )}
      </div>
      </div>
    </header>

  );
}

function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="sticky bottom-0 z-30 px-3 pb-3 lg:hidden">
      <div className="clay flex items-center justify-between gap-1 px-2 py-2">
      {MOBILE_NAV.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] transition-colors",
              active ? "clay-inset text-primary" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-[18px]" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
      </div>
    </nav>

  );
}

export function AppShell({
  children,
  bare = false,
}: {
  children: React.ReactNode;
  bare?: boolean;
}) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className="flex min-h-screen flex-col transition-[padding] duration-300"
        style={{ paddingLeft: undefined }}
      >
        <div
          className={cn(
            "flex min-h-screen flex-col transition-[padding] duration-300",
            collapsed ? "lg:pl-[84px]" : "lg:pl-[268px]",
          )}
        >
          <Topbar />
          <main
            className={cn(
              "flex-1",
              bare ? "" : "mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6",
            )}
          >

            {children}
          </main>
          <MobileNav />
        </div>
      </div>
    </div>
  );
}
