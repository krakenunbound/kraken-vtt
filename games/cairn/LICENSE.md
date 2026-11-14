# Cairn: licence of this folder

Cairn Second Edition by Yochai Gal, https://cairnrpg.com, licensed under CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/

*CAS-1: Trouble in Twin Lakes* by Yochai Gal (editing by Derek B. and Yossi Krausz), whose text is licensed under the same CC BY-SA 4.0 licence.

## What is here

- `text/`: the official Markdown text of Cairn Second Edition's Player's Guide, Warden's Guide and Backgrounds, and the text of *CAS-1: Trouble in Twin Lakes*, copied from https://github.com/yochaigal/cairn (`second-edition/` and `adventures/first-party/cas-1.md`). That repository's GPL-3.0 `LICENSE` covers its website code only; the game text is CC BY-SA 4.0, as cairnrpg.com and the repository's README say.
- `players-guide.mjs`, `wardens-guide.mjs`, `trouble-in-twin-lakes.mjs`, `markdown.mjs`: adaptations that turn that text into Kraken VTT books (Fantasy Grounds module folders, built into `games/modules` and then Kraken packs).
- `maps/` and `art/`: two battle maps (the Temple of the Fungal Lizards and Deadmill) drawn by Kraken VTT's map maker from the adventure's text. They are released under CC BY-SA 4.0 as well.

## Changes made

- The Markdown was split into reference-book pages (one per section); headings, lists, tables and quotes were converted to Fantasy Grounds formatted text; links to the website were reduced to their words; pictures were left out.
- Tables were made into rollable tables; the backgrounds, the Marketplace's gear, the spellbooks, the relics and the bestiary's creatures were made into records (their numbers read from the text: damage dice, Armor, slots, uses, stat lines).
- The adventure's lines pointing to the print and PDF editions were left out; its creatures, relics, encounters and treasure were made into records.
- No art from cairnrpg.com or the books (credited to Cairn Press and its artists) is included.

## Scope of the share-alike

CC BY-SA 4.0 applies to the Cairn text and these adaptations: this folder and the books built from it (`games/modules/Cairn Player's Guide`, `games/modules/Cairn Warden's Guide`, `games/modules/Trouble in Twin Lakes`, and their packs). It does not extend to Kraken VTT's own code (PolyForm Shield, see the repository's LICENSE), including the rules engine in `shared/cairn/rules.mjs`, which implements the game's mechanics and contains none of its text.
