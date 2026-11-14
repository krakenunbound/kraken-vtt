# Kraken's own games

Two original games and three open games ship with Kraken, so testers can play
without any Fantasy Grounds modules:

| Game | Engine | Books (games/modules) |
|---|---|---|
| **Descending Darkness** (dark fantasy) | the d20 family (`shared/dnd5e/rules.mjs`, profile `descending`) | Player's Handbook, Bestiary, *The Empty Watchtower* |
| **Apeira Astra** (science fiction) | its own 2d6 engine (`shared/astra/rules.mjs`) | Crew Handbook, Threat Dossier, *Salvage Rights* |
| **Cairn**, Second Edition (Yochai Gal, CC BY-SA 4.0) | its own engine (`shared/cairn/rules.mjs`) | Player's Guide, Warden's Guide, *Trouble in Twin Lakes* |
| **Fate Core** and **Fate Accelerated** (Evil Hat, CC BY 3.0) | one engine (`shared/fate/rules.mjs`) | Fate Core System, Fate Accelerated Edition, Fate Toolkit and Adversaries, *The Lighthouse at Gull's End* |

Fate's books are Evil Hat's System Reference Documents (Fate Core, Fate
Accelerated, the Fate System Toolkit, the Fate Adversary Toolkit), read from
the official HTML files (the "CC-BY SRDs" download at
https://www.faterpg.com/licensing/) into Markdown, a file a chapter, once:

    node games/fate/tools/convert.mjs "path/to/CC-BY SRDs"

`games/fate/*.mjs` make the books from `games/fate/text` (with Cairn's
Markdown helpers): every chapter as pages, the skills (and their example
stunts) from the Default Skill List, FAE's approaches, stunts and example
characters, and the SRDs' example opposition as NPCs. Each book's first page
carries its SRD's attribution word for word (`games/fate/LICENSE.md`), with
Fate's trademark line; no Fate logo or Evil Hat art. *The Lighthouse at
Gull's End* (`gulls-end.mjs`) is Kraken's own: its two battle maps are drawn
by `mapgen.py`, then `games/fate/tools/zones.py` washes the sea in and
outlines each Fate zone in its colour (no lettering; the story names them):

    python games/tools/mapgen.py games/fate/maps/strand.json games/fate/art/strand.webp games/fate/maps/strand.walls.json
    python games/fate/tools/zones.py games/fate/maps/strand.json games/fate/art/strand.webp

Cairn's books are made from its official Markdown, kept in `games/cairn/text`
(copied from github.com/yochaigal/cairn: `second-edition/` and the adventure
CAS-1). `games/cairn/markdown.mjs` turns it into pages, tables and records;
the backgrounds' items, the bestiary's stat lines and the spellbooks are read
from the text. Its two battle maps were drawn with `mapgen.py` from the
adventure's descriptions (`games/cairn/maps`). Everything in `games/cairn` is
CC BY-SA 4.0 (its LICENSE.md); the rules engine is Kraken's code.

And D&D 5E's rules come with Kraken too, from the System Reference Document
5.2.1 (CC BY 4.0), so a D&D 5E campaign plays with nothing else installed:

| Books | Engine | What is in them |
|---|---|---|
| **SRD 5.2.1 Player's Rules**, **SRD 5.2.1 Creatures**, **SRD 5.2.1 Magic Items** (`games/srd-5e`, category SRD 5.2.1, FG ruleset 5E) | the d20 family (`shared/dnd5e/rules.mjs`, profile `dnd5e`) | every rules chapter as pages; 12 classes with their subclasses and features by level, 9 species with their lineages, 4 backgrounds, the feats, all the equipment, 339 spells (those that roll with the tracker's actions); 330 monsters and animals; 258 magic items |

## The SRD 5.2.1 books

Built from the SRD 5.2.1's own PDF (`SRD_CC_v5.2.1.pdf`,
https://www.dndbeyond.com/srd), never from another product's packaging:

    python games/srd-5e/tools/build.py path/to/SRD_CC_v5.2.1.pdf   (PyMuPDF)
    npm run build-games && npm run build-packs

`tools/extract.py` reads the PDF's lines in order, telling headings, body
text, tables, field lines and stat blocks apart by the SRD's own fonts;
`tools/parse.py` turns them into `games/srd-5e/data/*.json` (the reference
chapters as pages, classes, origins, feats, equipment, spells with the
actions read from their text, creatures, magic items). The `.mjs` files make
FG 5E (2024) records of them, the shapes the 5E wizard, sheet, level up and
tracker read. Every book's first page carries the SRD's notice word for word
(`games/srd-5e/LICENSE.md`). `npm run srd5e` plays them alone; `npm run
dnd5e` plays them and, where the GM has them, FG's own SRD modules.

## How the books are made

Each book is written as plain data in `games/<game>/*.mjs` and built into a
Fantasy Grounds module folder in `games/modules`:

    node scripts/build-content.mjs     (npm run build-games)

`npm run build-packs` then makes each folder a Kraken pack in `games/packs`
(the installer runs it): Kraken ships the packs, not the folders, and reads
them as it reads the GM's own packs. In a checkout, Kraken reads both, and the
newer one wins.

Kraken reads those folders exactly as it reads the GM's own FG modules
(`electron/books.cjs` takes `games/modules` as a second shelf, and
`electron/importers/fgModule.cjs` resolves module names there too): the Books
window, a book's activation into a campaign, an adventure's story entries,
encounters and maps with walls all work unchanged. A campaign's ruleset picks
its books (`FG_RULESETS` in books.cjs).

`games/lib/fg.mjs` writes the XML (the reverse of the importer's convert):
`md()` for rich text (it refuses badly nested markup, which would otherwise
make FG's XML swallow later records quietly), `imageRecord()` for a map with
its walls (in picture pixels; FG's centred, y-up points are worked out),
`writeModule()` for the folder.

## Maps

`games/tools/mapgen.py` draws a battle map from a layout of rooms, solids,
doors and features (in grid squares) and writes its walls and doors exactly
where the picture shows them:

    python games/tools/mapgen.py games/<game>/maps/x.json games/<game>/art/x.webp games/<game>/maps/x.walls.json

Grounds: rock, grass, dirt, space. Floors: flag, cobble, wood, dirt, grass,
metal, deck, grate. `autoSolid` wraps every room in a hull or rock wall.

## Pictures

Covers, handouts and creature portraits are made in the local ComfyUI (Z-Image
Turbo) from the prompts in `games/tools/art-list.json`:

    python games/tools/make_art.py [part-of-a-file-name]

Pictures already made are kept; delete one to make it again. A creature's
portrait goes to `art/npc/`, with a 256-pixel copy as its map token in
`art/tokens/`; its record names both inside its book (`creatureArt` in
games/lib/fg.mjs), so a copy in a campaign or an adventure's encounter still
finds them. A book's cover is its `thumbnail`; a handout is an image record
without a grid (`handout`). Check each picture by eye: no lettering, nothing
that looks like another work's characters.

## Licensing

Cairn (`games/cairn` and the three books built from it) is CC BY-SA 4.0, by
Yochai Gal, adapted for Kraken: see `games/cairn/LICENSE.md`. Fate's SRD text
(`games/fate/text` and the three books built from it) is Evil Hat's, CC BY
3.0, credited word for word in `games/fate/LICENSE.md`; *The Lighthouse at
Gull's End* and its maps are Kraken's own. The rest:

Everything else here is original: text, names, setting and pictures. Descending
Darkness's mechanics are in the 5E family; some are based on the System
Reference Document 5.1 (Wizards of the Coast LLC, CC-BY-4.0), credited in its
Player's Handbook; no SRD text is reproduced. Apeira Astra's 2d6-and-skills
task roll is a mechanic common to many games and owned by none; it uses no
other game's terms, setting or text.

The SRD 5.2.1 books (`games/srd-5e`) are the exception: they are the SRD
5.2.1's own text, under its Creative Commons Attribution 4.0 licence, with the
notice it asks for on each book's first page and in `games/srd-5e/LICENSE.md`.
They have no art, and their names use no trademark.
