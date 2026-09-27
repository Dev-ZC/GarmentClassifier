"""The fabric swatch bank: swatches are regular Image rows flagged
is_swatch, sourced three ways - explicit uploads here, uploads the VLM
classifies as "fabric_swatch" wholesale, and fabric regions cropped out
of a parent image during tagging.

Everything image-adjacent (color analysis, CLIP embeddings, board
placements, retag/delete by id) reuses the normal image machinery; only
listing/upload/search/facets are routed separately so swatches never
leak into the main image results.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TAGGING_PENDING, Image
from app.routers.facets import build_facets
from app.routers.search import rank_images
from app.schemas import FacetsResponse, ImageOut, SearchRequest, SearchResult
from app.serializers import image_to_out
from app.storage import UnsupportedImageType, hash_bytes, save_upload
from app.tagging import process_image

router = APIRouter(prefix="/api/swatches", tags=["swatches"])


@router.get("", response_model=list[ImageOut])
def list_swatches(db: Session = Depends(get_db)) -> list[ImageOut]:
    swatches = (
        db.query(Image)
        .filter(Image.is_swatch.is_(True))
        .order_by(Image.created_at.desc())
        .all()
    )
    return [image_to_out(swatch) for swatch in swatches]


@router.post("", response_model=ImageOut, status_code=201)
async def upload_swatch(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    db: Session = Depends(get_db),
) -> ImageOut:
    """Upload a fabric swatch straight into the bank. Runs the same
    tagging pipeline as regular images - the VLM fills in fabric +
    suitable_for for swatch-typed images."""
    contents = await file.read()
    content_hash = hash_bytes(contents)

    existing = (
        db.query(Image)
        .filter(
            Image.content_hash == content_hash,
            Image.parent_id.is_(None),
            Image.is_swatch.is_(True),
        )
        .first()
    )
    if existing is not None:
        return image_to_out(existing)

    try:
        stored_filename, width, height = save_upload(file, contents)
    except UnsupportedImageType as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    swatch = Image(
        original_filename=file.filename or stored_filename,
        stored_filename=stored_filename,
        content_type=file.content_type or "application/octet-stream",
        content_hash=content_hash,
        width=width,
        height=height,
        is_swatch=True,
        tagging_status=TAGGING_PENDING,
    )
    db.add(swatch)
    db.commit()
    db.refresh(swatch)

    background_tasks.add_task(process_image, swatch.id)
    return image_to_out(swatch)


@router.post("/search", response_model=list[SearchResult])
def search_swatches(
    payload: SearchRequest, db: Session = Depends(get_db)
) -> list[SearchResult]:
    """Same hybrid ranking as the main image search, scoped to the bank."""
    swatches = db.query(Image).filter(Image.is_swatch.is_(True)).all()
    return rank_images(swatches, payload)


@router.get("/facets", response_model=FacetsResponse)
def swatch_facets(db: Session = Depends(get_db)) -> FacetsResponse:
    swatches = db.query(Image).filter(Image.is_swatch.is_(True)).all()
    return build_facets(swatches)
