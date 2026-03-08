"""Adapter manager — handles download, deletion, and status checks for adapter models."""

import logging
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Callable

from imagen_heap.adapters import AdapterEntry, get_adapter_registry, get_adapter_by_id

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int, int], None]
"""Callback(adapter_id, bytes_downloaded, total_bytes)"""


class AdapterManager:
    """Manages adapter model downloads, cache detection, and deletion."""

    def __init__(self) -> None:
        self._hf_cache_dir = Path(os.path.expanduser("~/.cache/huggingface/hub"))
        logger.info("AdapterManager initialized, HF cache=%s", self._hf_cache_dir)

    def _hf_model_cache_dir(self, hf_repo_id: str) -> Path:
        """Return the HuggingFace hub cache directory for a repo."""
        return self._hf_cache_dir / f"models--{hf_repo_id.replace('/', '--')}"

    def is_downloaded(self, adapter_id: str) -> bool:
        """Check if an adapter's weights are already cached in the HF hub."""
        entry = get_adapter_by_id(adapter_id)
        if not entry:
            return False
        cache_dir = self._hf_model_cache_dir(entry.hf_repo_id)
        if not cache_dir.exists():
            return False
        # Check for at least one snapshot with weight files
        snapshots_dir = cache_dir / "snapshots"
        if not snapshots_dir.exists():
            return False
        for snapshot in snapshots_dir.iterdir():
            if snapshot.is_dir():
                # Redux has safetensors files
                for f in snapshot.rglob("*"):
                    if f.suffix in (".safetensors", ".bin", ".pt") and f.stat().st_size > 0:
                        return True
        return False

    def get_all_adapters(self) -> list[dict]:
        """Return all adapters from registry with download status."""
        result = []
        for entry in get_adapter_registry():
            d = entry.to_dict()
            d["status"] = "downloaded" if self.is_downloaded(entry.id) else "available"
            result.append(d)
        return result

    def download_adapter(
        self,
        adapter_id: str,
        progress_callback: ProgressCallback | None = None,
        hf_token: str | None = None,
    ) -> dict:
        """Download an adapter model from HuggingFace."""
        entry = get_adapter_by_id(adapter_id)
        if entry is None:
            raise ValueError(f"Unknown adapter: {adapter_id}")

        if self.is_downloaded(adapter_id):
            logger.info("Adapter %s already downloaded", adapter_id)
            d = entry.to_dict()
            d["status"] = "downloaded"
            return d

        logger.info("Downloading adapter %s from %s", entry.name, entry.hf_repo_id)

        try:
            from huggingface_hub import snapshot_download

            # Load saved HF token if none provided
            if not hf_token:
                hf_token = self._load_hf_token()
            logger.info("Using HF token: %s", "provided" if hf_token else "none")

            total_bytes = entry.file_size_bytes
            cache_dir = str(self._hf_model_cache_dir(entry.hf_repo_id))

            # Monitor download progress by polling cache directory size
            stop_monitor = threading.Event()
            if progress_callback and total_bytes > 0:
                def _monitor_progress() -> None:
                    while not stop_monitor.is_set():
                        size = self._dir_size_fast(cache_dir)
                        # Clamp to total_bytes - 1 while still downloading
                        # to prevent showing 100% before snapshot_download returns
                        reported = min(size, total_bytes - 1) if not stop_monitor.is_set() else total_bytes
                        progress_callback(adapter_id, reported, total_bytes)
                        stop_monitor.wait(1.5)

                monitor = threading.Thread(target=_monitor_progress, daemon=True)
                monitor.start()

            # For large model repos, only download safetensors + config files
            # to avoid pulling flax, onnx, and openvino variants
            allow_patterns = None
            if entry.adapter_type == "model":
                allow_patterns = [
                    "*.safetensors",
                    "*.json",
                    "*.txt",
                    "*.model",
                ]

            snapshot_download(
                repo_id=entry.hf_repo_id,
                repo_type="model",
                token=hf_token or None,
                allow_patterns=allow_patterns,
            )

            stop_monitor.set()
            if progress_callback:
                progress_callback(adapter_id, total_bytes, total_bytes)

            logger.info("Adapter download complete: %s", adapter_id)
            d = entry.to_dict()
            d["status"] = "downloaded"
            return d

        except Exception as e:
            error_str = str(e)
            logger.exception("HuggingFace download failed for adapter %s", adapter_id)

            # 403 "not in authorized list" = need to accept license
            if "not in the authorized list" in error_str or ("403" in error_str and "gated" in error_str.lower()):
                raise RuntimeError(
                    f"LICENSE_REQUIRED: Adapter '{entry.name}' requires you to accept its license. "
                    f"Visit {entry.source_url} and click 'Agree and access repository', then retry."
                ) from e

            # GatedRepoError with token = license not accepted for this specific model
            if ("gated" in error_str.lower() or "401" in error_str) and hf_token:
                raise RuntimeError(
                    f"LICENSE_REQUIRED: Adapter '{entry.name}' requires you to accept its license. "
                    f"Visit {entry.source_url} and click 'Agree and access repository', then retry. "
                    f"Your HuggingFace token is already saved."
                ) from e

            # GatedRepoError without token = need auth
            if "gated" in error_str.lower() or "401" in error_str:
                raise RuntimeError(
                    f"AUTH_REQUIRED: Adapter '{entry.name}' requires HuggingFace authentication. "
                    f"Visit {entry.source_url} to accept the license, then enter your HF token."
                ) from e

            raise RuntimeError(f"Adapter download failed: {e}") from e

    def delete_adapter(self, adapter_id: str) -> bool:
        """Delete an adapter's cached files from the HF hub cache."""
        entry = get_adapter_by_id(adapter_id)
        if entry is None:
            return False

        cache_dir = self._hf_model_cache_dir(entry.hf_repo_id)
        if cache_dir.exists():
            logger.info("Removing adapter cache: %s", cache_dir)
            shutil.rmtree(cache_dir, ignore_errors=True)
            return True

        logger.info("Adapter %s not found in cache", adapter_id)
        return False

    def _load_hf_token(self) -> str | None:
        """Load saved HuggingFace token (shared with ModelManager)."""
        # Check the app's model manager token (canonical location)
        models_token_path = Path(os.path.expanduser("~/.imagen-heap/models/.hf_token"))
        if models_token_path.exists():
            token = models_token_path.read_text().strip()
            if token:
                return token
        # Fall back to HF CLI cached token
        hf_token_path = Path(os.path.expanduser("~/.cache/huggingface/token"))
        if hf_token_path.exists():
            token = hf_token_path.read_text().strip()
            if token:
                return token
        return None

    @staticmethod
    def _dir_size_fast(path: str) -> int:
        """Quickly estimate directory size by summing file sizes."""
        total = 0
        try:
            for dirpath, _dirs, files in os.walk(path, followlinks=True):
                for f in files:
                    try:
                        total += os.stat(os.path.join(dirpath, f)).st_size
                    except OSError:
                        pass
        except OSError:
            pass
        return total
