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

    def _validate_local_path(self, local_path: str) -> bool:
        """Check that a downloaded model's local path actually contains model files."""
        if not local_path or not os.path.exists(local_path):
            return False
        if os.path.isdir(local_path):
            # HF snapshot dirs use symlinks to blobs — verify at least one
            # .safetensors or .bin file exists (following symlinks)
            for dirpath, _dirs, files in os.walk(local_path, followlinks=True):
                for f in files:
                    if f.endswith((".safetensors", ".bin", ".gguf")):
                        fp = os.path.join(dirpath, f)
                        if os.path.isfile(fp) and os.path.getsize(fp) > 0:
                            return True
            # Directory exists but has no model weights
            logger.warning("Model path exists but contains no weight files: %s", local_path)
            return False
        # Single file
        return os.path.isfile(local_path) and os.path.getsize(local_path) > 0

    def _load_catalog(self) -> None:
        """Load the catalog of downloaded models from disk, pruning stale entries."""
        if self._catalog_path.exists():
            pruned = False
            try:
                data = json.loads(self._catalog_path.read_text())
                for item in data:
                    entry = get_model_by_id(item["id"])
                    local_path = item.get("local_path", "")
                    if entry and self._validate_local_path(local_path):
                        self._catalog[entry.id] = DownloadedModel(
                            entry=entry,
                            local_path=local_path,
                            downloaded_at=item.get("downloaded_at", ""),
                        )
                    elif entry:
                        logger.warning("Pruning stale catalog entry: %s (path missing or empty: %s)",
                                       item["id"], local_path)
                        pruned = True
                if pruned:
                    self._save_catalog()
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
        """Check if this is the first run (wizard not yet completed)."""
        wizard_done_path = self.models_dir / ".wizard_done"
        return not wizard_done_path.exists()

    def mark_wizard_done(self) -> None:
        """Mark the first-run wizard as completed."""
        wizard_done_path = self.models_dir / ".wizard_done"
        wizard_done_path.write_text("done")
        logger.info("First-run wizard marked as completed")

    def download_model(
        self,
        model_id: str,
        progress_callback: ProgressCallback | None = None,
        hf_token: str | None = None,
    ) -> dict:
        """Download a model from HuggingFace.

        Uses huggingface_hub to download model files. mflux will find
        them in the HF cache when loading for inference.

        Args:
            hf_token: Optional HuggingFace API token for gated repos.
        """
        entry = get_model_by_id(model_id)
        if entry is None:
            raise ValueError(f"Unknown model: {model_id}")

        if model_id in self._catalog:
            logger.info("Model %s already downloaded", model_id)
            return self._catalog[model_id].to_dict()

        if not entry.hf_repo_id:
            return self._simulate_download(model_id, progress_callback)

        logger.info("Downloading model %s from %s", entry.name, entry.hf_repo_id)

        try:
            from huggingface_hub import snapshot_download

            # Use provided token, or fall back to saved token, or cached login
            token = hf_token or self._load_hf_token()
            logger.info("Using HF token: %s", "provided" if hf_token else ("saved" if token else "none"))

            local_path = snapshot_download(
                repo_id=entry.hf_repo_id,
                repo_type="model",
                token=token or None,
            )

            logger.info("Download complete: %s → %s", model_id, local_path)

            if progress_callback:
                progress_callback(model_id, entry.file_size_bytes, entry.file_size_bytes)

            model = DownloadedModel(
                entry=entry,
                local_path=str(local_path),
                downloaded_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            )
            self._catalog[model_id] = model
            self._save_catalog()
            return model.to_dict()

        except Exception as e:
            error_str = str(e)
            logger.exception("HuggingFace download failed for %s", model_id)

            # Differentiate: 403 "not in authorized list" = need to accept license on HF website
            if "not in the authorized list" in error_str or ("403" in error_str and "gated" in error_str.lower()):
                raise RuntimeError(
                    f"LICENSE_REQUIRED: Model '{entry.name}' requires you to accept its license. "
                    f"Visit {entry.source_url} and click 'Agree and access repository', then retry."
                ) from e

            # 401 / generic gated = need HF token
            if "gated" in error_str.lower() or "401" in error_str:
                raise RuntimeError(
                    f"AUTH_REQUIRED: Model '{entry.name}' requires HuggingFace authentication. "
                    f"Visit {entry.source_url} to accept the license, then enter your HF token."
                ) from e

            raise RuntimeError(f"Download failed: {e}") from e

    def save_hf_token(self, token: str) -> None:
        """Save HuggingFace API token to disk."""
        token_path = self.models_dir / ".hf_token"
        token_path.write_text(token.strip())
        logger.info("HuggingFace token saved")

    def _load_hf_token(self) -> str | None:
        """Load saved HuggingFace token, if any."""
        token_path = self.models_dir / ".hf_token"
        if token_path.exists():
            token = token_path.read_text().strip()
            if token:
                return token
        return None

    def _simulate_download(
        self,
        model_id: str,
        progress_callback: ProgressCallback | None = None,
    ) -> dict:
        """Fallback simulated download for models without HF repo IDs."""
        entry = get_model_by_id(model_id)
        if entry is None:
            raise ValueError(f"Unknown model: {model_id}")

        logger.info("Simulating download for %s (%s)", entry.name, entry.quantization)

        local_path = str(self.models_dir / entry.filename)

        total_size = entry.file_size_bytes
        chunk_size = total_size // 10
        downloaded = 0

        for i in range(10):
            downloaded = min(downloaded + chunk_size, total_size)
            if progress_callback:
                progress_callback(model_id, downloaded, total_size)
            time.sleep(0.1)

        Path(local_path).write_text(json.dumps({
            "model_id": model_id,
            "name": entry.name,
            "placeholder": True,
        }, indent=2))

        model = DownloadedModel(
            entry=entry,
            local_path=local_path,
            downloaded_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
        self._catalog[model_id] = model
        self._save_catalog()
        logger.info("Simulated download complete: %s", model_id)
        return model.to_dict()

    def delete_model(self, model_id: str) -> bool:
        """Delete a downloaded model and clean up its HF cache."""
        if model_id not in self._catalog:
            return False

        model = self._catalog[model_id]
        local_path = model.local_path
        try:
            if os.path.exists(local_path):
                if os.path.isdir(local_path):
                    # For HF cache: the snapshot dir is under
                    # ~/.cache/huggingface/hub/models--org--name/snapshots/rev/
                    # Removing the entire model repo dir cleans blobs too
                    hf_model_dir = self._find_hf_model_dir(local_path)
                    if hf_model_dir and os.path.isdir(hf_model_dir):
                        logger.info("Removing HF cache dir: %s", hf_model_dir)
                        shutil.rmtree(hf_model_dir, ignore_errors=True)
                    else:
                        shutil.rmtree(local_path, ignore_errors=True)
                else:
                    os.remove(local_path)
        except OSError as e:
            logger.warning("Failed to delete model files: %s", e)

        del self._catalog[model_id]
        self._save_catalog()
        logger.info("Deleted model: %s", model_id)
        return True

    @staticmethod
    def _find_hf_model_dir(snapshot_path: str) -> str | None:
        """Given a snapshot path like .../models--org--name/snapshots/rev, return the models--org--name dir."""
        parts = Path(snapshot_path).parts
        for i, part in enumerate(parts):
            if part.startswith("models--"):
                return str(Path(*parts[: i + 1]))
        return None

    def get_disk_usage(self) -> dict:
        """Return total disk usage of downloaded models (follows symlinks)."""
        total = 0
        seen_inodes: set[tuple[int, int]] = set()
        for model in self._catalog.values():
            path = model.local_path
            if os.path.isdir(path):
                for dirpath, _dirnames, filenames in os.walk(path, followlinks=True):
                    for f in filenames:
                        fp = os.path.join(dirpath, f)
                        try:
                            stat = os.stat(fp)  # follows symlinks
                            inode_key = (stat.st_dev, stat.st_ino)
                            if inode_key not in seen_inodes:
                                seen_inodes.add(inode_key)
                                total += stat.st_size
                        except OSError:
                            pass
            elif os.path.isfile(path):
                total += os.stat(path).st_size
        return {
            "used_bytes": total,
            "model_count": len(self._catalog),
        }
