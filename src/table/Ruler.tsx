import { useEffect, useRef, useSyncExternalStore } from "react";
import { diagonalRule, gridDistance3, pathDistance, pointInPolygon, snapCenter } from "../../shared/map/geometry.mjs";

// The ruler (FG's right-drag pointer, Foundry's ruler): from where it starts,
// through each waypoint, to the pointer; each leg's length and the whole by
// the table's diagonal rule. Everyone on the map sees a ruler as it is drawn,
// in the measurer's colour (the host relays it, tableServer.cjs relayRuler).

type Point = { x: number; y: number };
type GridScene = Parameters<typeof snapCenter>[0];
export type SharedRuler = { id: string; from: string; color: string; sceneId: string | null; points: number[]; at: number };
// Difficult terrain (Map Studio's regions): its outline and what a square in it costs.
export type TerrainArea = { points: number[]; cost: number };

// Other seats' rulers, kept apart from the map's own state so a ruler moving
// 20 times a second redraws only itself, never the whole map.
const rulers = new Map<string, SharedRuler>();
let snapshot: SharedRuler[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, number>();
function changed() {
  snapshot = [...rulers.values()];
  for (const listener of listeners) listener();
}
export const rulerStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => snapshot,
  // A ruler from the host: shown, moved, or (no points) gone. One that stops
  // moving without being let go (a dropped connection) fades after a while.
  put(message: { id?: unknown; from?: unknown; color?: unknown; sceneId?: unknown; points?: unknown }) {
    const id = String(message.id ?? message.from ?? "");
    if (!id) return;
    const points = Array.isArray(message.points) ? message.points.map(Number).filter(Number.isFinite) : [];
    window.clearTimeout(timers.get(id));
    if (points.length < 4) rulers.delete(id);
    else {
      rulers.set(id, { id, from: String(message.from ?? ""), color: String(message.color ?? "#7fd4ff"), sceneId: typeof message.sceneId === "string" ? message.sceneId : null, points, at: Date.now() });
      timers.set(
        id,
        window.setTimeout(() => {
          rulers.delete(id);
          changed();
        }, 6000),
      );
    }
    changed();
  },
  clear() {
    rulers.clear();
    changed();
  },
};

// What entering a point costs: the dearest difficult terrain over it, else 1.
export function terrainCostAt(areas: TerrainArea[] | undefined) {
  if (!areas?.length) return null;
  return (x: number, y: number) => {
    let cost = 1;
    for (const area of areas) if (area.cost > cost && pointInPolygon(x, y, area.points)) cost = area.cost;
    return cost;
  };
}

// A drag against the creature's speed (its sheet's speed, "30 ft"): within
// it, within a dash (double), or past both. A warning colour, never a stop.
export function speedBand(feet: number, speed: unknown): "walk" | "dash" | "far" | undefined {
  const match = /(\d+)/.exec(String(speed ?? ""));
  const walk = match ? Number(match[1]) : 0;
  if (!(walk > 0)) return undefined;
  return feet <= walk ? "walk" : feet <= walk * 2 ? "dash" : "far";
}

// The ruler's points as measured: every one on the centre of its square.
export function rulerPoints(scene: GridScene, start: Point, waypoints: Point[], at: Point): number[] {
  return [start, ...waypoints, at].flatMap((point) => {
    const snapped = snapCenter(scene, point.x, point.y, 1);
    return [snapped.x, snapped.y];
  });
}

// Sends this seat's ruler to the table as it moves: at most one every 50 ms
// (the last always goes), and a clear when it is let go.
export function useRulerBroadcast(points: number[] | null, send: ((points: number[]) => void) | undefined) {
  const last = useRef(0);
  const pending = useRef<number | null>(null);
  const shown = useRef(false);
  const key = points ? points.join(",") : "";
  useEffect(() => {
    if (!send) return;
    if (!points || points.length < 4) {
      if (pending.current !== null) window.clearTimeout(pending.current);
      pending.current = null;
      if (shown.current) send([]);
      shown.current = false;
      return;
    }
    const go = () => {
      pending.current = null;
      last.current = Date.now();
      shown.current = true;
      send(points);
    };
    const wait = 50 - (Date.now() - last.current);
    if (pending.current !== null) window.clearTimeout(pending.current);
    if (wait <= 0) go();
    else pending.current = window.setTimeout(go, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, send]);
}

// While measuring: Space drops a waypoint where the pointer is, Backspace takes the last back.
export function useRulerKeys(viewport: { current: HTMLElement | null }, measuring: { add: () => void; undo: () => void } | null) {
  const handlers = useRef(measuring);
  handlers.current = measuring;
  const on = measuring !== null;
  useEffect(() => {
    if (!on) return;
    const view = viewport.current?.ownerDocument.defaultView ?? window;
    const onKey = (event: KeyboardEvent) => {
      if (!handlers.current || event.repeat) return;
      if (event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        handlers.current.add();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        // Not the map's own Backspace (it takes the GM's selected token off).
        event.stopPropagation();
        handlers.current.undo();
      }
    };
    view.addEventListener("keydown", onKey, { capture: true });
    return () => view.removeEventListener("keydown", onKey, { capture: true });
  }, [on, viewport]);
}

// One ruler drawn on the map: its line, a dot at each waypoint, each leg's
// length at its end and the whole by the pointer.
// riseOf: from one token to another, how much higher the second stands (elevation): the climb counts too.
export function RulerPath({ scene, points, color, diagonal, scale, units, width, height, name, terrain, riseOf }: { scene: GridScene; points: number[]; color: string; diagonal: unknown; scale: number; units: string; width: number; height: number; name?: string; terrain?: TerrainArea[]; riseOf?: (points: number[]) => number }) {
  if (points.length < 4) return null;
  const measured = pathDistance(scene, points, diagonalRule(diagonal), terrainCostAt(terrain));
  const rise = points.length === 4 && riseOf ? riseOf(points) : 0;
  const legs = rise ? [gridDistance3(scene, { x: points[0], y: points[1] }, { x: points[2], y: points[3] }, diagonalRule(diagonal), rise)] : measured.legs;
  const total = rise ? legs[0] : measured.total;
  const count = points.length / 2;
  const end = { x: points[points.length - 2], y: points[points.length - 1] };
  return (
    <>
      <svg className="overlay measure ruler" width={width} height={height} viewBox={`0 0 ${width} ${height}`} data-ruler={name ?? "mine"} data-ruler-total={total}>
        <polyline points={points.join(" ")} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={6 / scale} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={3 / scale} strokeDasharray={`${8 / scale} ${5 / scale}`} strokeLinejoin="round" strokeLinecap="round" />
        {Array.from({ length: count - 1 }, (_, index) => (
          <circle key={index} cx={points[index * 2]} cy={points[index * 2 + 1]} r={(index === 0 ? 5 : 6) / scale} fill={index === 0 ? color : "#fff"} stroke={color} strokeWidth={2 / scale} />
        ))}
      </svg>
      {legs.length > 1
        ? legs.slice(0, -1).map((leg, index) => (
            <span key={index} className="measure-label ruler-leg" style={{ left: points[index * 2 + 2], top: points[index * 2 + 3], fontSize: 12 / scale, borderColor: color }}>
              {leg} {units}
            </span>
          ))
        : null}
      <span className="measure-label ruler-total" style={{ left: end.x, top: end.y, fontSize: 15 / scale, borderColor: color }}>
        {legs.length > 1 ? `${legs[legs.length - 1]} · ${total} ${units}` : `${total} ${units}`}
        {rise ? ` (${rise > 0 ? "up" : "down"} ${Math.abs(rise)})` : ""}
        {name ? <small>{name}</small> : null}
      </span>
    </>
  );
}

// Every other seat's ruler on this scene.
export function SharedRulers({ sceneId, ...rest }: { sceneId: string } & Omit<Parameters<typeof RulerPath>[0], "points" | "color" | "name">) {
  const list = useSyncExternalStore(rulerStore.subscribe, rulerStore.get);
  return (
    <>
      {list
        .filter((ruler) => ruler.sceneId === sceneId)
        .map((ruler) => (
          <RulerPath key={ruler.id} {...rest} points={ruler.points} color={ruler.color} name={ruler.from} />
        ))}
    </>
  );
}
