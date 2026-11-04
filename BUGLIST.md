# Kraken VTT: bug list

From the B2 play test (`scripts/playtest-b2.mjs`, 2026-11-03): a C&C campaign with the Player's Handbook, Monsters & Treasure and B2 The Keep on the Borderlands; four characters for four test players (Dwarf Fighter, Human Cleric, Elf Wizard, Halfling Rogue, all level 2) on the party sheet and the combat tracker; B2's Caves of Chaos on the table; the kobold ambush from the Library; three rounds of initiative, attacks, damage, saves, Bless, Sleep, Magic Missile, Cure Light Wounds and effects; treasure and XP; a test player in Chrome. Plus what the B-series sweep and the screenshots showed.

Each bug has a test once fixed. Severity: **high** (wrong rules or data, or the app stops), **medium** (works, badly), **low** (polish).

| # | Severity | Bug | Found by | State |
|---|---|---|---|---|
| 1 | high | FG's XML reader kept one of each repeated element, so an image's layers collapsed into one: maps lost their walls, lights and pins | B2 import | Fixed (alpha.12): image layers, occluders, lights, strokes and paths are lists |
| 2 | high | Line of sight froze the app on big maps (B2's Caves of Chaos: 4,916 walls, 162 lights) | B2 import screenshot | Fixed (alpha.12): a light reaches only its radius; rays walk a grid of cells (20 ms a token) |
| 3 | high | Casting a spell whose effect is in its actions did nothing (Bless, Sleep cast from the power) | play test | Fixed (alpha.13): the first action is cast unless one is named, as FG's cast button |
| 4 | high | Cure Light Wounds cast from the power used all three of its actions' fields at once: it both damaged and healed every target | play test | Fixed (alpha.13): the first action only (Cure (living)) |
| 5 | high | Magic Missile fired one missile at any level: fix 1 made fields a module writes twice (the PHB's repeatbase) into lists | `spells` | Fixed (alpha.13): only an image's repeated elements become lists |
| 6 | medium | 3D dice pile up on the GM's screen: every roll's dice stay where they land (FG fades them after a moment) | GM screenshot | Fixed (alpha.14): at most 16 dice lie on the table; the oldest landed dice make way at once (dice still rolling always land first) |
| 7 | medium | The GM's top bar overlaps: party portraits, the module and scene names, the grid label and "Hosting" run into one another | GM screenshot | Fixed (alpha.14): the brand and status keep their room; with more than three in the party only their faces show (names on hover); the scene names shorten |
| 8 | medium | Maps to the table opens every picture of a module, handouts included (B1: 116 scenes; B5: a 171 MB bundle) | B-series sweep | Fixed (alpha.14): only the playable maps (FG's Maps and Region map, or with a grid or walls: B1 3, B2 14); handouts and portraits stay in Images & Maps; `all` for every picture |
| 9 | medium | A map pin (FG's shortcut) does not open its story entry or encounter when clicked | play test | Fixed (alpha.14): a story pin opens the book at its entry; an encounter pin offers to put it on the tracker (`verify-library-ui`) |
| 10 | medium | Chat keeps only the last 100 lines: a few rounds of combat push the start of the session out (FG keeps the whole session) | play test | Fixed (alpha.14): 2,000 lines kept with the campaign, the last 300 sent to a joining seat, 1,000 in the chat window |
| 11 | low | Area spells (Sleep) affect only the caster's targets; there is no quick way to target everyone in an area (FG: the same, the GM targets each) | play test | Fixed (alpha.15): the map's Area target tool (players too) and `kraken_combat` target-area: everyone within a radius of a point, a faction to narrow |
| 12 | low | Items with no price (Staff "—", Sling) cannot be bought in the wizard or the builder. FG's wizard skips them too | play test | Fixed (alpha.18, the GM's call): Kraken's own prices where the book gives none, after 5E's (Staff 5 gp, Sling 1 sp, Club 1 sp, Rock free, jewelry 10 gp...), marked krakenprice; Fist stays a natural weapon |
| 13 | low | Targets persist after a spell: the cleric's Cure Light Wounds also healed the kobold it had targeted the turn before. FG keeps targets the same way; an option to clear targets after a cast would help | play test | Fixed (alpha.17): Settings > Clear targets: never (FG's default), after a spell or an attack's damage, or at the end of the creature's turn (`kraken_table_options` clearTargets) |
| 14 | medium | An area target also took creatures already dead | play test, phase 2 | Fixed (alpha.16) |
| 15 | medium | A Kraken Krit instant death (when the GM lets it apply) put 999 wounds on the creature | play test, phase 3 | Fixed (alpha.26): down to the dead threshold (-10 hit points); `krits` |
| 16 | medium | The GM's tracker attack for a character (spoken by "Combat") was thrown in the GM's NPC dice | `assistant` | Fixed (alpha.26): the roll's actor decides; `dice` |
| 17 | low | A picture dropped on the map in the Images tab would also open as a whole new map | review | Fixed (alpha.26) |
| 18 | low | `verify-books-ui` and `verify-sound-ui` had gone stale (the Home screen; a sound still playing from the step before) | test phase | Fixed (alpha.26) |

## Play test, second run (alpha.15)

Phase 2 added: Sleep cast on an area target over the kobold pack (eight asleep), a kobold killed outright (shown Dead), the encounter's 120 XP split between the four characters, the parcel's item assigned to Pip and handed out with the coin, and Thorin levelled from 2 to 3 (18 to 26 hit points, base to hit 2 to 3, next level 8,501 XP). All as expected, but for bug 14.

Nothing open after both runs.

## Play test, third run (alpha.26)

Phase 3 added for alpha.21 to .25: the party's four tokens moved together, Thorin turned to face the lair, an image layer by the lair, the caves keeping their own cave loop, pitch dark with Thorin's torch in hand; the test player in Chrome sees the image layer, Thorin's facing and the notice that the torch spoils his deepvision. One problem (15), fixed. Every other check passes; `pregens` matches 128 of 132 here, the other four need a live FG build with the SC C&C wizard loaded.

## Play test, fourth run (alpha.28)

After the second ruleset (D&D 5E) changed the tracker and character building: no problems. Every check passes (`dnd5e`, `dnd5e-ui` and `dnd5e-fg` new); `pregens` 128 of 132 while FG is on a 5E campaign (the other four need FG's C&C wizard live).
