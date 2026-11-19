import { useState } from "react";
import { ACTION_DRAG } from "../effects/drops";
import { ClassLevel } from "../characters/ClassLevel";
import { Field } from "../core/fields/Field";
import { at, num, rows, signed, useSheet, type Row } from "../core/sheet/context";
import { Icon } from "../ui/icons";

// Castles & Crusades' own parts, where no core part fits (docs/core-ui-design.md 4.4, level 3): the Class box with
// its Class & Level button, that panel, the weapons in hand, the class and race abilities, the inventory with its
// carried / worn switch, the load, the spells and powers, and the languages. Everything else on the sheet is the
// core's, laid out by shared/cnc/manifest.mjs. The rolls read the strip's CL (the sheet modifier "cl").

const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
type Stat = (typeof STATS)[number];
const SHORT: Record<Stat, string> = { strength: "Str", dexterity: "Dex", constitution: "Con", intelligence: "Int", wisdom: "Wis", charisma: "Cha" };
const RANGED = /\b(bow|crossbow|sling|dart|javelin|blowgun)\b/i;
const plain = (html: unknown) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const packagesOf = (data: Row) => rows(data.packages);
const classesOf = (data: Row) => packagesOf(data).filter(([, pkg]) => String(pkg.packagetype).toLowerCase() === "class").map(([, pkg]) => pkg);

// "Fighter", or "Fighter 3 / Wizard 2" for more than one class.
export const cncClasses = (_row: Row, _key?: string, data: Row = {}) => {
  const classes = classesOf(data);
  return classes.map((pkg) => `${String(pkg.name)}${classes.length > 1 ? ` ${num(pkg.level)}` : ""}`).join(" / ");
};
// The race: the record's word, else its race package's name.
export const cncRace = (_row: Row, _key?: string, data: Row = {}) => String(data.race ?? packagesOf(data).find(([, pkg]) => String(pkg.packagetype).toLowerCase() === "race")?.[1]?.name ?? "");

// The player's name: typed on the sheet, else the owner's.
export function CncPlayer() {
  const { data, record, editable, change } = useSheet();
  return (
    <label className="cc-labelled cc-box">
      <Field value={data.playername ?? record.owner} editable={editable} label="Player name" onSave={(value) => change("playername", value)} />
      <small>Player</small>
    </label>
  );
}

// The Class & Level button (in the header, after the Class box): opens the panel on the Main tab.
export function CncClassButton() {
  const sheet = useSheet();
  const open = Boolean(sheet.modifiers.classPanel);
  return (
    <button type="button" className="cc-levelup" data-action="class-level" aria-pressed={open} title="Class & Level: each class, level up one, or change classes (Adventurer's Backpack)" aria-label="Class and level" onClick={() => sheet.setModifier("classPanel", !open)}>
      <Icon name="settings" size={14} />
    </button>
  );
}

// The Class & Level panel (open from the header's button) and where the next level's experience comes from.
export function CncClassPanel() {
  const sheet = useSheet();
  const next = num(sheet.data.expnext);
  return (
    <>
      {sheet.modifiers.classPanel ? <ClassLevel record={sheet.record} session={sheet.session} editable={sheet.editable} /> : null}
      {String(sheet.data.expnextsource ?? "") && next > 0 ? (
        <p className="hint cc-next-source">
          Next level: {String(sheet.data.expnextsource)} at {next} XP
        </p>
      ) : null}
    </>
  );
}

// The weapons in hand (worn or wielded, with damage): attack and damage at the targets, each draggable onto a creature.
export function CncWeapons() {
  const { data, record, session, editable, targets } = useSheet();
  const inFight = session.combat.entries.some((entry) => entry.recordId === record.id);
  const weapons = rows(data.inventorylist).filter(([, item]) => num(item.carried) === 2 && String(item.damage ?? "").trim() !== "");
  return (
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
            <button type="button" className="cc-roll" data-action="attack" disabled={!editable} onClick={() => session.ct("attack", { recordId: record.id, weapon: key })} draggable={editable} onDragStart={(event) => event.dataTransfer.setData(ACTION_DRAG, JSON.stringify({ kind: "attack", recordId: record.id, weapon: key }))} title={targets.length ? `Attack ${targets.join(", ")}` : "No target: Ctrl+click a token to target it"}>
              Attack {signed(bonus)}
            </button>
            <button type="button" className="cc-roll" data-action="damage" disabled={!editable} onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })} draggable={editable} onDragStart={(event) => event.dataTransfer.setData(ACTION_DRAG, JSON.stringify({ kind: "damage", recordId: record.id, weapon: key }))} title={targets.length ? `Damage ${targets.join(", ")}` : "Roll damage"}>
              Damage {String(item.damage)}
            </button>
          </div>
        );
      })}
      <p className="hint">{targets.length > 0 ? `Targeting ${targets.join(", ")}.` : inFight ? "No target: Ctrl+click a token on the map." : "Not in the fight: attacks roll without a target."}</p>
    </section>
  );
}

// The class and race abilities up to the character's level; the bonus rolls the ability's check against the CL.
export function CncAbilities() {
  const { data, record, session, editable, modifiers } = useSheet();
  const level = num(data.level);
  const cl = num(modifiers.cl);
  return (
    <section className="cc-panel cc-abilities">
      <h4>Skills &amp; Abilities</h4>
      <div className="cc-ability head">
        <small>Lvl</small>
        <small>From</small>
        <small>Ability</small>
        <small>Bonus</small>
        <small>Attr</small>
      </div>
      {packagesOf(data).flatMap(([packageKey, pkg]) =>
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
                  <button type="button" className="cc-bonus cc-roll" disabled={!editable} title={`Roll ${String(ability.name)} (${stat} check) against CL ${cl}`} aria-label={`Roll ${String(ability.name)}`} onClick={() => session.siegeCheck(record.id, stat, cl, false, { label: String(ability.name), addLevel: Boolean(num(ability.addlevel)) })}>
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
      <p className="hint">The bonus rolls the ability's check (its attribute, and its level when it adds) against the CL above.</p>
    </section>
  );
}

// The inventory: count, name, where it is, its encumbrance and the carried / worn switch (right-click: left behind).
export function CncInventory() {
  const { data, editable, change } = useSheet();
  const inventory = rows(data.inventorylist);
  return (
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
            <Field value={Math.max(1, num(item.count))} number editable={editable} label={`${String(item.name)} count`} onSave={(value) => change(`inventorylist.${key}.count`, Number(value) || 0)} />
            <span className={item.location ? "cc-item-name inside" : "cc-item-name"} title={plain(item.description).slice(0, 400)}>
              {String(item.name)}
            </span>
            <Field value={item.location ?? ""} editable={editable} label={`Where ${String(item.name)} is`} onSave={(value) => change(`inventorylist.${key}.location`, value)} />
            <span className="cc-num" title={`${num(item.weight)} lb.`}>
              {item.encumbrancevalue !== undefined ? num(item.encumbrancevalue) : ""}
            </span>
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
        // An item by name (or drag one in from the Items list).
        <p className="cc-inline cc-item-add">
          <Field value="" editable label="Add an item" onSave={(value) => value.trim() && change("inventory.add", value.trim())} />
        </p>
      ) : null}
      <p className="hint">C: carried · E: worn or in hand (click to switch) · right-click: left behind or carried again.</p>
    </section>
  );
}

// The load: total encumbrance, the rating, the load band and its move, the warnings.
export function CncLoad() {
  const { data } = useSheet();
  const load = (data.load ?? {}) as Row;
  const band = String(load.category ?? "");
  return (
    <section className="cc-panel cc-load" aria-label="Encumbrance">
      <div>
        <b>Total Encumbrance</b>{" "}
        <span className="cc-num" data-stat="ev">
          {num(load.ev)}
        </span>
      </div>
      <div>
        <b>Encumbrance Rating</b>{" "}
        <span className="cc-num" data-stat="er">
          {num(load.er)}
        </span>
      </div>
      <div>
        <b>Load</b>{" "}
        <span className={`cc-load-band ${band}`} data-stat="load">
          {band ? band[0].toUpperCase() + band.slice(1) : "—"}
        </span>
        {load.effectivemove ? <small> · moves {String(load.effectivemove)}</small> : null}
      </div>
      {num(load.warningcount) > 0 ? <p className="hint warn">{String(load.warnings)}</p> : null}
    </section>
  );
}

// Spells and powers: slots left today, and each power's actions.
export function CncSpells() {
  const { data, record, session, editable, targets } = useSheet();
  const slots = (data.slots ?? {}) as Record<string, Row>;
  const powers = Object.entries((data.powers ?? {}) as Record<string, Row>)
    .filter(([, power]) => power && typeof power === "object")
    .sort(([, a], [, b]) => num(a.level) - num(b.level) || String(a.name).localeCompare(String(b.name)));
  return (
    <>
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
      {targets.length > 0 ? (
        <p className="target-line">
          Casting at <b>{targets.join(", ")}</b>
        </p>
      ) : null}
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
    </>
  );
}

// The languages: each one (× forgets it), and one added by name.
export function CncLanguages() {
  const { data, editable, change } = useSheet();
  const [language, setLanguage] = useState("");
  return (
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
  );
}
