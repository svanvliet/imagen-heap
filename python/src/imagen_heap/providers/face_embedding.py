"""Face embedding extraction via InsightFace for IP-Adapter FaceID.

Extracts 512-dim ArcFace face recognition embeddings from reference images.
Uses ONNX Runtime with CoreML Execution Provider on Apple Silicon for
hardware-accelerated inference (Neural Engine).
"""

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# InsightFace model for face detection + embedding
INSIGHTFACE_MODEL = "buffalo_l"


def is_available() -> bool:
    """Check if InsightFace + ONNX Runtime are installed."""
    try:
        import importlib.util
        return (
            importlib.util.find_spec("insightface") is not None
            and importlib.util.find_spec("onnxruntime") is not None
        )
    except Exception:
        return False


class FaceEmbeddingExtractor:
    """Extract ArcFace face embeddings from images using InsightFace.

    The buffalo_l model auto-downloads on first use (~300MB). On Apple Silicon,
    ONNX Runtime uses CoreML EP for Neural Engine acceleration.
    """

    def __init__(self) -> None:
        import insightface
        import onnxruntime

        # Validate InsightFace model cache — detect corrupt/partial downloads
        self._validate_model_cache()

        # Select execution providers — prefer CoreML on macOS for ANE acceleration
        available_eps = onnxruntime.get_available_providers()
        providers = []
        if "CoreMLExecutionProvider" in available_eps:
            providers.append("CoreMLExecutionProvider")
        providers.append("CPUExecutionProvider")

        logger.info(
            "Initializing InsightFace (model=%s, providers=%s)",
            INSIGHTFACE_MODEL, providers,
        )

        self._app = insightface.app.FaceAnalysis(
            name=INSIGHTFACE_MODEL,
            providers=providers,
        )
        # det_size controls detection resolution — 640 is default, good balance
        self._app.prepare(ctx_id=0, det_size=(640, 640))
        logger.info("InsightFace ready")

    @staticmethod
    def _validate_model_cache() -> None:
        """Remove corrupt/partial InsightFace model downloads so they re-download."""
        import zipfile
        model_dir = Path.home() / ".insightface" / "models"
        zip_path = model_dir / f"{INSIGHTFACE_MODEL}.zip"
        extracted_dir = model_dir / INSIGHTFACE_MODEL

        if zip_path.exists() and not extracted_dir.exists():
            # Zip exists but wasn't extracted — check if it's valid
            try:
                with zipfile.ZipFile(zip_path) as z:
                    z.testzip()  # returns None if ok, else name of first bad file
            except (zipfile.BadZipFile, Exception) as e:
                logger.warning("Removing corrupt InsightFace download (%s): %s", zip_path, e)
                zip_path.unlink(missing_ok=True)

    def extract_face_embedding(self, image_path: str) -> np.ndarray:
        """Extract a 512-dim ArcFace embedding from a single image.

        Args:
            image_path: Path to an image file containing a face.

        Returns:
            Normalized 512-dim float32 numpy array.

        Raises:
            ValueError: If no face is detected in the image.
        """
        import cv2

        path = Path(image_path)
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        # InsightFace expects BGR numpy array (OpenCV format)
        img = cv2.imread(str(path))
        if img is None:
            raise ValueError(f"Failed to read image: {image_path}")

        faces = self._app.get(img)
        if not faces:
            raise ValueError(
                f"No face detected in {path.name}. "
                "Ensure the image contains a clearly visible face."
            )

        # Use the largest face (closest to camera / most prominent)
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        embedding = face.normed_embedding  # Already L2-normalized, 512-dim

        logger.debug(
            "Extracted face embedding from %s (faces_found=%d, embedding_shape=%s)",
            path.name, len(faces), embedding.shape,
        )
        return embedding

    def extract_face_embeddings(self, image_paths: list[str]) -> list[np.ndarray]:
        """Extract face embeddings from multiple images.

        Images without detectable faces are skipped with a warning.

        Args:
            image_paths: List of image file paths.

        Returns:
            List of 512-dim embeddings (may be shorter than input if faces missing).

        Raises:
            ValueError: If no faces are detected in any of the images.
        """
        embeddings = []
        for path in image_paths:
            try:
                emb = self.extract_face_embedding(path)
                embeddings.append(emb)
            except (ValueError, FileNotFoundError) as e:
                logger.warning("Skipping %s: %s", path, e)

        if not embeddings:
            raise ValueError(
                "No faces detected in any of the provided reference images. "
                "Ensure at least one image contains a clearly visible face."
            )

        logger.info(
            "Extracted %d face embedding(s) from %d image(s)",
            len(embeddings), len(image_paths),
        )
        return embeddings

    def compute_average_embedding(self, image_paths: list[str]) -> np.ndarray:
        """Extract and average face embeddings from multiple reference images.

        Averaging multiple face photos of the same person produces a more
        robust identity representation than any single image.

        Returns:
            Normalized 512-dim average embedding.
        """
        embeddings = self.extract_face_embeddings(image_paths)
        avg = np.mean(embeddings, axis=0)
        # Re-normalize after averaging
        avg = avg / np.linalg.norm(avg)
        logger.debug("Computed average embedding from %d images", len(embeddings))
        return avg
