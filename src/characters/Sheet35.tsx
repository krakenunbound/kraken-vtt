import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtChoice, ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { CASTERS, classInfo, MAX_LEVEL, mod, raceInfo, SAVE_NAMES, SAVES, signed, SKILLS, STANDARD_ARRAY, STATS } from "../../shared/dnd35/rules.mjs";

// The D&D 3.5E character sheet (SRD 3.5), laid out as FG's 3.5E sheet in
// Kraken's sheet style: portrait and who they are on top; tabs down the right
// (Main, Skills, Combat, Spells, Feats, Inventory, Notes). Click a number to
// roll it in front of the table; the host works every number out again from
// what is typed (shared/dnd35/rules.mjs).

type Row = Record<string, unknown>;
const TABS = ["main", "skills", "combat", "spells", "feats", "inventory", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const ORDINAL = ["0", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export function Sheet35({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [dc, setDc] = useState(0);
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const data = record.data as Row;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const numberAt = (path: string) => (value: string) => change(path, Number(value) || 0);
  const abilities = (data.abilities ?? {}) as Record<string, Row>;
  const skills = (data.skills ?? {}) as Record<string, Row>;
  const saves = (data.saves ?? {}) as Record<string, Row>;
  const hp = (data.hp ?? {}) as Row;
  const ac = (data.ac ?? {}) as Row;
  const classes = (Array.isArray(data.classes) ? data.classes : []) as Row[];
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const roll = (kind: "check" | "save" | "skill", key: string) => {
    if (!editable) return;
    // A save in a fight goes through the tracker (its effects count); else straight to chat.
    if (kind === "save" && inFight) session.ct("save", { id: inFight.id, attribute: key, cl: dc });
    else session.siegeCheck(record.id, kind === "skill" ? "" : key, 0, false, { kind, ...(kind === "skill" ? { skill: key } : {}), dc });
  };
  const level = num(data.level);
  const ready = num(data.expnext) > 0 && num(data.exp) >= num(data.expnext);
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const current = num(hp.total) + num(hp.temp) - num(hp.wounds);
  const status = current <= -10 ? "Dead" : current < 0 ? (num(data.stable) ? "Stable" : "Dying") : current === 0 ? "Disabled" : "";
  const spellcasting = (data.spellcasting ?? null) as Row | null;
  const perday = (Array.isArray(spellcasting?.perday) ? spellcasting.perday : []) as (number | null)[];
  const used = (Array.isArray(spellcasting?.used) ? spellcasting.used : []) as number[];

  return (
    <article className="cc-sheet sheet-5e sheet-35" data-character={record.id} data-ruleset="dnd35">
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
                <span className="cc-value">{String(data.race ?? "")}</span>
                <small>Race</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="class">{classes.map((item) => `${String(item.name)} ${num(item.level)}`).join(" / ")}</span>
                <small>Class</small>
              </label>
              <label className="cc-labelled cc-box">
                <Field value={String(data.alignment ?? "")} editable={editable} label="Alignment" onSave={(value) => change("alignment", value)} />
                <small>Alignment</small>
              </label>
            </div>
          </div>
          {picking ? (
            <ArtPicker
              session={session}
              kind={picking}
              current={typeof data[picking] === "string" ? String(data[picking]) : undefined}
              race={String(data.race ?? "")}
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
            <b>Level</b> <span className="cc-num" data-stat="level">{level}</span>
            {editable && (ready || session.role === "dm") && level < MAX_LEVEL ? (
              <button type="button" className="cc-levelup" data-action="level-up" title="Level up: the host rolls the hit die" onClick={() => session.levelUp(record.id)}>
                <Icon name="add" size={14} />
              </button>
            ) : null}
          </span>
          <span className="cc-inline">
            <b>XP</b> <Field value={num(data.exp)} number editable={editable} label="Experience" onSave={numberAt("exp")} /> / <span className="cc-num">{num(data.expnext) || "—"}</span>
          </span>
          <span className="cc-inline" title="Base attack bonus">
            <b>BAB</b> <span className="cc-num" data-stat="bab">{signed(num(data.bab))}</span>
          </span>
          <span className="cc-inline" title="Grapple: base attack + Strength + size">
            <b>Grapple</b> <span className="cc-num" data-stat="grapple">{signed(num(data.grapple))}</span>
          </span>
          <label className="cc-inline" title="The DC a check or save is rolled against (0: none)">
            <b>DC</b> <input type="number" className="cc-field number" value={dc} min={0} max={60} aria-label="Difficulty class" onChange={(event) => setDc(Number(event.target.value) || 0)} />
          </label>
        </section>

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <div className="cc-main-grid five-main">
              <section className="cc-panel five-abilities" aria-label="Abilities">
                <div className="five-ability-head d35-ability-head">
                  <span />
                  <small>Score</small>
                  <small>Mod</small>
                </div>
                {STATS.map((stat) => {
                  const row = abilities[stat] ?? {};
                  return (
                    <div key={stat} className="five-ability d35-ability" data-ability={stat}>
                      <b>{titled(stat)}</b>
                      <Field value={num(row.score)} number editable={editable} label={`${stat} score`} onSave={numberAt(`abilities.${stat}.score`)} />
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Roll a ${stat} check`} aria-label={`${stat} check`} data-roll-check={stat} onClick={() => roll("check", stat)}>
                        {signed(num(row.bonus))}
                      </button>
                    </div>
                  );
                })}
                <div className="d35-saves" aria-label="Saving throws">
                  {Object.keys(SAVES).map((save) => {
                    const row = saves[save] ?? {};
                    return (
                      <div key={save} className="five-ability d35-save" data-save={save} title={`Base ${signed(num(row.base))}, ability ${signed(num(row.ability))}, misc ${signed(num(row.misc))}`}>
                        <b>{SAVE_NAMES[save as keyof typeof SAVE_NAMES]}</b>
                        <Field value={num(row.misc)} number editable={editable} label={`${save} misc`} onSave={numberAt(`saves.${save}.misc`)} />
                        <button type="button" className="cc-save" disabled={!editable} title={`Roll a ${save} save`} aria-label={`${save} save`} data-roll-save={save} onClick={() => roll("save", save)}>
                          {signed(num(row.total))}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="cc-panel five-defence">
                <div className="five-big" title={`10 + armor ${num(ac.armor)} + shield ${num(ac.shield)} + Dex ${num(ac.dex)} + size ${num(ac.size)} + natural ${num(ac.natural)} + deflection ${num(ac.deflection)} + dodge ${num(ac.dodge)} + misc ${num(ac.misc)}`}>
                  <small>Armor Class</small>
                  <span className="cc-shield" data-stat="ac">{num(ac.total)}</span>
                  <span className="cc-inline">
                    Touch <b data-stat="touch">{num(ac.touch)}</b> · Flat-footed <b data-stat="flatfooted">{num(ac.flatfooted)}</b>
                  </span>
                  <span className="cc-inline">
                    Natural <Field value={num(ac.natural)} number editable={editable} label="Natural armor" onSave={numberAt("ac.natural")} /> Deflection <Field value={num(ac.deflection)} number editable={editable} label="Deflection" onSave={numberAt("ac.deflection")} />
                  </span>
                </div>
                <div className="five-big">
                  <small>Hit Points</small>
                  <span data-stat="hp" style={{ color: current <= 0 ? "#c0392b" : undefined }}>
                    {current} / {num(hp.total)}
                  </span>
                  <span className="cc-inline">
                    Wounds <Field value={num(hp.wounds)} number editable={editable} label="Wounds" onSave={numberAt("hp.wounds")} /> Nonlethal <Field value={num(hp.nonlethal)} number editable={editable} label="Nonlethal damage" onSave={numberAt("hp.nonlethal")} />
                  </span>
                  <span className="cc-inline">
                    Temp <Field value={num(hp.temp)} number editable={editable} label="Temporary hit points" onSave={numberAt("hp.temp")} />
                  </span>
                  {status ? (
                    <span className="hint" data-status={status}>
                      {status === "Disabled" ? "Disabled: one move or standard action a round (a standard action costs 1 hit point)." : status === "Dying" ? "Dying: 10% each turn to become stable, else 1 more hit point lost; dead at -10." : status === "Stable" ? "Stable: unconscious, no longer losing hit points." : "Dead."}
                    </span>
                  ) : null}
                </div>
                <div className="five-big">
                  <small>Initiative</small>
                  <span data-stat="init">{signed(num((data.initiative as Row)?.total))}</span>
                </div>
                <div className="five-big">
                  <small>Speed</small>
                  <span>
                    <Field value={num(data.speed)} number editable={editable} label="Speed" onSave={numberAt("speed")} /> ft.
                  </span>
                </div>
                <div className="five-big">
                  <small>Size</small>
                  <span>{titled(String(data.size ?? "medium"))}</span>
                </div>
              </section>
            </div>
          </div>
        ) : null}

        {tab === "skills" ? (
          <section className="cc-panel five-skills d35-skills cc-page" data-tab-page="skills">
            <div className="five-skill d35-skill-head">
              <small>Ranks</small>
              <small>Skill</small>
              <small>Total</small>
            </div>
            {Object.entries(SKILLS).map(([key, [name, stat]]) => {
              const row = skills[key] ?? {};
              const total = row.total === null || row.total === undefined ? null : num(row.total);
              return (
                <div key={key} className={row.classskill ? "five-skill class-skill" : "five-skill"} data-skill={key} title={`${row.classskill ? "A class skill" : "Cross-class (2 points a rank, half the ranks)"}${row.trained ? "; trained only" : ""}${num(row.acp) ? `; armor check ${num(row.acp)}` : ""}`}>
                  <Field value={num(row.ranks)} number editable={editable} label={`${name} ranks`} onSave={numberAt(`skills.${key}.ranks`)} />
                  <span>
                    {row.classskill ? "● " : ""}
                    {name} <small className="hint">{String(stat).slice(0, 3).toUpperCase()}</small>
                  </span>
                  <button type="button" className="cc-bonus" disabled={!editable || total === null} aria-label={`Roll ${name}`} data-roll-skill={key} onClick={() => roll("skill", String(name))}>
                    {total === null ? "—" : signed(total)}
                  </button>
                </div>
              );
            })}
          </section>
        ) : null}

        {tab === "combat" ? (
          <section className="cc-panel cc-page" data-tab-page="combat">
            <h4>Attacks {targetNames.length ? <small className="hint">at {targetNames.join(", ")}</small> : <small className="hint">Ctrl+click a token to target it</small>}</h4>
            <ul className="five-attacks">
              {rows(data.attacks).map(([key, attack]) => {
                const bonuses = (Array.isArray(attack.bonuses) ? attack.bonuses : []) as number[];
                const crit = (attack.crit ?? {}) as Row;
                return (
                  <li key={key} data-attack={key}>
                    <b>{String(attack.name)}</b>
                    <button type="button" data-action="attack" disabled={!editable} title="One attack roll at each target" onClick={() => session.ct("attack", { recordId: record.id, weapon: key })}>
                      {signed(bonuses[0] ?? 0)}
                    </button>
                    {bonuses.length > 1 ? (
                      <button type="button" data-action="full-attack" disabled={!editable} title="Full attack: every iterative bonus at the first target" onClick={() => session.ct("attack", { recordId: record.id, weapon: key, full: true })}>
                        {bonuses.map(signed).join("/")}
                      </button>
                    ) : null}
                    <button type="button" data-action="damage" disabled={!editable} title="Damage roll (each hit; a confirmed critical multiplied)" onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })}>
                      {String(attack.damage)} {String(attack.dmgtype ?? "")}
                    </button>
                    <small className="hint" data-crit>
                      {num(crit.range) < 20 ? `${num(crit.range)}-20` : "20"}/x{num(crit.mult) || 2}
                    </small>
                  </li>
                );
              })}
            </ul>
            <p className="hint">
              A roll in the threat range that hits is confirmed by a second roll; a confirmed critical's damage is rolled as many times as its multiplier. Armor check penalty {num(ac.acp)}{spellcasting?.arcane ? `, arcane spell failure ${num(ac.spellfailure)}%` : ""}.
            </p>
          </section>
        ) : null}

        {tab === "spells" ? (
          <section className="cc-panel cc-page" data-tab-page="spells">
            {spellcasting ? (
              <>
                <p className="hint">
                  {String(spellcasting.class)}: save DC {num(spellcasting.dc)} + the spell's level ({titled(String(spellcasting.stat))}). Click a box to use a spell of that level, again to get it back.
                </p>
                <div className="d35-perday" data-perday>
                  {perday.map((max, level) =>
                    max === null ? null : (
                      <div key={level} className="d35-slots" data-spell-level={level}>
                        <b>{ORDINAL[level]}</b>
                        {Array.from({ length: max }, (_, index) => (
                          <button
                            key={index}
                            type="button"
                            className={index < num(used[level]) ? "used" : ""}
                            disabled={!editable}
                            aria-label={`${ORDINAL[level]} level spell ${index + 1}`}
                            onClick={() => change(`spellcasting.used.${level}`, index < num(used[level]) ? index : index + 1)}
                          />
                        ))}
                        {max === 0 ? <small className="hint">none yet</small> : null}
                      </div>
                    ),
                  )}
                </div>
              </>
            ) : (
              <p className="hint">This character casts no spells.</p>
            )}
            <h4>Spells known or prepared</h4>
            <Field value={((data.spells ?? []) as string[]).join("\n")} area editable={editable} label="Spells" onSave={(value) => change("spells", value)} />
            <p className="hint">One spell a line, or drop a spell from the Spells list on the sheet.</p>
          </section>
        ) : null}

        {tab === "feats" ? (
          <section className="cc-panel cc-page" data-tab-page="feats">
            <h4>Feats</h4>
            <Field value={((data.feats ?? []) as string[]).join("\n")} area editable={editable} label="Feats" onSave={(value) => change("feats", value)} />
            <p className="hint">One feat a line (Dodge, Improved Initiative, Weapon Focus (Longsword)... count in the numbers), or drop a feat on the sheet.</p>
            <h4>Class features</h4>
            <ul className="d35-features">
              {((data.features ?? []) as Row[]).map((feature, index) => (
                <li key={index}>
                  <b>{String(feature.name)}</b> <small className="hint">{String(feature.class ?? "")} {num(feature.level)}</small>
                </li>
              ))}
            </ul>
            {(data.traits as string[] | undefined)?.length ? (
              <>
                <h4>Racial traits</h4>
                <p>{(data.traits as string[]).join(", ")}</p>
              </>
            ) : null}
          </section>
        ) : null}

        {tab === "inventory" ? (
          <section className="cc-panel cc-page" data-tab-page="inventory">
            <ul className="five-items">
              {rows(data.inventorylist).map(([key, item]) => (
                <li key={key} data-item={key}>
                  <select className="cc-field" value={num(item.carried) || 1} disabled={!editable} aria-label={`${String(item.name)} carried`} title="Equipped, carried or not carried" onChange={(event) => change(`inventorylist.${key}.carried`, Number(event.target.value))}>
                    <option value={2}>Equipped</option>
                    <option value={1}>Carried</option>
                    <option value={0}>Not carried</option>
                  </select>
                  <Field value={num(item.count) || 1} number editable={editable} label={`${String(item.name)} count`} onSave={numberAt(`inventorylist.${key}.count`)} />
                  <span>
                    {String(item.name)} <small className="hint">{String(item.subtype ?? item.type ?? "")}</small>
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
                  <Field value={num(coin.amount)} number editable={editable} label={String(coin.name)} onSave={numberAt(`coins.${key}.amount`)} /> {String(coin.name).toUpperCase()}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            <label className="cc-labelled">
              <Field value={String(data.deity ?? "")} editable={editable} label="Deity" onSave={(value) => change("deity", value)} />
              <small>Deity</small>
            </label>
            <label className="cc-labelled">
              <Field value={String(data.languages ?? "")} editable={editable} label="Languages" onSave={(value) => change("languages", value)} />
              <small>Languages</small>
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

// The 3.5E character wizard: name, race, class and level, ability scores (the
// standard array put in the class's order, or your own), then the host builds
// the rest from the campaign's 3.5E Player's Handbook: hit points, the class's
// feats and skills, its kit.
const ORDER: Record<string, string[]> = {
  barbarian: ["strength", "constitution", "dexterity", "wisdom", "charisma", "intelligence"],
  bard: ["charisma", "dexterity", "constitution", "intelligence", "wisdom", "strength"],
  cleric: ["wisdom", "constitution", "strength", "charisma", "dexterity", "intelligence"],
  druid: ["wisdom", "constitution", "dexterity", "intelligence", "charisma", "strength"],
  fighter: ["strength", "constitution", "dexterity", "wisdom", "intelligence", "charisma"],
  monk: ["wisdom", "dexterity", "strength", "constitution", "intelligence", "charisma"],
  paladin: ["charisma", "strength", "constitution", "wisdom", "dexterity", "intelligence"],
  ranger: ["dexterity", "wisdom", "strength", "constitution", "intelligence", "charisma"],
  rogue: ["dexterity", "intelligence", "constitution", "charisma", "wisdom", "strength"],
  sorcerer: ["charisma", "dexterity", "constitution", "intelligence", "wisdom", "strength"],
  wizard: ["intelligence", "dexterity", "constitution", "wisdom", "charisma", "strength"],
};
const arrayFor = (cls: string) => {
  const order = ORDER[cls.toLowerCase().replace(/[^a-z]/g, "")] ?? STATS;
  return Object.fromEntries(STATS.map((stat) => [stat, STANDARD_ARRAY[order.indexOf(stat)]])) as Record<string, number>;
};

export function Wizard35({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const of = (type: string) => records.filter((item) => item.type === type).sort((a, b) => a.name.localeCompare(b.name));
  const classes = useMemo(() => of("class"), [records.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const races = useMemo(() => of("race"), [records.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [name, setName] = useState("");
  const [race, setRace] = useState(races.find((item) => item.name === "Human")?.name ?? races[0]?.name ?? "Human");
  const [cls, setCls] = useState(classes.find((item) => item.name === "Fighter")?.name ?? classes[0]?.name ?? "");
  const [level, setLevel] = useState(1);
  const [scores, setScores] = useState<Record<string, number>>(() => arrayFor(cls));
  const [art, setArt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const raceRecord = races.find((item) => item.name === race);
  const adjust = (raceRecord ? raceInfo(raceRecord).adjust : {}) as Record<string, number>;
  const classRecord = classes.find((item) => item.name === cls);
  const info = classRecord ? classInfo(classRecord) : null;
  const caster = CASTERS[cls.toLowerCase().replace(/[^a-z]/g, "") as keyof typeof CASTERS];
  const finish = async () => {
    setBusy(true);
    setProblem("");
    try {
      const id = await session.buildCharacter({ name: name || "Adventurer", class: cls, race, level, scores, ...art });
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (classes.length === 0) return <p className="hint">No classes yet: the GM makes the 3.5E Player's Handbook active (Books).</p>;
  return (
    <section className="wizard-5e wizard-35 cc-panel" aria-label="D&D 3.5E character wizard" data-wizard="dnd35">
      <header className="cc-row">
        <b>New D&amp;D 3.5E character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || !cls} title="Make the character" onClick={() => void finish()}>
          Finish
        </button>
      </header>
      <div className="wizard-5e-grid">
        <ArtChoice session={session} race={race} cls={cls} value={art} onChange={setArt} />
        <label>
          Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" />
        </label>
        <label>
          Race
          <select value={race} onChange={(event) => setRace(event.target.value)} aria-label="Race">
            {races.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Class
          <select
            value={cls}
            aria-label="Class"
            onChange={(event) => {
              setCls(event.target.value);
              setScores(arrayFor(event.target.value));
            }}
          >
            {classes.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Level
          <input type="number" min={1} max={MAX_LEVEL} value={level} aria-label="Level" onChange={(event) => setLevel(Math.min(MAX_LEVEL, Math.max(1, Number(event.target.value) || 1)))} />
        </label>
      </div>
      {info ? (
        <p className="hint" data-class-info>
          {info.name}: hit die d{info.hitdie}, base attack {info.bab.toLowerCase()}, Fortitude {info.fort.toLowerCase()}, Reflex {info.ref.toLowerCase()}, Will {info.will.toLowerCase()}, {info.skillranks} + Int skill points a level{caster ? `, casts with ${caster.stat}` : ""}.
        </p>
      ) : null}
      <h4>
        Ability scores <small className="hint">the standard array {STANDARD_ARRAY.join(", ")} in the class's order; type your own{Object.keys(adjust).length ? `; then the ${race}'s adjustments` : ""}</small>
      </h4>
      <div className="wizard-5e-scores">
        {STATS.map((stat) => (
          <label key={stat}>
            {stat.slice(0, 3).toUpperCase()}
            <input type="number" min={3} max={20} value={scores[stat]} aria-label={`${stat} score`} onChange={(event) => setScores({ ...scores, [stat]: Number(event.target.value) || 10 })} />
            <small>
              {adjust[stat] ? <b data-adjust={stat}>{signed(adjust[stat])} = {scores[stat] + adjust[stat]} </b> : null}
              {signed(mod(scores[stat] + (adjust[stat] ?? 0)))}
            </small>
          </label>
        ))}
      </div>
      <p className="hint">The host works out the rest from the books: hit points (the die's highest, then its average), the class's feats and skills, and its starting kit. Change any of it on the sheet.</p>
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
