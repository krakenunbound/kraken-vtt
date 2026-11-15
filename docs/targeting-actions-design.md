# Targeting, actions and effects: design

What a GM expects from a VTT when a spell is cast or a sword swings: pick
who it is aimed at, roll against each of them, apply the result, and show
what is now on each creature. Fantasy Grounds is the minimum; Foundry's
better parts are added; Kraken should be easier than both.

Status: design (stage 0). Sections 6 and 7 are the build order and the
checks. "Built" notes are added as stages land.

---

## 1. What Fantasy Grounds does (read from CoreRPG and 5E)

Read through the Kraken Agent Bridge's source tools (fgu_source_read) from
`rulesets/CoreRPG.pak` and `rulesets/5E.pak`. FG itself was not running
(the bridge was not connected), so behaviour at the table is from the source
and from knowledge; nothing below needed a live FG to confirm. Kraken copies
behaviour, never code (PLAN.md ground rule 3).

### 1.1 Targeting (`manager_targeting.lua`, `imagewindow_toolbar.lua`)

- Targets belong to a combat tracker entry (`<ct entry>.targets`, each a
  reference to another entry). A token's map targets and the entry's list are
  kept in step both ways (`onTargetUpdate`, `updateTargetsFromCT`).
- Who targets: the selected tokens on the map, else the user's active
  tracker entry (`getSelectionHelper` -> `getActiveToken`). A player targets
  only with their own entry; with none, "targeting PC missing from CT".
- Map toolbar (shown when the map has tokens): **target select** (a mode:
  click or drag a box to target), **target friendlies**, **target foes**,
  **clear targets**. Friendlies are entries of the selection's faction
  (friend when the selection is mixed or not on the tracker); foes are every
  entry *not* of that faction (`setFactionTargets(bNegated)`), so neutrals
  count as foes in FG. Hidden entries are skipped for players. Only tokens on
  the same map.
- Ctrl+click a token toggles it as a target; the tracker has a targeting
  drag (`"targeting"` drag type dropped on an entry adds it) and a target
  summary per entry (`ct_target_summary.lua`).
- Deleting an entry removes it from every target list and from effects
  aimed at it (`onCTEntryDeleted`).
- 5E option: clear targets after an action / at the end of the turn (Kraken
  has it: `clearTargets` never/action/turn).

### 1.2 Actions (`manager_actions.lua`, `manager_combat_drop.lua`)

- An action (attack, damage, heal, save, effect, cast...) is rolled against a
  targeting group: an explicit drop target, else the actor's targets
  (`sTargeting` "all" = one roll for all; "each" = one roll per target).
- One die roll is resolved once per target: `handleResolution` copies the
  roll for each target and calls the type's result handler (an attack is
  compared with each target's AC, damage applied to each).
- **Drop on a token or tracker row** (`handleAnyDrop` ->
  `handleActionDropEvent` -> `ActionsManager.actionDrop(draginfo, rTarget)`):
  any sheet action (attack, damage, a power's save) dragged onto a creature is
  rolled with that creature as the only target. A chat roll dragged onto a
  creature carries its dice and result: a damage or heal result applies its
  total to that creature without a new roll.
- Effect targeting drag: an effect's target list takes a dropped creature
  (`effect_targeting`); a faction drag sets an entry's faction.

### 1.3 5E powers (`manager_power_5E.lua`, `manager_power.lua`)

- A spell has actions: cast (targeting, targets count `targetingval`, upcast),
  attack (melee/ranged), powersave (save type, DC, half on success:
  `onmissdamage`), damage (dice, type, upcast/cantrip scaling), heal,
  effect (label of components, duration, self or targets).
- The parser (`parsePower`, `parseAttacks`, `parseDamages`, `parseHeals`,
  `parseSaves`, `parseEffects`) turns a power's description into those
  actions: "spell attack", "Dexterity saving throw", "8d6 fire damage", "half
  as much damage", "regains hit points equal to", conditions in the text
  become effects, durations from "for 1 minute", concentration from the
  duration line.
- Casting (`performPowerInternal`): refuses a targeted spell with no targets
  ("no targets" warning) before a slot is spent; picks the slot (upcast);
  concentration ends the last concentration spell; self actions (self heal,
  self effects) run first, then the targeted ones; an attack or save gates
  the damage and effect after it (`sAuto` hit/failure).
- FG's own TODO: no target-count enforcement and no area targeting from the
  spell's shape. The newer 5E data (2024 SRD module) carries
  `targeting = sphere|cone|cube|line|cylinder|emanation` and the size in
  `targetingval`, which FG does not turn into a template.

### 1.4 Damage (`manager_action_damage*.lua`)

- Damage types; resistance halves, immunity zeroes, vulnerability doubles
  (NPC fields and RESIST/IMMUNE/VULN effects); temporary hit points first;
  criticals double the dice; half on a save.
- After damage: a concentration save, DC max(10, half the damage); dying ends
  concentration (`handleConcentrationOnDamage`).

### 1.5 Effects (`manager_effect*.lua`, 5E `data_common.lua`)

- An effect on an entry: label made of components separated by `;` (a name,
  conditions, `ATK: 1d4`, `SAVE: 2`, `AC: -2`, `DMG: 1d6 fire`, `RESIST:
  fire`, `IMMUNE: ...`, `VULN: ...`, `ADVATK`, `DISATK`, `REGEN`, `DMGO`,
  `LIGHT`...), duration in rounds and the initiative it was applied on
  (expires when that count comes round), visibility (GM only), source,
  targets (an effect that counts only against some creatures), `apply`
  modes: action, roll, single (expire after one use), once per turn / round.
- Conditions with token icons (5E): blinded, charmed, cursed, deafened,
  encumbered, exhaustion (stacks), frightened, grappled, incapacitated,
  intoxicated, invisible, paralyzed, petrified, poisoned, prone, restrained,
  stable, stunned, surprised, turned, unconscious; bonus/penalty widgets for
  INIT, CHECK, AC, ATK, DMG, HEAL, SAVE and the abilities.
- The Effects window (sidebar): preset conditions and the GM's custom
  effects, each draggable onto a creature.
- Lights: a LIGHT effect lights a token (CoreRPG's token light presets:
  candle, lamp, torch, lantern, Light spell).

## 2. What Foundry (dnd5e 6.1, Foundry v14) does better

Read first-hand from the installed dnd5e system (installed for this study;
no world was changed): `TemplatePlacement.fromActivity`,
`DND5E.areaTargetTypes`, the `damage-application` element and the chat
message context options.

- **Templates from the spell's data**: the activity's area (circle, cone,
  cube, cylinder, line, emanation, ring, sphere, square, wall) and size in
  the scene's units become a template the user places with the mouse
  (follows the cursor, rotates for cones and lines), in the **user's colour**,
  visible to everyone, named "Spell [User]". Emanations attach to the
  caster's token and move with it. v14 templates are Regions with a
  "coverage" highlight (the grid squares it covers are shaded) and walls
  restricting it (`restriction: move`).
- **Targets from templates** (from knowledge, not in 6.1's source: it
  places a Region and leaves targeting to the user or modules): tokens inside
  are targeted; in dnd5e the outcome is shown per target.
- **Chat damage cards**: a damage roll lists the targeted (or selected)
  tokens as pills, each with the damage it would take after its
  resistances, immunities and vulnerabilities (each source can be toggled
  off), a multiplier per target (heal, 0, x1/4, x1/2, x1, x2) and an Apply
  button; right-click on the card: apply damage, healing, temp HP, double,
  half. Attack cards list the targets with hit or miss; "select hit/missed
  targets". Save cards list each target's result.
- **Status effects**: the token HUD's grid of conditions (one click on, one
  off), icons on the token, the condition's rules in a tooltip; effects have
  durations in rounds and turns that the combat tracker counts down; light
  is a token property that an effect may change (torch, lantern...).
- **Targets are per user** (from knowledge): each user's targets show on the
  token in that user's colour (pips for other users' targets).

## 3. What Kraken has today (verified)

- Targets per tracker entry (`electron/combat.cjs` `target`, `targetArea`
  circle only, `clearTargets`; option `clearTargets`), messages `ct`
  target / clear-targets / target-area, MCP `kraken_combat`
  target / clear-targets / target-area.
- Ctrl+click a token (or the token menu) toggles a target for the player's
  own entry, or the GM's active one. A reticle shows on tokens the seat's
  creatures target; the GM sees only the active entry's.
- An ability card dropped on a token casts or attacks at it; a chat damage
  or heal roll dragged onto a token or tracker row applies its total (GM).
- 5E: attacks per target with advantage on frozen creatures, criticals per
  target, damage only to those hit, resistances by type, saves with
  automatic failures, concentration (one at a time, a save on damage),
  spells cast from FG-style actions with half on a save, Magic Missile darts,
  effects with ATK/SAVE/AC/DMG/RESIST/IMMUNE/VULN components counted on rolls,
  durations counted down by initiative (FG's way), steps undone by Back.
- SiegeCore games (C&C) cast from a character's powers; 3.5E and 2E have no
  cast at all; Basic Fantasy, Cairn, Fate, Ironsworn, Forged, Traveller,
  Astra have their own rolls.
- Map drawing shapes (circle, cone...) are only drawings. The "area" tool
  asks a radius with `window.prompt`.
- Token lights (carried light presets, no animation) and scene lights with
  animation; line of sight for lights; players see light as glow.
- `token.faction` (map) and `entry.faction` (tracker) are not kept in step.

## 4. The design

### 4.1 Where things live

- **Core (shared, no game names):**
  - `shared/actions/areas.mjs`: an area from a spell's data or words
    (`areaOf(spell)`), template geometry in pixels for a grid, and which
    tokens a template covers (`tokensIn`).
  - `shared/actions/parse.mjs`: a spell's or power's words into actions
    (attack, save with its kind and half/negates, damage dice and type with
    level scaling, heal, effect with duration and conditions, area, how many
    targets and whose: self, ally, enemy, any), the way FG's 5E parser does,
    for any game's spell fields (5E text, 3.5E's Effect/Area/Save lines, 2E's
    AOE/Save, C&C, Basic Fantasy).
  - `shared/actions/effects.mjs`: the effect model (components, what is
    beneficial, what ends on damage, a light from an effect), the condition
    catalogue (id, words, icon, token visual, what it does), effect presets
    (buffs, lights with burn times) and a ruleset's own list from its
    declaration.
  - `src/table/tokenFx.tsx` + CSS: the token visuals for conditions.
  - `src/effects/EffectsWindow.tsx`: FG's Effects window, Kraken-style.
  - `src/effects/BuffBar.tsx`: the MMO-style buff/debuff bar (sheet, tracker
    row, token hover).
- **Per ruleset (declared, not branched):** `shared/<id>/actions.mjs`
  beside each manifest, attached by the registry as `manifest.actions`
  (kept out of `manifest.mjs` while core-UI stage 3 edits those files; fold
  in afterwards). It declares:
  ```js
  export default {
    spells: "fg5e" | "text" | "powers" | "none",  // how spells are read
    saves: { kinds: [...], words: {reflex: [...]}, dc: "spell" | "cl" | "none" },
    damageTypes: [...] | null,                   // resistances by type where the game has them
    conditions: ["prone", "stunned", ...],        // ids from the core catalogue the game uses
    extraConditions: [{ id, label, icon, fx, text }],
    lights: ["torch", "lantern", "candle", "light", ...],  // presets this game lists
    burn: { torch: 60, lantern: 360 },            // minutes of game time (5E: torch 1 hour)
    roundSeconds: 6,                              // a round in game time
    friendlyFire: true,                           // areas hit allies too (most d20 games)
  }
  ```
  Games with no spells or saves (Fate, Forged, Ironsworn) still get
  targeting, templates (manual), effects, conditions and lights.

### 4.2 Targeting

1. **Map toolbar, a "Targeting" group** (every map, GM and players; icons
   with tooltips): Target mode (click a token to toggle; drag a box to target
   every creature inside), Target all friendlies, Target all foes, Clear
   friendly targets, Clear enemy targets, Clear all targets. Who targets: the
   selected token's entry (the GM: any; a player: only their own), else the
   player's own active entry, else the GM's active entry; FG's
   `getSelectionHelper`. Friendlies: the source's faction (the source
   included, so Bless can take the caster). Foes: the opposing faction
   (friend vs foe); neutrals are left out (FG counts them as foes; Kraken
   asks the GM to target a neutral by hand: fewer surprises). The dead are
   skipped; hidden entries are skipped for players.
   Messages: `ct target-faction {id?, faction: "friend"|"foe"}`,
   `ct clear-targets {id?, faction?: "friend"|"foe"}`, `ct target-box {id?,
   x1,y1,x2,y2}`. Tool: `kraken_combat` target-faction, clear-targets
   (faction), target-box.
2. **Ctrl+click** a token (as now) and a **tracker row**: toggles it as the
   source's target. The tracker row shows a reticle chip when targeted.
3. **Reticles**: every seat sees a reticle on each token its own creatures
   target; the GM sees every entry's targets, one reticle per targeter in
   the targeter's colour (a player's chosen colour, the GM's for NPCs),
   up to four arcs, so "who is aiming at whom" reads at a glance.
4. **Faction sync**: changing a token's faction (token menu) changes its
   tracker entry's, and the other way round.

### 4.3 Area templates

- A **template** is a map object: `{id, shape: circle|cone|line|square,
  x, y, size (feet), width (feet, lines), angle (degrees), color (the
  placer's), owner, by (entry), spell, attach (tokenId, emanations)}`;
  visible to everyone, drawn under the tokens with the covered grid squares
  shaded (Foundry's coverage), a label "Fireball (Hagar)".
- **Sizing**: feet to pixels through the map's grid (5 ft a square by
  default, the map's own units otherwise). Circles snap their centre to a
  grid corner; cones and lines start at the caster's token edge and turn
  with the mouse (5E cones: width at the end = length); cubes from a point
  are centred on it, cubes "originating from you" sit against the caster's
  token in the mouse's direction; emanations are circles of size + the
  token's radius, attached to the token.
- **Who is inside** (`tokensIn`): a token is in when any grid square it
  covers has its centre inside the shape (the 5E DMG's rule, Foundry's
  coverage), or for gridless maps when its centre is; walls that block
  movement or sight between the template's origin and the square's centre
  stop it (closed doors too), so a Fireball does not burn through a wall.
- **Casting with a template**: a spell with an area cast by a creature that
  has a token on the map and **no targets picked** asks its caster's screen
  to place the template (the map shows it following the mouse, Escape
  cancels); placing it targets the creatures inside and casts. A caster with
  targets already picked casts at them (FG's manual multi-target). The agent
  and tests cast with `template: {x, y, angle}`.
  Messages: `ct cast` with `template`, host `template-request` to the
  caster's seat; `template {action: place|move|remove|clear}`. Tool:
  `kraken_template` (place, move, remove, clear, list) and `kraken_combat
  cast` with `template`.
- **Who the spell lands on** (from the parse, per target): damage and
  harmful effects with "each creature in" hit everyone inside (allies too:
  friendly fire), "creatures of your choice" hit only the caster's foes;
  buffs (beneficial effects, healing) land only on the caster's side; target
  caps (Bless 3, +1 per slot level above) keep the first N and say who was
  left out. A foe never gets an ally-only buff, whatever was targeted.

### 4.4 Actions dragged onto creatures

- **Sheet attack or damage dice dropped on a token or tracker row**: a
  shared drag payload `application/x-kraken-action` `{kind: attack|damage|
  save|cast|heal|effect, recordId, entryId?, weapon?, power?, formula?,
  type?}`; the drop side (MapView token, tracker row) clears the source's
  targets, targets that creature and runs the action (FG's actionDrop). The
  sheets are being moved onto the core by another agent (stage 3), so this
  build reads only what sheets already emit (`x-kraken-card` today) plus the
  new payload; section 8 lists the sheet hooks to add after stage 3.
- **A chat roll dropped on a creature (the GM)**: attack (compared with its
  AC, as a new card line), damage (with its type: resistances apply), heal,
  effect (put on). The roll's own result, not a new roll (FG).

### 4.5 Chat cards (Foundry's, on FG's automatic results)

- Kraken keeps FG's automation (results apply as the roll lands) and adds
  Foundry's card: a damage roll lists its targets, each with what it took
  after resistance, immunity, vulnerability and a save's half, and buttons
  **x0, x1/2, x1, x2, heal** that set what that target takes now (the
  difference is applied, so a GM fixes a wrong call in one click), plus
  "apply to the selected token" for a creature not targeted. Save results
  show per target (saved/failed, half). Attack cards list hit/miss/critical
  per target.
- GM option `autoApply` (on: FG; off: Foundry: the card waits for Apply).
- Messages: `ct apply-card {card, target, mult}`; the host keeps each card's
  per-target state and sends `card` updates. Tool: `kraken_combat
  apply-card`.

### 4.6 Effects

- **One effect model** (`cleanEffect` extended): label of components, an
  icon key, a source (who put it on), duration (rounds), `light` (from a
  `LIGHT: bright/dim colour animation` component), `ends: "damage"` (Sleep:
  ends when the creature takes damage, per the rules), `burn` (game minutes
  for lights), gmOnly, targets, concentration holder.
- **Where effects live**: on a tracker entry (FG's way), or on a token not
  in the fight (a torch lit while exploring). A token's effects move onto
  its entry when it joins the tracker and back when it leaves.
- **Durations**: rounds count down on the tracker (FG's initiative-count
  expiry); out of combat the campaign calendar's clock counts game time
  (a torch burns an hour of game time: the GM moving the clock on burns it
  down), using the ruleset's `roundSeconds`. A warning in chat when a light
  has a tenth of its time (at most 10 minutes, at least 1 round) left; the
  light goes out when it ends. Snuff / relight (pause) from the token's
  menu, the buff bar, or the tool.
- **Rolls use them** (already for 5E ATK/SAVE/AC/DMG); the parser's buffs
  are written as components so they count: Bless `ATK: 1d4; SAVE: 1d4`
  (5E), `ATK: 1` (3.5E/2E: +1 morale).
- **Sleep ends on damage**: an effect with `ends: damage` (or the 5E SRD's
  `NOTE: Ends on damage`) is removed when its creature takes damage.
- **Visible everywhere**:
  - Token: condition visuals (CSS/SVG, transform/opacity animations only):
    asleep Zzz drifting up, poisoned green bubbles, burning flames, frozen
    frost and crystals, petrified grey stone, frightened trembling with a
    dark aura, stunned circling stars, paralyzed crackle, charmed hearts,
    blinded a dark band, invisible a faint shimmer (owner and GM; other
    players are not sent the token), prone tilted, restrained chains,
    grappled a ring, buffs a soft gold glow, debuffs a red one,
    concentrating a turning ring, dying/unconscious grey with a slow red
    pulse; plus up to five small icons and "+n". `prefers-reduced-motion`
    stops the motion; the GM's setting "Token effects: full / icons only /
    off" (`kraken_table_options tokenEffects`).
  - Buff bar (sheet frame, tracker row): icons with rounds left and a
    tooltip (what it does, who put it on, time left); click opens it
    (remove, change), + adds from the Effects list or a custom one.
    Players see their own; the GM sees all.
- **The Effects window** (sidebar, GM and players): conditions, buffs and
  debuffs, lights (the ruleset's: torch, lantern, candle, Light, Daylight;
  flashlight, headlamp, glowstick for Traveller and Astra), the GM's own
  effects (create, edit, delete; kept in the campaign). Every entry drags
  onto a token, a tracker row, a sheet or a party row; a light shows on the
  map around that token. Players may drag only what the GM allows (option
  `playerEffects: none|conditions|all`) and only onto their own characters.
  Messages `effects {action: list|save|delete|apply}`; tools
  `kraken_effects` (list, save, delete, apply {to: token|entry|record},
  remove, update, snuff, relight).
- **Lights as effects**: an effect with LIGHT (torch 20/40 ft flicker,
  lantern 30/60 steady, candle 5/10 flicker, Light 20/40 steady white,
  Daylight 60/120, Faerie Fire 0/10 violet pulse outline, Darkness negative,
  flashlight 60 ft beam, glowstick 10/20 green). The map's light sources
  gain the effects' lights, centred on the token and moving with it, through
  the same line-of-sight and player-vision code as today's token lights.

## 5. Per game

| Game | Spells read as | Saves | Damage types | Notes |
|---|---|---|---|---|
| D&D 5E, SRD 5.2.1, Descending Darkness | FG 5E actions; the parser where a spell has none; `area` in the SRD data | 6 abilities vs DC | 5E's 13 | concentration, upcast, cantrips, friendly fire |
| D&D 3.5E | text fields (Effect/Area, Save "Reflex half", damage per level max) | Fort/Ref/Will vs 10 + level + mod | energy types | spell resistance (exists for C&C) |
| AD&D 2E (and OSRIC) | FG 2E actions (savetype spell, casterlevel dice), else text | the five saves | fire, cold... | |
| Castles & Crusades | SiegeCore powers (as now), area from the power's words | attribute vs CL | as SiegeCore | |
| Basic Fantasy | text (its spells' words) | the five saves | none | |
| Cairn | none to roll (spellbooks are narrative) | STR/DEX/WIL | none | templates by hand; conditions (Deprived, Fatigue) as effects |
| Traveller, Apeira Astra | none | | none | lights: flashlight, lamp, flare; conditions |
| Ironsworn, Starforged, Fate, Forged | none | | none | targeting, templates, conditions, lights |
| Worldbuilding | none | | none | the core's list |

## 6. Build order

1. **Targeting**: toolbar group (icons), host `target-faction`,
   `clear-targets` by faction, `target-box`, Ctrl+click on tracker rows, GM
   reticles in targeter colours, faction sync; tools; `scripts/check-targeting.mjs`.
2. **Areas and the parser**: `shared/actions/areas.mjs`, `parse.mjs`, the
   SRD build's `area` field, `shared/<id>/actions.mjs` declarations; checks
   (`scripts/check-areas.mjs`, `scripts/check-spell-parse.mjs` over every
   shipped spell).
3. **Templates**: map state, view, drawing, placement, targeting inside,
   cast with a template, caps and ally-only, the template request; tool
   `kraken_template`; check.
4. **Drag to target, chat cards**: action payloads, chat roll drops, damage
   card with per-target buttons, `autoApply`, `apply-card`; check.
5. **Effects**: model, token effects, Sleep ends on damage, lights from
   effects with burn time and the calendar, snuff/relight, the Effects
   window, custom effects, the buff bar, token visuals, settings; tools;
   checks.
6. **3.5E, 2E and Basic Fantasy casting** (engine; the sheet buttons are
   stage 3's), from `parse.mjs`.
7. Docs, the full test run, screenshots, merge main.

## 7. Checks

- `npm run build` (tsc + vite), `npm run coverage` (every new message and
  tracker action has a tool), the games' checks and `check-combat*.mjs`.
- New: `check-targeting.mjs`, `check-areas.mjs`, `check-spell-parse.mjs`,
  `check-templates.mjs`, `check-cards.mjs`, `check-effects.mjs`,
  `check-light-effects.mjs`; UI: `verify-targeting-ui.mjs` (GM app and a test
  player in Chrome, full screen 2560x1440 shots: toolbar, Fireball template,
  Sleep Zzz, Bless icons, a damage card, the torch scenario).
- The 16-game e2e at the end.

## 8. Sheet hooks after core-UI stage 3

The drop side is built; each sheet (or the core part that draws its attack,
damage and spell rows) should, after stage 3 merges:
- make its attack, damage and save buttons draggable with
  `application/x-kraken-action` (`{kind, recordId, weapon | power, formula,
  type}`), as `src/effects/drag.ts` `actionDrag()` builds it;
- give 3.5E, 2E and Basic Fantasy spell rows a Cast button calling
  `session.ct("cast", {recordId, power})` (the host casts them now);
- place `<BuffBar>` (already in `SheetFrame`) where the game's layout wants
  it, if not under the name.

## 9. Built (branch worktree-agent-a310ba63a88d4440b)

Everything in sections 4.2 to 4.6 is built, with these differences and gaps:

- **Where it lives.** `shared/actions/parse.mjs`, `areas.mjs` and `effects.mjs`; each game's `shared/<id>/actions.mjs`; `electron/effects.cjs` (the Effects list), `combat.cjs` (targets, casting, cards, effect time), `mapState.cjs` (templates, token effects, effect lights, token visuals in the view), `tableServer.cjs` (messages `template`, `effects`, `ct` target-faction / target-box / apply-card / apply-roll, `template-request`, `card`); `src/effects` (drops, the buff bar, the Effects window), `src/table/TokenFx.tsx`.
- **Foundry from its source.** Templates from the spell's data, in the user's colour, covering squares, attached emanations, the damage card's per-creature multipliers and its "apply to selected" were read in dnd5e 6.1's source. Targets on placement and other users' target pips are from knowledge (the 6.1 source places Regions; tokens inside are not targeted by the system); Kraken targets them, which is the point of placing one.
- **Who a spell lands on.** "Creatures of your choice" spare allies only for a template's area; targets picked by hand are the caster's choice. A buff never lands on a creature not of the caster's side.
- **Cards.** The card sits on the damage roll's chat line, updated in place (`card` messages); players see it without the GM's buttons and without hidden creatures.
- **Game time.** The calendar's Advance burns effects down (`calendar.cjs` onTime). Setting a date by hand does not. Effects on tokens of other scenes wait until their scene is shown.
- **Not built.** Magical darkness as an effect on a token (the map parity work's darkness areas, merged from main, cover a darkened place); lights carried by items (an effect on the bearer stands in); 3.5E spell resistance on text spells. (Section 8's sheet hooks are in since core-UI stages 3 and 4 merged: the core list's attack and damage row buttons and C&C's weapons drag as `application/x-kraken-action`; 3.5E and 2E spell lists show each spell with Cast, `core.spellCasts`; the 5E Spells page reads rich-text descriptions.) Pause holds players' templates and effects; damage cards go through the item-identification filter.
- **Checks.** `check-targeting`, `check-templates`, `check-cards`, `check-effects`, `check-cast-text`, `check-spell-parse`; `verify-targeting-ui` drives the GM's app full screen and a test player's Chrome at 2560x1440.
