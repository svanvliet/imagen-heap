"""Tests for the main entry point ping handler."""

import json
from imagen_heap.main import create_server


class TestMainHandlers:
    def setup_method(self):
        self.server = create_server()

    def test_ping(self):
        req = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping", "params": {}})
        resp_str = self.server._process_line(req)
        resp = json.loads(resp_str)
        assert resp["result"]["status"] == "ok"
        assert "version" in resp["result"]
        assert "python_version" in resp["result"]

    def test_get_device_info(self):
        req = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "get_device_info", "params": {}})
        resp_str = self.server._process_line(req)
        resp = json.loads(resp_str)
        assert "chip" in resp["result"]
        assert "provider_name" in resp["result"]

    def test_get_memory_status(self):
        req = json.dumps({"jsonrpc": "2.0", "id": 3, "method": "get_memory_status", "params": {}})
        resp_str = self.server._process_line(req)
        resp = json.loads(resp_str)
        assert "used_mb" in resp["result"]
