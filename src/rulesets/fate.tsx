import type { Session } from "../session/useSession";
import { fateTableOf } from "../characters/SheetFate";

// Fate's own controls in core windows (docs/core-ui-design.md 4.4, level 3).

// The tracker's header: a physical or a mental conflict (which skill orders the turns, which defends).
export function FateConflict({ session }: { session: Session }) {
  return (
    <select aria-label="Conflict" data-action="fate-conflict" value={fateTableOf(session).conflict} onChange={(event) => void session.fateAction(null, "conflict", { kind: event.target.value })}>
      <option value="physical">Physical conflict</option>
      <option value="mental">Mental conflict</option>
    </select>
  );
}
