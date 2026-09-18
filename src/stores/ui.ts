import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  createCaseOpen: boolean;
  setCreateCaseOpen: (open: boolean) => void;
  startInvestigationOpen: boolean;
  setStartInvestigationOpen: (open: boolean) => void;
  /** Pre-selects a case when opening the start-investigation dialog. */
  presetCaseId: string | null;
  setPresetCaseId: (id: string | null) => void;
  /** Opens the start-investigation dialog, optionally bound to a case. */
  openInvestigationModal: (caseId?: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  createCaseOpen: false,
  setCreateCaseOpen: (createCaseOpen) => set({ createCaseOpen }),
  startInvestigationOpen: false,
  setStartInvestigationOpen: (startInvestigationOpen) =>
    set({ startInvestigationOpen }),
  presetCaseId: null,
  setPresetCaseId: (presetCaseId) => set({ presetCaseId }),
  openInvestigationModal: (caseId = null) =>
    set({ presetCaseId: caseId, startInvestigationOpen: true }),
}));

/** Workspace-local selection state for the investigation canvas + inspector. */
export type SelectionKind = "wallet" | "transaction" | "entity" | "path" | null;

interface WorkspaceState {
  selection: { kind: SelectionKind; id: string | null };
  select: (kind: SelectionKind, id: string | null) => void;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  timelineOpen: boolean;
  setTimelineOpen: (open: boolean) => void;
  focusedPath: string | null;
  setFocusedPath: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selection: { kind: null, id: null },
  select: (kind, id) => set({ selection: { kind, id } }),
  activeTool: "explore",
  setActiveTool: (activeTool) => set({ activeTool }),
  timelineOpen: true,
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  focusedPath: null,
  setFocusedPath: (focusedPath) => set({ focusedPath }),
}));
