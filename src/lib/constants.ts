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

/** Style presets — each modifies prompt and generation params */
export interface StylePreset {
  id: string;
  name: string;
  description: string;
  /** Emoji icon for the card */
  icon: string;
  /** Tailwind gradient classes for card background */
  gradient: string;
  /** Appended to user prompt during generation */
  promptSuffix: string;
  /** Default negative prompt (merged with user's) */
  negativePrompt: string;
  /** Recommended CFG override (null = keep user setting) */
  recommendedCfg: number | null;
  /** Recommended steps override (null = keep user setting) */
  recommendedSteps: number | null;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "photorealistic",
    name: "Photo",
    description: "Natural, detailed, photographic realism",
    icon: "📷",
    gradient: "from-amber-900/40 to-orange-900/30",
    promptSuffix: ", photorealistic, highly detailed, natural lighting, 8k uhd, DSLR",
    negativePrompt: "cartoon, illustration, painting, drawing, anime, unrealistic",
    recommendedCfg: 4.0,
    recommendedSteps: null,
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Dramatic lighting, film grain, shallow depth of field",
    icon: "🎬",
    gradient: "from-slate-800/50 to-yellow-900/30",
    promptSuffix: ", cinematic lighting, dramatic atmosphere, film grain, shallow depth of field, anamorphic lens",
    negativePrompt: "flat lighting, cartoon, low quality",
    recommendedCfg: 4.5,
    recommendedSteps: null,
  },
  {
    id: "anime",
    name: "Anime",
    description: "Anime/manga art style with vibrant colors",
    icon: "🌸",
    gradient: "from-pink-900/40 to-purple-900/30",
    promptSuffix: ", anime style, manga, vibrant colors, clean lines, cel shading, studio ghibli quality",
    negativePrompt: "photorealistic, 3d render, photograph, blurry",
    recommendedCfg: 5.0,
    recommendedSteps: null,
  },
  {
    id: "watercolor",
    name: "Watercolor",
    description: "Soft, painterly watercolor texture",
    icon: "🎨",
    gradient: "from-cyan-900/40 to-teal-900/30",
    promptSuffix: ", watercolor painting, soft edges, visible brush strokes, paper texture, delicate washes",
    negativePrompt: "photorealistic, sharp edges, digital art, 3d render",
    recommendedCfg: 3.5,
    recommendedSteps: null,
  },
  {
    id: "digital-art",
    name: "Digital Art",
    description: "Polished digital illustration",
    icon: "✨",
    gradient: "from-violet-900/40 to-blue-900/30",
    promptSuffix: ", digital art, polished illustration, vibrant, trending on artstation, high detail",
    negativePrompt: "photograph, blurry, low quality, ugly",
    recommendedCfg: 4.0,
    recommendedSteps: null,
  },
  {
    id: "concept-art",
    name: "Concept",
    description: "Environment and character concept art",
    icon: "⚔️",
    gradient: "from-emerald-900/40 to-stone-900/30",
    promptSuffix: ", concept art, matte painting, epic composition, detailed environment, fantasy art",
    negativePrompt: "photograph, blurry, amateur, low resolution",
    recommendedCfg: 4.5,
    recommendedSteps: null,
  },
  {
    id: "pixel-art",
    name: "Pixel",
    description: "Retro pixel art style",
    icon: "👾",
    gradient: "from-green-900/40 to-lime-900/30",
    promptSuffix: ", pixel art, retro game style, 16-bit, limited palette, crisp pixels",
    negativePrompt: "photorealistic, 3d render, smooth, blurry, high resolution photograph",
    recommendedCfg: 5.0,
    recommendedSteps: null,
  },
  {
    id: "line-art",
    name: "Line Art",
    description: "Clean black and white line drawing",
    icon: "✏️",
    gradient: "from-zinc-700/40 to-zinc-800/30",
    promptSuffix: ", line art, black and white, clean lines, ink drawing, minimalist, high contrast",
    negativePrompt: "color, photorealistic, blurry, painting, watercolor",
    recommendedCfg: 4.0,
    recommendedSteps: null,
  },
];
