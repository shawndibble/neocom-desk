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
from PIL import Image, ImageFilter, ImageOps

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


def on_keyline(mark: Image.Image, size: int, coverage: float, halo: int) -> Image.Image:
    """Square icon on transparency, the mark ringed by a dark keyline.

    The plate is what used to carry the silver mark against a pale surface, so
    removing it has to be paid for. Dilating the mark's own alpha by `halo` and
    filling that ring with the plate colour gives the same separation without a
    box: the icon still reads on a white tab strip, but only the artwork is
    opaque. Mirrors the keyline pass in favicon.svg so the two files agree.
    """
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    limit = int(size * coverage)
    scaled = ImageOps.contain(mark, (limit, limit), Image.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    # Dilate the *solid* mark, not its raw alpha: with_alpha() deliberately
    # ramps the glow across a wide band, and growing that band just yields a
    # soft grey cloud instead of an edge. Threshold to the body first so the
    # keyline is opaque and hugs the artwork.
    # MaxFilter needs odd, >=3; at 16px a halo of 1 is already a whole pixel.
    body = scaled.getchannel("A").point(lambda v: 255 if v > 140 else 0)
    grown = body.filter(ImageFilter.MaxFilter(halo * 2 + 1))
    # Half a pixel of blur is what keeps the hard 0/255 mask from stair-casing.
    grown = grown.filter(ImageFilter.GaussianBlur(0.5))
    layer = Image.new("RGBA", scaled.size, (*PLATE, 255))
    layer.putalpha(grown)
    layer.alpha_composite(scaled)
    # Clip to the keyline silhouette. Without this the glow keeps the partial
    # alpha it was given upstream and paints a faint pale box on a light tab
    # strip -- a ghost of the very plate this function exists to remove. Inside
    # the silhouette the glow still shows, composited over the keyline colour.
    layer.putalpha(grown)
    canvas.alpha_composite(layer, (x, y))
    return canvas


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

    # Safari and other browsers that skip the SVG link land here (Chrome and
    # Firefox were observed requesting only favicon.svg). It cannot carry the
    # SVG's prefers-color-scheme flip, so the keyline is the whole defence, and
    # it is generated at each stored size rather than downscaled from one: a
    # halo resampled from 48px to 16px washes out to nothing.
    sizes = [(16, 16), (32, 32), (48, 48)]
    ico = on_keyline(mark, 48, 0.86, 2)
    ico.save(
        ICONS / "favicon.ico",
        sizes=sizes,
        append_images=[on_keyline(mark, s, 0.86, 1) for s, _ in sizes[:2]],
    )

    # Login art: full lockup, transparent, kept at source resolution so it has
    # headroom above its ~14rem display width on a 2x screen.
    trim(with_alpha(SRC / "logo-lockup.png")).save(BRAND / "lockup.png")


if __name__ == "__main__":
    main()
