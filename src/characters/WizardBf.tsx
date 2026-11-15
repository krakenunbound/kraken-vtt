import { useMemo, useState } from "react";
import type { Session } from "../session/useSession";
import { useHostRolls } from "./hostRolls";
import { priceOf } from "../../shared/shop.mjs";
import * as R from "../../shared/bfrpg/rules.mjs";

type Cls = { key: string; name: string; prime?: string; die: number; parts?: string[] };
type Race = { key: string; name: string; classes: string[]; min: Record<string, number>; max: Record<string, number> };
const CLASSES = R.CLASSES as unknown as Record<string, Cls>;
const RACES = R.RACES as unknown as Record<string, Race>;
const STATS = R.STATS as string[];
const SHORT = R.SHORT as Record<string, string>;
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const signed = (n: number) => R.signed(n) as string;

// The Basic Fantasy character wizard, the book's own procedure (How to
// Create a Player Character): 3d6 for each ability in order (the host's dice,
// in chat); a race whose limits the scores meet; a class the race may take
// with its Prime Requisite of 9; the class's hit die + Constitution (at
// least 1); 3d6 x 10 gp; the shop (what the class may wear and wield); a
// Magic-User's first spell (with Read Magic); name and alignment.
export function WizardBf({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const hostRoll = useHostRolls(session, (label) => `[CHARGEN] ${label}`);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [rolling, setRolling] = useState("");
  const [race, setRace] = useState("human");
  const [cls, setCls] = useState("fighter");
  const [hpRoll, setHpRoll] = useState(0);
  const [gold, setGold] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [spell, setSpell] = useState("");
  const [name, setName] = useState("");
  const [alignment, setAlignment] = useState("Neutral");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const rolled = STATS.every((stat) => num(scores[stat]) >= 3);
  const raceProblems = rolled ? (R.raceProblems(race, scores) as string[]) : [];
  const classProblems = rolled ? (R.classProblems(cls, race, scores) as string[]) : [];
  const die = R.hitDie(cls, race) as number;
  const con = R.abilityBonus(num(scores.constitution) || 10) as number;
  const hp = hpRoll ? Math.max(1, hpRoll + con) : 0;
  const caster = R.casterOf(cls) as { kind: string } | null;
  const wares = useMemo(
    () =>
      records
        .filter((item) => item.type === "item" && !/magic/i.test(String(item.data.subtype ?? "") + String(item.data.type ?? "")))
        .map((item) => ({ name: item.name, price: priceOf(item.data.cost), kind: String(item.data.type ?? ""), data: item.data }))
        .filter((item): item is { name: string; price: number; kind: string; data: Record<string, unknown> } => item.price !== null && item.price > 0)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records],
  );
  const firstSpells = useMemo(
    () =>
      records
        .filter((item) => item.type === "spell" && num(item.data.magicuser) === 1 && item.name !== "Read Magic")
        .map((item) => item.name)
        .sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records],
  );
  const purse = gold * 100;
  const spent = Object.entries(cart).reduce((sum, [ware, count]) => sum + (wares.find((item) => item.name === ware)?.price ?? 0) * count, 0);
  const left = purse - spent;
  const money = (copper: number) => `${Math.floor(copper / 100)} gp${copper % 100 ? ` ${Math.floor((copper % 100) / 10)} sp${copper % 10 ? ` ${copper % 10} cp` : ""}` : ""}`;
  const rollAbilities = async () => {
    setRolling("abilities");
    try {
      const next: Record<string, number> = {};
      for (const stat of STATS) next[stat] = (await hostRoll("3d6", `${titled(stat)} (3d6 in order)`)).total;
      setScores(next);
    } finally {
      setRolling("");
    }
  };
  const rollHp = async () => {
    setRolling("hp");
    try {
      setHpRoll((await hostRoll(`1d${die}`, `${CLASSES[cls].name} hit die`)).total);
    } finally {
      setRolling("");
    }
  };
  const rollGold = async () => {
    setRolling("gold");
    try {
      setGold((await hostRoll("3d6", "Starting gold (3d6 x 10 gp)")).total * 10);
      setCart({});
    } finally {
      setRolling("");
    }
  };
  const ready = rolled && !raceProblems.length && !classProblems.length && hpRoll > 0 && gold > 0 && (!caster || caster.kind !== "arcane" || Boolean(spell));
  const finish = async () => {
    setBusy(true);
    setProblem("");
    try {
      const id = await session.buildCharacter({ name: name || "Adventurer", race, class: cls, abilities: scores, hpRoll, gold, buy: Object.entries(cart), spells: spell ? [spell] : [], alignment });
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const allowedClasses = RACES[race].classes;
  return (
    <section className="wizard-5e cc-panel wizard-bf" aria-label="Basic Fantasy character wizard" data-wizard="bfrpg">
      <header className="cc-row">
        <b>New Basic Fantasy character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || !ready} title={ready ? "Make the character" : "Roll the abilities, the hit die and the gold; a race and class the scores allow; a Magic-User's first spell"} onClick={() => void finish()}>
          Finish
        </button>
      </header>

      <h4>
        1. Abilities <small className="hint">3d6 for each, in order; the GM may allow exchanging scores (type them)</small>{" "}
        <button type="button" className="ghost" data-action="roll-abilities" disabled={Boolean(rolling)} onClick={() => void rollAbilities()}>
          {rolled ? "Roll again" : "Roll 3d6 in order"}
        </button>
      </h4>
      <div className="wizard-5e-scores">
        {STATS.map((stat) => (
          <label key={stat}>
            {SHORT[stat]}
            <input type="number" min={3} max={18} value={scores[stat] ?? ""} aria-label={`${stat} score`} data-score={stat} onChange={(event) => setScores({ ...scores, [stat]: Math.max(3, Math.min(18, Number(event.target.value) || 3)) })} />
            <small>{scores[stat] ? signed(R.abilityBonus(scores[stat]) as number) : ""}</small>
          </label>
        ))}
      </div>

      <div className="wizard-5e-grid">
        <label>
          2. Race
          <select value={race} aria-label="Race" onChange={(event) => setRace(event.target.value)}>
            {(R.RACE_ORDER as string[]).map((key) => {
              const why = rolled ? (R.raceProblems(key, scores) as string[]) : [];
              return (
                <option key={key} value={key} disabled={why.length > 0}>
                  {RACES[key].name}
                  {why.length ? ` (${why[0]})` : ""}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          3. Class
          <select value={cls} aria-label="Class" onChange={(event) => (setCls(event.target.value), setHpRoll(0), setCart({}))}>
            {(R.CLASS_ORDER as string[]).map((key) => {
              const why = R.classProblems(key, race, rolled ? scores : Object.fromEntries(STATS.map((stat) => [stat, 18]))) as string[];
              return (
                <option key={key} value={key} disabled={why.length > 0 || !allowedClasses.includes(key)}>
                  {CLASSES[key].name}
                  {why.length ? ` (${why[0]})` : ""}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          Alignment
          <select value={alignment} aria-label="Alignment" onChange={(event) => setAlignment(event.target.value)}>
            {(R.ALIGNMENTS as string[]).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" />
        </label>
      </div>
      {[...raceProblems, ...classProblems].map((text) => (
        <p key={text} className="error" data-problem>
          {text}
        </p>
      ))}

      <h4>
        4. Hit points <small className="hint">the {CLASSES[cls].name}'s d{die} + Constitution ({signed(con)}), at least 1</small>{" "}
        <button type="button" className="ghost" data-action="roll-hp" disabled={Boolean(rolling) || !rolled} onClick={() => void rollHp()}>
          Roll d{die}
        </button>{" "}
        {hpRoll ? <b data-hp={hp}>{hp} hit points</b> : null}
      </h4>

      {caster?.kind === "arcane" ? (
        <label className="cc-inline">
          5. First spell <small className="hint">a Magic-User knows Read Magic and one more 1st-level spell (the GM may choose it)</small>
          <select value={spell} aria-label="First spell" onChange={(event) => setSpell(event.target.value)}>
            <option value="">Choose…</option>
            {firstSpells.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      ) : null}

      <h4>
        6. Money and equipment <small className="hint">3d6 x 10 gp; buy what the class and race may use</small>{" "}
        <button type="button" className="ghost" data-action="roll-gold" disabled={Boolean(rolling)} onClick={() => void rollGold()}>
          {gold ? "Roll again" : "Roll 3d6 x 10 gp"}
        </button>
      </h4>
      <p className="cc-inline">
        Gold {gold} gp · spent {money(spent)} · <b data-coin-left={left}>{money(Math.max(0, left))} left</b>
      </p>
      {Object.keys(cart).length ? (
        <p className="hint" data-cart>
          Bought: {Object.entries(cart).map(([item, count]) => `${count > 1 ? `${count} x ` : ""}${item}`).join(", ")}
        </p>
      ) : null}
      <input aria-label="Shop search" placeholder="Search the equipment" value={search} onChange={(event) => setSearch(event.target.value)} />
      <ul className="life-shop">
        {wares
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 80)
          .map((item) => {
            const why = R.itemProblem(item.data, cls, race) as string;
            return (
              <li key={item.name} title={why || undefined}>
                <span>
                  {item.name} <small className="hint">{money(item.price)} · {item.kind}{why ? ` · ${why}` : ""}</small>
                </span>
                {cart[item.name] ? <b>x{cart[item.name]}</b> : null}
                <button type="button" aria-label={`Buy ${item.name}`} disabled={!gold || item.price > left || Boolean(why)} onClick={() => setCart({ ...cart, [item.name]: (cart[item.name] ?? 0) + 1 })}>
                  Buy
                </button>
                {cart[item.name] ? (
                  <button type="button" aria-label={`Return ${item.name}`} onClick={() => setCart(Object.fromEntries(Object.entries({ ...cart, [item.name]: cart[item.name] - 1 }).filter(([, count]) => count > 0)))}>
                    Return
                  </button>
                ) : null}
              </li>
            );
          })}
      </ul>
      {wares.length === 0 ? <p className="hint">No equipment yet: the GM makes the Basic Fantasy Player's Handbook active (Modules).</p> : null}
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
