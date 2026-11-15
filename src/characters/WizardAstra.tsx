import { useMemo, useState } from "react";
import { useHostRolls } from "./Wizard2e";
import { priceOf } from "../../shared/shop.mjs";
import type { Session, TableRecord } from "../session/useSession";
import { SKILLS, SPREAD, STAT_NAMES, STATS, dm, pathTricks, signed, skillList } from "../../shared/astra/rules.mjs";

// The Apeira Astra crew wizard, moved unchanged from SheetAstra.tsx when the sheet went onto the core parts
// (shared/astra/manifest.mjs).
type Row = Record<string, unknown>;
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// The Apeira Astra crew wizard: name, Origin, a major Path (its signature
// skill and four picks) and a minor Path (two picks), the characteristics
// (the spread 10, 9, 8, 7, 6, 5 to place, or 2d6 each), the major Path's kit.
export function WizardAstra({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const of = (type: string) => records.filter((item) => item.type === type).sort((a, b) => a.name.localeCompare(b.name));
  const origins = of("race");
  const paths = of("class");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState(origins[0]?.name ?? "");
  const [major, setMajor] = useState(paths[0]?.name ?? "");
  const [minor, setMinor] = useState(paths[1]?.name ?? "");
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(STATS.map((stat: string, index: number) => [stat, SPREAD[index]])));
  const [majorSkills, setMajorSkills] = useState<string[]>([]);
  const [minorSkills, setMinorSkills] = useState<string[]>([]);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const majorRecord = paths.find((item) => item.name === major);
  const minorRecord = paths.find((item) => item.name === minor);
  const originRecord = origins.find((item) => item.name === origin);
  const listOf = (record?: TableRecord) => Object.keys(skillList(record?.data.skills)) as string[];
  const kit = (): [string, number][] => {
    const option = rows(majorRecord?.data.startingequipmentlist)[0]?.[1];
    return rows(option?.items).map(([, item]) => [String(item.name), num(item.count) || 1]);
  };
  // 2d6 each, the host's dice (in chat for the table).
  const hostRoll = useHostRolls(session);
  const [rolling, setRolling] = useState(false);
  const roll = async () => {
    setRolling(true);
    try {
      const next: Record<string, number> = {};
      for (const stat of STATS as string[]) next[stat] = (await hostRoll("2d6", `${STAT_NAMES[stat as keyof typeof STAT_NAMES]} (characteristic)`)).total;
      setScores(next);
    } finally {
      setRolling(false);
    }
  };
  // The shop: the books' gear at its price in credits, paid from the major Path's credits.
  const wares = useMemo(
    () =>
      records
        .filter((item) => item.type === "item")
        .map((item) => ({ name: item.name, price: priceOf(item.data.cost, true), kind: String(item.data.type ?? item.data.__category ?? "") }))
        .filter((item): item is { name: string; price: number; kind: string } => item.price !== null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records],
  );
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const purse = Math.round(num(majorRecord?.data.credits) + (minor && minor !== major ? num(minorRecord?.data.credits) / 2 : 0));
  const spent = Object.entries(cart).reduce((sum, [ware, count]) => sum + (wares.find((item) => item.name === ware)?.price ?? 0) * count, 0);
  const left = purse - spent;
  const finish = async () => {
    setBusy(true);
    setProblem("");
    try {
      const id = await session.buildCharacter({ name: name || "Spacer", origin, major, minor: minor === major ? "" : minor, characteristics: scores, majorSkills: majorSkills.map((key) => SKILLS[key as keyof typeof SKILLS][0]), minorSkills: minorSkills.map((key) => SKILLS[key as keyof typeof SKILLS][0]), gear: kit(), buy: Object.entries(cart) });
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (paths.length === 0) return <p className="hint">No Paths yet: the GM makes the Apeira Astra Crew Handbook active (Modules).</p>;
  const picker = (record: TableRecord | undefined, chosen: string[], set: (list: string[]) => void, count: number, tag: string) => (
    <div className="wizard-5e-skills" data-path-skills={tag}>
      {listOf(record).map((key) => (
        <label key={key}>
          <input type="checkbox" checked={chosen.includes(key)} data-astra-skill={`${tag}:${key}`} disabled={!chosen.includes(key) && chosen.length >= count} onChange={(event) => set(event.target.checked ? [...chosen, key] : chosen.filter((item) => item !== key))} />
          {SKILLS[key as keyof typeof SKILLS]?.[0]}
        </label>
      ))}
    </div>
  );
  return (
    <section className="wizard-5e cc-panel" aria-label="Apeira Astra crew wizard" data-wizard="astra">
      <header className="cc-row">
        <b>New Apeira Astra crew member</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || majorSkills.length !== 4 || (minor !== major && minorSkills.length !== 2)} title="Four skills from the major Path, two from the minor" onClick={() => void finish()}>
          Finish
        </button>
      </header>
      <div className="wizard-5e-grid">
        <label>
          Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" />
        </label>
        <label>
          Origin
          <select value={origin} onChange={(event) => setOrigin(event.target.value)} aria-label="Origin">
            {origins.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Major Path
          <select value={major} aria-label="Major Path" onChange={(event) => (setMajor(event.target.value), setMajorSkills([]))}>
            {paths.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Minor Path
          <select value={minor} aria-label="Minor Path" onChange={(event) => (setMinor(event.target.value), setMinorSkills([]))}>
            {paths.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        {originRecord ? `${origin}: ${String(originRecord.data.skills ?? "")}. ` : ""}
        {majorRecord ? `${major} gives ${String(majorRecord.data.signature ?? "")} 1, its kit and ${num(majorRecord.data.credits)} credits.` : ""}
      </p>
      <h4>
        Characteristics <small className="hint">place 10, 9, 8, 7, 6, 5, or roll 2d6 each</small>{" "}
        <button type="button" className="ghost" data-action="astra-roll" disabled={rolling} onClick={() => void roll()}>
          Roll 2d6 each
        </button>
      </h4>
      <div className="wizard-5e-scores">
        {STATS.map((stat: string) => (
          <label key={stat}>
            {STAT_NAMES[stat as keyof typeof STAT_NAMES]}
            <input type="number" min={2} max={12} value={scores[stat]} aria-label={`${stat} score`} onChange={(event) => setScores({ ...scores, [stat]: Number(event.target.value) || 7 })} />
            <small>{signed(dm(scores[stat]))}</small>
          </label>
        ))}
      </div>
      <h4>
        {major} skills <small className="hint">choose 4 ({majorSkills.length} chosen)</small>
      </h4>
      {picker(majorRecord, majorSkills, setMajorSkills, 4, "major")}
      {minor !== major ? (
        <>
          <h4>
            {minor} skills <small className="hint">choose 2 ({minorSkills.length} chosen)</small>
          </h4>
          {picker(minorRecord, minorSkills, setMinorSkills, 2, "minor")}
        </>
      ) : null}
      <p className="hint" data-wizard-tricks title="A new crew member has no Marks: the GM awards them in play, and each teaches one of these">
        Tricks to learn with Marks later:{" "}
        {[majorRecord, minor !== major ? minorRecord : undefined]
          .filter((item): item is TableRecord => Boolean(item))
          .map((item) => `${item.name}: ${(pathTricks(item.data) as { name: string }[]).map((trick) => trick.name).join(", ") || "none"}`)
          .join(" · ")}
      </p>
      <h4>
        Starting gear <small className="hint">the {major} kit, and what you buy with its credits</small>
      </h4>
      <p className="hint">Kit: {kit().map(([item, count]) => `${count > 1 ? `${count} x ` : ""}${item}`).join(", ") || "none"}</p>
      <p className="cc-inline">
        Credits {purse} · spent {spent} · <b data-coin-left={left}>{left} cr left</b>
      </p>
      <input aria-label="Shop search" placeholder="Search the shop" value={search} onChange={(event) => setSearch(event.target.value)} />
      <ul className="life-shop">
        {wares
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 60)
          .map((item) => (
            <li key={item.name}>
              <span>
                {item.name} <small className="hint">{item.price} cr{item.kind ? ` · ${item.kind}` : ""}</small>
              </span>
              {cart[item.name] ? <b>x{cart[item.name]}</b> : null}
              <button type="button" aria-label={`Buy ${item.name}`} disabled={item.price > left} onClick={() => setCart({ ...cart, [item.name]: (cart[item.name] ?? 0) + 1 })}>
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
