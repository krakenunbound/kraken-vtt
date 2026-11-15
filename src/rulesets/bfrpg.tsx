import { num, useSheet } from "../core/sheet/context";

// Basic Fantasy's own part, where no core part fits (docs/core-ui-design.md 4.4, level 3): Turn undead on the
// combat tab. Everything else on its sheet is the core's, laid out by shared/bfrpg/manifest.mjs (its strip too).

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
