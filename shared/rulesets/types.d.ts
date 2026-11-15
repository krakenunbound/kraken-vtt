// The ruleset manifest: what a game is, as data (docs/core-ui-design.md, 4.3).
// Each game's shared/<id>/manifest.mjs is one of these; the host (electron)
// and the client (src) read the same file. React components are never in a
// manifest: it names them (a Ref, "cairn.sheet"), and src/rulesets/index.tsx
// supplies them. Optional features are switched on by `features`; a feature
// a game does not list renders nothing, opens no window and adds no column.

export type Who = "owner" | "gm" | "never";
export type Path = string; // into record.data; "{key}" = the row's key
export type Hook = string; // a data-action / data-* value kept verbatim for tests and agents
export type Ref = `${string}.${string}`; // a level-3 component: "<ruleset>.<name>" from src/rulesets/index.tsx

export type FieldKind = "text" | "number" | "textarea" | "select" | "check" | "readonly";
// A text that may depend on the row or a sheet modifier ("{path}" filled in; "[...]" kept only when its values are there):
// { by: "kind", map: { relic: "Use" }, else: "Cast" }; by "modifier:mode" reads a sheet modifier.
// { if: Cond, then, else }: a text by a condition on the row or the record.
// { format: Ref }: a game's formatter's words for the row (or the record), given the row's key and the record's data.
export type Text = string | { by: string; map: Record<string, string>; else: string } | { if: Cond; then: string; else: string } | { format: Ref };
// Texts shown as one text node each, as JSX writes "Level {level}" ("Level ", "3"): a sheet that must not move a pixel.
export type Nodes = Text | Text[];
// What a button or a field sends instead of an edit: a ruleset message (session.<message>Action(record, action, args)),
// a tracker message (session.ct(ct, { recordId, ...args })), or a roll (session.siegeCheck). key / value: the argument
// names that carry the row's key and the field's value.
// problem: the sheet modifier that shows the host's refusal (cleared when it is sent), as a sheet's error line reads it.
export type ActionCall =
  | { message: string; action: string; key?: string; value?: string; args?: Record<string, unknown>; modifiers?: string[]; problem?: string }
  | { ct: string; key?: string; value?: string; args?: Record<string, unknown>; modifiers?: string[] }
  // A roll (session.siegeCheck): bonus names the sheet modifier added to it; keyAs "skill": the key goes as the skill;
  // fight: a save while in a fight goes through the tracker (its effects count).
  // dc / advantage: the sheet modifiers sent as the roll's DC (a save in a fight: its cl) and advantage.
  | { roll: "save" | "check" | "skill" | "morale"; key?: string; bonus?: string; keyAs?: "skill"; fight?: boolean; dc?: string; advantage?: string };

export interface FieldSpec {
  path: Path; // relative to the row in a list
  label: Text; // the aria-label the tests and the agent select by ("{key} now")
  kind?: FieldKind; // no kind: shown, not typed into
  edit?: Who;
  options?: { value: string; label: string }[];
  number?: boolean; // a select whose values are numbers
  default?: unknown; // shown when the path is empty
  title?: Text;
  hook?: Hook; // data-stat value
  attr?: string; // a data-* attribute that carries the value (data-cairn-status)
  color?: Text; // a value shown in this colour (a status; a text: by a condition)
  note?: string | Text[]; // the small text under a labelled field (its label by default); a list: one text node each
  // The labelled box around it (in the header or a notes part): more classes, its title, a data-* on it.
  box?: { className?: string; title?: Text; attr?: { name: string; value: Text } };
  fieldClass?: string; // a typed text field's own classes (Fate's "fate-aspect")
  bare?: boolean; // no label box around it
  action?: ActionCall; // sent as an action, not an edit
  when?: Cond;
  show?: Nodes; // shown: this template instead of the path's value ("{className} {level}"); a list: one text node each
  lines?: boolean; // a textarea of a list: one item a line
  zeroIsEmpty?: boolean; // 0 shows the default too (a count of 0 shows 1, as the hand-made sheets did)
  format?: Ref; // shown: a formatter's text from the record (a class worked out from its packages)
  join?: { item: string; sep: string }; // shown: the path's rows, each as item, joined ("Fighter 3 / Thief 2")
  className?: string; // shown: more classes on its span ("mgt2-upp")
  locked?: "num"; // a number field that, for a viewer who may not type, is a number box (cc-num), not a field
}

export interface RollSpec {
  action: ActionCall;
  label: Nodes;
  send?: Text; // what is sent as the roll's key (a skill's name), when not the row's key
  disabled?: Cond; // greyed also while this holds (besides when the viewer may not type)
  title?: Text;
  aria?: Text;
  hook: string; // the data-* attribute the button carries the row's key in: "roll-save" -> data-roll-save="str"
  column?: string; // its column's heading in a stat block ("Save")
  className?: string; // default "cc-bonus"
}
export interface StepSpec {
  hook?: Hook; // data-action (none: no data-action)
  label: string;
  title?: string;
  aria?: string;
  className?: string;
  action: ActionCall;
  disabled?: Cond;
}
// A line of small things in a derived box: "Wounds [field] Temp [field]", "Touch <b>12</b> · Flat-footed <b>14</b>".
export interface BoxLine {
  sep?: string; // between two items (default " ")
  items: ({ before: string } & ({ field: FieldSpec } | { value: Path; hook?: Hook }))[];
}
export interface BoxSpec {
  label: string | string[]; // a list: one text node each ("Supply", " (shared)")
  title?: Text;
  attr?: { name: string; value: string }; // a data-* on the box (data-meter="health")
  // remaining: path (+ plus) less minus, "/ path" (HP); text: a template (text); field: a field in the box (field)
  show: "value" | "remaining" | "shield" | "text" | "field";
  path: Path;
  minus?: Path;
  plus?: Path;
  text?: Nodes; // a list: one text node each ("END ", "8", " · STR ", ...)
  field?: FieldSpec;
  lines?: BoxLine[]; // small lines under the number, each its own span
  // What the shown number means, the first that holds (Dead at -10, Dying under 0...): a hint with data-status.
  states?: { status: string; text: string; atMost?: number; under?: number; equals?: number; when?: Cond }[];
  when?: Cond;
  hook?: Hook;
  danger?: boolean; // red at 0 or less
  dangerWhen?: Cond; // red while this holds (Traveller's Unconscious or Dead)
  fields?: (FieldSpec & { before?: string })[]; // small fields beside it (Lost, Max)
  warn?: { when?: Cond; atZero?: boolean; text: Text; attr?: { name: string; value: string } }; // atZero: when what is shown is 0 or less; attr: a data-* it carries
  steps?: StepSpec[]; // + and - (Fatigue), the owner's
  format?: "signed"; // +2
  suffix?: string; // after the number (movement's ')
  note?: Text; // a small hint under the number
}
export interface ListAction {
  hook: Hook;
  label: Nodes;
  title?: Text;
  className?: string;
  when?: Cond;
  action: ActionCall;
}
export interface Modifier {
  key: string;
  kind: "check" | "select";
  label: string; // the check's words, or the select's aria-label
  title?: string;
  options?: { value: string; label: string }[];
  place: "top" | "bottom";
}

export type Part = (
  // base: the section's classes (default "cc-panel five-abilities"); heading: an h4 in place of the column heads;
  // rowClass / rowTitle: each row's classes and title; plain: the row's name without a title; notes: lines under it.
  | ({ part: "statBlock" } & StatBlockSpec)
  // A box may be a game's own (custom: a Ref); hint: a line under the boxes.
  | { part: "derived"; className?: string; boxes: (BoxSpec | { custom: Ref; when?: Cond })[]; hint?: Text }
  | { part: "list"; label?: string; path: Path; hook?: string /* no data-* on a row without */; count?: string; className?: string; select?: FieldSpec; check?: FieldSpec; name: { path: Path; else?: string; bold?: boolean; title?: Path[]; flat?: boolean /* the name and details straight in the row, not in a span */; after?: Text /* words right after the name (" ×3") */ }; details?: { text?: string; format?: Ref; when?: Cond }[]; sep?: string; hideEmpty?: boolean /* no details line when none */; fields?: FieldSpec[] /* typed into, after the select */; small?: Text[] /* the details as text nodes, in place of details */; smalls?: ListSmall[]; rowActions?: ListAction[]; remove?: { aria: Text; title?: string; action?: ActionCall }; add?: { label: string; note: string; action: ActionCall }; modifier?: Modifier; empty?: string }
  // word: a fixed word in place of the coin's name ("credits"); before: the word goes before the field ("Cr 2500").
  | { part: "coins"; path: Path; className?: string; none?: { text: string; unless: string }; aria?: Text /* default "{name} coins" */; upper?: boolean /* the coin's name in capitals */; word?: string; before?: boolean }
  | { part: "load"; mode: "slots"; hook: string; used: Path; total: number; text: string }
  // section: the fields in a panel of their own (a <section> with its classes and aria-label), in place of className's div.
  | { part: "notes"; fields: FieldSpec[]; className?: string; section?: { className: string; aria: string } }
  | { part: "advancement"; mode: "growth"; title?: string; rolls: StepSpec[] }
  | { part: "hint"; text: Nodes; plain?: boolean /* a <p> without the hint style */ }
  // text as a list: its nodes exactly, with no space added before the hint
  | { part: "heading"; text: string | Text[]; targets?: boolean; hint?: Nodes }
  // A row of records' rows (thief abilities, skills): each a field, its name and a roll.
  // rows: fixed rows (every skill of the game, in the data or not), each row's data at path.{key}, named by its
  // label with its note in a small hint; else name is a path in each row. head: column heads; mark: words before the name.
  // sort: the rows by this field of each (a skill's name); note: a small hint after the name (a text on the row);
  // more: a game's own words after it (a custom part, given the row); remove: the row dropped (×); empty: shown with no rows.
  | { part: "skills"; path: Path; hook: string; className?: string; rows?: { key: string; label: string; note?: string }[]; head?: { className: string; labels: string[] }; rowClass?: Text; rowTitle?: Text; mark?: { when: Cond; text: string }; field: FieldSpec; name?: Path; roll: RollSpec; sort?: Path; note?: Text; more?: Ref; remove?: { aria: Text; title?: string }; empty?: string }
  // Boxes to tick off (spells a day): max is a number or a list (a row of boxes for each, as a level's slots);
  // used the count ticked (a list alike); a click ticks up to that box, or back.
  // each: one track per row of a list (2E's casting classes), max and used then in the row; first: the first row's
  // hook number (default 1); zero: a row with no boxes shows this (a null count never shows a row).
  | { part: "track"; style: "boxes"; className: string; attr?: { name: string; value: Text }; intro?: Nodes; max: Path; used: Path; rowClass: string; rowHook: string; labels: string[]; aria: Text; empty?: string; each?: Path; first?: 0 | 1; zero?: string }
  // The strip over every tab (FG's level and experience line): level and level-up, experience, values, the next roll's modifiers.
  | { part: "strip"; className?: string; items: StripItem[] }
  // A line of words from lists: "<b>Feats:</b> Alert, Tough" (hook: its data-list), none when empty.
  | { part: "tags"; label: string; hook: string; from: Path[] }
  | ({ part: "button" } & StepSpec)
  | { part: "row"; parts: Part[]; className?: string }
  | { part: "custom"; component: Ref; props?: Record<string, unknown> }
  // Bookkeeping's Supplies (src/bookkeeping/Supplies.tsx): the load meter and containers, ammunition,
  // consumables, rations and water, light, exhaustion and the rests the game's bookkeeping declares.
  // Placed by the core at the end of the tab holding the inventory list when a manifest does not place it.
  | { part: "supplies" }
) & { when?: Cond; gm?: boolean };

// A column is a field (wrap: a span around it; extra: a second field after it while when holds) or a roll;
// headClass: the column heads' classes; inner: a block of more rows inside the section (3.5E's saves);
// rowNote: a small note after each row, from a formatter (2E's ability tables).
export interface StatBlockSpec {
  label: string;
  hook: string;
  className?: string;
  rows: { key: string; label: string; short?: string }[];
  columns: ({ label: string; path: Path; field: Omit<FieldSpec, "path">; wrap?: string; extra?: { when: Cond; before: string; field: FieldSpec } } | { label: string; roll: RollSpec })[];
  roll?: RollSpec;
  base?: string;
  heading?: { text: string; hint?: string };
  head?: false;
  headClass?: string;
  rowClass?: string;
  rowTitle?: Text;
  rowNote?: { format: Ref; className: string; row: Path /* the row's data: "abilities.{key}" */ };
  // A small inside the row's name, after it, while when holds (Traveller's "now 5" on a wounded characteristic).
  nameSmall?: { text: Nodes; className: string; attr?: string /* data-<attr>="{key}" */; when: Cond };
  plain?: boolean;
  notes?: Path;
  inner?: StatBlockSpec;
}
export interface ListSmall {
  text: Nodes;
  place: "name" | "end"; // after the name, or after the buttons
  title?: string;
  attr?: { name: string; value: string };
  when?: Cond;
}
export type StripItem =
  // The level (data-stat="level") and its level-up: the owner once the experience is there, or the GM, under max.
  // title: the level-up's (a text: by the level); hint: the line's own title; atLeast: the level shown when there is none.
  | { kind: "level"; path: Path; exp: Path; next: Path; max: number | string; title: Text; hint?: string; atLeast?: number }
  // A level per class (a multi-class character's), each with its own level-up (session.levelUp(record, class));
  // hook: the formatter that names a class's data-stat ("level-{key}").
  | { kind: "levels"; path: Path; exp: Path; next: Path; max: number; title: Text; buttonTitle: Text; hook: Ref }
  // word: its bold word (default XP); no next: no "/ next"; edit "gm": only the GM types it.
  // shown: the experience as a number box (data-stat=hook) and its next, with the GM's field after them (Basic
  // Fantasy's); note: a small after it while when holds (+10% XP).
  | { kind: "xp"; path: Path; next?: Path; label: string; word?: string; edit?: "gm"; shown?: { hook: Hook }; note?: { when: Cond; text: Nodes } }
  | { kind: "value"; label: string; path: Path; hook: Hook; title?: string; format?: "signed" }
  // A sheet modifier the rolls read (DC, Mod): a number kept while the sheet is open.
  // plain: the label as plain words, not bold; input: the field's classes (default "cc-field number"); width: in em;
  // start: its value when the sheet opens (default 0); no min or max: none.
  | { kind: "modifier"; key: string; label: string; aria: string; title: string; min?: number; max?: number; plain?: boolean; input?: string; width?: number; start?: number }
  // A choice the rolls read; label: in a labelled box (<b>label</b>, then the select); number: its values are numbers;
  // start: its value when the sheet opens (default the first option's).
  | { kind: "choice"; key: string; aria: string; options: { value: string; label: string }[]; title?: string; label?: string; number?: boolean; start?: string | number }
  | { kind: "hint"; text: string };

export interface TabSpec {
  id: string;
  label?: string;
  parts: Part[];
  gm?: boolean;
  feature?: FeatureId;
  page?: "panel" | "plain" | "none"; // panel: the page is one framed panel (cc-panel cc-page); plain (default): parts sit on the page; none: a custom part is the page
  pageClass?: string; // a panel page's classes, when not "cc-panel cc-page"
}

export interface SheetSpec {
  level: "inherit" | "arrange"; // "replace" is per part (custom) or per window
  // note: the words under the name (default "Name"), as text nodes ("Name · ", "Fate Core").
  header: { identity: FieldSpec[]; custom?: Ref[] /* a game's own boxes after them (Ironsworn's initiative button) */; note?: Nodes; nameFields?: FieldSpec[] /* labelled fields in a row beside the name (Forged's Alias) */ };
  attrs?: { name: string; value: Text }[]; // more data-* on the sheet (data-game="starforged")
  top?: Part[]; // above every tab (a strip of level, experience and the roll modifier)
  art?: Path | Path[]; // what picks the portrait art (the race): the first path with a value
  tabs: TabSpec[];
  className?: string; // keeps a game's own look (decision 1)
}

// The character wizard (as built for Cairn, docs/core-ui-design.md 7.8): one page of numbered steps, each a list of
// wizard parts that write into one spec. Every die is the host's (in chat, labelled with the wizard's `chat` word).
// A part's `into` is its path in the spec; a roll button is disabled while a roll is out and once its `into` is set.
export interface WizardRoll {
  hook: Hook; // data-action
  formula: string;
  label: string; // the roll's label in chat; "{label}" = a row's label
  button: string; // the button's words before the roll
  done?: string; // its words after ("HP {value}")
  title?: string;
}
export type WizardPart = (
  // A record of a type, chosen in a select or rolled on a table (pick: the Ref that reads the table's result as one of them).
  | { kind: "choose-record"; fromType: string; into: Path; aria: string; placeholder: string; resets?: Path[]; roll?: WizardRoll & { table: string; pick: Ref } }
  // A text: chosen from a list on a chosen record, or typed.
  | { kind: "text"; into: Path; label: string; aria: string; placeholder: string; options?: { record: Path; list: Path }; free?: { aria: string; placeholder: string } }
  // The tables on a chosen record (a background's), each rolled on its own button; into: { [index]: roll }.
  | { kind: "record-tables"; record: Path; path: Path; into: Path; formula: string; hook: string; label: string; done: string; button: string; className?: string; attr?: string }
  // One roll: a number, or (table) the text of a roll table's row.
  | ({ kind: "roll"; into: Path; table?: string; optional?: boolean } & WizardRoll)
  // One roll per row, each on its own roll table ("{key}"), on one button; into: { [key]: text }.
  | ({ kind: "roll-table"; into: Path; rows: { key: string; label: string }[]; table: string } & WizardRoll)
  // Scores rolled in order on one button, shown as boxes; two may be swapped once.
  | ({ kind: "roll-stats"; into: Path; stats: { key: string; label: string; short: string }[]; swap?: { hook: Hook; title: string; aria: [string, string]; start: [string, string]; button: string } } & WizardRoll)
  | { kind: "check"; into: Path; label: string; title?: string }
  // Money rolled, then bought with: the records of a type with a price; into: { [name]: count }.
  | { kind: "shop"; into: Path; fromType: string; exclude?: { path: Path; values: string[] }; price: { path: Path; per: number; unit: string }; type?: Path; gold: WizardRoll & { into: Path; bonus?: Ref; bonusText?: string }; search: { aria: string; placeholder: string }; limit: number }
  // A line of text: "{path}" from the spec, or from a chosen record (record); join: one line from a row each.
  | { kind: "hint"; text?: string; record?: Path; join?: { path: Path; rows: { key: string; label: string }[]; text: string; sep: string }; attr?: string }
  | { kind: "row"; parts: WizardPart[] }
) & { when?: Cond };
export interface WizardStep {
  id: string;
  title: string;
  more?: { when: Cond; text: string }; // words added to the heading while `when` holds (", Omen")
  parts: WizardPart[];
}
export interface WizardSpec {
  hook: Hook; // data-wizard
  title: string;
  aria: string;
  chat: string; // the rolls' chat prefix ("[CHARGEN] ")
  tables?: { type: string; key: string }; // roll tables as records: the type, and the field that names a table
  empty?: { type: string; text: string }; // shown instead while there is no record of this type
  finish: { title: string; build: Ref }; // build: the Ref that turns the spec into build-character's
  steps: WizardStep[];
}

export type Cond =
  | { status: string | string[] }
  | { faction: "friend" | "neutral" | "foe" | "not-friend" }
  | { activeTurn: true }
  | { gm: true }
  | { gmOrMine: true }
  | { viewerHasCharacter: true }
  | { atLeast: { path: Path; value: number } }
  | { anyEntry: Cond } // in the tracker's header: some entry in the fight
  | { has: Path }
  // On a sheet: a row's or the record's values, and whether the viewer may type.
  | { is: { path: Path; values: string[] } }
  | { positive: Path }
  | { defined: Path }
  | { rows: Path } // a list with at least one row
  | { length: { path: Path; min: number } } // a list (array) with at least min items
  | { some: { path: Path; cond: Cond } } // some row of a list holds
  | { isNull: Path } // no value (null or none)
  | { below: { path: Path; value: number } }
  | { zero: { path: Path; minus: Path; plus?: Path } } // path + plus - minus at or under 0 (hit points left)
  | { feature: FeatureId } // the game (or its variant) has the feature
  | { less: { path: Path; than: Path } } // one number under another (a characteristic now under its score)
  | { editable: true }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

// The tracker's words (docs/core-ui-design.md 7.9): "{path}" from the row's entry ("{path|0}": 0 when it has none);
// a choice by a condition; a list is one text node each, as JSX writes "Morale {morale}" ("Morale ", "8").
export type Words = string | { if: Cond; then: string; else: string } | Words[];
// A tracker button's call: a tracker message (session.ct(ct, { id: the row's entry, ...args }); with: the row's record
// as recordId, or the viewer's own character's), or a ruleset message on the row's record (session.<message>Action).
export type TrackerCall = { ct: string; args?: Record<string, unknown>; with?: "record" | "viewer" } | { message: string; action: string };
export interface TrackerAction {
  hook: Hook; // data-action
  label: Words;
  title?: Words;
  className?: string; // a row's default: "ct-death-save"; the header's: none
  when?: Cond;
  disabled?: Cond;
  call: TrackerCall;
}
export interface TrackerSpec {
  replace?: Ref; // Forged: the Score panel instead of the tracker
  // The GM's "roll all" button and a player's own initiative button (default: Roll all, d10).
  initiative?: { rollAll: string; rollAllTitle?: string; own: string; ownTitle: string };
  // An Ironsworn character's initiative, in the game's words.
  control?: { on: string; off: string; title: string };
  // An NPC's attacks that always hit (Cairn): the button's words and title, its data-* name, and the die modes beside it.
  attacks?: { hook: Hook; attr: string; label: Words; title: Words; modes: { mode: string; label: string; title: string }[] };
  rowActions?: TrackerAction[]; // on a row, after its health, in this order
  headerParts?: Ref[]; // whole controls a game adds to the GM's header (Fate's conflict)
  headerActions?: TrackerAction[]; // buttons in the GM's header (Cairn's morale for every foe)
  // The GM's "Roll save" box on a row: the stats offered, the modifier's word and aria-label, the button.
  saves?: { keys: string[]; modLabel: string; modAria: string; button: string };
}

export interface PartySpec {
  currency: string[]; // [] = no coin (Fate), ["Supply"], ["MCr", "Cr"]
  // rolls: the party sheet's group rolls (a check, a save, a skill and their choices), each member through their own sheet roll; mode roll or ask the players.
  groupCheck?: { stats: string[]; rolls?: { kind: "check" | "save" | "skill"; label: string; options: { value: string; label: string }[] }[] } | false; // false: no group check (Forged: a group action is on the Score panel)
  xp: "xp" | "growth" | "milestone" | "none";
  tabs?: { id: string; label: string; component?: Ref; first?: boolean; gm?: boolean; feature?: FeatureId }[];
}

export type FeatureId =
  | "deathSaves" | "dying.save" | "dying.bleed" | "morale" | "turnUndead" | "multiAttack" | "dread"
  | "clocks" | "crew" | "scorePanel" | "downtime" | "fatePoints" | "sceneAspects" | "stressConsequences"
  | "oracles" | "delve" | "progressTracks" | "momentum" | "assetsCards" | "starships" | "careers"
  | "slots" | "fatigue" | "scars" | "spellbooks" | "thiefSkills" | "encumbrance" | "abilityCards"
  | "approaches"; // Fate Accelerated: six approaches in place of skills

export interface WindowSpec {
  kind: string;
  label: string;
  icon: string;
  title?: string;
  gm?: boolean;
  feature?: FeatureId;
}

export interface RulesetManifest {
  id: string; // data.ruleset on records: "cairn"
  names: string[]; // campaign names: ["Cairn"]; Fate: ["Fate Core", "Fate Accelerated"]
  variants?: Record<string, Partial<Omit<RulesetManifest, "variants" | "names">>>; // per name: Fate Accelerated, Descending Darkness, Starforged
  blurb: string; // the campaign screen's text
  engine: string | null; // "shared/cairn/rules.mjs"; null for no rules (Worldbuilding)
  host: { module: string | null; message?: string; tool?: string };
  labels?: Record<string, string>;
  // fields: what the record window's editor offers for that kind (unlocked), in order; none, the fields its records carry.
  records?: Record<string, { label?: string; sheet?: Ref | "core"; statblock?: Ref; filters?: string[]; fields?: FieldSpec[] }>;
  // An encounter's experience (kraken_encounter xp, End encounter): the NPC field its creatures' XP is read from (default "xp").
  encounter?: { xp?: Path };
  sheet: SheetSpec | Ref;
  wizard?: WizardSpec | Ref;
  blank?: boolean; // a blank character can be made (FG's Create)
  tracker?: TrackerSpec;
  party: PartySpec;
  features: FeatureId[];
  settings?: ({ key: string; label: string; hint?: string; kind: "toggle" | "select" | "checklist"; default: unknown; options?: string[] } | { component: Ref; gm?: boolean })[];
  // modifiers: the modifier box and its keys (shared/rulesets/modifiers.mjs); false: none. kinds: the rolls it reads (all when left out).
  dice?: { extraTray?: string[]; resultWords?: Record<string, "good" | "mixed" | "bad">; modifiers?: false | { presets?: (string | import("./modifiers.mjs").ModifierKey)[]; kinds?: string[] } };
  windows?: WindowSpec[];
  strips?: Ref[];
  combatLabel?: string; // "Score"
  calendar?: string; // shared/calendars.mjs id
  edit?: { text: Path[]; number: Path[]; string?: Path[]; list?: Path[]; remove?: Path[] }; // list: a list typed one item a line; remove: lists whose rows may be dropped
  actions?: ActionsSpec; // attached by the registry from shared/<id>/actions.mjs
  bookkeeping?: BookkeepingSpec; // attached by the registry from shared/<id>/bookkeeping.mjs
}

// What a game's bookkeeping tracks (shared/<id>/bookkeeping.mjs, read by shared/bookkeeping):
// each part false when the game does not count it. Patterns are regular expressions' sources.
export type LimitSpec = number | Path | { stat?: Path; path?: Path; times?: number; plus?: number } | { table: number[]; stat: Path; part?: number } | { sum: LimitSpec[]; times?: number };
export interface LoadLevelSpec {
  id: string;
  label: string;
  upTo?: LimitSpec; // the most this level holds; the last has none
  speed?: number | { table: number[][] } | { times: number }; // minus feet (negative), set to, a table from the base, or a share of it
  tone?: "warn" | "bad";
  effect?: string; // its components on the creature ("SPEED: -10; DISATK")
  text?: string;
}
export interface PenaltySpec {
  after?: number | string; // days gone without before it starts: a number or "3+constitution"
  kind: "exhaustion" | "damage" | "check-damage" | "deprived" | "note";
  damage?: string;
  path?: Path;
  check?: { mod: Path; dc: number; step?: number };
  text: string;
}
export interface RestSpec {
  hours?: number;
  hp?: "full" | number | { perLevel: number; level: Path } | { dice: string; mod?: Path };
  temp?: boolean;
  hitDice?: { die?: Path; total?: Path; used: Path; mod?: Path; back?: "half" | "all" };
  reset?: string[]; // paths zeroed (globs: "slots.*.used")
  exhaustion?: number;
  rations?: boolean;
  concentration?: boolean;
  via?: { module: string; action: string }; // the game's own (Cairn's rest and sleep)
}
export interface BookkeepingSpec {
  ammo: false | { recover: number; low?: number; engine?: "siege"; kinds?: { id: string; label: string; launcher: string; ammo: string }[] };
  consumables: false | { kinds?: { kind: string; match: string; spend: "count" | "uses" | "charges" }[] };
  rations: false | { food: { match: string }; water: false | { match: string; days?: number }; penalty: { food?: PenaltySpec; water?: PenaltySpec } };
  light: false | Record<string, false | { item?: string; fuel?: string; keep?: boolean }>;
  exhaustion?: { path: Path; max: number; effect: string; text: string };
  encumbrance:
    | false
    | {
        mode: "weight" | "derived";
        unit?: string;
        label?: string;
        coins?: number;
        speed?: Path;
        used?: Path;
        max?: LimitSpec;
        levelPath?: Path;
        offFlag?: boolean; // the rules' derive reads data.encumbranceoff (the GM's switch)
        sizes?: Record<string, number>;
        sizePath?: Path;
        wornArmor?: number;
        levels: LoadLevelSpec[];
        variant?: LoadLevelSpec[];
        variantLabel?: string;
        containers?: { match: string; capacity: number; weightless?: boolean }[];
        note?: string;
      };
  rest: false | { short?: RestSpec; long?: RestSpec };
}

// What a game declares for targeting, actions and effects (shared/<id>/actions.mjs,
// docs/targeting-actions-design.md 4.1).
export interface ActionsSpec {
  spells: "fg5e" | "fg2e" | "text" | "powers" | "none"; // how its spells are read and cast
  game?: "5e" | "35e" | "2e" | "bf" | "cnc"; // shared/actions/parse.mjs's game words
  saves: { dc: "spell" | "cl" | "none" }; // a spell's DC (5E, 3.5E), the caster level (C&C), or a plain save (2E, BF)
  damageTypes: boolean; // resistances, immunities and vulnerabilities by type
  roundSeconds: number; // a round in game time (burn times, the calendar)
  friendlyFire: boolean; // an area's damage hits allies inside it too
  conditions?: string[]; // core condition ids it lists (absent: all)
  buffs?: string[]; // core buff presets it lists
  lights?: string[]; // core light presets it lists
  burn?: Record<string, number | null>; // a light's burn time in minutes
}
