import { useEffect, useMemo, useRef, useState } from "react";
import type { RollResult, Session } from "../session/useSession";
import { STATS, abilityBonus, levelGain, parseCost, spellChoices, spellPicksAllowed, CORE_BOOK } from "./siege";

// Character creation for SIEGE games (Castles & Crusades), after the SC C&C
// wizard in Fantasy Grounds: pages in any order, each with a badge ("!" while
// it needs something, a check when done), dice rolled by the host so the
// table sees them, and the finished character built by the host from a spec
// (shared/siege/builder.mjs), the same way an agent builds one.

type Row = Record<string, unknown>;
type Stat = (typeof STATS)[number];
type Method = "3d6-arrange" | "4d6-drop" | "3d6-order";

const SHORT: Record<string, string> = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const METHODS: { id: Method; label: string; formula: string; arrange: boolean }[] = [
  { id: "3d6-arrange", label: "3d6, arrange as you like (Player's Handbook)", formula: "3d6", arrange: true },
  { id: "4d6-drop", label: "4d6 drop lowest, arrange", formula: "4d6dl1", arrange: true },
  { id: "3d6-order", label: "3d6 in order", formula: "3d6", arrange: false },
];
const PAGES = ["abilities", "race", "class", "primes", "hp", "equipment", "spells", "finish"] as const;
type Page = (typeof PAGES)[number];
const PAGE_LABEL: Record<Page, string> = {
  abilities: "Abilities",
  race: "Race",
  class: "Class",
  primes: "Primes",
  hp: "Hit Points",
  equipment: "Equipment",
  spells: "Spells",
  finish: "Finish",
};
const DETAILS = ["alignment", "deity", "gender", "age", "height", "weight"] as const;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function isCore(row: Row): boolean {
  return String(row.fgPath ?? "").endsWith(`@${CORE_BOOK}`);
}

// A race class of the Adventurer's Backpack ("Dwarf, Iron Born") is only for its race.
function raceClassRace(name: string, races: Row[]): string | null {
  const prefix = name.includes(",") ? name.split(",")[0].trim().toLowerCase() : "";
  if (!prefix) return null;
  return races.some((race) => String(race.name).toLowerCase().replace(/\s*\(.*$/, "") === prefix) ? prefix : null;
}

// Waits for the host's answer to a roll this window asked for.
function useHostRolls(session: Session) {
  const waiting = useRef(new Map<string, (roll: RollResult) => void>());
  const seen = useRef(0);
  useEffect(() => {
    const lines = session.chat;
    for (const line of lines.slice(Math.max(0, seen.current - 1))) {
      const tag = line.roll?.tag;
      const done = tag ? waiting.current.get(tag) : undefined;
      if (tag && done && line.roll) {
        waiting.current.delete(tag);
        done(line.roll);
      }
    }
    seen.current = lines.length;
  }, [session.chat]);
  return (formula: string, label: string) =>
    new Promise<RollResult>((resolve) => {
      const tag = `wiz-${Math.random().toString(36).slice(2)}`;
      waiting.current.set(tag, resolve);
      session.roll(formula, label, tag);
    });
}

export function Wizard({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const rollOnHost = useHostRolls(session);
  const records = Object.values(session.records);
  const library = useMemo(() => {
    const data = (type: string) => records.filter((record) => record.type === type).map((record) => record.data as Row);
    return { packages: data("siegepackage"), items: data("item"), powers: data("siegepower"), game: data("siegegame")[0] };
    // The books change only on import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records.length]);
  const races = library.packages.filter((pkg) => String(pkg.packagetype).toLowerCase() === "race").sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classes = library.packages.filter((pkg) => String(pkg.packagetype).toLowerCase() === "class").sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const [page, setPage] = useState<Page>("abilities");
  const [method, setMethod] = useState<Method>("3d6-arrange");
  const [base, setBase] = useState<Partial<Record<Stat, number>>>({});
  const [swapFrom, setSwapFrom] = useState<Stat | null>(null);
  const [rolling, setRolling] = useState(false);
  const [raceName, setRaceName] = useState("");
  const [className, setClassName] = useState("");
  const [level, setLevel] = useState(1);
  const [chosenPrimes, setChosenPrimes] = useState<Stat[]>([]);
  const [hp, setHp] = useState<number[]>([]);
  const [gold, setGold] = useState<number | null>(null);
  const [cart, setCart] = useState<{ name: string; cost: number; count: number }[]>([]);
  const [shopType, setShopType] = useState("all");
  const [shopSearch, setShopSearch] = useState("");
  const [spells, setSpells] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, string>>({ name: "" });
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const race = races.find((row) => row.name === raceName) ?? null;
  const cls = classes.find((row) => row.name === className) ?? null;
  const raceMod = (stat: Stat) => num((race?.attrmods as Row | undefined)?.[stat]);
  const final = (stat: Stat) => (base[stat] === undefined ? null : (base[stat] as number) + raceMod(stat));
  const finalOr10 = (stat: string) => final(stat as Stat) ?? 10;
  const allRolled = STATS.every((stat) => base[stat as Stat] !== undefined);
  const forcedPrimes = STATS.filter((stat) => num((cls?.primes as Row | undefined)?.[stat]) === 1) as Stat[];
  const primesAllowed = forcedPrimes.length + num(cls?.primechoice) + num(race?.primechoice);
  const primes = new Set<Stat>([...forcedPrimes, ...chosenPrimes.filter((stat) => !forcedPrimes.includes(stat))]);
  const con = abilityBonus(finalOr10("constitution"), library.game);
  const hpTotal = hp.reduce((a, b) => a + b, 0);
  const spent = cart.reduce((sum, entry) => sum + entry.cost * entry.count, 0);
  const left = gold === null ? 0 : gold * 100 - spent;
  const maxLevel = cls ? Math.max(1, ...Object.values((cls.levels as Row) ?? {}).map((row) => num((row as Row).level))) : 1;
  const day = cls ? (spellPicksAllowed(cls, level, finalOr10) as Record<string, number>) : {};
  const castsSpells = Boolean(cls?.spellclass) && Object.values(day).some((count) => count > 0);
  const choices = castsSpells && cls ? (spellChoices(library.powers, cls, day) as { power: Row; level: number }[]) : [];
  const picksAt = (n: number) => choices.filter((choice) => choice.level === n && spells.includes(String(choice.power.name))).length;

  // A class that no longer fits the race, or changes to the build that the
  // rolled hit points depended on, clear what follows from them.
  const hpSignature = `${className}|${level}|${con}`;
  const lastSignature = useRef(hpSignature);
  useEffect(() => {
    if (lastSignature.current !== hpSignature) {
      lastSignature.current = hpSignature;
      setHp([]);
    }
  }, [hpSignature]);
  useEffect(() => {
    setSpells([]);
  }, [className, level]);

  function classBlocked(row: Row): string | null {
    const only = raceClassRace(String(row.name), races);
    if (only && !String(race?.name ?? "").toLowerCase().startsWith(only)) return `Only for ${only[0].toUpperCase()}${only.slice(1)} characters`;
    return null;
  }

  async function rollAbilities() {
    setRolling(true);
    setError(null);
    try {
      const formula = METHODS.find((item) => item.id === method)?.formula ?? "3d6";
      const next: Partial<Record<Stat, number>> = {};
      for (const stat of STATS as readonly Stat[]) {
        const roll = await rollOnHost(formula, method === "3d6-order" ? `Wizard: ${stat}` : "Wizard: attribute");
        next[stat] = roll.total;
      }
      setBase(next);
    } finally {
      setRolling(false);
    }
  }

  function clickStat(stat: Stat) {
    if (!METHODS.find((item) => item.id === method)?.arrange || !allRolled) return;
    if (!swapFrom) {
      setSwapFrom(stat);
      return;
    }
    if (swapFrom !== stat) setBase((current) => ({ ...current, [swapFrom]: current[stat], [stat]: current[swapFrom] }));
    setSwapFrom(null);
  }

  async function rollHitPoints() {
    if (!cls) return;
    const gains: number[] = [];
    for (let n = 1; n <= level; n += 1) {
      const { dice, flat } = levelGain(cls, n) as { dice: string[]; flat: number };
      if (dice.length === 0) {
        gains.push(flat);
        continue;
      }
      const counts = new Map<string, number>();
      for (const die of dice) counts.set(die, (counts.get(die) ?? 0) + 1);
      const formula = [...counts].map(([die, count]) => `${count}${die}`).join("+") + (flat + con !== 0 ? signed(flat + con) : "");
      const roll = await rollOnHost(formula, `Wizard: ${className} level ${n} hit points`);
      gains.push(Math.max(1, roll.total));
    }
    setHp(gains);
  }

  async function rollGold() {
    if (!cls) return;
    const match = /^(\d*d\d+)(?:x(\d+))?$/i.exec(String(cls.startgold ?? "").replace(/\s+/g, ""));
    if (!match) {
      setGold(0);
      return;
    }
    const roll = await rollOnHost(match[1], `Wizard: starting coin (${String(cls.startgold)})`);
    setCart([]);
    setGold(roll.total * (Number(match[2]) || 1));
  }

  // The shop: priced, mundane items, one per name (the Player's Handbook's first).
  const shop = useMemo(() => {
    const byName = new Map<string, Row>();
    for (const item of library.items) {
      const name = String(item.name ?? "");
      if (!name || parseCost(item.cost) === null || /[+-]\s*\d/.test(name) || /\(Template\)/i.test(name)) continue;
      const held = byName.get(name);
      if (held && (isCore(held) || !isCore(item))) continue;
      byName.set(name, item);
    }
    return [...byName.values()].sort((a, b) => String(a.type).localeCompare(String(b.type)) || String(a.name).localeCompare(String(b.name)));
  }, [library.items]);
  const shopTypes = [...new Set(shop.map((item) => String(item.type || "Other")))].sort();
  const shown = shop
    .filter((item) => (shopType === "all" || String(item.type || "Other") === shopType) && String(item.name).toLowerCase().includes(shopSearch.toLowerCase()))
    .filter((item) => (parseCost(item.cost) ?? Infinity) <= left)
    .slice(0, 200);

  function buy(item: Row) {
    const cost = parseCost(item.cost) ?? 0;
    if (gold === null || cost > left) return;
    setCart((current) => {
      const held = current.find((entry) => entry.name === item.name);
      if (held) return current.map((entry) => (entry === held ? { ...entry, count: entry.count + 1 } : entry));
      return [...current, { name: String(item.name), cost, count: 1 }];
    });
  }

  function unbuy(name: string) {
    setCart((current) => current.flatMap((entry) => (entry.name !== name ? [entry] : entry.count > 1 ? [{ ...entry, count: entry.count - 1 }] : [])));
  }

  function toggleSpell(name: string, at: number) {
    setSpells((current) => {
      if (current.includes(name)) return current.filter((item) => item !== name);
      if (picksAt(at) >= (day[at] ?? 0)) return current;
      return [...current, name];
    });
  }

  const alerts: Record<Page, string[]> = {
    abilities: allRolled ? [] : ["Roll your attributes."],
    race: race ? [] : ["Choose a race."],
    class: !race ? ["Choose your race first."] : !cls ? ["Choose a class."] : classBlocked(cls) ? [String(classBlocked(cls))] : [],
    primes: !cls ? ["Choose a class first."] : primes.size !== primesAllowed ? [`Primes chosen ${primes.size} of ${primesAllowed}.`] : [],
    hp: !cls ? ["Choose a class first."] : hp.length !== level ? ["Roll hit points."] : [],
    equipment: gold === null ? ["Roll starting coin."] : [],
    spells: castsSpells && Object.entries(day).some(([n, count]) => picksAt(Number(n)) < count) ? ["Choose a spell for every daily slot."] : [],
    finish: details.name?.trim() ? [] : ["Name your character."],
  };
  const warnings = PAGES.flatMap((name) => alerts[name].map((text) => `${PAGE_LABEL[name]}: ${text}`));

  async function create() {
    setCreating(true);
    setError(null);
    try {
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
        ...Object.fromEntries([...DETAILS, "appearance", "notes"].map((key) => [key, details[key] ?? ""])),
        notes: [warnings.length > 0 ? `Still to choose: ${warnings.join("; ")}` : "", details.notes ?? ""].filter(Boolean).join("\n\n"),
      };
      const id = await session.buildCharacter(spec);
      onDone(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the character.");
    } finally {
      setCreating(false);
    }
  }

  if (library.packages.length === 0) {
    return (
      <section className="wizard">
        <h2>Create a character</h2>
        <p className="hint">This campaign has no game books yet. The GM makes them active first: Books, Activation, then the Player's Handbook (and the Adventurer's Backpack for more classes).</p>
        <button type="button" onClick={() => onDone(null)}>
          Close
        </button>
      </section>
    );
  }

  return (
    <section className="wizard" data-page={page}>
      <header className="wizard-head">
        <h2>Create a character</h2>
        <button type="button" onClick={() => onDone(null)}>
          Cancel
        </button>
      </header>
      <nav className="wizard-tabs" role="tablist">
        {PAGES.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={page === name} data-wizard-tab={name} onClick={() => setPage(name)}>
            {PAGE_LABEL[name]}
            <span className={alerts[name].length > 0 ? "badge todo" : "badge done"}>{alerts[name].length > 0 ? "!" : "✓"}</span>
          </button>
        ))}
      </nav>

      {page === "abilities" ? (
        <div className="wizard-page">
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
          <button type="button" onClick={() => void rollAbilities()} disabled={rolling} data-action="roll-abilities">
            {rolling ? "Rolling…" : allRolled ? "Roll again" : "Roll all"}
          </button>
          <p className="hint">{METHODS.find((item) => item.id === method)?.arrange ? "Click one attribute, then another, to swap their scores." : "Scores stay in the order rolled."}</p>
          <div className="wizard-stats">
            {(STATS as readonly Stat[]).map((stat) => (
              <button key={stat} type="button" className={swapFrom === stat ? "stat picked" : "stat"} data-stat={stat} onClick={() => clickStat(stat)}>
                <span>{SHORT[stat]}</span>
                <b data-final={stat}>{final(stat) ?? "—"}</b>
                <span>{final(stat) === null ? "" : signed(abilityBonus(final(stat), library.game))}</span>
                <span className="hint">
                  base {base[stat] ?? "—"}
                  {raceMod(stat) ? ` ${signed(raceMod(stat))} race` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {page === "race" ? (
        <div className="wizard-page">
          <ul className="pick-list">
            {races.map((row) => (
              <li key={String(row.fgPath)}>
                <button type="button" className={row.name === raceName ? "selected" : ""} onClick={() => setRaceName(String(row.name))} data-race={String(row.name)}>
                  <b>{String(row.name)}</b>
                  <span className="hint">
                    {Object.entries((row.attrmods as Row) ?? {})
                      .map(([stat, mod]) => `${SHORT[stat] ?? stat} ${signed(num(mod))}`)
                      .join(", ") || "no attribute changes"}
                    {row.speed ? ` · ${String(row.speed)}` : ""}
                    {num(row.primechoice) ? ` · +${num(row.primechoice)} prime` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {page === "class" ? (
        <div className="wizard-page">
          {!race ? <p className="hint">Choose your race first.</p> : null}
          <ul className="pick-list">
            {classes.map((row) => {
              const blocked = classBlocked(row);
              const prime = (STATS as readonly string[]).filter((stat) => num((row.primes as Row | undefined)?.[stat]) === 1).map((stat) => SHORT[stat]);
              return (
                <li key={String(row.fgPath)}>
                  <button
                    type="button"
                    className={row.name === className ? "selected" : ""}
                    disabled={!race || Boolean(blocked)}
                    title={blocked ?? ""}
                    onClick={() => {
                      setClassName(String(row.name));
                      setLevel(1);
                    }}
                    data-class={String(row.name)}
                  >
                    <b>{String(row.name)}</b>
                    <span className="hint">
                      {blocked ?? `prime ${prime.join(", ") || "—"} · ${String(row.hitdie ?? "")} · coin ${String(row.startgold ?? "—")}${row.spellclass ? ` · casts ${String(row.spellclass)} spells` : ""}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {cls ? (
            <label className="level-box">
              Starting level{" "}
              <input type="number" min={1} max={maxLevel} value={level} onChange={(event) => setLevel(Math.min(maxLevel, Math.max(1, Number(event.target.value) || 1)))} aria-label="Starting level" />
            </label>
          ) : null}
        </div>
      ) : null}

      {page === "primes" ? (
        <div className="wizard-page">
          <p>
            Primes chosen {primes.size} of {primesAllowed}. The class's prime is fixed; tick the others your race and class allow.
          </p>
          <div className="wizard-stats">
            {(STATS as readonly Stat[]).map((stat) => {
              const forced = forcedPrimes.includes(stat);
              const on = primes.has(stat);
              return (
                <label key={stat} className={on ? "stat picked" : "stat"}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={forced || (!on && primes.size >= primesAllowed)}
                    onChange={(event) => setChosenPrimes((current) => (event.target.checked ? [...current, stat] : current.filter((item) => item !== stat)))}
                    aria-label={`${stat} prime`}
                  />
                  <span>{SHORT[stat]}</span>
                  <b>{final(stat) ?? "—"}</b>
                  <span className="hint">{forced ? "from your class" : ""}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      {page === "hp" ? (
        <div className="wizard-page">
          {cls ? (
            <>
              <p>
                {String(cls.hitdie ?? "")} per level, Constitution {signed(con)}, at least 1 a level.
              </p>
              <button type="button" onClick={() => void rollHitPoints()} data-action="roll-hp">
                {hp.length === level ? "Roll again" : "Roll hit points"}
              </button>
              <p data-hp-total={hpTotal}>{hp.length === level ? `Hit points ${hpTotal} (${hp.join(" + ")})` : "Not rolled yet."}</p>
            </>
          ) : (
            <p className="hint">Choose a class first.</p>
          )}
        </div>
      ) : null}

      {page === "equipment" ? (
        <div className="wizard-page equipment">
          <div>
            <button type="button" onClick={() => void rollGold()} disabled={!cls} data-action="roll-gold">
              {gold === null ? `Roll starting coin (${String(cls?.startgold ?? "—")})` : "Roll again (returns purchases)"}
            </button>
            <p data-coin-left={left}>{gold === null ? "No coin yet." : `Coin ${gold} gp; left ${Math.floor(left / 100)} gp ${Math.floor((left % 100) / 10)} sp ${left % 10} cp.`}</p>
            <h3>Purchased</h3>
            <ul className="sheet-list">
              {cart.map((entry) => (
                <li key={entry.name}>
                  <span>
                    {entry.count > 1 ? `${entry.count} × ` : ""}
                    {entry.name}
                  </span>
                  <button type="button" onClick={() => unbuy(entry.name)} aria-label={`Return ${entry.name}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Shop</h3>
            <div className="shop-filters">
              <select value={shopType} onChange={(event) => setShopType(event.target.value)} aria-label="Shop category">
                <option value="all">All</option>
                {shopTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input placeholder="Search" value={shopSearch} onChange={(event) => setShopSearch(event.target.value)} aria-label="Shop search" />
            </div>
            {gold === null ? <p className="hint">Roll starting coin to shop.</p> : null}
            <ul className="sheet-list shop">
              {gold === null
                ? null
                : shown.map((item) => (
                    <li key={String(item.fgPath)}>
                      <span>{String(item.name)}</span>
                      <span className="hint">{String(item.cost)}</span>
                      <button type="button" onClick={() => buy(item)} aria-label={`Buy ${String(item.name)}`}>
                        Buy
                      </button>
                    </li>
                  ))}
            </ul>
          </div>
        </div>
      ) : null}

      {page === "spells" ? (
        <div className="wizard-page">
          {!castsSpells ? <p className="hint">{cls ? "This class casts no spells at this level." : "Choose a class first."}</p> : null}
          {Object.entries(day)
            .filter(([, count]) => count > 0)
            .map(([n, count]) => (
              <section key={n}>
                <h3>
                  {n === "0" ? "0-level" : `Level ${n}`}: {picksAt(Number(n))} of {count}
                </h3>
                <div className="spell-grid">
                  {choices
                    .filter((choice) => choice.level === Number(n))
                    .map((choice) => {
                      const name = String(choice.power.name);
                      const on = spells.includes(name);
                      return (
                        <label key={name} className={on ? "spell picked" : "spell"}>
                          <input type="checkbox" checked={on} disabled={!on && picksAt(Number(n)) >= count} onChange={() => toggleSpell(name, Number(n))} aria-label={`Spell ${name}`} />
                          {name}
                        </label>
                      );
                    })}
                </div>
              </section>
            ))}
        </div>
      ) : null}

      {page === "finish" ? (
        <div className="wizard-page finish">
          <div className="details">
            <label>
              Name <input value={details.name ?? ""} onChange={(event) => setDetails({ ...details, name: event.target.value })} aria-label="Character name" />
            </label>
            {DETAILS.map((key) => (
              <label key={key}>
                {key[0].toUpperCase() + key.slice(1)}{" "}
                <input value={details[key] ?? ""} onChange={(event) => setDetails({ ...details, [key]: event.target.value })} aria-label={key} />
              </label>
            ))}
            <label>
              Appearance <textarea value={details.appearance ?? ""} onChange={(event) => setDetails({ ...details, appearance: event.target.value })} />
            </label>
            <label>
              Notes <textarea value={details.notes ?? ""} onChange={(event) => setDetails({ ...details, notes: event.target.value })} />
            </label>
          </div>
          <div>
            <h3>Summary</h3>
            <p>
              {race ? String(race.name) : "No race"} {cls ? `${String(cls.name)} ${level}` : "no class"} · HP {hpTotal || "—"} · coin left {Math.floor(left / 100)} gp
            </p>
            <p className="hint">
              {(STATS as readonly Stat[]).map((stat) => `${SHORT[stat]} ${final(stat) ?? "—"}${primes.has(stat) ? "P" : ""}`).join("  ")}
            </p>
            <h3>Warnings</h3>
            {warnings.length === 0 ? <p className="hint">Everything is chosen.</p> : null}
            <ul className="warnings">
              {warnings.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <p className="hint">You can create the character now; anything still open goes into its notes.</p>
            <button type="button" className="play-button" onClick={() => void create()} disabled={creating || !cls} data-action="create-character">
              {creating ? "Creating…" : "Create character"}
            </button>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <footer className="wizard-foot">
        <button type="button" disabled={page === PAGES[0]} onClick={() => setPage(PAGES[Math.max(0, PAGES.indexOf(page) - 1)])}>
          Back
        </button>
        <button type="button" disabled={page === PAGES[PAGES.length - 1]} onClick={() => setPage(PAGES[Math.min(PAGES.length - 1, PAGES.indexOf(page) + 1)])}>
          Next
        </button>
      </footer>
    </section>
  );
}
