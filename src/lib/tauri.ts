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

/** Get all models with download status */
export async function getModels(): Promise<Array<{
  id: string;
  name: string;
  version: string;
  architecture: string;
  license_spdx: string;
  file_size_bytes: number;
  quantization: string;
  min_memory_mb: number;
  source_url: string;
  is_default: boolean;
  description: string;
  status: string;
  local_path: string | null;
  downloaded_at: string | null;
}>> {
  return invoke("get_models");
}

/** Check if first run (no models downloaded) */
export async function isFirstRun(): Promise<{ is_first_run: boolean }> {
  return invoke("is_first_run");
}

/** Get default models for first-run download */
export async function getDefaultDownloads(): Promise<Array<{
  id: string;
  name: string;
  file_size_bytes: number;
  quantization: string;
  already_downloaded: boolean;
}>> {
  return invoke("get_default_downloads");
}

/** Download a model */
export async function downloadModel(modelId: string): Promise<Record<string, unknown>> {
  return invoke("download_model", { modelId });
}

/** Delete a model */
export async function deleteModel(modelId: string): Promise<{ success: boolean; model_id: string }> {
  return invoke("delete_model", { modelId });
}

/** Get disk usage */
export async function getDiskUsage(): Promise<{ used_bytes: number; model_count: number }> {
  return invoke("get_disk_usage");
}

/** Save HuggingFace API token */
export async function saveHfToken(token: string): Promise<{ success: boolean }> {
  return invoke("save_hf_token", { token });
}

/** Mark the first-run wizard as completed */
export async function markWizardDone(): Promise<{ success: boolean }> {
  return invoke("mark_wizard_done");
}
