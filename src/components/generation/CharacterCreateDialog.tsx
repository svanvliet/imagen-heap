/**
 * CharacterDialog — modal for creating or editing a character card.
 * Create mode: empty form, creates new character on submit.
 * Edit mode: pre-populated from existing character, saves changes incrementally.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { X, Upload, ImagePlus, Trash2, Sparkles, Pencil, Cpu, FileBox, Wand2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCharacterStore } from "@/stores/characters";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";
import * as api from "@/lib/tauri";
import type { Character } from "@/types/generation";

interface CharacterDialogProps {
  onClose: () => void;
  /** When provided, dialog opens in edit mode for this character */
  character?: Character;
}

export function CharacterDialog({ onClose, character }: CharacterDialogProps) {
  const isEditMode = !!character;
  const createCharacter = useCharacterStore((s) => s.createCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const loadCharacters = useCharacterStore((s) => s.loadCharacters);

  const [name, setName] = useState(character?.name ?? "");
  const [description, setDescription] = useState(character?.description ?? "");
  // In create mode, imagePaths are local filesystem paths (not yet copied).
  // In edit mode, imagePaths are the character's stored reference_images.
  const [imagePaths, setImagePaths] = useState<string[]>(
    character?.reference_images ?? [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adapterType, setAdapterType] = useState<"auto" | "redux" | "ip-adapter" | "faceid" | "lora">(
    (character?.adapter_type as "auto" | "redux" | "ip-adapter" | "faceid" | "lora") ?? "auto",
  );
  const [providers, setProviders] = useState<{ mlx: boolean; diffusers: boolean; faceid: boolean }>({ mlx: true, diffusers: false, faceid: false });

  // LoRA-specific state
  const [loraFilePath, setLoraFilePath] = useState<string | null>(null);
  const [loraFileName, setLoraFileName] = useState<string>(character?.lora_filename ?? "");
  const [loraFileSize, setLoraFileSize] = useState<number>(character?.lora_file_size ?? 0);
  const [triggerWord, setTriggerWord] = useState<string>(character?.trigger_word ?? "ohwx");
  const hasExistingLora = isEditMode && !!character?.lora_path;

  const nameRef = useRef<HTMLInputElement>(null);

  // Check which providers are available (non-blocking — defaults if timeout)
  useEffect(() => {
    api.getAvailableProviders()
      .then(setProviders)
      .catch(() => {
        // On timeout or error, assume all providers available — user will see errors at generation time
        setProviders({ mlx: true, diffusers: true, faceid: true });
      });
  }, []);

  // Track which images were removed (by original index) and added (local paths) in edit mode
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [addedPaths, setAddedPaths] = useState<string[]>([]);

  // Build the display list: original images (minus removed) + newly added
  const displayImages = isEditMode
    ? [
        ...imagePaths.filter((_, i) => !removedIndices.has(i)),
        ...addedPaths,
      ]
    : imagePaths;

  const totalImages = displayImages.length;

  const handleAddImages = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
        ],
      });

      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      const remaining = 5 - totalImages;
      if (remaining <= 0) return;
      const toAdd = paths.slice(0, remaining);

      if (isEditMode) {
        setAddedPaths((prev) => [...prev, ...toAdd]);
      } else {
        setImagePaths((prev) => [...prev, ...toAdd].slice(0, 5));
      }
    } catch (err) {
      console.error("File dialog error:", err);
    }
  }, [totalImages, isEditMode]);

  const handleRemoveImage = useCallback(
    async (displayIndex: number) => {
      if (!isEditMode) {
        setImagePaths((prev) => prev.filter((_, i) => i !== displayIndex));
        return;
      }

      // In edit mode, figure out if it's an original or a newly added image
      const origCount = imagePaths.filter((_, i) => !removedIndices.has(i)).length;
      if (displayIndex < origCount) {
        // Map display index back to original index
        let origIdx = -1;
        let seen = 0;
        for (let i = 0; i < imagePaths.length; i++) {
          if (!removedIndices.has(i)) {
            if (seen === displayIndex) {
              origIdx = i;
              break;
            }
            seen++;
          }
        }
        if (origIdx >= 0) {
          setRemovedIndices((prev) => new Set([...prev, origIdx]));
        }
      } else {
        // It's a newly added image
        const addedIdx = displayIndex - origCount;
        setAddedPaths((prev) => prev.filter((_, i) => i !== addedIdx));
      }
    },
    [isEditMode, imagePaths, removedIndices],
  );

  const handleSelectLoraFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: "LoRA Weights", extensions: ["safetensors"] },
        ],
      });
      if (!selected) return;
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      setLoraFilePath(filePath);
      // Extract filename from path
      const parts = filePath.split(/[/\\]/);
      const fileName = parts[parts.length - 1];
      setLoraFileName(fileName);
      // We can't get file size from the dialog, but it'll be set by the backend
      setLoraFileSize(0);
    } catch (err) {
      console.error("LoRA file dialog error:", err);
    }
  }, []);

  const handleRemoveLora = useCallback(() => {
    setLoraFilePath(null);
    setLoraFileName("");
    setLoraFileSize(0);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      nameRef.current?.focus();
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (isEditMode && character) {
        // Update metadata if changed
        const updates: Record<string, unknown> = {};
        if (name.trim() !== character.name) updates.name = name.trim();
        if (description.trim() !== character.description)
          updates.description = description.trim();
        if (adapterType !== (character.adapter_type ?? "auto"))
          updates.adapter_type = adapterType;
        if (triggerWord !== (character.trigger_word ?? "ohwx"))
          updates.trigger_word = triggerWord;
        if (Object.keys(updates).length > 0) {
          await updateCharacter(character.id, updates);
        }

        // Handle LoRA file changes in edit mode
        if (adapterType === "lora" && loraFilePath) {
          // New LoRA file selected
          await api.setCharacterLora(character.id, loraFilePath, triggerWord);
        } else if (adapterType !== "lora" && hasExistingLora) {
          // Switched away from LoRA — remove the LoRA file
          await api.removeCharacterLora(character.id);
        }

        // Remove images (in reverse order to preserve indices)
        const sortedRemoved = [...removedIndices].sort((a, b) => b - a);
        for (const idx of sortedRemoved) {
          await api.removeReferenceImage(character.id, idx);
        }

        // Add new images
        for (const path of addedPaths) {
          await api.addReferenceImage(character.id, path);
        }

        await loadCharacters();
        onClose();
      } else {
        // Create mode
        const result = await createCharacter(
          name.trim(),
          description.trim(),
          imagePaths,
        );
        if (result) {
          // If LoRA adapter selected, set the LoRA file on the new character
          if (adapterType === "lora" && loraFilePath) {
            await api.setCharacterLora(result.id, loraFilePath, triggerWord);
            await loadCharacters();
          }
          onClose();
        } else {
          setError("Failed to create character");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
  };

  const hasChanges = isEditMode
    ? name.trim() !== character?.name ||
      description.trim() !== character?.description ||
      adapterType !== (character?.adapter_type ?? "auto") ||
      triggerWord !== (character?.trigger_word ?? "ohwx") ||
      loraFilePath !== null ||
      removedIndices.size > 0 ||
      addedPaths.length > 0
    : true;

  /** Resolve image src for display — edit mode images are stored paths, create mode are local paths */
  const imageSrc = (path: string) => {
    return convertFileSrc(path);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-bg-secondary border border-border-default rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
          <div className="flex items-center gap-2">
            {isEditMode ? (
              <Pencil size={18} className="text-accent" />
            ) : (
              <Sparkles size={18} className="text-accent" />
            )}
            <h2 className="text-base font-semibold text-text-primary">
              {isEditMode ? "Edit Character" : "New Character"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-bg-hover transition-colors"
          >
            <X size={16} className="text-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
              Name
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Detective Noir, Princess Luna..."
              className="w-full px-3 py-2 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
              Description
              <span className="text-text-secondary/50 normal-case tracking-normal ml-1">
                (optional)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe features, clothing, distinguishing traits..."
              rows={2}
              className="w-full px-3 py-2 bg-bg-primary border border-border-default rounded-lg text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-none"
            />
          </div>

          {/* Adapter Type */}
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
              <span className="flex items-center gap-1.5">
                <Cpu size={12} />
                Identity Method
              </span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {([
                { value: "auto" as const, label: "Auto", desc: "Best available", tip: "Automatically selects the best adapter based on what's installed" },
                { value: "redux" as const, label: "Redux", desc: "MLX · fast", tip: "Fast generation via MLX — captures general style and appearance" },
                { value: "ip-adapter" as const, label: "IP-Adapter", desc: "FLUX · style", tip: "CLIP-based style/composition transfer from reference images" },
                { value: "faceid" as const, label: "FaceID", desc: "SDXL · face ✦", tip: "True facial identity — best for consistent character faces across scenes" },
                { value: "lora" as const, label: "LoRA", desc: "Import · best ✦", tip: "Import a trained LoRA for the highest quality character identity" },
              ]).map((opt) => {
                const disabled =
                  (opt.value === "ip-adapter" && !providers.diffusers) ||
                  (opt.value === "faceid" && !providers.faceid);
                return (
                  <button
                    key={opt.value}
                    onClick={() => !disabled && setAdapterType(opt.value)}
                    disabled={disabled}
                    title={opt.tip}
                    className={cn(
                      "px-2 py-2 rounded-lg border text-left transition-all",
                      adapterType === opt.value
                        ? "border-accent bg-accent-muted/30 ring-1 ring-accent/30"
                        : "border-border-default hover:border-accent/50",
                      disabled && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <span className="text-xs font-medium text-text-primary block">{opt.label}</span>
                    <span className="text-[10px] text-text-secondary">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            {/* Contextual info for selected adapter type */}
            {adapterType === "redux" && (
              <p className="text-[10px] text-text-secondary/70 mt-1.5">
                Uses FLUX via MLX for fast generation (~60s). Captures general style but not precise facial features.
              </p>
            )}
            {adapterType === "ip-adapter" && providers.diffusers && (
              <p className="text-[10px] text-text-secondary/70 mt-1.5">
                Uses CLIP vision embeddings for style and composition transfer. Good for overall look, not face-specific.
              </p>
            )}
            {adapterType === "ip-adapter" && !providers.diffusers && (
              <p className="text-[10px] text-amber-400 mt-1.5">
                IP-Adapter requires PyTorch + diffusers. Install deps to enable.
              </p>
            )}
            {adapterType === "faceid" && providers.faceid && (
              <p className="text-[10px] text-emerald-400/80 mt-1.5">
                ✦ Recommended for character consistency — uses InsightFace ArcFace embeddings with SDXL for true face likeness. ~8.8 GB of adapter downloads required.
              </p>
            )}
            {adapterType === "faceid" && !providers.faceid && (
              <p className="text-[10px] text-amber-400 mt-1.5">
                FaceID requires InsightFace + ONNX Runtime. Install deps to enable.
              </p>
            )}
            {adapterType === "lora" && (
              <div className="mt-2 space-y-2">
                <p className="text-[10px] text-emerald-400/80">
                  ✦ Highest quality — import a trained LoRA (.safetensors) for true identity. Uses fast MLX inference.
                </p>

                {/* LoRA file picker */}
                {(loraFileName || hasExistingLora) && !loraFilePath ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-bg-primary border border-border-default rounded-lg">
                    <FileBox size={14} className="text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate">{loraFileName || character?.lora_filename}</p>
                      {(loraFileSize || character?.lora_file_size) ? (
                        <p className="text-[10px] text-text-secondary">{formatBytes(loraFileSize || character?.lora_file_size || 0)}</p>
                      ) : null}
                    </div>
                    <button
                      onClick={handleSelectLoraFile}
                      className="text-[10px] text-accent hover:text-indigo-300 transition-colors"
                    >
                      Replace
                    </button>
                    <button
                      onClick={handleRemoveLora}
                      className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : loraFilePath ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <FileBox size={14} className="text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate">{loraFileName}</p>
                      <p className="text-[10px] text-emerald-400">Ready to import</p>
                    </div>
                    <button
                      onClick={handleRemoveLora}
                      className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSelectLoraFile}
                    className="w-full px-3 py-3 border-2 border-dashed border-border-default rounded-lg hover:border-accent hover:bg-accent-muted/30 transition-colors"
                  >
                    <div className="flex flex-col items-center gap-1 text-text-secondary">
                      <Wand2 size={18} />
                      <span className="text-xs">Select .safetensors file</span>
                      <span className="text-[10px] text-text-secondary/50">LoRA weights trained for FLUX</span>
                    </div>
                  </button>
                )}

                {/* Trigger word */}
                <div>
                  <label className="text-[10px] text-text-secondary mb-1 block">
                    Trigger word <span className="text-text-secondary/50">(auto-added to prompts)</span>
                  </label>
                  <input
                    type="text"
                    value={triggerWord}
                    onChange={(e) => setTriggerWord(e.target.value)}
                    placeholder="ohwx"
                    className="w-full px-2.5 py-1.5 bg-bg-primary border border-border-default rounded-md text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reference Images */}
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
              Reference Images
              <span className="text-text-secondary/50 normal-case tracking-normal ml-1">
                ({totalImages}/5)
              </span>
            </label>

            {totalImages > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-2">
                {displayImages.map((path, i) => (
                  <div
                    key={`${path}-${i}`}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-border-default"
                  >
                    <img
                      src={imageSrc(path)}
                      alt={`Reference ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <button
                      onClick={() => handleRemoveImage(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {totalImages < 5 && (
              <button
                onClick={handleAddImages}
                className={cn(
                  "w-full border-2 border-dashed border-border-default rounded-lg transition-colors hover:border-accent hover:bg-accent-muted/30",
                  totalImages === 0 ? "py-8" : "py-3",
                )}
              >
                <div className="flex flex-col items-center gap-1.5 text-text-secondary">
                  {totalImages === 0 ? (
                    <>
                      <ImagePlus size={24} />
                      <span className="text-sm">Add reference images</span>
                      <span className="text-xs text-text-secondary/50">
                        PNG, JPG, or WebP · up to 5 images
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      <span className="text-xs">Add more</span>
                    </>
                  )}
                </div>
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-default bg-bg-primary/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim() || (isEditMode && !hasChanges) || (adapterType === "lora" && !loraFilePath && !hasExistingLora)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
              name.trim() && (!isEditMode || hasChanges) && !(adapterType === "lora" && !loraFilePath && !hasExistingLora)
                ? "bg-accent text-white hover:bg-indigo-400"
                : "bg-bg-hover text-text-secondary cursor-not-allowed",
            )}
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {isEditMode ? "Saving..." : "Creating..."}
              </>
            ) : (
              <>
                {isEditMode ? (
                  <Pencil size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                {isEditMode ? "Save Changes" : "Create Character"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
