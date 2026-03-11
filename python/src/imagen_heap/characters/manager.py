"""Character manager — CRUD operations for character cards with file-based storage."""

import json
import logging
import shutil
import time
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)


class CharacterManager:
    """Manages character cards stored in ~/.imagen-heap/characters/{id}/."""

    def __init__(self, base_dir: str) -> None:
        self.base_dir = Path(base_dir)
        self.characters_dir = self.base_dir / "characters"
        self.characters_dir.mkdir(parents=True, exist_ok=True)
        logger.info("CharacterManager initialized, dir=%s", self.characters_dir)

    def list_characters(self) -> list[dict]:
        """List all characters, sorted by last_used_at desc then created_at desc."""
        characters = []
        if not self.characters_dir.exists():
            return characters

        for char_dir in self.characters_dir.iterdir():
            if not char_dir.is_dir():
                continue
            meta_path = char_dir / "metadata.json"
            if not meta_path.exists():
                continue
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                # Ensure reference image paths are valid
                meta["reference_images"] = [
                    img for img in meta.get("reference_images", [])
                    if Path(img).exists()
                ]
                characters.append(meta)
            except Exception:
                logger.warning("Failed to read character at %s", char_dir, exc_info=True)

        characters.sort(
            key=lambda c: c.get("last_used_at") or c.get("created_at", ""),
            reverse=True,
        )
        return characters

    def get_character(self, character_id: str) -> dict | None:
        """Get a single character by ID."""
        meta_path = self.characters_dir / character_id / "metadata.json"
        if not meta_path.exists():
            return None
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            logger.warning("Failed to read character %s", character_id, exc_info=True)
            return None

    def create_character(
        self,
        name: str,
        description: str = "",
        reference_image_paths: list[str] | None = None,
    ) -> dict:
        """Create a new character card.

        Reference images are copied into the character's directory.
        The first image is used to generate a thumbnail.
        """
        character_id = str(uuid.uuid4())[:8]
        char_dir = self.characters_dir / character_id
        char_dir.mkdir(parents=True, exist_ok=True)

        images_dir = char_dir / "images"
        images_dir.mkdir(exist_ok=True)

        copied_images: list[str] = []
        thumbnail_path = ""

        for i, src_path in enumerate(reference_image_paths or []):
            src = Path(src_path)
            if not src.exists():
                logger.warning("Reference image not found: %s", src_path)
                continue

            ext = src.suffix.lower() or ".png"
            dest = images_dir / f"ref_{i:02d}{ext}"
            shutil.copy2(str(src), str(dest))
            copied_images.append(str(dest))
            logger.debug("Copied reference image %s → %s", src, dest)

        # Generate thumbnail from first reference image
        if copied_images:
            thumbnail_path = str(char_dir / "thumbnail.png")
            try:
                from PIL import Image
                img = Image.open(copied_images[0])
                img.thumbnail((128, 128))
                img.save(thumbnail_path)
                logger.debug("Generated thumbnail for character %s", character_id)
            except Exception:
                logger.warning("Thumbnail generation failed, using original", exc_info=True)
                thumbnail_path = copied_images[0]

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        metadata = {
            "id": character_id,
            "name": name,
            "description": description,
            "reference_images": copied_images,
            "thumbnail": thumbnail_path,
            "adapter_type": "auto",
            "created_at": now,
            "last_used_at": None,
        }

        meta_path = char_dir / "metadata.json"
        meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        logger.info("Created character '%s' (id=%s) with %d images", name, character_id, len(copied_images))

        return metadata

    def update_character(self, character_id: str, updates: dict) -> dict | None:
        """Update character metadata (name, description).

        Does NOT handle reference image changes — use add/remove image methods for that.
        """
        meta_path = self.characters_dir / character_id / "metadata.json"
        if not meta_path.exists():
            return None

        meta = json.loads(meta_path.read_text(encoding="utf-8"))

        # Only allow updating safe fields
        allowed = {"name", "description", "adapter_type", "trigger_word"}
        for key in allowed:
            if key in updates:
                meta[key] = updates[key]

        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        logger.info("Updated character %s: %s", character_id, list(updates.keys()))
        return meta

    def delete_character(self, character_id: str) -> bool:
        """Delete a character and all its files."""
        char_dir = self.characters_dir / character_id
        if not char_dir.exists():
            return False

        shutil.rmtree(str(char_dir))
        logger.info("Deleted character %s", character_id)
        return True

    def mark_used(self, character_id: str) -> None:
        """Update last_used_at timestamp for a character."""
        meta_path = self.characters_dir / character_id / "metadata.json"
        if not meta_path.exists():
            return

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["last_used_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    def add_reference_image(self, character_id: str, image_path: str) -> dict | None:
        """Add a reference image to an existing character (max 5)."""
        char_dir = self.characters_dir / character_id
        meta_path = char_dir / "metadata.json"
        if not meta_path.exists():
            return None

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        images = meta.get("reference_images", [])

        if len(images) >= 5:
            raise ValueError("Maximum 5 reference images per character")

        src = Path(image_path)
        if not src.exists():
            raise ValueError(f"Image not found: {image_path}")

        images_dir = char_dir / "images"
        images_dir.mkdir(exist_ok=True)
        idx = len(images)
        ext = src.suffix.lower() or ".png"
        dest = images_dir / f"ref_{idx:02d}{ext}"
        shutil.copy2(str(src), str(dest))
        images.append(str(dest))
        meta["reference_images"] = images

        # Regenerate thumbnail if this is the first image
        if len(images) == 1:
            thumbnail_path = str(char_dir / "thumbnail.png")
            try:
                from PIL import Image
                img = Image.open(str(dest))
                img.thumbnail((128, 128))
                img.save(thumbnail_path)
                meta["thumbnail"] = thumbnail_path
            except Exception:
                meta["thumbnail"] = str(dest)

        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        return meta

    def remove_reference_image(self, character_id: str, image_index: int) -> dict | None:
        """Remove a reference image by index."""
        meta_path = self.characters_dir / character_id / "metadata.json"
        if not meta_path.exists():
            return None

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        images = meta.get("reference_images", [])

        if image_index < 0 or image_index >= len(images):
            raise ValueError(f"Invalid image index: {image_index}")

        removed = images.pop(image_index)
        try:
            Path(removed).unlink(missing_ok=True)
        except Exception:
            pass

        meta["reference_images"] = images
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        return meta

    def set_lora(self, character_id: str, lora_file_path: str, trigger_word: str = "") -> dict | None:
        """Attach a LoRA .safetensors file to a character.

        Copies the file into the character's lora/ directory and updates metadata.
        """
        char_dir = self.characters_dir / character_id
        meta_path = char_dir / "metadata.json"
        if not meta_path.exists():
            return None

        src = Path(lora_file_path)
        if not src.exists():
            raise ValueError(f"LoRA file not found: {lora_file_path}")

        lora_dir = char_dir / "lora"
        lora_dir.mkdir(exist_ok=True)
        dest = lora_dir / "lora.safetensors"
        shutil.copy2(str(src), str(dest))
        logger.info("Copied LoRA %s → %s", src, dest)

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["lora_path"] = str(dest)
        meta["lora_filename"] = src.name
        meta["lora_file_size"] = dest.stat().st_size
        meta["trigger_word"] = trigger_word
        meta["adapter_type"] = "lora"
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        logger.info("Set LoRA for character %s (trigger=%s)", character_id, trigger_word)
        return meta

    def remove_lora(self, character_id: str) -> dict | None:
        """Remove LoRA file and metadata from a character."""
        char_dir = self.characters_dir / character_id
        meta_path = char_dir / "metadata.json"
        if not meta_path.exists():
            return None

        lora_dir = char_dir / "lora"
        if lora_dir.exists():
            shutil.rmtree(str(lora_dir))
            logger.info("Removed LoRA directory for character %s", character_id)

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        for key in ("lora_path", "lora_filename", "lora_file_size", "trigger_word"):
            meta.pop(key, None)
        meta["adapter_type"] = "auto"
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        logger.info("Cleared LoRA metadata for character %s", character_id)
        return meta

    def get_lora_path(self, character_id: str) -> str | None:
        """Return the LoRA .safetensors path if it exists on disk."""
        char_dir = self.characters_dir / character_id
        lora_file = char_dir / "lora" / "lora.safetensors"
        if lora_file.exists():
            return str(lora_file)
        return None

    def get_reference_image_paths(self, character_id: str) -> list[str]:
        """Get validated reference image paths for a character.

        Returns only paths that actually exist on disk.
        """
        meta = self.get_character(character_id)
        if not meta:
            return []

        paths = [p for p in meta.get("reference_images", []) if Path(p).exists()]
        if not paths:
            logger.warning("Character %s has no valid reference images", character_id)
        return paths
