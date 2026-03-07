import { useEffect, useState } from "react";
import { useModelStore, type ModelInfo, type DownloadProgress } from "@/stores/models";
import { formatBytes, cn } from "@/lib/utils";
import { saveHfToken, revealModelFolder, resetWizard } from "@/lib/tauri";
import { createLogger } from "@/lib/logger";
import {
  Download,
  Trash2,
  Check,
  Loader2,
  Shield,
  AlertTriangle,
  HardDrive,
  X,
  KeyRound,
  ExternalLink,
  AlertCircle,
  FolderOpen,
  RotateCcw,
} from "lucide-react";

const log = createLogger("ModelManager");

interface ModelManagerProps {
  onClose: () => void;
}

export function ModelManager({ onClose }: ModelManagerProps) {
  const models = useModelStore((s) => s.models);
  const isLoading = useModelStore((s) => s.isLoading);
  const downloadingModels = useModelStore((s) => s.downloadingModels);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const downloadErrors = useModelStore((s) => s.downloadErrors);
  const diskUsage = useModelStore((s) => s.diskUsage);
  const loadModels = useModelStore((s) => s.loadModels);
  const loadDiskUsage = useModelStore((s) => s.loadDiskUsage);
  const downloadModelAction = useModelStore((s) => s.downloadModel);
  const deleteModelAction = useModelStore((s) => s.deleteModel);

  const [showTokenInput, setShowTokenInput] = useState(false);
  const [hfToken, setHfToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = async (modelId: string) => {
    if (confirmDelete !== modelId) {
      setConfirmDelete(modelId);
      return;
    }
    setConfirmDelete(null);
    await deleteModelAction(modelId);
  };

  useEffect(() => {
    loadModels();
    loadDiskUsage();
  }, [loadModels, loadDiskUsage]);

  const handleDownload = (modelId: string) => {
    useModelStore.getState().clearDownloadError(modelId);
    downloadModelAction(modelId).catch((err) => {
      const msg = String(err);
      log.error("Download failed:", modelId, msg);
      if (msg.includes("AUTH_REQUIRED")) {
        setShowTokenInput(true);
      }
    });
  };

  const handleSaveToken = async () => {
    if (!hfToken.trim()) return;
    setSavingToken(true);
    try {
      await saveHfToken(hfToken.trim());
      log.info("HF token saved");
      setShowTokenInput(false);
      useModelStore.getState().clearAllDownloadErrors();
    } catch (err) {
      log.error("Failed to save token:", err);
    }
    setSavingToken(false);
  };

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
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await resetWizard();
                onClose();
                window.location.reload();
              }}
              className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
              title="Re-run Setup Wizard"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* HF Token input */}
        {showTokenInput && (
          <div className="mx-4 mt-4 bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2">
              <KeyRound size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-text-secondary">
                <p className="font-medium text-text-primary mb-1">HuggingFace authentication required</p>
                <p>
                  Some models require you to accept their license and provide an API token.{" "}
                  <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noopener"
                    className="text-accent hover:underline inline-flex items-center gap-0.5"
                  >
                    Get your token <ExternalLink size={10} />
                  </a>
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                placeholder="hf_..."
                className="flex-1 px-3 py-1.5 bg-bg-primary border border-border-default rounded-md text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={handleSaveToken}
                disabled={!hfToken.trim() || savingToken}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {savingToken ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

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
                error={downloadErrors.get(model.id)}
                onDownload={() => handleDownload(model.id)}
                onDelete={() => handleDelete(model.id)}
                onRevealFolder={() => revealModelFolder(model.id)}
                confirmingDelete={confirmDelete === model.id}
                onCancelDelete={() => setConfirmDelete(null)}
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
  error,
  onDownload,
  onDelete,
  onRevealFolder,
  confirmingDelete,
  onCancelDelete,
  licenseBadgeClass,
}: {
  model: ModelInfo;
  isDownloading: boolean;
  progress?: DownloadProgress;
  error?: string;
  onDownload: () => void;
  onDelete: () => void;
  onRevealFolder: () => void;
  confirmingDelete: boolean;
  onCancelDelete: () => void;
  licenseBadgeClass: string;
}) {
  const isDownloaded = model.status === "downloaded";
  const pct = progress && progress.total_bytes > 0
    ? Math.round((progress.bytes_downloaded / progress.total_bytes) * 100)
    : null;

  const errorDisplay = error
    ? error.replace(/^RPC error: (LICENSE_REQUIRED|AUTH_REQUIRED): /, "")
    : undefined;
  const isAuthError = error?.includes("AUTH_REQUIRED");

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
          {/* Error display */}
          {error && !isAuthError && (
            <p className="text-[10px] text-red-400 mt-1.5 flex items-center gap-1">
              <AlertCircle size={10} /> {errorDisplay}
            </p>
          )}
          {isAuthError && (
            <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
              <KeyRound size={10} /> Requires HuggingFace authentication — enter your token above
            </p>
          )}
        </div>

        <div className="flex-shrink-0">
          {isDownloading ? (
            <div className="w-36">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 size={12} className="text-accent animate-spin" />
                <span className="text-[10px] text-text-muted">
                  {pct !== null ? `${pct}%` : "Starting…"}
                </span>
              </div>
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full bg-accent rounded-full",
                    pct !== null ? "transition-all duration-1000" : "animate-pulse w-1/3"
                  )}
                  style={pct !== null ? { width: `${pct}%` } : undefined}
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
              {confirmingDelete ? (
                <>
                  <button
                    onClick={onDelete}
                    className="px-2 py-1 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-medium transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={onCancelDelete}
                    className="px-2 py-1 rounded-md hover:bg-bg-hover text-text-muted text-[10px] transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-success font-medium mr-1">
                    <Check size={12} className="inline" /> Installed
                  </span>
                  <button
                    onClick={onRevealFolder}
                    className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
                    title="Show in Finder"
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    onClick={onDelete}
                    className="p-1.5 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                    title="Delete model"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={onDownload}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5",
                error
                  ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20"
                  : "bg-accent hover:bg-accent-hover text-white",
              )}
            >
              {error ? (
                <><AlertCircle size={12} /> Retry</>
              ) : (
                <><Download size={12} /> Download</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
