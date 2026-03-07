/**
 * CharacterCreateDialog — modal for creating a new character card.
 * Name, description, drag-and-drop reference images (1–5), create button.
 */
import { useState, useRef, useCallback } from "react";
import { X, Upload, ImagePlus, Trash2, Sparkles } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useCharacterStore } from "@/stores/characters";
import { cn } from "@/lib/utils";

interface CharacterCreateDialogProps {
  onClose: () => void;
}

export function CharacterCreateDialog({ onClose }: CharacterCreateDialogProps) {
  const createCharacter = useCharacterStore((s) => s.createCharacter);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

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
      const newPaths = [...imagePaths, ...paths].slice(0, 5);
      setImagePaths(newPaths);
    } catch (err) {
      console.error("File dialog error:", err);
    }
  }, [imagePaths]);

  const handleRemoveImage = (index: number) => {
    setImagePaths((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Name is required");
      nameRef.current?.focus();
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const result = await createCharacter(name.trim(), description.trim(), imagePaths);
      if (result) {
        onClose();
      } else {
        setError("Failed to create character");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCreate();
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
            <Sparkles size={18} className="text-accent" />
            <h2 className="text-base font-semibold text-text-primary">
              New Character
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

          {/* Reference Images */}
          <div>
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-1.5 block">
              Reference Images
              <span className="text-text-secondary/50 normal-case tracking-normal ml-1">
                ({imagePaths.length}/5)
              </span>
            </label>

            {imagePaths.length > 0 && (
              <div className="grid grid-cols-5 gap-2 mb-2">
                {imagePaths.map((path, i) => (
                  <div
                    key={i}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-border-default"
                  >
                    <img
                      src={`asset://localhost/${encodeURIComponent(path)}`}
                      alt={`Reference ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback for asset protocol issues
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

            {imagePaths.length < 5 && (
              <button
                onClick={handleAddImages}
                className={cn(
                  "w-full border-2 border-dashed border-border-default rounded-lg transition-colors hover:border-accent hover:bg-accent-muted/30",
                  imagePaths.length === 0 ? "py-8" : "py-3",
                )}
              >
                <div className="flex flex-col items-center gap-1.5 text-text-secondary">
                  {imagePaths.length === 0 ? (
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
            onClick={handleCreate}
            disabled={isCreating || !name.trim()}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
              name.trim()
                ? "bg-accent text-white hover:bg-indigo-400"
                : "bg-bg-hover text-text-secondary cursor-not-allowed",
            )}
          >
            {isCreating ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Create Character
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
