import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useHostRolls as useSharedHostRolls } from "./hostRolls";
import type { Session } from "../session/useSession";
import { ArtChoice } from "./ArtPicker";
import { STATS, abilityBonus, exactRow, levelGain, parseCost, progressionRow, raceLanguages, spellChoices, spellPicksAllowed, CORE_BOOK } from "./siege";
import { ALIGNMENTS as COMBO_ALIGNMENTS, COMBO, alignmentAllowed, alignmentText, canPlus, classKey, dieOf, enhancedDie, enhancedRule, isRaceClass, multiDie, multiRule, plusText, startXP, supportLevel, supportOptions, supportPrime } from "../../shared/siege/combine.mjs";

// Character creation for Castles & Crusades, after the SC C&C Character
// Creation Wizard in Fantasy Grounds (KrakenCharWizardCC): eight pages in any
// order, each with its badge ("!" while it needs something, a check when it
// is done), its art faint behind it and its instructions above (open or
// closed on every page at once). Races and classes come from every active
// book, with a Source and Name filter; once chosen, the list gives way to the
// choice (portrait, numbers, traits) and a Change button. Scores are dragged
// onto one another to swap them. Every die is rolled by the host, so the
// table sees it, and the finished character is built by the host from a spec
// (shared/siege/builder.mjs), the same way FG's wizard and an agent build one.
// Changing an earlier choice clears what depended on it, as FG's does.

type Row = Record<string, unknown>;
type Stat = (typeof STATS)[number];
type Method = "3d6" | "4d6" | "3d6order";
type SupportRow = { name: string; class: string; sub: boolean; prime: string; abilities: string; adv?: Record<string, { xp: number; gained: string }>; spells?: Record<string, Record<string, number>> };

const STAT_NAME: Record<string, string> = { strength: "Strength", dexterity: "Dexterity", constitution: "Constitution", intelligence: "Intelligence", wisdom: "Wisdom", charisma: "Charisma" };
const SHORT: Record<string, string> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const METHODS: { id: Method; label: string; formula: string; arrange: boolean; note: string }[] = [
  { id: "3d6", label: "3d6, arrange as you like (Player's Handbook)", formula: "3d6", arrange: true, note: "3d6" },
  { id: "4d6", label: "4d6 drop lowest, arrange", formula: "4d6dl1", arrange: true, note: "4d6 drop lowest" },
  { id: "3d6order", label: "3d6 in order", formula: "3d6", arrange: false, note: "3d6" },
];
const PAGES = ["abilities", "race", "class", "primes", "hp", "equipment", "spells", "finish"] as const;
type Page = (typeof PAGES)[number];
const PAGE_LABEL: Record<Page, string> = { abilities: "Abilities", race: "Race", class: "Class", primes: "Primes", hp: "Hit Points", equipment: "Equipment", spells: "Spells", finish: "Finish" };
const ART: Record<Page, string> = { abilities: "abilities", race: "race", class: "class", primes: "primes", hp: "hp", equipment: "equipment", spells: "spells", finish: "commit" };
const ART_BASE = "rulesets/cnc/wizard";
const RACE_ART = new Set(["dwarf", "elf", "gnome", "halfelf", "halfling", "halforc", "human"]);
const CLASS_ART = new Set(["assassin", "barbarian", "bard", "cleric", "druid", "fighter", "illusionist", "knight", "monk", "paladin", "ranger", "rogue", "wizard"]);

// The page's words, as the SC C&C wizard says them.
const LORE: Record<Page, string[]> = {
  abilities: [
    "Every hero begins as six numbers: Strength, Dexterity, Constitution, Intelligence, Wisdom and Charisma. Roll the dice, then drag one score onto another to swap them until the spread suits the hero you have in mind. Scores run from 3 to 18; each gives a modifier from -3 to +3 that follows the character into every check, attack and saving throw.",
    "Think ahead as you arrange them. Your race will nudge a score or two, your class names one attribute as prime, and the attributes you make prime are the ones your character can rely on when it matters most.",
  ],
  race: [
    "Your people shape how you see the world and how the world sees you. Dwarves are stubborn and stone-wise, elves long-lived and keen-eyed, gnomes clever tinkers, halflings quiet and nimble, half-orcs strong and hardy, half-elves at home in two worlds, and humans adaptable above all.",
    "A race may raise or lower an attribute, grant senses and skills no training can teach, and set how fast you move. Humans choose two extra prime attributes; every other race chooses one.",
  ],
  class: [
    "Your class is your calling: how you fight, what you know, and how you grow. It sets your hit die, your base to hit, the abilities you gain as you rise in level, and one prime attribute that cannot be changed.",
    "The Castle Keeper has set the level this adventure starts at. The wizard builds your character at that level: its abilities, hit points, experience and, for spellcasters, the spells it can cast.",
  ],
  primes: ["Prime attributes are what your character does best. A check on a prime attribute starts from a challenge base of 12; any other starts from 18. Your class gives one prime. Tick the others you are allowed below."],
  hp: [
    "Hit points are your hero's staying power: toughness, luck and the will to keep standing. Each level rolls the class's hit die and adds your Constitution modifier. Roll once for every level the Castle Keeper has given you; the dice go to chat for all to see. If the selected class has a blank high-level HP and BtH table entry, enter the Castle Keeper's explicit total HP and BtH decision here instead; the wizard will not invent a continuation.",
  ],
  equipment: [
    "Every adventurer starts with a purse of coin, set by class. Roll it, then shop: the list shows only what you can still afford, and each purchase comes out of your purse. Armor you buy is worn when the character is made; weapons appear ready on the Combat tab. Whatever you do not spend goes into your purse.",
  ],
  spells: [
    "Spellcasters begin with the spells their training allows. The table shows how many spells of each level your character can cast each day at its starting level. Tick the spells to put on your character's Powers tab. A class that casts the spells it knows (the elf magi) picks as many as it knows, which can be more than it casts each day.",
  ],
  finish: [
    "Give your hero a name and a few words of who they are. You can create the character at any point: anything not chosen yet is listed in the sheet's notes, to finish later with your Castle Keeper. Press Create Character: the wizard builds the sheet, adds your race and class, rolls nothing further, and opens it for you.",
  ],
};
const STEPS: Record<Page, string[]> = {
  abilities: ["Choose a method (the Castle Keeper may have set one).", "Click Roll All to roll all six scores; each roll shows in chat.", "Drag one Base score onto another to swap them (not with 3d6 in order).", "The Race row and the totals fill in once you choose a race."],
  race: ["The list holds the races of every book the Castle Keeper has made active; Source shows which book, and narrows the list.", "Review the races by clicking their names.", "Click the + next to the race you want.", "Read its traits below; click Change Race to choose again."],
  class: ["The list holds the classes of every active book (the Adventurer's Backpack adds 17); Source shows which book, and narrows the list.", "Review the classes by clicking their names.", "Click the + next to the class you want.", "Set the starting level with the arrows next to Level.", "Read the class abilities below."],
  primes: ["Your class's prime is ticked already.", "Tick the other primes your race and class allow."],
  hp: ["Click Roll Hit Points: one roll for each level, hit die plus Constitution.", "Above the published tables, the Castle Keeper enters hit points and base to hit."],
  equipment: ["Roll your starting coin.", "Buy from the shop; it lists only what you can still afford and your class can use.", "Click Return in Purchased to give an item back."],
  spells: ["Tick one spell for each spell your character can cast per day.", "Use Search and Level to narrow the list; click a name to read the spell."],
  finish: ["Review the warnings and return to those pages to resolve them.", "Enter a name, alignment and any other details (they can wait: the sheet lists what is left).", "Review the summary, then click Create Character."],
};

const ALIGNMENTS = ["Lawful Good", "Lawful Neutral", "Lawful Evil", "Neutral Good", "Neutral", "Neutral Evil", "Chaotic Good", "Chaotic Neutral", "Chaotic Evil"];
// The alignments a class allows (the SC C&C wizard's class rules).
function alignmentsFor(className: string): { allowed: string[]; rule: string } {
  const name = className.toLowerCase();
  const has = (word: string) => (alignment: string) => alignment.toLowerCase().includes(word);
  const rules: [RegExp, (alignment: string) => boolean, string][] = [
    [/^paladin/, (a) => a === "Lawful Good", "Lawful good"],
    [/^assassin/, (a) => !has("good")(a), "any non-good"],
    [/^druid, primal|^primal druid/, (a) => ["Chaotic Neutral", "Neutral", "Lawful Neutral"].includes(a), "chaotic neutral, neutral or lawful neutral"],
    [/^druid/, (a) => has("neutral")(a), "any with a neutral part"],
    [/^foresworn/, (a) => ["Neutral", "Neutral Good", "Neutral Evil"].includes(a), "neutral, neutral good or neutral evil"],
    [/^skald/, (a) => a === "Neutral" || has("chaotic")(a), "neutral or any chaotic"],
    [/^thief/, (a) => has("neutral")(a) || has("evil")(a), "any neutral or evil"],
    [/^warlock/, (a) => has("chaotic")(a), "any chaotic"],
    [/^elf, magi/, (a) => a === "Neutral Good" || has("chaotic")(a), "neutral good or any chaotic"],
    [/^gnome, primeval/, (a) => a === "Neutral", "neutral"],
  ];
  const found = rules.find(([pattern]) => pattern.test(name));
  return found ? { allowed: ALIGNMENTS.filter(found[1]), rule: found[2] } : { allowed: ALIGNMENTS, rule: "any" };
}

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const plain = (html: unknown) =>
  String(html ?? "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "  - ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const sourceOf = (row: Row) => /@(.+)$/.exec(String(row.fgPath ?? ""))?.[1]?.replace(/^C&C /, "SC C&C ") ?? "Campaign";
const artKey = (name: string) => name.replace(/\(.*?\)/g, "").toLowerCase().replace(/[^a-z]/g, "");
const copper = (cp: number) => {
  const gp = Math.floor(cp / 100);
  const sp = Math.floor((cp % 100) / 10);
  const c = cp % 10;
  return [gp ? `${gp} gp` : "", sp ? `${sp} sp` : "", c ? `${c} cp` : ""].filter(Boolean).join(" ") || "0 cp";
};

// A race class of the Adventurer's Backpack ("Dwarf, Iron Born") is only for its race.
const RACE_CLASS = /^(dwarf|elf|gnome|halfling)\b/i;
const PEOPLE: Record<string, string> = { dwarf: "dwarves", elf: "elves", gnome: "gnomes", halfling: "halflings" };

// What a class may use, from its "WEAPONS:" and "ARMOR:" lines.
function usableBy(cls: Row | null) {
  const text = plain(cls?.text).replace(/\n/g, " ");
  const line = (label: string) => new RegExp(`${label}:\\s*([^|]*?)(?=\\s+(?:PRIME ATTRIBUTE|ALIGNMENT|WEAPONS|ARMOR|ABILITIES|Description)\\b|$)`).exec(text)?.[1]?.trim() ?? "";
  const parse = (value: string) => {
    if (!value || /^any\b/i.test(value)) return null;
    if (/^none\b/i.test(value)) return [];
    return value
      .replace(/^special,\s*/i, "")
      .split(/,|\band\b/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .flatMap((part) => (/light or heavy (\w+)/.test(part) ? [part.replace(/light or heavy /, "")] : [part]));
  };
  const words = (text: string) => text.toLowerCase().replace(/\(any\)|\(.*?\)/g, "").split(/[^a-z]+/).filter(Boolean).map((word) => word.replace(/s$/, ""));
  const fits = (entries: string[] | null, itemName: string) => {
    if (entries === null) return true;
    const have = new Set(words(itemName));
    return entries.some((entry) => {
      const want = words(entry);
      if (want.length === 0) return false;
      return want.every((word) => [...have].some((item) => item === word || item.endsWith(word) || word.endsWith(item)));
    });
  };
  const weapons = parse(line("WEAPONS"));
  const armor = parse(line("ARMOR"));
  return (item: Row) => {
    const type = String(item.type ?? "").toLowerCase();
    const subtype = String(item.subtype ?? "").toLowerCase();
    const name = String(item.name ?? "");
    if (type === "weapon") {
      // Arrows and bolts follow bows and crossbows.
      if (/arrow/i.test(name)) return fits(weapons, "bow");
      if (/bolt/i.test(name)) return fits(weapons, "crossbow");
      return fits(weapons, name);
    }
    if (type === "armor" || subtype === "shield" || subtype === "helm") {
      if (armor === null) return true;
      if (armor.length === 0) return false;
      if (subtype === "shield" || subtype === "helm") return true;
      return fits(armor, name);
    }
    return true;
  };
}

const CATEGORIES = [
  ["all", "Everything"],
  ["weapon", "Weapons"],
  ["armor", "Armor, shields and helms"],
  ["gear", "Adventuring gear"],
  ["clothing", "Clothing"],
  ["provisions", "Provisions"],
  ["transport", "Transport and tack"],
] as const;
function categoryOf(item: Row): string {
  const type = String(item.type ?? "").toLowerCase();
  const subtype = String(item.subtype ?? "").toLowerCase();
  if (type === "weapon") return "weapon";
  if (type === "armor" || subtype === "shield" || subtype === "helm") return "armor";
  if (subtype.includes("cloth")) return "clothing";
  if (subtype.includes("provision") || subtype.includes("food")) return "provisions";
  if (subtype.includes("transport") || subtype.includes("tack") || subtype.includes("mount")) return "transport";
  return "gear";
}
const CATEGORY_ORDER = ["armor", "weapon", "gear", "clothing", "provisions", "transport"];

// Open or closed on every page at once, as FG's.
const instructions = (() => {
  let open = (() => {
    try {
      return window.localStorage.getItem("kraken-wizard-instructions") !== "closed";
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
        window.localStorage.setItem("kraken-wizard-instructions", open ? "open" : "closed");
      } catch {
        /* this screen only */
      }
      for (const listener of listeners) listener();
    },
  };
})();

// Waits for the host's answer to a roll this window asked for.
export function useHostRolls(session: Session) {
  return useSharedHostRolls(session, (label) => `Wizard: ${label}`);
}

function Instructions({ page }: { page: Page }) {
  const open = useSyncExternalStore(instructions.subscribe, instructions.get);
  return (
    <section className="ccw-instructions">
      <button type="button" className="ccw-plate" aria-expanded={open} onClick={instructions.toggle}>
        Instructions <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="ccw-lore">
          {LORE[page].map((text, index) => (
            <p key={index}>{text}</p>
          ))}
          <ol>
            {STEPS[page].map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ol>
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

// A card that opens to its text (a race trait, a class ability).
function Card({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "ccw-card open" : "ccw-card"}>
      <button type="button" className="ccw-card-title" disabled={!text} onClick={() => setOpen(!open)} aria-expanded={open}>
        <b>{title}</b> {text ? <span aria-hidden>{open ? "−" : "+"}</span> : null}
      </button>
      {open ? <p className="ccw-card-text">{text}</p> : null}
    </div>
  );
}

// A list to choose from: a Source and Name filter, a row per record with +
// to choose it and its name to read it.
function PickList({ rows, chosen, onPick, blockedWhy, kind }: { rows: Row[]; chosen: string; onPick: (row: Row) => void; blockedWhy?: (row: Row) => string | null; kind: string }) {
  const [source, setSource] = useState("(all)");
  const [name, setName] = useState("");
  const [reading, setReading] = useState("");
  const sources = ["(all)", ...[...new Set(rows.map(sourceOf))].sort()];
  const shown = rows.filter((row) => (source === "(all)" || sourceOf(row) === source) && String(row.name).toLowerCase().includes(name.toLowerCase()));
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
        const why = blockedWhy?.(row) ?? null;
        const id = String(row.name);
        return (
          <div key={String(row.fgPath ?? id)} className={why ? "ccw-pick blocked" : chosen === id ? "ccw-pick on" : "ccw-pick"}>
            <button type="button" className="ccw-add" disabled={Boolean(why)} title={why ?? "Choose"} aria-label={`Choose ${id}`} onClick={() => onPick(row)} {...{ [`data-${kind}`]: id }}>
              +
            </button>
            <button type="button" className="ccw-pick-name" title="Read it" onClick={() => setReading(reading === id ? "" : id)}>
              {id}
              {why ? <small> - {why}</small> : null}
            </button>
            <span className="ccw-pick-source">{sourceOf(row)}</span>
            {reading === id ? <p className="ccw-reading">{plain(row.text) || "No text."}</p> : null}
          </div>
        );
      })}
      {shown.length === 0 ? <p className="hint">Nothing matches.</p> : null}
    </div>
  );
}

export function Wizard({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const rollOnHost = useHostRolls(session);
  const records = Object.values(session.records);
  const library = useMemo(() => {
    const data = (type: string) => records.filter((record) => record.type === type).map((record) => record.data as Row);
    return { packages: data("siegepackage"), items: data("item"), powers: data("siegepower"), game: data("siegegame")[0] };
    // The books change only on activation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);
  const byName = (type: string) => {
    const seen = new Map<string, Row>();
    for (const pkg of library.packages) if (String(pkg.packagetype).toLowerCase() === type && !seen.has(String(pkg.name))) seen.set(String(pkg.name), pkg);
    return [...seen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  };
  const races = byName("race");
  const classes = byName("class");

  const [page, setPage] = useState<Page>("abilities");
  const [method, setMethod] = useState<Method>("3d6");
  const [base, setBase] = useState<Partial<Record<Stat, number>>>({});
  const [rolling, setRolling] = useState("");
  const [dragging, setDragging] = useState<Stat | null>(null);
  const [picked, setPicked] = useState<Stat | null>(null);
  const [raceName, setRaceName] = useState("");
  const [className, setClassName] = useState("");
  const [level, setLevel] = useState(1);
  const [chosenPrimes, setChosenPrimes] = useState<Stat[]>([]);
  const [hp, setHp] = useState<number[]>([]);
  const [hpCleared, setHpCleared] = useState(false);
  const [gold, setGold] = useState<number | null>(null);
  const [cart, setCart] = useState<{ name: string; cost: number; count: number }[]>([]);
  const [shopCategory, setShopCategory] = useState("all");
  const [shopSearch, setShopSearch] = useState("");
  const [spells, setSpells] = useState<string[]>([]);
  const [spellSearch, setSpellSearch] = useState("");
  const [spellLevel, setSpellLevel] = useState("all");
  const [readSpell, setReadSpell] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({ name: "" });
  // The portrait and token chosen on the Finish page ({}: the race and class's own).
  const [art, setArt] = useState<{ portrait?: string; token?: string }>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Combining classes (the Adventurer's Backpack): a multi-class, a supporting option, plussed classes.
  const [multiName, setMultiName] = useState("");
  const [supportKey, setSupportKey] = useState("");
  const [plusNames, setPlusNames] = useState<string[]>([]);
  const [comboPick, setComboPick] = useState<"" | "multi" | "support" | "plus">("");
  const [spells2, setSpells2] = useState<string[]>([]);
  const [spellList, setSpellList] = useState<"main" | "second">("main");
  const generation = useRef({ attr: 0, hp: 0, gold: 0 });

  const race = races.find((row) => row.name === raceName) ?? null;
  const cls = classes.find((row) => row.name === className) ?? null;
  const methodRow = METHODS.find((item) => item.id === method) ?? METHODS[0];
  const raceMod = (stat: Stat) => num((race?.attrmods as Row | undefined)?.[stat]);
  const final = (stat: Stat) => (base[stat] === undefined ? null : (base[stat] as number) + raceMod(stat));
  const finalOr10 = (stat: string) => final(stat as Stat) ?? 10;
  const allRolled = STATS.every((stat) => base[stat as Stat] !== undefined);
  const multi = classes.find((row) => row.name === multiName) ?? null;
  const supportOption = supportKey ? (COMBO.SUPPORT as unknown as Record<string, SupportRow>)[supportKey] ?? null : null;
  const supportRecord = supportOption ? classes.find((row) => classKey(row.name) === supportOption.class) ?? null : null;
  const multiPrimes = STATS.filter((stat) => num((multi?.primes as Row | undefined)?.[stat]) === 1) as Stat[];
  const supportStat = supportRecord ? (supportPrime(supportKey, supportRecord) as Stat) : "";
  const forcedPrimes = [...new Set([...STATS.filter((stat) => num((cls?.primes as Row | undefined)?.[stat]) === 1), ...multiPrimes, ...(supportStat ? [supportStat] : [])])] as Stat[];
  const primeFrom = (stat: Stat) => (num((cls?.primes as Row | undefined)?.[stat]) === 1 ? "from your class" : multiPrimes.includes(stat) ? "multi-class" : stat === supportStat ? "supporting class" : "");
  const primesAllowed = STATS.filter((stat) => num((cls?.primes as Row | undefined)?.[stat]) === 1).length + num(cls?.primechoice) + num(race?.primechoice) + multiPrimes.length;
  const comboDie = cls && multi ? multiDie([dieOf(cls), dieOf(multi)]) : cls && supportRecord ? enhancedDie(dieOf(supportRecord), dieOf(cls)) : "";
  const combined = Boolean(multi || supportRecord || plusNames.length);
  const primes = new Set<Stat>([...forcedPrimes, ...chosenPrimes.filter((stat) => !forcedPrimes.includes(stat))]);
  const con = abilityBonus(finalOr10("constitution"), library.game);
  const hpTotal = hp.reduce((a, b) => a + b, 0);
  const spent = cart.reduce((sum, entry) => sum + entry.cost * entry.count, 0);
  const left = gold === null ? 0 : gold * 100 - spent;
  const published = cls ? Array.from({ length: level }, (_, index) => exactRow(cls, index + 1)).every(Boolean) : false;
  const unsupported = cls && !published ? `The selected class has incomplete progression for starting level ${level}. Choose a supported level or ask the Castle Keeper to extend its class package.` : "";
  const day = cls ? (spellPicksAllowed(cls, level, finalOr10) as Record<string, number>) : {};
  const castsSpells = Boolean(cls?.spellclass) && Object.values(day).some((count) => count > 0);
  const choices = castsSpells && cls ? (spellChoices(library.powers, cls, day) as { power: Row; level: number }[]) : [];
  // A second spell list: the multi-class's own table, or the supporting option's at this level.
  const secondCaster = multi?.spellclass ? multi : supportOption?.spells && supportRecord?.spellclass ? supportRecord : null;
  const day2: Record<string, number> = !secondCaster ? {} : multi ? (spellPicksAllowed(multi, level, finalOr10) as Record<string, number>) : Object.fromEntries(Object.entries((supportOption?.spells as Record<string, Record<string, number>> | undefined)?.[String(level)] ?? {}).map(([n, count]) => [n, Number(count) || 0]));
  const castsSecond = Boolean(secondCaster) && Object.values(day2).some((count) => count > 0);
  const choices2 = castsSecond && secondCaster ? (spellChoices(library.powers, secondCaster, day2) as { power: Row; level: number }[]) : [];
  const onSecond = spellList === "second" && castsSecond;
  const listDay = onSecond ? day2 : day;
  const listChoices = onSecond ? choices2 : choices;
  const listSpells = onSecond ? spells2 : spells;
  const picksAt = (n: number) => listChoices.filter((choice) => choice.level === n && listSpells.includes(String(choice.power.name))).length;
  const usableMain = useMemo(() => usableBy(cls), [cls]);
  const usableMulti = useMemo(() => (multi ? usableBy(multi) : null), [multi]);
  // The shop offers what the class or the multi-class may use (FG).
  const usable = (item: Row) => usableMain(item) || Boolean(usableMulti?.(item));
  const levelRow = cls ? progressionRow(cls, level) : null;
  const say = (text: string) => setNote(text);

  // Hit points rest on the class, race, level and Constitution: when one changes, they are rolled again.
  const hpSignature = `${className}|${raceName}|${level}|${con}|${multiName}|${supportKey}`;
  const lastSignature = useRef(hpSignature);
  useEffect(() => {
    if (lastSignature.current !== hpSignature) {
      lastSignature.current = hpSignature;
      generation.current.hp += 1;
      if (hp.length > 0) setHpCleared(true);
      setHp([]);
    }
  }, [hpSignature]);
  // A new starting level keeps the spells that still fit, and says so.
  useEffect(() => {
    setSpells((current) => {
      const kept: string[] = [];
      const counts = new Map<number, number>();
      for (const name of current) {
        const choice = choices.find((item) => String(item.power.name) === name);
        if (!choice) continue;
        const used = counts.get(choice.level) ?? 0;
        if (used < (day[choice.level] ?? 0)) {
          kept.push(name);
          counts.set(choice.level, used + 1);
        }
      }
      if (kept.length < current.length) say("Starting level changed. Spell choices exceeding the new level limits were removed; review the Spells page.");
      return kept.length === current.length ? current : kept;
    });
  }, [level]);

  function classBlocked(row: Row): string | null {
    const only = RACE_CLASS.exec(String(row.name))?.[1]?.toLowerCase();
    if (only && String(row.name).includes(",") && !String(race?.name ?? "").toLowerCase().startsWith(only)) return `only for ${PEOPLE[only]} (a race class)`;
    return null;
  }

  function chooseRace(row: Row | null) {
    setRaceName(row ? String(row.name) : "");
    // A new race: the extra primes go, and a race class it cannot take.
    setChosenPrimes([]);
    const only = RACE_CLASS.exec(className)?.[1]?.toLowerCase();
    if (cls && only && className.includes(",") && !String(row?.name ?? "").toLowerCase().startsWith(only)) chooseClass(null);
  }
  function chooseClass(row: Row | null) {
    const why = row ? classBlocked(row) : null;
    if (why) return say(`${String(row?.name)}: ${why}.`);
    setClassName(row ? String(row.name) : "");
    // A new class: primes, hit points, coin, purchases and spells start again.
    setChosenPrimes([]);
    generation.current.gold += 1;
    setGold(null);
    setCart([]);
    setSpells([]);
    // ...and the combined classes.
    setMultiName("");
    setSupportKey("");
    setPlusNames([]);
    setComboPick("");
    setSpells2([]);
    if (details.alignment && row && !alignmentsFor(String(row.name)).allowed.includes(details.alignment)) setDetails({ ...details, alignment: "" });
  }
  function setCombo(kind: "multi" | "support" | "plus", value: string, on = true) {
    // Choosing or removing clears the second spell list and the hit point rolls.
    setSpells2([]);
    setComboPick("");
    setChosenPrimes([]);
    if (kind === "multi") {
      setMultiName(on ? value : "");
      if (on) setSupportKey("");
    } else if (kind === "support") {
      setSupportKey(on ? value : "");
      if (on) setMultiName("");
    } else setPlusNames((current) => (on ? [...current.filter((name) => name !== value), value] : current.filter((name) => name !== value)));
  }

  async function rollAbilities() {
    const run = ++generation.current.attr;
    setRolling("attr");
    setBase({});
    try {
      const next: Partial<Record<Stat, number>> = {};
      for (const stat of STATS as readonly Stat[]) {
        const roll = await rollOnHost(methodRow.formula, `${STAT_NAME[stat]} (${methodRow.note})`);
        if (generation.current.attr !== run) return;
        next[stat] = roll.total;
        setBase({ ...next });
      }
    } finally {
      if (generation.current.attr === run) setRolling("");
    }
  }

  function swap(from: Stat, to: Stat) {
    if (!methodRow.arrange || from === to || base[from] === undefined || base[to] === undefined) return;
    setBase((current) => ({ ...current, [from]: current[to], [to]: current[from] }));
  }

  const hpPlan = cls
    ? Array.from({ length: level }, (_, index) => {
        const n = index + 1;
        const { dice: own, flat } = levelGain(cls, n) as { dice: string[]; flat: number };
        // A combined character rolls the combined die (Multi-Class or Enhanced Class Hit Die table).
        const dice = comboDie ? own.map(() => comboDie) : own;
        const counts = new Map<string, number>();
        for (const die of dice) counts.set(die, (counts.get(die) ?? 0) + 1);
        return { n, dice: [...counts].map(([die, count]) => `${count > 1 ? `${die} x${count}` : `1${die}`}`).join(" + "), formula: [...counts].map(([die, count]) => `${count}${die}`).join("+"), flat };
      })
    : [];
  async function rollHitPoints() {
    if (!cls) return say("Choose a class first.");
    if (unsupported) return say(unsupported);
    const run = ++generation.current.hp;
    setRolling("hp");
    setHpCleared(false);
    try {
      const gains: number[] = [];
      for (const step of hpPlan) {
        if (!step.formula) {
          gains.push(step.flat);
          continue;
        }
        const roll = await rollOnHost(`${step.formula}${step.flat + con !== 0 ? signed(step.flat + con) : ""}`, `Hit Points ${className} ${step.n}`);
        if (generation.current.hp !== run) return;
        gains.push(Math.max(1, roll.total));
      }
      setHp(gains);
    } finally {
      if (generation.current.hp === run) setRolling("");
    }
  }

  async function rollGold() {
    if (!cls) return say("Choose a class first.");
    const match = /^(\d*d\d+)x?(\d*)$/i.exec(String(cls.startgold ?? "").replace(/\s+/g, ""));
    if (!match) {
      setGold(0);
      return say("This class has no starting coin set; the Castle Keeper will tell you your purse.");
    }
    const run = ++generation.current.gold;
    setRolling("gold");
    try {
      const roll = await rollOnHost(match[1], `Starting coin ${String(cls.startgold)}`);
      if (generation.current.gold !== run) return;
      if (cart.length > 0) say("Starting coin re-rolled: your purchases were returned to the shop.");
      setCart([]);
      setGold(roll.total * (Number(match[2]) || 1));
    } finally {
      if (generation.current.gold === run) setRolling("");
    }
  }

  // The shop: priced, mundane items the class can use, one per name (the Player's Handbook's first).
  const shop = useMemo(() => {
    const kept = new Map<string, Row>();
    for (const item of library.items) {
      const name = String(item.name ?? "");
      const type = String(item.type ?? "").toLowerCase();
      if (!name || type === "treasure" || type === "magic" || parseCost(item.cost) === null || /[+-]\s*\d/.test(name) || /\(Template\)/i.test(name)) continue;
      const held = kept.get(name);
      if (held && (String(held.fgPath ?? "").endsWith(`@${CORE_BOOK}`) || !String(item.fgPath ?? "").endsWith(`@${CORE_BOOK}`))) continue;
      kept.set(name, item);
    }
    return [...kept.values()].sort((a, b) => CATEGORY_ORDER.indexOf(categoryOf(a)) - CATEGORY_ORDER.indexOf(categoryOf(b)) || String(a.name).localeCompare(String(b.name)));
  }, [library.items]);
  const shown = gold === null || !cls ? [] : shop.filter((item) => (shopCategory === "all" || categoryOf(item) === shopCategory) && String(item.name).toLowerCase().includes(shopSearch.toLowerCase()) && (parseCost(item.cost) ?? Infinity) <= left && usable(item));
  function buy(item: Row) {
    const cost = parseCost(item.cost) ?? 0;
    if (gold === null) return say("Roll your starting coin first.");
    if (cost > left) return say(`Not enough coin for ${String(item.name)}.`);
    setCart((current) => {
      const held = current.find((entry) => entry.name === item.name);
      if (held) return current.map((entry) => (entry === held ? { ...entry, count: entry.count + 1 } : entry));
      return [...current, { name: String(item.name), cost, count: 1 }];
    });
  }
  const giveBack = (name: string) => setCart((current) => current.flatMap((entry) => (entry.name !== name ? [entry] : entry.count > 1 ? [{ ...entry, count: entry.count - 1 }] : [])));

  function toggleSpell(name: string, at: number) {
    const set = onSecond ? setSpells2 : setSpells;
    if (listSpells.includes(name)) return set(listSpells.filter((item) => item !== name));
    if (picksAt(at) >= (listDay[at] ?? 0)) return say(`You already have ${at === 0 ? "0-level" : `Level ${at}`} spells: ${listDay[at] ?? 0} allowed. Untick one to choose another.`);
    set([...listSpells, name]);
  }
  function togglePrime(stat: Stat, on: boolean) {
    if (forcedPrimes.includes(stat)) return;
    if (on && primes.size >= primesAllowed) return say(`You can have ${primesAllowed} primes in total, including your class prime. Untick another extra prime first.`);
    setChosenPrimes((current) => (on ? [...current, stat] : current.filter((item) => item !== stat)));
  }

  // The main class and the multi-class both decide the alignment (FG's wizard).
  const alignment = multi
    ? { allowed: COMBO_ALIGNMENTS.filter((item) => alignmentAllowed(className, item) && alignmentAllowed(multiName, item)), rule: `${className}: ${alignmentText(className)}; ${multiName}: ${alignmentText(multiName)}` }
    : alignmentsFor(className);
  const alerts: Record<Page, string[]> = {
    abilities: allRolled ? [] : ["Roll the attribute scores"],
    race: race ? [] : ["Choose a race"],
    class: !cls ? ["Choose a class"] : unsupported ? [unsupported] : [],
    primes: !race || !cls ? ["Choose primes (after race and class)"] : primes.size !== primesAllowed ? [`Choose primes (${primes.size} of ${primesAllowed} chosen)`] : [],
    hp: hp.length === level && cls ? [] : ["Roll hit points"],
    equipment: gold === null ? ["Roll starting coin"] : [],
    spells: (castsSpells && spells.length === 0) || (castsSecond && spells2.length === 0) ? ["Choose spells"] : [],
    finish: [...(details.name?.trim() ? [] : ["Enter name"]), ...(details.alignment ? [] : ["Enter alignment"])],
  };
  const pages = PAGES.filter((name) => name !== "spells" || castsSpells || castsSecond);
  const warnings = pages.flatMap((name) => alerts[name]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const unfinished = pages.filter((name) => name !== "finish" && alerts[name].length > 0).map((name) => PAGE_LABEL[name]);
      if (!details.name?.trim()) unfinished.push("Name");
      if (!details.alignment) unfinished.push("Alignment");
      const spec = {
        name: details.name?.trim() || "Unnamed character",
        race: raceName,
        class: className,
        level,
        scores: Object.fromEntries(STATS.map((stat) => [stat, finalOr10(stat)])),
        primes: [...primes],
        hp,
        gold: gold ?? 0,
        gear: cart.map((entry) => [entry.name, entry.count]),
        spells,
        ...art,
        ...(multi ? { multiclass: multiName } : {}),
        ...(supportRecord ? { support: supportKey } : {}),
        ...(plusNames.length ? { plus: plusNames } : {}),
        ...(spells2.length ? { spells2 } : {}),
        ...Object.fromEntries(["alignment", "deity", "gender", "age", "height", "weight", "appearance"].map((key) => [key, details[key] ?? ""])),
        notes: [unfinished.length > 0 ? `Unfinished in the character wizard (finish with your Castle Keeper): ${unfinished.join(", ")}.` : "", details.notes ?? ""].filter(Boolean).join("\n\n"),
      };
      const id = await session.buildCharacter(spec);
      const classText = [className || "?", multiName, supportOption ? `with ${supportOption.name}` : "", ...plusNames.map((name) => `${name} plus`)].filter(Boolean).join(multi ? "/" : " ");
      session.sendChat(`${spec.name} joins the adventure (level ${level} ${raceName || "?"} ${classText}).${unfinished.length ? ` Saved unfinished: still to choose ${unfinished.join(", ")}; the list is in the sheet's notes.` : ""}`, {});
      onDone(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the character.");
    } finally {
      setCreating(false);
    }
  }

  if (library.packages.length === 0) {
    return (
      <section className="ccw">
        <h2>SC C&amp;C Character Creation Wizard</h2>
        <p className="hint">This campaign has no game books yet. The GM makes them active first: Books, Activation, then the Player's Handbook (and the Adventurer's Backpack for more classes).</p>
        <button type="button" onClick={() => onDone(null)}>
          Close
        </button>
      </section>
    );
  }

  const badge = (stat: Stat, prime = false) => (
    <div key={stat} className="ccw-badge" data-badge={stat}>
      <span className="ccw-badge-label">{SHORT[stat]}</span>
      <b className="ccw-badge-total" data-final={stat}>
        {final(stat) ?? ""}
        {prime && primes.has(stat) ? <i className="ccw-prime-mark" title="Prime">✓</i> : null}
      </b>
      <span className="ccw-badge-mod">{final(stat) === null ? "" : signed(abilityBonus(final(stat), library.game))}</span>
    </div>
  );
  const next = pages[Math.min(pages.length - 1, pages.indexOf(page) + 1)];

  return (
    <section className="ccw" data-page={page}>
      <header className="ccw-head">
        <h2>SC C&amp;C Character Creation Wizard</h2>
        <span className="ccw-head-buttons">
          <button type="button" className="wizard-next" data-wizard-next disabled={page === pages.at(-1)} onClick={() => setPage(next)} title={`Next: ${PAGE_LABEL[next]}`}>
            Next ›
          </button>
          <button type="button" onClick={() => onDone(null)}>
            Cancel
          </button>
        </span>
      </header>
      <nav className="ccw-tabs" role="tablist">
        {pages.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={page === name} data-wizard-tab={name} onClick={() => setPage(name)}>
            {PAGE_LABEL[name]}
            <span className={alerts[name].length > 0 ? "ccw-tab-badge todo" : "ccw-tab-badge done"} title={alerts[name].join("; ") || "Done"}>
              {alerts[name].length > 0 ? <img src={`${ART_BASE}/alert.webp`} alt="!" /> : "✓"}
            </span>
          </button>
        ))}
      </nav>
      {note ? (
        <p className="ccw-note" role="status">
          {note}
          <button type="button" aria-label="Dismiss" onClick={() => setNote("")}>
            ×
          </button>
        </p>
      ) : null}

      <div className="ccw-page" style={{ ["--ccw-art" as string]: `url(${ART_BASE}/${ART[page]}.webp)` }}>
        <Instructions page={page} />

        {page === "abilities" ? (
          <>
            <Plate>Attribute Scores</Plate>
            <div className="ccw-panel">
              <div className="ccw-row">
                <label>
                  Method{" "}
                  <select value={method} onChange={(event) => setMethod(event.target.value as Method)} aria-label="Attribute method">
                    {METHODS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ccw-button" onClick={() => void rollAbilities()} disabled={rolling === "attr"} data-action="roll-abilities">
                  {rolling === "attr" ? "Rolling…" : "Roll All"}
                </button>
                <span className="hint">{methodRow.arrange ? "Drag a score onto another to swap them." : "In order: the scores stay where they fall."}</span>
              </div>
              <div className="ccw-badges">{(STATS as readonly Stat[]).map((stat) => badge(stat))}</div>
              <Plate>Base</Plate>
              <div className="ccw-slots">
                {(STATS as readonly Stat[]).map((stat) => (
                  <span
                    key={stat}
                    className={`ccw-slot${dragging && dragging !== stat ? " target" : ""}${picked === stat ? " picked" : ""}`}
                    data-stat={stat}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      // Click one score, then another, to swap them (the same as dragging).
                      if (!methodRow.arrange || base[stat] === undefined) return;
                      if (picked && picked !== stat) {
                        swap(picked, stat);
                        setPicked(null);
                      } else setPicked(picked === stat ? null : stat);
                    }}
                    draggable={methodRow.arrange && base[stat] !== undefined}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/kraken-score", stat);
                      setDragging(stat);
                    }}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(event) => {
                      if (dragging && methodRow.arrange) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = (event.dataTransfer.getData("text/kraken-score") || dragging) as Stat;
                      setDragging(null);
                      if (from) swap(from, stat);
                    }}
                    title={methodRow.arrange ? "Drag onto another score to swap them" : ""}
                  >
                    {base[stat] ?? ""}
                  </span>
                ))}
              </div>
              <Plate>Race</Plate>
              <div className="ccw-slots">
                {(STATS as readonly Stat[]).map((stat) => (
                  <span key={stat} className="ccw-slot readonly">
                    {raceMod(stat) ? signed(raceMod(stat)) : ""}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {page === "race" ? (
          race ? (
            <>
              <Plate
                action={
                  <button type="button" className="ccw-change" data-action="change-race" onClick={() => chooseRace(null)}>
                    Change Race
                  </button>
                }
              >
                {String(race.name).toUpperCase()}
              </Plate>
              <div className="ccw-chosen">
                {RACE_ART.has(artKey(String(race.name))) ? <img className="ccw-portrait" src={`${ART_BASE}/races/${artKey(String(race.name))}.webp`} alt="" /> : null}
                <div className="ccw-chosen-info">
                  <h3>{String(race.name)}</h3>
                  <p>
                    Attribute modifiers:{" "}
                    {Object.entries((race.attrmods as Row) ?? {})
                      .filter(([, mod]) => num(mod))
                      .map(([stat, mod]) => `${signed(num(mod))} ${STAT_NAME[stat] ?? stat}`)
                      .join(", ") || "None"}
                  </p>
                  {race.speed ? <p>Move: {String(race.speed)}</p> : null}
                  <p>Extra primes to choose: {num(race.primechoice)}</p>
                  <p>Languages: {(raceLanguages(race) as string[]).join(", ") || "—"}</p>
                  <p>Source: {sourceOf(race)}</p>
                </div>
              </div>
              <Plate>Traits</Plate>
              {Object.values((race.abilities as Record<string, Row>) ?? {})
                .filter((row) => row && typeof row === "object")
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                .map((row) => (
                  <Card key={String(row.name)} title={String(row.name)} text={plain(row.text)} />
                ))}
            </>
          ) : (
            <>
              <Plate>Races</Plate>
              <PickList rows={races} chosen={raceName} kind="race" onPick={chooseRace} />
            </>
          )
        ) : null}

        {page === "class" ? (
          cls ? (
            <>
              <Plate
                action={
                  <button type="button" className="ccw-change" data-action="change-class" onClick={() => chooseClass(null)}>
                    Change Class
                  </button>
                }
              >
                {String(cls.name).toUpperCase()}
              </Plate>
              <div className="ccw-chosen">
                {CLASS_ART.has(artKey(String(cls.name))) ? <img className="ccw-portrait class" src={`${ART_BASE}/classes/${artKey(String(cls.name))}.webp`} alt="" /> : null}
                <div className="ccw-chosen-info">
                  <div className="ccw-level">
                    <h3>{String(cls.name)}</h3>
                    <span>
                      Level <b data-start-level>{level}</b>
                      <button type="button" aria-label="Higher starting level" title="Higher starting level" disabled={level >= 20} onClick={() => setLevel(Math.min(20, level + 1))}>
                        ▲
                      </button>
                      <button type="button" aria-label="Lower starting level" title="Lower starting level" disabled={level <= 1} onClick={() => setLevel(Math.max(1, level - 1))}>
                        ▼
                      </button>
                    </span>
                  </div>
                  {unsupported ? <p className="ccw-warn">{unsupported}</p> : null}
                  <p>Prime attribute: {STATS.filter((stat) => num((cls.primes as Row | undefined)?.[stat]) === 1).map((stat) => STAT_NAME[stat]).join(", ") || "-"}</p>
                  <p>Hit die: {String(cls.hitdie ?? "")}</p>
                  {levelRow ? (
                    <p>
                      Base to hit: {signed(num(levelRow.bth))} · Hit dice at this level: {String(levelRow.hd ?? "")}
                    </p>
                  ) : null}
                  <p>Starting coin: {String(cls.startgold ?? "-").replace(/x/i, " x ")} gp</p>
                  {combined ? <p data-start-xp>Starting experience: {startXP({ main: cls, multi, supportKey: supportRecord ? supportKey : "", plusCount: plusNames.length }, level)} XP (combined classes)</p> : null}
                  <p>Source: {sourceOf(cls)}</p>
                </div>
              </div>
              <Plate>Class Abilities</Plate>
              {Object.values((cls.abilities as Record<string, Row>) ?? {})
                .filter((row) => row && typeof row === "object" && num(row.level || 1) <= level)
                .sort((a, b) => num(a.level) - num(b.level) || String(a.name).localeCompare(String(b.name)))
                .map((row) => (
                  <Card key={String(row.name)} title={`(Level ${String(num(row.level || 1)).padStart(2, "0")})  ${String(row.name)}`} text={plain(row.text)} />
                ))}
              <Plate>Combine Classes (Adventurer's Backpack)</Plate>
              {multi ? (
                <div className="ccw-card open ccw-combo-card" data-combo="multi">
                  <div className="ccw-card-title">
                    <b>Multi-class: {multiName}</b>
                    <button type="button" onClick={() => setCombo("multi", "", false)} data-action="remove-multi">
                      Remove
                    </button>
                  </div>
                  <p className="ccw-card-text">
                    {(() => {
                      const rule = multiRule(className, multiName, raceName);
                      return `${rule.code ? `[${rule.code}] ` : ""}${rule.words} Both classes advance together; experience needed is the two classes' added together; hit points use the Multi-Class Hit Die table (${dieOf(cls)} with ${dieOf(multi)}: ${comboDie || "?"}).`;
                    })()}
                  </p>
                </div>
              ) : null}
              {supportRecord && supportOption ? (
                <div className="ccw-card open ccw-combo-card" data-combo="support">
                  <div className="ccw-card-title">
                    <b>Enhanced class, supporting: {supportOption.sub ? `${supportOption.name} (${String(supportRecord.name)})` : supportOption.name}</b>
                    <button type="button" onClick={() => setCombo("support", "", false)} data-action="remove-support">
                      Remove
                    </button>
                  </div>
                  <p className="ccw-card-text">
                    {(() => {
                      const rule = enhancedRule(className, supportKey, raceName);
                      const adv = supportOption.adv?.[String(level)];
                      return `${rule.code ? `[${rule.code}] ` : ""}${rule.words} Gives: ${supportOption.abilities}. It counts as level ${supportLevel(supportKey, level)} (half the principal level); at level ${level} it adds ${adv?.xp ?? 0} XP to each level's experience${adv?.gained ? ` and gives: ${adv.gained}` : ""}. Hit points use the Enhanced Class Hit Die table (${dieOf(supportRecord)} supporting ${dieOf(cls)}: ${comboDie || "?"}).`;
                    })()}
                  </p>
                </div>
              ) : null}
              {plusNames.map((name) => (
                <div key={name} className="ccw-card open ccw-combo-card" data-combo="plus">
                  <div className="ccw-card-title">
                    <b>Class plus: {name}</b>
                    <button type="button" onClick={() => setCombo("plus", name, false)} data-action="remove-plus">
                      Remove
                    </button>
                  </div>
                  <p className="ccw-card-text">{plusText(name)}. Zero level only; costs 5% of all experience earned.</p>
                </div>
              ))}
              <div className="ccw-panel">
                {isRaceClass(className) ? (
                  <p className="hint">A race class combines with no other class (Adventurer's Backpack).</p>
                ) : (
                  <>
                    <p className="hint">Optional: begin with more than one class. The Castle Keeper has the last word on any combination.</p>
                    <div className="ccw-row">
                      {!multi && !supportRecord ? (
                        <>
                          <button type="button" className="ccw-button" title="Two classes from 1st level, advancing together (Adventurer's Backpack)" data-action="combo-multi" onClick={() => setComboPick(comboPick === "multi" ? "" : "multi")}>
                            {comboPick === "multi" ? "Cancel" : "Add Class (multi-class)"}
                          </button>
                          <button type="button" className="ccw-button" title="Some abilities of another class, at half the rate (Adventurer's Backpack)" data-action="combo-support" onClick={() => setComboPick(comboPick === "support" ? "" : "support")}>
                            {comboPick === "support" ? "Cancel" : "Add Supporting Class (enhanced)"}
                          </button>
                        </>
                      ) : null}
                      <button type="button" className="ccw-button" title="Zero-level abilities of another class, 5% of experience each (Adventurer's Backpack)" data-action="combo-plus" onClick={() => setComboPick(comboPick === "plus" ? "" : "plus")}>
                        {comboPick === "plus" ? "Cancel" : "Add Class Plus"}
                      </button>
                    </div>
                    {comboPick ? (
                      <div className="ccw-picklist ccw-combo-list">
                        {(comboPick === "multi"
                          ? classes.filter((row) => row.name !== className).map((row) => ({ id: String(row.name), label: String(row.name), rule: multiRule(className, String(row.name), raceName), extra: "", source: sourceOf(row) }))
                          : comboPick === "support"
                            ? supportOptions()
                                .map((option) => ({ option, record: classes.find((row) => classKey(row.name) === option.class) }))
                                .filter(({ record }) => record && record.name !== className)
                                .map(({ option, record }) => {
                                  const prime = supportPrime(option.key, record);
                                  return { id: option.key, label: option.sub ? `${option.name} (${String(record?.name)})` : option.name, rule: enhancedRule(className, option.key, raceName), extra: prime ? `  Needs ${prime[0].toUpperCase()}${prime.slice(1)} as a prime.` : "", source: sourceOf(record as Row) };
                                })
                            : classes.filter((row) => row.name !== className && canPlus(String(row.name)) && !plusNames.includes(String(row.name))).map((row) => ({ id: String(row.name), label: String(row.name), rule: { code: "", words: String(plusText(String(row.name))), allowed: true }, extra: "", source: sourceOf(row) }))
                        )
                          .sort((a, b) => Number(b.rule.allowed) - Number(a.rule.allowed) || a.label.localeCompare(b.label))
                          .map((item) => (
                            <div key={item.id} className={item.rule.allowed ? "ccw-pick" : "ccw-pick blocked"} data-combo-row={item.id}>
                              {item.rule.allowed ? (
                                <button type="button" className="ccw-add" title="Add" aria-label={`Add ${item.label}`} data-combo-add={item.id} onClick={() => setCombo(comboPick, item.id)}>
                                  +
                                </button>
                              ) : (
                                <span />
                              )}
                              <span className="ccw-pick-name">
                                {item.label} {item.rule.code ? <small>[{item.rule.code}]</small> : null}
                                <small className="ccw-combo-rule"> {item.rule.words}{item.extra}</small>
                              </span>
                              <span className="ccw-pick-source">{item.source}</span>
                            </div>
                          ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Plate>Classes</Plate>
              {!race ? (
                <p className="ccw-panel">Choose your race first (Race tab): the race decides which classes you can take. The four race classes of the Adventurer's Backpack are only for their own race.</p>
              ) : (
                <PickList rows={classes} chosen={className} kind="class" onPick={chooseClass} blockedWhy={classBlocked} />
              )}
            </>
          )
        ) : null}

        {page === "primes" ? (
          <>
            <Plate>Prime Attributes</Plate>
            <div className="ccw-panel">
              <p>
                <b>
                  Primes chosen: {primes.size} of {primesAllowed}
                </b>
              </p>
              {(STATS as readonly Stat[]).map((stat) => {
                const forced = forcedPrimes.includes(stat);
                return (
                  <label key={stat} className="ccw-prime-row">
                    <input type="checkbox" checked={primes.has(stat)} disabled={forced || !cls} onChange={(event) => togglePrime(stat, event.target.checked)} aria-label={`${stat} prime`} />
                    <b>{STAT_NAME[stat]}</b>
                    <span>{final(stat) ?? "—"}</span>
                    <span className="hint">{forced ? `   (${primeFrom(stat)})` : ""}</span>
                  </label>
                );
              })}
            </div>
          </>
        ) : null}

        {page === "hp" ? (
          <>
            <Plate>Hit Points</Plate>
            <div className="ccw-panel">
              <div className="ccw-row">
                <button type="button" className="ccw-button" onClick={() => void rollHitPoints()} disabled={rolling === "hp"} data-action="roll-hp">
                  {rolling === "hp" ? "Rolling…" : "Roll Hit Points"}
                </button>
                <b data-hp-total={hpTotal}>Total hit points: {hpTotal}</b>
              </div>
              {!cls ? <p>Choose a class first.</p> : null}
              {unsupported ? <p className="ccw-warn">{unsupported}</p> : null}
              {hpCleared ? <p className="ccw-warn">Your previous HP roll was cleared after a character change. Roll Hit Points again.</p> : null}
              {hpPlan.map((step, index) => (
                <p key={step.n} className="ccw-plan">
                  Level {step.n}:&nbsp;&nbsp; {step.dice || ""} {step.flat ? signed(step.flat) : ""} {con && step.dice ? `${signed(con)} Con` : ""} {hp[index] !== undefined ? `  = ${hp[index]}` : ""}
                </p>
              ))}
            </div>
          </>
        ) : null}

        {page === "equipment" ? (
          <>
            <Plate>Starting Coin</Plate>
            <div className="ccw-panel ccw-row">
              <button type="button" className="ccw-button" onClick={() => void rollGold()} disabled={rolling === "gold"} data-action="roll-gold">
                {rolling === "gold" ? "Rolling…" : "Roll Starting Coin"}
              </button>
              <span>
                Purse <b className="ccw-box">{gold === null ? "-" : `${gold} gp`}</b>
              </span>
              <span>
                Spent <b className="ccw-box">{copper(spent)}</b>
              </span>
              <span>
                Left <b className="ccw-box" data-coin-left={left}>{gold === null ? "-" : copper(left)}</b>
              </span>
            </div>
            <Plate>Purchased</Plate>
            <div className="ccw-panel">
              {cart.length === 0 ? <p className="hint">Nothing bought yet.</p> : null}
              {cart.map((entry) => (
                <div key={entry.name} className="ccw-cart-row">
                  <button type="button" onClick={() => giveBack(entry.name)} aria-label={`Return ${entry.name}`}>
                    Return
                  </button>
                  <span>
                    {entry.name}
                    {entry.count > 1 ? ` x${entry.count}` : ""}
                  </span>
                  <span>{copper(entry.cost * entry.count)}</span>
                </div>
              ))}
            </div>
            <Plate>Shop</Plate>
            <div className="ccw-panel">
              <div className="ccw-row">
                <label>
                  Shop{" "}
                  <select value={shopCategory} onChange={(event) => setShopCategory(event.target.value)} aria-label="Shop category">
                    {CATEGORIES.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Search <input value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} aria-label="Shop search" />
                </label>
              </div>
              {!cls ? <p className="hint">Choose a class first: your class sets your starting coin.</p> : gold === null ? <p className="hint">Roll your starting coin first. The shop opens once you know what you can spend.</p> : shown.length === 0 ? <p className="hint">Nothing here that you can afford.</p> : null}
              <div className="ccw-shop">
                {shown.map((item) => (
                  <div key={String(item.fgPath ?? item.name)} className="ccw-shop-row">
                    <button type="button" className="ccw-add" onClick={() => buy(item)} aria-label={`Buy ${String(item.name)}`}>
                      +
                    </button>
                    <span title={plain(item.description).slice(0, 300)}>{String(item.name)}</span>
                    <span className="hint">{String(item.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {page === "spells" ? (
          <>
            <Plate>Spells</Plate>
            <div className="ccw-panel">
              {castsSecond ? (
                <div className="ccw-row">
                  {castsSpells ? (
                    <button type="button" className="ccw-button" aria-pressed={!onSecond} data-spell-list="main" onClick={() => setSpellList("main")}>
                      {String(cls?.spellclass ?? className)}
                    </button>
                  ) : null}
                  <button type="button" className="ccw-button" aria-pressed={onSecond} data-spell-list="second" onClick={() => setSpellList("second")}>
                    {String(secondCaster?.spellclass ?? "Second class")}
                  </button>
                </div>
              ) : null}
              <p>
                <b>
                  Spells per day at level {level}:{" "}
                  {Object.entries(listDay)
                    .filter(([, count]) => count > 0)
                    .map(([n, count]) => `${n === "0" ? "0-level" : `level ${n}`}: ${count}`)
                    .join(", ")}
                </b>
              </p>
              <p>Choose your starting spells:</p>
              {Object.entries(listDay)
                .filter(([, count]) => count > 0)
                .map(([n, count]) => (
                  <p key={n} className="ccw-plan">
                    {n === "0" ? "0-level" : `Level ${n}`}: {picksAt(Number(n))} of {count} spells selected{count - picksAt(Number(n)) > 0 ? ` - ${count - picksAt(Number(n))} more available` : ""}
                  </p>
                ))}
              <div className="ccw-row">
                <label>
                  Search <input value={spellSearch} onChange={(event) => setSpellSearch(event.target.value)} aria-label="Spell search" />
                </label>
                <label>
                  Level{" "}
                  <select value={spellLevel} onChange={(event) => setSpellLevel(event.target.value)} aria-label="Spell level">
                    <option value="all">All levels</option>
                    {Object.entries(listDay)
                      .filter(([, count]) => count > 0)
                      .map(([n]) => (
                        <option key={n} value={n}>
                          {n === "0" ? "0-level" : `Level ${n}`}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <div className="ccw-spells">
                {listChoices
                  .filter((choice) => (spellLevel === "all" || String(choice.level) === spellLevel) && String(choice.power.name).toLowerCase().includes(spellSearch.toLowerCase()))
                  .map((choice) => {
                    const name = String(choice.power.name);
                    return (
                      <div key={name} className="ccw-spell">
                        <input type="checkbox" checked={listSpells.includes(name)} onChange={() => toggleSpell(name, choice.level)} aria-label={`Spell ${name}`} />
                        <span className="ccw-spell-level">{choice.level}</span>
                        <button type="button" className="ccw-pick-name" onClick={() => setReadSpell(readSpell === name ? "" : name)}>
                          {name}
                        </button>
                        {readSpell === name ? <p className="ccw-reading">{plain(choice.power.description ?? choice.power.text ?? choice.power.shortdescription) || "No text."}</p> : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        ) : null}

        {page === "finish" ? (
          <>
            <Plate>Warnings</Plate>
            <div className="ccw-panel">
              {warnings.length === 0 ? <p>Nothing left to do: the character is ready.</p> : null}
              {warnings.map((text) => (
                <p key={text} className="ccw-warning">
                  <img src={`${ART_BASE}/alert.webp`} alt="" /> <b>WARNING</b> {text}
                </p>
              ))}
            </div>
            <Plate>Details</Plate>
            <div className="ccw-panel ccw-details">
              <ArtChoice session={session} race={raceName ?? ""} cls={className ?? ""} value={art} onChange={setArt} />
              <label>
                Name <input value={details.name ?? ""} onChange={(event) => setDetails({ ...details, name: event.target.value })} aria-label="Character name" />
              </label>
              <label title={`Allowed: ${className || "any class"}: ${alignment.rule}`}>
                Alignment{" "}
                <select value={details.alignment ?? ""} onChange={(event) => setDetails({ ...details, alignment: event.target.value })} aria-label="alignment">
                  <option value="">—</option>
                  {alignment.allowed.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Deity <input value={details.deity ?? ""} onChange={(event) => setDetails({ ...details, deity: event.target.value })} aria-label="deity" />
              </label>
              <label>
                Gender <input value={details.gender ?? ""} onChange={(event) => setDetails({ ...details, gender: event.target.value })} aria-label="gender" />
              </label>
              <div className="ccw-row">
                {(["age", "height", "weight"] as const).map((key) => (
                  <label key={key}>
                    {key[0].toUpperCase() + key.slice(1)} <input className="short" value={details[key] ?? ""} onChange={(event) => setDetails({ ...details, [key]: event.target.value })} aria-label={key} />
                  </label>
                ))}
              </div>
              <label className="wide">
                Appearance <input value={details.appearance ?? ""} onChange={(event) => setDetails({ ...details, appearance: event.target.value })} aria-label="appearance" />
              </label>
              <label className="wide">
                Notes <textarea value={details.notes ?? ""} onChange={(event) => setDetails({ ...details, notes: event.target.value })} aria-label="notes" />
              </label>
            </div>
            <Plate>Create</Plate>
            <div className="ccw-panel">
              <button type="button" className="play-button ccw-create" onClick={() => void create()} disabled={creating} data-action="create-character">
                {creating ? "Creating…" : "Create Character"}
              </button>
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <Plate>Summary</Plate>
            <div className="ccw-panel">
              <div className="ccw-badges">{(STATS as readonly Stat[]).map((stat) => badge(stat, true))}</div>
              <p>
                Name: {details.name || "-"}      Alignment: {details.alignment || "-"}
              </p>
              <p>
                Race: {raceName || "-"}      Class: {className || "-"} {cls ? level : ""}
              </p>
              <p>
                Hit points: {hpTotal || "-"}      Coin left: {gold === null ? "-" : copper(left)}      Items: {cart.map((entry) => `${entry.name}${entry.count > 1 ? ` x${entry.count}` : ""}`).join(", ") || "-"}      Spells: {spells.length}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
