import { PromptInput } from "@/components/generation/PromptInput";
import { QualityToggle } from "@/components/generation/QualityToggle";
import { AspectRatioSelector } from "@/components/generation/AspectRatioSelector";
import { GenerateButton } from "@/components/generation/GenerateButton";

export function Sidebar() {
  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Prompt */}
        <PromptInput />

        {/* Quality profile */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
            Quality
          </label>
          <QualityToggle />
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
            Aspect Ratio
          </label>
          <AspectRatioSelector />
        </div>
      </div>

      {/* Generate button pinned to bottom */}
      <div className="p-4 border-t border-border-default">
        <GenerateButton />
      </div>
    </div>
  );
}
