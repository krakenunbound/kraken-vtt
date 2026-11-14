"""Turns the SRD 5.2.1's element stream (extract.py) into the data Kraken's SRD
books are built from: games/srd-5e/data/*.json.

    python games/srd-5e/tools/parse.py out/elements.json games/srd-5e/data

Writes reference.json (every chapter as sections of pages, in the markdown
games/lib/fg.mjs md() reads), classes.json (12 classes: core traits, the
features table, features by level, subclass, spell list), origins.json
(backgrounds, species with lineages), feats.json, equipment.json (weapons,
armor, tools, gear, packs, mounts), spells.json (each spell's fields, text and
the actions Kraken's tracker plays, read from its text), creatures.json (every
monster and animal stat block) and magic-items.json.
"""
import json
import os
import re
import sys

STATS = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]
SHORT = {"Str": "strength", "Dex": "dexterity", "Con": "constitution", "Int": "intelligence", "Wis": "wisdom", "Cha": "charisma"}
DAMAGE_TYPES = ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder"]
CONDITIONS = ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"]
CLASSES = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]


def plain(text):
    return re.sub(r"\s+", " ", re.sub(r"\*+", "", str(text or ""))).strip()


def dehyphen(a, b):
    a, b = a.rstrip(), b.lstrip()
    if a.endswith("-") and b[:1].islower():
        return a[:-1] + b
    return f"{a} {b}" if a else b


# --- Markdown (games/lib/fg.mjs md()) ---------------------------------------------------

def table_md(el):
    head = el.get("head")
    rows = el["rows"]
    width = len(head) if head else max((len(r.get("cells", [])) for r in rows), default=1)
    lines = []
    if head:
        lines.append("| " + " | ".join(h.replace("|", "/") for h in head) + " |")
        lines.append("|" + "---|" * width)
    for row in rows:
        if "group" in row:
            cells = [f"*{row['group']}*"] + [""] * (width - 1)
        else:
            cells = [c.replace("|", "/") for c in row["cells"]]
        lines.append("| " + " | ".join(cells) + " |")
    if not head and lines:
        # md() bolds a table's first row: a table without a header gets an empty one.
        lines.insert(0, "| " + " | ".join([" "] * width) + " |")
    return "\n".join(lines)


def to_md(els):
    blocks = []
    i = 0
    while i < len(els):
        el = els[i]
        k = el["k"]
        if k == "h":
            blocks.append("### " + el["text"])
        elif k == "p":
            blocks.append(el["text"])
        elif k == "li":
            items = []
            while i < len(els) and els[i]["k"] == "li":
                items.append("- " + els[i]["text"])
                i += 1
            blocks.append("\n".join(items))
            continue
        elif k == "field":
            blocks.append(f"**{el['label']}:** {el['text']}")
        elif k == "table":
            if el["rows"]:
                blocks.append(table_md(el))
        elif k == "sidebar":
            blocks.append("### " + el["text"])
            blocks.extend(el["paras"])
        elif k in ("stat", "section"):
            group = []
            while i < len(els) and els[i]["k"] in ("stat", "section"):
                group.append(els[i])
                i += 1
            blocks.append(statblock_md(parse_statblock(group)))
            continue
        i += 1
    return "\n\n".join(b for b in blocks if b.strip())


# --- Stat blocks --------------------------------------------------------------------------

SECTION_KEYS = {"Traits": "traits", "Actions": "actions", "Bonus Actions": "bonusactions", "Reactions": "reactions", "Legendary Actions": "legendaryactions", "Lair Actions": "lairactions"}


def parse_statblock(items):
    """A stat block's lines (extract.py's stat and section elements)."""
    block = {"keys": {}, "abilities": {}, "sections": {}, "intro": {}}
    key = None
    section = None
    abil = []
    entry = None
    for it in items:
        if it["k"] == "section":
            section = SECTION_KEYS.get(it["text"], it["text"].lower().replace(" ", ""))
            block["sections"].setdefault(section, [])
            entry = None
            continue
        text = it["text"]
        flat = plain(text)
        if section is None:
            if not block.get("typeline") and re.match(r"^\*[^*]", text):
                block["typeline"] = flat
                continue
            if flat.startswith("MOD SAVE"):
                continue
            m = re.match(r"^\*\*(Str|Dex|Con|Int|Wis|Cha)\*\*", text)
            if m or (abil and re.match(r"^[\d\s+\-]+$", flat)):
                abil.append(flat)
                key = None
                continue
            m = re.match(r"^\*\*([A-Za-z ]+?)\*\*\s*(.*)$", text)
            if m:
                # A line may carry two keys (AC and Initiative).
                rest = m.group(2)
                key = m.group(1).strip()
                parts = re.split(r"\*\*([A-Za-z ]+?)\*\*", rest)
                block["keys"][key] = plain(parts[0])
                for j in range(1, len(parts), 2):
                    key = parts[j].strip()
                    block["keys"][key] = plain(parts[j + 1])
                continue
            if key:
                block["keys"][key] = dehyphen(block["keys"][key], flat)
                continue
            block.setdefault("other", []).append(flat)
            continue
        m = re.match(r"^\*\*\*(.+?)\*\*\*\s*(.*)$", text)
        if m:
            name = plain(m.group(1)).rstrip(".").strip()
            entry = {"name": name, "desc": m.group(2).strip()}
            block["sections"][section].append(entry)
            continue
        if entry is None:
            block["intro"][section] = dehyphen(block["intro"].get(section, ""), text.strip())
            continue
        if re.match(r"^\*\*[^*]", text) and not entry["desc"].endswith("-"):
            entry["desc"] = entry["desc"].rstrip() + "\n" + text.strip()
        else:
            entry["desc"] = dehyphen(entry["desc"], text.strip())
    joined = " ".join(abil)
    for m in re.finditer(r"(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\s+([+-]\d+)\s+([+-]?\d+)", joined):
        block["abilities"][SHORT[m.group(1)]] = {"score": int(m.group(2)), "mod": int(m.group(3)), "save": int(m.group(4))}
    return block


def statblock_md(block, name=None):
    out = []
    if name:
        out.append("### " + name)
    if block.get("typeline"):
        out.append(f"*{block['typeline']}*")
    head = []
    for key, value in block["keys"].items():
        if key in ("AC", "Initiative", "HP", "Speed"):
            head.append(f"**{key}** {value}")
    if head:
        out.append(" ".join(head))
    if block["abilities"]:
        rows = ["| | Score | Mod | Save |", "|---|---|---|---|"]
        for stat in ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]:
            a = block["abilities"].get(stat)
            if a:
                rows.append(f"| {stat[:3].title()} | {a['score']} | {a['mod']:+d} | {a['save']:+d} |")
        out.append("\n".join(rows))
    rest = [f"**{key}** {value}" for key, value in block["keys"].items() if key not in ("AC", "Initiative", "HP", "Speed")]
    if rest:
        out.append("\n".join(rest))
    for line in block.get("other", []):
        out.append(line)
    titles = {v: k for k, v in SECTION_KEYS.items()}
    for section, entries in block["sections"].items():
        out.append("### " + titles.get(section, section.title()))
        if block["intro"].get(section):
            out.append(block["intro"][section])
        for entry in entries:
            out.append(f"***{entry['name']}.*** " + entry["desc"].replace("\n", " "))
    return "\n\n".join(out)


# --- The document --------------------------------------------------------------------------

def chapters_of(els):
    out = []
    for el in els:
        if el["k"] == "h" and el["level"] == 1:
            out.append({"name": el["text"], "els": []})
        elif out:
            out[-1]["els"].append(el)
    # Two-line titles read as two (Index of Stat / Blocks): merged, and the front matter left out.
    return [c for c in out if c["name"] not in ("Legal Information", "Contents", "Index of Stat", "Blocks")]


def split(els, level):
    """Elements under each heading of a level: [(heading, [elements])], the part before the first as (None, [...])."""
    out = [(None, [])]
    for el in els:
        if el["k"] == "h" and el["level"] == level:
            out.append((el["text"], []))
        else:
            out[-1][1].append(el)
    return out


def letter_pages(name, els, level):
    """A long run of entries (spells, items, glossary terms) as one page per letter."""
    pages = []
    intro, parts = None, split(els, level)
    if parts[0][1]:
        pages.append({"name": name, "text": to_md(parts[0][1])})
    by_letter = {}
    for title, body in parts[1:]:
        letter = title[:1].upper()
        by_letter.setdefault(letter, []).append(f"### {title}\n\n" + to_md(body))
    for letter, texts in by_letter.items():
        pages.append({"name": f"{name}: {letter}", "text": "\n\n".join(texts), "keywords": ""})
    return pages


def reference_of(chapter, letters=()):
    sections = []
    for title, body in split(chapter["els"], 2):
        if title is None:
            if any(el["k"] != "h" for el in body):
                sections.append({"name": chapter["name"], "pages": [{"name": chapter["name"], "text": to_md(body)}]})
            continue
        if title in letters:
            sections.append({"name": title, "pages": letter_pages(title, body, 4)})
            continue
        pages = []
        parts = split(body, 3)
        if parts[0][1]:
            pages.append({"name": title, "text": to_md(parts[0][1])})
        for sub, sub_body in parts[1:]:
            pages.append({"name": sub, "text": to_md(sub_body)})
        if pages:
            sections.append({"name": title, "pages": pages})
    return {"name": chapter["name"], "sections": sections}


# --- Classes ---------------------------------------------------------------------------------

def table_after(els, caption):
    for i, el in enumerate(els):
        if el["k"] == "h" and el["text"] == caption:
            for nxt in els[i + 1:]:
                if nxt["k"] == "table":
                    return nxt
                if nxt["k"] == "h":
                    break
    return None


def level_features(els):
    """H4 'Level 3: Name' features and their text, each to the next H4 or H3."""
    out = []
    cur = None
    for el in els:
        if el["k"] == "h" and el["level"] <= 3:
            cur = None
            continue
        if el["k"] == "h" and el["level"] == 4:
            m = re.match(r"^Level (\d+):\s*(.+)$", el["text"])
            if m:
                cur = {"level": int(m.group(1)), "name": m.group(2).strip(), "els": []}
                out.append(cur)
                continue
        if cur is not None:
            # A class's features table sits among the features in the PDF: it is not a feature's text.
            if el["k"] == "h" and el["level"] == 5 and re.search(r"Features$", el["text"]):
                cur = None
                continue
            cur["els"].append(el)
    for f in out:
        f["text"] = to_md(f.pop("els"))
    return out


def parse_classes(chapter):
    out = []
    for name, body in split(chapter["els"], 2)[1:]:
        traits_el = table_after(body, f"Core {name} Traits")
        traits = {}
        for row in (traits_el or {"rows": []})["rows"]:
            if "cells" in row and len(row["cells"]) >= 2:
                traits[plain(row["cells"][0])] = plain(row["cells"][1])
        table = table_after(body, f"{name} Features")
        parts = split(body, 3)
        intro = to_md([el for el in parts[0][1] if not (el["k"] == "table" or (el["k"] == "h" and el["level"] == 5))])
        features, subclass, spells, options = [], None, {}, []
        for title, sub in parts[1:]:
            if title == f"{name} Class Features":
                features = level_features(sub)
            elif title.startswith(f"{name} Subclass:"):
                sp = split(sub, 4)
                subclass = {
                    "name": title.split(":", 1)[1].strip(),
                    "text": to_md(sp[0][1]),
                    "features": level_features(sub),
                }
            elif title == f"{name} Spell List":
                level = None
                for el in sub:
                    if el["k"] == "h":
                        m = re.match(r"^Cantrips", el["text"])
                        n = re.match(r"^Level (\d) ", el["text"])
                        level = 0 if m else int(n.group(1)) if n else level
                    elif el["k"] == "table" and level is not None:
                        for row in el["rows"]:
                            if "cells" in row and plain(row["cells"][0]):
                                spells.setdefault(str(level), []).append(plain(row["cells"][0]))
            elif title not in (f"Becoming a {name}", f"Becoming an {name}"):
                # Options a feature points to (Metamagic, Eldritch Invocations).
                options.append({"name": title, "text": to_md(sub)})
        out.append({
            "name": name,
            "traits": traits,
            "intro": intro,
            "table": {"head": table.get("head", []), "rows": [r["cells"] for r in table["rows"] if "cells" in r]} if table else None,
            "features": features,
            "subclass": subclass,
            "spells": spells,
            "options": options,
        })
    return out


# --- Origins and feats ------------------------------------------------------------------------

def trait_list(els):
    """Paragraphs that start with a bold-italic name: [{name, text}], later paragraphs and tables belonging to the last."""
    out = []
    for el in els:
        if el["k"] == "p":
            m = re.match(r"^\*\*\*(.+?)\.?\*\*\*\s*(.*)$", el["text"])
            if m:
                out.append({"name": plain(m.group(1)).rstrip("."), "els": [{"k": "p", "text": m.group(2)}]})
                continue
        if out:
            out[-1]["els"].append(el)
    for t in out:
        t["text"] = to_md(t.pop("els"))
    return out


def parse_origins(chapter):
    backgrounds, species = [], []
    for title, body in split(chapter["els"], 2)[1:]:
        if title == "Character Backgrounds":
            for name, els in split(body, 4)[1:]:
                fields = {el["label"]: el["text"] for el in els if el["k"] == "field"}
                if "Ability Scores" not in fields:
                    continue
                backgrounds.append({"name": name, "fields": fields, "text": to_md([el for el in els if el["k"] != "field"])})
        elif title == "Character Species":
            parts = split(body, 4)[1:]
            tables = {}
            for name, els in split(body, 5)[1:]:
                for el in els:
                    if el["k"] == "table":
                        tables[name] = el
                        break
            for name, els in parts:
                fields = {el["label"]: el["text"] for el in els if el["k"] == "field"}
                if "Speed" not in fields:
                    continue
                traits = trait_list([el for el in els if el["k"] != "field" and not (el["k"] == "h" and el["level"] == 5)])
                species.append({"name": name, "fields": fields, "traits": traits})
            # A species' lineages from its table (Elven Lineages, Fiendish Legacies, Draconic Ancestors).
            for sp in species:
                for caption, el in tables.items():
                    if (sp["name"] == "Elf" and caption == "Elven Lineages") or (sp["name"] == "Tiefling" and caption == "Fiendish Legacies") or (sp["name"] == "Dragonborn" and caption == "Draconic Ancestors"):
                        sp["table"] = {"caption": caption, "head": el.get("head", []), "rows": [r["cells"] for r in el["rows"] if "cells" in r]}
    return {"backgrounds": backgrounds, "species": species}


def parse_feats(chapter):
    out = []
    for title, body in split(chapter["els"], 2)[1:]:
        for category, els in split(body, 3)[1:]:
            if not category.endswith("Feats"):
                continue
            for name, fels in split(els, 4)[1:]:
                first = fels[0]["text"] if fels and fels[0]["k"] == "p" else ""
                m = re.match(r"^\*(.+?)\*\s*(.*)$", first)
                line, rest = (m.group(1), m.group(2)) if m else ("", first)
                # "*Fighting Style Feat (Prerequisite: Fighting Style* *Feature)*" was joined by extract.py.
                cat = re.match(r"^(Origin|General|Fighting Style|Epic Boon) Feat", line)
                pre = re.search(r"\(Prerequisite:\s*(.+?)\)", line)
                body_els = ([{"k": "p", "text": rest}] if rest else []) + fels[1:]
                out.append({"name": name, "category": cat.group(1) if cat else category.replace(" Feats", ""), "prerequisite": pre.group(1).strip() if pre else "", "repeatable": any(el["k"] == "p" and el["text"].startswith("***Repeatable.") for el in fels), "text": to_md(body_els)})
    return out


# --- Equipment --------------------------------------------------------------------------------

def money(text):
    return plain(text).replace(",", "")


def parse_equipment(chapter):
    els = chapter["els"]
    weapons, armor, tools, gear, mounts, vehicles = [], [], [], [], [], []
    wt = table_after(els, "Weapons")
    group = ""
    for row in wt["rows"]:
        if "group" in row:
            group = row["group"]
            continue
        c = [plain(x) for x in row["cells"]]
        weapons.append({"name": c[0], "category": group, "damage": c[1], "properties": "" if c[2] in ("—", "-") else c[2], "mastery": c[3], "weight": c[4], "cost": c[5]})
    at = table_after(els, "Armor")
    group = ""
    for row in at["rows"]:
        if "group" in row or (len([x for x in row["cells"] if plain(x)]) == 1):
            group = row.get("group") or plain(row["cells"][0])
            continue
        c = [plain(x) for x in row["cells"]]
        armor.append({"name": c[0], "category": re.sub(r"\s*\(.*$", "", group), "don": (re.search(r"\((.*)\)", group) or [None, ""])[1], "ac": c[1], "strength": c[2], "stealth": c[3], "weight": c[4], "cost": c[5]})
    # Mastery properties and weapon properties text, for item descriptions.
    props = {}
    for title, body in split(els, 2)[1:]:
        if title == "Weapons":
            for sub, sbody in split(body, 3)[1:]:
                for name, pels in split(sbody, 4)[1:]:
                    props[name] = to_md(pels)
    # Tools: H4 "Name (Cost)" with fields, under H3 Artisan's Tools / Other Tools.
    for title, body in split(els, 2)[1:]:
        if title == "Tools":
            for sub, sbody in split(body, 3)[1:]:
                for name, tels in split(sbody, 4)[1:]:
                    m = re.match(r"^(.+?)\s*\((.+)\)$", name)
                    fields = {}
                    last = None
                    kept = []
                    for el in tels:
                        if el["k"] == "field":
                            fields[el["label"]] = el["text"]
                            last = el["label"]
                        elif el["k"] == "table" and not el.get("head") and last:
                            # A field's value wrapped into lines read as a table (Musical Instrument's variants).
                            for row in el["rows"]:
                                for cell in row.get("cells", []):
                                    if plain(cell):
                                        fields[last] = dehyphen(fields[last], plain(cell))
                        else:
                            kept.append(el)
                    tels = kept
                    tools.append({"name": m.group(1) if m else name, "cost": m.group(2) if m else "", "kind": sub, "fields": fields, "text": to_md([el for el in tels if el["k"] != "field"])})
        if title == "Adventuring Gear":
            table = table_after(body, "Adventuring Gear")
            weights = {}
            for row in table["rows"]:
                if "cells" in row:
                    weights[plain(row["cells"][0])] = (plain(row["cells"][1]), plain(row["cells"][2]))
            parts = split(body, 4)
            subtables = {}
            for cap, cels in split(body, 5)[1:]:
                for el in cels:
                    if el["k"] == "table":
                        subtables[cap] = el
                        break
            for name, gels in parts[1:]:
                m = re.match(r"^(.+?)\s*\((.+)\)$", name)
                base = m.group(1) if m else name
                # Its own tables (Arcane Focuses), not the chapter's Adventuring Gear table set among them.
                own, caption = [], None
                for el in gels:
                    if el["k"] == "h" and el["level"] == 5:
                        caption = el["text"]
                        continue
                    if el["k"] == "table" and caption in ("Adventuring Gear", "Ammunition") and base != "Ammunition":
                        continue
                    if el["k"] == "table" and caption == "Adventuring Gear":
                        continue
                    if el["k"] == "table" and caption:
                        own.append({"k": "h", "level": 5, "text": caption})
                    own.append(el)
                gear.append({"name": base, "cost": m.group(2) if m else "", "weight": weights.get(base, ("", ""))[0], "text": to_md(own)})
            gear_tables = {cap: {"head": t.get("head", []), "rows": [r["cells"] for r in t["rows"] if "cells" in r]} for cap, t in subtables.items()}
        if title == "Mounts and Vehicles":
            for cap in ("Mounts and Other Animals", "Tack, Harness, and Drawn Vehicles", "Airborne and Waterborne Vehicles"):
                t = table_after(body, cap)
                if not t:
                    continue
                parent = ""
                for row in t["rows"]:
                    if "cells" not in row:
                        continue
                    c = [plain(x) for x in row["cells"]]
                    if len([x for x in c if x]) == 1:
                        parent = c[0]
                        continue
                    name = f"{parent}, {c[0]}" if parent and cap.startswith("Tack") and c[0] in ("Exotic", "Military", "Riding") else c[0]
                    if cap.startswith("Tack") and c[0] not in ("Exotic", "Military", "Riding"):
                        parent = ""
                    (mounts if cap.startswith("Mounts") else vehicles).append({"name": name, "table": cap, "head": t.get("head", []), "cells": c})
    return {"weapons": weapons, "armor": armor, "tools": tools, "gear": gear, "gearTables": gear_tables, "mounts": mounts, "vehicles": vehicles, "properties": props}


# --- Spells ------------------------------------------------------------------------------------

WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12}


def duration_of(text):
    t = text.lower()
    m = re.search(r"(\d+)\s*(round|minute|hour|day)", t)
    if not m:
        return 1, "round"
    n, unit = int(m.group(1)), m.group(2)
    if unit == "day":
        return n * 24, "hour"
    return n, unit


def spell_actions(spell):
    """The actions Kraken's 5E tracker plays (electron/combat.cjs cast5e), read from the spell's text:
    cast (targets, darts), attack, save (half on a success), damage with its dice and type (a
    cantrip's tiers, a higher slot's dice), healing (+ the casting modifier), an effect."""
    body = spell["body"]
    text = plain(body)
    # The spell's own effect, not its higher-level or cantrip notes.
    main = re.split(r"(Using a Higher-Level Spell Slot\.|Cantrip Upgrade\.)", text)[0]
    higher = plain(spell.get("higher", ""))
    upgrade = plain(spell.get("upgrade", ""))
    actions = []
    cast = {"type": "cast", "targeting": "targets", "targetingval": 1}
    count = re.search(r"\bup to (one|two|three|four|five|six|seven|eight|nine|ten|twelve|\d+) (?:willing )?(?:creatures|targets|Beasts|Humanoids|Undead)", main)
    if count:
        cast["targetingval"] = WORDS.get(count.group(1), int(count.group(1)) if count.group(1).isdigit() else 1)
    darts = re.search(r"\b(one|two|three|four|five|\d+) glowing darts", main)
    if darts:
        cast = {"type": "cast", "targeting": "multihit", "targetingval": WORDS.get(darts.group(1), 3), "allowupcast": 1}
    if spell["level"] > 0 and higher:
        cast["allowupcast"] = 1
    actions.append(cast)
    attack = re.search(r"\b(ranged|melee) spell attack", main, re.I)
    if attack and not darts:
        actions.append({"type": "attack", "atktype": attack.group(1).lower()})
    save = re.search(r"\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw", main)
    if save and not attack:
        row = {"type": "powersave", "savetype": save.group(1).lower()}
        if re.search(r"half as much damage|Half damage|half the damage", main):
            row["onmissdamage"] = "half"
        actions.append(row)
    # Damage: the dice of the first sentence that deals damage (each type a part).
    dmg_re = re.compile(r"(\d+d\d+)(?:\s*\+\s*(\d+))?\s+(" + "|".join(DAMAGE_TYPES) + r") damage(?! at the (?:start|end))")
    parts = []
    for sentence in re.split(r"(?<=[.!?])\s+", main):
        found = [m for m in dmg_re.finditer(sentence)]
        if found:
            seen = set()
            for index, m in enumerate(found):
                if m.group(3) in seen:
                    continue
                # "3d8 Radiant damage (if ...) or 3d8 Necrotic damage": one or the other, not both.
                if index and re.search(r"\bor\b", sentence[found[index - 1].end():m.start()]) and not re.search(r"\band\b", sentence[found[index - 1].end():m.start()]):
                    break
                seen.add(m.group(3))
                part = {"dice": m.group(1), "type": m.group(3).lower()}
                if m.group(2):
                    part["bonus"] = int(m.group(2))
                parts.append(part)
            break
    if not parts and attack:
        # Damage of a type the caster picks (Chromatic Orb).
        untyped = re.search(r"(\d+d\d+)(?:\s*\+\s*(\d+))? damage", main)
        if untyped:
            parts.append({"dice": untyped.group(1), "type": "", **({"bonus": int(untyped.group(2))} if untyped.group(2) else {})})
    heal = None
    hm = re.search(r"regains? (?:a number of )?Hit Points equal to (\d+d\d+)(?:\s*\+\s*(\d+))?( plus your spellcasting ability modifier)?", main) or re.search(r"regains? (\d+d\d+)(?:\s*\+\s*(\d+))?( plus your spellcasting ability modifier)? Hit Points", main)
    flat = re.search(r"(?:regains?|restoring) (\d+) Hit Points", main)
    if hm:
        heal = {"dice": hm.group(1), **({"bonus": int(hm.group(2))} if hm.group(2) else {}), **({"stat": "base"} if hm.group(3) else {})}
    elif flat and not parts:
        heal = {"dice": "", "bonus": int(flat.group(1))}
    if parts and spell["level"] == 0 and re.search(r"increases by \d*d\d+ when you reach level|beams? at level", upgrade):
        for part in parts:
            if part["dice"].startswith("1d"):
                part["scalestat"] = "cantrip"
                part["scaledice"] = part["dice"]
    up = re.search(r"(?:The )?(?:(\w+) )?(?:damage|healing)(?: \(both initial and later\))?(?: and the (\w+) damage)? increases? by (\d+d\d+) for each spell slot level above", higher)
    if up:
        named = [w for w in (up.group(1), up.group(2)) if w and w.capitalize() in DAMAGE_TYPES]
        if heal and re.search(r"healing increases", higher):
            heal["scalestat"] = "upcast"
            heal["scaledice"] = up.group(3)
        for part in parts:
            if (not named and part is parts[0]) or part["type"].capitalize() in named:
                part["scalestat"] = "upcast"
                part["scaledice"] = up.group(3)
    dmin, dunit = duration_of(spell["duration"])
    # Extra damage on the caster's hits while the spell lasts (Hunter's Mark, Divine Favor): an effect on the caster, not damage now.
    rider = parts and not save and not attack and re.search(r"(?:whenever|each time|every time) you hit|weapon strikes deal an extra|deals? an extra \d+d\d+ \w+ damage on a hit", main, re.I)
    if heal:
        actions.append({"type": "heal", "heallist": [heal]})
    if parts and not rider:
        actions.append({"type": "damage", "damagelist": parts})
    if rider:
        row = {"type": "effect", "label": f"{spell['name']}; DMG: {parts[0]['dice']} {parts[0]['type']}".rstrip(), "durmod": dmin, "durunit": dunit, "targeting": "self"}
        if re.search(r"\b(?:a|one) creature (?:you can see|within range)|\bthe target\b|\bmark\b", main):
            row["targeted"] = 1
        actions.append(row)
        return actions
    # An effect: a condition, a bonus or a die to rolls.
    label = None
    cond = re.search(r"\bha(?:s|ve) the (" + "|".join(CONDITIONS) + r") condition", main)
    bless = re.search(r"adds? (\d*d\d+) to the attack roll or save", main)
    bane = re.search(r"subtract (\d*d\d+) from the attack roll or save", main)
    ac = re.search(r"\+(\d+) bonus to (?:AC|Armor Class)", main)
    resist = re.search(r"\bha(?:s|ve) Resistance to ((?:(?:" + "|".join(DAMAGE_TYPES) + r")(?:, | and |, and )?)+) damage", main)
    check = re.search(r"adds? (?:a )?(\d*d\d+) to (?:one |any )?(?:the )?ability check", main) or re.search(r"roll (?:a )?(\d*d\d+) and add the number rolled to the ability check", main)
    savebonus = re.search(r"roll (?:a )?(\d*d\d+) and add the number rolled to the saving throw", main) or re.search(r"adds? (\d*d\d+) to (?:one )?(?:the )?saving throw", main)
    if bless:
        label = f"{spell['name']}; ATK: {bless.group(1)}; SAVE: {bless.group(1)}"
    elif bane:
        label = f"{spell['name']}; ATK: -{bane.group(1)}; SAVE: -{bane.group(1)}"
    elif ac and not parts:
        label = f"{spell['name']}; AC: {ac.group(1)}"
    elif check and not parts:
        label = f"{spell['name']}; CHECK: {check.group(1)}"
    elif savebonus and not parts:
        label = f"{spell['name']}; SAVE: {savebonus.group(1)}"
    elif cond:
        label = f"{spell['name']}; {cond.group(1)}"
    elif resist and not parts:
        label = f"{spell['name']}; RESIST: " + ", ".join(t.lower() for t in re.findall("|".join(DAMAGE_TYPES), resist.group(1)))
    if label:
        row = {"type": "effect", "label": label, "durmod": dmin, "durunit": dunit}
        if re.match(r"^Self", spell["range"]) and not save and not attack:
            row["targeting"] = "self"
        actions.append(row)
    useful = [a for a in actions if a["type"] != "cast"]
    return actions if useful else []


def parse_spells(chapter):
    out = []
    body = None
    for title, els in split(chapter["els"], 2)[1:]:
        if title == "Spell Descriptions":
            body = els
    for name, els in split(body, 4)[1:]:
        if not els or els[0]["k"] != "p":
            continue
        # A spell whose fields were set in body type (Chill Touch): header, fields and text from one paragraph.
        inline = re.match(r"^(\*[^*]+\*)\s*\*\*Casting Time:\*\*\s*(.+?)\s*\*\*Range:\*\*\s*(.+?)\s*\*\*Components:\*\*\s*(.+?)\s*\*\*Duration:\*\*\s*(\S+(?: [a-z]+,? up to \d+ \w+)?)\s+(.*)$", els[0]["text"])
        if inline:
            els = [{"k": "p", "text": inline.group(1)}] + [{"k": "field", "label": label, "text": inline.group(i + 2)} for i, label in enumerate(["Casting Time", "Range", "Components", "Duration"])] + [{"k": "p", "text": inline.group(6)}] + els[1:]
        head = plain(els[0]["text"])
        m = re.match(r"^Level (\d) (\w+) \((.+)\)$", head) or re.match(r"^(\w+) Cantrip \((.+)\)$", head)
        if not m:
            print("spell header?", name, head)
            continue
        if head.startswith("Level"):
            level, school, classes = int(m.group(1)), m.group(2), m.group(3)
        else:
            level, school, classes = 0, m.group(1), m.group(2)
        fields = {el["label"]: el["text"] for el in els if el["k"] == "field"}
        rest = [el for el in els[1:] if el["k"] != "field"]
        higher, upgrade = "", ""
        main = []
        for el in rest:
            if el["k"] == "p" and el["text"].startswith("***Using a Higher-Level Spell Slot.***"):
                higher = el["text"].split("***", 2)[2].strip()
            elif el["k"] == "p" and el["text"].startswith("***Cantrip Upgrade.***"):
                upgrade = el["text"].split("***", 2)[2].strip()
            main.append(el)
        time = fields.get("Casting Time", "")
        ritual = bool(re.search(r"\bor Ritual\b", time))
        spell = {
            "name": name,
            "level": level,
            "school": school,
            "classes": [c.strip() for c in classes.split(",")],
            "castingtime": re.sub(r"\s*or Ritual$", "", time).strip(),
            "ritual": ritual,
            "range": fields.get("Range", ""),
            "components": fields.get("Components", ""),
            "duration": fields.get("Duration", ""),
            "text": to_md(main),
            "body": " ".join(el["text"] for el in main if el["k"] in ("p", "li")),
            "higher": higher,
            "upgrade": upgrade,
        }
        spell["actions"] = spell_actions(spell)
        del spell["body"]
        out.append(spell)
    return out


# --- Creatures -----------------------------------------------------------------------------------

def creature_of(name, items, family, chapter):
    block = parse_statblock(items)
    keys = block["keys"]
    typeline = block.get("typeline", "")
    m = re.match(r"^(.+?),\s*(.+)$", typeline)
    kind, alignment = (m.group(1), m.group(2)) if m else (typeline, "")
    sizes = re.match(r"^((?:Tiny|Small|Medium|Large|Huge|Gargantuan)(?:\s+or\s+(?:Tiny|Small|Medium|Large|Huge|Gargantuan|Smaller))?)\s+(.*)$", kind)
    size, ctype = (sizes.group(1), sizes.group(2)) if sizes else ("", kind)
    hp = re.match(r"^(\d+)\s*(\(.*\))?", keys.get("HP", ""))
    init = re.match(r"^([+-]\d+)", keys.get("Initiative", ""))
    # "1/4 (XP 50; PB +2)", and a few blocks' "2 (450 XP; PB +2)".
    cr = re.match(r"^([\d/]+|None)\s*\((?:XP )?([\d,]+)", keys.get("CR", ""))
    immune = keys.get("Immunities", "")
    dmg_imm, cond_imm = "", ""
    if immune:
        if ";" in immune:
            dmg_imm, cond_imm = [p.strip() for p in immune.split(";", 1)]
        elif any(immune.startswith(c) for c in CONDITIONS):
            cond_imm = immune
        else:
            dmg_imm = immune
    return {
        "name": name,
        "family": family,
        "chapter": chapter,
        "size": size,
        "type": ctype,
        "alignment": alignment,
        "ac": keys.get("AC", ""),
        "initiative": int(init.group(1)) if init else None,
        "hp": int(hp.group(1)) if hp else 0,
        "hd": (hp.group(2) or "") if hp else "",
        "hptext": keys.get("HP", ""),
        "speed": keys.get("Speed", ""),
        "abilities": block["abilities"],
        "skills": keys.get("Skills", ""),
        "resistances": keys.get("Resistances", ""),
        "vulnerabilities": keys.get("Vulnerabilities", ""),
        "damageimmunities": dmg_imm,
        "conditionimmunities": cond_imm,
        "gear": keys.get("Gear", ""),
        "senses": keys.get("Senses", ""),
        "languages": keys.get("Languages", ""),
        "cr": cr.group(1) if cr else keys.get("CR", ""),
        "xp": int(cr.group(2).replace(",", "")) if cr else 0,
        "crtext": keys.get("CR", ""),
        "sections": block["sections"],
        "intro": block["intro"],
        "md": statblock_md(block),
    }


def parse_creatures(chapters):
    out = []
    for chapter in chapters:
        if chapter["name"] == "Monsters A–Z":
            for family, els in split(chapter["els"], 2)[1:]:
                for name, items in split(els, 3)[1:]:
                    stat = [el for el in items if el["k"] in ("stat", "section")]
                    if stat:
                        out.append(creature_of(name, stat, family, "Monsters"))
        if chapter["name"] == "Animals":
            for name, items in split(chapter["els"], 3)[1:]:
                stat = [el for el in items if el["k"] in ("stat", "section")]
                if stat:
                    out.append(creature_of(name, stat, name, "Animals"))
    return out


# --- Magic items -----------------------------------------------------------------------------------

def parse_magic_items(chapter):
    out = []
    for title, els in split(chapter["els"], 2)[1:]:
        if title != "Magic Items A–Z":
            continue
        for name, iels in split(els, 4)[1:]:
            first = iels[0]["text"] if iels and iels[0]["k"] == "p" else ""
            m = re.match(r"^\*(.+?)\*\s*(.*)$", first)
            if not m:
                print("magic item header?", name, first[:80])
                continue
            line, rest = m.group(1).strip(), m.group(2)
            # The item's name in italics right after its kind line was read into it.
            if line.endswith(name) and line != name:
                line, rest = line[: -len(name)].strip(), f"*{name}* {rest}"
            cat = re.match(r"^(Armor|Weapon|Wondrous Item|Potion|Ring|Rod|Scroll|Staff|Wand)\b\s*(\((.*?)\))?,?\s*(.*)$", line)
            kind, sub, rarity = (cat.group(1), cat.group(3) or "", cat.group(4)) if cat else ("Wondrous Item", "", line)
            att = re.search(r"\(Requires Attunement(.*?)\)", rarity)
            out.append({
                "name": name,
                "type": kind,
                "subtype": sub,
                "rarity": re.sub(r"\s*\(Requires Attunement.*?\)", "", rarity).strip(),
                "attunement": ("Requires Attunement" + att.group(1)) if att else "",
                "line": line,
                "text": to_md(([{"k": "p", "text": rest}] if rest else []) + iels[1:]),
            })
    return out


def main():
    source, target = sys.argv[1], sys.argv[2]
    data = json.load(open(source, encoding="utf-8"))
    chapters = chapters_of(data["elements"])
    by = {c["name"]: c for c in chapters}
    os.makedirs(target, exist_ok=True)

    def write(name, value):
        with open(os.path.join(target, name), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(value, fh, ensure_ascii=False, indent=1)
        print(f"wrote {name}")

    letters = {"Spell Descriptions", "Rules Definitions", "Magic Items A–Z"}
    reference = [reference_of(c, letters) for c in chapters if c["name"] not in ("Monsters A–Z", "Animals")]
    write("reference.json", reference)
    classes = parse_classes(by["Classes"])
    write("classes.json", classes)
    write("origins.json", parse_origins(by["Character Origins"]))
    write("feats.json", parse_feats(by["Feats"]))
    write("equipment.json", parse_equipment(by["Equipment"]))
    spells = parse_spells(by["Spells"])
    write("spells.json", spells)
    write("creatures.json", parse_creatures(chapters))
    write("magic-items.json", parse_magic_items(by["Magic Items"]))
    with_actions = sum(1 for s in spells if s["actions"])
    print(f"{len(classes)} classes, {len(spells)} spells ({with_actions} with actions)")


if __name__ == "__main__":
    main()
