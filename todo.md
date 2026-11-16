# To do

What is left after the 2026-11-15 push (targeting and effects, records,
session, maps, dice/chat/combat, bookkeeping and rest, core UI stages 1-5).
The full FG/Foundry comparison is in [docs/feature-parity.md](docs/feature-parity.md);
the core UI plan in [docs/core-ui-design.md](docs/core-ui-design.md).

## First: verify and release

- [ ] Run the full GUI suite (all UI tests and the 16-game end-to-end run) on main
      as merged. Core UI stage 5 and bookkeeping each passed on their own branch,
      but not together after the merge; only the window-less checks ran on main.
- [x] Rerun `verify-bookkeeping-ui` on the merged build (it was stopped).
- [ ] Release 0.1.0-alpha.91 once the suite passes.
- [x] Add `check-tiles` to the suite with `tsx` (it reads TypeScript).

## Core UI (one interface every game slides into)

- [ ] **Worldbuilding** onto the generic sheet. Needs the GM's answers first: a
      Worldbuilding character is quietly a C&C record today. Decide what a new
      one is (proposal: system-free sheet with GM-defined fields), which host
      takes its edits (proposal: a generic one), and whether existing characters
      move (proposal: name, portrait, notes and inventory move; C&C stats become
      custom fields).
- [ ] **Castles & Crusades** onto the core (last). Needs a fresh "before" from
      main, since its weapons became draggable.
- [ ] Wizard pages onto core step parts (assign points, pick list, page rail),
      starting with the d20 wizards.
- [ ] Host side (doc step 12): about 128 `ruleset === ...` checks in
      `electron/`, 61 of them in `combat.cjs`, dispatched through the
      manifests and registry instead.

## Targeting, actions and effects

- [ ] Magical darkness as an effect on a token (map darkness areas exist).
- [ ] Lights carried by items (for now the light goes on the bearer).
- [ ] 3.5E spell resistance for spells cast from their text.
- [ ] Basic Fantasy spells are book pages, not records, so its casting has
      nothing to cast yet.
- [ ] Damage cards for every game's damage lines (only 5E damage and heals,
      and spells cast from text, get one now).
- [ ] Effects on tokens in scenes that aren't open catch up on game time only
      when the scene is shown.
- [x] Sleep's drifting Zzz overlaps the template's "Sleep (caster)" label.

## Maps and tokens

- [ ] Token vision panel (sight on/off, angle, mode).
- [ ] Preload the next scene for players.
- [ ] Universal VTT (.dd2vtt / .uvtt) import.
- [ ] Act on several selected tokens at once (delete, hide, faction, size).
- [ ] Random token image from a folder; width/height/scale tokens; hex
      snapping for large tokens.
- [ ] Place sounds from Map Studio (only from Scene settings today).
- [ ] Test teleporting a token to another scene (built, untested).
- [ ] The GM hears placed sounds only through the vision preview.
- [ ] The stand-alone Map Studio may refuse a project with the new teleport
      region kind.
- [x] A region switched off at the table comes back on after Map Studio's
      Save to Kraken.
- [x] Check the combat tracker and chat never show players a creature's real
      name when its token shows the "players call it" name.

## Records and content

- [ ] Locations: story records with a map pin.
- [ ] The GM's own handout pictures (drop a file on Images, then share).
- [ ] Full-text search across every active book.
- [ ] An Options tab built from each manifest's option list (SiegeCore's
      hidden options, 5E, 2E).
- [ ] Encounter "Place on this map" saves where tokens stand now; clicking
      spots on the map for each NPC is not built.
- [x] Two items with the same name, one identified and one not, can show the
      unidentified name in tracker and chat lines.
- [ ] Lower: story templates, Foundry JSON import, PDF pages, a shop, editing
      a record's category.

## Dice and chat

- [x] Drag a table result from the table window into chat.
- [x] An `[ADVANTAGE]` tag in 5E roll labels when advantage comes from the chip.
- [x] Clicking an inline-roll chip inside the note editor rolls it publicly.
- [x] Confirm a note keeps its `[[1d6]]` text after editing (the UI test can
      skip that step silently).
- [x] Chat languages (alpha.92).
- [ ] Lower: quick-slot pages, a turn timer.

## Bookkeeping and rest

- [ ] Supplies panel and sheet rest buttons for C&C and Worldbuilding (they
      come once those sheets are on the core); check that Fate and Forged show
      what applies to them now that they are.
- [ ] Penalties shown but not yet applied to rolls: speed, 3.5E's check
      penalty, the 5E variant encumbrance's disadvantage.
- [ ] C&C's encumbrance is SiegeCore's own setting; the bookkeeping switch
      doesn't turn it off.
- [ ] Loads not counted: Traveller (its gear has no weights), Forged (chosen
      per score).
- [ ] A burnt-out lantern must be relit by hand.
- [ ] Apeira Astra ammunition counting is off: its kits sell guns but no ammo.
- [ ] Check these rules against the books (written from memory): 2E load
      steps; natural healing in 2E, Basic Fantasy and C&C; Traveller healing.
- [ ] 5E long rest gives back half the Hit Point Dice (2014 rule); SRD 5.2.1
      says all. Decide per campaign or per book.
- [ ] Five days of travel with one waterskin each gives 5E characters
      Exhaustion unless they refill (the Refill button). Correct, but surprising.

## Session and platform

- [ ] Settings for this screen: UI scale and text size sliders, global reduced
      motion, a colour-blind-safe palette, rebindable shortcuts.
- [ ] Playlists and in-sync music for late joiners.
- [ ] Mobile and tablet players (touch pan, pinch zoom, narrow layout).
- [ ] Import a campaign .zip (export exists).
- [ ] Map Studio pictures in the rolling backups.
- [x] Pause doesn't hold the character wizards or character improvement.
- [ ] Lower: first-run GM checklist and tour, an Assistant GM role, a session
      timer, light/high-contrast themes, i18n, an add-on API on the manifests,
      voice/video.

## Art and maps for the books

- [ ] Review the 15 Map Studio candidate maps (`games/*/maps/*-studio.*`) and
      swap the good ones into the books.
- [ ] Review the H3 portraits for the other games (`release/h3-review/`, one
      folder per game) and swap in the ones the GM picks.
- [ ] Map art still missing: sparking cable, canal water, an iron fence, and
      the gaps in `skills/kraken-map-studio/missing-assets.md` (water wheel and
      millstone, beacon, lighthouse lamp, quicksand, cliff face, lift shaft...).
- [ ] Map art that reads wrong: blast door and iron bridge look side-on, the
      trapdoor is at an angle, the puddle looks like a gold plate, ash and soot
      looks like flagstones, chests are side views, dry grass strokes show as
      pale pills.

## Known bugs and rough edges

- [ ] verify-table-play-ui fails since alpha.91 or earlier: a player's drawn circle does not resize by its handle (the handle is under the pointer and receives it; the update does not reach the host), and at alpha.91 a right-click on a drawing did not remove it. Find the cause in MapView's pointer handlers.
- [ ] e2e: Worldbuilding stops at "launch the GM's app" (no agent.json) and its parcel step calls ctx.shot before it is set.

- [x] Forged sheet: the Harm panel covers the trauma "Mark" button while a
      trauma is pending.
- [ ] C&C e2e once lost the inventory "Where" field on save (passed on
      rerun): look for a save race.
- [x] A player's sheet keeps the title "Character Wizard" after the wizard ends.
- [x] Fate's Scene Aspects strip overlaps window title bars.
- [x] Fate's minus die face can read as "|".
- [x] Character Selection: the Export menu covers the card's name in edit mode.
- [ ] UI tests failing for setup reasons: `verify-cards-ui` and
      `verify-map-share-ui` (one window covers another's button),
      `verify-starships-ui` (the deck plan covers a button), `verify-doors-ui`
      (needs modules in the test Library).
- [ ] Tests open windows on the left monitor and take focus; a mode that runs
      them without stealing the GM's mouse and keyboard would let them run
      while the GM uses the computer.

## From the GM's FG walkthrough (FG Example1, 2026-11-15), not done yet

- [ ] FG character import and export in FG's own XML for 5E (now: FG sheets come in mapped to C&C; export writes C&C only).
- [ ] Dropping a background, class or species on a 5E sheet with FG's choice prompts (pick 4 skills, +2 / +1, subrace). The wizard does it today.
- [ ] A campaign assets folder in the Assets window (tokens, portraits, images filters; drop a file onto its folder icon). A picture dropped on Kraken's window already opens as a map to share.
- [ ] A Lights list to drag onto tokens (FG's token lights); the presets are in the token's light menu now.
- [ ] Moon phases on the calendar (each world's moons and their cycles, from its books).
- [ ] A table's result dragged onto a sheet field (it drags into notes and chat as text today).
- [ ] A Discord link on the start screen (the GM's server's invite URL is needed; Community points at GitHub Discussions for now).
- [ ] FG's encounter **Random** (an encounter rolled up) and **Quick Map** (a picture, the encounter, the party's and the enemies' spots on a 3x3 grid, made into a map).
- [ ] Faction icons to drag onto creatures (FG's tracker menu); a click on the side cycles it now.
- [ ] Portraits and tokens for the bundled adventures' creatures (Cinder Barrow, Empty Watchtower, Mill at Hob's Ford, Silent Hulk, Salvage Rights, Lamp in the Rock).
- [ ] Containers nested inside containers (Foundry's dnd5e has them); a vehicle sheet of its own (Foundry's vehicle actor); a per-player light mode (Foundry's colour scheme).
- [ ] **Last: S-tier dice.** FG's dice look better than Kraken's. Make Kraken's own to that standard (not copies of FG's paid dice): materials, numbers, the roll's weight and bounce.

## Housekeeping

- [ ] Foundry: the dnd5e system installed to study it is still in Foundry.
- [ ] Merged agent worktrees under `.claude/worktrees/` can be cleaned up.
