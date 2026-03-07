import { useState, useEffect } from "react";
import { useModelStore } from "@/stores/models";
import { getDefaultDownloads, saveHfToken } from "@/lib/tauri";
import { Sparkles, FolderOpen, Download, Check, Loader2, AlertCircle, KeyRound, ExternalLink } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("FirstRunWizard");

type WizardStep = "welcome" | "download" | "complete";

interface DefaultModel {
  id: string;
  name: string;
  file_size_bytes: number;
  quantization: string;
  already_downloaded: boolean;
}

interface FirstRunWizardProps {
  onComplete: () => void;
}

export function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [defaults, setDefaults] = useState<DefaultModel[]>([]);
  const [downloadStatus, setDownloadStatus] = useState<Record<string, "pending" | "downloading" | "done" | "error">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [hfToken, setHfToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const downloadModelAction = useModelStore((s) => s.downloadModel);
  const downloadProgress = useModelStore((s) => s.downloadProgress);

  useEffect(() => {
    getDefaultDownloads().then((models) => {
      setDefaults(models as DefaultModel[]);
      const status: Record<string, "pending" | "downloading" | "done" | "error"> = {};
      for (const m of models as DefaultModel[]) {
        status[m.id] = m.already_downloaded ? "done" : "pending";
      }
      setDownloadStatus(status);
    });
  }, []);

  const anyDownloaded = defaults.some((m) => downloadStatus[m.id] === "done");
  const anyDownloading = defaults.some((m) => downloadStatus[m.id] === "downloading");
  const allDone = defaults.length > 0 && defaults.every((m) => downloadStatus[m.id] === "done");

  const handleDownloadOne = async (modelId: string) => {
    setDownloadStatus((prev) => ({ ...prev, [modelId]: "downloading" }));
    setErrors((prev) => { const next = { ...prev }; delete next[modelId]; return next; });
    try {
      await downloadModelAction(modelId);
      setDownloadStatus((prev) => ({ ...prev, [modelId]: "done" }));
    } catch (err) {
      const msg = String(err);
      log.error("Download failed:", modelId, msg);
      setDownloadStatus((prev) => ({ ...prev, [modelId]: "error" }));
      if (msg.includes("AUTH_REQUIRED")) {
        setErrors((prev) => ({ ...prev, [modelId]: "auth_required" }));
        setShowTokenInput(true);
      } else {
        setErrors((prev) => ({ ...prev, [modelId]: msg }));
      }
    }
  };

  const handleDownloadAll = async () => {
    for (const model of defaults) {
      if (downloadStatus[model.id] === "done") continue;
      await handleDownloadOne(model.id);
    }
  };

  const handleSaveToken = async () => {
    if (!hfToken.trim()) return;
    setSavingToken(true);
    try {
      await saveHfToken(hfToken.trim());
      log.info("HF token saved");
      setShowTokenInput(false);
      // Clear auth errors and retry
      setErrors({});
    } catch (err) {
      log.error("Failed to save token:", err);
    }
    setSavingToken(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary/95 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[520px] bg-bg-secondary rounded-2xl border border-border-default shadow-2xl overflow-hidden animate-fade-in">
        {/* Step indicator */}
        <div className="flex gap-1.5 px-8 pt-6">
          {(["welcome", "download", "complete"] as WizardStep[]).map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= ["welcome", "download", "complete"].indexOf(step)
                  ? "bg-accent"
                  : "bg-bg-tertiary"
              )}
            />
          ))}
        </div>

        <div className="p-8">
          {step === "welcome" && (
            <div className="text-center space-y-6 animate-fade-in">
              <div className="w-20 h-20 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto">
                <Sparkles size={36} className="text-accent" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">Welcome to Imagen Heap</h1>
                <p className="text-sm text-text-secondary mt-2">
                  Local-first AI image creation with character consistency and pose control.
                </p>
              </div>
              <div className="bg-bg-primary rounded-lg p-4 text-left">
                <div className="flex items-center gap-3 text-sm text-text-secondary">
                  <FolderOpen size={18} className="text-text-muted flex-shrink-0" />
                  <div>
                    <p className="font-medium text-text-primary">Storage</p>
                    <p className="text-xs mt-0.5">~/.imagen-heap/</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep("download")}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors"
              >
                Let's get started
              </button>
            </div>
          )}

          {step === "download" && (
            <div className="space-y-5 animate-fade-in">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Download Models</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Download a model to start generating images. You can add more later from the Model Manager.
                </p>
              </div>

              {/* HF Token input — shown when gated repo auth is needed */}
              {showTokenInput && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <KeyRound size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-text-secondary">
                      <p className="font-medium text-text-primary mb-1">HuggingFace authentication required</p>
                      <p>
                        This model requires you to accept its license on HuggingFace and provide an API token.{" "}
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

              <div className="space-y-2">
                {defaults.map((model) => {
                  const status = downloadStatus[model.id];
                  const error = errors[model.id];
                  const progress = downloadProgress.get(model.id);

                  return (
                    <div key={model.id} className="bg-bg-primary rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary truncate">{model.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted uppercase">
                              {model.quantization}
                            </span>
                          </div>
                          <span className="text-xs text-text-muted">{formatBytes(model.file_size_bytes)}</span>
                        </div>
                        <div className="flex-shrink-0">
                          {status === "done" ? (
                            <Check size={18} className="text-success" />
                          ) : status === "downloading" ? (
                            <Loader2 size={18} className="text-accent animate-spin" />
                          ) : status === "error" ? (
                            <button
                              onClick={() => handleDownloadOne(model.id)}
                              className="p-1.5 rounded-md hover:bg-bg-hover"
                              title="Retry download"
                            >
                              <AlertCircle size={18} className="text-red-400" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDownloadOne(model.id)}
                              disabled={anyDownloading}
                              className="px-2.5 py-1 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                              <Download size={12} />
                              Download
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Download progress bar */}
                      {status === "downloading" && progress && progress.total_bytes > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-300"
                              style={{ width: `${Math.round((progress.bytes_downloaded / progress.total_bytes) * 100)}%` }}
                            />
                          </div>
                          <p className="text-[9px] text-text-muted mt-0.5">
                            {formatBytes(progress.bytes_downloaded)} / {formatBytes(progress.total_bytes)}
                          </p>
                        </div>
                      )}

                      {/* Error message */}
                      {error && error !== "auth_required" && (
                        <p className="text-[10px] text-red-400 mt-1 line-clamp-2">{error}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                {!allDone && !anyDownloading && (
                  <button
                    onClick={handleDownloadAll}
                    className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={16} />
                    Download All
                  </button>
                )}
                <button
                  onClick={() => anyDownloaded || allDone ? setStep("complete") : onComplete()}
                  disabled={anyDownloading}
                  className={cn(
                    "py-2.5 rounded-lg font-medium text-sm transition-colors",
                    allDone
                      ? "flex-1 bg-accent hover:bg-accent-hover text-white"
                      : "flex-1 bg-bg-primary hover:bg-bg-hover text-text-secondary border border-border-default",
                    anyDownloading && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {allDone ? "Continue" : anyDownloaded ? "Continue anyway" : "Skip for now"}
                </button>
              </div>
            </div>
          )}

          {step === "complete" && (
            <div className="text-center space-y-6 animate-fade-in">
              <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                <Check size={36} className="text-success" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">You're all set!</h2>
                <p className="text-sm text-text-secondary mt-2">
                  {anyDownloaded
                    ? "Models are downloaded and ready. Start creating by typing a prompt."
                    : "You can download models anytime from the Model Manager in the toolbar."}
                </p>
              </div>
              <button
                onClick={onComplete}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors"
              >
                Start Creating ✨
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
