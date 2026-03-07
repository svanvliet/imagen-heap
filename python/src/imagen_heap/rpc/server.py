"""JSON-RPC 2.0 server that reads from stdin and writes to stdout."""

import json
import logging
import sys
import threading
from typing import Any, Callable, Optional

from . import RpcRequest, RpcResponse, make_error, make_result

logger = logging.getLogger(__name__)

# Type for RPC method handlers
RpcHandler = Callable[[dict[str, Any]], Any]


class RpcServer:
    """JSON-RPC 2.0 server over stdio with support for background methods."""

    def __init__(self, write_lock: Optional[threading.Lock] = None) -> None:
        self._handlers: dict[str, RpcHandler] = {}
        self._background_methods: set[str] = set()
        self._write_lock = write_lock or threading.Lock()

    def register(self, method: str, handler: RpcHandler, *, background: bool = False) -> None:
        """Register a handler for an RPC method.

        Args:
            background: If True, the handler runs in a background thread
                        so the server can continue processing other requests.
        """
        self._handlers[method] = handler
        if background:
            self._background_methods.add(method)
        logger.debug("Registered RPC method: %s%s", method, " (background)" if background else "")

    def _write_response(self, response_str: str) -> None:
        """Thread-safe write to stdout."""
        with self._write_lock:
            sys.stdout.write(response_str + "\n")
            sys.stdout.flush()
            logger.debug("Sent response: %s", response_str[:200])

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

    def _handle_background(self, request: RpcRequest) -> None:
        """Run a request handler in a background thread."""
        try:
            response = self._dispatch(request)
            if request.id is not None:
                self._write_response(json.dumps(response.to_dict()))
        except Exception as e:
            logger.exception("Background handler failed for %s", request.method)
            if request.id is not None:
                resp = make_error(request.id, -32000, str(e))
                self._write_response(json.dumps(resp.to_dict()))

    def _process_line(self, line: str) -> str | None:
        """Process a single line of input. Returns JSON response string or None."""
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

        # Background methods run in a thread — response sent asynchronously
        if request.method in self._background_methods:
            logger.info("Dispatching %s to background thread", request.method)
            t = threading.Thread(
                target=self._handle_background,
                args=(request,),
                daemon=True,
                name=f"rpc-{request.method}-{request.id}",
            )
            t.start()
            return None  # Response will be sent by the thread

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
                self._write_response(response_str)

        logger.info("RPC server shutting down (stdin closed)")
