"""JSON-RPC 2.0 server that reads from stdin and writes to stdout."""

import json
import logging
import sys
from typing import Any, Callable

from . import RpcRequest, RpcResponse, make_error, make_result

logger = logging.getLogger(__name__)

# Type for RPC method handlers
RpcHandler = Callable[[dict[str, Any]], Any]


class RpcServer:
    """Simple JSON-RPC 2.0 server over stdio."""

    def __init__(self) -> None:
        self._handlers: dict[str, RpcHandler] = {}

    def register(self, method: str, handler: RpcHandler) -> None:
        """Register a handler for an RPC method."""
        self._handlers[method] = handler
        logger.debug("Registered RPC method: %s", method)

    def _dispatch(self, request: RpcRequest) -> RpcResponse:
        """Dispatch a request to the appropriate handler."""
        handler = self._handlers.get(request.method)
        if handler is None:
            logger.warning("Unknown method: %s", request.method)
            return make_error(request.id, -32601, f"Method not found: {request.method}")

        try:
            result = handler(request.params)
            return make_result(request.id, result)
        except Exception as e:
            logger.exception("Error handling method %s", request.method)
            return make_error(request.id, -32000, str(e))

    def _process_line(self, line: str) -> str | None:
        """Process a single line of input. Returns JSON response string or None for notifications."""
        line = line.strip()
        if not line:
            return None

        try:
            data = json.loads(line)
        except json.JSONDecodeError as e:
            logger.error("Invalid JSON: %s", e)
            resp = make_error(None, -32700, f"Parse error: {e}")
            return json.dumps(resp.to_dict())

        request = RpcRequest(
            method=data.get("method", ""),
            params=data.get("params", {}),
            id=data.get("id"),
            jsonrpc=data.get("jsonrpc", "2.0"),
        )

        logger.debug("Received: method=%s id=%s", request.method, request.id)
        response = self._dispatch(request)

        # Notifications (no id) don't get a response
        if request.id is None:
            return None

        return json.dumps(response.to_dict())

    def run(self) -> None:
        """Run the server loop, reading from stdin and writing to stdout."""
        logger.info("RPC server starting, waiting for requests on stdin...")

        for line in sys.stdin:
            response_str = self._process_line(line)
            if response_str is not None:
                sys.stdout.write(response_str + "\n")
                sys.stdout.flush()
                logger.debug("Sent response: %s", response_str[:200])

        logger.info("RPC server shutting down (stdin closed)")
