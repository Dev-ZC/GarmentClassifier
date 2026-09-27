export type TaggingStatus = 'pending' | 'processing' | 'done' | 'failed';

export type ImageType = 'single_garment' | 'outfit' | 'fabric_swatch' | 'pattern_or_texture' | 'other';

export interface DominantColor {
  hex: string;
  lab: number[];
  percent: number;
}

export interface HardwareItem {
  type: string;
  color: string;
}

export interface GarmentItem {
  garment_type: string;
  fabric: string | null;
  pattern: string | null;
  fit_shape: string | null;
  seam_type: string | null;
  hardware: HardwareItem[];
  // Region the VLM bound for this garment's fabric - the tagging
  // pipeline crops it into the swatch bank; informational here.
  fabric_box: number[] | null;
}

export interface ImageItem {
  id: string;
  original_filename: string;
  content_type: string;
  width: number;
  height: number;
  x: number;
  y: number;
  tags: string[];
  created_at: string;
  url: string;

  tagging_status: TaggingStatus;
  tagging_error: string | null;
  dominant_colors: DominantColor[];

  image_type: ImageType | null;
  garments: GarmentItem[];
  // Overall pattern/fabric - used when there's no single garment shape
  // (fabric swatches, pattern references, other inspiration photos).
  pattern: string | null;
  fabric: string | null;
  style_tags: string[];
  description: string | null;

  // Swatch bank membership: swatches are images too, but live in their
  // own list/search and render as fabric cards on the board. Auto
  // extracted fabric crops keep parent_id pointing at the source image
  // and surface in that image's details panel instead of the bento.
  is_swatch: boolean;
  // Garment types this fabric suits ("jackets", "polo shirts", ...) -
  // only populated for swatches.
  suitable_for: string[];

  // Boards this image is placed on (empty = library-only).
  board_ids: string[];

  // Per-placement fields - only populated when the image is rendered on
  // a board (spread in from BoardImageItem); absent elsewhere.
  note?: string;
  info_open?: boolean;

  // Detail crops: when set, this image IS a crop of another image; when
  // populated, these are the crops the VLM marked on this image.
  parent_id: string | null;
  details: ImageItem[];
}

export interface BoardItem {
  id: string;
  name: string;
  created_at: string;
  image_count: number;
  preview_urls: string[];
}

// One image placed on a board - the x/y here is the per-board canvas
// position (ImageItem.x/y is legacy and unused for board rendering).
export interface BoardImageItem {
  image: ImageItem;
  x: number;
  y: number;
  note: string;
  info_open: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type NoteMode = 'text' | 'checklist';

// A standalone note pinned on a board - richer than plain text: a bold
// title, a formatted body OR a checklist, free-form tags, an optional
// reference color swatch, and pin/collapse/resize state.
export interface BoardNoteItem {
  id: string;
  title: string;
  text: string;
  mode: NoteMode;
  checklist: ChecklistItem[];
  color: string;
  tags: string[];
  swatch: string;
  pinned: boolean;
  collapsed: boolean;
  width: number;
  height: number | null;
  x: number;
  y: number;
  created_at: string;
}

// Partial update sent to PATCH /api/boards/:id/notes/:noteId - every
// field is optional so callers only send what changed.
export type BoardNoteUpdate = Partial<
  Pick<
    BoardNoteItem,
    | 'title'
    | 'text'
    | 'mode'
    | 'checklist'
    | 'color'
    | 'tags'
    | 'swatch'
    | 'pinned'
    | 'collapsed'
    | 'width'
    | 'height'
    | 'x'
    | 'y'
  >
>;

export type BoardElementKind = 'text' | 'rect' | 'ellipse' | 'arrow';

// A floating canvas element that isn't an image or a note: a plain text
// label or a simple shape drawn straight on the board. flip_x/flip_y
// only matter for arrows - the head sits at the bounding box's
// bottom-right corner and the flips mirror it onto other corners.
export interface BoardElementItem {
  id: string;
  kind: BoardElementKind;
  text: string;
  color: string;
  flip_x: boolean;
  flip_y: boolean;
  /** Text label font size - only meaningful when kind === 'text'. */
  font_size: number;
  width: number;
  height: number;
  x: number;
  y: number;
  created_at: string;
}

// Partial update sent to PATCH /api/boards/:id/elements/:elementId.
export type BoardElementUpdate = Partial<
  Pick<
    BoardElementItem,
    'text' | 'color' | 'flip_x' | 'flip_y' | 'font_size' | 'width' | 'height' | 'x' | 'y'
  >
>;

export interface SearchRequest {
  query?: string;
  color_hex?: string;
  color_tolerance?: number;
  attribute_tags?: string[];
  limit?: number;
}

export interface SearchResult {
  image: ImageItem;
  score: number;
  matched_color: DominantColor | null;
}

export interface FacetItem {
  value: string;
  count: number;
  // Umbrella grouping (Fabric/Pattern/Garment/...) this pill belongs
  // under - lets the filter UI cluster similar filters together.
  category: string;
}
