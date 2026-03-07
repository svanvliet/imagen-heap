import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useModelStore, type DownloadProgress } from "@/stores/models";
import { createLogger } from "@/lib/logger";

const log = createLogger("DownloadProgress");

/**
 * Hook that listens for download progress events from the backend
 * and updates the model store.
 */
export function useDownloadProgress() {
  const setDownloadProgress = useModelStore((s) => s.setDownloadProgress);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("backend:download_progress", (event) => {
      log.debug("Download progress:", event.payload);
      setDownloadProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setDownloadProgress]);
}
