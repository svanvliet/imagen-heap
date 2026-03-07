"""JSON-RPC 2.0 protocol types."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RpcRequest:
    """Incoming JSON-RPC request."""
    method: str
    params: dict[str, Any] = field(default_factory=dict)
    id: int | str | None = None
    jsonrpc: str = "2.0"


@dataclass
class RpcResponse:
    """Outgoing JSON-RPC response."""
    id: int | str | None
    result: Any = None
    error: dict[str, Any] | None = None
    jsonrpc: str = "2.0"

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"jsonrpc": self.jsonrpc, "id": self.id}
        if self.error is not None:
            d["error"] = self.error
        else:
            d["result"] = self.result
        return d


def make_error(id: int | str | None, code: int, message: str) -> RpcResponse:
    """Create an error response."""
    return RpcResponse(id=id, error={"code": code, "message": message})


def make_result(id: int | str | None, result: Any) -> RpcResponse:
    """Create a success response."""
    return RpcResponse(id=id, result=result)
