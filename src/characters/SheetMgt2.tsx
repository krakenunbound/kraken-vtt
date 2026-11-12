import { useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { DIFFICULTIES, PHYSICAL, SHORT, SKILLS, STAT_NAMES, STATS, bodyState, dm, physicalNow, signed, skillName } from "../../shared/mgt2/rules.mjs";

// The Traveller sheet, in Kraken's sheet style: who they are on top (name,
// species, homeworld, UPP, age, careers), tabs down the right (Main, Skills,
// Combat, Gear, Notes). Click a number to roll a task in front of the table
// (2d6 + DM + skill against the difficulty; a modifier and a Boon or Bane on
// the strip). Damage comes off Endurance, then Strength, then Dexterity, and a
// wounded characteristic's DM is its current value's. The host works every
// number out again (shared/mgt2/rules.mjs).

type Row = Record<string, unknown>;
const TABS = ["main", "skills", "combat", "gear", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
type StatKey = keyof typeof STAT_NAMES;
// Every skill and speciality, for the pickers.
const ALL_SKILLS: [string, string][] = Object.entries(SKILLS).flatMap(([key, [name, , specs]]) => ((specs as string[]).length ? [[key, `${name} (any: 0)`] as [string, string], ...(specs as string[]).map((spec): [string, string] => [`${key}-${spec.toLowerCase().replace(/[^a-z0-9]/g, "")}`, `${name} (${spec})`])] : [[key, name] as [string, string]]));

export function SheetMgt2({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [difficulty, setDifficulty] = useState(8);
  const [modifier, setModifier] = useState(0);
  const [boon, setBoon] = useState("");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const [other, setOther] = useState("");
  const [adding, setAdding] = useState("");
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
  const scores = Object.fromEntries(STATS.map((stat: string) => [stat, num(stats[stat]?.score)]));
  const now = physicalNow(scores, num(hp.wounds)) as Record<string, number>;
  const state = bodyState(scores, num(hp.wounds));
  const current = (stat: string) => (PHYSICAL.includes(stat) ? now[stat] : scores[stat]);
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const task = (skill: string, attribute = "") => {
    if (!editable) return;
    session.siegeCheck(record.id, attribute, 0, false, { kind: skill ? "skill" : "check", ...(skill ? { skill } : {}), dc: difficulty, bonus: modifier, advantage: boon });
  };
  const known = Object.entries(skills).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
  const careers = Array.isArray(data.careers) ? (data.careers as Row[]) : [];

  return (
    <article className="cc-sheet sheet-5e sheet-astra sheet-mgt2" data-character={record.id} data-ruleset="mgt2">
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
                <span className="cc-value mgt2-upp" data-stat="upp" title={STATS.map((stat: string) => `${SHORT[stat as StatKey]} ${scores[stat]}`).join(", ")}>
                  {String(data.upp ?? "")}
                </span>
                <small>UPP</small>
              </label>
              <label className="cc-labelled cc-box">
                <Field value={String(data.species ?? "Human")} editable={editable} label="Species" onSave={(value) => change("species", value)} />
                <small>Species</small>
              </label>
              <label className="cc-labelled cc-box">
                <Field value={String(data.homeworld ?? "")} editable={editable} label="Homeworld" onSave={(value) => change("homeworld", value)} />
                <small>Homeworld</small>
              </label>
              <label className="cc-labelled cc-box">
                <Field value={num(data.age)} number editable={editable} label="Age" onSave={numberAt("age")} />
                <small>Age</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="careers">{careers.map((career) => `${String(career.name)} ${num(career.terms)}${career.title ? ` (${String(career.title)})` : num(career.rank) ? ` (rank ${num(career.rank)})` : ""}`).join(", ") || "-"}</span>
                <small>Careers (terms)</small>
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
          <label className="cc-inline" title="The number the roll must reach">
            <b>Task</b>
            <select className="cc-field" value={difficulty} aria-label="Difficulty" onChange={(event) => setDifficulty(Number(event.target.value))}>
              {(DIFFICULTIES as [string, number][]).map(([name, target]) => (
                <option key={name} value={target}>
                  {name} ({target}+)
                </option>
              ))}
            </select>
          </label>
          <label className="cc-inline" title="A DM for the circumstances (cover, equipment, time)">
            DM <input className="cc-field" type="number" value={modifier} aria-label="Task modifier" style={{ width: "4em" }} onChange={(event) => setModifier(Number(event.target.value) || 0)} />
          </label>
          <select className="cc-field" aria-label="Boon or bane" value={boon} onChange={(event) => setBoon(event.target.value)} title="A Boon rolls 3d6 and keeps the best two; a Bane the worst two">
            <option value="">No boon</option>
            <option value="boon">Boon</option>
            <option value="bane">Bane</option>
          </select>
          <span className="hint">2d6 + DM + skill; the margin is the Effect</span>
        </section>

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <div className="cc-main-grid five-main">
              <section className="cc-panel five-abilities astra-stats" aria-label="Characteristics">
                <div className="five-ability-head">
                  <span />
                  <small>Score</small>
                  <small>DM</small>
                </div>
                {STATS.map((stat: string) => {
                  const hurt = current(stat) < scores[stat];
                  return (
                    <div key={stat} className="five-ability" data-characteristic={stat}>
                      <b title={STAT_NAMES[stat as StatKey]}>
                        {SHORT[stat as StatKey]} {hurt ? <small className="hint" data-now={stat}>now {current(stat)}</small> : null}
                      </b>
                      <Field value={scores[stat]} number editable={editable} label={`${stat} score`} onSave={numberAt(`characteristics.${stat}.score`)} />
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Roll ${STAT_NAMES[stat as StatKey]} alone (2d6 + its DM)`} aria-label={`${stat} check`} data-roll-check={stat} onClick={() => task("", stat)}>
                        {signed(dm(current(stat)))}
                      </button>
                    </div>
                  );
                })}
              </section>
              <section className="cc-panel five-defence">
                <div className="five-big" title="Damage comes off Endurance, then Strength, then Dexterity">
                  <small>Damage</small>
                  <span data-stat="hp" style={{ color: state === "Unconscious" || state === "Dead" ? "#c0392b" : undefined }}>
                    END {now.end} · STR {now.str} · DEX {now.dex}
                  </span>
                  <span className="cc-inline">
                    Taken <Field value={num(hp.wounds)} number editable={editable} label="Damage taken" onSave={numberAt("hp.wounds")} />
                  </span>
                  {state === "Unconscious" || state === "Dead" ? <span className="hint" data-down>{state}</span> : null}
                </div>
                <div className="five-big" title={`Armour's protection comes off every hit${ac.armor ? `: ${String(ac.armor)}` : ""}`}>
                  <small>Armour</small>
                  <span className="cc-shield" data-stat="ac">
                    {num(ac.total)}
                  </span>
                </div>
                <div className="five-big" title="2d6 + the better of DEX and INT DM">
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
                {editable ? <Field value={num(row.level)} number editable label={`${String(row.name)} level`} onSave={numberAt(`skills.${key}.level`)} /> : <span className="cc-num">{num(row.level)}</span>}
                <span>
                  {String(row.name)} <small className="hint">{String(row.stat).toUpperCase()}</small>
                </span>
                <button type="button" className="cc-bonus" disabled={!editable} aria-label={`${String(row.name)} task`} data-roll-skill={key} onClick={() => task(String(row.name))}>
                  {signed(num(row.level) + dm(current(String(row.stat))))}
                </button>
                {editable ? (
                  <button type="button" className="ghost" title="Forget this skill" aria-label={`Remove ${String(row.name)}`} onClick={() => change(`skills.${key}`, null)}>
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            {known.length === 0 ? <p className="hint">No skills yet.</p> : null}
            {editable ? (
              <>
                <p className="cc-inline">
                  <select className="cc-field" value={other} aria-label="Another skill" onChange={(event) => setOther(event.target.value)}>
                    <option value="">Roll a skill not listed…</option>
                    {ALL_SKILLS.filter(([key]) => !skills[key]).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name.replace(" (any: 0)", "")}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={!other} data-action="roll-other-skill" onClick={() => task(skillName(other))}>
                    Roll
                  </button>
                </p>
                <p className="cc-inline">
                  <select className="cc-field" value={adding} aria-label="Learn a skill" onChange={(event) => setAdding(event.target.value)}>
                    <option value="">Learn a skill (training, a new term)…</option>
                    {ALL_SKILLS.filter(([key]) => !skills[key]).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-action="learn-skill"
                    disabled={!adding}
                    onClick={() => {
                      change(`skills.${adding}.level`, adding.includes("-") ? 1 : 0);
                      setAdding("");
                    }}
                  >
                    Learn
                  </button>
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
                  <b>{String(attack.name)}</b> <small className="hint">{[String(attack.range ?? ""), String(attack.traits ?? "")].filter(Boolean).join(" · ")}</small>
                  <button type="button" data-action="attack" disabled={!editable} title="Attack: 2d6 + this, 8 or more; the Effect adds to the damage" onClick={() => session.ct("attack", { recordId: record.id, weapon: key })}>
                    {signed(num(attack.bonus))}
                  </button>
                  <button type="button" data-action="damage" disabled={!editable} title="Damage: the dice + the attack's Effect, less the target's armour (less the weapon's AP)" onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })}>
                    {String(attack.damage)}
                  </button>
                </li>
              ))}
            </ul>
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
                    {String(item.name)}{" "}
                    <small className="hint">
                      {item.tl !== undefined ? `TL${num(item.tl)} · ` : ""}
                      {item.protection ? `protection +${num(item.protection)}` : ""}
                      {item.damage ? `${String(item.damage)}${item.traits ? ` · ${String(item.traits)}` : ""}` : ""}
                    </small>
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
                  Cr <Field value={num(coin.amount)} number editable={editable} label="Credits" onSave={numberAt(`coins.${key}.amount`)} />
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            <label className="cc-labelled">
              <Field value={String(data.contacts ?? "")} editable={editable} label="Allies, contacts, rivals and enemies" onSave={(value) => change("contacts", value)} />
              <small>Allies, contacts, rivals and enemies</small>
            </label>
            <label className="cc-labelled">
              <Field value={String(data.gender ?? "")} editable={editable} label="Gender" onSave={(value) => change("gender", value)} />
              <small>Gender</small>
            </label>
            <Field value={String(data.appearance ?? "")} area editable={editable} label="Appearance and background" onSave={(value) => change("appearance", value)} />
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

