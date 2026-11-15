import { useMemo, useState } from "react";
import { useHostRolls } from "./hostRolls";
import { priceOf } from "../../shared/shop.mjs";
import type { Session } from "../session/useSession";
import { SHORT, STAT_NAMES, STATS, TRAITS, TRAIT_NAMES } from "../../shared/cairn/rules.mjs";

type Row = Record<string, unknown>;
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const stat = (key: string) => STAT_NAMES[key as keyof typeof STAT_NAMES];
const short = (key: string) => SHORT[key as keyof typeof SHORT];

// The Cairn character wizard, the book's Character Creation in its order:
// a background (rolled d20 or chosen), a name from its list, its starting
// gear, a roll on each of its tables; STR, DEX and WIL 3d6 in order (two may
// be swapped once); Hit Protection 1d6; the traits (d10 each), a Bond (d20),
// the age (2d20+10) and, for the youngest, an Omen (d20); 3d6 gold pieces
// and the Marketplace. Every die is the host's, in chat for the table.
type Background = { id: string; name: string; names: string[]; gear: string[]; tables: { name: string; rows: { from: number; to: number; text: string }[] }[]; quote: string };
export function WizardCairn({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const backgrounds: Background[] = useMemo(
    () =>
      records
        .filter((item) => item.type === "background")
        .map((item) => ({
          id: item.id,
          name: item.name,
          names: String(item.data.names ?? "").split(",").map((name) => name.trim()).filter(Boolean),
          gear: rows(item.data.gear).map(([, line]) => String(line.text ?? "")),
          tables: rows(item.data.tables).map(([, table]) => ({ name: String(table.name ?? ""), rows: rows(table.rows).map(([, row]) => ({ from: num(row.from), to: num(row.to), text: String(row.text ?? "") })) })),
          quote: String(item.data.quote ?? ""),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records],
  );
  const tableOf = (group: string) => {
    const found = records.find((item) => item.type === "cairntable" && String(item.data.group ?? "") === group);
    return found ? rows(found.data.rows).map(([, row]) => ({ from: num(row.from), to: num(row.to), text: String(row.text ?? "") })) : [];
  };
  const lookup = (group: string, roll: number) => tableOf(group).find((row) => roll >= row.from && roll <= row.to)?.text ?? "";
  const roller = useHostRolls(session, (label) => `[CHARGEN] ${label}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [background, setBackground] = useState("");
  const [name, setName] = useState("");
  const [results, setResults] = useState<Record<number, number>>({});
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [swapA, setSwapA] = useState("str");
  const [swapB, setSwapB] = useState("dex");
  const [hp, setHp] = useState(0);
  const [traits, setTraits] = useState<Record<string, string>>({});
  const [bond, setBond] = useState("");
  const [age, setAge] = useState(0);
  const [youngest, setYoungest] = useState(false);
  const [omen, setOmen] = useState("");
  const [gold, setGold] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const chosen = backgrounds.find((item) => item.name === background);
  const roll = async (formula: string, label: string) => {
    setBusy(true);
    setProblem("");
    try {
      return (await roller(formula, label)).total;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const many = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem("");
    try {
      await work();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  // The Marketplace (gear, weapons, armor, transport: not services or hirelings), in gold pieces.
  const wares = useMemo(
    () =>
      records
        .filter((item) => item.type === "item" && !["Service", "Hireling", "Spellbook", "Relic"].includes(String(item.data.type ?? "")) && priceOf(item.data.cost) !== null)
        .map((item) => ({ name: item.name, price: (priceOf(item.data.cost) ?? 0) / 100, kind: String(item.data.type ?? "") }))
        .filter((item, index, list) => list.findIndex((other) => other.name === item.name) === index)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records],
  );
  const bonusGold = chosen ? chosen.tables.reduce((sum, table, index) => {
    const row = table.rows.find((item) => results[index] >= item.from && results[index] <= item.to);
    const match = /(?:\+\s*|take\s+|extra\s+)(\d+)\s*gp\b/i.exec(row?.text ?? "");
    return sum + (match ? Number(match[1]) : 0);
  }, 0) : 0;
  const purse = gold + bonusGold;
  const spent = Object.entries(cart).reduce((sum, [ware, count]) => sum + (wares.find((item) => item.name === ware)?.price ?? 0) * count, 0);
  const left = purse - spent;
  const tablesDone = chosen ? chosen.tables.every((_, index) => results[index]) : false;
  const ready = Boolean(chosen && tablesDone && scores && hp && gold && age && bond && TRAITS.every((key: string) => traits[key]));
  const finish = async () => {
    if (!chosen || !scores) return;
    setBusy(true);
    setProblem("");
    try {
      const id = await session.buildCharacter({ name: name || chosen.names[0] || chosen.name, background: chosen.name, attributes: scores, hp, age, gold, traits, bond, omen, results: chosen.tables.map((_, index) => ({ table: index, roll: results[index] })), buy: Object.entries(cart) });
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (backgrounds.length === 0) return <p className="hint">No backgrounds yet: the GM makes the Cairn Player's Guide active (Modules).</p>;
  return (
    <section className="wizard-5e cc-panel" aria-label="Cairn character wizard" data-wizard="cairn">
      <header className="cc-row">
        <b>New Cairn character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || !ready || left < 0} title="Every step rolled first" onClick={() => void finish()}>
          Finish
        </button>
      </header>

      <h4>1. Background</h4>
      <div className="cc-inline">
        <select value={background} aria-label="Background" onChange={(event) => (setBackground(event.target.value), setResults({}), setName(""))}>
          <option value="">Choose a background…</option>
          {backgrounds.map((item) => (
            <option key={item.id}>{item.name}</option>
          ))}
        </select>
        <button
          type="button"
          data-action="cairn-roll-background"
          disabled={busy}
          onClick={() =>
            void roll("1d20", "Background (d20)").then((total) => {
              if (!total) return;
              const picked = lookup("backgrounds", total) || backgrounds[(total - 1) % backgrounds.length].name;
              const match = backgrounds.find((item) => item.name.toLowerCase() === picked.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ")) ?? backgrounds.find((item) => item.name.replace(/[-\s]/g, "").toLowerCase() === picked.replace(/[-\s]/g, "").toLowerCase());
              if (match) {
                setBackground(match.name);
                setResults({});
                setName("");
              }
            })
          }
        >
          Roll d20
        </button>
      </div>
      {chosen ? (
        <>
          <p className="hint">{chosen.quote}</p>
          <label className="cc-inline">
            Name
            <select value={name} aria-label="Name from the background" onChange={(event) => setName(event.target.value)}>
              <option value="">Choose a name…</option>
              {chosen.names.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <input value={name} aria-label="Character name" placeholder="or your own" onChange={(event) => setName(event.target.value)} />
          </label>
          <p className="hint">Starting gear: a backpack, {chosen.gear.join(", ")}.</p>
          {chosen.tables.map((table, index) => {
            const row = table.rows.find((item) => results[index] >= item.from && results[index] <= item.to);
            return (
              <div key={table.name} className="cairn-table" data-cairn-table={index}>
                <b>{table.name}</b>{" "}
                <button type="button" data-action={`cairn-roll-table-${index}`} disabled={busy || Boolean(results[index])} onClick={() => void roll("1d6", `${chosen.name}: ${table.name}`).then((total) => total && setResults((now) => ({ ...now, [index]: total })))}>
                  {results[index] ? `Rolled ${results[index]}` : "Roll d6"}
                </button>
                {row ? <p className="hint">{row.text}</p> : null}
              </div>
            );
          })}
        </>
      ) : null}

      <h4>2. Attributes and Hit Protection</h4>
      <div className="cc-inline">
        <button
          type="button"
          data-action="cairn-roll-attributes"
          disabled={busy || Boolean(scores)}
          onClick={() =>
            void many(async () => {
              const out: Record<string, number> = {};
              for (const key of STATS as string[]) out[key] = (await roller("3d6", `${stat(key)} (3d6)`)).total;
              setScores(out);
            })
          }
        >
          Roll 3d6 in order
        </button>
        {scores
          ? (STATS as string[]).map((key) => (
              <span key={key} className="cc-box" data-wizard-score={key}>
                {short(key)} <b>{scores[key]}</b>
              </span>
            ))
          : null}
        {scores && !swapped ? (
          <span className="cc-inline" title="You may swap any two of the results">
            <select aria-label="Swap" value={swapA} onChange={(event) => setSwapA(event.target.value)}>
              {(STATS as string[]).map((key) => (
                <option key={key} value={key}>
                  {short(key)}
                </option>
              ))}
            </select>
            ↔
            <select aria-label="With" value={swapB} onChange={(event) => setSwapB(event.target.value)}>
              {(STATS as string[]).map((key) => (
                <option key={key} value={key}>
                  {short(key)}
                </option>
              ))}
            </select>
            <button type="button" data-action="cairn-swap" disabled={swapA === swapB} onClick={() => (setScores({ ...scores, [swapA]: scores[swapB], [swapB]: scores[swapA] }), setSwapped(true))}>
              Swap
            </button>
          </span>
        ) : null}
        <button type="button" data-action="cairn-roll-hp" disabled={busy || Boolean(hp)} onClick={() => void roll("1d6", "Hit Protection (1d6)").then((total) => total && setHp(total))}>
          {hp ? `HP ${hp}` : "Roll HP (1d6)"}
        </button>
      </div>

      <h4>3. Traits, Bond, Age{youngest ? ", Omen" : ""}</h4>
      <div className="cc-inline">
        <button
          type="button"
          data-action="cairn-roll-traits"
          disabled={busy || TRAITS.every((key: string) => traits[key])}
          onClick={() =>
            void many(async () => {
              const out: Record<string, string> = {};
              for (const key of TRAITS as string[]) out[key] = lookup(key, (await roller("1d10", `${TRAIT_NAMES[key as keyof typeof TRAIT_NAMES]} (d10)`)).total);
              setTraits(out);
            })
          }
        >
          Roll the traits (d10 each)
        </button>
        <button type="button" data-action="cairn-roll-bond" disabled={busy || Boolean(bond)} onClick={() => void roll("1d20", "Bond (d20)").then((total) => total && setBond(lookup("bonds", total)))}>
          Roll a Bond (d20)
        </button>
        <button type="button" data-action="cairn-roll-age" disabled={busy || Boolean(age)} onClick={() => void roll("2d20+10", "Age (2d20+10)").then((total) => total && setAge(total))}>
          {age ? `Age ${age}` : "Roll the age (2d20+10)"}
        </button>
        <label className="cc-inline" title="The youngest character rolls an Omen and reads it aloud">
          <input type="checkbox" checked={youngest} onChange={(event) => setYoungest(event.target.checked)} /> The youngest
        </label>
        {youngest ? (
          <button type="button" data-action="cairn-roll-omen" disabled={busy || Boolean(omen)} onClick={() => void roll("1d20", "Omen (d20)").then((total) => total && setOmen(lookup("omens", total)))}>
            Roll an Omen (d20)
          </button>
        ) : null}
      </div>
      {TRAITS.some((key: string) => traits[key]) ? <p className="hint" data-wizard-traits>{(TRAITS as string[]).map((key) => `${TRAIT_NAMES[key as keyof typeof TRAIT_NAMES]}: ${traits[key]}`).join(" · ")}</p> : null}
      {bond ? <p className="hint">Bond: {bond}</p> : null}
      {omen ? <p className="hint">Omen (read it aloud): {omen}</p> : null}

      <h4>4. Gold and the Marketplace</h4>
      <div className="cc-inline">
        <button type="button" data-action="cairn-roll-gold" disabled={busy || Boolean(gold)} onClick={() => void roll("3d6", "Gold pieces (3d6)").then((total) => total && setGold(total))}>
          {gold ? `${gold} gp rolled` : "Roll 3d6 gold pieces"}
        </button>
        <span>
          Purse {purse} gp{bonusGold ? ` (${bonusGold} from the background)` : ""} · spent {spent} · <b data-coin-left={left}>{left} gp left</b>
        </span>
      </div>
      <input aria-label="Shop search" placeholder="Search the Marketplace" value={search} onChange={(event) => setSearch(event.target.value)} />
      <ul className="life-shop">
        {wares
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 80)
          .map((item) => (
            <li key={item.name}>
              <span>
                {item.name} <small className="hint">{item.price} gp{item.kind ? ` · ${item.kind}` : ""}</small>
              </span>
              {cart[item.name] ? <b>x{cart[item.name]}</b> : null}
              <button type="button" aria-label={`Buy ${item.name}`} disabled={!gold || item.price > left} onClick={() => setCart({ ...cart, [item.name]: (cart[item.name] ?? 0) + 1 })}>
                Buy
              </button>
              {cart[item.name] ? (
                <button type="button" aria-label={`Return ${item.name}`} onClick={() => setCart(Object.fromEntries(Object.entries({ ...cart, [item.name]: cart[item.name] - 1 }).filter(([, count]) => count > 0)))}>
                  Return
                </button>
              ) : null}
            </li>
          ))}
      </ul>
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
