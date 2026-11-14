import { useState } from "react";
import type { CombatEntry, Session } from "../session/useSession";

// A Fate conflict's line on the tracker, under the creature: its stress
// boxes and consequences, a hit waiting for its player (the ways to absorb
// it, the consequences named, or taken out), conceding, a character's fate
// points, and for the GM an NPC's kind and aspects.
export function FateLine({ entry, session }: { entry: CombatEntry; session: Session }) {
  const fate = entry.fate!;
  const gm = session.role === "dm";
  const mine = gm || entry.mine;
  const [names, setNames] = useState<Record<string, string>>({});
  const pending = fate.pending;
  const needed = new Set((pending?.options ?? []).flatMap((plan) => plan.consequences));
  return (
    <div className="ct-fate" data-fate-entry={entry.id} data-fate-out={fate.out || undefined}>
      {fate.tracks?.map((track) => (
        <span key={track.key} className="ct-fate-track" title={`${track.label} stress: a box of value n takes a hit of n shifts (one box a hit)`}>
          <small>{track.label}</small>
          {track.boxes.map((box) => (
            <span key={box.value} className={box.marked ? "fate-box marked" : "fate-box"} data-ct-box={`${track.key}-${box.value}`}>
              {box.value}
            </span>
          ))}
          {track.boxes.length === 0 ? <small className="hint">none</small> : null}
        </span>
      ))}
      {fate.consequences?.length ? (
        <span className="ct-fate-cons">
          {fate.consequences.map((item) => (
            <span key={item.key} className={item.text ? "ct-con taken" : "ct-con"} data-ct-consequence={item.key} title={`${item.label} consequence (${item.value})`}>
              {item.label[0]}
              {item.value}
              {item.text ? `: ${item.text}` : ""}
            </span>
          ))}
        </span>
      ) : null}
      {fate.fatepoints !== undefined ? (
        <span className="ct-stat" title="Fate points" data-ct-fatepoints={fate.fatepoints}>
          FP {fate.fatepoints}
        </span>
      ) : null}
      {gm && fate.kind ? <small className="hint">{fate.kind}{fate.aspects?.length ? `: ${fate.aspects.join(" · ")}` : ""}</small> : null}
      {pending ? (
        <div className="ct-fate-hit" data-fate-pending={pending.shifts}>
          <b>
            Hit: {pending.shifts} shift{pending.shifts === 1 ? "" : "s"}
            {pending.by ? ` from ${pending.by}` : ""}
          </b>
          {mine ? (
            <>
              {[...needed].map((key) => (
                <input key={key} aria-label={`Name the ${key} consequence`} data-consequence-name={key} placeholder={`${key[0].toUpperCase()}${key.slice(1)} consequence: name it`} value={names[key] ?? ""} onChange={(event) => setNames({ ...names, [key]: event.target.value })} />
              ))}
              {pending.options.map((plan) => (
                <button key={plan.index} type="button" data-action="fate-absorb" data-plan={plan.index} title="Take the hit this way" onClick={() => session.ct("absorb", { id: entry.id, choice: { plan: plan.index, names: Object.fromEntries(plan.consequences.map((key) => [key, names[key] ?? ""])) } })}>
                  {plan.words}
                </button>
              ))}
              <button type="button" className="danger" data-action="fate-taken-out" title="Taken out: the attacker decides what happens" onClick={() => session.ct("absorb", { id: entry.id, choice: { out: true } })}>
                Taken out
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {mine && !fate.out ? (
        <button type="button" className="ct-death-save" data-action="fate-concede" title={`Concede: out of the conflict on your own terms${entry.recordId && fate.fatepoints !== undefined ? `, for ${1 + fate.taken} fate point${fate.taken ? "s" : ""}` : ""}`} onClick={() => session.ct("concede", { id: entry.id })}>
          Concede
        </button>
      ) : null}
    </div>
  );
}
