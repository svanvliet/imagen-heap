import { create } from "zustand";
import { getModels, isFirstRun, downloadModel, deleteModel, getDiskUsage } from "@/lib/tauri";
import { createLogger } from "@/lib/logger";

const log = createLogger("ModelStore");

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

export interface DownloadProgress {
  model_id: string;
  bytes_downloaded: number;
  total_bytes: number;
}

interface ModelState {
  models: ModelInfo[];
  isFirstRun: boolean | null;
  isLoading: boolean;
  downloadingModels: Set<string>;
  downloadProgress: Map<string, DownloadProgress>;
  diskUsage: { used_bytes: number; model_count: number } | null;

  loadModels: () => Promise<void>;
  checkFirstRun: () => Promise<boolean>;
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  loadDiskUsage: () => Promise<void>;
  setDownloadProgress: (progress: DownloadProgress) => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  isFirstRun: null,
  isLoading: false,
  downloadingModels: new Set(),
  downloadProgress: new Map(),
  diskUsage: null,

  loadModels: async () => {
    set({ isLoading: true });
    try {
      const models = await getModels();
      log.info("Loaded %d models", (models as ModelInfo[]).length);
      set({ models: models as ModelInfo[], isLoading: false });
    } catch (err) {
      log.error("Failed to load models:", err);
      set({ isLoading: false });
    }
  },

  checkFirstRun: async () => {
    try {
      const result = await isFirstRun();
      log.info("is_first_run result:", result);
      set({ isFirstRun: result.is_first_run });
      return result.is_first_run;
    } catch (err) {
      log.error("Failed to check first run:", err);
      // Default to showing wizard on error so user isn't stuck
      set({ isFirstRun: true });
      return true;
    }
  },

  downloadModel: async (modelId: string) => {
    log.info("Downloading model:", modelId);
    const current = get().downloadingModels;
    set({ downloadingModels: new Set([...current, modelId]) });
    try {
      await downloadModel(modelId);
      log.info("Download complete:", modelId);
      const newDownloading = new Set(get().downloadingModels);
      newDownloading.delete(modelId);
      const newProgress = new Map(get().downloadProgress);
      newProgress.delete(modelId);
      set({ downloadingModels: newDownloading, downloadProgress: newProgress });
      // Refresh model list
      await get().loadModels();
      await get().loadDiskUsage();
    } catch (err) {
      log.error("Download failed:", modelId, err);
      const newDownloading = new Set(get().downloadingModels);
      newDownloading.delete(modelId);
      set({ downloadingModels: newDownloading });
    }
  },

  deleteModel: async (modelId: string) => {
    log.info("Deleting model:", modelId);
    try {
      await deleteModel(modelId);
      log.info("Delete complete:", modelId);
      await get().loadModels();
      await get().loadDiskUsage();
    } catch (err) {
      log.error("Delete failed:", modelId, err);
    }
  },

  loadDiskUsage: async () => {
    try {
      const usage = await getDiskUsage();
      log.debug("Disk usage:", usage);
      set({ diskUsage: usage });
    } catch (err) {
      log.error("Failed to load disk usage:", err);
    }
  },

  setDownloadProgress: (progress: DownloadProgress) => {
    const newMap = new Map(get().downloadProgress);
    newMap.set(progress.model_id, progress);
    set({ downloadProgress: newMap });
  },
}));
