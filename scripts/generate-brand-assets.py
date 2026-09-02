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
import math

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

# A maskable icon is guaranteed only its centre circle of this diameter; the
# launcher's mask may take the rest. https://w3c.github.io/manifest/#icon-masks
SAFE_ZONE = 0.8


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


def body(im: Image.Image) -> Image.Image:
    """The solid artwork as a mask, with the glow thresholded away.

    with_alpha() ramps the glow across a wide band on purpose, so alpha alone
    cannot say where the hexagon ends and its bloom begins. Everything that has
    to reason about the mark's *shape* -- where its centre is, how much room it
    needs -- measures this instead.
    """
    return im.getchannel("A").point(lambda v: 255 if v > 140 else 0)


def body_centre(im: Image.Image) -> tuple[float, float]:
    """Centre of the solid artwork, which is not the centre of its bounding box.

    The glow is not symmetric: it pools under the bottom vertex and is thinner
    at the top right, so the full bbox reaches further down and left than the
    hexagon does. Centring the bbox therefore pushes the hexagon itself up and
    to the right -- invisible on a square icon with room to spare, obvious once
    a launcher crops the plate away to a circle and the mark is all that is
    left. Every placement below centres on this point.
    """
    left, top, right, bottom = body(im).getbbox()
    return (left + right) / 2, (top + bottom) / 2


def body_radius(im: Image.Image) -> float:
    """Distance from body_centre() to the furthest solid pixel.

    Measured rather than derived from the bbox: the bbox's own half-diagonal
    would fit the hexagon's empty *corners* inside the safe circle and shrink
    the mark for nothing.
    """
    cx, cy = body_centre(im)
    px = body(im).load()
    w, h = im.size
    return max(
        math.hypot(x - cx, y - cy) for y in range(h) for x in range(w) if px[x, y]
    )


def place(mark: Image.Image, size: int, scale: float) -> Image.Image:
    """The mark resized by `scale` and set body-centre on an opaque plate."""
    canvas = Image.new("RGBA", (size, size), (*PLATE, 255))
    scaled = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )
    cx, cy = body_centre(scaled)
    canvas.alpha_composite(scaled, (round(size / 2 - cx), round(size / 2 - cy)))
    return canvas.convert("RGB")


def on_plate(mark: Image.Image, size: int, coverage: float) -> Image.Image:
    """Square icon: the mark on an opaque plate, its long axis `coverage` of the edge."""
    return place(mark, size, size * coverage / max(mark.size))


def on_safe_circle(mark: Image.Image, size: int, fill: float) -> Image.Image:
    """Maskable icon: the mark sized to `fill` of the mask's safe circle.

    A maskable icon is only guaranteed its centre 80%-diameter circle; the
    launcher may crop everything outside it, and a circle is the tightest of
    the shapes it may crop to. So the constraint is not a share of the square
    edge -- it is the radius: fit the hexagon's own circumradius inside that
    circle and it fills the launcher icon, at any mask shape, without a corner
    ever being bitten. Only the glow can spill past, and glow fading out under
    the mask edge is what it looks like anyway.
    """
    return place(mark, size, size * SAFE_ZONE / 2 * fill / body_radius(mark))


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
    # Android crops this one to a mask, so it is sized against the safe circle
    # rather than the square edge. 0.98 of it, not 1.0: the hexagon's vertices
    # land a couple of pixels inside the boundary instead of on it.
    on_safe_circle(mark, 512, 0.98).save(ICONS / "icon-512-maskable.png")
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
