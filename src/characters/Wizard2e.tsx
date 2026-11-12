import { useEffect, useMemo, useRef, useState } from "react";
import { useHostRolls as useSharedHostRolls } from "./hostRolls";
import type { RollResult, Session } from "../session/useSession";
import { ArtChoice } from "./ArtPicker";
import { CLASSES, GROUPS, RACES, raceKey, signed, STATS } from "../../shared/adnd2e/rules.mjs";
import * as W from "../../shared/adnd2e/wizard.mjs";

// The AD&D 2E character wizard: Kraken's FG extension KrakenCharWizard2E in
// Kraken, tab for tab. Abilities (the PHB's Methods I to VI, as the GM
// allows them; 18/xx Strength), Race (PHB Table 7's ranges), Class (the
// race's classes the scores allow; starting level to the race's limit;
// multi-class for demihumans, dual-class for humans), Kit (the books' kits
// for this race and class, or none), Alignment (the class's), Equipment
// (starting wealth by class group, a shop of what the class may use),
// Profs (weapon slots, specialization, languages, nonweapon slots), Spells
// (a caster's picks per spell level), Commit (name and details, then the
// host builds the sheet). Every roll is the host's, in the chat.

type Row = Record<string, unknown>;
const PAGES = ["abilities", "race", "class", "kit", "alignment", "equipment", "proficiencies", "spells", "commit"] as const;
type Page = (typeof PAGES)[number];
const PAGE_LABEL: Record<Page, string> = { abilities: "Abilities", race: "Race", class: "Class", kit: "Kit", alignment: "Alignment", equipment: "Equipment", proficiencies: "Profs", spells: "Spells", commit: "Commit" };
const SHORT: Record<string, string> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const titled = (word: string) => (word ? word[0].toUpperCase() + word.slice(1) : word);
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rows = (node: unknown): [string, Row][] => Object.entries(node && typeof node === "object" ? (node as Record<string, Row>) : {}).filter(([, row]) => row && typeof row === "object");
const plain = (html: unknown) =>
  String(html ?? "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const LORE: Record<Page, string> = {
  abilities: "Roll your six ability scores with one of the methods your GM allows. A Strength of 18 rolls its exceptional percentage (it counts for a warrior).",
  race: "Choose your race. Races your scores do not allow (PHB Table 7) are not listed; the race's adjustments are added to your scores.",
  class: "Choose your class: those your race may take and your scores allow. Set your starting level (up to your race's limit), and a multi-class (demihumans) or dual-class (humans) if the class type offers one.",
  kit: "A kit from your books, for your race and class, or No Kit.",
  alignment: "Choose your alignment: your class may limit it.",
  equipment: "Roll your starting wealth (by your class group) and buy your gear: the shop lists what your class may use and you can still afford.",
  proficiencies: "Spend your weapon and nonweapon proficiency slots, and pick the languages your Intelligence allows.",
  spells: "Choose the spells you start with: as many of each spell level as your class and level give.",
  commit: "Name your character and fill in the details (each can be rolled), then create the character.",
};

// Waits for the host's answer to a roll this window asked for.
export function useHostRolls(session: Session) {
  return useSharedHostRolls(session, (label) => `[CHARGEN] ${label}`);
}
const diceOf = (roll: RollResult) => roll.terms.flatMap((term) => (term.kind === "dice" ? term.rolls : []));

function Plate({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="ccw-plate">
      {action}
      <span>{children}</span>
    </div>
  );
}

// The extension's own words and picture for a race, class or alignment (its
// bio_charwizard2e.lua, run by the host: electron/extLua.cjs), as FG's page
// shows them: the portrait beside the first block, the rest below.
const EXT = "KrakenCharWizard2E";
function Lore({ session, title, top, below, image, args }: { session: Session; title: string; top: string; below?: string; image?: string; args: unknown[] }) {
  const [lore, setLore] = useState<{ top: string; below: string; picture: string }>({ top: "", below: "", picture: "" });
  const key = JSON.stringify(args);
  useEffect(() => {
    let live = true;
    void Promise.all([session.wizardText(EXT, top, args), below ? session.wizardText(EXT, below, args) : Promise.resolve({ values: [], files: [] }), image ? session.wizardText(EXT, image, args) : Promise.resolve({ values: [], files: [] })]).then(([a, b, c]) => {
      if (live) setLore({ top: a.values[0] ?? "", below: b.values[0] ?? "", picture: c.files[0] ? session.wizardArtUrl(EXT, c.files[0]) : "" });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, top, below, image]);
  if (!lore.top && !lore.below) return null;
  return (
    <div className="ccw-lore" data-lore={title}>
      <Plate>{title}</Plate>
      {lore.picture ? <img className="ccw-lore-picture" src={lore.picture} alt="" /> : null}
      {lore.top ? <p className="ccw-lore-text">{lore.top}</p> : null}
      {lore.below ? <p className="ccw-lore-text ccw-lore-below">{lore.below}</p> : null}
    </div>
  );
}
// Each page's art, faint behind it (the extension's graphics).
const PAGE_ART: Record<string, string> = { abilities: "abilities_art.png", race: "race_art.png", class: "class_art.png", kit: "kit_art.png", alignment: "alignment_art.png", equipment: "equipment_art.png", proficiencies: "proficiencies_art.png", spells: "class_art.png", commit: "commit_art.png" };

type Kit = { name: string; book: string; data: Row };
type CartRow = { name: string; cp: number; count: number };
type Spell = { name: string; level: number; caster: string };

export function Wizard2e({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const rollOnHost = useHostRolls(session);
  const records = Object.values(session.records);
  const library = useMemo(() => {
    const of = (type: string) => records.filter((record) => record.type === type).map((record) => ({ ...(record.data as Row), name: record.name }) as Row);
    return {
      items: of("item"),
      kits: records.filter((record) => record.type === "background").map((record) => ({ name: record.name, book: W.bookOf(record.data), data: record.data as Row })) as Kit[],
      skills: of("skill"),
      spells: of("spell"),
      pregens: records.filter((record) => record.type === "pregencharsheet" && (record.data as Row)?.classes).sort((a, b) => a.name.localeCompare(b.name)),
    };
    // The books change only on activation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);
  const options = W.wizardOptions(session.options.wizard2e);

  const [page, setPage] = useState<Page>("abilities");
  const [pregen, setPregen] = useState("");
  const [method, setMethod] = useState(5);
  const [abilities, setAbilities] = useState<Record<string, number>>({});
  const [strPercent, setStrPercent] = useState(0);
  const [rolledAll, setRolledAll] = useState(false);
  const [rolledPct, setRolledPct] = useState(false);
  const [viPool, setViPool] = useState<number[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [rolling, setRolling] = useState("");
  const [race, setRace] = useState("");
  const [cls, setCls] = useState("");
  const [mode, setMode] = useState<"single" | "multi" | "dual">("single");
  const [classList, setClassList] = useState<string[]>([]);
  const [dualLevel, setDualLevel] = useState(2);
  const [level, setLevel] = useState(1);
  const [kit, setKit] = useState<Kit | null>(null);
  const [kitChosen, setKitChosen] = useState(false);
  const [kitSource, setKitSource] = useState("(all)");
  const [kitFilter, setKitFilter] = useState("");
  const [reading, setReading] = useState("");
  const [alignment, setAlignment] = useState("");
  const [gold, setGold] = useState<number | null>(null);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [shopType, setShopType] = useState("All");
  const [shopSearch, setShopSearch] = useState("");
  const [weapons, setWeapons] = useState<string[]>([]);
  const [specialize, setSpecialize] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [nwps, setNwps] = useState<string[]>([]);
  const [spells, setSpells] = useState<Spell[]>([]);
  const [casterIndex, setCasterIndex] = useState(0);
  const [spellLevel, setSpellLevel] = useState("all");
  const [spellSchool, setSpellSchool] = useState("");
  const [spellSearch, setSpellSearch] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState<Record<string, string>>({});
  const [art, setArt] = useState<{ portrait?: string; token?: string }>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const generation = useRef({ attr: 0, gold: 0 });

  const methodNow = W.methodFor(method, options);
  const methodRow = W.ABILITY_METHODS[methodNow as keyof typeof W.ABILITY_METHODS];
  const build = { abilities, strPercent, race, cls, mode, classList, dualLevel, level, kit, raceBook: "" };
  const words = W.classWords(build);
  const entries = W.classEntries(build) as { name: string; level: number; active: boolean }[];
  const target = W.targetLevel(build);
  const adjust = (RACES[raceKey(race) as keyof typeof RACES]?.adjust ?? {}) as Record<string, number>;
  const allRolled = W.hasAllAbilities(abilities);
  const say = (text: string) => setNote(text);

  // --- What depends on what (the extension's resets) ---
  const clearEquipment = () => {
    generation.current.gold += 1;
    setGold(null);
    setCart([]);
  };
  const clearProfs = () => {
    setWeapons([]);
    setSpecialize("");
    setLanguages([]);
    setNwps([]);
    setSpells([]);
    setCasterIndex(0);
  };
  function chooseRace(next: string) {
    setRace(next);
    setCls("");
    setMode("single");
    setClassList([]);
    setLevel(1);
    setKit(null);
    setKitChosen(false);
    setAlignment("");
    clearEquipment();
    clearProfs();
    if (next) say(`Character Wizard: race set to '${next}'.`);
  }
  function chooseClass(next: string) {
    setCls(next);
    setMode("single");
    setClassList([]);
    setLevel(1);
    setKit(null);
    setKitChosen(false);
    setAlignment("");
    clearEquipment();
    clearProfs();
    if (next) say(`Character Wizard: class set to '${next}'.`);
  }
  function chooseClassType(label: string) {
    const pick = (W.classTypeOptions(build) as { label: string; mode: "single" | "multi" | "dual"; classes: string[] }[]).find((option) => option.label === label);
    if (!pick) return;
    setMode(pick.mode);
    setClassList(pick.classes);
    if (pick.mode === "dual") setDualLevel((current) => Math.max(2, current));
    clearProfs();
    clearEquipment();
    const nextWords = pick.mode === "single" ? cls.toLowerCase() : [...(pick.mode === "dual" ? [cls] : []), ...pick.classes].join(" ").toLowerCase();
    if (alignment && !W.alignmentAllowed(alignment, nextWords)) setAlignment("");
  }
  function changeLevel(next: number) {
    const clamped = Math.max(1, Math.min(next, W.raceClassMax(build)));
    // With a level-based gold option, a roll made at another level no longer fits (bought gear is kept).
    if (clamped !== level && options.gold !== "phb" && gold !== null) {
      generation.current.gold += 1;
      setGold(null);
    }
    setLevel(clamped);
  }

  // --- Abilities ---
  const setScore = (stat: string, value: number) => setAbilities((current) => ({ ...current, [stat]: value }));
  async function rollAll() {
    if (options.rollLock && rolledAll) return say("Character Wizard: the GM has locked ability rolls - you may only roll once.");
    const run = ++generation.current.attr;
    setRolling("attr");
    setAbilities({});
    setStrPercent(0);
    setViPool([]);
    setRolledAll(true);
    try {
      const all = methodRow.all as { kind: string; formula: string; agg: string; count?: number };
      if (all.kind === "each") {
        const next: Record<string, number> = {};
        for (const stat of STATS) {
          const roll = await rollOnHost(all.formula, `${titled(stat)} (${methodRow.name})`);
          if (generation.current.attr !== run) return;
          next[stat] = all.agg === "bestgroup" ? W.bestGroup(diceOf(roll)) : roll.total;
          setAbilities({ ...next });
        }
      } else if (all.kind === "collect") {
        const totals: number[] = [];
        for (let i = 0; i < (all.count ?? 6); i++) {
          const roll = await rollOnHost(all.formula, `3d6 (${methodRow.name})`);
          if (generation.current.attr !== run) return;
          totals.push(roll.total);
        }
        const scores = W.collectScores(totals, all.agg) as number[];
        setAbilities(Object.fromEntries(STATS.map((stat, index) => [stat, scores[index] ?? 0])));
        say(`${methodRow.name}: rolled ${all.count} sets of 3d6 -> ${[...totals].sort((a, b) => b - a).join(", ")}${all.agg === "keepbest6" ? "  (keeping the best six)" : "  (arrange to taste)"}`);
      } else {
        const roll = await rollOnHost(all.formula, `Abilities (${methodRow.name})`);
        if (generation.current.attr !== run) return;
        setViPool(diceOf(roll));
        setAbilities(Object.fromEntries(STATS.map((stat) => [stat, 8])));
      }
    } finally {
      if (generation.current.attr === run) setRolling("");
    }
  }
  async function rollOne(stat: string) {
    const one = methodRow.one as { kind?: string; formula?: string; agg?: string };
    if (one.kind === "viplace") {
      if (viPool.length === 0) return say("Method VI: no unplaced dice -- click Roll All to roll 7d6 first (or to start over).");
      const placed = W.placeViDie(viPool, abilities[stat] ?? 8);
      if (!placed) return say(`${titled(stat)} can't take another die without passing 18.`);
      setViPool(placed.pool);
      return setScore(stat, placed.score);
    }
    if (options.rollLock && num(abilities[stat]) > 0) return say("Character Wizard: the GM has locked ability rolls - you may only roll once.");
    setRolledAll(true);
    setRolling(stat);
    try {
      const roll = await rollOnHost(String(one.formula), `${titled(stat)} (${methodRow.name})`);
      setScore(stat, one.agg === "bestgroup" ? W.bestGroup(diceOf(roll)) : roll.total);
    } finally {
      setRolling("");
    }
  }
  async function rollPercent() {
    if (options.rollLock && rolledPct) return say("Character Wizard: the GM has locked ability rolls - you may only roll once.");
    setRolledPct(true);
    const roll = await rollOnHost("1d100", "Exceptional Strength (d100)");
    setStrPercent(roll.total <= 0 ? 100 : roll.total);
  }
  function swap(from: string, to: string) {
    if (!methodRow.arrange || from === to || !abilities[from] || !abilities[to]) return;
    setAbilities((current) => ({ ...current, [from]: current[to], [to]: current[from] }));
    if (from === "strength" || to === "strength") setStrPercent(0);
  }

  // --- Equipment ---
  const wealth = cls ? W.wealthInfo(build, options) : null;
  const spent = cart.reduce((sum, row) => sum + row.cp * row.count, 0);
  const left = gold === null ? 0 : gold - spent;
  async function rollWealth() {
    if (!wealth) return;
    const run = ++generation.current.gold;
    setRolling("gold");
    try {
      const roll = await rollOnHost(wealth.dice, `Starting wealth (${wealth.label})`);
      if (generation.current.gold !== run) return;
      setGold((roll.total + wealth.plus) * wealth.mult * 100);
    } finally {
      if (generation.current.gold === run) setRolling("");
    }
  }
  const shop = useMemo(() => (cls ? (W.starterCatalog(library.items, build) as { name: string; cost: string; cp: number; cat: string }[]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library.items, words, kit?.name, race, mode, classList.join("/")]);
  const qty = (itemName: string) => cart.find((row) => row.name === itemName)?.count ?? 0;
  const shown = shop.filter((item) => (shopType === "All" || item.cat === shopType) && item.name.toLowerCase().includes(shopSearch.trim().toLowerCase()) && (qty(item.name) > 0 || item.cp <= left));
  function buy(item: { name: string; cp: number }) {
    if (gold === null) return say("Roll your starting wealth first, then buy gear.");
    if (item.cp > left) return say("Not enough gold for that item -- pick a cheaper option.");
    setCart((current) => (current.some((row) => row.name === item.name) ? current.map((row) => (row.name === item.name ? { ...row, count: row.count + 1 } : row)) : [...current, { name: item.name, cp: item.cp, count: 1 }]));
  }
  const giveBack = (itemName: string) => setCart((current) => current.flatMap((row) => (row.name !== itemName ? [row] : row.count > 1 ? [{ ...row, count: row.count - 1 }] : [])));

  // --- Proficiencies ---
  const weaponSlots = W.weaponSlots(build);
  const nwpSlots = W.nonweaponSlots(build);
  const weaponsUsed = weapons.length + (specialize ? 1 : 0);
  const weaponList = cls ? (W.weaponCatalog(shop.filter((item) => item.cat === "Weapons").map((item) => item.name), build) as string[]) : [];
  const nwpList = cls ? (W.nwpCatalog(library.skills, build) as { name: string; data: Row | null }[]) : [];
  const nwpUsed = nwps.reduce((sum, item) => sum + W.nwpCost(item), 0);
  const languageCount = W.languageCount(abilities.intelligence);
  const known = W.raceLanguages(race) as string[];
  function toggleWeapon(weapon: string) {
    if (weapons.includes(weapon)) {
      setWeapons(weapons.filter((item) => item !== weapon));
      if (specialize === weapon) setSpecialize("");
    } else if (weaponsUsed < weaponSlots) setWeapons([...weapons, weapon]);
    else say(`No weapon slots left (${weaponSlots}).`);
  }
  function toggleSpecialize(weapon: string) {
    if (!W.canSpecialize(build) || !weapons.includes(weapon)) return;
    if (specialize === weapon) setSpecialize("");
    else if (!specialize && weaponsUsed < weaponSlots) setSpecialize(weapon);
  }
  function toggleNwp(item: string) {
    if (nwps.includes(item)) setNwps(nwps.filter((entry) => entry !== item));
    else if (nwpUsed + W.nwpCost(item) <= nwpSlots) setNwps([...nwps, item]);
    else say(`Not enough nonweapon slots for ${item}.`);
  }
  function toggleLanguage(item: string) {
    if (languages.includes(item)) setLanguages(languages.filter((entry) => entry !== item));
    else if (languages.length < languageCount) setLanguages([...languages, item]);
  }

  // --- Spells ---
  const casters = W.casterEntries(build) as { key: string; words: string; level: number; label: string }[];
  const caster = casters[Math.min(casterIndex, Math.max(0, casters.length - 1))] ?? null;
  const topSpell = (c: typeof caster) => W.maxSpellLevel(c);
  const anySpells = casters.some((c) => topSpell(c) > 0);
  const slotsAt = (c: typeof caster, n: number) => W.spellSlots(c, n, abilities.wisdom);
  const usedAt = (c: typeof caster, n: number) => spells.filter((spell) => spell.level === n && spell.caster === c?.key).length;
  const spellList = caster ? (W.spellCatalog(library.spells, caster) as { name: string; level: number; school: string; data: Row }[]) : [];
  const schools = [...new Set(spellList.flatMap((spell) => spell.school.split(/[,/]/).map((part) => part.trim()).filter(Boolean)))].sort();
  function toggleSpell(spell: { name: string; level: number }) {
    if (!caster) return;
    const mine = spells.find((entry) => entry.name === spell.name && entry.caster === caster.key);
    if (mine) return setSpells(spells.filter((entry) => entry !== mine));
    if (usedAt(caster, spell.level) >= slotsAt(caster, spell.level)) return say(`Character Wizard: your ${W.ordinal(spell.level)}-level spells are full (${slotsAt(caster, spell.level)}). Remove one to choose another.`);
    setSpells([...spells, { name: spell.name, level: spell.level, caster: caster.key }]);
  }

  // --- Commit: details, filled from the race (rolled on the host) ---
  const filling = useRef(false);
  useEffect(() => {
    if (page !== "commit" || !race || filling.current) return;
    const missing = ["gender", "age", "agemax", "height", "weight"].filter((key) => !bio[key]);
    if (missing.length === 0 && bio.size) return;
    filling.current = true;
    void (async () => {
      try {
        const next: Record<string, string> = { ...bio, size: bio.size || W.sizeOf(race) };
        for (const key of missing) {
          const dice = W.bioRoll(key, race, next.gender);
          if (!dice) continue;
          const roll = await rollOnHost(dice.formula, `${key === "agemax" ? "Maximum age" : titled(key)} (${race})`);
          next[key] = W.bioValue(key, roll.total + dice.base);
        }
        setBio((current) => ({ ...next, ...Object.fromEntries(Object.entries(current).filter(([, value]) => value)) }));
      } finally {
        filling.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, race]);
  async function rollBio(key: string) {
    const dice = W.bioRoll(key, race, bio.gender);
    if (!dice) return;
    const roll = await rollOnHost(dice.formula, key === "agemax" ? "Maximum age" : titled(key));
    setBio((current) => ({ ...current, [key]: W.bioValue(key, roll.total + dice.base) }));
  }
  async function rollAllBio() {
    for (const key of ["gender", "age", "height", "weight", "deity", "personalitytraits", "ideals", "bonds", "flaws", "appearance"]) await rollBio(key);
  }

  // --- Tabs: done or not (the extension's checks) ---
  const kitList = cls ? library.kits.filter((item) => !W.kitBlocked(item, build)).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const spellsDone = Boolean(cls) && casters.every((c) => Array.from({ length: topSpell(c) }, (_, i) => i + 1).every((n) => usedAt(c, n) >= slotsAt(c, n)));
  const done: Record<Page, boolean> = {
    abilities: allRolled,
    race: Boolean(race),
    class: Boolean(cls),
    kit: Boolean(cls) && kitChosen,
    alignment: Boolean(alignment),
    equipment: gold !== null,
    proficiencies: Boolean(cls) && weaponsUsed >= weaponSlots && nwpUsed >= nwpSlots,
    spells: spellsDone,
    commit: allRolled && Boolean(race) && Boolean(cls) && Boolean(alignment),
  };
  const pages = PAGES.filter((item) => item !== "spells" || !cls || anySpells);
  useEffect(() => {
    if (page === "spells" && cls && !anySpells) setPage("proficiencies");
  }, [page, cls, anySpells]);
  const warnings = [
    ...(allRolled ? [] : ["Roll all six ability scores."]),
    ...(race ? [] : ["Choose a race."]),
    ...(cls ? [] : ["Choose a class."]),
    ...(alignment ? [] : ["Choose an alignment."]),
    ...(gold !== null ? [] : ["Starting wealth not rolled (optional)."]),
  ];

  async function create() {
    setCreating(true);
    setError(null);
    try {
      if (pregen) {
        const id = await session.buildCharacter({ pregen, ...(name.trim() ? { name: name.trim() } : {}), ...art });
        onDone(id);
        return;
      }
      // Hit points: each class's hit die rolled on the host from 2nd level to where hit dice stop.
      const hpRolls: Record<string, number[]> = {};
      for (const entry of entries) {
        const kind = GROUPS[(CLASSES[entry.name.toLowerCase() as keyof typeof CLASSES]?.group ?? "warrior") as keyof typeof GROUPS];
        const count = Math.min(entry.level, kind.top) - 1;
        if (count <= 0) continue;
        const roll = await rollOnHost(`${count}d${kind.die}`, `Hit points ${entry.name}, levels 2-${count + 1}`);
        hpRolls[entry.name] = diceOf(roll);
      }
      const open = warnings.filter((text) => !text.includes("optional"));
      const className = mode === "multi" ? classList.join("/") : mode === "dual" ? classList[0] : cls;
      const spec = {
        wizard: true,
        name: name.trim() || "New Character",
        race: race || "Human",
        class: className || "Fighter",
        level: mode === "dual" ? entries[1]?.level ?? 1 : target,
        ...(mode === "multi" ? { levels: Object.fromEntries(entries.map((entry) => [entry.name, entry.level])) } : {}),
        ...(mode === "dual" ? { dual: { class: cls, level: W.dualFirstLevel(build) } } : {}),
        scores: { ...Object.fromEntries(STATS.map((stat) => [stat, abilities[stat] || 9])), strengthPercent: strPercent },
        hpRolls,
        alignment,
        ...(kit ? { kit: kit.name } : {}),
        gear: cart.map((row) => [row.name, row.count]),
        money: gold === null ? 0 : left / 100,
        weapons,
        ...(specialize ? { specialize } : {}),
        weaponSlots,
        nonweapon: nwps,
        languages: [...known, ...languages],
        spells: spells.map((spell) => spell.name),
        ...Object.fromEntries(W.BIO_FIELDS.filter((key: string) => key !== "notes").map((key: string) => [key, bio[key] ?? ""])),
        notes: [open.length ? `Unfinished in the character wizard (finish with your GM): ${open.join(" ")}` : "", bio.notes ?? ""].filter(Boolean).join("\n\n"),
        ...art,
      };
      const id = await session.buildCharacter(spec);
      if (open.length) session.sendChat(`${spec.name} was created unfinished: ${open.join(" ")}`, {});
      onDone(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the character.");
    } finally {
      setCreating(false);
    }
  }

  const next = pages[Math.min(pages.length - 1, pages.indexOf(page) + 1)];
  const final = (stat: string) => (abilities[stat] ? abilities[stat] + num(adjust[stat]) : null);
  const needClass = (what: string) => <p className="ccw-panel">Choose a class first - {what} depend on it.</p>;

  return (
    <section className="ccw wizard-2e" data-wizard="adnd2e" data-page={page} aria-label="AD&D 2E character wizard">
      <header className="ccw-head">
        <h2>AD&amp;D 2E Character Wizard</h2>
        <span className="ccw-head-buttons">
          <button type="button" className="wizard-next" data-wizard-next disabled={Boolean(pregen) || page === pages.at(-1)} onClick={() => setPage(next)} title={`Next: ${PAGE_LABEL[next]}`}>
            Next ›
          </button>
          <button type="button" onClick={() => onDone(null)}>
            Cancel
          </button>
        </span>
      </header>
      {library.pregens.length ? (
        <label className="wizard-2e-pregen ccw-row">
          A ready-made character from your books
          <select value={pregen} onChange={(event) => setPregen(event.target.value)} aria-label="Pregenerated character">
            <option value="">None: make my own</option>
            {library.pregens.map((item) => {
              const data = item.data as Row;
              const what = rows(data.classes).map(([, row]) => `${String(row.name)} ${num(row.level)}`).join("/");
              return (
                <option key={item.id} value={item.id}>
                  {item.name} ({String(data.race ?? "")} {what})
                </option>
              );
            })}
          </select>
        </label>
      ) : null}
      {pregen ? (
        <div className="ccw-page">
          <Plate>Pregenerated Character</Plate>
          <div className="ccw-panel ccw-details">
            <p className="hint">The character comes as the book made it: scores, hit points, gear, proficiencies. Change anything on the sheet.</p>
            <ArtChoice session={session} race={race} cls={cls} value={art} onChange={setArt} />
            <label>
              Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" placeholder="as the book has it" />
            </label>
            <button type="button" className="play-button ccw-create" data-action="wizard-finish" disabled={creating} onClick={() => void create()}>
              {creating ? "Creating…" : "Create Character"}
            </button>
            {error ? <p className="error">{error}</p> : null}
          </div>
        </div>
      ) : (
        <>
          <nav className="ccw-tabs" role="tablist">
            {pages.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={page === item} data-wizard-tab={item} data-done={done[item] ? "1" : "0"} onClick={() => setPage(item)}>
                {PAGE_LABEL[item]}
                <span className={done[item] ? "ccw-tab-badge done" : "ccw-tab-badge todo"}>{done[item] ? "✓" : "!"}</span>
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
          <div className="ccw-page" style={{ ["--ccw-art" as string]: PAGE_ART[page] ? `url(${session.wizardArtUrl(EXT, PAGE_ART[page])})` : "none" }}>
            <p className="hint">{LORE[page]}</p>

            {page === "abilities" ? (
              <>
                <Plate>Ability Scores -- {W.methodLabel(methodNow)}</Plate>
                <div className="ccw-panel">
                  <div className="ccw-row">
                    <label>
                      Method{" "}
                      <select value={methodNow} aria-label="Ability method" onChange={(event) => setMethod(Number(event.target.value))}>
                        {(W.allowedMethods(options) as number[]).map((n) => (
                          <option key={n} value={n}>
                            {W.methodLabel(n)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {options.rollLock && rolledAll ? null : (
                      <button type="button" className="ccw-button" data-action="roll-abilities" disabled={rolling === "attr"} onClick={() => void rollAll()}>
                        {rolling === "attr" ? "Rolling…" : "Roll All"}
                      </button>
                    )}
                    <span className="hint">
                      {methodNow === 6
                        ? viPool.length
                          ? `Method VI: click an ability's dice to add the largest die that fits (max 18). Unplaced dice: ${[...viPool].sort((a, b) => b - a).join("  ")}`
                          : "Method VI: every ability starts at 8. Roll All rolls 7d6; then place each die into an ability with its dice (whole die, max 18)."
                        : options.rollLock && rolledAll
                          ? "Abilities rolled. The GM has locked re-rolls."
                          : methodRow.arrange
                            ? "Click one score, then another, to swap them (or drag)."
                            : "In order: the scores stay where they fall."}
                    </span>
                  </div>
                  <div className="ccw-slots">
                    {STATS.map((stat) => (
                      <div key={stat} className="ccw-badge" data-badge={stat}>
                        <span className="ccw-badge-label">{SHORT[stat]}</span>
                        <span
                          className={`ccw-slot${picked === stat ? " picked" : ""}`}
                          data-stat={stat}
                          data-score={abilities[stat] ?? 0}
                          role="button"
                          tabIndex={0}
                          draggable={methodRow.arrange && Boolean(abilities[stat])}
                          onDragStart={(event) => event.dataTransfer.setData("text/kraken-score", stat)}
                          onDragOver={(event) => methodRow.arrange && event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            swap(event.dataTransfer.getData("text/kraken-score"), stat);
                          }}
                          onClick={() => {
                            if (!methodRow.arrange || !abilities[stat]) return;
                            if (picked && picked !== stat) {
                              swap(picked, stat);
                              setPicked(null);
                            } else setPicked(picked === stat ? null : stat);
                          }}
                        >
                          {abilities[stat] || ""}
                          {stat === "strength" && abilities.strength === 18 && strPercent ? <small>/{strPercent === 100 ? "00" : String(strPercent).padStart(2, "0")}</small> : null}
                        </span>
                        {methodRow.perAbility ? (
                          <button type="button" className="ccw-add" aria-label={`Roll ${stat}`} data-roll-one={stat} disabled={Boolean(rolling)} onClick={() => void rollOne(stat)} title={methodNow === 6 ? "Place the largest die that fits" : "Roll this ability"}>
                            ⚄
                          </button>
                        ) : null}
                        <span className="ccw-badge-mod" title="With the race's adjustment">
                          {adjust[stat] && abilities[stat] ? `${signed(adjust[stat])} = ${final(stat)}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                  {abilities.strength === 18 ? (
                    <div className="ccw-row">
                      <b data-str-percent={strPercent}>{strPercent ? `18/${strPercent === 100 ? "00" : String(strPercent).padStart(2, "0")}` : "Strength 18: roll the exceptional percentage (it counts for a warrior)."}</b>
                      {options.rollLock && rolledPct ? null : (
                        <button type="button" className="ccw-button" data-action="roll-strength-percent" onClick={() => void rollPercent()}>
                          Roll d100
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {page === "race" ? (
              race ? (
                <>
                  <Plate
                    action={
                      <button type="button" className="ccw-change" data-action="change-race" onClick={() => chooseRace("")}>
                        Change Race...
                      </button>
                    }
                  >
                    {race.toUpperCase()}
                  </Plate>
                  <div className="ccw-panel">
                    {(() => {
                      const row = RACES[raceKey(race) as keyof typeof RACES] as { adjust: Record<string, number>; movement: number; infravision: number; multi: string[] };
                      return (
                        <>
                          <p>Ability adjustments: {Object.entries(row.adjust).map(([stat, change]) => `${signed(change)} ${titled(stat)}`).join(", ") || "None"}</p>
                          <p>Movement {row.movement}; infravision {row.infravision ? `${row.infravision} feet` : "none"}.</p>
                          <p>Languages known: {known.join(", ")}</p>
                          <p>Multi-classes: {row.multi.join(", ") || "none (humans dual-class instead)"}</p>
                        </>
                      );
                    })()}
                  </div>
                  <Lore session={session} title="About this Race" top="getRaceDescTop" below="getRaceDescBelow" image="getRaceImage" args={[race]} />
                </>
              ) : (
                <>
                  <Plate>Races</Plate>
                  <div className="ccw-picklist">
                    {Object.values(RACES)
                      .filter((item) => !W.raceBlocked(item.name, abilities))
                      .map((item) => (
                        <div key={item.name} className="ccw-pick">
                          <button type="button" className="ccw-add" aria-label={`Choose ${item.name}`} data-race={item.name} onClick={() => chooseRace(item.name)}>
                            +
                          </button>
                          <span className="ccw-pick-name">{item.name}</span>
                          <span className="ccw-pick-source">{Object.entries(item.adjust as Record<string, number>).map(([stat, change]) => `${signed(change)} ${SHORT[stat]}`).join(", ") || "-"}</span>
                        </div>
                      ))}
                  </div>
                </>
              )
            ) : null}

            {page === "class" ? (
              !race ? (
                <p className="ccw-panel">Choose and confirm a race on the Race tab before selecting a class. Class choices follow PHB Table 7 for your race.</p>
              ) : cls ? (
                <>
                  <Plate
                    action={
                      <button type="button" className="ccw-change" data-action="change-class" onClick={() => chooseClass("")}>
                        Change Class...
                      </button>
                    }
                  >
                    {W.classComboLabel(build).toUpperCase()}
                  </Plate>
                  <div className="ccw-panel">
                    <div className="ccw-level">
                      <span>
                        Starting Level: <b data-start-level>{mode === "dual" ? entries[1]?.level : target}</b>
                        <button type="button" aria-label="Higher starting level" disabled={target >= W.raceClassMax(build)} onClick={() => changeLevel(target + 1)}>
                          ▲
                        </button>
                        <button type="button" aria-label="Lower starting level" disabled={target <= 1} onClick={() => changeLevel(target - 1)}>
                          ▼
                        </button>
                      </span>
                      <span className="hint">{W.levelCapText(build)}</span>
                    </div>
                    {(() => {
                      const types = W.classTypeOptions(build) as { label: string }[];
                      return types.length > 1 || mode !== "single" ? (
                        <p>
                          <label>
                            Class type:{" "}
                            <select value={W.classTypeLabel(build)} aria-label="Class type" onChange={(event) => chooseClassType(event.target.value)}>
                              {types.map((item) => (
                                <option key={item.label}>{item.label}</option>
                              ))}
                            </select>
                          </label>
                        </p>
                      ) : null;
                    })()}
                    {mode === "dual" ? (
                      <div className="ccw-level">
                        <span>
                          Levels as {cls}: <b data-dual-level>{W.dualFirstLevel(build)}</b>
                          <button type="button" aria-label="More levels in the first class" onClick={() => setDualLevel(Math.min(20, W.dualFirstLevel(build) + 1))}>
                            ▲
                          </button>
                          <button type="button" aria-label="Fewer levels in the first class" onClick={() => setDualLevel(Math.max(2, W.dualFirstLevel(build) - 1))}>
                            ▼
                          </button>
                        </span>
                        <span className="hint">Starting Level is the new class. Until it passes this level: no new hit points, old abilities cost XP.</span>
                      </div>
                    ) : null}
                    {mode === "multi" ? <p className="hint">Multi-class (PHB): experience is split between the classes; hit points are averaged; the best THAC0 and saves; the most proficiency slots.</p> : null}
                    {entries.map((entry) => {
                      const row = CLASSES[entry.name.toLowerCase() as keyof typeof CLASSES] as { group: string; prime: string[] } | undefined;
                      const kind = GROUPS[(row?.group ?? "warrior") as keyof typeof GROUPS];
                      return (
                        <p key={entry.name} data-class-info={entry.name}>
                          <b>{entry.name}</b> {entry.level}: a {row?.group}, hit die d{kind.die}; prime {(W.primeRequisites(entry.name) as string[]).map(titled).join(", ")}; needs {Object.entries(W.classMinimums(entry.name) as Record<string, number>).map(([stat, n]) => `${SHORT[stat]} ${n}`).join(", ") || "-"}
                          {entry.active ? "" : " (inactive)"}
                        </p>
                      );
                    })}
                  </div>
                  {entries.map((entry) => (
                    <Lore key={entry.name} session={session} title={entries.length > 1 ? `About the ${entry.name}` : "About this Class"} top="getClassDescTop" below="getClassDescBelow" image="getClassImage" args={[entry.name]} />
                  ))}
                </>
              ) : (
                <>
                  <Plate>Classes</Plate>
                  <div className="ccw-picklist">
                    {W.classNames()
                      .filter((item: string) => W.classAllowedForRace(item, race) && !W.classBlockedByAbilities(item, abilities, race))
                      .map((item: string) => {
                        const row = CLASSES[item.toLowerCase() as keyof typeof CLASSES] as { group: string };
                        return (
                          <div key={item} className="ccw-pick">
                            <button type="button" className="ccw-add" aria-label={`Choose ${item}`} data-class={item} onClick={() => chooseClass(item)}>
                              +
                            </button>
                            <span className="ccw-pick-name">{item}</span>
                            <span className="ccw-pick-source">
                              {titled(row.group)}, d{GROUPS[row.group as keyof typeof GROUPS].die}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </>
              )
            ) : null}

            {page === "kit" ? (
              !cls ? (
                needClass("kits available")
              ) : kitChosen ? (
                <>
                  <Plate
                    action={
                      <button
                        type="button"
                        className="ccw-change"
                        data-action="change-kit"
                        onClick={() => {
                          setKit(null);
                          setKitChosen(false);
                        }}
                      >
                        Change Kit...
                      </button>
                    }
                  >
                    {kit ? kit.name.toUpperCase() : "NO KIT"}
                  </Plate>
                  <div className="ccw-panel">
                    {kit ? (
                      <>
                        <p>Source: {kit.book || "Campaign"}</p>
                        {W.kitWeaponNote(kit) ? <p>{W.kitWeaponNote(kit)}</p> : null}
                        <p className="ccw-reading">{plain(kit.data.text) || ""}</p>
                      </>
                    ) : (
                      <p>No kit selected for this character.</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Plate>Class Kits</Plate>
                  <div className="ccw-row">
                    <button
                      type="button"
                      className="ccw-button"
                      data-action="no-kit"
                      onClick={() => {
                        setKit(null);
                        setKitChosen(true);
                        setWeapons([]);
                        setSpecialize("");
                      }}
                    >
                      No Kit
                    </button>
                  </div>
                  <div className="ccw-picklist">
                    <div className="ccw-filter">
                      <label>
                        Source
                        <select value={kitSource} onChange={(event) => setKitSource(event.target.value)} aria-label="Kit source">
                          {["(all)", ...new Set(kitList.map((item) => item.book || "Campaign"))].map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Name <input value={kitFilter} onChange={(event) => setKitFilter(event.target.value)} aria-label="Kit name filter" />
                      </label>
                    </div>
                    {kitList
                      .filter((item) => (kitSource === "(all)" || (item.book || "Campaign") === kitSource) && item.name.toLowerCase().includes(kitFilter.toLowerCase()))
                      .map((item) => (
                        <div key={`${item.name}@${item.book}`} className="ccw-pick">
                          <button
                            type="button"
                            className="ccw-add"
                            aria-label={`Choose ${item.name}`}
                            data-kit={item.name}
                            onClick={() => {
                              setKit(item);
                              setKitChosen(true);
                              setWeapons([]);
                              setSpecialize("");
                              say(`Character Wizard: kit set to '${item.name}'.`);
                            }}
                          >
                            +
                          </button>
                          <button type="button" className="ccw-pick-name" onClick={() => setReading(reading === item.name ? "" : item.name)}>
                            {item.name}
                          </button>
                          <span className="ccw-pick-source">{item.book || "Campaign"}</span>
                          {reading === item.name ? <p className="ccw-reading">{plain(item.data.text) || "No text."}</p> : null}
                        </div>
                      ))}
                    {kitList.length === 0 ? <p className="hint">No kits match your race and class in the active books. Use No Kit, or make a class handbook active.</p> : null}
                  </div>
                </>
              )
            ) : null}

            {page === "alignment" ? (
              !cls ? (
                <p className="ccw-panel">Choose and confirm a class on the Class tab before selecting an alignment. Some classes restrict alignment (Paladin, Druid, Monk).</p>
              ) : (
                <>
                  <Plate
                    action={
                      alignment ? (
                        <button type="button" className="ccw-change" data-action="change-alignment" onClick={() => setAlignment("")}>
                          Change Alignment...
                        </button>
                      ) : undefined
                    }
                  >
                    {alignment ? alignment.toUpperCase() : "Alignment"}
                  </Plate>
                  {W.alignmentHint(words) ? <p className="hint">{W.alignmentHint(words)}</p> : null}
                  {alignment ? <Lore session={session} title={alignment} top="getAlignmentDescription" args={[alignment]} /> : <Lore session={session} title="About Alignment" top="getAlignmentOverview" args={[]} />}
                  {alignment ? null : (
                    <div className="ccw-picklist">
                      {(W.alignmentOptions(words) as string[]).map((item) => (
                        <div key={item} className="ccw-pick">
                          <button
                            type="button"
                            className="ccw-add"
                            aria-label={`Choose ${item}`}
                            data-alignment={item}
                            onClick={() => {
                              setAlignment(item);
                              say(`Character Wizard: alignment set to '${item}'.`);
                            }}
                          >
                            +
                          </button>
                          <span className="ccw-pick-name">{item}</span>
                          <span />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            ) : null}

            {page === "equipment" ? (
              !alignment ? (
                <p className="ccw-panel">Choose and confirm an alignment before rolling starting funds.</p>
              ) : (
                <>
                  <Plate>Starting Equipment</Plate>
                  <div className="ccw-panel">
                    <p>
                      Starting funds (PHB): <b data-wealth-formula>{wealth?.label}</b>
                    </p>
                    <div className="ccw-row">
                      <button type="button" className="ccw-button" data-action="roll-money" disabled={rolling === "gold"} onClick={() => void rollWealth()}>
                        {rolling === "gold" ? "Rolling…" : "Roll Starting Wealth"}
                      </button>
                      <button type="button" data-action="clear-money" disabled={gold === null} onClick={() => setGold(null)}>
                        Clear Roll
                      </button>
                      <span>
                        Rolled <b className="ccw-box" data-gold={gold ?? ""}>{gold === null ? "(not rolled yet)" : `${gold / 100} gp`}</b>
                      </span>
                      <span>
                        Spent <b className="ccw-box">{W.copperText(spent)}</b>
                      </span>
                      <span>
                        Left <b className="ccw-box" data-coin-left={left}>{gold === null ? "-" : W.copperText(Math.max(0, left))}</b>
                      </span>
                    </div>
                    {wealth && W.allPriests(entries.map((entry) => entry.name)) ? <p className="hint">A priest keeps only 3 gp of what is left after shopping; the rest goes to his order.</p> : null}
                  </div>
                  <Plate
                    action={
                      cart.length ? (
                        <button type="button" className="ccw-change" data-action="clear-items" onClick={() => setCart([])}>
                          Clear
                        </button>
                      ) : undefined
                    }
                  >
                    Purchased
                  </Plate>
                  <div className="ccw-panel">
                    {cart.length === 0 ? <p className="hint">Nothing bought yet.</p> : null}
                    {cart.map((row) => (
                      <div key={row.name} className="ccw-cart-row" data-bought={row.name}>
                        <button type="button" onClick={() => giveBack(row.name)} aria-label={`Return ${row.name}`}>
                          Return
                        </button>
                        <span>
                          {row.name}
                          {row.count > 1 ? ` x${row.count}` : ""}
                        </span>
                        <span>{W.copperText(row.cp * row.count)}</span>
                      </div>
                    ))}
                  </div>
                  <Plate>Shop</Plate>
                  <div className="ccw-panel">
                    <div className="ccw-row">
                      <label>
                        Type{" "}
                        <select value={shopType} onChange={(event) => setShopType(event.target.value)} aria-label="Shop type">
                          {["All", ...W.SHOP_TYPES].map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Search <input value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} aria-label="Shop search" />
                      </label>
                    </div>
                    {gold === null ? <p className="hint">Roll your starting wealth first, then buy gear.</p> : shown.length === 0 ? <p className="hint">Nothing here that you can afford.</p> : null}
                    <div className="ccw-shop">
                      {gold === null
                        ? null
                        : shown.map((item) => (
                            <div key={item.name} className="ccw-shop-row" data-shop-item={item.name} data-category={item.cat}>
                              <button type="button" className="ccw-add" onClick={() => buy(item)} aria-label={`Buy ${item.name}`}>
                                +
                              </button>
                              <span>
                                {item.name}
                                {qty(item.name) ? <b> x{qty(item.name)}</b> : null}
                              </span>
                              <span className="hint">
                                {item.cost} · {item.cat}
                              </span>
                            </div>
                          ))}
                    </div>
                  </div>
                </>
              )
            ) : null}

            {page === "proficiencies" ? (
              !cls ? (
                needClass("your weapon and nonweapon proficiency slots")
              ) : (
                <>
                  <Plate>Weapon Proficiencies</Plate>
                  <div className="ccw-panel">
                    <p data-weapon-slots={`${weaponsUsed}/${weaponSlots}`}>
                      Weapon slots used: {weaponsUsed} / {weaponSlots} - only weapons your class and kit may use are listed
                    </p>
                    {W.kitWeaponNote(kit) ? <p className="hint">{W.kitWeaponNote(kit)}</p> : null}
                    {weaponList.length === 0 ? <p className="hint">No weapons to choose: your class and kit allow none.</p> : null}
                    {weaponList.map((weapon) => (
                      <div key={weapon} className={weapons.includes(weapon) ? "ccw-pick on" : "ccw-pick"}>
                        <input type="checkbox" checked={weapons.includes(weapon)} aria-label={`Weapon proficiency ${weapon}`} onChange={() => toggleWeapon(weapon)} />
                        <span className="ccw-pick-name">
                          {weapon}
                          {specialize === weapon ? " (specialized)" : ""}
                        </span>
                        {W.canSpecialize(build) ? (
                          <button type="button" aria-pressed={specialize === weapon} aria-label={`Specialize in ${weapon}`} disabled={!weapons.includes(weapon)} title="Fighter weapon specialization (+1 hit, +2 damage; uses 1 extra weapon slot)" onClick={() => toggleSpecialize(weapon)}>
                            Spec
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                  <Plate>Languages</Plate>
                  <div className="ccw-panel">
                    <p>Known (racial): {known.join(", ")}</p>
                    <p>
                      Extra languages (Intelligence): {languages.length} / {languageCount}
                    </p>
                    <div className="ccw-row">
                      {(W.languageCatalog(race) as string[]).map((item) => (
                        <label key={item}>
                          <input type="checkbox" checked={languages.includes(item)} aria-label={`Language ${item}`} disabled={!languages.includes(item) && languages.length >= languageCount} onChange={() => toggleLanguage(item)} /> {item}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Plate>Nonweapon Proficiencies</Plate>
                  <div className="ccw-panel">
                    <p data-nwp-slots={`${nwpUsed}/${nwpSlots}`}>
                      Nonweapon slots used: {nwpUsed} / {nwpSlots}
                    </p>
                    {nwpList.map((item) => (
                      <div key={item.name} className={nwps.includes(item.name) ? "ccw-pick on" : "ccw-pick"}>
                        <input type="checkbox" checked={nwps.includes(item.name)} aria-label={`Nonweapon proficiency ${item.name}`} onChange={() => toggleNwp(item.name)} />
                        <button type="button" className="ccw-pick-name" disabled={!item.data} onClick={() => setReading(reading === item.name ? "" : item.name)}>
                          {item.name}
                        </button>
                        <span className="ccw-pick-source">{W.nwpCost(item.name)} slot{W.nwpCost(item.name) > 1 ? "s" : ""}</span>
                        {reading === item.name && item.data ? <p className="ccw-reading">{plain(item.data.text) || "No text."}</p> : null}
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : null}

            {page === "spells" ? (
              !cls ? (
                needClass("your spells")
              ) : !caster || topSpell(caster) <= 0 ? (
                <p className="ccw-panel">This class casts no spells at the chosen level. Nothing to choose here.</p>
              ) : (
                <>
                  <Plate>Spells</Plate>
                  <div className="ccw-panel">
                    {casters.length > 1 ? (
                      <label>
                        Caster:{" "}
                        <select value={casterIndex} aria-label="Caster" onChange={(event) => setCasterIndex(Number(event.target.value))}>
                          {casters.map((item, index) => (
                            <option key={item.key} value={index}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <p>{W.spellGuidance(caster, abilities.wisdom)}</p>
                    <p>
                      Spells per level (used / available):{" "}
                      {Array.from({ length: topSpell(caster) }, (_, i) => i + 1).map((n) => (
                        <span key={n} data-spell-level={n}>
                          {" "}
                          {W.ordinal(n)} {usedAt(caster, n)}/{slotsAt(caster, n)}
                        </span>
                      ))}
                    </p>
                    <div className="ccw-row">
                      <label>
                        Level{" "}
                        <select value={spellLevel} onChange={(event) => setSpellLevel(event.target.value)} aria-label="Spell level">
                          <option value="all">All</option>
                          {Array.from({ length: topSpell(caster) }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {W.ordinal(n)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {caster.key === "wizard" || caster.key === "bard" ? "School:" : "Sphere:"}{" "}
                        <select value={spellSchool} onChange={(event) => setSpellSchool(event.target.value)} aria-label="Spell school">
                          <option value="">Any</option>
                          {schools.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Search <input value={spellSearch} onChange={(event) => setSpellSearch(event.target.value)} aria-label="Spell search" />
                      </label>
                    </div>
                    {spellList.length === 0 ? <p className="hint">No spells of your class and level in the active books.</p> : null}
                    <div className="ccw-spells">
                      {spellList
                        .filter((spell) => (spellLevel === "all" || String(spell.level) === spellLevel) && (!spellSchool || spell.school.includes(spellSchool)) && spell.name.toLowerCase().includes(spellSearch.toLowerCase()))
                        .map((spell) => (
                          <div key={spell.name} className="ccw-spell">
                            <input type="checkbox" checked={spells.some((entry) => entry.name === spell.name && entry.caster === caster.key)} aria-label={`Spell ${spell.name}`} onChange={() => toggleSpell(spell)} />
                            <span className="ccw-spell-level">{spell.level}</span>
                            <button type="button" className="ccw-pick-name" onClick={() => setReading(reading === spell.name ? "" : spell.name)}>
                              {spell.name} <small className="hint">{spell.school}</small>
                            </button>
                            {reading === spell.name ? <p className="ccw-reading">{plain(spell.data.description ?? spell.data.text) || "No text."}</p> : null}
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )
            ) : null}

            {page === "commit" ? (
              <>
                <Plate>Warnings</Plate>
                <div className="ccw-panel">
                  {warnings.length === 0 ? <p>Everything is chosen: the character is ready.</p> : <p>Still to do (you can create the character anyway; the sheet's notes will list it):</p>}
                  {warnings.map((text) => (
                    <p key={text} className="ccw-warning">
                      - {text}
                    </p>
                  ))}
                </div>
                <Plate>Details</Plate>
                <div className="ccw-panel ccw-details">
                  <ArtChoice session={session} race={race} cls={cls} value={art} onChange={setArt} />
                  <label>
                    Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" />
                  </label>
                  <p>
                    Race: {race || "-"} · Class: {W.classComboLabel(build) || "-"}
                    {kit ? ` (${kit.name})` : ""} · Alignment: {alignment || "-"}
                  </p>
                  <div className="ccw-row">
                    <button type="button" data-action="roll-details" onClick={() => void rollAllBio()} disabled={!race}>
                      Roll All Details
                    </button>
                  </div>
                  {W.BIO_FIELDS.map((key: string) => (
                    <label key={key} className={["personalitytraits", "ideals", "bonds", "flaws", "appearance", "notes"].includes(key) ? "wide" : ""}>
                      {{ agemax: "Max age", personalitytraits: "Personality", ideals: "Ideals", bonds: "Bonds", flaws: "Flaws" }[key] ?? titled(key)}{" "}
                      {key === "notes" ? <textarea value={bio[key] ?? ""} aria-label={key} onChange={(event) => setBio({ ...bio, [key]: event.target.value })} /> : <input value={bio[key] ?? ""} aria-label={key} onChange={(event) => setBio({ ...bio, [key]: event.target.value })} />}
                      {W.bioRoll(key, race, bio.gender) && race ? (
                        <button type="button" aria-label={`Roll ${key}`} onClick={() => void rollBio(key)}>
                          ⚄
                        </button>
                      ) : null}
                    </label>
                  ))}
                </div>
                <Plate>Create</Plate>
                <div className="ccw-panel">
                  <p className="ccw-plan">
                    {STATS.map((stat) => `${SHORT[stat]} ${final(stat) ?? "-"}${stat === "strength" && final(stat) === 18 && strPercent ? `/${strPercent === 100 ? "00" : String(strPercent).padStart(2, "0")}` : ""}`).join("   ")}
                  </p>
                  {gold !== null ? <p>Gold left: {W.copperText(Math.max(0, left))}</p> : null}
                  {cart.length ? <p>Items: {cart.map((row) => `${row.name}${row.count > 1 ? ` x${row.count}` : ""}`).join(", ")}</p> : null}
                  <button type="button" className="play-button ccw-create" data-action="wizard-finish" disabled={creating} onClick={() => void create()}>
                    {creating ? "Creating…" : "Create Character"}
                  </button>
                  {error ? (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
