# Kraken VTT: Plan

A free, open-source (MIT) virtual tabletop that runs in the web browser. It aims for Foundry-level presentation with Fantasy Grounds-level ease of use, and a rules engine that matches FG's behavior.

Status: alpha test (see `package.json` for the version; `npm run bump` moves it on, one step per pushed build, tagged `v<version>`). Backed up at https://github.com/krakenunbound/kraken-vtt (private).

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
| 2 Multi-class, enhanced, class plus; dual class and reclass | Next (1 below) | Port from `KrakenCharWizardCC` (CCClassRules, CCCombine, CCLevelUp) |
| 5 Tokens and line of sight (first pass, ahead of 3–4) | Done | `map`: snapping, distance, walls stop players, doors (open, locked, secret), per-player line of sight, hidden tokens, movement lock, agent map tools, save/reopen. `session` and E2E: a player places and moves their own character's token. Chrome passes on Cragmaw Hideout and Cragmaw Castle |
| 5 Line of sight against Foundry | Done | `sight-parity`: a scene's walls in a temporary Foundry scene, a token either side of every door (closed and open); Foundry's token vision equals Kraken's within 1% (Cragmaw Castle 0.53%, Dragon's Fane 0.10%) |
| 5 Map settings, lighting, weather | Done | `map`: darkness, lights, torches from SiegeCore light profiles, deepvision/darkvision in grey, twilight vision, weather and grid settings; Chrome passes as GM and player |
| Player and GM layouts | Done | Players: map with a Chat / Character / Party dock and their portraits; the GM keeps the tabs with chat docked beside them. E2E checks a player has no GM tabs |
| Portraits and tokens | Done | The GM's FG portraits/ and tokens/ folders (and each campaign's) served to the table; the sheet's portrait frame picks one; tokens show it |
| 3 Party sheet | Done | `party`: CoreRPG's XP split (last member gets the remainder), quests and encounters awarded once, coin and item distribution, SiegeCore's group check and save; players read only. (FG's PartyXPManager is not reachable through the bridge, so the split is tested against its source, not live.) |
| 5 Several tokens, facing, light spoiling darkvision | Done (alpha.23) | Shift+click picks tokens, Shift+drag on the map draws a box that picks the ones in it (a player's own; the GM's any); dragging one moves them all as far (each snapped and stopped by walls on its own; a group with someone else's token is refused whole), arrows move them all. Shift+wheel over a token turns it 45 degrees (Ctrl or Alt: 15), FG's token orientation: its picture turns and a notch shows the way it faces; the GM turns any, a player their own. `kraken_token_move` ids with dcol/drow, `kraken_token_update` facing. C&C's rule (PHB, Dwarf, Gnome, Half-orc: "Bright lights, such as from a lantern or other light source, spoil deepvision"): a token standing in a light's bright light (its own torch, or a lamp's) loses its deepvision and darkvision and sees only by light, with a notice; twilight vision is not spoiled (it works by torchlight). The minute or turn to adjust after the light goes out is not timed. `map`, `walls`, `maptools-ui` |
| 5 Still to do | Later | An FG player client side by side with Kraken's player view |
| 4 Combat tracker | Done | `combat`: SiegeCore's initiative (d10 + attribute + bonus), FG's order, turns and rounds with "[TURN]" / "[ROUND n]", hidden entries GM-only, effect durations at their initiative, NPC hit dice and "Orc 1/Orc 2" numbering, damage and healing with the heal cap, no healing the dead, stabilising, bleeding, unconscious enemies skipped; players roll their own initiative and end their own turn |
| Interface | Done (first pass) | FG-style desktop: menu bar with portraits, map or emblem, sidebar launchers, floating windows (Characters, sheets, Party, Combat, Players), chat with dice tray, modifier box and dice tower; redesigned sheet and join screen. Chrome passes as GM and player |
| 4 Attacks and targets | Done | `attack`: SiegeCore's attack (d20 + attack bonus + ATK effects against AC + AC effects, equal hits, one roll per target, FG's "[ATTACK] (M) ... [HIT 13 vs 13] -> [at Orc]"), damage with the damage attribute and DMG effects put on every target, NPC attacks from their records, Ctrl+click targeting with reticles, NPC pictures from their modules. Chrome pass as Ann |
| 4 Saves and spells | Done | `spells`: SiegeCore's save (d20 + attribute + level + SAVE effects against CB 12/18 + CL; an NPC's level is its hit dice, its primes its primeset; FG's "[SAVE] ... [CB 18 CL 3 CC 21] [SUCCESS 21 vs 21]"), casting spends a slot of the spell's level, Magic Missile's repeating missiles, Hold Person's Wisdom save negating a 1 round per level effect, half or no damage on a save, healing, CL dice ("CLd2+CL") for powers with no actions. Sheet Check/Save switch, spell slot pips, GM rest; tracker save prompt |
| Look | Done | The user's Kraken logo as the emblem, menu mark, favicon and app icon; three.js loads only when a scene has weather |
| 4 NPC spellcasting | Done | `krits`: an NPC's spells and special abilities (its powers in Monsters & Treasure) are buttons on its tracker row for the GM; it casts at caster level = its hit dice, a power with uses per day counts them on the tracker's copy and refuses once used up, and a failed save puts the power's failed effect on (Paralyzed, Petrified) for its failed duration as SiegeCore rolls it (a C&C turn is a minute; with the round length unset, CoreRPG's 10 rounds a minute), unless an IMMUNE effect names it |
| UI Pop-out windows | Done | `popout`: drag any window (characters, sheets, party, combat tracker, players) past the edge of the main window, or press its pop-out button, and it becomes a real window of its own for another monitor; chat pops out too. It stays live (the same session), remembers where it was, opens there again, and has a button to come back. Electron allows only these windows. Chrome pass as Ann: tracker popped out, rolled initiative from it, chat rolled from its own window, both brought back. A port in use no longer crashes the host |
| Dice: 3D dice on the table | Done | `dice`: The Gilded Die's dice (d4 to d20, d100 as tens and ones, six themes) roll across the desktop on every screen, as FG's. The host decides the number: each screen simulates the throw first (cannon-es), puts that number on the face the die rests on (a d4 is read at its top), and plays it back, with shadows on the map and made-on-the-spot clack and knock sounds. A die resting on another is knocked off. The chat card shows its result when the dice land (FG's onDiceLanded). Drag a die (or the pool) out of the tray and let go to throw it the way the hand moved; sheet, tracker and /r rolls are thrown from where they were asked for. Everyone sees the roller's own dice. FG's dice tower: drop dice on it; the GM gets the [TOWER] roll, the roller sees only what went in, the table nothing; the GM's option (dice settings, or `kraken_table_options`) shows rollers their own result. Each seat's dice settings: 3D on or off, sound and volume, its set and colours. Chrome pass as Ann: every rendered die read back equals the card (1 3 4 48 3 4), tower hidden and revealed |
| Dice: customising | Done | The chat's gear opens a Dice window (can pop out) with a live preview: 14 ready-made sets (the Gilded Die's six and Kraken's own: Frost Glass, Molten Gold, Arcane Pearl, Obsidian, Carrara, Oak and Iron, Rune Steel, Kraken Deep), dice, accent and number colours, 12 designs (solid, marble, swirl, speckle, stripes, wood grain, runes, and the Gilded Die's), 6 materials (resin, glass, metal, pearl, stone, wood), 4 letterings, effects as they roll (sparkles, fire, frost, arcane, shadow trails, glow) and a gold or red flare on a natural 20 or 1 (`src/dice/effects.ts`). The look goes with each roll (the host passes on only known parts), so everyone sees the roller's dice on the table, and the roll card's dice wear the roller's set; the tray and pool wear your own. `kraken_dice_settings` sets every part. `dice` and `agent-ui` test it; Chrome pass as Ann: the GM's gold metal dice on her table and card, her tray in her own set |
| Dice: the Gilded Die's new sets | Done (alpha.19) | `src/dice/gilded.ts` ports the user's I:\dice_table: 27 sets in its five groups (Cores, Relics, Wilds, Classes, Worlds) beside Kraken's own, 21 more designs (Aether, Emerald, Frostcrystal, Obsidian, Voidglass, Ghost, Reliquary, Rose Window, Gilded, Bloodstone, Champion, Behemoth, Wyrmscale, Gravewrought, Arcane Seal, Wizard, Bard, Necromancer, Goblin Scrap, Imperial, Mythos), the material "Its own" (each design's own finish: transmission glass with an inner crystal and bright heart, enamel or stained-glass face inlays, the Reliquary's gems on every corner and edge, iridescence, pulsing glow), glowing, gilt and engraved numbers, pips on the d6, its eight trails (soft glow, ectoplasm, sparks, embers, holy motes, charged orb, rising music notes, ion streak) that settle as a ring of sparks and burst on a highest face, and its dark studio lighting for every set. Host and `kraken_dice_settings` take every part; `dice` tests a Bard look reaching other seats; `scripts/shot-dice.mjs` screenshots each group and sets rolling |
| Dice: FG's tray and Dice window | Done | The tray's dice are real 3D dice in your set (drawn in three.js once per set, `src/dice/trayArt.ts`), glowing in its accent, lifting on hover; pick one up and throw it, or click to pool it. Right-click a die: FG's Roll 20, 15, 10, 5, 4, 3, 2 and Custom Dice (d2, d3, d16, d30). The modifier box as FG's: wheel, quick values on a right-click (+1 to +10, −1 to −10, Clear), lit while set. The Dice window laid out as FG's: Active dice set (live preview, colours), Dice display with Tray and Roll sizes, Dice sets as 3D thumbnails by group, Make your own, On this screen. The tower option reads "Let players see their own dice-tower rolls" (off by default: only the GM sees them). `agent-ui`: right-click Roll 3 with a +2 gives 3d6+2 |
| Dice: NPC and damage dice | Done (alpha.22) | FG's other dice sets in the Dice window (My dice, NPC dice for the GM, Damage dice; each "as my dice" until given its own) and `kraken_dice_settings` set npc/damage (same: back to my dice). Each request carries the seat's sets; the host throws a `[DAMAGE]` roll in damage dice, and the GM's roll as a creature (not the GM, not a character) in NPC dice. `dice`, `agent-ui` |
| Dice: still to do | Later | Dice for d2/d3 and other sides |
| Launcher | Done | `Kraken VTT.bat` in the main folder: installs packages the first time, rebuilds the interface when the code changed, opens the app. `Kraken VTT Setup.exe` there (`npm run exe`, kept out of git) installs to Program Files with shortcuts and adds Windows Firewall's rule for the app (`build/installer.nsh`; the uninstaller removes it), so hosting never prompts; the exe carries Kraken's name, icon and publisher, not Electron's. The portable build is gone: it ran from a new temporary folder each time, so the firewall asked on every launch. Tests and demos listen on 127.0.0.1 only (`scripts/loopback.mjs`, `KRAKEN_BIND`). README.md says how to run it |
| Agent: the interface too | Done | `agent-ui` against the real app over MCP: `kraken_windows` (open, close, pop out, dock, a character's sheet), `kraken_dice_settings`, `kraken_open_adventure` and `kraken_scenes` (on the Keep on the Borderlands bundle), `kraken_ping` seen by a player, `kraken_art`; `kraken_roll` with `secret` (in `dice`). `coverage`: every table message and tracker action has a tool. AGENT.md lists them all, and what is not a tool yet (chat pop-out, exact window placement) |
| Front screens | Done | The campaign and join screens rebuilt as Kraken's front door. Painted scenes made for Kraken in Kraken Art (Z-Image Turbo): the keep at night with the kraken rising (campaigns) and the great hall's table (joining), in `src/assets`. They are alive (`src/setup/Backdrop.tsx`): slow drift, a lean toward the pointer, flickering lantern and candle light at their places in the painting, rolling mist, rising motes, lightning out in the storm. The living emblem (`LivingEmblem`): rune rings turning, a breathing aura, glowing eyes, a float. Campaigns as cards with crests from their names; a host panel (name, port, password, LAN/Cloud tiles, addresses to copy); a new-campaign panel with ruleset tiles (Castles & Crusades, Worldbuilding). Cinzel titles (OFL, bundled, so LAN players need no internet). Motion stops for reduced-motion settings. E2E, `agent`, `agent-ui`, `session`, `wizard`, `character` pass; Chrome pass as Ann (joined the demo table). `scripts/shot-setup.mjs` screenshots the screens. `setup`: in a narrow window (one column) "New campaign" scrolls the form into view with its name ready to type, and the panel glows; the same wide |
| Background decal | Done | `decal`: FG's Background Decal. The GM's Settings (sidebar cog) opens a decal picker (pictures, search, Use Empty Decal, OK/Cancel); every seat sees the decal on the empty desktop, and it is saved with the campaign. Better than FG: Browse picks a picture from anywhere (or drop one on the picker), copied once into Kraken's assets folder (`<app data>/assets/decals`, the Assets folder button opens it) and offered to every campaign. Six decals of Kraken's own, made in Kraken Art (Qwen-Image 2.1, transparent), in `public/decals`. FG's vault decal packs are encrypted by SmiteWorks; Kraken skips them rather than decrypt them. Players see the decal but cannot choose one or list them. `kraken_decal` (view, list, set, import), `kraken_windows` opens Settings and the picker. `agent-ui` drives the picker in the app; Chrome pass as Ann (sees the Dragon Seal, no Settings) |
| Desktop wallpaper and game sets | Done | `decal`: FG's desktop theme as a Desktop Wallpaper setting (tiles behind the desktop, every seat, saved with the campaign; Browse or drop to add your own, kept in `<app data>/assets/wallpapers`). Kraken's own art for nine games, made in Kraken Art: a seamless grid wallpaper each (`public/wallpapers`, made tileable by blending each edge from a half-rolled copy, broad lighting flattened) and two decals each (`public/decals/<game>/`): D&D 5e, D&D 3.5e, AD&D 2e, AD&D, D&D, Castles & Crusades, Pathfinder 1e and 2e, Traveller 2e. Original art in each game's spirit, no publisher's logos or cover art. The pickers have a chip per set, the campaign's game first ("this campaign"). `kraken_decal` takes kind wallpaper |
| Dice: a real throw | Done | A die leaves the hand as fast as it moved (no more 14 units/s cap: up to 56, a hard flick), falls under gravity that suits its size (−58, not −24, which felt like water), bounces off the felt (0.4), throws back off the rails (0.68) and clacks off other dice (0.5), spins harder the harder it is thrown, with almost no air drag; it still settles after 2.5 s. `dice`: hard flicks and gentle tosses rest flat inside the table on the host's number, within 6 s |
| Dice: no phantom bounces | Done | Dice were escaping the table: a hand's worth of dice started in a grid, and near an edge (where the tray is) the outer dice started inside a rail and were blasted out, or a fast die slipped through a thin rail. Now the whole group starts inside, spaced apart; rails are thick, tall and overlap at the corners; four physics steps a frame; spin follows the throw (end over end, capped), so corners stop flicking dice sideways; a die left on another slides off away from it and toward open table; the d4 and d8 collide at their drawn size; playback is smoothed between frames. `dice` now throws hard flicks too: 0 failures in 1260 throws (9 in 25 runs before) |
| Settings for everyone | Done | Dice moved from the chat's gear into Settings; players have a Settings button too (Dice); the GM's also has Background Decal, Desktop Wallpaper and the tower option |
| GM icon | Done | The GM's Kraken GM Icon extension, built in: Settings > GM Icon picks the GM's chat picture (its ten icons in `public/gm-icons`, or Browse/drop for the GM's own, kept in `<app data>/assets/gm-icons`; Name Only for none). Every seat sees it beside everything the GM says, rolls included (the host marks the GM's lines); like the extension, the choice follows the GM into every new campaign (`preferences.json`). `kraken_decal` kind gmicon. `decal` tests it. (Replace GM Icon's images are Justin Freitas's, not copied) |
| Chat commands and icons | Done | `src/ui/chatCommands.ts`: FG's slash commands (so FG players know them) with Foundry's names too, a list as you type `/` (Tab finishes it), `/help` for all of them, marked everyone or GM only (GM-only ones are not offered to players, and the host refuses them). Dice: /roll /r /die, /gmroll /gr, /blindroll /br /tower, /selfroll /sr, /publicroll, /random, /mod. Dice forms: 4d6d1, 4d6k3, kh/kl/dh/dl, 3d6! or x (explode), 4d6r1 (reroll), 6d10cs>=7 (successes), 4dF (Fate), d%. Talk: /emote /me, /action, /ooc, /ic, /mood, /w /whisper (to players or GM; the GM sees every whisper, as FG), /reply, /vote (Yes/No in chat, counted). GM: /story, /id (speak as an NPC), /gmid, /kick, /save, /option towerreveal. This screen: /clear (stays cleared: the host remembers when each seat cleared, also after a restart; a player's clear and the GM's are their own; the record keeps the lines), /dice, /settings, /openwindow, /closewindow, /diceeffect, /dicevolume, /scaledice, /scaleroll, /scaleui (/resizeui), /info, /reload. Each chat line has an icon for what it is (attack, damage, heal, save, resist, check, initiative, spell, effect, turn, level up, tower, music, sound effect, whisper, emote, OOC, story, vote, roll). `chat` tests the host (whispers, roll modes, kick, vote, save, dice forms, agent tools); `agent-ui` the list and commands in the app; Chrome pass as Ann: story, NPC speech, a whisper, attack/damage/save icons, a vote, and a player's list without GM commands |
| Chat: stretching | Done | The chat (in the main window) stretches from a grip at its top-right corner, up and right, and keeps its size; a double-click on the grip puts it back. `agent-ui` drags it |
| Sound | Done | Syrinscape's job, in Kraken, from the GM's own sounds. `electron/sounds.cjs`: the library (`<app data>/assets/sounds/<oneshots|sfx|ambience|music>/<folder>`; a folder plays one of its sounds at random). The host plays one-shots and effects for the table, keeps the soundscape (ambience loops together, music by track or folder, saved; a seat that joins later hears it), serves files with ranges, and attaches a chat line's triggered sound to the line (`electron/soundTriggers.cjs`: by what it is (attack, spell attack, save, cast, heal, damage, roll, words) and how it went (hit, miss, crit on a natural 20, fumble on a natural 1, success, failure), first that fits and has sounds; crit falls back to hit, fumble to miss), so only the seats that see the line hear it, when its dice land. Each seat: Web Audio, a bus per kind under a master, seamless loops, its own volumes (`src/sound/soundEngine.ts`). The Sound window (sidebar music note): One-shots, Sound effects, Ambience, Music, Chat triggers, Volume (players: Volume). `/play`, `/volume`, `/sound`. `kraken_sound`. Kraken's own set: 500 sounds in 290 folders (`electron/soundCatalog.cjs`: 17 weapons x hit/miss/crit/fumble, shields, 12 spell elements x cast/hit/miss/crit/fumble, injury/death/heal/bandage/potion/resurrect, 11 animals and 16 monsters x attack/hurt/death, 30 one-shots, 32 ambience loops, 8 music pieces) with 167 triggers pointing at them; `npm run sounds` makes them with the GM's ElevenLabs key. `sound` tests the host; Chrome pass as Ann: a loop and music playing in her browser, the GM's door one-shot and a Longsword attack's sword hit fetched and played |
| Sound: as Syrinscape in FG | Done | Learned from Kraken's C&C Syrinscape extension in FG (its catalogue and engine, and its answers for a real FG fight through the bridge: Halvar's war hammer and Malachi's short sword and thrown dagger). Like it: an attack plays the weapon's swing (Syrinscape's "miss" sound), the damage roll the hit, a natural 20 the crit, a natural 1 the fumble, [KRAKEN CRITICAL]/[KRAKEN FUMBLE] too; spells by element on cast and damage; saves, healing, initiative; wounds from FG's [STATUS: ...] and Kraken's own wound lines; the GM's hidden rolls silent, combat only (default) or all; the same sound again only after a pause (1 s). Triggers match what the attacker uses, never who is attacked. Syrinscape's kinds: one-shots are voices (71 lines for 12 characters, spoken by ElevenLabs voices that fit), sound effects, ambience (moods), music. Every trigger has a ▶ that previews on the GM's screen. `sound`: FG's 13 lines give what the extension played, and a battle in Kraken's tracker (initiative, swing, hit, wound, crit, an orc's axe and its fumble). Tests run with sound muted |
| Sound: Kraken's own set, shipped | Done | Kraken's sounds ship with the app (`sounds/`, beside the GM's own in app data; the GM's file wins on the same path): ElevenLabs sounds may be handed out, Syrinscape's may not. Sound effects, ambience and voices are made with ElevenLabs (`npm run sounds`; the key is in `.env.local` from `npx @elevenlabs/cli onboard init`, never in code, through `@elevenlabs/elevenlabs-js`). Music is made locally with YuE2 Studio (YuE, Apache-2.0), never ElevenLabs; Woosh (CC-BY-NC) is not used for shipped sounds. A campaign saved with older triggers gets the new defaults (`TRIGGERS_VERSION`). `sound` tests both |
| Wording: no other VTT's name | Done | Kraken still opens prepared map bundles (scenes, walls, lights, tokens) but the screens and tools call them "prepared map bundles", never by another VTT's name |
| Books, as FG's | Done | The Books button in the sidebar (GM and players). The books are the GM's own FG modules on this computer, read in place (`electron/books.cjs`; the list cached by file, so 13 GB is read once, in about 5 s): only those for the campaign's ruleset (C&C: SiegeCore and CnCRPG, and Any). Activation, as FG's: the GM ticks which are active in the campaign; a book's Players tick opens it to the players (a Player's Handbook starts open, the GM's books start closed); an adventure is never the players' (no Players tick; the host refuses it). The book window: chapters and sections on the left (FG's teal bands), pages with their pictures, formatted text (FG's frames, tables, lists; nothing else gets through), links to pages here or in another book and to pictures, next and previous, search; Images & Maps. The Pictures window: a tab for each picture; the GM shows one to the players with the share symbol, and it opens as a tab on their screens (FG's shared images); the GM takes it back the same way. Saved with the campaign. "Open an adventure" left the table: map bundles open from the Books window (or a drop on the table). `kraken_books` (list, activate, contents, page, share, show, hide). `books` tests the host with a made-up module; `books-ui` the real app and a player in Chrome; `scripts/shot-books.mjs` pictures a real book |
| Party: watch order and formation | Done | FG's party sheet Order tab: three watches and a 7 by 7 formation (FG's PartyFormationManager: facing, a swap on a taken slot, 1/2/3 abreast fills from the front then around the middle, turning left and right, clear). Everyone drags their own characters' tokens into a watch or a slot (the host refuses another player's); the GM moves anyone and fills, turns and clears. The marching order follows the formation, front to back. `kraken_party_order`; `party` tests the host; `order-ui` a player in Chrome |
| Sound: stop buttons, music that loops | Done | A play button is a stop button while its sound plays (here, or for the table: the GM stops one sound, not all). A music track loops; a music folder plays its tracks one after another, never the same twice running (a folder of one loops it: before, it played once and went quiet) |
| Pictures: right-click | Done | On a picture or map in a book page, in Images & Maps, on a Pictures tab and in a picture's own window: open in Pictures, out on its own (a window of its own, so a map stays up while the book is read; it can pop out to another monitor too), back in, share and stop sharing (the GM), close (a player's close hides it on their screen until the GM shows it again). `books-ui` |
| Map toolbar | Done | FG's image toolbar, icons along the top of the map: zoom, fit, find my token (centres and zooms right in on the player's own token, with a flash; says so when it is not on this map), what a drag does (move the map, ping in your colour, draw, rub out), line colours; the GM's clear drawings, scene, light, line of sight and lock. Drawings are for everyone and saved with the scene; a player rubs out only their own lines, the GM anyone's. `kraken_draw`; `map` tests the host; `maptools-ui` a player in Chrome |
| Play stays fast with books | Done | Making a book active copies in only what the rules use (classes and races, powers, the game's settings, items, creatures), never its pages, pictures, tables or encounters (the Books window reads those from the module): a C&C campaign with six books went from 10,732 records (32 MB, 6.7 MB to every player who joined) to 4,547 (13 MB); campaigns made before shed the rest on opening. Only the wanted sections of a module's XML are parsed (Mystara 10.8 s to 0.35 s). A campaign's active books load after the table is open, a book at a time, so Play does not wait (it had taken 20 to 30 s the first time) |
| Drag and drop: characters | Done | A character dragged from Characters goes onto the combat tracker (with a token on the map, as Add), onto the map as a token, or onto a quick slot. `order-ui` drags one onto the tracker |
| Character wizard: Next at the top | Done | Back and Next beside Cancel at the top, so a long list never hides them |
| Sounds in the story, as FG's | Done | A book's own sound links (Syrinscape's in FG: a mood, music or an effect) play Kraken's sound of that kind and name for the table (B1's "Tavern ambience" plays the Tavern loop), or the sound the GM drops on them from the Sound window; a sound dropped between paragraphs sits there in the story, a play/stop button. Kept with the campaign, the GM's alone. `kraken_books` sound / sounds; `books-ui` tests it |
| Character sheet, as FG's SC C&C sheet | Done | `src/characters/CCSheet.tsx` (a ruleset has its own sheet; this is C&C's): a big portrait and token, name, race and class always on top; tabs down the right side. Main: player, level with a small level-up button (only when the XP is there; the GM may level early), XP; the attributes with score, bonus (rolls a check), prime and C&C's save categories (roll the save); AC, -Dex, touch, SR; HP, wounds, temp, nonlethal; special defenses; initiative, melee, ranged; move, special movement, senses. Combat: initiative and move, the AC breakdown, SR, bonus to hit by kind (total, ability, misc), weapons. Abilities: race and class abilities, each rolling its check. Inventory: count, location, EV, carried/worn/left, drop; total encumbrance, rating, load band and move; coin. Spells. Notes: identity, appearance, languages, notes. Fields are typed in place (owner or GM) and the host works every number out again (`character-edit`, `kraken_character_edit`). The engine now works out the load as SiegeLoad (EV, rating, band, move and Dexterity effects; a heavy load takes the Dexterity bonus off AC): Halvar in FG and Kraken agree, and all 132 Common Room pregens match FG's sheets with their load. `character` types on the sheet in the real app |
| A neutral front screen | Done | Home: the emblem and two equal cards, My Campaigns (run a game: create or load a campaign, host it) and Join a Game (sit at someone's table), each leading to its own screen with a Home button back. Games joined are kept (name, address, port, password) on the Join card and the join screen, rejoined with one click (Edit fills the form, × forgets one); only a join that worked is kept. A player in a browser goes straight to joining. `e2e` rejoins from the home screen |
| Everything is a link | Done | One link for everything that can be clicked or dragged (a book at a page, a picture or map, a character, a sound, a note): every drop place (quick slots, notes, a book's story for sounds) takes any link, and a link opens or plays with a click from wherever it is, and drags on from there. New things get a link as a matter of course |
| Notes, as FG's Player Notes | Done | The Notes button (players and the GM): a list with search, All or Mine, and + for a new note; a note's window has its title, owner, text, and links (drop anything in; click to open; drag on). A note is its writer's (and the GM's, who sees every note) until its writer shares it with the table (the share symbol), and is a link itself. `notes-ui`: a player in Chrome writes, links, slots and shares a note; another player reads it; the GM follows its link |
| Quick slots | Done | FG's hotkey bar: ten slots along the bottom, above the windows. Drag on a book (from Books), a page (from a book's chapters: it opens at that page), a picture or map (from a page, Images & Maps or a Pictures tab) or a character (from Characters); a click opens it, right-click empties it. Each seat's own, kept by the host with the campaign. `kraken_quickslots`; `books` and `books-ui` test it |
| A campaign's ruleset, changeable | Done | The campaign screen's ruleset is a menu (`kraken_campaign_ruleset` for the agent; not while hosted), as it decides the books. Worldbuilding (no rules) lists only the modules for any game (maps, tokens), never another game's books |
| Dice: throws from a popped-out chat | Done | A die thrown from the chat popped out into its own window (another monitor) carries the hand's speed onto the table, as from the docked tray (the tray measures on the screen); before, it fell to a gentle toss. Harder flicks go harder (up to 8 window widths a second, 90 world units). `__krakenDice` tells tests how a throw went; `scripts/probe-throw.mjs` flicks in the real app, docked and popped out |
| Sound window: each sound on its own | Done | Folders as a tree (Weapons > Sword > Hit > #1, #2), each sound with its own play button (on this screen) and Table; a trigger's sound count opens its sounds the same way. Stop what I hear |
| Character wizard, as FG's SC C&C wizard | Done | `src/characters/Wizard.tsx`: a parchment utility window with eight tabs and their badges (an alert while a page needs something, a check when done; Spells only for casters), each page's art faint behind it, and Instructions (the page's words and steps) that open or close on every page at once. Abilities: three methods, Roll All, a score dragged (or clicked) onto another to swap, Race row, totals with modifiers. Race and Class: a list of every active book's races or classes with Source and Name filters, + to choose and the name to read it; once chosen, a portrait, the numbers and trait or ability cards, with Change Race and Change Class. Race classes only for their race. Level up and down 1 to 20 on the class. Primes: humans two extra, others one; a third is refused with a message. Hit points: the plan per level, one roll each. Equipment: coin, Purse/Spent/Left, a shop in seven categories limited to what the class may use and can afford, Return. Spells: per-day counts, search, level filter, trimmed (with a note) when the level drops. Finish: warnings, details with an alignment menu by class rules (a paladin: lawful good), Create always open (what is left goes in the notes), summary. Changing an earlier choice clears what rested on it (FG's cascade). `wizard` creates a Dwarf Fighter, an Elf Wizard (level 3 then 2) and an unfinished Paladin; each equals the builder, which `pregens` matches with live FG builds. Combine Classes and Castle Keeper options come with multi-class (row 2 above) |
| Characters in and out | Done | `shared/siege/interchange.mjs`. Import (the Characters window's import button, a file dropped on the list, `kraken_character_import`; a player's import is theirs): a Kraken export comes back as it was; an FG character XML from FG's SC C&C sheet comes over whole (all 132 FG-built pregens read and round-trip); another ruleset's FG character (5E, 3.5E...), a Foundry VTT actor's Export Data (dnd5e and other systems with ability scores) and a Roll20 character JSON become C&C characters with the campaign's books: race and class (other games' names too: Hill Dwarf, Thief, Magic-User), level, scores, hit points and spells through the builder, gear matched to the books' items (Longsword is Sword, Long; chain mail a mail hauberk) and worn as it was, coin, languages, alignment, XP, biography; what did not match, and the primes still to choose, go in the notes. Export (the export button, `kraken_character_export`): Kraken's file (.kraken.json, the whole sheet) or FG's character XML. `interchange` and `wizard` test them |
| Critical hits, ammunition, spell resistance | Done | `shared/siege/krits.mjs`, `electron/combat.cjs`. As the GM's Kraken Krits & Fumbles (built into SiegeCore): a natural 20 on an attack rolls the critical table and a natural 1 the fumble table of the Castle Keeper's Guide option the CK picks (Option 5 tables 17.1A/B, the default; Option 6 17.1C/D; Option 1; Option 4 roadhouse). Results are applied on the tracker: effects (prone, blinded, AC and initiative penalties, lost rounds), real damage rolls, ongoing bleeding (DMGO, now rolled at the start of a creature's turn), marks on the attacker's next damage roll (maximum, maximum x2 to x4, an extra die, doubled dice and bonus, minimum); instant death is the GM's call unless set to apply; what the tracker cannot keep is told to the GM. Settings > Critical Hits & Fumbles (FG's seven options; `kraken_combat` krits and krit-test). Ranged attacks fire ammunition of the weapon's type (readied first), say how many are left and refuse with none (SIEGE_AMMO_TRACK). A spell with spell resistance on rolls a plain d20 against each target's SR (a character's worn items count); under it, the spell does nothing to that target. `krits` tests each |
| Combining classes (rules and level up) | Done | `shared/siege/combine.mjs` and `classcombo.mjs` (the Adventurer's Backpack's tables as the GM's FG wizard ships them), `builder.mjs`, `engine.mjs`. Multi-class (`spec.multiclass`: both classes at the level, the Multi-Class Hit Die, XP added), enhanced class (`spec.support`: 51 supporting options and sub-classes at half the principal's level, a fighter two thirds, the Enhanced Class Hit Die, its XP added, a sub-class keeping only the abilities it names, a casting option's own spell table), class plus (`spec.plus`: zero-level abilities, two 0-level spells for casters, 5% of experience each), second spell lists with spell pools. Level up: a multi-class rises together, a supporting class follows; dual class (`kraken_class_change` dual: the table and a held prime; experience split; only the original class gains hit points, on the combined die) and reclass (a level lost, two leaving a deity's service, and their hit points; primes swap; fixed hit points until the new class passes the old). Follows FG's code where it and the book differ (a supporting class's checks add the full character level; a Scout ticks Ranger's Strength; the Backpack's empty table cells are the CK's call; Enhanced die read [supporting][principal]). `combine` |
| Combining classes in the wizard and on the sheet | Done | The wizard's Class page has FG's Combine Classes (Adventurer's Backpack): cards for the chosen multi-class, supporting class and plussed classes (each with Remove), Add Class (multi-class), Add Supporting Class (enhanced) and Add Class Plus with pick lists showing each class's table code and rule (refused ones with no +), forced primes from each class, the combined hit die in the HP plan, the starting XP, alignment by both classes, the shop for either class, and a second spell list. The sheet's Class & Level (cog by Level): each class with its level, what it is and Level Up; Change Class: Add Class (dual) when the table and a held prime allow it, and Reclass. `wizard` makes a Fighter/Wizard with a Rogue plus, levels it there, and dual-classes a dwarf fighter into Barbarian |
| Map editing, phase 1: walls, doors, windows, grid | Done | `electron/mapState.cjs`, `shared/map/geometry.mjs`, `src/table/MapEditor.tsx`. Walls are the table's own per scene (seeded from an imported scene the first time), saved with the campaign and never sent to players. FG's line-of-sight kinds with Foundry's senses: wall, terrain, door, secret door, toggleable wall (the GM switches it), window (sees through, blocks movement; players open it), illusionary, invisible, ethereal, shadow caster (light only: lights now read each wall's light sense); one-way walls; toggled-off walls block nothing; Close all doors; split; Clear; undo (50 back). The GM's Edit map button opens FG's panel on the right: Line Of Sight (select, line chains, rectangle, closed shape; the ten kinds with FG's tooltips; grid and point snap; Advanced senses and threshold; turn on or off, direction, delete), Lighting (place with a preset, select a light and change its radii, colour, on, hidden), Grid (show, square, hex rows, hex columns or none, cell size, tint, opacity, line style, distance and suffix, adjust position, reset); keys Esc, Enter, Delete, Ctrl+Z. Hex grids are drawn and snap and measure in hexes. `kraken_wall`, `kraken_map_undo`, `kraken_scene_settings` grid. `walls`, `mapedit-ui` (with a test player in Chrome: hex grid, no walls received) |
| Map editing, phase 2: masking | Done | FG's Mask tab: Add and Remove Global Mask; reveal or hide again with a rectangle, a closed shape or whole squares (later shapes win); clear; undo. Players see black but where revealed (an SVG mask over the map; the GM sees a tint), and the host sends them no tokens or doors under the mask (their own tokens always show). `kraken_mask` (points, rect or cells). `walls`, `mapedit-ui` (the test player sees only the revealed rectangle) |
| Map editing, phase 3: text, numbering, pins, layer groups | Done | FG's Text tab: place text or drop the group's next number (1, 2, 3; never reused after a delete, as FG; renumber; a prefix gives A1, A2), select and Delete; FG's properties (font, tint, size in squares, outline width and colour, shadow offset, blur and colour) and pins (pin, trap, door, chest) linked to a record. Layer groups (FG's folders) with Shown, Players and Lock: a group players may not see is withheld whole, a locked group refuses edits. Players never get hidden text, text under the mask, or a link to a record they may not open. `kraken_label`, `kraken_map_group`; undo covers text and groups. `walls`, `mapedit-ui` |
| Map editing, phase 4: paint and FX layers | Done | FG's Paint tab: freehand, line, rectangle, ellipse and closed shapes, with tint, width, opacity and Foundry's fill (colour and opacity), in a layer group (a GM-only group's paint never reaches players); players still draw plain lines with the play bar's pen. FG's FX tab: several FX layers at once (rain, storm, snow, blizzard, fog, clouds, sandstorm, embers, ash, leaves, water), each with FG's Amount, Intensity, Speed and Direction, a mask it fills or leaves clear (a CSS clip of the three.js layer), shown or not, players or GM only, in a group. `kraken_draw` (shape, fill, alpha, group), `kraken_fx`. `walls`, `mapedit-ui`. Still to come: image layers (tiles) and drag-to-reorder layers, light angle and animation, terrain and pit shapes (see into, not out), FG and Foundry map imports into these layers |
| FG adventure modules: maps and the Library | Done | `electron/importers/fgMaps.cjs`, `electron/library.cjs`, `src/books/Library.tsx`. An FG module's maps open on the table (the Library's Maps to the table, `kraken_open_fg_module`): each FG image a scene with its picture, FG's walls (doors from toggleable occluders, see-through and one-way walls), lights (FG range in squares), grid and offset, FX layers (rain, clouds, water in its mask) and FG's shortcuts as pins in GM-only groups (Map keys, Encounters). FG's XML reader now keeps repeated elements (an image's layers were collapsing into one). B2's NPCs, written in the official ruleset's fields, become SiegeCore's (AC, hit dice, hit points, BtH = HD, primes from saves, attacks parsed from text). The Library (GM sidebar): Encounters (FG's battles onto the tracker, tokens hidden where FG placed them on the open map), NPCs (to the tracker), Parcels (to the party's parcel), Tables (rolled on the host). Line of sight is now fast on big maps (a light reaches only its radius; rays walk a grid of cells): B2's Caves of Chaos, 4,916 walls and 162 lights, from a freeze to 20 ms a token. `library` |
| Lights: beams and animation; area targets | Done | FG's light Angle and Rotation (a lantern's bullseye beam lights only its cone: the ray cast runs over the cone's arc) and Animation (flicker, torch, pulse, flash) with Speed, in the map editor's Lights tab and `kraken_light`. Area targets (BUGLIST 11): the play bar's Area target tool and `kraken_combat` target-area. `walls`, `library` |
| Map editing, phase 5: image layers; FG and Foundry maps into layers | Done (alpha.21) | FG's image layers (Foundry's tiles): the map editor's Images tab and `kraken_tile`. Pictures come from a tile library (`<app data>/assets/tiles`, named by content so a picture is kept once; Browse, a picture file dropped on the map, or an agent's file), are placed, dragged (snapped to half squares; Shift free), resized from a corner, turned, flipped, faded, ordered (top, up, down, bottom), locked, hidden from players and put in layer groups; below the tokens (FG) or above them (Foundry's overhead tiles: roofs fade on a seat's screen while one of its tokens is under). Players are sent none hidden, in a group they don't see, or wholly under the mask; pictures only to a seat's asset token. Imports: an FG module's other image layers (The Village of Hommlet's fall and winter, hidden until the GM shows one), its text layers as labels (Hommlet's 33 numbers where FG had them) and its folders as layer groups (numbering carries on); a Foundry bundle's tiles (v9 img/overhead, v10+ texture/flip/occlusion) into the tile library and onto the scene the first time it opens. `tiles` (Hommlet live when the module is here), `mapedit-ui` (the Images tab in the real app, the pictures loading for a test player in Chrome) |
| Map editing: from a bare picture | Done (alpha.25) | Open map (and a picture dropped or opened by `kraken_open_adventure`) takes a bare picture (.png, .jpg, .webp, .gif): one scene the size of the picture with a 100 px square grid and nothing on it, its id from the picture's bytes, so the same picture opened again keeps everything made for it. `kraken_scene_settings` grid now takes all of the Grid tab (type, size, offsets, distance, units, style, thickness). PLAN 4a's "done when" met: `picture-map-ui` has the agent fit the grid, wall a room with a door, light it, label it, put an image layer and a test player's character on it and darken it; the player in Chrome is stopped by the closed door, walks in when it opens, never gets the walls, and the picture reopens with all of it |
| Sound: creatures and scenes | Done (alpha.24) | A creature's natural attack (bite, claws, sting, slam...) plays its own Attack sound from Kraken's Monsters and Animals folders, found from its name ("Orc 2" an orc, "Dire Wolf" a wolf, "Giant Spider" a spider; a character never), and a creature's weapon attack falls back to it when no weapon sound fits; a creature killed ("-> Orc 2: 9 (Dead)") cries out. A scene's own sound (Syrinscape's moods per map): the Sound window's Keep for this scene (ambience and music tabs) or `kraken_sound` scene keep, started whenever the scene is opened; Forget; saved with the campaign; the GM's alone. Music folders are the playlists (a track at a time, never the same twice running). `sound`, `sound-ui` |
| Sound: to come | Later | A second variant of each sound and the remaining ambience (ElevenLabs credits, Starter plan) |
| 6 | Done (alpha.20) | In-app DM assistant: the GM's sidebar Assistant window, Claude (claude-opus-5-5) driving the same kraken_* tools as the MCP bridge (not kraken_ui_eval), each tool shown as it runs; key from the window (encrypted with safeStorage) or ANTHROPIC_API_KEY; instructions are the skill document skills/kraken-dm-assistant/SKILL.md (lookups, rolls and re-rolls, secret rolls, combat, random encounters, party, maps, rules of the road); `assistant` tests the loop with a stand-in model |

### Where we are and what's next (2026-11-03, 0.1.0-alpha.2)

Steps 0 to 5 are done for single-class C&C, and the table grew a good deal past the first plan along the way, from the GM's own requests: books as FG's library (by ruleset, made active, players' books apart from the GM's), sound as Syrinscape's (shipped sounds, links in the story), everything a link (quick slots, notes, stories take any link; anything clickable drags), FG-faithful windows (the sheet with tabs hanging off its edge, the parchment wizard, the map toolbar), a neutral front screen, characters in and out of other tables. The rows above say where each one stands. What is left, in order:

| # | Work | Done when |
|---|---|---|
| 1 | **Finish characters (step 2), done in alpha.5 to alpha.7 (`combine-fg`: six combined characters equal FG's live builds; FG's buildFromSpec took multiclass, support and plus for it):** multi-class, enhanced class and class plus; dual class and reclass; the wizard's Combine Classes and Castle Keeper options; level up for them | The pregens and wizard checks cover a multi-class character built and levelled in Kraken and in FG with the same sheet |
| 2 | ~~Finish combat (step 4)~~ Done in alpha.3 and alpha.4: critical hits and fumbles, ammunition, spell resistance, NPC spellcasting | `krits`, `attack`, `spells` |
| 3 | **The A to Z run:** B2 on the table, the party made in the wizard by players in Chrome, a fight on the map, treasure and XP through the party sheet | A scripted session plus a manual pass as a player, each issue found fixed |
| 4 | **In-app DM assistant (step 6):** a chat panel for the GM driving the same MCP tools | It can build a character, start combat, run a turn and share a map from a request |
| 4a | **Map editing (the GM's request, 2026-11-03), done in alpha.25 (`picture-map-ui`); phase 1 (walls, doors, windows, grid, lights panel) done in alpha.8, masks in alpha.9, text, numbering and layer groups in alpha.10, paint and FX layers in alpha.11; image layers and FG/Foundry layer imports in alpha.21 (FG's paint layers hold no strokes in module data, so there is nothing to bring over):** walls, doors, windows, lights; masking (show and hide); grid type, colour and opacity; painting; numbering and text; layers that can be shown and hidden and grouped into folders with shared settings; FX layers (rain and the like, as FG's image layers). Learned from FG's image editor and Foundry's scene tools (Foundry's often better), then built FG-faithful with Foundry's strengths, every tool with its MCP tool and test | A GM builds a map from a bare picture to a playable scene in Kraken alone, and an agent can do the same |
| 5 | **Later:** NPC and damage dice sets; multi-select, facing and flickering lights on the map; a second sound variant and scene ambience; a second ruleset (and its own sheet layout) to prove the core is neutral | Each as its own row above when started |

Standing ways of working: every action ships with its MCP tool and a test (`npm run coverage`); FG is the model for look and behaviour; the player view is checked from Chrome; each pushed build gets a version bump and a tag; the newest build is left open.

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
