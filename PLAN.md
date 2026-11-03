# Kraken VTT: Plan

A free, open-source (MIT) virtual tabletop that runs in the web browser. It aims for Foundry-level presentation with Fantasy Grounds-level ease of use, and a rules engine that matches FG's behavior.

Status: the plan is still being worked out. The code in this folder is a rough first draft.

---

## 1. Vision

- **The GM hosts and players use a browser.** The GM creates a campaign, names it, and shares an address, port and password. Players open Chrome, go to the address, log in, and see only what they are allowed to see. Players install nothing.
- **A multi-monitor GM workspace.** The GM is not stuck in one window. The module goes on the vertical monitor, the map on the main monitor, and chat, the combat tracker, the party sheet and sound on a third. Every panel can pop out, and the layout is saved with the campaign.
- **An engine that rulesets run on.** A system-neutral core provides dice, chat, records, combat, effects, tables, parcels and maps. Rulesets sit on top of it, the way FG rulesets sit on CoreRPG. No game-specific rules live in the core.
- **Behavior that matches Fantasy Grounds.** For a given ruleset, a roll, a saving throw or an effect gives the same result as in FG. We prove this with automated parity tests (section 7).
- **Modern browser features.** Hardware-accelerated WebGL2, VP9 WebM video for animated maps and effects, and Web Audio.
- **Desktop computers only.** Phones are out of scope, and iPads are deferred.

## 2. Ground rules

1. **No game rules in the core.** If adding a second ruleset means editing the core, the boundary is in the wrong place. There should be no AC, no hit points and no "5E" anywhere in the core.
2. **The host is in charge.** Every change goes through the host, which checks permissions and sends each client only what it may see. Hidden tokens, GM notes, traps and secret doors never reach a player's machine.
3. **Clean-room behavior.** We replicate how a VTT behaves, not its code. Observing FG's behavior is fine, and so is porting the user's own SiegeCore logic. We never copy SmiteWorks code (CoreRPG or official rulesets) or Foundry code. SiegeCore's folder contains a copy of CoreRPG's source in `dev/_corerpg/`. Port only SiegeCore's own scripts, and never that folder.
4. **No official content in the repo.** Licensed modules, rulesets and art stay in a git-ignored `content/` folder for local testing only. Tests that need it skip themselves when it's missing.
5. **Testable by machines.** Seeded dice, a scriptable bridge, and deterministic results.
6. **Built for an AI agent from the ground up.** Every action a GM can take in the interface is also an agent tool (MCP, and later the in-app assistant), added in the same change with a test. The tool goes through the same host functions and permission checks as the click. `npm run coverage` fails when a table action has no tool. [AGENT.md](AGENT.md) maps every action to its tool.

## 3. Architecture

```
┌──────────────────────── GM machine ────────────────────────┐
│  Kraken Host (Electron)                                    │
│   ├─ Table server (Node): HTTP + WebSocket                 │
│   │    ├─ Record store (authoritative) + permissions       │
│   │    ├─ Asset store (content-hashed files)               │
│   │    └─ Kraken MCP bridge (dev / parity testing)         │
│   └─ GM windows: map · module · chat · combat · party …    │
└──────────────────────────┬─────────────────────────────────┘
                           │  http://host:port  (ws + assets)
        ┌──────────────────┼──────────────────┐
     Player (Chrome)    Player (Chrome)    Player (Chrome)
```

- **Web client (TypeScript + React):** one codebase serves both the GM windows and the player browsers. The role and permissions decide what is shown.
- **Map renderer:** WebGL2, probably through PixiJS. The current SVG overlay will not handle line of sight, fog and animated light at scale. Switch before building line of sight.
- **Host:** Electron runs the Node server and opens as many GM windows as the GM wants. A headless host mode (no window) is a nice-to-have.

### Layers

| Layer | Contains | Knows about |
|---|---|---|
| **Engine** | Networking, record store, assets, renderer, windows, chat transport, MCP bridge | Nothing about games |
| **Core** (our "CoreRPG") | Dice pipeline, actions, chat cards, combat tracker, effects, tables, parcels, party sheet, records, maps, tokens, LoS, lighting | Generic TTRPG ideas only |
| **Ruleset** (SiegeCore first) | Record types, sheets, roll types, damage, saves, resistances, spells, XP math | Its own game |
| **Importers** | FG `.mod`/`db.xml`, Foundry adventure bundles | Source formats → core records |

## 4. Engine

### 4.1 Record store
One tree of records (characters, NPCs, items, tables, parcels, encounters, maps, combat, chat) instead of one network message per feature.
- Every record has an **owner** and **visibility** (GM, owner, everyone, or a set of players).
- Changes are small operations sent to the host. The host validates them, applies them, and broadcasts them to clients allowed to see the record.
- Clients subscribe to the parts of the tree they need.
- Campaigns are saved to disk as plain JSON, with assets stored next to them.

This replaces the per-type messages (`scene`, `pawn`, `chat`) in `electron/tableServer.cjs`.

### 4.2 Assets
- Files are named by a hash of their content, so a player downloads a map once and caches it.
- Access is checked per asset against record visibility.
- Large files (big maps, VP9 video) stream with range requests.

### 4.3 Networking
- The default is plain `http://IP:port`. WebGL, VP9, Web Audio and WebSockets all work without HTTPS.
- Features that need HTTPS (voice and video chat, service-worker caching, WebGPU) come later through an optional one-click self-signed certificate or an optional tunnel.
- The host shows the LAN address and the external address. Automatic router port forwarding (UPnP) is a later item.
- Login is a password plus a player name. Players reconnect to the same seat and keep their ownership.

### 4.4 GM workspace
- Every panel is a window that can be popped out (`window.open` in Electron) and placed on any monitor.
- All windows read the same record store, so they stay in sync.
- The window layout is saved with each campaign and restored when it opens.

## 5. Core (system-neutral)

- **Dice pipeline:** dice string → roll → modifiers (modifier box, situational modifiers) → result → handler → chat card. Rulesets register roll types and result handlers. The RNG can be seeded and the dice results can be fixed for tests.
- **3D dice: The Gilded Die** (`F:\dice_table`, the user's own code, built with React, Three.js and cannon-es). It has physics dice you grab and throw, d4 through d20 plus percentile, six procedural themes and sound. It's the right base for the dice table, with one change. Today the result is read from whichever face lands on top. For multiplayer and tests, **the host decides the result**: seeded and fixable, and the same on every screen. Each client animates its dice to land on that result, for example by simulating the throw and then turning the die so the right face ends up on top. The physics is for show; the number comes from the dice pipeline. More dice sets and effects can come later.
- **Actions and targeting:** roll against one or more targets. Results apply to the target's records.
- **Chat:** messages, roll cards, GM-only and whispered messages, and drag-and-drop from chat.
- **Combat tracker:** initiative, turn order, rounds, and per-turn effect ticks. Death markers come from a ruleset hook.
- **Effects:** labeled effects with a duration, a source, a target and a ruleset-interpreted payload.
- **Tables:** roll on a table, nested tables, and results posted to chat or turned into records.
- **Parcels and the party sheet:** coins and items, handing out parcels to the party, and the party inventory.
- **Records:** characters, NPCs, items, story/journals, encounters, quests and images. Rulesets supply record types and sheet layouts. Sheets are mostly declarative data, plus TypeScript.
- **Maps:**
  - images and VP9 video as backgrounds
  - square and hex grids
  - layers
  - tokens and movement
  - walls and doors
  - line of sight and fog
  - lights
  - animated effects: light, fire, lightning, and areas of effect
- **Sharing:** share an image or map with all players or chosen players. Pointers and pings.
- **Sound:** playlists and ambient sound per scene, with the GM in control.

## 6. Rulesets

- A ruleset is a package with a manifest, record schemas, sheet layouts, roll types and handlers, and hooks into the core: combat start, turn start, apply damage, apply effect, and so on.
- It is written in TypeScript.
- It never touches networking or rendering directly. It changes records through the core API.
- **First ruleset and test game: Castles & Crusades,** ported from SiegeCore, the user's own C&C ruleset for FG. It's built on the SIEGE engine:
  - attribute checks against a challenge base, with prime and secondary attributes
  - BtH (base to hit)
  - the "packages" system for classes
  - house-rule options (`SIEGE_*` in `OptionsSiege`)

  SiegeCore's options become the C&C ruleset's options, with the same names and defaults.

## 7. Parity testing against Fantasy Grounds

The goal "works as well as FG" becomes a set of tests that pass or fail.

1. **Scenario:** a fixture with the same character, monster, items and action, in both FG and Kraken.
2. **Fixed dice:** both sides get the same dice results. FG through SiegeCore or the agent bridge; Kraken through seeded dice.
3. **Run in FG** with the fgu agent bridge, and capture the chat output and the changes to records.
4. **Run in Kraken** with the Kraken MCP bridge, and capture the same.
5. **Compare** the two results. Fix Kraken until they match, then keep the scenario as a regression test.

### Test bench
- **FG side:** the campaign "Fantasy Grounds (SiegeCore) Castles & Crusades Test Bench v1", reached through the fgu agent bridge. Its packages include `ActionSiege`, `SiegeRules`, `SiegeMath`, `SiegePower`, `SiegeTest` and `CCLevelUp`.
- **Fixed dice and the first suite:** SiegeCore's `/siegetest` (`scripts/siege_selftest.lua`, about 3,800 lines) already builds a throwaway PC and NPC, fixes the options, and checks results built from a fixed d20. Its cases are the first parity suite to port, including:
  - flat-ability AC
  - item-equipped effects
  - failed-save effects
  - item damage bonuses
  - auto-equip
  - packages
  - skipping unconscious combatants, and death markers
  - known-spell mode and mana casting
  - one-roll spells
  - pool powers
  - group checks
  - claiming a pregenerated character

  Each case becomes a Kraken test, then a side-by-side parity scenario.
- **Content for playtests (local only, never committed):**
  - C&C Player's Handbook, Monsters & Treasure, Castle Keeper's Guide, Adventurer's Backpack
  - the converted B-series: B1, B2, B3, B4, B5, B6, B7 and B9
  - C1 The Mortality of Green
  - Mystara: The Known World
  - SiegeCore's sample packages
  - the map packs

  Importing these through the FG `.mod` importer is the real-world test of section 8.

### Checklist (from the GM's questions)

**Core:**
- How do dice roll?
- How are tables used?
- How do effects apply?
- How are parcels added to party sheets?
- How are items purchased and added to character sheets?
- How is experience applied to encounters?
- How are maps displayed?
- How are tokens placed?
- How is movement handled?
- How are death markers applied?
- How are images and maps shared?
- How does line of sight work?
- How are magical effects (light, fire, lightning) shown to players?

**Ruleset (Castles & Crusades):**
- How is monster damage done?
- How are spells cast?
- How are resistances handled?
- How are saving throws calculated?
- How is experience calculated?

## 8. Importers

- **FG modules (`.mod` = zip with `db.xml` and images):** story, NPCs, items, tables, parcels, encounters, images, and map data (grid, line of sight, occluders, pins). This brings existing FG adventures over without rebuilding them.
- **Foundry adventure bundles:** started in `src/foundry/`. Map them to core records instead of map-only data.
- Importers read only files the user provides. Nothing licensed is ever committed.

## 9. What we reuse

- **The Gilded Die** (`F:\dice_table`): the 3D dice table, made to land on results the host decides (section 5).
- **SiegeCore** (the user's own C&C ruleset): the rules logic, its options and its self-test cases, ported to TypeScript. This excludes its `dev/_corerpg/` copy of CoreRPG.
- **This folder's draft:** the Electron shell, the host/join flow, password checks, address discovery, and the Foundry bundle parser and its tests. The rest will be reworked onto the record store.
- **Open-VTT** (`open-vtt/`, Khazlor, MIT, Godot): a reference for features only. The ideas worth taking are multi-layer maps, 18 light layers, field-of-view mode, targeting and area-effect modes, inventory and equipment slots, the character sheet editor, and building a sheet from a PDF. Any code we translate keeps Khazlor's MIT notice.

## 10. Build order (agreed 2026-11-02)

Each step is tested before the next one starts. Where FG or Foundry does the same thing, the test compares against the live program through its bridge.

| # | Step | Done when |
|---|---|---|
| 0 | **Foundation:** record store (host-owned, per-record owner and visibility, saved with the campaign), **agent MCP built in** (every action the UI can take is also a tool), dice pipeline (seeded, results can be fixed, chat roll cards) | An agent connected over MCP can list, create and edit records, roll dice and chat. A player client sees only its permitted records. Everything survives a restart. |
| 1 | **C&C content import:** read the user's FG C&C modules (PHB, M&T, CKG, Backpack): SiegeCore packages (race/class), items, spells and NPCs, as records | Counts and sample records match what FG shows through the fgu bridge. |
| 2 | **C&C character sheet + creation wizard,** ported from `KrakenCharWizardCC`: abilities, race, class, primes, hit points, equipment, spells, finish; then multi-class, enhanced class and class-plus; level up | The same `buildFromSpec` spec built in FG (fgu bridge) and in Kraken (MCP) gives matching sheets: scores, modifiers, HP, BtH, AC, saves, XP, coin, gear and spells. |
| 3 | **Party sheet:** members, coin and party inventory, parcels, handing out XP | Matches FG's party sheet results for the same inputs. |
| 4 | **Combat tracker + C&C actions:** initiative, turns, attacks, damage, saves (SIEGE checks), effects, dying and dead, death markers | SiegeCore's `/siegetest` cases pass in Kraken with the same fixed dice. |
| 5 | **Tokens on the map:** a character's token, movement, ownership; doors, windows, secret doors, line of sight, fog, lights | Side by side with Foundry on the same scene: same visible areas and door behavior. |
| 6 | **In-app DM assistant:** a chat panel in the GM workspace driving the same tools the MCP exposes | The assistant can build a character, start combat and run a round from plain requests. |

### Progress (2026-11-02)

| Step | State | Proof (npm scripts) |
|---|---|---|
| Map alignment | Done | `check`: Troll's Pot, and Bandit Camp against live Foundry numbers |
| Campaign saving | Done | E2E test: leave, re-host, rejoin |
| 0 Foundation | Done | `agent`: MCP host, records, permissions, fixed dice, chat, screenshot, save/reload |
| 1 C&C import | Done | `import-check`: PHB, M&T, CKG, Backpack counts and fields equal live FG |
| 2 Character engine | Done for single-class characters | `pregens`: all 132 Common Room pregens equal FG's sheets field for field (4 against a live FG build) |
| 2 Sheet + agent tools | Done | `character`: `kraken_build_character`, `kraken_siege_check`, Characters tab, player visibility |
| 2 Creation wizard UI | Done | `wizard`: every page driven with fixed dice; result equals the builder; host rolls every die |
| Players in a browser | Done | The host serves the web client; `agent` checks it; manual Chrome pass as a player (join, map, own sheet only, check, chat) |
| 2 Level up (single class) | Done | `character`: host-rolled HP, BtH, hit dice and next XP from the package rows, [LEVEL UP] in chat, sheet button |
| 2 Multi-class, enhanced, class plus; dual class and reclass | Next | Port from `KrakenCharWizardCC` (CCClassRules, CCCombine, CCLevelUp) |
| 5 Tokens and line of sight (first pass, ahead of 3–4) | Done | `map`: snapping, distance, walls stop players, doors (open, locked, secret), per-player line of sight, hidden tokens, movement lock, agent map tools, save/reopen. `session` and E2E: a player places and moves their own character's token. Chrome passes on Cragmaw Hideout and Cragmaw Castle |
| 5 Line of sight against Foundry | Done | `sight-parity`: a scene's walls in a temporary Foundry scene, a token either side of every door (closed and open); Foundry's token vision equals Kraken's within 1% (Cragmaw Castle 0.53%, Dragon's Fane 0.10%) |
| 5 Map settings, lighting, weather | Done | `map`: darkness, lights, torches from SiegeCore light profiles, deepvision/darkvision in grey, twilight vision, weather and grid settings; Chrome passes as GM and player |
| Player and GM layouts | Done | Players: map with a Chat / Character / Party dock and their portraits; the GM keeps the tabs with chat docked beside them. E2E checks a player has no GM tabs |
| Portraits and tokens | Done | The GM's FG portraits/ and tokens/ folders (and each campaign's) served to the table; the sheet's portrait frame picks one; tokens show it |
| 3 Party sheet | Done | `party`: CoreRPG's XP split (last member gets the remainder), quests and encounters awarded once, coin and item distribution, SiegeCore's group check and save; players read only. (FG's PartyXPManager is not reachable through the bridge, so the split is tested against its source, not live.) |
| 5 Still to do | Later | Multi-select and group moves, facing, light animation (flicker), bright lights spoiling darkvision, an FG player client side by side with Kraken's player view |
| 4 Combat tracker | Done | `combat`: SiegeCore's initiative (d10 + attribute + bonus), FG's order, turns and rounds with "[TURN]" / "[ROUND n]", hidden entries GM-only, effect durations at their initiative, NPC hit dice and "Orc 1/Orc 2" numbering, damage and healing with the heal cap, no healing the dead, stabilising, bleeding, unconscious enemies skipped; players roll their own initiative and end their own turn |
| Interface | Done (first pass) | FG-style desktop: menu bar with portraits, map or emblem, sidebar launchers, floating windows (Characters, sheets, Party, Combat, Players), chat with dice tray, modifier box and dice tower; redesigned sheet and join screen. Chrome passes as GM and player |
| 4 Attacks and targets | Done | `attack`: SiegeCore's attack (d20 + attack bonus + ATK effects against AC + AC effects, equal hits, one roll per target, FG's "[ATTACK] (M) ... [HIT 13 vs 13] -> [at Orc]"), damage with the damage attribute and DMG effects put on every target, NPC attacks from their records, Ctrl+click targeting with reticles, NPC pictures from their modules. Chrome pass as Ann |
| 4 Saves and spells | Done | `spells`: SiegeCore's save (d20 + attribute + level + SAVE effects against CB 12/18 + CL; an NPC's level is its hit dice, its primes its primeset; FG's "[SAVE] ... [CB 18 CL 3 CC 21] [SUCCESS 21 vs 21]"), casting spends a slot of the spell's level, Magic Missile's repeating missiles, Hold Person's Wisdom save negating a 1 round per level effect, half or no damage on a save, healing, CL dice ("CLd2+CL") for powers with no actions. Sheet Check/Save switch, spell slot pips, GM rest; tracker save prompt |
| Look | Done | The user's Kraken logo as the emblem, menu mark, favicon and app icon; three.js loads only when a scene has weather |
| 4 Still to do | Next | Critical hits by option, ammunition, spell resistance, NPC spellcasting |
| UI Pop-out windows | Done | `popout`: drag any window (characters, sheets, party, combat tracker, players) past the edge of the main window, or press its pop-out button, and it becomes a real window of its own for another monitor; chat pops out too. It stays live (the same session), remembers where it was, opens there again, and has a button to come back. Electron allows only these windows. Chrome pass as Ann: tracker popped out, rolled initiative from it, chat rolled from its own window, both brought back. A port in use no longer crashes the host |
| Dice: 3D dice on the table | Done | `dice`: The Gilded Die's dice (d4 to d20, d100 as tens and ones, six themes) roll across the desktop on every screen, as FG's. The host decides the number: each screen simulates the throw first (cannon-es), puts that number on the face the die rests on (a d4 is read at its top), and plays it back, with shadows on the map and made-on-the-spot clack and knock sounds. A die resting on another is knocked off. The chat card shows its result when the dice land (FG's onDiceLanded). Drag a die (or the pool) out of the tray and let go to throw it the way the hand moved; sheet, tracker and /r rolls are thrown from where they were asked for. Everyone sees the roller's own dice. FG's dice tower: drop dice on it; the GM gets the [TOWER] roll, the roller sees only what went in, the table nothing; the GM's option (dice settings, or `kraken_table_options`) shows rollers their own result. Each seat's dice settings: 3D on or off, sound and volume, its set and colours. Chrome pass as Ann: every rendered die read back equals the card (1 3 4 48 3 4), tower hidden and revealed |
| Dice: still to do | Later | Dice thrown from a popped-out chat start from the chat corner; more dice sets and effects (DSN-style trails, crit effects); dice for d2/d3 and other sides |
| Launcher | Done | `Kraken VTT.bat` in the main folder: installs packages the first time, rebuilds the interface when the code changed, opens the app. `Kraken VTT.exe` there is a packaged snapshot (`npm run exe`), kept out of git. README.md says how to run it |
| Agent: the interface too | Done | `agent-ui` against the real app over MCP: `kraken_windows` (open, close, pop out, dock, a character's sheet), `kraken_dice_settings`, `kraken_open_adventure` and `kraken_scenes` (on the Keep on the Borderlands bundle), `kraken_ping` seen by a player, `kraken_art`; `kraken_roll` with `secret` (in `dice`). `coverage`: every table message and tracker action has a tool. AGENT.md lists them all, and what is not a tool yet (chat pop-out, exact window placement) |
| 6 | Not started | In-app DM assistant |

Where things are:
- `electron/records.cjs`, `dice.cjs`, `tableServer.cjs`, `mapState.cjs` (tokens, doors, what each player sees)
- `shared/map/geometry.mjs`: grid snapping, distance, wall collision, line of sight (Foundry's rules), light, senses, token health colours
- `electron/artLibrary.cjs` (portraits and tokens), `electron/party.cjs` and `shared/party/party.mjs` (party sheet)
- `src/table/Lighting.tsx`, `Weather.tsx` (three.js), `SceneSettings.tsx`; `src/party/PartySheet.tsx`
- `electron/combat.cjs` (tracker) and `src/combat/CombatTracker.tsx`
- `src/ui/`: `Desktop.tsx` (the table's layout), `Windows.tsx` (floating windows), `ChatDock.tsx` (chat and dice), `icons.tsx`, `Emblem.tsx`
- `electron/agent/`: `tools.cjs`, `mcpServer.cjs`, `mcp-stdio.cjs`. `.mcp.json` registers it for Claude Code.
- `electron/importers/fgModule.cjs`
- `shared/siege/engine.mjs` (rules) and `builder.mjs` (characters)
- `src/characters/CharacterPanel.tsx`

A to Z means that, by the end of step 6, a GM can run one C&C session start to finish: B2 on the table, the party built in the wizard, combat on the map, with an agent able to do every step.

## 10a. Milestones (earlier draft)

1. **Foundation:**
   - git repo, `content/` ignored, an MIT LICENSE
   - the host serves the web client to plain browsers
   - record store with permissions
   - content-hashed assets
2. **Table:**
   - WebGL map renderer
   - tokens, movement and ownership
   - sharing images and maps
   - the GM's pop-out windows with a saved layout
3. **Core rules:**
   - dice pipeline with seeded dice
   - chat cards
   - combat tracker
   - effects
   - tables
4. **Bridge and parity:**
   - Kraken MCP bridge
   - parity tests against FG
   - first scenarios: a dice roll, a table roll, an effect
5. **Castles & Crusades (ported from SiegeCore):**
   - record types and sheets
   - attacks and damage, saves, resistances, spells
   - XP
   - parity tests for each
6. **Vision:** walls and doors, line of sight, fog, lights, and animated effects.
7. **Importers:** FG `.mod` importer. The Foundry importer moves onto core records.
8. **Party economy:** parcels, the party sheet, shops and buying, encounter XP.
9. **Later:**
   - HTTPS mode, voice and video
   - UPnP
   - audio playlists
   - a second ruleset to prove the core is truly neutral

## 11. Open questions

- For live parity runs outside `/siegetest`, should fixed dice be added to SiegeCore, so any roll through the bridge can take preset results, or only for scripted cases?
- What format should declarative sheets use (JSON layout, JSX, or both)?
- Player seats: fixed seats per campaign, so each player owns their characters, or anyone with the password can join?
- Headless host mode: needed early or not?
