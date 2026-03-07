import { create } from "zustand";
import type { GenerationResult, GenerationProgress } from "@/types";
import { ASPECT_RATIOS, QUALITY_PROFILES } from "@/lib/constants";
import { randomSeed } from "@/lib/utils";

interface GenerationState {
  prompt: string;
  negativePrompt: string;
  qualityProfile: "fast" | "quality" | "custom";
  aspectRatio: (typeof ASPECT_RATIOS)[number];
  seed: number;
  seedLocked: boolean;
  steps: number;
  cfg: number;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  generationStartTime: number | null;
  generationError: string | null;
  currentImage: GenerationResult | null;
  history: GenerationResult[];

  setPrompt: (prompt: string) => void;
  setNegativePrompt: (negativePrompt: string) => void;
  setQualityProfile: (profile: "fast" | "quality") => void;
  setAspectRatio: (ratioId: string) => void;
  setSeed: (seed: number) => void;
  setSeedLocked: (locked: boolean) => void;
  setSteps: (steps: number) => void;
  setCfg: (cfg: number) => void;
  randomizeSeed: () => void;
  setGenerating: (isGenerating: boolean) => void;
  setProgress: (progress: GenerationProgress | null) => void;
  setGenerationError: (error: string | null) => void;
  setCurrentImage: (result: GenerationResult) => void;
  selectHistoryItem: (index: number) => void;
  clearHistory: () => void;

  /** Get the full generation config for the current state */
  getConfig: () => {
    prompt: string;
    negativePrompt: string;
    seed: number;
    qualityProfile: string;
    aspectRatio: string;
    width: number;
    height: number;
    steps: number;
    cfg: number;
  };
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  prompt: "",
  negativePrompt: "",
  qualityProfile: "fast",
  aspectRatio: ASPECT_RATIOS[0],
  seed: randomSeed(),
  seedLocked: false,
  steps: QUALITY_PROFILES.fast.steps,
  cfg: 3.5,
  isGenerating: false,
  progress: null,
  generationStartTime: null,
  generationError: null,
  currentImage: null,
  history: [],

  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setQualityProfile: (profile) => {
    const p = QUALITY_PROFILES[profile];
    set({ qualityProfile: profile, steps: p.steps, cfg: 3.5 });
  },
  setAspectRatio: (ratioId) => {
    const ratio = ASPECT_RATIOS.find((r) => r.id === ratioId);
    if (ratio) set({ aspectRatio: ratio });
  },
  setSeed: (seed) => set({ seed }),
  setSeedLocked: (locked) => set({ seedLocked: locked }),
  setSteps: (steps) => set({ steps, qualityProfile: "custom" }),
  setCfg: (cfg) => set({ cfg, qualityProfile: "custom" }),
  randomizeSeed: () => set({ seed: randomSeed() }),
  setGenerating: (isGenerating) =>
    set({ isGenerating, generationStartTime: isGenerating ? Date.now() : null, generationError: null }),
  setProgress: (progress) => set({ progress }),
  setGenerationError: (error) => set({ generationError: error, isGenerating: false, progress: null, generationStartTime: null }),
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
    return {
      prompt: s.prompt,
      negativePrompt: s.negativePrompt,
      seed: s.seed,
      qualityProfile: s.qualityProfile,
      aspectRatio: s.aspectRatio.id,
      width: s.aspectRatio.width,
      height: s.aspectRatio.height,
      steps: s.steps,
      cfg: s.cfg,
    };
  },
}));
