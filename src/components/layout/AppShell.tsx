import { useUIStore } from "@/stores/ui";
import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { Panel } from "./Panel";
import { Canvas } from "./Canvas";
import { Filmstrip } from "./Filmstrip";
import { StatusBar } from "./StatusBar";
import { cn } from "@/lib/utils";

export function AppShell() {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const panelCollapsed = useUIStore((s) => s.panelCollapsed);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-primary">
      <Toolbar />

      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <div
          className={cn(
            "border-r border-border-default transition-all duration-200 flex-shrink-0",
            sidebarCollapsed ? "w-0 overflow-hidden" : "w-80"
          )}
        >
          <Sidebar />
        </div>

        {/* Center: Canvas + Filmstrip */}
        <div className="flex flex-col flex-1 min-w-0">
          <Canvas />
          <Filmstrip />
        </div>

        {/* Right Panel */}
        <div
          className={cn(
            "border-l border-border-default transition-all duration-200 flex-shrink-0",
            panelCollapsed ? "w-0 overflow-hidden" : "w-80"
          )}
        >
          <Panel />
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
