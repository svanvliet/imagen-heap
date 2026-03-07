import { useGenerationStore } from "@/stores/generation";
import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, Save, Copy, X, Hash, Clock, Maximize2 } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";

function ElapsedTimer() {
  const startTime = useGenerationStore((s) => s.generationStartTime);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 100);
    return () => clearInterval(id);
  }, [startTime]);

  return <span>{formatDuration(elapsed)}</span>;
}

export function Canvas() {
  const currentImage = useGenerationStore((s) => s.currentImage);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const progress = useGenerationStore((s) => s.progress);
  const setGenerating = useGenerationStore((s) => s.setGenerating);
  const setProgress = useGenerationStore((s) => s.setProgress);

  const [copied, setCopied] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Convert local file path to an asset URL Tauri's webview can load
  const imageSrc = currentImage?.imagePath
    ? convertFileSrc(currentImage.imagePath)
    : null;

  // Live preview from generation progress
  const previewSrc = progress?.previewBase64
    ? `data:image/png;base64,${progress.previewBase64}`
    : null;

  const handleSaveAs = useCallback(async () => {
    if (!currentImage || !imageSrc) return;
    // Use a download link approach — works in Tauri WebView
    const a = document.createElement("a");
    a.href = imageSrc;
    const promptSlug = currentImage.config.prompt.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${promptSlug}_${currentImage.config.seed}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [currentImage, imageSrc]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!imageSrc) return;
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  }, [imageSrc]);

  const handleCopyPrompt = useCallback(() => {
    if (!currentImage) return;
    navigator.clipboard.writeText(currentImage.config.prompt);
  }, [currentImage]);

  const handleCopySeed = useCallback(() => {
    if (!currentImage) return;
    navigator.clipboard.writeText(String(currentImage.config.seed));
  }, [currentImage]);

  // Context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!currentImage) return;
      e.preventDefault();
      setShowContextMenu({ x: e.clientX, y: e.clientY });
    },
    [currentImage]
  );

  // Close context menu on click outside
  useEffect(() => {
    if (!showContextMenu) return;
    const handler = () => setShowContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showContextMenu]);

  return (
    <div
      ref={canvasRef}
      className="flex-1 flex flex-col items-center justify-center bg-bg-primary p-6 min-h-0 relative"
      onContextMenu={handleContextMenu}
    >
      {isGenerating ? (
        /* Generation in progress — show live preview or progress */
        <div className="flex flex-col items-center gap-4 animate-fade-in relative">
          {previewSrc ? (
            <div className="relative">
              <img
                src={previewSrc}
                alt="Generation preview"
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg opacity-90 transition-opacity duration-300"
              />
              {/* Generating overlay pill */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-bg-primary/80 backdrop-blur-sm rounded-full px-4 py-1.5 flex items-center gap-3 border border-border-default shadow-lg">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-xs text-text-primary">
                  Step {progress?.step ?? 0}/{progress?.totalSteps ?? "?"}
                </span>
                <span className="text-xs text-text-muted">
                  <ElapsedTimer />
                </span>
                <button
                  onClick={() => { setGenerating(false); setProgress(null); }}
                  className="p-0.5 rounded-full hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
                  title="Cancel generation"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ) : (
            /* No preview yet — show progress bar */
            <div className="flex flex-col items-center gap-4">
              <div
                className={cn(
                  "w-16 h-16 rounded-2xl bg-accent-muted flex items-center justify-center animate-pulse"
                )}
              >
                <Sparkles size={28} className="text-accent" />
              </div>
              <div className="w-64">
                <div className="flex justify-between text-xs text-text-secondary mb-1.5">
                  <span>Generating…</span>
                  <span>
                    {progress
                      ? `Step ${progress.step}/${progress.totalSteps}`
                      : "Starting…"}
                  </span>
                </div>
                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full bg-accent rounded-full transition-all duration-500",
                      !progress && "animate-pulse w-1/3"
                    )}
                    style={
                      progress
                        ? {
                            width: `${(progress.step / progress.totalSteps) * 100}%`,
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="text-center mt-2 text-xs text-text-muted">
                  <ElapsedTimer />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : currentImage && imageSrc ? (
        /* Display generated image with toolbar */
        <div className="animate-fade-in max-h-full max-w-full flex flex-col items-center">
          <div className="relative group">
            <img
              src={imageSrc}
              alt="Generated image"
              className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
            />
            {/* Canvas toolbar — appears on hover */}
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={handleSaveAs}
                className="p-1.5 rounded-md bg-bg-primary/80 backdrop-blur-sm border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors"
                title="Save As…"
              >
                <Save size={14} />
              </button>
              <button
                onClick={handleCopyToClipboard}
                className="p-1.5 rounded-md bg-bg-primary/80 backdrop-blur-sm border border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-primary transition-colors"
                title={copied ? "Copied!" : "Copy to Clipboard"}
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
          {/* Metadata below image */}
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-text-muted">
            <button
              onClick={handleCopySeed}
              className="flex items-center gap-1 hover:text-text-secondary transition-colors"
              title="Click to copy seed"
            >
              <Hash size={10} />
              {currentImage.config.seed}
            </button>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatDuration(currentImage.generationTimeMs / 1000)}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Maximize2 size={10} />
              {currentImage.config.width}×{currentImage.config.height}
            </span>
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

      {/* Right-click context menu */}
      {showContextMenu && currentImage && (
        <div
          className="fixed z-[100] bg-bg-secondary border border-border-default rounded-lg shadow-xl py-1 min-w-[160px] animate-fade-in"
          style={{ left: showContextMenu.x, top: showContextMenu.y }}
        >
          <ContextMenuItem label="Save As…" onClick={handleSaveAs} />
          <ContextMenuItem label={copied ? "Copied!" : "Copy to Clipboard"} onClick={handleCopyToClipboard} />
          <div className="h-px bg-border-default my-1" />
          <ContextMenuItem label="Copy Prompt" onClick={handleCopyPrompt} />
          <ContextMenuItem label="Copy Seed" onClick={handleCopySeed} />
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
    >
      {label}
    </button>
  );
}
