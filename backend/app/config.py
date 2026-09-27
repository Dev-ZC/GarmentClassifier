"""Application-wide configuration and paths.

All persisted data (the SQLite database and ingested image files) lives
under `backend/data/` so it stays out of source control and can later be
pointed at an OS-specific app-data directory without touching the rest of
the app.
"""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
IMAGES_DIR = DATA_DIR / "images"
DATABASE_PATH = DATA_DIR / "app.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

DATA_DIR.mkdir(parents=True, exist_ok=True)
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}

# Local vision-language model (via Ollama) used to extract structured
# garment/image attributes at ingest time. The 3b default is the
# memory/quality sweet spot for 16GB machines (~2.5GB resident vs ~6GB
# for 7b) - bump it via env var if you have headroom, or point
# OLLAMA_HOST at a remote Ollama machine for the bigger models.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_VISION_MODEL = os.environ.get("OLLAMA_VISION_MODEL", "qwen2.5vl:3b")

# How long Ollama keeps the VLM resident after a tagging call. Short so
# its multi-GB footprint frees quickly once a batch of uploads finishes.
OLLAMA_KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "2m")

# Tagging works on a downscaled copy of each upload: color and CLIP are
# resolution-insensitive, and Qwen2.5-VL's vision tokens scale with input
# pixels - capping the working copy is the main lever on peak memory.
TAGGING_IMAGE_MAX_PX = int(os.environ.get("TAGGING_IMAGE_MAX_PX", "1024"))

# Local CLIP model used for semantic ("similar vibe") embedding search.
CLIP_MODEL_NAME = os.environ.get("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")

# Number of dominant colors extracted per image for color-proximity search.
DOMINANT_COLOR_COUNT = 5

# Detail crops (interesting sub-regions the VLM marks on an uploaded
# image). The model returns as many as are genuinely distinct - none at
# all is valid - but processing is capped so one busy photo can't blow
# up the tagging queue. Boxes smaller than this fraction of either image
# dimension are dropped as noise.
MAX_DETAIL_CROPS = 5
MIN_DETAIL_FRACTION = 0.03
# A "detail" that spans nearly the whole image isn't a detail - boxes
# wider/taller than this fraction of the frame, or covering more than
# MAX_DETAIL_AREA of it, are dropped instead of producing redundant
# full-size crops.
MAX_DETAIL_SIDE = 0.9
MAX_DETAIL_AREA = 0.5
# Fabric regions get a looser cap: their crops go to the swatch bank,
# not the bento cluster, and a fabric can legitimately span most of a
# garment ("plaid wool sweater filling the frame").
MAX_FABRIC_DETAIL_SIDE = 0.95
MAX_FABRIC_DETAIL_AREA = 0.75
