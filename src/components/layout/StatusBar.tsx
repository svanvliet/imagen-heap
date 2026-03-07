import { useBackendStore } from "@/stores/backend";
import { useModelStore } from "@/stores/models";
import { cn } from "@/lib/utils";
import { Circle, Cpu, HardDrive, Loader2 } from "lucide-react";
import { formatBytes } from "@/lib/utils";

export function StatusBar() {
  const status = useBackendStore((s) => s.status);
  const loadedModel = useBackendStore((s) => s.loadedModel);
  const memoryUsageMb = useBackendStore((s) => s.memoryUsageMb);
  const downloadingModels = useModelStore((s) => s.downloadingModels);
  const downloadProgress = useModelStore((s) => s.downloadProgress);

  const statusColor = {
    connected: "text-success",
    connecting: "text-warning",
    disconnected: "text-text-muted",
    error: "text-error",
  }[status];

  const statusLabel = {
    connected: "Connected",
    connecting: "Connecting...",
    disconnected: "Disconnected",
    error: "Error",
  }[status];

  // Aggregate download info
  const activeDownloads = downloadingModels.size;
  const firstDownload = activeDownloads > 0 ? [...downloadProgress.values()][0] : null;
  const pct = firstDownload && firstDownload.total_bytes > 0
    ? Math.round((firstDownload.bytes_downloaded / firstDownload.total_bytes) * 100)
    : null;

  return (
    <div className="h-7 border-t border-border-default bg-bg-secondary flex items-center px-3 gap-4 flex-shrink-0 text-[11px]">
      {/* Backend status */}
      <div className="flex items-center gap-1.5">
        <Circle size={7} className={cn("fill-current", statusColor)} />
        <span className="text-text-secondary">Backend: {statusLabel}</span>
      </div>

      {/* Active download indicator */}
      {activeDownloads > 0 && (
        <div className="flex items-center gap-1.5 text-accent">
          <Loader2 size={11} className="animate-spin" />
          <span>
            Downloading{activeDownloads > 1 ? ` (${activeDownloads})` : ""}
            {pct !== null ? ` ${pct}%` : "…"}
          </span>
          {firstDownload && firstDownload.bytes_downloaded > 0 && (
            <span className="text-text-muted">
              {formatBytes(firstDownload.bytes_downloaded)}
              {firstDownload.total_bytes > 0 ? ` / ${formatBytes(firstDownload.total_bytes)}` : ""}
            </span>
          )}
        </div>
      )}

      {/* Loaded model */}
      {loadedModel && (
        <div className="flex items-center gap-1.5 text-text-muted">
          <Cpu size={11} />
          <span>{loadedModel}</span>
        </div>
      )}

      {/* Memory usage */}
      {memoryUsageMb != null && (
        <div className="flex items-center gap-1.5 text-text-muted">
          <HardDrive size={11} />
          <span>{formatBytes(memoryUsageMb * 1024 * 1024)}</span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Inference location */}
      <div className="text-text-muted">Local</div>
    </div>
  );
}
