import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBackendStore } from "@/stores/backend";
import { pingBackend } from "@/lib/tauri";

/**
 * Hook that manages backend connection status.
 * Pings the backend on mount and listens for status events.
 */
export function useBackendStatus() {
  const setStatus = useBackendStore((s) => s.setStatus);
  const setVersion = useBackendStore((s) => s.setVersion);
  const setError = useBackendStore((s) => s.setError);
  const status = useBackendStore((s) => s.status);

  useEffect(() => {
    // Listen for status events from the Rust backend
    const unlisten = listen<string>("backend:status", (event) => {
      console.log("[useBackendStatus] Status event:", event.payload);
      if (event.payload === "connected") {
        setStatus("connected");
      } else if (event.payload === "error") {
        setError("Backend failed to start");
      } else {
        setStatus("disconnected");
      }
    });

    // Try to ping the backend after a short delay (let sidecar start)
    setStatus("connecting");
    const timer = setTimeout(async () => {
      try {
        const result = await pingBackend();
        console.log("[useBackendStatus] Ping result:", result);
        setVersion(result.version);
      } catch (err) {
        console.warn("[useBackendStatus] Ping failed:", err);
        setError(String(err));
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      unlisten.then((fn) => fn());
    };
  }, [setStatus, setVersion, setError]);

  return status;
}
