# Handoff: the 2026-11-14/15 sessions

For the next session. Read this, then [todo.md](todo.md) (the full list of
what is left), [CLAUDE.md](CLAUDE.md), [AGENT.md](AGENT.md) and
[PLAN.md](PLAN.md). The comparison with Fantasy Grounds and Foundry is
[docs/feature-parity.md](docs/feature-parity.md); the one-interface plan is
[docs/core-ui-design.md](docs/core-ui-design.md) (section 7 records every
stage); targeting/effects is [docs/targeting-actions-design.md](docs/targeting-actions-design.md).

## Where things stand

- `main` is on GitHub at `86e5d99` (bookkeeping and rest merged). Locally two
  more commits: `todo.md`, then this file and `scripts/full-test.sh`. **Not
  pushed.** Push after the GM agrees.
- Last release: **0.1.0-alpha.90**. Everything below is unreleased (CHANGELOG.md
  "Unreleased"). Next release is alpha.91, after the full suite passes.
- Tests on main as it stands: build, coverage and the 61 checks that open no
  windows pass (`check-tiles` needs `tsx`, not a regression). The **full GUI
  suite has not run since the last two merges** (core UI stage 5, and
  bookkeeping/rest). Each passed it on its own branch. Before those, main passed
  the full suite 80/80 with all 16 games.

## What was built in these sessions (all merged)

- **Open games' art:** SRD 5.2.1's 330 portraits and tokens repainted with MiniMax
  H3 (the GM's pick); 8 covers and Cairn's centaur in H3. The other games'
  H3 repaints wait for the GM's pick in `release/h3-review/` (gitignored; one
  folder per game, current picture left, H3 right, `index.json` per folder). The
  full-size H3 paintings are in a staging folder outside the repo
  (`kraken-h3-staging` on the F: drive); `kraken-h3-compare` beside it holds the
  review tooling's decisions.
- **Map Studio art:** 59 new pieces in `studio/packs/Kraken Map Art.mod` (sci-fi
  decks, bulkheads, hatches, consoles, cryo pods...; canal city; barrows and
  longhouse; coffins, pits, trapdoor). Gaps and art that reads wrong are in
  `skills/kraken-map-studio/missing-assets.md`.
- **15 candidate adventure maps** built in Map Studio from the scenario text
  (`games/*/maps/*-studio.*`, scripts `scripts/studio-map-*.mjs`), not in the
  books until the GM reviews them. The Cinder Barrow candidate predates them.
- **Core UI stages 1-5:** one sheet frame, manifests (`shared/<id>/manifest.mjs`)
  and a registry, core parts and wizard frames; Character Selection works like
  FG's (the sidebar always opens it; New, Import, Export live there); the
  tracker reads the manifests. On the core: Cairn, Basic Fantasy, D&D 5E and
  Descending Darkness, 3.5E, 2E, Traveller, Apeira Astra, Ironsworn/Starforged,
  Fate Core/FAE, Forged in the Dark. `src/` has no `ruleset === ...` checks left.
- **Targeting, actions, effects:** map targeting toolbar, Ctrl+click on tokens
  and tracker rows, spell templates sized from spell data, damage cards,
  condition visuals on tokens, the Effects window with drag-and-drop, light
  sources that move with the token and burn out, spell text read into actions,
  3.5E/2E casting, sheet dice dragged onto creatures.
- **Maps:** shared ruler with waypoints and diagonal rule, FG's name/health
  visibility options, explored fog kept on the host, extra senses, move undo,
  GM approval of locked moves, elevation, Map Studio regions at the table,
  animated maps, placed sounds, speed-coloured drag.
- **Records:** editing any record, story records and a rich text editor, FG-style
  random tables, sharing with chosen players, item identification, encounter
  builder, treasure parcels, quests.
- **Session:** reconnect, invite links with UPnP/NAT-PMP, pause, player menus
  (bell, AFK, kick, ban, view as), campaign rename/duplicate/export/delete with
  rolling backups and logs, pull players to the GM's view.
- **Dice and chat:** a modifier box every roll reads, ADV/DIS/+2/-2 and each
  game's keys, links and portraits in chat, party rolls that ask the players,
  group initiative, inline rolls, tracker options and Delay, roll modes, chat
  export and a session log.
- **Bookkeeping and rest:** ammunition, consumables, rations and water, light
  supplies, encumbrance and containers per game, each with a GM switch
  (Settings > Bookkeeping); short and long rests per game.
- Earlier in the same run: alpha.88-90 (six open games, the turn chime, code mode
  `kraken_code`, Settings redesign and the form pass, Map Studio agent tools and
  the `kraken-map-studio` skill).

## Decisions waiting on the GM

1. **Worldbuilding characters** (blocks moving Worldbuilding onto the core). A
   Worldbuilding character is quietly a C&C record today. Proposals: a new one is
   a system-free sheet with GM-defined fields; a generic host takes its edits;
   existing characters move over (name, portrait, notes, inventory; C&C stats
   become custom fields).
2. Which H3 portraits to use for Basic Fantasy, Cairn, Fate, Forged, Ironsworn
   and Starforged (`release/h3-review/`).
3. Which of the 15 candidate maps go into the books.
4. 5E long rest: half the Hit Point Dice back (2014, used now) or all (SRD 5.2.1).
5. Pushing `todo.md`, this file and `scripts/full-test.sh`, then releasing alpha.91.

## How to test

- `bash scripts/full-test.sh` runs everything (about 2 hours; logs in
  `$TEMP/full-test/`). It opens the GM's app and test players' Chrome on the left
  monitor and **takes focus**: only run it when the GM isn't using the computer.
- `bash scripts/full-test.sh --window-less` runs the build, coverage and every
  check that opens no window. Safe while the GM games.
- Known flakes (rerun the one game once): "no agent.json" at launch, "Target
  crashed", a slow host start. The 3.5E skill-points flake is fixed.
- Give long runs a long timeout: the 16-game e2e takes about an hour (an early
  25-minute timeout once looked like a Kraken crash).

## The GM's standing rules (also in memory)

- The repo is public (PolyForm Shield): no keys, personal paths, licensed content
  or the GM's packs. No attribution lines in commits. Pull before committing.
- Releases: `node scripts/bump-version.mjs`, commit, tag, push; `npm run exe`; then
  the Linux build in WSL Debian; `gh release create --prerelease` with the
  exe, blockmap, latest.yml, AppImage, deb and latest-linux.yml. The GM installs
  through the start screen's updater.
- Test windows at `KRAKEN_WINDOW_AT=-2500,40` (left monitor); close them after.
  Visual checks at full screen 2560x1440. Test players are called "a test player".
- Ask before using the GPU; say at once when GPU work ends. Long art runs at night.
- Every UI action ships with its MCP tool and a test (`npm run coverage`).
- One core UI that every game slides into, like FG's CoreRPG and Foundry; never a
  per-game sheet design.
- Don't wait for the GM to find missing VTT features: check FG and Foundry ("Can
  Kraken do this?") and build the best of both. Keep docs/feature-parity.md current.
- Code with backslashes goes through Write/Edit, never bash heredocs or `node -e`.

## Loose ends

- 25 merged agent branches (`worktree-agent-*`) and their worktrees under
  `.claude/worktrees/` can be deleted.
- Foundry still has the dnd5e system installed (put there to study it).
- Screenshots and logs from these sessions sit in the old session's temp
  scratchpad and `%TEMP%\kraken-*` folders; they may be cleared. Nothing in them
  is needed.
