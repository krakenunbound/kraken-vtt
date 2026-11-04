import { useState } from "react";
import type { EditWall, MapLabel, SceneLightRecord, TableMap, WallKind } from "../session/useSession";
import type { SceneSettingsPatch } from "./SceneSettings";
import { LIGHT_PRESETS } from "../../shared/map/geometry.mjs";

// The GM's map editor, as FG's image layer panel: tabs across the top (FG's
// Line Of Sight, Lighting and Grid so far), a tool row for the tab and a
// rounded properties box. Every control is a table message the GM's agent
// has as a tool too (kraken_wall, kraken_light, kraken_scene_settings,
// kraken_map_undo).

export type EditTab = "walls" | "lights" | "mask" | "text" | "grid" | "paint" | "fx";
export type EditTool = "select" | "line" | "rect" | "poly" | "light" | "cell" | "text" | "number" | "free" | "ellipse" | "fxmask" | null;
// What the Paint tab draws next.
export type PaintStyle = { color: string; width: number; alpha: number; fill: string | null; fillAlpha: number; group: string };
export const LABEL_FONTS = ["Bebas Neue", "Cinzel", "Georgia", "Signika", "Arial", "Courier New"];
// What the Text tab places next (FG's text properties).
export type LabelStyle = { text: string; font: string; size: number; color: string; outline: { width: number; color: string }; shadow: { offset: number; blur: number; color: string }; group: string; icon: string };

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
  paintStyle: PaintStyle;
  setPaintStyle: (style: PaintStyle) => void;
  selectedFx: string | null;
  setSelectedFx: (id: string | null) => void;
  labelStyle: LabelStyle;
  setLabelStyle: (style: LabelStyle) => void;
  selectedLabel: string | null;
  maskMode: "reveal" | "hide";
  setMaskMode: (mode: "reveal" | "hide") => void;
  actions: {
    fx: (action: string, payload?: Record<string, unknown>) => void;
    clearDrawings: () => void;
    label: (action: string, payload?: Record<string, unknown>) => void;
    mapGroup: (action: string, payload?: Record<string, unknown>) => void;
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
            ["text", "Tt", "Text"],
            ["paint", "🖌", "Paint"],
            ["fx", "ƒx", "FX"],
          ] as const
        ).map(([id, icon, title]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} title={title} data-edit-tab={id} onClick={() => setTab(id)}>
            <span aria-hidden>{icon}</span>
            <small>{{ walls: "Walls", lights: "Lights", mask: "Mask", grid: "Grid", text: "Text", paint: "Paint", fx: "FX" }[id]}</small>
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
                  Angle
                  <input type="number" min={1} max={360} value={light.angle ?? 360} onChange={(event) => actions.updateLight(light.id, { angle: Number(event.target.value) || 360 })} aria-label="Light angle" />
                </label>
                <label>
                  Rotation
                  <input type="number" min={0} max={359} value={light.rotation ?? 0} onChange={(event) => actions.updateLight(light.id, { rotation: Number(event.target.value) || 0 })} aria-label="Light rotation" />
                </label>
                <label>
                  Animation
                  <select value={light.animation ?? "none"} onChange={(event) => actions.updateLight(light.id, { animation: event.target.value })} aria-label="Light animation">
                    <option value="none">None</option>
                    <option value="flicker">Flicker</option>
                    <option value="torch">Torch</option>
                    <option value="pulse">Pulse</option>
                    <option value="flash">Flash</option>
                  </select>
                </label>
                <label>
                  Speed
                  <input type="range" min={0} max={1} step={0.05} value={light.speed ?? 0.5} onChange={(event) => actions.updateLight(light.id, { speed: Number(event.target.value) })} aria-label="Light speed" />
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

      {tab === "text" ? (
        <TextTab {...props} />
      ) : null}
      {tab === "paint" ? <PaintTab {...props} /> : null}
      {tab === "fx" ? <FxTab {...props} /> : null}

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

// FG's Text tab: place text or the next number; FG's text properties; the
// layer groups (FG's folders) with Shown, Players and Lock, and renumbering.
function TextTab(props: Props) {
  const { map, tool, setTool, actions, labelStyle: style, setLabelStyle: setStyle } = props;
  const [newGroup, setNewGroup] = useState("");
  const chosen: MapLabel | null = props.selectedLabel ? (map.labels ?? []).find((label) => label.id === props.selectedLabel) ?? null : null;
  // Changes go to the selected text, and to what is placed next.
  const change = (patch: Partial<LabelStyle>) => {
    setStyle({ ...style, ...patch });
    if (chosen) actions.label("update", { id: chosen.id, patch });
  };
  const groups = map.groups ?? [];
  const toolButton = (id: EditTool, icon: string, title: string) => (
    <button type="button" className={tool === id ? "me-tool on" : "me-tool"} aria-pressed={tool === id} title={title} aria-label={title} data-edit-tool={id ?? "none"} onClick={() => setTool(tool === id ? null : id)}>
      {icon}
    </button>
  );
  const shown = chosen ?? style;
  return (
    <>
      <div className="me-tools">
        {toolButton("text", "T", "Place text: click the map")}
        {toolButton("number", "#", "Number: each click drops the group's next number (1, 2, 3...)")}
        {toolButton("select", "⬚", "Select text: click it; Delete removes it")}
        <span className="me-spacer" />
        <button type="button" className="me-tool" title="Undo" aria-label="Undo" onClick={actions.mapUndo}>
          ↶
        </button>
      </div>
      <div className="me-box">
        <label className="me-row">
          <input className="me-text" value={chosen ? chosen.text : style.text} placeholder="Enter text…" onChange={(event) => change({ text: event.target.value })} aria-label="Text" />
        </label>
        <div className="me-grid2">
          <label>
            Font
            <select value={shown.font} onChange={(event) => change({ font: event.target.value })} aria-label="Font">
              {LABEL_FONTS.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
          <label>
            Tint
            <input type="color" value={shown.color} onChange={(event) => change({ color: event.target.value })} aria-label="Text colour" />
          </label>
          <label>
            Size (squares)
            <input type="number" min={0.2} max={20} step={0.1} value={shown.size} onChange={(event) => change({ size: Number(event.target.value) || 1 })} aria-label="Text size" />
          </label>
          <label>
            Outline width
            <input type="number" min={0} max={10} value={shown.outline.width} onChange={(event) => change({ outline: { ...shown.outline, width: Number(event.target.value) || 0 } })} aria-label="Outline width" />
          </label>
          <label>
            Outline colour
            <input type="color" value={shown.outline.color} onChange={(event) => change({ outline: { ...shown.outline, color: event.target.value } })} aria-label="Outline colour" />
          </label>
          <label>
            Shadow offset
            <input type="number" min={0} max={10} value={shown.shadow.offset} onChange={(event) => change({ shadow: { ...shown.shadow, offset: Number(event.target.value) || 0 } })} aria-label="Shadow offset" />
          </label>
          <label>
            Shadow blur
            <input type="number" min={0} max={10} value={shown.shadow.blur} onChange={(event) => change({ shadow: { ...shown.shadow, blur: Number(event.target.value) || 0 } })} aria-label="Shadow blur" />
          </label>
          <label>
            Pin
            <select value={chosen ? chosen.icon : style.icon} onChange={(event) => change({ icon: event.target.value })} aria-label="Pin icon">
              <option value="">None</option>
              <option value="pin">📍 Pin</option>
              <option value="trap">⚠ Trap</option>
              <option value="door">🚪 Door</option>
              <option value="chest">🧰 Chest</option>
            </select>
          </label>
        </div>
        <label className="me-row">
          Group
          <select value={chosen ? chosen.group : style.group} onChange={(event) => change({ group: event.target.value })} aria-label="Text group">
            <option value="">(none)</option>
            {groups.map((group) => (
              <option key={group.name}>{group.name}</option>
            ))}
          </select>
        </label>
        {chosen ? (
          <div className="me-row">
            <button type="button" onClick={() => actions.label("update", { id: chosen.id, patch: { hidden: !chosen.hidden } })}>{chosen.hidden ? "Show to players" : "Hide from players"}</button>
            <button type="button" data-action="label-delete" onClick={() => actions.label("remove", { id: chosen.id })}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
      <div className="me-layers" aria-label="Layer groups">
        <div className="me-layer head">
          <b>LAYER GROUPS</b>
          <span title="Shown">👁</span>
          <span title="Players see it">👥</span>
          <span title="Locked">🔒</span>
        </div>
        {groups.map((group) => (
          <div key={group.name} className="me-layer" data-group={group.name}>
            <span>📁 {group.name}</span>
            <input type="checkbox" checked={group.shown !== false} onChange={(event) => actions.mapGroup("update", { name: group.name, patch: { shown: event.target.checked } })} aria-label={`${group.name} shown`} />
            <input type="checkbox" checked={group.players !== false} onChange={(event) => actions.mapGroup("update", { name: group.name, patch: { players: event.target.checked } })} aria-label={`${group.name} players`} />
            <input type="checkbox" checked={Boolean(group.locked)} onChange={(event) => actions.mapGroup("update", { name: group.name, patch: { locked: event.target.checked } })} aria-label={`${group.name} locked`} />
            <button type="button" title={`Renumber ${group.name} from 1`} onClick={() => actions.label("renumber", { group: group.name, start: 1 })}>
              1…
            </button>
          </div>
        ))}
        <div className="me-row">
          <input value={newGroup} placeholder="New group" onChange={(event) => setNewGroup(event.target.value)} aria-label="New group name" />
          <button
            type="button"
            data-action="group-add"
            onClick={() => {
              if (!newGroup.trim()) return;
              actions.mapGroup("update", { name: newGroup.trim(), patch: {} });
              setStyle({ ...style, group: newGroup.trim() });
              setNewGroup("");
            }}
          >
            + Group
          </button>
        </div>
      </div>
    </>
  );
}

// FG's Paint tab: freehand, line, rectangle, ellipse and closed shapes, with
// a stroke (colour, width, opacity) and Foundry's fill, in a layer group.
function PaintTab(props: Props) {
  const { tool, setTool, paintStyle: style, setPaintStyle: setStyle, map, actions } = props;
  const toolButton = (id: EditTool, icon: string, title: string) => (
    <button type="button" className={tool === id ? "me-tool on" : "me-tool"} aria-pressed={tool === id} title={title} aria-label={title} data-edit-tool={id ?? "none"} onClick={() => setTool(tool === id ? null : id)}>
      {icon}
    </button>
  );
  return (
    <>
      <div className="me-tools">
        {toolButton("free", "✎", "Paint freehand: drag")}
        {toolButton("line", "╱", "A straight line: click two points")}
        {toolButton("rect", "▭", "A rectangle: click two corners")}
        {toolButton("ellipse", "◯", "An ellipse: click two corners")}
        {toolButton("poly", "⬠", "A closed shape: click its corners, double-click to close")}
      </div>
      <div className="me-box">
        <div className="me-grid2">
          <label>
            Tint
            <input type="color" value={style.color} onChange={(event) => setStyle({ ...style, color: event.target.value })} aria-label="Paint colour" />
          </label>
          <label>
            Width (px)
            <input type="number" min={1} max={80} value={style.width} onChange={(event) => setStyle({ ...style, width: Number(event.target.value) || 6 })} aria-label="Paint width" />
          </label>
          <label>
            Opacity
            <input type="range" min={0.05} max={1} step={0.05} value={style.alpha} onChange={(event) => setStyle({ ...style, alpha: Number(event.target.value) })} aria-label="Paint opacity" />
          </label>
          <label>
            <span>
              <input type="checkbox" checked={style.fill !== null} onChange={(event) => setStyle({ ...style, fill: event.target.checked ? style.color : null })} aria-label="Fill" /> Fill
            </span>
            <input type="color" value={style.fill ?? style.color} disabled={style.fill === null} onChange={(event) => setStyle({ ...style, fill: event.target.value })} aria-label="Fill colour" />
          </label>
          <label>
            Fill opacity
            <input type="range" min={0} max={1} step={0.05} value={style.fillAlpha} disabled={style.fill === null} onChange={(event) => setStyle({ ...style, fillAlpha: Number(event.target.value) })} aria-label="Fill opacity" />
          </label>
          <label>
            Group
            <select value={style.group} onChange={(event) => setStyle({ ...style, group: event.target.value })} aria-label="Paint group">
              <option value="">(none)</option>
              {(map.groups ?? []).map((group) => (
                <option key={group.name}>{group.name}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="me-caption">Players draw with the play bar's pen; the GM's paint can be put in a group players do not see (make groups in the Text tab).</p>
      </div>
      <div className="me-foot">
        <span className="hint">{map.drawings?.length ?? 0} drawings</span>
        <button type="button" onClick={actions.clearDrawings}>
          Clear all
        </button>
      </div>
    </>
  );
}

const FX_LIST = ["rain", "storm", "snow", "blizzard", "fog", "clouds", "sandstorm", "embers", "ash", "leaves", "water"] as const;

// FG's FX tab: FX layers (several at once), FX Type, Amount, Intensity, Speed
// and Direction (0 to 100 as FG shows them), and a mask the effect fills or leaves.
function FxTab(props: Props) {
  const { map, actions, selectedFx, setSelectedFx, tool, setTool } = props;
  const layers = map.fx ?? [];
  const layer = layers.find((item) => item.id === selectedFx) ?? null;
  const set = (patch: Record<string, unknown>) => layer && actions.fx("update", { id: layer.id, patch });
  const slider = (key: "amount" | "intensity" | "speed", label: string) =>
    layer ? (
      <label className="me-slider">
        {label}
        <input type="range" min={0} max={100} value={Math.round(layer[key] * 100)} onChange={(event) => set({ [key]: Number(event.target.value) / 100 })} aria-label={`FX ${label}`} />
        <span>{Math.round(layer[key] * 100)}</span>
      </label>
    ) : null;
  return (
    <>
      <div className="me-tools">
        <button type="button" className="me-tool" title="New FX layer (rain)" aria-label="New FX layer" data-action="fx-add" onClick={() => actions.fx("add", { fx: { type: "rain", name: `FX ${layers.length + 1}` } })}>
          ✚
        </button>
        {layer ? (
          <button type="button" className={tool === "fxmask" ? "me-tool on" : "me-tool"} aria-pressed={tool === "fxmask"} title="Mask this effect to a rectangle: click two corners" aria-label="Mask the effect" data-edit-tool="fxmask" onClick={() => setTool(tool === "fxmask" ? null : "fxmask")}>
            ▭
          </button>
        ) : null}
      </div>
      <div className="me-box">
        {layer ? (
          <>
            <label className="me-row">
              FX Type
              <select value={layer.type} onChange={(event) => set({ type: event.target.value })} aria-label="FX type">
                {FX_LIST.map((type) => (
                  <option key={type} value={type}>
                    {type[0].toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            {slider("amount", "Amount")}
            {slider("intensity", "Intensity")}
            {slider("speed", "Speed")}
            <label className="me-slider">
              Direction
              <input type="range" min={0} max={359} value={layer.direction} onChange={(event) => set({ direction: Number(event.target.value) })} aria-label="FX direction" />
              <span>{layer.direction}°</span>
            </label>
            <div className="me-row">
              <label>
                <input type="checkbox" checked={layer.mask.use} disabled={!layer.mask.polygons.length} onChange={(event) => set({ mask: { use: event.target.checked } })} /> Use mask
              </label>
              <select value={layer.mask.mode} onChange={(event) => set({ mask: { mode: event.target.value } })} aria-label="FX mask mode">
                <option value="inside">Only inside</option>
                <option value="outside">Everywhere but inside</option>
              </select>
              <button type="button" onClick={() => set({ mask: { use: false, polygons: [] } })} disabled={!layer.mask.polygons.length}>
                Clear mask
              </button>
            </div>
            <div className="me-row">
              <label>
                <input type="checkbox" checked={layer.players} onChange={(event) => set({ players: event.target.checked })} /> Players see it
              </label>
              <label>
                <input type="checkbox" checked={layer.shown} onChange={(event) => set({ shown: event.target.checked })} /> Shown
              </label>
              <button type="button" onClick={() => {
                actions.fx("remove", { id: layer.id });
                setSelectedFx(null);
              }}>
                Delete
              </button>
            </div>
          </>
        ) : (
          <p className="me-caption">Add an FX layer, or pick one below. Several can run at once: water in a river, rain everywhere but under a roof.</p>
        )}
      </div>
      <div className="me-layers" aria-label="FX layers">
        <div className="me-layer head">
          <b>FX LAYERS</b>
        </div>
        {layers.map((item) => (
          <button key={item.id} type="button" className={item.id === selectedFx ? "me-layer-row on" : "me-layer-row"} data-fx={item.id} onClick={() => setSelectedFx(item.id)}>
            ƒx {item.name || item.type} <small className="hint">{item.type}{item.mask.use ? ` · masked ${item.mask.mode}` : ""}{item.players ? "" : " · GM only"}</small>
          </button>
        ))}
      </div>
    </>
  );
}
