import { useState } from "react";
import type { EditWall, SceneLightRecord, TableMap, WallKind } from "../session/useSession";
import type { SceneSettingsPatch } from "./SceneSettings";
import { LIGHT_PRESETS } from "../../shared/map/geometry.mjs";

// The GM's map editor, as FG's image layer panel: tabs across the top (FG's
// Line Of Sight, Lighting and Grid so far), a tool row for the tab and a
// rounded properties box. Every control is a table message the GM's agent
// has as a tool too (kraken_wall, kraken_light, kraken_scene_settings,
// kraken_map_undo).

export type EditTab = "walls" | "lights" | "mask" | "grid";
export type EditTool = "select" | "line" | "rect" | "poly" | "light" | "cell" | null;

// FG's line-of-sight types, with FG's tooltips.
export const WALL_KIND_INFO: { kind: WallKind; label: string; icon: string; tip: string; color: string }[] = [
  { kind: "wall", label: "Wall", icon: "▮", tip: "Wall: blocks vision and movement.", color: "#FFFFBB" },
  { kind: "terrain", label: "Terrain", icon: "♣", tip: "Terrain: tokens can see into, but not out of or through, terrain.", color: "#81B90C" },
  { kind: "door", label: "Door", icon: "🚪", tip: "Door: blocks vision and movement until opened. Players open and close the doors they can see.", color: "#6666EE" },
  { kind: "secret", label: "Secret door", icon: "⊘", tip: "Secret door: a door players never see until the GM opens it.", color: "#A612D4" },
  { kind: "toggle", label: "Toggleable wall", icon: "⇄", tip: "Toggleable wall: blocks vision and movement; the GM switches it on and off.", color: "#E7C07A" },
  { kind: "window", label: "Window", icon: "▦", tip: "Window: blocks movement, lets sight through. The GM or players can open it, and the GM can lock it (windows, portcullis).", color: "#C7D8FF" },
  { kind: "illusion", label: "Illusionary wall", icon: "◌", tip: "Illusionary wall: blocks vision only (curtains, magical illusions).", color: "#CA81FF" },
  { kind: "invisible", label: "Invisible wall", icon: "┆", tip: "Invisible wall: blocks movement only.", color: "#77E7E8" },
  { kind: "ethereal", label: "Ethereal wall", icon: "≈", tip: "Ethereal wall: blocks vision, not movement.", color: "#CA81FF" },
  { kind: "shadow", label: "Shadow caster", icon: "◐", tip: "Shadow caster: blocks light only; ignored by tokens.", color: "#888888" },
];
export const kindColor = (kind: string) => WALL_KIND_INFO.find((item) => item.kind === kind)?.color ?? "#FFFFBB";

const SENSES = [
  [0, "None"],
  [10, "Limited"],
  [20, "Normal"],
  [30, "Proximity"],
  [40, "Distance"],
] as const;

type Props = {
  map: TableMap;
  tab: EditTab;
  setTab: (tab: EditTab) => void;
  tool: EditTool;
  setTool: (tool: EditTool) => void;
  kind: WallKind;
  setKind: (kind: WallKind) => void;
  snap: boolean;
  setSnap: (on: boolean) => void;
  pointSnap: boolean;
  setPointSnap: (on: boolean) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
  selectedLight: string | null;
  lightPreset: string;
  setLightPreset: (preset: string) => void;
  gridScene: { size: number; type: number; color: string; alpha: number; distance: number; units: string; offsetX?: number; offsetY?: number };
  maskMode: "reveal" | "hide";
  setMaskMode: (mode: "reveal" | "hide") => void;
  actions: {
    mask: (action: string, payload?: Record<string, unknown>) => void;
    wall: (action: string, payload?: Record<string, unknown>) => void;
    mapUndo: () => void;
    updateSettings: (patch: SceneSettingsPatch) => void;
    updateLight: (id: string, patch: Partial<SceneLightRecord>) => void;
    removeLight: (id: string) => void;
  };
  onClose: () => void;
};

export function MapEditor(props: Props) {
  const { map, tab, setTab, tool, setTool, kind, setKind, selected, setSelected, actions } = props;
  const [advanced, setAdvanced] = useState(false);
  const walls = map.walls ?? [];
  const chosen = walls.filter((wall) => selected.includes(wall.id));
  const one = chosen[0] ?? null;
  const changeWalls = (patch: Partial<EditWall> & { kind?: WallKind }) => chosen.length && actions.wall("update", { ids: chosen.map((wall) => wall.id), patch });
  const light = props.selectedLight ? map.sceneLights.find((item) => item.id === props.selectedLight) ?? null : null;
  const grid = map.settings.grid;
  const setGrid = (patch: NonNullable<SceneSettingsPatch["grid"]>) => actions.updateSettings({ grid: patch });
  const toolButton = (id: EditTool, icon: string, title: string) => (
    <button key={String(id)} type="button" className={tool === id ? "me-tool on" : "me-tool"} aria-pressed={tool === id} title={title} aria-label={title} data-edit-tool={id ?? "none"} onClick={() => setTool(tool === id ? null : id)}>
      {icon}
    </button>
  );
  return (
    <aside className="map-editor" aria-label="Map editor" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
      <header className="me-head">
        <b>Map editor</b>
        <button type="button" className="me-close" aria-label="Close the map editor" onClick={props.onClose}>
          ×
        </button>
      </header>
      <nav className="me-tabs" role="tablist">
        {(
          [
            ["walls", "▦", "Line Of Sight: walls, doors, windows"],
            ["lights", "💡", "Lighting"],
            ["mask", "◑", "Mask"],
            ["grid", "#", "Grid"],
          ] as const
        ).map(([id, icon, title]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} title={title} data-edit-tab={id} onClick={() => setTab(id)}>
            <span aria-hidden>{icon}</span> {title.split(":")[0]}
          </button>
        ))}
      </nav>

      {tab === "walls" ? (
        <>
          <div className="me-tools">
            {toolButton("select", "⬚", "Select walls (click, Shift+click adds); Delete removes them")}
            {toolButton("line", "╱", "Draw walls: click point to point; double-click or Enter ends, Esc cancels")}
            {toolButton("rect", "▭", "Draw a rectangle of walls: click two corners")}
            {toolButton("poly", "⬠", "Draw a closed shape: click its corners, double-click to close")}
            <span className="me-spacer" />
            <button type="button" className="me-tool" title="Undo the last wall edit" aria-label="Undo" data-action="map-undo" onClick={actions.mapUndo}>
              ↶
            </button>
          </div>
          <div className="me-box">
            <div className="me-kinds" role="radiogroup" aria-label="Wall type">
              {WALL_KIND_INFO.map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === item.kind}
                  className={kind === item.kind ? "me-kind on" : "me-kind"}
                  title={item.tip}
                  aria-label={item.label}
                  data-wall-kind={item.kind}
                  style={{ borderColor: item.color }}
                  onClick={() => {
                    setKind(item.kind);
                    if (chosen.length) changeWalls({ kind: item.kind });
                  }}
                >
                  {item.icon}
                </button>
              ))}
            </div>
            <p className="me-caption">{WALL_KIND_INFO.find((item) => item.kind === kind)?.tip}</p>
            <div className="me-row">
              <label>
                <input type="checkbox" checked={props.snap} onChange={(event) => props.setSnap(event.target.checked)} /> Grid snap
              </label>
              <label>
                <input type="checkbox" checked={props.pointSnap} onChange={(event) => props.setPointSnap(event.target.checked)} /> Point snap
              </label>
            </div>
            {chosen.length ? (
              <div className="me-selection" data-selected-walls={chosen.length}>
                <p>
                  <b>{chosen.length === 1 ? "1 wall" : `${chosen.length} walls`} selected</b>
                </p>
                <div className="me-row">
                  <button type="button" data-action="wall-delete" onClick={() => {
                    actions.wall("remove", { ids: chosen.map((wall) => wall.id) });
                    setSelected([]);
                  }}>
                    Delete
                  </button>
                  <button type="button" data-action="wall-toggle" onClick={() => changeWalls({ hidden: !one?.hidden })} title="FG: a toggled-off wall blocks nothing">
                    {one?.hidden ? "Turn on" : "Turn off"}
                  </button>
                  <button type="button" onClick={() => changeWalls({ dir: ((Number(one?.dir) || 0) + 1) % 3 })} title="One way: both sides, left only, right only">
                    Direction: {["both", "left", "right"][Number(one?.dir) || 0]}
                  </button>
                </div>
                <button type="button" className="me-advanced" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>
                  {advanced ? "▾" : "›"} Advanced
                </button>
                {advanced && one ? (
                  <div className="me-grid2">
                    {(["sight", "light", "sound"] as const).map((sense) => (
                      <label key={sense}>
                        {sense[0].toUpperCase() + sense.slice(1)}
                        <select value={one[sense]} onChange={(event) => changeWalls({ [sense]: Number(event.target.value) })} aria-label={`Wall ${sense}`}>
                          {SENSES.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <label>
                      Move
                      <select value={one.move} onChange={(event) => changeWalls({ move: Number(event.target.value) })} aria-label="Wall movement">
                        <option value={0}>None</option>
                        <option value={20}>Normal</option>
                      </select>
                    </label>
                    <label>
                      Threshold (ft)
                      <input type="number" min={0} value={one.threshold ?? ""} onChange={(event) => changeWalls({ threshold: Number(event.target.value) || null })} aria-label="Wall threshold" />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="me-foot">
            <span className="hint">{walls.length} walls</span>
            <button type="button" data-action="close-doors" onClick={() => actions.wall("close-doors")} title="Close every door and window (locks stay)">
              Close all doors
            </button>
            <button
              type="button"
              data-action="clear-walls"
              onClick={() => {
                if (window.confirm("Clear every wall on this scene? (Undo brings them back.)")) actions.wall("clear");
              }}
            >
              Clear walls
            </button>
          </div>
        </>
      ) : null}

      {tab === "lights" ? (
        <>
          <div className="me-tools">
            {toolButton("light", "✚", "Place a light: click the map (with the preset below)")}
            {toolButton("select", "⬚", "Select a light: click its handle; drag to move")}
          </div>
          <div className="me-box">
            <label className="me-row">
              Presets
              <select value={props.lightPreset} onChange={(event) => props.setLightPreset(event.target.value)} aria-label="Light preset">
                {Object.entries(LIGHT_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {(preset as { name: string }).name}
                  </option>
                ))}
              </select>
            </label>
            {light ? (
              <div className="me-grid2" data-selected-light={light.id}>
                <label>
                  Bright (ft)
                  <input type="number" min={0} value={light.bright} onChange={(event) => actions.updateLight(light.id, { bright: Number(event.target.value) || 0 })} aria-label="Bright radius" />
                </label>
                <label>
                  Dim (ft)
                  <input type="number" min={0} value={light.dim} onChange={(event) => actions.updateLight(light.id, { dim: Number(event.target.value) || 0 })} aria-label="Dim radius" />
                </label>
                <label>
                  Colour
                  <input type="color" value={light.color.slice(0, 7)} onChange={(event) => actions.updateLight(light.id, { color: event.target.value })} aria-label="Light colour" />
                </label>
                <label>
                  <input type="checkbox" checked={light.on} onChange={(event) => actions.updateLight(light.id, { on: event.target.checked })} /> On
                </label>
                <label>
                  <input type="checkbox" checked={light.hidden} onChange={(event) => actions.updateLight(light.id, { hidden: event.target.checked })} /> Hidden
                </label>
                <button type="button" onClick={() => actions.removeLight(light.id)}>
                  Delete
                </button>
              </div>
            ) : (
              <p className="me-caption">Click a light's handle to change it, or pick a preset and place one.</p>
            )}
          </div>
          <div className="me-foot">
            <span className="hint">{map.sceneLights.length} lights</span>
          </div>
        </>
      ) : null}

      {tab === "mask" ? (
        <>
          <div className="me-tools">
            {toolButton("rect", "▭", "Mask a rectangle: click two corners")}
            {toolButton("poly", "⬠", "Mask a shape: click its corners, double-click to close")}
            {toolButton("cell", "▦", "Mask whole squares: click a square")}
            <span className="me-spacer" />
            <button type="button" className="me-tool" title="Undo" aria-label="Undo" onClick={actions.mapUndo}>
              ↶
            </button>
          </div>
          <div className="me-box">
            <div className="me-row" role="radiogroup" aria-label="Mask mode">
              <label>
                <input type="radio" checked={props.maskMode === "reveal"} onChange={() => props.setMaskMode("reveal")} data-mask-mode="reveal" /> Reveal
              </label>
              <label>
                <input type="radio" checked={props.maskMode === "hide"} onChange={() => props.setMaskMode("hide")} data-mask-mode="hide" /> Hide again
              </label>
            </div>
            <p className="me-caption">With the global mask on, players see black but where you reveal; what lies under the mask (tokens, doors) is not sent to them. Later shapes win over earlier ones.</p>
            <div className="me-row">
              <button type="button" data-action="mask-on" onClick={() => actions.mask("on")} disabled={Boolean(map.mask?.on)}>
                Add Global Mask
              </button>
              <button type="button" data-action="mask-off" onClick={() => actions.mask("off")} disabled={!map.mask?.on}>
                Remove Global Mask
              </button>
            </div>
          </div>
          <div className="me-foot">
            <span className="hint">
              {map.mask?.on ? "Mask on" : "Mask off"} · {map.mask?.shapes.length ?? 0} shapes
            </span>
            <button type="button" data-action="mask-clear" onClick={() => actions.mask("clear")}>
              Clear shapes
            </button>
          </div>
        </>
      ) : null}

      {tab === "grid" ? (
        <div className="me-box me-grid-tab">
          <div className="me-row">
            <label>
              <input type="checkbox" checked={grid.show} onChange={(event) => setGrid({ show: event.target.checked })} data-grid-show /> Show the grid
            </label>
          </div>
          <label className="me-row">
            Grid type
            <select value={grid.type ?? (props.gridScene.type === 0 ? "none" : props.gridScene.type >= 4 ? "hexcol" : props.gridScene.type >= 2 ? "hexrow" : "square")} onChange={(event) => setGrid({ type: event.target.value as "square" })} aria-label="Grid type">
              <option value="square">▦ Square</option>
              <option value="hexrow">⬡ Hex rows</option>
              <option value="hexcol">⬢ Hex columns</option>
              <option value="none">None (gridless)</option>
            </select>
          </label>
          <div className="me-grid2">
            <label>
              Cell size (px)
              <input type="number" min={10} max={1000} value={grid.size ?? props.gridScene.size} onChange={(event) => setGrid({ size: Number(event.target.value) || null })} aria-label="Grid size" />
            </label>
            <label>
              Tint
              <input type="color" value={(grid.color ?? props.gridScene.color).slice(0, 7)} onChange={(event) => setGrid({ color: event.target.value })} aria-label="Grid colour" />
            </label>
            <label>
              Opacity
              <input type="range" min={0} max={1} step={0.05} value={grid.alpha ?? props.gridScene.alpha} onChange={(event) => setGrid({ alpha: Number(event.target.value) })} aria-label="Grid opacity" />
            </label>
            <label>
              Line
              <select value={grid.style ?? "solid"} onChange={(event) => setGrid({ style: event.target.value })} aria-label="Grid line style">
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
            <label>
              Distance per cell
              <input type="number" min={0.1} step={0.5} value={grid.distance ?? props.gridScene.distance} onChange={(event) => setGrid({ distance: Number(event.target.value) || null })} aria-label="Grid distance" />
            </label>
            <label>
              Suffix
              <input value={grid.units ?? props.gridScene.units} onChange={(event) => setGrid({ units: event.target.value })} aria-label="Grid units" />
            </label>
          </div>
          <div className="me-row me-nudge" aria-label="Adjust position">
            Adjust position
            {(
              [
                ["←", -1, 0],
                ["→", 1, 0],
                ["↑", 0, -1],
                ["↓", 0, 1],
              ] as const
            ).map(([label, dx, dy]) => (
              <button
                key={label}
                type="button"
                aria-label={`Move the grid ${label}`}
                title="1 px; Shift: 10 px"
                data-grid-nudge={label}
                onClick={(event) => {
                  const step = event.shiftKey ? 10 : 1;
                  setGrid({ offsetX: (grid.offsetX ?? props.gridScene.offsetX ?? 0) + dx * step, offsetY: (grid.offsetY ?? props.gridScene.offsetY ?? 0) + dy * step });
                }}
              >
                {label}
              </button>
            ))}
            <span className="hint">
              {grid.offsetX ?? 0}, {grid.offsetY ?? 0}
            </span>
            <button type="button" onClick={() => setGrid({ size: null, offsetX: null, offsetY: null, type: null, distance: null, units: null })} title="Back to the scene's own grid">
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
