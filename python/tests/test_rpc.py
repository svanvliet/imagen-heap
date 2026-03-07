"""Tests for the JSON-RPC server."""

import json
from imagen_heap.rpc.server import RpcServer


def make_request(method: str, params: dict | None = None, id: int = 1) -> str:
    """Create a JSON-RPC request string."""
    return json.dumps({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params or {},
    })


def parse_response(response_str: str) -> dict:
    """Parse a JSON-RPC response string."""
    return json.loads(response_str)


class TestRpcServer:
    def setup_method(self):
        self.server = RpcServer()
        self.server.register("echo", lambda params: params)
        self.server.register("add", lambda params: params["a"] + params["b"])
        self.server.register("fail", lambda params: (_ for _ in ()).throw(ValueError("test error")))

    def test_successful_call(self):
        req = make_request("echo", {"message": "hello"})
        resp_str = self.server._process_line(req)
        assert resp_str is not None
        resp = parse_response(resp_str)
        assert resp["jsonrpc"] == "2.0"
        assert resp["id"] == 1
        assert resp["result"] == {"message": "hello"}

    def test_method_with_computation(self):
        req = make_request("add", {"a": 3, "b": 4})
        resp_str = self.server._process_line(req)
        resp = parse_response(resp_str)
        assert resp["result"] == 7

    def test_unknown_method(self):
        req = make_request("nonexistent")
        resp_str = self.server._process_line(req)
        resp = parse_response(resp_str)
        assert resp["error"] is not None
        assert resp["error"]["code"] == -32601
        assert "not found" in resp["error"]["message"].lower()

    def test_handler_error(self):
        req = make_request("fail")
        resp_str = self.server._process_line(req)
        resp = parse_response(resp_str)
        assert resp["error"] is not None
        assert resp["error"]["code"] == -32000

    def test_invalid_json(self):
        resp_str = self.server._process_line("not json at all")
        resp = parse_response(resp_str)
        assert resp["error"] is not None
        assert resp["error"]["code"] == -32700

    def test_empty_line_returns_none(self):
        assert self.server._process_line("") is None
        assert self.server._process_line("   ") is None

    def test_notification_no_response(self):
        """Notifications (requests without id) should not produce a response."""
        req = json.dumps({"jsonrpc": "2.0", "method": "echo", "params": {"x": 1}})
        resp_str = self.server._process_line(req)
        assert resp_str is None
