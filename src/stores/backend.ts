import { create } from "zustand";

export type BackendStatus = "disconnected" | "connecting" | "connected" | "error";

interface BackendState {
  status: BackendStatus;
  version: string | null;
  errorMessage: string | null;
  memoryUsageMb: number | null;
  loadedModel: string | null;

  setStatus: (status: BackendStatus) => void;
  setVersion: (version: string) => void;
  setError: (message: string) => void;
  clearError: () => void;
  setMemoryUsage: (mb: number) => void;
  setLoadedModel: (model: string | null) => void;
}

export const useBackendStore = create<BackendState>((set) => ({
  status: "disconnected",
  version: null,
  errorMessage: null,
  memoryUsageMb: null,
  loadedModel: null,

  setStatus: (status) => set({ status }),
  setVersion: (version) => set({ version, status: "connected" }),
  setError: (message) => set({ errorMessage: message, status: "error" }),
  clearError: () => set({ errorMessage: null }),
  setMemoryUsage: (mb) => set({ memoryUsageMb: mb }),
  setLoadedModel: (model) => set({ loadedModel: model }),
}));
