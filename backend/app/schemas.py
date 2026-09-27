from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DominantColor(BaseModel):
    hex: str
    lab: list[float]
    percent: float


class HardwareItem(BaseModel):
    type: str
    color: str


class GarmentItem(BaseModel):
    """One distinct garment detected in an image - an outfit photo can
    have several of these (jacket, shirt, pants, ...)."""

    garment_type: str
    fabric: str | None = None
    pattern: str | None = None
    fit_shape: str | None = None
    seam_type: str | None = None
    hardware: list[HardwareItem] = []
    # Bounds a representative fabric patch - used to crop a swatch into
    # the bank during tagging; informational on output.
    fabric_box: list[float] | None = None


class ImageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_filename: str
    content_type: str
    width: int
    height: int
    x: float
    y: float
    tags: list[str]
    created_at: datetime
    url: str

    tagging_status: str
    tagging_error: str | None = None
    dominant_colors: list[DominantColor] = []

    # "single_garment" | "outfit" | "fabric_swatch" | "pattern_or_texture" | "other"
    image_type: str | None = None
    garments: list[GarmentItem] = []
    # Overall pattern/fabric - the only attributes that make sense when
    # there's no single garment shape (swatches, patterns, other photos).
    pattern: str | None = None
    fabric: str | None = None
    style_tags: list[str] = []
    description: str | None = None

    # Swatch-bank membership (explicit swatch uploads, fabric_swatch
    # uploads, and fabric regions cropped out of a parent) plus the
    # garment types the fabric suits - only meaningful for swatches.
    is_swatch: bool = False
    suitable_for: list[str] = []

    # Boards this image is placed on (empty = library-only).
    board_ids: list[str] = []

    # Detail crops: set when this image is itself a crop of another
    # (parent_id), or carries the crops the VLM marked on it (details).
    parent_id: str | None = None
    details: list["ImageOut"] = []


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    created_at: datetime
    image_count: int = 0
    # First few placed-image URLs, for menu thumbnails.
    preview_urls: list[str] = []


class BoardCreate(BaseModel):
    name: str = "Untitled Board"


class BoardUpdate(BaseModel):
    name: str


class BoardImageOut(BaseModel):
    image: ImageOut
    x: float
    y: float
    # Per-placement annotation + side info panel state.
    note: str = ""
    info_open: bool = False


class BoardAddImages(BaseModel):
    image_ids: list[str]
    x: float = 0.0
    y: float = 0.0


class PlacementDetailsUpdate(BaseModel):
    note: str | None = None
    info_open: bool | None = None


class ChecklistItem(BaseModel):
    id: str
    text: str = ""
    done: bool = False


class BoardNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str = ""
    text: str
    mode: str = "text"
    checklist: list[ChecklistItem] = []
    color: str = "yellow"
    tags: list[str] = []
    swatch: str = ""
    pinned: bool = False
    collapsed: bool = False
    width: float = 240.0
    height: float | None = None
    x: float
    y: float
    created_at: datetime


class BoardNoteCreate(BaseModel):
    title: str = ""
    text: str = ""
    color: str = "yellow"
    x: float = 0.0
    y: float = 0.0


class BoardNoteUpdate(BaseModel):
    title: str | None = None
    text: str | None = None
    mode: str | None = None
    checklist: list[ChecklistItem] | None = None
    color: str | None = None
    tags: list[str] | None = None
    swatch: str | None = None
    pinned: bool | None = None
    collapsed: bool | None = None
    width: float | None = None
    height: float | None = None
    x: float | None = None
    y: float | None = None


class BoardElementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    # "text" | "rect" | "ellipse" | "arrow"
    kind: str
    text: str = ""
    color: str = "surface"
    # Arrow direction mirrors (head corner within the bounding box).
    flip_x: bool = False
    flip_y: bool = False
    # Text label font size - only meaningful for kind == "text".
    font_size: float = 32.0
    width: float = 200.0
    height: float = 80.0
    x: float
    y: float
    created_at: datetime


class BoardElementCreate(BaseModel):
    kind: str = "rect"
    x: float = 0.0
    y: float = 0.0


class BoardElementUpdate(BaseModel):
    text: str | None = None
    color: str | None = None
    flip_x: bool | None = None
    flip_y: bool | None = None
    font_size: float | None = None
    width: float | None = None
    height: float | None = None
    x: float | None = None
    y: float | None = None


class ImagePositionUpdate(BaseModel):
    x: float
    y: float


class ImageSizeUpdate(BaseModel):
    width: int
    height: int


class ImageTagsUpdate(BaseModel):
    tags: list[str]


class SearchRequest(BaseModel):
    query: str | None = None
    color_hex: str | None = None
    color_tolerance: float = 20.0
    # Selected filter pills (from GET /api/facets); an image must match
    # ALL of these (values are checked against garment/pattern/fabric/
    # style tag fields, case-insensitively).
    attribute_tags: list[str] = []
    limit: int = 200


class SearchResult(BaseModel):
    image: ImageOut
    score: float
    matched_color: DominantColor | None = None


class FacetItem(BaseModel):
    value: str
    count: int
    # Umbrella grouping (Fabric/Pattern/Garment/...) the filter UI clusters
    # this pill under - see app/attributes.py:CATEGORY_LABELS.
    category: str


class FacetsResponse(BaseModel):
    attribute_tags: list[FacetItem] = []
