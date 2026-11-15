import { useState } from "react";
import type { Session } from "../session/useSession";
import { Icon } from "../ui/icons";

// The rests a game declares (shared/<id>/bookkeeping.mjs rest): Short rest (5E: how many Hit Point
// Dice to spend) and Long rest, for one character (recordId) or, for the GM, the whole party
// (party: the calendar moves on by the rest). The host plays them (electron/bookkeeping.cjs rest).
export function RestButtons({ session, recordId, rests, hitDice = null, party = false, onError = () => undefined, onDone }: { session: Session; recordId?: string; rests: { short?: unknown; long?: unknown }; hitDice?: number | null; party?: boolean; onError?: (text: string) => void; onDone?: (text: string) => void }) {
  const [dice, setDice] = useState(1);
  const [busy, setBusy] = useState(false);
  if ((!rests.short && !rests.long)) return null;
  const go = (kind: "short" | "long") => {
    setBusy(true);
    void session
      .rest(party ? null : (recordId ?? null), kind, kind === "short" && hitDice !== null && !party ? { hitDice: dice } : {})
      .then((result) => {
        onError("");
        onDone?.(party ? `The party takes a ${kind} rest${Number(result.hours) ? `: ${result.hours} hour${Number(result.hours) === 1 ? "" : "s"} pass` : ""}.` : "");
      })
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="supplies-row rest-buttons" aria-label={party ? "Rest the party" : "Rest"}>
      <Icon name="moon" size={14} title="Rest" />
      {rests.short ? (
        <>
          {hitDice !== null && !party ? (
            <label className="rest-dice" title="Hit Point Dice to spend on the short rest">
              <input type="number" min={0} max={Math.max(0, hitDice)} value={Math.min(dice, Math.max(0, hitDice))} onChange={(event) => setDice(Math.max(0, Number(event.target.value) || 0))} aria-label="Hit Point Dice to spend" />
              <small className="hint">of {hitDice} HD</small>
            </label>
          ) : null}
          <button type="button" className="supplies-act" data-action={party ? "party-short-rest" : "short-rest"} disabled={busy} onClick={() => go("short")} title={party ? "Every party member takes a short rest; the clock moves on" : "A short rest by the game's rules"}>
            Short rest
          </button>
        </>
      ) : null}
      {rests.long ? (
        <button type="button" className="supplies-act" data-action={party ? "party-long-rest" : "long-rest"} disabled={busy} onClick={() => go("long")} title={party ? "Every party member takes a long rest (a ration each); the clock moves on" : "A long rest by the game's rules (a ration eaten)"}>
          Long rest
        </button>
      ) : null}
    </div>
  );
}
