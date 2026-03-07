/**
 * CharacterStrengthControl — identity strength slider shown when a character is selected.
 * Simple mode: 3 presets (Subtle/Balanced/Strong)
 * Shows selected character name + reference image count.
 */
import { useCharacterStore } from "@/stores/characters";
import { cn } from "@/lib/utils";

const STRENGTH_PRESETS = [
  { label: "Subtle", value: 0.3 },
  { label: "Balanced", value: 0.6 },
  { label: "Strong", value: 0.9 },
] as const;

export function CharacterStrengthControl() {
  const selectedId = useCharacterStore((s) => s.selectedCharacterId);
  const characters = useCharacterStore((s) => s.characters);
  const strength = useCharacterStore((s) => s.characterStrength);
  const setStrength = useCharacterStore((s) => s.setCharacterStrength);

  if (!selectedId) return null;

  const character = characters.find((c) => c.id === selectedId);
  if (!character) return null;

  const closestPreset = STRENGTH_PRESETS.reduce((prev, curr) =>
    Math.abs(curr.value - strength) < Math.abs(prev.value - strength)
      ? curr
      : prev,
  );

  return (
    <div className="space-y-2">
      {/* Character info */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {character.reference_images.length} reference{" "}
          {character.reference_images.length === 1 ? "image" : "images"}
        </span>
        <span className="text-[10px] text-text-secondary/60 uppercase tracking-wider">
          {character.adapter_type}
        </span>
      </div>

      {/* Strength presets */}
      <div className="flex gap-1">
        {STRENGTH_PRESETS.map((preset) => {
          const isActive = closestPreset.value === preset.value;
          return (
            <button
              key={preset.label}
              onClick={() => setStrength(preset.value)}
              className={cn(
                "flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all",
                isActive
                  ? "bg-accent text-white"
                  : "bg-bg-primary text-text-secondary hover:bg-bg-hover hover:text-text-primary border border-border-default",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Fine-tune slider */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(strength * 100)}
          onChange={(e) => setStrength(Number(e.target.value) / 100)}
          className="flex-1 h-1 accent-indigo-500"
        />
        <span className="text-[10px] text-text-secondary w-8 text-right tabular-nums">
          {Math.round(strength * 100)}%
        </span>
      </div>
    </div>
  );
}
