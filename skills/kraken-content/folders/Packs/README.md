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

- One file per book, straight in this folder (no subfolders; `Wizards` holds
  character wizards, not books).
- A pack is named after the module's file: `B2 The Keep on the Borderlands
  (AD&D 2E).mod` becomes `B2 The Keep on the Borderlands (AD&D 2E).kpack`.
- Maelstrom finds a pack by the book's name inside it or by its file name, so
  renaming the file is harmless. Other books link to it by the name inside.

## What a pack is

A pack is a zip file:

```text
kraken-pack.json   what the book is: name, title, category, ruleset, cover
records.json       its records: book pages, story entries, creatures, items,
                   spells, encounters, parcels, tables, maps with walls
images/... etc.    its pictures, maps, tokens, sounds and video, at the paths
                   they had in the module
```

`kraken-pack.json` names the book (`"format": "kraken-pack"`, `"version": 2`,
`name`, `title`, `category`, `ruleset`, `cover`, `hasBook`, `hasStory`,
`records`, `pictures`, `from`; optionally `calendar`). The full format, and
an agent's checklist for converting a book, are in
`docs/kraken-pack-format.md` in the Maelstrom repository.

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
- A pack's `ruleset` must be a Maelstrom game, or it shows in no campaign.
- Do not hand-edit a pack while Maelstrom is open. Make a new one instead.
- Encrypted store modules cannot be made into packs.
- Packs are often licensed books: never upload or share them.
