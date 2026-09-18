import type { LucideIcon } from "lucide-react";
import {
  Clock,
  FileText,
  Fingerprint,
  LayoutDashboard,
  List,
  Network,
  ShieldAlert,
  Vault,
} from "lucide-react";

export const INVESTIGATION_TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: List },
  { id: "graph", label: "Graph", icon: Network },
  { id: "timeline", label: "Timeline", icon: Clock },
  { id: "risk", label: "Risk & Findings", icon: ShieldAlert },
  { id: "attribution", label: "Attribution", icon: Fingerprint },
  { id: "evidence", label: "Evidence", icon: Vault },
  { id: "report", label: "Report", icon: FileText },
] as const;

export type InvestigationTabId = (typeof INVESTIGATION_TABS)[number]["id"];

export function isInvestigationTab(value: string): value is InvestigationTabId {
  return INVESTIGATION_TABS.some((t) => t.id === value);
}

export function tabMeta(id: InvestigationTabId): { label: string; icon: LucideIcon } {
  const found = INVESTIGATION_TABS.find((t) => t.id === id)!;
  return { label: found.label, icon: found.icon };
}
