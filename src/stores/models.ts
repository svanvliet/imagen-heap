import { create } from "zustand";
import { getModels, isFirstRun, downloadModel, deleteModel, getDiskUsage } from "@/lib/tauri";

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  architecture: string;
  license_spdx: string;
  file_size_bytes: number;
  quantization: string;
  min_memory_mb: number;
  source_url: string;
  is_default: boolean;
  description: string;
  status: string;
  local_path: string | null;
  downloaded_at: string | null;
}

interface ModelState {
  models: ModelInfo[];
  isFirstRun: boolean | null;
  isLoading: boolean;
  downloadingModels: Set<string>;
  diskUsage: { used_bytes: number; model_count: number } | null;

  loadModels: () => Promise<void>;
  checkFirstRun: () => Promise<boolean>;
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  loadDiskUsage: () => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  isFirstRun: null,
  isLoading: false,
  downloadingModels: new Set(),
  diskUsage: null,

  loadModels: async () => {
    set({ isLoading: true });
    try {
      const models = await getModels();
      set({ models: models as ModelInfo[], isLoading: false });
    } catch (err) {
      console.error("[ModelStore] Failed to load models:", err);
      set({ isLoading: false });
    }
  },

  checkFirstRun: async () => {
    try {
      const result = await isFirstRun();
      set({ isFirstRun: result.is_first_run });
      return result.is_first_run;
    } catch (err) {
      console.error("[ModelStore] Failed to check first run:", err);
      return true;
    }
  },

  downloadModel: async (modelId: string) => {
    const current = get().downloadingModels;
    set({ downloadingModels: new Set([...current, modelId]) });
    try {
      await downloadModel(modelId);
      const newDownloading = new Set(get().downloadingModels);
      newDownloading.delete(modelId);
      set({ downloadingModels: newDownloading });
      // Refresh model list
      await get().loadModels();
      await get().loadDiskUsage();
    } catch (err) {
      console.error("[ModelStore] Download failed:", err);
      const newDownloading = new Set(get().downloadingModels);
      newDownloading.delete(modelId);
      set({ downloadingModels: newDownloading });
    }
  },

  deleteModel: async (modelId: string) => {
    try {
      await deleteModel(modelId);
      await get().loadModels();
      await get().loadDiskUsage();
    } catch (err) {
      console.error("[ModelStore] Delete failed:", err);
    }
  },

  loadDiskUsage: async () => {
    try {
      const usage = await getDiskUsage();
      set({ diskUsage: usage });
    } catch (err) {
      console.error("[ModelStore] Failed to load disk usage:", err);
    }
  },
}));
