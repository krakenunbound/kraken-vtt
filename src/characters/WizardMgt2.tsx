import { useEffect, useRef, useState } from "react";
import type { Session } from "../session/useSession";
import { ARMOUR, SHORT, STATS, STAT_NAMES, WEAPONS, dm, signed, skillName, uppOf } from "../../shared/mgt2/rules.mjs";

// The Traveller wizard: the game's lifepath. The host rolls every die
// (shared/mgt2/lifepath.mjs, electron/mgt2.cjs); this asks the questions it
// asks (how to arrange the characteristics, background skills, a university
// or an academy, a career and assignment, a skill table, a commission,
// another term, cash or benefits...), shows what happened, and at the end
// names the Traveller and takes the weapons and armour the benefits gave.

type Pending = {
  kind: "arrange" | "pick" | "choose" | "career";
  text?: string;
  error?: string;
  values?: number[];
  stats?: string[];
  count?: number;
  options?: string[];
  tables?: { name: string; rows: string[] }[];
  careers?: { name: string; desc: string; qualification: string; assignments: { key: string; name: string; desc: string }[] }[];
};
type Life = {
  name: string;
  pending: Pending | null;
  log: string[];
  stats: Record<string, number> | null;
  skills: Record<string, number>;
  age: number;
  terms: number;
  careers: { career: string; assignment: string; terms: number; rank: number; officer: boolean; title?: string }[];
  current: { career: string; term: number; rank: number; officer: boolean } | null;
  cash: number;
  benefits: string[];
  connections: { contacts: number; allies: number; rivals: number; enemies: number };
  items: string[];
  done: boolean;
};
type StatKey = keyof typeof STAT_NAMES;

export function WizardMgt2({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const [life, setLife] = useState<Life | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (body: Parameters<Session["lifeAction"]>[0]) => {
    setBusy(true);
    setProblem("");
    try {
      const result = await session.lifeAction(body);
      if (body.action === "build") {
        onDone(result.id || null);
        return;
      }
      setLife((result.life as Life) ?? null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  // A lifepath under way (the wizard closed halfway) carries on.
  useEffect(() => {
    void session
      .lifeAction({ action: "state" })
      .then((result) => setLife((result.life as Life) ?? null))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [session.lifeAction]);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [life?.log.length]);

  const header = (
    <header className="cc-row">
      <b>New Traveller: the lifepath</b>
      <span className="me-spacer" />
      {life ? (
        <button type="button" className="ghost" data-action="life-restart" disabled={busy} onClick={() => void act({ action: "cancel" }).then(() => setLife(null))}>
          Start over
        </button>
      ) : null}
      <button type="button" className="ghost" onClick={() => onDone(null)}>
        Close
      </button>
    </header>
  );
  if (!loaded) return <section className="wizard-5e cc-panel" data-wizard="mgt2">{header}</section>;
  if (!life)
    return (
      <section className="wizard-5e cc-panel wizard-mgt2" aria-label="Traveller wizard" data-wizard="mgt2">
        {header}
        <p className="hint">
          A Traveller is made the game's way: six characteristics rolled on 2D, background skills, perhaps a university or an academy, then careers term by term (qualifying, training, surviving, events, promotions, growing older) and the benefits you muster out with. Every roll is the
          table's.
        </p>
        <p className="cc-inline">
          Name <input value={name} aria-label="Character name" onChange={(event) => setName(event.target.value)} />
          <button type="button" data-action="life-start" disabled={busy} onClick={() => void act({ action: "start", name: name || "Traveller" })}>
            Roll the characteristics
          </button>
        </p>
        {problem ? <p className="error">{problem}</p> : null}
      </section>
    );
  return (
    <section className="wizard-5e cc-panel wizard-mgt2" aria-label="Traveller wizard" data-wizard="mgt2" data-life-age={life.age}>
      {header}
      <div className="life-grid">
        <ol className="life-log" ref={logRef} data-life-log>
          {life.log.map((line, index) => (
            <li key={index} className={line.startsWith("—") ? "life-term" : ""}>
              {line}
            </li>
          ))}
        </ol>
        <LifeSummary life={life} />
      </div>
      {life.done ? <LifeBuild life={life} busy={busy} onBuild={(build) => void act({ action: "build", build })} /> : life.pending ? <LifeQuestion pending={life.pending} busy={busy} onAnswer={(input) => void act({ action: "answer", input })} /> : null}
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}

function LifeSummary({ life }: { life: Life }) {
  const stats = life.stats;
  const upp = stats ? uppOf(Object.fromEntries(STATS.map((stat: string) => [stat, { score: stats[stat] }]))) : "";
  const skills = Object.entries(life.skills).sort((a, b) => b[1] - a[1] || skillName(a[0]).localeCompare(skillName(b[0])));
  return (
    <aside className="life-summary" data-life-summary>
      <div className="life-upp">
        <b data-life-upp>{upp || "------"}</b> <small className="hint">age {life.age}, {life.terms} term{life.terms === 1 ? "" : "s"}</small>
      </div>
      {stats ? (
        <div className="life-stats">
          {STATS.map((stat: string) => (
            <span key={stat} title={STAT_NAMES[stat as StatKey]}>
              {SHORT[stat as StatKey]} <b>{stats[stat]}</b> <small>{signed(dm(stats[stat]))}</small>
            </span>
          ))}
        </div>
      ) : null}
      {life.careers.length ? (
        <p className="life-careers">
          {life.careers.map((career, index) => (
            <span key={index}>
              {career.career} {career.terms ? `(${career.terms})` : ""}
              {career.title ? ` ${career.title}` : ""}
              {index < life.careers.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
      ) : null}
      <ul className="life-skills">
        {skills.map(([key, level]) => (
          <li key={key}>
            {skillName(key)} <b>{level}</b>
          </li>
        ))}
      </ul>
      <p className="hint">
        Cr{life.cash}
        {life.benefits.length ? ` · ${life.benefits.join(", ")}` : ""}
        {life.connections.contacts + life.connections.allies + life.connections.rivals + life.connections.enemies
          ? ` · ${[["contact", life.connections.contacts], ["ally", life.connections.allies], ["rival", life.connections.rivals], ["enemy", life.connections.enemies]]
              .filter(([, n]) => Number(n) > 0)
              .map(([kind, n]) => `${n} ${kind}${Number(n) === 1 ? "" : kind === "ally" ? "" : "s"}`.replace("allys", "allies").replace("enemys", "enemies"))
              .join(", ")}`
          : ""}
      </p>
    </aside>
  );
}

function LifeQuestion({ pending, busy, onAnswer }: { pending: Pending; busy: boolean; onAnswer: (input: unknown) => void }) {
  const [assign, setAssign] = useState<Record<string, number>>({});
  const [picks, setPicks] = useState<string[]>([]);
  const [career, setCareer] = useState("");
  const [assignment, setAssignment] = useState("");
  useEffect(() => {
    setAssign(pending.values ? Object.fromEntries(STATS.map((stat: string, index: number) => [stat, pending.values![index]])) : {});
    setPicks([]);
    setCareer("");
    setAssignment("");
  }, [pending]);
  const box = (body: React.ReactNode) => (
    <div className="life-question" data-life-question={pending.kind}>
      <p>
        <b>{pending.text}</b>
      </p>
      {body}
      {pending.error ? <p className="error">{pending.error}</p> : null}
    </div>
  );
  if (pending.kind === "arrange") {
    const values = pending.values ?? [];
    const used = Object.values(assign).sort().join();
    const valid = used === values.slice().sort().join();
    return box(
      <>
        <div className="wizard-5e-scores">
          {STATS.map((stat: string) => (
            <label key={stat}>
              {SHORT[stat as StatKey]}
              <select value={assign[stat] ?? ""} aria-label={`${stat} roll`} onChange={(event) => setAssign({ ...assign, [stat]: Number(event.target.value) })}>
                {values.map((value, index) => (
                  <option key={index} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <small>{signed(dm(assign[stat] ?? 0))}</small>
            </label>
          ))}
        </div>
        <p className="cc-inline">
          <button type="button" data-life-answer="keep" disabled={busy} onClick={() => onAnswer({ keep: true })}>
            Keep them in order
          </button>
          <button type="button" data-life-answer="arrange" disabled={busy || !valid} title={valid ? "" : "Use each roll once"} onClick={() => onAnswer({ assign })}>
            Use this arrangement
          </button>
        </p>
      </>,
    );
  }
  if (pending.kind === "pick") {
    const count = pending.count ?? 1;
    return box(
      <>
        <div className="wizard-5e-skills">
          {(pending.options ?? []).map((option) => (
            <label key={option}>
              <input type="checkbox" data-life-pick={option} checked={picks.includes(option)} disabled={!picks.includes(option) && picks.length >= count} onChange={(event) => setPicks(event.target.checked ? [...picks, option] : picks.filter((item) => item !== option))} />
              {option}
              {picks.indexOf(option) >= 0 && count > 1 ? <small className="hint"> #{picks.indexOf(option) + 1}</small> : null}
            </label>
          ))}
        </div>
        <button type="button" data-life-answer="pick" disabled={busy || picks.length !== count} onClick={() => onAnswer({ picks })}>
          Done ({picks.length} of {count})
        </button>
      </>,
    );
  }
  if (pending.kind === "career") {
    const chosen = pending.careers?.find((item) => item.name === career);
    return box(
      <div className="life-careers-pick">
        <div className="life-career-list">
          {(pending.careers ?? []).map((item) => (
            <button key={item.name} type="button" className={item.name === career ? "active" : ""} data-life-career={item.name} onClick={() => (setCareer(item.name), setAssignment(""))} title={item.desc}>
              <b>{item.name}</b> <small className="hint">{item.qualification}</small>
            </button>
          ))}
        </div>
        {chosen ? (
          <div className="life-assignments">
            <p className="hint">{chosen.desc}</p>
            {chosen.assignments.map((item) => (
              <label key={item.key} className="cc-inline">
                <input type="radio" name="assignment" data-life-assignment={item.key} checked={assignment === item.key} onChange={() => setAssignment(item.key)} />
                <b>{item.name}</b> <small className="hint">{item.desc}</small>
              </label>
            ))}
            <button type="button" data-life-answer="career" disabled={busy || !assignment} onClick={() => onAnswer({ career, assignment })}>
              Apply to the {career}
            </button>
          </div>
        ) : null}
      </div>,
    );
  }
  return box(
    <>
      {pending.tables?.length ? (
        <div className="life-tables">
          {pending.tables.map((table) => (
            <div key={table.name}>
              <b>{table.name}</b>
              <ol>
                {table.rows.map((row, index) => (
                  <li key={index}>{row.replace(",", " or ")}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : null}
      <p className="cc-inline life-choices">
        {(pending.options ?? []).map((option) => (
          <button key={option} type="button" data-life-choice={option} disabled={busy} onClick={() => onAnswer({ choice: option })}>
            {option}
          </button>
        ))}
      </p>
    </>,
  );
}

// The finished Traveller: a name, species and homeworld, and the weapons and
// armour its benefits gave (a gun or a blade, a weapon of either kind, armour).
function LifeBuild({ life, busy, onBuild }: { life: Life; busy: boolean; onBuild: (build: unknown) => void }) {
  const [name, setName] = useState(life.name);
  const [species, setSpecies] = useState("Human");
  const [homeworld, setHomeworld] = useState("");
  const listFor = (kind: string) =>
    kind === "armour" ? (ARMOUR as unknown[][]).map((row) => String(row[0])) : (WEAPONS as unknown[][]).filter((row) => row[0] !== "Unarmed" && (kind === "weapon" || (kind === "blade" ? row[2] === "Melee" : row[2] !== "Melee"))).map((row) => String(row[0]));
  const [gear, setGear] = useState<string[]>(() => life.items.map((kind) => listFor(kind)[0] ?? ""));
  return (
    <div className="life-question life-build" data-life-question="build">
      <p>
        <b>Finished. Name your Traveller{life.items.length ? " and pick the gear the benefits gave" : ""}.</b>
      </p>
      <div className="wizard-5e-grid">
        <label>
          Name <input value={name} aria-label="Traveller name" onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Species <input value={species} aria-label="Species" onChange={(event) => setSpecies(event.target.value)} />
        </label>
        <label>
          Homeworld <input value={homeworld} aria-label="Homeworld" onChange={(event) => setHomeworld(event.target.value)} />
        </label>
        {life.items.map((kind, index) => (
          <label key={index}>
            {kind === "armour" ? "Armour" : kind === "blade" ? "A blade" : kind === "gun" ? "A gun" : "A weapon"}
            <select value={gear[index]} aria-label={`Benefit ${index + 1}`} onChange={(event) => setGear(gear.map((item, at) => (at === index ? event.target.value : item)))}>
              {listFor(kind).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button type="button" data-action="wizard-finish" disabled={busy} onClick={() => onBuild({ name, species, homeworld, gear })}>
        Make this Traveller
      </button>
    </div>
  );
}
