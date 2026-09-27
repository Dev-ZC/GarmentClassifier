from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TAGGING_PENDING, Image
from app.schemas import ImageOut, ImagePositionUpdate, ImageSizeUpdate, ImageTagsUpdate
from app.serializers import image_to_out
from app.storage import UnsupportedImageType, delete_image_file, hash_bytes, save_upload
from app.tagging import process_image

router = APIRouter(prefix="/api/images", tags=["images"])


@router.get("", response_model=list[ImageOut])
def list_images(db: Session = Depends(get_db)) -> list[ImageOut]:
    # Swatches live in their own bank - see GET /api/swatches.
    images = (
        db.query(Image)
        .filter(Image.is_swatch.is_(False))
        .order_by(Image.created_at)
        .all()
    )
    return [image_to_out(image) for image in images]


@router.post("", response_model=ImageOut, status_code=201)
async def upload_image(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    x: float = Form(0.0),
    y: float = Form(0.0),
    db: Session = Depends(get_db),
) -> ImageOut:
    contents = await file.read()
    content_hash = hash_bytes(contents)

    # An identical file already in the library (e.g. the same photo
    # dragged in twice) reuses that image - already tagged, with its
    # detail crops - instead of creating a duplicate and re-tagging it.
    existing = (
        db.query(Image)
        .filter(
            Image.content_hash == content_hash,
            Image.parent_id.is_(None),
            Image.is_swatch.is_(False),
        )
        .first()
    )
    if existing is not None:
        return image_to_out(existing)

    try:
        stored_filename, width, height = save_upload(file, contents)
    except UnsupportedImageType as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    image = Image(
        original_filename=file.filename or stored_filename,
        stored_filename=stored_filename,
        content_type=file.content_type or "application/octet-stream",
        content_hash=content_hash,
        width=width,
        height=height,
        x=x,
        y=y,
        tagging_status=TAGGING_PENDING,
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    # Color extraction, CLIP embedding, and VLM attribute tagging all run
    # locally in the background so the upload response returns instantly.
    background_tasks.add_task(process_image, image.id)

    return image_to_out(image)


@router.patch("/{image_id}/position", response_model=ImageOut)
def update_position(
    image_id: str, payload: ImagePositionUpdate, db: Session = Depends(get_db)
) -> ImageOut:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    image.x = payload.x
    image.y = payload.y
    db.commit()
    db.refresh(image)
    return image_to_out(image)


@router.patch("/{image_id}/size", response_model=ImageOut)
def update_size(
    image_id: str, payload: ImageSizeUpdate, db: Session = Depends(get_db)
) -> ImageOut:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    image.width = max(20, payload.width)
    image.height = max(20, payload.height)
    db.commit()
    db.refresh(image)
    return image_to_out(image)


@router.patch("/{image_id}/tags", response_model=ImageOut)
def update_tags(
    image_id: str, payload: ImageTagsUpdate, db: Session = Depends(get_db)
) -> ImageOut:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    image.tags = ",".join(tag.strip() for tag in payload.tags if tag.strip())
    db.commit()
    db.refresh(image)
    return image_to_out(image)


@router.post("/{image_id}/retag", response_model=ImageOut)
def retag_image(
    image_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
) -> ImageOut:
    """Re-run the local tagging pipeline, e.g. after starting Ollama or
    fixing a failed run."""
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    image.tagging_status = TAGGING_PENDING
    image.tagging_error = None
    db.commit()
    db.refresh(image)
    background_tasks.add_task(process_image, image.id)
    return image_to_out(image)


@router.delete("/{image_id}", status_code=204)
def delete_image(image_id: str, db: Session = Depends(get_db)) -> None:
    image = db.get(Image, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found")
    # Cascade delete-orphan removes the detail rows too - their files
    # aren't covered by that, so clean them up here first.
    for detail in image.details:
        delete_image_file(detail.stored_filename)
    delete_image_file(image.stored_filename)
    db.delete(image)
    db.commit()
