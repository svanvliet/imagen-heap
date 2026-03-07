import { create } from "zustand";
import type { GenerationResult, GenerationProgress } from "@/types";
import { ASPECT_RATIOS, QUALITY_PROFILES } from "@/lib/constants";
import { randomSeed } from "@/lib/utils";

interface GenerationState {
  prompt: string;
  negativePrompt: string;
  qualityProfile: "fast" | "quality";
  aspectRatio: (typeof ASPECT_RATIOS)[number];
  seed: number;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  currentImage: GenerationResult | null;
  history: GenerationResult[];

  setPrompt: (prompt: string) => void;
  setNegativePrompt: (negativePrompt: string) => void;
  setQualityProfile: (profile: "fast" | "quality") => void;
  setAspectRatio: (ratioId: string) => void;
  setSeed: (seed: number) => void;
  randomizeSeed: () => void;
  setGenerating: (isGenerating: boolean) => void;
  setProgress: (progress: GenerationProgress | null) => void;
  setCurrentImage: (result: GenerationResult) => void;
  selectHistoryItem: (index: number) => void;
  clearHistory: () => void;

  /** Get the full generation config for the current state */
  getConfig: () => {
    prompt: string;
    negativePrompt: string;
    seed: number;
    qualityProfile: "fast" | "quality";
    aspectRatio: string;
    width: number;
    height: number;
    steps: number;
  };
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  prompt: "",
  negativePrompt: "",
  qualityProfile: "fast",
  aspectRatio: ASPECT_RATIOS[0],
  seed: randomSeed(),
  isGenerating: false,
  progress: null,
  currentImage: null,
  history: [],

  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setQualityProfile: (profile) => set({ qualityProfile: profile }),
  setAspectRatio: (ratioId) => {
    const ratio = ASPECT_RATIOS.find((r) => r.id === ratioId);
    if (ratio) set({ aspectRatio: ratio });
  },
  setSeed: (seed) => set({ seed }),
  randomizeSeed: () => set({ seed: randomSeed() }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setProgress: (progress) => set({ progress }),
  setCurrentImage: (result) =>
    set((s) => ({
      currentImage: result,
      history: [result, ...s.history],
      isGenerating: false,
      progress: null,
    })),
  selectHistoryItem: (index) =>
    set((s) => ({
      currentImage: s.history[index] ?? null,
    })),
  clearHistory: () => set({ history: [], currentImage: null }),

  getConfig: () => {
    const s = get();
    const profile = QUALITY_PROFILES[s.qualityProfile];
    return {
      prompt: s.prompt,
      negativePrompt: s.negativePrompt,
      seed: s.seed,
      qualityProfile: s.qualityProfile,
      aspectRatio: s.aspectRatio.id,
      width: s.aspectRatio.width,
      height: s.aspectRatio.height,
      steps: profile.steps,
    };
  },
}));
