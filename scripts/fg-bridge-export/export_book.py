"""Make a Maelstrom pack from a book Fantasy Grounds has loaded, read through
the Kraken Agent Bridge: for store books FG keeps encrypted, which no file
reader can open. See docs/kraken-pack-format.md, "Books FG keeps encrypted".

  python scripts/fg-bridge-export/export_book.py "AD&D 2E Players Handbook" [...more]
  python scripts/fg-bridge-export/export_book.py --list books.json

For each book, which must be loaded in the open FG campaign:
  1. its records, every top-level node, through the bridge's db_xml command
     (real field types, categories, links), into <FG data>/kraken_exports/<book>/;
  2. its pictures: each image record opened in FG at 1:1, captured from FG's
     window (tiled when bigger than the window) and saved as WebP (quality 85),
     with images.json linking each record path to its file;
  3. db.xml again, with each picture's file in its record and in every page
     block that links to it;
  4. the pack, made by Maelstrom's own pack maker, into the packs folder;
  5. every section's record count, against FG's own.
Prints one JSON line per book. Pictures already captured are kept (delete a
book's images.json to capture them again)."""
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageChops

from fgbridge import FG_DATA, batch, client_shot, tool

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUT = FG_DATA / "kraken_exports"
PACKS = Path(os.environ.get("KRAKEN_PACKS") or Path.home() / "Documents" / "Kraken VTT" / "Packs")
FG_RULESETS = {"AD&D 2E": "2E"}  # the FG ruleset name a module's definition.xml needs


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def folder_of(book):
    return OUT / re.sub(r'[<>:"/\\|?*]', "_", book)


def roots_of(book):
    steps = [{"cmd": "call", "args": {"package": "DB", "fn": "getRoot", "args": [book]}},
             {"cmd": "call", "args": {"package": "DB", "fn": "getChildren", "args": [{"$ref": "1.result.1"}]}}]
    return sorted(batch(steps)[1]["result"][0].keys())


def children(path):
    r = tool("fgu_db_list", {"path": path})
    return [c["name"] for c in r["data"].get("children", [])] if r.get("ok") else []


# ---- 1 and 3: records -------------------------------------------------------

def picture_xml(entry):
    grid = ""
    if entry.get("grid"):
        gx, gy = (list(entry["grid"]) + [entry["grid"][0]])[:2]
        grid = f"<grid>on</grid><gridsize>{gx},{gy}</gridsize>"
    return (f'<image type="image">{grid}<layers><layer><name></name><id>0</id><parentid>-1</parentid>'
            f'<type>image</type><bitmap>{esc(entry["file"])}</bitmap></layer></layers></image>')


def inject_pictures(folder, db):
    """Fill the empty image fields from images.json: each image record by its
    own path, each page block by its imagelink."""
    mf = folder / "images.json"
    if not mf.exists():
        return db, 0
    pics = json.loads(mf.read_text(encoding="utf-8"))
    filled = 0

    def record(m):
        nonlocal filled
        entry = pics.get("image." + m.group(1))
        if not entry:
            return m.group(0)
        filled += 1
        return f"<{m.group(1)}>" + picture_xml(entry) + m.group(2)

    i = db.find("<image>")
    j = db.find("</image>", i)
    if i >= 0:
        db = db[:i] + re.sub(r'<(id-\d+)><image type="image" />(.*?</\1>)', record, db[i:j], flags=re.S) + db[j:]

    def block(m):
        nonlocal filled
        entry = pics.get(m.group(2))
        if not entry:
            return m.group(0)
        filled += 1
        return picture_xml(entry) + m.group(1)

    db = re.sub(r'<image type="image" />(<imagelink type="windowreference"><class>imagewindow</class>'
                r'<recordname>([^<]+)</recordname></imagelink>)', block, db)
    return db, filled


def dump(book):
    strip = "@" + book
    info = batch([{"cmd": "call", "args": {"package": "Module", "fn": "getModuleInfo", "args": [book]}}])[0]["result"][0]
    if not info.get("loaded"):
        raise RuntimeError(f"{book} is not loaded in Fantasy Grounds")
    ruleset = tool("fgu_status", {}).get("fg", {}).get("ruleset") or "2E"
    parts = []
    for root in roots_of(book):
        xml = batch([{"cmd": "db_xml", "args": {"paths": [root + strip], "strip": strip}}])[0]["xml"][root + strip]
        if xml:
            parts.append(xml)
    folder = folder_of(book)
    folder.mkdir(parents=True, exist_ok=True)
    db = '<?xml version="1.0" encoding="utf-8"?>\n<root version="4.1">' + "".join(parts) + "</root>\n"
    db, filled = inject_pictures(folder, db)
    (folder / "db.xml").write_text(db, encoding="utf-8")
    (folder / "definition.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<root version="4.1">'
        f'<name>{esc(book)}</name><displayname>{esc(info.get("displayname") or book)}</displayname>'
        f'<category>{esc(info.get("category") or "")}</category><author>{esc(info.get("author") or "")}</author>'
        f'<ruleset>{esc(ruleset)}</ruleset></root>\n', encoding="utf-8")
    return folder, filled


# ---- 2: pictures ------------------------------------------------------------

CHROME_W, CHROME_H = 24, 100   # an imagewindow's frame around its image control
MAX_W, MAX_H = 2440, 1120      # the largest image control that fits FG's window
MAX_DIFFERENCE = 30            # fit_check: above this a capture is refused (good ones score 0-20, dense line art the most; a shifted one 100+)


def wcall(path, fn, args=None, control="image"):
    a = {"class": "imagewindow", "path": path, "fn": fn, "args": args or []}
    if control:
        a["control"] = control
    r = tool("fgu_window_call", a)
    if not r.get("ok"):
        raise RuntimeError(f"{fn}: {json.dumps(r)[:300]}")
    return r["data"].get("result", [])


def stable_shot(box, tries=12):
    """Capture until two captures agree (FG has finished drawing)."""
    prev = None
    for _ in range(tries):
        time.sleep(0.35)
        img = client_shot().crop(box)
        if prev is not None and not ImageChops.difference(img, prev).getbbox():
            return img
        prev = img
    return prev


def fit_check(path, out, box):
    """FG's own zoomToFit view of the picture, against the capture shrunk to the
    same size: the mean difference per channel (0 = identical). Catches a
    capture that is offset, cut or the wrong scale."""
    wcall(path, "zoomToFit")
    _, _, zoom = wcall(path, "getViewpoint")
    left, top, cw, ch = box
    iw, ih = out.size
    fw, fh = max(1, round(iw * zoom)), max(1, round(ih * zoom))
    fx, fy = left + round(cw / 2 - fw / 2), top + round(ch / 2 - fh / 2)
    shown = stable_shot((fx, fy, fx + fw, fy + fh)).convert("RGB")
    ours = out.resize((fw, fh), Image.LANCZOS)
    diff = ImageChops.difference(shown, ours).convert("L")
    return sum(i * n for i, n in enumerate(diff.histogram())) / (fw * fh)


def capture_one(path):
    tool("fgu_window_open", {"class": "imagewindow", "path": path})
    try:
        iw, ih = wcall(path, "getImageSize")
        wcall(path, "setPosition", [0, 0], control="")
        wcall(path, "setSize", [min(iw, MAX_W) + CHROME_W, min(ih, MAX_H) + CHROME_H], control="")
        wcall(path, "bringToFront", control="")
        time.sleep(0.3)
        wx, wy = wcall(path, "getPosition", control="")
        px, py = wcall(path, "getPosition")
        cw, ch = wcall(path, "getSize")
        left, top = wx + px, wy + py
        # The picture's centre in FG's view coordinates: some pictures count
        # from their top left corner, others from their centre. zoomToFit
        # centres the view on it either way.
        wcall(path, "zoomToFit")
        cx0, cy0, _ = wcall(path, "getViewpoint")
        out = Image.new("RGB", (iw, ih))
        tile_w, tile_h = min(cw, iw), min(ch, ih)
        for ty in range(0, ih, tile_h):
            for tx in range(0, iw, tile_w):
                tw, th = min(tile_w, iw - tx), min(tile_h, ih - ty)
                # View centred (zoom 1) on picture pixel (u, v): pixel (x, y)
                # shows at control (cw/2 + x - u, ch/2 + y - v).
                u, v = tx + tile_w / 2, ty + tile_h / 2
                wcall(path, "setViewpoint", [cx0 + u - iw / 2, cy0 + v - ih / 2, 1])
                x0, y0 = left + round(cw / 2 + tx - u), top + round(ch / 2 + ty - v)
                out.paste(stable_shot((x0, y0, x0 + tw, y0 + th)), (tx, ty))
        difference = fit_check(path, out, (left, top, cw, ch))
        grid = None
        try:
            if wcall(path, "hasGrid")[0]:
                grid = wcall(path, "getGridSize")
        except Exception:
            pass
        return out, [iw, ih], grid, difference
    finally:
        tool("fgu_window_close", {"class": "imagewindow", "path": path})


def capture(book):
    folder = folder_of(book)
    (folder / "images").mkdir(parents=True, exist_ok=True)
    mf = folder / "images.json"
    pics = json.loads(mf.read_text(encoding="utf-8")) if mf.exists() else {}
    listed = tool("fgu_db_list", {"path": "image@" + book})["data"].get("children", [])
    done, failed = 0, []
    for c in listed:
        rid = c["name"]
        key = f"image.{rid}"
        if key in pics and (folder / pics[key]["file"]).exists():
            continue
        try:
            img, size, grid, difference = capture_one(f"image.{rid}@{book}")
            if difference > MAX_DIFFERENCE:
                raise RuntimeError(f"capture differs from FG's own view (mean difference {difference:.1f})")
            rel = f"images/{rid}.webp"
            img.save(folder / rel, "WEBP", quality=85, method=6)
            pics[key] = {"file": rel, "name": c.get("label", ""), "size": size, "grid": grid, "difference": round(difference, 1)}
            done += 1
        except Exception as e:
            failed.append([rid, str(e)[:200]])
        mf.write_text(json.dumps(pics, indent=1), encoding="utf-8")
    return {"captured": done, "pictures": len(listed), "failed": failed}


# ---- 4 and 5: pack and check -------------------------------------------------

def node(*args):
    r = subprocess.run(["node", *map(str, args)], capture_output=True, text=True, cwd=REPO)
    if r.returncode:
        raise RuntimeError(r.stderr[-800:])
    return json.loads(r.stdout)


def fg_counts(book):
    sections = []
    for root in roots_of(book):
        if root in ("library", "list"):
            continue
        if root == "reference":
            sections += ["reference." + c for c in children("reference@" + book) if c != "refmanualindex"]
        else:
            sections.append(root)
    res = batch([{"cmd": "call", "args": {"package": "DB", "fn": "getChildCount", "args": [s + "@" + book]}} for s in sections])
    return {s: r["result"][0] for s, r in zip(sections, res)}


def export(book):
    started = time.time()
    dump(book)
    pictures = capture(book)
    folder, filled = dump(book)
    made = node(HERE / "make_pack.cjs", folder, PACKS)
    counts = node(HERE / "count_pack.cjs", made["file"])["counts"]
    mismatch = {s: [n, counts.get(s, 0)] for s, n in fg_counts(book).items() if counts.get(s, 0) != n}
    return {"book": book, "pack": Path(made["file"]).name, "records": made["records"], "pictures": made["pictures"],
            "picture_fields_filled": filled, **pictures, "count_mismatch": mismatch, "secs": round(time.time() - started)}


if __name__ == "__main__":
    books = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8")) if sys.argv[1:2] == ["--list"] else sys.argv[1:]
    for book in books:
        try:
            result = export(book)
        except Exception as e:
            result = {"book": book, "error": str(e)[:600]}
        print(json.dumps(result), flush=True)
