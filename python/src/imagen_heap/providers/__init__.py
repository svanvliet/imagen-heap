"""Runtime provider abstract base class."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class DeviceInfo:
    """Information about the local compute device."""
    chip: str
    total_memory_mb: int
    os_version: str
    provider_name: str


@dataclass
class MemoryStatus:
    """Current memory usage."""
    used_mb: float
    peak_mb: float
    available_mb: float


ProgressCallback = Callable[[int, int, str | None], None]
"""Callback(current_step, total_steps, optional_preview_base64)"""


class RuntimeProvider(ABC):
    """Abstract interface for inference runtime providers (MLX, MPS, etc.)."""

    @abstractmethod
    def load_model(self, model_id: str, quantization: str = "q8") -> None:
        """Load a model into memory."""
        ...

    @abstractmethod
    def unload_model(self) -> None:
        """Unload the currently loaded model."""
        ...

    @abstractmethod
    def text_to_image(
        self,
        prompt: str,
        negative_prompt: str,
        seed: int,
        steps: int,
        cfg: float,
        width: int,
        height: int,
        progress_callback: ProgressCallback | None = None,
    ) -> str:
        """Generate an image from a text prompt. Returns the path to the generated image."""
        ...

    @abstractmethod
    def get_device_info(self) -> DeviceInfo:
        """Get information about the compute device."""
        ...

    @abstractmethod
    def get_memory_status(self) -> MemoryStatus:
        """Get current memory usage."""
        ...


class StubProvider(RuntimeProvider):
    """Stub provider for development/testing when no ML runtime is available."""

    def __init__(self) -> None:
        self._loaded_model: str | None = None

    def load_model(self, model_id: str, quantization: str = "q8") -> None:
        self._loaded_model = model_id

    def unload_model(self) -> None:
        self._loaded_model = None

    def text_to_image(
        self,
        prompt: str,
        negative_prompt: str,
        seed: int,
        steps: int,
        cfg: float,
        width: int,
        height: int,
        progress_callback: ProgressCallback | None = None,
    ) -> str:
        import time
        for step in range(1, steps + 1):
            if progress_callback:
                progress_callback(step, steps, None)
            time.sleep(0.1)
        return ""  # No actual image generated

    def get_device_info(self) -> DeviceInfo:
        import platform
        return DeviceInfo(
            chip="stub",
            total_memory_mb=0,
            os_version=platform.platform(),
            provider_name="stub",
        )

    def get_memory_status(self) -> MemoryStatus:
        return MemoryStatus(used_mb=0, peak_mb=0, available_mb=0)
