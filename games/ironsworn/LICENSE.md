# Ironsworn and Starforged: licence of this folder

This work is based on Ironsworn, Ironsworn: Delve and Ironsworn: Starforged, created by Shawn Tomkin, and licensed for our use under the Creative Commons Attribution 4.0 International license (https://creativecommons.org/licenses/by/4.0/).

This is an unofficial adaptation made for Kraken VTT, compatible with Ironsworn and Ironsworn: Starforged. It is not an official Tomkin Press product, and is not affiliated with or endorsed by Shawn Tomkin or Tomkin Press. It uses no Tomkin Press art, icons or trade dress.

## Data: Datasworn

The moves, assets, oracle tables, Delve's site themes and domains, and Starforged's sample foes and setting truths come from Datasworn (https://github.com/rsek/datasworn, by rsek and contributors, and its community continuation https://github.com/datasworn-community/official-content, `generated-datasworn/`, Datasworn 0.3.0). Datasworn's schema and code are licensed under the MIT License; its content is Shawn Tomkin's, each object carrying its own licence (`_source.license`).

Only the content licensed **CC BY 4.0** is included. Tomkin Press licenses CC BY 4.0: the Ironsworn SRD, asset card text and oracle table text; Delve's moves, oracles, theme and domain cards; the Starforged Reference Guide (rules summaries, moves, oracles), handouts and asset cards. The full rulebook texts (and most of *Sundered Isles*) are CC BY-NC-SA 4.0 and are **not** included.

`tools/filter-datasworn.mjs` keeps only the objects whose licence is CC BY 4.0 (an object without its own licence takes its parent's; a package's top level takes the stricter licence `manifest.json` gives the package) and drops everything NC. Its counts are in `data/filter-report.json`:

| Package | Kept (CC BY 4.0 objects) | Dropped (CC BY-NC-SA) |
|---|---|---|
| Ironsworn (classic) | 193 | 17 (the Ironlands atlas, 5 foe collections, 11 setting truths; 38 objects inside them; 44 rules-summary text fields outside any object) |
| Ironsworn: Delve | 96 | 91 (20 premade delve sites, 6 foe collections, 65 rarities; 29 objects inside them; 3 text fields) |
| Ironsworn: Starforged | 547 | 0 |

The *Sundered Isles*, *Lodestar* and giveaway packages are not used.

## What is here

- `data/`: the filtered Datasworn JSON (CC BY 4.0 content only), as `tools/filter-datasworn.mjs` writes it, and its report.
- `datasworn.mjs`: turns that data into Kraken records (moves, assets, oracles as Fantasy Grounds tables, Delve's themes and domains, Starforged's sample foes) and pages.
- `rules-text.mjs`: Kraken VTT's **own** short rules chapters (how to play, written for this adaptation; not the rulebooks' text), and the front-page attribution.
- `books.mjs`: the six books (Ironsworn Reference, Ironsworn Foes and Sites, The Cinder Barrow; Starforged Reference, Starforged Foes, The Silent Hulk), built into `games/modules` by `npm run build-games`.
- `maps/` and `art/`: the two starter scenarios' maps, drawn by Kraken VTT's map maker (`games/tools/mapgen.py`).

## Changes made

Datasworn's Markdown was turned into Fantasy Grounds formatted text: links between moves shown as their plain names, bold and lists kept, tables embedded in moves kept as separate oracle tables; oracle tables became rollable tables; assets, moves and foes became records. Nothing was reworded.

## Kraken's own parts

The rules chapters, the Ironsworn foes in *Ironsworn Foes and Sites* (Ironsworn's own foes are CC BY-NC-SA and are not used), the two starter scenarios (*The Cinder Barrow*, *The Silent Hulk*) and their maps are Kraken VTT's own, and may be shared under CC BY 4.0 with this folder. Kraken VTT's code (PolyForm Shield, see the repository's LICENSE), including the engine in `shared/ironsworn/rules.mjs` and `electron/ironsworn.cjs`, implements the games' mechanics and contains none of their text.
