"""Kraken's map maker: a battle map drawn from a layout, with its walls and
doors exactly where the picture shows them.

Usage: python games/tools/mapgen.py layout.json out.webp out-walls.json

A layout (all positions in grid squares):
  { "cell": 70, "cols": 24, "rows": 20, "ground": "rock" | "grass" | "dirt",
    "seed": 7, "light": "dark" | "day",
    "floors": [{"x":..,"y":..,"w":..,"h":.., "tex": "flag"|"wood"|"dirt"|"cobble"|"grass"|"metal"|"grate"}],
    "solids": [{"x","y","w","h"}],          # walls inside a floor (a pillar, a tower)
    "doors":  [{"x","y","side": "n"|"s"|"e"|"w", "secret": false}],
    "features": [{"kind": .., "x","y","w","h","dir"}] }
Walls run along every edge between floor and not-floor (and solids); a door
replaces the wall on its cell's side. Walls come out in picture pixels as
[{ "points": [x1,y1,x2,y2], "door": bool }].
"""
import json
import math
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PALETTE = {
    "flag": ((92, 88, 82), 14),
    "cobble": ((86, 82, 76), 16),
    "wood": ((104, 74, 46), 12),
    "dirt": ((88, 70, 52), 14),
    "grass": ((62, 82, 46), 16),
    "rock": ((44, 42, 40), 10),
    "metal": ((70, 76, 82), 8),
    "grate": ((58, 62, 66), 8),
    "deck": ((78, 84, 90), 8),
    "sand": ((150, 128, 92), 12),
    "masonry": ((74, 70, 64), 12),
    "hull": ((48, 54, 60), 8),
}


def noise(width, height, scale, rng, octaves=4):
    """Value noise in 0..1, smooth at the given scale (pixels)."""
    out = np.zeros((height, width), dtype=np.float32)
    amp, total = 1.0, 0.0
    for _ in range(octaves):
        gw, gh = max(2, int(width / scale) + 2), max(2, int(height / scale) + 2)
        grid = rng.random((gh, gw)).astype(np.float32)
        layer = np.array(Image.fromarray((grid * 255).astype(np.uint8)).resize((width, height), Image.BICUBIC), dtype=np.float32) / 255.0
        out += layer * amp
        total += amp
        amp *= 0.5
        scale = max(2, scale / 2)
    return out / total


def tinted(base, spread, mask_noise):
    r, g, b = base
    shade = (mask_noise - 0.5) * 2 * spread
    arr = np.stack([np.clip(r + shade, 0, 255), np.clip(g + shade * 0.95, 0, 255), np.clip(b + shade * 0.9, 0, 255)], axis=-1)
    return arr.astype(np.uint8)


def texture(kind, width, height, cell, rng):
    base, spread = PALETTE.get(kind, PALETTE["flag"])
    n = noise(width, height, cell * 0.6, rng)
    img = Image.fromarray(tinted(base, spread * 2.2, n))
    draw = ImageDraw.Draw(img)
    if kind in ("flag",):
        # Flagstones: two by two a square, mortar lines, each stone its own tone.
        step = cell / 2
        for gy in range(int(height / step) + 1):
            offset = (step / 2) if gy % 2 else 0
            for gx in range(-1, int(width / step) + 2):
                x0, y0 = gx * step + offset, gy * step
                tone = rng.integers(-16, 16)
                fill = tuple(int(max(0, min(255, c + tone))) for c in base)
                draw.rectangle([x0 + 2, y0 + 2, x0 + step - 2, y0 + step - 2], fill=fill)
        img = Image.blend(img, Image.fromarray(tinted(base, spread * 2.5, n)), 0.35)
        draw = ImageDraw.Draw(img)
        for gy in range(int(height / step) + 1):
            offset = (step / 2) if gy % 2 else 0
            draw.line([0, gy * step, width, gy * step], fill=(40, 38, 36), width=2)
            for gx in range(-1, int(width / step) + 2):
                x = gx * step + offset
                draw.line([x, gy * step, x, gy * step + step], fill=(40, 38, 36), width=2)
    elif kind == "cobble":
        for _ in range(int(width * height / (cell * cell) * 14)):
            x, y = rng.random() * width, rng.random() * height
            r = cell * (0.08 + rng.random() * 0.07)
            tone = rng.integers(-22, 18)
            fill = tuple(int(max(0, min(255, c + tone))) for c in base)
            draw.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=fill, outline=(46, 44, 40))
    elif kind == "wood":
        plank = cell / 3
        for gy in range(int(height / plank) + 1):
            tone = rng.integers(-14, 14)
            fill = tuple(int(max(0, min(255, c + tone))) for c in base)
            draw.rectangle([0, gy * plank + 1, width, gy * plank + plank - 1], fill=fill)
            draw.line([0, gy * plank, width, gy * plank], fill=(52, 36, 22), width=2)
            x = rng.random() * cell * 3
            while x < width:
                draw.line([x, gy * plank, x, gy * plank + plank], fill=(58, 40, 24), width=2)
                x += cell * (1.5 + rng.random() * 2)
        grain = noise(width, height, 6, rng, octaves=2)
        img = Image.blend(img, Image.fromarray(tinted(base, spread * 1.5, grain)), 0.25)
    elif kind in ("metal", "deck"):
        step = cell
        for gy in range(int(height / step) + 1):
            for gx in range(int(width / step) + 1):
                x0, y0 = gx * step, gy * step
                draw.rectangle([x0 + 1, y0 + 1, x0 + step - 1, y0 + step - 1], outline=(40, 44, 48), width=2)
                for cx, cy in ((x0 + 6, y0 + 6), (x0 + step - 6, y0 + 6), (x0 + 6, y0 + step - 6), (x0 + step - 6, y0 + step - 6)):
                    draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(110, 116, 122))
    elif kind in ("masonry", "hull"):
        # The top of a thick wall: laid blocks (stone) or riveted plates (a hull).
        bw, bh = (cell / 2, cell / 3) if kind == "masonry" else (cell, cell / 2)
        for gy in range(int(height / bh) + 1):
            offset = (bw / 2) if gy % 2 else 0
            for gx in range(-1, int(width / bw) + 2):
                x0, y0 = gx * bw + offset, gy * bh
                tone = rng.integers(-14, 14)
                fill = tuple(int(max(0, min(255, c + tone))) for c in base)
                draw.rectangle([x0 + 2, y0 + 2, x0 + bw - 2, y0 + bh - 2], fill=fill, outline=(28, 26, 24))
                draw.line([x0 + 3, y0 + 3, x0 + bw - 3, y0 + 3], fill=tuple(min(255, c + 24) for c in fill), width=2)
    elif kind == "grate":
        step = cell / 5
        for gx in range(int(width / step) + 1):
            draw.line([gx * step, 0, gx * step, height], fill=(30, 32, 36), width=3)
    elif kind == "grass":
        for _ in range(int(width * height / (cell * cell) * 30)):
            x, y = rng.random() * width, rng.random() * height
            tone = rng.integers(-26, 26)
            draw.line([x, y, x + rng.integers(-3, 4), y - rng.integers(3, 9)], fill=(int(max(0, base[0] + tone)), int(max(0, base[1] + tone + 10)), int(max(0, base[2] + tone))), width=1)
    elif kind == "space":
        # Deep space: black, a faint nebula, stars.
        img = Image.fromarray(tinted((8, 10, 16), 10, noise(width, height, cell * 4, rng)))
        draw = ImageDraw.Draw(img)
        for _ in range(int(width * height / 900)):
            x, y = rng.random() * width, rng.random() * height
            b = int(120 + rng.random() * 135)
            r = 0.6 if rng.random() < 0.9 else 1.4
            draw.ellipse([x - r, y - r, x + r, y + r], fill=(b, b, min(255, b + 20)))
    elif kind in ("rock", "dirt", "sand"):
        for _ in range(int(width * height / (cell * cell) * (3 if kind == "rock" else 6))):
            x, y = rng.random() * width, rng.random() * height
            r = cell * rng.random() * (0.12 if kind == "rock" else 0.05)
            tone = rng.integers(-18, 12)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(max(0, c + tone)) for c in base))
    return img


def rect_cells(spec):
    return [(x, y) for x in range(spec["x"], spec["x"] + spec["w"]) for y in range(spec["y"], spec["y"] + spec["h"])]


def walls_of(floor, cols, rows, doors):
    """Edges between floor and not-floor, merged into long runs; doors apart."""
    door_edges = {}
    for door in doors:
        x, y, side = door["x"], door["y"], door["side"]
        edge = {"n": ("h", x, y), "s": ("h", x, y + 1), "w": ("v", x, y), "e": ("v", x + 1, y)}[side]
        door_edges[edge] = door
    h_edges, v_edges = set(), set()
    for y in range(rows + 1):
        for x in range(cols):
            above = floor[y - 1][x] if y > 0 else False
            below = floor[y][x] if y < rows else False
            if above != below and 0 < y < rows:
                h_edges.add((x, y))
    for x in range(cols + 1):
        for y in range(rows):
            left = floor[y][x - 1] if x > 0 else False
            right = floor[y][x] if x < cols else False
            if left != right and 0 < x < cols:
                v_edges.add((x, y))
    walls, doors_out = [], []
    for edge, door in door_edges.items():
        kind, x, y = edge
        if kind == "h":
            h_edges.discard((x, y))
            doors_out.append({"points": [x, y, x + 1, y], "door": True, "secret": bool(door.get("secret"))})
        else:
            v_edges.discard((x, y))
            doors_out.append({"points": [x, y, x, y + 1], "door": True, "secret": bool(door.get("secret"))})
    for y in range(rows + 1):
        x = 0
        while x < cols:
            if (x, y) in h_edges:
                start = x
                while (x, y) in h_edges:
                    x += 1
                walls.append({"points": [start, y, x, y]})
            else:
                x += 1
    for x in range(cols + 1):
        y = 0
        while y < rows:
            if (x, y) in v_edges:
                start = y
                while (x, y) in v_edges:
                    y += 1
                walls.append({"points": [x, start, x, y]})
            else:
                y += 1
    return walls, doors_out


def feature(draw, img, kind, x, y, w, h, cell, rng, extra):
    X, Y, W, H = x * cell, y * cell, w * cell, h * cell
    cx, cy = X + W / 2, Y + H / 2
    if kind == "stairs":
        steps = int(max(W, H) / (cell / 4))
        vertical = extra.get("dir", "n") in ("n", "s")
        for i in range(steps):
            tone = 120 - int(70 * i / max(1, steps))
            if vertical:
                draw.rectangle([X + 4, Y + i * H / steps, X + W - 4, Y + (i + 1) * H / steps - 2], fill=(tone, tone - 4, tone - 10), outline=(30, 28, 26))
            else:
                draw.rectangle([X + i * W / steps, Y + 4, X + (i + 1) * W / steps - 2, Y + H - 4], fill=(tone, tone - 4, tone - 10), outline=(30, 28, 26))
    elif kind == "spiral":
        draw.ellipse([X + 4, Y + 4, X + W - 4, Y + H - 4], fill=(70, 66, 60), outline=(30, 28, 26), width=3)
        for i in range(10):
            a = i * math.pi / 5
            draw.line([cx, cy, cx + math.cos(a) * W / 2.2, cy + math.sin(a) * H / 2.2], fill=(40, 38, 34), width=2)
        draw.ellipse([cx - W / 8, cy - H / 8, cx + W / 8, cy + H / 8], fill=(50, 46, 42))
    elif kind == "rubble":
        for _ in range(int(w * h * 9)):
            px, py = X + rng.random() * W, Y + rng.random() * H
            r = cell * (0.05 + rng.random() * 0.12)
            tone = rng.integers(70, 120)
            draw.polygon([(px + math.cos(a) * r * (0.6 + rng.random() * 0.5), py + math.sin(a) * r * (0.6 + rng.random() * 0.5)) for a in np.linspace(0, 2 * math.pi, 6, endpoint=False)], fill=(tone, tone - 4, tone - 10), outline=(34, 32, 30))
    elif kind in ("table", "bed", "crate", "chest", "coffin", "altar", "cart", "console", "bunk", "locker"):
        colors = {"table": (112, 78, 44), "bed": (96, 70, 46), "crate": (120, 92, 54), "chest": (110, 72, 36), "coffin": (70, 50, 36), "altar": (130, 128, 122), "cart": (100, 72, 42), "console": (54, 64, 74), "bunk": (70, 78, 86), "locker": (80, 88, 96)}
        fill = colors[kind]
        draw.rectangle([X + 6, Y + 6, X + W - 6, Y + H - 6], fill=fill, outline=(28, 22, 16), width=3)
        if kind == "bed" or kind == "bunk":
            draw.rectangle([X + 10, Y + 10, X + W - 10, Y + min(H, cell) * 0.35], fill=(170, 160, 140))
        if kind in ("crate", "chest"):
            draw.line([X + 6, Y + 6, X + W - 6, Y + H - 6], fill=(70, 50, 30), width=3)
            draw.line([X + W - 6, Y + 6, X + 6, Y + H - 6], fill=(70, 50, 30), width=3)
        if kind == "coffin":
            draw.line([cx, Y + 12, cx, Y + H - 12], fill=(140, 120, 90), width=3)
            draw.line([X + 14, Y + H * 0.3, X + W - 14, Y + H * 0.3], fill=(140, 120, 90), width=3)
        if kind == "console":
            for i in range(4):
                draw.rectangle([X + 12 + i * (W - 24) / 4, Y + 12, X + 8 + (i + 1) * (W - 24) / 4, Y + H / 2], fill=(40, 140, 160) if i % 2 else (160, 120, 40))
        if kind == "altar":
            draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(200, 40, 30))
    elif kind in ("barrel", "brazier", "well", "pillar", "beacon", "tree", "bush", "web", "blood", "bones", "pool", "lamp", "reactor", "cryopod"):
        r = min(W, H) / 2 - 4
        if kind == "barrel":
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(110, 76, 40), outline=(40, 28, 16), width=3)
            draw.ellipse([cx - r * 0.6, cy - r * 0.6, cx + r * 0.6, cy + r * 0.6], outline=(60, 42, 22), width=2)
        elif kind == "brazier" or kind == "lamp":
            glow = Image.new("L", img.size, 0)
            ImageDraw.Draw(glow).ellipse([cx - r * 3, cy - r * 3, cx + r * 3, cy + r * 3], fill=120)
            glow = glow.filter(ImageFilter.GaussianBlur(r * 1.5))
            img.paste(Image.new("RGB", img.size, (255, 170, 70)), (0, 0), glow)
            draw.ellipse([cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7], fill=(60, 50, 44), outline=(20, 18, 16), width=3)
            draw.ellipse([cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4], fill=(255, 190, 90))
        elif kind == "beacon":
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(66, 60, 54), outline=(24, 22, 20), width=4)
            draw.ellipse([cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7], fill=(36, 32, 30))
            for _ in range(14):
                a = rng.random() * 2 * math.pi
                draw.line([cx, cy, cx + math.cos(a) * r * 0.6, cy + math.sin(a) * r * 0.6], fill=(80, 60, 40), width=4)
        elif kind == "well" or kind == "pool":
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(80, 76, 70), outline=(30, 28, 26), width=4)
            draw.ellipse([cx - r * 0.75, cy - r * 0.75, cx + r * 0.75, cy + r * 0.75], fill=(18, 30, 36))
        elif kind == "pillar":
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(96, 92, 86), outline=(30, 28, 26), width=4)
        elif kind == "tree":
            shadow = Image.new("L", img.size, 0)
            ImageDraw.Draw(shadow).ellipse([cx - r + 10, cy - r + 14, cx + r + 10, cy + r + 14], fill=140)
            img.paste(Image.new("RGB", img.size, (10, 14, 8)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(10)))
            for _ in range(9):
                a, d = rng.random() * 2 * math.pi, rng.random() * r * 0.5
                rr = r * (0.45 + rng.random() * 0.25)
                tone = rng.integers(-14, 14)
                draw.ellipse([cx + math.cos(a) * d - rr, cy + math.sin(a) * d - rr, cx + math.cos(a) * d + rr, cy + math.sin(a) * d + rr], fill=(40 + tone, 62 + tone, 32 + tone))
        elif kind == "bush":
            for _ in range(5):
                a, d = rng.random() * 2 * math.pi, rng.random() * r * 0.4
                rr = r * 0.5
                draw.ellipse([cx + math.cos(a) * d - rr, cy + math.sin(a) * d - rr, cx + math.cos(a) * d + rr, cy + math.sin(a) * d + rr], fill=(48, 70, 38))
        elif kind == "web":
            for i in range(8):
                a = i * math.pi / 4
                draw.line([cx, cy, cx + math.cos(a) * r * 1.4, cy + math.sin(a) * r * 1.4], fill=(210, 210, 200), width=1)
            for k in range(1, 5):
                pts = [(cx + math.cos(i * math.pi / 4) * r * 1.4 * k / 4, cy + math.sin(i * math.pi / 4) * r * 1.4 * k / 4) for i in range(9)]
                draw.line(pts, fill=(200, 200, 190), width=1)
        elif kind == "blood":
            for _ in range(6):
                px, py, rr = cx + rng.normal() * r * 0.4, cy + rng.normal() * r * 0.4, r * (0.15 + rng.random() * 0.3)
                draw.ellipse([px - rr, py - rr, px + rr, py + rr], fill=(90, 14, 12))
        elif kind == "bones":
            for _ in range(7):
                px, py, a = cx + rng.normal() * r * 0.5, cy + rng.normal() * r * 0.5, rng.random() * math.pi
                L = r * (0.3 + rng.random() * 0.4)
                draw.line([px - math.cos(a) * L, py - math.sin(a) * L, px + math.cos(a) * L, py + math.sin(a) * L], fill=(214, 206, 186), width=4)
            draw.ellipse([cx - r * 0.25, cy - r * 0.3, cx + r * 0.25, cy + r * 0.2], fill=(220, 212, 192), outline=(90, 84, 70))
        elif kind == "reactor":
            glow = Image.new("L", img.size, 0)
            ImageDraw.Draw(glow).ellipse([cx - r * 1.6, cy - r * 1.6, cx + r * 1.6, cy + r * 1.6], fill=110)
            img.paste(Image.new("RGB", img.size, (80, 200, 255)), (0, 0), glow.filter(ImageFilter.GaussianBlur(r * 0.8)))
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(50, 58, 66), outline=(20, 24, 28), width=5)
            draw.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5], fill=(150, 230, 255))
        elif kind == "cryopod":
            draw.rounded_rectangle([X + 8, Y + 8, X + W - 8, Y + H - 8], radius=12, fill=(66, 80, 92), outline=(24, 28, 32), width=3)
            draw.rounded_rectangle([X + 16, Y + 16, X + W - 16, Y + H - 16], radius=10, fill=(120, 190, 210))


def main(layout_path, out_image, out_walls):
    spec = json.load(open(layout_path, encoding="utf-8"))
    cell, cols, rows = spec.get("cell", 70), spec["cols"], spec["rows"]
    rng = np.random.default_rng(spec.get("seed", 7))
    random.seed(spec.get("seed", 7))
    width, height = cols * cell, rows * cell
    floor = [[False] * cols for _ in range(rows)]
    tex_of = [[None] * cols for _ in range(rows)]
    for area in spec.get("floors", []):
        for x, y in rect_cells(area):
            if 0 <= x < cols and 0 <= y < rows:
                floor[y][x] = True
                tex_of[y][x] = area.get("tex", "flag")
    for area in spec.get("solids", []):
        for x, y in rect_cells(area):
            if 0 <= x < cols and 0 <= y < rows:
                floor[y][x] = False
    # A hull (a ship, a station): every cell next to a floor that is not floor becomes solid.
    if spec.get("autoSolid"):
        auto = []
        for y in range(rows):
            for x in range(cols):
                if floor[y][x]:
                    continue
                if any(0 <= x + dx < cols and 0 <= y + dy < rows and floor[y + dy][x + dx] for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                    auto.append({"x": x, "y": y, "w": 1, "h": 1})
        spec.setdefault("solids", []).extend(auto)
    # The ground everywhere, then each floor's texture in its cells.
    img = texture(spec.get("ground", "rock"), width, height, cell, rng)
    textures = {}
    mask_of = {}
    for y in range(rows):
        for x in range(cols):
            if floor[y][x]:
                kind = tex_of[y][x]
                mask_of.setdefault(kind, Image.new("L", (width, height), 0))
                ImageDraw.Draw(mask_of[kind]).rectangle([x * cell, y * cell, (x + 1) * cell - 1, (y + 1) * cell - 1], fill=255)
    for kind, mask in mask_of.items():
        textures[kind] = texture(kind, width, height, cell, rng)
        img.paste(textures[kind], (0, 0), mask)
    # Solid walls (a tower's thick walls, a pillar of rock): their own masonry.
    solid_mask = Image.new("L", (width, height), 0)
    for area in spec.get("solids", []):
        ImageDraw.Draw(solid_mask).rectangle([area["x"] * cell, area["y"] * cell, (area["x"] + area["w"]) * cell - 1, (area["y"] + area["h"]) * cell - 1], fill=255)
    if spec.get("solids"):
        img.paste(texture(spec.get("solidTex", "masonry"), width, height, cell, rng), (0, 0), solid_mask)
    floor_mask = Image.new("L", (width, height), 0)
    for kind, mask in mask_of.items():
        floor_mask.paste(255, (0, 0), mask)
    # Shadow where the floor meets the walls.
    dark = floor_mask.point(lambda v: 255 - v).filter(ImageFilter.GaussianBlur(cell * 0.35))
    shade = Image.composite(Image.new("RGB", (width, height), (0, 0, 0)), img, dark.point(lambda v: int(v * 0.55)))
    img = Image.composite(shade, img, floor_mask)
    draw = ImageDraw.Draw(img)
    for item in spec.get("features", []):
        feature(draw, img, item["kind"], item["x"], item["y"], item.get("w", 1), item.get("h", 1), cell, rng, item)
        draw = ImageDraw.Draw(img)
    walls, doors = walls_of(floor, cols, rows, spec.get("doors", []))
    # Walls: thick dressed stone (or bulkhead) along each run, a light edge on top.
    thick = int(cell * (0.22 if spec.get("ground") != "deck" else 0.18))
    wall_color = tuple(spec.get("wallColor", (66, 62, 58)))
    for wall in walls:
        x1, y1, x2, y2 = [v * cell for v in wall["points"]]
        draw.line([x1, y1, x2, y2], fill=(24, 22, 20), width=thick + 6)
    for wall in walls:
        x1, y1, x2, y2 = [v * cell for v in wall["points"]]
        draw.line([x1, y1, x2, y2], fill=wall_color, width=thick)
    for wall in walls:
        x1, y1, x2, y2 = [v * cell for v in wall["points"]]
        draw.line([x1, y1, x2, y2], fill=tuple(min(255, c + 30) for c in wall_color), width=max(2, thick // 5))
    # Doors: a door leaf across the gap (a secret door is drawn as wall).
    for door in doors:
        x1, y1, x2, y2 = [v * cell for v in door["points"]]
        if door.get("secret"):
            draw.line([x1, y1, x2, y2], fill=wall_color, width=thick)
            continue
        if y1 == y2:
            draw.rectangle([x1 + 6, y1 - thick * 0.45, x2 - 6, y1 + thick * 0.45], fill=(120, 82, 44), outline=(36, 24, 12), width=3)
            draw.line([x1 + cell / 2, y1 - thick * 0.45, x1 + cell / 2, y1 + thick * 0.45], fill=(60, 40, 22), width=2)
        else:
            draw.rectangle([x1 - thick * 0.45, y1 + 6, x1 + thick * 0.45, y2 - 6], fill=(120, 82, 44), outline=(36, 24, 12), width=3)
            draw.line([x1 - thick * 0.45, y1 + cell / 2, x1 + thick * 0.45, y1 + cell / 2], fill=(60, 40, 22), width=2)
    # A little vignette.
    if spec.get("light", "dark") == "dark":
        yy, xx = np.mgrid[0:height, 0:width]
        d = np.sqrt(((xx - width / 2) / (width / 2)) ** 2 + ((yy - height / 2) / (height / 2)) ** 2)
        v = np.clip(1 - (d - 0.75) * 0.6, 0.7, 1)[..., None]
        img = Image.fromarray((np.array(img).astype(np.float32) * v).astype(np.uint8))
    img.save(out_image, "WEBP", quality=88, method=5)
    px = lambda points: [round(p * cell, 1) for p in points]
    out = [{"points": px(w["points"])} for w in walls] + [{"points": px(d["points"]), "door": True, **({"secret": True} if d.get("secret") else {})} for d in doors]
    json.dump({"width": width, "height": height, "grid": cell, "walls": out}, open(out_walls, "w", encoding="utf-8"))
    print(f"{out_image}: {width}x{height}, {len(walls)} wall runs, {len(doors)} doors")


if __name__ == "__main__":
    main(*sys.argv[1:4])
