import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GenerationResult, GenerationProgress } from "@/types";
import { ASPECT_RATIOS, QUALITY_PROFILES, STYLE_PRESETS } from "@/lib/constants";
import { randomSeed } from "@/lib/utils";

interface GenerationState {
  prompt: string;
  negativePrompt: string;
  qualityProfile: "fast" | "quality" | "custom";
  stylePresetId: string | null;
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
  viewingProgress: boolean;
  cancellationRequested: boolean;

  setPrompt: (prompt: string) => void;
  setNegativePrompt: (negativePrompt: string) => void;
  setQualityProfile: (profile: "fast" | "quality") => void;
  setStylePresetId: (presetId: string | null) => void;
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
  setViewingProgress: (viewing: boolean) => void;
  cancelGeneration: () => void;
  selectHistoryItem: (index: number) => void;
  deleteHistoryItem: (id: string) => void;
  clearHistory: () => void;

  /** Get the full generation config for the current state, with style applied */
  getConfig: () => {
    prompt: string;
    negativePrompt: string;
    seed: number;
    qualityProfile: string;
    stylePresetId: string | null;
    aspectRatio: string;
    width: number;
    height: number;
    steps: number;
    cfg: number;
  };
}

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set, get) => ({
  prompt: "",
  negativePrompt: "",
  qualityProfile: "fast",
  stylePresetId: null,
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
  viewingProgress: false,
  cancellationRequested: false,

  setPrompt: (prompt) => set({ prompt }),
  setNegativePrompt: (negativePrompt) => set({ negativePrompt }),
  setQualityProfile: (profile) => {
    const p = QUALITY_PROFILES[profile];
    set({ qualityProfile: profile, steps: p.steps, cfg: 3.5 });
  },
  setStylePresetId: (presetId) => {
    if (!presetId) {
      set({ stylePresetId: null });
      return;
    }
    const preset = STYLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const updates: Partial<GenerationState> = { stylePresetId: presetId };
    if (preset.recommendedCfg !== null) updates.cfg = preset.recommendedCfg;
    if (preset.recommendedSteps !== null) updates.steps = preset.recommendedSteps;
    set(updates as GenerationState);
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
    set({ isGenerating, generationStartTime: isGenerating ? Date.now() : null, generationError: null, viewingProgress: isGenerating, cancellationRequested: false }),
  setProgress: (progress) => set({ progress }),
  setGenerationError: (error) => set({ generationError: error, isGenerating: false, progress: null, generationStartTime: null }),
  setCurrentImage: (result) =>
    set((s) => ({
      currentImage: result,
      history: [result, ...s.history],
      isGenerating: false,
      progress: null,
      viewingProgress: false,
    })),
  setViewingProgress: (viewing) => set({ viewingProgress: viewing }),
  cancelGeneration: () => set({ cancellationRequested: true }),
  selectHistoryItem: (index) =>
    set((s) => ({
      currentImage: s.history[index] ?? null,
      viewingProgress: false,
    })),
  deleteHistoryItem: (id) =>
    set((s) => {
      const history = s.history.filter((item) => item.id !== id);
      const currentImage = s.currentImage?.id === id
        ? (history[0] ?? null)
        : s.currentImage;
      return { history, currentImage };
    }),
  clearHistory: () => set({ history: [], currentImage: null }),

  getConfig: () => {
    const s = get();
    const preset = s.stylePresetId
      ? STYLE_PRESETS.find((p) => p.id === s.stylePresetId) ?? null
      : null;

    // Apply style suffix to prompt
    let finalPrompt = s.prompt;
    if (preset) finalPrompt = s.prompt + preset.promptSuffix;

    // Merge negative prompts
    let finalNeg = s.negativePrompt;
    if (preset?.negativePrompt) {
      finalNeg = [s.negativePrompt, preset.negativePrompt].filter(Boolean).join(", ");
    }

    return {
      prompt: finalPrompt,
      negativePrompt: finalNeg,
      seed: s.seed,
      qualityProfile: s.qualityProfile,
      stylePresetId: s.stylePresetId,
      aspectRatio: s.aspectRatio.id,
      width: s.aspectRatio.width,
      height: s.aspectRatio.height,
      steps: s.steps,
      cfg: s.cfg,
    };
  },
}),
    {
      name: "imagen-heap-generation",
      partialize: (state) => ({
        prompt: state.prompt,
        negativePrompt: state.negativePrompt,
        qualityProfile: state.qualityProfile,
        stylePresetId: state.stylePresetId,
        aspectRatio: state.aspectRatio,
        seed: state.seed,
        seedLocked: state.seedLocked,
        steps: state.steps,
        cfg: state.cfg,
        history: state.history,
        currentImage: state.currentImage,
      }),
    }
  )
);
