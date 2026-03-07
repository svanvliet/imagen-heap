# Implementation Status

## Current Phase: M4 — Style Presets & Prompt Tools ✅

**Next up:** M5 (Gallery & History)

### Progress Log

#### 2026-03-07

- **06:13** — Starting implementation. M1 in progress.
  - Repo has: docs/ (requirements.md, research.md, plan.md)
  - Toolchains verified: Node 22.21.0, npm 10.9.4, Rust 1.93.1, Python 3.12.12
- **06:15** — M1 scaffold complete:
  - Tauri project initialized with React+TS template
  - Tailwind CSS v4, shadcn/ui (Radix), Zustand, framer-motion, lucide-react installed
  - Design system: globals.css with zinc/indigo tokens, dark-first, animations, custom scrollbar
  - Layout components: AppShell, Toolbar, Sidebar, Panel, Canvas, Filmstrip, StatusBar
  - Generation components: PromptInput, QualityToggle, AspectRatioSelector, GenerateButton
  - Zustand stores: ui, generation, backend
  - TypeScript types: generation, character, model
  - Utility functions: cn(), formatBytes(), formatDuration(), randomSeed()
  - Python sidecar: JSON-RPC 2.0 server, StubProvider, ping/device_info/memory_status handlers
  - Rust backend: sidecar manager, JSON-RPC client, ping_backend/get_backend_status commands
  - Tests: 16 frontend (vitest), 14 Python (pytest) — all passing
  - Tauri build: successful (.app + .dmg produced)
- **06:25** — M2 generation pipeline complete:
  - Pipeline orchestrator with GenerationConfig/GenerationResult
  - StubProvider generates placeholder SVGs with generation metadata
  - Progress streaming via JSON-RPC notifications → Tauri events → React
  - Rust IPC refactored: background reader thread for async stdout, pending response map
  - generate_image Tauri command wired end-to-end
  - useGeneration hook: generates, receives progress, updates store + canvas
  - useBackendStatus hook: ping on startup, listen for status events
  - Canvas shows generation info (seed, time, dimensions)
  - Filmstrip uses convertFileSrc for local file display
  - Tests: 16 frontend + 19 Python — all passing
  - Tauri build: successful
- **06:40** — M3 model management complete:
  - Python model registry: 4 FLUX model entries (schnell/dev × q4/q8) with metadata
  - ModelManager: download simulation with progress, catalog persistence, disk usage tracking
  - 7 new RPC methods: get_models, is_first_run, get_default_downloads, download_model, delete_model, get_disk_usage, get_model_by_id
  - 9 Rust Tauri commands registered and working
  - FirstRunWizard: 3-step flow (welcome → download → complete), shown on first run
  - ModelManager UI: modal with model cards, license badges, quantization tags, download/delete actions, disk usage display
  - Zustand model store with isFirstRun detection and download state tracking
  - App.tsx wired: checks first run on backend connect, shows wizard overlay
  - Toolbar: added Model Manager button (Database icon)
  - Tests: 34 Python + 16 frontend — all passing
  - Tauri build: successful (.app + .dmg produced)
- **06:45** — Bug fixes (First Run Wizard + backend connection):
  - Fixed render guard: `showWizard && isFirstRun` failed when isFirstRun was null → simplified to `showWizard`
  - Fixed checkFirstRun catch block: now sets isFirstRun=true in store on error
  - Added ping retries (4 attempts) for sidecar initialization timing
- **06:50** — Comprehensive logging added:
  - Rust: fern-based file logging to ~/.imagen-heap/logs/tauri.log (debug to file, info to console)
  - Python: RotatingFileHandler to ~/.imagen-heap/logs/python.log (5MB × 2 backups)
  - Frontend: createLogger() utility with timestamped module-prefixed console output
  - Logging revealed root cause: serde null-as-error bug + CWD path issue
- **06:51** — Fixed serde null RPC error: `response.get("error")` returned `Some(Null)` for every successful response → added `.filter(|v| !v.is_null())`
- **06:53** — Fixed Python sidecar path: `npx tauri dev` sets CWD to `src-tauri/`, added `../python/...` candidate
- **07:00** — M2b real inference in progress:
  - Updated plan: added M2b milestone between M2 and M3
  - Migrated all data paths from ~/Documents/ImagenHeap/ to ~/.imagen-heap/
  - Installed mflux 0.16.8 (MLX 0.30.6, mlx-metal 0.30.6)
  - Created MLXProvider: wraps mflux Flux1 for real FLUX generation
  - Updated model registry with HF repo IDs + mflux model names
  - Replaced simulate_download with real huggingface_hub.snapshot_download
  - Updated PipelineOrchestrator to handle mflux GeneratedImage objects
  - Auto-provider selection: MLXProvider with StubProvider fallback
  - Auto-model loading: loads requested model before generation
  - Added download progress streaming: Rust DownloadProgressEvent → Tauri event → React
  - ModelManager UI: real progress bar with percentage + bytes during downloads
  - useDownloadProgress hook wired into App.tsx
  - Tests: 34 Python + 16 frontend — all passing
  - Tauri build: successful
- **07:10** — Fixed HF gated repo + wizard UX:
  - Added HuggingFace token save/load in Python ModelManager (stored at ~/.imagen-heap/models/.hf_token)
  - Added save_hf_token RPC handler + Rust command + TypeScript wrapper
  - Catch GatedRepoError: returns AUTH_REQUIRED prefix for clear UI messaging
  - **FirstRunWizard overhaul**: per-model download buttons, "Skip for now" / "Continue anyway" options, HF token input panel, download progress bars, error display with retry
  - **ModelManager overhaul**: error handling with auth detection, HF token input, retry button with amber styling
  - No longer auto-advances wizard on download failure
  - Tests: 34 Python + 16 frontend — all passing
  - Rust build: successful
- **07:42** — Background downloads + status bar:
  - Async Rust commands: download_model (1hr timeout) and generate_image (10min) use tokio::spawn_blocking
  - Refactored send_rpc into send_rpc_raw for background thread compatibility
  - Global download state: errors, progress, status all in Zustand store (persists across wizard/catalog navigation)
  - StatusBar: spinning download indicator with progress percentage and bytes
  - Added non-gated pre-quantized FLUX model (dhairyashil/FLUX.1-schnell-mflux-8bit, ~13GB, Apache 2.0)
  - Differentiated 401 auth-required vs 403 license-required errors
  - Tests: 34 Python + 16 frontend — all passing
  - Rust build: successful
- **08:00** — Wizard completion + catalog validation:
  - is_first_run now checks `.wizard_done` file (not catalog length) — wizard shows until explicitly completed
  - mark_wizard_done wired through Python → Rust → TS → App.tsx
  - Catalog validation: checks for .safetensors/.bin/.gguf files on load, prunes stale entries
  - Disk usage follows symlinks and dedupes by inode (17GB now reported correctly, was 384 bytes)
  - delete_model uses shutil.rmtree on full HF cache dir (blobs + snapshots)
  - Delete confirmation UX: trash icon → Confirm/Cancel buttons
  - Tests: 35 Python + 16 frontend — all passing
- **08:35** — Download progress, reveal folder, reset wizard:
  - Real download progress: polls HF cache dir size every 1.5s during download
  - Progress bar shows actual bytes downloaded / total, smooth transitions
  - "Reveal in Finder" button (folder icon) on downloaded models using tauri-plugin-opener
  - "Re-run Setup Wizard" button in Model Manager header
  - reset_wizard + get_model_path RPC handlers added
  - Tests: 35 Python + 16 frontend — all passing
- **08:38** — Clickable error URLs for gated models:
  - License-required errors show "Accept license on HuggingFace ↗" clickable link
  - Auth-required errors show "View model ↗" clickable link
  - Applied to both ModelManager and FirstRunWizard
- **08:45** — Threaded RPC server (fixes Model Manager hang during download):
  - Python RPC server was single-threaded — download_model blocked all other requests
  - Added `background=True` mode: download_model and generate run in threads
  - Shared stdout write lock between RPC server and notification sender
  - Model Manager now opens instantly even during active downloads
- **08:47** — Download UX polish:
  - Progress bar initializes at 0% (was starting mid-way from stale HF cache data)
  - StatusBar download indicator is now clickable → opens Model Manager
  - showModelManager state lifted from Toolbar-local to shared UI store
- **08:55** — Verified FLUX.1-dev model integrity:
  - 30 files, 53.9 GB, 0 broken symlinks, 0 incomplete blobs
  - HuggingFace download resume confirmed working after app termination
  - Two models now fully downloaded: flux-schnell-mflux-q8 (17GB) + flux-dev-q8 (54GB)
- **09:15** — Plan updated with M2b.5–2b.10 (UI gap analysis):
  - Identified critical missing features: model selection, advanced params, canvas preview, status bar generation progress, image export
  - Added 6 new tasks to M2b to close the gaps before M4
- **09:22** — M2b.5–2b.9 implemented (model selection, advanced params, canvas preview, export):
  - **Model selection**: ModelSelector dropdown in sidebar, selectedModelId in store with auto-selection, "Use"/"Active" buttons in Model Manager, quality toggle auto-selects best model
  - **Advanced params**: Expandable accordion with steps slider (1-50), CFG slider (1-20), seed input with lock/randomize/copy, negative prompt textarea
  - **Canvas live preview**: Renders previewBase64 per step, overlay pill with step/elapsed/cancel, ElapsedTimer component, progress bar fallback when no preview
  - **Status bar**: "Generating: Step X/Y" indicator with mini progress bar
  - **Image export**: Hover toolbar (Save As, Copy), right-click context menus on canvas + filmstrip with Copy Prompt/Copy Seed
  - 728 lines added across 11 files, all tests passing
- **09:30** — Fixed mflux import path:
  - `mflux.models.flux.flux1` → `mflux.models.flux.variants.txt2img.flux` (changed in mflux 0.16.8)
  - Improved callback registry discovery (checks multiple attribute names)
  - Added generationError state + error display on canvas (was silently failing)
- **09:46** — Fixed model loading on startup + tiktoken dependency:
  - App.tsx now calls loadModels() when backend connects (model dropdown was empty until Model Manager opened)
  - Installed tiktoken (required by mflux's tokenizer)
- **09:48** — Fixed SentencePiece tokenizer crash:
  - transformers 5.3.0 tried parsing spiece.model via tiktoken BPE (wrong format) → installed protobuf to enable proper SentencePiece path
- **09:55** — 🎉 **First real image generated!** (FLUX.1-schnell, 4 steps, 55s, 1024×1024)
  - Image didn't render: Tauri WebView couldn't load local files → added assetProtocol scope in tauri.conf.json
  - Context menu clicks not working: document click handler was eating events → switched to mousedown with data-context-menu guard
- **10:06** — Full end-to-end generation working with image display, filmstrip, metadata, context menus
- **10:10** — M4.1+4.2 — Style presets system + visual grid:
  - 8 style presets: Photo, Cinematic, Anime, Watercolor, Digital Art, Concept, Pixel, Line Art
  - Each preset: prompt suffix, negative prompt, recommended CFG, gradient card with emoji icon
  - 4-column grid in sidebar between Quality and Aspect Ratio
  - Selected preset auto-applies to generation via getConfig() (prompt suffix + negative prompt merge)
  - Style badge shown in canvas metadata for generated images
  - `setStylePresetId` updates CFG when preset has recommendation
- **10:14** — M4.3 — Prompt history with persistence:
  - Auto-saves prompts to localStorage after successful generation (Zustand persist middleware)
  - Searchable history dropdown on prompt textarea (clock icon)
  - Relative timestamps ("2m ago", "yesterday") + style preset used
  - Click to load, trash to delete, deduplicates entries
  - Max 100 entries, most recent first
- **10:16** — M4.4 — Prompt templates browser:
  - 32 templates across 7 categories: Portrait, Landscape, Concept Art, Product, Character Design, Abstract, Architecture
  - Searchable overlay panel with category sidebar navigation
  - Click any template to load into prompt field
  - FileText icon on prompt label to open, Escape/click-outside to close
  - Clear button (×) on prompt label when text present

### What's Done (M4 status)

| Task | Status | Notes |
|------|--------|-------|
| 4.1 Style preset system | ✅ Done | 8 presets in constants.ts, prompt suffix + negative prompt + recommended CFG |
| 4.2 Style preset UI | ✅ Done | 4-col grid in sidebar, gradient cards, selected checkmark, "None" option |
| 4.3 Prompt history | ✅ Done | localStorage persistence, searchable, timestamps, style badges, dedup |
| 4.4 Prompt UX polish | ✅ Done | Auto-resize ✅, clear button ✅, template browser (32 templates, 7 categories) |

### What's Done (M2b status)

| Task | Status | Notes |
|------|--------|-------|
| 2b.1 Install inference deps | ✅ Done | mflux 0.16.8, MLX 0.30.6, tiktoken, protobuf |
| 2b.2 MLXProvider | ✅ Done | load_model, text_to_image, device/memory info |
| 2b.3 Real HF downloads | ✅ Done | snapshot_download, progress polling, resume, auth/license handling |
| 2b.4 Provider auto-selection | ✅ Done | MLXProvider with StubProvider fallback |
| 2b.5 Model selection UI | ✅ Done | Sidebar dropdown, "Use"/"Active" in Model Manager, auto-select on quality toggle |
| 2b.6 Advanced params | ✅ Done | Steps/CFG sliders, seed lock/randomize/copy, negative prompt |
| 2b.7 Canvas live preview | ✅ Done | previewBase64 rendering, overlay pill, elapsed timer, cancel |
| 2b.8 Generation status bar | ✅ Done | "Generating: Step X/Y" with mini progress bar |
| 2b.9 Image export | ✅ Done | Save As, Copy, context menus on canvas + filmstrip |
| 2b.10 Integration verification | ✅ Done | Real image generated and displayed end-to-end |

### Commits
| Hash | Milestone | Description |
|------|-----------|-------------|
| `16b4939` | M1 | docs: add requirements, research, and implementation plan |
| `8123ec6` | M1 | feat(m1): project scaffold — Tauri + React + Python sidecar |
| `2bd655b` | M2 | feat(m2): image generation pipeline with progress streaming |
| `dfb60ff` | M3 | feat(m3): model management — registry, downloads, First Run Wizard, Model Manager UI |
| `85e464d` | M3 | fix: First Run Wizard not showing |
| `ba0eeca` | — | feat: comprehensive file-based logging across all layers |
| `7b2f5d5` | — | fix: RPC error check treating null as error |
| `725d89c` | — | fix: Python sidecar not found when CWD is src-tauri/ |
| `1c79df3` | M2b | docs: add M2b (real inference) to plan, migrate data paths |
| `5e452ab` | M2b | feat(m2b): real inference — MLXProvider, HuggingFace downloads, download progress UI |
| `86570b2` | M2b | fix: HF auth handling, wizard UX overhaul, per-model downloads |
| `d379835` | M2b | fix: re-throw download errors from store so UI can display them |
| `9ee2e18` | M2b | fix: differentiate 403 license-required from 401 auth-required |
| `a47b8b5` | M2b | feat: add non-gated pre-quantized FLUX model as default |
| `dd96f10` | M2b | feat: background downloads with status bar indicator |
| `b770c2f` | M2b | docs: update status with background downloads and non-gated model |
| `5101cc2` | M2b | fix: wizard_done flag, disk usage calc, mark_wizard_done wiring |
| `38a011d` | M2b | fix: catalog validation, proper HF cache deletion, delete confirmation UX |
| `73bc0b5` | M2b | feat: real download progress, reveal folder, reset wizard |
| `47362b9` | M2b | docs: update status with catalog validation, progress, reveal folder |
| `266ae09` | M2b | fix: make URLs in gated model errors clickable |
| `822b529` | M2b | fix: RPC server runs downloads/generation in background threads |
| `fe2ec80` | M2b | fix: progress bar starts at 0, status bar download opens Model Manager |
| `af7c424` | M2b | docs: sync plan.md and status.md with actual implementation state |
| `c7afc09` | M2b | docs: add M2b.5-2b.10 — model selection, advanced params, canvas preview, export |
| `187828a` | M2b | feat: model selection, advanced params, canvas preview, generation status, export |
| `6acad35` | M2b | fix: mflux import path for v0.16.8, add generation error display |
| `39f21c7` | M2b | fix: load models on startup, add tiktoken dependency |
| `a8f54f4` | M2b | fix: add protobuf dep for SentencePiece tokenizer loading |
| `0c6c9cc` | M2b | fix: asset protocol scope for image rendering, context menu clicks |
| `42af3b2` | M2b | fix: move asset protocol scope to tauri.conf.json |
| `531e42f` | M2b | docs: update status.md — M2b complete |
| `c218bb0` | M4 | feat: M4.1+4.2 — style presets with visual grid (8 styles) |
| `f7d57c1` | M4 | feat: M4.3 — prompt history with search and persistence |
| `587b46f` | M4 | feat: M4.4 — prompt templates browser (32 templates, 7 categories) |

### Test Counts
- Python: 35 tests passing
- Frontend: 16 tests passing (vitest)
- Rust: cargo check passes
