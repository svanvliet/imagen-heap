import { useGenerationStore } from "@/stores/generation";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { GenerationResult } from "@/types";

export function Filmstrip() {
  const history = useGenerationStore((s) => s.history);
  const currentImage = useGenerationStore((s) => s.currentImage);
  const selectHistoryItem = useGenerationStore((s) => s.selectHistoryItem);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: GenerationResult;
  } | null>(null);

  // Close context menu on click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  const handleSaveAs = useCallback(async (item: GenerationResult) => {
    const src = convertFileSrc(item.imagePath);
    const promptSlug = item.config.prompt.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "_");
    const a = document.createElement("a");
    a.href = src;
    a.download = `${promptSlug}_${item.config.seed}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleCopyToClipboard = useCallback(async (item: GenerationResult) => {
    try {
      const src = convertFileSrc(item.imagePath);
      const response = await fetch(src);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  if (history.length === 0) return null;

  return (
    <div className="h-20 border-t border-border-default bg-bg-secondary flex-shrink-0 px-3 py-2">
      <div className="flex gap-2 overflow-x-auto h-full items-center scrollbar-thin">
        {history.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectHistoryItem(index)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, item });
            }}
            className={cn(
              "h-14 w-14 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all hover:opacity-100",
              currentImage?.id === item.id
                ? "border-accent opacity-100"
                : "border-transparent opacity-70"
            )}
          >
            <img
              src={convertFileSrc(item.thumbnailPath)}
              alt={`Generation ${index + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Filmstrip context menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-bg-secondary border border-border-default rounded-lg shadow-xl py-1 min-w-[160px] animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleSaveAs(contextMenu.item)}
            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Save As…
          </button>
          <button
            onClick={() => handleCopyToClipboard(contextMenu.item)}
            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Copy to Clipboard
          </button>
          <div className="h-px bg-border-default my-1" />
          <button
            onClick={() => navigator.clipboard.writeText(contextMenu.item.config.prompt)}
            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Copy Prompt
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(String(contextMenu.item.config.seed))}
            className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Copy Seed
          </button>
        </div>
      )}
    </div>
  );
}
