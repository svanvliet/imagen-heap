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
    # HuggingFace repo ID for real downloads (mflux uses this internally)
    hf_repo_id: str = ""
    # mflux model name for inference (e.g., "schnell", "dev")
    mflux_model_name: str = ""
    # If True, this is a pre-quantized mflux-saved model — load via model_path, not model_config
    is_mflux_saved: bool = False

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
# mflux downloads the base HF model and quantizes on-the-fly.
# file_size_bytes = approximate size of the base HF repo download.
REGISTRY: list[ModelEntry] = [
    # Pre-quantized community model — non-gated, ready to use, no auth needed
    ModelEntry(
        id="flux-schnell-mflux-q8",
        name="FLUX.1-schnell (mflux 8-bit)",
        version="1.0",
        architecture="flux",
        license_spdx="apache-2.0",
        file_size_bytes=13_000_000_000,  # ~13 GB pre-quantized
        quantization="q8",
        min_memory_mb=8000,
        source_url="https://huggingface.co/dhairyashil/FLUX.1-schnell-mflux-8bit",
        checksum_sha256="",
        is_default=True,
        description="Fast 4-step generation. Pre-quantized, no auth required. Best starting model.",
        filename="flux1-schnell-mflux-8bit",
        hf_repo_id="dhairyashil/FLUX.1-schnell-mflux-8bit",
        mflux_model_name="schnell",
        is_mflux_saved=True,
    ),
    ModelEntry(
        id="flux-schnell-q8",
        name="FLUX.1-schnell",
        version="1.0",
        architecture="flux",
        license_spdx="apache-2.0",
        file_size_bytes=33_000_000_000,  # ~33 GB base repo
        quantization="q8",
        min_memory_mb=8000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-schnell",
        checksum_sha256="",
        is_default=False,
        description="Fast 4-step generation. Apache 2.0 licensed. Requires HuggingFace auth.",
        filename="flux1-schnell",
        hf_repo_id="black-forest-labs/FLUX.1-schnell",
        mflux_model_name="schnell",
    ),
    ModelEntry(
        id="flux-schnell-q4",
        name="FLUX.1-schnell",
        version="1.0",
        architecture="flux",
        license_spdx="apache-2.0",
        file_size_bytes=33_000_000_000,
        quantization="q4",
        min_memory_mb=5000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-schnell",
        checksum_sha256="",
        is_default=False,
        description="Fast 4-step generation. Lower memory usage, slightly reduced quality.",
        filename="flux1-schnell",
        hf_repo_id="black-forest-labs/FLUX.1-schnell",
        mflux_model_name="schnell",
    ),
    ModelEntry(
        id="flux-dev-q8",
        name="FLUX.1-dev",
        version="1.0",
        architecture="flux",
        license_spdx="non-commercial",
        file_size_bytes=33_000_000_000,
        quantization="q8",
        min_memory_mb=16000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-dev",
        checksum_sha256="",
        is_default=False,
        description="High quality 25-step generation. Non-commercial license. Best output quality.",
        filename="flux1-dev",
        hf_repo_id="black-forest-labs/FLUX.1-dev",
        mflux_model_name="dev",
    ),
    ModelEntry(
        id="flux-dev-q4",
        name="FLUX.1-dev",
        version="1.0",
        architecture="flux",
        license_spdx="non-commercial",
        file_size_bytes=33_000_000_000,
        quantization="q4",
        min_memory_mb=10000,
        source_url="https://huggingface.co/black-forest-labs/FLUX.1-dev",
        checksum_sha256="",
        is_default=False,
        description="High quality generation. Lower memory, acceptable quality floor.",
        filename="flux1-dev",
        hf_repo_id="black-forest-labs/FLUX.1-dev",
        mflux_model_name="dev",
    ),
    # Stable Diffusion XL — uses diffusers/PyTorch MPS, not mflux
    ModelEntry(
        id="sdxl-base-1.0",
        name="Stable Diffusion XL 1.0",
        version="1.0",
        architecture="sdxl",
        license_spdx="CreativeML-OpenRAIL-M",
        file_size_bytes=6_500_000_000,  # ~6.5 GB (safetensors only)
        quantization="fp16",
        min_memory_mb=8000,
        source_url="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
        checksum_sha256="",
        is_default=False,
        description="High quality 1024×1024 generation via diffusers. Required for FaceID character identity. Runs on PyTorch MPS.",
        filename="stable-diffusion-xl-base-1.0",
        hf_repo_id="stabilityai/stable-diffusion-xl-base-1.0",
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
