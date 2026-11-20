# The .kpack format (format 3)

A `.kpack` is one book in one file: a rulebook, a supplement, an adventure, a
setting, a map or token pack, a set of tables. Maelstrom VTT reads it, files it
in **Modules** and **Books** by what its description says, and puts each of its
records in the sidebar list where it belongs (Story, NPCs, Items, Images,
Tables, Parcels and so on). It is Maelstrom's own format, as `.mod` is Fantasy
Grounds'.

This document is the contract. It is written for people and for AI agents
alike: an agent asked to "convert this PDF to a .kpack" should be able to do it
from this page alone, then check its work with `npm run kpack:check`.

Maelstrom was called Kraken VTT until alpha.92, so the format's files and the
folder still say "Kraken" (`kraken-pack.json`, `Documents/Kraken VTT`).

## 1. Where packs go

Packs live in the **packs folder**, one folder per game:

```text
Documents/Kraken VTT/Packs/
  AD&D 2E/            B2 The Keep on the Borderlands (AD&D 2E).kpack, ...
  D&D 5E/
  Castles & Crusades/
  Any/                packs for every game (tokens, maps, art, generic tables)
  Wizards/            character wizards (not packs)
```

- The folder name is the pack's `ruleset` (section 3). Maelstrom reads packs up
  to two folders down, and the pack's own description, not its folder, decides
  which campaigns see it and where it is filed. A pack in the wrong folder still
  works.
- `KRAKEN_PACKS` moves the packs folder (tests use this).
- **Adding one while playing:** put the file in its folder, or drop it on
  **Folders > Books & modules** in the GM's app (the folder button along the
  top), then **Refresh**. The table stays up and no player is disconnected.
- The other folders beside `Packs` (`Dice`, `Dice Towers`, `GM Icons`,
  `Background Decals`, `Wallpapers`, `Campaigns/<name>/Maps`) each have a
  `README.md` saying what goes in them.

## 2. What is inside

A pack is a zip file:

```text
kraken-pack.json      what the book is (section 3)
records.json          its records (section 5), [] for a pack of pictures only
thumbnail.webp        its icon in the lists (square, 256 px; optional)
images/..., tokens/..., sounds/...   its media, at any paths the records use
```

Media kept: `.png .webp .jpg .jpeg .gif .webm .mp4 .ogg .mp3 .wav .m4a`.
Records name media by their path in the zip (`images/maps/keep.webp`), or, for
another pack's file, `path@Pack Name`. Store pictures already compressed
(WebP, PNG, JPEG); the zip need not compress them again.

The file name is not significant: Maelstrom finds a pack by the `name` inside
it, or by its file name without `.kpack`. Name the file after the book.

## 3. kraken-pack.json

```json
{
  "format": "kraken-pack",
  "version": 3,
  "name": "B2 The Keep on the Borderlands (AD&D 2E)",
  "title": "B2 The Keep on the Borderlands",
  "ruleset": "AD&D 2E",
  "kind": "adventure",
  "group": "B series",
  "order": "B002",
  "thumbnail": "thumbnail.webp",
  "cover": "images/cover.webp",
  "category": "Adventure",
  "author": "...",
  "hasBook": true,
  "hasStory": true,
  "records": 676,
  "contents": { "pages": 120, "story": 64, "npcs": 88, "encounters": 40, "parcels": 30, "tables": 3, "images": 31 },
  "pictures": ["images/cover.webp", "..."],
  "calendar": "greyhawk",
  "made": "2026-11-20T00:00:00.000Z",
  "from": { "kind": "pdf", "name": "B2 The Keep on the Borderlands.pdf" }
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"kraken-pack"`. |
| `version` | yes | `3`. A pack in `2` is still read (its filing is worked out); below `2` is made again. A newer number than Maelstrom knows is refused. |
| `name` | yes | The book's name. Other books link to its records by this name (section 6), so never change it once others link to it. |
| `title` | yes | What the lists show. |
| `ruleset` | yes | The game it is for, exactly one of: `AD&D 2E`, `D&D 3.5E`, `D&D 5E`, `Castles & Crusades`, `Traveller`, `Descending Darkness`, `Apeira Astra`, `Cairn`, `Ironsworn`, `Starforged`, `Basic Fantasy`, `Fate Core`, `Fate Accelerated`, `Fate` (both Fate games), `Forged in the Dark`, or `Any` (every game). Anything else shows in no campaign. |
| `kind` | yes (3) | Where it is filed, one of the seven kinds below. |
| `group` | no | The line or series inside its kind: `Core Rules`, `Handbooks`, `B series`, `Against the Slave Lords`, `Greyhawk`. Without it the pack sits under its kind's own name. |
| `order` | no | How it sorts within the group (a string, compared with numbers in it: `B2` before `B10`). Without it: the adventure code in its title, else its title. |
| `parent` | no | The `name` of the pack this is a part of. Parts are listed under their parent (an adventure pack's adventures). |
| `thumbnail` | no | The icon in the lists: a square picture in the zip, 256 px. Without it: `cover`, else the picture whose name says thumbnail, cover, title or front, else the first picture. |
| `cover` | no | The book's cover, full size. |
| `category` | no | A free word kept from the source (Fantasy Grounds' category). Not used for filing in format 3. |
| `author` | no | Who wrote it. |
| `hasBook` | yes | `true` when it has pages to read in **Books** (`refpage` records, or pages kept inside the `refindex`). A pack that says `true` with no pages is not listed in Books. |
| `hasStory` | yes | `true` when it has story entries (`encounter` or `story` records): an adventure. Adventures are the GM's alone. |
| `records` | yes | How many records `records.json` holds. |
| `contents` | no | How many records go to each sidebar list (section 4). |
| `pictures` | no | The media files in the zip. |
| `calendar` | no | The world's calendar it brings, one of `gregorian`, `greyhawk`, `harptos`, `mystara`, `golarion`, `imperial`, `waning`, `astra`. Making the book active switches the campaign to it. |
| `made` | no | When the pack was made (ISO date). |
| `from` | no | What it was made from (`{ "kind": "fg-module" \| "pdf" \| "kpack-make", "name": ... }`). |

### The seven kinds

| `kind` | Shown as | For |
|---|---|---|
| `rules` | Rulesets | Core rulebooks, supplements, handbooks, monster books, spell books |
| `adventure` | Adventures | Modules and adventures; group them by series |
| `setting` | Settings | Worlds, gazetteers, campaign settings |
| `maps` | Maps & Tiles | Battle maps, map packs, tiles |
| `art` | Tokens & Art | Tokens, portraits, pogs, decals, asset packs |
| `tools` | Tables & Tools | Critical and fumble tables, calendars, pregenerated characters, name lists |
| `other` | Other | Anything else |

The Modules window shows kind > group > book > parts. `shared/packs/organize.mjs`
is the code that files packs, and works out `kind`, `group` and `order` for a
format-2 pack or a Fantasy Grounds module from its category and title.

## 4. Records and the sidebar lists

Each record's `type` decides the sidebar list it appears in, as Fantasy
Grounds' sidebar does:

| Sidebar list | Record `type` | `contents` key |
|---|---|---|
| Story (Adventures) | `encounter`, `story`, `storytemplate` | `story` |
| Encounters | `battle`, `battlerandom` | `encounters` |
| NPCs | `npc` | `npcs` |
| Items | `item` | `items` |
| Parcels | `treasureparcels` | `parcels` |
| Tables | `tables` | `tables` |
| Images (and maps) | `image` | `images` |
| Quests | `quest` | `quests` |
| Vehicles | `vehicle` | `vehicles` |
| Locations | `location` | `locations` |
| Books (pages) | `refpage`, with one `refindex` (the contents) | `pages` |
| Spells | `spell`, `spelldesc`, `spelllists` | `spells` |
| Character options | `class`, `race`, `feat`, `skill`, `specialability`, C&C's `siegepackage`, `siegepower` | `classes`, `races`, `feats`, `skills` |
| Characters | `pregencharsheet` | `characters` |
| A game's own | Castles & Crusades `siegegame`; Ironsworn and Starforged `ironasset`, `ironmove`, `ironoracle`, `irondelve`; Fate `fateskill`, `fatestunt`; Forged in the Dark `playbook`, `crewtype`, `forgedtable`; Cairn `cairntable`; 5E `background`, `race_subrace`, `class_specialization`, `itemtemplate` | `other` |
| Other | `calendar`, `license`, `hiddenstory`, `charsheet`, `effects`, `modifiers`, `lists`, anything else | `other` |

A record of a type Maelstrom does not know is kept but shown nowhere; `kpack:check` names them.

## 5. records.json

An array of records:

```json
{
  "id": "b2-the-keep-on-the-borderlands-ad-d-2e:npc.manatarms",
  "type": "npc",
  "name": "Man-at-Arms (Gate Guard)",
  "visibility": "gm",
  "source": "B2 The Keep on the Borderlands (AD&D 2E)",
  "data": { "name": "Man-at-Arms (Gate Guard)", "ac": 3, "hitDice": "1", "hp": 5, "...": "..." }
}
```

- `id`: unique in the pack: `<slug of the pack's name>:<path>`, the path being
  the record's own (`npc.manatarms`, `reference.refmanualdata.intro`). Use
  only lower-case letters, digits and hyphens in the slug.
- `type`: one of section 4's types.
- `visibility`: `gm` (the default; an adventure's records always), `all`
  (players may see it), `owner`.
- `source`: the pack's `name`.
- `data`: the record's fields. **They follow Fantasy Grounds' data shapes**
  for that ruleset (a list is an object keyed `id-00001`, `id-00002`...; a link
  is `{ "class": "...", "recordname": "path@Pack Name" }`), because the
  sheets, the tracker and the combat rules read those fields. The surest
  template for a game's NPC, item or spell is a record of the same type in one
  of that game's packs: open it with `kpack-check` or any zip tool and copy its
  shape. Every record also keeps `data.name`.

Examples of each common type, as Maelstrom's own packs hold them:

- **refpage** (a book page): `{ "name": "...", "blocks": { "id-00001": { "blocktype": "singletext", "order": 1, "text": "<p>...</p>", "frame": "blue" }, "id-00002": { "blocktype": "image", "order": 2, "caption": "...", "align": "center", "scale": 100, "image": { "layers": { "layer": { "bitmap": "images/x.webp" } } } } } }`.
  Frames: `text1`-`text5`, `blue`, `green`, `brown`, `pink`, `yellow`, `grey`,
  `sidebar`, `book`, `page`, `picture`, `noframe`. Boxed frames (`blue`,
  `green`, `brown`, `grey`, `text2`-`text5`) get the GM's read-aloud button.
- **refindex** (the book's contents, one per book). A page is either its own `refpage` record, named by the
  entry's `listlink`, or (Fantasy Grounds' newer layout) kept inside the entry itself: the entry then has the
  page's `blocks` (and `text`), and Maelstrom reads it from there. Prefer `refpage` records in a new pack:
  `{ "chapters": { "id-00000": { "name": "...", "order": 0, "subchapters": { "id-00001": { "name": "...", "order": 1, "refpages": { "id-00001": { "name": "...", "order": 1, "keywords": "...", "listlink": { "class": "reference_manualtextwide", "recordname": "reference.refmanualdata.<page>@Pack Name" } } } } } } } }`.
- **encounter** (a story entry): `{ "name": "...", "text": "<p>...</p>" }`.
- **battle** (a prepared encounter): `{ "name": "...", "npclist": { "id-00001": { "count": 2, "name": "...", "faction": "foe", "link": { "class": "npc", "recordname": "npc.x@Pack Name" }, "token": "tokens/x.png@Pack Name" } } }`.
- **treasureparcels**: `{ "name": "...", "coinlist": { "id-00001": { "amount": 32, "description": "SP" } }, "itemlist": { ... } }`.
- **tables**: `{ "name": "...", "dice": "d20", "resultscols": 1, "labelcol1": "...", "tablerows": { "id-00001": { "fromrange": 1, "torange": 1, "results": { "id-00001": { "result": "..." } } } } }`.
- **image** (a picture or a map): `{ "image": { "grid": "on", "gridsize": "50,50", "gridoffset": "0,0", "layers": { "layer": [ { "name": "...", "type": "image", "bitmap": "images/maps/keep.webp", "occluders": { "occluder": [ { "id": "0", "points": "x1,y1,x2,y2,..." } ] } } ] } } }`.
  Occluders are walls (with `toggleable` for doors, `hidden` for a secret
  door). A map with no walls is fine: the GM adds them in Map Studio.

### Text

Rich text is HTML-like: `<p>`, `<h>`, `<b>`, `<i>`, `<u>`, `<list><li>`,
`<table><tr><td>`, `<frame>`, `<link class="..." recordname="...">`. Links name
their target by its record path and its pack's name: `npc.goblin@C&C Monsters & Treasure`.

## 6. Making a pack (for people and agents)

The quickest way: put the parts in a folder and run the maker.

```text
my-book/
  kraken-pack.json   { "name": "...", "title": "...", "ruleset": "D&D 5E", "kind": "adventure", "group": "...", "cover": "images/cover.webp" }
  records.json       [ ...records... ]
  images/...         pictures, maps, tokens
```

```bash
npm run kpack:make -- "my-book"
```

It counts the records and pictures, fills in `contents`, `hasBook` and
`hasStory`, works out `kind` and `group` when not given, makes the
`thumbnail.webp`, writes `Documents/Kraken VTT/Packs/<ruleset>/<name>.kpack`,
and checks it. Then **Folders > Refresh** in Maelstrom shows it.

`npm run kpack:check -- "path/to/Book.kpack"` checks any pack: errors stop it
being read; warnings are worth fixing.

### Converting a PDF: an agent's checklist

1. **Read the whole book first.** Note its game (section 3's `ruleset`), its
   kind and series, its chapters, and every creature, item, spell, table,
   treasure, map and handout.
2. **Make the manifest:** `name` (the book's title, as others will link to
   it), `title`, `ruleset`, `kind`, `group` (the series: "B series", "Against
   the Slave Lords"; the line: "Core Rules", "Handbooks"), `order` (its code or
   number), `parent` if it is a part of another pack.
3. **Pages:** one `refpage` per section of the book, in reading order, with its
   text in `<p>` paragraphs, boxed read-aloud text in a `blue` (or `grey`)
   frame, and its pictures as image blocks. One `refindex` lists them by
   chapter.
4. **Story (adventures):** one `encounter` per keyed area or scene, its text
   from the book, linking the creatures, treasure and maps in it.
5. **Creatures, items, spells:** one record each, in the game's own data shape
   (copy the shape from that game's existing packs), linked from the pages
   that mention them.
6. **Encounters and treasure:** a `battle` for each fight (its creatures,
   counts and faction), a `treasureparcels` for each hoard.
7. **Tables:** each random table as a `tables` record.
8. **Pictures and maps:** extract them as WebP (maps at full resolution),
   one `image` record each; a map gets its grid size and offset.
9. **Cover:** the front cover as `images/cover.webp`, named in `cover`.
10. **Make and check:** `npm run kpack:make -- <folder>`; fix every error and
    warning `kpack:check` reports; then open it in Maelstrom (Modules: make it
    active, read it in Books, open its maps) and compare with the PDF.

Only convert books the GM owns, for the GM's own use. A book's content is its
publisher's: packs made from licensed books are never committed to the
Maelstrom repository or shared (the repository ships only open content).

## 7. Which copy is read

When a book is both a Fantasy Grounds module and a pack, the pack is read,
unless the module is newer (the GM changed it) or the pack's format is below 2.
The GM's own packs come before the packs Maelstrom ships.

## 8. Changes

- **3** (alpha.97): `kind`, `group`, `order`, `parent`, `thumbnail`,
  `contents`; packs kept in a folder per game; `kpack-make` and `kpack-check`.
- **2**: records in `records.json`, media at the module's paths.
