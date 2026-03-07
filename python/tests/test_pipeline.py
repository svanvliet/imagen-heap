"""Tests for the pipeline orchestrator."""

import os
import tempfile

from imagen_heap.pipeline.orchestrator import PipelineOrchestrator, GenerationConfig


class TestPipelineOrchestrator:
    def setup_method(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.orchestrator = PipelineOrchestrator(output_dir=self.tmp_dir)

    def test_generate_returns_result(self):
        config = GenerationConfig(
            prompt="A cat on a mountain",
            seed=42,
            steps=3,
            width=512,
            height=512,
        )
        result = self.orchestrator.generate(config)
        assert result.id
        assert result.image_path
        assert result.thumbnail_path
        assert result.generation_time_ms >= 0
        assert result.config.prompt == "A cat on a mountain"
        assert result.config.seed == 42

    def test_generate_creates_files(self):
        config = GenerationConfig(prompt="test", seed=1, steps=2)
        result = self.orchestrator.generate(config)
        assert os.path.exists(result.image_path)
        assert os.path.exists(result.thumbnail_path)

    def test_generate_progress_callback(self):
        steps_seen = []

        def on_progress(job_id, step, total, preview):
            steps_seen.append((job_id, step, total))

        config = GenerationConfig(prompt="test", seed=1, steps=4)
        self.orchestrator.generate(config, progress_callback=on_progress)
        assert len(steps_seen) == 4
        assert steps_seen[0][1] == 1
        assert steps_seen[-1][1] == 4

    def test_generate_to_dict(self):
        config = GenerationConfig(prompt="test", seed=1, steps=2)
        result = self.orchestrator.generate(config)
        d = result.to_dict()
        assert d["id"] == result.id
        assert d["config"]["prompt"] == "test"
        assert d["config"]["seed"] == 1
        assert "generation_time_ms" in d

    def test_placeholder_svg_content(self):
        config = GenerationConfig(prompt="beautiful landscape", seed=42, steps=2)
        result = self.orchestrator.generate(config)
        with open(result.image_path) as f:
            content = f.read()
        assert "<svg" in content
        assert "beautiful landscape" in content
        assert "seed:42" in content
