import { useState } from "react";
import { PromptInput } from "@/components/generation/PromptInput";
import { QualityToggle } from "@/components/generation/QualityToggle";
import { AspectRatioSelector } from "@/components/generation/AspectRatioSelector";
import { ModelSelector } from "@/components/generation/ModelSelector";
import { StylePresetGrid } from "@/components/generation/StylePresetGrid";
import { AdvancedParams } from "@/components/generation/AdvancedParams";
import { GenerateButton } from "@/components/generation/GenerateButton";
import { CharacterAvatarRow } from "@/components/generation/CharacterAvatarRow";
import { CharacterStrengthControl } from "@/components/generation/CharacterStrengthControl";
import { CharacterDialog } from "@/components/generation/CharacterCreateDialog";
import { useCharacterStore } from "@/stores/characters";
import type { Character } from "@/types/generation";

export function Sidebar() {
  const [showCharacterDialog, setShowCharacterDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>(undefined);
  const characters = useCharacterStore((s) => s.characters);

  const handleCreateClick = () => {
    setEditingCharacter(undefined);
    setShowCharacterDialog(true);
  };

  const handleEditClick = (characterId: string) => {
    const char = characters.find((c) => c.id === characterId);
    if (char) {
      setEditingCharacter(char);
      setShowCharacterDialog(true);
    }
  };

  const handleCloseDialog = () => {
    setShowCharacterDialog(false);
    setEditingCharacter(undefined);
  };

  return (
    <div className="flex flex-col h-full bg-bg-secondary">
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Character */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
            Character
          </label>
          <CharacterAvatarRow
            onCreateClick={handleCreateClick}
            onEditClick={handleEditClick}
          />
          <CharacterStrengthControl />
        </div>

        {/* Prompt */}
        <PromptInput />

        {/* Model selector */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
            Model
          </label>
          <ModelSelector />
        </div>

        {/* Quality profile */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
            Quality
          </label>
          <QualityToggle />
        </div>

        {/* Style presets */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
            Style
          </label>
          <StylePresetGrid />
        </div>

        {/* Aspect Ratio */}
        <div>
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2 block">
            Aspect Ratio
          </label>
          <AspectRatioSelector />
        </div>

        {/* Advanced Parameters */}
        <AdvancedParams />
      </div>

      {/* Generate button pinned to bottom */}
      <div className="p-4 border-t border-border-default">
        <GenerateButton />
      </div>

      {/* Character create/edit modal */}
      {showCharacterDialog && (
        <CharacterDialog
          onClose={handleCloseDialog}
          character={editingCharacter}
        />
      )}
    </div>
  );
}
