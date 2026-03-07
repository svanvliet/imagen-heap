import {
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Layers,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";

export function Toolbar() {
  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  return (
    <div className="h-12 border-b border-border-default bg-bg-secondary flex items-center px-3 gap-2 flex-shrink-0">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
        aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen size={18} />
        ) : (
          <PanelLeftClose size={18} />
        )}
      </button>

      {/* App title */}
      <div className="flex items-center gap-2 mr-4">
        <Sparkles size={18} className="text-accent" />
        <span className="text-sm font-semibold text-text-primary">
          Imagen Heap
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Mode toggle */}
      <div className="flex items-center bg-bg-primary rounded-lg p-0.5 gap-0.5">
        <button
          onClick={() => setMode("simple")}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-md transition-colors",
            mode === "simple"
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          Simple
        </button>
        <button
          onClick={() => setMode("advanced")}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1",
            mode === "advanced"
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          <Layers size={12} />
          Advanced
        </button>
      </div>

      {/* Settings */}
      <button
        className="p-1.5 rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors ml-2"
        aria-label="Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
}
