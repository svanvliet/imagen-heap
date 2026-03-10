import { useGenerationStore } from "@/stores/generation";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Sparkles } from "lucide-react";
import type { GenerationResult } from "@/types";

export function Filmstrip() {
  const history = useGenerationStore((s) => s.history);
  const currentImage = useGenerationStore((s) => s.currentImage);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const viewingProgress = useGenerationStore((s) => s.viewingProgress);
  const selectHistoryItem = useGenerationStore((s) => s.selectHistoryItem);
  const deleteHistoryItem = useGenerationStore((s) => s.deleteHistoryItem);
  const setViewingProgress = useGenerationStore((s) => s.setViewingProgress);
  const cancelGeneration = useGenerationStore((s) => s.cancelGeneration);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: GenerationResult | null;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust menu position to stay within viewport
  useEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = contextMenu;
    if (rect.bottom > vh) y = contextMenu.y - rect.height;
    if (rect.right > vw) x = vw - rect.width - 8;
    if (x !== contextMenu.x || y !== contextMenu.y) {
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    }
  }, [contextMenu]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-context-menu]")) return;
      setContextMenu(null);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
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

  if (history.length === 0 && !isGenerating) return null;

  return (
    <div className="h-20 border-t border-border-default bg-bg-secondary flex-shrink-0 px-3 py-2">
      <div className="flex gap-2 overflow-x-auto h-full items-center scrollbar-thin">
        {/* Generating placeholder */}
        {isGenerating && (
          <button
            onClick={() => setViewingProgress(true)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, item: null });
            }}
            className={cn(
              "h-14 w-14 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all",
              viewingProgress
                ? "border-accent opacity-100"
                : "border-transparent opacity-70 hover:opacity-100"
            )}
          >
            <div className="w-full h-full bg-gradient-to-br from-accent/30 to-indigo-500/30 animate-pulse flex items-center justify-center">
              <Sparkles size={16} className="text-accent" />
            </div>
          </button>
        )}
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
              currentImage?.id === item.id && !viewingProgress
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
          ref={menuRef}
          data-context-menu
          className="fixed z-[100] bg-bg-secondary border border-border-default rounded-lg shadow-xl py-1 min-w-[160px] animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.item ? (
            <>
              <button
                onClick={() => { handleSaveAs(contextMenu.item!); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Save As…
              </button>
              <button
                onClick={() => { handleCopyToClipboard(contextMenu.item!); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Copy to Clipboard
              </button>
              <div className="h-px bg-border-default my-1" />
              <button
                onClick={() => { navigator.clipboard.writeText(contextMenu.item!.config.prompt); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Copy Prompt
              </button>
              <button
                onClick={() => { navigator.clipboard.writeText(String(contextMenu.item!.config.seed)); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                Copy Seed
              </button>
              <div className="h-px bg-border-default my-1" />
              <button
                onClick={() => { deleteHistoryItem(contextMenu.item!.id); setContextMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            </>
          ) : (
            <button
              onClick={() => { cancelGeneration(); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              Cancel Generation
            </button>
          )}
        </div>
      )}
    </div>
  );
}
