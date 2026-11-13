# Kraken's own games

Two original games ship with Kraken, so testers can play without any
Fantasy Grounds modules:

| Game | Engine | Books (games/modules) |
|---|---|---|
| **Descending Darkness** (dark fantasy) | the d20 family (`shared/dnd5e/rules.mjs`, profile `descending`) | Player's Handbook, Bestiary, *The Empty Watchtower* |
| **Apeira Astra** (science fiction) | its own 2d6 engine (`shared/astra/rules.mjs`) | Crew Handbook, Threat Dossier, *Salvage Rights* |

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

Everything here is original: text, names, setting and pictures. Descending
Darkness's mechanics are in the 5E family; some are based on the System
Reference Document 5.1 (Wizards of the Coast LLC, CC-BY-4.0), credited in its
Player's Handbook; no SRD text is reproduced. Apeira Astra's 2d6-and-skills
task roll is a mechanic common to many games and owned by none; it uses no
other game's terms, setting or text.
