#!/usr/bin/env python3
"""Render subtitle and end-card PNGs for the demo video pipeline.

Called by build-demo-video.mjs with a JSON spec. Uses Pillow and system fonts,
so ffmpeg does not need libass/freetype support.
"""

import json
import sys

from PIL import Image, ImageDraw, ImageFont


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        # Last-resort scalable fallback (Pillow >= 10.1).
        return ImageFont.load_default(size=size)


def wrap_lines(draw, text, font, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def render_subtitle(text, out, width, height, font_path):
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    font = load_font(font_path, int(height * 0.055))
    lines = wrap_lines(draw, text, font, int(width * 0.78))
    line_height = int(font.size * 1.28)
    pad_x, pad_y = 34, 20

    widths = [draw.textlength(line, font=font) for line in lines]
    box_width = int(max(widths)) + pad_x * 2
    box_height = line_height * len(lines) + pad_y * 2
    bottom = height - int(height * 0.085)
    top = bottom - box_height
    left = (width - box_width) // 2

    draw.rounded_rectangle(
        [left, top, left + box_width, bottom],
        radius=16,
        fill=(0, 0, 0, 195),
    )
    for index, line in enumerate(lines):
        center_y = top + pad_y + line_height * index + line_height / 2
        draw.text(
            (width / 2, center_y),
            line,
            font=font,
            fill=(255, 255, 255, 255),
            anchor="mm",
        )

    image.save(out)


def render_end_card(spec, out, width, height):
    image = Image.new("RGB", (width, height), (11, 16, 32))
    draw = ImageDraw.Draw(image)

    title_font = load_font(spec["fontBold"], int(height * 0.088))
    subtitle_font = load_font(spec["fontRegular"], int(height * 0.039))
    line_font = load_font(spec["fontRegular"], int(height * 0.034))

    draw.text(
        (width / 2, height * 0.33),
        spec.get("title", ""),
        font=title_font,
        fill=(255, 255, 255),
        anchor="mm",
    )
    draw.text(
        (width / 2, height * 0.435),
        spec.get("subtitle", ""),
        font=subtitle_font,
        fill=(160, 172, 190),
        anchor="mm",
    )

    draw.rounded_rectangle(
        [width / 2 - 60, height * 0.52, width / 2 + 60, height * 0.52 + 4],
        radius=2,
        fill=(124, 247, 196),
    )

    lines = spec.get("lines", [])
    y = height * 0.61
    for index, line in enumerate(lines):
        is_last = index == len(lines) - 1
        color = (124, 247, 196) if is_last else (230, 235, 242)
        draw.text((width / 2, y), line, font=line_font, fill=color, anchor="mm")
        y += height * 0.062

    image.save(out)


def main():
    spec_path = sys.argv[1]
    with open(spec_path, encoding="utf-8") as handle:
        spec = json.load(handle)

    width, height = spec["width"], spec["height"]
    for subtitle in spec.get("subtitles", []):
        render_subtitle(subtitle["text"], subtitle["out"], width, height, spec["fontBold"])

    end_card = spec.get("endCard")
    if end_card:
        render_end_card(
            {
                **end_card,
                "fontBold": spec["fontBold"],
                "fontRegular": spec["fontRegular"],
            },
            end_card["out"],
            width,
            height,
        )


if __name__ == "__main__":
    main()
