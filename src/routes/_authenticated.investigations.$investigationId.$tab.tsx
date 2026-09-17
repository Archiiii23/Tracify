import { createFileRoute, redirect } from "@tanstack/react-router";

import { InvestigationWorkspacePage } from "@/components/vt/investigation/InvestigationWorkspacePage";
import { isInvestigationTab } from "@/components/vt/investigation/tabs";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/vt/states";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/investigations/$investigationId/$tab")({
  beforeLoad: ({ params }) => {
    if (!isInvestigationTab(params.tab)) {
      throw redirect({
        to: "/investigations/$investigationId/$tab",
        params: { investigationId: params.investigationId, tab: "overview" },
      });
    }
  },
  head: ({ params }) => ({
    meta: [{ title: `Investigation ${params.tab} — TRACIFY` }],
  }),
  component: InvestigationTabPage,
  errorComponent: ({ error }) => (
    <div className="space-y-4 p-6">
      <ErrorState message={error instanceof Error ? error.message : "Failed to load investigation."} />
      <Button size="sm" variant="outline" asChild>
        <Link to="/investigations">Back to investigations</Link>
      </Button>
    </div>
  ),
});

function InvestigationTabPage() {
  const { investigationId, tab } = Route.useParams();
  return <InvestigationWorkspacePage investigationId={investigationId} activeTab={tab} />;
}
