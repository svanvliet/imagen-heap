import { create } from "zustand";
import { getAdapters, downloadAdapter, deleteAdapter } from "@/lib/tauri";
import { createLogger } from "@/lib/logger";

const log = createLogger("AdapterStore");

export interface AdapterInfo {
  id: string;
  name: string;
  adapter_type: string;
  hf_repo_id: string;
  compatible_models: string[];
  file_size_bytes: number;
  license_spdx: string;
  description: string;
  source_url: string;
  status: string;
}

export interface AdapterDownloadProgress {
  adapter_id: string;
  bytes_downloaded: number;
  total_bytes: number;
}

interface AdapterState {
  adapters: AdapterInfo[];
  isLoading: boolean;
  downloadingAdapters: Set<string>;
  downloadProgress: Map<string, AdapterDownloadProgress>;
  downloadErrors: Map<string, string>;

  loadAdapters: () => Promise<void>;
  downloadAdapter: (adapterId: string) => Promise<void>;
  deleteAdapter: (adapterId: string) => Promise<void>;
  setDownloadProgress: (progress: AdapterDownloadProgress) => void;
  clearDownloadError: (adapterId: string) => void;
  clearAllDownloadErrors: () => void;
  isReduxAvailable: () => boolean;
}

export const useAdapterStore = create<AdapterState>()((set, get) => ({
  adapters: [],
  isLoading: false,
  downloadingAdapters: new Set(),
  downloadProgress: new Map(),
  downloadErrors: new Map(),

  isReduxAvailable: () => {
    return get().adapters.some(
      (a) => a.id === "flux-redux-dev" && a.status === "downloaded",
    );
  },

  loadAdapters: async () => {
    set({ isLoading: true });
    try {
      const result = await getAdapters();
      log.info("Loaded %d adapters", result.adapters.length);
      set({ adapters: result.adapters as AdapterInfo[], isLoading: false });
    } catch (err) {
      log.error("Failed to load adapters:", err);
      set({ isLoading: false });
    }
  },

  downloadAdapter: async (adapterId: string) => {
    log.info("Starting adapter download:", adapterId);
    const current = get().downloadingAdapters;
    const errMap = new Map(get().downloadErrors);
    errMap.delete(adapterId);
    const initProgress = new Map(get().downloadProgress);
    initProgress.set(adapterId, {
      adapter_id: adapterId,
      bytes_downloaded: 0,
      total_bytes: 0,
    });
    set({
      downloadingAdapters: new Set([...current, adapterId]),
      downloadErrors: errMap,
      downloadProgress: initProgress,
    });

    try {
      await downloadAdapter(adapterId);
      log.info("Adapter download complete:", adapterId);
      const newDownloading = new Set(get().downloadingAdapters);
      newDownloading.delete(adapterId);
      const newProgress = new Map(get().downloadProgress);
      newProgress.delete(adapterId);
      set({ downloadingAdapters: newDownloading, downloadProgress: newProgress });
      await get().loadAdapters();
    } catch (err) {
      log.error("Adapter download failed:", adapterId, err);
      const newDownloading = new Set(get().downloadingAdapters);
      newDownloading.delete(adapterId);
      const newErrors = new Map(get().downloadErrors);
      newErrors.set(adapterId, String(err));
      set({ downloadingAdapters: newDownloading, downloadErrors: newErrors });
      throw err;
    }
  },

  deleteAdapter: async (adapterId: string) => {
    log.info("Deleting adapter:", adapterId);
    try {
      await deleteAdapter(adapterId);
      log.info("Adapter delete complete:", adapterId);
      await get().loadAdapters();
    } catch (err) {
      log.error("Adapter delete failed:", adapterId, err);
    }
  },

  setDownloadProgress: (progress: AdapterDownloadProgress) => {
    const newMap = new Map(get().downloadProgress);
    newMap.set(progress.adapter_id, progress);
    set({ downloadProgress: newMap });
  },

  clearDownloadError: (adapterId: string) => {
    const newErrors = new Map(get().downloadErrors);
    newErrors.delete(adapterId);
    set({ downloadErrors: newErrors });
  },

  clearAllDownloadErrors: () => {
    set({ downloadErrors: new Map() });
  },
}));
