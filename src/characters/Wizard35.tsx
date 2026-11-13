import { useMemo, useState, useSyncExternalStore } from "react";
import { useHostRolls as useSharedHostRolls } from "./hostRolls";
import type { Session } from "../session/useSession";
import { ArtChoice } from "./ArtPicker";
import * as W from "../../shared/dnd35/wizard.mjs";
import { ABILITY_PROSE, ALIGNMENT_DETAILS, ALIGNMENT_PROSE, CLASS_DETAILS, CLASS_PROSE, INSTRUCTIONS, RACE_DETAILS, RACE_MANUAL_NOTES, RACE_PROSE, WARNINGS } from "../../shared/dnd35/wizardText.mjs";

// The D&D 3.5E character wizard, a port of the GM's own Fantasy Grounds
// extension (KrakenCharWizard35E): Abilities, Race, Class, Languages,
// Alignment, Skills, Feats, Gear, Spells, Details and Commit, each tab with
// its badge ("!" while it needs something, a check when done), its art faint
// behind it and its instructions. The GM's options (Settings) say which
// ability methods may be used, whether rolls lock, a low score's reroll and
// the Vault's free gear. Every die is rolled by the host, in front of the
// table. The rules live in shared/dnd35/wizard.mjs; the host builds the
// character from the spec they make (rules.mjs buildFromSpec).

type Page = "basics" | "race" | "class" | "languages" | "alignment" | "skills" | "feats" | "equipment" | "spells" | "details" | "commit";
const PAGES = W.PAGES as Page[];
const PAGE_LABEL = W.PAGE_LABEL as Record<Page, string>;
type Build = {
  method: number;
  rolled: boolean;
  rolledEach: Record<string, boolean>;
  lowRerolled: Record<string, boolean>;
  abilities: Record<string, number>;
  increases: Record<string, number>;
  targetLevel: number;
  race: string | null;
  plan: { name: string; levels: number }[];
  adding: boolean;
  languages: string[];
  alignment: string | null;
  skills: Record<string, number>;
  feats: { id: string; name: string; base: string; target: string | null }[];
  pendingTarget: string | null;
  gold: number | null;
  equipment: Record<string, number>;
  spells: { id: string; bucket: string; name: string; classkey: string; classlabel: string; level: number; record: string }[];
  details: Record<string, string>;
  seq: number;
  problem?: string;
};
type LibRow = { key: string; name: string; data: Record<string, unknown>; source: string; path: string };
type Lib = { races: LibRow[]; classes: LibRow[]; feats: LibRow[]; items: LibRow[]; spells: LibRow[]; domains: { key: string; name: string; grantedpower: string; spells: { level: number; name: string }[] }[] };
type Bucket = { key: string; classkey: string; classlabel: string; level: number; needed: number; order: number; optional: boolean };
type SpellRow = { name: string; record: string; level?: number; source: string; school?: string };

const ART = "rulesets/dnd35/wizard";
const PAGE_ART: Record<Page, string> = { basics: "abilities", race: "race", class: "class", languages: "languages", alignment: "alignment", skills: "skills", feats: "feats", equipment: "equipment", spells: "spells", details: "commit", commit: "commit" };
const RACE_ART: Record<string, string> = { dwarf: "race_dwarf", drow: "race_drow", elf: "race_elf", gnome: "race_gnome", "half-elf": "race_half_elf", halfling: "race_halfling", "half-orc": "race_half_orc", human: "race_human", tiefling: "race_tiefling", goblin: "race_half_orc" };
const CLASS_ART: Record<string, string> = { barbarian: "class_barbarian", bard: "class_bard", cleric: "class_cleric", druid: "class_druid", fighter: "class_fighter", monk: "class_monk", paladin: "class_paladin", ranger: "class_ranger", rogue: "class_rogue", sorcerer: "class_sorcerer", wizard: "class_wizard", warlock: "class_sorcerer", mesmer: "class_rogue", necromancer: "class_wizard" };
const titled = (word: string) => word.replace(/^\w/, (letter) => letter.toUpperCase());
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const text = (html: unknown) =>
  String(html ?? "")
    .replace(/<\/p>|<\/h>/gi, "\n")
    .replace(/<li>/gi, "  - ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

// Open or closed on every page at once (kept in this browser).
const instructions = (() => {
  let open = (() => {
    try {
      return window.localStorage.getItem("kraken-wizard35-instructions") !== "closed";
    } catch {
      return true;
    }
  })();
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => open,
    toggle() {
      open = !open;
      try {
        window.localStorage.setItem("kraken-wizard35-instructions", open ? "open" : "closed");
      } catch {
        /* this screen only */
      }
      for (const listener of listeners) listener();
    },
  };
})();

// Waits for the host's answer to a roll this window asked for.
function useHostRolls(session: Session) {
  return useSharedHostRolls(session, (label) => label);
}

function Instructions({ page }: { page: Page }) {
  const open = useSyncExternalStore(instructions.subscribe, instructions.get);
  const lines = String((INSTRUCTIONS as Record<string, string>)[page] ?? "").split("\n").filter(Boolean);
  return (
    <section className="ccw-instructions">
      <button type="button" className="ccw-plate" aria-expanded={open} onClick={instructions.toggle}>
        Instructions <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="ccw-lore">
          {lines.filter((line) => !/^\d+\.\s/.test(line)).map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {lines.some((line) => /^\d+\.\s/.test(line)) ? (
            <ol>
              {lines.filter((line) => /^\d+\.\s/.test(line)).map((line, index) => (
                <li key={index}>{line.replace(/^\d+\.\s*/, "")}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
function Plate({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="ccw-plate">
      {action}
      <span>{children}</span>
    </div>
  );
}
function Card({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "ccw-card open" : "ccw-card"}>
      <button type="button" className="ccw-card-title" disabled={!body} onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>{title}</b> {body ? <span aria-hidden>{open ? "−" : "+"}</span> : null}
      </button>
      {open ? <p className="ccw-card-text">{body}</p> : null}
    </div>
  );
}
// A list of records to choose from, with FG's Source and Name filters.
function PickList({ rows, kind, onPick, chosen, status }: { rows: LibRow[]; kind: string; onPick: (row: LibRow) => void; chosen?: string; status?: (row: LibRow) => { text: string; blocked: boolean; remove?: () => void } }) {
  const [source, setSource] = useState("(All)");
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const sources = ["(All)", ...[...new Set(rows.map((row) => row.source))].sort()];
  const shown = rows.filter((row) => (source === "(All)" || row.source === source) && row.name.toLowerCase().includes(name.toLowerCase()));
  return (
    <div className="ccw-picklist">
      <div className="ccw-filter">
        <label>
          Source
          <select value={source} onChange={(event) => setSource(event.target.value)} aria-label={`${kind} source`}>
            {sources.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} aria-label={`${kind} name filter`} />
        </label>
      </div>
      {shown.map((row) => {
        const state = status?.(row);
        return (
          <div key={row.key} className={state?.blocked ? "ccw-pick blocked" : chosen === row.name || (state && /^Selected/.test(state.text)) ? "ccw-pick on" : "ccw-pick"}>
            <button type="button" className="ccw-add" title="Choose" aria-label={`Choose ${row.name}`} onClick={() => onPick(row)} {...{ [`data-${kind}`]: row.name }}>
              +
            </button>
            <button type="button" className="ccw-pick-name" title="Read it" onClick={() => setReading(reading === row.key ? "" : row.key)}>
              {row.name}
              {state?.text ? <small> - {state.text}</small> : null}
            </button>
            <span className="ccw-pick-source">
              {state?.remove ? (
                <button type="button" className="ccw-remove" aria-label={`Remove ${row.name}`} onClick={state.remove}>
                  −
                </button>
              ) : null}{" "}
              {row.source}
            </span>
            {reading === row.key ? <p className="ccw-reading">{text(row.data.text ?? row.data.benefit ?? row.data.description) || "No text."}</p> : null}
          </div>
        );
      })}
      {shown.length === 0 ? <p className="hint">Nothing matches.</p> : null}
    </div>
  );
}

export function Wizard35({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const rollOnHost = useHostRolls(session);
  const records = Object.values(session.records);
  const lib = useMemo(() => W.makeLib(records.filter((record) => ["race", "class", "feat", "item", "spell", "spelldesc", "spelllists"].includes(record.type))) as unknown as Lib, [records.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const opts = W.wizardOptions(session.options.wizard35);
  const [b, setB] = useState<Build>(() => W.newBuild(opts) as unknown as Build);
  const [page, setPage] = useState<Page>("basics");
  const [note, setNote] = useState("");
  const [rolling, setRolling] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [classLevels, setClassLevels] = useState(0);
  const [shopSearch, setShopSearch] = useState("");
  const [shopSource, setShopSource] = useState("(All)");
  const [spellSearch, setSpellSearch] = useState("");
  const [spellSchool, setSpellSchool] = useState("(All)");
  const [art, setArt] = useState<{ portrait?: string; token?: string }>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const say = (words: string) => setNote(words);
  // A change that may come back with a reason it was refused.
  const apply = (result: { b: unknown; error?: string }) => {
    setB(result.b as Build);
    if (result.error) say(result.error);
  };

  const method = W.ABILITY_METHODS.find((item) => item.id === W.currentMethod(b, opts)) ?? W.ABILITY_METHODS[0];
  const arranges = W.methodArranges(b, opts);
  const perAbility = W.methodPerAbility(b, opts);
  const plan = W.plan(b) as { name: string; levels: number; key: string }[];
  const primary = plan[0] ?? null;
  const race = lib.races.find((row) => row.name === b.race) ?? null;
  const raceKey = W.raceKey(b) as string;
  const buckets = Object.values(W.spellBuckets(b) as Record<string, Bucket>).sort((a, c) => a.classlabel.localeCompare(c.classlabel) || a.order - c.order || a.level - c.level);
  const counts = W.spellCounts(b) as Record<string, number>;
  const shop = useMemo(() => W.shopItems(b, lib, opts) as LibRow[], [b.plan, lib, opts.vault]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (name: Page) => W.pageComplete(b, lib, opts, name) as boolean;
  const warnings = W.warnings(b, lib, opts, WARNINGS) as { page: Page; text: string; note: boolean }[];
  const blocking = warnings.filter((item) => !item.note).length;
  const next = PAGES[Math.min(PAGES.length - 1, PAGES.indexOf(page) + 1)];

  // --- Abilities ----------------------------------------------------------------
  async function rollAll() {
    if (method.manual) return say("Manual ability entry is selected. Type the scores directly.");
    if (opts.rollLock && b.rolled) return say("Ability scores are locked after the first roll by the GM's option.");
    if (perAbility) return say("Classic 3d6 in order rolls one ability at a time. Use the dice button beside each score.");
    if (method.scores) {
      setB((current) => ({ ...current, rolled: true, lowRerolled: {}, rolledEach: Object.fromEntries(W.STATS.map((stat) => [stat, true])), abilities: Object.fromEntries(W.STATS.map((stat, index) => [stat, method.scores?.[index] ?? 10])) }));
      return say(`Ability scores set from ${W.methodLabel(method)}.`);
    }
    setRolling("abilities");
    setB((current) => ({ ...current, rolled: true, lowRerolled: {}, rolledEach: {} }));
    try {
      for (const stat of W.STATS) {
        const roll = await rollOnHost(method.formula ?? "4d6d1", `[ABILITY SCORE GENERATION] ${titled(stat)} (${method.name})`);
        setB((current) => ({ ...current, abilities: { ...current.abilities, [stat]: Math.max(1, roll.total) }, rolledEach: { ...current.rolledEach, [stat]: true } }));
      }
    } finally {
      setRolling("");
    }
  }
  async function rollOne(stat: string) {
    if (!perAbility) return void rollAll();
    if (opts.rollLock && b.rolledEach?.[stat]) return say("Ability scores are locked after the first roll by the GM's option.");
    setRolling(stat);
    setB((current) => ({ ...current, rolled: true }));
    try {
      const roll = await rollOnHost(method.formula ?? "3d6", `[ABILITY SCORE GENERATION] ${titled(stat)} (${method.name})`);
      setB((current) => ({ ...current, abilities: { ...current.abilities, [stat]: Math.max(1, roll.total) }, rolledEach: { ...current.rolledEach, [stat]: true } }));
    } finally {
      setRolling("");
    }
  }
  async function rerollLow(stat: string) {
    if (!W.canLowReroll(b, opts, stat)) return;
    setRolling(stat);
    try {
      const roll = await rollOnHost("3d6", `[HOUSE RULE ABILITY REROLL] ${titled(stat)} (3d6, keep result)`);
      setB((current) => ({ ...current, abilities: { ...current.abilities, [stat]: Math.max(1, roll.total) }, lowRerolled: { ...current.lowRerolled, [stat]: true } }));
      say(`${titled(stat)} house-rule reroll set to ${roll.total}. This result must stand.`);
    } finally {
      setRolling("");
    }
  }
  const swap = (from: string, to: string) => {
    if (!arranges || from === to) return;
    setB((current) => W.swapScores(current, from, to) as Build);
  };

  // --- Gear ---------------------------------------------------------------------
  async function rollGold() {
    if (!primary) return say("Choose a class first: your class sets your starting gold.");
    if (W.goldRolled(b)) return say("Starting gold has already been rolled for this character.");
    const info = W.goldInfo(b, lib) as { wealth: boolean; expr: string; average: number; dice: string; times: number };
    if (info.wealth) {
      setB((current) => ({ ...current, gold: info.average }));
      return say(`Wealth-by-level set for level ${W.gearLevel(b)} (${info.average} gp).`);
    }
    setRolling("gold");
    try {
      const roll = await rollOnHost(info.dice, `[STARTING GOLD] ${primary.name} (${info.expr})`);
      const gold = roll.total * info.times;
      setB((current) => ({ ...current, gold }));
      say(`Starting gold rolled for ${primary.name} (${gold} gp).`);
    } finally {
      setRolling("");
    }
  }

  async function create() {
    setCreating(true);
    setError("");
    try {
      const spec = { ...(W.toSpec(b, lib, opts) as Record<string, unknown>), ...art } as Record<string, unknown>;
      const id = await session.buildCharacter(spec);
      const open = (W.createIssues(b, lib, opts) as { text: string }[]).map((issue) => issue.text);
      session.sendChat(`Character Wizard: created '${String(spec.name)}' (${W.planSummary(b)} ${b.race ?? ""}).${open.length ? ` Saved unfinished. Still to do: ${open.join(" ")} The list is in the sheet's notes.` : ""}`, {});
      onDone(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the character.");
    } finally {
      setCreating(false);
    }
  }

  if (lib.classes.length === 0) {
    return (
      <section className="ccw" data-wizard="dnd35">
        <h2>D&amp;D 3.5E Character Wizard</h2>
        <p className="hint">No class records found. The GM makes the 3.5E Player's Handbook active first (Modules).</p>
        <button type="button" onClick={() => onDone(null)}>
          Close
        </button>
      </section>
    );
  }

  const raceArt = RACE_ART[raceKey];
  const classArt = primary ? CLASS_ART[primary.key] : "";
  const raceDetail = (RACE_DETAILS as Record<string, { top: string; bottom: string }>)[raceKey];
  const classDetail = primary ? (CLASS_DETAILS as Record<string, { top: string; bottom: string }>)[primary.key] : undefined;
  const alignmentKey = (b.alignment ?? "").toLowerCase().replace(/\s+/g, "-");
  const alignmentDetail = (ALIGNMENT_DETAILS as Record<string, { top: string; bottom: string }>)[alignmentKey];
  const classLevelsWanted = W.pendingClassLevels(b, classLevels) as number;
  const remainingCopper = W.remainingCopper(b, lib, opts) as number;
  const levels = W.classLevelMap(b).levels as Record<string, number>;
  const allSchools = [...new Set(lib.spells.map((spell) => W.spellSchool(spell) as string).filter(Boolean))].sort();
  const xpWarning = (() => {
    if (Object.keys(levels).length <= 1) return "";
    const favored = W.RACE_FAVORED_CLASS[raceKey as keyof typeof W.RACE_FAVORED_CLASS] as string | Record<string, boolean> | undefined;
    const list = Object.entries(levels).map(([key, level]) => `${titled(key)} ${level}`).join(" / ");
    if (!favored) return `Multiclass XP: check this race's favored class before play (${list}).`;
    const check = Object.entries(levels).filter(([key]) => (favored === "any" ? true : typeof favored === "string" ? key !== favored : !favored[key]));
    if (favored === "any") check.sort((a, c) => c[1] - a[1]).shift();
    const values = check.map(([, level]) => level);
    if (values.length > 1 && Math.max(...values) - Math.min(...values) > 1) return `Multiclass XP: possible 3.5e XP penalty; favored class ${favored === "any" ? "Any/highest class" : typeof favored === "string" ? titled(favored) : "Wizard or Cleric"} does not count, but remaining class levels are more than one apart (${list}).`;
    return "";
  })();

  return (
    <section className="ccw ccw-35" data-page={page} data-wizard="dnd35" aria-label="D&D 3.5E character wizard">
      <header className="ccw-head">
        <h2>D&amp;D 3.5E Character Wizard</h2>
        <span className="ccw-head-buttons">
          <button type="button" className="wizard-next" data-wizard-next disabled={page === "commit"} onClick={() => setPage(next)} title={`Next: ${PAGE_LABEL[next]}`}>
            Next: {PAGE_LABEL[next]} ›
          </button>
          <button type="button" onClick={() => onDone(null)}>
            Cancel
          </button>
        </span>
      </header>
      <nav className="ccw-tabs" role="tablist">
        {PAGES.map((name) => {
          const ok = name === "commit" ? blocking === 0 : done(name as Page);
          return (
            <button key={name} type="button" role="tab" aria-selected={page === name} data-wizard-tab={name} onClick={() => setPage(name as Page)}>
              {PAGE_LABEL[name as Page]}
              <span className={ok ? "ccw-tab-badge done" : "ccw-tab-badge todo"} data-tab-done={ok ? "yes" : "no"}>
                {ok ? "✓" : <img src={`${ART}/alert.webp`} alt="!" />}
              </span>
            </button>
          );
        })}
      </nav>
      {note ? (
        <p className="ccw-note" role="status">
          {note}
          <button type="button" aria-label="Dismiss" onClick={() => setNote("")}>
            ×
          </button>
        </p>
      ) : null}

      <div className="ccw-page" style={{ ["--ccw-art" as string]: `url(${ART}/${PAGE_ART[page]}.webp)` }}>
        <Instructions page={page} />
        <Plate>{W.PAGE_HEADER[page]}</Plate>

        {page === "basics" ? (
          <div className="ccw-panel">
            <div className="ccw-row">
              <label>
                Method{" "}
                <select value={method.id} aria-label="Ability method" onChange={(event) => setB(W.setMethod(b, Number(event.target.value), opts) as Build)}>
                  {W.ABILITY_METHODS.filter((item) => opts.methods.includes(item.id)).map((item) => (
                    <option key={item.id} value={item.id}>
                      {W.methodLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              {!method.manual && !perAbility ? (
                <button type="button" className="ccw-button" data-action="roll-abilities" disabled={rolling !== ""} title="Roll ability scores using the selected method" onClick={() => void rollAll()}>
                  {rolling === "abilities" ? "Rolling…" : method.scores ? "Set Scores" : "Roll Abilities"}
                </button>
              ) : null}
              <label>
                Target Level{" "}
                <input type="number" min={1} max={20} value={b.targetLevel} aria-label="Target level" onChange={(event) => setB(W.setTargetLevel(b, Number(event.target.value) || 1) as Build)} />
              </label>
              <span className="hint">{arranges && !method.manual ? "Drag a score onto another (or click one, then another) to swap them." : perAbility ? "In order: roll each score with its die." : ""}</span>
            </div>
            <div className="ccw35-abilities">
              <span />
              <small>Base</small>
              <small />
              <small>Level +</small>
              <small>Race</small>
              <small>Total</small>
              {W.STATS.map((stat) => {
                const total = W.finalScore(b, stat) as number;
                return (
                  <div key={stat} className="ccw35-ability" data-ability={stat}>
                    <b>{titled(stat)}</b>
                    {method.manual ? (
                      <input type="number" min={1} max={30} value={b.abilities[stat] ?? 10} aria-label={`${stat} score`} onChange={(event) => setB({ ...b, abilities: { ...b.abilities, [stat]: Math.max(1, Number(event.target.value) || 1) } })} />
                    ) : (
                      <span
                        className={`ccw-slot${dragging && dragging !== stat ? " target" : ""}${picked === stat ? " picked" : ""}`}
                        data-stat={stat}
                        role="button"
                        tabIndex={0}
                        aria-label={`${stat} score`}
                        draggable={arranges}
                        onClick={() => {
                          if (!arranges) return;
                          if (picked && picked !== stat) {
                            swap(picked, stat);
                            setPicked(null);
                          } else setPicked(picked === stat ? null : stat);
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/kraken-score", stat);
                          setDragging(stat);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onDragOver={(event) => {
                          if (dragging && arranges) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const from = event.dataTransfer.getData("text/kraken-score") || dragging;
                          setDragging(null);
                          if (from) swap(from, stat);
                        }}
                      >
                        {b.abilities[stat] ?? 10}
                      </span>
                    )}
                    <span className="ccw35-ability-buttons">
                      {perAbility ? (
                        <button type="button" data-action="roll-ability" data-stat={stat} disabled={rolling !== ""} title="Roll this ability score using the selected method." onClick={() => void rollOne(stat)}>
                          🎲
                        </button>
                      ) : null}
                      {W.canLowReroll(b, opts, stat) ? (
                        <button type="button" data-action="reroll-low" data-stat={stat} disabled={rolling !== ""} title="House rule reroll: roll 3d6 and keep the result." onClick={() => void rerollLow(stat)}>
                          3d6
                        </button>
                      ) : null}
                    </span>
                    <input type="number" min={0} max={5} value={b.increases[stat] ?? 0} disabled={W.increasesDue(b) === 0} aria-label={`${stat} level increase`} onChange={(event) => setB({ ...b, increases: { ...b.increases, [stat]: Math.max(0, Math.floor(Number(event.target.value) || 0)) } })} />
                    <span className="ccw-slot readonly">{W.raceMod(b, stat) ? signed(W.raceMod(b, stat)) : "-"}</span>
                    <span className="ccw35-total" data-final={stat}>
                      {total} ({signed(W.abilityMod(total))})
                    </span>
                  </div>
                );
              })}
            </div>
            {W.STATS.some((stat) => W.canLowReroll(b, opts, stat)) ? <p className="ccw-warn">DM House Rule: A score under 8 may be rerolled once with 3d6, but the new result must stand.</p> : null}
            <p data-increases>{W.increaseSummary(b)}</p>
            <p className="ccw35-prose">{ABILITY_PROSE}</p>
          </div>
        ) : null}

        {page === "race" ? (
          race ? (
            <>
              <Plate
                action={
                  <button type="button" className="ccw-change" data-action="change-race" onClick={() => setB(W.chooseRace(b, null) as Build)}>
                    Change Race
                  </button>
                }
              >
                {race.name.toUpperCase()}
              </Plate>
              <div className="ccw-chosen">
                {raceArt ? <img className="ccw-portrait" src={`${ART}/choices/${raceArt}.webp`} alt="" /> : <span />}
                <div className="ccw-chosen-info">
                  <h3>{race.name}</h3>
                  <p>
                    Ability adjustments:{" "}
                    {W.STATS.filter((stat) => W.raceMod(b, stat))
                      .map((stat) => `${signed(W.raceMod(b, stat))} ${titled(stat)}`)
                      .join(", ") || "None"}
                  </p>
                  {W.levelAdjustment(b) ? <p>Level adjustment +{W.levelAdjustment(b)}</p> : null}
                  <p>Languages: {W.knownLanguages(b).join(", ") || "-"}</p>
                  <p>Source: {race.source}</p>
                  {(RACE_PROSE as Record<string, string>)[raceKey] ? <p className="ccw35-prose">{(RACE_PROSE as Record<string, string>)[raceKey]}</p> : null}
                </div>
              </div>
              {raceDetail ? (
                <>
                  <Plate>What This Race Means</Plate>
                  <div className="ccw-panel">
                    <p>{raceDetail.top}</p>
                    <p>{raceDetail.bottom}</p>
                    {(RACE_MANUAL_NOTES as Record<string, string>)[raceKey] ? <p className="hint">{(RACE_MANUAL_NOTES as Record<string, string>)[raceKey]}</p> : null}
                  </div>
                </>
              ) : null}
              <Plate>Racial Traits</Plate>
              {Object.values((race.data.racialtraits ?? {}) as Record<string, { name?: string; text?: string }>)
                .filter((row) => row && typeof row === "object")
                .map((row, index) => (
                  <Card key={index} title={String(row.name ?? "")} body={text(row.text)} />
                ))}
            </>
          ) : (
            <PickList rows={lib.races} kind="race" onPick={(row) => {
              setB(W.chooseRace(b, row.name) as Build);
              say(`Race set to '${row.name}'.`);
            }} />
          )
        ) : null}

        {page === "class" ? (
          primary && !b.adding ? (
            <>
              <Plate
                action={
                  <button type="button" className="ccw-change" data-action="change-class" onClick={() => setB(W.chooseClass(b, null) as Build)}>
                    Change Class
                  </button>
                }
              >
                {W.planSummary(b).toUpperCase()}
              </Plate>
              <div className="ccw-chosen">
                {classArt ? <img className="ccw-portrait" src={`${ART}/choices/${classArt}.webp`} alt="" /> : <span />}
                <div className="ccw-chosen-info">
                  <h3 data-class-plan>{W.planSummary(b)}</h3>
                  {plan.map((entry) => {
                    const record = lib.classes.find((row) => row.name === entry.name);
                    return (
                      <p key={entry.name}>
                        {entry.name}: hit die {String(record?.data.hitdie ?? "")}, base attack {String(record?.data.bab ?? "").toLowerCase()}, Fortitude {String(record?.data.fort ?? "").toLowerCase()}, Reflex {String(record?.data.ref ?? "").toLowerCase()}, Will {String(record?.data.will ?? "").toLowerCase()}, {String(record?.data.skillranks ?? "")} + Int skill points a level. Source: {record?.source}
                      </p>
                    );
                  })}
                  <div className="ccw-row">
                    <label>
                      Class levels{" "}
                      <input type="number" min={1} max={20} value={classLevels || plan[plan.length - 1].levels} aria-label="Class levels" onChange={(event) => setClassLevels(Number(event.target.value) || 0)} />
                    </label>
                    <button type="button" className="ccw-button" data-action="set-class-levels" onClick={() => {
                      setB(W.setClassLevels(b, classLevels || plan[plan.length - 1].levels) as Build);
                      setClassLevels(0);
                    }}>
                      Set Levels
                    </button>
                    <button type="button" className="ccw-button" data-action="add-class" disabled={W.totalLevels(b) >= W.maxClassLevels(b)} onClick={() => {
                      setB(W.startAddClass(b) as Build);
                      setClassLevels(1);
                    }}>
                      Add Class
                    </button>
                  </div>
                  {xpWarning ? <p className="ccw-warn">{xpWarning}</p> : null}
                  {(CLASS_PROSE as Record<string, string>)[primary.key] ? <p className="ccw35-prose">{(CLASS_PROSE as Record<string, string>)[primary.key]}</p> : null}
                </div>
              </div>
              {classDetail ? (
                <>
                  <Plate>What This Class Means</Plate>
                  <div className="ccw-panel">
                    <p>{classDetail.top}</p>
                    <p>{classDetail.bottom}</p>
                  </div>
                </>
              ) : null}
              <Plate>Class Features</Plate>
              {plan.flatMap((entry) => {
                const record = lib.classes.find((row) => row.name === entry.name);
                return Object.values((record?.data.classfeatures ?? {}) as Record<string, { name?: string; level?: number; text?: string }>)
                  .filter((row) => row && typeof row === "object" && Number(row.level ?? 1) <= entry.levels)
                  .sort((a, c) => Number(a.level ?? 0) - Number(c.level ?? 0) || String(a.name).localeCompare(String(c.name)))
                  .map((row, index) => <Card key={`${entry.name}-${index}`} title={`${plan.length > 1 ? `${entry.name} ` : ""}(Level ${String(Number(row.level ?? 1)).padStart(2, "0")}) ${String(row.name ?? "")}`} body={text(row.text)} />);
              })}
            </>
          ) : (
            <>
              {!b.race ? <p className="ccw-panel">Choose your race first (Race tab): a race with a level adjustment counts toward the 20-level cap.</p> : null}
              <div className="ccw-row ccw-panel">
                <label>
                  Class levels{" "}
                  <input type="number" min={1} max={20} value={classLevelsWanted} aria-label="Class levels" onChange={(event) => setClassLevels(Number(event.target.value) || 0)} />
                </label>
                {b.adding ? (
                  <button type="button" onClick={() => setB({ ...b, adding: false })}>
                    Cancel
                  </button>
                ) : null}
                <span className="hint">{b.adding ? `Adding a class to ${W.planSummary(b)}.` : `Target level ${b.targetLevel}${W.levelAdjustment(b) ? ` (LA +${W.levelAdjustment(b)})` : ""}.`}</span>
              </div>
              <PickList rows={lib.classes} kind="class" onPick={(row) => {
                const result = W.chooseClass(b, row.name, classLevelsWanted) as Build;
                if (result.problem) return say(result.problem);
                setB(result);
                setClassLevels(0);
                say(`Class set to '${row.name}'.`);
              }} />
            </>
          )
        ) : null}

        {page === "languages" ? (
          <div className="ccw-panel">
            <p data-languages-known>Known automatically: {W.knownLanguages(b).join(", ") || "-"}</p>
            <p data-languages-bonus>
              Bonus choices: {W.chosenLanguages(b).length} of {W.languageLimit(b)} selected
            </p>
            <p className="hint">Automatic and already-known languages are locked and cannot be selected twice. Intelligence grants the racial bonus slots; each full Speak Language rank grants one additional slot.</p>
            {(W.languageOptions(b) as string[]).length === 0 ? <p className="hint">No additional language choices are available.</p> : null}
            {(W.languageOptions(b) as string[]).map((name) => {
              const on = (W.chosenLanguages(b) as string[]).includes(name);
              return (
                <div key={name} className={on ? "ccw-pick on" : "ccw-pick"}>
                  <button type="button" className="ccw-add" aria-label={`${on ? "Remove" : "Add"} ${name}`} data-language={name} onClick={() => apply(W.toggleLanguage(b, name))}>
                    {on ? "−" : "+"}
                  </button>
                  <span className="ccw-pick-name">{name}</span>
                  <span className="ccw-pick-source">{on ? "Selected" : "Available"}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {page === "alignment" ? (
          b.alignment ? (
            <>
              <Plate
                action={
                  <button type="button" className="ccw-change" data-action="change-alignment" onClick={() => setB({ ...b, alignment: null, skills: {}, feats: [], equipment: {}, spells: [] })}>
                    Change Alignment
                  </button>
                }
              >
                {b.alignment.toUpperCase()}
              </Plate>
              <div className="ccw-panel">
                <h3 data-alignment-chosen>{b.alignment}</h3>
                {alignmentDetail ? (
                  <>
                    <p>{alignmentDetail.top}</p>
                    <p>{alignmentDetail.bottom}</p>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="ccw-panel">
              {(W.allowedAlignments(b) as string[]).length === 0 ? <p className="hint">No legal alignments for the selected class.</p> : null}
              {(W.allowedAlignments(b) as string[]).map((alignment) => (
                <div key={alignment} className="ccw-pick">
                  <button type="button" className="ccw-add" aria-label={`Choose ${alignment}`} data-alignment={alignment} onClick={() => setB({ ...b, alignment })}>
                    +
                  </button>
                  <span className="ccw-pick-name">{alignment}</span>
                  <span />
                </div>
              ))}
              <p className="ccw35-prose">{ALIGNMENT_PROSE}</p>
            </div>
          )
        ) : null}

        {page === "skills" ? (
          <div className="ccw-panel">
            <p data-skill-points>
              <b>{W.skillSummary(b, lib)}</b>
            </p>
            {!primary ? (
              <p className="hint">Choose race, class, and alignment before spending skill points.</p>
            ) : (
              <div className="ccw35-skills">
                {W.SKILL_ORDER.map((skill) => {
                  const classSkill = W.isClassSkill(b, lib, skill) as boolean;
                  const ranks = Number(b.skills[skill.name] ?? 0);
                  return (
                    <div key={skill.name} className={classSkill ? "ccw35-skill class-skill" : "ccw35-skill"} data-skill={skill.name}>
                      <button type="button" aria-label={`Lower ${skill.name}`} disabled={ranks <= 0} onClick={() => apply(W.adjustSkill(b, lib, skill.name, -1))}>
                        −
                      </button>
                      <b className="ccw35-ranks" data-ranks={ranks}>
                        {W.formatNumber(ranks)}
                      </b>
                      <button type="button" aria-label={`Raise ${skill.name}`} onClick={() => apply(W.adjustSkill(b, lib, skill.name, 1))}>
                        +
                      </button>
                      <span>
                        {classSkill ? "● " : ""}
                        {skill.name}
                      </span>
                      <small className="hint">
                        {classSkill ? "class" : "cross-class"}, max {W.formatNumber(W.skillCap(b, lib, skill))}
                      </small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {page === "feats" ? (
          <>
            <div className="ccw-panel">
              <p data-feat-count>
                <b>{W.featSummary(b, lib)}</b>
              </p>
              {b.feats.length ? <p>Chosen: {b.feats.map((feat) => feat.name).join(", ")}</p> : null}
            </div>
            {b.pendingTarget ? (
              <div className="ccw-picklist" data-feat-targets>
                <p className="ccw-warn">Choose the target for {b.pendingTarget}:</p>
                <div className="ccw-pick">
                  <button type="button" className="ccw-add" aria-label="Return to the feat list" onClick={() => setB(W.chooseFeatTarget(b, null) as Build)}>
                    ‹
                  </button>
                  <span className="ccw-pick-name">Return to the feat list (cancel)</span>
                  <span />
                </div>
                {(W.featTargets(b, lib, b.pendingTarget) as string[]).map((target) => (
                  <div key={target} className="ccw-pick">
                    <button type="button" className="ccw-add" aria-label={`Choose ${b.pendingTarget} (${target})`} onClick={() => setB(W.chooseFeatTarget(b, target) as Build)}>
                      +
                    </button>
                    <span className="ccw-pick-name">
                      {b.pendingTarget} ({target})
                    </span>
                    <span />
                  </div>
                ))}
              </div>
            ) : (
              <PickList
                rows={lib.feats}
                kind="feat"
                onPick={(row) => apply(W.addFeat(b, lib, row.name))}
                status={(row) => {
                  const state = W.featStatus(b, lib, row) as { chosen: number; text: string; blocked: boolean };
                  return { text: state.text, blocked: state.blocked, remove: state.chosen ? () => setB(W.removeFeat(b, row.name) as Build) : undefined };
                }}
              />
            )}
          </>
        ) : null}

        {page === "equipment" ? (
          <>
            <div className="ccw-panel">
              <p data-gold-instruction>{W.goldInstruction(b, lib, opts)}</p>
              <div className="ccw-row">
                {!W.goldRolled(b) ? (
                  <button type="button" className="ccw-button" data-action="roll-gold" disabled={rolling !== "" || !primary} title="Roll class starting gold." onClick={() => void rollGold()}>
                    🎲 {rolling === "gold" ? "Rolling…" : W.gearLevel(b) > 1 ? "Set Wealth by Level" : `Roll Starting Gold (${(W.goldInfo(b, lib) as { expr: string }).expr})`}
                  </button>
                ) : null}
                <span>
                  GP <b className="ccw-box">{Math.floor(remainingCopper / 100)}</b>
                </span>
                <span>
                  SP <b className="ccw-box">{Math.floor((remainingCopper % 100) / 10)}</b>
                </span>
                <span>
                  CP <b className="ccw-box">{remainingCopper % 10}</b>
                </span>
                <span>
                  Left <b className="ccw-box" data-coin-left={remainingCopper}>{W.goldRolled(b) ? W.coinText(remainingCopper) : "-"}</b>
                </span>
              </div>
              <p data-gear-summary>{W.equipmentSummary(b, lib, opts)}</p>
              <p className="hint">Class storefront: weapons and armor are restricted to practical choices permitted for your class. The Name box searches within this permitted starter list.{opts.vault ? " Vault starter hand-me-downs are enabled; matching poor or secondhand Vault records appear here as free gear." : ""}</p>
            </div>
            <div className="ccw-panel">
              <div className="ccw-filter">
                <label>
                  Source{" "}
                  <select value={shopSource} onChange={(event) => setShopSource(event.target.value)} aria-label="Shop source">
                    {["(All)", ...new Set(shop.map((item) => item.source))].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Name <input value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} aria-label="Shop search" />
                </label>
              </div>
              {!primary ? <p className="hint">Choose a class first: your class sets your starting gold and what the shop sells you.</p> : shop.length === 0 ? <p className="hint">No item records found for your class's storefront. Load a Player's Handbook or equipment module.</p> : null}
              <div className="ccw35-shop">
                {shop
                  .filter((item) => (shopSource === "(All)" || item.source === shopSource) && item.name.toLowerCase().includes(shopSearch.toLowerCase()))
                  .map((item) => {
                    const qty = b.equipment[item.key] ?? 0;
                    return (
                      <div key={item.key} className={qty ? "ccw35-shop-row on" : W.goldRolled(b) ? "ccw35-shop-row" : "ccw35-shop-row closed"} data-item={item.name}>
                        <button type="button" className="ccw-add" aria-label={`Buy ${item.name}`} disabled={!W.goldRolled(b)} onClick={() => apply(W.adjustEquipment(b, lib, opts, item.key, 1))}>
                          +
                        </button>
                        <button type="button" className="ccw-add" aria-label={`Return ${item.name}`} disabled={!qty} onClick={() => apply(W.adjustEquipment(b, lib, opts, item.key, -1))}>
                          −
                        </button>
                        <span title={text(item.data.description).slice(0, 300)}>{item.name}</span>
                        <span className="hint">{W.itemCostText(opts, item)}</span>
                        <b data-qty={qty}>{qty || ""}</b>
                        <span className="ccw-pick-source">{item.source}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        ) : null}

        {page === "spells" ? (
          <>
            <div className="ccw-panel">
              <p data-spell-summary>
                <b>{W.spellHeaderSummary(b)}</b>
              </p>
              {W.spellGuidance(b) ? <p className="hint">{W.spellGuidance(b)}</p> : null}
              {W.autoSpellNote(b) ? <p className="hint">{W.autoSpellNote(b)}</p> : null}
              {buckets.length > 0 ? (
                <div className="ccw-filter">
                  <label>
                    Name <input value={spellSearch} onChange={(event) => setSpellSearch(event.target.value)} aria-label="Spell search" />
                  </label>
                  <label>
                    School{" "}
                    <select value={spellSchool} onChange={(event) => setSpellSchool(event.target.value)} aria-label="Spell school">
                      {["(All)", ...allSchools.map(titled)].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <p>No Spell Records Required: this class plan does not choose loaded spell records at this level. Check the summary for any remaining manual class choices.</p>
              )}
            </div>
            {buckets.map((bucket) => {
              const rows = (W.bucketRows(b, lib, bucket) as SpellRow[]).filter((row) => row.name.toLowerCase().includes(spellSearch.toLowerCase()) && (spellSchool === "(All)" || W.isChoiceKind(bucket.classkey) || !row.school || row.school === spellSchool.toLowerCase()));
              const have = counts[bucket.key] ?? 0;
              return (
                <div key={bucket.key} className="ccw-picklist ccw35-bucket" data-bucket={bucket.key}>
                  <p className={have >= bucket.needed ? "ccw35-bucket-head done" : "ccw35-bucket-head"}>
                    <b>
                      {bucket.classlabel}: {W.bucketLabel(bucket)}: choose {bucket.needed} ({have} chosen)
                    </b>
                  </p>
                  {rows.map((row) => {
                    const chosen = b.spells.filter((spell) => spell.bucket === bucket.key && spell.record === row.record).length;
                    return (
                      <div key={row.record} className={chosen ? "ccw-pick on" : "ccw-pick"}>
                        <button type="button" className="ccw-add" aria-label={`Choose ${row.name}`} data-spell={row.name} onClick={() => apply(W.addSpell(b, lib, bucket.key, row))}>
                          +
                        </button>
                        <span className="ccw-pick-name">
                          {row.name}
                          {row.level !== undefined && !W.isChoiceKind(bucket.classkey) ? <small> {bucket.classlabel} L{row.level}</small> : null}
                          {chosen ? <small> - {chosen > 1 ? `Selected x${chosen}` : "Selected"}</small> : null}
                        </span>
                        <span className="ccw-pick-source">
                          {chosen ? (
                            <button type="button" className="ccw-remove" aria-label={`Remove ${row.name}`} onClick={() => setB(W.removeSpell(b, lib, bucket.key, row.record) as Build)}>
                              −
                            </button>
                          ) : null}{" "}
                          {row.source}
                        </span>
                      </div>
                    );
                  })}
                  {rows.length === 0 ? <p className="hint">No spell records of this group in the active books.</p> : null}
                </div>
              );
            })}
          </>
        ) : null}

        {page === "details" ? (
          <div className="ccw-panel ccw-details">
            <ArtChoice session={session} race={b.race ?? ""} cls={primary?.name ?? ""} value={art} onChange={setArt} />
            <label>
              Name <input value={b.details.name ?? ""} onChange={(event) => setB({ ...b, details: { ...b.details, name: event.target.value } })} aria-label="Character name" />
            </label>
            <label>
              Deity{" "}
              <input
                value={b.details.deity ?? (W.choiceText(b, "deity") && W.choiceText(b, "deity") !== W.NO_DEITY ? String(W.choiceText(b, "deity")) : "")}
                onChange={(event) => setB({ ...b, details: { ...b.details, deity: event.target.value } })}
                aria-label="deity"
              />
            </label>
            <label>
              Gender <input value={b.details.gender ?? ""} onChange={(event) => setB({ ...b, details: { ...b.details, gender: event.target.value } })} aria-label="gender" />
            </label>
            <div className="ccw-row">
              {(["age", "height", "weight"] as const).map((key) => (
                <label key={key}>
                  {titled(key)} <input className="short" value={b.details[key] ?? ""} onChange={(event) => setB({ ...b, details: { ...b.details, [key]: event.target.value } })} aria-label={key} />
                </label>
              ))}
            </div>
            <label className="wide">
              Appearance <textarea value={b.details.appearance ?? ""} onChange={(event) => setB({ ...b, details: { ...b.details, appearance: event.target.value } })} aria-label="appearance" />
            </label>
            <label className="wide">
              Notes <textarea value={b.details.notes ?? ""} onChange={(event) => setB({ ...b, details: { ...b.details, notes: event.target.value } })} aria-label="notes" />
            </label>
          </div>
        ) : null}

        {page === "commit" ? (
          <>
            <Plate>Warnings</Plate>
            <div className="ccw-panel">
              {warnings.length === 0 ? <p data-warnings-none>Nothing left to do: the character is ready.</p> : null}
              {warnings.map((item) => (
                <button key={item.text} type="button" className="ccw-warning ccw35-warning" title="Click to go to this step." data-warning={item.page} onClick={() => setPage(item.page)}>
                  <img src={`${ART}/alert.webp`} alt="" /> <b>{item.note ? "DM NOTE" : "WARNING"}</b> {item.text}
                </button>
              ))}
            </div>
            <Plate>Summary</Plate>
            <div className="ccw-panel ccw35-summary">
              <p>
                <b>Name:</b> {b.details.name || "None selected"}
              </p>
              <p>
                <b>Abilities:</b> {W.STATS.map((stat) => `${titled(stat).slice(0, 3)} ${W.finalScore(b, stat)}`).join(", ")}
              </p>
              <p>
                <b>Race:</b> {b.race ?? "None selected"} <b>Class:</b> {W.planSummary(b)} <b>Alignment:</b> {b.alignment ?? "None selected"}
              </p>
              <p>
                <b>Languages:</b> {W.languageSummary(b)}
              </p>
              <p>
                <b>Skills:</b>{" "}
                {Object.entries(b.skills)
                  .filter(([, ranks]) => ranks > 0)
                  .map(([name, ranks]) => `${name} ${W.formatNumber(ranks)}`)
                  .join(", ") || "None"}
              </p>
              <p>
                <b>Feats:</b> {b.feats.map((feat) => feat.name).join(", ") || "None"}
              </p>
              <p>
                <b>Equipment:</b>{" "}
                {Object.entries(b.equipment)
                  .map(([key, qty]) => `${lib.items.find((item) => item.key === key)?.name ?? key}${qty > 1 ? ` x${qty}` : ""}`)
                  .join(", ") || "None"}
                ; {W.goldRolled(b) ? `${W.coinText(remainingCopper)} left` : "no gold rolled"}
              </p>
              <p>
                <b>Spells and choices:</b> {b.spells.map((spell) => spell.name).join(", ") || "None"}
              </p>
            </div>
            <Plate>Save</Plate>
            <div className="ccw-panel">
              <button type="button" className="play-button ccw-create" data-action="wizard-finish" disabled={creating} onClick={() => void create()}>
                {creating ? "Creating…" : "Create Character"}
              </button>
              {blocking ? <p className="hint">A character with warnings is saved unfinished: what is left goes in its notes, to finish with your DM.</p> : null}
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
