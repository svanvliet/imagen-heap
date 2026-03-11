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

/** Cancel the current generation */
export async function cancelGeneration(): Promise<void> {
  await invoke("cancel_generation");
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
  character_id?: string | null;
  character_strength?: number;
  adapter_type?: string;
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

/** Reset the wizard so it shows again on next launch */
export async function resetWizard(): Promise<{ success: boolean }> {
  return invoke("reset_wizard");
}

/** Open the model's folder in the system file manager */
export async function revealModelFolder(modelId: string): Promise<void> {
  return invoke("reveal_model_folder", { modelId });
}

// --- Character management ---

/** List all characters */
export async function listCharacters(): Promise<Array<{
  id: string;
  name: string;
  description: string;
  reference_images: string[];
  thumbnail: string;
  adapter_type: string;
  created_at: string;
  last_used_at: string | null;
}>> {
  return invoke("list_characters");
}

/** Create a new character */
export async function createCharacter(
  name: string,
  description: string,
  referenceImagePaths: string[],
): Promise<Record<string, unknown>> {
  return invoke("create_character", { name, description, referenceImagePaths });
}

/** Update character metadata */
export async function updateCharacter(
  characterId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return invoke("update_character", { characterId, updates });
}

/** Delete a character */
export async function deleteCharacter(characterId: string): Promise<{ success: boolean; character_id: string }> {
  return invoke("delete_character", { characterId });
}

/** Add a reference image to an existing character */
export async function addReferenceImage(
  characterId: string,
  imagePath: string,
): Promise<Record<string, unknown>> {
  return invoke("add_reference_image", { characterId, imagePath });
}

/** Remove a reference image by index */
export async function removeReferenceImage(
  characterId: string,
  imageIndex: number,
): Promise<Record<string, unknown>> {
  return invoke("remove_reference_image", { characterId, imageIndex });
}

/** Get a single character */
export async function getCharacter(characterId: string): Promise<Record<string, unknown>> {
  return invoke("get_character", { characterId });
}

/** Set a LoRA file for a character */
export async function setCharacterLora(
  characterId: string,
  loraPath: string,
  triggerWord: string,
): Promise<Record<string, unknown>> {
  return invoke("set_character_lora", { characterId, loraPath, triggerWord });
}

/** Remove LoRA from a character */
export async function removeCharacterLora(
  characterId: string,
): Promise<Record<string, unknown>> {
  return invoke("remove_character_lora", { characterId });
}

// --- Adapter management ---

/** Get available runtime providers */
export async function getAvailableProviders(): Promise<{ mlx: boolean; diffusers: boolean; faceid: boolean }> {
  return invoke("get_available_providers");
}

/** List all adapters with download status */
export async function getAdapters(): Promise<{ adapters: Array<{
  id: string;
  name: string;
  adapter_type: string;
  hf_repo_id: string;
  compatible_models: string[];
  file_size_bytes: number;
  license_spdx: string;
  description: string;
  source_url: string;
  requires_provider: string;
  status: string;
}> }> {
  return invoke("get_adapters");
}

/** Download an adapter model */
export async function downloadAdapter(adapterId: string): Promise<Record<string, unknown>> {
  return invoke("download_adapter", { adapterId });
}

/** Delete a downloaded adapter */
export async function deleteAdapter(adapterId: string): Promise<{ success: boolean; adapter_id: string }> {
  return invoke("delete_adapter", { adapterId });
}

/** Reveal a file in the system file manager (Finder on macOS) */
export async function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}
