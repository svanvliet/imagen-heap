/**
 * CharacterAvatarRow — horizontal scrolling row of character avatars in sidebar.
 * Shows circular thumbnails with accent ring on selection, "None" and "+" buttons.
 */
import { useEffect, useRef, useState } from "react";
import { Plus, User, X, Trash2, Pencil } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCharacterStore } from "@/stores/characters";
import { cn } from "@/lib/utils";

interface CharacterAvatarRowProps {
  onCreateClick: () => void;
  onEditClick: (characterId: string) => void;
}

export function CharacterAvatarRow({ onCreateClick, onEditClick }: CharacterAvatarRowProps) {
  const characters = useCharacterStore((s) => s.characters);
  const selectedId = useCharacterStore((s) => s.selectedCharacterId);
  const selectCharacter = useCharacterStore((s) => s.selectCharacter);
  const deleteCharacter = useCharacterStore((s) => s.deleteCharacter);
  const loadCharacters = useCharacterStore((s) => s.loadCharacters);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    characterId: string;
  } | null>(null);

  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, characterId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, characterId });
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    await deleteCharacter(contextMenu.characterId);
    setContextMenu(null);
  };

  const handleEdit = () => {
    if (!contextMenu) return;
    onEditClick(contextMenu.characterId);
    setContextMenu(null);
  };

  return (
    <div className="relative">
      <div
        ref={rowRef}
        className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin"
      >
        {/* None button */}
        <button
          onClick={() => selectCharacter(null)}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all",
            selectedId === null
              ? "border-accent bg-accent-muted"
              : "border-border-default bg-bg-primary hover:bg-bg-hover hover:border-zinc-500",
          )}
          title="No character"
        >
          {selectedId === null ? (
            <X size={14} className="text-accent" />
          ) : (
            <User size={14} className="text-text-secondary" />
          )}
        </button>

        {/* Character avatars */}
        {characters.map((char) => {
          const isSelected = selectedId === char.id;
          const thumbSrc = char.thumbnail
            ? convertFileSrc(char.thumbnail)
            : null;

          return (
            <button
              key={char.id}
              onClick={() => selectCharacter(char.id)}
              onDoubleClick={() => onEditClick(char.id)}
              onContextMenu={(e) => handleContextMenu(e, char.id)}
              className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full border-2 overflow-hidden transition-all",
                isSelected
                  ? "border-accent ring-2 ring-accent/30 scale-110"
                  : "border-border-default hover:border-zinc-500 hover:scale-105",
              )}
              title={char.name}
            >
              {thumbSrc ? (
                <img
                  src={thumbSrc}
                  alt={char.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-bg-hover flex items-center justify-center">
                  <User size={16} className="text-text-secondary" />
                </div>
              )}
            </button>
          );
        })}

        {/* Add button */}
        <button
          onClick={onCreateClick}
          className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-dashed border-border-default hover:border-accent hover:bg-accent-muted flex items-center justify-center transition-all"
          title="Create character"
        >
          <Plus size={16} className="text-text-secondary" />
        </button>
      </div>

      {/* Selected character name label */}
      {selectedId && (
        <div className="mt-1.5 text-[10px] text-text-secondary truncate">
          {characters.find((c) => c.id === selectedId)?.name ?? "Unknown"}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-secondary border border-border-default rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-context-menu
        >
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-bg-hover flex items-center gap-2 text-text-primary"
            onMouseDown={(e) => {
              e.stopPropagation();
              handleEdit();
            }}
          >
            <Pencil size={14} />
            Edit
          </button>
          <div className="mx-2 my-0.5 border-t border-border-default" />
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-bg-hover flex items-center gap-2 text-red-400"
            onMouseDown={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
