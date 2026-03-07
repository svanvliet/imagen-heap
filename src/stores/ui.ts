import { create } from "zustand";

interface UIState {
  /** Whether the left sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether the right panel is collapsed */
  panelCollapsed: boolean;
  /** Simple or Advanced mode */
  mode: "simple" | "advanced";
  /** Active right panel tab */
  activePanelTab: "character" | "pose" | "controlnet";
  /** Theme preference */
  theme: "dark" | "light" | "system";
  /** Whether the Model Manager modal is open */
  showModelManager: boolean;

  toggleSidebar: () => void;
  togglePanel: () => void;
  setMode: (mode: "simple" | "advanced") => void;
  setActivePanelTab: (tab: "character" | "pose" | "controlnet") => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setShowModelManager: (show: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  panelCollapsed: true,
  mode: "simple",
  activePanelTab: "character",
  theme: "dark",
  showModelManager: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
  setMode: (mode) => set({ mode, panelCollapsed: mode === "simple" }),
  setActivePanelTab: (tab) => set({ activePanelTab: tab }),
  setTheme: (theme) => set({ theme }),
  setShowModelManager: (show) => set({ showModelManager: show }),
}));
