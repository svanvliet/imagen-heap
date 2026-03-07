"""Tests for model management."""

import json
import os
import tempfile

from imagen_heap.models import get_registry, get_default_models, get_model_by_id
from imagen_heap.models.manager import ModelManager


class TestModelRegistry:
    def test_registry_not_empty(self):
        assert len(get_registry()) > 0

    def test_default_models_exist(self):
        defaults = get_default_models()
        assert len(defaults) >= 1  # at least schnell

    def test_get_model_by_id(self):
        model = get_model_by_id("flux-schnell-q8")
        assert model is not None
        assert model.name == "FLUX.1-schnell"
        assert model.license_spdx == "apache-2.0"

    def test_unknown_model_returns_none(self):
        assert get_model_by_id("nonexistent") is None

    def test_model_to_dict(self):
        model = get_model_by_id("flux-schnell-q8")
        d = model.to_dict()
        assert "id" in d
        assert "name" in d
        assert "license_spdx" in d


class TestModelManager:
    def setup_method(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.manager = ModelManager(self.tmp_dir)

    def test_first_run_initially(self):
        assert self.manager.is_first_run()

    def test_get_all_models(self):
        models = self.manager.get_all_models()
        assert len(models) == len(get_registry())
        assert all(m["status"] == "available" for m in models)

    def test__simulate_download(self):
        result = self.manager._simulate_download("flux-schnell-q8")
        assert result["status"] == "downloaded"
        assert result["local_path"]
        assert os.path.exists(result["local_path"])

    def test_after_download_not_first_run(self):
        self.manager._simulate_download("flux-schnell-q8")
        # is_first_run is based on wizard completion, not downloads
        assert self.manager.is_first_run()
        self.manager.mark_wizard_done()
        assert not self.manager.is_first_run()

    def test_download_progress_callback(self):
        progress_updates = []
        def on_progress(model_id, downloaded, total):
            progress_updates.append((model_id, downloaded, total))

        self.manager._simulate_download("flux-schnell-q8", progress_callback=on_progress)
        assert len(progress_updates) == 10
        assert progress_updates[-1][0] == "flux-schnell-q8"

    def test_delete_model(self):
        self.manager._simulate_download("flux-schnell-q8")
        self.manager.mark_wizard_done()
        assert not self.manager.is_first_run()

        result = self.manager.delete_model("flux-schnell-q8")
        assert result is True
        # Wizard completion is independent of model state
        assert not self.manager.is_first_run()

    def test_delete_nonexistent_model(self):
        assert self.manager.delete_model("nonexistent") is False

    def test_disk_usage(self):
        self.manager._simulate_download("flux-schnell-q8")
        usage = self.manager.get_disk_usage()
        assert usage["model_count"] == 1
        assert usage["used_bytes"] > 0

    def test_catalog_persistence(self):
        self.manager._simulate_download("flux-schnell-q8")
        self.manager.mark_wizard_done()
        # Create a new manager pointing at the same directory
        manager2 = ModelManager(self.tmp_dir)
        assert not manager2.is_first_run()
        downloaded = manager2.get_downloaded_models()
        assert len(downloaded) == 1
        assert downloaded[0]["id"] == "flux-schnell-q8"

    def test_get_default_downloads(self):
        defaults = self.manager.get_default_download_list()
        assert len(defaults) >= 1
        assert all("already_downloaded" in d for d in defaults)
