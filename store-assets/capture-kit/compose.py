#!/usr/bin/env python3
"""Compose the store images that are not single CDP captures.

``02-popup.png`` — Chrome's action popup is its own window, so it can never appear
in the same CDP screenshot as the page it floats over. This script places the
*unmodified* popup capture (a real 340x464 screenshot of the extension's popup) on
a neutral backdrop at the required 1280x800. No pixel of the popup is retouched.

``promo-tile-440x280.png`` — the optional promotional tile: icon, name, tagline.

Usage
    python3 compose.py <raw-captures-dir> [output-dir]

``<raw-captures-dir>`` must contain ``02-popup.png`` (the popup capture).
Default output directory is ``store-assets/`` next to this kit.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
RAW = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else HERE / "raw"
OUT = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else HERE.parent
ICON = REPO / "public" / "icon" / "128.png"
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")


def gradient(size, top=(14, 17, 23), bottom=(8, 10, 14)):
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img


def popup_frame():
    popup = Image.open(RAW / "02-popup.png").convert("RGB")
    canvas = gradient((1280, 800), (17, 20, 27), (9, 11, 15))
    x = (1280 - popup.width) // 2
    y = (800 - popup.height) // 2
    glow = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(glow).rounded_rectangle(
        [x - 30, y - 20, x + popup.width + 30, y + popup.height + 40], 40, fill=70
    )
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    canvas = Image.composite(Image.new("RGB", canvas.size, (36, 48, 62)), canvas, glow)
    shadow = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x + 6, y + 10, x + popup.width + 6, y + popup.height + 12], 16, fill=140
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas = Image.composite(Image.new("RGB", canvas.size, (0, 0, 0)), canvas, shadow)
    canvas.paste(popup, (x, y))
    ImageDraw.Draw(canvas).rounded_rectangle(
        [x - 1, y - 1, x + popup.width, y + popup.height], 16, outline=(58, 64, 76), width=1
    )
    canvas.save(OUT / "02-popup.png")


def promo_tile():
    W, H = 440, 280
    canvas = gradient((W, H), (16, 20, 28), (7, 9, 13))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, W, 4], fill=(34, 211, 238))
    icon = Image.open(ICON).convert("RGBA").resize((76, 76), Image.LANCZOS)
    canvas.paste(icon, (36, 44), icon)
    name_font = ImageFont.truetype(str(FONT_DIR / "DejaVuSans-Bold.ttf"), 30)
    tag_font = ImageFont.truetype(str(FONT_DIR / "DejaVuSans.ttf"), 17)
    small = ImageFont.truetype(str(FONT_DIR / "DejaVuSans.ttf"), 14)
    d.text((128, 46), "AnyLLMTranslate", font=name_font, fill=(238, 242, 247))
    d.text((128, 86), "Bilingual translation with", font=tag_font, fill=(160, 170, 184))
    d.text((128, 108), "your own OpenAI-compatible LLM", font=tag_font, fill=(160, 170, 184))
    d.text((36, 176), "Pages · Subtitles · Selection · Inputs · PDF", font=tag_font, fill=(120, 214, 232))
    d.text((36, 208), "Bring your own key. No account. No telemetry.", font=small, fill=(140, 150, 164))
    d.text((36, 232), "Open source · MIT", font=small, fill=(120, 130, 144))
    canvas.save(OUT / "promo-tile-440x280.png")


if __name__ == "__main__":
    popup_frame()
    promo_tile()
    print("wrote", OUT / "02-popup.png", "and", OUT / "promo-tile-440x280.png")