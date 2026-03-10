"""Tests for CharacterManager LoRA methods."""

import json
import os
import shutil
import tempfile

import pytest

from imagen_heap.characters.manager import CharacterManager


@pytest.fixture()
def tmp_base(tmp_path):
    """Provide a temporary base directory for CharacterManager."""
    return str(tmp_path)


@pytest.fixture()
def manager(tmp_base):
    return CharacterManager(tmp_base)


@pytest.fixture()
def character(manager):
    """Create a minimal character for testing."""
    return manager.create_character(name="Test Character", description="A test char")


@pytest.fixture()
def lora_file(tmp_path):
    """Create a fake .safetensors file to use as LoRA source."""
    f = tmp_path / "my_lora_v1.safetensors"
    f.write_bytes(b"\x00" * 256)
    return str(f)


class TestSetLora:
    def test_copies_file_and_updates_metadata(self, manager, character, lora_file):
        result = manager.set_lora(character["id"], lora_file)

        assert result is not None
        assert result["adapter_type"] == "lora"
        assert result["trigger_word"] == ""
        assert result["lora_filename"] == "my_lora_v1.safetensors"
        assert result["lora_file_size"] == 256
        assert result["lora_path"].endswith("lora.safetensors")
        assert os.path.exists(result["lora_path"])

    def test_sets_adapter_type_to_lora(self, manager, character, lora_file):
        assert character["adapter_type"] == "auto"
        result = manager.set_lora(character["id"], lora_file)
        assert result["adapter_type"] == "lora"

    def test_custom_trigger_word(self, manager, character, lora_file):
        result = manager.set_lora(character["id"], lora_file, trigger_word="sks")
        assert result["trigger_word"] == "sks"

    def test_nonexistent_character_returns_none(self, manager, lora_file):
        assert manager.set_lora("nonexistent", lora_file) is None

    def test_nonexistent_lora_file_raises(self, manager, character):
        with pytest.raises(ValueError, match="LoRA file not found"):
            manager.set_lora(character["id"], "/tmp/does_not_exist.safetensors")

    def test_metadata_persisted_to_disk(self, manager, character, lora_file):
        manager.set_lora(character["id"], lora_file, trigger_word="xyz")
        reloaded = manager.get_character(character["id"])
        assert reloaded["adapter_type"] == "lora"
        assert reloaded["trigger_word"] == "xyz"
        assert reloaded["lora_filename"] == "my_lora_v1.safetensors"


class TestRemoveLora:
    def test_removes_files_and_resets_metadata(self, manager, character, lora_file):
        manager.set_lora(character["id"], lora_file)
        result = manager.remove_lora(character["id"])

        assert result is not None
        assert result["adapter_type"] == "auto"
        assert "lora_path" not in result
        assert "lora_filename" not in result
        assert "lora_file_size" not in result
        assert "trigger_word" not in result

    def test_lora_directory_removed(self, manager, character, lora_file):
        manager.set_lora(character["id"], lora_file)
        lora_dir = os.path.join(
            manager.characters_dir, character["id"], "lora"
        )
        assert os.path.isdir(lora_dir)
        manager.remove_lora(character["id"])
        assert not os.path.exists(lora_dir)

    def test_remove_without_lora_still_works(self, manager, character):
        result = manager.remove_lora(character["id"])
        assert result is not None
        assert result["adapter_type"] == "auto"

    def test_nonexistent_character_returns_none(self, manager):
        assert manager.remove_lora("nonexistent") is None


class TestGetLoraPath:
    def test_returns_path_when_exists(self, manager, character, lora_file):
        manager.set_lora(character["id"], lora_file)
        path = manager.get_lora_path(character["id"])
        assert path is not None
        assert path.endswith("lora.safetensors")
        assert os.path.exists(path)

    def test_returns_none_when_no_lora(self, manager, character):
        assert manager.get_lora_path(character["id"]) is None

    def test_returns_none_for_nonexistent_character(self, manager):
        assert manager.get_lora_path("nonexistent") is None


class TestUpdateCharacterTriggerWord:
    def test_update_trigger_word(self, manager, character, lora_file):
        manager.set_lora(character["id"], lora_file, trigger_word="ohwx")
        result = manager.update_character(character["id"], {"trigger_word": "sks"})
        assert result["trigger_word"] == "sks"
        # adapter_type should remain lora
        assert result["adapter_type"] == "lora"

    def test_update_trigger_word_persists(self, manager, character, lora_file):
        manager.set_lora(character["id"], lora_file)
        manager.update_character(character["id"], {"trigger_word": "mychar"})
        reloaded = manager.get_character(character["id"])
        assert reloaded["trigger_word"] == "mychar"
