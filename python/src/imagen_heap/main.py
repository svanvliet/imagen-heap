"""Imagen Heap Python sidecar — entry point.

This process communicates with the Tauri frontend via JSON-RPC 2.0 over stdio.
- stdin:  receives JSON-RPC requests (one per line)
- stdout: sends JSON-RPC responses (one per line)
- stderr: reserved for logging
"""

import json
import logging
import os
import platform
import sys

from imagen_heap import __version__
from imagen_heap.rpc.server import RpcServer
from imagen_heap.providers import StubProvider
from imagen_heap.pipeline.orchestrator import PipelineOrchestrator, GenerationConfig

# Configure logging to stderr (stdout is reserved for RPC)
logging.basicConfig(
    stream=sys.stderr,
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("imagen_heap")


def _send_notification(method: str, params: dict) -> None:
    """Send a JSON-RPC notification (no id) to stdout."""
    msg = json.dumps({"jsonrpc": "2.0", "method": method, "params": params})
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def create_server() -> RpcServer:
    """Create and configure the RPC server with all handlers."""
    server = RpcServer()
    provider = StubProvider()

    # Determine output directory
    output_dir = os.environ.get(
        "IMAGEN_HEAP_OUTPUT_DIR",
        os.path.expanduser("~/Documents/ImagenHeap/generations"),
    )
    orchestrator = PipelineOrchestrator(output_dir=output_dir, provider=provider)

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
            model_id=params.get("model_id", "flux-schnell"),
            sampler=params.get("sampler", "euler"),
            scheduler=params.get("scheduler", "normal"),
        )

        def on_progress(job_id: str, step: int, total: int, preview: str | None) -> None:
            _send_notification("progress", {
                "job_id": job_id,
                "step": step,
                "total_steps": total,
                "preview_base64": preview,
            })

        result = orchestrator.generate(config, progress_callback=on_progress)
        return result.to_dict()

    server.register("ping", handle_ping)
    server.register("get_device_info", handle_get_device_info)
    server.register("get_memory_status", handle_get_memory_status)
    server.register("generate", handle_generate)

    return server


def main() -> None:
    logger.info("Imagen Heap Python sidecar v%s starting", __version__)
    logger.info("Python %s on %s", platform.python_version(), platform.platform())

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
