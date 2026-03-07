# Implementation Plan: Imagen Heap

**Status:** Draft
**Last Updated:** 2026-03-07
**Requirements Reference:** [docs/requirements.md](./requirements.md)
**Research Reference:** [docs/research.md](./research.md)

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop shell | **Tauri** | Lighter than Electron; native macOS integration (PA-003) |
| Frontend framework | **React + TypeScript** | Largest ecosystem, component library breadth |
| Styling | **Tailwind CSS** | Utility-first, rapid iteration, great dark/light mode support |
| UI component library | **shadcn/ui** (Radix primitives) | Accessible by default, Tailwind-native, we own the code |
| State management | **Zustand** | Minimal boilerplate, TypeScript-friendly, fine-grained subscriptions |
| Frontend ↔ Backend IPC | **Tauri sidecar + stdio** | Tight integration, low overhead, managed lifecycle |
| Python inference | **diffusers + MLX** | MLX for Apple Silicon perf; diffusers for model/adapter breadth |
| Database | **SQLite** (via Tauri plugin) | Local-first, single-file, embedded — for metadata, history, projects |
| Design aesthetic | **Minimal/modern** | Whitespace-forward, muted palette, subtle animations (Linear/Raycast style) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Shell (Rust)                   │
│  ┌───────────────────────┐  ┌────────────────────────┐  │
│  │   React Frontend      │  │   Rust Backend         │  │
│  │   (WebView)           │  │   - File system ops    │  │
│  │                       │  │   - Keychain access    │  │
│  │   - Generation UI     │  │   - Sidecar management │  │
│  │   - Character mgmt    │  │   - SQLite (via plugin)│  │
│  │   - Model manager     │  │   - IPC bridge         │  │
│  │   - Pose studio       │  │   - Window management  │  │
│  │   - Project/scene     │  │                        │  │
│  │   - Settings          │  │                        │  │
│  └───────┬───────────────┘  └──────────┬─────────────┘  │
│          │    Tauri Commands / Events  │                │
│          └──────────────┬──────────────┘                │
│                         │ stdio IPC (JSON-RPC)          │
│  ┌──────────────────────▼──────────────────────────────┐│
│  │          Python Sidecar Process                     ││
│  │                                                     ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ ││
│  │  │ Pipeline     │  │ Model        │  │ Adapter    │ ││
│  │  │ Orchestrator │  │ Manager      │  │ Manager    │ ││
│  │  └──────┬───────┘  └──────────────┘  └────────────┘ ││
│  │         │                                           ││
│  │  ┌──────▼──────────────────────────────────────────┐││
│  │  │         Runtime Provider Interface              │││
│  │  │  ┌─────────────┐  ┌──────────────────────────┐  │││
│  │  │  │ MLX Provider│  │ PyTorch MPS Provider     │  │││
│  │  │  │ (primary)   │  │ (fallback)               │  │││
│  │  │  └─────────────┘  └──────────────────────────┘  │││
│  │  └─────────────────────────────────────────────────┘││
│  │                                                     ││
│  │  ┌─────────────────────────────────────────────────┐││
│  │  │         Cloud Provider Interface                │││
│  │  │  ┌──────────────────────────┐                   │││
│  │  │  │ Microsoft Foundry Client │                   │││
│  │  │  └──────────────────────────┘                   │││
│  │  └─────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### IPC Protocol

Communication between the Tauri Rust backend and the Python sidecar uses **JSON-RPC 2.0 over stdio**. Messages are newline-delimited JSON.

**Request flow:**
1. Frontend dispatches a Tauri command (e.g., `generate_image`)
2. Rust backend writes a JSON-RPC request to the Python sidecar's stdin
3. Python sidecar processes the request, streams progress notifications via JSON-RPC notifications
4. Python sidecar writes the JSON-RPC response to stdout
5. Rust backend forwards result/progress to frontend via Tauri events

**Progress streaming:**
```jsonc
// Progress notification (Python → Rust → Frontend)
{"jsonrpc": "2.0", "method": "progress", "params": {"job_id": "abc", "step": 5, "total_steps": 25, "preview_base64": "..."}}
```

---

## Design System & UX Principles

### Visual Language

- **Color palette:** Neutral grays (zinc/slate scale) with a single accent color (e.g., indigo-500) for primary actions. Minimal use of color — let the generated images be the color.
- **Typography:** System font stack (`-apple-system, BlinkMacSystemFont, "Inter"`) for UI. Clean, readable, generous line height.
- **Spacing:** 8px grid system. Generous padding. Content breathes.
- **Borders:** 1px subtle borders (`border-zinc-200` / `border-zinc-800`). Rounded corners (`rounded-lg` default).
- **Shadows:** Minimal — used only for elevated elements (modals, dropdowns, floating panels).
- **Animations:** Subtle, purposeful. Fade-in for new content, smooth transitions for panel open/close. No gratuitous motion. Use `framer-motion` sparingly.
- **Dark mode first:** Dark is the primary mode (image-centric apps look best dark). Light mode fully supported.

### Layout Concept

```
┌──────────────────────────────────────────────────────────────┐
│  Toolbar: [Mode Toggle] [Project] [Generate]    [Settings ⚙] │
├────────────┬─────────────────────────────────┬───────────────┤
│            │                                 │               │
│  Left      │        Canvas / Preview         │  Right        │
│  Sidebar   │                                 │  Panel        │
│            │   ┌─────────────────────────┐   │               │
│  - Prompt  │   │                         │   │  - Character  │
│  - Style   │   │    Generated Image      │   │  - Pose       │
│  - Quality │   │    (or generation       │   │  - ControlNet │
│  - Aspect  │   │     progress)           │   │  - Advanced   │
│            │   │                         │   │    controls   │
│            │   └─────────────────────────┘   │               │
│            │                                 │               │
│            │  ┌─────────────────────────────┐│               │
│            │  │  Filmstrip / History        ││               │
│            │  └─────────────────────────────┘│               │
├────────────┴─────────────────────────────────┴───────────────┤
│  Status Bar: [Local ◉] [Model: FLUX.1-schnell] [Memory: 8GB] │
└──────────────────────────────────────────────────────────────┘
```

**Key layout principles:**
- **Canvas-centric:** The generated image is always the largest element on screen.
- **Collapsible panels:** Both sidebars collapse to icons for maximum canvas space.
- **Left sidebar = inputs:** Everything that goes INTO the generation (prompt, style, settings).
- **Right panel = controls:** Character, pose, ControlNet — things that modify HOW the generation works. Hidden by default in Simple Mode.
- **Bottom filmstrip:** Recent generations in the current session. Scrollable. Click to inspect/compare.
- **Status bar:** Always-visible system status — inference location, loaded model, memory usage.

### Simple Mode vs Advanced Mode

**Simple Mode** (default):
- Left sidebar shows: prompt text area, style preset picker (visual grid), quality toggle (Fast/Quality), aspect ratio selector
- Right panel is hidden entirely
- Character picker is a small avatar row above the prompt ("Generate as: [avatar] [avatar] [+]")
- Pose is a simple "Pose" button that opens a preset picker overlay
- No visible parameters beyond what's listed above

**Advanced Mode** (toggle in toolbar):
- Left sidebar expands with: negative prompt, seed controls, sampler/scheduler/steps/CFG
- Right panel appears with: ControlNet stack, adapter weights, LoRA selector
- All Simple Mode elements remain; advanced controls appear below/alongside them
- Each advanced section is collapsible

---

## Milestones

The MVP is broken into 10 milestones. Each milestone produces a working, testable increment.

> **Implementation note (M1–M3 status):** M1 (scaffold), M2 (generation UI/pipeline with StubProvider), and M3 (model management with simulated downloads) are complete. The UI, RPC pipeline, and Tauri commands are fully wired. M2b below replaces the stubs with real inference.

---

### Milestone 1: Project Scaffold & Core Shell

**Goal:** Tauri + React app runs, Python sidecar launches and responds to ping, basic UI shell renders.

#### Tasks

**1.1 — Initialize Tauri project**
- `create-tauri-app` with React + TypeScript template
- Configure Tauri for macOS Apple Silicon target
- Set up window config (title, min size 1024×768, vibrancy if desired)
- Configure Tauri sidecar capability for Python process

**1.2 — Set up React frontend tooling**
- Vite as bundler (comes with Tauri template)
- Install and configure Tailwind CSS v4
- Install and initialize shadcn/ui (base components: Button, Dialog, Slider, Tooltip, Dropdown, Tabs, ScrollArea, Input, Textarea, Switch, Separator)
- Set up path aliases (`@/components`, `@/lib`, `@/stores`, etc.)
- Configure dark/light theme with CSS variables following shadcn convention
- Install `framer-motion` for animations
- Install `zustand` for state management
- Install `lucide-react` for icons (clean, consistent icon set)

**1.3 — Design system foundation**
- Create `globals.css` with Tailwind theme configuration:
  - Custom color tokens (zinc-based neutrals, indigo accent)
  - Typography scale
  - 8px spacing grid
  - Animation utilities (fade-in, slide-in, scale)
- Build foundational layout components:
  - `AppShell` — main layout with resizable sidebar panels
  - `Sidebar` — collapsible left sidebar
  - `Panel` — collapsible right panel
  - `Canvas` — central content area with aspect-ratio-aware image display
  - `Filmstrip` — bottom horizontal scrolling strip
  - `StatusBar` — bottom status bar
  - `Toolbar` — top toolbar
- Build theme toggle (dark/light/system)

**1.4 — Python sidecar scaffold**
- Create Python project structure:
  ```
  python/
  ├── pyproject.toml
  ├── src/
  │   └── imagen_heap/
  │       ├── __init__.py
  │       ├── main.py          # Entry point, stdio JSON-RPC loop
  │       ├── rpc/
  │       │   ├── __init__.py
  │       │   ├── server.py    # JSON-RPC dispatcher
  │       │   └── protocol.py  # Message types
  │       ├── providers/
  │       │   ├── __init__.py
  │       │   └── base.py      # Runtime provider interface (ABC)
  │       └── pipeline/
  │           ├── __init__.py
  │           └── orchestrator.py
  └── tests/
  ```
- Implement JSON-RPC 2.0 server reading from stdin, writing to stdout
- Implement `ping` method that returns `{"status": "ok", "version": "0.1.0"}`
- Stderr reserved for Python logging (not parsed as RPC)

**1.5 — Tauri ↔ Python IPC bridge**
- Rust sidecar manager: launch Python process, manage lifecycle (start/stop/restart)
- Implement JSON-RPC client in Rust: serialize requests, parse responses, handle notifications
- Tauri commands: `ping_backend`, `get_backend_status`
- Tauri events: `backend:status`, `backend:progress`
- Frontend hook: `useBackendStatus()` — shows connection state in StatusBar
- Handle sidecar crash: detect exit, show error in UI, offer restart

**1.6 — SQLite database setup**
- Use `tauri-plugin-sql` (SQLite)
- Create initial schema migrations:
  - `generations` table (id, prompt, negative_prompt, seed, model_id, sampler, scheduler, steps, cfg, resolution_w, resolution_h, quality_profile, adapters_json, controlnet_json, inference_location, generation_time_ms, image_path, thumbnail_path, created_at)
  - `characters` table (id, name, description, adapter_type, adapter_config_json, created_at, last_used_at)
  - `character_images` table (id, character_id, image_path, sort_order)
  - `projects` table (id, name, locked_character_id, locked_style, locked_aspect_ratio, locked_model_id, created_at, updated_at)
  - `scenes` table (id, project_id, sort_order, prompt, overrides_json, generation_id, created_at)
  - `models` table (id, name, version, architecture, license_spdx, file_size_bytes, quantization, min_memory_mb, source_url, local_path, checksum_sha256, is_default, status)
  - `prompt_history` table (id, prompt_text, created_at)
  - `settings` table (key, value_json)
  - `community_cache` table (id, source, source_id, asset_type, name, author, metadata_json, thumbnail_url, fetched_at)
  - `community_downloads` table (id, community_cache_id, source, source_id, asset_type, local_path, downloaded_at)
- Run migrations on app start

**Deliverable:** App window opens with the shell layout (toolbar, sidebars, canvas, filmstrip, status bar). Status bar shows "Backend: Connected" after Python sidecar starts. Dark mode works. All panels are collapsible.

---

### Milestone 2: Basic Image Generation (Text-to-Image)

**Goal:** User types a prompt, clicks Generate, sees an image. Fast Draft and Quality profiles work. Metadata is persisted.

#### Tasks

**2.1 — Python inference pipeline (MLX provider)**
- Implement `MLXProvider` class extending the runtime provider interface:
  - `load_model(model_id, quantization)` → loads model into memory
  - `unload_model()` → frees memory
  - `text_to_image(prompt, negative_prompt, seed, steps, cfg, width, height, callback)` → generates image
  - `get_memory_usage()` → returns current/peak memory
  - `get_device_info()` → returns chip, memory, OS version
- Integrate `mlx-community` FLUX.1-schnell and FLUX.1-dev model loading
- Step-level progress callback that emits JSON-RPC notifications
- Return generated image as file path (save to user data directory)
- Generate thumbnail (256px) alongside full image

**2.2 — PyTorch MPS fallback provider**
- Implement `MPSProvider` with same interface using `diffusers` + PyTorch MPS backend
- Used when MLX doesn't support a model or adapter
- Same progress callback contract

**2.3 — Generation RPC methods**
- `generate` method: accepts full generation config, delegates to appropriate provider
- `get_models` method: returns list of available/downloaded models
- `get_device_info` method: returns hardware capabilities
- `get_memory_status` method: returns current memory usage
- `cancel_generation` method: cancels in-progress generation

**2.4 — Frontend: Generation UI (Simple Mode)**
- **Prompt input area** (left sidebar):
  - Large textarea with placeholder "Describe what you want to create..."
  - Character count / token estimate indicator (subtle, bottom-right of textarea)
  - Submit on Cmd+Enter or Generate button
- **Quality profile toggle:**
  - Segmented control: "Fast" | "Quality"
  - Fast: schnell, 4 steps — shows "~10s" estimate
  - Quality: dev, 25 steps — shows "~60s" estimate
- **Aspect ratio selector:**
  - Visual grid of ratio buttons (1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4)
  - Each shows a proportional rectangle icon
  - Selected state: filled accent color
- **Generate button:**
  - Primary action button, full width at bottom of left sidebar
  - Shows "Generate" with sparkle icon
  - During generation: shows progress bar with step count ("Step 5/25")
  - Keyboard shortcut: Cmd+Enter (also works from prompt textarea)
- **Canvas area:**
  - Empty state: subtle illustration + "Type a prompt to get started"
  - During generation: progress bar + step-level preview (if available from callback)
  - After generation: image displayed centered, fit to canvas with proper aspect ratio
  - Subtle fade-in animation on completion
- **Filmstrip:**
  - Shows thumbnails of all generations in current session
  - Click to switch canvas to that image
  - Subtle border highlight on selected
  - Horizontal scroll with momentum

**2.5 — Frontend: Generation state management**
- Zustand store: `useGenerationStore`
  - State: `prompt`, `negativePrompt`, `qualityProfile`, `aspectRatio`, `seed`, `isGenerating`, `progress`, `currentImage`, `history[]`
  - Actions: `setPrompt`, `setQuality`, `setAspectRatio`, `generate`, `cancel`, `selectHistoryItem`
- Tauri event listener for `backend:progress` → updates `progress` in store
- Tauri event listener for `backend:complete` → updates `currentImage`, pushes to `history`

**2.6 — Metadata persistence**
- On generation complete: write full metadata record to `generations` table
- Metadata includes all fields from DM-001
- Prompt added to `prompt_history` table
- Image file path stored in record
- Frontend: clicking a filmstrip thumbnail loads full metadata in an info overlay

**2.7 — Seed management**
- Auto-generate random seed for each generation
- Display seed in a small chip below the canvas (click to copy)
- "Regenerate" button: same prompt/config, new seed
- In Advanced Mode (later): seed lock/unlock toggle

**Deliverable:** User types a prompt, selects Fast or Quality, picks aspect ratio, clicks Generate. Progress bar animates per step. Image appears on canvas. Filmstrip shows history. Metadata is saved to SQLite.

---

### Milestone 2b: Real Inference & Model Downloads

**Goal:** Replace stubs with real FLUX image generation on Apple Silicon via MLX, and real HuggingFace model downloads with progress. After this milestone, the user can generate actual images.

> **Why a separate milestone:** M2 established the full UI pipeline with a StubProvider. M2b swaps in the real inference engine without changing any frontend code — only the Python backend changes. This also pulls forward the minimum viable download logic from M7 (Community Hub) since real models are a prerequisite for real generation.

#### Tasks

**2b.1 — Install inference dependencies**
- Add `mflux` to Python dependencies (brings in `mlx`, `huggingface_hub`, `transformers`, `tokenizers`, `sentencepiece`)
- `mflux` is a minimal FLUX-on-MLX library purpose-built for Apple Silicon
- Verify installation works on the target machine (M-series Mac)
- Pin versions for reproducibility

**2b.2 — MLXProvider implementation**
- Create `MLXProvider` class in `python/src/imagen_heap/providers/mlx_provider.py`:
  - `load_model(model_id, quantization)` → initializes `mflux.Flux1` with appropriate model variant and quantization level
  - `unload_model()` → releases model from memory, triggers GC
  - `text_to_image(...)` → calls `flux.generate_image()`, saves result to output directory, returns file path
  - `get_device_info()` → returns Apple Silicon chip info, total memory, OS version
  - `get_memory_status()` → returns current MLX memory usage via `mlx.core`
- Map our model registry IDs to mflux model names:
  - `flux-schnell-*` → `mflux.Flux1(model="schnell", quantize=N)`
  - `flux-dev-*` → `mflux.Flux1(model="dev", quantize=N)`
- Step-level progress via mflux's callback mechanism
- Save generated images as PNG with metadata, generate 256px thumbnail
- Graceful error handling: catch OOM, model-not-found, unsupported-hardware

**2b.3 — Real HuggingFace model downloads**
- Replace `ModelManager.simulate_download()` with real download using `huggingface_hub`:
  - `huggingface_hub.snapshot_download(repo_id, ...)` with progress callback
  - Download to `~/.imagen-heap/models/` directory
  - Map registry entries to HuggingFace repo IDs
  - Progress reported back to frontend via existing JSON-RPC notification mechanism
- Update model registry with correct HuggingFace repo IDs, actual file sizes
- Catalog tracks real download paths and timestamps
- Support download cancellation (interrupt the download thread)
- Disk usage tracking scans actual files on disk

**2b.4 — Provider auto-selection in pipeline**
- Update `PipelineOrchestrator` and `create_server()` in `main.py`:
  - Try to initialize `MLXProvider` on startup
  - Fall back to `StubProvider` if MLX/mflux is not available (e.g., non-Apple hardware, missing deps)
  - Log which provider is active
- Auto-load the default model on first generation (if downloaded)
- Model switching: unload current → load requested

**2b.5 — Integration verification**
- Test full flow: download model → generate image → view on canvas
- Verify progress streaming works with real inference (step-by-step updates)
- Verify memory reporting is accurate
- Test with both schnell (4 steps, ~10s) and dev (25 steps, ~60s) if available
- Confirm stub fallback still works when mflux is absent

**Deliverable:** User downloads a real FLUX model (~6 GB), types a prompt, clicks Generate, and sees an actual AI-generated image on the canvas within ~10 seconds (schnell) or ~60 seconds (dev). Progress bar shows real step progress. The app falls back to StubProvider gracefully if MLX hardware is unavailable.

---

### Milestone 3: Model Management

**Goal:** First-run model download, model catalog, license display, disk budgeting, quantization selection.

#### Tasks

**3.1 — Model registry & catalog**
- Python: `ModelManager` class
  - Curated model registry (JSON manifest): FLUX.1-schnell, FLUX.1-dev, with Q4/Q8 variants
  - Check which models are downloaded (scan model directory)
  - Download model with progress (resumable via HTTP range requests)
  - Verify SHA-256 checksum after download
  - Delete model and free disk space
  - Report disk usage per model and total

**3.2 — First-run experience**
- Detect first launch (no models downloaded, no settings configured)
- **First-run wizard (modal overlay, 4 steps):**
  1. **Welcome** — app name, one-liner description, "Let's get you set up" with illustration
  2. **Storage** — choose where to store models and images (default: `~/.imagen-heap/`). Show available disk space.
  3. **Model download** — shows default model set (FLUX.1-schnell Q8 + FLUX.1-dev Q8, ~12GB total). Progress bars per model. Option to select Q4 variants for smaller download. Download is resumable and cancelable.
  4. **Test generation** — auto-generates a sample image with a built-in prompt ("A serene mountain landscape at golden hour, photorealistic"). Shows result. "You're ready to create!" confirmation.
- Wizard state persisted so it resumes if interrupted
- After setup completes: hand off to the **guided feature tour** (implemented in M9). Until M9 is built, first-run ends at the test generation step and drops the user into the main app.

**3.3 — Model Manager UI**
- Accessible from Settings or a dedicated toolbar button
- **Model list view:**
  - Each model card shows: name, architecture badge, license badge (color-coded: green=Apache, yellow=non-commercial), file size, quantization level, memory estimate, download status
  - Downloaded models: "Active" / "Delete" actions
  - Available models: "Download" button with size estimate
  - Download progress inline on the card
- **Disk budget:**
  - Bar chart showing total model storage used vs. budget
  - Warning indicator at 80%
  - Budget configurable in settings
- **Import custom model:**
  - "Import Model" button → file picker (safetensors, GGUF, MLX format)
  - Prompts for metadata (name, architecture, license) if not auto-detected
- **Commercial-safe filter toggle:**
  - Switch in model manager header
  - When on: hides non-commercial models, shows green "Commercial Safe" badge

**3.4 — Quantization selection**
- Per model: dropdown showing available quantizations (Q4, Q8, FP16)
- Each option shows: estimated memory usage, quality note ("Balanced" / "Compact / faster download" / "Full precision")
- Default selection: Q8
- Switching quantization triggers re-download of that variant

**Deliverable:** First launch shows a polished setup wizard. User downloads models with progress. Model manager lets users browse, download, delete, and import models. License info is visible everywhere.

---

### Milestone 4: Style Presets & Prompt Tools

**Goal:** Style presets modify generation parameters. Prompt history is searchable. The prompt experience feels delightful.

#### Tasks

**4.1 — Style preset system**
- Define at least 8 style presets (stored as JSON):
  - **Photorealistic** — natural, detailed, no artistic stylization
  - **Cinematic** — dramatic lighting, film grain, shallow depth of field
  - **Anime** — anime/manga art style, clean lines, vibrant colors
  - **Watercolor** — soft, painterly, watercolor texture
  - **Digital Art** — polished digital illustration
  - **Concept Art** — concept art style, environment/character design
  - **Pixel Art** — retro pixel art style
  - **Line Art** — clean black and white line drawing
- Each preset includes: display name, thumbnail, prompt suffix, negative prompt, recommended model, sampler, CFG, style description
- Presets stored in user-accessible JSON directory (user-extensible per UX-006)

**4.2 — Style preset UI**
- **Visual style grid** in left sidebar (below prompt):
  - 2-column grid of style cards with thumbnail previews
  - Each card: thumbnail image + style name
  - Selected state: accent border + checkmark
  - "None" option for no style modification
- Selecting a preset: smooth transition, updates internal params
- If user modifies any preset-linked param: style label changes to "Custom (based on Cinematic)"
- Hover: shows brief description tooltip

**4.3 — Prompt history**
- Auto-save every prompt to `prompt_history` table
- **History dropdown** on prompt textarea:
  - Triggered by clicking a small clock icon in the textarea
  - Searchable list of past prompts
  - Shows timestamp and style used
  - Click to load prompt
  - Delete individual entries
- Persists across sessions

**4.4 — Prompt UX polish**
- Auto-resize textarea as user types (up to a max height, then scroll)
- Subtle syntax highlighting for prompt weight syntax `(keyword:1.3)` in Advanced Mode
- "Clear" button (×) in textarea corner
- Prompt templates button (📝) opens a categorized template browser:
  - Categories: Portrait, Landscape, Concept Art, Product Shot, Character Design, etc.
  - At least 30 templates per FR-060
  - Click to insert into prompt field

**Deliverable:** Users pick styles from a visual grid. Styles modify generation parameters atomically. Prompt history is searchable. Template library provides starting points.

---

### Milestone 5: Character System

**Goal:** Users create Character Cards, apply them to generations, and get consistent character identity across scenes.

#### Tasks

**5.1 — Python: Identity adapter integration**
- Implement identity adapter manager:
  - `InstantIDAdapter` — for single-face reference (default)
  - `PhotoMakerAdapter` — for multi-reference images
  - `PuLIDAdapter` — for FLUX-specific workflows
- Auto-selection heuristic (CC-002):
  - 1 face image + FLUX model → PuLID-FLUX
  - 1 face image + other model → InstantID
  - 2+ reference images → PhotoMaker
  - User can override in Advanced Mode
- Each adapter: `prepare(reference_images)`, `apply(pipeline, strength)`, `get_memory_estimate()`
- Face detection/cropping preprocessing for reference images
- Identity strength parameter (0.0–1.0) maps to adapter weight

**5.2 — Character Card CRUD**
- RPC methods: `create_character`, `update_character`, `delete_character`, `list_characters`, `get_character`
- Character data stored in SQLite `characters` + `character_images` tables
- Reference images copied to user data directory (not referenced from original location)
- Auto-generate thumbnail from first reference image

**5.3 — Character Card UI**
- **Character avatar row** (above prompt in left sidebar):
  - Horizontal row of small circular avatars
  - Selected character has accent ring
  - "None" option (no character) as first item
  - "+" button to create new character
  - Click avatar to select; long-press or right-click for edit/delete
- **Character creation dialog:**
  - Modal overlay with clean form:
    - Name field (required)
    - Drag-and-drop zone for 1–5 reference images (shows previews in a grid)
    - Optional text description textarea ("Describe features, clothing, etc.")
    - Auto-detected adapter type shown as info badge
    - "Create" button
  - After creation: character appears in avatar row, auto-selected
- **Character detail panel** (right panel, when a character is selected):
  - Shows reference images, name, description
  - Identity strength slider ("Subtle" — "Balanced" — "Strong")
  - Adapter type info (auto-selected or manual override in Advanced Mode)
  - "Edit" and "Delete" buttons
  - Last used date
- **Identity strength slider:**
  - In Simple Mode: 3-position preset (Subtle=0.3, Balanced=0.6, Strong=0.9)
  - In Advanced Mode: continuous 0.0–1.0 slider

**5.4 — Generation with character**
- When a character is selected, generation pipeline includes identity adapter
- Pre-generation memory check: warn if character + model + resolution may exceed memory
- Metadata records: character ID, adapter type, adapter strength
- Character's `last_used_at` updated on each generation

**Deliverable:** Users create characters from face images, select them from an avatar row, and generate images with consistent character identity. Strength is controllable.

---

### Milestone 6: Pose & Composition Control

**Goal:** Users control pose via presets, reference images, and an interactive skeleton editor. ControlNet conditioning works.

#### Tasks

**6.1 — Python: ControlNet integration**
- Implement ControlNet conditioning support:
  - `OpenPoseConditioner` — extract pose skeleton from reference image
  - `DepthConditioner` — extract depth map from reference image
  - `CannyConditioner` — extract edge map from reference image
- Pose extraction using lightweight on-device models (DWPose or similar for OpenPose)
- Depth estimation using MiDaS or similar
- Each conditioner: `extract(image) → conditioning_map`, `apply(pipeline, weight, start_step, end_step)`
- Return conditioning map as previewable image
- Conditioning strength parameter (0.0–1.5)

**6.2 — Pose preset library**
- Bundle 20+ pose presets as skeleton JSON files (CC-006):
  - Standing poses: front, 3/4, profile, back
  - Sitting poses: chair, cross-legged, casual
  - Action poses: walking, running, jumping, reaching
  - Portrait poses: headshot, shoulders, upper body
  - Expressive poses: arms crossed, hands on hips, pointing, waving
- Each preset: skeleton data (18 COCO keypoints), thumbnail preview, name, category
- Stored in app bundle; user can import additional presets

**6.3 — Pose control UI (Simple Mode)**
- **"Pose" button** in left sidebar (below style presets):
  - Opens a pose picker overlay/popover
  - **Preset grid:** thumbnails of skeleton poses in categories
  - **"From Image" tab:** drop zone to upload a reference image → extracts and previews skeleton
  - Selecting a pose: shows skeleton overlay preview on canvas
  - "Clear Pose" to remove conditioning
- **Conditioning strength** (Simple Mode):
  - 3-position preset: "Subtle" | "Balanced" | "Strict"
  - Mapped to 0.3 / 0.7 / 1.2 weight
- **Pose preview overlay:**
  - Semi-transparent skeleton drawn over the canvas area before generation
  - Shows what the generation will target

**6.4 — Pose control UI (Advanced Mode)**
- **Right panel: ControlNet section**
  - List of active conditioning layers
  - Each layer: type dropdown (OpenPose/Depth/Canny), weight slider (0.0–1.5), start/end step sliders
  - "Add Layer" button (up to 3 layers for MVP, FR-035 is V1.1 for multi-stack but we support single in MVP)
  - Preview toggle per layer (show/hide conditioning map overlay)
- **Depth map controls:**
  - Upload reference image → extract depth map
  - Preview depth map as grayscale overlay
  - Strength slider
- **Canny/edge controls:**
  - Upload reference image → extract edge map
  - Low/high threshold sliders
  - Preview edge map overlay

**6.5 — Interactive 2D skeleton editor (simplified for MVP)**
- Note: Full skeleton editor (FR-032) is V1.1. For MVP, provide:
  - Display the extracted skeleton on a canvas overlay
  - Basic joint dragging (click and drag keypoints to adjust)
  - Reset to original extraction
  - This is a simplified version; full editor with IK and mirroring comes in V1.1

**Deliverable:** Users pick poses from presets or extract from images. Skeleton preview overlays on canvas. ControlNet conditioning produces pose-accurate generations. Advanced mode exposes full ControlNet controls.

---

### Milestone 7: Community Hub (HuggingFace + CivitAI)

**Goal:** Users browse, search, and download models, LoRAs, style presets, pose packs, and generation configs from HuggingFace and CivitAI — directly inside the app. Curated picks surface the best community content; search gives access to everything compatible.

#### Design Philosophy

The Community Hub solves the "scientific parameters" problem: generation quality depends on finding the right combination of model + sampler + CFG + steps + negative prompt + LoRA weights — and the community has already figured these out. Instead of making users learn these parameters, we let them **browse proven configurations** and apply them with one click.

#### Tasks

**7.1 — Python: HuggingFace integration**
- Implement `HuggingFaceClient`:
  - `search_models(query, architecture_filter, license_filter, sort_by)` → paginated search via HF Hub API
  - `get_model_details(repo_id)` → model card, files, variants, license, download count, likes
  - `list_model_files(repo_id)` → available files with sizes (safetensors, GGUF, MLX variants)
  - `download_model(repo_id, filename, destination, progress_callback)` → resumable download with SHA verification
  - `get_trending(category)` → trending/popular models for image generation
- Architecture compatibility filter: only show models compatible with our pipeline (FLUX, SDXL, SD3.5 families)
- Parse model card metadata to extract: base architecture, license, recommended settings, sample images
- Cache search results locally (TTL: 1 hour) to reduce API calls and enable offline browsing of previously fetched results

**7.2 — Python: CivitAI integration**
- Implement `CivitAIClient`:
  - `search_models(query, type_filter, sort_by, nsfw_filter)` → search models/LoRAs via CivitAI API v1
  - `get_model_details(model_id)` → full model info including versions, sample images, generation configs
  - `get_model_version(version_id)` → specific version with files and **trained generation parameters**
  - `download_file(url, destination, progress_callback)` → resumable download
  - `get_trending(type, period)` → trending checkpoints, LoRAs, embeddings
  - `get_generation_config(image_id)` → extract the exact generation parameters from a sample image (CivitAI stores these)
- **Generation config extraction** (key differentiator):
  - CivitAI sample images include full generation metadata: prompt, negative prompt, sampler, steps, CFG, seed, model, LoRAs with weights
  - Parse these into our preset format so users can "Use these settings" with one click
- Type filters: Checkpoint, LoRA, Embedding, Poses, Other
- NSFW filter: enabled by default, user-configurable
- Cache results locally (TTL: 1 hour)

**7.3 — Unified asset schema**
- Define a common `CommunityAsset` schema that normalizes HuggingFace and CivitAI data:
  ```
  CommunityAsset {
    source: "huggingface" | "civitai"
    source_id: string
    name: string
    type: "checkpoint" | "lora" | "embedding" | "style_preset" | "pose_pack" | "generation_config"
    author: string
    description: string
    license: string | null
    download_count: number
    rating: number | null
    sample_images: Image[]
    files: AssetFile[]              // available files with sizes
    generation_config: GenConfig?   // recommended/proven generation settings
    compatibility: string[]         // compatible base models
    tags: string[]
    created_at: datetime
    updated_at: datetime
  }
  ```
- SQLite table `community_cache` for storing fetched asset metadata
- SQLite table `community_downloads` for tracking what the user has downloaded from community sources

**7.4 — Community Hub UI: Main browse experience**
- **Hub accessible from toolbar** (compass/explore icon) — opens as a full-screen overlay or dedicated view
- **Tab bar at top:** "Models" | "LoRAs" | "Styles & Configs" | "Poses"
- **Each tab has:**
  - **Curated picks section** (top): hand-picked + algorithmically surfaced popular/compatible items
    - "Popular This Week" — trending by downloads
    - "Staff Picks" — our curated recommendations (maintained as a JSON manifest we ship with the app)
    - "Works Great With FLUX" / "Works Great With SDXL" — compatibility-filtered picks
  - **Search bar** with filters:
    - Text search (name, description, tags)
    - Source filter: HuggingFace / CivitAI / Both
    - License filter: All / Commercial-safe / Apache-2.0 only
    - Architecture filter: FLUX / SDXL / SD3.5 / All compatible
    - Sort: Trending / Most downloaded / Newest / Highest rated
  - **Result grid:** visual cards with sample images

**7.5 — Community Hub UI: Asset detail view**
- Clicking an asset card opens a **detail sheet** (slide-in panel):
  - **Header:** name, author, source badge (HF/CivitAI), rating, download count
  - **Sample image gallery:** scrollable row of community-generated sample images
  - **Description:** rendered markdown from model card
  - **Compatibility badges:** which base models it works with
  - **License info:** clear badge with tooltip explaining usage rights
  - **Available files:** list with size, format, quantization for each
  - **"Download" button:** picks the best compatible file by default; dropdown for variant selection
  - Download progress inline
- **For LoRAs specifically:**
  - Shows recommended weight range
  - Shows trigger words (if any)
  - "Add to My LoRAs" button
- **For items with generation configs:**
  - **"Generation Settings" section** showing the exact parameters used for each sample image:
    - Prompt, negative prompt, sampler, steps, CFG, seed, LoRAs, model
  - **"Use These Settings" button** → one-click imports all parameters into the generation UI
  - **"Save as Style Preset" button** → saves the config as a reusable local style preset

**7.6 — One-click generation config import**
- When a community asset (or sample image) has generation metadata:
  - Parse into our internal `GenerationConfig` format
  - Map community sampler names to our sampler options
  - Resolve model references (flag if user doesn't have the model locally)
  - Resolve LoRA references (flag if missing, offer to download)
  - **"Use These Settings" action:**
    - Populates prompt, negative prompt, sampler, steps, CFG in the generation panel
    - Selects the matching local model (or offers to download/switch)
    - Activates referenced LoRAs at the specified weights (or offers to download)
    - Shows a summary toast: "Loaded settings from [asset name] — Ready to generate"
  - **"Save as Preset" action:**
    - Saves as a local style preset JSON file
    - Appears in the style preset grid alongside built-in presets
    - Tagged with source attribution ("Based on [asset name] by [author] on CivitAI")

**7.7 — Community pose packs**
- Browse pose collections from CivitAI (type: Poses)
- Download pose packs → extracted skeleton JSON files added to local pose library
- Pose packs appear in the Pose Picker alongside built-in presets
- Tagged with source attribution

**7.8 — Smart compatibility checking**
- Before download: check if the asset is compatible with user's installed base models
- If incompatible: show warning + "Download required base model?" prompt
- After download: auto-register in the appropriate local catalog (model manager, LoRA list, style presets, pose library)
- If a community LoRA has no license metadata → tagged "License Unknown" per ML-006

**7.9 — Offline resilience**
- Community Hub works offline using cached data (search results, asset metadata, thumbnails)
- "Last updated X hours ago" indicator
- Refresh button to re-fetch when online
- Downloaded assets work fully offline
- Clear cache option in settings

**Deliverable:** Users open the Community Hub, browse curated picks and search across HuggingFace + CivitAI, view rich asset details with sample images, download models/LoRAs with one click, and — critically — import proven generation configs that auto-populate all the "scientific" parameters. Community poses and style presets integrate seamlessly into the existing preset libraries.

---

### Milestone 8: Cloud Inference (Microsoft Foundry)

**Goal:** Users can configure Foundry credentials, route generations to cloud, see cost estimates, and manage spending.

#### Tasks

**8.1 — Python: Foundry client**
- Implement `FoundryProvider` extending cloud provider interface:
  - `discover_models()` → query available image-generation models (excluding GPT-image/DALL·E per HI-012)
  - `text_to_image(prompt, model_id, params)` → cloud generation
  - `image_to_image(...)` → if supported by endpoint
  - `get_capabilities(model_id)` → what the model supports
  - `estimate_cost(params)` → estimated cost for a generation
- Handle: authentication (API key or OAuth token), timeout (120s per HI-007), rate limiting, retries
- Return generated image as bytes; save to same output directory as local

**8.2 — Credential management**
- Tauri Rust backend: store/retrieve Foundry API key in macOS Keychain (via `security` framework or `keyring` crate)
- Tauri commands: `set_foundry_credentials`, `get_foundry_credentials`, `clear_foundry_credentials`
- Never write credentials to disk in plaintext

**8.3 — Cloud settings UI**
- **Settings → Cloud Inference section:**
  - Enable/disable cloud inference toggle (off by default, HI-001)
  - API key input field (masked, with "Test Connection" button)
  - Auto-routing toggle (opt-in, HI-004): "Suggest cloud when model unavailable locally"
  - Monthly spending cap input (NFR-032)
  - Monthly usage summary: total cloud generations, estimated cost
  - Link to Foundry data handling policy (NFR-023)
- **Cloud model catalog:**
  - Tab in Model Manager: "Cloud Models"
  - Shows available Foundry models with: name, capabilities, pricing, supported features
  - Empty state: "No cloud models available" with link to Foundry docs (HI-013)

**8.4 — Generation routing UI**
- When cloud is enabled:
  - **"Local / Cloud" toggle** in the generate button area
  - Default: Local
  - Switching to Cloud: shows cost estimate before generating
  - First cloud generation per session: consent dialog (HI-002, NFR-021) showing what data will be sent
- Auto-routing prompt:
  - If user requests a model not available locally → "This model is available via cloud. Generate remotely?" dialog
- **Cloud badge:**
  - Cloud-generated images show a small cloud icon (☁) badge on filmstrip thumbnail
  - Metadata panel shows "Generated via Cloud (Foundry)" with model/endpoint info

**8.5 — Failover & spending controls**
- Cloud timeout: abort after 120s, show error with "Try locally" option
- Network error: retry once, then offer local fallback
- Spending cap enforcement: track cumulative cost; gray out cloud option when cap reached
- All cloud metadata recorded (HI-011): inference_location, cloud model ID, endpoint

**Deliverable:** Users configure Foundry credentials securely, route generations to cloud with consent flow, see cost estimates, and have spending controls. Cloud-generated images are clearly tagged.

---

### Milestone 9: Export, Metadata & Polish

**Goal:** Export with metadata, clipboard copy, error handling, accessibility, and final UX polish.

#### Tasks

**9.1 — Export system**
- **Export dialog** (triggered from canvas context menu or toolbar button):
  - Format picker: PNG (default, supports alpha), JPEG (quality slider), WebP (quality slider)
  - "Embed metadata" checkbox (default on)
  - File name template with smart default: `{prompt_short}_{seed}_{date}.{ext}`
  - Export location: file picker dialog (remembers last used directory)
- **Metadata embedding:**
  - PNG: write to PNG text chunks (tEXt / iTXt)
  - JPEG/WebP: write to EXIF/XMP
  - Fields: full generation parameters per DM-001
  - Metadata readable by `exiftool` and re-importable by the app
- **Clipboard copy:**
  - "Copy to Clipboard" button on canvas toolbar (small, always visible)
  - Uses Tauri clipboard API
  - Subtle toast notification: "Copied to clipboard"
- **Background removal:**
  - Note: Full background removal (FR-008) is V1.1. Defer for now.

**9.2 — Metadata inspector panel**
- **Info overlay** (toggled via ℹ button on canvas):
  - Clean, organized display of all generation metadata
  - Sections: Prompt, Model, Parameters, Character, Pose, Provenance
  - "Reproduce" button: loads all parameters into the generation UI
  - "Copy Metadata" button: copies JSON to clipboard
  - Seed display with copy button

**9.3 — Error handling & graceful degradation**
- Comprehensive error handling throughout the pipeline:
  - OOM: pre-generation memory estimate; if estimated peak > 90% of available, warn user with suggestions (lower resolution, use Q4, route to cloud)
  - Model load failure: clear message + "Try different quantization" or "Re-download model"
  - Adapter incompatibility: explain which adapter doesn't work with which model; suggest alternative
  - Network errors (cloud): retry + local fallback offer
  - Python sidecar crash: detect, show error, offer restart
- **Error toast system:**
  - Non-blocking toast notifications for warnings
  - Modal dialog for critical errors (generation failure, OOM)
  - Every error includes: what happened, why, and what the user can do

**9.4 — Settings screen**
- **Settings accessible from toolbar gear icon:**
  - **General:** storage path, theme (dark/light/system), default quality profile
  - **Models:** disk budget, default quantization, commercial-safe filter
  - **Cloud:** Foundry credentials, enable/disable, spending cap (from M7)
  - **Advanced:** toggle default mode (simple/advanced), default sampler/scheduler/steps/CFG
  - **About:** version, licenses, acknowledgments
- Clean, sectioned layout with sidebar navigation

**9.5 — Keyboard shortcuts**
- `Cmd+Enter` — Generate
- `Cmd+S` — Save/Export current image
- `Cmd+C` (with image focused) — Copy to clipboard
- `Cmd+Z` — Undo last prompt change
- `Cmd+,` — Open Settings
- `Escape` — Cancel generation / close dialog
- `Tab` / `Shift+Tab` — Navigate between panels
- `1-9` — Select filmstrip item
- Shortcuts shown in tooltips and in a `Cmd+/` shortcut reference overlay

**9.6 — Accessibility**
- All interactive elements: proper `aria-label`, `role`, `tabindex`
- Focus ring visible on keyboard navigation (shadcn/ui handles this well)
- VoiceOver support: generation progress announced, button labels, slider values
- WCAG 2.1 AA contrast for all text (validate with automated tool)
- Reduced motion: respect `prefers-reduced-motion` media query

**9.7 — Loading states & microinteractions**
- Skeleton loading states for model list, character list, history
- Smooth transitions between generation states (idle → generating → complete)
- Subtle pulse animation on Generate button while generating
- Canvas: smooth crossfade when switching between images
- Toast notifications: slide in from top-right, auto-dismiss after 4s
- Confirmation dialogs for destructive actions (UX-009): character delete, project delete, history clear

**9.8 — Advanced Mode controls (Complete)**
- Fill in all Advanced Mode controls from the PRD:
  - **Seed controls:** lock/unlock toggle, manual seed input, increment (+1) button
  - **Sampler/scheduler:** dropdown selectors with tooltips explaining each
  - **Step count:** slider with numeric input (1–150)
  - **CFG/guidance scale:** slider (1.0–20.0) with numeric input
  - **Negative prompt:** textarea (visible only in Advanced Mode per UX-002)
  - **LoRA selector:** (stub for V1.1 — show "Coming in V1.1" placeholder)
  - **Img2img:** (stub for V1.1)
  - **Inpaint/outpaint:** (stub for V1.1)
- Every control: tooltip with explanation and recommended range (UX-004)

**9.9 — First-time user onboarding tour**
- Triggered immediately after the M3 first-run setup wizard completes (model download + test generation done)
- Also re-accessible from Help menu ("Replay Tour") or Settings → General
- **Tour implementation:** lightweight coach-mark / spotlight overlay system
  - Each step highlights a UI region with a dimmed backdrop and a tooltip card
  - Tooltip card: title, 1–2 sentence explanation, "Next" / "Skip Tour" buttons
  - Step indicator dots (e.g., "3 of 7")
  - Smooth transition animation between steps (spotlight moves + fades)
  - Keyboard navigable: arrow keys or Enter to advance, Escape to skip
- **Tour steps (7 steps, ~60 seconds total):**
  1. **Prompt area** — "Start here. Describe what you want to create — a character, a scene, anything." Spotlight on the prompt textarea.
  2. **Style presets** — "Pick a style to set the mood. Each preset tunes the generation for you." Spotlight on style grid. Invite user to select one.
  3. **Quality toggle** — "Fast drafts in seconds, or high quality for the final result." Spotlight on Fast/Quality toggle.
  4. **Generate button** — "Hit Generate (or ⌘Enter) and watch your image come to life." Spotlight on Generate button. Encourage user to generate their first image now (prompt pre-filled from test generation or a fun default like "A friendly robot painting a sunset").
  5. **Canvas & filmstrip** — (shown after generation completes) "Your image appears here. Every generation is saved in the filmstrip below." Spotlight on canvas + filmstrip.
  6. **Characters** — "Create a character from a photo and reuse them in any scene. Consistent identity, every time." Spotlight on the character avatar row / "+" button.
  7. **Community Hub** — "Explore thousands of models, styles, and ready-made settings from the community." Spotlight on the Hub toolbar button. "You're all set — happy creating! 🎨"
- **Tour state management:**
  - Store `onboarding_tour_completed: boolean` in `settings` table
  - Tour only auto-triggers on first run; never re-triggers automatically
  - If user skips tour, mark complete and don't nag
  - If user closes the app mid-tour, resume from the last completed step on next launch
- **Tour is Simple Mode only** — if user has already switched to Advanced Mode before tour triggers, skip the tour (they're clearly not a beginner)
- **Build as a reusable component** — the coach-mark overlay system should support arbitrary step definitions so we can add contextual tips for new features in future versions (e.g., when V1.1 adds inpainting, a mini 2-step tour could introduce it)

**Deliverable:** Full export pipeline with metadata embedding. Clipboard copy. Comprehensive error handling. Keyboard shortcuts. Accessibility. Settings screen. Advanced Mode fully wired. Guided onboarding tour walks first-time users from prompt to generated image in ~60 seconds. The app feels polished and complete.

---

## Directory Structure

```
imagen-heap/
├── docs/
│   ├── requirements.md
│   ├── research.md
│   └── plan.md
│
├── src-tauri/                     # Tauri Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/              # Tauri command handlers
│   │   │   ├── mod.rs
│   │   │   ├── generation.rs
│   │   │   ├── models.rs
│   │   │   ├── characters.rs
│   │   │   ├── settings.rs
│   │   │   └── cloud.rs
│   │   ├── sidecar/               # Python sidecar management
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs
│   │   │   └── rpc_client.rs
│   │   ├── db/                    # Database migrations & queries
│   │   │   ├── mod.rs
│   │   │   └── migrations/
│   │   └── keychain.rs            # macOS Keychain integration
│   └── icons/
│
├── src/                           # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── globals.css
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Panel.tsx
│   │   │   ├── Canvas.tsx
│   │   │   ├── Filmstrip.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   └── StatusBar.tsx
│   │   ├── generation/
│   │   │   ├── PromptInput.tsx
│   │   │   ├── QualityToggle.tsx
│   │   │   ├── AspectRatioSelector.tsx
│   │   │   ├── GenerateButton.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── SeedDisplay.tsx
│   │   ├── characters/
│   │   │   ├── CharacterRow.tsx
│   │   │   ├── CharacterCreateDialog.tsx
│   │   │   ├── CharacterDetailPanel.tsx
│   │   │   └── IdentityStrengthSlider.tsx
│   │   ├── pose/
│   │   │   ├── PosePicker.tsx
│   │   │   ├── PosePresetGrid.tsx
│   │   │   ├── SkeletonOverlay.tsx
│   │   │   ├── ControlNetPanel.tsx
│   │   │   └── ConditioningPreview.tsx
│   │   ├── models/
│   │   │   ├── ModelManager.tsx
│   │   │   ├── ModelCard.tsx
│   │   │   ├── DiskBudgetBar.tsx
│   │   │   └── FirstRunWizard.tsx
│   │   ├── styles/
│   │   │   ├── StylePresetGrid.tsx
│   │   │   └── StyleCard.tsx
│   │   ├── cloud/
│   │   │   ├── CloudToggle.tsx
│   │   │   ├── CloudConsentDialog.tsx
│   │   │   └── CostEstimate.tsx
│   │   ├── hub/
│   │   │   ├── CommunityHub.tsx         # Main hub view
│   │   │   ├── HubTabBar.tsx            # Models | LoRAs | Styles | Poses
│   │   │   ├── AssetGrid.tsx            # Search results grid
│   │   │   ├── AssetCard.tsx            # Visual card with sample image
│   │   │   ├── AssetDetailSheet.tsx     # Slide-in detail panel
│   │   │   ├── CuratedPicksSection.tsx  # Trending / staff picks
│   │   │   ├── GenerationConfigPreview.tsx # Shows imported params
│   │   │   ├── HubSearchBar.tsx         # Search + filters
│   │   │   └── UseSettingsButton.tsx    # One-click config import
│   │   ├── export/
│   │   │   ├── ExportDialog.tsx
│   │   │   └── MetadataInspector.tsx
│   │   ├── settings/
│   │   │   └── SettingsScreen.tsx
│   │   └── shared/
│   │       ├── Toast.tsx
│   │       ├── ConfirmDialog.tsx
│   │       ├── ShortcutOverlay.tsx
│   │       ├── EmptyState.tsx
│   │       ├── CoachMark.tsx            # Reusable spotlight/tooltip overlay
│   │       └── OnboardingTour.tsx       # First-time feature walkthrough
│   ├── stores/
│   │   ├── generation.ts
│   │   ├── characters.ts
│   │   ├── models.ts
│   │   ├── hub.ts                 # Community Hub state
│   │   ├── settings.ts
│   │   ├── cloud.ts
│   │   └── ui.ts
│   ├── hooks/
│   │   ├── useBackendStatus.ts
│   │   ├── useGeneration.ts
│   │   ├── useCharacters.ts
│   │   ├── useModels.ts
│   │   ├── useCommunityHub.ts
│   │   └── useKeyboardShortcuts.ts
│   ├── lib/
│   │   ├── tauri.ts               # Tauri command wrappers
│   │   ├── ipc.ts                 # IPC event helpers
│   │   ├── utils.ts
│   │   └── constants.ts
│   └── types/
│       ├── generation.ts
│       ├── character.ts
│       ├── model.ts
│       ├── hub.ts                 # CommunityAsset, GenConfig types
│       ├── project.ts
│       └── cloud.ts
│
├── python/                        # Python inference sidecar
│   ├── pyproject.toml
│   ├── src/
│   │   └── imagen_heap/
│   │       ├── __init__.py
│   │       ├── main.py
│   │       ├── rpc/
│   │       │   ├── __init__.py
│   │       │   ├── server.py
│   │       │   └── protocol.py
│   │       ├── providers/
│   │       │   ├── __init__.py
│   │       │   ├── base.py        # Abstract runtime provider
│   │       │   ├── mlx_provider.py
│   │       │   ├── mps_provider.py
│   │       │   └── foundry_provider.py
│   │       ├── pipeline/
│   │       │   ├── __init__.py
│   │       │   ├── orchestrator.py
│   │       │   ├── memory.py      # Memory estimation
│   │       │   └── metadata.py    # Metadata generation
│   │       ├── adapters/
│   │       │   ├── __init__.py
│   │       │   ├── base.py        # Abstract identity adapter
│   │       │   ├── instantid.py
│   │       │   ├── photomaker.py
│   │       │   └── pulid.py
│   │       ├── conditioning/
│   │       │   ├── __init__.py
│   │       │   ├── base.py        # Abstract conditioner
│   │       │   ├── openpose.py
│   │       │   ├── depth.py
│   │       │   └── canny.py
│   │       ├── models/
│   │       │   ├── __init__.py
│   │       │   ├── manager.py     # Download, verify, catalog
│   │       │   └── registry.py    # Curated model manifest
│   │       ├── hub/
│   │       │   ├── __init__.py
│   │       │   ├── huggingface.py # HuggingFace Hub API client
│   │       │   ├── civitai.py     # CivitAI API client
│   │       │   ├── schema.py      # CommunityAsset unified schema
│   │       │   └── cache.py       # Local cache management
│   │       └── utils/
│   │           ├── __init__.py
│   │           ├── image.py       # Image processing helpers
│   │           └── face.py        # Face detection/cropping
│   └── tests/
│       ├── test_rpc.py
│       ├── test_providers.py
│       ├── test_adapters.py
│       └── test_pipeline.py
│
├── presets/
│   ├── styles/                    # Style preset JSON files
│   ├── poses/                     # Pose skeleton JSON files
│   └── templates/                 # Prompt template JSON files
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

---

## Key Technical Risks & Prototyping Needs

Before committing to full implementation, these items should be validated with quick prototypes:

| Risk | Prototype | Success Criteria |
|------|-----------|-----------------|
| MLX FLUX.1 generation speed on M3 Max | Run `mlx-examples` FLUX.1-schnell 4-step, measure time | ≤15s for 1024×1024 |
| Identity adapter (InstantID/PuLID) on MLX/MPS | Run InstantID pipeline via diffusers on MPS, verify output quality | Recognizable identity, no crashes |
| ControlNet + identity adapter stacking memory | Load FLUX.1-dev Q8 + ControlNet + InstantID, measure peak memory | ≤55 GB unified |
| Tauri sidecar stdio IPC reliability | Send 100 rapid JSON-RPC requests; verify no message corruption | 100% message integrity |
| Embedded Python runtime bundle size | Package minimal Python + diffusers + MLX, measure .app size | ≤2 GB acceptable for image gen app |
| CivitAI API reliability & rate limits | Hit CivitAI search + detail + download endpoints under load | Stable responses, reasonable rate limits, graceful degradation |
| CivitAI generation config parsing | Parse 50 sample images' metadata into our GenConfig format | ≥90% parse successfully with all key fields |

---

## Milestone Dependencies

```
M1 (Scaffold) ──→ M2 (Generation) ──→ M3 (Models) ──→ M4 (Styles)
                       │                                    │
                       ├──→ M5 (Characters) ────────────────┤
                       │                                    │
                       └──→ M6 (Pose) ─────────────────────┤
                                                            │
                  M7 (Community Hub) ←── depends on M3 ────┤
                                                            │
                  M8 (Cloud) ←── depends on M2 ────────────┤
                                                            │
                  M9 (Export & Polish) ←── all above ──────┘
```

M1 → M2 is strictly sequential. After M2, milestones M3–M8 can be partially parallelized (M5 and M6 depend on M2 but are independent of each other; M7 depends on M3 for the model manager integration; M8 depends on M2 for the generation pipeline). M9 is the integration and polish phase that depends on all others.

---

## Definition of Done (per Milestone)

Each milestone is complete when:
1. All listed tasks are implemented
2. Features work end-to-end in the running app
3. TypeScript compiles with no errors
4. Python tests pass for new backend functionality
5. The app doesn't crash or hang on the happy path
6. UI matches the design system (dark mode, spacing, typography)
7. Accessibility basics are in place (keyboard nav, labels)
