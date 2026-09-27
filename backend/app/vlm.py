"""Structured attribute extraction via a local vision-language model
served by Ollama (no API key, no cloud calls).

This is the piece that answers "what fabric/seams/hardware/fit is this",
things a fixed tag taxonomy or plain color math can't determine on their
own. It also has to cope with images that aren't a single clean garment
shot: full outfits (multiple garments), fabric swatches, pattern/texture
references, and general (non-clothing) inspiration photos.
"""

import json
from pathlib import Path
from typing import Any

from app.config import (
    MAX_DETAIL_AREA,
    MAX_DETAIL_CROPS,
    MAX_DETAIL_SIDE,
    MAX_FABRIC_DETAIL_AREA,
    MAX_FABRIC_DETAIL_SIDE,
    MIN_DETAIL_FRACTION,
    OLLAMA_HOST,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_VISION_MODEL,
)

PROMPT = """You are a fashion and textile analyst cataloguing an image for a \
searchable design-inspiration board. The image could be:
- a single garment (one item, e.g. a pair of jeans laid flat or worn)
- a full outfit (a person wearing multiple garments at once)
- a fabric swatch (a close-up of material with no garment shape)
- a pattern/texture reference (a print or graphic, not tied to any fabric)
- something else entirely (e.g. a landscape or object kept only for color/mood)

Respond with ONLY a single JSON object (no markdown, no commentary) with \
exactly these keys:

{
  "image_type": one of "single_garment" | "outfit" | "fabric_swatch" | "pattern_or_texture" | "other",
  "garments": [                      // one entry PER DISTINCT GARMENT visible; [] if image_type is not "single_garment" or "outfit"
    {
      "garment_type": string,          // e.g. "jeans", "bomber jacket", "graphic tee"
      "fabric": string or null,        // e.g. "denim", "cotton twill", "leather", "wool", "silk", "knit"
      "pattern": string or null,       // e.g. "solid", "striped", "plaid", "floral", "graphic print", "houndstooth"
      "fit_shape": string or null,     // silhouette, e.g. "skinny", "baggy", "slim", "oversized", "relaxed", "tailored", "flared"
      "seam_type": string or null,     // e.g. "flat-felled", "topstitched", "raw edge", "serged", "bound"
      "hardware": [{"type": string, "color": string}],  // visible hardware on this garment; [] if none
      "fabric_box": [x1, y1, x2, y2] or null  // bounds a representative patch of this garment's fabric for swatch cropping - clean cloth, may cover most of the garment; null when "fabric" is null or no clear fabric region exists
    }
  ],
  "pattern": string or null,        // OVERALL pattern/print, especially for "fabric_swatch"/"pattern_or_texture"/"other" images where there's no single garment to attach it to
  "fabric": string or null,         // OVERALL fabric/material, especially for "fabric_swatch" images
  "suitable_for": [string, ...],    // garment types this fabric is typically used for, e.g. ["jackets", "jeans", "polo shirts"] - REQUIRED for "fabric_swatch" images, [] otherwise
  "style_tags": [string, ...],      // 3-8 short descriptive tags, e.g. ["streetwear", "distressed", "high-waisted"]
  "description": string,            // one plain-language sentence describing the image
  "details": [                      // small regions worth zooming into; [] when nothing stands out
    {
      "label": string,              // what's interesting, e.g. "topstitched collar", "white lace-up boots", "herringbone weave"
      "box": [x1, y1, x2, y2],      // bounding box as fractions of image width/height, all values strictly between 0.0 and 1.0 - NOT pixels, NOT 0-1000
      "is_fabric": boolean,         // true ONLY when the crop itself reads as a piece of cloth (weave/texture/bolt); false for garment features like pockets, collars, seams even when the material shows
      "fabric": string or null,     // material name when is_fabric is true, e.g. "denim", "wool flannel"; null otherwise
      "suitable_for": [string, ...] // garment types this fabric suits when is_fabric is true, e.g. ["jackets", "skirts"]; [] otherwise
    }
  ]
}

Rules:
- For "outfit" images, add ONE "garments" entry per distinct piece of \
clothing (e.g. jacket, shirt, pants, shoes are separate entries).
- For "fabric_swatch" images, "garments" must be [] and "fabric" must be \
filled in. Also fill "suitable_for" with 2-6 garment types the fabric is \
commonly used for.
- For "pattern_or_texture" or "other" images, "garments" must be [] - use \
the top-level "pattern"/"style_tags"/"description" instead.
- Use null (not empty strings) for anything not applicable or not visible.
- In "details", actively scan the image for genuinely distinct, \
visually interesting sub-regions worth zooming into - a specific \
garment in a multi-piece shot, shoes, notable hardware, stitching, \
lace, a distinct fabric texture or print. Return as many as genuinely \
exist - typically 1-5 for garment/outfit shots; use [] only when the \
image truly has no distinct sub-regions (e.g. a plain swatch). \
Each box must bound that region only - never the whole image or more
than about half of it, and no two boxes may cover the same area.
- Mark a detail "is_fabric": true ONLY when the cropped region itself \
reads as a piece of cloth - a weave, texture, or bolt of material you'd \
pin to a fabric-swatch board. When true, name the material in "fabric" \
and list 2-6 garment types that material suits in "suitable_for". \
Garment features made of cloth - pockets, collars, seams, panels, \
zippers, shoes - are "is_fabric": false even when the material is \
identifiable; garment fabrics are already covered by "fabric_box", so \
reserve is_fabric for material regions NOT tied to a "garments" entry \
(loose cloth, upholstery, a second material a garment's box missed).
- Return BOTH kinds: fabric regions where genuinely standalone material \
is visible AND regular "is_fabric": false details for everything else \
interesting - garment features, hardware, shoes, prints. Fabric regions \
supplement the detail list; they never replace it.
- Be specific and use fashion-industry terminology."""

REQUIRED_KEYS = {
    "image_type",
    "garments",
    "pattern",
    "fabric",
    "suitable_for",
    "style_tags",
    "description",
    "details",
}
GARMENT_KEYS = {"garment_type", "fabric", "pattern", "fit_shape", "seam_type", "hardware", "fabric_box"}
VALID_IMAGE_TYPES = {"single_garment", "outfit", "fabric_swatch", "pattern_or_texture", "other"}


class VLMUnavailableError(Exception):
    """Raised when Ollama isn't reachable or the model isn't pulled."""


def analyze_image(image_path: Path) -> dict[str, Any]:
    try:
        from ollama import Client
    except ImportError as exc:
        raise VLMUnavailableError("The `ollama` Python package isn't installed") from exc

    client = Client(host=OLLAMA_HOST)
    try:
        response = client.chat(
            model=OLLAMA_VISION_MODEL,
            messages=[{"role": "user", "content": PROMPT, "images": [str(image_path)]}],
            format="json",
            options={"temperature": 0.1},
            keep_alive=OLLAMA_KEEP_ALIVE,
        )
    except Exception as exc:  # connection errors, missing model, etc.
        raise VLMUnavailableError(
            f"Couldn't reach Ollama model '{OLLAMA_VISION_MODEL}' at {OLLAMA_HOST}: {exc}"
        ) from exc

    content = response["message"]["content"]
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise VLMUnavailableError(f"Model returned invalid JSON: {content[:200]}") from exc

    return _normalize(data)


def _normalize_hardware(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    return [
        {"type": str(item.get("type", "")), "color": str(item.get("color", ""))}
        for item in raw
        if isinstance(item, dict) and item.get("type")
    ]


def _normalize_box(
    raw: Any, max_side: float, max_area: float
) -> list[float] | None:
    """A normalized [x1, y1, x2, y2] box, or None when malformed or out of
    bounds. Boxes are clamped to the image and dropped when degenerate or
    over the given size caps - models occasionally return pixel or
    0-1000 coords or near-full-frame boxes."""
    if not isinstance(raw, list) or len(raw) != 4:
        return None
    try:
        vals = [float(v) for v in raw]
    except (TypeError, ValueError):
        return None

    # Qwen-family VLMs emit boxes on a 0-1000 normalized scale as often
    # as true 0-1 fractions even when the prompt asks for fractions. Any
    # coordinate clearly above 1 means the whole box is on that scale
    # (0-1000 and pixel coords coincide closely enough at the ~1MP
    # working size the pipeline feeds the model).
    scale = 1000.0 if max(vals) > 1.5 else 1.0
    x1, y1, x2, y2 = (max(0.0, min(1.0, v / scale)) for v in vals)
    x1, x2 = min(x1, x2), max(x1, x2)
    y1, y2 = min(y1, y2), max(y1, y2)
    width, height = x2 - x1, y2 - y1
    if width < MIN_DETAIL_FRACTION or height < MIN_DETAIL_FRACTION:
        return None
    if width > max_side or height > max_side or width * height > max_area:
        return None
    return [x1, y1, x2, y2]


def _normalize_garment(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or not raw.get("garment_type"):
        return None
    garment: dict[str, Any] = {key: raw.get(key) for key in GARMENT_KEYS}
    garment["hardware"] = _normalize_hardware(garment.get("hardware"))
    # The fabric region only makes sense when the garment has a named
    # material; it uses the looser swatch caps since fabric can
    # legitimately span most of a garment.
    garment["fabric_box"] = (
        _normalize_box(raw.get("fabric_box"), MAX_FABRIC_DETAIL_SIDE, MAX_FABRIC_DETAIL_AREA)
        if garment.get("fabric")
        else None
    )
    return garment


def _iou(a: list[float], b: list[float]) -> float:
    """Intersection-over-union of two normalized [x1, y1, x2, y2] boxes -
    used to drop detail crops that cover the same area."""
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if inter <= 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _normalize_detail(raw: Any) -> dict[str, Any] | None:
    """One detail-crop region: a label plus a normalized [x1, y1, x2, y2]
    box. Boxes are clamped to the image and dropped when degenerate, when
    they cover (nearly) the whole image, or when they duplicate another
    detail's region - models occasionally return pixel or 0-1000 coords,
    near-full-frame boxes, or the same region twice."""
    if not isinstance(raw, dict) or not raw.get("label"):
        return None
    # Fabric regions get cropped into the swatch bank (app/tagging.py) -
    # not the bento cluster - so they're allowed to cover more of the
    # frame than display details. Models sometimes emit "true"/"false"
    # as strings - normalize loosely.
    is_fabric = raw.get("is_fabric")
    is_fabric = is_fabric is True or str(is_fabric).lower() == "true"
    box = _normalize_box(
        raw.get("box"),
        MAX_FABRIC_DETAIL_SIDE if is_fabric else MAX_DETAIL_SIDE,
        MAX_FABRIC_DETAIL_AREA if is_fabric else MAX_DETAIL_AREA,
    )
    if box is None:
        return None
    suitable_for = raw.get("suitable_for")
    return {
        "label": str(raw["label"]),
        "box": box,
        "is_fabric": is_fabric,
        "fabric": str(raw["fabric"]) if is_fabric and raw.get("fabric") else None,
        "suitable_for": (
            [str(v) for v in suitable_for if v]
            if is_fabric and isinstance(suitable_for, list)
            else []
        ),
    }


def _normalize(data: dict[str, Any]) -> dict[str, Any]:
    """Fill in any missing keys and coerce types so the rest of the app
    doesn't need to defensively check every field."""
    normalized: dict[str, Any] = {key: data.get(key) for key in REQUIRED_KEYS}

    if normalized.get("image_type") not in VALID_IMAGE_TYPES:
        normalized["image_type"] = "other"

    raw_garments = normalized.get("garments")
    garments = [_normalize_garment(g) for g in raw_garments] if isinstance(raw_garments, list) else []
    normalized["garments"] = [g for g in garments if g is not None]

    if not isinstance(normalized.get("style_tags"), list):
        normalized["style_tags"] = []
    normalized["style_tags"] = [str(tag) for tag in normalized["style_tags"] if tag]

    if not isinstance(normalized.get("suitable_for"), list):
        normalized["suitable_for"] = []
    normalized["suitable_for"] = [
        str(value) for value in normalized["suitable_for"] if value
    ]

    raw_details = normalized.get("details")
    details: list[dict[str, Any]] = []

    # Garments with a named fabric + fabric_box contribute a swatch
    # region even when the model didn't flag an is_fabric detail - the
    # fabric name is already known, so this path is far more reliable.
    # Seeded before raw details so a duplicate is_fabric detail covering
    # the same cloth dedupes away instead of double-cropping it.
    for garment in normalized["garments"]:
        box = garment.get("fabric_box")
        if not box:
            continue
        if any(_iou(box, kept["box"]) > 0.5 for kept in details):
            continue
        details.append(
            {
                "label": f"{garment['fabric']} ({garment['garment_type']})",
                "box": box,
                "is_fabric": True,
                "fabric": garment["fabric"],
                # The fabric demonstrably suits this garment type at
                # minimum - a reasonable seed for the swatch's use list.
                "suitable_for": [garment["garment_type"]],
            }
        )

    if isinstance(raw_details, list):
        for raw in raw_details:
            detail = _normalize_detail(raw)
            # No two crops may cover the same region - near-duplicates
            # would render as identical mini images in the cluster. Only
            # dedupe within the same kind, though: a fabric swatch region
            # and a hardware detail overlapping it serve different
            # purposes and should both survive.
            if detail is None or any(
                detail["is_fabric"] == kept["is_fabric"]
                and _iou(detail["box"], kept["box"]) > 0.5
                for kept in details
            ):
                continue
            details.append(detail)

    # Cap each kind separately: MAX_DETAIL_CROPS bounds how many bento
    # minis fan out around a card; fabric regions feed the swatch bank
    # and get their own budget on top.
    display_details = [d for d in details if not d["is_fabric"]]
    fabric_regions = [d for d in details if d["is_fabric"]]
    normalized["details"] = (
        display_details[:MAX_DETAIL_CROPS] + fabric_regions[:MAX_DETAIL_CROPS]
    )

    return normalized
