#!/usr/bin/env python3
"""Regenerate every shipped brand raster from the two sources in assets/brand/.

The sources are flat artwork on a near-black plate (#020411) with the glow baked
in, so the first step is always to recover an alpha channel from luminance: the
silver mark is near-white, the plate is near-black, and the cyan glow sits
between the two and therefore fades out on its own. Colour is left untouched --
only alpha is synthesised.

Run: python3 scripts/generate-brand-assets.py
"""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "brand"
ICONS = ROOT / "public" / "icons"
BRAND = ROOT / "public" / "brand"

# --color-bg. The manifest's theme_color (#0d1117) is a near neighbour, so the
# splash screen and the icon plate read as one surface.
PLATE = (10, 14, 20)

# Luminance below LO is plate, above HI is solid artwork; between the two the
# glow ramps. HI is deliberately well under 255 so the silver body stays fully
# opaque instead of picking up a haze of its own anti-aliasing.
ALPHA_LO, ALPHA_HI = 8, 90


def with_alpha(path: Path) -> Image.Image:
    """Source artwork with its plate replaced by transparency."""
    im = Image.open(path).convert("RGB")
    lum = im.convert("L")
    span = ALPHA_HI - ALPHA_LO
    alpha = lum.point(lambda v: 0 if v <= ALPHA_LO else min(255, (v - ALPHA_LO) * 255 // span))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def trim(im: Image.Image) -> Image.Image:
    """Crop to the artwork, ignoring the faintest tail of the glow.

    getbbox() alone would keep every pixel with alpha 1, which on this artwork
    is most of the frame; the threshold pass is what makes the crop tight.
    """
    solid = im.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    return im.crop(solid.getbbox())


def on_plate(mark: Image.Image, size: int, coverage: float) -> Image.Image:
    """Square icon: the mark centred on an opaque plate at `coverage` of the edge."""
    canvas = Image.new("RGBA", (size, size), (*PLATE, 255))
    # contain(), not thumbnail(): thumbnail only ever shrinks, so a source at
    # or below the target size would silently land under `coverage`.
    limit = int(size * coverage)
    scaled = ImageOps.contain(mark, (limit, limit), Image.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    canvas.alpha_composite(scaled, (x, y))
    return canvas.convert("RGB")


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    BRAND.mkdir(parents=True, exist_ok=True)

    mark = trim(with_alpha(SRC / "logo-mark.png"))

    for size in (192, 512):
        on_plate(mark, size, 0.78).save(ICONS / f"icon-{size}.png")
    # Android crops icons to a mask that can bite ~10% off each edge, so the
    # maskable variant is the same art pulled well inside the safe zone rather
    # than a differently-cropped one.
    on_plate(mark, 512, 0.60).save(ICONS / "icon-512-maskable.png")
    on_plate(mark, 180, 0.78).save(ICONS / "apple-touch-icon-180.png")

    # Fallback only -- index.html offers favicon.svg first, and every browser
    # that understands the SVG link never asks for this file.
    ico = on_plate(mark, 64, 0.86)
    ico.save(ICONS / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Login art: full lockup, transparent, kept at source resolution so it has
    # headroom above its ~14rem display width on a 2x screen.
    trim(with_alpha(SRC / "logo-lockup.png")).save(BRAND / "lockup.png")


if __name__ == "__main__":
    main()
