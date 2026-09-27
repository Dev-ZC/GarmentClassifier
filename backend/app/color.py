"""Local, deterministic color analysis: dominant color extraction and
perceptual (LAB/Delta-E) color-proximity search.

No AI model needed here - this is plain pixel math, which makes it exact
and instant, unlike asking a VLM to name a color.
"""

from pathlib import Path

import numpy as np
from PIL import Image as PILImage

from app.config import DOMINANT_COLOR_COUNT


def _srgb_to_linear(channel: np.ndarray) -> np.ndarray:
    channel = channel / 255.0
    return np.where(channel <= 0.04045, channel / 12.92, ((channel + 0.055) / 1.055) ** 2.4)


def rgb_to_lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """Convert an sRGB color to CIE LAB, the perceptually-uniform space
    Delta-E distance is defined over."""
    r, g, b = _srgb_to_linear(np.array(rgb, dtype=np.float64))

    x = r * 0.4124 + g * 0.3576 + b * 0.1805
    y = r * 0.2126 + g * 0.7152 + b * 0.0722
    z = r * 0.0193 + g * 0.1192 + b * 0.9505

    # Normalize by the D65 reference white point, then apply the standard
    # CIE nonlinear transfer function.
    x, y, z = x / 0.95047, y / 1.0, z / 1.08883

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    fx, fy, fz = f(x), f(y), f(z)
    L = max(0.0, 116 * fy - 16)
    a = 500 * (fx - fy)
    b_ = 200 * (fy - fz)
    return (L, a, b_)


def delta_e(lab1: tuple[float, float, float], lab2: tuple[float, float, float]) -> float:
    """CIE76 Delta-E: Euclidean distance in LAB space. Roughly, <2.3 is
    "just noticeable", <10 is "similar", >20 is clearly different."""
    return float(np.linalg.norm(np.array(lab1) - np.array(lab2)))


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def extract_dominant_colors(image_path: Path, count: int = DOMINANT_COLOR_COUNT) -> list[dict]:
    """Quantize the image's palette (median-cut, built into Pillow) and
    return the most common colors with their pixel share and LAB value."""
    with PILImage.open(image_path) as img:
        rgb_img = img.convert("RGB")
        rgb_img.thumbnail((200, 200))
        quantized = rgb_img.quantize(colors=count, method=PILImage.MEDIANCUT)

    palette = quantized.getpalette() or []
    color_counts = sorted(quantized.getcolors() or [], key=lambda c: c[0], reverse=True)
    total_pixels = sum(c for c, _ in color_counts) or 1

    results = []
    for pixel_count, palette_index in color_counts[:count]:
        offset = palette_index * 3
        rgb = tuple(palette[offset : offset + 3])
        if len(rgb) != 3:
            continue
        results.append(
            {
                "hex": rgb_to_hex(rgb),  # type: ignore[arg-type]
                "lab": list(rgb_to_lab(rgb)),  # type: ignore[arg-type]
                "percent": round(pixel_count / total_pixels, 4),
            }
        )
    return results


def closest_color_distance(dominant_colors: list[dict], query_hex: str) -> float:
    """Smallest Delta-E between a query color and any of an image's
    dominant colors - i.e. "how close is the nearest matching color"."""
    if not dominant_colors:
        return float("inf")
    query_lab = rgb_to_lab(hex_to_rgb(query_hex))
    return min(delta_e(tuple(c["lab"]), query_lab) for c in dominant_colors)
