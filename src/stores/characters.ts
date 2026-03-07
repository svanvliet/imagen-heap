/**
 * Character store — manages character cards for consistent identity generation.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Character } from "@/types/generation";
import * as api from "@/lib/tauri";
import { createLogger } from "@/lib/logger";

const log = createLogger("characters");

interface CharacterState {
  characters: Character[];
  selectedCharacterId: string | null;
  characterStrength: number; // 0.0 – 1.0
  isLoading: boolean;
  error: string | null;

  // Actions
  loadCharacters: () => Promise<void>;
  selectCharacter: (id: string | null) => void;
  setCharacterStrength: (strength: number) => void;
  createCharacter: (name: string, description: string, imagePaths: string[]) => Promise<Character | null>;
  deleteCharacter: (id: string) => Promise<void>;
  updateCharacter: (id: string, updates: Record<string, unknown>) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>()(
  persist(
    (set, get) => ({
      characters: [],
      selectedCharacterId: null,
      characterStrength: 0.6,
      isLoading: false,
      error: null,

      loadCharacters: async () => {
        set({ isLoading: true, error: null });
        try {
          const chars = await api.listCharacters();
          set({ characters: chars as Character[], isLoading: false });
          log.info(`Loaded ${chars.length} characters`);

          // Clear selection if selected character was deleted externally
          const { selectedCharacterId } = get();
          if (selectedCharacterId && !chars.find((c) => c.id === selectedCharacterId)) {
            set({ selectedCharacterId: null });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error("Failed to load characters:", msg);
          set({ error: msg, isLoading: false });
        }
      },

      selectCharacter: (id) => {
        set({ selectedCharacterId: id });
        log.info(id ? `Selected character: ${id}` : "Deselected character");
      },

      setCharacterStrength: (strength) => {
        set({ characterStrength: Math.max(0, Math.min(1, strength)) });
      },

      createCharacter: async (name, description, imagePaths) => {
        try {
          const result = await api.createCharacter(name, description, imagePaths);
          const character = result as unknown as Character;
          log.info(`Created character: ${character.name} (${character.id})`);

          // Reload characters to get fresh list
          await get().loadCharacters();

          // Auto-select the new character
          set({ selectedCharacterId: character.id });

          return character;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error("Failed to create character:", msg);
          set({ error: msg });
          return null;
        }
      },

      deleteCharacter: async (id) => {
        try {
          await api.deleteCharacter(id);
          log.info(`Deleted character: ${id}`);

          // Deselect if deleted
          if (get().selectedCharacterId === id) {
            set({ selectedCharacterId: null });
          }

          // Reload
          await get().loadCharacters();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error("Failed to delete character:", msg);
          set({ error: msg });
        }
      },

      updateCharacter: async (id, updates) => {
        try {
          await api.updateCharacter(id, updates);
          log.info(`Updated character: ${id}`);
          await get().loadCharacters();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error("Failed to update character:", msg);
          set({ error: msg });
        }
      },
    }),
    {
      name: "imagen-heap-characters",
      partialize: (state) => ({
        selectedCharacterId: state.selectedCharacterId,
        characterStrength: state.characterStrength,
      }),
    },
  ),
);
