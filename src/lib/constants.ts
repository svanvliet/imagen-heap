/** Application-wide constants */

export const APP_NAME = "Imagen Heap";
export const APP_VERSION = "0.1.0";

/** Quality profiles */
export const QUALITY_PROFILES = {
  fast: {
    id: "fast",
    label: "Fast",
    description: "~10s • 4 steps",
    steps: 4,
    model: "flux-schnell",
  },
  quality: {
    id: "quality",
    label: "Quality",
    description: "~60s • 25 steps",
    steps: 25,
    model: "flux-dev",
  },
} as const;

/** Aspect ratio presets */
export const ASPECT_RATIOS = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024 },
  { id: "3:2", label: "3:2", width: 1024, height: 683 },
  { id: "2:3", label: "2:3", width: 683, height: 1024 },
  { id: "16:9", label: "16:9", width: 1024, height: 576 },
  { id: "9:16", label: "9:16", width: 576, height: 1024 },
  { id: "4:3", label: "4:3", width: 1024, height: 768 },
  { id: "3:4", label: "3:4", width: 768, height: 1024 },
] as const;

export type AspectRatioId = (typeof ASPECT_RATIOS)[number]["id"];
export type QualityProfileId = keyof typeof QUALITY_PROFILES;
