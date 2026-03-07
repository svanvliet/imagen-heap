"""Tests for the providers."""

from imagen_heap.providers import StubProvider


class TestStubProvider:
    def setup_method(self):
        self.provider = StubProvider()

    def test_device_info(self):
        info = self.provider.get_device_info()
        assert info.provider_name == "stub"
        assert isinstance(info.os_version, str)

    def test_memory_status(self):
        status = self.provider.get_memory_status()
        assert status.used_mb == 0

    def test_load_unload_model(self):
        self.provider.load_model("test-model", "q8")
        assert self.provider._loaded_model == "test-model"
        self.provider.unload_model()
        assert self.provider._loaded_model is None

    def test_text_to_image_calls_progress(self):
        steps_received = []
        def callback(step, total, preview):
            steps_received.append((step, total))

        self.provider.text_to_image(
            prompt="test",
            negative_prompt="",
            seed=42,
            steps=3,
            cfg=7.5,
            width=64,
            height=64,
            progress_callback=callback,
        )
        assert len(steps_received) == 3
        assert steps_received[-1] == (3, 3)
