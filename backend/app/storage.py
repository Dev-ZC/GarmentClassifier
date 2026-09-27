"""Helpers for persisting uploaded image files to disk."""

import hashlib
import tempfile
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image as PILImage

from app.config import ALLOWED_IMAGE_TYPES, IMAGES_DIR


class UnsupportedImageType(Exception):
    pass


def hash_bytes(contents: bytes) -> str:
    """Content hash used to dedupe uploads - an identical file re-added
    (e.g. dragged in twice) reuses the existing library entry instead of
    creating a new row and re-running the tagging pipeline on a copy."""
    return hashlib.sha256(contents).hexdigest()


def save_upload(upload: UploadFile, contents: bytes) -> tuple[str, int, int]:
    """Save an uploaded image to disk and return (stored_filename, width, height)."""
    extension = ALLOWED_IMAGE_TYPES.get(upload.content_type or "")
    if extension is None:
        raise UnsupportedImageType(f"Unsupported content type: {upload.content_type}")

    stored_filename = f"{uuid.uuid4()}{extension}"
    destination = IMAGES_DIR / stored_filename
    destination.write_bytes(contents)

    with PILImage.open(destination) as img:
        width, height = img.size

    return stored_filename, width, height


def image_path(stored_filename: str) -> Path:
    return IMAGES_DIR / stored_filename


def delete_image_file(stored_filename: str) -> None:
    path = image_path(stored_filename)
    if path.exists():
        path.unlink()


def downscaled_copy(source: Path, max_side: int) -> Path:
    """A capped-size working copy of a stored image for the tagging
    pipeline. Callers delete it themselves once the stages are done."""
    with PILImage.open(source) as img:
        img.load()
        if max(img.size) <= max_side:
            return source
        img.thumbnail((max_side, max_side), PILImage.LANCZOS)
        tmp = tempfile.NamedTemporaryFile(
            suffix=".png", prefix="gc-tag-", delete=False
        )
        tmp.close()
        img.convert("RGB").save(tmp.name)
    return Path(tmp.name)


def save_detail_crops(source: Path, regions: list[dict]) -> list[dict]:
    """Cut the labelled sub-regions (normalized [x1, y1, x2, y2] boxes) the
    VLM marked out of a stored image and save each as its own PNG file.
    Boxes get a small padding margin - model coordinates tend to hug the
    detail too tightly to look right uncropped. Padding is capped in
    absolute terms so a large box can't inflate back into a full-frame
    copy, and any crop that still spans ~the whole source is skipped."""
    crops: list[dict] = []
    padding = 0.12
    with PILImage.open(source) as img:
        img.load()
        width, height = img.size
        for region in regions:
            x1, y1, x2, y2 = region["box"]
            pad_x = min((x2 - x1) * padding, 0.04)
            pad_y = min((y2 - y1) * padding, 0.04)
            left = max(0, int((x1 - pad_x) * width))
            top = max(0, int((y1 - pad_y) * height))
            right = min(width, int((x2 + pad_x) * width))
            bottom = min(height, int((y2 + pad_y) * height))
            if right - left < 8 or bottom - top < 8:
                continue
            if right - left >= width * 0.92 and bottom - top >= height * 0.92:
                continue
            stored_filename = f"{uuid.uuid4()}.png"
            img.crop((left, top, right, bottom)).save(IMAGES_DIR / stored_filename)
            crops.append(
                {
                    "filename": stored_filename,
                    "label": region["label"],
                    "width": right - left,
                    "height": bottom - top,
                    # Fabric regions carry swatch metadata through so the
                    # caller can file the crop in the swatch bank.
                    "is_fabric": region.get("is_fabric") or False,
                    "fabric": region.get("fabric"),
                    "suitable_for": region.get("suitable_for") or [],
                }
            )
    return crops
