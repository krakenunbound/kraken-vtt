"""Reads the System Reference Document 5.2.1 PDF into a stream of elements
(headings, paragraphs, list items, tables, field lines, stat-block lines) in
reading order, the first step of building Kraken's SRD books.

    python games/srd-5e/tools/extract.py SRD_CC_v5.2.1.pdf out/elements.json

The SRD's own fonts say what each line is: GillSans SemiBold headings (26 a
chapter, 18, 14-15, 12, 10.5 a table's caption), Cambria body text (its bold
and italic runs kept as **bold** / *italic*), GillSans 9-10 table cells and
spell field lines, Optima stat-block lines. Lines are kept in the PDF's own
stream order (its columns are already in reading order); a table's cells are
put into rows and columns by their positions. Words split over a line end
("Bar-" + "barian") are joined, unless the document writes the word with a
hyphen elsewhere.
"""
import json
import re
import sys

import fitz  # PyMuPDF

FOOTER_Y = 735


def role_of(span):
    font, size = span["font"], span["size"]
    # Small capitals: a sidebar's title (Bold), a heading set in small caps (a spell's name), a stat block's STR.
    if "Bold-SC700" in font and "SemiBold" not in font:
        return "sidebar"
    if "SC700" in font and size >= 11:
        return "h4" if size < 13.5 else "h3"
    if font.startswith("Optima") or "SC700" in font or (font.startswith("GillSans") and (size < 7 or 9.7 <= size < 10.2)):
        return "stat"
    if font.startswith("GillSans-SemiBold") and size >= 10.2:
        if size >= 24:
            return "h1"
        if size >= 17:
            return "h2"
        if size >= 13.5:
            return "h3"
        if size >= 11.5:
            return "h4"
        return "h5"
    if font.startswith("GillSans") and size >= 11.5:
        return "section"  # a stat block's Actions / Reactions
    if font.startswith("GillSans"):
        return "tbl"
    return "body"


def style(span):
    font = span["font"]
    bold = "Bold" in font or "SemiBold" in font
    italic = "Italic" in font
    return bold, italic


def split_tabs(raw_spans):
    """Spans from rawdict, cut at tab characters (a table row set as one line
    keeps its cells apart by tabs), each piece with its own extent."""
    out = []
    for span in raw_spans:
        piece = []
        for ch in span["chars"] + [None]:
            if ch is None or ch["c"] == "\t":
                text = "".join(c["c"] for c in piece)
                if text:
                    shown = [c for c in piece if c["c"].strip()] or piece
                    out.append({"text": text, "font": span["font"], "size": span["size"], "bbox": (shown[0]["bbox"][0], span["bbox"][1], shown[-1]["bbox"][2], span["bbox"][3])})
                if ch is not None:
                    out.append({"text": "\t", "font": span["font"], "size": span["size"], "bbox": (ch["bbox"][0], span["bbox"][1], ch["bbox"][2], span["bbox"][3])})
                piece = []
            else:
                piece.append(ch)
    return out


def reading_order(lines):
    """A page's lines in reading order. The PDF's stream is mostly in order,
    but a block set into a column later (a spell's stat block, the rest of a
    column under it) can come after the other column. The stream is cut into
    runs (a jump back up the page, or into the other column, starts a run; a
    table's cells stay in their run), and the runs are read column by column
    within each band of the page between full-width runs (a class's features
    table across the page)."""
    runs = []
    boxed = ("tbl", "sidebar")
    for line in lines:
        col = 0 if line["x0"] < 300 else 1
        prev = runs[-1]["lines"][-1] if runs else None
        # A sidebar starts its own run, and the text after a box or a table starts another.
        cut = prev is not None and (line["role"] == "sidebar" or (prev["role"] in boxed and line["role"] not in boxed))
        # A table's cells, in either column, near the cell before (a table across the page).
        cell = prev is not None and line["role"] == "tbl" and prev["role"] == "tbl" and abs(line["y0"] - prev["y0"]) <= 40
        if runs and not cut and (cell or (col == runs[-1]["col"] and line["y0"] >= prev["y0"] - 20)):
            runs[-1]["lines"].append(line)
        else:
            runs.append({"col": col, "lines": [line]})
    for run in runs:
        run["top"] = min(l["y0"] for l in run["lines"])
        run["full"] = min(l["x0"] for l in run["lines"]) < 290 and max(l["x1"] for l in run["lines"]) > 340
    # A full-width table (a class's features table) is read after the page's
    # text, as the stream has it, so a paragraph running on from the page
    # before is not cut by it.
    # So is a sidebar, which the columns' text flows around.
    tables = [r for r in runs if (r["full"] and all(l["role"] in ("tbl", "h5") for l in r["lines"])) or r["lines"][0]["role"] == "sidebar"]
    for run in tables:
        run["full"] = False
        run["table"] = True
    runs = [r for r in runs if not r.get("table")]
    fulls = sorted((r for r in runs if r["full"]), key=lambda r: r["top"])
    ordered = []
    for band in range(len(fulls) + 1):
        lo = fulls[band - 1]["top"] if band else -1
        hi = fulls[band]["top"] if band < len(fulls) else 1e9
        inside = [r for r in runs if not r["full"] and lo <= r["top"] < hi]
        ordered += sorted(inside, key=lambda r: (r["col"], r["top"]))
        if band < len(fulls):
            ordered.append(fulls[band])
    ordered += tables
    return [line for run in ordered for line in run["lines"]]


def lines_of(doc):
    out = []
    for pno, page in enumerate(doc, start=1):
        start = len(out)
        for block in page.get_text("rawdict")["blocks"]:
            for line in block.get("lines", []):
                spans = [s for s in split_tabs(line["spans"]) if s["text"] != ""]
                if not spans:
                    continue
                x0, y0, x1, y1 = line["bbox"]
                if y0 > FOOTER_Y:
                    continue
                text = "".join(s["text"] for s in spans)
                if not text.strip():
                    continue
                first = next((s for s in spans if s["text"].strip()), spans[0])
                out.append({
                    "page": pno,
                    "x0": round(x0, 1),
                    "y0": round(y0, 1),
                    "x1": round(x1, 1),
                    "role": role_of(first),
                    "size": round(first["size"], 1),
                    "spans": [{"t": s["text"], "f": s["font"], "s": round(s["size"], 1), "x0": round(s["bbox"][0], 1), "x1": round(s["bbox"][2], 1)} for s in spans],
                })
        out[start:] = reading_order(out[start:])
    return out


def field_lines(lines):
    """Origins' field lines are set a little larger (GillSans 9.8, as a stat
    block's numbers): a "Label:" line and the plain lines under it are fields."""
    open_field = False
    for line in lines:
        first = next((s for s in line["spans"] if s["t"].strip()), None)
        big = first and first["f"].startswith("GillSans") and "SC700" not in first["f"] and 9.7 <= first["s"] < 10.2
        if big and first["f"] == "GillSans-SemiBold" and re.match(r"^[A-Z][A-Za-z ]+:\s*$", first["t"].replace(" ", " ")):
            line["role"] = "tbl"
            open_field = True
        elif big and open_field and "Bold" not in first["f"]:
            line["role"] = "tbl"
        else:
            open_field = False
    return lines


def clean(text):
    return (text.replace(" ", " ").replace("−", "-").replace("’", "'").replace("‘", "'")
            .replace("“", '"').replace("”", '"').replace("­", "").replace("\t", " "))


def marked(spans, markup=True):
    """A line's text, with bold and italic runs as markdown."""
    out = ""
    for span in spans:
        text = clean(span["t"])
        if not markup or not text.strip():
            out += text
            continue
        bold, italic = style({"font": span["f"]})
        if span["f"].startswith("GillSans"):
            bold = bold and span["f"].startswith("GillSans-SemiBold")
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()):]
        core = text.strip()
        mark = "***" if bold and italic else "**" if bold else "*" if italic else ""
        out += f"{lead}{mark}{core}{mark}{trail}"
    # Adjacent runs of the same mark merge ("**a** **b**" stays readable either way).
    out = re.sub(r"\*\*\*(\s*)\*\*\*", r"\1", out)
    out = re.sub(r"(?<!\*)\*\*(\s*)\*\*(?!\*)", r"\1", out)
    return out


HYPHENATED = set()


def learn_hyphens(lines):
    for line in lines:
        for word in re.findall(r"[A-Za-z]+-[A-Za-z]+", clean("".join(s["t"] for s in line["spans"]))):
            HYPHENATED.add(word.lower())


def join(a, b):
    """Two lines of one paragraph, a word split over the line end joined."""
    a = a.rstrip()
    b = b.lstrip()
    # A styled run broken over the line end ("*Thauma-*" + "*turgy*", "*or*" + "*Dexterity*").
    for mark in ("***", "**", "*"):
        if a.endswith(mark) and b.startswith(mark) and not a.endswith(mark + "*") and not b.startswith(mark + "*"):
            inner = join(a[: -len(mark)], b[len(mark):])
            return inner
    if a.endswith("-") and not a.endswith("--") and b[:1].isalpha():
        head = re.search(r"([A-Za-z]+)-$", a)
        tail = re.match(r"([A-Za-z]+)", b)
        if head and tail and f"{head.group(1)}-{tail.group(1)}".lower() in HYPHENATED:
            return a + b
        if head and b[:1].islower():
            return a[:-1] + b
        return a + b
    return f"{a} {b}" if a else b


def table_of(lines):
    """Rows and columns from table lines (GillSans cells) by their positions."""
    cells = []
    # Runs of lines in one column of one page (a table going on in the next
    # column or page starts a new run; its cells are moved back under the first run's).
    segment = 0
    previous = None
    for line in lines:
        if previous and (line["page"] != previous["page"] or line["y0"] < previous["y0"] - 40):
            segment += 1
        line["segment"] = segment
        previous = line
    lefts = {}
    for line in lines:
        lefts[line["segment"]] = min(lefts.get(line["segment"], 9999), line["x0"])
    for line in lines:
        # A line may carry several cells, split by wide gaps between its spans.
        group = []
        for span in line["spans"]:
            if span["t"] == "\t":
                if group:
                    cells.append(group)
                group = []
                continue
            gap = span["x0"] - group[-1]["x1"] if group else 0
            if group and span["t"].strip() and (gap > 14 or (gap > 3 and ("SemiBold" in span["f"]) != ("SemiBold" in group[-1]["f"]))):
                cells.append(group)
                group = []
            if span["t"].strip() or group:
                group.append(span)
        if group:
            cells.append(group)
    items = []
    for group in cells:
        text = marked(group).strip()
        if not text:
            continue
        x0 = group[0]["x0"]
        for span in group:
            if span["t"].strip():
                x0 = span["x0"]
                break
        x1 = group[-1]["x1"]
        head = all(("Bold" in s["f"]) for s in group if s["t"].strip())
        italic = all(("Italic" in s["f"]) for s in group if s["t"].strip())
        home = next(ln for ln in lines if any(s is group[0] for s in ln["spans"]))
        shift = lefts[home["segment"]] - lefts[0] if abs(lefts[home["segment"]] - lefts[0]) > 100 else 0
        items.append({"x0": x0 - shift, "x1": x1 - shift, "y": home["y0"], "text": text, "head": head, "italic": italic, "page": home["page"], "segment": home["segment"]})
    if not items:
        return []
    # Rows by y within each run of lines.
    items.sort(key=lambda c: (c["segment"], c["y"], c["x0"]))
    rows = []
    for item in items:
        if rows and rows[-1][0]["segment"] == item["segment"] and abs(rows[-1][0]["y"] - item["y"]) < 4:
            rows[-1].append(item)
        else:
            rows.append([item])
    # Header rows: the first rows all of whose cells are bold (and more than one cell or wide).
    header = []
    while rows and all(c["head"] for c in rows[0]) and (len(rows[0]) > 1 or header or (len(rows) > 1 and len(rows[1]) > 1 and all(c["head"] for c in rows[1]))):
        header.append(rows.pop(0))
    if header and len(header[0]) == 1 and len(header) == 1:
        rows.insert(0, header.pop())
    if header:
        # Columns from the header row with the most cells; the other header rows' words go
        # to the column under them (a cell spanning several columns, "Spell Slots per
        # Spell Level", is left out).
        main = max(header, key=len)
        cols = [{"x0": c["x0"], "x1": c["x1"], "text": [c["text"].replace("**", "")], "y": c["y"]} for c in sorted(main, key=lambda c: c["x0"])]
        for row in header:
            if row is main:
                continue
            for c in row:
                under = [col for col in cols if c["x0"] - 4 <= (col["x0"] + col["x1"]) / 2 <= c["x1"] + 4]
                if len(under) != 1:
                    under = [col for col in cols if c["x0"] < col["x1"] + 2 and c["x1"] > col["x0"] - 2]
                if len(under) == 1:
                    col = under[0]
                    word = c["text"].replace("**", "")
                    col["text"].insert(0, word) if c["y"] < col["y"] else col["text"].append(word)
                    col["x0"] = min(col["x0"], c["x0"])
                    col["x1"] = max(col["x1"], c["x1"])
                elif not under:
                    cols.append({"x0": c["x0"], "x1": c["x1"], "text": [c["text"].replace("**", "")], "y": c["y"]})
        cols.sort(key=lambda c: c["x0"])
        centers = [(c["x0"] + c["x1"]) / 2 for c in cols]
        heads = [" ".join(c["text"]) for c in cols]
    else:
        xs = sorted(c["x0"] for row in rows for c in row if not (c["italic"] and len(row) == 1))
        clusters = []
        for x in xs:
            if clusters and x - clusters[-1][-1] < 12:
                clusters[-1].append(x)
            else:
                clusters.append([x])
        centers = [min(cl) + 6 for cl in clusters]
        heads = None
    bounds = [(centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1)]

    def column(c):
        point = c["x0"] + min((c["x1"] - c["x0"]) / 2, 15)
        if heads is None:
            point = c["x0"] + 2
        for i, b in enumerate(bounds):
            if point < b:
                return i
        return len(bounds)

    out = []
    for row in rows:
        # The header again where the table goes on in the next column or page.
        if heads and all(c["head"] for c in row) and " ".join(c["text"].replace("**", "") for c in row).split() == " ".join(heads).split():
            continue
        if len(row) == 1 and row[0]["italic"] and len(centers) > 1:
            out.append({"group": row[0]["text"].replace("*", "").strip()})
            continue
        cellsrow = [""] * len(centers)
        for c in sorted(row, key=lambda c: c["x0"]):
            i = column(c)
            cellsrow[i] = join(cellsrow[i], c["text"]) if cellsrow[i] else c["text"]
        # A row with nothing in its first column continues the one before (a wrapped cell).
        if out and not cellsrow[0] and "cells" in out[-1] and len(centers) > 1:
            prev = out[-1]["cells"]
            for i, text in enumerate(cellsrow):
                if text:
                    prev[i] = join(prev[i], text) if prev[i] else text
            continue
        # A key-value table's label wrapped onto a second line (Saving Throw / Proficiencies).
        if heads is None and out and "cells" in out[-1] and len(centers) == 2 and cellsrow[0] and not cellsrow[1] and cellsrow[0].startswith("**"):
            out[-1]["cells"][0] = "**" + join(out[-1]["cells"][0].replace("**", ""), cellsrow[0].replace("**", "")) + "**"
            continue
        out.append({"cells": cellsrow})
    result = {"rows": out}
    if heads:
        result["head"] = heads
    return result


def elements(lines):
    out = []
    # Sidebars wait for the next heading, so the paragraph they sit beside is not cut.
    pending = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        role = line["role"]
        text = marked(line["spans"])
        plain = clean("".join(s["t"] for s in line["spans"])).strip()
        if role in ("h1", "h2", "h3", "h4", "h5"):
            level = int(role[1])
            # A heading carried over two lines (same size, next line).
            while i + 1 < n and lines[i + 1]["role"] == role and lines[i + 1]["page"] == line["page"] and abs(lines[i + 1]["x0"] - line["x0"]) < 30 and 0 < lines[i + 1]["y0"] - line["y0"] < line["size"] * 1.6:
                i += 1
                plain = join(plain, clean("".join(s["t"] for s in lines[i]["spans"])).strip())
            out.extend(pending)
            pending.clear()
            out.append({"k": "h", "level": level, "text": plain.replace("…", "").strip(), "page": line["page"]})
            i += 1
            continue
        if role == "sidebar":
            # A boxed sidebar: its title, then its text in GillSans lines.
            paras = []
            while i + 1 < n and lines[i + 1]["role"] == "tbl":
                i += 1
                body = marked(lines[i]["spans"]).strip()
                tab = "".join(s["t"] for s in lines[i]["spans"]).lstrip(" ").startswith("\t")
                if tab or not paras:
                    paras.append(body)
                else:
                    paras[-1] = join(paras[-1], body)
            pending.append({"k": "sidebar", "text": plain, "paras": paras, "page": line["page"]})
            i += 1
            continue
        if role == "section":
            out.append({"k": "section", "text": plain, "page": line["page"]})
            i += 1
            continue
        if role == "stat":
            out.append({"k": "stat", "text": text.strip(), "plain": plain, "page": line["page"], "x0": line["x0"], "y0": line["y0"], "spans": [{"t": clean(s["t"]), "f": s["f"]} for s in line["spans"]]})
            i += 1
            continue
        if role == "tbl":
            first = next(s for s in line["spans"] if s["t"].strip())
            if "SemiBold" in first["f"] and re.match(r"^[A-Z][A-Za-z ]+:\s*$", clean(first["t"])) and len(line["spans"]) > 1:
                value = clean("".join(s["t"] for s in line["spans"][line["spans"].index(first) + 1:])).strip()
                # Its value wrapped onto the next lines (no label of their own, the same margin).
                while i + 1 < n and lines[i + 1]["role"] == "tbl" and -2 < lines[i + 1]["x0"] - line["x0"] < 12 and not value.endswith("."):
                    nxt = lines[i + 1]
                    f2 = next(s for s in nxt["spans"] if s["t"].strip())
                    if "SemiBold" in f2["f"]:
                        break
                    value = join(value, clean("".join(s["t"] for s in nxt["spans"])).strip())
                    i += 1
                out.append({"k": "field", "label": clean(first["t"]).strip().rstrip(":"), "text": value, "page": line["page"]})
                i += 1
                continue
            group = [line]
            while i + 1 < n and lines[i + 1]["role"] == "tbl":
                nxt = lines[i + 1]
                f2 = next(s for s in nxt["spans"] if s["t"].strip())
                if "SemiBold" in f2["f"] and re.match(r"^[A-Z][A-Za-z ]+:\s*$", clean(f2["t"])) and len(nxt["spans"]) > 1:
                    break
                group.append(nxt)
                i += 1
            out.append({"k": "table", "page": line["page"], **table_of(group)})
            i += 1
            continue
        # Body text.
        raw = text
        bullet = re.match(r"^\s*[••]\s*", raw)
        indent = "".join(s["t"] for s in line["spans"]).lstrip(" ").startswith("\t")
        # A definition list's term in bold at the start of a line ("**Cantrips.** A cantrip is..."): a new paragraph.
        lead = next((s for s in line["spans"] if s["t"].strip()), None)
        after = line["spans"][line["spans"].index(lead) + 1]["t"] if lead and line["spans"].index(lead) + 1 < len(line["spans"]) else ""
        if lead and lead["f"].endswith("-Bold") and (clean(lead["t"]).strip().endswith(".") or after.startswith(".")) and out and out[-1]["k"] == "p":
            indent = True
        if bullet:
            out.append({"k": "li", "text": raw[bullet.end():].strip(), "page": line["page"]})
        elif indent or not out or out[-1]["k"] not in ("p", "li") or (out[-1]["k"] == "li" and (abs(line["x0"] - 63) < 4 or abs(line["x0"] - 313) < 4)):
            out.append({"k": "p", "text": raw.strip(), "page": line["page"]})
        else:
            out[-1]["text"] = join(out[-1]["text"], raw.strip())
        i += 1
    out.extend(pending)
    for el in out:
        if "text" in el and isinstance(el["text"], str):
            el["text"] = re.sub(r"\s+", " ", el["text"]).strip()
            el["text"] = re.sub(r"\*\*\*\s*\*\*\*", "", el["text"])
    return out


def main():
    pdf, target = sys.argv[1], sys.argv[2]
    doc = fitz.open(pdf)
    lines = field_lines(lines_of(doc))
    learn_hyphens(lines)
    els = elements(lines)
    toc = [{"level": level, "title": clean(title), "page": page} for level, title, page in doc.get_toc()]
    with open(target, "w", encoding="utf-8") as fh:
        json.dump({"toc": toc, "elements": els}, fh, ensure_ascii=False, indent=0)
    print(f"{len(els)} elements from {len(doc)} pages")


if __name__ == "__main__":
    main()
