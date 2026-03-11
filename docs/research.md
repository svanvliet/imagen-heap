# AI Image + Asset Creation App Research (Mac-first, Windows-next)

## 1) Executive summary

You can build a **simple-by-default, powerful-when-needed** local AI image app on your M3 Max that feels much easier than existing SD UIs while still supporting advanced consistency workflows (repeatable characters, pose control, multi-image continuity).

Current practical state-of-the-art for your goals is:

- **Base generation:** FLUX family + SD3.5/SDXL ecosystem
- **Character persistence:** InstantID / PhotoMaker / PuLID + optional character LoRA training
- **Pose + composition control:** ControlNet-style conditioning (OpenPose, depth, canny/lineart, masks)
- **User experience reference:** InvokeAI (balanced UX), Draw Things / DiffusionBee (simplicity), ComfyUI (power backend, too complex as primary UX for mainstream users)

For your app specifically, the strongest direction is a **two-layer product design**:
1) a clean guided creation flow with sane presets, and  
2) an “advanced controls” drawer (or workflow mode) that exposes pose, structure, seeds, adapters, and LoRAs only when needed.

---

## 2) Model landscape (what is best now for local Mac workflows)

## 2.1 FLUX family (Black Forest Labs)

What matters:
- FLUX.1-dev is a **12B rectified-flow transformer** model with very strong quality/prompt adherence.
- Official open-weight repo includes multiple practical variants: text-to-image, fill (in/outpaint), canny/depth-conditioned models, redux/image variation, and editing variants.
- FLUX.1-schnell is available under Apache-2.0; FLUX.1-dev variants use a non-commercial license.

Why it matters for your app:
- Strong out-of-the-box image quality and prompt following.
- Official structural variants (canny/depth) are very useful for controllable generation UX.
- Licensing split (schnell vs dev) must be surfaced in product model management.

## 2.2 Stable Diffusion family (SDXL, SD3 Medium, SD3.5)

What matters:
- SDXL remains the most mature open ecosystem for LoRAs, ControlNet workflows, and community assets.
- SD3 Medium/3.5 introduces MMDiT improvements in prompt adherence/typography and is actively supported in ComfyUI and diffusers.
- SDXL and SD3.5 have different license terms from Stability (Community License for SD3.5; SDXL under OpenRAIL++-M).

Why it matters for your app:
- You likely want SDXL/SD3.5 support for ecosystem breadth and compatibility with existing user assets.
- SDXL remains a very practical “compatibility anchor” for many extensions and workflows.

## 2.3 Other model families

ComfyUI currently advertises support for many newer families (PixArt Sigma, Hunyuan variants, AuraFlow, etc.), signaling a rapidly changing frontier.  
Recommendation: treat these as **plugin/experimental model providers**, not first-class defaults for v1 UX until quality/perf/licensing are validated for your target user workflows.

---

## 3) Mac hardware/runtime reality (M3 Max 64GB)

Your machine is an excellent local inference device for this category.

Key runtime options:
- **MLX (Apple)**: built for Apple Silicon with unified memory model and native examples for FLUX + Stable Diffusion/SDXL.
- **PyTorch MPS**: broad compatibility path for diffusers/inference tooling.
- **ComfyUI / InvokeAI / A1111 ecosystems**: practical integration targets for model and workflow compatibility.

Implication:
- Mac-first is realistic with strong local quality/perf.
- For Windows support later, abstract runtime providers now (e.g., MLX provider for macOS + torch/cuda provider for Windows).

---

## 4) Character consistency & persistence (the core differentiator you want)

No single method solves all cases perfectly; state-of-the-art is a layered stack.

## 4.1 Inference-time identity adapters (fast, no training)

- **InstantID**: single-image identity-preserving plug-and-play method; integrated into diffusers community pipeline and widely adopted.
- **PhotoMaker / PhotoMaker V2**: identity customization without full LoRA training; designed to combine with ControlNet/IP-Adapter/T2I-Adapter.
- **PuLID / PuLID-FLUX**: strong ID customization line including FLUX compatibility.

Best use:
- Fast onboarding (“drop one face image, generate many scenes”)
- Good for low-friction consumer UX and rapid ideation.

## 4.2 Sequence consistency frameworks

- **StoryDiffusion** introduces “consistent self-attention” for long-range multi-image coherence and story/comic-like generation.
- **ID-Aligner** proposes reward-based fine-tuning to improve identity preservation and aesthetics for LoRA/adapter pipelines.

Best use:
- Multi-image narratives where character drift is unacceptable.
- “Shot sequence” workflows rather than one-off generations.

## 4.3 LoRA personalization (highest ceiling, more effort)

LoRA-style personalization is still the most robust route for persistent custom characters across broad styles/scenes when you can afford setup/training complexity.  
Recommendation: expose this in an advanced flow, not in the default first-run UX.

---

## 5) Pose & composition control (for “poseable persistent characters”)

## 5.1 ControlNet-style controls remain foundational

ControlNet remains the baseline mechanism for deterministic structure control via:
- OpenPose (body/hand/face keypoints)
- Depth maps
- Canny/edges/lineart
- Segmentation/masks

This is still the most practical way to support reliable “same character, new pose, new scene” workflows in local pipelines.

## 5.2 Practical integration pattern

For your app:
1) Character identity module (InstantID/PhotoMaker/PuLID or LoRA),
2) Pose/composition module (OpenPose/depth/etc.),
3) Base model sampler,
4) Optional post-process (upscale/face fix/edit).

This layered approach gives users control while keeping mental load low.

---

## 6) Product/UI landscape: what exists and what gap you can fill

## 6.1 Existing tools

- **ComfyUI**: maximum flexibility and huge model coverage; node graph is powerful but intimidating.
- **AUTOMATIC1111 WebUI**: feature-rich, parameter-heavy, long-standing community base.
- **InvokeAI**: strong “middle path” UX (canvas + workflows + local web app) and closer to a production app experience.
- **Fooocus**: historically strong simplicity focus, but currently in limited LTS and centered on SDXL lineage.
- **Draw Things / DiffusionBee**: very approachable local/offline UX on Apple devices; good examples of reducing setup friction.

## 6.2 Clear opportunity

The market still lacks a truly mainstream desktop app that combines:
- guided simplicity,
- dependable character continuity across scenes,
- robust posing/composition control,
- and understandable “pro mode” without exposing raw workflow graph complexity by default.

---

## 7) Recommended architecture for your app

## 7.1 Core product principles

1. **Task-first UI, not parameter-first UI**  
   Users choose outcomes (“Create character”, “Generate variations”, “Pose character”, “Keep style consistent”) before seeing low-level knobs.

2. **Determinism by design**  
   Persist seeds, prompts, model versions, adapters, control maps, and metadata automatically per generation.

3. **Progressive disclosure**  
   - Quick mode: prompt + style + character + shot template  
   - Pro mode: samplers, CFG/guidance, conditioning weights, ControlNet stack, LoRA blending

## 7.2 Technical stack (Mac-first, Windows-ready)

- **Desktop shell:** Tauri or Electron (both cross-platform; Tauri generally lighter footprint, Electron faster ecosystem velocity).
- **Inference orchestration service:** Python backend (diffusers/comfy/invoke-compatible adapters).
- **Runtime abstraction layer:**
  - macOS provider: MLX + optional torch/mps
  - Windows provider: torch/cuda (and optional DirectML path later if needed)
- **Workflow engine:** internal DAG representation with presets; optionally import/export compatible subsets with Comfy-style workflows.
- **Model manager:** license-aware model catalog, on-device caching, quantization selection, disk/RAM budgeting.

---

## 8) Suggested v1 capability set (high confidence)

1. **Base generation profiles**
   - “Fast Draft” (schnell/turbo-like)
   - “Quality” (dev/large models)
   - “Stylized” profile

2. **Character system**
   - Character cards (reference images + descriptors + optional LoRA/adapters)
   - One-click “keep this character” toggle for all subsequent shots

3. **Pose Studio**
   - Simple 2D skeleton editor + reference pose import
   - Depth/canny toggles with intuitive strength slider

4. **Scene continuity tools**
   - Shot list view (A/B/C scenes)
   - “Lock” controls for identity/style/composition independently

5. **Asset workflows**
   - Batch variants
   - Upscale/fix
   - Background removal / transparent export

---

## 9) Biggest risks and mitigations

- **Licensing complexity**  
  Mitigation: build license metadata into model manager and block incompatible commercial configurations.

- **Model ecosystem volatility**  
  Mitigation: provider/plugin architecture with stable internal APIs; keep default model set curated and small.

- **UX complexity creep**  
  Mitigation: strict progressive disclosure and outcome-based workflows; avoid exposing raw graph by default.

- **Cross-platform runtime divergence (MLX vs CUDA)**  
  Mitigation: normalize feature flags/capabilities and store workflows in backend-agnostic format.

---

## 10) Practical recommendation (what to build first)

For your exact goal, prioritize this sequence:
1. Build the **best-in-class simple UX** around character + pose + continuity.
2. Start with a curated set of proven model paths (FLUX + SDXL/SD3.5 compatibility).
3. Implement identity adapters first (InstantID/PhotoMaker/PuLID class), then add LoRA training flow.
4. Keep an advanced mode for power users, but never require it for common outcomes.

If executed well, this gives you a strong product wedge: **“local-first AI image creation with reliable character continuity, without node-graph complexity.”**

---

## Sources (authoritative references used)

- MLX (Apple): https://github.com/ml-explore/mlx  
- MLX examples (includes FLUX + SD/SDXL examples): https://github.com/ml-explore/mlx-examples  
- FLUX repo + model/license matrix: https://github.com/black-forest-labs/flux  
- FLUX.1-dev model card: https://huggingface.co/black-forest-labs/FLUX.1-dev  
- Stable Diffusion 3 Medium announcement: https://stability.ai/news/stable-diffusion-3-medium  
- SD3.5 Large model card: https://huggingface.co/stabilityai/stable-diffusion-3.5-large  
- SDXL base model card: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0  
- ComfyUI repo/features: https://github.com/comfyanonymous/ComfyUI  
- InvokeAI repo/features: https://github.com/invoke-ai/InvokeAI  
- AUTOMATIC1111 WebUI: https://github.com/AUTOMATIC1111/stable-diffusion-webui  
- ControlNet paper/repo: https://arxiv.org/abs/2302.05543 , https://github.com/lllyasviel/ControlNet  
- sd-webui-controlnet extension: https://github.com/Mikubill/sd-webui-controlnet  
- InstantID paper/repo: https://arxiv.org/abs/2401.07519 , https://github.com/instantX-research/InstantID  
- PhotoMaker repo: https://github.com/TencentARC/PhotoMaker  
- PuLID repo/paper: https://github.com/ToTheBeginning/PuLID , https://arxiv.org/abs/2404.16022  
- StoryDiffusion paper/repo: https://arxiv.org/abs/2405.01434 , https://github.com/HVision-NKU/StoryDiffusion  
- ID-Aligner paper: https://arxiv.org/abs/2404.15449  
- DiffusionBee: https://diffusionbee.com/  
- Draw Things: https://drawthings.ai/  
- Fooocus: https://github.com/lllyasviel/Fooocus  
- PyTorch MPS backend note: https://pytorch.org/docs/stable/notes/mps.html  
- Diffusers: https://github.com/huggingface/diffusers  
- Tauri: https://tauri.app/  
- Electron: https://github.com/electron/electron

---

## 8) Identity Adapter Research — Redux for Character System (March 2026)

### Context

For M5 (Character System), we investigated which identity/character-consistency adapters are feasible with our mflux 0.16.8 stack running on Apple Silicon via MLX. The plan originally called for InstantID, PhotoMaker, and PuLID, but these are PyTorch/CUDA-centric and have no native MLX implementations.

### Findings

#### What mflux 0.16.8 actually supports natively

| Feature | Status | Notes |
|---------|--------|-------|
| Text-to-image (`Flux1`) | ✅ | Our current pipeline |
| Image-to-image | ✅ | Resume denoising from input image |
| **Redux** (`Flux1Redux`) | ✅ | **Best fit for character system** |
| Kontext (`Flux1Kontext`) | ✅ | In-context editing, character consistency via text instructions |
| ControlNet (Canny) | ✅ | Edge-conditioned generation |
| Depth conditioning | ✅ | Depth map from reference image |
| Fill (inpaint/outpaint) | ✅ | Mask-based selective editing |
| LoRA | ✅ | Multi-LoRA with scales |
| IP-Adapter | ❌ | Not natively available in mflux |
| InstantID | ❌ | PyTorch/CUDA only |
| PhotoMaker | ❌ | PyTorch/CUDA only |
| PuLID | ❌ | PyTorch/CUDA only |

#### Redux — the chosen approach

**What it does:** Redux is an adapter for FLUX.1 that enables image variation generation. It embeds reference images via a dedicated Redux encoder and joins them with T5 text encodings in the attention layers. Unlike image-to-image (which resumes denoising from the input), Redux operates on image embeddings — meaning you get new compositions influenced by the reference rather than edits of it.

**Python API (confirmed in our install):**

```python
from mflux.models.flux.variants.redux.flux_redux import Flux1Redux

model = Flux1Redux(quantize=8)
image = model.generate_image(
    seed=42,
    prompt="A detective in a noir city at night",
    redux_image_paths=["ref1.png", "ref2.png"],     # character reference images
    redux_image_strengths=[0.7, 0.5],                # per-image influence
    num_inference_steps=20,
    height=1024,
    width=1024,
    guidance=4.0,
)
image.save("output.png")
```

**Key parameters:**
- `redux_image_paths: list[Path | str]` — 1+ reference images (maps to character's reference_images)
- `redux_image_strengths: list[float] | None` — per-image weight 0.0–1.0 (maps to characterStrength)
- `guidance: float` — guidance scale (default 4.0)
- All other params same as standard Flux1 generation

**Model requirement:** Uses FLUX.1-dev base model + Redux encoder weights (~auto-downloaded on first use from HuggingFace). Our FLUX.1-dev-q8 model is already downloaded (54GB).

**Tradeoffs vs the original plan:**
- ✅ Works natively in mflux on Apple Silicon — no CUDA required
- ✅ Supports multiple reference images with per-image strength
- ✅ Clean Python API matches our pipeline pattern
- ⚠️ Not face-specific like InstantID/PuLID — influence is holistic (style + content + identity)
- ⚠️ Reference images can "bleed" style/content, not just identity
- ⚠️ Requires FLUX.1-dev model (not schnell) — schnell users would need to download dev

#### Kontext — alternative/complement

**What it does:** Kontext is Black Forest Labs' official in-context editing model. Core capabilities include **character consistency** (preserving unique elements across scenes), local editing, and style reference. It operates by taking a reference image + text instruction to produce an edited variant.

**Better for:** "Take this image of Alice and change the background to a moonlit forest" (editing)
**Worse for:** "Generate a new scene featuring Alice" (new compositions from reference)

**Potential complement:** Could use Redux for initial character-consistent generation, then Kontext for iterative refinement/editing of the result.

### Decision

**Use Redux as the primary character adapter.** It maps cleanly to our existing architecture:
- Character's `reference_images[]` → `redux_image_paths`
- Character's `characterStrength` → applied uniformly as `redux_image_strengths`  
- Pipeline switches from `Flux1` to `Flux1Redux` when a character is selected
- Falls back to standard `Flux1` when no character selected

### Sources

- mflux GitHub (feature list + API): https://github.com/filipstrand/mflux
- mflux FLUX.1 README (Redux docs): https://github.com/filipstrand/mflux/blob/main/src/mflux/models/flux/README.md
- XLabs-AI FLUX IP-Adapter (not used, ComfyUI-only): https://huggingface.co/XLabs-AI/flux-ip-adapter
- InstantX FLUX IP-Adapter (not used, ComfyUI-only): https://comfyui-wiki.com/en/news/2024-11-22-instantx-flux-ipadapter-release

---

## 8b) Identity Adapter Follow-up — Redux Limitations & mflux Landscape (March 2026)

### Context

After completing M5.5 (Redux integration) and M5.6 (adapter management), user testing revealed that Redux-generated images have a similar aesthetic/style to reference images but do NOT preserve precise facial identity. This section documents the investigation into improving character resemblance.

### Redux Limitations — Why Faces Don't Match

Redux operates on **holistic image embeddings** via a dedicated encoder that joins with T5 text encodings in the attention layers. This means:

- ✅ Color palette, clothing style, hair color, and general composition carry over well
- ✅ Overall "feel" and aesthetic of the reference images influence the output
- ❌ Facial geometry, eye shape, nose structure, and other fine identity features are NOT preserved
- ❌ Redux does not extract or lock in specific facial landmarks — it treats the entire image as a style/content reference

This is fundamentally different from face-identity adapters (InstantID, PuLID, IP-Adapter-FaceID) which use dedicated face encoders (e.g., InsightFace/ArcFace) to extract and inject facial identity embeddings.

### Best Tuning Tips for Redux

- **Strength 0.85–0.95** — push as high as possible to maximize reference influence
- **2–3 clear, front-facing photos** — consistent lighting, minimal background clutter
- **Describe facial features in prompt** — "a man with brown hair, blue eyes, short beard, strong jawline"
- **Use FLUX.1-dev** (not schnell) — Redux requires the dev model
- **Fewer reference images can be better** — 2–3 high-quality images outperform 5+ varied ones

### mflux Variant Investigation (v0.16.8–0.16.9)

Explored all mflux model variants for potential identity preservation:

| Variant | Purpose | Identity Use? |
|---------|---------|---------------|
| `txt2img` (Flux1) | Standard text-to-image | No — our current pipeline |
| `redux` (Flux1Redux) | Image variation/influence | Partial — holistic style, not face-specific |
| `kontext` (Flux1Kontext) | In-context editing | Potential complement — edit Redux output to refine |
| `in_context` | Dev/fill in-context variants | No — editing-focused |
| `controlnet` | Canny edge conditioning | No — structure control, not identity |
| `depth` | Depth map conditioning | No — spatial layout control |
| `fill` | Inpaint/outpaint | No — mask-based editing |
| `concept_attention` | Concept heatmap extraction | No — analysis tool, not generation identity |

**Key finding:** None of the current mflux variants provide face-specific identity preservation.

### What Would Actually Solve This

True facial identity adapters that would solve this problem:

1. **IP-Adapter-FaceID** — Uses InsightFace embeddings for face-specific conditioning
2. **PuLID** — Pure and Lightning ID customization, has experimental FLUX support via Nunchaku/ComfyUI
3. **PhotoMaker V2** — Identity customization without full LoRA training
4. **InstantID** — Single-image identity-preserving adapter

**Status in mflux:** None of these are available as of v0.16.9 (latest). The mflux changelog (0.15.0–0.16.9) shows focus on FLUX.2, Z-Image, FIBO, SeedVR2, LoRA training, and quantization improvements — no identity adapter work.

### Decision

- **Short term:** Document Redux limitations and tuning tips. Redux is the best available option in mflux for character influence.
- **Medium term:** Add diffusers/PyTorch MPS as a secondary provider for face identity adapters. See §8c below.
- **Long term:** Monitor mflux upstream for native identity adapters.

### Sources

- mflux changelog: https://github.com/filipstrand/mflux/blob/main/CHANGELOG.md
- mflux variants source: `mflux/models/flux/variants/` (checked all subdirectories)
- PuLID-FLUX (ComfyUI): https://github.com/ToTheBeginning/PuLID
- IP-Adapter (HuggingFace): https://huggingface.co/h94/IP-Adapter

---

## 8c) Multi-Runtime Research — Face Identity via Diffusers/PyTorch MPS (March 2026)

### Context

After confirming that mflux has no native face-identity adapter support (§8b), we investigated whether adding HuggingFace `diffusers` with PyTorch MPS as a secondary runtime could solve the character resemblance problem. The goal: true facial identity preservation across generations.

### Options Evaluated

#### Option 1: XLabs-AI IP-Adapter v2 via diffusers ✅ RECOMMENDED

- **What:** IP-Adapter for FLUX.1 that uses CLIP vision embeddings for image-prompt conditioning
- **HuggingFace:** `XLabs-AI/flux-ip-adapter-v2` (~1.5GB adapter weights)
- **Image encoder:** `openai/clip-vit-large-patch14` (~1.5GB)
- **API:** Standard diffusers `FluxPipeline.load_ip_adapter()` — clean, maintained API
- **Apple Silicon:** Works on MPS. Some patches may be needed for rotary position embeddings (documented in community guides). M1 through M4 all supported.
- **Face identity quality:** Uses CLIP vision (holistic image features, not face-specific). Better than Redux for identity because CLIP captures more semantic structure. For FaceID-specific work, XLabs-AI has a community fork with InsightFace integration (`JnJarvis/x-flux-ip-adapter-faceid`).
- **Performance:** ~2-4 min per 1024x1024 image on M3 Max (FP16/bfloat16), 4 steps with schnell
- **License:** FLUX.1-dev non-commercial; FLUX.1-schnell Apache 2.0

**Python API (confirmed working):**
```python
import torch
from diffusers import FluxPipeline
from transformers import CLIPVisionModelWithProjection

image_encoder = CLIPVisionModelWithProjection.from_pretrained(
    "openai/clip-vit-large-patch14", torch_dtype=torch.bfloat16
)
pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-dev", image_encoder=image_encoder,
    torch_dtype=torch.bfloat16
).to("mps")
pipe.load_ip_adapter(
    "XLabs-AI/flux-ip-adapter-v2", weight_name="ip_adapter.safetensors"
)
pipe.set_ip_adapter_scale(0.7)
result = pipe(prompt="...", ip_adapter_image=face_image, ...).images[0]
```

#### Option 2: PuLID-FLUX via Nunchaku ❌ ELIMINATED

- **What:** Best-in-class face identity (InsightFace + EVA-CLIP embeddings, contrastive alignment)
- **Apple Silicon:** **Nunchaku is CUDA-only.** No ARM64 wheels. No MPS support. Cannot run on Mac.
- **Status:** Eliminated. If Nunchaku adds MPS support in the future, reconsider.

#### Option 3: PuLID-FLUX via custom diffusers pipeline 🔶 FUTURE

- **What:** Port PuLID's conditioning approach to work directly with diffusers FluxPipeline
- **Apple Silicon:** Theoretically possible — InsightFace works via ONNX Runtime CoreML EP, and the transformer conditioning could be implemented in PyTorch MPS
- **Complexity:** Very high — requires custom attention injection code, face parsing pipeline, EVA-CLIP integration
- **Status:** Too much engineering for near-term. Revisit after Option 1 is proven.

#### Option 4: InstantX FLUX.1-dev-IP-Adapter ⚠️ LESS SUITABLE

- **What:** `InstantX/FLUX.1-dev-IP-Adapter` — uses SigLIP (not CLIP) for image encoding
- **Apple Silicon:** Uses PyTorch; should work on MPS, but inference code is custom (NOT yet in diffusers standard API)
- **Identity quality:** Their own model card says "not for fine-grained style transfer or character consistency" — similar trade-off to Redux
- **Status:** Less promising than XLabs-AI v2 for our use case. Custom inference code would need porting.

#### Option 5: InsightFace face embeddings + custom conditioning 🔶 FUTURE

- **What:** Use InsightFace (ONNX Runtime + CoreML) to extract precise face embeddings, inject into FLUX via custom attention
- **Apple Silicon:** InsightFace works on Mac via ONNX Runtime CoreML EP (face detection + embedding in <2ms)
- **Complexity:** Highest — essentially building a custom face-identity pipeline from scratch
- **Status:** Possible, but premature. Revisit if XLabs-AI IP-Adapter isn't sufficient.

### Dependency Analysis

Adding a diffusers-based provider requires:

| Dependency | Size | Purpose |
|-----------|------|---------|
| `torch` | ~2.5GB | PyTorch runtime with MPS backend |
| `diffusers` | ~200MB | HuggingFace diffusion pipelines |
| `transformers` | Already installed | Model loading (already a dependency) |
| `accelerate` | ~100MB | Device management, model offloading |
| CLIP ViT-L/14 | ~1.5GB | Image encoder for IP-Adapter |
| XLabs IP-Adapter v2 | ~1.5GB | Adapter weights |
| FLUX.1-dev (FP16) | ~34GB | Base model (diffusers format, NOT mflux q8 format) |
| **OR** FLUX.1-schnell | ~24GB | Faster alternative (Apache 2.0, 4 steps) |

**Important:** The diffusers FluxPipeline requires FLUX model weights in the original HuggingFace safetensors format, NOT the mflux-quantized format we already have. This means the user would need to download an additional ~24-34GB of model weights. This is the biggest UX concern.

**Mitigation strategies:**
1. Use `FLUX.1-schnell` for IP-Adapter (Apache 2.0, smaller, faster — 4 steps) instead of dev
2. Use model offloading (`pipe.enable_model_cpu_offload()`) to reduce peak memory
3. Download only when user first activates an IP-Adapter character
4. Share `transformers` tokenizer/text encoder weights where possible

### Performance Expectations (M3 Max 64GB)

| Mode | Provider | Steps | Est. Time | Memory |
|------|----------|-------|-----------|--------|
| Standard text-to-image | MLX (mflux) | 4 (schnell) | ~55s | ~17GB |
| Standard text-to-image | MLX (mflux) | 25 (dev) | ~5-8 min | ~54GB |
| Redux character | MLX (mflux) | 25 (dev) | ~11 min | ~54GB |
| **IP-Adapter character** | **Diffusers (MPS)** | **4 (schnell)** | **~2-4 min** | **~28GB** |
| **IP-Adapter character** | **Diffusers (MPS)** | **25 (dev)** | **~8-15 min** | **~38GB** |

### Architecture Decision

**Dual-provider approach:** Keep mflux as the PRIMARY provider (fast, native MLX). Add diffusers as a SECONDARY provider specifically for adapter capabilities mflux doesn't have.

The `PipelineOrchestrator` already accepts a `RuntimeProvider` interface. We'll:
1. Create a `DiffusersProvider` implementing `RuntimeProvider` + `text_to_image_with_identity()` 
2. Route based on adapter type: Redux → MLXProvider, IP-Adapter → DiffusersProvider
3. Standard text-to-image always routes to MLXProvider (faster)
4. The character's `adapter_type` field determines which provider handles generation

This fits cleanly into our existing adapter management system (M5.6 Adapters tab). We add new adapter entries for the diffusers-based adapters.

### Sources

- XLabs-AI FLUX IP-Adapter v2: https://huggingface.co/XLabs-AI/flux-ip-adapter-v2
- XLabs-AI IP-Adapter FaceID fork: https://github.com/JnJarvis/x-flux-ip-adapter-faceid
- diffusers IP-Adapter docs: https://github.com/huggingface/diffusers/blob/main/docs/source/en/using-diffusers/ip_adapter.md
- diffusers FluxPipeline MPS guide: https://dev.to/0xkoji/run-flux1-on-m3-mac-with-diffusers-9m5
- HuggingFace MPS optimization: https://huggingface.co/docs/diffusers/en/optimization/mps
- Nunchaku (CUDA-only): https://github.com/nunchaku-ai/nunchaku/releases
- PuLID GitHub: https://github.com/ToTheBeginning/PuLID
- InsightFace ONNX Runtime + CoreML: https://github.com/deepinsight/insightface/issues/2238
- Flux Apple Silicon performance guide: https://www.apatero.com/blog/flux-apple-silicon-m1-m2-m3-m4-complete-performance-guide-2025
- PyTorch MPS backend: https://developer.apple.com/metal/pytorch/

## 8d) SDXL + IP-Adapter FaceID — True Face Identity on Apple Silicon (March 2026)

### Problem

The XLabs IP-Adapter v2 for FLUX uses CLIP vision embeddings, which encode **semantic/style** features (composition, color palette, general appearance) but NOT facial identity. Testing confirmed that generated images "look nothing like" the reference photos — the adapter simply cannot preserve face-specific features because CLIP was never trained for that.

### Solution: SDXL + IP-Adapter FaceID

IP-Adapter FaceID (by h94/Tencent) replaces CLIP embeddings with **InsightFace face recognition embeddings** (512-dim ArcFace vectors). These embeddings encode facial geometry, proportions, and distinguishing features — exactly what's needed for character consistency.

**Key insight:** While no FaceID adapter exists for FLUX, the h94 IP-Adapter FaceID PlusV2 for SDXL is mature, well-tested, and works on Apple Silicon via diffusers + PyTorch MPS.

### Architecture: Three Adapter Paths

Our multi-provider architecture can now support three character adapter types:

| Adapter Type | Base Model | Embedding | Face Likeness | Speed | Provider |
|---|---|---|---|---|---|
| Redux | FLUX (mflux) | FLUX Redux | ⚠️ Style only | ⚡ Fast (~60s) | MLX |
| IP-Adapter v2 | FLUX (diffusers) | CLIP ViT-L | ⚠️ Style/composition | 🐢 Slow (~3min) | Diffusers |
| **FaceID PlusV2** | **SDXL (diffusers)** | **InsightFace ArcFace** | **✅ Strong identity** | **🐢 Moderate (~90s)** | **Diffusers** |

### Component Stack

1. **InsightFace** (`insightface` + `onnxruntime`)
   - Face detection + ArcFace embedding extraction
   - Uses ONNX Runtime with CoreML EP on Apple Silicon (hardware-accelerated)
   - Model: `buffalo_l` (default, ~300MB download)
   - Output: 512-dim normalized face embedding per image
   - License: Non-commercial for open-source models

2. **SDXL Base Model** (`stabilityai/stable-diffusion-xl-base-1.0`)
   - Open-source, permissive CreativeML Open RAIL-M license
   - ~6.5GB model weights
   - Diffusers FluxPipeline replaced by StableDiffusionXLPipeline

3. **IP-Adapter FaceID PlusV2 SDXL** (`h94/IP-Adapter-FaceID`)
   - Weight file: `ip-adapter-faceid-plusv2_sdxl.bin` (~1.6GB)
   - LoRA file: `ip-adapter-faceid-plusv2_sdxl_lora.safetensors` (~400MB)
   - Combines InsightFace embedding + CLIP shortcut image features
   - PlusV2 is the best variant: higher fidelity than v1, FaceID, or FaceID-Plus

4. **CLIP Image Encoder** (reusable from existing IP-Adapter setup)
   - FaceID PlusV2 uses both InsightFace embedding AND CLIP features
   - `openai/clip-vit-large-patch14` already cached

### Diffusers Integration

```python
from diffusers import StableDiffusionXLPipeline

pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16,
)
pipe.load_ip_adapter(
    "h94/IP-Adapter-FaceID",
    subfolder=None,
    weight_name="ip-adapter-faceid-plusv2_sdxl.bin",
)
pipe.set_ip_adapter_scale(0.7)

# Pass InsightFace embedding directly
result = pipe(
    prompt="portrait, studio lighting",
    ip_adapter_image_embeds=[face_embedding_tensor],
)
```

The `StableDiffusionXLPipeline.__call__` accepts `ip_adapter_image_embeds` — allowing us to pass pre-computed InsightFace embeddings rather than raw images. This is the FaceID pathway.

### InsightFace on macOS Apple Silicon

- ONNX Runtime now ships ARM64 wheels with CoreML EP built-in
- `pip install insightface onnxruntime` works natively on Apple Silicon
- CoreML provider accelerates face detection/embedding via Neural Engine
- Fallback: CPU provider works but ~3x slower
- The `buffalo_l` model auto-downloads on first use (~300MB)

### Dependencies (New)

| Package | Size | Purpose |
|---|---|---|
| `insightface` | ~50MB | Face detection + ArcFace embedding |
| `onnxruntime` | ~30MB | ONNX inference runtime (CoreML EP on macOS) |
| SDXL base model | ~6.5GB | Downloadable via adapter manager |
| FaceID PlusV2 weights | ~1.6GB | Downloadable via adapter manager |
| FaceID PlusV2 LoRA | ~400MB | Downloadable via adapter manager |

### Trade-offs vs FLUX

- **Quality:** SDXL produces excellent images but FLUX generally has better prompt adherence and detail
- **Speed:** SDXL is faster than FLUX on diffusers/MPS (~90s vs ~200s for same step count)
- **Identity:** FaceID PlusV2 provides dramatically better face likeness than any FLUX adapter
- **Model size:** SDXL base is ~6.5GB (vs ~34GB for FLUX-dev in diffusers format)
- **Resolution:** SDXL native at 1024x1024, same as our FLUX output

### Recommendation

Add SDXL + FaceID PlusV2 as the **third adapter type** (`"faceid"`). This gives users a clear choice:
- **Redux** (FLUX/MLX): Fast, style-influenced, best for general character "vibe"
- **IP-Adapter** (FLUX/diffusers): Style/composition transfer from reference
- **FaceID** (SDXL/diffusers): True facial identity preservation ← **recommended for character consistency**

The DiffusersProvider already handles model loading — we extend it to support StableDiffusionXLPipeline alongside FluxPipeline. The orchestrator routing adds a third path.

### References
- h94 IP-Adapter-FaceID: https://huggingface.co/h94/IP-Adapter-FaceID
- SDXL base model: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- InsightFace GitHub: https://github.com/deepinsight/insightface
- ONNX Runtime CoreML: https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html
- Diffusers IP-Adapter docs: https://huggingface.co/docs/diffusers/using-diffusers/ip_adapter
- FaceID PlusV2 examples: https://www.mybyways.com/blog/consistent-portraits-using-ip-adapters-for-sdxl

---

## 9) Character Identity: LoRA Training vs Zero-Shot Approaches

### 9a) Why IP-Adapter FaceID produces mediocre likeness

IP-Adapter FaceID (including PlusV2) works at **inference time** — it encodes a face into a 512-dim vector and uses it as conditioning. This captures general facial geometry (face shape, approximate proportions) but loses fine-grained details that make someone look like *them*:

- **512 dimensions** is a very compressed representation of a face
- The adapter was trained to generalize across all faces, not memorize any single one
- PlusV2 adds CLIP shortcut features (skin texture, hair color, lighting) which helps, but still operates as a soft nudge rather than a hard identity lock
- Identity strength above ~0.7 tends to produce artifacts rather than better likeness

**Verdict:** Good for "someone who looks vaguely like X" — inadequate for "this IS person X."

### 9b) LoRA training — the gold standard for face identity

LoRA (Low-Rank Adaptation) fine-tunes the model itself to learn a specific person's face. The result is a small adapter file (50-200MB) that, when loaded, lets the model generate that exact person in any pose, scene, or style.

**Why it works so much better:**
- The model literally learns the person's face during training (thousands of gradient updates)
- Captures micro-details: exact eye spacing, nose shape, skin texture, wrinkle patterns
- Can be triggered by a simple keyword in the prompt (e.g., "photo of ohwx man")
- Works across wildly different scenes and styles once trained

**Two viable architectures for our app:**

| Approach | Base Model | Training Tool | Training Time (M3 Max) | Quality |
|----------|-----------|---------------|----------------------|---------|
| **FLUX LoRA** | FLUX.1-dev | ai-toolkit / SimpleTuner | 2-4 hours | Excellent — FLUX has superior face rendering |
| **SDXL LoRA** | SDXL 1.0 / RealVisXL | kohya-ss / sd-scripts | 1-3 hours | Very good — huge ecosystem, well-understood |

### 9c) FLUX LoRA training (recommended)

FLUX produces the best image quality of any open model, and LoRA training is well-supported:

- **Tools:** [ai-toolkit](https://github.com/ostris/ai-toolkit) or [SimpleTuner](https://github.com/bghira/SimpleTuner)
- **Dataset:** 15-30 high-quality photos of the subject (varied angles, lighting, expressions)
- **Training:** ~1000-2000 steps, learning rate 1e-4, rank 16-32, batch size 1-2
- **Output:** ~150MB .safetensors LoRA file
- **Apple Silicon:** Works on M-series with PyTorch MPS, but slow (2-4 hours). Cloud training (RunPod, Replicate) takes 15-30 minutes and costs ~$2-5.
- **Inference:** Load via diffusers `pipe.load_lora_weights()`, trigger with keyword

**Advantage:** The LoRA works with our existing FLUX/mflux pipeline for fast MLX inference after training.

### 9d) SDXL LoRA training (alternative)

SDXL has a more mature training ecosystem:

- **Tools:** [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts) — battle-tested, excellent GUI
- **Dataset:** 20-50 photos recommended
- **Training:** ~1500-3000 steps, learning rate 1e-4 to 5e-5, rank 32-64
- **Output:** ~50-150MB .safetensors LoRA file
- **Apple Silicon:** Supported but slow. kohya-ss has the best Mac compatibility.
- **Inference:** Works with our existing SDXL/DiffusersProvider pipeline

### 9e) Recommended approach for Imagen Heap

**Hybrid strategy:**

1. **Keep FaceID PlusV2** as the "quick start / zero-training" option for casual use
2. **Add LoRA training support** as the "pro" path for users who want true likeness:
   - User provides 15-30 reference photos of their character
   - App launches training (locally or offers cloud option)
   - Trained LoRA is saved per-character and auto-loaded during generation
   - Character card shows which adapter is active (FaceID vs trained LoRA)

3. **LoRA at inference is trivial** — just `pipe.load_lora_weights("path/to/lora.safetensors")`
4. **Training integration** can be phased:
   - Phase 1: Manual LoRA import (user trains externally, imports .safetensors)
   - Phase 2: Guided training wizard in-app (dataset prep, training, evaluation)
   - Phase 3: One-click cloud training option

### 9f) Dataset requirements for face LoRA training

| Requirement | Details |
|------------|---------|
| **Quantity** | 15-30 images minimum (50+ for best results) |
| **Resolution** | 1024×1024+ (will be resized/bucketed by trainer) |
| **Variety** | Multiple angles, lighting conditions, expressions |
| **Quality** | Sharp, well-lit, face clearly visible |
| **Captions** | One .txt file per image: "photo of ohwx man, [description]" |
| **Trigger word** | Unique token like "ohwx" that won't conflict with existing vocabulary |
| **What to avoid** | Sunglasses, heavy makeup, group photos, low-res, duplicate poses |

### 9g) References

- ai-toolkit (FLUX LoRA): https://github.com/ostris/ai-toolkit
- SimpleTuner: https://github.com/bghira/SimpleTuner
- kohya-ss/sd-scripts (SDXL LoRA): https://github.com/kohya-ss/sd-scripts
- CivitAI SDXL LoRA training guide: https://civitai.com/articles/9205
- Flux LoRA settings guide: https://civitai.com/articles/7097
- Training on Apple Silicon: https://www.reallyar.com/training-stable-diffusion-lora-on-apple-silicon-m2-mac-gpus-metal/
- FluxGym (browser-based): https://github.com/cocktailpeanut/fluxgym
- Segmind easy FLUX LoRA: https://blog.segmind.com/easy-flux-lora-training-guide/
