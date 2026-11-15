# AI agent tools

Kraken is built for AI agents from the ground up. Every action a GM can take in the app is also a tool an agent can use, through the MCP server built into the GM's app or the sidebar's Assistant. The agent acts as the GM, through the same checks and the same chat output as your own clicks, so it can do nothing you couldn't, and the table can't tell the difference.

## Two ways in

### The Assistant (in the app)

The **Assistant** is in the tools along the top of the sidebar (GM only). Ask it, stop it, or start a new chat. Its API key is set in its own window (or the `ANTHROPIC_API_KEY` environment variable); no tool can set it.

### An outside agent over MCP

The app starts its MCP server when it opens. An MCP client (such as Claude Code) connects through Kraken's stdio bridge, `electron/agent/mcp-stdio.cjs`; the project's `.mcp.json` registers it for Claude Code when you work from the source. The agent should start with `kraken_status`.

## What an agent can do

A short tour. The full table of tools is in [AGENT.md](../../AGENT.md).

| Area | Examples | Tools |
|---|---|---|
| Campaigns and hosting | List and make campaigns, rename, back up, restore; host, the invite link, leave | `kraken_campaigns`, `kraken_campaign_create`, `kraken_host`, `kraken_leave` |
| The table | Who is connected; ring, view as, kick, ban; pause | `kraken_status`, `kraken_players`, `kraken_kick`, `kraken_table_options` |
| Maps | Open maps, scene settings, tokens, doors, lights, walls, line of sight, the ruler, regions, map sounds | `kraken_open_adventure`, `kraken_scene_settings`, `kraken_token_place`, `kraken_token_move`, `kraken_door`, `kraken_light`, `kraken_wall`, `kraken_line_of_sight`, `kraken_ruler` |
| Map Studio | Build a whole map: floors, walls, doors, props, lights, weather, traps; render, check and save it | `kraken_map_studio` |
| Records and books | List, read, make, edit and delete records; packs; story; tables; encounters; parcels; quests | `kraken_records_list`, `kraken_record_get`, `kraken_record_create`, `kraken_record_update`, `kraken_packs`, `kraken_story`, `kraken_table`, `kraken_encounter`, `kraken_parcel`, `kraken_quest` |
| Characters | Build with the wizard, level up, drop a class or item on a sheet, checks and saves | `kraken_build_character`, `kraken_level_up`, `kraken_character_drop`, `kraken_siege_check` |
| Party | Members, coin, XP, handing out, the group roll, rest | `kraken_party`, `kraken_party_award`, `kraken_party_distribute`, `kraken_party_group_check`, `kraken_rest` |
| Combat | Every tracker action: initiative, turns, attacks, damage, saves, spells, targets, templates, effects | `kraken_combat`, `kraken_template`, `kraken_effects` |
| Chat and dice | Send chat, roll, read the log, the modifier box | `kraken_chat_send`, `kraken_roll`, `kraken_chat_log`, `kraken_modifiers` |
| Sound | Play, ambience, music, triggers | `kraken_sound`, `kraken_map_sound` |
| Bookkeeping | Ammunition, consumables, rations, light, the load | `kraken_bookkeeping` |
| Windows and the screen | Open, close and pop out windows; screenshots and the visible text | `kraken_windows`, `kraken_ui_screenshot`, `kraken_ui_text` |

Each game has its own tools too: `kraken_ironsworn`, `kraken_cairn`, `kraken_fate`, `kraken_forged` and `kraken_clocks`, `kraken_starship` and `kraken_traveller_lifepath`.

## Things to ask for

- "Make me a map of a flooded crypt with two doors and torches" (Map Studio builds it while you watch, then saves it into the campaign).
- "Build a 3rd-level dwarf fighter for Ann."
- "Put the goblin encounter on this map and roll initiative."
- "Give the party 200 gold and the potions from the parcel."
- "Make a dice pack" or "a wallpaper": each folder in `Documents/Kraken VTT` has an `AGENTS.md` that tells an agent how.

## Code mode

`kraken_code` takes one piece of JavaScript that calls several Kraken tools at once (in parallel, or one result feeding the next) and sends back only what the code returns. An agent can read the tracker, the party and a map in one step instead of three. The code runs in a sandbox of its own, with no files or network, and the same checks on every tool it calls. The in-app Assistant does not get it.

## Not yet a tool

- Popping out the chat, and moving or resizing a window to an exact place.
- Acting as a particular player. The agent is the GM; some tools can show what a player would get.
