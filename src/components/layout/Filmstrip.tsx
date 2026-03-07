import { useGenerationStore } from "@/stores/generation";
import { cn } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";

export function Filmstrip() {
  const history = useGenerationStore((s) => s.history);
  const currentImage = useGenerationStore((s) => s.currentImage);
  const selectHistoryItem = useGenerationStore((s) => s.selectHistoryItem);

  if (history.length === 0) return null;

  return (
    <div className="h-20 border-t border-border-default bg-bg-secondary flex-shrink-0 px-3 py-2">
      <div className="flex gap-2 overflow-x-auto h-full items-center scrollbar-thin">
        {history.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectHistoryItem(index)}
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
    </div>
  );
}
