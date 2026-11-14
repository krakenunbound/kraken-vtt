# Kraken VTT and AI agents

Kraken VTT is built for an AI agent from the ground up, not with one added afterwards. Everything a GM can do in the app, a local agent can do too, through the MCP server built into the app. The in-app DM assistant (plan step 6) will call the same tools.

## The rule

1. **Every action gets its tool in the same change.** A new button, menu, drag or chat command lands together with the agent tool that does the same thing, and a test that calls that tool.
2. **The tool goes through the same path as the click.** It uses the host's own functions, with the same permission checks and the same chat output, so the agent cannot do anything the GM couldn't, and the table can't tell the difference.
3. **Names follow the interface.** A tool's description uses the words on the screen and on the GM's sheet (FG's words where FG has them).
4. **`npm run coverage` enforces it.** It reads every message the table server answers and every combat tracker action, and fails if one has no tool. `npm run agent-ui` drives the interface tools against the real app.

## Connecting an agent

The app starts the MCP server when it opens. `electron/agent/mcp-stdio.cjs` is the stdio bridge an MCP client runs, and `.mcp.json` registers it for Claude Code. The agent acts as the GM. Start with `kraken_status`.

## What the agent can do

| In the app | Tool |
|---|---|
| **The DM assistant** (GM only; skill: [skills/kraken-dm-assistant/SKILL.md](skills/kraken-dm-assistant/SKILL.md)) | |
| Modules, Packs tab: list the FG modules and their Kraken packs, Make pack, Make N packs, open the packs folder | `kraken_packs` (list, make, folder) |
| The image window's corner and strip: lock, player vision preview, tools, navigation pad, pins; Share on/off for the table map; Assets' Make it a map | `kraken_image` (preview, make), `kraken_map` share true/false, `kraken_windows` kind assets |
| Updates (the start screen alone): what Kraken found at launch, download, restart and install (never while hosting) | `kraken_updates` (status, download, install) |
| Images (Campaign > Images): open a book's picture in the image window (the GM's alone, the same master everywhere: the map tools then work on it), put it in play, play test, close | `kraken_image` (open, play, test, close); `kraken_library` list kind image |
| Map Studio (Kraken's map maker, studio/web served by electron/studio/server.cjs): open the open image in it; its Save to Kraken writes walls, lights, weather and the painted picture into the image's master | `kraken_image` action studio; `kraken_windows` kind studio |
| Quick slots: read or set a seat's ten (books, pages, pictures, sheets, sounds, notes, records, dice `{kind: dice, formula}`, chat macros `{kind: macro, text}`); use one as its click or number key does | `kraken_quickslots` (slots; press) |
| Sidebar Assistant: ask, stop, new chat (its key is set in its window or ANTHROPIC_API_KEY, never by a tool) | `kraken_assistant`, `kraken_windows` kind assistant |
| **Campaigns** | |
| List campaigns, make one | `kraken_campaigns`, `kraken_campaign_create` |
| Play (host) a campaign, leave | `kraken_host`, `kraken_leave` |
| See who is connected, what's going on | `kraken_status`, `kraken_players` |
| **Maps** | |
| Open map (a prepared map bundle, or a bare picture to build on) | `kraken_open_adventure` |
| Adventure and scene menus | `kraken_scenes` |
| Scene settings: darkness, weather, grid | `kraken_scene_settings` |
| Place, move (one, or several together), change (facing too), remove tokens | `kraken_token_place`, `kraken_token_move` (`ids`, `dcol`, `drow`), `kraken_token_update`, `kraken_token_remove` |
| Open, close, lock doors | `kraken_door` |
| Line of sight, token movement lock, what a player sees | `kraken_line_of_sight` |
| Place, change, remove lights | `kraken_light` |
| The calendar: which calendar, the date and time (set, move on), notes on days (the GM's shown or private; players' signed), the date in chat | `kraken_calendar` |
| Read an adventure's boxed text aloud (to chat and as a bubble over everyone's map) | `kraken_read_aloud` |
| Death markers: settings (a set per creature type), place, remove, clear | `kraken_death_markers` |
| The message of the day (words and links, shown to players as they join) | `kraken_table_options` motd |
| A person's turn alerts (bell, banner) and colour | `kraken_dice_settings` turnSound, turnBanner, color (who: a player) |
| The tracker's corrections: back a turn, a round back, a turn given to anyone | `kraken_combat` prev, round-back, set-turn |
| Shapes on the map (line, arrow, square, circle, cone), resized | `kraken_draw` shape, resize |
| The dice tower: its look for everyone (Kraken's six drawn, the tower pictures, a picture imported); on the GM's screen, lock it, fix it at x,y, move it, turn it on or off (its right-click menu) | `kraken_tower` |
| Dice packs (Documents/Kraken VTT/Dice): list them with their sets and problems, check a pack being made, the folder; a pack's set by name | `kraken_dice_packs`; `kraken_dice_settings` preset |
| Ping the map | `kraken_ping` |
| Read the map: grid, tokens, doors; share it with the players (opens on every screen, as FG's Share) | `kraken_map` (`share: true`) |
| The map editor: walls, doors, windows (drawn where the hand puts them, grid snap off unless on; dragged to move, a corner dragged; a door box is one door); mask; text, numbers and pins; paint; FX layers; layer groups; undo | `kraken_wall`, `kraken_mask`, `kraken_label`, `kraken_draw`, `kraken_fx`, `kraken_map_group`, `kraken_map_undo` |
| FX masks: paint an effect's areas on the map (rectangle, shape, brush; several, added together; a soft edge), remove one from the list | `kraken_fx` paint / erase-area |
| The map editor's Images tab: image layers (pictures placed on the map, below or above the tokens, ordered, hidden, locked, grouped; Browse or drop a picture into the tile library) | `kraken_tile` |
| **Characters and records** | |
| Characters, NPCs, items, notes: list, read, make, edit, delete | `kraken_records_list`, `kraken_record_get`, `kraken_record_create`, `kraken_record_update`, `kraken_record_delete` |
| Creation wizard (C&C's, or the 5E wizard in a D&D 5E campaign: species, class, background, scores, skills, gear, spells; the 3.5E wizard in a D&D 3.5E campaign: race, class, level, scores; the Traveller wizard in a Traveller campaign: characteristics, career and terms, skills and specialities, kit; the 2E wizard in an AD&D 2E campaign: race, class or multi-class, level, scores and 18/xx, or a book's pregen) | `kraken_build_character` |
| Character Selection (a player takes a character no one holds), the portrait bar along the top | `kraken_characters` (roster, give, release) |
| Players' accounts (the Players window): list, make one ahead, a new password, remove | `kraken_accounts` |
| Lists (FG's campaign lists): share a record with the players or hide it (the sharing icon, FG's Share / Unshare); open the lists or a record | `kraken_record_update` visibility all / gm; `kraken_windows` records, record |
| The sidebar (FG's dock): tools along the top; Library, Player, Campaign, Character categories that fold away; the arrow at the bottom collapses it to icons and opens it again; a button opens its list (Items, NPCs, Classes, Races, Spells...: every active book's records under the book's name; Encounters, Parcels, Tables: every active adventure's) | `kraken_sidebar` list / state / fold / press |
| A blank character sheet (Character Selection's Create, the Characters window's blank sheet button), filled by hand | `kraken_record_create` type character |
| A race, class, spell or item dragged from a list onto a character sheet (FG's sheet drop): the package at 1st level with its primes and hit points, a race replacing the old, the spell bound to its class, the item into the gear; a second class is refused (dual class or reclass) | `kraken_character_drop` |
| Recalculate a sheet | `kraken_character_refresh` |
| Level up | `kraken_level_up` |
| Check, save or skill from the sheet (5E: `kind`, `skill`, `dc`, `advantage`) | `kraken_siege_check` |
| Portrait and token pickers | `kraken_art` (then `kraken_record_update`) |
| Import FG modules | `kraken_fg_modules`, `kraken_import_fg_module` |
| **Party sheet** | |
| Members, coin, items | `kraken_party`, `kraken_party_edit` |
| Award XP, quests, encounters | `kraken_party_award` |
| Hand out coin and items | `kraken_party_distribute` |
| Group check or save | `kraken_party_group_check` |
| **Combat tracker** | |
| Every tracker action: add, initiative, turns, rounds, damage, healing, effects, targets, attacks, saves, spells; 5E death saves; 3.5E full attacks (`full`), Fortitude / Reflex / Will saves; Traveller's 2d6 attacks with Effect and AP, damage off END, STR, DEX, characteristic checks; 2E THAC0 attacks, a creature's whole round (`full`), the five saves, binding wounds (`stabilize`), turning undead (`turn-undead`), the GM's Krits & Fumbles 2E book on a natural 20 or 1 | `kraken_combat` |
| **Chat and dice** | |
| Chat, `/r` rolls, the chat log | `kraken_chat_send`, `kraken_roll`, `kraken_chat_log` |
| Chat commands: `/w` whispers, `/me` `/action` `/ooc` `/mood`, the GM's `/story` and `/id` | `kraken_chat_send` (`kind`, `to`, `as`, `mood`) |
| `/gmroll`, `/blindroll` | `kraken_roll` with `secret` |
| `/kick`, `/vote`, `/save` | `kraken_kick`, `kraken_vote`, `kraken_save` |
| **Sound** | |
| The Sound window: one-shots and effects for the table, ambience loops, music, the chat's sound triggers, a scene's own sound | `kraken_sound` (list, play, stop, ambience, music, scene, triggers, scape) |
| GM-only roll (the GM's dice tower) | `kraken_roll` with `secret` |
| Dice tower: players see their own result | `kraken_table_options` |
| How long dice stay on the table before they fade (the GM's Settings) | `kraken_table_options` diceHold |
| Traveller's wizard (the GM's KrakenCharWizardMGT2 run in Kraken): start, view, call a page's step (fn, args), details, build with gear bought, cancel | `kraken_traveller_lifepath` |
| Starships (Traveller, Apeira Astra): make a ship from a design, its sheet (hull, armour, weapons, criticals), crew stations | `kraken_starship` |
| Ship combat: a gunner fires a ship's weapon at a ship (range, criticals) | `kraken_combat` ship-attack |
| Basic Fantasy: a monster's (or retainer's) morale check from the tracker | `kraken_combat` morale |
| Forged in the Dark: an action roll, resistance, armor, stress, harm, trauma, xp, advances, load, downtime activities from the sheet | `kraken_forged` (id) |
| Forged in the Dark: the crew (its wizard and sheet), the Score panel (engagement, fortune, group action, payoff, heat, entanglement, downtime) | `kraken_forged` (no id) |
| Progress clocks: add, tick, show, remove; the Score panel's phase, position, effect, plan | `kraken_clocks` |
| A ship's token on the map (range by the map); its deck plans as maps | `kraken_starship` place, deck-plan |
| Settings: Background Decal, Desktop Wallpaper and GM Icon (pick, a set for each game, Browse to import a picture, none) | `kraken_decal` (`kind` decal, wallpaper or gmicon) |
| The Dice window: sets, dice, accent and number colours, design, material, lettering, effects, crit flare, 3D, sound; NPC dice and damage dice | `kraken_dice_settings` (`set` npc or damage) |
| The map's window (FG's image window: the map, its tools and settings, the scene pickers; in front when it opens, as any window; pops out to another monitor; the GM reopens it from Images, a book or the Library, a player from the sidebar's Map button) | `kraken_windows` kind map (open, close, popout, dock) |
| Two tiers, both kept by the GM's app: a person's own (their colour for pings and ink, their dice, how dice show: `prefs.json` in the app's data, by name, the GM as `@gm`) and each character's dice (on the character, `data.dice`; every roll made as it uses them). The Dice window's Whose dice row and Your colour | `kraken_dice_settings` (`color`, `who` for a player's colour, `character` for a character's dice) |
| Fix the next dice (tests, parity runs) | `kraken_dice_force`, `kraken_dice_clear` |
| **Windows** | |
| Sidebar windows (Settings and the decal picker too) and character sheets: open, close, pop out to another monitor, dock back | `kraken_windows` |
| **Seeing the screen** | |
| Screenshot, the visible text, anything else | `kraken_ui_screenshot`, `kraken_ui_text`, `kraken_ui_eval` |

## Not yet a tool

- Popping out the chat (the chat is not a sidebar window); moving or resizing a window to an exact place.
- Acting as a particular player. The agent is the GM; `kraken_token_move` with `asPlayer` and `kraken_line_of_sight` with `player` show what a player would get.

## Processes

The GM's app is two processes: `electron/main.cjs` (the window: it draws, opens dialogs, keeps the assistant key, and forwards every other call) and `electron/backend.cjs` (Electron's utility process: the table server, campaigns, libraries, books, the agent bridge and its tools, the assistant). Agent tools run in the backend; `ctx.ui` and `ctx.windowOp` reach the window through main. Heavy work belongs in the backend, never in main.

## Kraken's own games

Descending Darkness (d20 family, `shared/dnd5e/rules.mjs` profile `descending`) and Apeira Astra (`shared/astra/rules.mjs`, `electron/astra.cjs`) ship their books as Kraken packs in `games/packs` (`npm run build-packs`, gitignored; the installer and Linux builds make them), made from the module folders in `games/modules`, built from `games/<game>/*.mjs` by `node scripts/build-content.mjs`. A GM's pack of the same name wins. `npm run clean-install-ui` checks a computer with no Fantasy Grounds and nothing but packs (KRAKEN_APP runs the built app; KRAKEN_TEST_PACKS copies the GM's). The format: docs/kraken-pack-format.md. A campaign made with either ruleset sees only its own books. Tools: `kraken_build_character` builds for the campaign's game (Apeira Astra spec: origin, major, minor, characteristics, majorSkills, minorSkills, gear); `kraken_character_improve` spends Apeira Astra experience; `kraken_combat stabilize` steadies a dying Descending Darkness character. D&D 5E ships the SRD 5.2.1 the same way (`games/srd-5e`: three FG 5E modules, SRD 5.2.1 Player's Rules, Creatures and Magic Items, read from the SRD 5.2.1 PDF by `python games/srd-5e/tools/build.py <pdf>`); `npm run srd5e` plays them alone (every class built, Fighter, Wizard and Cleric to 20, every spell with actions cast, every creature attack read). See games/README.md.
Descending Darkness (d20 family, `shared/dnd5e/rules.mjs` profile `descending`) and Apeira Astra (`shared/astra/rules.mjs`, `electron/astra.cjs`) ship their books as Kraken packs in `games/packs` (`npm run build-packs`, gitignored; the installer and Linux builds make them), made from the module folders in `games/modules`, built from `games/<game>/*.mjs` by `node scripts/build-content.mjs`. A GM's pack of the same name wins. `npm run clean-install-ui` checks a computer with no Fantasy Grounds and nothing but packs (KRAKEN_APP runs the built app; KRAKEN_TEST_PACKS copies the GM's). The format: docs/kraken-pack-format.md. A campaign made with either ruleset sees only its own books. Tools: `kraken_build_character` builds for the campaign's game (Apeira Astra spec: origin, major, minor, characteristics, majorSkills, minorSkills, gear); `kraken_character_improve` spends Apeira Astra experience; `kraken_combat stabilize` steadies a dying Descending Darkness character. See games/README.md.

Ironsworn (with Delve) and Ironsworn: Starforged (Shawn Tomkin; only their CC BY 4.0 parts, from Datasworn, filtered by `games/ironsworn/tools/filter-datasworn.mjs`; see `games/ironsworn/LICENSE.md`) are the rulesets "Ironsworn" and "Starforged", one engine: `shared/ironsworn/rules.mjs` (action and progress rolls, momentum, ranks, legacies, the outcome text read for effects) and `electron/ironsworn.cjs`. Records: `ironmove` (a move: rolltype, options `stat:iron|condition_meter:health` with a method, strong/weak/miss text, suffer), `ironasset`, `ironoracle` (FG table shape: tablerows, rolls "self*2" or another oracle's id), `irondelve` (a theme or domain's features and dangers), foes as `npc` with a rank. A character: data.ruleset "ironsworn", game "classic"/"starforged", stats, meters, momentum, debilities/impacts, tracks, bonds or legacy, assets, lastroll (pending while momentum could be burned; its choices). Table message `ironsworn` {id, action, args}, tool `kraken_ironsworn` (move, resolve, choose, adjust, control, debility, track-add/mark/remove, legacy-mark, bond, failure, advance, asset-add, asset-meter, site-add; without id: oracle, site, foe-mark, foe-rank, foe-clear, inflict). The tracker: `ironOn` in combat.cjs, a foe entry's `iron` {rank, ticks, defeated}, `combat.ironState`; damage marks harm by rank. Windows `oracles` and `delve` (kraken_windows). Tests: `npm run ironsworn`, `npm run ironsworn-ui`, e2e plans Ironsworn and Starforged.

Cairn, Second Edition (Yochai Gal, CC BY-SA 4.0) is built in the same way: its books come from the official Markdown in `games/cairn/text` (`games/cairn/*.mjs`; the share-alike covers that folder and the books made from it, see `games/cairn/LICENSE.md`), its mechanics are Kraken's code (`shared/cairn/rules.mjs`, `electron/cairn.cjs`, combat.cjs `cairnOn`). Records: `background` (names, gear, two d6 tables with their items and gold), `cairntable` (traits, bonds, omens, backgrounds, scars: loaded into the campaign as rules records), items with `bulky`, `petty`, `uses`, `charges`, `armor`, `damage`, `kind` spellbook/scroll/relic, NPCs with `hp`, `armor`, `str`, `dex`, `wil`, `attacks`, `detachment`, `critical`. Tools: `kraken_build_character` (Cairn spec: background, attributes, hp, age, gold, results [{table, roll}], traits, bond, omen, buy), `kraken_siege_check` (str, dex, wil saves), `kraken_cairn` (rest, sleep, recover, fatigue, deprived, stabilize, use, cast, recharge, scar, scar-recover, growth, growth-roll, milestone, item-add), `kraken_combat` (Cairn: init is the sides and the DEX save; attack always hits, mode impaired/enhanced; damage-roll refused; save str/dex/wil; morale; attack-together). Checks: `npm run cairn`, `npm run cairn-ui`, `node scripts/e2e-ruleset.mjs Cairn`.
## Forged in the Dark

The Blades in the Dark SRD (John Harper, One Seven Design, CC BY 3.0), campaign ruleset "Forged in the Dark" (never "Blades in the Dark" in a title: the licence forbids it; every book's front page and `games/forged-dark/LICENSE.md` carry the attribution word for word). Rules in `shared/forged/rules.mjs` (Kraken's code), host in `electron/forged.cjs`, clocks and the Score panel's state in `electron/clocks.cjs` (the table's `clocks` key; every ruleset may use clocks). A character's `data.ruleset` is `forged`: `actions` (12, 0-4), derived `attributes` (insight, prowess, resolve: actions with a dot), `stress`/`stressmax`, `traumas` (+ `traumaPending` until one is chosen), `harm` {1: [2], 2: [2], 3: [1]} and `fatal`, `healing`/`healingsize`, `armor` {armor, heavy, special} (marked boxes), `load` and `inventorylist` (`load`, `carried` = checked for this score), `abilities`, `friends` (`bond` friend|rival), `xp` {playbook, insight, prowess, resolve}, `advances`, `coins` (Coin), `stash`, `projects`, `downtime` {used, trained, indulged}, `crewBonus` (Composed, Hardened, Mastery from the crew). The crew is the party record's `data.crew` (type, reputation, lair, huntingGrounds, tier, hold, rep, turf, heat, wanted, coin, vault, xp, boxes, advances, abilities, upgrades {name: boxes}, contacts, cohorts, claims, factions {name: {tier, hold, status}}). Records from the books: `playbook` (actions, abilities, friends, items, xptrigger), `crewtype` (abilities, upgrades, claims, contacts, startingupgrades, operations), `forgedtable` (group: heritages, backgrounds, vices, traumas, overindulgence, reputations, upgrades, claims, abilities, crewabilities; the adventure's factions and clocks), standard items (`item` with `standard`). Messages `forged` (id: a scoundrel's action; none: the crew's and the Score panel's) and `clocks`; tools `kraken_forged` and `kraken_clocks`; `kraken_build_character` builds a scoundrel; the party's award marks playbook xp; the tracker's initiative is refused (the Combat window is the Score panel). Tests: `npm run forged`, `npm run forged-ui`, `node scripts/e2e-ruleset.mjs "Forged in the Dark"`.

## Basic Fantasy

The Basic Fantasy Role-Playing Game, 4th Edition (CC BY-SA 4.0), campaign ruleset "Basic Fantasy": rules in `shared/bfrpg/rules.mjs` (Kraken's code: ability bonuses, races and classes with their limits, the attack bonus table, the five saves by class and level, XP to 20th, hit dice to 9th then fixed, spells a day, thief abilities, the turning table, monster stat blocks), host in `electron/bfrpg.cjs` (build, checks, level up, edits; `siege.cjs` dispatches a record whose `data.ruleset` is `bfrpg`), tracker paths in `electron/combat.cjs` (`dbf()`: d6 initiative highest first, d20 + AB against ascending AC, saves with natural 1/20, dead at 0, `turnUndeadBf`, `morale`), sheet and wizard in `src/characters/SheetBf.tsx`. Books from `games/basic-fantasy/` (CC BY-SA, `LICENSE.md`): Basic Fantasy Player's Handbook, Basic Fantasy Game Master's Guide, The Mill at Hob's Ford. Tools: `kraken_build_character` (spec: name, race, class, abilities {strength..charisma}, hpRoll, gold, buy [[item, count]], spells, alignment, level, force); `kraken_siege_check` kind save (death, wands, paralysis, breath, spells), check (the optional ability roll), skill (a thief ability), morale (a retainer's loyalty); `kraken_combat` turn-undead and the new `morale` (id, bonus: an NPC's 2d6 against its morale score; a table message `ct` action `morale`); `kraken_level_up`. Checks: `npm run bfrpg` (scripts/check-bfrpg.mjs, fixed dice), `npm run bfrpg-ui` (scripts/verify-bfrpg-ui.mjs: a test player in Chrome, the wizard, the shop, sheet rolls, a goblin fight), the e2e run `node scripts/e2e-ruleset.mjs "Basic Fantasy"`.

Fate Core and Fate Accelerated (Evil Hat's SRDs, CC BY 3.0) are two rulesets, "Fate Core" and "Fate Accelerated", on one engine: `shared/fate/rules.mjs` (the ladder, 4dF outcomes and shifts, the pyramid and approaches, stress tracks, consequences and `absorbOptions`, refresh, milestones, NPC stats, `buildFromSpec`), `electron/fate.cjs` (building, rolls, invokes, compels, fate points, stress, consequences, milestones; the table's own Fate record `fate-table`, type `fatetable`: the scene's aspects with free invokes, the GM's pool, the conflict's kind), `electron/fateCombat.cjs` (the tracker's conflicts, called from combat.cjs `fateOn`; an entry's `fate` state). Books: `games/fate` (text read from the SRD HTML once by `games/fate/tools/convert.mjs` into `games/fate/text`; `LICENSE.md` has the attributions word for word). Records: `fateskill` (the Core skills; FAE approaches with `approach: 1`), `fatestunt` (name, skill, summary), `pregencharsheet` (game, aspects, skilllist or approaches, stuntlist), NPCs with `fatekind` (nameless, supporting, main), `aspectlist`, `skilllist` {name, rating} or `approaches`, `stuntlist`, `stressphysical`, `stressmental`, `consequencelist`, `mob`. A character's data: `ruleset` "fate", `game` core|fae, `aspects` {highconcept, trouble, a1-a3}, `phases`, `skills` or `approaches`, `stunts`, `refreshbase`/`refresh`, `fatepoints`, `stress` {track: {box: 1}}, `tracks`, `consequences`, `milestones`, `skillpoints`, `out`, `lastroll`, `extras`. Dice: formulas take `dF` (the host's dice already rolled -1/0/+1); the tray's Fate die is `FATE_SIDES` (src/dice/diceStore.ts). Tools: `kraken_build_character` (Fate spec: aspects, phases, skills or approaches, stunts; or pregen), `kraken_fate` (with id: roll, invoke, compel, fatepoints, refresh, stress, clear-stress, consequence, recover, milestone, skill-up, stunt-add, stunt-remove; without: aspect-add, aspect-remove, aspect-invokes, gm-pool, scene-start, conflict, refresh-all, compel-offer, view), `kraken_combat` (Fate: init is the turn order without dice; attack with invokes; absorb; concede; damage is shifts; heal clears stress; save rolls a skill), `kraken_siege_check` (a Fate overcome), `kraken_party_group_check` (a skill), `kraken_dice_force` (dF: 1 −, 2 blank, 3 +). Checks: `npm run fate`, `npm run fate-ui`, `node scripts/e2e-ruleset.mjs "Fate Core"` and `"Fate Accelerated"`.
