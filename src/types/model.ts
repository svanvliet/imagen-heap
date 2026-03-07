/** Types for model management */

export type ModelStatus = "available" | "downloading" | "downloaded" | "error";
export type QuantizationLevel = "q4" | "q8" | "fp16";
export type LicenseType = "apache-2.0" | "non-commercial" | "community" | "openrail" | "unknown";

export interface Model {
  id: string;
  name: string;
  version: string;
  architecture: string;
  licenseSpdx: LicenseType;
  fileSizeBytes: number;
  quantization: QuantizationLevel;
  minMemoryMb: number;
  sourceUrl: string;
  localPath?: string;
  checksumSha256: string;
  isDefault: boolean;
  status: ModelStatus;
  downloadProgress?: number;
}
