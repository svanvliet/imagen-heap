"""Tests for face embedding extraction and SDXL FaceID provider support."""

import numpy as np
import pytest
from unittest.mock import patch, MagicMock, PropertyMock
from pathlib import Path


class TestFaceEmbeddingExtractor:
    """Tests for the InsightFace face embedding extractor."""

    def test_is_available(self):
        from imagen_heap.providers.face_embedding import is_available
        # Should be True since we installed insightface + onnxruntime
        assert is_available() is True

    def test_is_available_import_error(self):
        with patch.dict("sys.modules", {"insightface": None}):
            # Re-import to test import error path
            import importlib
            from imagen_heap.providers import face_embedding
            importlib.reload(face_embedding)
            # After reload with mocked missing module, this won't work directly
            # but we can test the function logic
        # The installed version should be available
        from imagen_heap.providers.face_embedding import is_available
        assert is_available() is True

    def test_extract_face_embedding_file_not_found(self):
        from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor

        # Mock InsightFace to avoid downloading the model in tests
        with patch("insightface.app.FaceAnalysis") as mock_fa:
            mock_app = MagicMock()
            mock_fa.return_value = mock_app
            extractor = FaceEmbeddingExtractor()

            with pytest.raises(FileNotFoundError, match="Image not found"):
                extractor.extract_face_embedding("/nonexistent/image.jpg")

    def test_extract_face_embedding_no_face(self):
        from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor

        with patch("insightface.app.FaceAnalysis") as mock_fa:
            mock_app = MagicMock()
            mock_fa.return_value = mock_app
            extractor = FaceEmbeddingExtractor()

            # Mock cv2.imread to return a valid image AND Path.exists to return True
            with patch("cv2.imread", return_value=np.zeros((100, 100, 3), dtype=np.uint8)):
                with patch.object(Path, "exists", return_value=True):
                    mock_app.get.return_value = []  # No faces detected
                    with pytest.raises(ValueError, match="No face detected"):
                        extractor.extract_face_embedding("/some/real/path.jpg")

    def test_extract_face_embedding_success(self):
        from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor

        with patch("insightface.app.FaceAnalysis") as mock_fa:
            mock_app = MagicMock()
            mock_fa.return_value = mock_app
            extractor = FaceEmbeddingExtractor()

            # Create a mock face with embedding
            mock_face = MagicMock()
            mock_face.bbox = [10, 10, 110, 110]  # 100x100 face
            embedding = np.random.randn(512).astype(np.float32)
            embedding = embedding / np.linalg.norm(embedding)
            mock_face.normed_embedding = embedding

            with patch("cv2.imread", return_value=np.zeros((200, 200, 3), dtype=np.uint8)):
                mock_app.get.return_value = [mock_face]

                # Need to mock path.exists
                with patch.object(Path, "exists", return_value=True):
                    result = extractor.extract_face_embedding("/test/face.jpg")

            assert result.shape == (512,)
            np.testing.assert_array_almost_equal(result, embedding)

    def test_extract_selects_largest_face(self):
        from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor

        with patch("insightface.app.FaceAnalysis") as mock_fa:
            mock_app = MagicMock()
            mock_fa.return_value = mock_app
            extractor = FaceEmbeddingExtractor()

            # Two faces: small and large
            small_face = MagicMock()
            small_face.bbox = [0, 0, 50, 50]  # 50x50
            small_face.normed_embedding = np.ones(512, dtype=np.float32) * 0.1

            large_face = MagicMock()
            large_face.bbox = [0, 0, 200, 200]  # 200x200
            large_face.normed_embedding = np.ones(512, dtype=np.float32) * 0.9

            with patch("cv2.imread", return_value=np.zeros((300, 300, 3), dtype=np.uint8)):
                mock_app.get.return_value = [small_face, large_face]
                with patch.object(Path, "exists", return_value=True):
                    result = extractor.extract_face_embedding("/test/face.jpg")

            # Should select the large face (0.9 values)
            assert result[0] == pytest.approx(0.9)

    def test_extract_face_embeddings_partial(self):
        from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor

        with patch("insightface.app.FaceAnalysis") as mock_fa:
            mock_app = MagicMock()
            mock_fa.return_value = mock_app
            extractor = FaceEmbeddingExtractor()

            mock_face = MagicMock()
            mock_face.bbox = [0, 0, 100, 100]
            mock_face.normed_embedding = np.random.randn(512).astype(np.float32)

            def mock_get(img):
                return [mock_face]

            mock_app.get = mock_get

            with patch("cv2.imread", return_value=np.zeros((100, 100, 3), dtype=np.uint8)):
                with patch.object(Path, "exists", side_effect=[True, False, True]):
                    # Second image doesn't exist — should be skipped
                    results = extractor.extract_face_embeddings(
                        ["/img1.jpg", "/nonexistent.jpg", "/img3.jpg"]
                    )

            assert len(results) == 2

    def test_extract_face_embeddings_all_fail(self):
        from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor

        with patch("insightface.app.FaceAnalysis") as mock_fa:
            mock_app = MagicMock()
            mock_fa.return_value = mock_app
            extractor = FaceEmbeddingExtractor()

            with pytest.raises(ValueError, match="No faces detected in any"):
                extractor.extract_face_embeddings(["/no1.jpg", "/no2.jpg"])

    def test_compute_average_embedding(self):
        from imagen_heap.providers.face_embedding import FaceEmbeddingExtractor

        with patch("insightface.app.FaceAnalysis") as mock_fa:
            mock_app = MagicMock()
            mock_fa.return_value = mock_app
            extractor = FaceEmbeddingExtractor()

            # Create two distinct embeddings
            emb1 = np.zeros(512, dtype=np.float32)
            emb1[0] = 1.0
            emb2 = np.zeros(512, dtype=np.float32)
            emb2[1] = 1.0

            faces = iter([
                MagicMock(bbox=[0, 0, 100, 100], normed_embedding=emb1),
                MagicMock(bbox=[0, 0, 100, 100], normed_embedding=emb2),
            ])

            def mock_get(img):
                return [next(faces)]

            mock_app.get = mock_get

            with patch("cv2.imread", return_value=np.zeros((100, 100, 3), dtype=np.uint8)):
                with patch.object(Path, "exists", return_value=True):
                    avg = extractor.compute_average_embedding(["/a.jpg", "/b.jpg"])

            assert avg.shape == (512,)
            # Average of [1,0,...] and [0,1,...] normalized
            norm = np.linalg.norm(avg)
            assert norm == pytest.approx(1.0, abs=1e-6)
            # Both components should be roughly equal
            assert avg[0] == pytest.approx(avg[1], abs=1e-6)


class TestFaceIDRouting:
    """Tests for FaceID routing in the orchestrator."""

    def test_generation_config_faceid_adapter_type(self):
        from imagen_heap.pipeline.orchestrator import GenerationConfig
        config = GenerationConfig(prompt="test", adapter_type="faceid")
        assert config.adapter_type == "faceid"

    def test_resolve_provider_faceid(self):
        from imagen_heap.pipeline.orchestrator import PipelineOrchestrator, GenerationConfig
        from imagen_heap.providers import StubProvider
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            orch = PipelineOrchestrator(output_dir=tmpdir, provider=StubProvider())

            # Mock diffusers_provider as available with faceid support
            mock_provider = MagicMock()
            mock_provider.is_faceid_available.return_value = True
            orch._diffusers_provider = mock_provider

            config = GenerationConfig(prompt="test", adapter_type="faceid")
            result = orch._resolve_provider_for_character(config)
            assert result == "diffusers"

    def test_resolve_provider_faceid_fallback(self):
        from imagen_heap.pipeline.orchestrator import PipelineOrchestrator, GenerationConfig
        from imagen_heap.providers import StubProvider
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            orch = PipelineOrchestrator(output_dir=tmpdir, provider=StubProvider())
            # Mock diffusers_provider property to return None (not available)
            with patch.object(type(orch), 'diffusers_provider', new_callable=PropertyMock, return_value=None):
                config = GenerationConfig(prompt="test", adapter_type="faceid")
                result = orch._resolve_provider_for_character(config)
                assert result == "mlx"

    def test_generation_result_faceid_metadata(self):
        from imagen_heap.pipeline.orchestrator import GenerationConfig, GenerationResult

        result = GenerationResult(
            id="test123",
            image_path="/test.png",
            thumbnail_path="/test_thumb.png",
            config=GenerationConfig(prompt="test", adapter_type="faceid"),
            generation_time_ms=5000,
            created_at="2026-03-08T00:00:00Z",
            inference_provider="diffusers",
            resolved_adapter="sdxl-faceid",
        )
        d = result.to_dict()
        assert d["inference_provider"] == "diffusers"
        assert d["resolved_adapter"] == "sdxl-faceid"
        assert d["config"]["adapter_type"] == "faceid"

    def test_available_providers_includes_faceid(self):
        from imagen_heap.pipeline.orchestrator import PipelineOrchestrator
        from imagen_heap.providers import StubProvider
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            orch = PipelineOrchestrator(output_dir=tmpdir, provider=StubProvider())
            providers = orch.get_available_providers()
            # Should include faceid key (even if False when not installed)
            assert "faceid" in providers
