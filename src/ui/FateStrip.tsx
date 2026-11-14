import { useState } from "react";
import type { Session } from "../session/useSession";
import { fateTableOf } from "../characters/SheetFate";
import { Icon } from "./icons";

// Fate's Scene Aspects strip, over the table for everyone: the scene's
// situation aspects, boosts and game aspects with their free invokes (dots),
// and the GM's pool of fate points for the scene. The GM adds and removes
// aspects, changes their free invokes, starts a new scene (the pool set to
// one fate point a player character, the scene's aspects gone) and refreshes
// everyone's fate points for a new session (electron/fate.cjs, kraken_fate).
export function FateStrip({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const table = fateTableOf(session);
  const [open, setOpen] = useState(true);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("situation");
  const act = (action: string, args: Record<string, unknown> = {}) => void session.fateAction(null, action, args).catch(() => undefined);
  if (!gm && table.aspects.length === 0) return null;
  return (
    <section className={open ? "fate-strip open" : "fate-strip"} aria-label="Scene aspects" data-fate-strip data-gm-pool={table.gmpool}>
      <button type="button" className="ghost fate-strip-toggle" aria-expanded={open} title={open ? "Fold the scene's aspects away" : "The scene's aspects"} onClick={() => setOpen(!open)}>
        <Icon name="sparkle" size={14} /> {table.scene || "Scene"}
        {!open ? ` (${table.aspects.length})` : ""}
      </button>
      {open ? (
        <>
          <ul className="fate-strip-aspects">
            {table.aspects.map((aspect) => (
              <li key={aspect.id} className={`fate-aspect-chip kind-${aspect.kind}`} data-scene-aspect={aspect.name} data-invokes={aspect.invokes} title={`${aspect.kind === "boost" ? "A boost (gone once invoked)" : aspect.kind === "game" ? "A game aspect" : "A situation aspect"}${aspect.invokes ? `: ${aspect.invokes} free invoke${aspect.invokes === 1 ? "" : "s"}${aspect.by ? ` for ${aspect.by}` : ""}` : ""}`}>
                <i>{aspect.name}</i>
                {aspect.invokes ? <span className="fate-dots">{"●".repeat(Math.min(5, aspect.invokes))}</span> : null}
                {gm ? (
                  <>
                    <button type="button" className="ghost" aria-label={`One more free invoke on ${aspect.name}`} onClick={() => act("aspect-invokes", { id: aspect.id, invokes: aspect.invokes + 1 })}>
                      +
                    </button>
                    <button type="button" className="ghost" aria-label={`One free invoke less on ${aspect.name}`} disabled={aspect.invokes <= 0} onClick={() => act("aspect-invokes", { id: aspect.id, invokes: aspect.invokes - 1 })}>
                      −
                    </button>
                    <button type="button" className="ghost" aria-label={`Remove ${aspect.name}`} onClick={() => act("aspect-remove", { id: aspect.id })}>
                      ×
                    </button>
                  </>
                ) : null}
              </li>
            ))}
            {table.aspects.length === 0 ? <li className="hint">No aspects on the scene yet.</li> : null}
          </ul>
          {gm ? (
            <div className="fate-strip-gm">
              <form
                className="cc-inline"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) act("aspect-add", { name: name.trim(), kind, invokes: kind === "boost" ? 1 : 0 });
                  setName("");
                }}
              >
                <input aria-label="New scene aspect" data-field="scene-aspect" placeholder="A situation aspect: On Fire" value={name} onChange={(event) => setName(event.target.value)} />
                <select aria-label="Aspect kind" value={kind} onChange={(event) => setKind(event.target.value)}>
                  <option value="situation">Situation</option>
                  <option value="boost">Boost</option>
                  <option value="game">Game</option>
                </select>
                <button type="submit" data-action="scene-aspect-add">
                  Add
                </button>
              </form>
              <span className="fate-pool" title="The GM's fate points for this scene: one for each player character in it, at the scene's start">
                GM pool
                <button type="button" className="ghost" aria-label="One fate point less" data-action="gm-pool-down" disabled={table.gmpool <= 0} onClick={() => act("gm-pool", { amount: -1 })}>
                  −
                </button>
                <b data-gm-pool-count={table.gmpool}>{table.gmpool}</b>
                <button type="button" className="ghost" aria-label="One fate point more" data-action="gm-pool-up" onClick={() => act("gm-pool", { amount: 1 })}>
                  +
                </button>
              </span>
              <button type="button" data-action="scene-start" title="A new scene: the GM's pool is one fate point a player character; the last scene's situation aspects and boosts are gone (game aspects stay)" onClick={() => act("scene-start", {})}>
                New scene
              </button>
              <button type="button" data-action="refresh-all" title="A new session: every character's fate points back up to their refresh" onClick={() => act("refresh-all")}>
                Refresh all
              </button>
            </div>
          ) : (
            <span className="fate-pool" title="The GM's fate points for this scene">
              GM pool <b>{table.gmpool}</b>
            </span>
          )}
        </>
      ) : null}
    </section>
  );
}
