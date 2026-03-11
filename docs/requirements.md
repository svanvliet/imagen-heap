# Product Requirements Document: AI Image & Asset Creation App

**Version:** 0.2
**Status:** Reviewed — decisions incorporated 2026-03-06
**Hardware Reference:** MacBook Pro M3 Max, 64 GB unified memory
**Distribution:** Internal / personal use (commercial distribution evaluated later)

---

## 1. Problem Statement & Product Vision

### Problem

Existing local AI image generation tools force users into one of two extremes: oversimplified one-shot generators that lack consistency controls (DiffusionBee, Draw Things), or node-graph power tools that demand expert knowledge to produce reliable results (ComfyUI, AUTOMATIC1111). No current desktop app delivers a guided, task-oriented workflow for generating consistent characters across multiple scenes with controllable posing—without requiring the user to understand samplers, graph topologies, or adapter stacking.

### Vision

A local-first desktop application for macOS (Apple Silicon) that makes AI image and asset creation accessible by default and powerful on demand. The app treats character consistency, pose control, and scene continuity as first-class product features—not expert-only configuration exercises. When local hardware or model availability is insufficient, the app transparently routes work to cloud-hosted models via Microsoft Foundry, giving users access to larger or specialized models without leaving the app.

### Critical Evaluation of Research Gaps

The research document (docs/research.md) provides a solid landscape overview but has notable gaps that this PRD must address:

- **No hybrid/cloud inference strategy.** The research is entirely local-focused; it does not address routing to Microsoft Foundry or any cloud backend.
- **No concrete performance data.** No benchmarks for actual generation times or memory ceilings on M3 Max 64 GB with stacked adapters + ControlNets.
- **Maturity conflation.** StoryDiffusion and ID-Aligner are cited alongside production-ready tools (InstantID, ControlNet) without distinguishing research-stage from shippable.
- **LoRA training feasibility is assumed, not validated.** Training LoRAs on Apple Silicon with unified memory has real throughput and tooling constraints that are unaddressed.
- **No privacy, security, cost, or accessibility analysis.**
- **No first-run or model acquisition UX.** Models are multi-GB; download, caching, disk budgeting, and offline scenarios are unaddressed.
- **No quantization tradeoff guidance.** Q4/Q8/FP16/BF16 selection impacts quality, speed, and memory but is not discussed.
- **Output format and editing workflows (inpaint, outpaint, img2img) are mentioned in passing but not systematically treated.**

This PRD fills these gaps with concrete, testable requirements.

---

## 2. Goals and Non-Goals

### Goals

| ID | Goal |
|----|------|
| G-001 | Deliver a Mac-native (Apple Silicon) desktop app that runs base image generation entirely on-device with no mandatory network dependency (network required only for initial model download and optional cloud inference). |
| G-002 | Provide a two-layer UX: a guided "Simple Mode" for common tasks and an "Advanced Mode" exposing full pipeline controls. |
| G-003 | Make character consistency, pose control, and scene continuity first-class guided workflows—not expert configuration. |
| G-004 | Enable hybrid inference: route jobs to Microsoft Foundry cloud models when local hardware/model constraints are exceeded, with user awareness and control. |
| G-005 | Persist full generation metadata (seed, prompt, model, adapters, control maps) for reproducibility. |
| G-006 | Ship with a curated, license-clear default model set that works out of the box after initial download. |
| G-007 | Design for Windows portability from day one via runtime abstraction, even though Windows ships later. |

### Non-Goals

| ID | Non-Goal |
|----|----------|
| NG-001 | Exposing a node-graph / visual programming interface. Internal DAG is an implementation detail, not a user-facing feature. |
| NG-002 | Video or animation generation in MVP. |
| NG-003 | On-device LoRA training is not required for MVP GA. Optional experimental support may be evaluated during MVP only if it does not delay core delivery. |
| NG-004 | Mobile (iOS/Android) support. |
| NG-005 | Multi-user collaboration or shared project workspaces. |
| NG-006 | Running as a web service or SaaS product. |
| NG-007 | Supporting NVIDIA/AMD GPUs on macOS. Apple Silicon (Metal/MLX) only for macOS builds. |
| NG-008 | Built-in NSFW / content safety filter in MVP. Content moderation may be added post-MVP based on distribution requirements. |

---

## 3. Primary Users and Jobs-to-be-Done

### User Personas

**Persona A — Creative Professional ("Sara")**
- Illustrator / concept artist / content creator.
- Needs consistent characters across a set of scenes (e.g., storyboard, social media series, children's book).
- Values speed, reproducibility, and visual control (pose, composition).
- Comfortable with creative software (Photoshop, Procreate) but not ML tooling.

**Persona B — Enthusiast / Hobbyist ("Dev")**
- Explores AI image generation for personal projects, game assets, RPG character art.
- Wants to experiment with different models, LoRAs, and styles.
- Comfortable with technical controls but frustrated by ComfyUI's complexity for routine tasks.

**Persona C — Small Business / Indie Creator ("Mia")** *(aspirational — applies when distribution expands beyond internal/personal use)*
- Needs marketing visuals, product mockups, branded content with consistent style.
- Budget-conscious; prefers local generation to per-image API costs.
- Needs commercial-use-safe outputs; licensing clarity is critical.

### Jobs-to-be-Done

| JTBD | Persona | Priority |
|------|---------|----------|
| Generate a high-quality image from a text prompt in under 60 seconds | All | P0 |
| Create a character and reuse them across 5+ scenes with recognizable identity | A, B | P0 |
| Control the pose and composition of a character in a scene | A, B | P0 |
| Quickly iterate on variations of a generation (style, framing, details) | All | P0 |
| Use a larger/better cloud model when local results are insufficient | A, C | P1 |
| Export assets with transparency for compositing | A, C | P1 |
| Know which outputs are safe for commercial use | C | P1 |
| Batch-generate variants for A/B selection | A, C | P1 |
| Train a custom character model from reference images | A, B | P2 (V1.1) |

---

## 4. Core User Flows

### 4.1 Simple Mode

Simple Mode is the default. It is task-oriented: users pick an outcome, not parameters.

**Flow S1: Quick Generate**
1. User types a prompt.
2. App uses default quality profile, model, and sampler settings.
3. Image generates; result appears in canvas.
4. User can: regenerate (new seed), create variations, upscale, or save.

**Flow S2: Character Create & Reuse**
1. User opens "Characters" panel → "New Character."
2. User provides: name, 1–5 reference images, optional text description.
3. App creates a Character Card (internally selects best identity adapter: InstantID/PhotoMaker/PuLID based on input type).
4. User generates with character selected → identity is injected into pipeline.
5. Character persists across sessions.

**Flow S3: Posed Scene**
1. User selects a character + enters scene prompt.
2. User opens "Pose" control → picks from preset poses or imports a reference image.
3. App extracts pose skeleton / depth map and applies as ControlNet conditioning.
4. User adjusts pose strength slider (simple: "subtle → strict").
5. Generation produces character in specified pose/scene.

**Flow S4: Scene Sequence**
1. User creates a "Project" with a shot list (Scene A, B, C…).
2. Each scene inherits locked properties (character, style, aspect ratio) from the project.
3. User can lock/unlock individual properties per scene.
4. Batch generation across all scenes with continuity.

### 4.2 Advanced Mode

Advanced Mode is opt-in per session or globally. It reveals pipeline internals.

**Exposed controls include:**
- Model selection (base model, VAE, text encoders).
- Sampler, scheduler, step count, CFG/guidance scale.
- ControlNet stack: multiple conditioning layers with individual type, weight, start/end step.
- Adapter stack: identity adapters with strength, IP-Adapter weights.
- LoRA selection and blend weights.
- Seed management (lock, increment, randomize).
- Inpaint/outpaint mask editor.
- Img2img with denoising strength.
- Prompt weighting syntax (e.g., `(keyword:1.3)`).
- Negative prompt.
- Hires fix / multi-pass upscale settings.

---

## 5. Functional Requirements

### 5.1 Image Generation

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-001 | Text-to-image generation from a natural language prompt. | Given a text prompt, the app produces an image within the configured quality profile's time budget. |
| FR-002 | Support at least two generation quality profiles: "Fast Draft" (≤4 steps, optimized for speed) and "Quality" (20–30 steps). | User can switch profiles; generation time and output quality differ measurably. |
| FR-003 | Image-to-image generation with user-supplied reference image and denoising strength control. | Given a source image and prompt, output reflects both; denoising strength slider ranges 0.0–1.0. |
| FR-004 | Inpainting: user paints a mask region; masked area is regenerated while unmasked area is preserved. | Mask editor supports brush size, eraser; output preserves unmasked pixels within tolerance. |
| FR-005 | Outpainting: extend canvas in any direction with generated content. | User selects extend direction and size; generated region blends seamlessly with original. |
| FR-006 | Batch generation: generate N variants (2–16) from a single prompt/config with different seeds. | All N images generated; seeds recorded; user can compare in grid view. |
| FR-007 | Upscaling: 2× and 4× upscale of any generated or imported image. | Output resolution matches target multiplier; detail quality is subjectively improved. |
| FR-008 | Background removal: generate or extract foreground subject with transparent background. | Output is PNG with alpha channel; background pixels are transparent. |
| FR-009 | Face restoration: optional post-processing to fix facial artifacts. | Toggle on/off; when enabled, faces in output are measurably less distorted. |
| FR-010 | Aspect ratio presets (1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4) and custom pixel dimensions. | Selected ratio constrains output dimensions; custom dimensions are respected within model limits. |

### 5.2 Character Consistency

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-020 | Create a Character Card from 1–5 reference face/body images plus optional text description. | Card is saved; thumbnail is generated; card is selectable in generation flow. |
| FR-021 | Apply a Character Card to any generation so the output preserves recognizable identity of the character. | Given the same character card and 5 different scene prompts, a human evaluator can identify the same character in ≥4/5 outputs. |
| FR-022 | Support multiple identity adapter backends (InstantID, PhotoMaker, PuLID) selected automatically or manually. | App auto-selects adapter based on input type; user can override in Advanced Mode. Adapter selection is recorded in metadata. |
| FR-023 | Character Cards persist across sessions and are stored in a user-accessible library. | After app restart, all previously created character cards are available. |
| FR-024 | Character identity strength slider: control how strongly identity is enforced (0.0–1.0). | At 0.0, output shows no identity resemblance; at 1.0, identity is maximally enforced. |
| FR-025 | Support using 2+ characters in a single scene. | User can assign characters to spatial regions (left/right/mask); output shows both characters. |

### 5.3 Pose & Composition Control

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-030 | Pose control via preset pose library (at least 20 built-in poses covering standing, sitting, action, portrait). | User picks a pose; generation respects body position within acceptable tolerance. |
| FR-031 | Pose control via reference image: user uploads an image; app extracts pose skeleton and applies as conditioning. | Extracted skeleton is previewed; output body position matches reference. |
| FR-032 | Interactive 2D skeleton editor for manual pose adjustment. | User can drag joints; skeleton updates in real-time; generation uses edited skeleton. |
| FR-033 | Depth map conditioning: extract or import depth map for scene composition control. | Depth map is previewed; generation respects spatial layout. |
| FR-034 | Canny/edge conditioning for structural guidance. | Edge map is previewed; output preserves structural outlines. |
| FR-035 | Multi-ControlNet: stack 2+ conditioning types simultaneously (e.g., pose + depth). | Each conditioning layer has independent type, weight, start/end step. Output reflects combined guidance. |
| FR-036 | Conditioning strength slider per control layer ("subtle" to "strict," mapped to 0.0–1.5 weight range). | Increasing strength produces output more closely matching the conditioning input. |

### 5.4 Scene Continuity & Projects

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-040 | Create a Project containing an ordered list of Scenes. | Project is saved; scenes are ordered; project is reopenable. |
| FR-041 | Project-level locks: lock character, style prompt, aspect ratio, or model across all scenes. | Locked properties propagate to new scenes; changing a lock updates all scenes that inherit it. |
| FR-042 | Per-scene overrides for any project-level property. | User can unlock and modify a property for one scene without affecting others. |
| FR-043 | Shot list view: thumbnail grid of all scenes in a project with status indicators. | All scenes visible; regenerated scenes update thumbnails; order is drag-reorderable. |
| FR-044 | Style transfer: extract and apply style from a reference image or previous generation. | Style reference produces outputs with similar color palette, texture, and artistic style. |

### 5.5 Model Management

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-050 | Model catalog: browse, search, and download models from a curated registry. | Catalog displays model name, size, license, compatibility, and description. Download shows progress and is resumable. |
| FR-051 | Ship with a default model set that auto-downloads on first run. Default set ≤ 15 GB total (Q4 quantized variants preferred to minimize download size where quality is acceptable). | After first-run download, user can generate without further downloads. |
| FR-052 | License-aware model tagging: each model is tagged with its license type (Apache-2.0, non-commercial, community, etc.). | License tag is visible in model selector and in generation metadata. |
| FR-053 | Commercial-use filter: user can enable "commercial safe" filter that hides non-commercial models from selection. | When enabled, only commercially licensed models appear. |
| FR-054 | Quantization selection: user can choose quantization level (Q4, Q8, FP16) per model where variants are available. Q4 is an acceptable quality floor for constrained scenarios (memory pressure, faster download). | Each quantization variant shows estimated VRAM usage and quality tradeoff note. Default selection is Q8 for balanced quality/memory; Q4 offered as explicit fallback. |
| FR-055 | Disk budget management: display total model storage used; allow user to set a disk budget; warn when approaching limit. | Budget is displayed; warning fires at 80% of budget; user can delete models from manager. |
| FR-056 | Import custom models from local filesystem (safetensors, GGUF, MLX format). | Imported model is registered in catalog and usable in generation. |
| FR-057 | Import community LoRAs from filesystem or URL. | LoRA is registered; user can select it in generation; weight slider 0.0–1.5. |

### 5.5b Adapter Management

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-058 | Adapter catalog: separate "Adapters" tab in Model Manager showing downloadable adapter models (Redux, ControlNet, LoRA, etc.) distinct from base generation models. | Adapters tab displays adapter name, type, compatible base models, size, license, download status. |
| FR-059 | Redux adapter: gated HuggingFace model (`FLUX.1-Redux-dev`) downloadable from Adapters tab. Handles gate/auth errors with same token flow as base models. | User can download Redux adapter, see progress, handle auth/license errors identically to base model downloads. |
| FR-060b | Inline adapter download: when user selects a character for generation and the required adapter (Redux) is not downloaded, show an inline download prompt in the sidebar with one-click download and progress. | User sees clear "Redux adapter required" callout with download button; download starts inline with progress bar; on completion, character generation works immediately. |
| FR-061b | Adapter status check: backend can report whether a specific adapter is downloaded/cached without attempting to load it. | `get_adapters` RPC returns adapter list with `downloaded` boolean; frontend uses this to show correct UI state. |
| FR-062b | Adapter deletion: user can delete downloaded adapters from Adapters tab to reclaim disk space. | Delete button removes adapter cache files; status updates to "available"; disk usage recalculated. |

### 5.6 Prompt Assistance

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-060 | Prompt templates: library of starting prompts organized by category (portrait, landscape, concept art, product shot, etc.). | At least 30 templates available; selecting one populates prompt field. |
| FR-061 | Style presets: named style configurations (e.g., "Cinematic," "Anime," "Photorealistic," "Watercolor") that modify prompt and model settings. | Selecting a preset changes generation output style; preset is recorded in metadata. |
| FR-062 | Negative prompt defaults: each style preset includes a sensible default negative prompt. | Default negative prompt is applied automatically; user can view and edit it. |
| FR-063 | Prompt history: searchable history of all prompts used. | History persists across sessions; user can search by keyword and re-use a past prompt. |

### 5.7 Export & Output

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-070 | Export images as PNG (with alpha), JPEG, or WebP. | All three formats produce valid files; PNG preserves transparency. |
| FR-071 | Export with embedded metadata: generation parameters (prompt, seed, model, adapters, ControlNet config) written to file EXIF/XMP or PNG text chunks. | Exported file can be re-imported; metadata is readable by the app and by standard tools (exiftool). |
| FR-072 | Export project as a ZIP archive containing all scene images plus a manifest JSON with full generation metadata. | ZIP contains all images and a valid JSON manifest; manifest is parseable and complete. |
| FR-073 | Copy image to system clipboard. | Paste into another app (e.g., Photoshop, Keynote) produces the image. |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| NFR-001 | "Fast Draft" (FLUX.1-schnell, 4-step, 1024×1024) generates in ≤15 seconds on M3 Max 64 GB. | Measured end-to-end from user action to image display; median of 10 runs ≤15s. |
| NFR-002 | "Quality" (FLUX.1-dev, 25-step, 1024×1024) generates in ≤90 seconds on M3 Max 64 GB. | Measured end-to-end; median of 10 runs ≤90s. |
| NFR-003 | Adding one ControlNet conditioning layer adds ≤30% to base generation time. | Measured relative to unconditioned generation of same step count. |
| NFR-004 | App cold start (launch to ready-to-generate) ≤10 seconds, excluding model load. | Timed from app icon click to prompt field being active. |
| NFR-005 | Model hot-swap (switching base model) completes in ≤20 seconds. | Timed from selection to ready-to-generate with new model. |
| NFR-006 | App consumes ≤2 GB RSS when idle (no generation in progress, no model loaded). | Measured via Activity Monitor. |
| NFR-007 | Peak memory during generation with FLUX.1-dev + 1 ControlNet + 1 identity adapter ≤55 GB unified memory at default quantization (Q8). Q4 quantization reduces peak further and serves as the fallback when headroom is insufficient. | Measured via instrument/profiler. Ensures headroom on 64 GB machine. |
| NFR-008 | Generation progress is reported to the UI with step-level granularity (progress bar updates per diffusion step). | Progress bar advances visibly with each step; no stalls >5 seconds between updates. |

### 6.2 Reliability

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| NFR-010 | Generation failure (OOM, model error, adapter incompatibility) produces a clear, actionable error message—never a crash or hang. | Failure is caught; error message includes what failed and a suggested fix. |
| NFR-011 | If generation exceeds memory capacity, app aborts gracefully and suggests: reduce resolution, use quantized model, or route to cloud. | OOM is detected pre-emptively or caught; suggestion is context-appropriate. |
| NFR-012 | All user data (projects, characters, history, settings) survives app crash without corruption. | After force-quit, relaunch shows all data intact. |
| NFR-013 | Model downloads are resumable after network interruption. | Interrupting and resuming a download continues from last checkpoint, not from zero. |

### 6.3 Privacy & Security

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| NFR-020 | Local-only mode: when cloud inference is disabled (default), zero bytes of user data (prompts, images, metadata) leave the device. | Network monitor confirms no outbound traffic during local generation. |
| NFR-021 | Cloud inference requires explicit user opt-in per session or per generation. | First cloud request triggers a consent dialog; user can revoke at any time. |
| NFR-022 | When using cloud inference, the app displays exactly what data is sent (prompt text, conditioning images, model selection). | Pre-send confirmation dialog lists all transmitted data items. |
| NFR-023 | Cloud-transmitted images and prompts are not stored server-side beyond the inference request lifetime, or the app documents the cloud provider's retention policy. | App settings link to Microsoft Foundry data handling policy; policy is ≤30-day retention or zero-retention. |
| NFR-024 | No telemetry or analytics without explicit user consent. | App functions fully with analytics disabled; opt-in is a clear toggle in settings. |
| NFR-025 | User-generated content and models are stored in a user-owned directory (e.g., `~/Documents/ImageGen/` or user-configured path). | Path is configurable in settings; data is accessible via Finder. |

### 6.4 Cost Transparency

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| NFR-030 | Before any cloud inference request, display estimated cost (or "included in plan" if applicable). | Cost estimate is visible before user confirms generation. |
| NFR-031 | Provide a monthly cloud usage summary accessible from settings. | Summary shows total cloud generations, estimated cost, and comparison to local-only. |
| NFR-032 | Allow user to set a monthly cloud spending cap; block cloud requests when cap is reached. | Cap is configurable; when reached, cloud option is grayed out with explanation. Note: no organizational Foundry budget is pre-allocated; the cap is a user-configured safety mechanism. |

### 6.5 Accessibility

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| NFR-040 | All interactive controls are keyboard-navigable. | Full generation workflow (prompt → generate → save) is completable without mouse. |
| NFR-041 | All UI elements have appropriate labels for VoiceOver (macOS screen reader). | VoiceOver reads every button, slider, and input with a meaningful label. |
| NFR-042 | UI text meets WCAG 2.1 AA contrast requirements. | Automated contrast checker passes for all text elements. |
| NFR-043 | Generation progress and completion are announced to assistive technology. | VoiceOver announces "Generation started," "Step 5 of 25," and "Generation complete." |

---

## 7. Hybrid Inference Requirements (Local vs. Microsoft Foundry)

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| HI-001 | The app defaults to local inference. Cloud inference is off by default and must be explicitly enabled in settings. | Fresh install generates locally with no cloud configuration. |
| HI-002 | User can configure Microsoft Foundry credentials (API key or OAuth) in settings. Credentials are stored in the macOS Keychain. | Credentials are stored securely; retrievable after restart; not written to disk in plaintext. |
| HI-003 | When cloud is enabled, the app displays a "Local / Cloud" toggle per generation. | Toggle is visible in the generation panel; default position is "Local." |
| HI-004 | Auto-routing mode (opt-in): app automatically routes to cloud when a requested model is not available locally, or when estimated memory exceeds device capacity. | If user requests a model not downloaded locally, app prompts: "This model is available via cloud. Generate remotely?" |
| HI-005 | Manual routing mode: user can force any generation to cloud regardless of local availability. | "Generate on Cloud" button is always available when cloud is configured. |
| HI-006 | Cloud-generated images are visually tagged in the gallery with a cloud icon badge. | Badge is visible on thumbnail and in metadata panel. |
| HI-007 | Cloud inference timeout: if cloud response exceeds 120 seconds, abort and notify user. | Timeout is enforced; error message is displayed; user can retry or switch to local. |
| HI-008 | Cloud inference supports at minimum: text-to-image, image-to-image, and inpainting. ControlNet and identity adapters are supported if the cloud model endpoint supports them. | Supported capabilities are queried from the endpoint; unsupported features are grayed out with explanation. |
| HI-009 | Failover: if cloud request fails (network error, rate limit, server error), offer to retry or fall back to best available local model. | Failure produces actionable error; "Try locally" button is offered. |
| HI-010 | Cloud model catalog: display available Foundry models with capabilities, pricing, and license info. | Catalog is fetchable from Foundry API; displayed alongside local models. |
| HI-011 | Generation metadata records whether the image was generated locally or via cloud, including cloud model ID and endpoint. | Metadata field `inference_location` is always populated: `"local"` or `{"cloud": {"provider": "foundry", "model": "...", "endpoint": "..."}}`. |
| HI-012 | Foundry model discovery must support arbitrary deployable image-generation models except GPT-image/DALL·E class endpoints, which are explicitly out of scope for this app's cloud provider integration. | Discovery lists available non-GPT image endpoints; GPT-image/DALL·E endpoints are not offered in the routing UI. |
| HI-013 | Graceful empty-state: if Foundry discovery returns zero eligible models (none deployed, or all are excluded GPT-image/DALL·E), the cloud panel displays a clear "No cloud models available" message with a link to Foundry deployment docs. | Empty-state message is shown; no error or blank panel; user can still generate locally. |

**Key Tradeoff — Default Routing Policy:**
The default is local-only to maximize privacy and zero-cost operation. Auto-routing is opt-in because it introduces network dependency and potential cost. For users who enable cloud, the default is "suggest cloud, don't auto-send"—a confirmation step is required before the first cloud generation in each session.

---

## 8. Model & Licensing Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| ML-001 | MVP ships with support for FLUX.1-schnell (Apache-2.0) as the default fast model. | Schnell generates successfully out of the box after first-run download. |
| ML-002 | MVP supports FLUX.1-dev (non-commercial license) as the default quality model. | Dev generates successfully; license warning is displayed when selected with commercial filter enabled. |
| ML-003 | MVP supports SDXL 1.0 (OpenRAIL++-M) for ecosystem compatibility. | SDXL generates successfully; existing community LoRAs load and function. |
| ML-004 | Each model entry includes: name, version, architecture family, license SPDX identifier, file size, quantization level, minimum memory estimate, and source URL. | All fields are populated for every model in the catalog. |
| ML-005 | The app blocks generation when a non-commercial model is selected and commercial-safe mode is active. | Block is enforced; error message explains the license conflict. |
| ML-006 | Community LoRAs imported without license metadata are tagged as "License Unknown" and excluded from commercial-safe mode. | Unknown-license LoRA is importable and usable, but hidden when commercial filter is on. |
| ML-007 | Model files are verified against published SHA-256 checksums after download. | Checksum mismatch triggers re-download; user is notified. |

**Key Tradeoff — Default Model:**
For current internal/personal use, "Fast Draft" defaults to FLUX.1-schnell and "Quality" defaults to FLUX.1-dev to maximize local output quality. Because non-commercial defaults are acceptable at this stage, commercial-safe filtering remains available but is not enforced by default in MVP. SDXL is included for LoRA/ControlNet ecosystem breadth but is not the default.

---

## 9. Data & Metadata Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| DM-001 | Every generation produces a metadata record containing: timestamp, prompt, negative prompt, seed, model ID, model version, quantization level, sampler, scheduler, step count, CFG/guidance scale, resolution, all adapter IDs and weights, all ControlNet configs, inference location (local/cloud), generation time, and app version. | Metadata record is queryable from the app; all fields are populated; no field is null unless the feature was not used. |
| DM-002 | Metadata is stored in a local SQLite database alongside the generated image file. | Database is in the user data directory; queryable via the app's history/search. |
| DM-003 | Any previous generation can be exactly reproduced by loading its metadata and re-running (same seed, same model, same config → same output). | "Reproduce" button loads all parameters; output is bit-identical on same hardware/model/runtime. |
| DM-004 | Generation metadata is embedded in exported image files (PNG text chunks or EXIF/XMP). | Metadata survives file copy; readable by the app's import and by `exiftool`. |
| DM-005 | Character Card data is stored as: name, description, reference images (file paths), adapter type, adapter config, creation date, last-used date. | Character card is serializable to JSON; survives export/import. |
| DM-006 | Projects are stored as structured data (JSON or SQLite) containing scene list, per-scene metadata, project-level locks, and image references. | Project can be exported and re-imported on same or different machine with all metadata intact. |
| DM-007 | User can export full generation history as JSON or CSV for external analysis. | Export includes all metadata fields; file is valid JSON/CSV. |
| DM-008 | Provenance tracking: if an image was derived from another image (img2img, inpaint, upscale), the metadata links to the source image ID. | Provenance chain is navigable in the app: user can trace an image back to its origin. |

---

## 10. Character Consistency & Pose Control Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| CC-001 | Identity adapters must function on Apple Silicon via MLX or PyTorch MPS without CUDA dependency. Three adapter paths: Redux (mflux/MLX, style influence), IP-Adapter v2 (FLUX/diffusers, CLIP-based composition), FaceID PlusV2 (SDXL/diffusers + InsightFace, true facial identity). | Each adapter generates successfully on M3 Max (and earlier M1/M2); no CUDA code paths are invoked. |
| CC-001b | The runtime provider system supports multiple simultaneous providers (MLX primary, diffusers secondary). The `PipelineOrchestrator` routes to the appropriate provider based on adapter type. DiffusersProvider supports both FLUX (FluxPipeline) and SDXL (StableDiffusionXLPipeline). | Standard generation and Redux use MLXProvider; IP-Adapter and FaceID use DiffusersProvider; switching is transparent to the user. |
| CC-001c | FaceID adapter uses InsightFace (via ONNX Runtime + CoreML EP) for face embedding extraction, producing 512-dim ArcFace vectors passed to IP-Adapter FaceID PlusV2 SDXL. | Face embeddings extracted from reference images match the identity in generated output (ArcFace cosine similarity ≥ 0.5). |
| CC-002 | The app selects the appropriate identity adapter based on: character's configured adapter type, model compatibility, and available providers. User can choose adapter type per character (Auto, Redux, IP-Adapter, FaceID). | Auto-selection is documented; user can override adapter type in character edit; generation routes to correct provider. |
| CC-003 | Character identity preservation is testable: given the same Character Card and 10 diverse scene prompts, an automated face similarity metric (e.g., ArcFace cosine similarity) scores ≥0.5 on ≥7/10 outputs. | Automated test with ArcFace embedding comparison passes threshold. |
| CC-004 | Pose extraction (OpenPose, depth, canny) runs on-device as a preprocessing step; extracted map is previewed before generation. | Extraction completes in ≤5 seconds for a 1024×1024 input; preview is displayed. |
| CC-005 | The 2D skeleton editor supports at minimum 18 body keypoints (COCO format) and basic face landmarks. | All keypoints are draggable; skeleton renders correctly; generation uses edited skeleton. |
| CC-006 | Pose presets are stored as skeleton JSON files and are user-extensible (import/export). | User can import a skeleton JSON; it appears in the preset library. |

**Key Tradeoff — Adapter Selection:**
InstantID is the default for single-face workflows due to broad compatibility and zero-training requirement. PhotoMaker is preferred for multi-reference scenarios. PuLID-FLUX is offered when FLUX is the base model and PuLID provides better FLUX-specific quality. The auto-selection heuristic is a best-effort convenience; manual override is always available.

**Key Assumption & Risk:**
StoryDiffusion (consistent self-attention for sequence coherence) is research-stage. It is NOT included in MVP requirements. Scene continuity in MVP relies on Character Cards + locked project settings + seed management. StoryDiffusion integration is a V2 candidate if it matures.

**On-device LoRA Training (Decision + Benefits):**
On-device LoRA training is **not required for MVP** and inference-time identity adapters are sufficient for launch.  
Benefits of adding on-device LoRA support (as an optional/experimental track) include:
- stronger long-range identity persistence across diverse scenes/styles,
- better support for non-face subjects and stylized characters,
- reduced dependence on cloud training workflows,
- reusable custom character/style assets owned entirely by the user.
If pursued during MVP, it must remain explicitly experimental and not delay P0 delivery.

---

## 11. UX Requirements: Progressive Disclosure & Presets

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| UX-001 | The app defaults to Simple Mode on first launch. | First-run shows Simple Mode UI; Advanced Mode is accessible but not shown by default. |
| UX-002 | Simple Mode hides: sampler, scheduler, CFG, step count, negative prompt, ControlNet stack, LoRA blend weights, and model internals. | These controls are not visible or accessible in Simple Mode. |
| UX-003 | Advanced Mode is toggled via a single persistent switch (not buried in settings). | Toggle is in the main toolbar or sidebar; state persists across sessions. |
| UX-004 | Every parameter exposed in Advanced Mode has a tooltip explaining what it does and a recommended range. | Tooltip appears on hover/focus; includes a 1-sentence explanation and "typical range" note. |
| UX-005 | Style presets modify multiple parameters atomically (prompt suffix, model, sampler, CFG, negative prompt). Presets are read-only defaults; user modifications create a "Custom" variant. | Selecting a preset updates all linked parameters; modifying any parameter shows "Custom (based on X)." |
| UX-006 | Presets are stored as user-readable JSON files and are user-extensible (create/import/export). | User can create a new preset from current settings; export and import as JSON file. |
| UX-007 | First-run experience: guided setup that downloads the default model set, configures storage path, and generates a sample image to confirm the pipeline works. | First-run wizard completes in ≤5 steps; sample image is generated; user is ready to create. |
| UX-008 | Model download progress is visible, cancelable, and resumable during first-run and subsequent model additions. | Progress bar with percentage and ETA; cancel button; resume from interruption point. |
| UX-009 | All destructive actions (delete character, delete project, clear history) require confirmation. | Confirmation dialog with undo option or explicit "Delete" button. |
| UX-010 | Dark mode and light mode support, following system preference by default. | App respects macOS appearance setting; manual override available. |

---

## 12. Platform & Architecture Constraints

| ID | Constraint | Implication |
|----|-----------|-------------|
| PA-001 | macOS is the primary platform. Minimum: macOS 14 (Sonoma) on Apple Silicon (M1 or later). | No Intel Mac support. No macOS 13 or earlier. |
| PA-002 | Windows support is a future target (V2). Architecture must not hard-code macOS assumptions. | Runtime abstraction layer: MLX provider (macOS) + PyTorch CUDA provider (Windows, future). |
| PA-003 | Desktop shell: Tauri (selected). | Frontend in web technologies (HTML/CSS/JS or framework like React/Svelte); native bridge for file system, keychain, GPU info. |
| PA-004 | Inference backend: Python process with diffusers-compatible pipeline orchestration. | App launches and manages a Python sidecar process; communication via IPC (HTTP/localhost or stdio). |
| PA-005 | Models are stored on the local filesystem in a user-configurable directory. No cloud-only model storage. | App must handle external drives, symlinks, and storage migration. |
| PA-006 | Runtime provider interface must abstract: model loading, inference execution, memory queries, and device capability checks. Multiple providers can coexist (e.g., MLX for standard generation + diffusers/MPS for identity adapters). DiffusersProvider handles both FLUX and SDXL pipelines. | Adding a new provider requires implementing the `RuntimeProvider` interface, not modifying core logic. Orchestrator routes to correct provider based on generation mode. |
| PA-007 | App must be code-signed and notarized for macOS distribution. | Build pipeline produces a signed .dmg or .app bundle. |
| PA-008 | Python backend dependencies must be bundled within the app. The app embeds a full Python runtime (Decision: embedded runtime selected over user-managed environments). | User does not interact with pip, conda, or virtualenv. Python runtime is embedded in the app bundle; no external Python installation required. |

---

## 13. Risks, Dependencies, and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R-001 | Identity adapter quality degrades with certain art styles or non-photographic subjects. | High | Medium | Provide adapter strength control; allow fallback to LoRA-based identity; clearly document limitations per adapter. |
| R-002 | MLX support for new model architectures lags behind PyTorch/CUDA. | Medium | High | Maintain PyTorch MPS as fallback runtime; monitor MLX releases; contribute upstream if critical gaps emerge. |
| R-003 | FLUX.1-dev license changes or becomes more restrictive. | Low | High | Default to Apache-2.0 schnell; SDXL as backup; architect model layer to swap defaults without app changes. |
| R-004 | 64 GB unified memory is insufficient for FLUX.1-dev + ControlNet + identity adapter at full precision. | Medium | High | Default to Q8 or FP16 quantized models; measure actual peak memory; implement pre-generation memory estimation. |
| R-005 | Microsoft Foundry API changes, rate limits, or pricing shifts. | Medium | Medium | Abstract cloud provider behind interface; implement rate-limit handling and graceful degradation; cache Foundry capabilities locally. |
| R-006 | ComfyUI/diffusers ecosystem breaks compatibility with model updates. | Medium | Medium | Pin dependency versions; maintain compatibility test suite; decouple internal pipeline from external API surfaces. |
| R-007 | UX complexity creep as features are added. | High | High | Strict progressive disclosure policy; every new feature must have a Simple Mode default or be Advanced-only; UX review gate for every feature. |
| R-008 | LoRA training on Apple Silicon is too slow or memory-constrained for practical use. | High | Medium | Defer on-device training to V1.1; explore cloud-assisted training via Foundry; validate feasibility before committing to timeline. |
| R-009 | Large model downloads (5–15 GB per model) create poor first-run experience on slow connections. | Medium | Medium | Default model set ≤15 GB; resumable downloads; allow offline use after initial download; offer Q4 variants for smaller downloads. |
| R-010 | Embedded Python runtime increases app bundle size significantly. | Medium | Low | Use minimal Python distribution; lazy-install inference dependencies on first run; measure and optimize bundle size. |

### Key Dependencies

| Dependency | Type | Risk if Unavailable |
|-----------|------|---------------------|
| MLX framework (Apple) | Runtime | Fall back to PyTorch MPS; performance may degrade. |
| diffusers library (Hugging Face) | Pipeline orchestration | Core dependency; no practical alternative at same breadth. |
| InstantID / PhotoMaker / PuLID | Identity adapters | Reduced character consistency; fall back to prompt-only identity. |
| ControlNet models | Pose/composition | Lose pose control; degrade to prompt-only composition. |
| Microsoft Foundry API | Cloud inference | Cloud features unavailable; local-only operation unaffected. |
| Tauri | Desktop shell | Chosen for smaller footprint; switching later is expensive. |

---

## 14. Acceptance Criteria / Definition of Done for MVP

The MVP is shippable when ALL of the following are true:

| # | Criterion |
|---|-----------|
| AC-001 | User can install the app from a signed .dmg on macOS 14+ Apple Silicon and complete first-run setup (model download + sample generation) without terminal or command-line interaction. |
| AC-002 | Text-to-image generation works with FLUX.1-schnell (Fast Draft) and FLUX.1-dev (Quality) profiles on M3 Max 64 GB within the specified time budgets (NFR-001, NFR-002). |
| AC-003 | User can create a Character Card from a single face image and generate 5 different scenes where the character is recognizably consistent (FR-020, FR-021). |
| AC-004 | User can apply at least one pose conditioning method (OpenPose or depth) to a generation and the output respects the pose (FR-030, FR-031). |
| AC-005 | Generation metadata is persisted for every image and a previous generation can be reproduced from its metadata (DM-001, DM-003). |
| AC-006 | Cloud inference via Microsoft Foundry works for text-to-image when configured, with opt-in consent flow and cost visibility (HI-001 through HI-006, NFR-030). |
| AC-007 | Simple Mode flow is completable end-to-end (prompt → generate → save) without encountering Advanced Mode controls (UX-001, UX-002). |
| AC-008 | No generation failure produces a crash or hang; all errors surface actionable messages (NFR-010). |
| AC-009 | All generated images are exportable as PNG with embedded metadata (FR-070, FR-071). |
| AC-010 | App consumes ≤2 GB RSS when idle; peak memory during standard generation ≤55 GB (NFR-006, NFR-007). |

---

## 15. Phased Roadmap

### Phase 1: MVP

**Goal:** Core generation loop with character consistency and pose control on macOS.

| Capability | Requirements |
|-----------|-------------|
| Text-to-image (2 quality profiles) | FR-001, FR-002, FR-010 |
| Character Cards (single-face, identity adapter) | FR-020–FR-024 |
| Pose control (preset library + reference image extraction) | FR-030, FR-031, FR-036 |
| Single ControlNet conditioning (OpenPose or depth) | FR-033 or FR-034 |
| Simple Mode + Advanced Mode toggle | UX-001–UX-004 |
| Generation metadata + reproducibility | DM-001–DM-004 |
| Model manager (download, license display, disk budget) | FR-050–FR-055 |
| Microsoft Foundry cloud inference (text-to-image) | HI-001–HI-009 |
| Export (PNG with metadata, clipboard) | FR-070, FR-071, FR-073 |
| First-run setup wizard | UX-007, UX-008 |
| Style presets (at least 5) | FR-061, FR-062 |
| Error handling and graceful degradation | NFR-010, NFR-011 |

### Phase 2: V1.1

**Goal:** Richer editing, multi-character, SDXL ecosystem, and batch workflows.

| Capability | Requirements |
|-----------|-------------|
| Image-to-image generation | FR-003 |
| Inpainting and outpainting | FR-004, FR-005 |
| Multi-character scenes | FR-025 |
| Multi-ControlNet stacking | FR-035 |
| 2D skeleton editor | FR-032 |
| SDXL model support + community LoRA import | ML-003, FR-056, FR-057 |
| Batch generation + grid comparison | FR-006 |
| Upscaling and face restoration | FR-007, FR-009 |
| Background removal | FR-008 |
| Project / shot list view | FR-040–FR-043 |
| Prompt templates and history | FR-060, FR-063 |
| Cloud inference for img2img and inpainting | HI-008 |
| On-device LoRA training (optional experimental, non-blocking) | See R-008 |
| Project export (ZIP + manifest) | FR-072 |
| Accessibility audit pass | NFR-040–NFR-043 |

### Phase 3: V2

**Goal:** Windows support, sequence coherence, and ecosystem expansion.

| Capability | Requirements |
|-----------|-------------|
| Windows build (PyTorch CUDA provider) | PA-002, PA-006 |
| SD3.5 model support | Extend ML catalog |
| StoryDiffusion or equivalent sequence coherence (if matured) | Research-dependent |
| Style transfer from reference image | FR-044 |
| Cloud-assisted LoRA training via Foundry | Extend HI |
| Plugin/extension system for community model families | Extend FR-056 |
| Multi-language UI | Extend UX |
| Provenance chain visualization | DM-008 |
| Export history as JSON/CSV | DM-007 |

---

## 16. Resolved Decisions (2026-03-06)

The following decisions were made during requirements review and are now incorporated into the requirements above. They are preserved here for traceability.

| # | Decision | Incorporated In |
|---|----------|-----------------|
| D-01 | Foundry model scope: any image-generation models except GPT-image/DALL·E class endpoints. | HI-012, HI-013 |
| D-02 | Non-commercial model defaults acceptable for MVP (internal/personal use). | ML-002 Key Tradeoff, NG-008 |
| D-03 | Inference-time identity adapters sufficient for MVP; on-device LoRA training deferred to V1.1 (optional/experimental). | NG-003, CC Key Assumption |
| D-04 | Desktop shell: Tauri. | PA-003 |
| D-05 | Embedded Python runtime (no user-managed Python environments). | PA-008 |
| D-06 | Air-gapped / offline-first operation not required; normal online model downloads acceptable. | G-001, FR-051 |
| D-07 | No built-in NSFW / content safety filter in MVP. | NG-008 |
| D-08 | Distribution: internal/personal tool for now; may later become open-source or free/private-source. | Header, Persona C note |
| D-09 | No fixed organizational Foundry budget; user-configurable spending cap is the safety mechanism. | NFR-032 |
| D-10 | Q4 quantization is an acceptable quality floor when needed (memory pressure, download size). | FR-054, NFR-007 |

### Open Questions

None at this stage. New questions should be added only if discovered during implementation planning or prototype validation.
