"""Board CRUD plus placement management - which images sit on a board and
where. Images themselves live in the shared library, so deleting a board
(or removing a placement) never deletes the underlying image."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Board, BoardElement, BoardImage, BoardNote, Image
from app.schemas import (
    BoardAddImages,
    BoardCreate,
    BoardElementCreate,
    BoardElementOut,
    BoardElementUpdate,
    BoardImageOut,
    BoardNoteCreate,
    BoardNoteOut,
    BoardNoteUpdate,
    BoardOut,
    BoardUpdate,
    ImagePositionUpdate,
    PlacementDetailsUpdate,
)
from app.serializers import board_to_out, placement_to_out

router = APIRouter(prefix="/api/boards", tags=["boards"])

# Stagger between items placed by one "add" so they don't stack exactly.
DROP_STAGGER = 24.0


def _get_board(db: Session, board_id: str) -> Board:
    board = db.get(Board, board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


def _get_placement(db: Session, board_id: str, image_id: str) -> BoardImage:
    placement = db.get(BoardImage, (board_id, image_id))
    if placement is None:
        raise HTTPException(status_code=404, detail="Image is not on this board")
    return placement


def _get_note(db: Session, board_id: str, note_id: str) -> BoardNote:
    note = db.get(BoardNote, note_id)
    if note is None or note.board_id != board_id:
        raise HTTPException(status_code=404, detail="Note is not on this board")
    return note


def _get_element(db: Session, board_id: str, element_id: str) -> BoardElement:
    element = db.get(BoardElement, element_id)
    if element is None or element.board_id != board_id:
        raise HTTPException(status_code=404, detail="Element is not on this board")
    return element


@router.get("", response_model=list[BoardOut])
def list_boards(db: Session = Depends(get_db)) -> list[BoardOut]:
    boards = db.query(Board).order_by(Board.created_at).all()
    return [board_to_out(board) for board in boards]


@router.post("", response_model=BoardOut, status_code=201)
def create_board(payload: BoardCreate, db: Session = Depends(get_db)) -> BoardOut:
    board = Board(name=payload.name.strip() or "Untitled Board")
    db.add(board)
    db.commit()
    db.refresh(board)
    return board_to_out(board)


@router.patch("/{board_id}", response_model=BoardOut)
def rename_board(
    board_id: str, payload: BoardUpdate, db: Session = Depends(get_db)
) -> BoardOut:
    board = _get_board(db, board_id)
    board.name = payload.name.strip() or "Untitled Board"
    db.commit()
    db.refresh(board)
    return board_to_out(board)


@router.delete("/{board_id}", status_code=204)
def delete_board(board_id: str, db: Session = Depends(get_db)) -> None:
    board = _get_board(db, board_id)
    db.delete(board)
    db.commit()


@router.get("/{board_id}/images", response_model=list[BoardImageOut])
def list_board_images(board_id: str, db: Session = Depends(get_db)) -> list[BoardImageOut]:
    board = _get_board(db, board_id)
    return [placement_to_out(placement) for placement in board.placements]


@router.post("/{board_id}/images", response_model=list[BoardImageOut], status_code=201)
def add_images_to_board(
    board_id: str, payload: BoardAddImages, db: Session = Depends(get_db)
) -> list[BoardImageOut]:
    board = _get_board(db, board_id)
    existing_ids = {placement.image_id for placement in board.placements}

    placed: list[BoardImage] = []
    offset_index = 0
    for image_id in payload.image_ids:
        if image_id in existing_ids:
            continue
        image = db.get(Image, image_id)
        if image is None:
            continue
        placement = BoardImage(
            board_id=board.id,
            image_id=image.id,
            x=payload.x + offset_index * DROP_STAGGER,
            y=payload.y + offset_index * DROP_STAGGER,
        )
        db.add(placement)
        placed.append(placement)
        existing_ids.add(image_id)
        offset_index += 1

    db.commit()
    return [placement_to_out(placement) for placement in placed]


@router.patch("/{board_id}/images/{image_id}/position", response_model=BoardImageOut)
def update_placement_position(
    board_id: str,
    image_id: str,
    payload: ImagePositionUpdate,
    db: Session = Depends(get_db),
) -> BoardImageOut:
    placement = _get_placement(db, board_id, image_id)
    placement.x = payload.x
    placement.y = payload.y
    db.commit()
    db.refresh(placement)
    return placement_to_out(placement)


@router.patch("/{board_id}/images/{image_id}/details", response_model=BoardImageOut)
def update_placement_details(
    board_id: str,
    image_id: str,
    payload: PlacementDetailsUpdate,
    db: Session = Depends(get_db),
) -> BoardImageOut:
    """Per-placement extras: the user's note on this image and whether
    the card's side info panel is open."""
    placement = _get_placement(db, board_id, image_id)
    if payload.note is not None:
        placement.note = payload.note
    if payload.info_open is not None:
        placement.info_open = payload.info_open
    db.commit()
    db.refresh(placement)
    return placement_to_out(placement)


@router.delete("/{board_id}/images/{image_id}", status_code=204)
def remove_from_board(
    board_id: str, image_id: str, db: Session = Depends(get_db)
) -> None:
    placement = _get_placement(db, board_id, image_id)
    db.delete(placement)
    db.commit()


@router.get("/{board_id}/notes", response_model=list[BoardNoteOut])
def list_board_notes(board_id: str, db: Session = Depends(get_db)) -> list[BoardNoteOut]:
    board = _get_board(db, board_id)
    return [BoardNoteOut.model_validate(note) for note in board.notes]


@router.post("/{board_id}/notes", response_model=BoardNoteOut, status_code=201)
def create_board_note(
    board_id: str, payload: BoardNoteCreate, db: Session = Depends(get_db)
) -> BoardNoteOut:
    board = _get_board(db, board_id)
    note = BoardNote(
        board_id=board.id,
        title=payload.title,
        text=payload.text,
        color=payload.color,
        x=payload.x,
        y=payload.y,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return BoardNoteOut.model_validate(note)


@router.patch("/{board_id}/notes/{note_id}", response_model=BoardNoteOut)
def update_board_note(
    board_id: str,
    note_id: str,
    payload: BoardNoteUpdate,
    db: Session = Depends(get_db),
) -> BoardNoteOut:
    note = _get_note(db, board_id, note_id)
    # Only touch fields the client actually sent (model_dump recursively
    # turns nested ChecklistItem models into plain dicts for the JSON column).
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return BoardNoteOut.model_validate(note)


@router.delete("/{board_id}/notes/{note_id}", status_code=204)
def delete_board_note(board_id: str, note_id: str, db: Session = Depends(get_db)) -> None:
    note = _get_note(db, board_id, note_id)
    db.delete(note)
    db.commit()


# ---- Floating elements: text labels and simple shapes ----

ELEMENT_KINDS = {"text", "rect", "ellipse", "arrow"}
# Per-kind default box size when an element is dropped on the canvas.
ELEMENT_DEFAULT_SIZES = {
    "text": (480.0, 120.0),
    "rect": (420.0, 280.0),
    "ellipse": (320.0, 320.0),
    "arrow": (360.0, 160.0),
}


@router.get("/{board_id}/elements", response_model=list[BoardElementOut])
def list_board_elements(board_id: str, db: Session = Depends(get_db)) -> list[BoardElementOut]:
    board = _get_board(db, board_id)
    return [BoardElementOut.model_validate(element) for element in board.elements]


@router.post("/{board_id}/elements", response_model=BoardElementOut, status_code=201)
def create_board_element(
    board_id: str, payload: BoardElementCreate, db: Session = Depends(get_db)
) -> BoardElementOut:
    board = _get_board(db, board_id)
    if payload.kind not in ELEMENT_KINDS:
        raise HTTPException(status_code=422, detail=f"Unknown element kind: {payload.kind}")
    width, height = ELEMENT_DEFAULT_SIZES[payload.kind]
    element = BoardElement(
        board_id=board.id, kind=payload.kind, x=payload.x, y=payload.y,
        width=width, height=height,
    )
    db.add(element)
    db.commit()
    db.refresh(element)
    return BoardElementOut.model_validate(element)


@router.patch("/{board_id}/elements/{element_id}", response_model=BoardElementOut)
def update_board_element(
    board_id: str,
    element_id: str,
    payload: BoardElementUpdate,
    db: Session = Depends(get_db),
) -> BoardElementOut:
    element = _get_element(db, board_id, element_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(element, field, value)
    db.commit()
    db.refresh(element)
    return BoardElementOut.model_validate(element)


@router.delete("/{board_id}/elements/{element_id}", status_code=204)
def delete_board_element(
    board_id: str, element_id: str, db: Session = Depends(get_db)
) -> None:
    element = _get_element(db, board_id, element_id)
    db.delete(element)
    db.commit()
