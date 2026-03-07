import { useGenerationStore } from "@/stores/generation";
import { ASPECT_RATIOS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AspectRatioSelector() {
  const aspectRatio = useGenerationStore((s) => s.aspectRatio);
  const setAspectRatio = useGenerationStore((s) => s.setAspectRatio);

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ASPECT_RATIOS.map((ratio) => {
        // Calculate proportional rectangle for visual indicator
        const maxSize = 20;
        const aspect = ratio.width / ratio.height;
        const w = aspect >= 1 ? maxSize : Math.round(maxSize * aspect);
        const h = aspect >= 1 ? Math.round(maxSize / aspect) : maxSize;

        return (
          <button
            key={ratio.id}
            onClick={() => setAspectRatio(ratio.id)}
            className={cn(
              "flex flex-col items-center gap-1 py-2 rounded-md border transition-all",
              aspectRatio.id === ratio.id
                ? "border-accent bg-accent-muted"
                : "border-border-default bg-bg-primary hover:bg-bg-hover"
            )}
          >
            <div
              className={cn(
                "rounded-sm",
                aspectRatio.id === ratio.id ? "bg-accent" : "bg-text-muted"
              )}
              style={{ width: `${w}px`, height: `${h}px` }}
            />
            <span className="text-[10px] text-text-secondary font-medium">
              {ratio.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
