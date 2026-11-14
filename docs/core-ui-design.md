# Kraken VTT: one core UI that every ruleset slides into

Research and design. Nothing in `F:/Kraken VTT Web` was changed.

Sources read for this:
- Fantasy Grounds: `CoreRPG.pak`, `2E.pak` and `5E.pak` from `%APPDATA%/SmiteWorks/Fantasy Grounds/rulesets`, unzipped into `scratchpad/fg-study/`.
- Foundry v14: the installed app at `C:/Program Files/Foundry Virtual Tabletop/resources/app/client` and the user's Castles & Crusades system in `%LOCALAPPDATA%/FoundryVTT/Data/systems/castles-and-crusades`.
- Kraken: the current `main` (3a70533).

PLAN.md section 6 already says "A ruleset is a package with a manifest, record schemas, sheet layouts, roll types and handlers, and hooks into the core". This document turns that sentence into something we can build.

---

## 1. How Fantasy Grounds does it (CoreRPG layering)

### 1.1 A ruleset is a layer on CoreRPG
`2E/base.xml`:
```xml
<importruleset source="CoreRPG" />
<importinfo>
    <acceptfrom ruleset="2E" />
    <acceptfrom ruleset="CoreRPG" />
</importinfo>
...
<includefile source="campaign/record_char.xml" />
<includefile source="campaign/record_char_main.xml" />
...
<script name="CombatManagerADND" file="scripts/manager_combat_adnd.lua" />
```
FG loads CoreRPG's whole UI first: windows, templates, the combat tracker, party sheet, library, chat and dice. Then it loads the ruleset's files on top, by name. Three things make this work:

- **The same name replaces the core's version.** A `windowclass` or `template` with a core name and no `merge` attribute replaces the core one completely. 2E's `charsheet_main` (2,792 lines) replaces CoreRPG's `charsheet_main` (about 40 lines: a generic list of attribute categories the user fills in). 2E's `cta/cta_host.xml` even redefines `combattracker_host`, so 2E gets its own tracker window ("CTA") inside the same desktop.
- **`merge="join"` adds to or changes the core's version.** 5E's `ct/ct_host_entry.xml`:
  ```xml
  <windowclass name="ct_entry" merge="join">
    <sheetdata>
      <hnx name="deathsavesuccess" />           <!-- hidden data-only fields -->
      <hnx name="strength" source="abilities.strength.score" />
      <button_ct_section_defense name="button_section_defense" insertbefore="button_section_space" />
      <number_ct_crosslink name="wounds" insertbefore="initresult"> ... </number_ct_crosslink>
  ```
  2E's inventory row does the same, and also takes a core control away:
  ```xml
  <windowclass name="char_invitem" merge="join">
    <number_listitem_right name="weight" merge="delete" />
    <number_listitem_right name="weighttotal" insertbefore="location"> ...
  ```
  Children merge by `name`. You can add a child, insert it (`insertbefore`), change it, or delete it (`merge="delete"`).
- **`copy=` inherits a base window.** CoreRPG's `charsheet` is `copy="charsheet_base"`: a frame, a menu bar, the overview header (portrait and name) and the tab host. The tabs are child `<tab>` elements merged with `merge="add"`.

### 1.2 The character sheet: one frame, tabs the ruleset lists
- CoreRPG `charsheet`: main, abilities, inventory, notes.
- 5E `charsheet`: main, skills, abilities, inventory, notes, actions.
- 2E `charsheet`: main, skills, abilities, inventory, notes, combat. Main and combat use `<embed />`, and the minimum size is larger.

2E keeps CoreRPG's frame: `charsheet_base`, the overview header `charsheet_overview copy="charsheet_overview_base_v2"`, the menu bar, lock mode and the portrait. Only the tab pages differ. Its main page is a different arrangement made from the same kinds of parts:
- class/race/kit title bars (`label_charframetop`)
- `stringc_charclasslevel`, with `chooser_label` to pick a record from the library
- `linkfield` to open a linked record
- framed groupboxes (`sub_content_framed_groupbox_top`) for HP, surprise, move, AC, THAC0, weapons, initiative and turn undead

This is the "arrange core parts in your own layout" level.

### 1.3 Fields are bound to database paths
Every control is a field named after its database child: `<stringfield name="name">`, `<hnx name="strength" source="abilities.strength.score">`. A window's database node is the record, so `abilities.strength.score` is a path inside the character. Kraken already works the same way: `session.editCharacter(id, [{ path: "attributes.str.score", value }])`, with paths like `inventorylist.id-00001.count`.

### 1.4 Record types, the sidebar and options are registered data, not screens
- `CoreRPG/scripts/data_library.lua` declares each record type (`charsheet`, `npc`, `item`...) with `aDataMap`, `tOptions` (`bID`, `bPicture`, `bToken`, `bInventory`...) and the buttons on its list.
- A ruleset overrides one with `LibraryData.overrideRecordTypes(aRecordOverrides)`. 2E adds NPC filters (Type, HitDice, Climate...) and item display classes. It removes one it does not use with `LibraryData.setRecordTypeInfo("vehicle", nil)`.
- Options: `OptionsManager.registerOptionData({ sKey = "OPTIONAL_ENCUMBRANCE", sGroupRes = "option_header_adnd_options", tCustom = { default = "on" } })`.
- **Optional parts are switched on by an option.** 5E's `manager_ps2.lua`:
  ```lua
  WindowTabManager.registerTab("partysheet_host", { sName = "xp", sTabRes = "tab_xp", sClass = "ps_xp" });
  WindowTabManager.registerTab("partysheet_host", { sName = "bastion", sTabRes = "tab_bastion", sClass = "ps_bastion", sOption = "HRBASTION" });
  ```
  The Bastion tab exists only in 5E, and only while the HRBASTION option is on. CoreRPG's `partysheet` window just calls `WindowTabManager.populate(self)`. This is the pattern for "show it if the game has it, not if it doesn't".
- Rules plug into the core through handler registration, not by editing core code. From the 5E and 2E scripts: `ActionsManager.registerResultHandler` (28 uses), `registerModHandler` (20), `CombatManager.setCustomTurnStart` / `setCustomRoundStart` / `setCustomSort`, `CombatManager.addCombatantFieldChangeHandler`, `CombatRecordManager.setRecordTypePostAddCallback`.

### 1.5 The user's own rulesets layer the same way
- **SiegeCore (C&C)** does `<importruleset source="CoreRPG" />` and never copies the core sheet. It *joins* it. `campaign/record_char.xml` has `<windowclass name="charsheet" merge="join">` and `charsheet_overview merge="join"`, and `record_char_combat.xml` adds one tab into CoreRPG's list:
  ```xml
  <windowclass name="charsheet" merge="join">
    <tab merge="add">
      <name>combat</name><resource>siege_tab_combat</resource>
      <class>charsheet_siege_combat</class><insertbefore>abilities</insertbefore>
    </tab>
  </windowclass>
  ```
  `ct/ct_host_entry.xml` is `ct_entry merge="join"` too. The record windows (`record_item.xml`, `record_npc.xml`), the party sheet (`record_ps_siege.xml`), `data_library_siege.lua` and `data_options_siege.lua` all follow the 2E/5E pattern above.
- **Kraken35E** is a layer on a layer: `<importruleset source="3.5E" />`, which itself sits on CoreRPG. It adds only scripts (`manager_kraken_spellslots.lua`, autoload, decal). This is the model for Kraken's "variants", such as Descending Darkness on the 5E profile.
- **DescendingDarkness** imports CoreRPG directly.
- **Record windows (npc, item, spell) layer the same way:** a per-ruleset `record_npc.xml` / `record_item.xml` that replaces or joins the core windowclass, plus the `LibraryData` override for list filters and display classes (1.4).

### 1.6 What the FG model teaches
1. One frame per window kind. The core owns the frame, the header, the tabs host, lists, chat and the tracker shell.
2. A ruleset lists its tabs and fills each with core parts bound to record paths.
3. A ruleset may replace one part by name, or a whole window (2E's CTA), and everything else stays core.
4. Optional features are registered with a condition (game, option), so they are absent otherwise.
5. Rules are handlers the core calls. They are not branches inside core code.

---

## 2. How Foundry does it (core vs system)

### 2.1 What the core owns
These live in `resources/app/client`:
- `applications/api/application.mjs`: `ApplicationV2`, with `static TABS = {}`, `tabGroups`, `changeTab()` and `actions`.
- `applications/api/handlebars-application.mjs`: `HandlebarsApplicationMixin`, with `static PARTS = {}`, `_configureRenderParts(options)` and `_preparePartContext(partId, context)`. A window is a list of named parts, each a template, rendered and re-rendered separately.
- `applications/api/document-sheet.mjs`: `DocumentSheetV2`, which binds a form to one document. `name="system.attributes.str.value"` writes that path on submit.
- `applications/sheets/actor-sheet.mjs` and `item-sheet.mjs`: `ActorSheetV2` and `ItemSheetV2`, with drag and drop of items and effects, and the portrait.
- `applications/sidebar/tabs/combat-tracker.mjs`: `CombatTracker`, with `PARTS = { header, tracker, footer }` (`templates/sidebar/tabs/combat/*.hbs`), `_prepareTurnContext(combat, combatant, index)` for each row and `_getEntryContextOptions()` for the row's menu.
- Chat messages, dice (`Roll`), compendiums, the scene and canvas, and `DocumentSheetConfig.registerSheet(...)`.
- I did not read Foundry's chat-card code for this study. The usual pattern is that the core owns `ChatMessage` and a system renders its own template into the message's content, but that is from general knowledge, not from this source.

### 2.2 What a system supplies
From the user's own `castles-and-crusades` system:
- `system.json` lists `documentTypes.Actor.character / monster`, plus `htmlFields`.
- `data-models.js` has `class CharacterActorDataModel extends foundry.abstract.TypeDataModel { static defineSchema() {...} }`. This is the record schema, with migrations (`static migrateData`).
- `scripts/actor-sheet.js`:
  ```js
  export class TlgccActorSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {
    static PARTS = { sheet: { template: "systems/castles-and-crusades/templates/actor/actor-character-sheet.html", root: true, ... } };
    static TABS = { primary: { initial: "combat", tabs: [{ id: "combat" }, { id: "features" }, { id: "items" }, { id: "spells" }, { id: "description" }] } };
  ```
- `scripts/sheet-registration.js` calls `DocumentSheetConfig.registerSheet(Actor, "tlgcc", TlgccActorSheetV2, { types: ["character","monster","unit"], makeDefault: true })`.
- `Hooks.once("init")` sets `CONFIG.Actor.documentClass`, `CONFIG.Combat.initiative = { formula: "max(1, 1d10)" }`, `CONFIG.statusEffects`, and pre-loads its partial templates (`templates/actor/parts/actor-combat.html`...).

The core decides how a sheet opens, binds, drags, tabs, rolls into chat and appears in the tracker. The system decides the schema, the layout (parts and templates), the formulas and the status effects. A system that does nothing still gets a working (blank) sheet, the tracker, chat and dice.

### 2.3 What Kraken takes from each
- From FG: named core parts and windows that a ruleset can list, arrange, join or replace by name; optional tabs and features switched on by a condition; rules as registered handlers.
- From Foundry: the sheet as a list of parts (`PARTS`) and tabs (`TABS`); a typed data model per record type; a sheet class registered per type, falling back to the core sheet.

---

## 3. Kraken today

### 3.1 What is per-ruleset

| File | Lines | Ruleset branches |
|---|---:|---:|
| `src/characters/CCSheet.tsx` (C&C, also the fallback) | 691 | - |
| `Sheet5e.tsx` (5E and Descending Darkness, through `PROFILES`) | 393 | - |
| `Sheet35.tsx` | 384 | - |
| `Sheet2e.tsx` | 381 | - |
| `SheetMgt2.tsx` (Traveller) | 329 | - |
| `SheetBf.tsx` (sheet 386, `WizardBf` from line 387) | 613 | - |
| `SheetAstra.tsx` (sheet 406, `WizardAstra` 186) | 592 | - |
| `SheetCairn.tsx` (sheet 400, `WizardCairn` 291) | 691 | - |
| `SheetFate.tsx` (sheet 396, `WizardFate` 199) | 595 | 1 |
| `SheetForged.tsx` (sheet 589, `WizardForged` 189) | 778 | 1 |
| `SheetIronsworn.tsx` (sheet 725, `WizardIronsworn` 189) | 914 | - |
| `Wizard.tsx` (C&C), `Wizard5e`, `Wizard35`, `Wizard2e`, `WizardMgt2` | 1251, 932, 1003, 1220, 421 | 1 (5e) |
| `CharacterPanel.tsx` (chooses sheet and wizard) | 422 | **50** |
| `src/combat/CombatTracker.tsx` | 598 | **43** |
| `src/party/PartySheet.tsx` | 576 | 12 |
| `src/ui/Desktop.tsx` (sidebar entries, Fate strip) | - | 9 |
| `src/books/Records.tsx` (Traveller NPC block) | 490 | 4 |
| `Settings.tsx` 2, `ChatDock.tsx` 1, `ScorePanel`, `IronswornWindows`, `useSession` 1 each | | 7 |
| **src total** | | **126** |
| `electron/combat.cjs` | | 66 |
| `electron/party.cjs` | | 20 |
| `electron/agent/tools.cjs` | | 11 |
| `electron/mapState.cjs` 6, `tableServer.cjs` 4, `siege.cjs` 4, `books.cjs` 2, each ruleset `.cjs` 1 | | 27 |
| **electron total** | | **124** |
| plus call sites of `combat.cjs`'s helpers `five()`, `bleeds()`, `astraOn()`, `mgtOn()`, `cairnOn()`, `fateOn()`, `ironOn()`, `d35()`, `d2e()`, `dbf()` | | **115 lines** |

The counts depend on the pattern. The table used this one (`grep -rEo`):
```
ruleset(\?\.\(\))? ?(===|!==) ?"|isD20(Ruleset)?\(|isIronswornRuleset\(|isFateRuleset\(|is5e\w*\(|\^Fate /\.test|Ruleset\(\)|On\(\)|\.includes\(table\(\)\.ruleset
```
Treat the numbers as a baseline to re-measure with that same grep, not as exact. `On\(\)` can match unrelated code, and the helper call sites are counted separately above. The task brief's "~110 / ~74" came from a different pattern.

Other notes on the branches:
- In `electron/agent/tools.cjs`, the 11 hits are mostly `kraken_build_character`'s dispatch chain (`isFateRuleset`, `isIronswornRuleset`, `isForgedRuleset`, `isCairnRuleset`, `isMgt2Ruleset`, `isBfRuleset`, `is2eRuleset`, `is35Ruleset`, `isD20Ruleset`) plus two guards. That chain becomes `rulesetFor(name).hooks.build`.
- I did not read the 6 hits in `mapState.cjs`. `shared/map/deathMarkers.mjs` has 4 more.
- `CharacterPanel.tsx` has the sheet and wizard ternary written out twice (lines 195-285 and 328-418) and `canMakeBlank` as an 11-term negation.

### 3.2 What every sheet already has in common
These were checked by grepping the 11 sheet files.
- **The same frame:** `<article className="cc-sheet ..." data-character data-ruleset>`, a header with `cc-portrait-frame` (portrait and token buttons, `ArtPicker`, `slotDrag` to make the sheet a link), and `cc-identity` with `cc-labelled cc-box` boxes. Then a `cc-page` per tab (`data-tab-page`) and a right-hand `<nav className="cc-tabs">` with `data-sheet-tab` buttons. All 11 copy this frame by hand.
- **The same field:** `Field` from `CCSheet.tsx`, used by every sheet.
- **The same edit path:** `session.editCharacter(record.id, [{path, value}])`, or a per-ruleset action (`session.cairnAction`, `fateAction`, `forgedAction`, `shipAction`, `lifeAction`), with the host checking paths against a whitelist (for example `TEXT` / `NUMBERS` / `STRINGS` regexes in `electron/cairn.cjs`).
- **The same rolls:** `session.siegeCheck(record.id, key, mod, false, { kind: "save" | "check" | "skill" })`, with `data-roll-save`, `data-roll-check` and `data-roll-skill`, and `attack` / `damage` actions.
- **The same kinds of blocks** (CSS already shared across sheets: `five-abilities`, `five-defence`, `five-strip`, `d2e-saves`):

| Kind | Where it appears |
|---|---|
| Stat block (score, mod, save) | every game except Fate, Forged and Ironsworn, which use ratings |
| Derived numbers (AC, HP, BtH, THAC0, initiative, move) | the d20 and 2d6 games |
| Tracks and meters (HP, stress boxes, harm slots, momentum, Fatigue, progress tracks, XP tracks) | every game |
| Skills list (5E/3.5E/2E/BF thief skills, Traveller, Astra) | most |
| Inventory with load (slots in Cairn, load in Forged, weight elsewhere, coins) | every game except Fate |
| Spells and abilities lists (spells, feats, stunts, moves, assets, special abilities) | every game |
| Notes (labelled text areas) | every game |
| Advancement (level-up, XP, Scars and Growth, milestones, Forged's XP triggers) | every game |

Tab names per sheet (`const TABS` in each file):
```
CC      main combat abilities inventory spells notes
2E      main combat skills spells inventory notes
3.5E    main skills combat spells feats inventory notes
5E      main skills combat spells inventory notes
Astra   main skills combat gear notes
BF      main combat skills spells inventory notes
Cairn   main inventory combat character growth notes
Fate    main stunts milestones notes
Forged  main playbook downtime notes
Iron    main moves progress assets notes
MgT2    main skills combat gear notes
```
This is FG exactly: one frame, a list of tabs per game, and core-like parts arranged differently.

### 3.3 What is genuinely game-specific
- **Forged:** the action roll bar (position, effect, assist, Devil's Bargain, push, bonus dice, a clock to tick), stress and trauma, harm slots with penalties, load chosen per score, downtime activities, the crew sheet (a party tab), and the Score panel that replaces the combat tracker.
- **Ironsworn:** moves, progress tracks with ranks, assets as cards, oracles, Delve sites, and a foe's rank and progress in the tracker.
- **Fate:** aspects, fate points, the stress-and-consequence absorption flow, the scene aspects strip on the desktop, and Fate dice in the tray.
- **Cairn:** ten inventory slots (4 body + 6 pack, Fatigue fills slots), Scars, a Dying save on the tracker, morale for foes, and DEX saves instead of initiative.
- **2E / BF:** turn undead, multi-attack, five saves; morale (BF); THAC0 (2E).
- **5E / DD:** death saves, Dread (DD), the bleed rule (DD).
- **Traveller / Astra:** UPP characteristics, careers and terms, starships, and the NPC block in Records.

### 3.4 Seeds already there
- `src/ui/SettingsParts.tsx` (`SettingsSection`, `Toggle`, `SettingRow`, `Checklist`): one look, `data-setting` kept on the inputs for tests and agents. This is the target direction for the whole UI.
- `shared/dnd5e/rules.mjs` `PROFILES`: 5E and Descending Darkness share one sheet. A profile carries `labels` (`ac: "Defense"`, `hp: "Health"`, `species: "Kin"`), `dying: "bleed"`, `dread: true`, `xp`, `maxLevel` and `dcs`. That is a mini-manifest already, and it proves the idea.
- `Wizard5e.tsx` `Plate` and `Choose` (a record list with Source and Name filters and +), and `STEPS` (FG's per-page instructions). These are the wizard frame's parts.
- The host already projects ruleset-specific data onto each tracker row (`CombatEntry.cairn`, `.iron`, `.fate`, `.morale`, `.turns`, `.deathsaves`, `.ship`, `.powers`). Tracker columns can bind to those fields directly.

---

## 4. Kraken's design

### 4.1 Shape

```
shared/rulesets/
  registry.mjs           every manifest; rulesetFor(name | data.ruleset id)
  types.d.ts             the manifest types (section 4.3), for TS and JSDoc in .cjs
shared/<id>/
  rules.mjs              the engine, as today (unchanged role)
  manifest.mjs           DATA ONLY: names, ids, records, sheet layout, tracker,
                         party, features, settings, edit paths, hooks
                         -> imported by both electron (host) and src (client)
src/core/                the core UI (FG's CoreRPG layer)
  frame/                 Window, SheetFrame, Tabs, Header, RecordWindow
  fields/                Field (moved from CCSheet), NumberField, TextArea,
                         Select, Check, LinkField (drop a record), Portrait
  parts/                 StatBlock, DerivedRow, Track, Boxes, Meter, Clock,
                         List (inventory/spells/abilities/features), Coins,
                         Load, Notes, RollButton, Advancement
  wizard/                WizardFrame + step kinds
  tracker/               TrackerFrame, Row, Column kinds, RowAction
  party/                 PartyFrame + core tabs (main, inventory, order, xp)
  features/              one folder per optional feature (section 4.6)
  SheetRenderer.tsx      manifest.sheet -> parts
src/rulesets/<id>/       ONLY what is game-specific (level 3 parts), e.g.
  ForgedRollBar.tsx, ScorePanel.tsx, CrewTab.tsx, FateAbsorb.tsx, IronMoves.tsx
  index.ts               exports { parts, steps, windows } named in the manifest
electron/<id>.cjs        host handlers, as today; registered by the manifest's id
```

The manifest is plain data in `shared/` (`.mjs`, like `rules.mjs`), so the host reads the same file as the client. That matters for three host jobs:
- the edit whitelist
- the feature flags that combat and party code branch on today
- what the agent's tools describe

React components are never in the manifest. It names them (`"forged.rollBar"`), and `src/rulesets/<id>/index.ts` supplies them. This mirrors FG (XML layout names and Lua) and Foundry (`system.json` plus JS classes).

### 4.2 The core parts

Every part takes a `path` into `record.data`, the way an FG field is named after its database child. Every part renders the shared look and emits the data-* hooks itself (section 4.8).

**Frame and window**
- `Window` (exists).
- `SheetFrame`: the article, header, portrait and token (with `ArtPicker` and `slotDrag`), identity boxes, the tab rail and `data-character` / `data-ruleset`. It is identical in all 11 sheets today.
- `RecordWindow` (Records.tsx): a record of any type, with named slots the manifest can fill per type (`npc.statblock` and so on).

**Fields**
- `text`, `number`, `textarea`, `select` (static options or options from a record type), `check`.
- `link`: drop a record onto it, click it to open the record. This is "everything is a link".
- `readonly` (derived, from the host's `derive()`).
- `portrait` and `token`.

Each field kind has `editable: "owner" | "gm" | "never"`. Editing still goes through `session.editCharacter` or the manifest's `action` message.

**Parts**

| Part | Bound data | Used by |
|---|---|---|
| `statBlock` | `rows: {key, label, short}[]`; columns from `score/mod/save/max/now` paths with a `{key}` template; click = roll | all d20 and 2d6 games, Cairn, Forged ratings, Fate skills (pyramid view option) |
| `derived` | boxes with label, path and optional roll (AC, HP, BtH, THAC0, init, move, speed) | d20, 2d6, Cairn |
| `track` (`boxes`, `meter`, `segments`, `progress`) | `value` and `max` paths or a box list; `onSet` = edit path or action | HP, stress, harm, Fatigue, momentum, health/spirit/supply, progress tracks, XP tracks, Dread |
| `clock` | segments and filled | Forged, any game with the clocks feature |
| `list` | `path` to an `id-*` keyed node; `columns`; `add: { fromType, drop: true }`; `rowActions`; `group by` | inventory, spells (by level, prepared/per-day), feats, stunts, moves, abilities, friends, scars, milestones |
| `coins` | the manifest's `currency` list | everyone but Fate |
| `load` | `mode: "weight" \| "slots" \| "load-level"` plus limits | weight (d20), slots (Cairn), load (Forged) |
| `notes` | labelled textareas | all |
| `rollBar` | a roll with modifiers (mod box, adv/dis, boon/bane) | most; Forged replaces it (level 3) |
| `advancement` | level-up button, XP and next, or `milestones` / `growth` | all, in the variant the game uses |
| `custom` | `{ component: "forged.rollBar" }` | level 3 |

**Wizard frame**
- `WizardFrame`: the page rail with FG-style instructions per page (`STEPS`), warnings, "create at any point", and a summary.
- Step kinds:
  - `choose-record`: Wizard5e's `Choose` for race, class, background or playbook, with source and name filters.
  - `roll-stats`: methods, roll all, drag to swap, in-order or assign; all dice rolled by the host.
  - `assign-points`: point buy, pyramid, action dots.
  - `roll-table`: Cairn's background tables, bond, omen.
  - `pick-list`: spells, stunts, special abilities, assets, with a count limit.
  - `shop`: starting money rolled or fixed, then buy (exists in several wizards today).
  - `text`: name, alignment, details.
  - `custom`.
- Each step writes into one `spec` object. Finish sends `build-character` with the spec (as today, so `kraken_build_character` keeps working).

**Combat tracker**
- `TrackerFrame`: header (round, the next and previous buttons, the "roll all" button the manifest names), rows, footer.
- `Row`: the core columns are always there (token, name, faction, initiative, health status, effects, targets).
- Ruleset columns come from the manifest: `{ id, label, from: "iron.momentum" | "cairn.str" | "morale", kind: "number" | "boxes" | "badge" | "select", gm?: true }`.
- Row actions come from the manifest: `{ id, label, when, ct: "death-save" | ... }`, where `when` is a declarative condition (section 4.3).
- The whole window can be replaced (`tracker.replace: "forged.scorePanel"`), like 2E's CTA.

**Party sheet**
- `PartyFrame`, with the core tabs `main`, `inventory`, `order` and `xp`.
- The manifest sets:
  - `currency`
  - `groupCheck.stats`
  - `xp: "xp" | "growth" | "milestone" | "none"`
  - extra tabs as `{ id, label, component, first?: true }` (Forged's crew), the same as FG's `registerTab` with `sOption`.

**Chat cards**
- One `RollCard` (exists in ChatDock). A ruleset adds `resultWords`: the `[SUCCESS]` / `[PARTIAL]` tags its handlers already post, mapped to a colour.
- Dice tray additions come from the manifest (`dice.extraTray: ["dF"]`).

**Desktop and sidebar**
- The core list stays as it is: map, library, characters, party, combat, chat, settings.
- Entries the manifest adds, with a label it may rename:
  - `combat.label: "Score"`
  - `windows: [{ kind: "ships" }, { kind: "oracles" }, { kind: "delve", gm: true }, { kind: "clocks" }]`
  - `strips: ["fate.sceneAspects"]`

**Settings**
- The ruleset adds rows to the Settings window, built from `SettingsParts`: `settings: [{ key, label, hint, kind: "toggle" | "select" | "checklist", default }]`, or one `custom` part (`Wizard35Setting`).
- This matches FG's `registerOptionData`, with the same names and defaults (PLAN.md section 6).

### 4.3 The manifest types (`shared/rulesets/types.d.ts`)

```ts
export type Who = "owner" | "gm" | "never";
export type Path = string;                    // into record.data, "{key}" = the row's key
export type Hook = string;                    // a data-action / data-* value kept verbatim for tests
export type Ref = `${string}.${string}`;      // a level-3 component: "<ruleset>.<name>" from src/rulesets/<id>/index.ts

export type FieldKind = "text" | "number" | "textarea" | "select" | "check" | "link" | "readonly";
export interface FieldSpec {
  path: Path; label: string; kind?: FieldKind; edit?: Who;
  options?: string[] | { fromType: string };  // select: fixed, or records of a type
  min?: number; max?: number; hint?: string;
  hook?: Hook;                                 // data-stat / data-field value; default = last path segment
}

export interface RollSpec {
  kind: "save" | "check" | "skill" | "attack" | "damage" | "action";
  key?: string;                                // the stat/skill, "{key}" in a row
  via?: "siegeCheck" | { message: string; action: string };  // default siegeCheck; else session.<message>Action
  hook?: Hook;                                 // e.g. "cairn-roll-hp"; default derived from kind/key
}

export type Part =
  | { part: "statBlock"; label: string; rows: { key: string; label: string; short?: string }[];
      columns: { label: string; path: Path; field?: Omit<FieldSpec, "path" | "label"> }[];
      roll?: RollSpec; hook?: string }
  | { part: "derived"; label?: string; boxes: (FieldSpec & { roll?: RollSpec })[] }
  | { part: "track"; label: string; style: "boxes" | "meter" | "segments" | "progress";
      value: Path; max?: Path | number; edit?: Who; action?: { message: string; action: string }; hook?: Hook }
  | { part: "clock"; label: string; path: Path }
  | { part: "list"; label: string; path: Path;
      columns: (FieldSpec & { width?: string })[];
      add?: { fromType?: string | string[]; drop?: boolean; blank?: boolean };
      hook?: string;                               // the row's data-* name: data-item={key}, data-attack={key}
      groupBy?: Path; roll?: RollSpec; rowActions?: { id: Hook; label: string; icon?: string; action: { message: string; action: string } }[];
      empty?: string }
  | { part: "coins"; path: Path }
  | { part: "load"; mode: "weight" | "slots" | "load-level"; path: Path; limits?: Record<string, number> }
  | { part: "notes"; fields: FieldSpec[] }
  | { part: "advancement"; mode: "level" | "milestone" | "growth" | "triggers"; xp?: Path; next?: Path }
  | { part: "row"; parts: Part[] }               // side by side
  | { part: "custom"; component: Ref; props?: Record<string, unknown> };

export interface TabSpec { id: string; label?: string; parts: Part[]; gm?: boolean; feature?: FeatureId }

export interface SheetSpec {
  level: "inherit" | "arrange";                  // "replace" is per part (custom) or per window
  header: { identity: FieldSpec[]; status?: Path };  // under the name: background, class/level, playbook...
  tabs: TabSpec[];                               // "inherit" = the core's tabs (section 4.4)
  className?: string;                            // extra CSS (keeps today's look per game)
}

export type StepKind = "choose-record" | "roll-stats" | "assign-points" | "roll-table" | "pick-list" | "shop" | "text" | "custom";
export interface WizardStep {
  id: string; title: string; kind: StepKind; help: string[];   // FG's per-page lines
  fromType?: string; into: Path;                               // where in the spec it writes
  roll?: { action: Hook; formula?: string };                   // host-rolled, hook kept
  count?: number | Path; component?: Ref; when?: Cond;
}
export interface WizardSpec { hook: Hook; steps: WizardStep[] | Ref }   // hook = data-wizard value

export type Cond =                                // declarative, evaluated by the core
  | { status: string | string[] } | { faction: "friend" | "neutral" | "foe" | "not-friend" }
  | { activeTurn: true } | { gm: true } | { gmOrMine: true }   // mine = entry.mine
  | { viewerHasCharacter: true }                  // CombatTracker's myCharacterId: any player with a character (aid, stabilize)
  | { has: Path }
  | { all: Cond[] } | { any: Cond[] } | { not: Cond };
// A tracker button: a ct message (session.ct(name, args)) or a ruleset message (session.<message>Action(recordId, action)).
export type TrackerCall = { ct: string; args?: Record<string, unknown> } | { message: string; action: string };
export interface TrackerSpec {
  replace?: Ref;                                  // Forged: the Score panel instead of the tracker
  initiative?: { label: string; rollAll: string; hint?: string; none?: string }; // "DEX", "Sides (DEX saves)"
  columns?: { id: string; label: string; from: Path; kind: "number" | "boxes" | "badge" | "select"; gm?: boolean; when?: Cond }[];
  rowActions?: ({ id: Hook; label: string; when: Cond; title?: string; className?: string } & TrackerCall)[];
  headerActions?: ({ id: Hook; label: string; title?: string; gm?: boolean } & TrackerCall)[];   // Cairn's "morale-foes"
  saves?: { keys: string[]; modLabel: string; button: string };  // the GM's "Roll save" box (line 28/416 today)
}

export interface PartySpec {
  currency: string[];                             // [] = no coin (Fate), ["Supply"], ["MCr","Cr"]
  groupCheck?: { stats: string[] };
  xp: "xp" | "growth" | "milestone" | "none";
  tabs?: { id: string; label: string; component: Ref; first?: boolean; gm?: boolean; feature?: FeatureId }[];
}

export type FeatureId =
  | "deathSaves" | "dying.save" | "dying.bleed" | "morale" | "turnUndead" | "multiAttack" | "dread"
  | "clocks" | "crew" | "scorePanel" | "downtime" | "fatePoints" | "sceneAspects" | "stressConsequences"
  | "oracles" | "delve" | "progressTracks" | "momentum" | "assetsCards" | "starships" | "careers"
  | "slots" | "fatigue" | "scars" | "spellbooks" | "thiefSkills" | "encumbrance" | "abilityCards";

export interface RulesetManifest {
  id: string;                                     // data.ruleset on records: "cairn"
  names: string[];                                // campaign names: ["Cairn"]; Fate: ["Fate Core","Fate Accelerated"]
  variants?: Record<string, Partial<RulesetManifest>>;  // per name: Fate Accelerated's approaches, DD's labels
  blurb: string;                                  // SetupScreen's text (moves out of SetupScreen.tsx)
  engine: string;                                 // "shared/cairn/rules.mjs"
  host: { module: string; message?: string; tool?: string };  // "electron/cairn.cjs", "cairn", "kraken_cairn"
  labels?: Record<string, string>;                // PROFILES.labels generalised: ac, hp, species, xp...
  records: Record<string, { sheet?: Ref | "core"; statblock?: Ref; filters?: string[] }>;  // FG's aRecordOverrides
  sheet: SheetSpec;
  wizard?: WizardSpec;
  blank?: boolean;                                // canMakeBlank, now one flag
  tracker?: TrackerSpec;
  party: PartySpec;
  features: FeatureId[];                          // switched on; absent = the core hides it
  settings?: ({ key: string; label: string; hint?: string; kind: "toggle" | "select" | "checklist"; default: unknown; options?: string[] } | { component: Ref })[];
  dice?: { extraTray?: string[]; resultWords?: Record<string, "good" | "mixed" | "bad"> };
  windows?: { kind: string; label: string; icon: string; gm?: boolean; feature?: FeatureId }[];
  strips?: Ref[];
  combatLabel?: string;                           // "Score"
  edit: { text: Path[]; number: Path[]; string?: Path[] };  // the host's whitelist, as glob paths (section 4.7)
}
```

### 4.4 The three levels a ruleset may use

1. **Inherit** (CoreRPG's own sheet). `sheet.level: "inherit"` with no tabs gets the core sheet:
   - Main: a user-defined list of attribute categories and rows, which is what CoreRPG's `charsheet_main` / `list_charmaincategory` is.
   - Inventory with `coins`.
   - Abilities as a free `list`.
   - Notes.

   It is for a future game before it has a layout, and later possibly Worldbuilding. Today Worldbuilding's blank characters use `CCSheet`, so switching it is a visible change and is left to the user (question 2). `blank: true`.
2. **Arrange** (FG 2E). The ruleset lists its tabs and, in each, core parts bound to its paths. Every current sheet except a few Forged, Ironsworn and Fate panels is expressible this way. 2E vs 5E becomes two different `tabs` arrays: 2E's combat tab holds `derived` THAC0 and AC boxes, a `list` of weapons with a `rollBar`, and the `turnUndead` feature part. The look per game is kept with `className` (`sheet-5e d2e`).
3. **Replace** (FG `merge`-by-name / 2E CTA, Foundry's own sheet class). Two scopes:
   - **One part:** `{ part: "custom", component: "forged.rollBar" }` inside the core frame and tabs. The component gets `{ record, session, editable, change, act }`, the same props every part gets. It is real React, and we do not pretend Forged's roll bar can be declarative.
   - **A whole window:** `tracker.replace: "forged.scorePanel"`, `records.npc.statblock: "mgt2.npcBlock"` (Traveller's NpcMgt2), `wizard.steps: "forged.wizard"` (a custom wizard during migration).

**Join** (FG's `merge="join"`) is not a fourth level. A ruleset joins by listing the core tab's parts plus its own. A helper `coreTab("inventory", { append: [...], remove: ["weight"] })` gives the 2E `char_invitem` effect (remove `weight`, add `weighttotal`) without copying.

### 4.5 Three example manifests

#### Cairn (simple)
The hooks, record paths and tracker calls below were checked against `SheetCairn.tsx`, `CombatTracker.tsx` (lines 237-246 and 529) and `electron/cairn.cjs`. The wizard's help lines are paraphrased. In this step they would be copied verbatim from `WizardCairn`.
```js
// shared/cairn/manifest.mjs
import { STATS, STAT_NAMES, SHORT, TRAITS, TRAIT_NAMES } from "./rules.mjs";
const stat = (k) => ({ key: k, label: STAT_NAMES[k], short: SHORT[k] });

export default {
  id: "cairn",
  names: ["Cairn"],
  blurb: "Cairn, Second Edition (Yochai Gal, CC BY-SA 4.0): three attributes and Hit Protection, saves under a d20, ...",
  engine: "shared/cairn/rules.mjs",
  host: { module: "electron/cairn.cjs", message: "cairn", tool: "kraken_cairn" },
  labels: { hp: "HP", ac: "Armor", xp: "Growth" },
  records: { character: { sheet: "core" }, npc: {}, item: {}, background: {}, cairntable: {} },
  features: ["slots", "fatigue", "scars", "spellbooks", "morale", "dying.save"],
  blank: false,
  sheet: {
    level: "arrange",
    className: "sheet-5e sheet-cairn",
    header: {
      identity: [
        { path: "background", label: "Background", kind: "readonly" },
        { path: "age", label: "Age", kind: "number" },
      ],
      status: "status",                                  // "State" box, red, when set
    },
    tabs: [
      { id: "main", parts: [
        { part: "row", parts: [
          { part: "statBlock", label: "Attributes", rows: STATS.map(stat), hook: "attribute",
            columns: [
              { label: "Now", path: "attributes.{key}.score", field: { kind: "number" } },
              { label: "Max", path: "attributes.{key}.max", field: { kind: "number" } }],
            roll: { kind: "save", key: "{key}" } },          // emits data-roll-save="{key}"
          { part: "derived", label: "Defence", boxes: [
            { path: "hp.total", label: "HP", kind: "readonly" },
            { path: "hp.wounds", label: "Wounds", kind: "number" },
            { path: "ac.total", label: "Armor", kind: "readonly" }] } ] },
        { part: "custom", component: "cairn.restStrip" },   // cairn-rest / cairn-sleep / cairn-recover / cairn-deprived / cairn-stabilize, fatigue-add/-remove
      ]},
      { id: "inventory", parts: [
        { part: "load", mode: "slots", path: "slots", limits: { body: 4, pack: 6, total: 10 } },  // slots.used/body/pack/fatigue/coins; data-slots
        { part: "list", label: "Inventory", path: "inventorylist", hook: "item",
          add: { blank: true },                                   // today: a text box -> act("item-add", { text })
          columns: [
            { path: "name", label: "Item" },
            { path: "carried", label: "Where", kind: "select", options: ["0", "1", "2"] },  // numeric in the whitelist (0 elsewhere, 1 body, 2 pack: check labels)
            { path: "uses", label: "Uses", kind: "number" }],
          rowActions: [
            { id: "cast", label: "Cast", action: { message: "cairn", action: "cast" } },   // spellbook / scroll / relic
            { id: "use", label: "Use", action: { message: "cairn", action: "use" } }] },
        { part: "coins", path: "coins" } ]},
      { id: "combat", parts: [
        { part: "custom", component: "cairn.attackMode" },      // the Impaired d4 / Enhanced d12 select
        { part: "list", label: "Attacks", path: "attacks", hook: "attack",   // data.attacks, built by the host's derive()
          columns: [{ path: "name", label: "Weapon" }, { path: "damage", label: "Damage", kind: "readonly" }],
          roll: { kind: "attack", via: { message: "ct", action: "attack" }, hook: "attack" } } ]},
      { id: "character", parts: [
        { part: "notes", fields: [
          ...TRAITS.map((t) => ({ path: `traits.${t}`, label: TRAIT_NAMES[t] })),
          { path: "bond", label: "Bond", kind: "textarea" }, { path: "omen", label: "Omen", kind: "textarea" }] } ]},
      { id: "growth", parts: [
        { part: "list", label: "Scars", path: "scars", columns: [{ path: "text", label: "Scar" }] },
        { part: "list", label: "Growth", path: "growth", columns: [{ path: "text", label: "What changed" }] },
        { part: "list", label: "Milestones", path: "milestones", add: { blank: true },
          columns: [{ path: "name", label: "Milestone" }, { path: "done", label: "Done", kind: "check" }] },
        { part: "advancement", mode: "growth" } ]},
      { id: "notes", parts: [{ part: "notes", fields: [
        { path: "appearance", label: "Appearance", kind: "textarea" }, { path: "history", label: "History", kind: "textarea" },
        { path: "contacts", label: "Contacts", kind: "textarea" }, { path: "notes", label: "Notes", kind: "textarea" }] }] },
    ],
  },
  wizard: { hook: "cairn", steps: [
    { id: "background", title: "1. Background", kind: "roll-table", fromType: "background", into: "background",
      roll: { action: "cairn-roll-background", formula: "1d20" },
      help: ["Roll or choose a background.", "Pick a name from its list; roll on each of its tables."] },
    { id: "tables", title: "1. Background tables", kind: "roll-table", into: "tables", roll: { action: "cairn-roll-table-{i}" }, help: [] },
    { id: "attributes", title: "2. Attributes and Hit Protection", kind: "roll-stats", into: "attributes",
      roll: { action: "cairn-roll-attributes", formula: "3d6" }, help: ["STR, DEX and WIL 3d6 in order; you may swap two once."] },
    { id: "hp", title: "2. Hit Protection", kind: "roll-stats", into: "hp", roll: { action: "cairn-roll-hp", formula: "1d6" }, help: [] },
    { id: "traits", title: "3. Traits, Bond, Age, Omen", kind: "roll-table", into: "traits",
      roll: { action: "cairn-roll-traits" }, help: ["Each trait d10, a Bond d20, age 2d20+10; the youngest roll an Omen."] },
    { id: "gold", title: "4. Gold and the Marketplace", kind: "shop", into: "gear", roll: { action: "cairn-roll-gold", formula: "3d6" }, help: [] },
  ]},
  tracker: {
    initiative: { label: "DEX", rollAll: "Sides (DEX saves)", hint: "The PCs first (each saves DEX to act in the first round)" },
    columns: [{ id: "str", label: "STR", from: "cairn.str", kind: "number" }],
    rowActions: [
      { id: "stabilize", label: "Stabilize", className: "ct-death-save", message: "cairn", action: "stabilize",
        when: { all: [{ status: "Dying" }, { has: "recordId" }, { any: [{ gm: true }, { viewerHasCharacter: true }] }] } },
      { id: "morale", label: "Morale", className: "ct-death-save", ct: "morale", args: { id: "{entry.id}" },
        when: { all: [{ gm: true }, { faction: "not-friend" }, { not: { status: ["Dead", "Routed", "Fleeing"] } }] } },
    ],
    headerActions: [{ id: "morale-foes", label: "Morale", ct: "morale", args: { faction: "foe" }, gm: true }],
  },
  party: { currency: ["gp"], groupCheck: { stats: ["str", "dex", "wil"] }, xp: "growth" },
  edit: {
    text: ["playername", "notes", "appearance", "background", "bond", "omen", "history", "contacts"],
    number: ["attributes.(str|dex|wil).(score|max)", "hp.(wounds|max)", "age", "fatigue", "deprived", "ac.misc",
             "coins.*.amount", "inventorylist.*.(count|carried|uses|charges|slots)", "milestones.*.done"],
    string: ["traits.(physique|skin|hair|face|speech|clothing|virtue|vice)", "inventorylist.*.(name|note|text)",
             "growth.*.text", "milestones.*.name", "scars.*.text"],
  },
};
```
The `edit` block is `electron/cairn.cjs`'s `TEXT` / `NUMBERS` / `STRINGS` written as globs (`*` = `id-\d+`). In the Cairn step, `cairn.cjs` imports the manifest and builds its regexes from it. A test checks that the regex set it builds matches today's exactly, before the hand-written lists are deleted.

#### Basic Fantasy (d20)
This one is **illustrative of the shape**. `data-wizard="bfrpg"`, the `data-action` names (`roll-abilities`, `roll-hp`, `roll-gold`, `attack`, `damage`, `turn-undead`, `level-up`, `wizard-finish`) and the `rules.mjs` constants are real. The sub-paths (`abilities.{key}.bonus`, `saves.{key}.total`, `THIEF_SKILLS[k].name`, `spellbook.*.prepared`) and the tracker condition shapes are not checked. The step that converts BF copies them from `SheetBf.tsx` and `electron/bfrpg.cjs`.
```js
// shared/bfrpg/manifest.mjs
import * as R from "./rules.mjs";
const STAT = (k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), short: R.SHORT[k] });

export default {
  id: "bfrpg", names: ["Basic Fantasy"], blurb: "The Basic Fantasy Role-Playing Game, 4th Edition (free, CC BY-SA): ...",
  engine: "shared/bfrpg/rules.mjs", host: { module: "electron/bfrpg.cjs" },
  labels: { ac: "AC", hp: "HP", xp: "XP" },
  records: { character: { sheet: "core" }, npc: { filters: ["type", "hitDice"] }, item: {}, spell: {} },
  features: ["turnUndead", "morale", "multiAttack", "thiefSkills", "encumbrance", "spellbooks"],
  sheet: { level: "arrange", className: "sheet-5e sheet-bf",
    header: { identity: [
      { path: "race", label: "Race", kind: "readonly" }, { path: "class", label: "Class", kind: "readonly" },
      { path: "level", label: "Level", kind: "readonly" }, { path: "alignment", label: "Alignment", kind: "select", options: R.ALIGNMENTS }] },
    tabs: [
      { id: "main", parts: [
        { part: "row", parts: [
          { part: "statBlock", label: "Abilities", rows: R.STATS.map(STAT),
            columns: [{ label: "Score", path: "abilities.{key}.score", field: { kind: "number" } },
                      { label: "Mod", path: "abilities.{key}.bonus", field: { kind: "readonly" } }],
            roll: { kind: "check", key: "{key}" } },
          { part: "derived", label: "Defence", boxes: [
            { path: "ac.total", label: "AC", kind: "readonly" }, { path: "hp.total", label: "HP", kind: "readonly" },
            { path: "hp.wounds", label: "Wounds", kind: "number" }, { path: "ab", label: "Attack bonus", kind: "readonly" },
            { path: "movement", label: "Move", kind: "readonly" }] } ] },
        { part: "statBlock", label: "Saving throws", hook: "save", rows: R.SAVES.map((k) => ({ key: k, label: R.SAVE_NAMES[k] })),
          columns: [{ label: "Target", path: "saves.{key}.total", field: { kind: "readonly" } }],
          roll: { kind: "save", key: "{key}" } },
        { part: "rollBar" } ]},
      { id: "combat", parts: [
        { part: "list", label: "Attacks", path: "attacks", columns: [{ path: "name", label: "Weapon" }, { path: "bonus", label: "Bonus", kind: "readonly" }, { path: "damage", label: "Damage", kind: "readonly" }],
          roll: { kind: "attack", hook: "attack" }, rowActions: [{ id: "damage", label: "Damage", action: { message: "roll", action: "damage" } }] },
        { part: "custom", component: "bfrpg.turnUndead", props: { feature: "turnUndead" } } ]},
      { id: "skills", feature: "thiefSkills", parts: [
        { part: "statBlock", label: "Thief skills", rows: Object.keys(R.THIEF_SKILLS).map((k) => ({ key: k, label: R.THIEF_SKILLS[k].name ?? k })),
          columns: [{ label: "%", path: "thiefskills.{key}", field: { kind: "readonly" } }], roll: { kind: "skill", key: "{key}" } } ]},
      { id: "spells", feature: "spellbooks", parts: [
        { part: "list", label: "Spellbook", path: "spellbook", groupBy: "level", add: { fromType: "spell", drop: true },
          columns: [{ path: "name", label: "Spell" }, { path: "prepared", label: "Prepared", kind: "check" }] } ]},
      { id: "inventory", parts: [
        { part: "load", mode: "weight", path: "encumbrance" },
        { part: "list", label: "Inventory", path: "inventorylist", add: { fromType: "item", drop: true, blank: true },
          columns: [{ path: "name", label: "Item" }, { path: "count", label: "#", kind: "number" }, { path: "weight", label: "Wt", kind: "readonly" }] },
        { part: "coins", path: "coins" } ]},
      { id: "notes", parts: [{ part: "notes", fields: [{ path: "appearance", label: "Appearance", kind: "textarea" }, { path: "notes", label: "Notes", kind: "textarea" }] },
                              { part: "advancement", mode: "level", xp: "exp", next: "expnext" }] },
    ] },
  wizard: { hook: "bfrpg", steps: [
    { id: "abilities", title: "Abilities", kind: "roll-stats", into: "abilities", roll: { action: "roll-abilities", formula: "3d6" }, help: ["3d6 in order."] },
    { id: "race", title: "Race", kind: "choose-record", fromType: "race", into: "race", help: ["Your scores decide which races you may be."] },
    { id: "class", title: "Class", kind: "choose-record", fromType: "class", into: "class", help: [] },
    { id: "hp", title: "Hit points", kind: "roll-stats", into: "hp", roll: { action: "roll-hp" }, help: [] },
    { id: "spell", title: "First spell", kind: "pick-list", fromType: "spell", into: "spells", count: 1, when: { has: "magicuser" }, help: [] },
    { id: "gear", title: "Equipment", kind: "shop", into: "gear", roll: { action: "roll-gold", formula: "3d6*10" }, help: [] },
    { id: "finish", title: "Finish", kind: "text", into: "details", help: [] } ] },
  tracker: {
    saves: { keys: R.SAVES, modLabel: "Mod", button: "Roll save" },
    rowActions: [
      { id: "turn-undead", label: "Turn", ct: "turn-undead", when: { all: [{ has: "turns" }, { activeTurn: true }, { gmOrMine: true }] } },
      { id: "morale", label: "Morale", ct: "morale", when: { all: [{ gm: true }, { has: "morale" }] } },
      { id: "attack-pick", label: "Attack", ct: "attack", when: { all: [{ gm: true }, { has: "attacks.1" }] } } ] },
  party: { currency: ["pp", "gp", "ep", "sp", "cp"], groupCheck: { stats: R.STATS }, xp: "xp" },
  edit: { text: ["notes", "appearance", "alignment"], number: ["hp.wounds", "coins.*.amount", "inventorylist.*.count", "spellbook.*.prepared"] },
};
```
(The BF edit paths shown are illustrative. The real list comes from `electron/bfrpg.cjs` in that step, under the same matching test as Cairn.)

#### Forged in the Dark (odd)
This one is also **illustrative**. The real parts are:
- the tabs, `data-wizard="forged"` and the `rules.mjs` constants
- the `playbook` and `forgedtable` record types
- these record fields: `data.alias`, `playbook`, `heritage`, `background`, `vice`, `stress`, `trauma`, `harm`, `armor`, `load`, `xp`, `abilities`, `friends`, `projects`, `inventorylist`, `coins`

These are not checked: the special-ability record type (shown as `forgedability`), the `crew` record type, the currency word and the sub-paths.
```js
// shared/forged/manifest.mjs
import { ATTRIBUTES, ACTIONS_BY_ATTRIBUTE, STRESS_MAX, TRAUMA_MAX, XP_TRACKS } from "./rules.mjs";

export default {
  id: "forged", names: ["Forged in the Dark"], blurb: "Forged in the Dark, based on Blades in the Dark (...)",
  engine: "shared/forged/rules.mjs", host: { module: "electron/forged.cjs", message: "forged", tool: "kraken_forged" },
  labels: { xp: "XP" },
  combatLabel: "Score",
  records: { character: { sheet: "core" }, playbook: {}, forgedtable: {}, crew: {} /* unverified */, npc: {} },
  features: ["clocks", "crew", "scorePanel", "downtime"],
  windows: [{ kind: "clocks", label: "Clocks", icon: "hourglass", feature: "clocks" }],
  dice: { resultWords: { CRITICAL: "good", SUCCESS: "good", PARTIAL: "mixed", BAD: "bad" } },
  sheet: { level: "arrange", className: "sheet-5e sheet-forged",
    header: { identity: [
      { path: "alias", label: "Alias" }, { path: "playbook", label: "Playbook", kind: "readonly" },
      { path: "heritage", label: "Heritage" }, { path: "background", label: "Background" }, { path: "vice", label: "Vice" }] },
    tabs: [
      { id: "main", parts: [
        { part: "custom", component: "forged.rollBar" },                     // level 3: position/effect/assist/bargain/push/clock
        { part: "row", parts: ATTRIBUTES.map((a) => ({
          part: "statBlock", label: a[0].toUpperCase() + a.slice(1), hook: "action",
          rows: ACTIONS_BY_ATTRIBUTE[a].map((k) => ({ key: k, label: k[0].toUpperCase() + k.slice(1) })),
          columns: [{ label: "", path: "actions.{key}", field: { kind: "number", min: 0, max: 4 } }],   // dots view
        })) },
        { part: "row", parts: [
          { part: "track", label: "Stress", style: "boxes", value: "stress", max: STRESS_MAX, action: { message: "forged", action: "stress" } },
          { part: "track", label: "Trauma", style: "boxes", value: "trauma", max: TRAUMA_MAX, edit: "never" },
          { part: "custom", component: "forged.traumaPicker" } ] },
        { part: "custom", component: "forged.harm" },                         // three harm levels with slots and penalties
        { part: "custom", component: "forged.armor" },
        { part: "load", mode: "load-level", path: "load", limits: { light: 3, normal: 5, heavy: 6 } },
        { part: "list", label: "Items", path: "inventorylist", columns: [{ path: "name", label: "Item" }, { path: "used", label: "Used", kind: "check" }] } ]},
      { id: "playbook", parts: [
        { part: "row", parts: Object.entries(XP_TRACKS).map(([k, n]) => ({ part: "track", label: `${k} XP`, style: "boxes", value: `xp.${k}`, max: n, action: { message: "forged", action: "xp" } })) },
        { part: "advancement", mode: "triggers" },
        { part: "list", label: "Special abilities", path: "abilities", add: { fromType: "forgedability" }, columns: [{ path: "name", label: "Ability" }] },
        { part: "list", label: "Friends and rivals", path: "friends", columns: [{ path: "name", label: "Name" }, { path: "stance", label: "", kind: "select", options: ["friend", "rival"] }] } ]},
      { id: "downtime", feature: "downtime", parts: [{ part: "custom", component: "forged.downtime" }, { part: "list", label: "Long-term projects", path: "projects", columns: [{ path: "name", label: "Project" }] }] },
      { id: "notes", parts: [{ part: "notes", fields: [{ path: "notes", label: "Notes", kind: "textarea" }] }] },
    ] },
  wizard: { hook: "forged", steps: "forged.wizard" },                       // custom until the step kinds cover it
  tracker: { replace: "forged.scorePanel" },                               // like 2E's CTA replacing combattracker_host
  party: { currency: ["coin"], xp: "xp",
    tabs: [{ id: "crew", label: "Crew", component: "forged.crewSheet", first: true, feature: "crew" }] },
  edit: { text: ["alias", "heritage", "background", "vice", "notes"], number: ["actions.*", "coins.*.amount"] },
};
```
About half of Forged's sheet stays as level-3 components, and that is fine. They live inside the core frame, tabs, header, lists and notes, so Forged no longer carries its own copy of those (about 230 of its 589 sheet lines).

### 4.6 Optional feature slots

A feature is a folder in `src/core/features/<id>/` that can contribute any of these:
- a sheet part, which manifests place by name
- a tracker column or row action, with default `when`
- a party tab
- a sidebar window
- a desktop strip
- settings
- a dice-tray entry
- its host handler and agent tool, which exist already (`clocks.cjs`, `starships.cjs`, `fateCombat.cjs`, `ironsworn.cjs`)

Core code never asks "which game is this". It asks `has("morale")`. A feature not listed in `features` renders nothing, opens no window and adds no column.

| Feature | Today | Sheet | Tracker | Party | Window / strip |
|---|---|---|---|---|---|
| `deathSaves` | 5E, `CombatEntry.deathsaves` | track (boxes) | row action, when Dying | - | - |
| `dying.save` / `dying.bleed` | Cairn, 2E, DD | - | row action | - | - |
| `morale` | BF, Cairn | - | GM row action, header "morale-foes" | - | - |
| `turnUndead` | 2E, BF (`turns`) | combat part | row action on own turn | - | - |
| `dread` | DD (`PROFILES.dread`) | track | column | - | - |
| `clocks` | Forged or any campaign with clocks | clock part | - | - | Clocks window |
| `crew` | Forged | - | - | first tab | - |
| `scorePanel` | Forged | - | replaces the tracker | - | sidebar "Score" |
| `fatePoints`, `stressConsequences` | Fate | track | `fate` column and the absorb flow | milestone tab | - |
| `sceneAspects` | Fate | - | - | - | `FateStrip` |
| `oracles`, `delve` | Ironsworn, Starforged | - | - | - | windows (Delve GM-only) |
| `progressTracks`, `momentum` | Ironsworn | track (progress) | `iron` columns | - | - |
| `starships` | Traveller, Astra | - | ship row | - | Starships window |
| `slots`, `fatigue`, `scars` | Cairn | load(slots), list | - | growth tab | - |
| `abilityCards` | (future: Ironsworn assets now, Daggerheart later) | card list part | - | - | - |

A feature can also hang off a setting, like FG's `sOption = "HRBASTION"`: `{ feature: "encumbrance", setting: "OPTIONAL_ENCUMBRANCE" }`. Then the part exists only when the game has the feature and the GM has it on.

### 4.7 The host side (electron) and the engines

- **Keep `shared/<id>/rules.mjs` as the engines.** The manifest's `engine` names one, and nothing moves out of it. Normalise `RULESET` / `KEY` while doing this: Forged has `RULESET = "Forged in the Dark"`, `KEY = "forged"`, while Cairn has `RULESET = "cairn"`. The manifest's `id` and `names` replace both.
- **One registry for both id spaces.** Campaigns use names ("Cairn", "Fate Core", "Fate Accelerated", "Ironsworn", "Starforged", "D&D 5E", "Descending Darkness") and records use ids (`data.ruleset: "cairn"`, `"dnd5e"`, `"descending"`). `rulesetFor(x)` accepts either and returns the manifest, with the variant applied.
  - Variants: Fate Accelerated gets six approaches instead of skills; Descending Darkness gets `PROFILES.descending`'s labels, `dying: "bleed"` and `dread`.
  - Castles & Crusades is the manifest for records with no `data.ruleset`. Today that is `CCSheet` as the fallback.
- **The host registers handlers, the FG way.** Each `electron/<id>.cjs` exports a `hooks` object, and `combat.cjs` / `party.cjs` call the active manifest's hook (or a core default) instead of branching:
  ```js
  // electron/cairn.cjs
  module.exports.hooks = {
    rollInitiative: (table, entries) => ...,          // DEX saves -> sides
    onDamage: (table, entry, result) => ...,          // STR damage, scars (combat.cjs:1215 today)
    onTurnStart, onRoundStart, morale, dyingSave,
    awardXp: null,                                    // Cairn has none: party.cjs:141's check becomes "no hook"
    projectEntry: (entry, record) => ({ cairn: { str, max, detachment, lostTurn } }),
  };
  ```
  `combat.cjs`'s `five()`, `cairnOn()`, `fateOn()`, `ironOn()`, `d35()`, `d2e()` and `dbf()` (66 checks) become `const rs = rulesetFor(table().ruleset?.()); rs.hooks.X?.(...) ?? core.X(...)`. Rules that are really the core's (d20 attack against AC is shared by five games) stay in core, chosen by a manifest flag (`attack: "d20-vs-ac" | "thac0" | "2d6-effect" | "always-hits"`). They do not become one copy per ruleset.
- **The edit whitelist comes from the manifest.** Each `edit<Ruleset>` keeps its own semantics (recompute with `derive()`), but its allowed paths come from `manifest.edit` (globs compiled to the same regexes). A test in each step compares the compiled set with the old one.
- **Messages and tools stay as they are** (`cairn` -> `kraken_cairn`, and so on). The manifest records them (`host.message`, `host.tool`) so tooling can check them. It does not generate them.

### 4.8 Agent tools, coverage and tests keep working

- **Hooks are emitted by the parts and are verbatim.** Every core part writes the same attributes the hand-written sheets do today:
  - `data-sheet-tab`, `data-tab-page`, `data-character`, `data-ruleset`
  - `data-stat` / `data-field`, `data-attribute` / `data-ability` / `data-skill` (from the statBlock's `hook`)
  - `data-roll-save` / `data-roll-check` / `data-roll-skill` and `data-action`
  - `data-wizard` and `data-coin-left`

  A ruleset-prefixed name such as `data-action="cairn-roll-hp"` is written in the manifest (`roll.action`), so the tests' selectors do not change. A part never invents a hook. It takes it from the manifest, or uses the documented default.
- **`aria-label`s stay.** The e2e plans select by them (`select[aria-label="Background"]`, `"Name from the background"`). FieldSpec `label` is the aria-label, and the step keeps today's text.
- **A new check, `scripts/check-manifests.mjs`**, run inside `npm run coverage`. For every manifest it checks:
  - every `Ref` resolves to an exported component
  - every `roll` / row action / wizard action names a message `check-coverage.mjs` maps to a tool
  - every editable field path is matched by `edit`, and every `edit` path is used by some field or action (no dead permission)
  - hooks are unique within a sheet
  - every `FeatureId` has a folder
  - the manifest's `names` match `SetupScreen`'s list (which now comes from the registry)
- **The agent can read the layout.** `kraken_characters` (or a new `kraken_ruleset_info`) can return the manifest's tabs and fields. The agent then knows every field on a sheet and its path without reading React. That is the AI-first rule doing double duty.

---

## 5. Migration plan

**Rules for every step**
- It is a separate commit series on its own branch. It ships nothing visible except the same screens.
- The safety net for each step (all of these exist in `package.json` / `scripts/`):
  - **Types:** `npm run build`, which runs `tsc --noEmit` and the Vite build. There is no separate typecheck script.
  - **Host checks:** the ruleset's `npm run <id>` (`check-cairn.mjs`, `check-bfrpg.mjs`, `check-adnd2e.mjs`, `check-dnd35.mjs`, `check-dnd5e.mjs`, `check-mgt2.mjs`, `check-astra.mjs`, `check-fate.mjs`, `check-ironsworn.mjs`, `check-forged.mjs`), plus `npm run combat` / `party` / `character` / `wizard` where the step touches them. `npm run checks` (`run-checks.mjs`) is the catch-all.
  - **Coverage:** `npm run coverage`, plus `check-manifests` once it exists.
  - **UI:** the ruleset's `npm run <id>-ui` (`verify-<id>-ui.mjs`).
  - **End to end:** `node scripts/e2e-ruleset.mjs "<Name>"`, which must pass with the same step count as before. `scripts/e2e/rulesets.mjs` has plans for all 15 names, including `fatePlan("core"/"fae")` and `ironswornPlan("Ironsworn"/"Starforged")`.
  - **Look:** before/after screenshots with `scripts/shot-sheet.mjs`, `shot-wizard.mjs` and `shot-all-windows.mjs` (the full-screen audit) for the sheet, wizard, tracker and party sheet, to catch visual drift.
  - **Player view:** a check in Chrome.
- Count the ruleset checks (section 3.1 grep) before and after, and write the number into PLAN.md each step.

| # | Step | Deletes / shrinks | Safety net | Size |
|---|---|---|---|---|
| 0 | **Extract the frame, no behaviour change.** Move `Field` from `CCSheet.tsx` to `src/core/fields/Field.tsx`. Add `SheetFrame` (article, header, portrait/token, ArtPicker, identity boxes, tab rail, hooks). Rewrite all 11 sheets to use it, keeping their pages as children. | ~35-50 duplicated lines from each of 11 sheets (~450) | all 11 `verify-*-ui`, e2e for C&C and Cairn as a spot check, audit | +250 / -450; 1 day |
| 1 | **The registry.** `shared/rulesets/registry.mjs` with a stub manifest per ruleset (id, names, blurb, engine, host, features, sheet as `Ref` to today's component, wizard as `Ref`, `blank`, `combatLabel`, `windows`, `strips`, `dice`, `party.currency`). Replace CharacterPanel's two ternaries and `canMakeBlank`, Desktop's sidebar entries, Settings' two rows, ChatDock's tray, PartySheet's `coinsFor`, and SetupScreen's `RULESETS`. | src checks 126 -> ~60 (CharacterPanel 50 -> 0, Desktop 9 -> 0, Settings/ChatDock 3 -> 0, Party `coinsFor`) | full `verify-rulesets-ui`, `verify-sidebar-ui`, `verify-charselect-ui`, every e2e plan (`all`) | +500 / -250; 1-2 days |
| 2 | **Core parts + Cairn (arrange).** Build `statBlock`, `derived`, `track`, `list`, `coins`, `load(slots)`, `notes`, `advancement(growth)` and `SheetRenderer`. Cairn's sheet becomes its manifest plus `cairn.restStrip`. `cairn.cjs` takes its whitelist from `manifest.edit` (with the matching test). | `SheetCairn` sheet half (400 -> ~60 custom), Cairn's whitelist lists | `npm run cairn`, `cairn-ui`, e2e "Cairn", `shot-sheet` | parts +900; Cairn +180 / -340; 3-4 days (the parts are the cost) |
| 3 | **Wizard frame + Cairn wizard.** `WizardFrame`, step kinds `roll-table`, `roll-stats`, `shop`, `text`, built from `Wizard5e`'s `Plate` and `Choose`. | `WizardCairn` 291 -> manifest steps + ~40 | e2e "Cairn" (it drives the wizard by hook), `verify-cairn-ui` | +500 / -250; 2 days |
| 4 | **Combat tracker and party sheet from manifests.** `TrackerSpec` columns, row actions, `initiative`, `saves`, `replace`. `PartySpec` xp mode, groupCheck, extra tabs. Do it for every ruleset at once, because the 43 tracker checks sit in one file and the host already projects the data. | `CombatTracker.tsx` 43 -> 0, `PartySheet.tsx` 12 -> 0, `Records.tsx` 4 -> 0 (`records.npc.statblock`) | e2e `all` (every plan fights and hands out a parcel), `verify-combat-hand-ui`, `verify-order-ui`, `verify-fate-ui`, `verify-ironsworn-ui` | +400 / -350; 2-3 days |
| 5 | **Basic Fantasy.** Adds `rollBar`, saves statBlock, `spellbooks`, `thiefSkills`, `turnUndead` part, `load(weight)`; the wizard gets `choose-record` and `pick-list`. | `SheetBf` 613 -> ~120 custom + manifest | `verify-bfrpg-ui`, e2e "Basic Fantasy" | +250 / -450; 2 days |
| 6 | **d20 family: 5E (+DD as a variant), 3.5E, 2E.** 2E is the "own layout" proof: a different tab list and combat tab from the same parts. `PROFILES` folds into the manifests' `labels` and `variants`. The Wizard5e/35/2e files move onto `WizardFrame` page by page. Each keeps its pages as `custom` steps until they are rewritten. | `Sheet5e` 393, `Sheet35` 384, `Sheet2e` 381 -> ~80 custom each; wizards 932 + 1003 + 1220 shrink ~30% in this pass | `verify-dnd5e-ui`, `verify-dnd35-ui`, `verify-adnd2e-ui`, `verify-descending-ui`, e2e for each of 4 | +400 / -900 (sheets) + -900 (wizards); 4-5 days |
| 7 | **2d6 family: Traveller, Apeira Astra.** `starships` feature, `careers` step kind (terms), NPC statblock slot. | `SheetMgt2` 329, `SheetAstra` sheet 406 -> ~60 each; `WizardAstra` 186, `WizardMgt2` 421 onto the frame | `verify-mgt2-ui`, `verify-astra-ui`, `verify-starships-ui`, e2e "Traveller" and "Apeira Astra" | +250 / -700; 3 days |
| 8 | **Castles & Crusades.** Last of the "classic" sheets, because it is the parity game against SiegeCore and has the most FG-faithful UI. Its look stays (its `className`). C&C is also today's fallback for records with no `data.ruleset` (CCSheet ends the ternary), so the registry's default must stay C&C. | `CCSheet` 691 -> ~120; `Wizard.tsx` 1251 onto the frame | `npm run character`, `wizard`, `attack`, `spells`, `combat`; `npm run check` (`check-foundry-parity.ts`); `verify-charselect-ui`; e2e "Castles & Crusades" | +200 / -900; 3 days |
| 9 | **Fate.** `fatePoints`, `stressConsequences` (absorb flow as a custom part), `sceneAspects` strip, the variant for Accelerated, Fate dice tray. | `SheetFate` sheet 396 -> ~150; `WizardFate` 199 | `npm run fate`, `fate-ui`, e2e "Fate Core" and "Fate Accelerated" | +200 / -400; 2-3 days |
| 10 | **Ironsworn / Starforged.** `progressTracks`, `momentum`, `oracles`, `delve`, assets as `abilityCards`, moves as a list with a custom roll. | `SheetIronsworn` sheet 725 -> ~250; `WizardIronsworn` 189 | `npm run ironsworn`, `ironsworn-ui`, e2e "Ironsworn" and "Starforged" | +250 / -600; 3 days |
| 11 | **Forged in the Dark.** Most level-3 parts: roll bar, harm, armor, downtime, `scorePanel` replaces the tracker, the crew party tab. | `SheetForged` sheet 589 -> ~350; wizard 189 custom | `verify-forged-ui`, e2e "Forged in the Dark" | +200 / -400; 2-3 days |
| 12 | **The host side.** `hooks` per `electron/<id>.cjs`. In `combat.cjs`, 66 checks plus 115 helper call-site lines; in `party.cjs`, 20; in `siege.cjs` and `tableServer`, 4 each; in `tools.cjs`, the 11-hit `build` chain. Each becomes a hook call or `has(feature)`. Read `mapState.cjs`'s 6 hits and `deathMarkers.mjs`'s 4 first (not studied). This can run alongside steps 5-11, one ruleset's hooks with each step. | electron checks 124 (+115 call sites) -> ~15 (registry and dispatch) | `npm run combat`, `party`, `attack`, `checks`; e2e `all` | +400 / -600; 4-5 days |
| 13 | **`check-manifests.mjs` made strict** (every rule in 4.8 fails the build). | - | `npm run coverage` | +150; 0.5 day |

The core "inherit" sheet (CoreRPG's category lists) is **not** in this plan, because it would be a visible change. Today a blank character in C&C or Worldbuilding (`canMakeBlank`) renders `CCSheet`, so Worldbuilding keeps that until the user decides (question 2).

**Rough total:** 6-8 weeks of focused work.
- **`src/characters` today** is about 12,100 lines (all `.tsx`/`.ts` in the folder). The sheet and wizard steps above remove about 6,500 lines from it.
- **Across the repo**, the table's own figures come to roughly +5,500 / -7,500. Part of the +5,500 is the core parts and features (~2,500), which every later game reuses. The rest is manifests (~150-250 lines each) and the level-3 parts.
- **Ruleset checks** fall to about 15, all in dispatch code.
- **A new game** then costs a manifest plus its custom parts. Today it costs a new 600-900 line sheet, a wizard and edits to about 10 shared files.

---

## 6. Risks and open questions for the user

**Risks**
1. **Look drift.** Every sheet today has small hand-tuned differences (Cairn's red State box, 2E's THAC0 panel). Mitigation: the per-ruleset `className`, plus the full-screen audit before and after every step. "Same screens" is the acceptance test, not "close enough".
2. **Hidden behaviour in hand-written sheets**, such as local state in Forged's roll bar, or a field that sends an action instead of an edit. Mitigation: go file by file, and keep anything unclear as a `custom` part first.
3. **Performance.** A data-driven renderer re-rendering the whole sheet on each record change is slower than hand-tuned components. Mitigation: memoise each part on its bound paths (each part reads only its own slice), and measure open-sheet time and keystroke latency on a 2E character with a big inventory before and after step 2.
4. **The host refactor (step 12) touches combat for every game at once.** Mitigation: do one ruleset's hooks per step, never "all of combat.cjs", and run e2e `all`.
5. **The e2e runs are long and drive the real app.** All 15 rulesets have a plan, but a step that touches the tracker (step 4) or the host (step 12) needs `e2e-ruleset.mjs all`. Mitigation: run it in the background on the left monitor, and look at `results.json` and the step counts, not only PASS/FAIL.
6. **Over-abstraction.** If a part needs more than two flags for one game, that game gets a `custom` part instead.

**Questions for you**
1. **How free should a ruleset's look be?** Should every game share one sheet style, with only the layout changing (FG CoreRPG-themed), or should each game keep its own colours and frames (FG 2E has its own graphics)? The design supports both through `className`. This decides how much CSS stays per game.
2. **Should the GM be able to change layouts?** For example, move a part, or add a field on the "inherit" sheet. CoreRPG lets a player add attribute categories. Doing this for every game is a later feature.
3. **Manifest format:** plain `.mjs` objects (proposed: typed through `types.d.ts`, shared by host and client, comments allowed), or JSON (loadable from a user folder, so a future third-party ruleset could ship as data plus a small JS file)?
4. **Third-party rulesets.** Should Kraken one day load a ruleset from `Documents/Kraken VTT/Rulesets` (like FG `.pak` and Foundry systems)? If so, the custom parts need a plugin boundary. That affects the Ref naming now, but not the work.
5. **Order.** The plan goes simplest first (Cairn, BF, the d20 family, then C&C), so C&C, the parity game, changes late. Do you want C&C earlier because it is played most?
6. **Wizards.** Should the d20 wizards move onto the frame page by page (proposed), or stay as they are until the sheets are done?
7. **Experience naming.** Should "XP" in the party sheet follow each game's word (Growth, Milestones, XP triggers, Legacy), as the manifest's `labels` allow, or should the core keep one word with the game's term as a tooltip?

## Decisions (2026-11-14, the user)

1. A game may keep its own look (colours, paper, frame art), as FG's 2E sheet does, while using the core frame and parts; the parchment D&D / Descending Darkness look stays.
2. Layouts are the ruleset's to decide (as in FG); no GM or player layout editing for now.
3. The manifest is a `.mjs` file (shared/<id>/manifest.mjs).
4. Third-party rulesets loaded from Documents/Kraken VTT: later; the format leaves room.
5. Castles & Crusades moves late, onto a core proven on simpler games first.
6. The wizards move after the sheets.
7. Advancement uses each game's own word (Growth, Milestones, Legacy, Marks); Worldbuilding moves to the generic core sheet.
