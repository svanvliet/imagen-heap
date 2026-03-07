import { describe, it, expect } from "vitest";
import { useGenerationStore } from "@/stores/generation";
import { ASPECT_RATIOS } from "@/lib/constants";

describe("useGenerationStore", () => {
  it("has correct initial state", () => {
    const state = useGenerationStore.getState();
    expect(state.prompt).toBe("");
    expect(state.negativePrompt).toBe("");
    expect(state.qualityProfile).toBe("fast");
    expect(state.aspectRatio).toEqual(ASPECT_RATIOS[0]);
    expect(state.isGenerating).toBe(false);
    expect(state.history).toEqual([]);
    expect(state.currentImage).toBeNull();
  });

  it("sets prompt", () => {
    useGenerationStore.getState().setPrompt("a cat on a mountain");
    expect(useGenerationStore.getState().prompt).toBe("a cat on a mountain");
    useGenerationStore.getState().setPrompt("");
  });

  it("sets quality profile", () => {
    useGenerationStore.getState().setQualityProfile("quality");
    expect(useGenerationStore.getState().qualityProfile).toBe("quality");
    useGenerationStore.getState().setQualityProfile("fast");
  });

  it("sets aspect ratio by id", () => {
    useGenerationStore.getState().setAspectRatio("16:9");
    expect(useGenerationStore.getState().aspectRatio.id).toBe("16:9");
    useGenerationStore.getState().setAspectRatio("1:1");
  });

  it("getConfig returns correct config", () => {
    useGenerationStore.getState().setPrompt("test prompt");
    useGenerationStore.getState().setQualityProfile("fast");
    useGenerationStore.getState().setAspectRatio("1:1");
    const config = useGenerationStore.getState().getConfig();
    expect(config.prompt).toBe("test prompt");
    expect(config.steps).toBe(4);
    expect(config.width).toBe(1024);
    expect(config.height).toBe(1024);
    useGenerationStore.getState().setPrompt("");
  });

  it("randomizeSeed changes the seed", () => {
    const initial = useGenerationStore.getState().seed;
    // Randomize many times to be statistically sure it changes
    let changed = false;
    for (let i = 0; i < 10; i++) {
      useGenerationStore.getState().randomizeSeed();
      if (useGenerationStore.getState().seed !== initial) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });
});
