"""Curated model registry — the catalog of known/supported models."""

from dataclasses import dataclass


@dataclass
class ModelEntry:
    """A model in the registry."""
    id: str
    name: str
    version: str
    architecture: str
    license_spdx: str
    file_size_bytes: int
    quantization: str
    min_memory_mb: int
    source_url: str
    checksum_sha256: str
    is_default: bool
    description: str
    filename: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "architecture": self.architecture,
            "license_spdx": self.license_spdx,
            "file_size_bytes": self.file_size_bytes,
            "quantization": self.quantization,
            "min_memory_mb": self.min_memory_mb,
            "source_url": self.source_url,
            "checksum_sha256": self.checksum_sha256,
            "is_default": self.is_default,
            "description": self.description,
            "filename": self.filename,
        }


# Curated model catalog for MVP
# Sizes and checksums are representative — real values would come from HuggingFace
REGISTRY: list[ModelEntry] = [
    ModelEntry(
        id="flux-schnell-q8",
        name="FLUX.1-schnell",
        version="1.0",
        architecture="flux",
        license_spdx="apache-2.0",
        file_size_bytes=6_500_000_000,  # ~6.5 GB Q8
        quantization="q8",
        min_memory_mb=8000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-schnell",
        checksum_sha256="placeholder_schnell_q8",
        is_default=True,
        description="Fast 4-step generation. Apache 2.0 licensed. Great for drafts and iteration.",
        filename="flux1-schnell-q8.safetensors",
    ),
    ModelEntry(
        id="flux-schnell-q4",
        name="FLUX.1-schnell",
        version="1.0",
        architecture="flux",
        license_spdx="apache-2.0",
        file_size_bytes=3_500_000_000,  # ~3.5 GB Q4
        quantization="q4",
        min_memory_mb=5000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-schnell",
        checksum_sha256="placeholder_schnell_q4",
        is_default=False,
        description="Fast 4-step generation. Smaller download, slightly reduced quality.",
        filename="flux1-schnell-q4.safetensors",
    ),
    ModelEntry(
        id="flux-dev-q8",
        name="FLUX.1-dev",
        version="1.0",
        architecture="flux",
        license_spdx="non-commercial",
        file_size_bytes=12_000_000_000,  # ~12 GB Q8
        quantization="q8",
        min_memory_mb=16000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-dev",
        checksum_sha256="placeholder_dev_q8",
        is_default=True,
        description="High quality 25-step generation. Non-commercial license. Best output quality.",
        filename="flux1-dev-q8.safetensors",
    ),
    ModelEntry(
        id="flux-dev-q4",
        name="FLUX.1-dev",
        version="1.0",
        architecture="flux",
        license_spdx="non-commercial",
        file_size_bytes=6_000_000_000,  # ~6 GB Q4
        quantization="q4",
        min_memory_mb=10000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-dev",
        checksum_sha256="placeholder_dev_q4",
        is_default=False,
        description="High quality generation. Smaller download, acceptable quality floor.",
        filename="flux1-dev-q4.safetensors",
    ),
]


def get_registry() -> list[ModelEntry]:
    """Return the full model registry."""
    return REGISTRY


def get_default_models() -> list[ModelEntry]:
    """Return the default model set for first-run download."""
    return [m for m in REGISTRY if m.is_default]


def get_model_by_id(model_id: str) -> ModelEntry | None:
    """Look up a model by ID."""
    return next((m for m in REGISTRY if m.id == model_id), None)
