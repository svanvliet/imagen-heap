import { useGenerationStore } from "@/stores/generation";
import { QUALITY_PROFILES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Zap, Diamond } from "lucide-react";

export function QualityToggle() {
  const qualityProfile = useGenerationStore((s) => s.qualityProfile);
  const setQualityProfile = useGenerationStore((s) => s.setQualityProfile);

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
          onClick={() =>
            setQualityProfile(profile.id as "fast" | "quality")
          }
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
    </div>
  );
}
