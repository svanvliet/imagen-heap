/**
 * Tauri command wrappers — typed functions for calling Rust backend commands.
 */
import { invoke } from "@tauri-apps/api/core";

/** Ping the Python backend */
export async function pingBackend(): Promise<{
  status: string;
  version: string;
  python_version: string;
  platform: string;
}> {
  return invoke("ping_backend");
}

/** Get backend process status */
export async function getBackendStatus(): Promise<string> {
  return invoke("get_backend_status");
}

/** Request image generation */
export async function generateImage(config: {
  prompt: string;
  negative_prompt: string;
  seed: number;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  quality_profile: string;
  model_id: string;
  sampler: string;
  scheduler: string;
}): Promise<{
  id: string;
  image_path: string;
  thumbnail_path: string;
  config: Record<string, unknown>;
  generation_time_ms: number;
  created_at: string;
}> {
  return invoke("generate_image", { config });
}
