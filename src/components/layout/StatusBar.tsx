import { useBackendStore } from "@/stores/backend";
import { cn } from "@/lib/utils";
import { Circle, Cpu, HardDrive } from "lucide-react";
import { formatBytes } from "@/lib/utils";

export function StatusBar() {
  const status = useBackendStore((s) => s.status);
  const loadedModel = useBackendStore((s) => s.loadedModel);
  const memoryUsageMb = useBackendStore((s) => s.memoryUsageMb);

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

  return (
    <div className="h-7 border-t border-border-default bg-bg-secondary flex items-center px-3 gap-4 flex-shrink-0 text-[11px]">
      {/* Backend status */}
      <div className="flex items-center gap-1.5">
        <Circle size={7} className={cn("fill-current", statusColor)} />
        <span className="text-text-secondary">Backend: {statusLabel}</span>
      </div>

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
