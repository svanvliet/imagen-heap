"""Imagen Heap Python sidecar — entry point.

This process communicates with the Tauri frontend via JSON-RPC 2.0 over stdio.
- stdin:  receives JSON-RPC requests (one per line)
- stdout: sends JSON-RPC responses (one per line)
- stderr: reserved for logging (captured by Rust host)
"""

import json
import logging
import logging.handlers
import os
import platform
import sys
from pathlib import Path

from imagen_heap import __version__
from imagen_heap.rpc.server import RpcServer
from imagen_heap.providers import StubProvider
from imagen_heap.pipeline.orchestrator import PipelineOrchestrator, GenerationConfig
from imagen_heap.models.manager import ModelManager

# --- Logging setup ---
# Logs go to both stderr (captured by Rust) and ~/.imagen-heap/logs/python.log
LOG_DIR = Path.home() / ".imagen-heap" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "python.log"
LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"

root_logger = logging.getLogger()
root_logger.setLevel(logging.DEBUG)

# stderr handler (captured by Rust host)
stderr_handler = logging.StreamHandler(sys.stderr)
stderr_handler.setLevel(logging.DEBUG)
stderr_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATEFMT))
root_logger.addHandler(stderr_handler)

# File handler with rotation (5 MB, keep 2 backups)
file_handler = logging.handlers.RotatingFileHandler(
    LOG_FILE, maxBytes=5_000_000, backupCount=2, encoding="utf-8",
)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATEFMT))
root_logger.addHandler(file_handler)

logger = logging.getLogger("imagen_heap")


def _send_notification(method: str, params: dict) -> None:
    """Send a JSON-RPC notification (no id) to stdout."""
    msg = json.dumps({"jsonrpc": "2.0", "method": method, "params": params})
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def create_server() -> RpcServer:
    """Create and configure the RPC server with all handlers."""
    server = RpcServer()

    # Auto-select provider: MLX if available, StubProvider fallback
    try:
        from imagen_heap.providers.mlx_provider import MLXProvider
        provider = MLXProvider()
        logger.info("Using MLXProvider (real inference)")
    except Exception as e:
        logger.warning("MLX not available (%s), falling back to StubProvider", e)
        provider = StubProvider()

    # Determine directories — all data lives under ~/.imagen-heap/
    base_dir = os.environ.get(
        "IMAGEN_HEAP_DATA_DIR",
        os.path.expanduser("~/.imagen-heap"),
    )
    output_dir = os.path.join(base_dir, "generations")
    models_dir = os.path.join(base_dir, "models")

    orchestrator = PipelineOrchestrator(output_dir=output_dir, provider=provider)
    model_manager = ModelManager(models_dir=models_dir)

    # --- Core methods ---

    def handle_ping(params: dict) -> dict:
        return {
            "status": "ok",
            "version": __version__,
            "python_version": platform.python_version(),
            "platform": platform.platform(),
        }

    def handle_get_device_info(params: dict) -> dict:
        info = provider.get_device_info()
        return {
            "chip": info.chip,
            "total_memory_mb": info.total_memory_mb,
            "os_version": info.os_version,
            "provider_name": info.provider_name,
        }

    def handle_get_memory_status(params: dict) -> dict:
        status = provider.get_memory_status()
        return {
            "used_mb": status.used_mb,
            "peak_mb": status.peak_mb,
            "available_mb": status.available_mb,
        }

    def handle_generate(params: dict) -> dict:
        """Handle a generation request with progress streaming."""
        config = GenerationConfig(
            prompt=params.get("prompt", ""),
            negative_prompt=params.get("negative_prompt", ""),
            seed=params.get("seed", 42),
            steps=params.get("steps", 4),
            cfg=params.get("cfg", 7.5),
            width=params.get("width", 1024),
            height=params.get("height", 1024),
            quality_profile=params.get("quality_profile", "fast"),
            model_id=params.get("model_id", "flux-schnell-q8"),
            sampler=params.get("sampler", "euler"),
            scheduler=params.get("scheduler", "normal"),
        )

        # Auto-load model if provider supports it
        if hasattr(provider, 'load_model') and hasattr(provider, '_loaded_model'):
            needed = config.model_id
            if provider._loaded_model != needed:
                logger.info("Auto-loading model %s for generation", needed)
                provider.load_model(needed)

        def on_progress(job_id: str, step: int, total: int, preview: str | None) -> None:
            _send_notification("progress", {
                "job_id": job_id,
                "step": step,
                "total_steps": total,
                "preview_base64": preview,
            })

        result = orchestrator.generate(config, progress_callback=on_progress)
        return result.to_dict()

    # --- Model management methods ---

    def handle_get_models(params: dict) -> list[dict]:
        """Get all models with download status."""
        return model_manager.get_all_models()

    def handle_get_downloaded_models(params: dict) -> list[dict]:
        """Get only downloaded models."""
        return model_manager.get_downloaded_models()

    def handle_get_default_downloads(params: dict) -> list[dict]:
        """Get the default model set for first-run download."""
        return model_manager.get_default_download_list()

    def handle_is_first_run(params: dict) -> dict:
        """Check if this is the first run."""
        return {"is_first_run": model_manager.is_first_run()}

    def handle_download_model(params: dict) -> dict:
        """Download a model from HuggingFace."""
        model_id = params.get("model_id", "")
        if not model_id:
            raise ValueError("model_id is required")

        def on_download_progress(mid: str, downloaded: int, total: int) -> None:
            _send_notification("download_progress", {
                "model_id": mid,
                "bytes_downloaded": downloaded,
                "total_bytes": total,
            })

        return model_manager.download_model(model_id, progress_callback=on_download_progress)

    def handle_delete_model(params: dict) -> dict:
        """Delete a downloaded model."""
        model_id = params.get("model_id", "")
        success = model_manager.delete_model(model_id)
        return {"success": success, "model_id": model_id}

    def handle_get_disk_usage(params: dict) -> dict:
        """Get disk usage of downloaded models."""
        return model_manager.get_disk_usage()

    server.register("ping", handle_ping)
    server.register("get_device_info", handle_get_device_info)
    server.register("get_memory_status", handle_get_memory_status)
    server.register("generate", handle_generate)
    server.register("get_models", handle_get_models)
    server.register("get_downloaded_models", handle_get_downloaded_models)
    server.register("get_default_downloads", handle_get_default_downloads)
    server.register("is_first_run", handle_is_first_run)
    server.register("download_model", handle_download_model)
    server.register("delete_model", handle_delete_model)
    server.register("get_disk_usage", handle_get_disk_usage)

    return server


def main() -> None:
    logger.info("=== Imagen Heap Python sidecar v%s starting ===", __version__)
    logger.info("Python %s on %s", platform.python_version(), platform.platform())
    logger.info("Log file: %s", LOG_FILE)
    logger.info("PID: %d", os.getpid())

    server = create_server()
    try:
        server.run()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down")
    except Exception:
        logger.exception("Fatal error in RPC server")
        sys.exit(1)


if __name__ == "__main__":
    main()
