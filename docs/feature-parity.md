# Feature parity: Kraken VTT against Fantasy Grounds and Foundry

Kraken must not be second to any VTT. This is the standing checklist: every
feature Fantasy Grounds (CoreRPG and its rulesets) or Foundry VTT (v14 core,
dnd5e) has, whether Kraken has it, and the best way to build what is missing
(the better of the two, done more intuitively). Audited 2026-11-15 from FG's
CoreRPG/5E source, Foundry's core source and Kraken's code; IDs below are used
in commits and PLAN.md. Keep it current: when a gap closes, mark it Done with
the release.

Status of the work (2026-11-15):

| Area | Being built | Queued |
|---|---|---|
| Targeting, attacks, damage, effects, conditions, token effect visuals, light-source effects, area templates | targeting agent (docs/targeting-actions-design.md) | |
| Session and platform | S1 reconnect, S2 hosting/invites, S4 pause, S5 player controls, S6 pull view, S8 campaign management | S3 (with R4), S7, S9, S10 |
| Maps and tokens | M1-M10 | M11-M13 |
| Records and content | R1-R7, R9 (R4 = S3) | R8 (= S8), R10 |
| Dice, chat and combat | | D1-D10, after targeting merges (they share the roll paths and chat) |
| Resource tracking (GM's ask) | | ammunition, consumables, rations and water, light burn-down, encumbrance and bag space, each with a GM off switch; with D5 rest; after targeting and core UI stage 3 merge |

## Asked by the GM (2026-11-15), queued
- Resource tracking, each with a GM option to turn it off ("fun mode"):
  - ammunition spent per attack (arrows, bolts, bullets, sling stones), recovery after a fight per ruleset, low warning
  - consumables used: potions, scrolls, charges
  - rations and water per long rest / day of travel, the ruleset's penalty for going without
  - light sources burning down (torch, lantern oil) - tie to the light effects
  - encumbrance and bag space per ruleset (weight, slots, coin weight), container capacity, the ruleset's penalties
  - Start after: targeting/actions agent and core UI stage 3 merge (attacks and sheets).

## Maps, scenes and tokens

Kraken already at or ahead: map windows with pop-out and Share, square and hex grids, zoom/pan/fit/find, GM mask (fog) reveal, walls with doors/secret/windows/terrain/one-way/proximity, line of sight per player (within 1% of Foundry), darkvision family, map lights with animation, scene darkness, shapes and drawings by players, notes and pins linked to story, layers and groups, image tiles, token facing, hidden tokens, snapping, wall blocking, scene switching with private prep, pings, FX weather, FG/Foundry map import, death markers.

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| M1 | Shared ruler, waypoints, diagonal rule | right-drag ruler local only; diagonal fixed at 1 (MapView.tsx:846) | ruler message to all in the measurer's colour, click for waypoints with leg and total labels, scene option 1 / 1.5 / raw | High |
| M2 | Who sees names and health | dot only, health and real names sent to every seat (mapState.cjs:690-704) | FG's options (GM/NPC/PC: bar, bar on hover, dot, off; names off/hover/always) filtered in publicToken; per-token unidentified name | High |
| M3 | Explored fog on the host | localStorage per browser | per scene per player in map state, saved, GM "Reset explored" | High |
| M4 | Senses beyond darkvision | none | parse blindsight, tremorsense, truesight, devil's sight; apply in viewFor | High |
| M5 | Undo a move, path this turn | none | per-token move list, Ctrl+Z own last move, GM any; faint path and sum | High |
| M6 | Pull players' view | none | Shift+ping pulls (with session agent: S6) | High |
| M7 | GM approval of locked moves | locked = refused | request with path, GM Accept/Cancel strip | Medium |
| M8 | Elevation | none | elevation in feet, Alt+wheel, badge, 3D distance | Medium |
| M9 | Map Studio regions at the table | bridge sends regions: [] | traps/pits pause and tell the GM, difficult terrain cost, teleport | Medium |
| M10 | Map sound sources, animated (webm) maps | one sound per scene; img only | positional sounds muffled by walls (Web Audio); video background for .webm | Medium |
| M11 | Drag path cost and speed colouring | straight line | path with cost, coloured by the sheet's speed (warn) | Medium |
| M12 | Token vision panel | dark-sight distance only | sight on/off, angle, mode | Medium |
| M13 | Preload scene, players on different maps, Universal VTT (.dd2vtt) import | none | Foundry preload; per-player map; UVTT reader | Medium |

Smaller: random token images, width/height/scale tokens, hex snapping for big tokens, act on several tokens at once, darkness lights, grid alignment tool, follow-token camera, scene levels.

## Records, library and content

Kraken already at or ahead: module activation and sharing with players, record lists for every type, reference manuals with cross-book links, share a record with everyone, player and GM notes, assigning and splitting loot, party sheet inventory/XP/coin, FG .mod and character import, calendar and time.

The big gap: beyond characters, notes and the party sheet, every record is read-only in the interface (New makes a blank record nobody can fill).

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| R1 | Edit, duplicate, delete records in the UI | RecordWindow displays only; New is dead | FG's lock pencil; fields from the manifest's record schema or a generic editor; Duplicate, Delete with undo, Copy to campaign for book records | High |
| R2 | Campaign story and one rich text editor | module story read-only; notes are a textarea | story records with pages (text, image, book page); one contenteditable editor (headings, lists, tables, boxed read-aloud, image and link drop) saved in FG's tag set; used for notes too | High |
| R3 | Random tables done properly | adventure tables only, one level | shared engine from FG: inline [2d6], [Nx], nested tables, columns, secret rolls, link results as cards; Roll on every table; editor and paste import | High |
| R4 | Share with one or chosen players (= S3) | gm/owner/all; pictures to all | visibility = gm / all / list of names; eye menu; drop on a portrait; pictures and story too | High |
| R5 | Item identification | fields hidden | Identified toggle; players get nonid name/notes, stripped on the host | High |
| R6 | Encounter builder, placement, random encounters | module encounters only | campaign battle records (NPCs, counts, faction), XP/CR total, Place on this map, dice counts, End encounter awards XP | High |
| R7 | Links everywhere (record text, chat) (= D3) | links dead in campaign records; no chat drop | follow links in every record; drop a link in chat posts a card | High |
| R8 | Campaign backup, restore, export (= S8) | one .bak | dated snapshots, Restore, Export/Import .zip, export records as .kpack | Medium |
| R9 | Parcels as records, quests, locations | typed parcel names; quests are XP rows | parcel records with full item links and coins; quest records dropped on the XP tab; locations as story with a map pin | Medium |
| R10 | Campaign options from manifests, session log | a few table options; 2000-line chat | Options tab from each manifest's option list; per-session chat archive with search | Medium |

Lower: full-text search across books, GM's own handout images (drop a file on Images), Foundry JSON import, shop, story templates, PDF pages, category editing.

## Dice, chat and combat flow

Kraken already at or ahead: seeded host dice engine, 3D dice, tray with right-click roll N, custom dice and dice packs, dice tower, whispers and reply, emote/OOC/mood/story/vote, speak as, roll cards and drag a damage/heal line onto a creature, drag chat into notes, initiative (all/NPCs/own), sort/turns/rounds/undo, hide NPCs, turn chime and banner, add from list/map/encounter/party, damage/heal on rows, death markers, 5E death saves, XP awards.

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| D1 | Modifier stack every roll reads | one number in ChatDock local state; sheet and tracker rolls ignore it | per-seat host stack (6 labelled slots + total), applied to every roll the seat starts, listed in the card | High |
| D2 | ADV / DIS / +2 / -2 and ruleset presets | 5E sheet select only | toggle chips beside the modifier box, each used once; presets per manifest (5E cover, crit, max, half) | High |
| D3 | Links in chat | none | link {kind,id,name} on chat lines; drop any record or picture into chat; click opens, drag carries | High |
| D4 | Speaker portraits in chat | GM icon only | stamp recordId when speaking as a character/NPC, draw its portrait, drag opens the sheet | High |
| D5 | Rest per ruleset | Cairn only; 5E card rest resets slots only | short/long rest hooks per ruleset (hit dice, HP, slots, effects ending), on sheet, party sheet and tracker | High |
| D6 | Party rolls with skills, ask the players | attributes only, host rolls | checks/saves/skills; "roll for them" or "ask the players" prompt cards; summary line | High |
| D7 | Group initiative | each entry rolls | option each / by kind: one roll per NPC kind | High |
| D8 | Roll tables to chat, /rollon | adventure tables, always GM-only | /rollon with visibility, nested tables, campaign and pack tables, roll button | Medium |
| D9 | Inline rolls in text | none | [[1d20+3]] and NdS+M chips in books, story, notes, chat | Medium |
| D10 | Combat options | hard-coded | NPC health to players (off/status/bar/numbers), skip the dead, NPC numbering, Delay/Act now | Medium |

Smaller: formulas with spaces and #label; dice modifiers rr, xo, min, max, cf, ms; roll-mode selector in the chat bar; chat export and archive; /gm alias, /help note that /r rolls; chat languages; quick-slot pages; turn timer.

## Session, players and platform

Kraken already at or ahead: accounts with lockout, pop-outs and remembered window places on other monitors, per-player volumes by kind, chat sound triggers, quick slots with macros, votes, read-aloud, Message of the Day, updater, LAN/offline, large-map tiling, colours and speak-as.

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| S1 | Automatic reconnect | onclose resets to the join screen (useSession.ts:619) | retry with backoff, "Reconnecting..." banner, reuse the account token; 30-60 s grace on the host before "away" | High |
| S2 | Internet hosting without router setup, invite links | addresses + forwarded port | UPnP/NAT-PMP option, invite link with password in the URL fragment, copy + QR | High |
| S3 | Per-player sharing and permissions | visibility gm/owner/all; pictures to all only | {default, users:{name:level}}; "Share with..." menu; drop a window on a portrait to share with that player; showImage/map-share to chosen players | High |
| S4 | Pause the game | none | GM button and /pause: players' veil, host refuses moves/rolls | High |
| S5 | Players-window controls | /kick only, no ban | right-click Kick, Ban (kept per campaign), Ring bell, Share, View as; /afk and idle dim | Medium-High |
| S6 | Pull players to my view | sharing opens the window only | view-pull with centre/zoom, Shift-ping, scene-title card | Medium |
| S7 | Settings for this screen | /scaleui only | UI scale and text size sliders, global reduced motion, colour-blind-safe palette with letter marks, rebindable shortcuts (Controls panel) | Medium |
| S8 | Campaign management, backups, logs | create/pick only; one .bak | rename, duplicate, export zip, delete to recycle bin, open folder; rolling backups + Restore; rotating log + Open logs | Medium |
| S9 | Playlists and synced music | folder plays randomly, unsynced | playlist record (order/shuffle/repeat/crossfade), startedAt so late joiners hear the same bar, Now playing | Medium |
| S10 | Mobile and tablet players | no touch handling | pointer pan, pinch zoom, long-press menu, 44 px targets, narrow tabbed layout | Medium |

Later: first-run GM checklist and tour, View as player X, Assistant GM role, session timer, light/high-contrast themes, positional map sounds, i18n extraction, add-on API on the manifests, voice/video (needs HTTPS; Discord covers it).
