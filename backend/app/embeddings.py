"""Local CLIP embeddings for semantic ("similar vibe") search.

The model is loaded lazily and cached as a module-level singleton since
it's ~600MB and shouldn't be reloaded per request/background task.
"""

import os
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image as PILImage

from app.config import CLIP_MODEL_NAME

_lock = threading.Lock()
_model = None
_processor = None


def _get_model():
    global _model, _processor
    if _model is None:
        with _lock:
            if _model is None:
                # Once the weights are cached, `from_pretrained` still hits
                # the HF Hub to check for updated files/commits unless told
                # not to (hence the "unauthenticated requests" warning and
                # extra latency). Everything here runs locally, so force
                # offline mode after the first successful download.
                # HF_HUB_OFFLINE is read once at import time by
                # huggingface_hub, so this must happen before it (or
                # transformers) gets imported anywhere in the process.
                # `setdefault` still lets a real first-time download happen
                # if the caller explicitly sets HF_HUB_OFFLINE=0.
                os.environ.setdefault("HF_HUB_OFFLINE", "1")

                # Imported lazily: torch/transformers are heavy and only
                # needed once tagging actually runs.
                import torch
                from transformers import CLIPModel, CLIPProcessor

                device = "mps" if torch.backends.mps.is_available() else "cpu"
                try:
                    model = CLIPModel.from_pretrained(CLIP_MODEL_NAME)
                    processor = CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)
                except OSError as exc:
                    raise RuntimeError(
                        f"CLIP model '{CLIP_MODEL_NAME}' isn't cached locally and "
                        "the app runs in offline mode (HF_HUB_OFFLINE=1). Run once "
                        "with `HF_HUB_OFFLINE=0` (and network access) to download "
                        "it, then restart normally."
                    ) from exc

                _model, _processor = model.to(device).eval(), processor
    return _model, _processor


def embed_image(image_path: Path) -> np.ndarray:
    import torch

    model, processor = _get_model()
    with PILImage.open(image_path) as img:
        inputs = processor(images=img.convert("RGB"), return_tensors="pt").to(model.device)
    with torch.no_grad():
        features = model.get_image_features(**inputs).pooler_output
    # Return MPS cached buffers to the OS between images - on unified
    # memory they otherwise sit resident alongside the VLM's footprint.
    if model.device.type == "mps":
        torch.mps.empty_cache()
    return _normalize(features.cpu().numpy()[0])


@lru_cache(maxsize=64)
def embed_text(query: str) -> np.ndarray:
    import torch

    model, processor = _get_model()
    inputs = processor(text=[query], return_tensors="pt", padding=True).to(model.device)
    with torch.no_grad():
        features = model.get_text_features(**inputs).pooler_output
    return _normalize(features.cpu().numpy()[0])


def _normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def vector_to_bytes(vec: np.ndarray) -> bytes:
    return vec.astype(np.float32).tobytes()


def bytes_to_vector(data: bytes) -> np.ndarray:
    return np.frombuffer(data, dtype=np.float32)
