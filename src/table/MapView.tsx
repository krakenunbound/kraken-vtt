import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { backgroundRect, colorWithAlpha, gridStops, sceneFrame, type BackgroundFit, type SceneFrame } from "../foundry/geometry";
import { type SceneLight, type SceneMarker, type SceneRegion, type SceneWall } from "../foundry/sceneObjects";
import { gridDistance, LIGHT_PRESETS, snapCenter } from "../../shared/map/geometry.mjs";
import type { MapToken, Ping, SceneLightRecord, TableMap, TableRecord } from "../session/useSession";
import { Lighting } from "./Lighting";
import { SceneGraphics, SceneLegend, type OverlayToken } from "./SceneOverlay";
import { SceneSettings, type SceneSettingsPatch } from "./SceneSettings";
import { Weather } from "./Weather";

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
  };
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
  ct: (action: string, payload?: Record<string, unknown>) => void;
};

type Drag = { pointerId: number; id: string; start: Point; at: Point; moved: boolean; snap: boolean; squares: number };
type Measure = { pointerId: number; start: Point; at: Point };
type Menu = { id: string; left: number; top: number };

export function MapView({
  scene,
  gm = true,
  map,
  records = [],
  pings = [],
  notice = null,
  actions,
  targeted = [],
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
}) {
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
  const drawSquare = scene.grid.type === 1 && scene.grid.size > 0 && gridSettings.show;
  const vertical = drawSquare ? gridStops(scene.width, scene.grid.size) : [];
  const horizontal = drawSquare ? gridStops(scene.height, scene.grid.size) : [];
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

  function lookAt(token: MapToken) {
    const element = viewport.current;
    if (!element) return;
    setSelected(token.id);
    setCamera((current) => centeredOn(element.getBoundingClientRect(), token, Math.max(current.scale, PLAYER_SQUARE_PX / size)));
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
        if ((event.target as HTMLElement).closest(".map-controls, .legend, .token-tray, .token-menu, .scene-settings")) return;
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
        capture(event.currentTarget, event.pointerId);
        pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setPanning(true);
      }}
      onPointerMove={(event) => {
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
        const current = pan.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        current.x = event.clientX;
        current.y = event.clientY;
        setCamera((camera) => ({ ...camera, x: camera.x + dx, y: camera.y + dy }));
      }}
      onPointerUp={(event) => {
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
        if (pan.current?.id === event.pointerId) {
          pan.current = null;
          setPanning(false);
        }
      }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest(".map-controls, .legend, .token-tray, .token, .token-menu, .scene-settings, .light-handle")) return;
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
              <line key={`v${x}`} x1={x} y1={0} x2={x} y2={scene.height} stroke={gridStroke} strokeWidth={strokeWidth} />
            ))}
            {horizontal.map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={scene.width} y2={y} stroke={gridStroke} strokeWidth={strokeWidth} />
            ))}
          </svg>
        ) : null}
        <SceneGraphics
          worldWidth={frame.worldWidth}
          worldHeight={frame.worldHeight}
          walls={gm ? scene.walls : []}
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

      {map.sceneId === scene.id && map.settings.weather.type !== "none" ? (
        <Weather type={map.settings.weather.type} intensity={map.settings.weather.intensity} direction={map.settings.weather.direction} camera={camera} />
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

      <div className="map-controls">
        <button type="button" onClick={() => zoomAboutCenter(1 / 1.25)} aria-label="Zoom out">
          −
        </button>
        <span className="zoom-readout">{Math.round(camera.scale * 100)}%</span>
        <button type="button" onClick={() => zoomAboutCenter(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={fit}>
          Fit
        </button>
        {mine.length > 0 || (gm && selected) ? (
          <button
            type="button"
            data-action="find-token"
            onClick={() => {
              const token = tokens.find((item) => item.id === selected && (gm || item.mine)) ?? mine[0];
              if (token) lookAt(token);
            }}
          >
            {gm ? "Find" : "My token"}
          </button>
        ) : null}
        {gm ? (
          <button type="button" data-action="scene-settings" aria-pressed={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} title="Lighting, players, grid and weather">
            Scene
          </button>
        ) : null}
        {gm ? (
          <button
            type="button"
            data-action="add-light"
            title="Put a torch-bright light in the middle of the view; drag it, right-click to change it"
            onClick={() => {
              const center = viewCenter();
              if (center) actions.placeLight({ x: center.x, y: center.y, preset: "torch", color: "#FFB347" });
              setShowLights(true);
            }}
          >
            Add light
          </button>
        ) : null}
        {gm ? (
          <button type="button" data-action="sight" aria-pressed={map.sight} onClick={() => actions.setSight(!map.sight)} title="Players see only what their tokens see, and walls stop their tokens">
            Line of sight {map.sight ? "on" : "off"}
          </button>
        ) : null}
        {gm ? (
          <button type="button" data-action="lock" aria-pressed={map.locked} onClick={() => actions.setLocked(!map.locked)} title="Players cannot move their tokens while locked">
            {map.locked ? "Movement locked" : "Lock movement"}
          </button>
        ) : map.locked ? (
          <span className="lock-note" title="The GM has locked token movement">
            Movement locked
          </span>
        ) : null}
      </div>
      {gm && !settingsOpen ? (
        <SceneLegend
          walls={scene.walls}
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
      <p className="map-hint">Drag to pan · wheel to zoom · right-drag to measure · double-click to ping · Ctrl+click a token to target it{gm || mine.length > 0 ? " · arrows move the selected token" : ""}</p>
      {scene.grid.type > 1 ? <p className="map-note">Hex grids are not drawn yet.</p> : null}
      {imageFailed || !scene.imageUrl ? <p className="map-note">This scene has no background image.</p> : null}
    </div>
  );
}
