import { useEffect, useState } from "react";
import { ClassLevel } from "./ClassLevel";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { hasLink, linkFrom, slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";

// The Castles & Crusades character sheet, laid out as FG's SC C&C sheet: the
// portrait and who they are always on top; tabs down the right side (Main,
// Combat, Abilities, Inventory, Spells, Notes); small fields to type in. The
// host works out every number again from what is typed (the SIEGE rules).
// A ruleset has its own sheet; this is C&C's.

const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
type Stat = (typeof STATS)[number];
const SHORT: Record<Stat, string> = { strength: "Str", dexterity: "Dex", constitution: "Con", intelligence: "Int", wisdom: "Wis", charisma: "Cha" };
// C&C's saving throws, by attribute (the Player's Handbook).
const SAVES: Record<Stat, string> = {
  strength: "Paralysis & Constriction",
  dexterity: "Breath Weapon & Traps",
  constitution: "Disease, Energy Drain & Poison",
  intelligence: "Arcane Magic & Illusion",
  wisdom: "Divine Magic, Confusion, Gaze Attack, Polymorph, Petrification",
  charisma: "Death Attack, Charm & Fear",
};
const TABS = ["main", "combat", "abilities", "inventory", "spells", "notes"] as const;
type Tab = (typeof TABS)[number];
const RANGED = /\b(bow|crossbow|sling|dart|javelin|blowgun)\b/i;

type Row = Record<string, unknown>;
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const at = (data: Row, path: string): unknown => path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Row)[key] : undefined), data);
const plain = (html: unknown) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// A field to type in: kept while typing, sent when it is left (or Enter).
export function Field({ value, onSave, number = false, editable, label, wide = false, area = false, className = "" }: { value: unknown; onSave: (value: string) => void; number?: boolean; editable: boolean; label?: string; wide?: boolean; area?: boolean; className?: string }) {
  const shown = value === undefined || value === null ? "" : String(value);
  const [text, setText] = useState(shown);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!typing) setText(shown);
  }, [shown, typing]);
  const commit = () => {
    setTyping(false);
    if (text !== shown) onSave(text);
  };
  const common = {
    className: `cc-field${number ? " number" : ""}${wide ? " wide" : ""} ${className}`,
    value: text,
    readOnly: !editable,
    "aria-label": label,
    title: label,
    onFocus: () => setTyping(true),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(event.target.value),
    onBlur: commit,
  };
  return area ? <textarea {...common} /> : <input {...common} inputMode={number ? "numeric" : undefined} onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()} />;
}

export function CCSheet({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [cl, setCl] = useState(0);
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const [language, setLanguage] = useState("");
  const [classPanel, setClassPanel] = useState(false);
  const [dropping, setDropping] = useState(false);
  const data = record.data as Row;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const numberAt = (path: string) => (value: string) => change(path, Number(value) || 0);
  const packages = rows(data.packages);
  const race = packages.find(([, pkg]) => String(pkg.packagetype).toLowerCase() === "race")?.[1];
  const classes = packages.filter(([, pkg]) => String(pkg.packagetype).toLowerCase() === "class").map(([, pkg]) => pkg);
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const level = num(data.level);
  const exp = num(data.exp);
  const next = num(data.expnext);
  const ready = next > 0 && exp >= next;
  const total = num(at(data, "hp.total"));
  const wounds = num(at(data, "hp.wounds"));
  const ac = (data.ac ?? {}) as Row;
  const sr = num(at(data, "sr.item")) + num(at(data, "sr.misc"));
  const inventory = rows(data.inventorylist);
  const weapons = inventory.filter(([, item]) => num(item.carried) === 2 && String(item.damage ?? "").trim() !== "");
  const load = (data.load ?? {}) as Row;
  const save = (stat: Stat, kind: "check" | "save") => {
    if (!editable) return;
    if (kind === "save" && inFight) session.ct("save", { id: inFight.id, attribute: stat, cl });
    else session.siegeCheck(record.id, stat, cl, kind === "save");
  };
  const portraitUrl = typeof data.portrait === "string" ? data.portrait : "";

  return (
    <article
      className={dropping ? "cc-sheet dropping" : "cc-sheet"}
      data-character={record.id}
      // A race, class, spell or item from a list, dropped anywhere on the sheet, goes where it belongs (FG's sheet drop).
      onDragOver={(event) => {
        if (!editable || !hasLink(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const link = linkFrom(event);
        if (!editable || !link || link.kind !== "record" || link.record === record.id) return;
        event.preventDefault();
        session.dropOnCharacter(record.id, link.record);
      }}
    >
      <div className="cc-body">
        <header className="cc-head">
          {/* The token as a small round badge on the portrait's corner. */}
          <div className="cc-portrait-frame">
            <button type="button" className="cc-portrait" data-action="pick-portrait" disabled={!editable} title={editable ? "Click to choose a portrait" : record.name} onClick={() => setPicking("portrait")} {...slotDrag({ kind: "sheet", record: record.id, label: record.name })}>
              {portraitUrl ? <Picture session={session} id={portraitUrl} alt={record.name} /> : <span>{record.name.slice(0, 1)}</span>}
            </button>
            <button type="button" className="cc-token" data-action="pick-token" disabled={!editable} title={editable ? "Click to choose a token (the portrait is used without one)" : "Token"} onClick={() => setPicking("token")}>
              {typeof data.token === "string" && data.token ? <Picture session={session} id={data.token} alt="Token" /> : portraitUrl ? <Picture session={session} id={portraitUrl} alt="Token" /> : <Icon name="character" size={18} />}
            </button>
          </div>
          <div className="cc-identity">
            <div className="cc-name-row">
              <label className="cc-labelled grow">
                <Field value={record.name} editable={editable} label="Name" className="cc-name" onSave={(value) => change("name", value)} />
                <small>Name</small>
              </label>
            </div>
            <div className="cc-boxes">
              <label className="cc-labelled cc-box">
                <span className="cc-value">{String(data.race ?? race?.name ?? "")}</span>
                <small>Race</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value">{classes.map((pkg) => `${String(pkg.name)}${classes.length > 1 ? ` ${num(pkg.level)}` : ""}`).join(" / ")}</span>
                <small>Class</small>
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

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <section className="cc-panel cc-row">
              <label className="cc-labelled grow">
                <Field value={data.playername ?? record.owner} editable={editable} label="Player name" onSave={(value) => change("playername", value)} />
                <small>Player name</small>
              </label>
              <span className="cc-inline">
                <b>Level</b> <span className="cc-num" data-stat="level">{level}</span>
                {next > 0 ? (
                  <button
                    type="button"
                    className={ready ? "cc-levelup ready" : "cc-levelup"}
                    data-action="level-up"
                    disabled={!editable || (!ready && session.role !== "dm")}
                    title={ready ? "Level up: enough experience for the next level" : session.role === "dm" ? `Level up early (${next - exp} XP to go)` : `${next - exp} XP to the next level`}
                    aria-label="Level up"
                    onClick={() => session.levelUp(record.id)}
                  >
                    <Icon name="levelup" size={15} />
                  </button>
                ) : null}
                <button type="button" className="cc-levelup" data-action="class-level" aria-pressed={classPanel} title="Class & Level: each class, level up one, or change classes (Adventurer's Backpack)" aria-label="Class and level" onClick={() => setClassPanel(!classPanel)}>
                  <Icon name="settings" size={14} />
                </button>
              </span>
              <span className="cc-inline">
                <b>XP</b> <Field value={exp} number editable={editable} label="Experience" onSave={numberAt("exp")} /> / <span className="cc-num">{next || "—"}</span>
              </span>
            </section>

            {classPanel ? <ClassLevel record={record} session={session} editable={editable} /> : null}
            {String(data.expnextsource ?? "") && next > 0 ? <p className="hint cc-next-source">Next level: {String(data.expnextsource)} at {next} XP</p> : null}
            <div className="cc-main-grid">
              <section className="cc-panel cc-attributes" aria-label="Attributes">
                <div className="cc-attr-head">
                  <span />
                  <small>Score</small>
                  <small>Bonus</small>
                  <span />
                  <small>Saves (click to roll)</small>
                </div>
                {STATS.map((stat) => {
                  const row = (at(data, `attributes.${stat}`) ?? {}) as Row;
                  const prime = num(row.prime) === 1;
                  return (
                    <div key={stat} className={prime ? "cc-attr prime" : "cc-attr"} data-attr={stat}>
                      <b>{stat[0].toUpperCase() + stat.slice(1)}</b>
                      <Field value={num(row.score)} number editable={editable} label={`${stat} score`} onSave={numberAt(`attributes.${stat}.score`)} />
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Roll a ${stat} check against CL ${cl}`} aria-label={`${stat} check`} onClick={() => save(stat, "check")}>
                        {signed(num(row.bonus))}
                      </button>
                      <input type="checkbox" className="cc-prime" checked={prime} disabled={!editable} title={prime ? "Prime" : "Not prime"} aria-label={`${stat} prime`} onChange={(event) => change(`attributes.${stat}.prime`, event.target.checked ? 1 : 0)} />
                      <button type="button" className="cc-save" disabled={!editable} title={`Roll a ${stat} save against CL ${cl}`} aria-label={`${stat} save`} onClick={() => save(stat, "save")}>
                        {SAVES[stat]}
                      </button>
                    </div>
                  );
                })}
                <div className="cc-attr-foot">
                  <span>
                    Primes chosen <b>{num(at(data, "primes.chosen"))}</b>
                  </span>
                  <label>
                    CL <input type="number" className="cc-field number" value={cl} min={-10} max={30} aria-label="Challenge level" onChange={(event) => setCl(Number(event.target.value) || 0)} />
                  </label>
                </div>
              </section>
              <section className="cc-panel cc-ac" aria-label="Armour class">
                <small>AC</small>
                <span className="cc-shield" data-stat="ac">
                  {num(ac.total)}
                </span>
                <small>-Dex</small>
                <span className="cc-num">{num(ac.flatfooted)}</span>
                <small>Tch</small>
                <span className="cc-num">{num(ac.touch)}</span>
                <small>SR</small>
                <span className="cc-num">{sr}</span>
              </section>
            </div>

            <div className="cc-main-grid lower">
              <section className="cc-panel cc-health" aria-label="Hit points">
                <div className="cc-health-row">
                  <label className="cc-stack">
                    <small>HP</small>
                    <span className="cc-num" data-stat="hp">
                      {total - wounds}/{total}
                    </span>
                  </label>
                  <label className="cc-stack">
                    <small>Wounds</small>
                    <Field value={wounds} number editable={editable} label="Wounds" onSave={numberAt("hp.wounds")} />
                  </label>
                  <label className="cc-stack">
                    <small>Temp</small>
                    <Field value={num(at(data, "hp.temp"))} number editable={editable} label="Temporary hit points" onSave={numberAt("hp.temp")} />
                  </label>
                  <label className="cc-stack">
                    <small>Nonlethal</small>
                    <Field value={num(at(data, "hp.nonlethal"))} number editable={editable} label="Nonlethal damage" onSave={numberAt("hp.nonlethal")} />
                  </label>
                </div>
                <span className="cc-hp-bar">
                  <i style={{ width: `${Math.max(0, Math.min(100, ((total - wounds) / Math.max(1, total)) * 100))}%` }} />
                </span>
              </section>
              <section className="cc-panel cc-defenses">
                <h4>Special Defenses</h4>
                <Field value={data.specialdefenses} editable={editable} area label="Special defenses" onSave={(value) => change("specialdefenses", value)} />
              </section>
              <section className="cc-panel cc-quick" aria-label="Initiative and attacks">
                <small>Initiative</small>
                <span className="cc-num">{signed(num(at(data, "initiative.bonus")))}</span>
                <small>Melee</small>
                <span className="cc-num" data-stat="melee">
                  {signed(num(at(data, "attack.melee.total")))}
                </span>
                <small>Ranged</small>
                <span className="cc-num">{signed(num(at(data, "attack.ranged.total")))}</span>
              </section>
            </div>
            <section className="cc-panel cc-row">
              <label className="cc-stack">
                <small>Move</small>
                <Field value={data.speed} editable={editable} label="Move" onSave={(value) => change("speed", value)} />
              </label>
              <label className="cc-labelled grow">
                <Field value={data.specialmovement} editable={editable} label="Special movement" onSave={(value) => change("specialmovement", value)} />
                <small>Special movement</small>
              </label>
            </section>
            <section className="cc-panel">
              <label className="cc-labelled">
                <Field value={data.senses} editable={editable} label="Senses" onSave={(value) => change("senses", value)} />
                <small>Senses</small>
              </label>
            </section>
          </div>
        ) : null}

        {tab === "combat" ? (
          <div className="cc-page" data-tab-page="combat">
            <div className="cc-main-grid even">
              <section className="cc-panel cc-row">
                <b>Initiative</b> <span className="cc-num">{signed(num(at(data, "initiative.bonus")))}</span>
                <label className="cc-stack">
                  <small>Misc</small>
                  <Field value={num(at(data, "initiative.misc"))} number editable={editable} label="Initiative misc" onSave={numberAt("initiative.misc")} />
                </label>
              </section>
              <section className="cc-panel cc-row">
                <b>Move</b> <span className="cc-num">{String(data.speed ?? "")}</span>
              </section>
            </div>
            <div className="cc-main-grid even">
              <section className="cc-panel cc-ac-break" aria-label="Armour class">
                <span className="cc-shield big">{num(ac.total)}</span>
                <dl>
                  {(
                    [
                      ["Armor bonus", num(ac.equipmentarmor)],
                      ["Shield bonus", num(ac.shield)],
                      ["Dexterity modifier", num(ac.dex)],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd className="cc-num">{value}</dd>
                    </div>
                  ))}
                  {(
                    [
                      ["Size modifier", "ac.size"],
                      ["Natural armor", "ac.natural"],
                      ["Deflection modifier", "ac.deflection"],
                      ["Misc modifier", "ac.misc"],
                    ] as const
                  ).map(([label, path]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <Field value={num(at(data, path))} number editable={editable} label={label} onSave={numberAt(path)} />
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt>-Dex / Touch</dt>
                    <dd className="cc-num">
                      {num(ac.flatfooted)} / {num(ac.touch)}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="cc-panel cc-tohit" aria-label="Bonus to hit">
                <div className="cc-tohit-head">
                  <b>Bonus to Hit</b> <span className="cc-num" data-stat="bth">{signed(num(data.bth))}</span>
                </div>
                <div className="cc-tohit-row head">
                  <span />
                  <small>Total</small>
                  <small>Ability</small>
                  <small>Misc</small>
                </div>
                {["melee", "ranged", "grapple", "pummel", "overbear", "touch"].map((kind) => (
                  <div key={kind} className="cc-tohit-row" data-attack={kind}>
                    <b>{kind[0].toUpperCase() + kind.slice(1)}</b>
                    <span className="cc-num">{signed(num(at(data, `attack.${kind}.total`)))}</span>
                    <span className="cc-num">{signed(num(at(data, `attack.${kind}.attr`)))}</span>
                    <Field value={num(at(data, `attack.${kind}.misc`))} number editable={editable} label={`${kind} misc`} onSave={numberAt(`attack.${kind}.misc`)} />
                  </div>
                ))}
              </section>
            </div>
            <section className="cc-panel cc-row">
              <b>SR</b> <span className="cc-num">{sr}</span>
              <label className="cc-stack">
                <small>Item</small>
                <Field value={num(at(data, "sr.item"))} number editable={editable} label="Spell resistance from items" onSave={numberAt("sr.item")} />
              </label>
              <label className="cc-stack">
                <small>Misc</small>
                <Field value={num(at(data, "sr.misc"))} number editable={editable} label="Spell resistance misc" onSave={numberAt("sr.misc")} />
              </label>
            </section>
            <section className="cc-panel" aria-label="Weapons">
              <h4>Weapons</h4>
              <div className="cc-weapon head">
                <small>Weapon</small>
                <small>M/R</small>
                <small>Roll to hit</small>
                <small>Roll damage</small>
              </div>
              {weapons.length === 0 ? <p className="hint">No weapon in hand: wear or wield one on the Inventory tab.</p> : null}
              {weapons.map(([key, item]) => {
                const ranged = String(item.attacktype ?? "").toLowerCase() === "ranged" || RANGED.test(String(item.name));
                const bonus = num(at(data, `attack.${ranged ? "ranged" : "melee"}.total`)) + num(item.bthbonus);
                return (
                  <div key={key} className="cc-weapon" data-weapon={key}>
                    <span>{String(item.name)}</span>
                    <span>{ranged ? "R" : "M"}</span>
                    <button type="button" data-action="attack" disabled={!editable} onClick={() => session.ct("attack", { recordId: record.id, weapon: key })} title={targetNames.length ? `Attack ${targetNames.join(", ")}` : "No target: Ctrl+click a token to target it"}>
                      Attack {signed(bonus)}
                    </button>
                    <button type="button" data-action="damage" disabled={!editable} onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })} title={targetNames.length ? `Damage ${targetNames.join(", ")}` : "Roll damage"}>
                      Damage {String(item.damage)}
                    </button>
                  </div>
                );
              })}
              <p className="hint">{targetNames.length > 0 ? `Targeting ${targetNames.join(", ")}.` : inFight ? "No target: Ctrl+click a token on the map." : "Not in the fight: attacks roll without a target."}</p>
            </section>
          </div>
        ) : null}

        {tab === "abilities" ? (
          <div className="cc-page" data-tab-page="abilities">
            <section className="cc-panel cc-abilities">
              <h4>Skills &amp; Abilities</h4>
              <div className="cc-ability head">
                <small>Lvl</small>
                <small>From</small>
                <small>Ability</small>
                <small>Bonus</small>
                <small>Attr</small>
              </div>
              {packages.flatMap(([packageKey, pkg]) =>
                rows(pkg.abilities)
                  .filter(([, ability]) => num(ability.level || 1) <= Math.max(1, num(pkg.level) || level || 1))
                  .map(([key, ability]) => {
                    const stat = String(ability.stat ?? "").toLowerCase() as Stat;
                    const rollable = STATS.includes(stat);
                    const bonus = rollable ? num(at(data, `attributes.${stat}.bonus`)) + (num(ability.addlevel) ? Math.max(1, num(pkg.level) || level) : 0) : 0;
                    return (
                      <div key={`${packageKey}-${key}`} className="cc-ability" data-ability={String(ability.name)}>
                        <span className="cc-num">{String(pkg.packagetype).toLowerCase() === "race" ? "" : num(ability.level || 1)}</span>
                        <span className="cc-from">{String(pkg.name)}</span>
                        <span className="cc-ability-name" title={plain(ability.text).slice(0, 600)}>
                          {String(ability.name)}
                        </span>
                        {rollable ? (
                          <button type="button" className="cc-bonus" disabled={!editable} title={`Roll ${String(ability.name)} (${stat} check) against CL ${cl}`} aria-label={`Roll ${String(ability.name)}`} onClick={() => session.siegeCheck(record.id, stat, cl, false, { label: String(ability.name), addLevel: Boolean(num(ability.addlevel)) })}>
                            {signed(bonus)}
                          </button>
                        ) : (
                          <span className="cc-num">—</span>
                        )}
                        <span>{rollable ? SHORT[stat] : "-"}</span>
                      </div>
                    );
                  }),
              )}
              <p className="hint">The bonus rolls the ability's check (its attribute, and its level when it adds). CL {cl} from the Main tab.</p>
            </section>
          </div>
        ) : null}

        {tab === "inventory" ? (
          <div className="cc-page" data-tab-page="inventory">
            <section className="cc-panel cc-inventory">
              <div className="cc-item head">
                <small>#</small>
                <small>Name</small>
                <small>Location</small>
                <small>EV</small>
                <small title="Carried, worn or left behind">C/E</small>
                <span />
              </div>
              {inventory.length === 0 ? <p className="hint">Nothing carried.</p> : null}
              {inventory.map(([key, item]) => {
                const carried = num(item.carried);
                return (
                  <div key={key} className={carried === 0 ? "cc-item left" : "cc-item"} data-item={key}>
                    <Field value={Math.max(1, num(item.count))} number editable={editable} label={`${String(item.name)} count`} onSave={numberAt(`inventorylist.${key}.count`)} />
                    <span className={item.location ? "cc-item-name inside" : "cc-item-name"} title={plain(item.description).slice(0, 400)}>
                      {String(item.name)}
                    </span>
                    <Field value={item.location ?? ""} editable={editable} label={`Where ${String(item.name)} is`} onSave={(value) => change(`inventorylist.${key}.location`, value)} />
                    <span className="cc-num" title={`${num(item.weight)} lb.`}>{item.encumbrancevalue !== undefined ? num(item.encumbrancevalue) : ""}</span>
                    <button
                      type="button"
                      className={`cc-carried c${carried}`}
                      disabled={!editable}
                      title={carried === 2 ? "Worn or in hand (click: carried)" : carried === 1 ? "Carried (click: worn or in hand)" : "Left behind (click: carried)"}
                      aria-label={`${String(item.name)}: ${carried === 2 ? "equipped" : carried === 1 ? "carried" : "left behind"}`}
                      onClick={() => change(`inventorylist.${key}.carried`, carried === 1 ? 2 : 1)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (editable) change(`inventorylist.${key}.carried`, carried === 0 ? 1 : 0);
                      }}
                    >
                      {carried === 2 ? "E" : carried === 1 ? "C" : "–"}
                    </button>
                    {editable ? (
                      <button type="button" className="cc-drop" aria-label={`Drop ${String(item.name)}`} title="Drop it (it leaves the sheet)" onClick={() => window.confirm(`Drop ${String(item.name)}?`) && change(`inventorylist.${key}`, null)}>
                        ×
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
              {editable ? (
                // FG's + on the list: an item by name (or drag one in from the Items list).
                <p className="cc-inline cc-item-add">
                  <Field value="" editable label="Add an item" onSave={(value) => value.trim() && change("inventory.add", value.trim())} />
                </p>
              ) : null}
              <p className="hint">C: carried · E: worn or in hand (click to switch) · right-click: left behind or carried again.</p>
            </section>
            <div className="cc-main-grid even">
              <section className="cc-panel cc-load" aria-label="Encumbrance">
                <div>
                  <b>Total Encumbrance</b> <span className="cc-num" data-stat="ev">{num(load.ev)}</span>
                </div>
                <div>
                  <b>Encumbrance Rating</b> <span className="cc-num" data-stat="er">{num(load.er)}</span>
                </div>
                <div>
                  <b>Load</b> <span className={`cc-load-band ${String(load.category ?? "")}`} data-stat="load">{String(load.category ?? "") ? String(load.category)[0].toUpperCase() + String(load.category).slice(1) : "—"}</span>
                  {load.effectivemove ? <small> · moves {String(load.effectivemove)}</small> : null}
                </div>
                {num(load.warningcount) > 0 ? <p className="hint warn">{String(load.warnings)}</p> : null}
              </section>
              <section className="cc-panel cc-coins" aria-label="Treasure">
                <h4>Treasure</h4>
                {rows(data.coins).map(([key, coin]) => (
                  <label key={key} className="cc-coin">
                    <Field value={num(coin.amount)} number editable={editable} label={`${String(coin.name)} coins`} onSave={numberAt(`coins.${key}.amount`)} />
                    <small>{String(coin.name).toUpperCase()}</small>
                  </label>
                ))}
                {rows(data.coins).length === 0 ? <p className="hint">No coin.</p> : null}
              </section>
            </div>
          </div>
        ) : null}

        {tab === "spells" ? <SpellsPage record={record} session={session} editable={editable} targetNames={targetNames as string[]} /> : null}

        {tab === "notes" ? (
          <div className="cc-page" data-tab-page="notes">
            <section className="cc-panel cc-notes-who">
              {(
                [
                  ["gender", "Gender"],
                  ["age", "Age"],
                  ["height", "Height"],
                  ["weight", "Weight"],
                  ["size", "Size"],
                  ["alignment", "Alignment"],
                  ["deity", "Religion"],
                  ["origin", "Place of origin"],
                ] as const
              ).map(([path, label]) => (
                <label key={path} className="cc-labelled">
                  <Field value={data[path]} editable={editable} label={label} onSave={(value) => change(path, value)} />
                  <small>{label}</small>
                </label>
              ))}
            </section>
            <div className="cc-main-grid even">
              <section className="cc-panel">
                <h4>Appearance</h4>
                <Field value={plain(data.appearance)} editable={editable} area label="Appearance" onSave={(value) => change("appearance", value)} />
              </section>
              <section className="cc-panel cc-languages">
                <h4>Languages</h4>
                <ul>
                  {rows(data.languagelist).map(([key, row]) => (
                    <li key={key}>
                      {String(row.name)}
                      {editable ? (
                        <button type="button" className="cc-drop" aria-label={`Forget ${String(row.name)}`} onClick={() => change(`languagelist.${key}`, null)}>
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {editable ? (
                  <form
                    className="cc-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (language.trim()) change("languages.add", language.trim());
                      setLanguage("");
                    }}
                  >
                    <input className="cc-field wide" placeholder="Add a language" aria-label="Add a language" value={language} onChange={(event) => setLanguage(event.target.value)} />
                    <button type="submit" aria-label="Add the language">
                      <Icon name="plus" size={14} />
                    </button>
                  </form>
                ) : null}
              </section>
            </div>
            <section className="cc-panel">
              <h4>Notes</h4>
              <Field value={plain(data.notes)} editable={editable} area label="Notes" className="tall" onSave={(value) => change("notes", value)} />
            </section>
          </div>
        ) : null}
      </div>

      <nav className="cc-tabs" role="tablist" aria-label="Sheet">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-sheet-tab={id} onClick={() => setTab(id)}>
            {id[0].toUpperCase() + id.slice(1)}
          </button>
        ))}
      </nav>
    </article>
  );
}

// Spells and powers: slots left today, and each power's actions.
function SpellsPage({ record, session, editable, targetNames }: { record: TableRecord; session: Session; editable: boolean; targetNames: string[] }) {
  const data = record.data as Row;
  const slots = (data.slots ?? {}) as Record<string, Row>;
  const powers = Object.entries((data.powers ?? {}) as Record<string, Row>)
    .filter(([, power]) => power && typeof power === "object")
    .sort(([, a], [, b]) => num(a.level) - num(b.level) || String(a.name).localeCompare(String(b.name)));
  return (
    <div className="cc-page" data-tab-page="spells">
      {Object.keys(slots).length > 0 ? (
        <section className="cc-panel cc-row" aria-label="Spells left today">
          {Object.entries(slots)
            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            .map(([key, slot]) => (
              <span key={key} className="slot-level" title={`Level ${key.slice(1)}: ${num(slot.max) - num(slot.used)} of ${num(slot.max)} left`}>
                <small>L{key.slice(1)}</small>
                {Array.from({ length: num(slot.max) }, (_, index) => (
                  <i key={index} className={index < num(slot.max) - num(slot.used) ? "pip" : "pip spent"} />
                ))}
              </span>
            ))}
          {session.role === "dm" ? (
            <button type="button" className="link" onClick={() => void session.op({ op: "update", id: record.id, patch: { data: { slots: Object.fromEntries(Object.keys(slots).map((key) => [key, { used: 0 }])) } } })}>
              Reset uses
            </button>
          ) : null}
        </section>
      ) : null}
      {targetNames.length > 0 ? <p className="target-line">Casting at <b>{targetNames.join(", ")}</b></p> : null}
      <section className="cc-panel">
        {powers.length === 0 ? <p className="hint">No spells or powers.</p> : null}
        <ul className="sheet-list powers">
          {powers.map(([key, power]) => {
            const actions = Object.entries((power.actions ?? {}) as Record<string, Row>);
            return (
              <li key={key} className="power-row">
                <span className="power-name">
                  <b>{String(power.name)}</b>
                  <small>
                    {power.packagesource ? "class ability" : `level ${num(power.level)}`}
                    {power.range ? ` · ${String(power.range)}` : ""}
                    {power.duration ? ` · ${String(power.duration)}` : ""}
                    {power.savetext && power.savetext !== "none" ? ` · save: ${String(power.savetext)}` : ""}
                  </small>
                  {power.shortdescription ? <small className="power-text">{String(power.shortdescription)}</small> : null}
                </span>
                {editable ? (
                  <span className="power-actions">
                    {actions.length === 0 ? (
                      <button type="button" data-action="cast" onClick={() => session.ct("cast", { recordId: record.id, power: key })}>
                        Cast
                      </button>
                    ) : null}
                    {actions.map(([actionKey, action]) => (
                      <button key={actionKey} type="button" data-action="cast" onClick={() => session.ct("cast", { recordId: record.id, power: key, action: actionKey })}>
                        {String(action.name || "Cast")}
                        <small>{String(action.damage || action.heal || "") || (action.effect ? "effect" : "")}</small>
                      </button>
                    ))}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
