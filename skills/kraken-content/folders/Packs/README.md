<!-- kraken-vtt guide: Kraken writes this file and keeps it up to date. Edit a copy, not this one. -->
# Packs (books)

Your books, one per `.kpack` file: rulebooks, bestiaries, adventures, and map
and token packs. A campaign shows the packs for its game, plus packs marked for
any game. To use one, make it active in **Modules**; to read it, open it in
**Books**.

Packs are made by Kraken, not by hand. In **Books > Packs**, **Make a pack**
turns a Fantasy Grounds module (.mod) into a pack. Kraken's own games ship
their books as packs too.

## What a pack is

A pack is a zip file:

```text
kraken-pack.json   what the book is: name, title, category, ruleset, cover
records.json       its records: story pages, creatures, items, spells, maps
images/...         its pictures, maps and tokens, at the paths the records name
```

`kraken-pack.json` names the book (`"format": "kraken-pack"`, `"version": 2`,
`name`, `title`, `category`, `ruleset`, `cover`, `records`, `pictures`). The
full format is in Kraken's documentation: `docs/kraken-pack-format.md` in the
Kraken VTT repository.

## For an AI agent

- `kraken_packs` lists the packs and makes them from FG modules.
- `kraken_books` and `kraken_library` read what is in them.
- Do not hand-edit a pack while Kraken is open. Make a new one instead.
- Packs are often licensed books: never upload or share them.
