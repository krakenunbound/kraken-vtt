import { useState } from "react";
import type { Session, TableClock } from "../session/useSession";
import { Icon } from "../ui/icons";

// Progress clocks (the Blades in the Dark SRD's, for every game): a circle
// of segments filled as trouble mounts or effort pays off. The GM makes them
// (4 complex, 6 more complicated, 8 daunting; danger, racing, linked,
// tug-of-war, mission, project, faction), ticks them up or down, and shows
// them to the table or keeps them; every seat sees the shown ones here and
// on the strip at the top of the table. The host keeps them (clocks.cjs).

const KINDS = ["progress", "danger", "racing", "linked", "tug", "mission", "project", "faction"];
const KIND_WORDS: Record<string, string> = { progress: "Progress", danger: "Danger", racing: "Racing", linked: "Linked", tug: "Tug-of-war", mission: "Mission", project: "Long-term project", faction: "Faction" };
const KIND_COLOR: Record<string, string> = { progress: "#d9a441", danger: "#c0392b", racing: "#8e5cc2", linked: "#3d8bd9", tug: "#2f9e72", mission: "#e07b39", project: "#9aa04a", faction: "#7f8c8d" };

// A clock's face: segments as wedges, the filled ones in its kind's colour.
export function ClockFace({ clock, size = 64, onSegment }: { clock: Pick<TableClock, "segments" | "filled" | "kind" | "locked" | "name">; size?: number; onSegment?: (index: number) => void }) {
  const r = size / 2 - 3;
  const c = size / 2;
  const color = KIND_COLOR[clock.kind] ?? KIND_COLOR.progress;
  const wedges = Array.from({ length: clock.segments }, (_, index) => {
    const a0 = (index / clock.segments) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((index + 1) / clock.segments) * Math.PI * 2 - Math.PI / 2;
    const path = `M${c},${c} L${c + r * Math.cos(a0)},${c + r * Math.sin(a0)} A${r},${r} 0 0 1 ${c + r * Math.cos(a1)},${c + r * Math.sin(a1)} Z`;
    return (
      <path
        key={index}
        d={path}
        fill={index < clock.filled ? color : "rgba(255,255,255,0.06)"}
        stroke="rgba(0,0,0,0.75)"
        strokeWidth={1.5}
        style={onSegment ? { cursor: "pointer" } : undefined}
        onClick={onSegment ? () => onSegment(index) : undefined}
        data-segment={index}
      />
    );
  });
  return (
    <svg className={`clock-face${clock.locked ? " locked" : ""}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${clock.name}: ${clock.filled} of ${clock.segments}`}>
      <circle cx={c} cy={c} r={r + 1.5} fill="rgba(10,10,14,0.85)" stroke={color} strokeWidth={2} />
      {wedges}
      {clock.locked ? <circle cx={c} cy={c} r={r / 2.6} fill="rgba(10,10,14,0.9)" stroke="#ddd" strokeWidth={1.5} /> : null}
    </svg>
  );
}

// The strip on the table: every clock this seat may see, small, at the top.
export function ClocksStrip({ session }: { session: Session }) {
  const list = session.clocks.clocks.filter((clock) => clock.shown || session.role === "dm");
  if (list.length === 0) return null;
  return (
    <div className="clocks-strip" data-clocks-strip={list.length} aria-label="Clocks">
      {list.map((clock) => (
        <div key={clock.id} className={`clocks-strip-item${clock.shown ? "" : " gm-only"}`} data-clock={clock.name} data-filled={clock.filled} title={`${clock.name}: ${clock.filled}/${clock.segments} (${KIND_WORDS[clock.kind] ?? clock.kind})${clock.shown ? "" : " · the GM's alone"}${clock.note ? `\n${clock.note}` : ""}`}>
          <ClockFace clock={clock} size={34} />
          <span>{clock.name}</span>
        </div>
      ))}
    </div>
  );
}

export function ClocksWindow({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const [name, setName] = useState("");
  const [segments, setSegments] = useState(4);
  const [kind, setKind] = useState("progress");
  const [shown, setShown] = useState(true);
  const [rival, setRival] = useState("");
  const [after, setAfter] = useState("");
  const op = (message: Record<string, unknown>) => session.clocksOp(message);
  const list = session.clocks.clocks;
  // Clocks the active books bring (an adventure's own: The Brine Street Job's).
  const presets = Object.values(session.records)
    .filter((record) => record.type === "forgedtable" && record.data.group === "clocks")
    .flatMap((record) => Object.values((record.data.rows ?? {}) as Record<string, { name?: string; segments?: number; kind?: string; text?: string }>))
    .filter((row) => row && row.name && !list.some((clock) => clock.name === row.name));
  const add = () => {
    if (!name.trim()) return;
    op({ action: "add", clock: { name: name.trim(), segments, kind, shown, ...(rival ? { rival } : {}), ...(after ? { after } : {}) } });
    setName("");
    setRival("");
    setAfter("");
  };
  return (
    <section className="clocks-window" data-clocks={list.length}>
      {list.length === 0 ? <p className="hint">{gm ? "No clocks yet. Make one below: 4 segments for a complex obstacle, 6 for a more complicated one, 8 for a daunting one." : "No clocks on the table."}</p> : null}
      <div className="clocks-grid">
        {list.map((clock) => (
          <div key={clock.id} className={`clock-card${clock.shown ? "" : " gm-only"}`} data-clock={clock.name} data-filled={clock.filled}>
            <ClockFace clock={clock} size={84} onSegment={gm && !clock.locked ? (index) => op({ action: "update", id: clock.id, patch: { filled: index + 1 === clock.filled ? index : index + 1 } }) : undefined} />
            <div className="clock-card-body">
              <b>{clock.name}</b>
              <small>
                {clock.filled}/{clock.segments} · {KIND_WORDS[clock.kind] ?? clock.kind}
                {clock.rival ? ` · races ${list.find((item) => item.id === clock.rival)?.name ?? "?"}` : ""}
                {clock.after ? ` · after ${list.find((item) => item.id === clock.after)?.name ?? "?"}` : ""}
                {clock.shown ? "" : " · GM only"}
              </small>
              {clock.note ? <small className="hint">{clock.note}</small> : null}
              {gm ? (
                <span className="clock-card-tools">
                  <button type="button" data-action="clock-tick-down" title="Tick down (a tug-of-war, or a mistake)" disabled={clock.filled <= 0 || clock.locked} onClick={() => op({ action: "tick", id: clock.id, amount: -1 })}>
                    −
                  </button>
                  <button type="button" data-action="clock-tick" title="Tick a segment" disabled={clock.filled >= clock.segments || clock.locked} onClick={() => op({ action: "tick", id: clock.id, amount: 1 })}>
                    +1
                  </button>
                  <button type="button" data-action="clock-tick-2" title="Tick two (standard effect)" disabled={clock.filled >= clock.segments || clock.locked} onClick={() => op({ action: "tick", id: clock.id, amount: 2 })}>
                    +2
                  </button>
                  <button type="button" data-action="clock-show" title={clock.shown ? "Hide from the players" : "Show the players"} onClick={() => op({ action: "update", id: clock.id, patch: { shown: !clock.shown } })}>
                    <Icon name={clock.shown ? "eye" : "eye-off"} size={14} />
                  </button>
                  <button type="button" data-action="clock-remove" title="Remove the clock" onClick={() => op({ action: "remove", id: clock.id })}>
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {gm ? (
        <form
          className="clock-add"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <input aria-label="Clock name" placeholder="New clock: the obstacle, not the method (Interior Patrols)" value={name} onChange={(event) => setName(event.target.value)} />
          <select aria-label="Segments" value={segments} onChange={(event) => setSegments(Number(event.target.value))}>
            {[2, 3, 4, 5, 6, 8, 10, 12].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
          <select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            {KINDS.map((item) => (
              <option key={item} value={item}>
                {KIND_WORDS[item]}
              </option>
            ))}
          </select>
          {list.length ? (
            <>
              <select aria-label="Races" value={rival} onChange={(event) => setRival(event.target.value)} title="Racing: the clock it races">
                <option value="">Races no clock</option>
                {list.map((clock) => (
                  <option key={clock.id} value={clock.id}>
                    Races {clock.name}
                  </option>
                ))}
              </select>
              <select aria-label="After" value={after} onChange={(event) => setAfter(event.target.value)} title="Linked: opens when that clock fills">
                <option value="">Open now</option>
                {list.map((clock) => (
                  <option key={clock.id} value={clock.id}>
                    After {clock.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label className="inline-check">
            <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} /> Shown
          </label>
          <button type="submit" data-action="clock-add" disabled={!name.trim()}>
            Add clock
          </button>
        </form>
      ) : null}
      {gm && presets.length ? (
        <div className="clock-presets">
          <small className="hint">From the active books:</small>
          {presets.map((row) => (
            <button key={row.name} type="button" data-action="clock-preset" title={row.text ?? ""} onClick={() => op({ action: "add", clock: { name: row.name, segments: Number(row.segments) || 4, kind: row.kind === "racing" ? "progress" : row.kind ?? "progress", note: row.text ?? "", shown: true } })}>
              {row.name} ({row.segments})
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
