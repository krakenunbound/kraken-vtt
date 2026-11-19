# Feature parity: Kraken VTT against Fantasy Grounds and Foundry

Kraken must not be second to any VTT. This is the standing checklist: every
feature Fantasy Grounds (CoreRPG and its rulesets) or Foundry VTT (v14 core,
dnd5e) has, whether Kraken has it, and the best way to build what is missing
(the better of the two, done more intuitively). Audited 2026-11-15 from FG's
CoreRPG/5E source, Foundry's core source and Kraken's code; IDs below are used
in commits and PLAN.md. Keep it current: when a gap closes, mark it Done with
the release.

Status of the work (2026-11-19):

| Area | Done | Open |
|---|---|---|
| Targeting, attacks, damage, effects, conditions, token effect visuals, light-source effects, area templates | Done (alpha.91): the targeting work (docs/targeting-actions-design.md) | |
| Session and platform | S1 reconnect, S2 hosting/invites, S4 pause, S5 player controls, S6 pull view, S8 campaign management (alpha.91) | S3 and S7 partly; S9, S10 |
| Maps and tokens | M1-M10 (alpha.91) | M11 partly; M12, M13 |
| Records and content | R1-R7 (alpha.91; R4 = S3) | R8 (= S8), R9, R10 partly |
| Resource tracking (GM's ask) | Done (alpha.91): bookkeeping (ammunition, consumables, rations and water, light from the pack, encumbrance and bag space, each with a GM switch) and D5 rest | |
| Dice, chat and combat | D1-D10 (alpha.91) | the smaller items still open |

## Asked by the GM (2026-11-15): Done (unreleased)
- Resource tracking, each with a GM option to turn it off ("fun mode", Settings > Bookkeeping, `kraken_table_options bookkeeping`):
  - ammunition spent per attack (arrows, bolts, bullets, sling stones, a firearm's magazine), refused when out, low warning, recovery after a fight per ruleset (5E half; Traveller none) offered on the sheet
  - consumables used: potions, scrolls, charges, kits; from the sheet or dragged onto a creature (healing lands on it)
  - rations and water per day on the calendar and per long rest (never twice for a day), the ruleset's penalty for going without (5E Exhaustion, 3.5E Con check or nonlethal, BF hit points, Cairn Deprived then Fatigue; 2E, C&C and Worldbuilding: a note to the GM)
  - light sources from the pack (a torch, a lantern's flask of oil, Cairn's uses) when lit; the existing light effects burn them down
  - encumbrance and bag space per ruleset (weight with coin weight, slots, the rules' own numbers), containers with capacity (bag of holding weightless), the penalty as an effect on the creature; BF's movement and Cairn's full inventory switch off with it
  - Applied on rolls: ATK and SAVE components (5E Exhaustion's -2 a level on the tracker's attacks and saves, proven in check-bookkeeping; 2E's and Traveller's -1 to hit). Not yet: the 5E variant's disadvantage (DISATK, DISCHK, DISSAV) is shown, not rolled: D2's ADV/DIS comes from the chat bar's chips, not from effects; SPEED, CHECK and SKILL components (speeds, 3.5E's check penalty, Exhaustion on checks and sheet rolls out of a fight) are shown, not read by any roll or move; C&C's load keeps SiegeCore's own on/off setting; Traveller's load (its gear has no masses) and Forged's load (chosen on its own sheet) are not counted; a lantern burnt out is lit again by hand (another flask). The C&C, Fate, Forged and Worldbuilding sheets (custom, core UI stage 5's) show no Supplies yet: the tools, rests, the party's and tracker's rest buttons work there now.

## Maps, scenes and tokens

Kraken already at or ahead: map windows with pop-out and Share, square and hex grids, zoom/pan/fit/find, GM mask (fog) reveal, walls with doors/secret/windows/terrain/one-way/proximity, line of sight per player (within 1% of Foundry), darkvision family, map lights with animation, scene darkness, shapes and drawings by players, notes and pins linked to story, layers and groups, image tiles, token facing, hidden tokens, snapping, wall blocking, scene switching with private prep, pings, FX weather, FG/Foundry map import, death markers.

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| M1 | Shared ruler, waypoints, diagonal rule | right-drag ruler local only; diagonal fixed at 1 (MapView.tsx:846) | ruler message to all in the measurer's colour, click for waypoints with leg and total labels, scene option 1 / 1.5 / raw | Done (alpha.91), High |
| M2 | Who sees names and health | dot only, health and real names sent to every seat (mapState.cjs:690-704) | FG's options (GM/NPC/PC: bar, bar on hover, dot, off; names off/hover/always) filtered in publicToken; per-token unidentified name | Done (alpha.91), High |
| M3 | Explored fog on the host | localStorage per browser | per scene per player in map state, saved, GM "Reset explored" | Done (alpha.91), High |
| M4 | Senses beyond darkvision | none | parse blindsight, tremorsense, truesight, devil's sight; apply in viewFor | Done (alpha.91), High |
| M5 | Undo a move, path this turn | none | per-token move list, Ctrl+Z own last move, GM any; faint path and sum | Done (alpha.91), High |
| M6 | Pull players' view | none | Shift+ping pulls (with session agent: S6) | Done (alpha.91), High |
| M7 | GM approval of locked moves | locked = refused | request with path, GM Accept/Cancel strip | Done (alpha.91), Medium |
| M8 | Elevation | none | elevation in feet, Alt+wheel, badge, 3D distance | Done (alpha.91), Medium |
| M9 | Map Studio regions at the table | bridge sends regions: [] | traps/pits pause and tell the GM, difficult terrain cost, teleport | Done (alpha.91), Medium |
| M10 | Map sound sources, animated (webm) maps | one sound per scene; img only | positional sounds muffled by walls (Web Audio); video background for .webm | Done (alpha.91), Medium |
| M11 | Drag path cost and speed colouring | straight line | path with cost, coloured by the sheet's speed (warn) | Partly: the drag measures a straight line, not a routed path; Medium |
| M12 | Token vision panel | dark-sight distance only | sight on/off, angle, mode | Done (unreleased): Gives sight on/off and a sight angle (a cone on its facing) in the GM's token menu and kraken_token_update; modes are the senses line (M4); `check-map-play` "ok token vision"; Medium |
| M13 | Preload scene, players on different maps, Universal VTT (.dd2vtt) import | none | Foundry preload; per-player map; UVTT reader | Partly: Universal VTT import done (unreleased: .dd2vtt, .df2vtt, .uvtt with walls, doors, lights and grid; `scripts/verify-uvtt-map-ui.mjs`); preloading and players on different maps still open; Medium |

Smaller: random token images, width/height/scale tokens, hex snapping for big tokens, act on several tokens at once, darkness lights, grid alignment tool, follow-token camera, scene levels.

## Records, library and content

Kraken already at or ahead: module activation and sharing with players, record lists for every type, reference manuals with cross-book links, share a record with everyone, player and GM notes, assigning and splitting loot, party sheet inventory/XP/coin, FG .mod and character import, calendar and time.

The big gap: beyond characters, notes and the party sheet, every record is read-only in the interface (New makes a blank record nobody can fill).

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| R1 | Edit, duplicate, delete records in the UI | RecordWindow displays only; New is dead | FG's lock pencil; fields from the manifest's record schema or a generic editor; Duplicate, Delete with undo, Copy to campaign for book records | Done (alpha.91), High |
| R2 | Campaign story and one rich text editor | module story read-only; notes are a textarea | story records with pages (text, image, book page); one contenteditable editor (headings, lists, tables, boxed read-aloud, image and link drop) saved in FG's tag set; used for notes too | Done (alpha.91), High |
| R3 | Random tables done properly | adventure tables only, one level | shared engine from FG: inline [2d6], [Nx], nested tables, columns, secret rolls, link results as cards; Roll on every table; editor and paste import | Done (alpha.91), High |
| R4 | Share with one or chosen players (= S3) | gm/owner/all; pictures to all | visibility = gm / all / list of names; eye menu; drop on a portrait; pictures and story too | Done (alpha.91), High |
| R5 | Item identification | fields hidden | Identified toggle; players get nonid name/notes, stripped on the host | Done (alpha.91), High |
| R6 | Encounter builder, placement, random encounters | module encounters only | campaign battle records (NPCs, counts, faction), XP/CR total, Place on this map, dice counts, End encounter awards XP | Done (alpha.91), High |
| R7 | Links everywhere (record text, chat) (= D3) | links dead in campaign records; no chat drop | follow links in every record; drop a link in chat posts a card | Done (alpha.91), High |
| R8 | Campaign backup, restore, export (= S8) | one .bak | dated snapshots, Restore, Export/Import .zip, export records as .kpack | Partly: no import of a campaign .zip, no records exported as .kpack; Medium |
| R9 | Parcels as records, quests, locations | typed parcel names; quests are XP rows | parcel records with full item links and coins; quest records dropped on the XP tab; locations as story with a map pin | Partly: locations have no map pin; Medium |
| R10 | Campaign options from manifests, session log | a few table options; 2000-line chat | Options tab from each manifest's option list; per-session chat archive with search | Partly: no Options tab from the manifests (session log done); Medium |

Lower: full-text search across books, GM's own handout images (drop a file on Images), Foundry JSON import, shop, story templates, PDF pages, category editing.

## Dice, chat and combat flow

Kraken already at or ahead: seeded host dice engine, 3D dice, tray with right-click roll N, custom dice and dice packs, dice tower, whispers and reply, emote/OOC/mood/story/vote, speak as, roll cards and drag a damage/heal line onto a creature, drag chat into notes, initiative (all/NPCs/own), sort/turns/rounds/undo, hide NPCs, turn chime and banner, add from list/map/encounter/party, damage/heal on rows, death markers, 5E death saves, XP awards.

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| D1 | Modifier stack every roll reads | one number in ChatDock local state; sheet and tracker rolls ignore it | per-seat host stack (6 labelled slots + total), applied to every roll the seat starts, listed in the card | Done (alpha.91), High |
| D2 | ADV / DIS / +2 / -2 and ruleset presets | 5E sheet select only | toggle chips beside the modifier box, each used once; presets per manifest (5E cover, crit, max, half) | Done (alpha.91), High |
| D3 | Links in chat | none | link {kind,id,name} on chat lines; drop any record or picture into chat; click opens, drag carries | Done (alpha.91), High |
| D4 | Speaker portraits in chat | GM icon only | stamp recordId when speaking as a character/NPC, draw its portrait, drag opens the sheet | Done (alpha.91), High |
| D5 | Rest per ruleset | Done (unreleased): `kraken_rest`, each game's `bookkeeping.mjs` rest (5E Hit Point Dice, HP, half the dice back, slots, death saves, Exhaustion, concentration, effects that end on a rest, a ration; 3.5E/2E/BF/C&C natural healing and spells; Traveller 1D + END; Cairn's rest and sleep), on the sheet, the party sheet, the tracker after End and the Cards window | short/long rest hooks per ruleset (hit dice, HP, slots, effects ending), on sheet, party sheet and tracker | Done (alpha.91), High |
| D6 | Party rolls with skills, ask the players | attributes only, host rolls | checks/saves/skills; "roll for them" or "ask the players" prompt cards; summary line | Done (alpha.91), High |
| D7 | Group initiative | each entry rolls | option each / by kind: one roll per NPC kind | Done (alpha.91), High |
| D8 | Roll tables to chat, /rollon | adventure tables, always GM-only | /rollon with visibility, nested tables, campaign and pack tables, roll button | Done (alpha.91), Medium |
| D9 | Inline rolls in text | none | [[1d20+3]] and NdS+M chips in books, story, notes, chat | Done (alpha.91), Medium |
| D10 | Combat options | hard-coded | NPC health to players (off/status/bar/numbers), skip the dead, NPC numbering, Delay/Act now | Done (alpha.91), Medium |
| D1 | Modifier stack every roll reads | one number in ChatDock local state; sheet and tracker rolls ignore it | per-seat host stack (6 labelled slots + total), applied to every roll the seat starts, listed in the card | High. Done: electron/modifiers.cjs, each seat's stack kept by the host (6 labelled slots and the total; a number, a chat roll or an effect dropped on the box, right-click takes one off, /mod), read by every roll the seat starts in one request (FG's lock: a full attack's rolls all read it), then cleared; the card lists it; kraken_modifiers; check-modifiers |
| D2 | ADV / DIS / +2 / -2 and ruleset presets | 5E sheet select only | toggle chips beside the modifier box, each used once; presets per manifest (5E cover, crit, max, half) | High. Done: the game's keys as chips under the tray (shared/rulesets/modifiers.mjs; a manifest's dice.modifiers lists them: 5E ADV, DIS, +2, -2, Opp, Cover, S. cover, Crit, Max, Half; Traveller and Apeira Astra Boon, Bane...), each used once by the next roll that reads it; ADV and DIS cancel; the 5E sheet's advantage select removed |
| D3 | Links in chat | none | link {kind,id,name} on chat lines; drop any record or picture into chat; click opens, drag carries | High. Done: link on chat lines (the quick slot link shape), dropped into the chat's entry; a chip that opens only what the seat may see, drags on; unidentified items by their unidentified name; the GM's Share posts the record's words as the players know it; kraken_chat_send link, share |
| D4 | Speaker portraits in chat | GM icon only | stamp recordId when speaking as a character/NPC, draw its portrait, drag opens the sheet | High. Done: the host stamps recordId on lines spoken or rolled as a character, or by the GM as a creature (/id, the tracker); its portrait drawn, a click opens it, a drag carries it |
| D6 | Party rolls with skills, ask the players | attributes only, host rolls | checks/saves/skills; "roll for them" or "ask the players" prompt cards; summary line | High. Done: the party sheet's group roll for every game (its manifest's checks, saves and skills), each member through their own sheet roll; Roll for them, or Ask the players: a card each owner rolls from (their own modifier box), the GM for anyone, the summary when all have rolled; kraken_party_group_check mode, prompt-roll |
| D7 | Group initiative | each entry rolls | option each / by kind: one roll per NPC kind | High. Done: the table option initGroup each / kind (one roll per kind, its copies sharing it), for every game's initiative branch |
| D8 | Roll tables to chat, /rollon | adventure tables, always GM-only | /rollon with visibility, nested tables, campaign and pack tables, roll button | Medium. Done: /rollon, nested tables, campaign and pack tables and the window's Roll were the records work; a player's table roll now follows their roll mode, and a result's links are chips on the card |
| D9 | Inline rolls in text | none | [[1d20+3]] and NdS+M chips in books, story, notes, chat | Medium. Done: shared/text/inlineRolls.mjs, src/ui/InlineRolls.tsx: [[1d20+3 #label]] and bare dice as chips in chat, books, adventures' stories, records, story pages and notes (kept as typed when saved); a click rolls as /roll would (the speaker, the modifier box) |
| D10 | Combat options | hard-coded | NPC health to players (off/status/bar/numbers), skip the dead, NPC numbering, Delay/Act now | Medium. Done: the token health option (off, dot, bar, numbers) also sets what the tracker shows players; skipDead (enemies, all, off); npcNumbering (append, random, off); Delay and Act now on tracker rows; Settings > Combat |

Smaller: formulas with spaces and #label (done); dice modifiers rr, xo, min, max, cf, ms (done); roll-mode selector in the chat bar (done: kept by the host per seat, every roll the seat makes); chat export and archive (done: the chat's export for every seat, the GM's Session Log with each sitting archived in the campaign folder); /gm alias, /help note that /r rolls (done); chat languages; quick-slot pages; turn timer (open).

## Session, players and platform

Kraken already at or ahead: accounts with lockout, pop-outs and remembered window places on other monitors, per-player volumes by kind, chat sound triggers, quick slots with macros, votes, read-aloud, Message of the Day, updater, LAN/offline, large-map tiling, colours and speak-as.

| # | Gap | Kraken today | Best solution | Priority |
|---|---|---|---|---|
| S1 | Automatic reconnect | onclose resets to the join screen (useSession.ts:619) | retry with backoff, "Reconnecting..." banner, reuse the account token; 30-60 s grace on the host before "away" | Done (alpha.91), High |
| S2 | Internet hosting without router setup, invite links | addresses + forwarded port | UPnP/NAT-PMP option, invite link with password in the URL fragment, copy + QR | Done (alpha.91), High |
| S3 | Per-player sharing and permissions | visibility gm/owner/all; pictures to all only | {default, users:{name:level}}; "Share with..." menu; drop a window on a portrait to share with that player; showImage/map-share to chosen players | Partly: no per-player levels, and a shared map still goes to everyone; High |
| S4 | Pause the game | none | GM button and /pause: players' veil, host refuses moves/rolls | Done (alpha.91), High |
| S5 | Players-window controls | /kick only, no ban | right-click Kick, Ban (kept per campaign), Ring bell, Share, View as; /afk and idle dim | Done (alpha.91), Medium-High |
| S6 | Pull players to my view | sharing opens the window only | view-pull with centre/zoom, Shift-ping, scene-title card | Done (alpha.91), Medium |
| S7 | Settings for this screen | /scaleui only | UI scale and text size sliders, global reduced motion, colour-blind-safe palette with letter marks, rebindable shortcuts (Controls panel) | Partly: UI scale only (unreleased), no text size, reduced motion, colour-blind palette or shortcuts; Medium |
| S8 | Campaign management, backups, logs | create/pick only; one .bak | rename, duplicate, export zip, delete to recycle bin, open folder; rolling backups + Restore; rotating log + Open logs | Done (alpha.91), Medium |
| S9 | Playlists and synced music | folder plays randomly, unsynced | playlist record (order/shuffle/repeat/crossfade), startedAt so late joiners hear the same bar, Now playing | Partly: a music folder plays in order or shuffled, repeats or stops (Sound window, kraken_sound order/repeat/playlist), and every seat joins a track at the same moment (the host sends how far in it is; `check-sound`, `verify-music-sync-ui`) (unreleased); a playlist's tracks cross-fade (the next asked for 4 s before the end, by the GM's screen whether or not the Sound window is open; `verify-music-sync-ui`); a playlist record of hand-picked tracks still open; Medium |
| S10 | Mobile and tablet players | no touch handling | pointer pan, pinch zoom, long-press menu, 44 px targets, narrow tabbed layout | Partly: one-finger pan, two-finger pinch zoom and 44 px targets on a touch screen (map tools, window buttons, token menu, sidebar, quick slots) done (unreleased; `verify-touch-ui`); the long press is the browser's own right-click (to try on the GM's touch laptop); a narrow tabbed layout for phones still open; Medium |

Later: first-run GM checklist and tour, View as player X, Assistant GM role, session timer, light/high-contrast themes, positional map sounds, i18n extraction, add-on API on the manifests, voice/video (needs HTTPS; Discord covers it).
