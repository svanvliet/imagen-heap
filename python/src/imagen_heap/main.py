"""Imagen Heap Python sidecar — entry point.

This process communicates with the Tauri frontend via JSON-RPC 2.0 over stdio.
- stdin:  receives JSON-RPC requests (one per line)
- stdout: sends JSON-RPC responses (one per line)
- stderr: reserved for logging
"""

import logging
import platform
import sys

from imagen_heap import __version__
from imagen_heap.rpc.server import RpcServer
from imagen_heap.providers import StubProvider

# Configure logging to stderr (stdout is reserved for RPC)
logging.basicConfig(
    stream=sys.stderr,
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("imagen_heap")


def create_server() -> RpcServer:
    """Create and configure the RPC server with all handlers."""
    server = RpcServer()
    provider = StubProvider()

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

    server.register("ping", handle_ping)
    server.register("get_device_info", handle_get_device_info)
    server.register("get_memory_status", handle_get_memory_status)

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
