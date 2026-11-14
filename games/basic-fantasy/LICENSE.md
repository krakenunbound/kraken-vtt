# Basic Fantasy: licence

Everything in this folder (`games/basic-fantasy/`) and the books Kraken builds
from it (the *Basic Fantasy Player's Handbook*, the *Basic Fantasy Game
Master's Guide* and the adventure *The Mill at Hob's Ford*, in `games/modules`
and `games/packs`) is licensed under the **Creative Commons
Attribution-ShareAlike 4.0 International License**
(https://creativecommons.org/licenses/by-sa/4.0/).

It is adapted from:

> **Basic Fantasy Role-Playing Game, 4th Edition**, Copyright © 2006-2023
> Chris Gonnerman, https://www.basicfantasy.org, licensed under CC BY-SA 4.0
> https://creativecommons.org/licenses/by-sa/4.0/

(read from the book's source in Quarto markdown, Release 128,
github.com/Solomoriah/bfrpg).

## Changes made

- The book's text was split into Kraken books: the rules chapters as
  reference pages; the races, classes, spells, equipment, monsters and magic
  items as separate records; formatting converted from Quarto markdown to
  Fantasy Grounds formatted text (`games/tools/bfrpg-extract.mjs` does it,
  and keeps the result in `data/`). The interactive book's own widgets (stat
  roller, table lookups) and its artwork are left out: the artwork is the
  artists' and is not covered by the licence. Kraken ships no art from the
  book.
- A few obvious slips in the source data were corrected (a creature listed
  twice; "Dire Wold" for "Dire Wolf"); a creature's blank cell in a shared
  stat table takes the first column's value, as the book's tables mean.
- Equipment records carry Kraken's fields (a weapon's damage from its
  ammunition, missile and thrown flags, armour class numbers); a few plain
  magic weapons and armour ("Longsword +1") are listed as records.
- *The Mill at Hob's Ford* is an original adventure written for Kraken VTT
  for this game; as an adaptation of the game it is under the same licence.

## What the share-alike covers

Only the files in this folder (`games/basic-fantasy/`), the data and books
built from them, and `games/tools/bfrpg-extract.mjs`'s output. Kraken VTT's
own code (including its Basic Fantasy rules engine in `shared/bfrpg/`, the
sheet and wizard) stays under Kraken's own licence (see the repository's
`LICENSE`); the game mechanics it implements are not text from the book.
