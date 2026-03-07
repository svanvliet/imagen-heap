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
  downloadErrors: Map<string, string>;
  diskUsage: { used_bytes: number; model_count: number } | null;

  loadModels: () => Promise<void>;
  checkFirstRun: () => Promise<boolean>;
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  loadDiskUsage: () => Promise<void>;
  setDownloadProgress: (progress: DownloadProgress) => void;
  clearDownloadError: (modelId: string) => void;
  clearAllDownloadErrors: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  models: [],
  isFirstRun: null,
  isLoading: false,
  downloadingModels: new Set(),
  downloadProgress: new Map(),
  downloadErrors: new Map(),
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
      set({ isFirstRun: true });
      return true;
    }
  },

  downloadModel: async (modelId: string) => {
    log.info("Starting background download:", modelId);
    const current = get().downloadingModels;
    const errMap = new Map(get().downloadErrors);
    errMap.delete(modelId);
    // Initialize progress at 0 so the bar doesn't start mid-way from stale cache data
    const initProgress = new Map(get().downloadProgress);
    initProgress.set(modelId, { model_id: modelId, bytes_downloaded: 0, total_bytes: 0 });
    set({ downloadingModels: new Set([...current, modelId]), downloadErrors: errMap, downloadProgress: initProgress });

    try {
      await downloadModel(modelId);
      log.info("Download complete:", modelId);
      const newDownloading = new Set(get().downloadingModels);
      newDownloading.delete(modelId);
      const newProgress = new Map(get().downloadProgress);
      newProgress.delete(modelId);
      set({ downloadingModels: newDownloading, downloadProgress: newProgress });
      await get().loadModels();
      await get().loadDiskUsage();
    } catch (err) {
      log.error("Download failed:", modelId, err);
      const newDownloading = new Set(get().downloadingModels);
      newDownloading.delete(modelId);
      const newErrors = new Map(get().downloadErrors);
      newErrors.set(modelId, String(err));
      set({ downloadingModels: newDownloading, downloadErrors: newErrors });
      throw err;
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

  clearDownloadError: (modelId: string) => {
    const newErrors = new Map(get().downloadErrors);
    newErrors.delete(modelId);
    set({ downloadErrors: newErrors });
  },

  clearAllDownloadErrors: () => {
    set({ downloadErrors: new Map() });
  },
}));
