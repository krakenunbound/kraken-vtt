import {
  CATEGORY_COLOR,
  CATEGORY_HINT,
  CATEGORY_LABEL,
  countCategories,
  wallStroke,
  wallTitle,
  type SceneLight,
  type SceneMarker,
  type SceneRegion,
  type SceneToken,
  type SceneWall,
  type WallCategory,
} from "../foundry/sceneObjects";

// A door's handle (the GM's, to open and close it): sized to the door, at
// most 8 screen pixels across in radius, and left off when the map is zoomed
// out so far that it would be under 3 (doors are then the coloured lines).
function doorDot(wall: SceneWall, scale: number) {
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  const onScreen = Math.min(8, length * 0.12 * scale);
  return onScreen < 3 ? 0 : onScreen / scale;
}

const LEGEND_ORDER: WallCategory[] = ["normal", "window", "invisible", "terrain", "ethereal", "door", "secret", "blank"];

export type OverlayToken = SceneToken & { imageUrl: string | null };

export function SceneGraphics({
  worldWidth,
  worldHeight,
  walls,
  lights,
  tokens,
  markers,
  regions,
  scale,
  showWalls,
  showLights,
  showCreatures,
  doorStates,
  onToggleDoor,
  doorsInert = false,
}: {
  worldWidth: number;
  worldHeight: number;
  walls: SceneWall[];
  lights: SceneLight[];
  tokens: OverlayToken[];
  markers: SceneMarker[];
  regions: SceneRegion[];
  scale: number;
  showWalls: boolean;
  showLights: boolean;
  showCreatures: boolean;
  doorStates: Record<string, number>;
  onToggleDoor: (wallId: string, doorState: number) => void;
  // While the walls are edited with a tool, a door's button lets the press through (to pick or move the door).
  doorsInert?: boolean;
}) {
  const stroke = 2 / scale;
  return (
    <svg className="overlay" width={worldWidth} height={worldHeight} viewBox={`0 0 ${worldWidth} ${worldHeight}`}>
      {showLights
        ? lights.map((light) => (
            <g key={light.id} className="light">
              {light.dimPx > 0 ? (
                <circle
                  cx={light.x}
                  cy={light.y}
                  r={light.dimPx}
                  fill={light.color}
                  fillOpacity={light.hidden ? 0.04 : 0.08}
                  stroke={light.color}
                  strokeOpacity={0.7}
                  strokeWidth={stroke}
                  strokeDasharray={light.hidden ? `${stroke * 4} ${stroke * 3}` : undefined}
                />
              ) : null}
              {light.brightPx > 0 ? (
                <circle cx={light.x} cy={light.y} r={light.brightPx} fill={light.color} fillOpacity={0.16} stroke={light.color} strokeWidth={stroke} />
              ) : null}
              <title>{`Light. Bright ${Math.round(light.bright)} ${light.units}, dim ${Math.round(light.dim)} ${light.units}.`}</title>
            </g>
          ))
        : null}
      {showWalls
        ? walls.map((wall) => {
            const state = doorStates[wall.id] ?? wall.ds;
            const open = wall.door > 0 && state === 1;
            const color = wallStroke(wall.category, state);
            const tick = wall.dir === 0 ? null : directionTick(wall, 18 / scale);
            return (
              <g key={wall.id} className="wall" data-category={wall.category}>
                <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} stroke="#000" strokeWidth={stroke * 3} strokeLinecap="round" />
                <line
                  x1={wall.x1}
                  y1={wall.y1}
                  x2={wall.x2}
                  y2={wall.y2}
                  stroke={color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={open ? `${stroke * 5} ${stroke * 4}` : undefined}
                >
                  <title>{wallTitle(wall, state)}</title>
                </line>
                {tick ? <line x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke={color} strokeWidth={stroke} /> : null}
                {wall.door > 0 && doorDot(wall, scale) > 0 ? (
                  <circle
                    className="door"
                    cx={(wall.x1 + wall.x2) / 2}
                    cy={(wall.y1 + wall.y2) / 2}
                    r={doorDot(wall, scale)}
                    fill={state === 1 ? "#66CC66" : state === 2 ? "#EE4444" : wall.door === 2 ? "#A612D4" : "#6666EE"}
                    stroke="#000"
                    strokeWidth={stroke}
                    style={doorsInert ? { pointerEvents: "none" } : undefined}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleDoor(wall.id, state);
                    }}
                  >
                    <title>{wallTitle(wall, state)}</title>
                  </circle>
                ) : null}
              </g>
            );
          })
        : null}
      {regions.map((region) =>
        region.polygons.map((points, index) => (
          <polygon
            key={`${region.id}-${index}`}
            points={pairPoints(points)}
            fill={region.trap ? "rgba(224,122,106,0.25)" : "rgba(210,161,90,0.12)"}
            stroke={region.trap ? "#e07a6a" : "#d2a15a"}
            strokeWidth={stroke}
          >
            <title>{region.trap ? `Trap. ${region.name}` : region.name}</title>
          </polygon>
        )),
      )}
      {markers.map((marker) => (
        <g key={marker.id} className={marker.kind} transform={`translate(${marker.x} ${marker.y})`}>
          <circle r={10 / scale} fill={marker.kind === "trap" ? "#e07a6a" : "#d2a15a"} stroke="#000" strokeWidth={stroke} />
          <title>{marker.text}</title>
        </g>
      ))}
      {showCreatures
        ? tokens.map((token) => {
            const color = token.disposition === -1 ? "#EE4444" : token.disposition === 1 ? "#77E7E8" : token.disposition === -2 ? "#A612D4" : "#FFFFBB";
            const cx = token.x + token.width / 2;
            const cy = token.y + token.height / 2;
            const radius = Math.min(token.width, token.height) / 2;
            return (
              <g key={token.id} className="token" opacity={token.hidden ? 0.55 : 1}>
                {token.imageUrl ? (
                  <image href={token.imageUrl} x={token.x} y={token.y} width={token.width} height={token.height} />
                ) : (
                  <circle cx={cx} cy={cy} r={radius} fill={color} fillOpacity={0.85} stroke="#000" strokeWidth={stroke} />
                )}
                <text x={cx} y={cy + radius + 16 / scale} textAnchor="middle" fill="#fff" fontSize={14 / scale} stroke="#000" strokeWidth={stroke * 0.4}>
                  {token.name}
                </text>
                <title>{`${token.name}. ${token.disposition === -1 ? "Hostile" : token.disposition === 1 ? "Friendly" : token.disposition === -2 ? "Secret" : "Neutral"}.`}</title>
              </g>
            );
          })
        : null}
    </svg>
  );
}

export function SceneLegend({
  walls,
  lights,
  tokens,
  markers,
  regions,
}: {
  walls: SceneWall[];
  lights: SceneLight[];
  tokens: OverlayToken[];
  markers: SceneMarker[];
  regions: SceneRegion[];
}) {
  const counts = countCategories(walls);
  const traps = markers.filter((marker) => marker.kind === "trap").length + regions.filter((region) => region.trap).length;
  const missingPrep = counts.window + counts.door + counts.secret + tokens.length + traps === 0;
  return (
    <aside
      className="legend"
      data-walls={walls.length}
      data-normal={counts.normal}
      data-window={counts.window}
      data-invisible={counts.invisible}
      data-terrain={counts.terrain}
      data-ethereal={counts.ethereal}
      data-door={counts.door}
      data-secret={counts.secret}
      data-lights={lights.length}
      data-tokens={tokens.length}
      data-traps={traps}
      aria-label="This scene"
    >
      <h4>This scene</h4>
      {LEGEND_ORDER.filter((category) => counts[category] > 0).map((category) => (
        <div key={category} className="legend-row" title={CATEGORY_HINT[category]}>
          <span className="swatch" style={{ background: CATEGORY_COLOR[category] }} />
          <span>
            {CATEGORY_LABEL[category]} {counts[category]}
          </span>
        </div>
      ))}
      <div className="legend-row">Lights {lights.length}</div>
      <div className="legend-row">Creatures {tokens.length}</div>
      {traps > 0 ? <div className="legend-row">Traps {traps}</div> : null}
      {missingPrep ? <p className="legend-empty">No doors, windows, creatures, or traps in this scene.</p> : null}
    </aside>
  );
}

function pairPoints(points: number[]): string {
  const pairs: string[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) pairs.push(`${points[index]},${points[index + 1]}`);
  return pairs.join(" ");
}

function directionTick(wall: SceneWall, length: number): { x1: number; y1: number; x2: number; y2: number } {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const span = Math.hypot(dx, dy) || 1;
  const leftX = -dy / span;
  const leftY = dx / span;
  const nx = wall.dir === 1 ? leftX : -leftX;
  const ny = wall.dir === 1 ? leftY : -leftY;
  const x1 = (wall.x1 + wall.x2) / 2;
  const y1 = (wall.y1 + wall.y2) / 2;
  return { x1, y1, x2: x1 + nx * length, y2: y1 + ny * length };
}
