"""Shared logic for flattening an image's structured attributes (which are
spread across possibly-several garments, plus top-level swatch/pattern
fields) into a flat set of searchable/filterable values.
"""

from app.models import Image

# Umbrella grouping for the filter UI - lets the search panel cluster
# "similar" attribute kinds together instead of one flat pill list.
CATEGORY_LABELS: dict[str, str] = {
    "garment_type": "Garment",
    "fabric": "Fabric",
    "pattern": "Pattern",
    "fit_shape": "Fit & Shape",
    "seam_type": "Seam",
    "hardware": "Hardware",
    "style_tag": "Style",
    "suitable_for": "Good For",
}


def collect_categorized_attribute_values(image: Image) -> list[tuple[str, str]]:
    """Same values as collect_attribute_values, tagged with which
    attribute kind each one came from (see CATEGORY_LABELS) so callers
    that need to group/organize them (the filter UI) can."""
    pairs: list[tuple[str, str]] = []

    for garment in image.garments or []:
        for key in ("garment_type", "fabric", "pattern", "fit_shape", "seam_type"):
            value = garment.get(key)
            if value:
                pairs.append((key, value))
        for hw in garment.get("hardware") or []:
            hw_type = hw.get("type")
            if hw_type:
                pairs.append(("hardware", hw_type))

    if image.pattern:
        pairs.append(("pattern", image.pattern))
    if image.fabric:
        pairs.append(("fabric", image.fabric))
    for use in image.suitable_for or []:
        pairs.append(("suitable_for", use))
    for tag in image.style_tags or []:
        pairs.append(("style_tag", tag))

    return pairs


def collect_attribute_values(image: Image) -> list[str]:
    """All garment_type/fabric/pattern/fit_shape/seam_type/hardware/
    style_tag values touched by this image, across every garment it
    contains (an outfit photo contributes one set per garment)."""
    return [value for _category, value in collect_categorized_attribute_values(image)]


def collect_text_haystack(image: Image) -> list[str | None]:
    """Same values as above, plus free-text fields, for keyword-match
    scoring during search (as opposed to exact pill filtering)."""
    return [*collect_attribute_values(image), image.description, image.tags]
