"""Diffusers Provider — image generation via HuggingFace diffusers + PyTorch MPS.

Secondary provider for capabilities mflux doesn't support natively,
such as IP-Adapter face identity conditioning (FLUX) and FaceID (SDXL).
All imports are lazy so the app starts fine even if torch/diffusers aren't installed.
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

# SDXL + FaceID PlusV2 repos
SDXL_BASE_REPO = "stabilityai/stable-diffusion-xl-base-1.0"
FACEID_REPO = "h94/IP-Adapter-FaceID"
FACEID_WEIGHT = "ip-adapter-faceid-plusv2_sdxl.bin"
FACEID_LORA_WEIGHT = "ip-adapter-faceid-plusv2_sdxl_lora.safetensors"
# CLIP ViT-H-14 for PlusV2 shortcut features (1.26 GB fp16, hidden_size=1280)
CLIP_H_REPO = "laion/CLIP-ViT-H-14-laion2B-s32B-b79K"


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
        self._active_pipeline: str | None = None  # "flux" or "sdxl"
        self._ip_adapter_loaded: bool = False
        self._faceid_loaded: bool = False
        self._face_extractor = None  # Lazy-loaded FaceEmbeddingExtractor
        self._clip_h_encoder = None  # Lazy-loaded CLIP ViT-H for FaceID PlusV2
        self._clip_h_processor = None
        self._device = "mps" if torch.backends.mps.is_available() else "cpu"
        self._dtype = torch.bfloat16
        logger.info("DiffusersProvider initialized (device=%s, dtype=%s)", self._device, self._dtype)

    def _get_hf_token(self) -> str | None:
        """Retrieve the stored HuggingFace token (same one used by model downloads)."""
        try:
            token_path = Path.home() / ".imagen-heap" / "hf_token"
            if token_path.exists():
                return token_path.read_text().strip() or None
        except Exception:
            pass
        return os.environ.get("HF_TOKEN")

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

        token = self._get_hf_token()

        try:
            self._pipe = FluxPipeline.from_pretrained(
                repo,
                torch_dtype=self._dtype,
                token=token,
            )
            # Use CPU offload for memory efficiency on unified memory
            self._pipe.enable_model_cpu_offload()
            self._loaded_model = model_id
            self._active_pipeline = "flux"
            self._ip_adapter_loaded = False

            elapsed = time.time() - start
            logger.info("Diffusers model loaded in %.1fs", elapsed)
        except Exception:
            logger.exception("Failed to load diffusers model from %s", repo)
            raise

    def unload_model(self) -> None:
        if self._pipe is not None:
            logger.info("Unloading diffusers model: %s (pipeline=%s)", self._loaded_model, self._active_pipeline)
            # Unload IP-Adapter if loaded
            if self._ip_adapter_loaded or self._faceid_loaded:
                try:
                    self._pipe.unload_ip_adapter()
                except Exception:
                    pass
            del self._pipe
            self._pipe = None
            self._loaded_model = None
            self._active_pipeline = None
            self._ip_adapter_loaded = False
            self._faceid_loaded = False

        # Free CLIP ViT-H encoder when not needed (1.26 GB)
        if self._clip_h_encoder is not None:
            del self._clip_h_encoder
            self._clip_h_encoder = None
            self._clip_h_processor = None

        # Free InsightFace face extractor
        if self._face_extractor is not None:
            del self._face_extractor
            self._face_extractor = None

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

            # Re-register CPU offload hooks so the newly-added image_encoder
            # and ip_adapter modules are properly moved to MPS during inference.
            # Without this, CLIP weights stay on CPU while input tensors are on MPS.
            self._pipe.enable_model_cpu_offload()

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
            # Build kwargs — SDXL supports negative_prompt, FLUX ignores it
            pipe_kwargs = dict(
                prompt=prompt,
                height=height,
                width=width,
                num_inference_steps=steps,
                guidance_scale=cfg,
                generator=generator,
                callback_on_step_end=callback,
            )
            if negative_prompt and self._active_pipeline == "sdxl":
                pipe_kwargs["negative_prompt"] = negative_prompt
            result = self._pipe(**pipe_kwargs)
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
                    # Center-crop to square for better CLIP encoding
                    w, h = img.size
                    crop_size = min(w, h)
                    left = (w - crop_size) // 2
                    top = (h - crop_size) // 2
                    img = img.crop((left, top, left + crop_size, top + crop_size))
                    img = img.resize((512, 512), Image.LANCZOS)
                    valid_images.append(img)
                    logger.debug("Loaded reference image %s (%dx%d → 512x512)", p, w, h)
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

    # --- SDXL + FaceID PlusV2 ---

    def is_faceid_available(self) -> bool:
        """Check if FaceID generation is possible (InsightFace installed)."""
        try:
            from imagen_heap.providers.face_embedding import is_available
            return is_available()
        except ImportError:
            return False

    def _load_sdxl_pipeline(self, model_id: str = "sdxl-base-1.0") -> None:
        """Load an SDXL-architecture pipeline, unloading FLUX if active.

        Supports any SDXL fine-tune (RealVisXL, Juggernaut, etc.) by resolving
        the model_id to a HuggingFace repo via the model registry.
        """
        if self._active_pipeline == "sdxl" and self._pipe is not None and self._loaded_model == model_id:
            return

        if self._pipe is not None:
            logger.info("Unloading %s pipeline to load SDXL model %s", self._active_pipeline, model_id)
            self.unload_model()

        from diffusers import StableDiffusionXLPipeline

        # Resolve model_id to HF repo — check model registry first
        repo = SDXL_BASE_REPO  # default fallback
        try:
            from imagen_heap.models import get_model_by_id
            entry = get_model_by_id(model_id)
            if entry and entry.hf_repo_id:
                repo = entry.hf_repo_id
        except Exception:
            pass

        start = time.time()
        token = self._get_hf_token()
        logger.info("Loading SDXL pipeline from %s (model_id=%s)", repo, model_id)

        self._pipe = StableDiffusionXLPipeline.from_pretrained(
            repo,
            torch_dtype=self._torch.float16,  # SDXL works best with float16
            variant="fp16",  # use the fp16 weight files we downloaded
            token=token,
        )
        self._pipe.enable_model_cpu_offload()
        self._active_pipeline = "sdxl"
        self._loaded_model = model_id
        self._faceid_loaded = False

        elapsed = time.time() - start
        logger.info("SDXL pipeline loaded in %.1fs", elapsed)

    def _ensure_faceid_loaded(self) -> None:
        """Load FaceID PlusV2 adapter + LoRA into the SDXL pipeline."""
        if self._faceid_loaded:
            return
        if self._pipe is None or self._active_pipeline != "sdxl":
            raise RuntimeError("SDXL pipeline must be loaded first.")

        start = time.time()
        logger.info("Loading FaceID PlusV2 adapter from %s/%s", FACEID_REPO, FACEID_WEIGHT)

        try:
            self._pipe.load_ip_adapter(
                FACEID_REPO,
                subfolder="",
                weight_name=FACEID_WEIGHT,
                image_encoder_folder=None,  # We load CLIP ViT-H separately
            )

            # Load FaceID LoRA for better quality
            try:
                from huggingface_hub import hf_hub_download
                lora_path = hf_hub_download(
                    FACEID_REPO,
                    filename=FACEID_LORA_WEIGHT,
                    token=self._get_hf_token(),
                )
                self._pipe.load_lora_weights(lora_path)
                self._pipe.fuse_lora()
                logger.info("FaceID LoRA loaded and fused")
            except Exception as e:
                logger.warning("FaceID LoRA loading failed (continuing without): %s", e)

            self._faceid_loaded = True
            elapsed = time.time() - start
            logger.info("FaceID PlusV2 adapter loaded in %.1fs", elapsed)

        except Exception:
            logger.exception("Failed to load FaceID adapter")
            raise

    def _load_clip_h_encoder(self) -> None:
        """Lazy-load CLIP ViT-H-14 encoder for FaceID PlusV2 shortcut features."""
        if self._clip_h_encoder is not None:
            return

        import torch
        from transformers import CLIPVisionModelWithProjection, CLIPImageProcessor

        start = time.time()
        logger.info("Loading CLIP ViT-H encoder from %s", CLIP_H_REPO)
        self._clip_h_encoder = CLIPVisionModelWithProjection.from_pretrained(
            CLIP_H_REPO,
            torch_dtype=torch.float16,
        )
        self._clip_h_encoder.eval()
        self._clip_h_processor = CLIPImageProcessor.from_pretrained(CLIP_H_REPO)
        elapsed = time.time() - start
        logger.info("CLIP ViT-H encoder loaded in %.1fs", elapsed)

    def _compute_clip_embeds(self, image_paths: list[str]) -> "torch.Tensor":
        """Compute CLIP ViT-H hidden states from reference images for FaceID PlusV2.

        Returns tensor of shape [1, 1, 257, 1280] (averaged across images).
        """
        import torch
        from PIL import Image

        self._load_clip_h_encoder()

        all_embeds = []
        for path in image_paths:
            try:
                img = Image.open(path).convert("RGB")
                inputs = self._clip_h_processor(images=img, return_tensors="pt")
                with torch.no_grad():
                    output = self._clip_h_encoder(
                        pixel_values=inputs.pixel_values.to(dtype=torch.float16),
                        output_hidden_states=True,
                    )
                # Use penultimate hidden state (standard for IP-Adapter)
                hidden = output.hidden_states[-2]  # [1, 257, 1280]
                all_embeds.append(hidden)
            except Exception as e:
                logger.warning("CLIP encoding failed for %s: %s", path, e)

        if not all_embeds:
            raise ValueError("Failed to compute CLIP embeddings from any reference image")

        # Average across images for multi-reference robustness
        avg_clip = torch.mean(torch.stack(all_embeds), dim=0)  # [1, 257, 1280]
        # Add image-count dimension: [1, 1, 257, 1280]
        return avg_clip.unsqueeze(1)

    @property
    def face_extractor(self):
        """Lazy-load the InsightFace face embedding extractor."""
        if self._face_extractor is None:
            from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor
            self._face_extractor = FaceEmbeddingExtractor()
        return self._face_extractor

    def text_to_image_with_faceid(
        self,
        prompt: str,
        negative_prompt: str,
        seed: int,
        steps: int,
        cfg: float,
        width: int,
        height: int,
        reference_image_paths: list[str],
        identity_strength: float = 0.7,
        model_id: str = "sdxl-base-1.0",
        progress_callback: ProgressCallback | None = None,
    ):
        """Generate image with SDXL + FaceID PlusV2 face identity conditioning.

        Uses InsightFace ArcFace embeddings for facial identity and CLIP ViT-H
        shortcut features for visual detail (skin, hair, lighting). Both are
        required for PlusV2 quality.
        """
        import torch

        # 1. Extract InsightFace face embeddings from reference images
        logger.info(
            "Extracting face embeddings from %d reference image(s)",
            len(reference_image_paths),
        )
        avg_embedding = self.face_extractor.compute_average_embedding(reference_image_paths)

        # Face embed: [1, 1, 512] — pipeline requires 3D+ for ip_adapter_image_embeds
        face_embed = torch.tensor(avg_embedding, dtype=torch.float16).unsqueeze(0).unsqueeze(0)  # [1, 1, 512]
        # Stack negative (zeros) + positive for classifier-free guidance
        neg_face = torch.zeros_like(face_embed)
        face_embed = torch.cat([neg_face, face_embed], dim=0)  # [2, 1, 512]

        # 2. Compute CLIP ViT-H hidden states for PlusV2 shortcut features
        logger.info("Computing CLIP ViT-H embeddings for PlusV2 shortcut")
        clip_embeds = self._compute_clip_embeds(reference_image_paths)  # [1, 1, 257, 1280]
        # Stack negative (zeros) + positive for CFG
        neg_clip = torch.zeros_like(clip_embeds)
        clip_embeds = torch.cat([neg_clip, clip_embeds], dim=0)  # [2, 1, 257, 1280]

        # 3. Load SDXL pipeline + FaceID PlusV2 adapter
        self._load_sdxl_pipeline(model_id)
        self._ensure_faceid_loaded()

        # 4. Set CLIP embeds on the FaceID PlusV2 projection module
        #    Must match device/dtype of the projection layer weights at forward time.
        #    With cpu_offload, the UNet runs on MPS during inference.
        proj_layers = self._pipe.unet.encoder_hid_proj.image_projection_layers
        proj_layers[0].clip_embeds = clip_embeds.to(device=self._device, dtype=torch.float16)
        proj_layers[0].shortcut = True  # Enable ID shortcut for better identity preservation
        logger.debug("Set CLIP embeds on projection layer: %s (device=%s)", clip_embeds.shape, self._device)

        # Also ensure face_embed is on the right device
        face_embed = face_embed.to(device=self._device)

        # 5. Set identity strength
        self._pipe.set_ip_adapter_scale(identity_strength)

        callback = self._make_pipeline_callback(progress_callback, steps) if progress_callback else None

        # Use CFG appropriate for SDXL if user hasn't set one (FLUX default is ~3.5)
        sdxl_cfg = cfg if cfg > 1.0 else 5.0

        logger.info(
            "SDXL FaceID PlusV2 generating: prompt='%s' seed=%d steps=%d cfg=%.1f strength=%.2f",
            prompt[:80], seed, steps, sdxl_cfg, identity_strength,
        )

        start = time.time()
        try:
            generator = torch.Generator(device="cpu").manual_seed(seed)

            result = self._pipe(
                prompt=prompt,
                negative_prompt=negative_prompt or "blurry, low quality, deformed, bad anatomy",
                ip_adapter_image_embeds=[face_embed],
                height=height,
                width=width,
                num_inference_steps=steps,
                guidance_scale=sdxl_cfg,
                generator=generator,
                callback_on_step_end=callback,
            )
            elapsed = time.time() - start
            logger.info("SDXL FaceID PlusV2 generation complete in %.1fs", elapsed)
            return result.images[0]  # Returns PIL Image

        except Exception:
            logger.exception("SDXL FaceID PlusV2 generation failed")
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
