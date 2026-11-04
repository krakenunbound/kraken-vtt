import { Icon } from "../ui/icons";
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { backgroundRect, colorWithAlpha, gridStops, sceneFrame, type BackgroundFit, type SceneFrame } from "../foundry/geometry";
import { type SceneLight, type SceneMarker, type SceneRegion, type SceneWall } from "../foundry/sceneObjects";
import { gridDistance, gridKind, gridOrigin, hexCorners, hexOf, LIGHT_PRESETS, snapCenter, withGrid } from "../../shared/map/geometry.mjs";
import type { EditWall, MapToken, Ping, SceneLightRecord, TableMap, TableRecord, WallKind } from "../session/useSession";
import { useBookWindows } from "../books/Books";
import { MapEditor, kindColor, type EditTab, type EditTool, type LabelStyle, type PaintStyle } from "./MapEditor";
import { Lighting } from "./Lighting";
import { SceneGraphics, SceneLegend, type OverlayToken } from "./SceneOverlay";
import { SceneSettings, type SceneSettingsPatch } from "./SceneSettings";
// three.js only loads when a scene has weather.
const Weather = lazy(() => import("./Weather").then((module) => ({ default: module.Weather })));

export type MapScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  padding: number;
  backgroundColor: string;
  grid: {
    size: number;
    type: number;
    color: string;
    alpha: number;
    distance: number;
    units: string;
    offsetX?: number;
    offsetY?: number;
  };
  // The scene's own grid, under the GM's settings.
  baseGrid?: MapScene["grid"];
  imageUrl: string | null;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  anchorX: number;
  anchorY: number;
  fit: BackgroundFit;
  walls: SceneWall[];
  darkness: number;
  lights: SceneLight[];
  tokens: OverlayToken[];
  markers: SceneMarker[];
  regions: SceneRegion[];
};

type Camera = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

const MIN_SCALE = 0.02;
const MAX_SCALE = 8;
// FG draws a token at 80% of its space (token auto-scale option TASG "80").
const TOKEN_FILL = 0.8;
// A player opens the map at a zoom where a square is this many screen pixels.
const PLAYER_SQUARE_PX = 64;

function fitCamera(viewWidth: number, viewHeight: number, frame: SceneFrame, mapWidth: number, mapHeight: number): Camera {
  const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight) * 0.96;
  const centerX = frame.padX + mapWidth / 2;
  const centerY = frame.padY + mapHeight / 2;
  return { scale, x: viewWidth / 2 - centerX * scale, y: viewHeight / 2 - centerY * scale };
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function initials(name: string): string {
  const words = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Pointer capture fails for a pointer the browser no longer tracks; the drag still works without it.
function capture(element: Element, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    /* keep going */
  }
}

function loadExplored(key: string): number[][] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item) => Array.isArray(item)) : [];
  } catch {
    return [];
  }
}

function saveExplored(key: string, polygons: number[][]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(polygons));
  } catch {
    /* a full or blocked store only loses the dimmed memory */
  }
}

function polygonKey(points: number[]): string {
  let hash = 0;
  for (const value of points) hash = (hash * 31 + value) | 0;
  return `${points.length}:${hash}`;
}

function polygonPoints(points: number[]): string {
  const pairs: string[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) pairs.push(`${points[index]},${points[index + 1]}`);
  return pairs.join(" ");
}

export type MapActions = {
  placeToken: (recordId: string | null, x?: number, y?: number, name?: string) => void;
  moveToken: (id: string, x: number, y: number, snap?: boolean) => void;
  removeToken: (id: string) => void;
  setDoor: (id: string, state?: number) => void;
  setSight: (on: boolean) => void;
  setLocked: (on: boolean) => void;
  updateToken: (id: string, patch: Partial<Pick<MapToken, "name" | "hidden" | "squares" | "faction" | "owner" | "vision">> & { light?: string | MapToken["light"] }) => void;
  updateSettings: (patch: SceneSettingsPatch) => void;
  placeLight: (light: Partial<SceneLightRecord> & { preset?: string }) => void;
  updateLight: (id: string, patch: Partial<SceneLightRecord>) => void;
  removeLight: (id: string) => void;
  ping: (x: number, y: number) => void;
  draw: (points: number[], color: string | null, width: number) => void;
  eraseDrawing: (id: string) => void;
  clearDrawings: () => void;
  ct: (action: string, payload?: Record<string, unknown>) => void;
  // The GM's map editor.
  wall?: (action: string, payload?: Record<string, unknown>) => void;
  mask?: (action: string, payload?: Record<string, unknown>) => void;
  label?: (action: string, payload?: Record<string, unknown>) => void;
  mapGroup?: (action: string, payload?: Record<string, unknown>) => void;
  paint?: (payload: Record<string, unknown>) => void;
  fx?: (action: string, payload?: Record<string, unknown>) => void;
  mapUndo?: () => void;
  libraryAction?: (action: string, payload?: Record<string, unknown>) => void;
};
// What a left-drag does on the map: pan it, ping, draw, or rub a line out.
type Tool = "pan" | "ping" | "draw" | "erase";
const DRAW_COLORS = ["#ffcc33", "#ff5a5a", "#5ad1ff", "#7dff7a", "#d38cff", "#ffffff", "#111111"];

type Drag = { pointerId: number; id: string; start: Point; at: Point; moved: boolean; snap: boolean; squares: number };
type Measure = { pointerId: number; start: Point; at: Point };
type Menu = { id: string; left: number; top: number };

export function MapView({
  scene: sceneIn,
  gm = true,
  map,
  records = [],
  pings = [],
  notice = null,
  actions,
  targeted = [],
  me = "",
}: {
  scene: MapScene;
  gm?: boolean;
  map: TableMap;
  records?: TableRecord[];
  pings?: Ping[];
  notice?: string | null;
  actions: MapActions;
  // Tokens this seat's creatures have targeted (a reticle shows on them).
  targeted?: string[];
  // This seat's name (a player rubs out only their own lines).
  me?: string;
}) {
  // The scene with the GM's grid settings over its own (type, cell size, offset...).
  const scene = useMemo(
    () => withGrid({ ...sceneIn, grid: sceneIn.baseGrid ?? sceneIn.grid }, map.sceneId === sceneIn.id ? map.settings.grid : null) as MapScene,
    [sceneIn, map.sceneId, map.settings.grid],
  );
  const [tool, setTool] = useState<Tool>("pan");
  const bookWindows = useBookWindows();
  // A map pin (FG's shortcut): its story entry opens in the book; an encounter goes to the tracker.
  function openPin(link: { kind: string; id: string }) {
    if (link.kind !== "fg") return;
    const [record, ...rest] = link.id.split("@");
    const module = rest.join("@");
    const page = /^reference\.refmanualdata\.([^.]+)$/.exec(record)?.[1];
    if (page) bookWindows.openBook(module, module, page);
    else if (/^battle\./.test(record) && gm && actions.libraryAction && window.confirm("Put this encounter on the combat tracker (its tokens on this map, hidden)?")) actions.libraryAction("battle", { path: link.id });
  }
  // The GM's map editor (FG's image layer panel).
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTab, setEditTab] = useState<EditTab>("walls");
  const [editTool, setEditTool] = useState<EditTool>(null);
  const [wallKind, setWallKind] = useState<WallKind>("wall");
  const [gridSnap, setGridSnap] = useState(true);
  const [pointSnap, setPointSnap] = useState(true);
  const [selectedWalls, setSelectedWalls] = useState<string[]>([]);
  const [selectedLight, setSelectedLight] = useState<string | null>(null);
  const [lightPreset, setLightPreset] = useState("torch");
  const [pending, setPending] = useState<number[]>([]);
  const [maskMode, setMaskMode] = useState<"reveal" | "hide">("reveal");
  const [labelStyle, setLabelStyle] = useState<LabelStyle>({ text: "", font: "Bebas Neue", size: 1, color: "#ffffff", outline: { width: 2, color: "#000000" }, shadow: { offset: 0, blur: 0, color: "#000000" }, group: "", icon: "" });
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [paintStyle, setPaintStyle] = useState<PaintStyle>({ color: "#c0392b", width: 6, alpha: 1, fill: null, fillAlpha: 0.4, group: "" });
  const [selectedFx, setSelectedFx] = useState<string | null>(null);
  const paintStroke = useRef<{ pointerId: number; points: number[] } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [drawColor, setDrawColor] = useState<string | null>(null);
  const [stroke, setStroke] = useState<{ pointerId: number; points: number[] } | null>(null);
  const [found, setFound] = useState<{ id: string; at: number } | null>(null);
  const [hint, setHint] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{ id: number; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 0.1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [panning, setPanning] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [showWalls, setShowWalls] = useState(true);
  const [showLights, setShowLights] = useState(true);
  const [showCreatures, setShowCreatures] = useState(true);
  const [trayOpen, setTrayOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightMenu, setLightMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const lightDrag = useRef<{ pointerId: number; id: string } | null>(null);
  const explored = useRef<{ sceneId: string; polygons: number[][] }>({ sceneId: "", polygons: [] });
  const frame = sceneFrame(scene);
  const size = scene.grid.size > 0 ? scene.grid.size : 100;
  const gridSettings = map.sceneId === scene.id ? map.settings.grid : { show: true, alpha: null, color: null };
  const gridStroke = colorWithAlpha(gridSettings.color ?? scene.grid.color, gridSettings.alpha ?? scene.grid.alpha);
  const kindOfGrid = gridKind(scene);
  const drawSquare = kindOfGrid === "square" && scene.grid.size > 0 && gridSettings.show;
  const offX = ((Number(scene.grid.offsetX) || 0) % scene.grid.size + scene.grid.size) % scene.grid.size;
  const offY = ((Number(scene.grid.offsetY) || 0) % scene.grid.size + scene.grid.size) % scene.grid.size;
  const vertical = drawSquare ? gridStops(scene.width, scene.grid.size).map((x) => x + offX).filter((x) => x <= scene.width) : [];
  const horizontal = drawSquare ? gridStops(scene.height, scene.grid.size).map((y) => y + offY).filter((y) => y <= scene.height) : [];
  const gridDash = gridSettings.style === "dashed" ? `${6 / camera.scale} ${4 / camera.scale}` : gridSettings.style === "dotted" ? `${1 / camera.scale} ${4 / camera.scale}` : undefined;
  // Hex grids: one path of every hex over the scene (FG's hex rows and columns).
  const hexPath = useMemo(() => {
    if (!gridSettings.show || (kindOfGrid !== "hexrow" && kindOfGrid !== "hexcol")) return "";
    const origin = { x: frame.padX, y: frame.padY };
    const a = hexOf(scene, origin.x, origin.y);
    const b = hexOf(scene, origin.x + scene.width, origin.y + scene.height);
    const parts: string[] = [];
    const span = Math.abs(b.q - a.q) + Math.abs(b.r - a.r) + 4;
    if (span > 400) return "";
    for (let q = Math.min(a.q, b.q) - span; q <= Math.max(a.q, b.q) + span; q += 1) {
      for (let r = Math.min(a.r, b.r) - span; r <= Math.max(a.r, b.r) + span; r += 1) {
        const corners = hexCorners(scene, q, r);
        const cx = (corners[0] + corners[6]) / 2;
        const cy = (corners[1] + corners[7]) / 2;
        if (cx < origin.x - scene.grid.size || cy < origin.y - scene.grid.size || cx > origin.x + scene.width + scene.grid.size || cy > origin.y + scene.height + scene.grid.size) continue;
        parts.push(`M${corners.slice(0, 2).join(",")}L${corners.slice(2).join(" ")}Z`);
      }
    }
    return parts.join("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindOfGrid, gridSettings.show, scene.grid.size, scene.grid.offsetX, scene.grid.offsetY, scene.width, scene.height, frame.padX, frame.padY]);
  // The walls the GM sees: the table's own (editable), else the imported ones.
  const liveWalls = useMemo(
    () =>
      (map.walls ?? []).map((wall: EditWall) => ({
        ...wall,
        category: (wall.kind === "secret" ? "secret" : wall.kind === "door" ? "door" : wall.kind === "window" ? "window" : wall.kind === "terrain" ? "terrain" : wall.kind === "invisible" ? "invisible" : wall.kind === "ethereal" || wall.kind === "illusion" ? "ethereal" : wall.kind === "shadow" ? "blank" : "normal") as SceneWall["category"],
      })),
    [map.walls],
  );
  const wallsShown: SceneWall[] = map.walls ? liveWalls : scene.walls;
  const backdrop = backgroundRect(scene, frame, natural);
  const strokeWidth = 1 / camera.scale;
  const units = scene.grid.units || "ft";
  const tokens = map.sceneId === scene.id ? map.tokens : [];
  const doorStates = useMemo(() => Object.fromEntries(map.doors.map((door) => [door.id, door.state])), [map.doors]);
  const vision = !gm && map.sceneId === scene.id ? map.vision : null;
  const mine = tokens.filter((token) => token.mine);

  // Areas a player has seen stay dimly shown after their tokens move on,
  // and after a reload (kept in this browser).
  const exploredKey = `kraken-explored:${scene.id}:${mine[0]?.owner ?? ""}`;
  if (explored.current.sceneId !== exploredKey) explored.current = { sceneId: exploredKey, polygons: vision ? loadExplored(exploredKey) : [] };
  if (vision) {
    const known = explored.current.polygons;
    let added = false;
    // Compare whole polygons: a door opened from the same spot gives a view
    // that starts like the old one but reaches further.
    for (const polygon of vision) {
      const key = polygonKey(polygon);
      if (!known.some((item) => polygonKey(item) === key)) {
        known.push(polygon);
        added = true;
      }
    }
    if (known.length > 200) known.splice(0, known.length - 200);
    if (added) saveExplored(exploredKey, known);
  }

  useEffect(() => {
    setNatural(null);
    setImageFailed(false);
    setSelected(null);
    setMenu(null);
  }, [scene.id, scene.imageUrl]);

  // The first view of a scene: the GM sees all of it; a player starts on
  // their own token, close enough to see the squares.
  const framedFor = useRef("");
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const apply = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const own = mine[0];
      const key = `${scene.id}|${own ? "token" : "fit"}`;
      if (framedFor.current === key || (framedFor.current.startsWith(`${scene.id}|`) && !own)) return;
      framedFor.current = key;
      if (!gm && own) setCamera(centeredOn(rect, own, PLAYER_SQUARE_PX / size));
      else setCamera(fitCamera(rect.width, rect.height, sceneFrame(scene), scene.width, scene.height));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scene.id, scene.width, scene.height, scene.padding, scene.grid.size, gm, mine[0]?.id]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      // Proportional to the wheel, so a mouse notch and a trackpad both feel right.
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      const factor = Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.0022);
      setCamera((current) => {
        const scale = clampScale(current.scale * factor);
        const worldX = (pointerX - current.x) / current.scale;
        const worldY = (pointerY - current.y) / current.scale;
        return { scale, x: pointerX - worldX * scale, y: pointerY - worldY * scale };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard: arrows move the selected token a square, Delete removes it (GM),
  // H hides or shows it (GM), Escape lets go.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      if (!viewport.current?.offsetParent) return;
      const token = tokens.find((item) => item.id === selected);
      if (event.key === "Escape") {
        setSelected(null);
        setMenu(null);
        return;
      }
      if (!token || !(gm || token.mine)) return;
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (step) {
        event.preventDefault();
        actions.moveToken(token.id, token.x + step[0] * size, token.y + step[1] * size, true);
      } else if (gm && (event.key === "Delete" || event.key === "Backspace")) {
        actions.removeToken(token.id);
        setSelected(null);
      } else if (gm && event.key.toLowerCase() === "h") {
        actions.updateToken(token.id, { hidden: !token.hidden });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tokens, selected, gm, size, actions]);

  useEffect(() => {
    const onFocus = (event: Event) => {
      const token = tokens.find((item) => item.id === (event as CustomEvent<string>).detail);
      if (token) lookAt(token);
    };
    window.addEventListener("kraken:focus-token", onFocus);
    return () => window.removeEventListener("kraken:focus-token", onFocus);
  });

  function centeredOn(rect: DOMRect, point: Point, scale: number): Camera {
    const next = clampScale(scale);
    return { scale: next, x: rect.width / 2 - point.x * next, y: rect.height / 2 - point.y * next };
  }

  function zoomAboutCenter(factor: number) {
    const element = viewport.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setCamera((current) => {
      const scale = clampScale(current.scale * factor);
      const worldX = (rect.width / 2 - current.x) / current.scale;
      const worldY = (rect.height / 2 - current.y) / current.scale;
      return { scale, x: rect.width / 2 - worldX * scale, y: rect.height / 2 - worldY * scale };
    });
  }

  function fit() {
    const element = viewport.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setCamera(fitCamera(rect.width, rect.height, frame, scene.width, scene.height));
  }

  function lookAt(token: MapToken, close = false) {
    const element = viewport.current;
    if (!element) return;
    setSelected(token.id);
    // Found from the toolbar: close in (a square about 110 px), so a lost player sees just where they are.
    setCamera((current) => centeredOn(element.getBoundingClientRect(), token, close ? 110 / size : Math.max(current.scale, PLAYER_SQUARE_PX / size)));
    if (close) {
      setFound({ id: token.id, at: Date.now() });
      window.setTimeout(() => setFound((current) => (current && Date.now() - current.at >= 1900 ? null : current)), 2000);
    }
  }
  function findMine() {
    const token = tokens.find((item) => item.id === selected && (gm || item.mine)) ?? mine[0];
    if (token) {
      lookAt(token, true);
      setHint("");
    } else {
      setHint(gm ? "Select a token first." : "Your token is not on this map.");
      window.setTimeout(() => setHint(""), 3000);
    }
  }
  // The nearest line this seat may rub out, within a few screen pixels.
  function lineAt(point: Point) {
    const reach = 10 / camera.scale;
    let best: { id: string; distance: number } | null = null;
    for (const line of map.drawings ?? []) {
      if (!gm && line.by !== me) continue;
      for (let index = 0; index + 3 < line.points.length; index += 2) {
        const [x1, y1, x2, y2] = line.points.slice(index, index + 4);
        const length = Math.hypot(x2 - x1, y2 - y1) || 1;
        const along = Math.max(0, Math.min(1, ((point.x - x1) * (x2 - x1) + (point.y - y1) * (y2 - y1)) / (length * length)));
        const distance = Math.hypot(point.x - (x1 + along * (x2 - x1)), point.y - (y1 + along * (y2 - y1))) - line.width / 2;
        if (distance < reach && (!best || distance < best.distance)) best = { id: line.id, distance };
      }
    }
    return best?.id ?? null;
  }

  function worldAt(clientX: number, clientY: number): Point | null {
    const element = viewport.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const current = cameraRef.current;
    return { x: (clientX - rect.left - current.x) / current.scale, y: (clientY - rect.top - current.y) / current.scale };
  }

  function viewCenter(): Point | null {
    const element = viewport.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return worldAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function distanceLabel(from: Point, to: Point): string {
    return `${gridDistance(scene, from, to, 1)} ${units}`;
  }

  // Wall points snap to the grid's corners (hex corners on a hex grid) and to
  // existing wall ends (FG's Grid Snap and Point Snap); Shift draws free.
  function snapPoint(point: Point, snapping: boolean): Point {
    const round = (value: number) => Math.round(value * 10) / 10;
    if (snapping && pointSnap) {
      const reach = 10 / camera.scale;
      let best: Point | null = null;
      let bestDistance = reach;
      for (const wall of map.walls ?? []) {
        for (const end of [
          { x: wall.x1, y: wall.y1 },
          { x: wall.x2, y: wall.y2 },
        ]) {
          const distance = Math.hypot(end.x - point.x, end.y - point.y);
          if (distance < bestDistance) {
            best = end;
            bestDistance = distance;
          }
        }
      }
      if (best) return best;
    }
    if (snapping && gridSnap) {
      if (kindOfGrid === "square") {
        const origin = gridOrigin(scene);
        const half = size / 2;
        // Corners and the middle of each side (Foundry's half-square snap).
        return { x: round(Math.round((point.x - origin.x) / half) * half + origin.x), y: round(Math.round((point.y - origin.y) / half) * half + origin.y) };
      }
      if (kindOfGrid === "hexrow" || kindOfGrid === "hexcol") {
        const { q, r } = hexOf(scene, point.x, point.y);
        const corners = hexCorners(scene, q, r);
        let best = { x: point.x, y: point.y };
        let bestDistance = Infinity;
        for (let i = 0; i < 12; i += 2) {
          const distance = Math.hypot(corners[i] - point.x, corners[i + 1] - point.y);
          if (distance < bestDistance) {
            best = { x: round(corners[i]), y: round(corners[i + 1]) };
            bestDistance = distance;
          }
        }
        return best;
      }
    }
    return { x: round(point.x), y: round(point.y) };
  }
  function wallAt(point: Point): string | null {
    let best: string | null = null;
    let bestDistance = 8 / camera.scale;
    for (const wall of map.walls ?? []) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const length = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / length));
      const distance = Math.hypot(point.x - (wall.x1 + t * dx), point.y - (wall.y1 + t * dy));
      if (distance < bestDistance) {
        best = wall.id;
        bestDistance = distance;
      }
    }
    return best;
  }
  function finishShape() {
    if (editTab === "paint" && editTool === "poly" && pending.length >= 6 && actions.paint) {
      actions.paint({ shape: "poly", points: pending, color: paintStyle.color, width: paintStyle.width, alpha: paintStyle.alpha, ...(paintStyle.fill ? { fill: paintStyle.fill, fillAlpha: paintStyle.fillAlpha } : {}), ...(paintStyle.group ? { group: paintStyle.group } : {}) });
      setPending([]);
      setHover(null);
      return;
    }
    if (editTab === "mask" && editTool === "poly" && pending.length >= 6 && actions.mask) actions.mask(maskMode, { points: pending });
    else if (editTool === "poly" && pending.length >= 6 && actions.wall) actions.wall("add", { wall: { points: pending, closed: true, kind: wallKind } });
    setPending([]);
    setHover(null);
  }
  // Esc ends a chain, Enter closes a shape, Delete removes the selection, Ctrl+Z undoes.
  useEffect(() => {
    if (!gm || !editorOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if (event.key === "Escape") {
        setPending([]);
        setHover(null);
      } else if (event.key === "Enter") finishShape();
      else if ((event.key === "Delete" || event.key === "Backspace") && editTab === "text" && selectedLabel && actions.label) {
        actions.label("remove", { id: selectedLabel });
        setSelectedLabel(null);
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedWalls.length && actions.wall) {
        actions.wall("remove", { ids: selectedWalls });
        setSelectedWalls([]);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && actions.mapUndo) {
        event.preventDefault();
        actions.mapUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gm, editorOpen, selectedWalls, pending, editTool, wallKind, editTab, selectedLabel]);
  useEffect(() => {
    setPending([]);
    setHover(null);
  }, [editTool, editorOpen]);

  const placeable = records.filter((record) => record.type === "character" && (gm || record.owner !== ""));
  const dragging = drag ? tokens.find((token) => token.id === drag.id) : null;
  const ghost = drag && drag.moved ? (drag.snap ? snapCenter(scene, drag.at.x, drag.at.y, drag.squares) : drag.at) : null;

  return (
    <div
      className={panning ? "viewport dragging" : "viewport"}
      ref={viewport}
      tabIndex={-1}
      data-scene={scene.name}
      data-gm={gm ? "true" : "false"}
      data-sight={map.sight ? "on" : "off"}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest(".map-controls, .legend, .token-tray, .token-menu, .scene-settings, .map-editor")) return;
        setMenu(null);
        setLightMenu(null);
        if (event.button === 2) {
          // Right-drag measures, as FG's pointer does.
          const point = worldAt(event.clientX, event.clientY);
          if (!point) return;
          capture(event.currentTarget, event.pointerId);
          setMeasure({ pointerId: event.pointerId, start: point, at: point });
          return;
        }
        if (event.button !== 0) return;
        setSelected(null);
        if (gm && editorOpen && editTool && editTab === "fx" && editTool === "fxmask" && actions.fx && selectedFx) {
          // The FX layer's mask: a rectangle, two clicks.
          const raw = worldAt(event.clientX, event.clientY);
          if (!raw) return;
          if (pending.length >= 2) {
            const [x1, y1] = pending;
            actions.fx("update", { id: selectedFx, patch: { mask: { use: true, polygons: [[x1, y1, raw.x, y1, raw.x, raw.y, x1, raw.y].map(Math.round)] } } });
            setPending([]);
          } else setPending([Math.round(raw.x), Math.round(raw.y)]);
          return;
        }
        if (gm && editorOpen && editTool && editTab === "paint" && actions.paint) {
          // The GM's paint: freehand by dragging; lines, rectangles, ellipses by two clicks; shapes by corners.
          const raw = worldAt(event.clientX, event.clientY);
          if (!raw) return;
          const point = { x: Math.round(raw.x), y: Math.round(raw.y) };
          const style = { color: paintStyle.color, width: paintStyle.width, alpha: paintStyle.alpha, ...(paintStyle.fill ? { fill: paintStyle.fill, fillAlpha: paintStyle.fillAlpha } : {}), ...(paintStyle.group ? { group: paintStyle.group } : {}) };
          if (editTool === "free") {
            capture(event.currentTarget, event.pointerId);
            paintStroke.current = { pointerId: event.pointerId, points: [point.x, point.y] };
            setStroke({ pointerId: -1, points: [point.x, point.y] });
          } else if (editTool === "line" || editTool === "rect" || editTool === "ellipse") {
            if (pending.length >= 2) {
              actions.paint({ ...style, shape: editTool, points: [pending[0], pending[1], point.x, point.y] });
              setPending([]);
            } else setPending([point.x, point.y]);
          } else if (editTool === "poly") setPending((current) => [...current, point.x, point.y]);
          return;
        }
        if (gm && editorOpen && editTool && editTab === "text" && actions.label) {
          // Text: place it, drop the next number, or select a label.
          const raw = worldAt(event.clientX, event.clientY);
          if (!raw) return;
          if (editTool === "select") {
            const near = (map.labels ?? []).find((label) => Math.hypot(label.x - raw.x, label.y - raw.y) < Math.max(size * label.size * 0.6, 12 / camera.scale));
            setSelectedLabel(near?.id ?? null);
          } else if (editTool === "number") actions.label("add", { label: { ...labelStyle, text: "#", x: Math.round(raw.x), y: Math.round(raw.y), numbering: true, group: labelStyle.group || "Numbers" } });
          else if (editTool === "text") {
            if (!labelStyle.text.trim()) setHint("Type the text in the Text tab first.");
            else actions.label("add", { label: { ...labelStyle, x: Math.round(raw.x), y: Math.round(raw.y) } });
          }
          return;
        }
        if (gm && editorOpen && editTool && editTab === "mask" && actions.mask) {
          // The mask: a rectangle, a shape or whole squares, revealed or hidden again.
          const raw = worldAt(event.clientX, event.clientY);
          if (!raw) return;
          const point = snapPoint(raw, !event.shiftKey);
          if (editTool === "cell") {
            const corner = gridOrigin(scene);
            const col = Math.floor((raw.x - corner.x) / size);
            const row = Math.floor((raw.y - corner.y) / size);
            const x = corner.x + col * size;
            const y = corner.y + row * size;
            actions.mask(maskMode, { points: [x, y, x + size, y, x + size, y + size, x, y + size] });
          } else if (editTool === "rect") {
            if (pending.length >= 2) {
              const [x1, y1] = pending;
              actions.mask(maskMode, { points: [x1, y1, point.x, y1, point.x, point.y, x1, point.y] });
              setPending([]);
            } else setPending([point.x, point.y]);
          } else if (editTool === "poly") setPending((current) => [...current, point.x, point.y]);
          return;
        }
        if (gm && editorOpen && editTool && actions.wall) {
          const raw = worldAt(event.clientX, event.clientY);
          if (!raw) return;
          const point = snapPoint(raw, !event.shiftKey);
          if (editTool === "select") {
            const id = wallAt(raw);
            setSelectedWalls((current) => (id ? (event.shiftKey ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]) : event.shiftKey ? current : []));
          } else if (editTool === "light") {
            actions.placeLight({ x: Math.round(raw.x), y: Math.round(raw.y), preset: lightPreset });
          } else if (editTool === "line") {
            // Point to point: each click adds a wall from the last point (FG's line, Foundry's chain).
            if (pending.length >= 2) actions.wall("add", { wall: { points: [pending[0], pending[1], point.x, point.y], kind: wallKind } });
            setPending([point.x, point.y]);
          } else if (editTool === "rect") {
            if (pending.length >= 2) {
              const [x1, y1] = pending;
              actions.wall("add", { wall: { points: [x1, y1, point.x, y1, point.x, point.y, x1, point.y], closed: true, kind: wallKind } });
              setPending([]);
            } else setPending([point.x, point.y]);
          } else if (editTool === "poly") {
            setPending((current) => [...current, point.x, point.y]);
          }
          return;
        }
        if (tool !== "pan") {
          const point = worldAt(event.clientX, event.clientY);
          if (!point) return;
          if (tool === "ping") actions.ping(point.x, point.y);
          else if (tool === "erase") {
            const id = lineAt(point);
            if (id) actions.eraseDrawing(id);
          } else {
            capture(event.currentTarget, event.pointerId);
            setStroke({ pointerId: event.pointerId, points: [Math.round(point.x), Math.round(point.y)] });
          }
          return;
        }
        capture(event.currentTarget, event.pointerId);
        pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setPanning(true);
      }}
      onPointerMove={(event) => {
        if (paintStroke.current && paintStroke.current.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          const current = paintStroke.current;
          const [lastX, lastY] = current.points.slice(-2);
          if (point && Math.hypot(point.x - lastX, point.y - lastY) > 3 / camera.scale && current.points.length < 3990) {
            current.points.push(Math.round(point.x), Math.round(point.y));
            setStroke({ pointerId: -1, points: [...current.points] });
          }
          return;
        }
        if (gm && editorOpen && pending.length >= 2) {
          const point = worldAt(event.clientX, event.clientY);
          if (point) setHover(snapPoint(point, !event.shiftKey));
        }
        if (lightDrag.current && lightDrag.current.pointerId === event.pointerId) return;
        if (drag && drag.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          if (!point) return;
          const moved = drag.moved || Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > size * 0.2;
          setDrag({ ...drag, at: point, moved, snap: !event.altKey });
          return;
        }
        if (measure && measure.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          if (point) setMeasure({ ...measure, at: point });
          return;
        }
        if (stroke && stroke.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          const [lastX, lastY] = stroke.points.slice(-2);
          if (point && Math.hypot(point.x - lastX, point.y - lastY) > 3 / camera.scale && stroke.points.length < 3990) setStroke({ ...stroke, points: [...stroke.points, Math.round(point.x), Math.round(point.y)] });
          return;
        }
        const current = pan.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        current.x = event.clientX;
        current.y = event.clientY;
        setCamera((camera) => ({ ...camera, x: camera.x + dx, y: camera.y + dy }));
      }}
      onPointerUp={(event) => {
        if (paintStroke.current && paintStroke.current.pointerId === event.pointerId) {
          const points = paintStroke.current.points.length >= 4 ? paintStroke.current.points : [...paintStroke.current.points, paintStroke.current.points[0] + 1, paintStroke.current.points[1] + 1];
          actions.paint?.({ points, color: paintStyle.color, width: paintStyle.width, alpha: paintStyle.alpha, ...(paintStyle.group ? { group: paintStyle.group } : {}) });
          paintStroke.current = null;
          setStroke(null);
          return;
        }
        if (lightDrag.current && lightDrag.current.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          if (point) actions.updateLight(lightDrag.current.id, { x: Math.round(point.x), y: Math.round(point.y) });
          lightDrag.current = null;
          return;
        }
        if (drag && drag.pointerId === event.pointerId) {
          if (drag.moved) actions.moveToken(drag.id, drag.at.x, drag.at.y, !event.altKey);
          setDrag(null);
          return;
        }
        if (measure && measure.pointerId === event.pointerId) {
          setMeasure(null);
          return;
        }
        if (stroke && stroke.pointerId === event.pointerId) {
          // A click is a dot: a short line where it was.
          const points = stroke.points.length >= 4 ? stroke.points : [...stroke.points, stroke.points[0] + 1, stroke.points[1] + 1];
          actions.draw(points, drawColor, Math.max(2, Math.round(4 / camera.scale)));
          setStroke(null);
          return;
        }
        if (pan.current?.id === event.pointerId) {
          pan.current = null;
          setPanning(false);
        }
      }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest(".map-controls, .legend, .token-tray, .token, .token-menu, .scene-settings, .light-handle, .map-editor")) return;
        if (gm && editorOpen && editTool && editTool !== "select" && editTool !== "light") {
          finishShape();
          return;
        }
        const point = worldAt(event.clientX, event.clientY);
        if (point) actions.ping(point.x, point.y);
      }}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("application/x-kraken-record")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        const recordId = event.dataTransfer.getData("application/x-kraken-record");
        if (!recordId) return;
        event.preventDefault();
        event.stopPropagation();
        const point = worldAt(event.clientX, event.clientY);
        if (point) actions.placeToken(recordId, point.x, point.y);
      }}
    >
      <div
        className="world"
        data-scale={camera.scale}
        style={{
          width: frame.worldWidth,
          height: frame.worldHeight,
          background: scene.backgroundColor,
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
        }}
      >
        {scene.imageUrl && !imageFailed ? (
          <img
            src={scene.imageUrl}
            alt={scene.name}
            draggable={false}
            style={{ left: backdrop.left, top: backdrop.top, width: backdrop.width, height: backdrop.height }}
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setImageFailed(true)}
          />
        ) : null}
        {drawSquare ? (
          <svg
            className="grid"
            width={scene.width}
            height={scene.height}
            viewBox={`0 0 ${scene.width} ${scene.height}`}
            style={{ left: frame.padX, top: frame.padY }}
          >
            {vertical.map((x) => (
              <line key={`v${x}`} x1={x} y1={0} x2={x} y2={scene.height} stroke={gridStroke} strokeWidth={strokeWidth * (gridSettings.thickness ?? 1)} strokeDasharray={gridDash} />
            ))}
            {horizontal.map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={scene.width} y2={y} stroke={gridStroke} strokeWidth={strokeWidth * (gridSettings.thickness ?? 1)} strokeDasharray={gridDash} />
            ))}
          </svg>
        ) : null}
        {hexPath ? (
          <svg className="grid hex" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`} style={{ left: 0, top: 0 }} data-grid="hex">
            <defs>
              <clipPath id="hex-clip">
                <rect x={frame.padX} y={frame.padY} width={scene.width} height={scene.height} />
              </clipPath>
            </defs>
            <path d={hexPath} fill="none" stroke={gridStroke} strokeWidth={strokeWidth * (gridSettings.thickness ?? 1)} strokeDasharray={gridDash} clipPath="url(#hex-clip)" />
          </svg>
        ) : null}
        <SceneGraphics
          worldWidth={frame.worldWidth}
          worldHeight={frame.worldHeight}
          walls={gm ? wallsShown : []}
          lights={[]}
          tokens={[]}
          markers={gm ? scene.markers : []}
          regions={gm ? scene.regions : []}
          scale={camera.scale}
          showWalls={showWalls && gm}
          showLights={showLights}
          showCreatures={false}
          doorStates={doorStates}
          onToggleDoor={(wallId) => actions.setDoor(wallId)}
        />
        {map.sceneId === scene.id ? (
          <Lighting
            width={frame.worldWidth}
            height={frame.worldHeight}
            darkness={map.darkness}
            lights={map.lights}
            seeing={gm ? [] : map.seeing}
            gm={gm}
            twilight={!gm && Boolean(map.twilight)}
            image={scene.imageUrl && !imageFailed ? { url: scene.imageUrl, ...backdrop } : null}
          />
        ) : null}
        {(map.labels ?? []).length ? (
          // Text on the map (FG's text layers): outlined, with a shadow; size in squares.
          <svg className="overlay labels" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
            <defs>
              {(map.labels ?? [])
                .filter((label) => label.shadow.blur > 0 || label.shadow.offset > 0)
                .map((label) => (
                  <filter key={`f-${label.id}`} id={`shadow-${label.id}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx={label.shadow.offset * size * 0.05} dy={label.shadow.offset * size * 0.05} stdDeviation={label.shadow.blur * size * 0.03} floodColor={label.shadow.color} />
                  </filter>
                ))}
            </defs>
            {(map.labels ?? [])
              .filter((label) => (map.groups ?? []).find((group) => group.name === label.group)?.shown !== false)
              .map((label) => {
                const fontSize = label.size * size * 0.8;
                const anchor = label.anchor === "left" ? "start" : label.anchor === "right" ? "end" : "middle";
                const baseline = label.anchor === "top" ? "hanging" : label.anchor === "bottom" ? "auto" : "central";
                const icon = { pin: "📍", trap: "⚠", door: "🚪", chest: "🧰" }[label.icon as "pin"] ?? "";
                return (
                  <g key={label.id} transform={`rotate(${label.rotation} ${label.x} ${label.y})`} opacity={label.hidden ? 0.45 : 1} data-label={label.id} data-label-text={label.text} style={label.link ? { pointerEvents: "auto", cursor: "pointer" } : undefined} onPointerDown={label.link ? (event) => event.stopPropagation() : undefined} onClick={label.link ? () => openPin(label.link as { kind: string; id: string }) : undefined} filter={label.shadow.blur > 0 || label.shadow.offset > 0 ? `url(#shadow-${label.id})` : undefined}>
                    <text x={label.x} y={label.y} textAnchor={anchor} dominantBaseline={baseline} fontFamily={`"${label.font}", Cinzel, sans-serif`} fontSize={fontSize} fill={label.color} stroke={label.outline.width > 0 ? label.outline.color : "none"} strokeWidth={label.outline.width * fontSize * 0.04} paintOrder="stroke" strokeLinejoin="round">
                      {icon ? `${icon} ` : ""}
                      {label.text}
                    </text>
                    {gm && editorOpen && selectedLabel === label.id ? <circle cx={label.x} cy={label.y} r={fontSize * 0.7} fill="none" stroke="#ff9f1a" strokeWidth={3 / camera.scale} /> : null}
                  </g>
                );
              })}
          </svg>
        ) : null}
        {map.mask?.on ? (
          // FG's mask: black for players but where revealed; a tint for the GM.
          <svg className={gm ? "overlay mask-overlay gm" : "overlay mask-overlay"} width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`} data-mask={map.mask.shapes.length}>
            <defs>
              <mask id="kraken-map-mask">
                <rect x={0} y={0} width={frame.worldWidth} height={frame.worldHeight} fill="white" />
                {map.mask.shapes.map((shape) => (
                  <polygon key={shape.id} points={shape.points.join(" ")} fill={shape.mode === "reveal" ? "black" : "white"} />
                ))}
              </mask>
            </defs>
            <rect x={0} y={0} width={frame.worldWidth} height={frame.worldHeight} fill={gm ? "rgba(120, 20, 160, 0.35)" : "#000"} mask="url(#kraken-map-mask)" />
          </svg>
        ) : null}
        {gm && editorOpen ? (
          <svg className="overlay edit-overlay" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`} data-editing={editTool ?? ""}>
            {(map.walls ?? [])
              .filter((wall) => selectedWalls.includes(wall.id))
              .map((wall) => (
                <line key={`sel-${wall.id}`} x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} stroke="#ff9f1a" strokeWidth={6 / camera.scale} strokeLinecap="round" opacity={0.85} data-selected-wall={wall.id} />
              ))}
            {(map.walls ?? []).map((wall) => (
              <g key={`end-${wall.id}`}>
                <circle cx={wall.x1} cy={wall.y1} r={3 / camera.scale} fill={kindColor(wall.kind)} />
                <circle cx={wall.x2} cy={wall.y2} r={3 / camera.scale} fill={kindColor(wall.kind)} />
                {wall.hidden ? <line x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2} stroke="#ff4444" strokeWidth={2 / camera.scale} strokeDasharray={`${4 / camera.scale} ${4 / camera.scale}`} /> : null}
              </g>
            ))}
            {pending.length >= 2 ? (
              <>
                <polyline points={[...pending, ...(hover ? [hover.x, hover.y] : [])].join(" ")} fill="none" stroke={kindColor(wallKind)} strokeWidth={3 / camera.scale} strokeDasharray={`${8 / camera.scale} ${4 / camera.scale}`} />
                {editTool === "rect" && hover ? <rect x={Math.min(pending[0], hover.x)} y={Math.min(pending[1], hover.y)} width={Math.abs(hover.x - pending[0])} height={Math.abs(hover.y - pending[1])} fill="none" stroke={kindColor(wallKind)} strokeWidth={3 / camera.scale} /> : null}
              </>
            ) : null}
          </svg>
        ) : null}
        {gm && showLights
          ? map.sceneLights.map((light) => {
              const per = size / (scene.grid.distance > 0 ? scene.grid.distance : 5);
              return (
                <div
                  key={light.id}
                  className={light.on ? "light-handle" : "light-handle off"}
                  data-light={light.id}
                  title={`Light: bright ${light.bright} ${units}, dim ${light.dim} ${units}${light.hidden ? " (hidden from players)" : ""}${light.on ? "" : " (off)"}. Drag to move, right-click to change.`}
                  style={{ left: light.x, top: light.y, width: 22 / camera.scale, height: 22 / camera.scale, ["--reach" as string]: `${light.dim * per * 2}px` }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.stopPropagation();
                    if (editorOpen) {
                      setSelectedLight(light.id);
                      setEditTab("lights");
                    }
                    if (viewport.current) capture(viewport.current, event.pointerId);
                    lightDrag.current = { pointerId: event.pointerId, id: light.id };
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = viewport.current?.getBoundingClientRect();
                    if (rect) setLightMenu({ id: light.id, left: event.clientX - rect.left, top: event.clientY - rect.top });
                  }}
                />
              );
            })
          : null}
        {!gm && (mine.length > 0 || !map.sight) ? (
          <svg className="overlay doors" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
            {map.doors.map((door) => {
              const cx = (door.x1 + door.x2) / 2;
              const cy = (door.y1 + door.y2) / 2;
              const open = door.state === 1;
              const locked = door.state === 2;
              return (
                <g
                  key={door.id}
                  className="player-door"
                  data-door={door.id}
                  data-state={door.state}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!locked) actions.setDoor(door.id);
                  }}
                >
                  <title>{locked ? "Locked door" : open ? "Open door. Click to close." : "Closed door. Click to open."}</title>
                  <line className="door-hit" x1={door.x1} y1={door.y1} x2={door.x2} y2={door.y2} strokeWidth={Math.max(size * 0.35, 14 / camera.scale)} />
                  <g className="door-icon" transform={`translate(${cx} ${cy}) scale(${Math.max(size * 0.012, 0.8 / camera.scale)})`}>
                    <rect x={-11} y={-14} width={22} height={28} rx={3} fill="rgba(18,20,24,0.85)" />
                    <path d={open ? "M-6 -9 L4 -11 L4 11 L-6 9 Z" : "M-6 -9 L6 -9 L6 10 L-6 10 Z"} fill={locked ? "#e07a6a" : "#d2a15a"} />
                    <circle cx={open ? 1.5 : 3} cy={1} r={1.4} fill="#121418" />
                  </g>
                </g>
              );
            })}
          </svg>
        ) : null}
        {tokens.map((token) => {
          if (gm && !showCreatures && !token.owner) return null;
          const canDrag = gm || (token.mine && !map.locked);
          const span = token.squares * size;
          const isDragged = drag?.id === token.id && drag.moved;
          return (
            <div
              key={token.id}
              className={["token", canDrag ? "token-draggable" : "", token.mine ? "token-mine" : "", token.active ? "token-active" : "", targeted.includes(token.id) ? "token-targeted" : "", selected === token.id ? "token-selected" : "", token.hidden ? "token-hidden" : "", isDragged ? "token-lifted" : ""]
                .filter(Boolean)
                .join(" ")}
              data-token={token.id}
              data-name={token.name}
              data-record={token.recordId ?? ""}
              title={token.hidden ? `${token.name} (hidden from players)` : token.name}
              style={{ left: token.x - span / 2, top: token.y - span / 2, width: span, height: span }}
              onPointerDown={(event) => {
                if (event.button === 2) return;
                event.stopPropagation();
                setMenu(null);
                // Ctrl+click targets (FG): with your character, or for the GM the creature whose turn it is.
                if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
                  actions.ct("target", { tokenId: token.id });
                  return;
                }
                setSelected(token.id);
                if (event.button !== 0 || !canDrag) return;
                const point = worldAt(event.clientX, event.clientY);
                if (!point) return;
                if (viewport.current) capture(viewport.current, event.pointerId);
                setDrag({ pointerId: event.pointerId, id: token.id, start: { x: token.x, y: token.y }, at: point, moved: false, snap: !event.altKey, squares: token.squares });
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!gm && !token.mine) return;
                const rect = viewport.current?.getBoundingClientRect();
                if (rect) setMenu({ id: token.id, left: event.clientX - rect.left, top: event.clientY - rect.top });
                setSelected(token.id);
              }}
            >
              <div
                className="token-disc"
                style={{
                  width: `${TOKEN_FILL * 100}%`,
                  height: `${TOKEN_FILL * 100}%`,
                  borderColor: token.color,
                  borderWidth: Math.max(2, span * 0.05),
                  background: token.art ? "#222" : token.color,
                  fontSize: span * TOKEN_FILL * 0.38,
                }}
              >
                {token.art && token.video ? (
                  <video src={token.art} autoPlay loop muted playsInline />
                ) : token.art ? (
                  <img src={token.art} alt="" draggable={false} />
                ) : (
                  <span>{initials(token.name)}</span>
                )}
              </div>
              {targeted.includes(token.id) ? (
                <svg className="target-reticle" viewBox="0 0 100 100" aria-label="Targeted">
                  <circle cx="50" cy="50" r="44" />
                  <path d="M50 0v18M50 82v18M0 50h18M82 50h18" />
                </svg>
              ) : null}
              {token.health ? (
                <i
                  className="health-dot"
                  data-status={token.health.status}
                  title={token.health.status}
                  style={{ background: token.health.color, width: span * 0.18, height: span * 0.18 }}
                />
              ) : null}
              <span className="token-name" style={{ fontSize: Math.max(size * 0.2, 12 / camera.scale) }}>
                {token.name}
              </span>
            </div>
          );
        })}
        {drag && ghost && dragging ? (
          <>
            <div
              className="token-ghost"
              style={{ left: ghost.x - (drag.squares * size) / 2, top: ghost.y - (drag.squares * size) / 2, width: drag.squares * size, height: drag.squares * size }}
            />
            <svg className="overlay measure" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
              <line x1={drag.start.x} y1={drag.start.y} x2={ghost.x} y2={ghost.y} stroke="#ffd36b" strokeWidth={Math.max(3 / camera.scale, size * 0.05)} strokeLinecap="round" />
            </svg>
            <span className="measure-label" style={{ left: ghost.x, top: ghost.y - (drag.squares * size) / 2, fontSize: 15 / camera.scale }}>
              {distanceLabel(drag.start, ghost)}
            </span>
          </>
        ) : null}
        {measure ? (
          <>
            <svg className="overlay measure" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
              <line x1={measure.start.x} y1={measure.start.y} x2={measure.at.x} y2={measure.at.y} stroke="#7fd4ff" strokeWidth={3 / camera.scale} strokeDasharray={`${8 / camera.scale} ${5 / camera.scale}`} />
              <circle cx={measure.start.x} cy={measure.start.y} r={5 / camera.scale} fill="#7fd4ff" />
            </svg>
            <span className="measure-label" style={{ left: measure.at.x, top: measure.at.y, fontSize: 15 / camera.scale }}>
              {distanceLabel(snapCenter(scene, measure.start.x, measure.start.y, 1), snapCenter(scene, measure.at.x, measure.at.y, 1))}
            </span>
          </>
        ) : null}
        {(map.drawings?.length ?? 0) > 0 || stroke ? (
          <svg className="overlay drawings" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
            {(map.drawings ?? [])
              .filter((line) => !line.group || (map.groups ?? []).find((group) => group.name === line.group)?.shown !== false)
              .map((line) => {
                const common = { key: line.id, "data-drawing": line.id, stroke: line.color, strokeWidth: line.width, strokeOpacity: line.alpha ?? 1, fill: line.fill ?? "none", fillOpacity: line.fill ? (line.fillAlpha ?? 0.5) : 0, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
                const [x1, y1, x2, y2] = line.points;
                if (line.shape === "rect") return <rect {...common} x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} />;
                if (line.shape === "ellipse") return <ellipse {...common} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} />;
                if (line.shape === "poly") return <polygon {...common} points={line.points.join(" ")} />;
                return <polyline {...common} fill="none" points={line.points.join(" ")} />;
              })}
            {stroke ? <polyline points={stroke.points.join(" ")} fill="none" stroke={drawColor ?? "#ffcc33"} strokeWidth={Math.max(2, Math.round(4 / camera.scale))} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} /> : null}
          </svg>
        ) : null}
        {found
          ? (() => {
              const token = tokens.find((item) => item.id === found.id);
              return token ? <div key={found.at} className="found-ring" style={{ left: token.x, top: token.y, width: size * 3, height: size * 3 }} /> : null;
            })()
          : null}
        {pings.map((item) => (
          <div key={item.id} className="ping" style={{ left: item.x, top: item.y, width: size * 2, height: size * 2, borderColor: item.color }}>
            <span style={{ fontSize: 14 / camera.scale }}>{item.from}</span>
          </div>
        ))}
        {vision ? (
          <svg className="overlay sight" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
            <defs>
              <mask id="sight-explored">
                <rect width={frame.worldWidth} height={frame.worldHeight} fill="#fff" />
                {[...explored.current.polygons, ...vision].map((polygon, index) => (
                  <polygon key={index} points={polygonPoints(polygon)} fill="#000" />
                ))}
              </mask>
              <mask id="sight-now">
                <rect width={frame.worldWidth} height={frame.worldHeight} fill="#fff" />
                {vision.map((polygon, index) => (
                  <polygon key={index} points={polygonPoints(polygon)} fill="#000" />
                ))}
              </mask>
            </defs>
            <rect width={frame.worldWidth} height={frame.worldHeight} fill="#000" mask="url(#sight-explored)" />
            <rect width={frame.worldWidth} height={frame.worldHeight} fill="#000" fillOpacity={0.55} mask="url(#sight-now)" />
          </svg>
        ) : null}
      </div>

      {map.sceneId === scene.id
        ? (map.fx ?? [])
            .filter((layer) => layer.shown && (!layer.group || (map.groups ?? []).find((group) => group.name === layer.group)?.shown !== false))
            .map((layer) => {
              // The FX layer's mask, in screen pixels: only inside, or everywhere but inside.
              let clip: string | undefined;
              if (layer.mask.use && layer.mask.polygons.length) {
                const shapes = layer.mask.polygons.map((points) => {
                  const xy: string[] = [];
                  for (let i = 0; i < points.length; i += 2) xy.push(`${Math.round(points[i] * camera.scale + camera.x)} ${Math.round(points[i + 1] * camera.scale + camera.y)}`);
                  return `M${xy.join(" L")} Z`;
                });
                clip = layer.mask.mode === "outside" ? `path(evenodd, "M-99999 -99999 H99999 V99999 H-99999 Z ${shapes.join(" ")}")` : `path("${shapes.join(" ")}")`;
              }
              return (
                <Suspense key={layer.id} fallback={null}>
                  <Weather type={layer.type} intensity={layer.intensity} direction={layer.direction} amount={layer.amount} speed={layer.speed} camera={camera} clip={clip} />
                </Suspense>
              );
            })
        : null}
      {map.sceneId === scene.id && map.settings.weather.type !== "none" ? (
        <Suspense fallback={null}>
          <Weather type={map.settings.weather.type} intensity={map.settings.weather.intensity} direction={map.settings.weather.direction} camera={camera} />
        </Suspense>
      ) : null}

      {menu
        ? (() => {
            const token = tokens.find((item) => item.id === menu.id);
            if (!token) return null;
            return (
              <div className="token-menu" role="menu" style={{ left: menu.left, top: menu.top }} onPointerDown={(event) => event.stopPropagation()}>
                <strong>{token.name}</strong>
                <label className="token-menu-row">
                  Light
                  <select
                    value={token.light ? Object.entries(LIGHT_PRESETS).find(([, preset]) => preset.name === token.light?.name)?.[0] ?? "custom" : "none"}
                    onChange={(event) => actions.updateToken(token.id, { light: event.target.value })}
                  >
                    <option value="none">None</option>
                    {Object.entries(LIGHT_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>
                        {preset.name} ({preset.bright * 5}/{preset.dim * 5} ft)
                      </option>
                    ))}
                    {token.light && !Object.values(LIGHT_PRESETS).some((preset) => preset.name === token.light?.name) ? <option value="custom">{token.light.name}</option> : null}
                  </select>
                </label>
                {gm ? (
                  <label className="token-menu-row">
                    Sees in the dark
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={token.vision ?? token.seesFt}
                      onChange={(event) => actions.updateToken(token.id, { vision: event.target.value === "" ? null : Number(event.target.value) })}
                      style={{ width: "4.5rem" }}
                    />
                    ft
                  </label>
                ) : null}
                {gm ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      actions.ct("add", token.recordId ? { recordId: token.recordId } : { entry: { name: token.name, faction: token.faction === "none" ? "foe" : token.faction, hp: 1, ac: 10, tokenId: token.id } });
                      setMenu(null);
                    }}
                  >
                    Add to combat
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    actions.ct("target", { tokenId: token.id });
                    setMenu(null);
                  }}
                >
                  {targeted.includes(token.id) ? "Drop target" : "Target (Ctrl+click)"}
                </button>
                {gm ? (
                  <button type="button" role="menuitem" onClick={() => actions.updateToken(token.id, { hidden: !token.hidden })}>
                    {token.hidden ? "Show to players" : "Hide from players"}
                  </button>
                ) : null}
                {gm ? (
                  <div className="token-menu-row">
                    Size
                    {[1, 2, 3, 4].map((squares) => (
                      <button key={squares} type="button" aria-pressed={token.squares === squares} onClick={() => actions.updateToken(token.id, { squares })}>
                        {squares}
                      </button>
                    ))}
                  </div>
                ) : null}
                {gm ? (
                  <div className="token-menu-row">
                    {(["friend", "neutral", "foe"] as const).map((faction) => (
                      <button key={faction} type="button" aria-pressed={token.faction === faction} onClick={() => actions.updateToken(token.id, { faction })}>
                        {faction}
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    actions.removeToken(token.id);
                    setMenu(null);
                  }}
                >
                  Remove from map
                </button>
              </div>
            );
          })()
        : null}

      {lightMenu
        ? (() => {
            const light = map.sceneLights.find((item) => item.id === lightMenu.id);
            if (!light) return null;
            return (
              <div className="token-menu" role="menu" style={{ left: lightMenu.left, top: lightMenu.top }} onPointerDown={(event) => event.stopPropagation()}>
                <strong>Light</strong>
                <label className="token-menu-row">
                  Bright
                  <input type="number" min={0} step={5} value={light.bright} onChange={(event) => actions.updateLight(light.id, { bright: Number(event.target.value) })} style={{ width: "4.5rem" }} />
                  {units}
                </label>
                <label className="token-menu-row">
                  Dim
                  <input type="number" min={0} step={5} value={light.dim} onChange={(event) => actions.updateLight(light.id, { dim: Number(event.target.value) })} style={{ width: "4.5rem" }} />
                  {units}
                </label>
                <label className="token-menu-row">
                  Colour
                  <input type="color" value={light.color.slice(0, 7)} onChange={(event) => actions.updateLight(light.id, { color: event.target.value })} />
                </label>
                <button type="button" onClick={() => actions.updateLight(light.id, { on: !light.on })}>
                  {light.on ? "Turn off" : "Turn on"}
                </button>
                <button type="button" onClick={() => actions.updateLight(light.id, { hidden: !light.hidden })}>
                  {light.hidden ? "Let players see it" : "Hide from players"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    actions.removeLight(light.id);
                    setLightMenu(null);
                  }}
                >
                  Remove light
                </button>
                <button type="button" onClick={() => setLightMenu(null)}>
                  Done
                </button>
              </div>
            );
          })()
        : null}

      {settingsOpen && gm ? (
        <SceneSettings
          map={map}
          gridDefaults={{ alpha: scene.grid.alpha, color: scene.grid.color }}
          onSettings={actions.updateSettings}
          onSight={actions.setSight}
          onLocked={actions.setLocked}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {placeable.length > 0 || mine.length > 0 ? (
        <aside className={trayOpen ? "token-tray" : "token-tray closed"} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className="tray-toggle" onClick={() => setTrayOpen(!trayOpen)} aria-expanded={trayOpen}>
            {trayOpen ? "Tokens ▾" : "Tokens ▸"}
          </button>
          {trayOpen ? (
            <>
              <ul>
                {placeable.map((record) => {
                  const onMap = tokens.find((token) => token.recordId === record.id);
                  const canPlace = gm || record.owner !== "";
                  return (
                    <li
                      key={record.id}
                      data-tray={record.id}
                      draggable={canPlace && !onMap}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-kraken-record", record.id);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      title={onMap ? "On the map: click to find it" : "Drag onto the map, or click to place it in the middle of the view"}
                      onClick={() => {
                        if (onMap) lookAt(onMap);
                        else {
                          const center = viewCenter();
                          actions.placeToken(record.id, center?.x, center?.y);
                        }
                      }}
                    >
                      <span className="tray-chip">{initials(record.name)}</span>
                      <span className="tray-name">{record.name}</span>
                      <span className="tray-state">{onMap ? "on map" : "place"}</span>
                    </li>
                  );
                })}
              </ul>
              {gm ? (
                <button
                  type="button"
                  className="tray-add"
                  onClick={() => {
                    const name = window.prompt("Token name", "Monster");
                    const center = viewCenter();
                    if (name) actions.placeToken(null, center?.x, center?.y, name);
                  }}
                >
                  Add a token
                </button>
              ) : null}
            </>
          ) : null}
        </aside>
      ) : null}

      <div className="map-controls map-toolbar" role="toolbar" aria-label="Map tools">
        <div className="tool-group">
          <button type="button" className="tool" onClick={() => zoomAboutCenter(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
            <Icon name="zoom-out" />
          </button>
          <span className="zoom-readout">{Math.round(camera.scale * 100)}%</span>
          <button type="button" className="tool" onClick={() => zoomAboutCenter(1.25)} aria-label="Zoom in" title="Zoom in">
            <Icon name="zoom-in" />
          </button>
          <button type="button" className="tool" onClick={fit} aria-label="Fit" title="See the whole map">
            <Icon name="fit" />
          </button>
          <button type="button" className="tool find" data-action="find-token" onClick={findMine} aria-label={gm ? "Find the selected token" : "Find my token"} title={gm ? "Centre and zoom on the selected token" : "Where am I? Centre and zoom on my token"}>
            <Icon name="locate" />
          </button>
        </div>
        <div className="tool-group" role="radiogroup" aria-label="What a drag does">
          {(
            [
              ["pan", "hand", "Move the map (drag)"],
              ["ping", "ping", "Ping: click to show everyone a spot, in your colour"],
              ["draw", "pen", "Draw on the map, for everyone"],
              ["erase", "eraser", gm ? "Rub out a line (any)" : "Rub out one of your lines"],
            ] as const
          ).map(([id, icon, title]) => (
            <button key={id} type="button" className={tool === id ? "tool on" : "tool"} role="radio" aria-checked={tool === id} aria-label={title} title={title} data-tool={id} onClick={() => setTool(id)}>
              <Icon name={icon} />
            </button>
          ))}
          {tool === "draw" ? (
            <span className="draw-colors" aria-label="Line colour">
              <button type="button" className={drawColor === null ? "swatch mine on" : "swatch mine"} title="Your own colour" aria-label="Your own colour" onClick={() => setDrawColor(null)}>
                ●
              </button>
              {DRAW_COLORS.map((color) => (
                <button key={color} type="button" className={drawColor === color ? "swatch on" : "swatch"} style={{ background: color }} aria-label={`Colour ${color}`} data-color={color} onClick={() => setDrawColor(color)} />
              ))}
            </span>
          ) : null}
          {gm && (map.drawings?.length ?? 0) > 0 ? (
            <button type="button" className="tool" data-action="clear-drawings" aria-label="Clear every drawing" title="Clear every drawing" onClick={actions.clearDrawings}>
              <Icon name="trash" />
            </button>
          ) : null}
        </div>
        {gm ? (
          <div className="tool-group">
            <button type="button" className={editorOpen ? "tool on" : "tool"} data-action="map-editor" aria-pressed={editorOpen} aria-label="Edit map" title="Edit the map: walls, doors, windows, lights and the grid (FG's layer panel)" onClick={() => setEditorOpen(!editorOpen)}>
              <Icon name="pen" />
            </button>
            <button type="button" className={settingsOpen ? "tool on" : "tool"} data-action="scene-settings" aria-pressed={settingsOpen} aria-label="Scene" onClick={() => setSettingsOpen(!settingsOpen)} title="Scene: lighting, players, grid and weather">
              <Icon name="settings" />
            </button>
            <button
              type="button"
              className="tool"
              data-action="add-light"
              aria-label="Add light"
              title="Put a torch-bright light in the middle of the view; drag it, right-click to change it"
              onClick={() => {
                const center = viewCenter();
                if (center) actions.placeLight({ x: center.x, y: center.y, preset: "torch", color: "#FFB347" });
                setShowLights(true);
              }}
            >
              <Icon name="sun" />
            </button>
            <button type="button" className={map.sight ? "tool on" : "tool"} data-action="sight" aria-pressed={map.sight} aria-label={`Line of sight ${map.sight ? "on" : "off"}`} onClick={() => actions.setSight(!map.sight)} title={`Line of sight ${map.sight ? "on" : "off"}: players see only what their tokens see, and walls stop their tokens`}>
              <Icon name={map.sight ? "eye" : "eye-off"} />
            </button>
            <button type="button" className={map.locked ? "tool on" : "tool"} data-action="lock" aria-pressed={map.locked} aria-label={map.locked ? "Movement locked" : "Lock movement"} onClick={() => actions.setLocked(!map.locked)} title={map.locked ? "Movement locked: players cannot move their tokens" : "Lock movement"}>
              <Icon name={map.locked ? "lock" : "unlock"} />
            </button>
          </div>
        ) : map.locked ? (
          <span className="lock-note" title="The GM has locked token movement">
            <Icon name="lock" size={14} /> Movement locked
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="map-toast" role="status">
          {hint}
        </p>
      ) : null}
      {gm && editorOpen && actions.wall && actions.mapUndo ? (
        <MapEditor
          map={map}
          tab={editTab}
          setTab={setEditTab}
          tool={editTool}
          setTool={setEditTool}
          kind={wallKind}
          setKind={setWallKind}
          snap={gridSnap}
          setSnap={setGridSnap}
          pointSnap={pointSnap}
          setPointSnap={setPointSnap}
          selected={selectedWalls}
          setSelected={setSelectedWalls}
          selectedLight={selectedLight}
          lightPreset={lightPreset}
          setLightPreset={setLightPreset}
          gridScene={scene.baseGrid ?? sceneIn.grid}
          maskMode={maskMode}
          setMaskMode={setMaskMode}
          labelStyle={labelStyle}
          setLabelStyle={setLabelStyle}
          paintStyle={paintStyle}
          setPaintStyle={setPaintStyle}
          selectedFx={selectedFx}
          setSelectedFx={setSelectedFx}
          selectedLabel={selectedLabel}
          actions={{ fx: actions.fx ?? (() => undefined), clearDrawings: actions.clearDrawings, label: actions.label ?? (() => undefined), mapGroup: actions.mapGroup ?? (() => undefined), mask: actions.mask ?? (() => undefined), wall: actions.wall, mapUndo: actions.mapUndo, updateSettings: actions.updateSettings, updateLight: actions.updateLight, removeLight: actions.removeLight }}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
      {gm && !settingsOpen && !editorOpen ? (
        <SceneLegend
          walls={wallsShown}
          lights={scene.lights}
          tokens={scene.tokens}
          markers={scene.markers}
          regions={scene.regions}
          showWalls={showWalls}
          showLights={showLights}
          showCreatures={showCreatures}
          onShowWalls={setShowWalls}
          onShowLights={setShowLights}
          onShowCreatures={setShowCreatures}
        />
      ) : null}
      {notice ? (
        <p className="map-toast" role="status">
          {notice}
        </p>
      ) : null}
      <p className="map-hint">Drag to pan · wheel to zoom · right-drag to measure · double-click (or the ping tool) to ping · Ctrl+click a token to target it{gm || mine.length > 0 ? " · arrows move the selected token" : ""}</p>
      {imageFailed || !scene.imageUrl ? <p className="map-note">This scene has no background image.</p> : null}
    </div>
  );
}
