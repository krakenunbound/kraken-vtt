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
export type Text = string | { by: string; map: Record<string, string>; else: string };
// What a button or a field sends instead of an edit: a ruleset message (session.<message>Action(record, action, args)),
// a tracker message (session.ct(ct, { recordId, ...args })), or a roll (session.siegeCheck). key / value: the argument
// names that carry the row's key and the field's value.
export type ActionCall =
  | { message: string; action: string; key?: string; value?: string; args?: Record<string, unknown>; modifiers?: string[] }
  | { ct: string; key?: string; value?: string; args?: Record<string, unknown>; modifiers?: string[] }
  | { roll: "save" | "check" | "skill"; key?: string };

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
  color?: string; // a value shown in this colour (a status)
  note?: string; // the small text under a labelled field (its label by default)
  bare?: boolean; // no label box around it
  action?: ActionCall; // sent as an action, not an edit
  when?: Cond;
}

export interface RollSpec {
  action: ActionCall;
  label: Text;
  title?: Text;
  aria?: Text;
  hook: string; // the data-* attribute the button carries the row's key in: "roll-save" -> data-roll-save="str"
  column?: string; // its column's heading in a stat block ("Save")
}
export interface StepSpec {
  hook: Hook; // data-action
  label: string;
  title?: string;
  action: ActionCall;
  disabled?: Cond;
}
export interface BoxSpec {
  label: string;
  title?: Text;
  show: "value" | "remaining" | "shield"; // remaining: path less minus, "/ path" (HP)
  path: Path;
  minus?: Path;
  hook?: Hook;
  danger?: boolean; // red at 0 or less
  fields?: (FieldSpec & { before?: string })[]; // small fields beside it (Lost, Max)
  warn?: { when: Cond; text: string };
  steps?: StepSpec[]; // + and - (Fatigue), the owner's
}
export interface ListAction {
  hook: Hook;
  label: Text;
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
  | { part: "statBlock"; label: string; hook: string; className?: string; rows: { key: string; label: string; short?: string }[]; columns: { label: string; path: Path; field: Omit<FieldSpec, "path"> }[]; roll?: RollSpec }
  | { part: "derived"; className?: string; boxes: BoxSpec[] }
  | { part: "list"; label?: string; path: Path; hook: string; count?: string; className?: string; select?: FieldSpec; check?: FieldSpec; name: { path: Path; else?: string; bold?: boolean; title?: Path[]; flat?: boolean /* the name and details straight in the row, not in a span */ }; details?: { text?: string; format?: Ref; when?: Cond }[]; sep?: string; rowActions?: ListAction[]; remove?: { aria: Text; title?: string; action?: ActionCall }; add?: { label: string; note: string; action: ActionCall }; modifier?: Modifier; empty?: string }
  | { part: "coins"; path: Path; className?: string; none?: { text: string; unless: string } }
  | { part: "load"; mode: "slots"; hook: string; used: Path; total: number; text: string }
  | { part: "notes"; fields: FieldSpec[]; className?: string }
  | { part: "advancement"; mode: "growth"; title?: string; rolls: StepSpec[] }
  | { part: "hint"; text: string }
  | { part: "heading"; text: string; targets?: boolean }
  | { part: "row"; parts: Part[]; className?: string }
  | { part: "custom"; component: Ref; props?: Record<string, unknown> }
) & { when?: Cond; gm?: boolean };

export interface TabSpec {
  id: string;
  label?: string;
  parts: Part[];
  gm?: boolean;
  feature?: FeatureId;
  page?: "panel" | "plain"; // panel: the page is one framed panel (cc-panel cc-page); plain (default): parts sit on the page
}

export interface SheetSpec {
  level: "inherit" | "arrange"; // "replace" is per part (custom) or per window
  header: { identity: FieldSpec[] };
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
  | { has: Path }
  // On a sheet: a row's or the record's values, and whether the viewer may type.
  | { is: { path: Path; values: string[] } }
  | { positive: Path }
  | { defined: Path }
  | { editable: true }
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond };

export type TrackerCall = { ct: string; args?: Record<string, unknown> } | { message: string; action: string };
export interface TrackerSpec {
  replace?: Ref; // Forged: the Score panel instead of the tracker
  initiative?: { label: string; rollAll: string; hint?: string; none?: string };
  columns?: { id: string; label: string; from: Path; kind: "number" | "boxes" | "badge" | "select"; gm?: boolean; when?: Cond }[];
  rowActions?: ({ id: Hook; label: string; when: Cond; title?: string; className?: string } & TrackerCall)[];
  headerActions?: ({ id: Hook; label: string; title?: string; gm?: boolean } & TrackerCall)[];
  // The GM's "Roll save" box on a row: the stats offered, the modifier's word and aria-label, the button.
  saves?: { keys: string[]; modLabel: string; modAria: string; button: string };
}

export interface PartySpec {
  currency: string[]; // [] = no coin (Fate), ["Supply"], ["MCr", "Cr"]
  groupCheck?: { stats: string[] } | false; // false: no group check (Forged: a group action is on the Score panel)
  xp: "xp" | "growth" | "milestone" | "none";
  tabs?: { id: string; label: string; component?: Ref; first?: boolean; gm?: boolean; feature?: FeatureId }[];
}

export type FeatureId =
  | "deathSaves" | "dying.save" | "dying.bleed" | "morale" | "turnUndead" | "multiAttack" | "dread"
  | "clocks" | "crew" | "scorePanel" | "downtime" | "fatePoints" | "sceneAspects" | "stressConsequences"
  | "oracles" | "delve" | "progressTracks" | "momentum" | "assetsCards" | "starships" | "careers"
  | "slots" | "fatigue" | "scars" | "spellbooks" | "thiefSkills" | "encumbrance" | "abilityCards";

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
  records?: Record<string, { label?: string; sheet?: Ref | "core"; statblock?: Ref; filters?: string[] }>;
  sheet: SheetSpec | Ref;
  wizard?: WizardSpec | Ref;
  blank?: boolean; // a blank character can be made (FG's Create)
  tracker?: TrackerSpec;
  party: PartySpec;
  features: FeatureId[];
  settings?: ({ key: string; label: string; hint?: string; kind: "toggle" | "select" | "checklist"; default: unknown; options?: string[] } | { component: Ref; gm?: boolean })[];
  dice?: { extraTray?: string[]; resultWords?: Record<string, "good" | "mixed" | "bad"> };
  windows?: WindowSpec[];
  strips?: Ref[];
  combatLabel?: string; // "Score"
  calendar?: string; // shared/calendars.mjs id
  edit?: { text: Path[]; number: Path[]; string?: Path[]; remove?: Path[] }; // remove: lists whose rows may be dropped
}
