import { useEffect } from "react";
import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/vt/AppShell";
import { CommandPalette } from "@/components/vt/CommandPalette";
import { CreateCaseDialog } from "@/components/vt/CreateCaseDialog";
import { StartInvestigationDialog } from "@/components/vt/StartInvestigationDialog";
import { useAuth } from "@/hooks/useAuth";
import { useUIStore } from "@/stores/ui";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const presetCaseId = useUIStore((s) => s.presetCaseId);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Verifying session…
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>
      <CommandPalette />
      <CreateCaseDialog />
      <StartInvestigationDialog presetCaseId={presetCaseId ?? undefined} />
    </>
  );
}
