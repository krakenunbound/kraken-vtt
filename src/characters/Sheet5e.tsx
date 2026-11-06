import { useEffect, useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtChoice, ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { abilityAdjustments, CASTERS, classSkillChoices, profileFor, SKILLS, skillKey, STATS, mod, signed } from "../../shared/dnd5e/rules.mjs";

// The D&D 5E character sheet (SRD 5.2.1), laid out as FG's 5E sheet in
// Kraken's sheet style: portrait and who they are on top; tabs down the right
// (Main, Skills, Combat, Spells, Inventory, Notes). Click a number to roll it
// in front of the table; the host works every number out again from what is
// typed (shared/dnd5e/rules.mjs).

type Row = Record<string, unknown>;
const TABS = ["main", "skills", "combat", "spells", "inventory", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const plain = (html: unknown) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function Sheet5e({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [dc, setDc] = useState(0);
  const [advantage, setAdvantage] = useState("");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const data = record.data as Row;
  // The game it is (D&D 5E, Descending Darkness): its words and its rules.
  const profile = profileFor(String(data.ruleset ?? "dnd5e"));
  const words = profile.labels;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const numberAt = (path: string) => (value: string) => change(path, Number(value) || 0);
  const abilities = (data.abilities ?? {}) as Record<string, Row>;
  const skills = (data.skills ?? {}) as Record<string, Row>;
  const hp = (data.hp ?? {}) as Row;
  const ac = (data.ac ?? {}) as Row;
  const className = rows(data.packages).find(([, pkg]) => String(pkg.packagetype).toLowerCase() === "class")?.[1];
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const roll = (kind: "check" | "save" | "skill", key: string) => {
    if (!editable) return;
    // A save in a fight goes through the tracker (its effects count); else straight to chat.
    if (kind === "save" && inFight && !advantage) session.ct("save", { id: inFight.id, attribute: key, cl: dc });
    else session.siegeCheck(record.id, kind === "skill" ? "" : key, 0, false, { kind, ...(kind === "skill" ? { skill: key } : {}), dc, advantage });
  };
  const level = num(data.level);
  const ready = num(data.expnext) > 0 && num(data.exp) >= num(data.expnext);
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const current = num(hp.total) - num(hp.wounds);

  return (
    <article className="cc-sheet sheet-5e" data-character={record.id} data-ruleset={profile.id}>
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
                <span className="cc-value">{String(data.species ?? "")}</span>
                <small>{words.species}</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="class">{className ? `${String(className.name)} ${level}` : ""}</span>
                <small>Class</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value">{String(data.background ?? "")}</span>
                <small>Background</small>
              </label>
            </div>
          </div>
          {picking ? (
            <ArtPicker
              session={session}
              kind={picking}
              current={typeof data[picking] === "string" ? String(data[picking]) : undefined}
              race={String(data.race ?? data.species ?? "")}
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
            {editable && (ready || session.role === "dm") && level < profile.maxLevel ? (
              <button type="button" className="cc-levelup" data-action="level-up" title="Level up: the host rolls the hit die" onClick={() => session.levelUp(record.id)}>
                <Icon name="add" size={14} />
              </button>
            ) : null}
          </span>
          <span className="cc-inline">
            <b>XP</b> <Field value={num(data.exp)} number editable={editable} label="Experience" onSave={numberAt("exp")} /> / <span className="cc-num">{num(data.expnext) || "—"}</span>
          </span>
          <span className="cc-inline" title="Proficiency bonus">
            <b>Prof</b> <span className="cc-num" data-stat="prof">{signed(num(data.prof))}</span>
          </span>
          <label className="cc-inline" title="The DC a check or save is rolled against (0: none)">
            <b>DC</b> <input type="number" className="cc-field number" value={dc} min={0} max={40} aria-label="Difficulty class" onChange={(event) => setDc(Number(event.target.value) || 0)} />
          </label>
          <select className="cc-field" aria-label="Advantage" value={advantage} onChange={(event) => setAdvantage(event.target.value)}>
            <option value="">Normal</option>
            <option value="advantage">Advantage</option>
            <option value="disadvantage">Disadvantage</option>
          </select>
        </section>

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <div className="cc-main-grid five-main">
              <section className="cc-panel five-abilities" aria-label="Abilities">
                <div className="five-ability-head">
                  <span />
                  <small>Score</small>
                  <small>Check</small>
                  <small>Prof</small>
                  <small>Save</small>
                </div>
                {STATS.map((stat) => {
                  const row = abilities[stat] ?? {};
                  return (
                    <div key={stat} className="five-ability" data-ability={stat}>
                      <b>{titled(stat)}</b>
                      <Field value={num(row.score)} number editable={editable} label={`${stat} score`} onSave={numberAt(`abilities.${stat}.score`)} />
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Roll a ${stat} check`} aria-label={`${stat} check`} data-roll-check={stat} onClick={() => roll("check", stat)}>
                        {signed(num(row.bonus))}
                      </button>
                      <input type="checkbox" checked={num(row.saveprof) === 1} disabled={!editable} title="Proficient in this saving throw" aria-label={`${stat} save proficiency`} onChange={(event) => change(`abilities.${stat}.saveprof`, event.target.checked ? 1 : 0)} />
                      <button type="button" className="cc-save" disabled={!editable} title={`Roll a ${stat} saving throw`} aria-label={`${stat} save`} data-roll-save={stat} onClick={() => roll("save", stat)}>
                        {signed(num(row.save))}
                      </button>
                    </div>
                  );
                })}
              </section>
              <section className="cc-panel five-defence">
                <div className="five-big" title={`${words.acLong}${ac.armor ? `: ${String(ac.armor)}` : ""}${num(ac.shield) ? ` and a shield` : ""}`}>
                  <small>{words.ac}</small>
                  <span className="cc-shield" data-stat="ac">{num(ac.total)}</span>
                </div>
                <div className="five-big">
                  <small>{words.hp}</small>
                  <span data-stat="hp" style={{ color: current <= 0 ? "#c0392b" : undefined }}>
                    {current} / {num(hp.total)}
                  </span>
                  <span className="cc-inline">
                    Wounds <Field value={num(hp.wounds)} number editable={editable} label="Wounds" onSave={numberAt("hp.wounds")} />
                  </span>
                  <span className="cc-inline">
                    Temp <Field value={num(hp.temp)} number editable={editable} label={`Temporary ${words.hp.toLowerCase()}`} onSave={numberAt("hp.temp")} />
                  </span>
                </div>
                <div className="five-big">
                  <small>Initiative</small>
                  <span data-stat="init">{signed(num((data.initiative as Row)?.total))}</span>
                </div>
                <div className="five-big">
                  <small>Speed</small>
                  <span>{String(data.speed ?? "")}</span>
                </div>
                <div className="five-big">
                  <small>Passive Perception</small>
                  <span data-stat="passive">{num(data.passive)}</span>
                </div>
                {profile.dread ? (
                  // Descending Darkness's Dread: 3 or more, disadvantage on Wisdom; 6, the character breaks.
                  <div className="five-big five-dread" data-stat="dread" title="Dread: horrors, darkness and loss build it; a night's rest by a fire lowers it by 1. At 3 or more, disadvantage on Wisdom checks and saves; at 6 the character breaks (the GM says how).">
                    <small>Dread</small>
                    <span className="five-dread-track">
                      {Array.from({ length: 6 }, (_, index) => (
                        <button
                          key={index}
                          type="button"
                          className={index < num(data.dread) ? "on" : ""}
                          disabled={!editable}
                          aria-label={`Dread ${index + 1}`}
                          onClick={() => change("dread", num(data.dread) === index + 1 ? index : index + 1)}
                        />
                      ))}
                    </span>
                    <span className="hint">{num(data.dread) >= 6 ? "Broken" : num(data.dread) >= 3 ? "Shaken: disadvantage on Wisdom" : ""}</span>
                  </div>
                ) : null}
                {current <= 0 && profile.dying === "bleed" ? (
                  <div className="five-big five-death" data-dying>
                    <small>Dying</small>
                    <span className="hint">Loses 1 {words.hp} each turn until an ally steadies them (Wisdom 12); dead at {-num(hp.total)}.</span>
                  </div>
                ) : null}
                {current <= 0 && profile.dying === "saves" ? (
                  <div className="five-big five-death" data-death-saves>
                    <small>Death saves</small>
                    <span>
                      {"✓".repeat(num((data.deathsaves as Row)?.success))}
                      {"✗".repeat(num((data.deathsaves as Row)?.failure))}
                    </span>
                    {inFight && editable ? (
                      <button type="button" data-action="death-save" onClick={() => session.ct("death-save", { id: inFight.id })}>
                        Roll
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <p className="hint">{String(data.senses ?? "")}</p>
              </section>
            </div>
          </div>
        ) : null}

        {tab === "skills" ? (
          <section className="cc-panel five-skills cc-page" data-tab-page="skills">
            {Object.entries(SKILLS).map(([key, [name, stat]]) => {
              const row = skills[key] ?? {};
              const prof = num(row.prof);
              return (
                <div key={key} className="five-skill" data-skill={key}>
                  <select className="cc-field" value={prof} disabled={!editable} aria-label={`${name} proficiency`} title="Proficiency: none, proficient, expertise" onChange={(event) => change(`skills.${key}.prof`, Number(event.target.value))}>
                    <option value={0}>–</option>
                    <option value={1}>●</option>
                    <option value={2}>◆</option>
                  </select>
                  <span>
                    {name} <small className="hint">{String(stat).slice(0, 3).toUpperCase()}</small>
                  </span>
                  <button type="button" className="cc-bonus" disabled={!editable} aria-label={`Roll ${name}`} data-roll-skill={key} onClick={() => roll("skill", name)}>
                    {signed(num(row.total))}
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
              {rows(data.attacks).map(([key, attack]) => (
                <li key={key} data-attack={key}>
                  <b>{String(attack.name)}</b>
                  <button type="button" data-action="attack" disabled={!editable} title="Attack roll" onClick={() => session.ct("attack", { recordId: record.id, weapon: key })}>
                    {signed(num(attack.bonus))}
                  </button>
                  <button type="button" data-action="damage" disabled={!editable} title="Damage roll" onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })}>
                    {String(attack.damage)} {String(attack.dmgtype ?? "")}
                  </button>
                </li>
              ))}
            </ul>
            {rows(data.attacks).length === 0 ? <p className="hint">No weapon in hand: equip one on the Inventory tab.</p> : null}
          </section>
        ) : null}

        {tab === "spells" ? <Spells5e record={record} session={session} editable={editable} /> : null}

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
              <Field value={String(data.alignment ?? "")} editable={editable} label="Alignment" onSave={(value) => change("alignment", value)} />
              <small>Alignment</small>
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

// Spells: the save DC and attack, slots left (click to use or get one back), each spell with Cast.
function Spells5e({ record, session, editable }: { record: TableRecord; session: Session; editable: boolean }) {
  const data = record.data as Row;
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const casting = (data.spellcasting ?? null) as Row | null;
  const slots = rows(data.slots).sort((a, b) => a[0].localeCompare(b[0]));
  const known = (Array.isArray(data.spells) ? data.spells : []).map(String);
  const book = Object.values(session.records).filter((item) => item.type === "spell");
  if (!casting) return <section className="cc-panel cc-page" data-tab-page="spells"><p className="hint">No spellcasting in this class.</p></section>;
  return (
    <section className="cc-panel cc-page" data-tab-page="spells">
      <p className="cc-inline">
        <b>Spell save DC</b> <span className="cc-num" data-stat="spell-dc">{num(casting.dc)}</span> <b>Spell attack</b> <span className="cc-num">{signed(num(casting.attack))}</span> <small className="hint">{titled(String(casting.stat))}</small>
      </p>
      <div className="five-slots">
        {slots.map(([key, slot]) => (
          <span key={key} className="five-slot" data-slot={key}>
            <b>Level {key.slice(1)}</b>{" "}
            {Array.from({ length: num(slot.max) }, (_, index) => (
              <input key={index} type="checkbox" checked={index < num(slot.used)} disabled={!editable} aria-label={`Level ${key.slice(1)} slot ${index + 1} used`} onChange={(event) => change(`slots.${key}.used`, event.target.checked ? index + 1 : index)} />
            ))}
          </span>
        ))}
      </div>
      <ul className="five-spells">
        {known.map((name) => {
          const spell = book.find((item) => item.name.toLowerCase() === name.toLowerCase());
          return (
            <li key={name} data-spell={name}>
              <b>{name}</b> <small className="hint">{spell ? (num(spell.data.level) ? `level ${num(spell.data.level)}` : "cantrip") : ""}</small>
              {editable ? (
                <button type="button" data-action="cast" onClick={() => session.ct("cast", { recordId: record.id, power: name })}>
                  Cast
                </button>
              ) : null}
              <p className="hint">{plain(spell?.data.description).slice(0, 220)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The 5E character wizard (FG 5E's wizard, made short): who, species, class,
// background, the scores (the standard array, or typed), the class's skills,
// starting gear (the class's option A, or none) and spells; the host builds it.
export function Wizard5e({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const of = (type: string) => records.filter((item) => item.type === type).sort((a, b) => a.name.localeCompare(b.name));
  const classes = of("class");
  const species = of("race");
  const backgrounds = of("background");
  const [name, setName] = useState("");
  const [cls, setCls] = useState(classes[0]?.name ?? "");
  const [kind, setKind] = useState(species[0]?.name ?? "");
  const [background, setBackground] = useState(backgrounds[0]?.name ?? "");
  const profile = profileFor(session.ruleset);
  const words = profile.labels;
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(STATS.map((stat, index) => [stat, profile.standardArray[index]])));
  const [skills, setSkills] = useState<string[]>([]);
  const [spells, setSpells] = useState<string[]>([]);
  const [gear, setGear] = useState(true);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [art, setArt] = useState<{ portrait?: string; token?: string }>({});
  const classRecord = classes.find((item) => item.name === cls);
  const choices = classRecord ? classSkillChoices(classRecord) : { count: 0, names: [] as string[] };
  const caster = CASTERS[skillKey(cls) as keyof typeof CASTERS];
  // The class's own spells (a spell names who casts it), cantrips and 1st level.
  const spellList = useMemo(
    () => of("spell").filter((item) => num(item.data.level) <= 1 && (!item.data.source || new RegExp(`\\b${cls}\\b`, "i").test(String(item.data.source)))),
    [records.length, cls], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const kinRecord = species.find((item) => item.name === kind);
  const adjust = abilityAdjustments(kinRecord) as Record<string, number>;
  // A kin may limit the classes (Descending Darkness: a dwarf is a fighter, cleric or thief).
  const allowed = kinRecord?.data.classes ? String(kinRecord.data.classes).split(/,\s*/).map((item) => item.trim().toLowerCase()) : null;
  const classOptions = allowed ? classes.filter((item) => allowed.includes(item.name.toLowerCase())) : classes;
  useEffect(() => {
    if (classOptions.length && !classOptions.some((item) => item.name === cls)) {
      setCls(classOptions[0].name);
      setSkills([]);
      setSpells([]);
    }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const startingGear = (): [string, number][] => {
    const option = rows(classRecord?.data.startingequipmentlist)[0]?.[1];
    return rows(option?.items).map(([, item]) => [String(item.name), num(item.count) || 1]);
  };
  const finish = async () => {
    setBusy(true);
    setProblem("");
    try {
      const id = await session.buildCharacter({ name: name || "Adventurer", class: cls, species: kind, background, level: 1, scores, skills: skills.map((key) => SKILLS[key as keyof typeof SKILLS][0]), gear: gear ? startingGear() : [], spells, ...art });
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (classes.length === 0) return <p className="hint">No classes yet: the GM makes the {profile.id === "dnd5e" ? "SRD player book" : `${profile.name} Player's Handbook`} active (Books).</p>;
  return (
    <section className="wizard-5e cc-panel" aria-label={`${words.game} character wizard`} data-wizard={profile.id}>
      <header className="cc-row">
        <b>New {words.game} character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || skills.length !== choices.count} title={skills.length !== choices.count ? `Choose ${choices.count} skills` : "Make the character"} onClick={() => void finish()}>
          Finish
        </button>
      </header>
      <div className="wizard-5e-grid">
        <ArtChoice session={session} race={kind} cls={cls} value={art} onChange={setArt} />
        <label>
          Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" />
        </label>
        <label>
          {words.species}
          <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Species">
            {species.map((item) => (
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
              setSkills([]);
              setSpells([]);
            }}
          >
            {classOptions.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Background
          <select value={background} onChange={(event) => setBackground(event.target.value)} aria-label="Background">
            {backgrounds.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>
      <h4>
        Ability scores <small className="hint">the array {profile.standardArray.join(", ")} to start; type your own{Object.keys(adjust).length ? `; then the ${kind}'s adjustments` : ""}</small>
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
      <h4>
        Skills <small className="hint">choose {choices.count} ({skills.length} chosen); the background gives its own</small>
      </h4>
      <div className="wizard-5e-skills">
        {choices.names.map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={skills.includes(key)}
              data-wizard-skill={key}
              disabled={!skills.includes(key) && skills.length >= choices.count}
              onChange={(event) => setSkills(event.target.checked ? [...skills, key] : skills.filter((item) => item !== key))}
            />
            {SKILLS[key as keyof typeof SKILLS]?.[0]}
          </label>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={gear} onChange={(event) => setGear(event.target.checked)} /> The class's starting gear (option A)
      </label>
      {caster ? (
        <>
          <h4>Spells <small className="hint">cantrips and 1st-level spells</small></h4>
          <div className="wizard-5e-spells">
            {spellList.map((spell) => (
              <label key={spell.id}>
                <input type="checkbox" checked={spells.includes(spell.name)} onChange={(event) => setSpells(event.target.checked ? [...spells, spell.name] : spells.filter((item) => item !== spell.name))} />
                {spell.name} <small className="hint">{num(spell.data.level) ? "1st" : "cantrip"}</small>
              </label>
            ))}
          </div>
        </>
      ) : null}
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
