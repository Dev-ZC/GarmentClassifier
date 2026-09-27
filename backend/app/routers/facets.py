"""Exposes what filter pills are worth showing in the search UI, derived
from whatever's actually in the project. Returns an empty list (not an
error) for an empty/untagged project - the frontend just hides the pill
row in that case.

Each pill carries a `category` (Fabric/Pattern/Garment/...) so the
frontend can group "similar" filters under the same umbrella instead of
dumping everything into one flat, overflowing list.
"""

from collections import Counter, defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.attributes import CATEGORY_LABELS, collect_categorized_attribute_values
from app.database import get_db
from app.models import Image
from app.schemas import FacetItem, FacetsResponse

router = APIRouter(prefix="/api/facets", tags=["facets"])

# Cap per category (not overall) - keeps one noisy attribute kind (e.g.
# hardware) from crowding out rarer-but-useful categories like seam type.
MAX_PILLS_PER_CATEGORY = 20


def build_facets(images: list[Image]) -> FacetsResponse:
    """Facet pill counts for a candidate image set - shared by the main
    facets endpoint (non-swatch images) and the swatch-bank facets."""

    # Case-insensitive dedup while keeping the first-seen casing for
    # display, counted separately per category since the same word could
    # plausibly show up under two different attribute kinds.
    counts: Counter[tuple[str, str]] = Counter()
    display_casing: dict[tuple[str, str], str] = {}
    for image in images:
        for category, value in collect_categorized_attribute_values(image):
            key = value.strip().lower()
            if not key:
                continue
            counts[(category, key)] += 1
            display_casing.setdefault((category, key), value.strip())

    by_category: dict[str, list[tuple[str, str, int]]] = defaultdict(list)
    for (category, key), count in counts.items():
        by_category[category].append((key, display_casing[(category, key)], count))

    items: list[FacetItem] = []
    for category, entries in by_category.items():
        entries.sort(key=lambda entry: entry[2], reverse=True)
        label = CATEGORY_LABELS.get(category, category.replace("_", " ").title())
        for _key, display, count in entries[:MAX_PILLS_PER_CATEGORY]:
            items.append(FacetItem(value=display, count=count, category=label))

    # Most frequent overall first - the frontend's "suggested" row just
    # takes the head of this list before it groups the rest by category.
    items.sort(key=lambda item: item.count, reverse=True)
    return FacetsResponse(attribute_tags=items)


@router.get("", response_model=FacetsResponse)
def get_facets(db: Session = Depends(get_db)) -> FacetsResponse:
    images = db.query(Image).filter(Image.is_swatch.is_(False)).all()
    return build_facets(images)
