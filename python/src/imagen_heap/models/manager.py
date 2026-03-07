"""Model manager — handles download, verification, storage, and catalog operations."""

import hashlib
import json
import logging
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from imagen_heap.models import ModelEntry, get_registry, get_default_models, get_model_by_id

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int, int], None]
"""Callback(model_id, bytes_downloaded, total_bytes)"""


@dataclass
class DownloadedModel:
    """A model that has been downloaded to disk."""
    entry: ModelEntry
    local_path: str
    downloaded_at: str

    def to_dict(self) -> dict:
        d = self.entry.to_dict()
        d["local_path"] = self.local_path
        d["downloaded_at"] = self.downloaded_at
        d["status"] = "downloaded"
        return d


class ModelManager:
    """Manages model downloads, storage, and catalog queries."""

    def __init__(self, models_dir: str) -> None:
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._catalog_path = self.models_dir / "catalog.json"
        self._catalog: dict[str, DownloadedModel] = {}
        self._load_catalog()
        logger.info("ModelManager initialized, models_dir=%s, %d models downloaded",
                     self.models_dir, len(self._catalog))

    def _load_catalog(self) -> None:
        """Load the catalog of downloaded models from disk."""
        if self._catalog_path.exists():
            try:
                data = json.loads(self._catalog_path.read_text())
                for item in data:
                    entry = get_model_by_id(item["id"])
                    if entry and os.path.exists(item.get("local_path", "")):
                        self._catalog[entry.id] = DownloadedModel(
                            entry=entry,
                            local_path=item["local_path"],
                            downloaded_at=item.get("downloaded_at", ""),
                        )
            except Exception as e:
                logger.warning("Failed to load catalog: %s", e)

    def _save_catalog(self) -> None:
        """Save the catalog to disk."""
        data = []
        for model in self._catalog.values():
            data.append({
                "id": model.entry.id,
                "local_path": model.local_path,
                "downloaded_at": model.downloaded_at,
            })
        self._catalog_path.write_text(json.dumps(data, indent=2))

    def get_all_models(self) -> list[dict]:
        """Return all models from registry with their download status."""
        result = []
        for entry in get_registry():
            if entry.id in self._catalog:
                result.append(self._catalog[entry.id].to_dict())
            else:
                d = entry.to_dict()
                d["status"] = "available"
                d["local_path"] = None
                d["downloaded_at"] = None
                result.append(d)
        return result

    def get_downloaded_models(self) -> list[dict]:
        """Return only downloaded models."""
        return [m.to_dict() for m in self._catalog.values()]

    def get_default_download_list(self) -> list[dict]:
        """Return the default models that should be downloaded on first run."""
        defaults = get_default_models()
        return [
            {
                **d.to_dict(),
                "already_downloaded": d.id in self._catalog,
            }
            for d in defaults
        ]

    def is_first_run(self) -> bool:
        """Check if this is the first run (no models downloaded)."""
        return len(self._catalog) == 0

    def simulate_download(
        self,
        model_id: str,
        progress_callback: ProgressCallback | None = None,
    ) -> dict:
        """Simulate downloading a model (for development without real model files).

        In production, this would download from source_url with resumable HTTP.
        For now, it creates a small placeholder file.
        """
        entry = get_model_by_id(model_id)
        if entry is None:
            raise ValueError(f"Unknown model: {model_id}")

        if model_id in self._catalog:
            return self._catalog[model_id].to_dict()

        logger.info("Simulating download for %s (%s)", entry.name, entry.quantization)

        local_path = str(self.models_dir / entry.filename)

        # Simulate download progress
        total_size = entry.file_size_bytes
        chunk_size = total_size // 10
        downloaded = 0

        for i in range(10):
            downloaded = min(downloaded + chunk_size, total_size)
            if progress_callback:
                progress_callback(model_id, downloaded, total_size)
            time.sleep(0.1)  # Simulate network delay

        # Create a small placeholder file
        Path(local_path).write_text(json.dumps({
            "model_id": model_id,
            "name": entry.name,
            "placeholder": True,
            "note": "This is a placeholder. Real model file would be a safetensors/GGUF file.",
        }, indent=2))

        model = DownloadedModel(
            entry=entry,
            local_path=local_path,
            downloaded_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
        self._catalog[model_id] = model
        self._save_catalog()

        logger.info("Download complete: %s → %s", model_id, local_path)
        return model.to_dict()

    def delete_model(self, model_id: str) -> bool:
        """Delete a downloaded model."""
        if model_id not in self._catalog:
            return False

        model = self._catalog[model_id]
        try:
            if os.path.exists(model.local_path):
                os.remove(model.local_path)
        except OSError as e:
            logger.warning("Failed to delete model file: %s", e)

        del self._catalog[model_id]
        self._save_catalog()
        logger.info("Deleted model: %s", model_id)
        return True

    def get_disk_usage(self) -> dict:
        """Return total disk usage of downloaded models."""
        total = 0
        for model in self._catalog.values():
            if os.path.exists(model.local_path):
                total += os.path.getsize(model.local_path)
        return {
            "used_bytes": total,
            "model_count": len(self._catalog),
        }
