"""MLX Provider — real FLUX image generation on Apple Silicon via mflux."""

import gc
import logging
import os
import platform
import time
from pathlib import Path

from imagen_heap.models import get_model_by_id
from imagen_heap.providers import (
    RuntimeProvider,
    DeviceInfo,
    MemoryStatus,
    ProgressCallback,
)

logger = logging.getLogger(__name__)

# Model ID → (mflux_model_name, quantize_level) for standard (non-saved) models
MODEL_MAP = {
    "flux-schnell-q8": ("schnell", 8),
    "flux-schnell-q4": ("schnell", 4),
    "flux-dev-q8": ("dev", 8),
    "flux-dev-q4": ("dev", 4),
}

# Models that support Redux (character mode) — must be dev variants
REDUX_COMPATIBLE_MODELS = {"flux-dev-q8", "flux-dev-q4"}


class MLXProvider(RuntimeProvider):
    """FLUX image generation using mflux on Apple Silicon (MLX backend)."""

    def __init__(self) -> None:
        self._flux = None
        self._flux_redux = None
        self._loaded_model: str | None = None
        self._loaded_redux_model: str | None = None
        self._quantize: int | None = None
        logger.info("MLXProvider initialized")

    def load_model(self, model_id: str, quantization: str = "q8") -> None:
        # Skip reload if same model is already loaded
        if self._flux is not None and self._loaded_model == model_id:
            logger.info("Model %s already loaded, skipping", model_id)
            return

        # Unload previous model
        if self._flux is not None:
            self.unload_model()

        entry = get_model_by_id(model_id)
        start = time.time()

        try:
            from mflux.models.flux.variants.txt2img.flux import Flux1
            from mflux.models.common.config.model_config import ModelConfig

            if entry and entry.is_mflux_saved:
                # Pre-quantized mflux-saved model — load via model_path
                logger.info("Loading pre-quantized model: %s (repo=%s)", model_id, entry.hf_repo_id)
                model_config = ModelConfig.from_name(entry.mflux_model_name)
                self._flux = Flux1(model_config=model_config, model_path=entry.hf_repo_id)
                self._loaded_model = model_id
                self._quantize = None  # already quantized
            elif model_id in MODEL_MAP:
                model_name, quantize = MODEL_MAP[model_id]
                logger.info("Loading model: %s (mflux name=%s, quantize=%d)", model_id, model_name, quantize)
                model_config = ModelConfig.from_name(model_name)
                self._flux = Flux1(model_config=model_config, quantize=quantize)
                self._loaded_model = model_id
                self._quantize = quantize
            elif entry and entry.mflux_model_name:
                # Fallback: use registry entry's mflux_model_name
                q = int(entry.quantization.replace("q", "")) if entry.quantization.startswith("q") else 8
                logger.info("Loading model: %s (mflux name=%s, quantize=%d)", model_id, entry.mflux_model_name, q)
                model_config = ModelConfig.from_name(entry.mflux_model_name)
                self._flux = Flux1(model_config=model_config, quantize=q)
                self._loaded_model = model_id
                self._quantize = q
            else:
                raise ValueError(f"Unknown model: {model_id}. Available: {list(MODEL_MAP.keys())}")

            elapsed = time.time() - start
            logger.info("Model %s loaded in %.1fs", model_id, elapsed)
        except Exception:
            logger.exception("Failed to load model %s", model_id)
            raise

    def unload_model(self) -> None:
        if self._flux is not None:
            logger.info("Unloading model: %s", self._loaded_model)
            self._flux = None
            self._loaded_model = None
            self._quantize = None
        if self._flux_redux is not None:
            logger.info("Unloading Redux model: %s", self._loaded_redux_model)
            self._flux_redux = None
            self._loaded_redux_model = None
        gc.collect()
        try:
            import mlx.core as mx
            mx.metal.clear_cache()
            logger.debug("MLX metal cache cleared")
        except Exception:
            pass

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
        if self._flux is None:
            raise RuntimeError("No model loaded. Call load_model() first.")

        logger.info(
            "Generating: prompt='%s' seed=%d steps=%d cfg=%.1f size=%dx%d",
            prompt[:80], seed, steps, cfg, width, height,
        )

        # Register a progress callback via mflux's callback system
        if progress_callback:
            self._register_progress_callback(progress_callback, steps)

        start = time.time()
        try:
            image = self._flux.generate_image(
                seed=seed,
                prompt=prompt,
                negative_prompt=negative_prompt if negative_prompt else None,
                num_inference_steps=steps,
                width=width,
                height=height,
                guidance=cfg,
            )
            elapsed = time.time() - start
            logger.info("Generation complete in %.1fs", elapsed)

            return image

        except Exception:
            logger.exception("Generation failed")
            raise

    def text_to_image_with_character(
        self,
        prompt: str,
        seed: int,
        steps: int,
        cfg: float,
        width: int,
        height: int,
        reference_image_paths: list[str],
        character_strength: float = 0.6,
        model_id: str | None = None,
        progress_callback: ProgressCallback | None = None,
    ):
        """Generate image with character reference via Redux adapter.

        Uses Flux1Redux instead of Flux1 — embeds reference images into
        the generation pipeline so the output reflects the character's appearance.
        Requires a FLUX.1-dev model (not schnell).
        """
        effective_model = model_id or self._loaded_model
        if effective_model and effective_model not in REDUX_COMPATIBLE_MODELS:
            entry = get_model_by_id(effective_model) if effective_model else None
            if not entry or entry.mflux_model_name != "dev":
                raise RuntimeError(
                    f"Character mode requires a FLUX.1-dev model, but '{effective_model}' is selected. "
                    "Please switch to a dev model in the Model Manager."
                )

        # Validate reference images
        valid_paths = [p for p in reference_image_paths if Path(p).exists()]
        if not valid_paths:
            raise RuntimeError("No valid reference images found for character. Please add reference images.")

        logger.info(
            "Generating with character: prompt='%s' seed=%d steps=%d images=%d strength=%.2f",
            prompt[:80], seed, steps, len(valid_paths), character_strength,
        )

        # Load Redux model (cache separately from standard Flux1)
        self._ensure_redux_loaded(effective_model)

        if progress_callback:
            self._register_progress_callback_on(self._flux_redux, progress_callback, steps)

        start = time.time()
        try:
            strengths = [character_strength] * len(valid_paths)
            image = self._flux_redux.generate_image(
                seed=seed,
                prompt=prompt,
                redux_image_paths=valid_paths,
                redux_image_strengths=strengths,
                num_inference_steps=steps,
                width=width,
                height=height,
                guidance=cfg,
            )
            elapsed = time.time() - start
            logger.info("Character generation complete in %.1fs", elapsed)
            return image

        except Exception:
            logger.exception("Character generation failed")
            raise

    def _ensure_redux_loaded(self, model_id: str | None) -> None:
        """Load Flux1Redux if not already loaded for the given model."""
        if self._flux_redux is not None and self._loaded_redux_model == model_id:
            return

        from mflux.models.flux.variants.redux.flux_redux import Flux1Redux
        from mflux.models.common.config.model_config import ModelConfig

        entry = get_model_by_id(model_id) if model_id else None
        start = time.time()

        try:
            if entry and entry.is_mflux_saved:
                logger.info("Loading Redux with pre-quantized model: %s", model_id)
                model_config = ModelConfig.from_name(entry.mflux_model_name)
                self._flux_redux = Flux1Redux(model_config=model_config, model_path=entry.hf_repo_id)
            elif model_id in MODEL_MAP:
                model_name, quantize = MODEL_MAP[model_id]
                logger.info("Loading Redux: %s (quantize=%d)", model_name, quantize)
                model_config = ModelConfig.from_name(model_name)
                self._flux_redux = Flux1Redux(model_config=model_config, quantize=quantize)
            else:
                logger.info("Loading Redux with dev defaults (q8)")
                model_config = ModelConfig.from_name("dev")
                self._flux_redux = Flux1Redux(model_config=model_config, quantize=8)
        except Exception as e:
            error_str = str(e)
            if "gated" in error_str.lower() or "401" in error_str:
                raise RuntimeError(
                    "ADAPTER_NOT_AVAILABLE: The Redux adapter (FLUX.1-Redux-dev) requires download. "
                    "Please download it from Model Manager → Adapters tab, or click the download "
                    "button in the character section."
                ) from e
            raise

        self._loaded_redux_model = model_id
        elapsed = time.time() - start
        logger.info("Redux model loaded in %.1fs", elapsed)

    def _register_progress_callback(self, callback: ProgressCallback, total_steps: int) -> None:
        """Register an InLoopCallback on the standard Flux1 model."""
        if self._flux is not None:
            self._register_progress_callback_on(self._flux, callback, total_steps)

    def _register_progress_callback_on(self, model, callback: ProgressCallback, total_steps: int) -> None:
        """Register an InLoopCallback on any mflux model instance."""
        try:
            from mflux.callbacks.callback_registry import CallbackRegistry

            class ProgressReporter:
                """InLoopCallback that reports progress to our callback."""
                def call_in_loop(self, t, seed, prompt, latents, config, time_steps):
                    current_step = t + 1
                    callback(current_step, total_steps, None)

            if hasattr(model, 'callback_registry') and isinstance(model.callback_registry, CallbackRegistry):
                model.callback_registry.register(ProgressReporter())
                logger.debug("Progress callback registered via callback_registry")
            elif hasattr(model, 'callbacks') and isinstance(model.callbacks, CallbackRegistry):
                model.callbacks.register(ProgressReporter())
                logger.debug("Progress callback registered via callbacks")
            else:
                # Look for any CallbackRegistry attribute
                for attr_name in dir(model):
                    attr = getattr(model, attr_name, None)
                    if isinstance(attr, CallbackRegistry):
                        attr.register(ProgressReporter())
                        logger.debug("Progress callback registered via %s", attr_name)
                        return
                logger.debug("No CallbackRegistry found on model, progress will not stream")
        except Exception:
            logger.debug("Could not register progress callback", exc_info=True)

    def get_device_info(self) -> DeviceInfo:
        try:
            import mlx.core as mx
            chip = "Apple Silicon"
            # Try to get specific chip info
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
                provider_name="MLX (mflux)",
            )
        except Exception:
            logger.debug("Failed to get device info", exc_info=True)
            return DeviceInfo(
                chip="unknown",
                total_memory_mb=0,
                os_version=platform.platform(),
                provider_name="MLX (mflux)",
            )

    def get_memory_status(self) -> MemoryStatus:
        try:
            import mlx.core as mx
            peak = mx.metal.get_peak_memory() / (1024 * 1024)
            active = mx.metal.get_active_memory() / (1024 * 1024)
            cache = mx.metal.get_cache_memory() / (1024 * 1024)
            total_mb = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") // (1024 * 1024)
            return MemoryStatus(
                used_mb=active + cache,
                peak_mb=peak,
                available_mb=total_mb - active - cache,
            )
        except Exception:
            return MemoryStatus(used_mb=0, peak_mb=0, available_mb=0)
