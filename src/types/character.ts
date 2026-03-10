/** Types for the character system */

export interface Character {
  id: string;
  name: string;
  description: string;
  adapterType: "instantid" | "photomaker" | "pulid" | "auto" | "lora";
  adapterConfigJson: string;
  thumbnailPath?: string;
  referenceImages: CharacterImage[];
  createdAt: string;
  lastUsedAt: string;
  // LoRA fields
  loraPath?: string;
  loraFilename?: string;
  loraFileSize?: number;
  triggerWord?: string;
}

export interface CharacterImage {
  id: string;
  characterId: string;
  imagePath: string;
  sortOrder: number;
}
