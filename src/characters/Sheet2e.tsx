import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtChoice, ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { CLASSES, classesFor, classKey, GROUPS, MAX_LEVEL, orderFor, RACES, raceKey, SAVE_NAMES, SAVES, signed, splitClasses, STANDARD_ARRAY, STATS } from "../../shared/adnd2e/rules.mjs";

// The AD&D 2E character sheet, laid out as FG's 2E sheet in Kraken's sheet
// style: portrait and who they are on top; tabs down the right (Main,
// Combat, Skills, Spells, Inventory, Notes). Click a number to roll it in
// front of the table: a save (d20 at or above), an ability check (d20 at or
// under the score), a thief skill (d100 at or under); the host works every
// number out again from what is typed (shared/adnd2e/rules.mjs).

type Row = Record<string, unknown>;
const TABS = ["main", "combat", "skills", "spells", "inventory", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
// What each ability's table says, as FG's 2E sheet shows it.
const ABILITY_NOTES: Record<string, (row: Row) => string> = {
  strength: (row) => `Hit ${signed(num(row.hitadj))}, damage ${signed(num(row.dmgadj))}, weight ${num(row.weightallow)} lb., open doors ${String(row.opendoors ?? "")}, bend bars ${num(row.bendbars)}%`,
  dexterity: (row) => `Reaction ${signed(num(row.reactionadj))}, missile ${signed(num(row.missileadj))}, defense ${signed(num(row.defenseadj))}`,
  constitution: (row) => `Hit points ${signed(num(row.hitpointadj))} (warriors ${signed(num(row.warriorhpadj))}), system shock ${num(row.systemshock)}%, resurrection ${num(row.resurrectionsurvival)}%`,
  intelligence: (row) => `${num(row.languages)} languages, spell level ${num(row.spelllevel) || "—"}, learn ${num(row.learn)}%, max spells ${num(row.maxspells) >= 99 ? "all" : num(row.maxspells)}`,
  wisdom: (row) => `Magic defense ${signed(num(row.magicdefenseadj))}, bonus spells ${String(row.spellbonus ?? "None")}, failure ${num(row.failure)}%`,
  charisma: (row) => `Henchmen ${num(row.maxhench)}, loyalty ${signed(num(row.loyalty))}, reaction ${signed(num(row.reaction))}`,
};

export function Sheet2e({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [mod, setMod] = useState(0);
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const data = record.data as Row;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const numberAt = (path: string) => (value: string) => change(path, Number(value) || 0);
  const abilities = (data.abilities ?? {}) as Record<string, Row>;
  const saves = (data.saves ?? {}) as Record<string, Row>;
  const hp = (data.hp ?? {}) as Row;
  const ac = (data.ac ?? {}) as Row;
  const profs = (data.profs ?? {}) as Row;
  const classes = (Array.isArray(data.classes) ? data.classes : []) as Row[];
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const roll = (kind: "check" | "save" | "skill", key: string) => {
    if (!editable) return;
    // A save in a fight goes through the tracker (its effects count); else straight to chat.
    if (kind === "save" && inFight) session.ct("save", { id: inFight.id, attribute: key, cl: mod });
    else session.siegeCheck(record.id, kind === "skill" ? "" : key, 0, false, { kind, ...(kind === "skill" ? { skill: key } : {}), bonus: mod });
  };
  const ready = num(data.expnext) > 0 && num(data.exp) >= num(data.expnext);
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const current = num(hp.total) + num(hp.temp) - num(hp.wounds);
  const status = current <= -10 ? "Dead" : current <= 0 ? (num(data.stable) ? "Unconscious" : "Dying") : "";
  const casting = (Array.isArray(data.spellcasting) ? data.spellcasting : []) as Row[];
  const skills = rows(data.thiefskills);
  const spent = skills.reduce((sum, [, row]) => sum + num(row.points), 0);

  return (
    <article className="cc-sheet sheet-5e sheet-35 sheet-2e" data-character={record.id} data-ruleset="adnd2e">
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
          {classes.map((item) => (
            <span key={String(item.name)} className="cc-inline" title={`${String(item.name)}: ${num(item.exp)} of ${num(item.expnext) || "—"} XP`}>
              <b>{String(item.name)}</b> <span className="cc-num" data-stat={`level-${classKey(String(item.name))}`}>{num(item.level)}</span>
              {editable && (ready || session.role === "dm") && num(item.level) < MAX_LEVEL ? (
                <button type="button" className="cc-levelup" data-action="level-up" data-level-class={String(item.name)} title={`Level up as a ${String(item.name).toLowerCase()}: the host rolls the hit die`} onClick={() => session.levelUp(record.id, String(item.name))}>
                  <Icon name="add" size={14} />
                </button>
              ) : null}
            </span>
          ))}
          <span className="cc-inline">
            <b>XP</b> <Field value={num(data.exp)} number editable={editable} label="Experience" onSave={numberAt("exp")} /> / <span className="cc-num">{num(data.expnext) || "—"}</span>
          </span>
          <span className="cc-inline" title="To Hit Armor Class 0: an attack hits when d20 + modifiers reaches THAC0 - the target's AC">
            <b>THAC0</b> <span className="cc-num" data-stat="thaco">{num(data.thaco)}</span>
          </span>
          <label className="cc-inline" title="A modifier for the next roll: added to a save, taken off an ability check or a thief skill's d100">
            <b>Mod</b> <input type="number" className="cc-field number" value={mod} min={-20} max={20} aria-label="Roll modifier" onChange={(event) => setMod(Number(event.target.value) || 0)} />
          </label>
        </section>

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <div className="cc-main-grid five-main">
              <section className="cc-panel five-abilities" aria-label="Abilities">
                {STATS.map((stat) => {
                  const row = abilities[stat] ?? {};
                  return (
                    <div key={stat} className="five-ability d2e-ability" data-ability={stat}>
                      <b>{titled(stat)}</b>
                      <span className="d2e-score">
                        <Field value={num(row.score)} number editable={editable} label={`${stat} score`} onSave={numberAt(`abilities.${stat}.score`)} />
                        {stat === "strength" && num(row.score) === 18 && classes.some((item) => item.group === "warrior") ? (
                          <>
                            /<Field value={num(row.percent)} number editable={editable} label="Exceptional strength" onSave={numberAt("abilities.strength.percent")} />
                          </>
                        ) : null}
                      </span>
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Roll a ${stat} check: d20 at or under ${num(row.score)}`} aria-label={`${stat} check`} data-roll-check={stat} onClick={() => roll("check", stat)}>
                        d20
                      </button>
                      <small className="hint d2e-note">{ABILITY_NOTES[stat]?.(row)}</small>
                    </div>
                  );
                })}
              </section>
              <section className="cc-panel five-defence">
                <div className="five-big" title={`Armor ${num(ac.armor)}, shield -${num(ac.shield)}, magic -${num(ac.magic)}, Dexterity ${signed(num(ac.dex))}, misc ${signed(num(ac.misc))}`}>
                  <small>Armor Class</small>
                  <span className="cc-shield" data-stat="ac">{num(ac.total)}</span>
                  <span className="cc-inline">
                    Rear <b>{num(ac.rear)}</b> · No shield <b>{num(ac.shieldless)}</b> · Misc <Field value={num(ac.misc)} number editable={editable} label="AC misc" onSave={numberAt("ac.misc")} />
                  </span>
                </div>
                <div className="five-big">
                  <small>Hit Points</small>
                  <span data-stat="hp" style={{ color: current <= 0 ? "#c0392b" : undefined }}>
                    {current} / {num(hp.total)}
                  </span>
                  <span className="cc-inline">
                    Wounds <Field value={num(hp.wounds)} number editable={editable} label="Wounds" onSave={numberAt("hp.wounds")} /> Temp <Field value={num(hp.temp)} number editable={editable} label="Temporary hit points" onSave={numberAt("hp.temp")} />
                  </span>
                  {status ? (
                    <span className="hint" data-status={status}>
                      {status === "Dying" ? "Dying: unconscious, 1 hit point lost each round until someone binds the wounds; dead at -10." : status === "Unconscious" ? "Unconscious: the wounds are bound; no longer dying." : "Dead."}
                    </span>
                  ) : null}
                </div>
                <div className="five-big" title="d10 + this, lowest acts first">
                  <small>Initiative</small>
                  <span data-stat="init">{signed(num((data.initiative as Row)?.total))}</span>
                </div>
                <div className="five-big">
                  <small>Movement</small>
                  <span>
                    <Field value={num(data.movement)} number editable={editable} label="Movement" onSave={numberAt("movement")} />
                  </span>
                </div>
              </section>
            </div>
            <section className="cc-panel d2e-saves" aria-label="Saving throws">
              <h4>
                Saving throws <small className="hint">d20 at or above the number</small>
              </h4>
              {SAVES.map((save) => {
                const row = saves[save] ?? {};
                return (
                  <div key={save} className="five-ability d35-save" data-save={save} title={`Base ${num(row.base)}${num(row.racial) ? `, racial -${num(row.racial)}` : ""}${num(row.misc) ? `, misc -${num(row.misc)}` : ""}`}>
                    <b>{SAVE_NAMES[save as keyof typeof SAVE_NAMES]}</b>
                    <Field value={num(row.misc)} number editable={editable} label={`${save} misc`} onSave={numberAt(`saves.${save}.misc`)} />
                    <button type="button" className="cc-save" disabled={!editable} title={`Roll a save: d20 at or above ${num(row.total)}`} aria-label={`${save} save`} data-roll-save={save} onClick={() => roll("save", save)}>
                      {num(row.total)}
                    </button>
                  </div>
                );
              })}
              {((data.savenotes ?? []) as string[]).map((note) => (
                <p key={note} className="hint">
                  {note}
                </p>
              ))}
            </section>
          </div>
        ) : null}

        {tab === "combat" ? (
          <section className="cc-panel cc-page" data-tab-page="combat">
            <h4>Attacks {targetNames.length ? <small className="hint">at {targetNames.join(", ")}</small> : <small className="hint">Ctrl+click a token to target it</small>}</h4>
            <p className="hint">
              THAC0 {num(data.thaco)}: d20 + to-hit at or above THAC0 - the target's AC. Attacks a round {String(data.rate ?? "1/1")}.
            </p>
            <ul className="five-attacks">
              {rows(data.attacks).map(([key, attack]) => (
                <li key={key} data-attack={key}>
                  <b>{String(attack.name)}</b>
                  {attack.proficient === false ? <small className="hint" title="Not proficient">(nonproficient)</small> : null}
                  <button type="button" data-action="attack" disabled={!editable} title="One attack roll at each target" onClick={() => session.ct("attack", { recordId: record.id, weapon: key })}>
                    {signed(num(attack.tohit))}
                  </button>
                  {String(data.rate) !== "1/1" ? (
                    <button type="button" data-action="full-attack" disabled={!editable} title={`A full round's attacks (${String(data.rate)}) at the first target`} onClick={() => session.ct("attack", { recordId: record.id, weapon: key, full: true })}>
                      {String(data.rate)}
                    </button>
                  ) : null}
                  <button type="button" data-action="damage" disabled={!editable} title="Damage roll: Small or Medium / Large (by the target)" onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })}>
                    {String(attack.damage)} / {String(attack.damagelarge)}
                  </button>
                  <small className="hint" title="Speed factor">
                    SF {num(attack.speed)}
                  </small>
                </li>
              ))}
            </ul>
            <h4>
              Weapon proficiencies <small className="hint">{num(profs.weaponslots)} slots; nonproficient {signed(num(profs.penalty))} to hit</small>
            </h4>
            <Field value={((profs.weapon ?? []) as string[]).join("\n")} area editable={editable} label="Weapon proficiencies" onSave={(value) => change("profs.weapon", value)} />
          </section>
        ) : null}

        {tab === "skills" ? (
          <section className="cc-panel cc-page" data-tab-page="skills">
            {skills.length ? (
              <>
                <h4>
                  {String(data.skillclass ?? "Thief")} skills <small className="hint">d100 at or under; {spent} of {num(data.skillpoints)} points spent</small>
                </h4>
                <div className="five-skills d2e-skills">
                  {skills.map(([key, row]) => (
                    <div key={key} className="five-skill" data-skill={key} title={`Base ${num(row.base)}, race ${signed(num(row.race))}, Dexterity ${signed(num(row.dex))}, points ${num(row.points)}, misc ${signed(num(row.misc))}`}>
                      <Field value={num(row.points)} number editable={editable} label={`${String(row.name)} points`} onSave={numberAt(`thiefskills.${key}.points`)} />
                      <span>{String(row.name)}</span>
                      <button type="button" className="cc-bonus" disabled={!editable} aria-label={`Roll ${String(row.name)}`} data-roll-skill={key} onClick={() => roll("skill", key)}>
                        {num(row.total)}%
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <h4>
              Nonweapon proficiencies <small className="hint">{num(profs.nonweaponslots)} slots</small>
            </h4>
            <Field value={((profs.nonweapon ?? []) as string[]).join("\n")} area editable={editable} label="Nonweapon proficiencies" onSave={(value) => change("profs.nonweapon", value)} />
            <p className="hint">One a line. A proficiency check is an ability check (Mod: the proficiency's modifier).</p>
          </section>
        ) : null}

        {tab === "spells" ? (
          <section className="cc-panel cc-page" data-tab-page="spells">
            {casting.length ? (
              casting.map((row, index) => {
                const perday = (Array.isArray(row.perday) ? row.perday : []) as number[];
                const used = (Array.isArray(row.used) ? row.used : []) as number[];
                return (
                  <div key={String(row.class)} className="d35-perday" data-perday={String(row.class)}>
                    <p className="hint">
                      {String(row.class)} ({String(row.kind) === "arcane" ? "wizard" : "priest"} spells a day). Click a box to use a spell of that level, again to get it back.
                    </p>
                    {perday.map((max, level) =>
                      max > 0 ? (
                        <div key={level} className="d35-slots" data-spell-level={level + 1}>
                          <b>{ORDINAL[level]}</b>
                          {Array.from({ length: max }, (_, slot) => (
                            <button
                              key={slot}
                              type="button"
                              className={slot < num(used[level]) ? "used" : ""}
                              disabled={!editable}
                              aria-label={`${String(row.class)} ${ORDINAL[level]} level spell ${slot + 1}`}
                              onClick={() => change(`spellcasting.${index}.used.${level}`, slot < num(used[level]) ? slot : slot + 1)}
                            />
                          ))}
                        </div>
                      ) : null,
                    )}
                  </div>
                );
              })
            ) : (
              <p className="hint">This character casts no spells (yet: paladins from 9th level, rangers from 8th, bards from 2nd).</p>
            )}
            <h4>Spells known or memorized</h4>
            <Field value={((data.spells ?? []) as string[]).join("\n")} area editable={editable} label="Spells" onSave={(value) => change("spells", value)} />
            <p className="hint">One spell a line, or drop a spell on the sheet.</p>
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
            {num(data.infravision) ? <p className="hint">Infravision {num(data.infravision)} feet.</p> : null}
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

// The 2E character wizard: a book's pregenerated character taken as it is,
// or name, race, class (single or the race's multi-classes) and level, the
// ability scores (an array put in the class's order, or your own), then the
// host builds the rest: hit points (the die's highest, then its average),
// the kit, proficiencies, thief skills.
const arrayFor = (cls: string) => {
  const order = orderFor(cls) as string[];
  return Object.fromEntries(STATS.map((stat) => [stat, STANDARD_ARRAY[order.indexOf(stat)]])) as Record<string, number>;
};
export function Wizard2e({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const pregens = useMemo(() => records.filter((item) => item.type === "pregencharsheet" && (item.data as Row)?.classes).sort((a, b) => a.name.localeCompare(b.name)), [records.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pregen, setPregen] = useState("");
  const [name, setName] = useState("");
  const [race, setRace] = useState("Human");
  const [cls, setCls] = useState("Fighter");
  const [level, setLevel] = useState(1);
  const [scores, setScores] = useState<Record<string, number>>(() => arrayFor("Fighter"));
  const [percent, setPercent] = useState(50);
  const [art, setArt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const allowed = classesFor(race) as string[];
  const adjust = (RACES[raceKey(race) as keyof typeof RACES]?.adjust ?? {}) as Record<string, number>;
  const picked = splitClasses(cls) as { name: string; group: string; needs: Record<string, number> }[];
  const warrior = picked.some((item) => item.group === "warrior");
  const finish = async () => {
    setBusy(true);
    setProblem("");
    try {
      const spec = pregen ? { pregen, ...(name ? { name } : {}), ...art } : { name: name || "Adventurer", class: cls, race, level, scores: { ...scores, strengthPercent: percent }, ...art };
      const id = await session.buildCharacter(spec);
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="wizard-5e wizard-35 wizard-2e cc-panel" aria-label="AD&D 2E character wizard" data-wizard="adnd2e">
      <header className="cc-row">
        <b>New AD&amp;D 2E character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy} title="Make the character" onClick={() => void finish()}>
          Finish
        </button>
      </header>
      {pregens.length ? (
        <label className="wizard-2e-pregen">
          A ready-made character from your books
          <select value={pregen} onChange={(event) => setPregen(event.target.value)} aria-label="Pregenerated character">
            <option value="">None: make my own</option>
            {pregens.map((item) => {
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
      <div className="wizard-5e-grid">
        <ArtChoice session={session} race={race} cls={cls} value={art} onChange={setArt} />
        <label>
          Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" placeholder={pregen ? "as the book has it" : ""} />
        </label>
        {pregen ? null : (
          <>
            <label>
              Race
              <select
                value={race}
                onChange={(event) => {
                  setRace(event.target.value);
                  if (!(classesFor(event.target.value) as string[]).includes(cls)) {
                    setCls("Fighter");
                    setScores(arrayFor("Fighter"));
                  }
                }}
                aria-label="Race"
              >
                {Object.values(RACES).map((item) => (
                  <option key={item.name}>{item.name}</option>
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
                {allowed.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Level
              <input type="number" min={1} max={MAX_LEVEL} value={level} aria-label="Level" onChange={(event) => setLevel(Math.min(MAX_LEVEL, Math.max(1, Number(event.target.value) || 1)))} />
            </label>
          </>
        )}
      </div>
      {pregen ? (
        <p className="hint">The character comes as the book made it: scores, hit points, gear, proficiencies. Change anything on the sheet.</p>
      ) : (
        <>
          <p className="hint" data-class-info>
            {picked
              .map((item) => {
                const kind = GROUPS[item.group as keyof typeof GROUPS];
                const needs = Object.entries(item.needs)
                  .map(([stat, value]) => `${stat.slice(0, 3).toUpperCase()} ${value}`)
                  .join(", ");
                return `${item.name}: a ${item.group}, hit die d${kind.die}; needs ${needs}`;
              })
              .join(". ")}
            {picked.length > 1 ? ". A multi-class character's hit points are divided by its classes, its experience split between them." : "."}
          </p>
          <h4>
            Ability scores <small className="hint">{STANDARD_ARRAY.join(", ")} in the class's order, its minimums met; type your own (rolled 3d6 or 4d6, as your table plays){Object.keys(adjust).length ? `; then the ${race.toLowerCase()}'s adjustments` : ""}</small>
          </h4>
          <div className="wizard-5e-scores">
            {STATS.map((stat) => (
              <label key={stat}>
                {stat.slice(0, 3).toUpperCase()}
                <input type="number" min={3} max={19} value={scores[stat]} aria-label={`${stat} score`} onChange={(event) => setScores({ ...scores, [stat]: Number(event.target.value) || 10 })} />
                <small>{adjust[stat] ? <b data-adjust={stat}>{signed(adjust[stat])} = {scores[stat] + adjust[stat]}</b> : null}</small>
              </label>
            ))}
            {warrior && scores.strength + (adjust.strength ?? 0) === 18 ? (
              <label>
                18/
                <input type="number" min={1} max={100} value={percent} aria-label="Exceptional strength" onChange={(event) => setPercent(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} />
                <small>exceptional (100 = 00)</small>
              </label>
            ) : null}
          </div>
          <p className="hint">The host works out the rest: hit points (the die's highest, then its average), THAC0 and saves, the kit ({Object.keys(CLASSES).length} classes' weapons and armor, or your books' items), proficiencies, thief skills. Change any of it on the sheet.</p>
        </>
      )}
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
