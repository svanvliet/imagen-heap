"""Diffusers Provider — FLUX image generation via HuggingFace diffusers + PyTorch MPS.

Secondary provider for capabilities mflux doesn't support natively,
such as IP-Adapter face identity conditioning. All imports are lazy
so the app starts fine even if torch/diffusers aren't installed.
"""

import gc
import logging
import os
import platform
import time
from pathlib import Path

from imagen_heap.providers import (
    RuntimeProvider,
    DeviceInfo,
    MemoryStatus,
    ProgressCallback,
)

logger = logging.getLogger(__name__)


def is_available() -> bool:
    """Check if the diffusers provider can be used (torch + diffusers installed, MPS available)."""
    try:
        import torch
        from diffusers import FluxPipeline
        return torch.backends.mps.is_available()
    except ImportError:
        return False


# HuggingFace repo IDs for models used by this provider
FLUX_SCHNELL_REPO = "black-forest-labs/FLUX.1-schnell"
FLUX_DEV_REPO = "black-forest-labs/FLUX.1-dev"
IP_ADAPTER_REPO = "XLabs-AI/flux-ip-adapter-v2"
IP_ADAPTER_WEIGHT = "ip_adapter.safetensors"
CLIP_ENCODER_REPO = "openai/clip-vit-large-patch14"


class DiffusersProvider(RuntimeProvider):
    """FLUX image generation using HuggingFace diffusers on PyTorch MPS.

    Primary use case: IP-Adapter face identity conditioning, which mflux
    doesn't support. Falls back to CPU if MPS is unavailable.
    """

    def __init__(self) -> None:
        import torch
        self._torch = torch
        self._pipe = None
        self._loaded_model: str | None = None
        self._ip_adapter_loaded: bool = False
        self._device = "mps" if torch.backends.mps.is_available() else "cpu"
        self._dtype = torch.bfloat16
        logger.info("DiffusersProvider initialized (device=%s, dtype=%s)", self._device, self._dtype)

    def load_model(self, model_id: str, quantization: str = "q8") -> None:
        """Load a FLUX model via diffusers FluxPipeline.

        model_id is our internal ID (e.g. 'flux-schnell-q8'). We map it
        to the appropriate HuggingFace repo. Note: diffusers uses the
        original HF weights, not mflux-quantized ones.
        """
        if self._pipe is not None and self._loaded_model == model_id:
            logger.info("Diffusers model %s already loaded, skipping", model_id)
            return

        if self._pipe is not None:
            self.unload_model()

        from diffusers import FluxPipeline

        # Map our model IDs to HF repos — diffusers needs original weights
        if "schnell" in model_id:
            repo = FLUX_SCHNELL_REPO
        elif "dev" in model_id:
            repo = FLUX_DEV_REPO
        else:
            repo = FLUX_DEV_REPO

        start = time.time()
        logger.info("Loading diffusers FluxPipeline from %s (device=%s)", repo, self._device)

        try:
            self._pipe = FluxPipeline.from_pretrained(
                repo,
                torch_dtype=self._dtype,
            )
            # Use CPU offload for memory efficiency on unified memory
            self._pipe.enable_model_cpu_offload()
            self._loaded_model = model_id
            self._ip_adapter_loaded = False

            elapsed = time.time() - start
            logger.info("Diffusers model loaded in %.1fs", elapsed)
        except Exception:
            logger.exception("Failed to load diffusers model from %s", repo)
            raise

    def unload_model(self) -> None:
        if self._pipe is not None:
            logger.info("Unloading diffusers model: %s", self._loaded_model)
            # Unload IP-Adapter if loaded
            if self._ip_adapter_loaded:
                try:
                    self._pipe.unload_ip_adapter()
                except Exception:
                    pass
            del self._pipe
            self._pipe = None
            self._loaded_model = None
            self._ip_adapter_loaded = False
            gc.collect()
            if self._device == "mps":
                self._torch.mps.empty_cache()
            logger.debug("Diffusers model unloaded and cache cleared")

    def _ensure_ip_adapter_loaded(self) -> None:
        """Load the XLabs-AI IP-Adapter v2 weights into the pipeline."""
        if self._ip_adapter_loaded:
            return
        if self._pipe is None:
            raise RuntimeError("No model loaded. Call load_model() first.")

        start = time.time()
        logger.info("Loading IP-Adapter from %s", IP_ADAPTER_REPO)

        try:
            from transformers import CLIPVisionModelWithProjection

            image_encoder = CLIPVisionModelWithProjection.from_pretrained(
                CLIP_ENCODER_REPO, torch_dtype=self._dtype,
            )
            self._pipe.image_encoder = image_encoder

            self._pipe.load_ip_adapter(
                IP_ADAPTER_REPO,
                weight_name=IP_ADAPTER_WEIGHT,
            )
            self._ip_adapter_loaded = True
            elapsed = time.time() - start
            logger.info("IP-Adapter loaded in %.1fs", elapsed)

        except Exception:
            logger.exception("Failed to load IP-Adapter")
            raise

    def text_to_image(
        self,
        prompt: str,
        negative_prompt: str,
        seed: int,
        steps: int,
        cfg: float,
        width: int,
        height: int,
        progress_callback: ProgressCallback | None = None,
    ) -> str:
        """Standard text-to-image via diffusers (no identity conditioning)."""
        if self._pipe is None:
            raise RuntimeError("No model loaded. Call load_model() first.")

        logger.info(
            "Diffusers generating: prompt='%s' seed=%d steps=%d cfg=%.1f size=%dx%d",
            prompt[:80], seed, steps, cfg, width, height,
        )

        callback = self._make_pipeline_callback(progress_callback, steps) if progress_callback else None

        start = time.time()
        try:
            generator = self._torch.Generator(device="cpu").manual_seed(seed)
            result = self._pipe(
                prompt=prompt,
                height=height,
                width=width,
                num_inference_steps=steps,
                guidance_scale=cfg,
                generator=generator,
                callback_on_step_end=callback,
            )
            elapsed = time.time() - start
            logger.info("Diffusers generation complete in %.1fs", elapsed)
            return result.images[0]  # Returns PIL Image

        except Exception:
            logger.exception("Diffusers generation failed")
            raise

    def text_to_image_with_identity(
        self,
        prompt: str,
        seed: int,
        steps: int,
        cfg: float,
        width: int,
        height: int,
        reference_image_paths: list[str],
        identity_strength: float = 0.6,
        progress_callback: ProgressCallback | None = None,
    ):
        """Generate image with IP-Adapter face identity conditioning.

        Uses XLabs-AI IP-Adapter v2 with CLIP vision embeddings from
        reference face images to condition the generation pipeline.
        """
        if self._pipe is None:
            raise RuntimeError("No model loaded. Call load_model() first.")

        from PIL import Image

        # Load and validate reference images
        valid_images = []
        for p in reference_image_paths:
            path = Path(p)
            if path.exists():
                try:
                    img = Image.open(str(path)).convert("RGB")
                    valid_images.append(img)
                except Exception as e:
                    logger.warning("Failed to load reference image %s: %s", p, e)
            else:
                logger.warning("Reference image not found: %s", p)

        if not valid_images:
            raise RuntimeError("No valid reference images found for identity conditioning.")

        logger.info(
            "Diffusers IP-Adapter generating: prompt='%s' seed=%d steps=%d images=%d strength=%.2f",
            prompt[:80], seed, steps, len(valid_images), identity_strength,
        )

        # Ensure IP-Adapter is loaded
        self._ensure_ip_adapter_loaded()

        # Set identity strength
        self._pipe.set_ip_adapter_scale(identity_strength)

        callback = self._make_pipeline_callback(progress_callback, steps) if progress_callback else None

        start = time.time()
        try:
            generator = self._torch.Generator(device="cpu").manual_seed(seed)

            # Use first reference image as the ip_adapter_image
            # (IP-Adapter v2 takes a single image; use the best/first one)
            ip_image = valid_images[0]

            result = self._pipe(
                prompt=prompt,
                ip_adapter_image=ip_image,
                height=height,
                width=width,
                num_inference_steps=steps,
                guidance_scale=cfg,
                generator=generator,
                callback_on_step_end=callback,
            )
            elapsed = time.time() - start
            logger.info("IP-Adapter generation complete in %.1fs", elapsed)
            return result.images[0]  # Returns PIL Image

        except Exception:
            logger.exception("IP-Adapter generation failed")
            raise

    def _make_pipeline_callback(self, progress_callback: ProgressCallback, total_steps: int):
        """Create a diffusers-compatible step callback that forwards to our ProgressCallback."""
        def callback_fn(pipe, step_index, timestep, callback_kwargs):
            try:
                progress_callback(step_index + 1, total_steps, None)
            except Exception as e:
                logger.debug("Progress callback error (step %d): %s", step_index, e)
            return callback_kwargs
        return callback_fn

    def get_device_info(self) -> DeviceInfo:
        try:
            chip = "Apple Silicon"
            try:
                import subprocess
                result = subprocess.run(
                    ["sysctl", "-n", "machdep.cpu.brand_string"],
                    capture_output=True, text=True, timeout=2,
                )
                chip = result.stdout.strip() or "Apple Silicon"
            except Exception:
                pass

            total_memory_mb = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // (1024 * 1024)

            return DeviceInfo(
                chip=chip,
                total_memory_mb=total_memory_mb,
                os_version=platform.platform(),
                provider_name="Diffusers (PyTorch MPS)",
            )
        except Exception:
            return DeviceInfo(
                chip="unknown",
                total_memory_mb=0,
                os_version=platform.platform(),
                provider_name="Diffusers (PyTorch MPS)",
            )

    def get_memory_status(self) -> MemoryStatus:
        try:
            if self._device == "mps":
                allocated = self._torch.mps.current_allocated_memory() / (1024 * 1024)
                # MPS doesn't expose peak/cache the same way as CUDA
                total_mb = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // (1024 * 1024)
                return MemoryStatus(
                    used_mb=allocated,
                    peak_mb=allocated,  # MPS doesn't track peak separately
                    available_mb=total_mb - allocated,
                )
            return MemoryStatus(used_mb=0, peak_mb=0, available_mb=0)
        except Exception:
            return MemoryStatus(used_mb=0, peak_mb=0, available_mb=0)
