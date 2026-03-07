/** Types for the image generation pipeline */

export interface GenerationConfig {
  prompt: string;
  negativePrompt: string;
  seed: number;
  qualityProfile: "fast" | "quality";
  aspectRatio: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  modelId: string;
  characterId?: string;
  characterStrength?: number;
  controlnetConfig?: ControlNetConfig;
  inferenceLocation: "local" | "cloud";
}

export interface ControlNetConfig {
  type: "openpose" | "depth" | "canny";
  weight: number;
  startStep: number;
  endStep: number;
  conditioningImagePath?: string;
}

export interface GenerationProgress {
  jobId: string;
  step: number;
  totalSteps: number;
  previewBase64?: string;
}

export interface GenerationResult {
  id: string;
  imagePath: string;
  thumbnailPath: string;
  config: GenerationConfig;
  generationTimeMs: number;
  createdAt: string;
}

export interface GenerationError {
  code: string;
  message: string;
  suggestion?: string;
}
