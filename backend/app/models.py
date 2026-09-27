import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Lifecycle of the local tagging pipeline (color extraction + CLIP
# embedding + VLM attribute analysis) that runs after upload.
TAGGING_PENDING = "pending"
TAGGING_PROCESSING = "processing"
TAGGING_DONE = "done"
TAGGING_FAILED = "failed"


class Image(Base):
    """A single image placed on the infinite canvas board."""

    __tablename__ = "images"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    stored_filename: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    # SHA-256 of the uploaded bytes - lets uploads dedupe against an
    # identical file already in the library instead of re-tagging a copy.
    content_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    width: Mapped[int] = mapped_column(default=0)
    height: Mapped[int] = mapped_column(default=0)

    # Legacy canvas position - superseded by BoardImage.x/y, kept only so
    # the one-time migration in init_db can place pre-boards images onto
    # their first board.
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)

    # Comma-separated free-form tags a user adds manually.
    tags: Mapped[str] = mapped_column(String, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # --- Local tagging pipeline output (see app/tagging.py) ---
    tagging_status: Mapped[str] = mapped_column(String, default=TAGGING_PENDING)
    tagging_error: Mapped[str | None] = mapped_column(String, nullable=True)

    # Deterministic pixel-based color analysis (app/color.py).
    dominant_colors: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Structured attributes from the local VLM (app/vlm.py). "image_type"
    # tells the rest of the app how to interpret the other fields: a
    # single garment or outfit fills "garments" (one entry per distinct
    # piece); a fabric swatch or pattern/other photo instead fills the
    # top-level "pattern"/"fabric" since there's no single garment shape.
    image_type: Mapped[str | None] = mapped_column(String, nullable=True)
    garments: Mapped[list | None] = mapped_column(JSON, nullable=True)
    pattern: Mapped[str | None] = mapped_column(String, nullable=True)
    fabric: Mapped[str | None] = mapped_column(String, nullable=True)
    style_tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)

    # Fabric swatch bank. A swatch is still a regular library image (own
    # colors/embedding/placements) but lives in a separate list: excluded
    # from the main image search, surfaced by the swatch search instead.
    # Set for explicit swatch uploads, for uploads the VLM classifies as
    # "fabric_swatch", and for fabric regions cropped out of a parent
    # image during tagging (those keep parent_id pointing at the source).
    is_swatch: Mapped[bool] = mapped_column(Boolean, default=False)
    # Garment types this fabric is suited to, e.g. ["jackets", "jeans"] -
    # filled by the VLM for swatches and fabric detail regions.
    suitable_for: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # CLIP image embedding (float32 bytes) for semantic search (app/embeddings.py).
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # Detail crops: images the VLM marked as interesting sub-regions of
    # this one. A crop has parent_id set and is itself a full library
    # image (own colors/embedding/tags) that never spawns further crops.
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("images.id"), nullable=True)
    details: Mapped[list["Image"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan", order_by="Image.created_at"
    )
    parent: Mapped["Image | None"] = relationship(
        back_populates="details", remote_side="Image.id"
    )

    # Every board this image is placed on (an image can live on several
    # boards at once, or none - library-only uploads).
    placements: Mapped[list["BoardImage"]] = relationship(
        back_populates="image", cascade="all, delete-orphan"
    )


class Board(Base):
    """A named mood board - one infinite canvas the user arranges images on."""

    __tablename__ = "boards"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, default="Untitled Board")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    placements: Mapped[list["BoardImage"]] = relationship(
        back_populates="board", cascade="all, delete-orphan", order_by="BoardImage.added_at"
    )
    notes: Mapped[list["BoardNote"]] = relationship(
        back_populates="board", cascade="all, delete-orphan", order_by="BoardNote.created_at"
    )
    elements: Mapped[list["BoardElement"]] = relationship(
        back_populates="board", cascade="all, delete-orphan", order_by="BoardElement.created_at"
    )


class BoardImage(Base):
    """A single placement of an image on a board - carries the per-board
    canvas position so the same image can sit in different spots on
    different boards."""

    __tablename__ = "board_images"

    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"), primary_key=True)
    image_id: Mapped[str] = mapped_column(ForeignKey("images.id"), primary_key=True)
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)
    added_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Free-form annotation + whether the card's side info panel is open on
    # this board - both per-placement so the same image can carry
    # different context on different boards.
    note: Mapped[str] = mapped_column(String, default="")
    info_open: Mapped[bool] = mapped_column(Boolean, default=False)

    board: Mapped[Board] = relationship(back_populates="placements")
    image: Mapped[Image] = relationship(back_populates="placements")


class BoardNote(Base):
    """A standalone note pinned on a board - the sticky-note counterpart
    to an image placement, with its own canvas position. Richer than a
    plain sticky: a note can carry a bold title, a formatted body OR a
    checklist, free-form tags, a reference color swatch, and can be
    pinned in place or collapsed to a compact chip."""

    __tablename__ = "board_notes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"))
    title: Mapped[str] = mapped_column(String, default="")
    # Sanitized rich-text HTML body, used when mode == "text".
    text: Mapped[str] = mapped_column(String, default="")
    # "text" (formatted body) or "checklist" (list of checkable items).
    mode: Mapped[str] = mapped_column(String, default="text")
    # [{id, text, done}, ...] - only meaningful when mode == "checklist".
    checklist: Mapped[list] = mapped_column(JSON, default=list)
    # Sticky-note palette key (yellow/blue/pink/green/purple/surface) -
    # the frontend maps these to a themed accent color.
    color: Mapped[str] = mapped_column(String, default="yellow")
    # Free-form categorization tags, independent of image tags.
    tags: Mapped[list] = mapped_column(JSON, default=list)
    # An optional pinned reference color (e.g. picked off a garment),
    # stored as a hex string; "" means none attached.
    swatch: Mapped[str] = mapped_column(String, default="")
    # Locked in place - dragging is disabled.
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    # Shrunk to a compact title-only chip to reduce board clutter.
    collapsed: Mapped[bool] = mapped_column(Boolean, default=False)
    width: Mapped[float] = mapped_column(Float, default=240.0)
    # None means auto-height (grows with content); set once the user
    # drags the resize handle.
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    board: Mapped[Board] = relationship(back_populates="notes")


class BoardElement(Base):
    """A floating canvas element that isn't an image or a note - plain
    text labels and simple shapes (rectangle, ellipse, arrow) drawn
    directly on the board. Lighter than a BoardNote: no title, tags, or
    modes, just a bounding box plus a palette color."""

    __tablename__ = "board_elements"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    board_id: Mapped[str] = mapped_column(ForeignKey("boards.id"))
    # "text" | "rect" | "ellipse" | "arrow"
    kind: Mapped[str] = mapped_column(String, default="rect")
    # Plain-text contents - only meaningful for kind == "text".
    text: Mapped[str] = mapped_column(String, default="")
    # Palette key matching the note colors (yellow/blue/pink/green/
    # purple/surface) - the frontend maps it to a themed accent.
    color: Mapped[str] = mapped_column(String, default="surface")
    # Arrow direction: the head sits at the bounding box's bottom-right
    # corner by default; the flips mirror it onto other corners.
    flip_x: Mapped[bool] = mapped_column(Boolean, default=False)
    flip_y: Mapped[bool] = mapped_column(Boolean, default=False)
    # Text label font size - only meaningful for kind == "text". Large
    # by default so labels read at the same scale as full-size images.
    font_size: Mapped[float] = mapped_column(Float, default=32.0)
    width: Mapped[float] = mapped_column(Float, default=200.0)
    height: Mapped[float] = mapped_column(Float, default=80.0)
    x: Mapped[float] = mapped_column(Float, default=0.0)
    y: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    board: Mapped[Board] = relationship(back_populates="elements")
