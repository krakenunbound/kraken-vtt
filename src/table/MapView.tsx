import { Icon } from "../ui/icons";
import { tilesInView, watchTiles, type MapTile as PictureTile, type TileSet } from "./mapTiles";
import { lazy, memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { backgroundRect, colorWithAlpha, gridStops, sceneFrame, type BackgroundFit, type SceneFrame } from "../foundry/geometry";
import { type SceneLight, type SceneMarker, type SceneRegion, type SceneWall } from "../foundry/sceneObjects";
import { gridDistance, gridKind, gridOrigin, hexCorners, hexOf, LIGHT_PRESETS, snapCenter, withGrid } from "../../shared/map/geometry.mjs";
import type { DecalItem, EditWall, MapDoor, MapTile, MapToken, Ping, PictureKind, SceneLightRecord, TableMap, TableRecord, WallKind } from "../session/useSession";
import { useBookWindows } from "../books/Books";
import { MapEditor, kindColor, placePicture, type EditTab, type EditTool, type LabelStyle, type PaintStyle } from "./MapEditor";
import { Lighting } from "./Lighting";
import { fxMaskImage, fxMaskStyle } from "./fxMask";
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
  // A bundle's tiles, the first time the scene is shown (the host keeps them as image layers).
  tiles?: import("../foundry/importBundle").SceneTile[];
};

type Camera = { x: number; y: number; scale: number };
// Where each scene was being looked at (this screen): the map put into a window of
// its own, or back, or drawn again, shows just what it showed, never framed anew.
const views = new Map<string, { camera: Camera; framed: string }>();
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
  // A record's picture (a character's token or portrait, a creature's from its module), from the host.
  recordArtUrl?: (recordId: string, kind?: "token" | "portrait") => string;
  placeToken: (recordId: string | null, x?: number, y?: number, name?: string) => void;
  // The combat tracker's entries (a damage roll dropped on a token finds its creature).
  combat?: { entries: { id: string; tokenId?: string | null; recordId?: string | null }[] };
  moveToken: (id: string, x: number, y: number, snap?: boolean) => void;
  moveTokens?: (moves: { id: string; x: number; y: number }[], snap?: boolean) => void;
  removeToken: (id: string) => void;
  setDoor: (id: string, state?: number) => void;
  setSight: (on: boolean) => void;
  setLocked: (on: boolean) => void;
  updateToken: (id: string, patch: Partial<Pick<MapToken, "name" | "hidden" | "squares" | "faction" | "owner" | "vision" | "facing">> & { light?: string | MapToken["light"] }) => void;
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
  tile?: (action: string, payload?: Record<string, unknown>) => void;
  decalList?: (kind?: PictureKind) => Promise<DecalItem[]>;
  decalUrl?: (id: string, kind?: PictureKind) => string;
  mapUndo?: () => void;
  libraryAction?: (action: string, payload?: Record<string, unknown>) => void;
};
// What a left-drag does on the map: pan it, ping, draw, or rub a line out.
type Tool = "pan" | "ping" | "draw" | "erase" | "area";
const DRAW_COLORS = ["#ffcc33", "#ff5a5a", "#5ad1ff", "#7dff7a", "#d38cff", "#ffffff", "#111111"];

// group: the other picked tokens dragged with it (their places when the drag began).
type Drag = { pointerId: number; id: string; start: Point; at: Point; moved: boolean; snap: boolean; squares: number; group?: { id: string; x: number; y: number; squares: number }[] };
type Measure = { pointerId: number; start: Point; at: Point };
type Menu = { id: string; left: number; top: number };

// FG's doors: a door is one shape (its sides arrive as wall lines named
// fg-<door>-<n>, or share a group), drawn and clicked as one. A shape that
// closes on itself is a polygon; a single door line stays a line.
type DoorShape = { id: string; group: string; points: number[]; closed: boolean; cx: number; cy: number; state: number; secret: boolean };
function doorShapes(doors: MapDoor[]): DoorShape[] {
  const groups = new Map<string, MapDoor[]>();
  for (const door of doors) {
    const key = door.group ?? door.id;
    groups.set(key, [...(groups.get(key) ?? []), door]);
  }
  return [...groups].map(([group, sides]) => {
    const order = (door: MapDoor) => Number(/-(\d+)$/.exec(door.id)?.[1] ?? 0);
    const list = [...sides].sort((a, b) => order(a) - order(b));
    const points = [list[0].x1, list[0].y1, ...list.flatMap((side) => [side.x2, side.y2])];
    const closed = list.length >= 3 && Math.hypot(points[0] - points[points.length - 2], points[1] - points[points.length - 1]) < 1;
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);
    return {
      id: list[0].id,
      group,
      points: closed ? points.slice(0, -2) : points,
      closed,
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
      state: list[0].state,
      secret: Boolean(list[0].secret),
    };
  });
}

// A token list row's picture: the record's token, else its initials.
function TrayFace({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={url && !failed ? "tray-chip has-art" : "tray-chip"}>
      {url && !failed ? <img src={url} alt="" draggable={false} onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

// Drawn again only when what it shows changes (its scene, the map, the records,
// pings, targets), not on every chat line or roll: the table's busiest parts
// (walls, lighting, animated tokens) live here.
export const MapView = memo(MapViewInner);

function MapViewInner({
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
  // Grid snap for walls is off unless the GM turns it on (kept on this screen): a
  // wall goes where it is drawn. Point snap (to the ends of walls) stays on.
  const [gridSnap, setGridSnapState] = useState(() => {
    try {
      return window.localStorage.getItem("kraken-wall-snap") === "on";
    } catch {
      return false;
    }
  });
  const setGridSnap = (on: boolean) => {
    setGridSnapState(on);
    try {
      window.localStorage.setItem("kraken-wall-snap", on ? "on" : "off");
    } catch {
      /* for this visit */
    }
  };
  // A box drawn by dragging (press, drag, let go), and walls or a corner being dragged.
  const boxDrag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [wallDrag, setWallDrag] = useState<{ pointerId: number; mode: "walls" | "corner"; ids: string[]; start: Point; at: Point; moved: boolean } | null>(null);
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
  // The FX tab's brush: how wide it paints an effect's area, in map pixels.
  const [fxBrush, setFxBrush] = useState(90);
  // Image layers: the one selected in the Images tab, and a move or resize under way.
  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const tileDrag = useRef<{ pointerId: number; id: string; mode: "move" | "resize"; start: Point; tile: MapTile } | null>(null);
  const [tileDraft, setTileDraft] = useState<MapTile | null>(null);
  const paintStroke = useRef<{ pointerId: number; points: number[]; fx?: string } | null>(null);
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
  // Several tokens picked at once (Shift+click, or Shift+drag a box): dragged together.
  const [picked, setPicked] = useState<string[]>([]);
  const [box, setBox] = useState<{ pointerId: number; start: Point; at: Point } | null>(null);
  // Shift+wheel over a token turns it (FG's token orientation): set each render, read by the wheel handler.
  const turnRef = useRef<(tokenId: string, direction: number, fine: boolean) => boolean>(() => false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [camera, setCamera] = useState<Camera>(() => views.get(sceneIn.id)?.camera ?? { x: 0, y: 0, scale: 0.1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [panning, setPanning] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  // FG's play mode, and Foundry's layers: the lines (walls, doors, windows)
  // show only while they are being edited (the map editor's Walls tab), the
  // light handles only on its Lights tab; the scene's counts sit in the
  // Walls tab, not over the map.
  const linesShown = gm && editorOpen && editTab === "walls";
  const [trayOpen, setTrayOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightMenu, setLightMenu] = useState<{ id: string; left: number; top: number } | null>(null);
  const lightDrag = useRef<{ pointerId: number; id: string } | null>(null);
  const explored = useRef<{ sceneId: string; polygons: number[][] }>({ sceneId: "", polygons: [] });
  const frame = sceneFrame(scene);
  // Each FX layer's mask picture, made again only when its painted areas change.
  const fxMasks = useMemo(() => {
    const out = new Map<string, string>();
    for (const layer of map.fx ?? []) {
      const image = fxMaskImage(layer.mask, frame.worldWidth, frame.worldHeight);
      if (image) out.set(layer.id, image);
    }
    return out;
  }, [map.fx, frame.worldWidth, frame.worldHeight]);
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
  // A big map as tiles (mapTiles.ts): decoded and cut in a worker, the
  // coarsest level first, only the tiles in view drawn at the detail the zoom
  // needs (decoding a 4600x6400 picture on the window's thread stood it still
  // ~300 ms at every scene change). A small picture is drawn as it is.
  const [tileSet, setTileSet] = useState<TileSet | null>(null);
  useEffect(() => {
    setTileSet(null);
    if (!scene.imageUrl) return;
    return watchTiles(scene.imageUrl, (set) => {
      setTileSet(set);
      if (set.width > 0) setNatural({ width: set.width, height: set.height });
    });
  }, [scene.imageUrl]);
  const framedFor = useRef(views.get(sceneIn.id)?.framed ?? "");
  // The view kept as it changes, for when the map moves to another window.
  useEffect(() => {
    if (framedFor.current.startsWith(`${scene.id}|`)) views.set(scene.id, { camera, framed: framedFor.current });
  }, [camera, scene.id]);
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
    // Watched from the window the map is in (its own, on another monitor, tells of its size only to its own observer).
    const Observer = (element.ownerDocument.defaultView as (Window & typeof globalThis) | null)?.ResizeObserver ?? ResizeObserver;
    const observer = new Observer(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scene.id, scene.width, scene.height, scene.padding, scene.grid.size, gm, mine[0]?.id]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.shiftKey) {
        const over = (event.target as HTMLElement | null)?.closest?.("[data-token]")?.getAttribute("data-token");
        const turn = Math.sign(event.deltaY || event.deltaX);
        if (over && turn && turnRef.current(over, turn, event.ctrlKey || event.altKey)) return;
      }
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
        setPicked([]);
        setMenu(null);
        return;
      }
      if (!token || !(gm || token.mine)) return;
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (step) {
        event.preventDefault();
        const group = picked.includes(token.id) ? tokens.filter((item) => picked.includes(item.id) && (gm || item.mine)) : [];
        if (group.length > 1 && actions.moveTokens) actions.moveTokens(group.map((item) => ({ id: item.id, x: item.x + step[0] * size, y: item.y + step[1] * size })), true);
        else actions.moveToken(token.id, token.x + step[0] * size, token.y + step[1] * size, true);
      } else if (gm && (event.key === "Delete" || event.key === "Backspace")) {
        actions.removeToken(token.id);
        setSelected(null);
      } else if (gm && event.key.toLowerCase() === "h") {
        actions.updateToken(token.id, { hidden: !token.hidden });
      }
    };
    // The window the map is in: the main one, or its own on another monitor.
    const view = viewport.current?.ownerDocument.defaultView ?? window;
    view.addEventListener("keydown", onKey);
    return () => view.removeEventListener("keydown", onKey);
  }, [tokens, selected, picked, gm, size, actions]);

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

  // Shift+wheel over a token: a turn of 45 degrees (Ctrl or Alt: 15), for the GM or the token's player.
  turnRef.current = (tokenId, direction, fine) => {
    const token = tokens.find((item) => item.id === tokenId);
    if (!token || !(gm || token.mine)) return false;
    const step = fine ? 15 : 45;
    const next = ((Math.round(((token.facing ?? 0) + direction * step) / step) * step) % 360 + 360) % 360;
    actions.updateToken(token.id, { facing: next });
    return true;
  };

  // Image layers (FG's image layers, Foundry's tiles), in their order. An
  // "above" layer is faded on this screen while one of this seat's tokens (the
  // GM's: the selected one) is under it, as Foundry's roofs. In the Images tab
  // the GM picks, drags (Shift: no snapping) and resizes them from a corner.
  function tileLayer(level: "below" | "above") {
    const list = (map.sceneId === scene.id ? map.tiles ?? [] : []).filter((tile) => tile.level === level && (!tile.group || (map.groups ?? []).find((group) => group.name === tile.group)?.shown !== false));
    if (!list.length) return null;
    const editing = gm && editorOpen && editTab === "images";
    const watchers = tokens.filter((token) => (gm ? token.id === selected : token.mine));
    return list.map((shown) => {
      const tile = tileDraft && tileDraft.id === shown.id ? tileDraft : shown;
      const under = level === "above" && watchers.some((token) => token.x >= tile.x && token.x <= tile.x + tile.width && token.y >= tile.y && token.y <= tile.y + tile.height);
      const opacity = tile.alpha * (tile.hidden ? 0.45 : 1) * (under ? 0.25 : 1);
      const picked = editing && selectedTile === tile.id;
      return (
        <div
          key={tile.id}
          className={["map-tile", picked ? "picked" : "", tile.hidden ? "hidden" : "", editing ? "editing" : ""].filter(Boolean).join(" ")}
          data-tile={tile.id}
          data-tile-level={tile.level}
          data-tile-faded={under ? "1" : "0"}
          style={{ left: tile.x, top: tile.y, width: tile.width, height: tile.height, opacity, transform: `rotate(${tile.rotation}deg)`, pointerEvents: editing ? "auto" : "none" }}
          onPointerDown={
            editing
              ? (event) => {
                  if (event.button !== 0) return;
                  event.stopPropagation();
                  setSelectedTile(tile.id);
                  const point = worldAt(event.clientX, event.clientY);
                  if (!point || tile.locked) return;
                  capture(event.currentTarget, event.pointerId);
                  tileDrag.current = { pointerId: event.pointerId, id: tile.id, mode: "move", start: point, tile: shown };
                }
              : undefined
          }
        >
          <img src={tile.url} alt={tile.name} draggable={false} style={{ transform: `scale(${tile.flipX ? -1 : 1}, ${tile.flipY ? -1 : 1})` }} />
          {picked && !tile.locked ? (
            <span
              className="map-tile-grip"
              title="Drag to resize (Shift keeps its shape)"
              style={{ width: 14 / camera.scale, height: 14 / camera.scale }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                const point = worldAt(event.clientX, event.clientY);
                if (!point) return;
                capture(event.currentTarget, event.pointerId);
                tileDrag.current = { pointerId: event.pointerId, id: tile.id, mode: "resize", start: point, tile: shown };
              }}
            />
          ) : null}
        </div>
      );
    });
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
  function snapPoint(point: Point, snapping: boolean, leaveOut: string[] = []): Point {
    const round = (value: number) => Math.round(value * 10) / 10;
    if (snapping && pointSnap) {
      const reach = 10 / camera.scale;
      let best: Point | null = null;
      let bestDistance = reach;
      for (const wall of map.walls ?? []) {
        if (leaveOut.includes(wall.id)) continue;
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
  // Where a drag puts the walls: a corner snaps (to other walls' ends, or the
  // grid when it is on); walls moved keep their shape, their first end snapped.
  function movedWalls(drag: { mode: "walls" | "corner"; ids: string[]; start: Point; at: Point }) {
    if (drag.mode === "corner") {
      const leaveOut = (map.walls ?? []).filter((wall) => (Math.abs(wall.x1 - drag.start.x) < 0.6 && Math.abs(wall.y1 - drag.start.y) < 0.6) || (Math.abs(wall.x2 - drag.start.x) < 0.6 && Math.abs(wall.y2 - drag.start.y) < 0.6)).map((wall) => wall.id);
      const to = snapPoint(drag.at, true, leaveOut);
      return { dx: to.x - drag.start.x, dy: to.y - drag.start.y, to };
    }
    const first = (map.walls ?? []).find((wall) => drag.ids.includes(wall.id));
    let dx = drag.at.x - drag.start.x;
    let dy = drag.at.y - drag.start.y;
    if (first) {
      const landed = snapPoint({ x: first.x1 + dx, y: first.y1 + dy }, true, drag.ids);
      dx = landed.x - first.x1;
      dy = landed.y - first.y1;
    }
    return { dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10, to: drag.at };
  }
  // A door drawn as a box or shape is one door (FG's): its sides share a group.
  function doorGroupFor(kind: string): { group?: string } {
    return kind === "door" || kind === "secret" ? { group: `door-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` } : {};
  }
  // A door's sides go together: picking one picks the whole door.
  function withDoorSides(ids: string[]): string[] {
    const walls = map.walls ?? [];
    const groupOf = (wall: EditWall) => wall.group ?? /^(fg-.+)-\d+$/.exec(wall.id)?.[1] ?? null;
    const groups = new Set(walls.filter((wall) => ids.includes(wall.id)).map(groupOf).filter(Boolean));
    return [...new Set([...ids, ...walls.filter((wall) => groups.has(groupOf(wall))).map((wall) => wall.id)])];
  }
  // A wall end near a point (to drag a corner).
  function cornerAt(point: Point): Point | null {
    const reach = 9 / camera.scale;
    let best: Point | null = null;
    let bestDistance = reach;
    for (const wall of map.walls ?? [])
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
    return best;
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
  // One more painted area for the chosen effect's mask (the areas add up; the mask turns on).
  function paintFxArea(area: { polygon: number[] } | { stroke: { width: number; points: number[] } }) {
    const layer = (map.fx ?? []).find((item) => item.id === selectedFx);
    if (!layer || !actions.fx) return;
    // A double-click leaves its corner twice: the same corner once.
    const corners: number[] = [];
    if ("polygon" in area) {
      for (let i = 0; i + 1 < area.polygon.length; i += 2) {
        const [x, y] = [area.polygon[i], area.polygon[i + 1]];
        if (corners.length < 2 || corners[corners.length - 2] !== x || corners[corners.length - 1] !== y) corners.push(x, y);
      }
    }
    const polygons = "polygon" in area ? [...layer.mask.polygons, corners] : layer.mask.polygons;
    const strokes = "stroke" in area ? [...(layer.mask.strokes ?? []), area.stroke] : layer.mask.strokes ?? [];
    actions.fx("update", { id: layer.id, patch: { mask: { use: true, polygons, strokes } } });
  }
  function finishShape() {
    if (editTab === "fx" && editTool === "poly" && pending.length >= 6 && selectedFx) {
      paintFxArea({ polygon: pending });
      setPending([]);
      setHover(null);
      return;
    }
    if (editTab === "paint" && editTool === "poly" && pending.length >= 6 && actions.paint) {
      actions.paint({ shape: "poly", points: pending, color: paintStyle.color, width: paintStyle.width, alpha: paintStyle.alpha, ...(paintStyle.fill ? { fill: paintStyle.fill, fillAlpha: paintStyle.fillAlpha } : {}), ...(paintStyle.group ? { group: paintStyle.group } : {}) });
      setPending([]);
      setHover(null);
      return;
    }
    if (editTab === "mask" && editTool === "poly" && pending.length >= 6 && actions.mask) actions.mask(maskMode, { points: pending });
    else if (editTool === "poly" && pending.length >= 6 && actions.wall) actions.wall("add", { wall: { points: pending, closed: true, kind: wallKind, ...doorGroupFor(wallKind) } });
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
    const view = viewport.current?.ownerDocument.defaultView ?? window;
    view.addEventListener("keydown", onKey);
    return () => view.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gm, editorOpen, selectedWalls, pending, editTool, wallKind, editTab, selectedLabel]);
  useEffect(() => {
    setPending([]);
    setHover(null);
  }, [editTool, editorOpen]);

  const placeable = records.filter((record) => record.type === "character" && (gm || record.owner !== ""));
  const dragging = drag ? tokens.find((token) => token.id === drag.id) : null;
  const ghost = drag && drag.moved ? (drag.snap ? snapCenter(scene, drag.at.x, drag.at.y, drag.squares) : drag.at) : null;

  // What a press on the map does now, shown by the pointer: the hand pans; a
  // crosshair draws, pings, aims an area or draws walls; the arrow picks.
  const editing = gm && editorOpen && editTool;
  const pointerMode = editing ? (editTool === "select" ? "select" : "place") : tool === "pan" ? "pan" : tool === "erase" ? "erase" : "place";
  return (
    <div
      className={panning ? "viewport dragging" : "viewport"}
      ref={viewport}
      tabIndex={-1}
      data-pointer={pointerMode}
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
        if (event.shiftKey && tool === "pan" && !(gm && editorOpen && editTool)) {
          // Shift+drag on the map: a box that picks the tokens in it (yours; the GM's: any).
          const point = worldAt(event.clientX, event.clientY);
          if (!point) return;
          capture(event.currentTarget, event.pointerId);
          setBox({ pointerId: event.pointerId, start: point, at: point });
          return;
        }
        setPicked([]);
        if (gm && editorOpen && editTool && editTab === "fx" && actions.fx && selectedFx) {
          // The FX layer's mask: the GM paints its areas, as many as wanted:
          // a rectangle (two clicks), a shape (its corners, double-click to
          // close) or the brush (drag along a river, round a pond).
          const raw = worldAt(event.clientX, event.clientY);
          if (!raw) return;
          const point = { x: Math.round(raw.x), y: Math.round(raw.y) };
          if (editTool === "free") {
            capture(event.currentTarget, event.pointerId);
            paintStroke.current = { pointerId: event.pointerId, points: [point.x, point.y], fx: selectedFx };
            setStroke({ pointerId: -1, points: [point.x, point.y] });
          } else if (editTool === "rect") {
            if (pending.length >= 2) {
              const [x1, y1] = pending;
              paintFxArea({ polygon: [x1, y1, point.x, y1, point.x, point.y, x1, point.y] });
              setPending([]);
            } else setPending([point.x, point.y]);
          } else if (editTool === "poly") setPending((current) => [...current, point.x, point.y]);
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
            // A corner (a wall end) dragged moves every wall end there; a wall dragged moves the picked walls.
            const corner = event.shiftKey ? null : cornerAt(raw);
            if (corner) {
              capture(event.currentTarget, event.pointerId);
              setWallDrag({ pointerId: event.pointerId, mode: "corner", ids: [], start: corner, at: corner, moved: false });
              return;
            }
            const id = wallAt(raw);
            const next = id ? (event.shiftKey ? (selectedWalls.includes(id) ? selectedWalls.filter((item) => item !== id) : [...selectedWalls, id]) : selectedWalls.includes(id) ? selectedWalls : withDoorSides([id])) : event.shiftKey ? selectedWalls : [];
            setSelectedWalls(next);
            if (id && !event.shiftKey && next.includes(id)) {
              capture(event.currentTarget, event.pointerId);
              setWallDrag({ pointerId: event.pointerId, mode: "walls", ids: next, start: raw, at: raw, moved: false });
            }
          } else if (editTool === "light") {
            actions.placeLight({ x: Math.round(raw.x), y: Math.round(raw.y), preset: lightPreset });
          } else if (editTool === "line") {
            // Point to point: each click adds a wall from the last point (FG's line, Foundry's chain).
            if (pending.length >= 2) actions.wall("add", { wall: { points: [pending[0], pending[1], point.x, point.y], kind: wallKind } });
            setPending([point.x, point.y]);
          } else if (editTool === "rect") {
            // Drag the box (press, drag, let go) or click its two corners.
            if (pending.length >= 2) {
              const [x1, y1] = pending;
              actions.wall("add", { wall: { points: [x1, y1, point.x, y1, point.x, point.y, x1, point.y], closed: true, kind: wallKind, ...doorGroupFor(wallKind) } });
              setPending([]);
            } else {
              setPending([point.x, point.y]);
              capture(event.currentTarget, event.pointerId);
              boxDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            }
          } else if (editTool === "poly") {
            setPending((current) => [...current, point.x, point.y]);
          }
          return;
        }
        if (tool !== "pan") {
          const point = worldAt(event.clientX, event.clientY);
          if (!point) return;
          if (tool === "ping") actions.ping(point.x, point.y);
          else if (tool === "area") {
            // An area spell: everyone within the radius becomes the target of your creature (the GM's: the active one).
            const answer = window.prompt("Target everyone within how many feet of this point? (Sleep 15, a fireball 20)", "15");
            const radius = Number(answer);
            if (answer !== null && radius > 0) actions.ct("target-area", { x: Math.round(point.x), y: Math.round(point.y), radius });
          }
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
        if (box && box.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          if (point) setBox({ ...box, at: point });
          return;
        }
        if (tileDrag.current && tileDrag.current.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          if (!point) return;
          const { start, tile, mode } = tileDrag.current;
          const dx = point.x - start.x;
          const dy = point.y - start.y;
          if (mode === "move") {
            // Snaps its corner to the grid unless Shift is held.
            let x = tile.x + dx;
            let y = tile.y + dy;
            if (!event.shiftKey && gridSnap && size > 0) {
              const corner = gridOrigin(scene);
              x = corner.x + Math.round((x - corner.x) / (size / 2)) * (size / 2);
              y = corner.y + Math.round((y - corner.y) / (size / 2)) * (size / 2);
            }
            setTileDraft({ ...tile, x: Math.round(x), y: Math.round(y) });
          } else {
            // The corner handle: Shift keeps the picture's shape.
            let width = Math.max(8, tile.width + dx);
            let height = Math.max(8, tile.height + dy);
            if (event.shiftKey) height = (width * tile.height) / tile.width;
            if (!event.shiftKey && gridSnap && size > 0) {
              width = Math.max(size / 2, Math.round(width / (size / 2)) * (size / 2));
              height = Math.max(size / 2, Math.round(height / (size / 2)) * (size / 2));
            }
            setTileDraft({ ...tile, width: Math.round(width), height: Math.round(height) });
          }
          return;
        }
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
        if (wallDrag && wallDrag.pointerId === event.pointerId) {
          const point = worldAt(event.clientX, event.clientY);
          if (point) setWallDrag({ ...wallDrag, at: point, moved: wallDrag.moved || Math.hypot(point.x - wallDrag.start.x, point.y - wallDrag.start.y) > 4 / camera.scale });
          return;
        }
        if (gm && editorOpen && (pending.length >= 2 || (editTab === "walls" && (editTool === "line" || editTool === "rect" || editTool === "poly")))) {
          // Where the next point goes (snapped), shown before it is placed.
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
        if (boxDrag.current && boxDrag.current.pointerId === event.pointerId) {
          const start = boxDrag.current;
          boxDrag.current = null;
          // Dragged far enough, the box is drawn where the drag ended; a click leaves its first corner for a second click.
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 && pending.length >= 2 && actions.wall) {
            const raw = worldAt(event.clientX, event.clientY);
            if (raw) {
              const point = snapPoint(raw, !event.shiftKey);
              const [x1, y1] = pending;
              if (Math.abs(point.x - x1) > 1 && Math.abs(point.y - y1) > 1) actions.wall("add", { wall: { points: [x1, y1, point.x, y1, point.x, point.y, x1, point.y], closed: true, kind: wallKind, ...doorGroupFor(wallKind) } });
              setPending([]);
              setHover(null);
            }
          }
          return;
        }
        if (wallDrag && wallDrag.pointerId === event.pointerId) {
          const drag = wallDrag;
          setWallDrag(null);
          if (!drag.moved || !actions.wall) return;
          const moved = movedWalls(drag);
          if (drag.mode === "corner") actions.wall("move-point", { from: drag.start, to: moved.to });
          else actions.wall("move", { ids: drag.ids, dx: moved.dx, dy: moved.dy });
          return;
        }
        if (box && box.pointerId === event.pointerId) {
          const left = Math.min(box.start.x, box.at.x);
          const right = Math.max(box.start.x, box.at.x);
          const top = Math.min(box.start.y, box.at.y);
          const bottom = Math.max(box.start.y, box.at.y);
          const inside = tokens.filter((token) => (gm || token.mine) && token.x >= left && token.x <= right && token.y >= top && token.y <= bottom).map((token) => token.id);
          setPicked((current) => [...new Set([...current, ...inside])]);
          if (inside.length) setSelected(inside[0]);
          setBox(null);
          return;
        }
        if (tileDrag.current && tileDrag.current.pointerId === event.pointerId) {
          const { id, tile } = tileDrag.current;
          tileDrag.current = null;
          if (tileDraft && tileDraft.id === id && (tileDraft.x !== tile.x || tileDraft.y !== tile.y || tileDraft.width !== tile.width || tileDraft.height !== tile.height)) {
            actions.tile?.("update", { id, patch: { x: tileDraft.x, y: tileDraft.y, width: tileDraft.width, height: tileDraft.height } });
          }
          setTileDraft(null);
          return;
        }
        if (paintStroke.current && paintStroke.current.pointerId === event.pointerId && paintStroke.current.fx) {
          paintFxArea({ stroke: { width: fxBrush, points: paintStroke.current.points } });
          paintStroke.current = null;
          setStroke(null);
          return;
        }
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
          if (drag.moved && drag.group?.length && actions.moveTokens) {
            // The others move as far as the one held; each snaps and is stopped by walls on its own.
            const lead = ghost ?? drag.at;
            const dx = lead.x - drag.start.x;
            const dy = lead.y - drag.start.y;
            actions.moveTokens([{ id: drag.id, x: drag.at.x, y: drag.at.y }, ...drag.group.map((item) => ({ id: item.id, x: item.x + dx, y: item.y + dy }))], !event.altKey);
          } else if (drag.moved) actions.moveToken(drag.id, drag.at.x, drag.at.y, !event.altKey);
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
        if (gm && editorOpen && editTab === "images" && [...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (["application/x-kraken-record", "application/x-kraken-ct", "application/x-kraken-damage"].some((type) => [...event.dataTransfer.types].includes(type))) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        if (gm && editorOpen && editTab === "images" && event.dataTransfer.files.length && window.kraken) {
          // A picture file dropped on the map: into the tile library, then onto the map where it fell (not a new map).
          event.preventDefault();
          event.stopPropagation();
          const point = worldAt(event.clientX, event.clientY);
          for (const file of [...event.dataTransfer.files].slice(0, 10)) {
            void file
              .arrayBuffer()
              .then((bytes) => window.kraken!.addDecal(file.name, new Uint8Array(bytes), "tile"))
              .then((made) => placePicture(made.id, actions.decalUrl ? actions.decalUrl(made.id, "tile") : "", point, (tile) => actions.tile?.("add", { tile }), made.name))
              .catch((error) => setHint(error instanceof Error ? error.message : String(error)));
          }
          return;
        }
        // A damage or healing roll from chat dropped on a creature's token (the GM's, as in FG).
        const damage = event.dataTransfer.getData("application/x-kraken-damage");
        if (damage && gm) {
          event.preventDefault();
          event.stopPropagation();
          const at = worldAt(event.clientX, event.clientY);
          const hit = at ? tokens.find((token) => Math.abs(at.x - token.x) <= (token.squares * size) / 2 && Math.abs(at.y - token.y) <= (token.squares * size) / 2) : null;
          const entry = hit ? actions.combat?.entries.find((item) => item.tokenId === hit.id || (hit.recordId && item.recordId === hit.recordId)) : null;
          try {
            const roll = JSON.parse(damage) as { amount: number; heal?: boolean };
            if (entry && roll.amount > 0) actions.ct(roll.heal ? "heal" : "damage", { id: entry.id, amount: roll.amount });
            else setHint(hit ? `${hit.name} is not on the combat tracker.` : "Drop it on a creature's token.");
          } catch {
            /* not a roll */
          }
          return;
        }
        // A creature from the combat tracker (the GM's): its token where it fell.
        const entryId = event.dataTransfer.getData("application/x-kraken-ct");
        if (entryId && gm) {
          event.preventDefault();
          event.stopPropagation();
          const at = worldAt(event.clientX, event.clientY);
          if (at) actions.ct("place-token", { id: entryId, x: at.x, y: at.y });
          return;
        }
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
        {scene.imageUrl && !imageFailed && tileSet && tileSet.levels.length > 0 && natural ? (
          (() => {
            // The tiles in view, at the zoom's detail, over the whole map at its coarsest (no gaps while they decode).
            const bx = backdrop.width / tileSet.width;
            const by = backdrop.height / tileSet.height;
            const rect = viewport.current?.getBoundingClientRect();
            const toPicture = (sx: number, sy: number) => ({ x: ((sx - camera.x) / camera.scale - backdrop.left) / bx, y: ((sy - camera.y) / camera.scale - backdrop.top) / by });
            const a = toPicture(0, 0);
            const b = toPicture(rect?.width ?? 4000, rect?.height ?? 4000);
            const coarsest = tileSet.levels[0].tiles;
            const shown = tilesInView(tileSet, camera.scale * bx, { left: a.x, top: a.y, right: b.x, bottom: b.y });
            const place = (tile: PictureTile) => ({ left: backdrop.left + tile.x * bx, top: backdrop.top + tile.y * by, width: tile.width * bx, height: tile.height * by });
            return (
              <div className="map-picture" data-width={tileSet.width} data-height={tileSet.height} data-ready={tileSet.done ? "true" : "false"} data-tiles={shown.length} aria-label={scene.name}>
                {coarsest.map((tile) => (
                  <img key={`c${tile.x},${tile.y}`} className="map-tile-under" src={tile.url} alt="" draggable={false} decoding="async" style={place(tile)} />
                ))}
                {shown.filter((tile) => tile.level > 0).map((tile) => (
                  <img key={`${tile.level}:${tile.x},${tile.y}`} src={tile.url} alt="" draggable={false} decoding="async" style={place(tile)} />
                ))}
              </div>
            );
          })()
        ) : null}
        {scene.imageUrl && !imageFailed && tileSet?.done && tileSet.levels.length === 0 ? (
          <img
            src={scene.imageUrl}
            decoding="async"
            alt={scene.name}
            draggable={false}
            style={{ left: backdrop.left, top: backdrop.top, width: backdrop.width, height: backdrop.height }}
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setImageFailed(true)}
          />
        ) : null}
        {tileLayer("below")}
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
          showWalls={linesShown}
          showLights={false}
          showCreatures={false}
          doorStates={doorStates}
          onToggleDoor={(wallId) => actions.setDoor(wallId)}
          doorsInert={Boolean(gm && editorOpen && editTab === "walls" && editTool)}
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
            {editTab === "fx"
              ? (() => {
                  // The chosen effect's painted areas, outlined while the FX tab is open; the brush as it paints.
                  const layer = (map.fx ?? []).find((item) => item.id === selectedFx);
                  const line = { fill: "rgba(90, 200, 255, 0.12)", stroke: "#5ac8ff", strokeWidth: 2 / camera.scale, strokeDasharray: `${8 / camera.scale} ${5 / camera.scale}` };
                  return (
                    <g className="fx-areas" data-fx-areas={layer ? layer.mask.polygons.length + (layer.mask.strokes?.length ?? 0) : 0}>
                      {(layer?.mask.polygons ?? []).map((points, index) => (
                        <polygon key={`p${index}`} points={points.join(" ")} {...line} />
                      ))}
                      {(layer?.mask.strokes ?? []).map((item, index) => (
                        <polyline key={`s${index}`} points={item.points.join(" ")} fill="none" stroke="rgba(90, 200, 255, 0.28)" strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" />
                      ))}
                      {stroke ? <polyline points={stroke.points.join(" ")} fill="none" stroke="rgba(90, 200, 255, 0.45)" strokeWidth={fxBrush} strokeLinecap="round" strokeLinejoin="round" /> : null}
                    </g>
                  );
                })()
              : null}
            {wallDrag && wallDrag.moved
              ? (() => {
                  // The walls as they will land.
                  const { dx, dy, to } = movedWalls(wallDrag);
                  const near = (a: number, b: number) => Math.abs(a - b) < 0.6;
                  return (map.walls ?? [])
                    .filter((wall) => (wallDrag.mode === "walls" ? wallDrag.ids.includes(wall.id) : (near(wall.x1, wallDrag.start.x) && near(wall.y1, wallDrag.start.y)) || (near(wall.x2, wallDrag.start.x) && near(wall.y2, wallDrag.start.y))))
                    .map((wall) => {
                      const end = (x: number, y: number) => (wallDrag.mode === "walls" ? { x: x + dx, y: y + dy } : near(x, wallDrag.start.x) && near(y, wallDrag.start.y) ? to : { x, y });
                      const a = end(wall.x1, wall.y1);
                      const b = end(wall.x2, wall.y2);
                      return <line key={`drag-${wall.id}`} className="wall-dragging" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={kindColor(wall.kind)} strokeWidth={4 / camera.scale} strokeDasharray={`${6 / camera.scale} ${4 / camera.scale}`} strokeLinecap="round" />;
                    });
                })()
              : null}
            {editTab === "walls" && hover && (editTool === "line" || editTool === "rect" || editTool === "poly") ? (
              // Where the next point goes, before it is placed.
              <g className="wall-aim" data-aim={`${hover.x},${hover.y}`}>
                <circle cx={hover.x} cy={hover.y} r={6 / camera.scale} fill="none" stroke="#ffffff" strokeWidth={2 / camera.scale} />
                <circle cx={hover.x} cy={hover.y} r={2 / camera.scale} fill={kindColor(wallKind)} />
              </g>
            ) : null}
            {pending.length >= 2 ? (
              <>
                <polyline points={[...pending, ...(hover ? [hover.x, hover.y] : [])].join(" ")} fill="none" stroke={kindColor(wallKind)} strokeWidth={3 / camera.scale} strokeDasharray={`${8 / camera.scale} ${4 / camera.scale}`} />
                {editTool === "rect" && hover ? <rect x={Math.min(pending[0], hover.x)} y={Math.min(pending[1], hover.y)} width={Math.abs(hover.x - pending[0])} height={Math.abs(hover.y - pending[1])} fill="none" stroke={kindColor(wallKind)} strokeWidth={3 / camera.scale} /> : null}
              </>
            ) : null}
          </svg>
        ) : null}
        {/* Light handles (FG's): only while the lights are being edited (the editor's Lights tab). */}
        {gm && editorOpen && editTab === "lights"
          ? map.sceneLights.map((light) => {
              const per = size / (scene.grid.distance > 0 ? scene.grid.distance : 5);
              return (
                <div
                  key={light.id}
                  className={light.on ? "light-handle" : "light-handle off"}
                  data-light={light.id}
                  title={`Light: bright ${light.bright} ${units}, dim ${light.dim} ${units}${light.hidden ? " (hidden from players)" : ""}${light.on ? "" : " (off)"}. Drag to move, right-click to change.`}
                  style={{ left: light.x, top: light.y, width: 12 / camera.scale, height: 12 / camera.scale, ["--reach" as string]: `${light.dim * per * 2}px` }}
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
        {/* Doors in play (FG): no lines; a door is one shape. Hovered, the whole
            shape lights up and its door shows, closed or open; a click opens or
            closes all of it. Players see the doors they can see; the GM every
            one, when the walls are not being edited (Line of Sight). */}
        {(gm ? !linesShown : mine.length > 0 || !map.sight) ? (
          <svg className="overlay doors" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
            {doorShapes(map.doors).map((door) => {
              const open = door.state === 1;
              const locked = door.state === 2;
              const icon = Math.max(size * 0.012, 0.8 / camera.scale);
              return (
                <g
                  key={door.id}
                  className={["player-door", door.secret ? "secret" : "", locked ? "locked" : ""].filter(Boolean).join(" ")}
                  data-door={door.id}
                  data-door-group={door.group}
                  data-state={door.state}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!locked || gm) actions.setDoor(door.id);
                  }}
                >
                  <title>{locked ? (gm ? "Locked door. Click to open (right-click the wall to unlock in the editor)." : "Locked door") : open ? "Open door. Click to close." : "Closed door. Click to open."}</title>
                  {door.closed ? (
                    <polygon className="door-shape" points={door.points.join(" ")} />
                  ) : (
                    <polyline className="door-shape line" points={door.points.join(" ")} strokeWidth={Math.max(size * 0.35, 14 / camera.scale)} />
                  )}
                  <g className="door-icon" transform={`translate(${door.cx} ${door.cy}) scale(${icon})`}>
                    <rect x={-9} y={-15} width={18} height={30} rx={1.5} fill={locked ? "#e07a6a" : "#f2f2f0"} stroke="#1b1d22" strokeWidth={1.6} />
                    {open ? <path d="M-9 -15 L3 -11 L3 13 L-9 15 Z" fill="#cfd2d8" stroke="#1b1d22" strokeWidth={1.4} /> : null}
                    <circle cx={open ? 0 : 5} cy={1} r={1.4} fill="#1b1d22" />
                  </g>
                </g>
              );
            })}
          </svg>
        ) : null}
        {tokens.map((token) => {
          const canDrag = gm || (token.mine && !map.locked);
          const span = token.squares * size;
          const isDragged = drag?.id === token.id && drag.moved;
          return (
            <div
              key={token.id}
              className={["token", canDrag ? "token-draggable" : "", token.mine ? "token-mine" : "", token.active ? "token-active" : "", targeted.includes(token.id) ? "token-targeted" : "", selected === token.id ? "token-selected" : "", picked.includes(token.id) ? "token-picked" : "", token.hidden ? "token-hidden" : "", isDragged ? "token-lifted" : ""]
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
                if (event.button === 0 && event.shiftKey) {
                  // Shift+click picks it too, or lets it go.
                  if (canDrag) setPicked((current) => (current.includes(token.id) ? current.filter((id) => id !== token.id) : [...current, token.id]));
                  return;
                }
                const group = picked.includes(token.id) ? tokens.filter((item) => item.id !== token.id && picked.includes(item.id) && (gm || (item.mine && !map.locked))) : [];
                if (!picked.includes(token.id)) setPicked([]);
                if (event.button !== 0 || !canDrag) return;
                const point = worldAt(event.clientX, event.clientY);
                if (!point) return;
                if (viewport.current) capture(viewport.current, event.pointerId);
                setDrag({ pointerId: event.pointerId, id: token.id, start: { x: token.x, y: token.y }, at: point, moved: false, snap: !event.altKey, squares: token.squares, group: group.map((item) => ({ id: item.id, x: item.x, y: item.y, squares: item.squares })) });
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
                  <video src={token.art} autoPlay loop muted playsInline style={token.facing != null ? { transform: `rotate(${token.facing}deg)` } : undefined} />
                ) : token.art ? (
                  <img src={token.art} alt="" draggable={false} style={token.facing != null ? { transform: `rotate(${token.facing}deg)` } : undefined} />
                ) : (
                  <span>{initials(token.name)}</span>
                )}
              </div>
              {token.facing != null ? (
                <i className="token-facing" data-facing={token.facing} style={{ transform: `rotate(${token.facing}deg)` }} aria-hidden>
                  <b style={{ borderBottomColor: token.color, borderWidth: `0 ${span * 0.09}px ${span * 0.13}px` }} />
                </i>
              ) : null}
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
        {tileLayer("above")}
        {drag && ghost && dragging && drag.group?.length
          ? drag.group.map((item) => (
              <div key={`ghost-${item.id}`} className="token-ghost" data-group-ghost={item.id} style={{ left: item.x + ghost.x - drag.start.x - (item.squares * size) / 2, top: item.y + ghost.y - drag.start.y - (item.squares * size) / 2, width: item.squares * size, height: item.squares * size }} />
            ))
          : null}
        {box ? (
          <div className="pick-box" style={{ left: Math.min(box.start.x, box.at.x), top: Math.min(box.start.y, box.at.y), width: Math.abs(box.at.x - box.start.x), height: Math.abs(box.at.y - box.start.y), borderWidth: 2 / camera.scale }} />
        ) : null}
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
            {stroke && !(editorOpen && editTab === "fx") ? <polyline points={stroke.points.join(" ")} fill="none" stroke={drawColor ?? "#ffcc33"} strokeWidth={Math.max(2, Math.round(4 / camera.scale))} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} /> : null}
          </svg>
        ) : null}
        {found
          ? (() => {
              const token = tokens.find((item) => item.id === found.id);
              return token ? <div key={found.at} className="found-ring" style={{ left: token.x, top: token.y, width: size * 3, height: size * 3 }} /> : null;
            })()
          : null}
        {/* A ping: a bright dot in the person's colour, three rings going out from it and a
            beam of light, never smaller on screen than about 180 px however far out the map is. */}
        {pings.map((item) => {
          const reach = Math.max(size * 3, 180 / camera.scale);
          return (
            <div key={item.id} className="ping" data-ping-from={item.from} style={{ left: item.x, top: item.y, width: reach, height: reach, ["--ping" as string]: item.color, ["--ping-line" as string]: `${Math.max(3, 5 / camera.scale)}px` }}>
              <i className="ping-beam" />
              <i className="ping-ring" />
              <i className="ping-ring" />
              <i className="ping-ring" />
              <i className="ping-dot" />
              <span style={{ fontSize: 15 / camera.scale }}>{item.from}</span>
            </div>
          );
        })}
        {vision ? (
          <svg className="overlay sight" width={frame.worldWidth} height={frame.worldHeight} viewBox={`0 0 ${frame.worldWidth} ${frame.worldHeight}`}>
            <defs>
              {/* The edge of what a token sees fades over about half a square, as a light's does, never a hard line. */}
              <filter id="sight-soft" filterUnits="userSpaceOnUse" x={0} y={0} width={frame.worldWidth} height={frame.worldHeight}>
                <feGaussianBlur stdDeviation={Math.max(4, size * 0.22)} />
              </filter>
              <mask id="sight-explored">
                <rect width={frame.worldWidth} height={frame.worldHeight} fill="#fff" />
                <g filter="url(#sight-soft)">
                  {[...explored.current.polygons, ...vision].map((polygon, index) => (
                    <polygon key={index} points={polygonPoints(polygon)} fill="#000" />
                  ))}
                </g>
              </mask>
              <mask id="sight-now">
                <rect width={frame.worldWidth} height={frame.worldHeight} fill="#fff" />
                <g filter="url(#sight-soft)">
                  {vision.map((polygon, index) => (
                    <polygon key={index} points={polygonPoints(polygon)} fill="#000" />
                  ))}
                </g>
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
              // The FX layer's mask: its painted areas, as a picture in map pixels placed with the camera.
              const image = fxMasks.get(layer.id);
              const masked = image ? fxMaskStyle(image, frame.worldWidth, frame.worldHeight, camera) : undefined;
              return (
                <Suspense key={layer.id} fallback={null}>
                  <Weather type={layer.type} intensity={layer.intensity} direction={layer.direction} amount={layer.amount} speed={layer.speed} camera={camera} mask={masked} />
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
                      <TrayFace url={actions.recordArtUrl?.(record.id) ?? ""} name={record.name} />
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
              ["area", "target", "Area target: click a spot, give a radius; your creature (the GM's: whose turn it is) targets everyone in it"],
            ] as const
          ).map(([id, icon, title]) => (
            <button key={id} type="button" className={tool === id ? "tool on" : "tool"} role="radio" aria-checked={tool === id} aria-label={title} title={title} data-tool={id} onClick={() => {
              setTool(id);
              if (id !== "pan") {
                setEditTool(null);
                setPending([]);
              }
            }}>
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
            <button type="button" className={editorOpen ? "tool on" : "tool"} data-action="map-editor" aria-pressed={editorOpen} aria-label="Edit map" title="Edit the map: line of sight (walls, doors, windows), lights, masks, paint, text, the grid and weather (FG's layer panel)" onClick={() => setEditorOpen(!editorOpen)}>
              <Icon name="walls" />
              <span className="tool-label">Edit map</span>
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
      {!gm && map.sceneId === scene.id && map.spoiled?.length ? (
        // C&C: bright light spoils deepvision and darkvision.
        <p className="map-chip spoiled" role="status" data-spoiled={map.spoiled.length}>
          Bright light spoils your {map.spoiled.length > 1 ? "tokens'" : ""} darkvision: you see only what the light shows.
        </p>
      ) : null}
      {gm && editorOpen && actions.wall && actions.mapUndo ? (
        <MapEditor
          map={map}
          tab={editTab}
          setTab={setEditTab}
          tool={editTool}
          setTool={(next) => {
            setEditTool(next);
            if (next) setTool("pan");
            // A drawing tool lets go of the picked walls (else the next wall type picked would change them).
            if (next && next !== "select") setSelectedWalls([]);
          }}
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
          fxBrush={fxBrush}
          setFxBrush={setFxBrush}
          selectedTile={selectedTile}
          setSelectedTile={setSelectedTile}
          viewCenter={() => viewCenter()}
          tilePictures={() => (actions.decalList ? actions.decalList("tile") : Promise.resolve([]))}
          tileUrl={(id) => (actions.decalUrl ? actions.decalUrl(id, "tile") : "")}
          selectedLabel={selectedLabel}
          actions={{ tile: actions.tile ?? (() => undefined), fx: actions.fx ?? (() => undefined), clearDrawings: actions.clearDrawings, label: actions.label ?? (() => undefined), mapGroup: actions.mapGroup ?? (() => undefined), mask: actions.mask ?? (() => undefined), wall: actions.wall, mapUndo: actions.mapUndo, updateSettings: actions.updateSettings, updateLight: actions.updateLight, removeLight: actions.removeLight }}
          onClose={() => setEditorOpen(false)}
          summary={<SceneLegend walls={wallsShown} lights={scene.lights} tokens={scene.tokens} markers={scene.markers} regions={scene.regions} />}
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
