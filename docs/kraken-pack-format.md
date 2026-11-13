# The Kraken pack format (.kpack)

A Kraken pack is one book in one file: a rulebook, a bestiary, an adventure,
a map or token pack. It is Kraken's equivalent of a Fantasy Grounds `.mod` or
a Foundry compendium pack. Kraken reads its books only from packs. Its own
games' books ship as packs too, so nothing about a book is built into the
app's code.

## Where packs go

Put `.kpack` files in the **packs folder**. Kraken reads it at startup and
whenever the Books window opens:

| System | Folder |
|---|---|
| Windows | `C:\Users\<you>\Documents\Kraken VTT\Packs` |
| Linux | `~/Documents/Kraken VTT/Packs` |

Set `KRAKEN_PACKS` to use another folder. Kraken creates the folder the first
time you make a pack. On a new computer, create it yourself and copy the
`.kpack` files in. **Books > Packs > Open folder** opens it.

A campaign shows the packs for its game, plus the packs marked for any game.
Make a book active in **Modules** to bring its records into the campaign, or
read it in **Books**.

## What is inside

A pack is a zip file with three kinds of entry:

```text
kraken-pack.json   what the book is
records.json       its records
images/...         its pictures, maps and tokens, at the paths the records name
tokens/...
```

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

- `name` is how other books link to this one.
- `ruleset` is the Kraken game the pack is for: `Castles & Crusades`,
  `D&D 3.5E`, `AD&D 2E`, `D&D 5E`, `Traveller`, `Descending Darkness`,
  `Apeira Astra`, or `Any` for every game.
- `hasBook` says whether the pack has pages to read in Books.
- `hasStory` says whether it is an adventure with story entries.
- `version` is the format's version. Kraken refuses a pack made by a newer
  Kraken, and reads the source module instead of a pack in an older format.

### records.json

An array of records, in the form a Kraken campaign keeps them:

```json
{ "id": "c-c-players-handbook:...", "type": "npc", "name": "Goblin",
  "visibility": "gm", "source": "C&C Player's Handbook", "data": { ... } }
```

Record types include:

- the book's pages and its contents;
- `npc`, `item`, `spell`, and the game's classes, races and feats;
- `encounter`, which is a story entry;
- `battle`, a prepared encounter, and `treasureparcel`;
- `table`, a random table;
- `image`, a picture or a map. A map record holds its grid, walls, doors and
  lights.

Rich text uses Kraken's small markup: p, h, b, i, u, list/li, table/tr/td,
frame and link. A link names its target by the record's path and the pack's
name, for example `npc.goblin@C&C Monsters & Treasure`. Each record's `data`
keeps the fields its game's sheets read.

## Making packs

- **From your Fantasy Grounds books:** in **Books > Packs**, choose
  **Make pack** for one book or **Make N packs** for all of them. The
  `kraken_packs` tool does the same. A pack is read once from the module and
  then stands on its own. Choose *Make again* after you change the module.
- **Kraken's own games:** run `npm run build-games`, then
  `npm run build-packs`. These write the module folders in `games/modules`,
  then pack them into `games/packs`, which the installer ships. Your own packs
  come first: one with the same name in your packs folder is read instead.

## Rules versus books

A pack carries a game's content: its classes, spells, monsters, gear and
adventures. The rules that use that content are Kraken's code, one engine per
game (`shared/<game>/`): how a d20 attack, a C&C Siege check or a Traveller
2d6 roll works. Fantasy Grounds splits a ruleset from its modules the same
way. A new game needs its rules in Kraken. Its books are packs.

## Licensing

Packs made from the books you own are yours alone. They are never shipped
with Kraken or put in its repository. Kraken's own games' packs are original
and ship with the app.
