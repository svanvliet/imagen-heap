import { useGenerationStore } from "@/stores/generation";
import { useRef, useCallback } from "react";

export function PromptInput() {
  const prompt = useGenerationStore((s) => s.prompt);
  const setPrompt = useGenerationStore((s) => s.setPrompt);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
      // Auto-resize
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    },
    [setPrompt]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        // Generate will be triggered by the Generate button's keyboard shortcut handler
        document.getElementById("generate-button")?.click();
      }
    },
    []
  );

  return (
    <div>
      <label
        htmlFor="prompt-input"
        className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block"
      >
        Prompt
      </label>
      <textarea
        ref={textareaRef}
        id="prompt-input"
        value={prompt}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={isGenerating}
        placeholder="Describe what you want to create..."
        rows={3}
        className="w-full bg-bg-primary border border-border-default rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors disabled:opacity-50"
      />
      <div className="flex justify-end mt-1">
        <span className="text-[10px] text-text-muted">
          {prompt.length > 0 ? `${prompt.length} chars` : "⌘Enter to generate"}
        </span>
      </div>
    </div>
  );
}
