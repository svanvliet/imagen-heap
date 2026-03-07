import { useEffect } from "react";
import { useModelStore, type ModelInfo, type DownloadProgress } from "@/stores/models";
import { formatBytes, cn } from "@/lib/utils";
import {
  Download,
  Trash2,
  Check,
  Loader2,
  Shield,
  AlertTriangle,
  HardDrive,
  X,
} from "lucide-react";

interface ModelManagerProps {
  onClose: () => void;
}

export function ModelManager({ onClose }: ModelManagerProps) {
  const models = useModelStore((s) => s.models);
  const isLoading = useModelStore((s) => s.isLoading);
  const downloadingModels = useModelStore((s) => s.downloadingModels);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const diskUsage = useModelStore((s) => s.diskUsage);
  const loadModels = useModelStore((s) => s.loadModels);
  const loadDiskUsage = useModelStore((s) => s.loadDiskUsage);
  const downloadModelAction = useModelStore((s) => s.downloadModel);
  const deleteModelAction = useModelStore((s) => s.deleteModel);

  useEffect(() => {
    loadModels();
    loadDiskUsage();
  }, [loadModels, loadDiskUsage]);

  const licenseBadge = (license: string) => {
    const colors: Record<string, string> = {
      "apache-2.0": "bg-emerald-500/10 text-emerald-400",
      "non-commercial": "bg-amber-500/10 text-amber-400",
      community: "bg-blue-500/10 text-blue-400",
      openrail: "bg-blue-500/10 text-blue-400",
    };
    return colors[license] || "bg-zinc-500/10 text-zinc-400";
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary/80 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[640px] max-h-[80vh] bg-bg-secondary rounded-2xl border border-border-default shadow-2xl flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Model Manager</h2>
            {diskUsage && (
              <p className="text-xs text-text-muted mt-0.5">
                <HardDrive size={11} className="inline mr-1" />
                {diskUsage.model_count} models · {formatBytes(diskUsage.used_bytes)} used
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary"
          >
            <X size={18} />
          </button>
        </div>

        {/* Model list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-accent animate-spin" />
            </div>
          ) : (
            models.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                isDownloading={downloadingModels.has(model.id)}
                progress={downloadProgress.get(model.id)}
                onDownload={() => downloadModelAction(model.id)}
                onDelete={() => deleteModelAction(model.id)}
                licenseBadgeClass={licenseBadge(model.license_spdx)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ModelCard({
  model,
  isDownloading,
  progress,
  onDownload,
  onDelete,
  licenseBadgeClass,
}: {
  model: ModelInfo;
  isDownloading: boolean;
  progress?: DownloadProgress;
  onDownload: () => void;
  onDelete: () => void;
  licenseBadgeClass: string;
}) {
  const isDownloaded = model.status === "downloaded";
  const pct = progress && progress.total_bytes > 0
    ? Math.round((progress.bytes_downloaded / progress.total_bytes) * 100)
    : null;

  return (
    <div className="bg-bg-primary rounded-lg p-4 border border-border-subtle">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary">{model.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted uppercase font-medium">
              {model.quantization}
            </span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", licenseBadgeClass)}>
              {model.license_spdx === "apache-2.0" ? (
                <><Shield size={9} className="inline mr-0.5" />Apache 2.0</>
              ) : model.license_spdx === "non-commercial" ? (
                <><AlertTriangle size={9} className="inline mr-0.5" />Non-Commercial</>
              ) : (
                model.license_spdx
              )}
            </span>
            {model.is_default && (
              <span className="text-[10px] px-1.5 py-0.5 bg-accent-muted rounded text-accent font-medium">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1 line-clamp-2">{model.description}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
            <span>{formatBytes(model.file_size_bytes)}</span>
            <span>·</span>
            <span>{model.architecture}</span>
            <span>·</span>
            <span>Min {formatBytes(model.min_memory_mb * 1024 * 1024)} RAM</span>
          </div>
        </div>

        <div className="flex-shrink-0">
          {isDownloading ? (
            <div className="w-32">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 size={12} className="text-accent animate-spin" />
                <span className="text-[10px] text-text-muted">
                  {pct !== null ? `${pct}%` : "Downloading…"}
                </span>
              </div>
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: pct !== null ? `${pct}%` : "30%" }}
                />
              </div>
              {progress && progress.bytes_downloaded > 0 && (
                <p className="text-[9px] text-text-muted mt-0.5">
                  {formatBytes(progress.bytes_downloaded)} / {formatBytes(progress.total_bytes)}
                </p>
              )}
            </div>
          ) : isDownloaded ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-success font-medium mr-1">
                <Check size={12} className="inline" /> Installed
              </span>
              <button
                onClick={onDelete}
                className="p-1.5 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                title="Delete model"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={onDownload}
              className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Download size={12} />
              Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
