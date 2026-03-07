import { useState, useEffect } from "react";
import { useModelStore } from "@/stores/models";
import { getDefaultDownloads } from "@/lib/tauri";
import { Sparkles, FolderOpen, Download, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";

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
  const [downloadStatus, setDownloadStatus] = useState<Record<string, "pending" | "downloading" | "done">>({});
  const downloadModelAction = useModelStore((s) => s.downloadModel);

  useEffect(() => {
    getDefaultDownloads().then((models) => {
      setDefaults(models as DefaultModel[]);
      const status: Record<string, "pending" | "downloading" | "done"> = {};
      for (const m of models as DefaultModel[]) {
        status[m.id] = m.already_downloaded ? "done" : "pending";
      }
      setDownloadStatus(status);
    });
  }, []);

  const totalSize = defaults
    .filter((m) => downloadStatus[m.id] !== "done")
    .reduce((sum, m) => sum + m.file_size_bytes, 0);

  const allDone = defaults.length > 0 && defaults.every((m) => downloadStatus[m.id] === "done");

  const handleDownloadAll = async () => {
    for (const model of defaults) {
      if (downloadStatus[model.id] === "done") continue;
      setDownloadStatus((prev) => ({ ...prev, [model.id]: "downloading" }));
      try {
        await downloadModelAction(model.id);
        setDownloadStatus((prev) => ({ ...prev, [model.id]: "done" }));
      } catch {
        setDownloadStatus((prev) => ({ ...prev, [model.id]: "pending" }));
      }
    }
    setStep("complete");
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
                    <p className="text-xs mt-0.5">~/Documents/ImagenHeap/</p>
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
                  We'll download the default model set so you can start creating right away.
                </p>
              </div>

              <div className="space-y-2">
                {defaults.map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center gap-3 bg-bg-primary rounded-lg px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {model.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted uppercase">
                          {model.quantization}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted">
                        {formatBytes(model.file_size_bytes)}
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      {downloadStatus[model.id] === "done" ? (
                        <Check size={18} className="text-success" />
                      ) : downloadStatus[model.id] === "downloading" ? (
                        <Loader2 size={18} className="text-accent animate-spin" />
                      ) : (
                        <Download size={18} className="text-text-muted" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!allDone && (
                <p className="text-xs text-text-muted text-center">
                  Total download: ~{formatBytes(totalSize)}
                </p>
              )}

              <button
                onClick={allDone ? () => setStep("complete") : handleDownloadAll}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                {allDone ? (
                  "Continue"
                ) : (
                  <>
                    <Download size={16} />
                    Download All
                  </>
                )}
              </button>
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
                  Models are downloaded and ready. Start creating by typing a prompt.
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
