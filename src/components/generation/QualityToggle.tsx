import { useGenerationStore } from "@/stores/generation";
import { useModelStore } from "@/stores/models";
import { QUALITY_PROFILES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Zap, Diamond, SlidersHorizontal } from "lucide-react";

export function QualityToggle() {
  const qualityProfile = useGenerationStore((s) => s.qualityProfile);
  const setQualityProfile = useGenerationStore((s) => s.setQualityProfile);
  const autoSelectModel = useModelStore((s) => s.autoSelectModel);

  const handleSelect = (profile: "fast" | "quality") => {
    setQualityProfile(profile);
    autoSelectModel(profile);
  };

  const profiles = [
    {
      ...QUALITY_PROFILES.fast,
      icon: <Zap size={14} />,
    },
    {
      ...QUALITY_PROFILES.quality,
      icon: <Diamond size={14} />,
    },
  ];

  return (
    <div className="flex gap-2">
      {profiles.map((profile) => (
        <button
          key={profile.id}
          onClick={() => handleSelect(profile.id as "fast" | "quality")}
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-2.5 px-3 rounded-lg border transition-all text-center",
            qualityProfile === profile.id
              ? "border-accent bg-accent-muted text-text-primary"
              : "border-border-default bg-bg-primary text-text-secondary hover:border-border-default hover:bg-bg-hover"
          )}
        >
          <div className="flex items-center gap-1.5">
            {profile.icon}
            <span className="text-xs font-medium">{profile.label}</span>
          </div>
          <span className="text-[10px] text-text-muted">
            {profile.description}
          </span>
        </button>
      ))}
      {qualityProfile === "custom" && (
        <div className="flex items-center gap-1 px-2 text-[10px] text-text-muted">
          <SlidersHorizontal size={10} />
          <span>Custom</span>
        </div>
      )}
    </div>
  );
}
