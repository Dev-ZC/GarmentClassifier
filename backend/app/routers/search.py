"""Hybrid search: combines exact filter-pill matching, perceptual color
proximity (LAB Delta-E), and CLIP semantic similarity into one ranked
result set. With no criteria at all, it's just a "browse everything" list
(used for the default Pinterest-style results view).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.attributes import collect_attribute_values, collect_text_haystack
from app.color import closest_color_distance
from app.database import get_db
from app.embeddings import bytes_to_vector, cosine_similarity, embed_text
from app.models import Image
from app.schemas import DominantColor, SearchRequest, SearchResult
from app.serializers import image_to_out

router = APIRouter(prefix="/api/search", tags=["search"])

# How much weight semantic (CLIP) similarity vs. color proximity contribute
# to the final ranking score when both are present.
SEMANTIC_WEIGHT = 0.7
COLOR_WEIGHT = 0.3
TEXT_MATCH_BONUS = 0.25

# Raw CLIP cosine similarity for *unrelated* text/image pairs still tends to
# land around 0.15-0.2 (it's rarely near zero), so a query only counts as a
# semantic match once it clears this floor - otherwise every image would
# "match" every query by a small margin.
MIN_SEMANTIC_SCORE = 0.21


def _matches_attribute_tags(image: Image, tags: list[str]) -> bool:
    """An image must have every selected pill among its attribute values
    (case-insensitive) - pills narrow the result set (AND semantics)."""
    values = {v.lower() for v in collect_attribute_values(image)}
    return all(tag.lower() in values for tag in tags)


def _text_match_score(image: Image, query: str) -> float:
    haystack = [h for h in collect_text_haystack(image) if h]
    query_lower = query.lower()
    return TEXT_MATCH_BONUS if any(query_lower in h.lower() for h in haystack) else 0.0


def rank_images(images: list[Image], payload: SearchRequest) -> list[SearchResult]:
    """Score + rank a candidate image set against the search criteria.
    Shared by the main image search (all non-swatch images) and the
    swatch-bank search (swatches only) - the caller decides which images
    are in scope."""
    images.sort(key=lambda img: img.created_at, reverse=True)
    has_criteria = bool(payload.query or payload.color_hex or payload.attribute_tags)

    # No criteria at all: just browse everything, most recent first - this
    # is what powers the default Pinterest-style results view.
    if not has_criteria:
        return [
            SearchResult(image=image_to_out(img), score=1.0, matched_color=None)
            for img in images[: payload.limit]
        ]

    query_embedding = embed_text(payload.query) if payload.query else None

    results: list[SearchResult] = []
    for image in images:
        if payload.attribute_tags and not _matches_attribute_tags(image, payload.attribute_tags):
            continue

        matched_color: DominantColor | None = None
        color_score = 0.0
        if payload.color_hex:
            distance = closest_color_distance(image.dominant_colors or [], payload.color_hex)
            if distance > payload.color_tolerance:
                continue
            color_score = max(0.0, 1 - distance / payload.color_tolerance)
            # closest_color_distance only returns the distance; re-derive
            # which swatch it belongs to so the UI can show it.
            closest = min(
                image.dominant_colors,
                key=lambda c: closest_color_distance([c], payload.color_hex),
            )
            matched_color = DominantColor(**closest)

        semantic_score = 0.0
        text_bonus = 0.0
        if payload.query:
            if image.embedding is not None:
                raw_similarity = cosine_similarity(bytes_to_vector(image.embedding), query_embedding)
                semantic_score = raw_similarity if raw_similarity >= MIN_SEMANTIC_SCORE else 0.0
            text_bonus = _text_match_score(image, payload.query)

            # A text query with neither a strong semantic match nor a
            # keyword hit is noise - drop it rather than ranking it low.
            if semantic_score == 0.0 and text_bonus == 0.0:
                continue

        score = semantic_score * SEMANTIC_WEIGHT + color_score * COLOR_WEIGHT + text_bonus
        results.append(SearchResult(image=image_to_out(image), score=round(score, 4), matched_color=matched_color))

    results.sort(key=lambda r: r.score, reverse=True)
    return results[: payload.limit]


@router.post("", response_model=list[SearchResult])
def search_images(payload: SearchRequest, db: Session = Depends(get_db)) -> list[SearchResult]:
    # The swatch bank is searched separately via /api/swatches/search.
    images = (
        db.query(Image).filter(Image.is_swatch.is_(False)).all()
    )
    return rank_images(images, payload)
