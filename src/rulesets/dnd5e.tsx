import { signed } from "../../shared/dnd5e/rules.mjs";
import { num, rows, useSheet, type Row } from "../core/sheet/context";

// D&D 5E's own parts, where no core part fits (docs/core-ui-design.md 4.4,
// level 3), shared with Descending Darkness (its variant): the Spells page
// (the save DC and attack, slots to tick, each spell known with Cast and the
// book's words), Descending Darkness's Dread, its bleeding out at 0 Health and
// 5E's death saves. Everything else on the sheet is the core's, laid out by
// shared/dnd5e/manifest.mjs; the words (Species or Kin, AC or Defense) are its labels.

const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const plain = (html: unknown) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// The class's name and level, from the character's packages (FG 5E's class package).
export const dnd5eClassName = (data: Row) => {
  const pkg = rows(data.packages).find(([, item]) => String(item.packagetype).toLowerCase() === "class")?.[1];
  return pkg ? `${String(pkg.name)} ${num(data.level)}` : "";
};

// Spells: the save DC and attack, slots left (click to use or get one back), each spell with Cast.
export function Dnd5eSpells() {
  const { record, session, editable, data, change } = useSheet();
  const casting = (data.spellcasting ?? null) as Row | null;
  const slots = rows(data.slots).sort((a, b) => a[0].localeCompare(b[0]));
  const known = (Array.isArray(data.spells) ? data.spells : []).map(String);
  const book = Object.values(session.records).filter((item) => item.type === "spell");
  if (!casting)
    return (
      <section className="cc-panel cc-page" data-tab-page="spells">
        <p className="hint empty-state">No spellcasting in this class.</p>
      </section>
    );
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

// Descending Darkness's Dread: 3 or more, disadvantage on Wisdom; 6, the character breaks.
export function Dnd5eDread() {
  const { data, editable, change } = useSheet();
  const dread = num(data.dread);
  return (
    <div className="five-big five-dread" data-stat="dread" title="Dread: horrors, darkness and loss build it; a night's rest by a fire lowers it by 1. At 3 or more, disadvantage on Wisdom checks and saves; at 6 the character breaks (the GM says how).">
      <small>Dread</small>
      <span className="five-dread-track">
        {Array.from({ length: 6 }, (_, index) => (
          <button key={index} type="button" className={index < dread ? "on" : ""} disabled={!editable} aria-label={`Dread ${index + 1}`} onClick={() => change("dread", dread === index + 1 ? index : index + 1)} />
        ))}
      </span>
      <span className="hint">{dread >= 6 ? "Broken" : dread >= 3 ? "Shaken: disadvantage on Wisdom" : ""}</span>
    </div>
  );
}

// Descending Darkness at 0 Health: dying, a Health lost each turn until steadied.
export function Dnd5eDying() {
  const { data } = useSheet();
  const hp = (data.hp ?? {}) as Row;
  return (
    <div className="five-big five-death" data-dying>
      <small>Dying</small>
      {/* "Health" its own text node, as the hand-made sheet wrote the game's word. */}
      <span className="hint">Loses 1 {"Health"} each turn until an ally steadies them (Wisdom 12); dead at {-num(hp.total)}.</span>
    </div>
  );
}

// 5E at 0 hit points: the death saves, and their roll in a fight.
export function Dnd5eDeathSaves() {
  const { data, session, record, editable } = useSheet();
  const saves = (data.deathsaves ?? {}) as Row;
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  return (
    <div className="five-big five-death" data-death-saves>
      <small>Death saves</small>
      <span>
        {"✓".repeat(num(saves.success))}
        {"✗".repeat(num(saves.failure))}
      </span>
      {inFight && editable ? (
        <button type="button" data-action="death-save" onClick={() => session.ct("death-save", { id: inFight.id })}>
          Roll
        </button>
      ) : null}
    </div>
  );
}
