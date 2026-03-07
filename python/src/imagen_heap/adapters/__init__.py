"""Adapter registry — catalog of downloadable adapter models (Redux, ControlNet, etc.)."""

from dataclasses import dataclass, field


@dataclass
class AdapterEntry:
    """An adapter in the registry."""
    id: str
    name: str
    adapter_type: str  # "redux", "controlnet", "lora", etc.
    hf_repo_id: str
    compatible_models: list[str] = field(default_factory=list)  # base model ID prefixes
    file_size_bytes: int = 0
    license_spdx: str = ""
    description: str = ""
    source_url: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "adapter_type": self.adapter_type,
            "hf_repo_id": self.hf_repo_id,
            "compatible_models": self.compatible_models,
            "file_size_bytes": self.file_size_bytes,
            "license_spdx": self.license_spdx,
            "description": self.description,
            "source_url": self.source_url,
        }


ADAPTER_REGISTRY: list[AdapterEntry] = [
    AdapterEntry(
        id="flux-redux-dev",
        name="FLUX.1 Redux (dev)",
        adapter_type="redux",
        hf_repo_id="black-forest-labs/FLUX.1-Redux-dev",
        compatible_models=["flux-dev"],
        file_size_bytes=3_500_000_000,  # ~3.5 GB
        license_spdx="non-commercial",
        description="Character consistency adapter. Embeds reference images into generation for identity-preserving output. Requires FLUX.1-dev base model.",
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-Redux-dev",
    ),
]


def get_adapter_registry() -> list[AdapterEntry]:
    """Return the full adapter registry."""
    return ADAPTER_REGISTRY


def get_adapter_by_id(adapter_id: str) -> AdapterEntry | None:
    """Look up an adapter by ID."""
    return next((a for a in ADAPTER_REGISTRY if a.id == adapter_id), None)
