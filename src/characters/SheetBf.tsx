import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { useHostRolls } from "./hostRolls";
import { priceOf } from "../../shared/shop.mjs";
import * as R from "../../shared/bfrpg/rules.mjs";

// The Basic Fantasy character sheet and its wizard, in Kraken's sheet style:
// portrait and who they are on top; tabs down the right (Main, Combat,
// Skills, Spells, Inventory, Notes). Click a number to roll it in front of
// the table: a saving throw (d20 at or above), the book's optional ability
// roll (d20 + the bonus at or above the level's target), a thief ability
// (d100 at or under). Attacks go through the combat tracker (d20 + the
// attack bonus at or above the target's AC). The host works every number out
// again from what is typed (shared/bfrpg/rules.mjs).

type Row = Record<string, unknown>;
type Cls = { key: string; name: string; prime?: string; die: number; parts?: string[] };
type Race = { key: string; name: string; classes: string[]; min: Record<string, number>; max: Record<string, number> };
const CLASSES = R.CLASSES as unknown as Record<string, Cls>;
const RACES = R.RACES as unknown as Record<string, Race>;
const STATS = R.STATS as string[];
const SAVES = R.SAVES as string[];
const SAVE_NAMES = R.SAVE_NAMES as Record<string, string>;
const SHORT = R.SHORT as Record<string, string>;
const TABS = ["main", "combat", "skills", "spells", "inventory", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const signed = (n: number) => R.signed(n) as string;
const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const listText = (value: unknown) => (Array.isArray(value) ? value.map(String).join("\n") : "");

export function SheetBf({ record, session }: { record: TableRecord; session: Session }) {
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
  const attack = (data.attack ?? {}) as Row;
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const roll = (kind: "check" | "save" | "skill" | "morale", key: string) => {
    if (!editable) return;
    // A save in a fight goes through the tracker (its effects count); else straight to chat.
    if (kind === "save" && inFight) session.ct("save", { id: inFight.id, attribute: key, cl: mod });
    else session.siegeCheck(record.id, kind === "skill" ? "" : key, 0, false, { kind, ...(kind === "skill" ? { skill: key } : {}), bonus: mod });
  };
  const level = num(data.level) || 1;
  const exp = num(data.exp);
  const expnext = num(data.expnext);
  const ready = expnext > 0 && exp >= expnext;
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const current = num(hp.total) - num(hp.wounds);
  const casting = (data.spellcasting ?? null) as Row | null;
  const skills = rows(data.thiefskills);
  const arcane = casting?.kind === "arcane";

  return (
    <article className="cc-sheet sheet-5e sheet-35 sheet-2e sheet-bf" data-character={record.id} data-ruleset="bfrpg">
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
                <span className="cc-value" data-stat="race">{String(data.race ?? "")}</span>
                <small>Race</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="class">
                  {String(data.className ?? "")} {level}
                </span>
                <small>Class and level</small>
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
          <span className="cc-inline" title={`${exp} of ${expnext || "—"} experience points for the next level`}>
            <b>Level</b> <span className="cc-num" data-stat="level">{level}</span>
            {editable && (ready || session.role === "dm") && level < R.MAX_LEVEL ? (
              <button type="button" className="cc-levelup" data-action="level-up" title={`Level up: ${level + 1 <= 9 ? "the host rolls the hit die" : "the class's fixed hit points"}`} onClick={() => session.levelUp(record.id)}>
                <Icon name="add" size={14} />
              </button>
            ) : null}
          </span>
          <span className="cc-inline">
            <b>XP</b> <span className="cc-num" data-stat="exp">{exp}</span> / <span className="cc-num">{expnext || "—"}</span>
            {session.role === "dm" ? <Field value={exp} number editable label="Experience" onSave={numberAt("exp")} /> : null}
            {num(data.xpbonus) ? <small className="hint">+{num(data.xpbonus)}% XP</small> : null}
          </span>
          <span className="cc-inline" title="Attack bonus: add Strength in melee, Dexterity with missiles">
            <b>AB</b> <span className="cc-num" data-stat="ab">{signed(num(data.ab))}</span>
          </span>
          <label className="cc-inline" title="A modifier for the next roll: added to a save or an ability roll, taken off a thief ability's d100">
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
                    <div key={stat} className="five-ability" data-ability={stat}>
                      <b>{titled(stat)}</b>
                      <Field value={num(row.score)} number editable={editable} label={`${stat} score`} onSave={numberAt(`abilities.${stat}.score`)} />
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Ability roll: d20 ${signed(num(row.bonus))} at or above ${num(data.abilityTarget)} (the book's optional rule)`} aria-label={`${stat} roll`} data-roll-check={stat} onClick={() => roll("check", stat)}>
                        {signed(num(row.bonus))}
                      </button>
                    </div>
                  );
                })}
              </section>
              <section className="cc-panel five-defence">
                <div className="five-big" title={`Armor ${num(ac.armor)}${ac.worn ? ` (${String(ac.worn)})` : ""}, shield +${num(ac.shield)}, Dexterity ${signed(num(ac.dex))}, misc ${signed(num(ac.misc))}`}>
                  <small>Armor Class</small>
                  <span className="cc-shield" data-stat="ac">{num(ac.total)}</span>
                  <span className="cc-inline">
                    Misc <Field value={num(ac.misc)} number editable={editable} label="AC misc" onSave={numberAt("ac.misc")} />
                  </span>
                </div>
                <div className="five-big">
                  <small>Hit Points</small>
                  <span data-stat="hp" style={{ color: current <= 0 ? "#c0392b" : undefined }}>
                    {current} / {num(hp.total)}
                  </span>
                  <span className="cc-inline">
                    Damage <Field value={num(hp.wounds)} number editable={editable} label="Damage taken" onSave={numberAt("hp.wounds")} />
                  </span>
                  {current <= 0 ? <span className="hint" data-status="Dead">At 0 hit points a character is dead (the book's rule; the GM may use an optional one).</span> : null}
                </div>
                <div className="five-big" title="d6 + this, the highest acts first">
                  <small>Initiative</small>
                  <span data-stat="init">{signed(num((data.initiative as Row)?.total))}</span>
                </div>
                <div className="five-big" title={`${String(data.encumbrance ?? "")}: ${num(data.load)} lb. carried (light to ${num((data.loads as Row)?.light)}, heavy to ${num((data.loads as Row)?.heavy)})`}>
                  <small>Movement</small>
                  <span data-stat="movement">{num(data.movement)}'</span>
                  <small className="hint">{String(data.encumbrance ?? "")}</small>
                </div>
              </section>
            </div>
            <section className="cc-panel d2e-saves" aria-label="Saving throws">
              <h4>
                Saving throws <small className="hint">d20 at or above the number; a natural 1 fails, a 20 succeeds</small>
              </h4>
              {SAVES.map((save) => {
                const row = saves[save] ?? {};
                return (
                  <div key={save} className="five-ability d35-save" data-save={save} title={`Class ${num(row.base)}${num(row.racial) ? `, race -${num(row.racial)}` : ""}${num(row.misc) ? `, misc -${num(row.misc)}` : ""}`}>
                    <b>{SAVE_NAMES[save]}</b>
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
              d20 + attack bonus at or above the target's Armor Class: melee {signed(num(attack.melee))}, missile {signed(num(attack.missile))}. A natural 20 hits, a 1 misses.
              {data.sneakattack ? " Sneak attack (from behind, unseen): +4 to hit and double damage (add +4 in the tracker's ATK effect)." : ""}
            </p>
            <ul className="five-attacks">
              {rows(data.attacks).map(([key, item]) => (
                <li key={key} data-attack={key}>
                  <b>{String(item.name)}</b> {item.range ? <small className="hint">{String(item.range)}'</small> : null}
                  <button type="button" data-action="attack" disabled={!editable} title="One attack roll at each target" onClick={() => session.ct("attack", { recordId: record.id, weapon: key })}>
                    {signed(num(item.bonus))}
                  </button>
                  <button type="button" data-action="damage" disabled={!editable} title="Damage roll (at least 1)" onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })}>
                    {String(item.damage)}
                  </button>
                </li>
              ))}
            </ul>
            {rows(data.attacks).length === 0 ? <p className="hint">No weapon ready: ready one on the Inventory tab.</p> : null}
            {num(data.turn) > 0 ? (
              <p className="cc-inline">
                <b>Turn undead</b> as a level {num(data.turn)} Cleric: d20 against the Clerics vs. Undead table, 2d6 hit dice of undead affected.
                {inFight ? (
                  <button type="button" data-action="turn-undead" disabled={!editable} onClick={() => session.ct("turn-undead", { id: inFight.id, recordId: record.id })}>
                    Turn undead
                  </button>
                ) : (
                  <small className="hint">On the combat tracker, on your turn.</small>
                )}
              </p>
            ) : null}
          </section>
        ) : null}

        {tab === "skills" ? (
          <section className="cc-panel cc-page" data-tab-page="skills">
            {skills.length ? (
              <>
                <h4>
                  Thief abilities <small className="hint">d100 at or under; the GM rolls some in secret</small>
                </h4>
                <div className="five-skills d2e-skills">
                  {skills.map(([key, row]) => (
                    <div key={key} className="five-skill" data-skill={key} title={`Level ${level}: ${num(row.base)}%, misc ${signed(num(row.misc))}`}>
                      <Field value={num(row.misc)} number editable={editable} label={`${String(row.name)} misc`} onSave={numberAt(`thiefskills.${key}.misc`)} />
                      <span>{String(row.name)}</span>
                      <button type="button" className="cc-bonus" disabled={!editable} aria-label={`Roll ${String(row.name)}`} data-roll-skill={key} onClick={() => roll("skill", key)}>
                        {num(row.total)}%
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="hint">No thief abilities (a Thief's, or a Magic-User/Thief's).</p>
            )}
            {String(data.race) === "Halfling" ? <p className="hint">Halfling: hides with only a 10% chance of being seen outdoors (30% indoors); +1 with missiles and to initiative.</p> : null}
            {num(data.darkvision) ? <p className="hint">Darkvision {num(data.darkvision)}'.</p> : null}
            <p className="hint">Ability rolls (the book's optional rule): d20 + the ability's bonus at or above {num(data.abilityTarget)} at level {level}. Click an ability's bonus on the Main tab.</p>
          </section>
        ) : null}

        {tab === "spells" ? (
          <section className="cc-panel cc-page" data-tab-page="spells">
            {casting ? (
              <>
                <div className="d35-perday" data-perday={String(casting.kind)}>
                  <p className="hint">{arcane ? "Magic-User" : "Cleric"} spells a day. Click a box to use a spell of that level, again to get it back.</p>
                  {((casting.perday ?? []) as number[]).map((max, index) =>
                    max > 0 ? (
                      <div key={index} className="d35-slots" data-spell-level={index + 1}>
                        <b>{ORDINAL[index]}</b>
                        {Array.from({ length: max }, (_, slot) => {
                          const used = num(((casting.used ?? []) as number[])[index]);
                          return <button key={slot} type="button" className={slot < used ? "used" : ""} disabled={!editable} aria-label={`${ORDINAL[index]} level spell ${slot + 1}`} onClick={() => change(`spellcasting.used.${index}`, slot < used ? slot : slot + 1)} />;
                        })}
                      </div>
                    ) : null,
                  )}
                  {((casting.perday ?? []) as number[]).every((max) => !max) ? <p className="hint">No spells a day yet (a Cleric casts from 2nd level).</p> : null}
                </div>
                {arcane ? (
                  <>
                    <h4>Spellbook</h4>
                    <Field value={listText(data.spellbook)} area editable={editable} label="Spellbook" onSave={(value) => change("spellbook", value)} />
                  </>
                ) : null}
                <h4>Prepared today</h4>
                <Field value={listText(data.prepared)} area editable={editable} label="Prepared spells" onSave={(value) => change("prepared", value)} />
                <p className="hint">One spell a line, or drop a spell on the sheet.</p>
              </>
            ) : (
              <p className="hint">This character casts no spells (Clerics and Magic-Users do).</p>
            )}
          </section>
        ) : null}

        {tab === "inventory" ? (
          <section className="cc-panel cc-page" data-tab-page="inventory">
            <ul className="five-items">
              {rows(data.inventorylist).map(([key, item]) => (
                <li key={key} data-item={key}>
                  <select className="cc-field" value={num(item.carried) || 0} disabled={!editable} aria-label={`${String(item.name)} carried`} title="Ready (worn or in hand), carried or left behind" onChange={(event) => change(`inventorylist.${key}.carried`, Number(event.target.value))}>
                    <option value={2}>Ready</option>
                    <option value={1}>Carried</option>
                    <option value={0}>Left behind</option>
                  </select>
                  <Field value={num(item.count) || 1} number editable={editable} label={`${String(item.name)} count`} onSave={numberAt(`inventorylist.${key}.count`)} />
                  <span>
                    {String(item.name)} <small className="hint">{[item.type, item.damage, item.ac ? `AC ${num(item.ac)}` : "", item.acbonus ? `AC +${num(item.acbonus)}` : "", item.weight ? `${String(item.weight)} lb.` : ""].filter(Boolean).join(" · ")}</small>
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
            <p className="hint">
              Load {num(data.load)} lb. ({String(data.encumbrance ?? "")}); 1 pp = 5 gp, 1 gp = 10 sp, 1 ep = 5 sp, 1 sp = 10 cp.
            </p>
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            {(["playername", "deity", "languages", "gender", "age", "height", "weight"] as const).map((key) => (
              <label key={key} className="cc-labelled">
                <Field value={String(data[key] ?? "")} editable={editable} label={key === "playername" ? "Player" : titled(key)} onSave={(value) => change(key, value)} />
                <small>{key === "playername" ? "Player" : titled(key)}</small>
              </label>
            ))}
            <label className="cc-labelled">
              <Field value={num(data.loyalty)} number editable={session.role === "dm"} label="Loyalty" onSave={numberAt("loyalty")} />
              <small>Loyalty (a retainer's: 7 + the employer's Charisma bonus)</small>
            </label>
            <button type="button" disabled={!editable} data-action="loyalty-roll" title="Loyalty check: 2d6 at or under" onClick={() => roll("morale", "")}>
              Roll loyalty
            </button>
            <p className="hint">Retainers: at most {num(data.maxretainers)}.</p>
            <Field value={String(data.appearance ?? "")} area editable={editable} label="Appearance" onSave={(value) => change("appearance", value)} />
            <Field value={String(data.background ?? "")} area editable={editable} label="Background" onSave={(value) => change("background", value)} />
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
