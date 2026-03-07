import { useGenerationStore } from "@/stores/generation";
import { STYLE_PRESETS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StylePresetGrid() {
  const stylePresetId = useGenerationStore((s) => s.stylePresetId);
  const setStylePresetId = useGenerationStore((s) => s.setStylePresetId);

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {/* None option */}
      <button
        onClick={() => setStylePresetId(null)}
        className={cn(
          "flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border transition-all",
          stylePresetId === null
            ? "border-accent bg-accent-muted"
            : "border-border-default bg-bg-primary hover:bg-bg-hover"
        )}
      >
        <span className="text-base leading-none">🚫</span>
        <span className="text-[10px] text-text-secondary font-medium leading-tight">
          None
        </span>
      </button>

      {STYLE_PRESETS.map((preset) => {
        const isSelected = stylePresetId === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => setStylePresetId(preset.id)}
            title={preset.description}
            className={cn(
              "group relative flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border transition-all",
              isSelected
                ? "border-accent bg-accent-muted ring-1 ring-accent/30"
                : "border-border-default hover:border-zinc-600 bg-bg-primary hover:bg-bg-hover"
            )}
          >
            {/* Gradient background that shows on hover or selection */}
            <div
              className={cn(
                "absolute inset-0 rounded-lg bg-gradient-to-br opacity-0 transition-opacity",
                preset.gradient,
                isSelected ? "opacity-100" : "group-hover:opacity-60"
              )}
            />

            <span className="relative text-base leading-none">{preset.icon}</span>
            <span className="relative text-[10px] text-text-secondary font-medium leading-tight">
              {preset.name}
            </span>

            {/* Selected checkmark */}
            {isSelected && (
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-accent flex items-center justify-center">
                <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
