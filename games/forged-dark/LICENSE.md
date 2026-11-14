# Forged in the Dark: licence of this folder

This work is based on Blades in the Dark (found at http://www.bladesinthedark.com/), product of One Seven Design, developed and authored by John Harper, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (http://creativecommons.org/licenses/by/3.0/).

Kraken VTT is not affiliated with or endorsed by One Seven Design or John Harper. "Blades in the Dark" is used here only to credit the source, as its licence asks; it is not part of the name of any Kraken book or ruleset. "Forged in the Dark" is the system's open name. No logo and no art from the book or from bladesinthedark.com is included.

## What is here

- `text/srd.md`: the Blades in the Dark System Reference Document's text, copied unchanged from https://github.com/amazingrando/blades-in-the-dark-srd-content (`Blades-in-the-Dark-SRD.md`), the text version linked from the official licensing page (https://bladesinthedark.com/licensing). The SRD has no setting (no city, no named factions) and no finished playbooks or crews: it gives the rules, how to make playbooks and crews, and examples (42 special abilities, 16 crew special abilities, upgrades and claims).
- `markdown.mjs`, `content.mjs`, `scoundrels-handbook.mjs`, `gm-guide.mjs`, `brine-street.mjs`: adaptations that turn that text into Kraken VTT books (Fantasy Grounds module folders, built into `games/modules` and then Kraken packs): *Forged in the Dark: Scoundrel's Handbook*, *Forged in the Dark: Game Master's Guide* and *The Brine Street Job*.
- Kraken's own additions, written for Kraken and shared under the same CC BY 3.0 licence: the city of Brackwater (its heritages and backgrounds), the seven playbooks (Enforcer, Tracker, Tinker, Burglar, Grifter, Schemer, Occultist: their descriptions, starting dots, xp triggers, friends and rivals, and items; their special abilities are the SRD's examples, in the SRD's order), the six crew types (Assassins, Bravos, Cult, Hawkers, Shadows, Smugglers: their descriptions, xp triggers, starting upgrades, operations and contacts; their abilities, upgrades and claims are the SRD's examples), the standard items, the example experts, and the starter score *The Brine Street Job* (its story, people, factions and clocks).
- `maps/` and `art/`: the Brine Street Counting-house battle map, drawn by Kraken VTT's map maker (`games/tools/mapgen.py`) from the score's text, with its walls and doors. CC BY 3.0 as well.

## Changes made

- The SRD's Markdown was split into reference-book pages (a page for each section); headings, lists, tables and quotes were converted to Fantasy Grounds formatted text; the editors' "@TODO" notes and empty table headers were left out; character entities were decoded.
- The special abilities, crew special abilities, crew upgrades and claims were made into records (word for word); the vices, trauma conditions, overindulgences and crew reputations into tables; the entanglements into pages and a table by heat.
- The SRD's templates for making a playbook or a crew ("Character playbook", "Crew playbook") are kept, as the GM's guide to making more.

## Scope

The CC BY 3.0 attribution above applies to the SRD text and the books made from it (this folder, and `games/modules/Forged in the Dark Scoundrel's Handbook`, `games/modules/Forged in the Dark Game Master's Guide`, `games/modules/The Brine Street Job`, and their packs). Kraken VTT's own code (PolyForm Shield, see the repository's LICENSE) is not covered by it, including the rules engine in `shared/forged/rules.mjs` and `electron/forged.cjs`, which implement the game's mechanics.
