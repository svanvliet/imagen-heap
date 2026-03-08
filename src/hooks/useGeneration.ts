import { useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useGenerationStore } from "@/stores/generation";
import { useModelStore } from "@/stores/models";
import { useBackendStore } from "@/stores/backend";
import { usePromptHistoryStore } from "@/stores/promptHistory";
import { useCharacterStore } from "@/stores/characters";
import { generateImage } from "@/lib/tauri";
import { randomSeed } from "@/lib/utils";

interface ProgressPayload {
  job_id: string;
  step: number;
  total_steps: number;
  preview_base64: string | null;
}

/**
 * Hook that provides the generate function and wires up progress events.
 */
export function useGeneration() {
  const setGenerating = useGenerationStore((s) => s.setGenerating);
  const setProgress = useGenerationStore((s) => s.setProgress);
  const setCurrentImage = useGenerationStore((s) => s.setCurrentImage);
  const setGenerationError = useGenerationStore((s) => s.setGenerationError);
  const backendStatus = useBackendStore((s) => s.status);
  const selectedModelId = useModelStore((s) => s.selectedModelId);

  // Listen for progress events
  useEffect(() => {
    const unlisten = listen<ProgressPayload>("backend:progress", (event) => {
      const { job_id, step, total_steps, preview_base64 } = event.payload;
      setProgress({
        jobId: job_id,
        step,
        totalSteps: total_steps,
        previewBase64: preview_base64 ?? undefined,
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setProgress]);

  const generate = useCallback(async () => {
    const state = useGenerationStore.getState();
    const modelId = useModelStore.getState().selectedModelId;
    if (!state.prompt.trim() || state.isGenerating || !modelId) return;

    const seed = state.seedLocked ? state.seed : randomSeed();
    useGenerationStore.getState().setSeed(seed);
    setGenerating(true);
    setProgress(null);

    try {
      console.log("[useGeneration] Starting generation with model:", modelId);
      const config = useGenerationStore.getState().getConfig();
      const charState = useCharacterStore.getState();
      const selectedChar = charState.selectedCharacterId
        ? charState.characters.find((c) => c.id === charState.selectedCharacterId)
        : null;
      const result = await generateImage({
        prompt: config.prompt,
        negative_prompt: config.negativePrompt,
        seed,
        steps: config.steps,
        cfg: config.cfg,
        width: config.width,
        height: config.height,
        quality_profile: config.qualityProfile === "custom" ? "fast" : config.qualityProfile,
        model_id: modelId,
        sampler: "euler",
        scheduler: "normal",
        character_id: charState.selectedCharacterId,
        character_strength: charState.characterStrength,
        adapter_type: selectedChar?.adapter_type ?? "auto",
      });

      console.log("[useGeneration] Generation complete:", result);

      // Save to prompt history
      usePromptHistoryStore.getState().addEntry(state.prompt, state.stylePresetId);

      setCurrentImage({
        id: result.id,
        imagePath: result.image_path,
        thumbnailPath: result.thumbnail_path,
        config: {
          prompt: state.prompt,
          negativePrompt: state.negativePrompt,
          seed,
          qualityProfile: state.qualityProfile === "custom" ? "fast" : state.qualityProfile,
          stylePresetId: state.stylePresetId,
          aspectRatio: state.aspectRatio.id,
          width: state.aspectRatio.width,
          height: state.aspectRatio.height,
          steps: state.steps,
          cfg: state.cfg,
          sampler: "euler",
          scheduler: "normal",
          modelId,
          characterId: useCharacterStore.getState().selectedCharacterId ?? undefined,
          characterStrength: useCharacterStore.getState().characterStrength,
          inferenceLocation: "local",
        },
        generationTimeMs: result.generation_time_ms,
        createdAt: result.created_at,
      });
    } catch (err) {
      console.error("[useGeneration] Generation failed:", err);
      setGenerationError(String(err));
    }
  }, [setGenerating, setProgress, setCurrentImage, setGenerationError]);

  return {
    generate,
    canGenerate: backendStatus === "connected" && !!selectedModelId,
  };
}
