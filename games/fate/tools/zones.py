"""Fate's zones drawn on a battle map made by games/tools/mapgen.py: the sea
washed over the cells a layout calls water, and each zone outlined in its
own colour (a dashed line, no lettering: the scenario's text names each
zone by its colour). The walls file is not touched.

Usage: python games/fate/tools/zones.py layout.json map.webp
A layout's "zones": [{"x","y","w","h","color": [r,g,b]}] and "water": [{"x","y","w","h"}] (in grid squares).
"""
import json
import math
import random
import sys

from PIL import Image, ImageDraw, ImageFilter


def main(layout_file, image_file):
    spec = json.load(open(layout_file, encoding="utf-8"))
    cell = spec.get("cell", 70)
    img = Image.open(image_file).convert("RGB")
    width, height = img.size
    rng = random.Random(spec.get("seed", 1))
    # The sea: deep blue-green over the sand, darker away from the shore, with foam lines.
    for area in spec.get("water", []):
        x0, y0, x1, y1 = area["x"] * cell, area["y"] * cell, (area["x"] + area["w"]) * cell, (area["y"] + area["h"]) * cell
        sea = Image.new("RGB", (width, height), (24, 58, 74))
        mask = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(mask)
        for y in range(int(y0), int(y1)):
            # Shallower (lighter, more see-through) toward the shore at the bottom of the area.
            depth = (y1 - y) / max(1, y1 - y0)
            draw.line([x0, y, x1, y], fill=int(140 + 100 * depth))
        mask = mask.filter(ImageFilter.GaussianBlur(cell * 0.3))
        img = Image.composite(sea, img, mask)
        draw = ImageDraw.Draw(img)
        for _ in range(int((x1 - x0) * (y1 - y0) / (cell * cell) * 1.2)):
            fx = rng.uniform(x0, x1)
            fy = rng.uniform(y0, y1)
            length = rng.uniform(cell * 0.4, cell * 1.4)
            points = [(fx + t * length, fy + math.sin(t * 6 + fx) * cell * 0.06) for t in [i / 8 for i in range(9)]]
            draw.line(points, fill=(150, 190, 196), width=2)
        # Foam where it meets the sand.
        for step in range(int((x1 - x0) / 6)):
            fx = x0 + step * 6
            fy = y1 - cell * 0.15 + math.sin(step * 0.7) * cell * 0.12
            draw.ellipse([fx - 4, fy - 3, fx + 4, fy + 3], fill=(206, 222, 220))
    # The zones: a dashed outline, a little inside the area, in the zone's colour.
    draw = ImageDraw.Draw(img)
    for zone in spec.get("zones", []):
        color = tuple(zone.get("color", [230, 200, 90]))
        inset = 6
        x0, y0 = zone["x"] * cell + inset, zone["y"] * cell + inset
        x1, y1 = (zone["x"] + zone["w"]) * cell - inset, (zone["y"] + zone["h"]) * cell - inset
        dash, gap = 18, 10
        for (ax, ay, bx, by) in [(x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)]:
            length = math.hypot(bx - ax, by - ay)
            t = 0.0
            while t < length:
                end = min(length, t + dash)
                sx, sy = ax + (bx - ax) * t / length, ay + (by - ay) * t / length
                ex, ey = ax + (bx - ax) * end / length, ay + (by - ay) * end / length
                draw.line([sx, sy, ex, ey], fill=(10, 10, 10), width=7)
                draw.line([sx, sy, ex, ey], fill=color, width=4)
                t = end + gap
    img.save(image_file, "WEBP", quality=88, method=5)
    print(f"{image_file}: {len(spec.get('zones', []))} zones, {len(spec.get('water', []))} water areas")


if __name__ == "__main__":
    main(*sys.argv[1:3])
