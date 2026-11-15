import { MAX_LEVEL, signed } from "../../shared/bfrpg/rules.mjs";
import { Field } from "../core/fields/Field";
import { num, useSheet } from "../core/sheet/context";
import { Icon } from "../ui/icons";

// Basic Fantasy's own parts, where no core part fits (docs/core-ui-design.md
// 4.4, level 3): the strip over every tab (level and level-up, experience,
// attack bonus, the next roll's modifier) and Turn undead on the combat tab.
// Everything else on its sheet is the core's, laid out by shared/bfrpg/manifest.mjs.

// Level (and the level-up button once the experience is there, or the GM's), XP, AB, and the roll modifier
// (the sheet modifier "mod": added to a save or an ability roll, taken off a thief ability's d100).
export function BfStrip() {
  const { data, editable, gm, session, record, change, modifiers, setModifier } = useSheet();
  const level = num(data.level) || 1;
  const exp = num(data.exp);
  const expnext = num(data.expnext);
  const ready = expnext > 0 && exp >= expnext;
  return (
    <section className="cc-panel cc-row five-strip">
      <span className="cc-inline" title={`${exp} of ${expnext || "—"} experience points for the next level`}>
        <b>Level</b> <span className="cc-num" data-stat="level">{level}</span>
        {editable && (ready || gm) && level < MAX_LEVEL ? (
          <button type="button" className="cc-levelup" data-action="level-up" title={`Level up: ${level + 1 <= 9 ? "the host rolls the hit die" : "the class's fixed hit points"}`} onClick={() => session.levelUp(record.id)}>
            <Icon name="add" size={14} />
          </button>
        ) : null}
      </span>
      <span className="cc-inline">
        <b>XP</b> <span className="cc-num" data-stat="exp">{exp}</span> / <span className="cc-num">{expnext || "—"}</span>
        {gm ? <Field value={exp} number editable label="Experience" onSave={(value) => change("exp", Number(value) || 0)} /> : null}
        {num(data.xpbonus) ? <small className="hint">+{num(data.xpbonus)}% XP</small> : null}
      </span>
      <span className="cc-inline" title="Attack bonus: add Strength in melee, Dexterity with missiles">
        <b>AB</b> <span className="cc-num" data-stat="ab">{signed(num(data.ab))}</span>
      </span>
      <label className="cc-inline" title="A modifier for the next roll: added to a save or an ability roll, taken off a thief ability's d100">
        <b>Mod</b> <input type="number" className="cc-field number" value={num(modifiers.mod)} min={-20} max={20} aria-label="Roll modifier" onChange={(event) => setModifier("mod", Number(event.target.value) || 0)} />
      </label>
    </section>
  );
}

// A Cleric's Turn undead: on the combat tracker, on their turn.
export function BfTurnUndead() {
  const { data, editable, session, record } = useSheet();
  const turn = num(data.turn);
  if (turn <= 0) return null;
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  return (
    <p className="cc-inline">
      <b>Turn undead</b> as a level {turn} Cleric: d20 against the Clerics vs. Undead table, 2d6 hit dice of undead affected.
      {inFight ? (
        <button type="button" data-action="turn-undead" disabled={!editable} onClick={() => session.ct("turn-undead", { id: inFight.id, recordId: record.id })}>
          Turn undead
        </button>
      ) : (
        <small className="hint">On the combat tracker, on your turn.</small>
      )}
    </p>
  );
}
