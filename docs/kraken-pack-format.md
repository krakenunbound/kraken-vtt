# The Maelstrom pack format (.kpack)

> **The format itself is now described in [kpack-format.md](kpack-format.md)** (format 3: where a pack is
> filed, its thumbnail, what it holds, the folder per game, making a pack from a PDF, `npm run kpack:make` and
> `npm run kpack:check`). This page keeps the history of format 2 and how packs are made from Fantasy Grounds
> modules; where the two differ, kpack-format.md is right.

A pack is one book in one file: a rulebook, a bestiary, an adventure, a map
or token pack. It is Maelstrom's equivalent of a Fantasy Grounds `.mod` or a
Foundry compendium pack. Maelstrom was called Kraken VTT until alpha.92, so
the format, its folder and its tools still say "Kraken" (`kraken-pack.json`,
`Documents/Kraken VTT/Packs`, `kraken_packs`).

Maelstrom's own games ship their books only as packs, so nothing about a
book is built into the app's code. A GM's own books come from their Fantasy
Grounds modules: Maelstrom reads a module directly, or the pack made from it
(see [Which copy is read](#which-copy-is-read)).

## Where packs go

Put `.kpack` files in the **packs folder**:

| System | Folder |
|---|---|
| Windows | `C:\Users\<you>\Documents\Kraken VTT\Packs` |
| Linux | `~/Documents/Kraken VTT/Packs` |

Set `KRAKEN_PACKS` to use another folder. Maelstrom creates the folder, with
its `README.md`, when it starts. It holds a folder per game (`AD&D 2E`, `D&D 5E`,
`Any`...), each with that game's packs; Maelstrom reads packs up to two folders
down (its `Wizards` folder holds character wizards, not books).
**Modules > Packs > Open folder** opens it. Copy the folder to another
computer and every book comes along; that computer needs no Fantasy Grounds.

A campaign shows the packs for its game, plus the packs marked for any game.
Make a book active in **Modules** to bring its records into the campaign, or
read it in **Books**.

## File names

`makePack` names the file after the **module's file**, not the book's title:
`B2 The Keep on the Borderlands (AD&D 2E).mod` becomes
`B2 The Keep on the Borderlands (AD&D 2E).kpack`, and a store module such as
`2806727-Dungeon_Builder_5E_V6.mod` becomes `2806727-Dungeon_Builder_5E_V6.kpack`.
Making the pack again overwrites that file, and only once the new one is
whole (it is written as `<name>.kpack.part` first).

Maelstrom finds a pack by the book's `name` inside it or by its file name
without `.kpack`. Renaming the file therefore does no harm, as long as the
`name` inside stays the same: other books link to it by that name.

## What is inside

A pack is a zip file:

```text
kraken-pack.json   what the book is
records.json       its records
<the module's own paths>   its pictures, maps, tokens, sounds and video
```

The media files keep the paths they had in the module (`images/map-1.webp`,
`tokens/ogre.png`, `sounds/door.ogg`), because the records name them by those
paths. A pack keeps `.png .webp .jpg .jpeg .gif .webm .mp4 .ogg .mp3 .wav .m4a`
files and leaves out the module's XML and scripts.

### kraken-pack.json

```json
{
  "format": "kraken-pack",
  "version": 2,
  "name": "C&C Player's Handbook",
  "title": "C&C Player's Handbook",
  "category": "Core Rules",
  "ruleset": "Castles & Crusades",
  "author": "...",
  "cover": "images/cover.webp",
  "hasBook": true,
  "hasStory": false,
  "records": 469,
  "pictures": ["images/cover.webp", "..."],
  "made": "2026-11-12T00:00:00.000Z",
  "from": { "kind": "fg-module", "name": "C&C Player's Handbook", "ruleset": "SiegeCore" }
}
```

- `name` is the book's name in the module, and how other books link to it.
- `title` is what the Books window shows.
- `ruleset` is the Maelstrom game the pack is for, worked out from the
  module's Fantasy Grounds ruleset:

  | Fantasy Grounds ruleset | `ruleset` |
  |---|---|
  | SiegeCore, CnCRPG | `Castles & Crusades` |
  | 3.5E | `D&D 3.5E` |
  | 2E | `AD&D 2E` |
  | 5E | `D&D 5E` |
  | MGT2 | `Traveller` |
  | Descending Darkness | `Descending Darkness` |
  | Apeira Astra | `Apeira Astra` |
  | Cairn | `Cairn` |
  | Ironsworn | `Ironsworn` |
  | Starforged | `Starforged` |
  | Basic Fantasy | `Basic Fantasy` |
  | Fate Core | `Fate Core` |
  | Fate Accelerated | `Fate Accelerated` |
  | Forged in the Dark | `Forged in the Dark` |
  | CoreRPG, Any, none | `Any` (every game) |

  Any other ruleset name is kept as it is. A pack whose `ruleset` matches no
  Maelstrom game shows in no campaign.
- `hasBook` says whether the pack has pages to read in Books.
- `hasStory` says whether it has story entries (an adventure).
- `pictures` lists the media files in the pack.
- `version` is the format's version (2 now). Maelstrom refuses a pack made by
  a newer Maelstrom, and reads the source module instead of a pack in an
  older format, until that pack is made again.
- `calendar` (optional) is the world's calendar the book brings: `greyhawk`,
  `harptos`, `mystara`, `golarion`, `gregorian`, `imperial`, `waning`, `astra`.
  When a book with a calendar is made active, the campaign's calendar
  switches to it. Packs made from modules do not write this field; without it,
  Maelstrom recognises a setting by the book's name, title or category
  (Mystara and its Known World, Greyhawk, the Forgotten Realms, Golarion).

### records.json

An array of records, in the form a campaign keeps them:

```json
{ "id": "c-c-players-handbook:...", "type": "npc", "name": "Goblin",
  "visibility": "gm", "source": "C&C Player's Handbook", "data": { ... } }
```

Record types (as counted in real packs) include:

- `refpage`, a book page, and `refindex`, its contents. A page has `text`
  and `blocks`; a block holds text (`text`, and `text2` for a second
  column), a picture (`image` or `picture`, with `caption`, `align`,
  `scale`), and a `frame` name. Books draw these frames: `text1` to
  `text5`, `blue`, `green`, `brown`, `pink`, `yellow`, `grey`,
  `sidebar`, `book`, `page`, `picture` (`noframe` or none: no frame). The
  boxed ones (`blue`, `green`, `brown`, `grey`, `text2` to `text5`) get
  the GM's read-aloud button;
- `encounter`, a story entry (Fantasy Grounds' story records, in the Story
  list, by category), and `story`/`storytemplate` from books that use story
  templates;
- `npc`, `item`, `spell` and `spelldesc`, `spelllists`, and the game's
  own kinds: `class`, `race`, `feat`, `skill`, `specialability`, C&C's
  `siegepackage` and `siegepower`, `pregencharsheet` (pregenerated
  characters);
- `battle`, a prepared encounter, `battlerandom`, a random encounter, and
  `treasureparcels`;
- `tables`, a random table;
- `image`, a picture or a map. A map record holds its grid, walls, doors and
  lights;
- `calendar`, a book's own calendar data, and `license`.

Rich text uses a small markup: p, h, b, i, u, list/li, table/tr/td, frame and
link. A link names its target by the record's path and the pack's name, for
example `npc.goblin@C&C Monsters & Treasure`. Each record's `data` keeps the
fields its game's sheets read.

A campaign's own story entries (World > Story > New) are not pack records.
They are written in Maelstrom, with pages of their own kinds (text, columns,
heading, pictures, separators) and frames (`kraken_story`).

## Which copy is read

When a book is both a module and a pack, Maelstrom reads the **pack**, unless:

- the module file is newer than the pack (the GM changed the module since);
- the pack is in an older format (`version` below 2).

Then the module is read until the pack is made again (**Make again**). The
GM's own packs come before the packs Maelstrom ships: a pack with the same
name in the packs folder is read instead.

## Making packs

- **From your Fantasy Grounds books:** in **Modules > Packs**, choose
  **Make pack** for one book or **Make N packs** for all of them. The
  `kraken_packs` tool does the same. A pack is read once from the module and
  then stands on its own.
- **Maelstrom's own games:** run `npm run build-games`, then
  `npm run build-packs`. These write the module folders in `games/modules`,
  then pack them into `games/packs`, which the installer ships.

## Converting a book: an agent's checklist

Do this through Maelstrom's MCP server (`kraken`) while Maelstrom is running
with a campaign hosted. Never write a pack by hand.

1. **Find it.** `kraken_packs` `list` with the campaign's game as `ruleset`
   lists each Fantasy Grounds module that fits, its pack (current, older than
   the module, or none) and packs with no module on this computer. Use
   `ruleset: ""` to list every game.
2. **Make it.** `kraken_packs` `make` with `books: [<module id or name>]`, or
   `["all"]` for every listed book without a current pack. Packs are made one
   at a time in the background; `list` shows the one being made and how far
   it is. Wait until its pack shows as current.
3. **Check what it holds.** The result and `list` give the record and
   picture counts. Then:
   - `kraken_books` `activate` (book), then `contents` and `page` for a
     rulebook's chapters, pages and pictures;
   - `kraken_library` `list` with `kind` `story`, `npc`, `battle`, `parcel`,
     `table`, `image` or `map` for an adventure's records;
   - open a map from the Library: its walls, doors and lights came from the
     module's map.
4. **Check the game.** The pack's `ruleset` must be a Maelstrom game (see the
   table above), or it shows in no campaign. A module made for CoreRPG
   becomes `Any`.
5. **Report.** Give the pack's file, its record and picture counts, and
   anything that did not come across.

Things that stop a conversion:

- a file that is not a Fantasy Grounds module (no `definition.xml`);
- a module Fantasy Grounds keeps encrypted (a store book in FG's `vault`
  folder, a `.dat` file such as `WOTC2EPHB.dat`). `kraken_packs` does not list
  it and no file reader can open it. Read it through Fantasy Grounds instead
  (next section). Never try to decrypt or unzip vault files.

## Books FG keeps encrypted: read them through the Agent Bridge

A store book that FG has loaded is readable in the running FG, record by
record, through the Kraken Agent Bridge (the `fgu` tools). This is how the
AD&D 2E core books (PHB, DMG, Monstrous Manual, the Complete handbooks) were
made into packs. The scripts are in `scripts/fg-bridge-export/`.

**You need:**

- FG open with a campaign of the book's ruleset, the book **loaded** in it
  (`Module.getModuleInfo` says `loaded: true`; load it with
  `Module.activate` after telling the GM), and `fgu_status` connected;
- the bridge's `db_xml` command (added to `KrakenAgentBridge/scripts/bridge.lua`
  on 2026-11-18). After changing `bridge.lua`, `fgu_reload` reloads it in the
  same FG: it does not start another FG;
- Python with Pillow, and Node (the scripts call Maelstrom's own pack maker
  from this repository).

**Run it:**

```text
python scripts/fg-bridge-export/export_book.py "AD&D 2E Players Handbook"
python scripts/fg-bridge-export/export_book.py --list books.json
```

The book's name is its FG module name (`Module.getModules`), not a file
name. Each book becomes its own pack, `<book name>.kpack`, in the packs
folder. The script prints one JSON line per book: records, pictures, any
pictures that failed, and `count_mismatch`, every section whose record count
differs from FG's own (empty when it is right). Its staging folder,
`<FG data>/kraken_exports/<book>/`, is outside FG's `modules` folder, so the
rebuilt module never collides with the store book in FG.

**How it works, and what it learned:**

- **Records:** `DB.getRoot(<book>)` gives the book's top-level nodes
  (`reference`, `image`, `library`, `list`, `effects`, `modifiers`...).
  `db_get` is not enough for a book: it returns `string` and `formattedtext`
  alike, drops categories and pictures, and stops at `max` nodes. `db_xml`
  writes a node as FG's own XML instead: every field with its real type,
  formatted text as it is (`<b>`, `<i>`, `<u>`, `<list>`, `<table>`,
  `<frame>`, `<linklist>`, `<h>`), links as `windowreference`s, and each
  record in its `<category name>`. FG reports the book's own name as the
  category of any node that has none, so only other names become categories.
  A whole PHB (9.6 MB of XML) takes about 4 seconds.
- **`DB.export` refuses module nodes** ("Only non-module database nodes can
  be exported"). Don't copy module records into the campaign to get around
  that. `db_xml` reads them where they are.
- **2E keeps its records in `reference.*data` sections**: `spelldata`,
  `classdata`, `racedata`, `skilldata`, `npcdata`, `equipmentdata`,
  `magicitemdata`, story in `encounters`, the "Story Reference" entries in
  `hiddenstory` (the 2E ruleset's `aDataMap`s in
  `scripts/data_library_adnd.lua`). The converter reads each record there as
  a record of its type, in its category, under the path pages link to
  (`reference.spelldata.id-00012@<book>`). `scripts/check-reference-sections.mjs`
  checks it.
- **Pictures can't be read from scripts.** An `image` field has no value in
  FG's Lua, so `db_xml` writes it empty. The script captures each one
  instead:
  - it opens the image record's `imagewindow` and asks its `image` control
    for `getImageSize`;
  - it sizes the window to fit (`setSize`, about 24×100 px of frame around
    the control) and sets each view with `setViewpoint(x, y, 1)` for 1:1;
  - **a picture's view coordinates start either at its top left corner or at
    its centre**, depending on the picture. Don't assume either one. Call
    `zoomToFit` first: `getViewpoint` then gives the picture's centre in its
    own coordinates, and every 1:1 view is set relative to that. Assuming the
    top left corner pushes the centre-based pictures off centre;
  - it captures FG's window with PrintWindow, which reads FG's own drawing,
    so windows on top don't matter. Screen grabs from a background shell
    fail with "screen grab failed";
  - pictures bigger than the window are captured in tiles and stitched;
  - each capture is compared with FG's own `zoomToFit` view. A capture
    that differs (mean difference above 12 per channel) is refused and
    listed in `failed`, not saved. A good capture scores 0 to 8, a shifted
    one well over 100;
  - each is saved as WebP, quality 85, method 6.

  `images.json` in the staging folder ties each picture record's path to its
  file, name, size and grid, so the pictures are never lost. Page blocks link
  to their picture record through `imagelink`, so the same file fills the
  record and every block that shows it. FG's windows move while this runs.
- **Check against FG:** the script compares every section's record count with
  `DB.getChildCount` in FG. For the PHB: 1,007 pages, 551 spells, 319 items,
  89 skills, 16 classes, 6 races, 20 tables, 54 pictures, all equal. Then
  activate the book in a Maelstrom campaign and compare a page in FG and in
  Books (`kraken_books` `page`). Bold, italics, tables with column spans,
  frames and links should all match.

## Rules versus books

A pack carries a game's content: its classes, spells, monsters, gear and
adventures. The rules that use that content are Maelstrom's code, one engine
per game (`shared/<game>/`): how a d20 attack, a C&C Siege check or a
Traveller 2d6 roll works. Fantasy Grounds splits a ruleset from its modules
the same way. A new game needs its rules in Maelstrom. Its books are packs.

## Licensing

Packs made from the books you own are yours alone. They are never shipped
with Maelstrom or put in its repository; never upload or share them. Maelstrom's
own games' packs are original and ship with the app.
