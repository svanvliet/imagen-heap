# Implementation Status

## Current Phase: M2b — Real Inference & Model Downloads 🚧

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
