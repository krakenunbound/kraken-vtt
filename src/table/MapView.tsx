import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { backgroundRect, colorWithAlpha, gridStops, sceneFrame, type BackgroundFit, type SceneFrame } from "../foundry/geometry";
import { nextDoorState, type SceneLight, type SceneMarker, type SceneRegion, type SceneWall } from "../foundry/sceneObjects";
import { SceneGraphics, SceneLegend, type OverlayToken } from "./SceneOverlay";

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
  lights: SceneLight[];
  tokens: OverlayToken[];
  markers: SceneMarker[];
  regions: SceneRegion[];
};

type Camera = { x: number; y: number; scale: number };

const MIN_SCALE = 0.02;
const MAX_SCALE = 8;

function fitCamera(
  viewWidth: number,
  viewHeight: number,
  frame: SceneFrame,
  mapWidth: number,
  mapHeight: number,
): Camera {
  const scale = Math.min(viewWidth / mapWidth, viewHeight / mapHeight) * 0.96;
  const centerX = frame.padX + mapWidth / 2;
  const centerY = frame.padY + mapHeight / 2;
  return {
    scale,
    x: viewWidth / 2 - centerX * scale,
    y: viewHeight / 2 - centerY * scale,
  };
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export type MapPawn = { id: string; name: string; color: string; x: number; y: number };

export function MapView({
  scene,
  gm = true,
  pawns = [],
  selfId = "",
  onMovePawn,
}: {
  scene: MapScene;
  gm?: boolean;
  pawns?: MapPawn[];
  selfId?: string;
  onMovePawn?: (id: string, x: number, y: number, done: boolean) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const pawnDrag = useRef<{ pointerId: number; id: string } | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 0.1 });
  const cameraRef = useRef(camera);
  const moveRef = useRef(onMovePawn);
  cameraRef.current = camera;
  moveRef.current = onMovePawn;
  const [dragging, setDragging] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [showWalls, setShowWalls] = useState(true);
  const [showLights, setShowLights] = useState(true);
  const [showCreatures, setShowCreatures] = useState(true);
  const [doorStates, setDoorStates] = useState<Record<string, number>>({});
  const frame = sceneFrame(scene);
  const drawSquare = scene.grid.type === 1 && scene.grid.size > 0;
  const vertical = drawSquare ? gridStops(scene.width, scene.grid.size) : [];
  const horizontal = drawSquare ? gridStops(scene.height, scene.grid.size) : [];
  const backdrop = backgroundRect(scene, frame, natural);
  const strokeWidth = 1 / camera.scale;

  useEffect(() => {
    setNatural(null);
    setImageFailed(false);
    setDoorStates({});
  }, [scene.id, scene.imageUrl]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let didFit = false;
    const apply = () => {
      if (didFit) return;
      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const next = sceneFrame(scene);
      setCamera(fitCamera(rect.width, rect.height, next, scene.width, scene.height));
      didFit = true;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scene.id, scene.width, scene.height, scene.padding, scene.grid.size]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
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

  function zoomAboutCenter(factor: number) {
    const element = viewport.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const pointerX = rect.width / 2;
    const pointerY = rect.height / 2;
    setCamera((current) => {
      const scale = clampScale(current.scale * factor);
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      return { scale, x: pointerX - worldX * scale, y: pointerY - worldY * scale };
    });
  }

  function fit() {
    const element = viewport.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setCamera(fitCamera(rect.width, rect.height, frame, scene.width, scene.height));
  }

  function worldPoint(event: React.PointerEvent): { x: number; y: number } | null {
    const element = viewport.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const current = cameraRef.current;
    return {
      x: (event.clientX - rect.left - current.x) / current.scale,
      y: (event.clientY - rect.top - current.y) / current.scale,
    };
  }

  const pawnSize = scene.grid.size > 0 ? scene.grid.size : 100;

  return (
    <div
      className={dragging ? "viewport dragging" : "viewport"}
      ref={viewport}
      data-scene={scene.name}
      data-gm={gm ? "true" : "false"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest(".map-controls, .legend")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        current.x = event.clientX;
        current.y = event.clientY;
        setCamera((camera) => ({ ...camera, x: camera.x + dx, y: camera.y + dy }));
      }}
      onPointerUp={(event) => {
        if (drag.current?.id === event.pointerId) {
          drag.current = null;
          setDragging(false);
        }
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
            style={{
              left: backdrop.left,
              top: backdrop.top,
              width: backdrop.width,
              height: backdrop.height,
            }}
            onLoad={(event) => {
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
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
              <line
                key={`v${x}`}
                x1={x}
                y1={0}
                x2={x}
                y2={scene.height}
                stroke={colorWithAlpha(scene.grid.color, scene.grid.alpha)}
                strokeWidth={strokeWidth}
              />
            ))}
            {horizontal.map((y) => (
              <line
                key={`h${y}`}
                x1={0}
                y1={y}
                x2={scene.width}
                y2={y}
                stroke={colorWithAlpha(scene.grid.color, scene.grid.alpha)}
                strokeWidth={strokeWidth}
              />
            ))}
          </svg>
        ) : null}
        <SceneGraphics
          worldWidth={frame.worldWidth}
          worldHeight={frame.worldHeight}
          walls={gm ? scene.walls : []}
          lights={scene.lights}
          tokens={scene.tokens}
          markers={gm ? scene.markers : []}
          regions={gm ? scene.regions : []}
          scale={camera.scale}
          showWalls={showWalls && gm}
          showLights={showLights}
          showCreatures={showCreatures}
          doorStates={doorStates}
          onToggleDoor={(wallId, state) => {
            setDoorStates((current) => ({ ...current, [wallId]: nextDoorState(state) }));
          }}
        />
        {pawns.map((pawn) => {
          const canDrag = gm || pawn.id === selfId;
          return (
            <div
              key={pawn.id}
              className={canDrag ? "pawn pawn-draggable" : "pawn"}
              data-pawn={pawn.id}
              data-name={pawn.name}
              style={{
                left: pawn.x,
                top: pawn.y,
                width: pawnSize,
                height: pawnSize,
                background: pawn.color,
                fontSize: Math.max(12, pawnSize * 0.28),
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || !canDrag) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                pawnDrag.current = { pointerId: event.pointerId, id: pawn.id };
              }}
              onPointerMove={(event) => {
                const current = pawnDrag.current;
                if (!current || current.pointerId !== event.pointerId) return;
                const point = worldPoint(event);
                if (point) moveRef.current?.(current.id, point.x, point.y, false);
              }}
              onPointerUp={(event) => {
                const current = pawnDrag.current;
                if (!current || current.pointerId !== event.pointerId) return;
                pawnDrag.current = null;
                const point = worldPoint(event);
                if (point) moveRef.current?.(current.id, point.x, point.y, true);
              }}
            >
              {(pawn.name || "?").slice(0, 1).toUpperCase()}
              <span>{pawn.name}</span>
            </div>
          );
        })}
      </div>
      <div className="map-controls">
        <button type="button" onClick={() => zoomAboutCenter(1 / 1.1)} aria-label="Zoom out">
          −
        </button>
        <span className="zoom-readout">{Math.round(camera.scale * 100)}%</span>
        <button type="button" onClick={() => zoomAboutCenter(1.1)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={fit}>
          Fit
        </button>
      </div>
      {gm ? (
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
      {scene.grid.type > 1 ? <p className="map-note">Hex grids are not drawn yet.</p> : null}
      {imageFailed || !scene.imageUrl ? <p className="map-note">This scene has no background image.</p> : null}
    </div>
  );
}
