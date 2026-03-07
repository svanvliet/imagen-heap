import { useGenerationStore } from "@/stores/generation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";

export function Canvas() {
  const currentImage = useGenerationStore((s) => s.currentImage);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const progress = useGenerationStore((s) => s.progress);

  // Convert local file path to an asset URL Tauri's webview can load
  const imageSrc = currentImage?.imagePath
    ? convertFileSrc(currentImage.imagePath)
    : null;

  return (
    <div className="flex-1 flex items-center justify-center bg-bg-primary p-6 min-h-0">
      {isGenerating && progress ? (
        /* Generation in progress */
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-64">
            <div className="flex justify-between text-xs text-text-secondary mb-1.5">
              <span>Generating...</span>
              <span>
                Step {progress.step}/{progress.totalSteps}
              </span>
            </div>
            <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.step / progress.totalSteps) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      ) : currentImage && imageSrc ? (
        /* Display generated image */
        <div className="animate-fade-in max-h-full max-w-full">
          <img
            src={imageSrc}
            alt="Generated image"
            className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
          />
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-text-muted">
            <span>Seed: {currentImage.config.seed}</span>
            <span>•</span>
            <span>{currentImage.generationTimeMs}ms</span>
            <span>•</span>
            <span>{currentImage.config.width}×{currentImage.config.height}</span>
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={cn(
              "w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center",
              isGenerating && "animate-pulse-subtle"
            )}
          >
            <Sparkles size={28} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              Ready to create
            </p>
            <p className="text-xs text-text-muted mt-1">
              Type a prompt and hit Generate to get started
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
