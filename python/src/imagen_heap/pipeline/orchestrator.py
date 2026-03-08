"""Pipeline orchestrator — coordinates model loading, generation, and progress reporting."""

import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from imagen_heap.providers import RuntimeProvider, StubProvider

logger = logging.getLogger(__name__)


@dataclass
class GenerationConfig:
    """Full configuration for an image generation job."""
    prompt: str
    negative_prompt: str = ""
    seed: int = 42
    steps: int = 25
    cfg: float = 7.5
    width: int = 1024
    height: int = 1024
    quality_profile: str = "fast"
    model_id: str = "flux-schnell"
    sampler: str = "euler"
    scheduler: str = "normal"
    character_id: str | None = None
    character_strength: float = 0.6
    adapter_type: str = "auto"  # "auto", "redux", "ip-adapter", "faceid"


@dataclass
class GenerationResult:
    """Result of a completed generation."""
    id: str
    image_path: str
    thumbnail_path: str
    config: GenerationConfig
    generation_time_ms: int
    created_at: str
    inference_provider: str = "mlx"   # "mlx", "diffusers", "stub"
    resolved_adapter: str = "none"    # "none", "redux", "ip-adapter", "sdxl-faceid-plusv2"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "image_path": self.image_path,
            "thumbnail_path": self.thumbnail_path,
            "config": {
                "prompt": self.config.prompt,
                "negative_prompt": self.config.negative_prompt,
                "seed": self.config.seed,
                "steps": self.config.steps,
                "cfg": self.config.cfg,
                "width": self.config.width,
                "height": self.config.height,
                "quality_profile": self.config.quality_profile,
                "model_id": self.config.model_id,
                "sampler": self.config.sampler,
                "scheduler": self.config.scheduler,
                "character_id": self.config.character_id,
                "character_strength": self.config.character_strength,
                "adapter_type": self.config.adapter_type,
            },
            "generation_time_ms": self.generation_time_ms,
            "created_at": self.created_at,
            "inference_provider": self.inference_provider,
            "resolved_adapter": self.resolved_adapter,
        }


class PipelineOrchestrator:
    """Orchestrates the image generation pipeline."""

    def __init__(self, output_dir: str, provider: RuntimeProvider | None = None) -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.provider = provider or StubProvider()
        self._diffusers_provider = None  # Lazy-loaded secondary provider
        self._current_job_id: str | None = None
        logger.info("PipelineOrchestrator initialized, output_dir=%s", self.output_dir)

    @property
    def diffusers_provider(self):
        """Lazy-load the DiffusersProvider only when needed."""
        if self._diffusers_provider is None:
            try:
                from imagen_heap.providers.diffusers_provider import DiffusersProvider, is_available
                if is_available():
                    self._diffusers_provider = DiffusersProvider()
                    logger.info("DiffusersProvider loaded as secondary provider")
                else:
                    logger.info("DiffusersProvider not available (torch/MPS not found)")
            except ImportError:
                logger.info("DiffusersProvider not available (diffusers not installed)")
        return self._diffusers_provider

    def get_available_providers(self) -> dict:
        """Return which providers are available."""
        providers = {"mlx": True}  # MLX is always primary
        try:
            from imagen_heap.providers.diffusers_provider import is_available
            providers["diffusers"] = is_available()
        except ImportError:
            providers["diffusers"] = False
        try:
            from imagen_heap.providers.face_embedding import is_available as face_available
            providers["faceid"] = providers.get("diffusers", False) and face_available()
        except ImportError:
            providers["faceid"] = False
        return providers

    def _resolve_provider_for_character(self, config: GenerationConfig) -> str:
        """Determine which provider to use for a character generation.

        Returns 'mlx' for Redux or 'diffusers' for IP-Adapter/FaceID.
        """
        adapter_type = config.adapter_type

        if adapter_type == "faceid":
            if self.diffusers_provider is not None and hasattr(self.diffusers_provider, 'is_faceid_available') and self.diffusers_provider.is_faceid_available():
                return "diffusers"
            logger.warning("FaceID requested but InsightFace/DiffusersProvider unavailable, falling back to Redux")
            return "mlx"

        if adapter_type == "ip-adapter":
            if self.diffusers_provider is not None:
                return "diffusers"
            logger.warning("IP-Adapter requested but DiffusersProvider unavailable, falling back to Redux")
            return "mlx"

        if adapter_type == "redux":
            return "mlx"

        # Auto mode: prefer IP-Adapter if available and adapter is downloaded
        if adapter_type == "auto":
            if self.diffusers_provider is not None:
                # Check if IP-Adapter weights are available (downloaded)
                try:
                    from imagen_heap.adapters import get_adapter_by_id
                    ip_adapter = get_adapter_by_id("flux-ip-adapter-v2")
                    if ip_adapter:
                        return "diffusers"
                except Exception:
                    pass
            return "mlx"

        return "mlx"

    def generate(
        self,
        config: GenerationConfig,
        progress_callback=None,
        reference_image_paths: list[str] | None = None,
    ) -> GenerationResult:
        """Run a full generation job.

        If reference_image_paths is provided and character_id is set,
        uses Redux mode for character-consistent generation.
        """
        job_id = str(uuid.uuid4())[:8]
        self._current_job_id = job_id
        logger.info("Starting generation job=%s prompt='%s' steps=%d", job_id, config.prompt[:50], config.steps)

        start_time = time.time()

        def wrapped_progress(step: int, total: int, preview: str | None) -> None:
            if progress_callback:
                progress_callback(job_id, step, total, preview)

        try:
            use_character = (
                config.character_id
                and reference_image_paths
            )

            inference_provider = "mlx"
            resolved_adapter = "none"

            if use_character:
                provider_choice = self._resolve_provider_for_character(config)

                if provider_choice == "diffusers" and config.adapter_type == "faceid" and self.diffusers_provider is not None:
                    # FaceID via SDXL + InsightFace
                    inference_provider = "diffusers"
                    resolved_adapter = "sdxl-faceid-plusv2"
                    logger.info("Using FaceID (SDXL/diffusers) with %d reference images", len(reference_image_paths))
                    result = self.diffusers_provider.text_to_image_with_faceid(
                        prompt=config.prompt,
                        negative_prompt=config.negative_prompt,
                        seed=config.seed,
                        steps=config.steps,
                        cfg=config.cfg,
                        width=config.width,
                        height=config.height,
                        reference_image_paths=reference_image_paths,
                        identity_strength=config.character_strength,
                        model_id=config.model_id,
                        progress_callback=wrapped_progress,
                    )
                elif provider_choice == "diffusers" and self.diffusers_provider is not None:
                    # IP-Adapter via FLUX/diffusers
                    inference_provider = "diffusers"
                    resolved_adapter = "ip-adapter"
                    logger.info("Using IP-Adapter (diffusers) with %d reference images", len(reference_image_paths))
                    self.diffusers_provider.load_model(config.model_id)
                    result = self.diffusers_provider.text_to_image_with_identity(
                        prompt=config.prompt,
                        seed=config.seed,
                        steps=config.steps,
                        cfg=config.cfg,
                        width=config.width,
                        height=config.height,
                        reference_image_paths=reference_image_paths,
                        identity_strength=config.character_strength,
                        progress_callback=wrapped_progress,
                    )
                elif hasattr(self.provider, 'text_to_image_with_character'):
                    # Redux via MLX
                    inference_provider = "mlx"
                    resolved_adapter = "redux"
                    logger.info("Using Redux character mode (MLX) with %d reference images", len(reference_image_paths))
                    result = self.provider.text_to_image_with_character(
                        prompt=config.prompt,
                        seed=config.seed,
                        steps=config.steps,
                        cfg=config.cfg,
                        width=config.width,
                        height=config.height,
                        reference_image_paths=reference_image_paths,
                        character_strength=config.character_strength,
                        model_id=config.model_id,
                        progress_callback=wrapped_progress,
                    )
                else:
                    logger.warning("No character provider available, falling back to standard generation")
                    result = self.provider.text_to_image(
                        prompt=config.prompt,
                        negative_prompt=config.negative_prompt,
                        seed=config.seed,
                        steps=config.steps,
                        cfg=config.cfg,
                        width=config.width,
                        height=config.height,
                        progress_callback=wrapped_progress,
                    )
            else:
                # Standard text-to-image (no character)
                # Check if the selected model is SDXL architecture
                is_sdxl = False
                try:
                    from imagen_heap.models import get_model_by_id
                    model_entry = get_model_by_id(config.model_id)
                    is_sdxl = model_entry is not None and model_entry.architecture == "sdxl"
                except Exception:
                    is_sdxl = "sdxl" in config.model_id or "realvis" in config.model_id or "juggernaut" in config.model_id

                if is_sdxl and self.diffusers_provider is not None:
                    # SDXL-architecture models use DiffusersProvider
                    inference_provider = "diffusers"
                    self.diffusers_provider._load_sdxl_pipeline(config.model_id)
                    result = self.diffusers_provider.text_to_image(
                        prompt=config.prompt,
                        negative_prompt=config.negative_prompt,
                        seed=config.seed,
                        steps=config.steps,
                        cfg=config.cfg,
                        width=config.width,
                        height=config.height,
                        progress_callback=wrapped_progress,
                    )
                else:
                    result = self.provider.text_to_image(
                        prompt=config.prompt,
                        negative_prompt=config.negative_prompt,
                        seed=config.seed,
                        steps=config.steps,
                        cfg=config.cfg,
                        width=config.width,
                        height=config.height,
                        progress_callback=wrapped_progress,
                    )

            elapsed_ms = int((time.time() - start_time) * 1000)

            # Handle different return types from providers
            image_path, thumbnail_path = self._process_result(result, config, job_id)

            result_obj = GenerationResult(
                id=job_id,
                image_path=str(image_path),
                thumbnail_path=str(thumbnail_path),
                config=config,
                generation_time_ms=elapsed_ms,
                created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                inference_provider=inference_provider,
                resolved_adapter=resolved_adapter,
            )

            logger.info("Generation complete job=%s time=%dms path=%s", job_id, elapsed_ms, image_path)
            return result_obj

        finally:
            self._current_job_id = None

    def _process_result(self, result, config: GenerationConfig, job_id: str) -> tuple[str, str]:
        """Process the provider result into saved image + thumbnail paths."""
        # mflux returns a GeneratedImage object
        if hasattr(result, 'image') and hasattr(result, 'save'):
            image_path = self.output_dir / f"{job_id}.png"
            result.save(str(image_path), export_json_metadata=False, overwrite=True)
            logger.debug("Saved mflux image to %s", image_path)

            # Generate thumbnail
            thumbnail_path = self.output_dir / f"{job_id}_thumb.png"
            try:
                thumb = result.image.copy()
                thumb.thumbnail((256, 256))
                thumb.save(str(thumbnail_path))
            except Exception:
                logger.debug("Thumbnail generation failed, using full image", exc_info=True)
                thumbnail_path = image_path

            return str(image_path), str(thumbnail_path)

        # Diffusers returns a PIL Image
        try:
            from PIL import Image as PILImage
            if isinstance(result, PILImage.Image):
                image_path = self.output_dir / f"{job_id}.png"
                result.save(str(image_path))
                logger.debug("Saved diffusers PIL image to %s", image_path)

                thumbnail_path = self.output_dir / f"{job_id}_thumb.png"
                try:
                    thumb = result.copy()
                    thumb.thumbnail((256, 256))
                    thumb.save(str(thumbnail_path))
                except Exception:
                    logger.debug("Thumbnail generation failed, using full image", exc_info=True)
                    thumbnail_path = image_path

                return str(image_path), str(thumbnail_path)
        except ImportError:
            pass

            return str(image_path), str(thumbnail_path)

        # String path returned (or empty for stub)
        if isinstance(result, str) and result:
            return result, result

        # Stub/empty — generate placeholder SVG
        return self._generate_placeholder(config, job_id)

    def _generate_placeholder(self, config: GenerationConfig, job_id: str) -> tuple[str, str]:
        """Generate a placeholder SVG image for development/testing."""
        image_path = self.output_dir / f"{job_id}.svg"
        thumbnail_path = self.output_dir / f"{job_id}_thumb.svg"

        svg = self._create_placeholder_svg(config)
        image_path.write_text(svg)
        thumbnail_path.write_text(svg)

        return str(image_path), str(thumbnail_path)

    def _create_placeholder_svg(self, config: GenerationConfig) -> str:
        """Create an SVG placeholder that shows generation info."""
        w, h = config.width, config.height
        # Scale SVG to a reasonable viewBox
        vw, vh = 512, int(512 * (h / w))
        prompt_short = config.prompt[:60] + ("..." if len(config.prompt) > 60 else "")

        # Generate a deterministic color from the seed
        hue = (config.seed * 137) % 360

        return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{w}" height="{h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:hsl({hue}, 40%, 15%)"/>
      <stop offset="100%" style="stop-color:hsl({(hue + 60) % 360}, 40%, 20%)"/>
    </linearGradient>
  </defs>
  <rect width="{vw}" height="{vh}" fill="url(#bg)"/>
  <text x="{vw//2}" y="{vh//2 - 30}" text-anchor="middle" fill="hsl({hue}, 60%, 70%)" font-family="system-ui" font-size="18" font-weight="600">
    ✨ Generated Image
  </text>
  <text x="{vw//2}" y="{vh//2 + 5}" text-anchor="middle" fill="hsl(0, 0%, 60%)" font-family="system-ui" font-size="11">
    {prompt_short}
  </text>
  <text x="{vw//2}" y="{vh//2 + 30}" text-anchor="middle" fill="hsl(0, 0%, 45%)" font-family="system-ui" font-size="10">
    {config.quality_profile} · seed:{config.seed} · {config.steps} steps · {w}×{h}
  </text>
</svg>'''
