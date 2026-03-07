import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAdapterStore, type AdapterDownloadProgress } from "@/stores/adapters";
import { createLogger } from "@/lib/logger";

const log = createLogger("AdapterDownloadProgress");

/**
 * Hook that listens for adapter download progress events from the backend
 * and updates the adapter store.
 */
export function useAdapterDownloadProgress() {
  const setDownloadProgress = useAdapterStore((s) => s.setDownloadProgress);

  useEffect(() => {
    const unlisten = listen<AdapterDownloadProgress>(
      "backend:adapter_download_progress",
      (event) => {
        log.debug("Adapter download progress:", event.payload);
        setDownloadProgress(event.payload);
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setDownloadProgress]);
}
