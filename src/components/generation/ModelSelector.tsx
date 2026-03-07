import { useModelStore } from "@/stores/models";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { ChevronDown, Box, AlertCircle } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function ModelSelector() {
  const models = useModelStore((s) => s.models);
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModel = useModelStore((s) => s.setSelectedModel);
  const setShowModelManager = useUIStore((s) => s.setShowModelManager);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const downloaded = models.filter((m) => m.status === "downloaded");
  const selected = models.find((m) => m.id === selectedModelId);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (downloaded.length === 0) {
    return (
      <button
        onClick={() => setShowModelManager(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
      >
        <AlertCircle size={14} />
        <span>No models downloaded</span>
        <span className="ml-auto text-[10px] underline">Get models</span>
      </button>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors",
          open
            ? "border-accent bg-accent-muted"
            : "border-border-default bg-bg-primary hover:border-border-default hover:bg-bg-hover"
        )}
      >
        <Box size={14} className="text-text-muted flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-text-primary truncate block">
            {selected?.name || "Select model"}
          </span>
          {selected && (
            <span className="text-[10px] text-text-muted">
              {selected.quantization} · {selected.architecture}
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-text-muted transition-transform flex-shrink-0",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-bg-secondary border border-border-default rounded-lg shadow-xl overflow-hidden animate-fade-in">
          {downloaded.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                setSelectedModel(model.id);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors",
                model.id === selectedModelId
                  ? "bg-accent-muted"
                  : "hover:bg-bg-hover"
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-text-primary truncate">
                    {model.name}
                  </span>
                  <span className="text-[9px] px-1 py-0.5 bg-bg-tertiary rounded text-text-muted uppercase font-medium flex-shrink-0">
                    {model.quantization}
                  </span>
                </div>
              </div>
              {model.id === selectedModelId && (
                <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              )}
            </button>
          ))}
          <div className="border-t border-border-default">
            <button
              onClick={() => {
                setOpen(false);
                setShowModelManager(true);
              }}
              className="w-full px-3 py-2 text-[11px] text-accent hover:bg-bg-hover text-left transition-colors"
            >
              Manage models…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
