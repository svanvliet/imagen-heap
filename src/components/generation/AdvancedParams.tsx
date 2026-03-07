import { useGenerationStore } from "@/stores/generation";
import { useState } from "react";
import { ChevronDown, Dice5, Lock, Unlock, Copy } from "lucide-react";
import { cn, randomSeed } from "@/lib/utils";

export function AdvancedParams() {
  const [open, setOpen] = useState(false);

  const steps = useGenerationStore((s) => s.steps);
  const cfg = useGenerationStore((s) => s.cfg);
  const seed = useGenerationStore((s) => s.seed);
  const seedLocked = useGenerationStore((s) => s.seedLocked);
  const negativePrompt = useGenerationStore((s) => s.negativePrompt);
  const isGenerating = useGenerationStore((s) => s.isGenerating);
  const setSteps = useGenerationStore((s) => s.setSteps);
  const setCfg = useGenerationStore((s) => s.setCfg);
  const setSeed = useGenerationStore((s) => s.setSeed);
  const setSeedLocked = useGenerationStore((s) => s.setSeedLocked);
  const setNegativePrompt = useGenerationStore((s) => s.setNegativePrompt);

  const [copied, setCopied] = useState(false);
  const copySeed = () => {
    navigator.clipboard.writeText(String(seed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="border border-border-default rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary uppercase tracking-wider hover:bg-bg-hover transition-colors"
      >
        <span>Advanced</span>
        <ChevronDown
          size={14}
          className={cn(
            "text-text-muted transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 space-y-3">
            {/* Steps */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[11px] text-text-muted">Steps</label>
                <span className="text-[11px] text-text-secondary font-mono">{steps}</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                disabled={isGenerating}
                className="w-full h-1.5 accent-accent bg-bg-tertiary rounded-full appearance-none cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Guidance Scale */}
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[11px] text-text-muted">Guidance (CFG)</label>
                <span className="text-[11px] text-text-secondary font-mono">{cfg.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={cfg}
                onChange={(e) => setCfg(Number(e.target.value))}
                disabled={isGenerating}
                className="w-full h-1.5 accent-accent bg-bg-tertiary rounded-full appearance-none cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Seed */}
            <div>
              <label className="text-[11px] text-text-muted mb-1 block">Seed</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) || 0)}
                  disabled={isGenerating}
                  className="flex-1 px-2 py-1 bg-bg-primary border border-border-default rounded-md text-xs text-text-primary font-mono focus:outline-none focus:border-accent disabled:opacity-50 min-w-0"
                />
                <button
                  onClick={() => setSeed(randomSeed())}
                  disabled={isGenerating}
                  className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
                  title="Randomize seed"
                >
                  <Dice5 size={14} />
                </button>
                <button
                  onClick={copySeed}
                  className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
                  title="Copy seed"
                >
                  {copied ? (
                    <span className="text-[10px] text-success">✓</span>
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
                <button
                  onClick={() => setSeedLocked(!seedLocked)}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    seedLocked
                      ? "bg-accent-muted text-accent"
                      : "hover:bg-bg-hover text-text-muted hover:text-text-secondary"
                  )}
                  title={seedLocked ? "Seed locked — same seed each generation" : "Seed unlocked — random seed each generation"}
                >
                  {seedLocked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
              </div>
            </div>

            {/* Negative Prompt */}
            <div>
              <label className="text-[11px] text-text-muted mb-1 block">Negative Prompt</label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                disabled={isGenerating}
                placeholder="Things to avoid..."
                rows={2}
                className="w-full bg-bg-primary border border-border-default rounded-md px-2 py-1.5 text-xs text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
