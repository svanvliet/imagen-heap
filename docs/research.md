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
