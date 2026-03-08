"""Adapter registry — catalog of downloadable adapter models (Redux, ControlNet, etc.)."""

from dataclasses import dataclass, field


@dataclass
class AdapterEntry:
    """An adapter in the registry."""
    id: str
    name: str
    adapter_type: str  # "redux", "controlnet", "lora", "ip-adapter", "encoder"
    hf_repo_id: str
    compatible_models: list[str] = field(default_factory=list)  # base model ID prefixes
    file_size_bytes: int = 0
    license_spdx: str = ""
    description: str = ""
    source_url: str = ""
    requires_provider: str = "mlx"  # "mlx", "diffusers", or "any"

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
            "requires_provider": self.requires_provider,
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
    AdapterEntry(
        id="flux-ip-adapter-v2",
        name="FLUX IP-Adapter v2 (Face Identity)",
        adapter_type="ip-adapter",
        hf_repo_id="XLabs-AI/flux-ip-adapter",
        compatible_models=["flux-dev", "flux-schnell"],
        file_size_bytes=1_500_000_000,  # ~1.5 GB
        license_spdx="Apache-2.0",
        description="IP-Adapter for FLUX using CLIP vision embeddings. Provides face identity preservation from reference images. Runs via diffusers (PyTorch MPS).",
        source_url="https://huggingface.co/XLabs-AI/flux-ip-adapter",
        requires_provider="diffusers",
    ),
    AdapterEntry(
        id="clip-vit-large-patch14",
        name="CLIP ViT-L/14 (Image Encoder)",
        adapter_type="encoder",
        hf_repo_id="openai/clip-vit-large-patch14",
        compatible_models=["flux-dev", "flux-schnell"],
        file_size_bytes=1_700_000_000,  # ~1.7 GB
        license_spdx="MIT",
        description="CLIP vision encoder required by IP-Adapter. Encodes reference images into embeddings for identity conditioning.",
        source_url="https://huggingface.co/openai/clip-vit-large-patch14",
        requires_provider="diffusers",
    ),
    # SDXL + FaceID PlusV2
    AdapterEntry(
        id="sdxl-base-1.0",
        name="Stable Diffusion XL Base 1.0",
        adapter_type="model",
        hf_repo_id="stabilityai/stable-diffusion-xl-base-1.0",
        compatible_models=["sdxl"],
        file_size_bytes=6_500_000_000,  # ~6.5 GB
        license_spdx="CreativeML-OpenRAIL-M",
        description="SDXL base model required for FaceID generation. High-quality 1024×1024 image generation.",
        source_url="https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
        requires_provider="diffusers",
    ),
    AdapterEntry(
        id="ip-adapter-faceid-plusv2-sdxl",
        name="IP-Adapter FaceID PlusV2 (SDXL)",
        adapter_type="faceid",
        hf_repo_id="h94/IP-Adapter-FaceID",
        compatible_models=["sdxl"],
        file_size_bytes=2_000_000_000,  # ~1.6GB weights + ~400MB LoRA
        license_spdx="Apache-2.0",
        description="FaceID PlusV2 adapter for SDXL. Uses InsightFace ArcFace embeddings for true facial identity preservation. Best for character consistency.",
        source_url="https://huggingface.co/h94/IP-Adapter-FaceID",
        requires_provider="diffusers",
    ),
    AdapterEntry(
        id="insightface-buffalo-l",
        name="InsightFace buffalo_l (Face Detection)",
        adapter_type="face_model",
        hf_repo_id="deepinsight/insightface",
        compatible_models=["sdxl"],
        file_size_bytes=300_000_000,  # ~300 MB
        license_spdx="non-commercial",
        description="InsightFace face analysis model. Detects faces and extracts ArcFace embeddings for FaceID. Auto-downloads on first use.",
        source_url="https://github.com/deepinsight/insightface",
        requires_provider="diffusers",
    ),
]


def get_adapter_registry() -> list[AdapterEntry]:
    """Return the full adapter registry."""
    return ADAPTER_REGISTRY


def get_adapter_by_id(adapter_id: str) -> AdapterEntry | None:
    """Look up an adapter by ID."""
    return next((a for a in ADAPTER_REGISTRY if a.id == adapter_id), None)
