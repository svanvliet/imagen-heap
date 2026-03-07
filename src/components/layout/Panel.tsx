import { useUIStore } from "@/stores/ui";

export function Panel() {
  const mode = useUIStore((s) => s.mode);

  if (mode === "simple") {
    return (
      <div className="flex flex-col h-full bg-bg-secondary p-4">
        <p className="text-xs text-text-muted">
          Switch to Advanced mode to access character, pose, and ControlNet controls.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="p-4">
        <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-3">
          Advanced Controls
        </h3>
        <p className="text-xs text-text-muted">
          Character, pose, and ControlNet controls will be available here.
        </p>
      </div>
    </div>
  );
}
