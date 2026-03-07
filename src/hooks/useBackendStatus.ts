import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useBackendStore } from "@/stores/backend";
import { pingBackend } from "@/lib/tauri";
import { createLogger } from "@/lib/logger";

const log = createLogger("BackendStatus");

/**
 * Hook that manages backend connection status.
 * Pings the backend on mount with retries and listens for status events.
 */
export function useBackendStatus() {
  const setStatus = useBackendStore((s) => s.setStatus);
  const setVersion = useBackendStore((s) => s.setVersion);
  const setError = useBackendStore((s) => s.setError);
  const status = useBackendStore((s) => s.status);

  useEffect(() => {
    // Listen for status events from the Rust backend
    const unlisten = listen<string>("backend:status", (event) => {
      log.info("Status event:", event.payload);
      if (event.payload === "connected") {
        setStatus("connected");
      } else if (event.payload === "error") {
        setError("Backend failed to start");
      } else {
        setStatus("disconnected");
      }
    });

    // Ping with retries — sidecar may still be initializing
    setStatus("connecting");
    let cancelled = false;

    const tryPing = async (attempt: number) => {
      if (cancelled) return;
      const delay = attempt === 0 ? 500 : 1500;
      log.debug(`Ping attempt ${attempt} — waiting ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      if (cancelled) return;

      try {
        const result = await pingBackend();
        log.info(`Ping succeeded (attempt ${attempt}):`, result);
        setVersion(result.version);
      } catch (err) {
        log.warn(`Ping failed (attempt ${attempt}):`, err);
        if (attempt < 3 && !cancelled) {
          tryPing(attempt + 1);
        } else {
          log.error("All ping attempts exhausted, backend unreachable");
          setError(String(err));
        }
      }
    };

    tryPing(0);

    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, [setStatus, setVersion, setError]);

  return status;
}
