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
| Books, Packs tab: list the FG modules and their Kraken packs, Make pack, Make N packs, open the packs folder | `kraken_packs` (list, make, folder) |
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
| Ping the map | `kraken_ping` |
| Read the map: grid, tokens, doors | `kraken_map` |
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
| Traveller's lifepath (the Traveller wizard): characteristics, background, education, careers term by term, mustering out, then the character | `kraken_traveller_lifepath` |
| Starships (Traveller, Apeira Astra): make a ship from a design, its sheet (hull, armour, weapons, criticals), crew stations | `kraken_starship` |
| Ship combat: a gunner fires a ship's weapon at a ship (range, criticals) | `kraken_combat` ship-attack |
| A ship's token on the map (range by the map); its deck plans as maps | `kraken_starship` place, deck-plan |
| Settings: Background Decal, Desktop Wallpaper and GM Icon (pick, a set for each game, Browse to import a picture, none) | `kraken_decal` (`kind` decal, wallpaper or gmicon) |
| The Dice window: sets, dice, accent and number colours, design, material, lettering, effects, crit flare, 3D, sound; NPC dice and damage dice | `kraken_dice_settings` (`set` npc or damage) |
| The map's window (FG's image window: the map, its tools and settings, the scene pickers; behind the other windows; pops out to another monitor; the sidebar's Map button opens it again) | `kraken_windows` kind map (open, close, popout, dock) |
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

Descending Darkness (d20 family, `shared/dnd5e/rules.mjs` profile `descending`) and Apeira Astra (`shared/astra/rules.mjs`, `electron/astra.cjs`) ship their books in `games/modules`, built from `games/<game>/*.mjs` by `node scripts/build-content.mjs`. A campaign made with either ruleset sees only its own books. Tools: `kraken_build_character` builds for the campaign's game (Apeira Astra spec: origin, major, minor, characteristics, majorSkills, minorSkills, gear); `kraken_character_improve` spends Apeira Astra experience; `kraken_combat stabilize` steadies a dying Descending Darkness character. See games/README.md.
