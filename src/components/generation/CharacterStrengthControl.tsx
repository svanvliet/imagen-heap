/**
 * CharacterStrengthControl — identity strength slider shown when a character is selected.
 * Simple mode: 3 presets (Subtle/Balanced/Strong)
 * Shows selected character name + reference image count.
 * Warns if selected model doesn't support character mode (requires dev).
 * Shows inline adapter download prompt if the required adapter is not installed.
 */
import { useCharacterStore } from "@/stores/characters";
import { useModelStore } from "@/stores/models";
import { useAdapterStore } from "@/stores/adapters";
import { formatBytes, cn } from "@/lib/utils";
import { AlertTriangle, Download, Loader2, Check } from "lucide-react";
import { createLogger } from "@/lib/logger";

const log = createLogger("CharacterStrengthControl");

const STRENGTH_PRESETS = [
  { label: "Subtle", value: 0.3 },
  { label: "Balanced", value: 0.6 },
  { label: "Strong", value: 0.9 },
] as const;

const REDUX_COMPATIBLE_PREFIXES = ["flux-dev"];

/** Map adapter_type to the adapter IDs it requires */
function getRequiredAdapterIds(adapterType: string): string[] {
  switch (adapterType) {
    case "faceid":
      return ["sdxl-base-1.0", "ip-adapter-faceid-plusv2-sdxl", "insightface-buffalo-l"];
    case "ip-adapter":
      return ["flux-ip-adapter-v2", "clip-vit-large-patch14"];
    case "redux":
      return ["flux-redux-dev"];
    case "auto":
    default:
      return ["flux-redux-dev"]; // auto defaults to Redux
  }
}

/** Human-friendly name for the adapter type */
function adapterLabel(adapterType: string): string {
  switch (adapterType) {
    case "faceid": return "FaceID adapter";
    case "ip-adapter": return "IP-Adapter";
    case "redux": return "Redux adapter";
    default: return "Redux adapter";
  }
}

export function CharacterStrengthControl() {
  const selectedId = useCharacterStore((s) => s.selectedCharacterId);
  const characters = useCharacterStore((s) => s.characters);
  const strength = useCharacterStore((s) => s.characterStrength);
  const setStrength = useCharacterStore((s) => s.setCharacterStrength);
  const selectedModelId = useModelStore((s) => s.selectedModelId);

  const adapters = useAdapterStore((s) => s.adapters);
  const adaptersLoading = useAdapterStore((s) => s.isLoading);
  const downloadingAdapters = useAdapterStore((s) => s.downloadingAdapters);
  const adapterProgress = useAdapterStore((s) => s.downloadProgress);
  const adapterErrors = useAdapterStore((s) => s.downloadErrors);
  const downloadAdapterAction = useAdapterStore((s) => s.downloadAdapter);

  if (!selectedId) return null;

  const character = characters.find((c) => c.id === selectedId);
  if (!character) return null;

  const isModelCompatible = selectedModelId
    ? REDUX_COMPATIBLE_PREFIXES.some((p) => selectedModelId.startsWith(p))
    : false;

  // Determine which adapters are needed and which are missing
  const effectiveType = character.adapter_type ?? "auto";
  const requiredIds = getRequiredAdapterIds(effectiveType);
  const missingAdapterIds = requiredIds.filter(
    (id) => !adapters.some((a) => a.id === id && a.status === "downloaded"),
  );
  const allAdaptersReady = missingAdapterIds.length === 0;
  // The primary adapter to prompt for download (first missing one)
  const primaryMissing = missingAdapterIds[0] ?? null;
  const primaryMissingInfo = primaryMissing
    ? adapters.find((a) => a.id === primaryMissing)
    : null;

  const isDownloading = primaryMissing ? downloadingAdapters.has(primaryMissing) : false;
  const dlProgress = primaryMissing ? adapterProgress.get(primaryMissing) : undefined;
  const dlError = primaryMissing ? adapterErrors.get(primaryMissing) : undefined;
  const dlPct = dlProgress && dlProgress.total_bytes > 0
    ? Math.round((dlProgress.bytes_downloaded / dlProgress.total_bytes) * 100)
    : null;

  const handleDownload = () => {
    if (!primaryMissing) return;
    useAdapterStore.getState().clearDownloadError(primaryMissing);
    downloadAdapterAction(primaryMissing).catch((err) => {
      log.error("Adapter download failed:", err);
    });
  };

  const closestPreset = STRENGTH_PRESETS.reduce((prev, curr) =>
    Math.abs(curr.value - strength) < Math.abs(prev.value - strength)
      ? curr
      : prev,
  );

  const friendlyLabel = adapterLabel(effectiveType);
  const sizeLabel = primaryMissingInfo
    ? ` (~${formatBytes(primaryMissingInfo.file_size_bytes)})`
    : "";

  return (
    <div className="space-y-2 mt-2">
      {/* Adapter download prompt — only show after adapters have loaded */}
      {!adaptersLoading && adapters.length > 0 && !allAdaptersReady && !isDownloading && (
        <div className="px-2.5 py-2 bg-accent/5 border border-accent/20 rounded-md space-y-2">
          <p className="text-[10px] text-text-secondary leading-tight">
            Character generation requires the <span className="text-text-primary font-medium">{friendlyLabel}</span>{sizeLabel}.
          </p>
          {dlError ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-amber-400 leading-tight">
                {dlError.includes("LICENSE_REQUIRED") ? (
                  <>
                    Accept the license at{" "}
                    <a
                      href={primaryMissingInfo?.source_url ?? `https://huggingface.co/${primaryMissingInfo?.hf_repo_id ?? ""}`}
                      target="_blank"
                      rel="noopener"
                      className="underline hover:text-amber-300"
                    >
                      HuggingFace
                    </a>
                    , then retry.
                  </>
                ) : dlError.includes("AUTH_REQUIRED") ? (
                  "HuggingFace authentication required. Add your token in Model Manager."
                ) : (
                  "Download failed. Check Model Manager → Adapters for details."
                )}
              </p>
              <button
                onClick={handleDownload}
                className="w-full py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-medium transition-colors flex items-center justify-center gap-1.5 border border-amber-500/20"
              >
                <Download size={10} /> Retry Download
              </button>
            </div>
          ) : (
            <button
              onClick={handleDownload}
              className="w-full py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white text-[10px] font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <Download size={10} /> Download {friendlyLabel}
            </button>
          )}
        </div>
      )}

      {/* Adapter download in progress */}
      {isDownloading && primaryMissing && (
        <div className="px-2.5 py-2 bg-accent/5 border border-accent/20 rounded-md space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Loader2 size={10} className="text-accent animate-spin" />
            <span className="text-[10px] text-text-secondary">
              Downloading {friendlyLabel}{dlPct !== null ? ` · ${dlPct}%` : "…"}
            </span>
          </div>
          <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full bg-accent rounded-full",
                dlPct !== null ? "transition-all duration-1000" : "animate-pulse w-1/3"
              )}
              style={dlPct !== null ? { width: `${dlPct}%` } : undefined}
            />
          </div>
          {dlProgress && dlProgress.bytes_downloaded > 0 && (
            <p className="text-[9px] text-text-muted">
              {formatBytes(dlProgress.bytes_downloaded)} / {formatBytes(dlProgress.total_bytes)}
            </p>
          )}
        </div>
      )}

      {/* Model compatibility warning */}
      {allAdaptersReady && !isModelCompatible && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <AlertTriangle size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <span className="text-[10px] text-amber-300 leading-tight">
            Character mode requires a FLUX.1-dev model. Switch in Model settings above.
          </span>
        </div>
      )}

      {/* Character info + provider badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {character.reference_images.length} reference{" "}
          {character.reference_images.length === 1 ? "image" : "images"}
        </span>
        <span className="text-[10px] text-text-secondary/60 uppercase tracking-wider flex items-center gap-1">
          {effectiveType === "faceid" ? (
            <>
              {allAdaptersReady && <Check size={9} className="text-success" />}
              <span className="text-emerald-400">◉</span>
              faceid
            </>
          ) : effectiveType === "ip-adapter" ? (
            <>
              {allAdaptersReady && <Check size={9} className="text-success" />}
              <span className="text-purple-400">⬡</span>
              ip-adapter
            </>
          ) : (
            <>
              {allAdaptersReady && <Check size={9} className="text-success" />}
              redux
            </>
          )}
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
