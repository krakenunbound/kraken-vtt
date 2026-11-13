import { useMemo, useState } from "react";
import { useHostRolls } from "./Wizard2e";
import { priceOf } from "../../shared/shop.mjs";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { DIFFICULTIES, SKILLS, SPREAD, STAT_NAMES, STATS, dm, signed, skillCost, skillList } from "../../shared/astra/rules.mjs";

// The Apeira Astra crew sheet, in Kraken's sheet style: who they are on top,
// tabs down the right (Main, Skills, Combat, Gear, Notes). Click a number to
// roll a task in front of the table (2d6 + skill + characteristic against 8;
// the difficulty and a Boon or Bane on the strip). Experience buys skills and
// characteristics (Improve). The host works every number out again
// (shared/astra/rules.mjs).

type Row = Record<string, unknown>;
const TABS = ["main", "skills", "combat", "gear", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);

export function SheetAstra({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [difficulty, setDifficulty] = useState(0);
  const [boon, setBoon] = useState("");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const [untrained, setUntrained] = useState("");
  const [improving, setImproving] = useState("");
  const data = record.data as Row;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const numberAt = (path: string) => (value: string) => change(path, Number(value) || 0);
  const stats = (data.characteristics ?? {}) as Record<string, Row>;
  const skills = (data.skills ?? {}) as Record<string, Row>;
  const hp = (data.hp ?? {}) as Row;
  const ac = (data.ac ?? {}) as Row;
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const current = num(hp.total) - num(hp.wounds);
  const grit = num(stats.grit?.score);
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const task = (skill: string, attribute = "") => {
    if (!editable) return;
    session.siegeCheck(record.id, attribute, 0, false, { kind: skill ? "skill" : "check", ...(skill ? { skill } : {}), bonus: difficulty, advantage: boon });
  };
  const known = Object.entries(skills).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
  const exp = num(data.exp);

  return (
    <article className="cc-sheet sheet-5e sheet-astra" data-character={record.id} data-ruleset="astra">
      <div className="cc-body">
        <header className="cc-head">
          <div className="cc-portrait-frame">
            <button type="button" className="cc-portrait" data-action="pick-portrait" disabled={!editable} title={editable ? "Click to choose a portrait" : record.name} onClick={() => setPicking("portrait")} {...slotDrag({ kind: "sheet", record: record.id, label: record.name })}>
              {portrait ? <Picture session={session} id={portrait} alt={record.name} /> : <span>{record.name.slice(0, 1)}</span>}
            </button>
            <button type="button" className="cc-token" data-action="pick-token" disabled={!editable} title="Token" onClick={() => setPicking("token")}>
              {typeof data.token === "string" && data.token ? <Picture session={session} id={data.token} alt="Token" /> : portrait ? <Picture session={session} id={portrait} alt="Token" /> : <Icon name="character" size={18} />}
            </button>
          </div>
          <div className="cc-identity">
            <label className="cc-labelled grow">
              <Field value={record.name} editable={editable} label="Name" className="cc-name" onSave={(value) => change("name", value)} />
              <small>Name</small>
            </label>
            <div className="cc-boxes">
              <label className="cc-labelled cc-box">
                <span className="cc-value">{String(data.origin ?? "")}</span>
                <small>Origin</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="paths">{Array.isArray(data.paths) ? data.paths.join(" / ") : ""}</span>
                <small>Paths</small>
              </label>
            </div>
          </div>
          {picking ? (
            <ArtPicker
              session={session}
              kind={picking}
              current={typeof data[picking] === "string" ? String(data[picking]) : undefined}
              race=""
              onClose={() => setPicking(null)}
              onPick={(id) => {
                void session.op({ op: "update", id: record.id, patch: { data: { [picking]: id } } });
                setPicking(null);
              }}
            />
          ) : null}
        </header>

        <section className="cc-panel cc-row five-strip">
          <span className="cc-inline">
            <b>Experience</b> <Field value={exp} number editable={session.role === "dm"} label="Experience" onSave={numberAt("exp")} />
          </span>
          <label className="cc-inline" title="How hard the task is: it shifts the roll">
            <b>Task</b>
            <select className="cc-field" value={difficulty} aria-label="Difficulty" onChange={(event) => setDifficulty(Number(event.target.value))}>
              {(DIFFICULTIES as [string, number][]).map(([name, shift]) => (
                <option key={name} value={shift}>
                  {name} {shift ? signed(shift) : ""}
                </option>
              ))}
            </select>
          </label>
          <select className="cc-field" aria-label="Boon or bane" value={boon} onChange={(event) => setBoon(event.target.value)} title="A Boon rolls 3d6 and keeps the best two; a Bane the worst two">
            <option value="">No boon</option>
            <option value="boon">Boon</option>
            <option value="bane">Bane</option>
          </select>
          <span className="hint">2d6 + skill + characteristic, 8 or more</span>
        </section>

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <div className="cc-main-grid five-main">
              <section className="cc-panel five-abilities astra-stats" aria-label="Characteristics">
                <div className="five-ability-head">
                  <span />
                  <small>Score</small>
                  <small>Mod</small>
                </div>
                {STATS.map((stat: string) => {
                  const row = stats[stat] ?? {};
                  return (
                    <div key={stat} className="five-ability" data-characteristic={stat}>
                      <b>{STAT_NAMES[stat as keyof typeof STAT_NAMES]}</b>
                      <Field value={num(row.score)} number editable={editable} label={`${stat} score`} onSave={numberAt(`characteristics.${stat}.score`)} />
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Roll ${stat} alone (2d6 + its modifier)`} aria-label={`${stat} check`} data-roll-check={stat} onClick={() => task("", stat)}>
                        {signed(num(row.dm))}
                      </button>
                    </div>
                  );
                })}
              </section>
              <section className="cc-panel five-defence">
                <div className="five-big">
                  <small>Stamina</small>
                  <span data-stat="hp" style={{ color: current <= 0 ? "#c0392b" : undefined }}>
                    {current} / {num(hp.total)}
                  </span>
                  <span className="cc-inline">
                    Damage <Field value={num(hp.wounds)} number editable={editable} label="Damage taken" onSave={numberAt("hp.wounds")} />
                  </span>
                  {current <= 0 ? <span className="hint" data-down>{current <= -grit ? "Dead" : `Down: out of the fight; dead at -${grit}`}</span> : null}
                </div>
                <div className="five-big" title={`Armour takes this off every hit${ac.armor ? `: ${String(ac.armor)}` : ""}`}>
                  <small>Armour</small>
                  <span className="cc-shield" data-stat="ac">
                    {num(ac.total)}
                  </span>
                </div>
                <div className="five-big">
                  <small>Initiative</small>
                  <span data-stat="init">{signed(num((data.initiative as Row)?.total))}</span>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {tab === "skills" ? (
          <section className="cc-panel five-skills cc-page" data-tab-page="skills">
            {known.map(([key, row]) => (
              <div key={key} className="five-skill" data-skill={key}>
                <span className="cc-num">{num(row.level)}</span>
                <span>
                  {String(row.name)} <small className="hint">{String(row.stat).slice(0, 3).toUpperCase()}</small>
                </span>
                <button type="button" className="cc-bonus" disabled={!editable} aria-label={`${String(row.name)} task`} data-roll-skill={key} onClick={() => task(key)}>
                  {signed(num(row.level) + num(stats[String(row.stat)]?.dm))}
                </button>
              </div>
            ))}
            {known.length === 0 ? <p className="hint">No skills yet.</p> : null}
            {editable ? (
              <>
                <p className="cc-inline">
                  <select className="cc-field" value={untrained} aria-label="An untrained skill" onChange={(event) => setUntrained(event.target.value)}>
                    <option value="">An untrained task (-3)…</option>
                    {Object.entries(SKILLS)
                      .filter(([key]) => !skills[key])
                      .map(([key, [name]]) => (
                        <option key={key} value={key}>
                          {name}
                        </option>
                      ))}
                  </select>
                  <button type="button" disabled={!untrained} onClick={() => task(untrained)}>
                    Roll
                  </button>
                </p>
                <p className="cc-inline" title="Spend experience: a skill's next level costs that level x 2 (a new skill at 0 costs 1); a characteristic +1 costs 6">
                  <select className="cc-field" value={improving} aria-label="Improve" onChange={(event) => setImproving(event.target.value)}>
                    <option value="">Improve (spend experience)…</option>
                    {Object.entries(SKILLS).map(([key, [name]]) => {
                      const next = skills[key] ? num(skills[key].level) + 1 : 0;
                      return next <= 4 ? (
                        <option key={key} value={`skill:${key}`}>
                          {name} {next} ({skillCost(next)})
                        </option>
                      ) : null;
                    })}
                    {STATS.map((stat: string) => (
                      <option key={stat} value={`stat:${stat}`}>
                        {STAT_NAMES[stat as keyof typeof STAT_NAMES]} {num(stats[stat]?.score) + 1} (6)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-action="improve"
                    disabled={!improving}
                    onClick={() => {
                      const [kind, key] = improving.split(":");
                      void session.improveCharacter(record.id, kind === "skill" ? { skill: key } : { attribute: key }).catch(() => undefined);
                      setImproving("");
                    }}
                  >
                    Improve
                  </button>
                  <small className="hint">{exp} to spend</small>
                </p>
              </>
            ) : null}
          </section>
        ) : null}

        {tab === "combat" ? (
          <section className="cc-panel cc-page" data-tab-page="combat">
            <h4>Weapons {targetNames.length ? <small className="hint">at {targetNames.join(", ")}</small> : <small className="hint">Ctrl+click a token to target it</small>}</h4>
            <ul className="five-attacks">
              {rows(data.attacks).map(([key, attack]) => (
                <li key={key} data-attack={key}>
                  <b>{String(attack.name)}</b> <small className="hint">{String(attack.range ?? "")}</small>
                  <button type="button" data-action="attack" disabled={!editable} title="Attack: 2d6 + this, 8 or more; the Effect adds to the damage" onClick={() => session.ct("attack", { recordId: record.id, weapon: key })}>
                    {signed(num(attack.bonus))}
                  </button>
                  <button type="button" data-action="damage" disabled={!editable} title="Damage: the dice + the attack's Effect, less the target's armour" onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })}>
                    {String(attack.damage)}
                  </button>
                </li>
              ))}
            </ul>
            {rows(data.attacks).length === 0 ? <p className="hint">No weapon ready: equip one on the Gear tab.</p> : null}
          </section>
        ) : null}

        {tab === "gear" ? (
          <section className="cc-panel cc-page" data-tab-page="gear">
            <ul className="five-items">
              {rows(data.inventorylist).map(([key, item]) => (
                <li key={key} data-item={key}>
                  <select className="cc-field" value={num(item.carried) || 1} disabled={!editable} aria-label={`${String(item.name)} carried`} title="Ready (worn or in hand), carried or stowed" onChange={(event) => change(`inventorylist.${key}.carried`, Number(event.target.value))}>
                    <option value={2}>Ready</option>
                    <option value={1}>Carried</option>
                    <option value={0}>Stowed</option>
                  </select>
                  <Field value={num(item.count) || 1} number editable={editable} label={`${String(item.name)} count`} onSave={numberAt(`inventorylist.${key}.count`)} />
                  <span>
                    {String(item.name)} <small className="hint">{String(item.subtype ?? item.type ?? "")}{item.protection ? ` · protection ${num(item.protection)}` : ""}{item.damage ? ` · ${String(item.damage)}` : ""}</small>
                  </span>
                  {editable ? (
                    <button type="button" className="ghost" title="Drop it" aria-label={`Drop ${String(item.name)}`} onClick={() => change(`inventorylist.${key}`, null)}>
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="five-coins">
              {rows(data.coins).map(([key, coin]) => (
                <label key={key} className="cc-inline">
                  <Field value={num(coin.amount)} number editable={editable} label="Credits" onSave={numberAt(`coins.${key}.amount`)} /> credits
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            <label className="cc-labelled">
              <Field value={String(data.contacts ?? "")} editable={editable} label="Contacts and rivals" onSave={(value) => change("contacts", value)} />
              <small>Contacts and rivals</small>
            </label>
            <Field value={String(data.notes ?? "")} area editable={editable} label="Notes" onSave={(value) => change("notes", value)} />
          </section>
        ) : null}
      </div>
      <nav className="cc-tabs" role="tablist" aria-label="Sheet">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-sheet-tab={id} onClick={() => setTab(id)}>
            {titled(id)}
          </button>
        ))}
      </nav>
    </article>
  );
}

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
