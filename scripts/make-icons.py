"""
Draws the app icon and the launch mark, at every size the two platforms want.

Run it after changing the palette or the mark: `python3 scripts/make-icons.py`.
It is checked in rather than the images alone because an icon nobody can
regenerate is an icon that drifts from the product the day the accent changes.

**Why this mark.** A truck, filled rather than stroked — the app's own icon set
is a 1.75 px line family that disappears at 40 px on a launcher, and a launcher
is exactly where this has to survive a busy wallpaper on a 5" screen. The
cargo box carries a left-pointing arrow knocked out of it, which is the whole
product in one shape: the load coming *back*. At small sizes the arrow reads as
structure rather than as a symbol, which is fine — it is doing the work of
stopping this looking like every other freight app, not of being decoded.

No text. "Backhaul" at 40 px is four grey pixels.
"""

from __future__ import annotations

import pathlib
from PIL import Image, ImageDraw

# The product's own accent, from `apps/mobile/src/design/tokens.ts`. Not a
# lighter marketing blue: the icon and the app should be the same colour.
ACCENT = (26, 79, 160)
WHITE = (255, 255, 255)

# Drawn large and shrunk, because Pillow has no anti-aliasing of its own — a
# circle drawn at final size has a staircase on it.
SUPERSAMPLE = 4


def mark(draw: ImageDraw.ImageDraw, size: int, colour, hollow) -> None:
    """The truck, in a square of `size`, scaled from the app's 24-unit glyph."""
    u = size / 24.0

    def at(x: float, y: float) -> tuple[float, float]:
        return (x * u, y * u)

    # Cargo box and cab, as one silhouette. Filled rather than stroked: a
    # 1.75-unit outline is under two pixels at 40 px and vanishes.
    draw.rounded_rectangle([at(1.6, 6.6), at(13.2, 17.4)], radius=1.1 * u, fill=colour)
    draw.polygon(
        [at(13.2, 10.2), at(17.6, 10.2), at(21.4, 14.0), at(21.4, 17.4), at(13.2, 17.4)],
        fill=colour,
    )

    # Wheels: knocked out of the silhouette and filled again, so they read as
    # wheels rather than as two bumps on the bottom edge.
    for cx in (7.0, 17.2):
        draw.ellipse([at(cx - 2.9, 15.6), at(cx + 2.9, 21.4)], fill=hollow)
        draw.ellipse([at(cx - 2.1, 16.4), at(cx + 2.1, 20.6)], fill=colour)
        draw.ellipse([at(cx - 0.8, 17.7), at(cx + 0.8, 19.3)], fill=hollow)

    # The load coming back. A left-pointing arrow through the box, in the
    # field's own colour — negative space, so it costs no extra element.
    #
    # Held well inside the box: an arrowhead that touches the silhouette's own
    # edge reads as a notch cut out of the truck rather than as a mark on it,
    # and at 40 px the two are the same thing.
    draw.rectangle([at(7.4, 10.5), at(11.6, 12.9)], fill=hollow)
    draw.polygon([at(7.8, 8.5), at(7.8, 14.9), at(4.6, 11.7)], fill=hollow)


def square(size: int, field, mark_colour, hollow, radius, fraction: float = 0.62) -> Image.Image:
    """One icon. `radius` None means full bleed, which Android masks itself.

    The mark is drawn, cropped to what it actually covers, and then centred —
    rather than positioned by arithmetic on the glyph's coordinates. The first
    version did the arithmetic and put the truck low and left with a band of
    empty blue above it, which is the sort of thing that looks like nobody
    checked. Cropping means the composition survives changing the glyph.
    """
    big = size * SUPERSAMPLE
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if field is not None:
        if radius is None:
            draw.rectangle([0, 0, big, big], fill=field)
        else:
            draw.rounded_rectangle([0, 0, big, big], radius=radius * big, fill=field)

    drawn = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    mark(ImageDraw.Draw(drawn), big, mark_colour, hollow)

    # Cropped to the ink. `hollow` is opaque on the icon variants — the arrow
    # is the field's own colour, not a hole — so the bounding box is the whole
    # silhouette either way.
    box = drawn.getbbox()
    if box is None:
        return image.resize((size, size), Image.LANCZOS)

    glyph = drawn.crop(box)

    # `fraction` of the canvas, which on Android has to clear the adaptive
    # mask: only the centre 66% of an adaptive icon is guaranteed visible, and
    # a wheel cropped by a circular mask reads as a mistake.
    scale = (big * fraction) / max(glyph.size)
    glyph = glyph.resize(
        (max(1, int(glyph.size[0] * scale)), max(1, int(glyph.size[1] * scale))),
        Image.LANCZOS,
    )

    image.alpha_composite(
        glyph,
        ((big - glyph.size[0]) // 2, (big - glyph.size[1]) // 2),
    )

    return image.resize((size, size), Image.LANCZOS)


def write(path: pathlib.Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)
    print(f'  {path}  {image.size[0]}px')


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    ios = root / 'apps/mobile/ios/BackhaulApp/Images.xcassets/AppIcon.appiconset'
    android = root / 'apps/mobile/android/app/src/main/res'

    print('iOS')
    # One 1024 image. Xcode has taken a single universal size since 14, and the
    # fourteen-entry Contents.json the template ships is a decade of history.
    write(ios / 'icon-1024.png', square(1024, ACCENT, WHITE, ACCENT, radius=0.0))

    print('Android — legacy launcher')
    for density, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
        # Rounded here because a launcher that does not mask shows what it is
        # given, and a hard square on a home screen looks unfinished.
        write(android / f'mipmap-{density}/ic_launcher.png', square(size, ACCENT, WHITE, ACCENT, radius=0.22))
        write(android / f'mipmap-{density}/ic_launcher_round.png', square(size, ACCENT, WHITE, ACCENT, radius=0.5))

    print('Android — adaptive foreground')
    for density, size in [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]:
        # No field: the background is a colour drawable, and the launcher
        # animates the two layers against each other.
        write(
            android / f'mipmap-{density}/ic_launcher_foreground.png',
            square(size, None, WHITE, (0, 0, 0, 0), radius=None),
        )

    print('iOS — the launch mark, for the storyboard')
    # An image set rather than a loose file, so the storyboard can name it and
    # the right density is chosen for the device.
    launch = ios.parent / 'LaunchMark.imageset'
    for scale, size in [(1, 120), (2, 240), (3, 360)]:
        write(
            launch / f'launch-mark@{scale}x.png',
            square(size, None, WHITE, (0, 0, 0, 0), radius=None, fraction=1.0),
        )


if __name__ == '__main__':
    main()
