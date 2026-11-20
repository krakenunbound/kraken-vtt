<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# Packs (books)

Your books, one per `.kpack` file: rulebooks, bestiaries, adventures, and map
and token packs. A campaign shows the packs for its game, plus packs marked for
any game. To use one, make it active in **Modules**; to read it, open it in
**Books**. Copy this folder to another computer and every book comes along,
with no Fantasy Grounds needed there.

Packs are made by Maelstrom, not by hand. In **Modules > Packs**, **Make pack**
turns a Fantasy Grounds module (.mod) into a pack; **Make again** after you
change the module. Maelstrom's own games ship their books as packs too.

## Names and layout

- One folder per game: `AD&D 2E`, `D&D 5E`, `Castles & Crusades`, `Any` (packs
  for every game), and so on, each holding that game's `.kpack` files.
  Maelstrom reads packs up to two folders down; a pack's own description, not
  its folder, decides where it shows. (`Wizards` holds character wizards.)
- A pack is named after its book: `B2 The Keep on the Borderlands (AD&D
  2E).kpack`. Maelstrom finds a pack by the book's name inside it or by its
  file name, so renaming the file is harmless.
- Added while a campaign is running: drop the file on **Folders > Books &
  modules** in the GM's app, or copy it here, then **Folders > Refresh**. The
  players stay connected.

## What a pack is

A pack is a zip file:

```text
kraken-pack.json   what the book is: name, title, ruleset, kind, group, thumbnail...
records.json       its records: book pages, story entries, creatures, items,
                   spells, encounters, parcels, tables, maps with walls
thumbnail.webp     its icon in Modules and Books
images/... etc.    its pictures, maps, tokens, sounds and video
```

Modules files each pack by its `kind` (Rulesets, Adventures, Settings, Maps &
Tiles, Tokens & Art, Tables & Tools, Other), then its `group` (a series or
line), then the book, then its parts. The full format, with how to make a pack
from a PDF and check it, is `docs/kpack-format.md` in the Maelstrom
repository (`npm run kpack:make`, `npm run kpack:check`).

When a book is both a module and a pack, the pack is read, unless the module
is newer or the pack is in an older format: then the module is read until the
pack is made again.

## For an AI agent

- `kraken_packs` `list` shows each module, its pack (current, older, none) and
  the one being made; `make` makes packs (`books: [ids]` or `["all"]`);
  `folder` gives this folder.
- `kraken_books` (activate, contents, page) and `kraken_library` (list by kind:
  story, npc, battle, parcel, table, image, map) read what is in them. Check
  the record and picture counts after making one.
- A pack's `ruleset` must be a Maelstrom game, or it shows in no campaign; its
  `kind` one of the seven (docs/kpack-format.md).
- Making one from a PDF: follow docs/kpack-format.md section 6, then
  `npm run kpack:check`.
- Do not hand-edit a pack while Maelstrom is open. Make a new one instead.
- Encrypted store modules (FG's `vault` `.dat` files) are not listed and
  cannot be read as files. Never try to decrypt them. A store book that FG
  has loaded is read through the Kraken Agent Bridge instead, with
  `scripts/fg-bridge-export/export_book.py` in the Maelstrom repository: its
  records, with their formatting, plus its pictures captured from FG. See
  "Books FG keeps encrypted" in `docs/kraken-pack-format.md`.
- Packs are often licensed books: never upload or share them.
