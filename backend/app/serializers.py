from app.models import Board, BoardImage, Image
from app.schemas import BoardImageOut, BoardOut, ImageOut

BOARD_PREVIEW_COUNT = 4


def image_to_out(image: Image) -> ImageOut:
    tags = [tag for tag in image.tags.split(",") if tag] if image.tags else []
    return ImageOut(
        id=image.id,
        original_filename=image.original_filename,
        content_type=image.content_type,
        width=image.width,
        height=image.height,
        x=image.x,
        y=image.y,
        tags=tags,
        created_at=image.created_at,
        url=f"/media/{image.stored_filename}",
        tagging_status=image.tagging_status,
        tagging_error=image.tagging_error,
        dominant_colors=image.dominant_colors or [],
        image_type=image.image_type,
        garments=image.garments or [],
        pattern=image.pattern,
        fabric=image.fabric,
        style_tags=image.style_tags or [],
        description=image.description,
        is_swatch=bool(image.is_swatch),
        suitable_for=image.suitable_for or [],
        board_ids=[placement.board_id for placement in image.placements],
        parent_id=image.parent_id,
        details=[image_to_out(detail) for detail in image.details],
    )


def board_to_out(board: Board) -> BoardOut:
    return BoardOut(
        id=board.id,
        name=board.name,
        created_at=board.created_at,
        image_count=len(board.placements),
        preview_urls=[
            f"/media/{placement.image.stored_filename}"
            for placement in board.placements[:BOARD_PREVIEW_COUNT]
        ],
    )


def placement_to_out(placement: BoardImage) -> BoardImageOut:
    return BoardImageOut(
        image=image_to_out(placement.image),
        x=placement.x,
        y=placement.y,
        note=placement.note or "",
        info_open=placement.info_open or False,
    )
