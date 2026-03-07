import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PromptHistoryEntry {
  id: string;
  prompt: string;
  stylePresetId: string | null;
  timestamp: number;
}

interface PromptHistoryState {
  entries: PromptHistoryEntry[];
  addEntry: (prompt: string, stylePresetId: string | null) => void;
  removeEntry: (id: string) => void;
  clearAll: () => void;
}

const MAX_HISTORY = 100;

export const usePromptHistoryStore = create<PromptHistoryState>()(
  persist(
    (set) => ({
      entries: [],

      addEntry: (prompt, stylePresetId) => {
        const trimmed = prompt.trim();
        if (!trimmed) return;
        set((s) => {
          // Deduplicate: remove existing entry with same prompt text
          const filtered = s.entries.filter((e) => e.prompt !== trimmed);
          const entry: PromptHistoryEntry = {
            id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            prompt: trimmed,
            stylePresetId,
            timestamp: Date.now(),
          };
          return { entries: [entry, ...filtered].slice(0, MAX_HISTORY) };
        });
      },

      removeEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      clearAll: () => set({ entries: [] }),
    }),
    { name: "imagen-heap-prompt-history" }
  )
);
