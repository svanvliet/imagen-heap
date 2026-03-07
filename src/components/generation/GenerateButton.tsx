import { useGenerationStore } from "@/stores/generation";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function GenerateButton() {
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const prompt = useGenerationStore((s) => s.prompt);
  const progress = useGenerationStore((s) => s.progress);

  const handleGenerate = () => {
    if (isGenerating || !prompt.trim()) return;
    // Generation will be wired to backend in M2
    console.log("[GenerateButton] Generate clicked", useGenerationStore.getState().getConfig());
  };

  const disabled = !prompt.trim() || isGenerating;

  return (
    <button
      id="generate-button"
      onClick={handleGenerate}
      disabled={disabled}
      className={cn(
        "w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2",
        disabled
          ? "bg-bg-tertiary text-text-muted cursor-not-allowed"
          : "bg-accent hover:bg-accent-hover text-white shadow-sm shadow-accent/20 active:scale-[0.98]"
      )}
    >
      {isGenerating ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {progress ? (
            <span>
              Step {progress.step}/{progress.totalSteps}
            </span>
          ) : (
            <span>Starting...</span>
          )}
        </>
      ) : (
        <>
          <Sparkles size={16} />
          <span>Generate</span>
        </>
      )}
    </button>
  );
}
