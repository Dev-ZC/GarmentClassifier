"""Background pipeline that runs after an image is uploaded (or retagged):
local color analysis, a local CLIP embedding, and local VLM attribute
extraction. All three run on-device - nothing is uploaded anywhere.

Each stage is independent, so a slow/unavailable Ollama server only fails
the attribute step, not color/embedding search.

Detail crops (sub-regions the VLM flagged on a parent image) run the same
pipeline minus the VLM pass: their region label already serves as their
description/tag, and crops never spawn crops of their own.
"""

import logging
import threading
from pathlib import Path

from sqlalchemy.orm import Session

from app.color import extract_dominant_colors
from app.config import TAGGING_IMAGE_MAX_PX
from app.database import SessionLocal
from app.embeddings import embed_image, vector_to_bytes
from app.models import (
    TAGGING_DONE,
    TAGGING_FAILED,
    TAGGING_PENDING,
    TAGGING_PROCESSING,
    Image,
)
from app.storage import downscaled_copy, image_path, save_detail_crops
from app.vlm import VLMUnavailableError, analyze_image

logger = logging.getLogger(__name__)

# One image at a time through the pipeline. Each stage keeps heavyweight
# objects resident (CLIP on MPS, the Ollama VLM, decoded pixels), so two
# uploads processing in parallel would double the peak footprint.
_pipeline_lock = threading.Lock()


def _create_detail_images(
    db: Session, image: Image, path: Path, regions: list[dict]
) -> list[str]:
    """Persist VLM-marked regions as standalone library images linked via
    parent_id. The region label doubles as description and style tag so
    text search ("white lacing", "black boot") hits them without a VLM
    pass of their own - colors and the CLIP embedding fill in the rest.

    Regions the VLM flagged as fabric (is_fabric) are additionally filed
    in the swatch bank: is_swatch=True keeps them out of the main image
    search and routes them to swatch search instead, with the material
    name and garment uses the model attached to the region."""
    ids: list[str] = []
    for crop in save_detail_crops(path, regions):
        is_fabric = crop["is_fabric"]
        detail = Image(
            original_filename=f"{image.original_filename} - {crop['label']}",
            stored_filename=crop["filename"],
            content_type="image/png",
            width=crop["width"],
            height=crop["height"],
            parent_id=image.id,
            style_tags=[crop["label"]],
            description=crop["label"],
            is_swatch=is_fabric,
            fabric=crop["fabric"] or (image.fabric if is_fabric else None),
            suitable_for=crop["suitable_for"] if is_fabric else [],
            tagging_status=TAGGING_PENDING,
        )
        db.add(detail)
        db.flush()
        ids.append(detail.id)
    return ids


def process_image(image_id: str) -> None:
    detail_ids: list[str] = []
    with _pipeline_lock:
        db = SessionLocal()
        try:
            image = db.get(Image, image_id)
            if image is None:
                return

            image.tagging_status = TAGGING_PROCESSING
            db.commit()

            path = image_path(image.stored_filename)
            # Color/CLIP/VLM all work fine on a capped-size copy, and the
            # VLM's vision-token count scales with pixels - this is what
            # keeps peak memory bounded on high-res photos. If the copy
            # can't be made, process the original rather than wedging.
            try:
                work_path = downscaled_copy(path, TAGGING_IMAGE_MAX_PX)
            except Exception:  # noqa: BLE001
                logger.warning("Downscale failed for %s - using original", image_id)
                work_path = path
            errors: list[str] = []

            try:
                try:
                    image.dominant_colors = extract_dominant_colors(work_path)
                except Exception as exc:  # noqa: BLE001 - keep the pipeline going
                    logger.warning("Color extraction failed for %s: %s", image_id, exc)
                    errors.append(f"color extraction: {exc}")

                try:
                    image.embedding = vector_to_bytes(embed_image(work_path))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Embedding failed for %s: %s", image_id, exc)
                    errors.append(f"embedding: {exc}")

                # The VLM pass only runs on top-level images. If it returns
                # detail regions and none were cropped yet (a retag doesn't
                # recreate them - existing crops may have been curated by
                # hand), spawn them now. Crops cut from the ORIGINAL file
                # so they keep full resolution.
                if image.parent_id is None:
                    try:
                        attrs = analyze_image(work_path)
                        image.image_type = attrs["image_type"]
                        image.garments = attrs["garments"]
                        image.pattern = attrs["pattern"]
                        image.fabric = attrs["fabric"]
                        image.suitable_for = attrs["suitable_for"]
                        image.style_tags = attrs["style_tags"]
                        image.description = attrs["description"]

                        # A regular upload that turns out to be a fabric
                        # swatch wholesale joins the swatch bank itself.
                        if attrs["image_type"] == "fabric_swatch":
                            image.is_swatch = True

                        regions = attrs.get("details") or []
                        # Retags don't recreate crops of a kind that
                        # already exists (existing crops may have been
                        # curated by hand) - but each kind is tracked
                        # separately, so a retag can still add the fabric
                        # swatch an earlier run missed even when display
                        # details are already present.
                        if regions and not image.is_swatch:
                            has_display = any(
                                not d.is_swatch for d in image.details
                            )
                            has_swatch = any(d.is_swatch for d in image.details)
                            wanted = [
                                region
                                for region in regions
                                if (region.get("is_fabric") and not has_swatch)
                                or (not region.get("is_fabric") and not has_display)
                            ]
                            if wanted:
                                try:
                                    detail_ids = _create_detail_images(
                                        db, image, path, wanted
                                    )
                                except Exception as exc:  # noqa: BLE001
                                    logger.warning(
                                        "Detail crops failed for %s: %s",
                                        image_id,
                                        exc,
                                    )
                    except VLMUnavailableError as exc:
                        logger.warning(
                            "VLM attribute extraction failed for %s: %s", image_id, exc
                        )
                        errors.append(f"attribute analysis: {exc}")
            finally:
                if work_path != path:
                    work_path.unlink(missing_ok=True)

            image.tagging_status = TAGGING_FAILED if errors else TAGGING_DONE
            image.tagging_error = "; ".join(errors) if errors else None
            db.commit()
        finally:
            db.close()

    # Crops process after the parent finishes - sequentially, so a batch
    # of uploads doesn't pile multiple taggings onto the machine at once.
    for detail_id in detail_ids:
        process_image(detail_id)


def recover_stuck_images() -> None:
    """Images left in pending/processing from a previous run - the
    background task was killed by a crash or a dev-server reload before
    it finished - stay stuck forever: nothing is actually processing
    them anymore, so their card spins indefinitely with no data. Nothing
    can genuinely be mid-pipeline the moment the process boots, so it's
    safe to re-queue all of them once at startup."""
    db = SessionLocal()
    try:
        stuck_ids = [
            image.id
            for image in db.query(Image)
            .filter(Image.tagging_status.in_([TAGGING_PENDING, TAGGING_PROCESSING]))
            .all()
        ]
    finally:
        db.close()

    for image_id in stuck_ids:
        logger.info("Re-queuing stuck tagging job for %s", image_id)
        threading.Thread(target=process_image, args=(image_id,), daemon=True).start()
