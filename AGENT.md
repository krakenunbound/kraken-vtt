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
| **Campaigns** | |
| List campaigns, make one | `kraken_campaigns`, `kraken_campaign_create` |
| Play (host) a campaign, leave | `kraken_host`, `kraken_leave` |
| See who is connected, what's going on | `kraken_status`, `kraken_players` |
| **Maps** | |
| Open map (a Foundry adventure bundle) | `kraken_open_adventure` |
| Adventure and scene menus | `kraken_scenes` |
| Scene settings: darkness, weather, grid | `kraken_scene_settings` |
| Place, move, change, remove tokens | `kraken_token_place`, `kraken_token_move`, `kraken_token_update`, `kraken_token_remove` |
| Open, close, lock doors | `kraken_door` |
| Line of sight, token movement lock, what a player sees | `kraken_line_of_sight` |
| Place, change, remove lights | `kraken_light` |
| Ping the map | `kraken_ping` |
| Read the map: grid, tokens, doors | `kraken_map` |
| **Characters and records** | |
| Characters, NPCs, items, notes: list, read, make, edit, delete | `kraken_records_list`, `kraken_record_get`, `kraken_record_create`, `kraken_record_update`, `kraken_record_delete` |
| Creation wizard | `kraken_build_character` |
| Recalculate a sheet | `kraken_character_refresh` |
| Level up | `kraken_level_up` |
| Check or save from the sheet | `kraken_siege_check` |
| Portrait and token pickers | `kraken_art` (then `kraken_record_update`) |
| Import FG modules | `kraken_fg_modules`, `kraken_import_fg_module` |
| **Party sheet** | |
| Members, coin, items | `kraken_party`, `kraken_party_edit` |
| Award XP, quests, encounters | `kraken_party_award` |
| Hand out coin and items | `kraken_party_distribute` |
| Group check or save | `kraken_party_group_check` |
| **Combat tracker** | |
| Every tracker action: add, initiative, turns, rounds, damage, healing, effects, targets, attacks, saves, spells | `kraken_combat` |
| **Chat and dice** | |
| Chat, `/r` rolls, the chat log | `kraken_chat_send`, `kraken_roll`, `kraken_chat_log` |
| Chat commands: `/w` whispers, `/me` `/action` `/ooc` `/mood`, the GM's `/story` and `/id` | `kraken_chat_send` (`kind`, `to`, `as`, `mood`) |
| `/gmroll`, `/blindroll` | `kraken_roll` with `secret` |
| `/kick`, `/vote`, `/save` | `kraken_kick`, `kraken_vote`, `kraken_save` |
| **Sound** | |
| The Sound window: one-shots and effects for the table, ambience loops, music, the chat's sound triggers | `kraken_sound` (list, play, stop, ambience, music, triggers, scape) |
| GM-only roll (the GM's dice tower) | `kraken_roll` with `secret` |
| Dice tower: players see their own result | `kraken_table_options` |
| Settings: Background Decal, Desktop Wallpaper and GM Icon (pick, a set for each game, Browse to import a picture, none) | `kraken_decal` (`kind` decal, wallpaper or gmicon) |
| The Dice window: sets, dice, accent and number colours, design, material, lettering, effects, crit flare, 3D, sound | `kraken_dice_settings` |
| Fix the next dice (tests, parity runs) | `kraken_dice_force`, `kraken_dice_clear` |
| **Windows** | |
| Sidebar windows (Settings and the decal picker too) and character sheets: open, close, pop out to another monitor, dock back | `kraken_windows` |
| **Seeing the screen** | |
| Screenshot, the visible text, anything else | `kraken_ui_screenshot`, `kraken_ui_text`, `kraken_ui_eval` |

## Not yet a tool

- Popping out the chat (the chat is not a sidebar window); moving or resizing a window to an exact place.
- Acting as a particular player. The agent is the GM; `kraken_token_move` with `asPlayer` and `kraken_line_of_sight` with `player` show what a player would get.
