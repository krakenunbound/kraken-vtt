import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { ArtChoice } from "./ArtPicker";
import { useHostRolls } from "./Wizard";
import { abilityAdjustments, CASTERS, mod, profileFor, signed, SKILLS, skillKey, slotsFor, STATS } from "../../shared/dnd5e/rules.mjs";
import {
  addableItem,
  ancestriesOf,
  asiOrFeatDecisions,
  backgroundAsiDecisions,
  backgroundFixedIncreases,
  backgroundInfo,
  classInfo,
  classSpells,
  currenciesOf,
  GEN_ROLL,
  itemKind,
  kitText,
  mainCurrency,
  METHODS,
  plain,
  POINT_BUY_MAX,
  pointCost,
  pointsSpent,
  speciesInfo,
  spellCounts,
  swapAbility,
  TAB_LABEL,
  TABS,
  totalWealth,
  wealthRoll,
} from "../../shared/dnd5e/wizard.mjs";

// The D&D 5E character wizard, after Fantasy Grounds' 5E wizard (and the same
// for Descending Darkness, which FG plays through the 5E ruleset): six tabs,
// Species, Class, Abilities, Background, Equipment and Commit, each with its
// alert badge until its choices are made. A choice is made by the + beside a
// species, class or background; what it gives is listed under it as FG lists
// features, each open choice a drop-down (skills, languages, tools, ability
// increases, feats, a subclass, an Ability Score Improvement's +2 or two +1s
// or a feat). Abilities: the standard array (swapped with the arrows), point
// buy (27 points, 8 to 15), or 4d6 drop the lowest, rolled by the host for
// the table to see. Equipment: the class's and the background's starting kit
// (A, B or C: items and/or coin), a Legacy class's starting wealth rolled
// instead, items added free, the coins. Commit lists what is left undone (it
// goes in the sheet's notes), the name and a summary; Save has the host build
// the character from the spec (shared/dnd5e/rules.mjs buildFromSpec), as an
// agent's kraken_build_character does.

type Row = Record<string, unknown>;
type Stat = (typeof STATS)[number];
type Tab = (typeof TABS)[number];
type Decision = { id: string; type: string; label: string; options: string[]; adj?: number; category?: string; feature?: string };
type Kit = { letter: string; items: { name: string; count: number; data: Row }[]; wealth: number };
type Species = { name: string; is2024: boolean; size: string; speed: number; darkvision: number; languages: { base: string[] }; skills: { base: string[] }; traits: Row[]; decisions: Decision[]; increases: Record<string, number> };
type Background = { name: string; is2024: boolean; abilities: string[]; decisions: Decision[]; skills: { base: string[] }; tools: { base: string[] }; languages: { base: string[] }; feat: string; kits: Kit[]; gold: number; features: string[] };
type ClassInfo = { name: string; is2024: boolean; saves: string[]; armor: string; weapons: string; tools: string; skills: { base: string[] }; features: { id: string; name: string; level: number; text: string; subclass: string }[]; decisions: Decision[]; kits: Kit[]; wealthRoll: string };

const SHORT: Record<string, string> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const titled = (word: string) => word.replace(/\b\w/g, (letter) => letter.toUpperCase());
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const zero = () => Object.fromEntries(STATS.map((stat) => [stat, 0])) as Record<Stat, number>;
const sourceOf = (record: TableRecord) => /@(.+)$/.exec(String(record.data.fgPath ?? ""))?.[1] ?? String(record.data.fgCategory ?? "Campaign");

// FG's instructions, a page at a time.
const STEPS: Record<Tab, string[]> = {
  species: ["Review the available Species and Ancestry options by clicking on their names.", "Click the Add button next to the Species option you want.", "If the Species has Ancestry options, then click the Add button next to the Ancestry option you want.", "Review available Species Proficiencies and Traits; and resolve any outstanding choices using drop-down selection boxes."],
  class: ["Review the available Class options by clicking on their names.", "Click the Add button next to the Class option you want.", "Review available Class Proficiencies and Features; and resolve any outstanding choices using drop-down selection boxes.", "If you want to make a character higher than level 1, use the arrows next to the Class level."],
  abilities: ["Choose an Ability Score generation method from the Method drop-down.", "For Dice Roll, click the roll button: the host rolls 4d6, dropping the lowest, for each ability.", "For Point Buy, click the up/down buttons in the Base column to spend the points.", "For Standard Array, use the arrows to swap Base scores between abilities."],
  background: ["Review the available Background options by clicking on their names.", "Click the Add button next to the Background option you want.", "Review available Background Proficiencies and Features; and resolve any outstanding choices using drop-down selection boxes."],
  equipment: ["Once your Class and Background are selected, choose from the available Starting Kit options for both to set your Starting Equipment and Currency.", "If you are making a D&D (Legacy) character, you can make a Starting Wealth roll instead of selecting Starting Kits.", "Add any other items you need; they cost nothing here."],
  commit: ["Review warnings (if any) and return to previous sections to resolve.", "Enter your character name.", "Review character to make sure everything looks right.", "Click the Save button to finalize and create the Character record."],
};

function Plate({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="ccw-plate">
      {action}
      <span>{children}</span>
    </div>
  );
}

// A list of records to choose from: Source and Name filters, + to choose, the name to read it.
function Choose({ records, kind, onPick, blocked }: { records: TableRecord[]; kind: string; onPick: (record: TableRecord) => void; blocked?: (record: TableRecord) => string | null }) {
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const sources = [...new Set(records.map(sourceOf))].sort();
  const shown = records.filter((record) => (!source || sourceOf(record) === source) && record.name.toLowerCase().includes(name.toLowerCase()));
  return (
    <div className="ccw-picklist">
      <div className="ccw-filter">
        <label>
          Source
          <select value={source} onChange={(event) => setSource(event.target.value)} aria-label={`${kind} source`}>
            <option value="" />
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
      {shown.map((record) => {
        const why = blocked?.(record) ?? null;
        return (
          <div key={record.id} className={why ? "ccw-pick blocked" : "ccw-pick"}>
            <button type="button" className="ccw-add" disabled={Boolean(why)} title={why ?? "Add"} aria-label={`Add ${record.name}`} onClick={() => onPick(record)} {...{ [`data-${kind}`]: record.name }}>
              +
            </button>
            <button type="button" className="ccw-pick-name" onClick={() => setReading(reading === record.id ? "" : record.id)}>
              {record.name}
              {why ? <small> - {why}</small> : null}
            </button>
            <span className="ccw-pick-source">{sourceOf(record)}</span>
            {reading === record.id ? <p className="ccw-reading">{plain(record.data.text) || "No text."}</p> : null}
          </div>
        );
      })}
      {shown.length === 0 ? <p className="hint">Nothing to choose.</p> : null}
    </div>
  );
}

// A feature (a trait, a class feature, the proficiencies) with its text and its open choices.
function Feature({ title, text, level, children, alert }: { title: string; text?: string; level?: number; children?: React.ReactNode; alert?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "ccw-card open w5-feature" : "ccw-card w5-feature"} data-feature={title}>
      <button type="button" className="ccw-card-title" onClick={() => setOpen(!open)} aria-expanded={open} disabled={!text}>
        {alert ? <span className="w5-alert" title="A choice to make">!</span> : null}
        <b>{title}</b> {level ? <small className="hint">level {level}</small> : null} {text ? <span aria-hidden>{open ? "−" : "+"}</span> : null}
      </button>
      {open && text ? <p className="ccw-card-text">{text}</p> : null}
      {children}
    </div>
  );
}

export function Wizard5e({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const rollOnHost = useHostRolls(session);
  const profile = profileFor(session.ruleset);
  const words = profile.labels;
  const records = useMemo(() => Object.values(session.records), [session.records]);
  const of = (type: string) => records.filter((item) => item.type === type).sort((a, b) => a.name.localeCompare(b.name));
  const classes = of("class");
  const speciesList = of("race");
  const ancestryList = of("race_subrace");
  const backgrounds = of("background");
  const subclasses = of("class_specialization");
  const feats = of("feat");
  const items = of("item");
  const spellsAll = of("spell");
  const coins = currenciesOf(profile.id) as string[];
  const main = mainCurrency(profile.id) as string;

  // FG opens the wizard on its Class page.
  const [tab, setTab] = useState<Tab>("class");
  const [speciesName, setSpeciesName] = useState("");
  const [ancestryName, setAncestryName] = useState("");
  const [className, setClassName] = useState("");
  const [level, setLevel] = useState(1);
  const [backgroundName, setBackgroundName] = useState("");
  const [method, setMethod] = useState("");
  const [base, setBase] = useState<Record<Stat, number>>(() => Object.fromEntries(STATS.map((stat) => [stat, 10])) as Record<Stat, number>);
  const [misc, setMisc] = useState<Record<Stat, number>>(zero);
  const [rolling, setRolling] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [spells, setSpells] = useState<string[]>([]);
  const [spellFilter, setSpellFilter] = useState({ name: "", level: "" });
  const [kits, setKits] = useState<{ class?: string; background?: string }>({});
  const [rolled, setRolled] = useState(0);
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<[string, number][]>([]);
  const [itemFilter, setItemFilter] = useState({ kind: "", name: "" });
  const [name, setName] = useState("");
  const [art, setArt] = useState<{ portrait?: string; token?: string }>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [instructions, setInstructions] = useState(true);

  const speciesRecord = speciesList.find((item) => item.name === speciesName) ?? null;
  const ancestries = ancestriesOf(speciesRecord, ancestryList) as TableRecord[];
  const ancestryRecord = ancestries.find((item) => item.name === ancestryName) ?? null;
  const classRecord = classes.find((item) => item.name === className) ?? null;
  const backgroundRecord = backgrounds.find((item) => item.name === backgroundName) ?? null;
  const kin = speciesInfo(speciesRecord, ancestryRecord) as Species | null;
  const bg = backgroundInfo(backgroundRecord, items) as Background | null;
  const subclassName = Object.entries(choices).find(([id]) => id.endsWith(":subclass") && id.startsWith("class:"))?.[1] ?? "";
  const subclassRecord = subclasses.find((item) => item.name === subclassName && String(item.data.class ?? "").toLowerCase() === className.toLowerCase()) ?? null;
  const klass = classInfo(classRecord, level, subclassRecord) as ClassInfo | null;
  const kinAdjust = abilityAdjustments(speciesRecord) as Record<string, number>;
  // A kin may limit the classes (Descending Darkness: a dwarf is a fighter, cleric or thief).
  const allowedClasses = speciesRecord?.data.classes ? String(speciesRecord.data.classes).split(/,\s*/).map((item) => item.trim().toLowerCase()) : null;

  // Every decision now open, the follow-on ones (an option's +2 and +1, an Ability Score Improvement's choice) after their parent.
  const expand = (list: Decision[], page: Tab): Decision[] =>
    list.flatMap((item) => {
      if (item.type === "asiorfeat") return [item, ...(asiOrFeatDecisions(item.id, choices[item.id], choices[`${item.id}:asioption`]) as Decision[])];
      if (item.type === "asioption" && page !== "class") {
        const prefix = item.id.split(":")[0];
        return [item, ...(backgroundAsiDecisions(choices[item.id] ?? "", prefix === "background" ? bg?.abilities ?? [] : [], prefix) as Decision[])];
      }
      return [item];
    });
  const decisions: Record<"species" | "class" | "background", Decision[]> = {
    species: kin ? expand(kin.decisions, "species") : [],
    class: klass ? expand(klass.decisions, "class") : [],
    background: bg ? expand(bg.decisions, "background") : [],
  };
  const allDecisions = [...decisions.species, ...decisions.class, ...decisions.background];
  const chosen = (type: string, page?: string) => allDecisions.filter((item) => item.type === type && (!page || item.id.startsWith(`${page}:`))).map((item) => choices[item.id]).filter(Boolean);

  // Ability scores (updateAbilities): base, background (2024), species (Legacy), ASI, misc.
  const increasesFrom = (prefix: string) => {
    const out: Record<string, number> = {};
    for (const item of allDecisions) if (item.type === "asi" && item.id.startsWith(prefix) && choices[item.id]) out[choices[item.id].toLowerCase()] = (out[choices[item.id].toLowerCase()] ?? 0) + (item.adj ?? 1);
    return out;
  };
  const backgroundAsi = bg?.is2024 ? { ...increasesFrom("background:"), ...backgroundFixedIncreases(choices["background:asioption"] ?? "", bg.abilities) } : {};
  const speciesDecisionAsi = !bg?.is2024 ? increasesFrom("species:") : {};
  const speciesAsi: Record<string, number> = Object.fromEntries(STATS.map((stat) => [stat, (kinAdjust[stat] ?? 0) + (!bg?.is2024 ? kin?.increases[stat] ?? 0 : 0) + (speciesDecisionAsi[stat] ?? 0)]));
  const classAsi = increasesFrom("class:");
  const total = (stat: Stat) => base[stat] + (backgroundAsi[stat] ?? 0) + (speciesAsi[stat] ?? 0) + (classAsi[stat] ?? 0) + misc[stat];
  const spent = pointsSpent(base);

  // Skills, for the expertise choices and the summary: every proficiency the character will have.
  const skillsHave = [...new Set([...(bg?.skills.base ?? []), ...(kin?.skills.base ?? []), ...chosen("skill").map(skillKey)])];
  // A choice's options: what another choice of its kind took is gone (refreshOverallDecision); a feat by category.
  const optionsFor = (item: Decision): string[] => {
    if (item.type === "feat") {
      const taken = new Set([bg?.feat, ...allDecisions.filter((other) => other.type === "feat" && other.id !== item.id).map((other) => choices[other.id])].filter(Boolean));
      return feats.filter((feat) => feat.name !== "Ability Score Improvement" && (!item.category || String(feat.data.category ?? "").toLowerCase() === item.category.toLowerCase()) && !taken.has(feat.name)).map((feat) => feat.name);
    }
    if (item.type === "subclass") return subclasses.filter((record) => String(record.data.class ?? "").toLowerCase() === className.toLowerCase()).map((record) => record.name);
    const others = allDecisions.filter((other) => other.type === item.type && other.id !== item.id && (item.type !== "asi" || other.id.split(":").slice(0, -1).join(":") === item.id.split(":").slice(0, -1).join(":"))).map((other) => choices[other.id]);
    if (item.type === "expertise") return skillsHave.filter((key) => !others.map(skillKey).includes(key)).map((key) => SKILLS[key as keyof typeof SKILLS][0]);
    if (item.type === "skill") {
      const fixed = [...(bg?.skills.base ?? []), ...(kin?.skills.base ?? [])];
      return item.options.filter((key) => !fixed.includes(key) && !others.map(skillKey).includes(key)).map((key) => SKILLS[key as keyof typeof SKILLS]?.[0] ?? key);
    }
    return item.options.filter((option) => !others.includes(option));
  };
  const choose = (item: Decision, value: string) => {
    const next = { ...choices, [item.id]: value };
    // A parent's change closes its follow-on choices (handleASIOrFeatDecision, the ASI options).
    const parent = item.id.replace(/:asioption$/, "");
    for (const key of Object.keys(next)) {
      if (item.type === "asiorfeat" && key.startsWith(`${item.id}:`)) delete next[key];
      if (item.type === "asioption" && new RegExp(`^${parent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:asi:\\d+$`).test(key)) delete next[key];
    }
    setChoices(next);
  };
  const clearChoices = (prefix: string) => setChoices(Object.fromEntries(Object.entries(choices).filter(([key]) => !key.startsWith(prefix))));
  const decisionRow = (item: Decision) => {
    const options = optionsFor(item);
    const value = choices[item.id] ?? "";
    return (
      <label key={item.id} className={value ? "w5-decision" : "w5-decision open"}>
        {!value ? <span className="w5-alert">!</span> : null}
        <span>{item.label}</span>
        <select value={value} data-decision={item.id} aria-label={`${item.feature ?? ""} ${item.label}`.trim()} onChange={(event) => choose(item, event.target.value)}>
          <option value="" />
          {(value && !options.includes(value) ? [value, ...options] : options).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  };
  const decisionsUnder = (page: "species" | "class" | "background", prefix: string) => decisions[page].filter((item) => item.id.startsWith(prefix)).map(decisionRow);
  const open = (page: "species" | "class" | "background", prefix: string) => decisions[page].some((item) => item.id.startsWith(prefix) && !choices[item.id]);

  // Spells (classspells_sub_spells.lua): the class's list up to its highest slot, learned and unlearned.
  const caster = CASTERS[skillKey(className) as keyof typeof CASTERS];
  const slots = caster ? (slotsFor(className, level) as Record<string, { max: number }>) : {};
  const maxSpellLevel = Math.max(0, ...Object.keys(slots).map((key) => Number(key.slice(1))));
  const counts = spellCounts(className, level);
  const available = caster ? (classSpells(spellsAll, className, maxSpellLevel) as TableRecord[]) : [];

  // Equipment (manager_charwizard_equipment.lua): kits, or a Legacy class's rolled wealth.
  const classKits = klass?.kits ?? [];
  const backgroundKits = bg?.kits ?? [];
  const kitClass = classKits.find((kit) => kit.letter === kits.class) ?? null;
  const kitBackground = backgroundKits.find((kit) => kit.letter === kits.background) ?? null;
  const showRolled = Boolean(klass) && classKits.length === 0;
  const processKits = classKits.length > 0 || rolled === 0;
  const wealthDice = wealthRoll(klass?.wealthRoll) as { dice: string; times: number } | null;
  const classGold = processKits ? kitClass?.wealth ?? 0 : 0;
  const backgroundGold = processKits ? (kitBackground?.wealth ?? 0) + (bg && !bg.kits.length ? bg.gold : 0) : 0;
  const totals = totalWealth({ custom, rolled: showRolled ? rolled : 0, classGold, backgroundGold, profileId: profile.id }) as Record<string, number>;
  const inventory: [string, number][] = [];
  const addTo = (itemName: string, count: number) => {
    const found = inventory.find(([existing]) => existing.toLowerCase() === itemName.toLowerCase());
    if (found) found[1] += count;
    else inventory.push([itemName, count]);
  };
  if (processKits) for (const item of [...(kitClass?.items ?? []), ...(kitBackground?.items ?? [])]) addTo(item.name, item.count);
  for (const [itemName, count] of extra) addTo(itemName, count);
  const addable = items.filter((item) => addableItem(item) && (!itemFilter.kind || itemKind(item) === itemFilter.kind) && item.name.toLowerCase().includes(itemFilter.name.toLowerCase()));

  // The badges (updateAlerts) and the warnings Commit lists (and the sheet's notes keep).
  const alerts: Record<Tab, string[]> = {
    species: !kin ? ["Select Species"] : [...(ancestries.length && !ancestryRecord ? ["Select Ancestry"] : []), ...decisions.species.filter((item) => !choices[item.id]).map((item) => item.label)],
    class: !klass ? ["Select Class"] : decisions.class.filter((item) => !choices[item.id]).map((item) => `Select ${item.feature ?? "Proficiencies"} Choice`),
    abilities: !method ? ["Select Ability Scores"] : method === "Point Buy" && spent !== POINT_BUY_MAX ? ["Select Ability Scores - Not all points used"] : method === "Dice Roll" && STATS.every((stat) => !base[stat]) ? ["Select Ability Scores"] : [],
    background: !bg
      ? ["Select Background"]
      : [
          ...decisions.background.filter((item) => !choices[item.id]).map((item) => item.label),
          ...(kin && kin.is2024 && !bg.is2024 ? ["You chose a 2024 Species and a Legacy Background: adjust the MISC ability scores by increasing one score by 2 and a different one by 1, or three scores by 1; and if the background doesn't include a feat, choose an Origin feat."] : []),
          ...(kin && !kin.is2024 && bg.is2024 && !speciesRecord?.data.classes ? ["You chose a Legacy Species and a 2024 Background: the ASI for the Species will be ignored."] : []),
        ],
    // FG's equipment badge shows without a warning line.
    equipment: [],
    commit: [],
  };
  const equipmentAlert = processKits && ((classKits.length > 0 && !kitClass) || (backgroundKits.length > 0 && !kitBackground));
  const warnings = [...alerts.species, ...alerts.class, ...alerts.abilities, ...alerts.background];
  const badge = (page: Tab) => (page === "commit" ? false : page === "equipment" ? equipmentAlert : alerts[page].length > 0);

  const pickSpecies = (record: TableRecord | null) => {
    setSpeciesName(record?.name ?? "");
    setAncestryName("");
    clearChoices("species:");
  };
  const pickClass = (record: TableRecord | null) => {
    setClassName(record?.name ?? "");
    setLevel(1);
    clearChoices("class:");
    setSpells([]);
    setKits({ ...kits, class: undefined });
    setRolled(0);
  };
  const pickBackground = (record: TableRecord | null) => {
    setBackgroundName(record?.name ?? "");
    clearChoices("background:");
    setKits({ ...kits, background: undefined });
  };
  const changeMethod = (value: string) => {
    setMethod(value);
    // setGenMethod: the array in order, 8s for point buy, 0s to roll.
    setBase(Object.fromEntries(STATS.map((stat, index) => [stat, value === "Standard Array" ? profile.standardArray[index] : value === "Point Buy" ? 8 : value === "Dice Roll" ? 0 : 10])) as Record<Stat, number>);
  };
  // performGenRoll: 4d6 drop the lowest for each ability, rolled by the host into chat.
  const rollAbilities = async () => {
    setRolling(true);
    try {
      let next = { ...base };
      for (const stat of STATS) {
        next = { ...next, [stat]: 0 };
        setBase(next);
        const roll = await rollOnHost(GEN_ROLL, `[ABILITY SCORE GENERATION] ${titled(stat)}`);
        next = { ...next, [stat]: roll.total };
        setBase(next);
      }
    } finally {
      setRolling(false);
    }
  };
  // handleWealthRoll: the class's starting wealth (a Legacy class), rolled by the host.
  const rollWealth = async () => {
    if (!wealthDice) return;
    setRolling(true);
    try {
      const roll = await rollOnHost(wealthDice.dice, `[STARTING WEALTH GENERATION] ${klass?.wealthRoll}`);
      setRolled(roll.total * wealthDice.times);
    } finally {
      setRolling(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    setProblem("");
    try {
      const increases = Object.fromEntries(STATS.map((stat) => [stat, (backgroundAsi[stat] ?? 0) + (speciesDecisionAsi[stat] ?? 0) + (classAsi[stat] ?? 0) + misc[stat]]));
      const pick = (type: string, page: string) => chosen(type, page);
      const spec = {
        name: name.trim() || "Adventurer",
        species: speciesName,
        ...(ancestryName ? { ancestry: ancestryName } : {}),
        ...(choices["species:size"] ? { size: choices["species:size"] } : {}),
        class: className,
        ...(subclassName ? { subclass: subclassName } : {}),
        background: backgroundName,
        level,
        scores: Object.fromEntries(STATS.map((stat) => [stat, method ? base[stat] : 10])),
        increases,
        skills: pick("skill", "class"),
        speciesSkills: pick("skill", "species"),
        backgroundSkills: pick("skill", "background"),
        expertise: pick("expertise", "class"),
        languages: [...pick("language", "species"), ...pick("language", "background")],
        tools: pick("toolprof", "background"),
        feats: chosen("feat"),
        kits: processKits ? { ...(kits.class ? { class: kits.class } : {}), ...(kits.background ? { background: kits.background } : {}) } : {},
        gear: extra,
        coins: custom,
        ...(showRolled && rolled > 0 ? { wealth: rolled } : {}),
        spells,
        warnings,
        ...art,
      };
      const id = await session.buildCharacter(spec);
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (classes.length === 0) return <p className="hint">No classes yet: the GM makes the {profile.id === "dnd5e" ? "SRD player book" : `${profile.name} Player's Handbook`} active (Books).</p>;
  const next = TABS[Math.min(TABS.length - 1, TABS.indexOf(tab) + 1)];
  const scoreLine = (stat: Stat) => {
    const value = total(stat);
    return (
      <span className="w5-total" data-total={stat}>
        {value} <small>{signed(mod(value))}</small>
      </span>
    );
  };

  return (
    <section className="ccw w5-wizard" aria-label={`${words.game} character wizard`} data-wizard={profile.id} data-page={tab}>
      <header className="ccw-head">
        <h2>
          Character Wizard <small className="hint">New {words.game} character</small>
        </h2>
        <span className="ccw-head-buttons">
          <button type="button" className="wizard-next" data-wizard-next disabled={tab === "commit"} onClick={() => setTab(next)} title={`Next: ${(TAB_LABEL as Record<string, string>)[next]}`}>
            Next ›
          </button>
          <button type="button" onClick={() => onDone(null)}>
            Cancel
          </button>
        </span>
      </header>
      <nav className="ccw-tabs" role="tablist">
        {TABS.map((page: Tab) => (
          <button key={page} type="button" role="tab" aria-selected={tab === page} data-wizard-tab={page} onClick={() => setTab(page)}>
            {page === "species" ? words.species : (TAB_LABEL as Record<string, string>)[page]}
            {page !== "commit" ? <span className={badge(page) ? "ccw-tab-badge todo" : "ccw-tab-badge done"} data-alert={badge(page) ? "todo" : "done"} title={alerts[page].join("; ") || (badge(page) ? "Choose" : "Done")}>{badge(page) ? <img src="rulesets/cnc/wizard/alert.webp" alt="!" /> : "✓"}</span> : null}
          </button>
        ))}
      </nav>

      <div className="ccw-page">
        <section className="ccw-instructions">
          <button type="button" className="ccw-plate" aria-expanded={instructions} onClick={() => setInstructions(!instructions)}>
            Instructions <span aria-hidden>{instructions ? "−" : "+"}</span>
          </button>
          {instructions ? (
            <div className="ccw-lore">
              <ol>
                {STEPS[tab].map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>

        {tab === "species" ? (
          <>
            <Plate action={kin ? <button type="button" className="ccw-change" data-action="change-species" onClick={() => pickSpecies(null)}>Change {words.species}</button> : null}>{kin ? `${kin.name}${ancestryRecord ? ` (${ancestryRecord.name})` : ""}`.toUpperCase() : words.species.toUpperCase()}</Plate>
            {!kin ? (
              <Choose records={speciesList} kind="species" onPick={(record) => pickSpecies(record)} />
            ) : (
              <>
                {ancestries.length ? (
                  ancestryRecord ? (
                    <div className="ccw-row">
                      <button type="button" data-action="change-ancestry" onClick={() => setAncestryName("")}>
                        Change Ancestry
                      </button>
                    </div>
                  ) : (
                    <>
                      <Plate>ANCESTRY</Plate>
                      <Choose records={ancestries} kind="ancestry" onPick={(record) => setAncestryName(record.name)} />
                    </>
                  )
                ) : null}
                <div className="ccw-panel w5-features">
                  <Feature title="Size" text={String(speciesRecord?.data.size ?? kin.size)} alert={open("species", "species:size")}>
                    {decisionsUnder("species", "species:size")}
                  </Feature>
                  <Feature title="Speed" text={`${kin.speed} feet`} />
                  {kin.is2024 ? (
                    <Feature title="Languages" text="Your character knows at least three languages: Common plus two languages you choose from the Standard Languages table." alert={open("species", "species:language")}>
                      {decisionsUnder("species", "species:language")}
                    </Feature>
                  ) : null}
                  {Object.keys(kinAdjust).length ? <Feature title="Ability Adjustments" text={Object.entries(kinAdjust).map(([stat, n]) => `${titled(stat)} ${signed(n)}`).join(", ")} /> : null}
                  {decisions.species.some((item) => item.id.startsWith("species:asi")) ? (
                    <Feature title="Ability Score Increase" alert={open("species", "species:asi")}>
                      {decisionsUnder("species", "species:asi")}
                    </Feature>
                  ) : null}
                  {kin.traits.map((trait) => {
                    const key = String(trait.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
                    return (
                      <Feature key={`${String(trait.from)}-${String(trait.name)}`} title={String(trait.name)} text={plain(trait.text)} alert={open("species", `species:${key}`) || (key === "versatile" && open("species", "species:feat"))}>
                        {decisionsUnder("species", `species:${key}:`)}
                        {key === "versatile" || /feat/.test(key) ? decisionsUnder("species", "species:feat") : null}
                      </Feature>
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : null}

        {tab === "class" ? (
          <>
            <Plate action={klass ? <button type="button" className="ccw-change" data-action="change-class" onClick={() => pickClass(null)}>Change Class</button> : null}>{klass ? `${klass.name.toUpperCase()}${subclassName ? ` (${subclassName})` : ""}` : "CLASSES"}</Plate>
            {!klass ? (
              <Choose records={classes} kind="class" onPick={(record) => pickClass(record)} blocked={(record) => (allowedClasses && !allowedClasses.includes(record.name.toLowerCase()) ? `not for a ${speciesName}` : null)} />
            ) : (
              <>
                <div className="ccw-row ccw-panel">
                  <b>Level</b>
                  <button type="button" aria-label="Class level down" data-action="level-down" disabled={level <= 1} onClick={() => setLevel(level - 1)}>
                    ◄
                  </button>
                  <span className="w5-level" data-class-level>{level}</span>
                  <button type="button" aria-label="Class level up" data-action="level-up" disabled={level >= profile.maxLevel} onClick={() => setLevel(level + 1)}>
                    ►
                  </button>
                  {allowedClasses && !allowedClasses.includes(className.toLowerCase()) ? <span className="ccw-warn">A {speciesName} cannot be a {className}.</span> : null}
                </div>
                <div className="ccw-panel w5-features">
                  <Feature
                    title="Proficiencies"
                    text={[`Saving Throws: ${klass.saves.map(titled).join(", ")}`, `Skills: ${String((((classRecord?.data.proficiencies ?? {}) as Row).skills as Row | undefined)?.text ?? "")}`, klass.armor ? `Armor: ${klass.armor}` : "", klass.weapons ? `Weapons: ${klass.weapons}` : "", klass.tools ? `Tools: ${klass.tools}` : ""].filter(Boolean).join(". ")}
                    alert={open("class", "class:proficiencies")}
                  >
                    {decisionsUnder("class", "class:proficiencies")}
                  </Feature>
                  {klass.features.map((feature) => (
                    <Feature key={feature.id} title={feature.name} level={feature.level} text={feature.text} alert={open("class", `${feature.id}:`)}>
                      {decisionsUnder("class", `${feature.id}:`)}
                    </Feature>
                  ))}
                </div>
                {caster ? (
                  <>
                    <Plate>SPELLS</Plate>
                    <div className="ccw-panel w5-spells">
                      <p className="cc-inline">
                        {counts.cantrips ? <span>Cantrips: <b data-count="cantrips">{counts.cantrips}</b></span> : null} {counts.prepared ? <span>Prepared Spells: <b data-count="prepared">{counts.prepared}</b></span> : null}
                        <span className="hint"> Known: {spells.filter((spell) => !num(spellsAll.find((item) => item.name === spell)?.data.level)).length} cantrips, {spells.filter((spell) => num(spellsAll.find((item) => item.name === spell)?.data.level) > 0).length} spells</span>
                      </p>
                      <div className="ccw-filter">
                        <label>
                          Name <input value={spellFilter.name} aria-label="Spell name filter" onChange={(event) => setSpellFilter({ ...spellFilter, name: event.target.value })} />
                        </label>
                        {["", ...Array.from({ length: maxSpellLevel + 1 }, (_, index) => String(index))].map((value) => (
                          <button key={value || "all"} type="button" aria-pressed={spellFilter.level === value} data-spell-level={value || "all"} onClick={() => setSpellFilter({ ...spellFilter, level: value })}>
                            {value === "" ? "All" : value === "0" ? "Cantrips" : value}
                          </button>
                        ))}
                      </div>
                      <div className="w5-spell-lists">
                        <div>
                          <b>Spells</b>
                          {available
                            .filter((spell) => !spells.includes(spell.name) && (!spellFilter.level || String(num(spell.data.level)) === spellFilter.level) && spell.name.toLowerCase().includes(spellFilter.name.toLowerCase()))
                            .map((spell) => (
                              <div key={spell.id} className="ccw-pick">
                                <button type="button" className="ccw-add" title="Learn" aria-label={`Learn ${spell.name}`} data-learn-spell={spell.name} onClick={() => setSpells([...spells, spell.name])}>
                                  +
                                </button>
                                <span>{spell.name}</span>
                                <small className="hint">{num(spell.data.level) ? `level ${num(spell.data.level)}` : "cantrip"}</small>
                              </div>
                            ))}
                        </div>
                        <div>
                          <b>Known</b>
                          {spells.map((spell) => (
                            <div key={spell} className="ccw-pick" data-known-spell={spell}>
                              <button type="button" className="ccw-add" title="Unlearn" aria-label={`Unlearn ${spell}`} onClick={() => setSpells(spells.filter((item) => item !== spell))}>
                                −
                              </button>
                              <span>{spell}</span>
                              <span />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {tab === "abilities" ? (
          <>
            <Plate>ABILITY SCORES</Plate>
            <div className="ccw-panel">
              <div className="ccw-row">
                <label>
                  Method{" "}
                  <select value={method} aria-label="Ability method" onChange={(event) => changeMethod(event.target.value)}>
                    <option value="" />
                    {METHODS.map((item: string) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                {method === "Dice Roll" ? (
                  <button type="button" className="ccw-button" data-action="roll-abilities" disabled={rolling} onClick={() => void rollAbilities()}>
                    {rolling ? "Rolling…" : "Roll 4d6 drop lowest"}
                  </button>
                ) : null}
                {method === "Point Buy" ? (
                  <span data-points>
                    Points Remaining <b data-points-used>{spent}</b> / {POINT_BUY_MAX}
                  </span>
                ) : null}
              </div>
              <table className="w5-abilities">
                <thead>
                  <tr>
                    <th />
                    <th>Base</th>
                    <th>Background</th>
                    <th>{words.species}</th>
                    <th>ASI</th>
                    <th>Misc</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {STATS.map((stat: Stat, index: number) => (
                    <tr key={stat} data-ability={stat}>
                      <th>{SHORT[stat]}</th>
                      <td className="w5-base">
                        {method === "Point Buy" ? (
                          <>
                            <button type="button" aria-label={`${stat} down`} data-point={`${stat}:down`} disabled={base[stat] <= 8} onClick={() => setBase({ ...base, [stat]: base[stat] - 1 })}>
                              ▼
                            </button>
                            <b data-base={stat}>{base[stat]}</b>
                            <button type="button" aria-label={`${stat} up`} data-point={`${stat}:up`} disabled={base[stat] >= 15 || spent - pointCost(base[stat]) + pointCost(base[stat] + 1) > POINT_BUY_MAX} onClick={() => setBase({ ...base, [stat]: base[stat] + 1 })}>
                              ▲
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" aria-label={`Swap ${stat} left`} data-swap={`${stat}:left`} disabled={!method || index === 0} onClick={() => setBase(swapAbility(base, stat, "left") as Record<Stat, number>)}>
                              ◄
                            </button>
                            {method === "Dice Roll" ? (
                              <input type="number" min={0} max={30} value={base[stat]} data-base={stat} aria-label={`${stat} base`} onChange={(event) => setBase({ ...base, [stat]: Number(event.target.value) || 0 })} />
                            ) : (
                              <b data-base={stat}>{base[stat]}</b>
                            )}
                            <button type="button" aria-label={`Swap ${stat} right`} data-swap={`${stat}:right`} disabled={!method || index === STATS.length - 1} onClick={() => setBase(swapAbility(base, stat, "right") as Record<Stat, number>)}>
                              ►
                            </button>
                          </>
                        )}
                      </td>
                      <td data-from="background">{backgroundAsi[stat] ? signed(backgroundAsi[stat]) : ""}</td>
                      <td data-from="species" data-adjust={speciesAsi[stat] ? stat : undefined}>{speciesAsi[stat] ? signed(speciesAsi[stat]) : ""}</td>
                      <td data-from="asi">{classAsi[stat] ? signed(classAsi[stat]) : ""}</td>
                      <td>
                        <input type="number" className="w5-misc" value={misc[stat]} aria-label={`${stat} misc`} onChange={(event) => setMisc({ ...misc, [stat]: Number(event.target.value) || 0 })} />
                      </td>
                      <td>{scoreLine(stat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === "background" ? (
          <>
            <Plate action={bg ? <button type="button" className="ccw-change" data-action="change-background" onClick={() => pickBackground(null)}>Change Background</button> : null}>{bg ? bg.name.toUpperCase() : "BACKGROUND"}</Plate>
            {!bg ? (
              <Choose records={backgrounds} kind="background" onPick={(record) => pickBackground(record)} />
            ) : (
              <div className="ccw-panel w5-features">
                {bg.is2024 && backgroundRecord?.data.abilities ? (
                  <Feature title="Abilities" text={String(backgroundRecord.data.abilities)} alert={open("background", "background:asi")}>
                    {decisionsUnder("background", "background:asi")}
                  </Feature>
                ) : null}
                {backgroundRecord?.data.skill ? (
                  <Feature title="Skill" text={String(backgroundRecord.data.skill)} alert={open("background", "background:skill")}>
                    {decisionsUnder("background", "background:skill")}
                  </Feature>
                ) : null}
                {backgroundRecord?.data.tool ? (
                  <Feature title="Proficiency" text={String(backgroundRecord.data.tool)} alert={open("background", "background:toolprof")}>
                    {decisionsUnder("background", "background:toolprof")}
                  </Feature>
                ) : null}
                {!bg.is2024 && backgroundRecord?.data.languages ? (
                  <Feature title="Languages" text={String(backgroundRecord.data.languages)} alert={open("background", "background:language")}>
                    {decisionsUnder("background", "background:language")}
                  </Feature>
                ) : null}
                {bg.feat || bg.is2024 ? (
                  <Feature title="Feat" text={bg.feat || undefined} alert={open("background", "background:feat")}>
                    {decisionsUnder("background", "background:feat")}
                  </Feature>
                ) : null}
                {bg.features.map((feature) => (
                  <Feature key={feature} title={feature} />
                ))}
                <Feature title="Equipment" text={plain(backgroundRecord?.data.equipment)} />
              </div>
            )}
          </>
        ) : null}

        {tab === "equipment" ? (
          <>
            <Plate>STARTING EQUIPMENT AND CURRENCY</Plate>
            <div className="ccw-panel w5-wealth">
              <Plate>Currency</Plate>
              {showRolled ? (
                <div className="ccw-row" title="Rolled Wealth will disable kit selection until rolled wealth reset to zero.">
                  <b>Rolled</b> <span data-wealth="rolled">{rolled}</span>
                  <button type="button" data-action="roll-wealth" disabled={!wealthDice || rolling} onClick={() => void rollWealth()}>
                    Roll
                  </button>
                  <span className="hint">{klass?.wealthRoll}</span>
                  <button type="button" data-action="clear-wealth" onClick={() => setRolled(0)}>
                    Clear
                  </button>
                </div>
              ) : null}
              {rolled === 0 || !showRolled ? (
                <>
                  {bg ? (
                    <div className="ccw-row">
                      <b>Background</b> <span data-wealth="background">{backgroundGold}</span>
                    </div>
                  ) : null}
                  {klass ? (
                    <div className="ccw-row">
                      <b>Class</b> <span data-wealth="class">{classGold}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="ccw-row">
                <b>Custom</b>
                {coins.map((coin) => (
                  <label key={coin} className="w5-coin">
                    <input type="number" value={custom[coin] ?? 0} aria-label={`custom ${coin}`} onChange={(event) => setCustom({ ...custom, [coin]: Number(event.target.value) || 0 })} /> {coin}
                  </label>
                ))}
              </div>
              <div className="ccw-row">
                <b>Total</b>
                {coins.map((coin) => (
                  <span key={coin} className="w5-coin" data-total-coin={coin}>
                    <b>{totals[coin] ?? 0}</b> {coin}
                  </span>
                ))}
              </div>
            </div>
            {processKits ? (
              <div className="ccw-panel w5-kits">
                {(
                  [
                    ["background", "Background Kit", backgroundKits, kitBackground, bg],
                    ["class", "Class Kit", classKits, kitClass, klass],
                  ] as [keyof typeof kits, string, Kit[], Kit | null, unknown][]
                ).map(([kind, title, options, picked, owner]) => (
                  <div key={kind} className="w5-kit" data-kit-kind={kind}>
                    <Plate>{title}</Plate>
                    {!owner ? <p className="hint">Choose a {kind} first.</p> : options.length === 0 ? <p className="hint">{kind === "background" && bg && !bg.kits.length ? `${bg.gold} ${main} from its equipment.` : "No starting kit."}</p> : null}
                    {picked ? (
                      <div className="ccw-row" data-kit-chosen={`${kind}:${picked.letter}`}>
                        <button type="button" className="ccw-add" aria-label={`Change the ${kind} kit`} data-kit-reset={kind} onClick={() => setKits({ ...kits, [kind]: undefined })}>
                          ×
                        </button>
                        <b>
                          {picked.letter}: {kitText(picked, main)}
                        </b>
                      </div>
                    ) : (
                      options.map((option) => (
                        <div key={option.letter} className="ccw-pick">
                          <button type="button" className="ccw-add" aria-label={`Choose ${kind} kit ${option.letter}`} data-kit={`${kind}:${option.letter}`} onClick={() => setKits({ ...kits, [kind]: option.letter })}>
                            +
                          </button>
                          <span>
                            <b>{option.letter}:</b> {kitText(option, main)}
                          </span>
                          <span />
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <Plate>Inventory</Plate>
            <div className="ccw-panel w5-inventory">
              {inventory.length === 0 ? <p className="hint">No items currently added to inventory.</p> : null}
              {inventory.map(([itemName, count]) => {
                const added = extra.find(([existing]) => existing === itemName);
                return (
                  <div key={itemName} className="ccw-pick" data-inventory={itemName}>
                    {added ? (
                      <button type="button" className="ccw-add" aria-label={`Remove ${itemName}`} onClick={() => setExtra(extra.filter(([existing]) => existing !== itemName))}>
                        −
                      </button>
                    ) : (
                      <span />
                    )}
                    <span>{itemName}</span>
                    <span>{count > 1 ? count : ""}</span>
                  </div>
                );
              })}
            </div>
            <Plate>Add Items</Plate>
            <div className="ccw-panel w5-additems">
              <div className="ccw-filter">
                {[["", "All"], ["armor", "Armor"], ["weapon", "Weapons"], ["gear", "Gear"]].map(([kind, label]) => (
                  <button key={kind || "all"} type="button" aria-pressed={itemFilter.kind === kind} data-item-filter={kind || "all"} onClick={() => setItemFilter({ ...itemFilter, kind })}>
                    {label}
                  </button>
                ))}
                <label>
                  Name <input value={itemFilter.name} aria-label="Item name filter" onChange={(event) => setItemFilter({ ...itemFilter, name: event.target.value })} />
                </label>
              </div>
              <div className="w5-item-list">
                {addable.slice(0, 200).map((item) => (
                  <div key={item.id} className="ccw-pick">
                    <button type="button" className="ccw-add" aria-label={`Add ${item.name}`} data-add-item={item.name} onClick={() => setExtra(extra.some(([existing]) => existing === item.name) ? extra.map(([existing, count]) => [existing, existing === item.name ? count + 1 : count] as [string, number]) : [...extra, [item.name, 1]])}>
                      +
                    </button>
                    <span>{item.name}</span>
                    <span className="ccw-pick-source">{String(item.data.cost ?? "")}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {tab === "commit" ? (
          <>
            {warnings.length || equipmentAlert ? (
              <>
                <Plate>WARNINGS</Plate>
                <ul className="ccw-panel w5-warnings" data-warnings>
                  {warnings.map((text, index) => (
                    <li key={index}>{text}</li>
                  ))}
                  {equipmentAlert ? <li>Select Equipment Choice</li> : null}
                </ul>
              </>
            ) : null}
            <Plate>SAVE</Plate>
            <div className="ccw-panel">
              <div className="ccw-row">
                <label>
                  Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" />
                </label>
                <button type="button" className="ccw-button" data-action="wizard-finish" disabled={busy || !className} title={className ? "Make the character" : "Choose a class first"} onClick={() => void finish()}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
              <ArtChoice session={session} race={speciesName} cls={className} value={art} onChange={setArt} />
              {problem ? <p className="ccw-warn">{problem}</p> : null}
            </div>
            <Plate>SUMMARY</Plate>
            <div className="ccw-panel w5-summary" data-summary>
              <div className="ccw-badges">
                {STATS.map((stat: Stat) => (
                  <div key={stat} className="ccw-badge" data-badge={stat}>
                    <span className="ccw-badge-label">{SHORT[stat]}</span>
                    <b className="ccw-badge-total" data-final={stat}>
                      {total(stat)}
                    </b>
                    <span className="ccw-badge-mod">{signed(mod(total(stat)))}</span>
                  </div>
                ))}
              </div>
              <p>
                <b>{words.species}:</b> {kin ? `${kin.name}${ancestryRecord ? ` (${ancestryRecord.name})` : ""}` : "—"} · <b>Background:</b> {bg?.name ?? "—"} · <b>Class:</b> {klass ? `${klass.name} ${level}${subclassName ? ` (${subclassName})` : ""}` : "—"}
              </p>
              <p>
                <b>Speed:</b> {kin ? `${kin.speed} ft.` : "—"} · <b>Size:</b> {choices["species:size"] ?? kin?.size ?? "—"} {kin?.darkvision ? <> · <b>Senses:</b> Darkvision {kin.darkvision}</> : null}
              </p>
              <p>
                <b>Skills:</b> {[...new Set([...skillsHave, ...chosen("skill", "class").map(skillKey)])].map((key) => SKILLS[key as keyof typeof SKILLS]?.[0] ?? key).join(", ") || "—"}
              </p>
              <p>
                <b>Languages:</b> {[...(kin?.languages.base ?? []), ...(bg?.languages.base ?? []), ...chosen("language")].join(", ") || "—"}
              </p>
              <p>
                <b>Feats:</b> {[bg?.feat, ...chosen("feat")].filter(Boolean).join(", ") || "—"}
              </p>
              <p>
                <b>Proficiencies:</b> {[klass?.armor ? `Armor: ${klass.armor}` : "", klass?.weapons ? `Weapons: ${klass.weapons}` : "", [...(bg?.tools.base ?? []), ...chosen("toolprof")].length ? `Tools: ${[...(bg?.tools.base ?? []), ...chosen("toolprof")].join(", ")}` : ""].filter(Boolean).join("; ") || "—"}
              </p>
              <p>
                <b>Features:</b> {(klass?.features ?? []).map((feature) => feature.name).join(", ") || "—"}
              </p>
              <p>
                <b>Equipment:</b> {inventory.map(([itemName, count]) => (count > 1 ? `${count} ${itemName}` : itemName)).join(", ") || "—"} · {coins.filter((coin) => totals[coin]).map((coin) => `${totals[coin]} ${coin}`).join(", ") || `0 ${main}`}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
