import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { cssColor, type BackgroundFit, type SquareGrid } from "./geometry";
import {
  readLights,
  readMarkers,
  readRegions,
  readTokens,
  readWalls,
  type SceneLight,
  type SceneMarker,
  type SceneRegion,
  type SceneToken,
  type SceneWall,
} from "./sceneObjects";

export type ParsedScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  padding: number;
  backgroundColor: string;
  grid: SquareGrid;
  backgroundSrc: string | null;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  anchorX: number;
  anchorY: number;
  fit: BackgroundFit;
  image: Uint8Array | null;
  // Foundry's darkness level (0 day .. 1 night); 0 when global light is on.
  darkness: number;
  walls: SceneWall[];
  lights: SceneLight[];
  tokens: SceneToken[];
  markers: SceneMarker[];
  regions: SceneRegion[];
  // Foundry's tiles: Kraken's image layers (their pictures from the bundle).
  tiles: SceneTile[];
};

// A Foundry tile (v9's img and overhead, v10+'s texture and occlusion/elevation).
export type SceneTile = { name: string; src: string; image: Uint8Array | null; x: number; y: number; width: number; height: number; rotation: number; alpha: number; hidden: boolean; level: "below" | "above"; flipX: boolean; flipY: boolean };

function readTiles(value: unknown): Omit<SceneTile, "image">[] {
  const list = Array.isArray(value) ? value : [];
  const out: Omit<SceneTile, "image">[] = [];
  for (const item of list) {
    const tile = asRecord(item);
    if (!tile) continue;
    const texture = asRecord(tile.texture) ?? {};
    const src = asString(texture.src ?? tile.img);
    const width = asNumber(tile.width, 0);
    const height = asNumber(tile.height, 0);
    if (!src || width <= 0 || height <= 0) continue;
    const occlusion = asRecord(tile.occlusion);
    // Overhead: v9/v10's overhead flag; v12+: a tile above the tokens' elevation, or one that occludes.
    const above = tile.overhead === true || asNumber(tile.elevation, 0) > 0 || (occlusion != null && asNumber(occlusion.mode, 0) > 0 && tile.overhead !== false);
    out.push({
      name: baseName(src).replace(/\.[a-z0-9]+$/i, ""),
      src,
      x: asNumber(tile.x, 0),
      y: asNumber(tile.y, 0),
      width,
      height,
      rotation: asNumber(tile.rotation, 0),
      alpha: Math.min(1, Math.max(0, asNumber(tile.alpha, 1))),
      hidden: tile.hidden === true,
      level: above ? "above" : "below",
      flipX: asNumber(texture.scaleX, 1) < 0,
      flipY: asNumber(texture.scaleY, 1) < 0,
    });
  }
  return out.slice(0, 300);
}

export type LoadedAdventure = {
  name: string;
  scenes: ParsedScene[];
};

export type ImportCandidate = {
  name: string;
  load: () => LoadedAdventure;
};

type ZipFiles = Record<string, Uint8Array>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asFit(value: unknown): BackgroundFit {
  return value === "contain" || value === "cover" || value === "width" || value === "height" ? value : "fill";
}

function normalizePath(name: string): string {
  return name.replaceAll("\\", "/");
}

function baseName(name: string): string {
  const parts = normalizePath(name).split("/");
  return parts[parts.length - 1] ?? name;
}

function bundleEntry(files: ZipFiles): [string, Uint8Array] | undefined {
  return Object.entries(files).find(([name]) => {
    const path = normalizePath(name);
    return path.endsWith("bundle.json") && !path.includes("__MACOSX");
  });
}

function unzip(bytes: Uint8Array, filter: (name: string) => boolean): ZipFiles {
  return unzipSync(bytes, {
    filter(file) {
      return filter(normalizePath(file.name));
    },
  });
}

function readAdventureRecord(files: ZipFiles): Record<string, unknown> {
  const entry = bundleEntry(files);
  if (!entry) throw new Error("No bundle.json in this zip.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(entry[1]));
  } catch {
    throw new Error("This bundle.json could not be read.");
  }
  const root = asRecord(parsed);
  const adventure = asRecord(root?.adventureData);
  if (!adventure) throw new Error("This zip is not a prepared map bundle.");
  return adventure;
}

function mimeFor(name: string): string {
  const ext = baseName(name).split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  // Animated maps (Foundry's video backgrounds).
  if (ext === "webm") return "video/webm";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  return "application/octet-stream";
}

export function imageMime(name: string): string {
  return mimeFor(name);
}

function parseScenes(adventure: Record<string, unknown>): (Omit<ParsedScene, "image" | "tiles"> & { tiles: Omit<SceneTile, "image">[] })[] {
  const source = Array.isArray(adventure.scenes) ? adventure.scenes : [];
  return source.map((value, index) => {
    const scene = asRecord(value) ?? {};
    const grid = asRecord(scene.grid) ?? {};
    const background = asRecord(scene.background) ?? {};
    const src = asString(background.src);
    return {
      id: asString(scene._id, `scene-${index}`),
      name: asString(scene.name, `Scene ${index + 1}`),
      width: asNumber(scene.width, 0),
      height: asNumber(scene.height, 0),
      padding: asNumber(scene.padding, 0),
      backgroundColor: cssColor(scene.backgroundColor, "#999999"),
      grid: {
        size: asNumber(grid.size, 100),
        type: asNumber(grid.type, 1),
        color: cssColor(grid.color, "#000000"),
        alpha: asNumber(grid.alpha, 0.2),
        distance: asNumber(grid.distance, 5),
        units: asString(grid.units, "ft"),
      },
      backgroundSrc: src || null,
      offsetX: asNumber(background.offsetX, 0),
      offsetY: asNumber(background.offsetY, 0),
      scaleX: asNumber(background.scaleX, 1),
      scaleY: asNumber(background.scaleY, 1),
      anchorX: asNumber(background.anchorX, 0),
      anchorY: asNumber(background.anchorY, 0),
      fit: asFit(background.fit),
      walls: readWalls(scene.walls),
      darkness: (() => {
        const environment = asRecord(scene.environment);
        const globalLight = asRecord(environment?.globalLight);
        if (globalLight?.enabled === true || scene.globalLight === true) return 0;
        return Math.min(1, Math.max(0, asNumber(environment?.darknessLevel ?? scene.darkness, 0)));
      })(),
      lights: readLights(scene.lights, {
        size: asNumber(grid.size, 100),
        distance: asNumber(grid.distance, 5),
        units: asString(grid.units, "ft"),
      }),
      tokens: readTokens(scene.tokens, asNumber(grid.size, 100)),
      markers: readMarkers(scene.notes, scene.drawings),
      regions: readRegions(scene.regions),
      tiles: readTiles(scene.tiles),
    };
  });
}

// The archive's pictures by their path, and by file name where only one has that name: "assets/one/map.webp"
// and "assets/two/map.webp" are two pictures (a name shared by two is found by its path only).
type AssetIndex = { byPath: Map<string, Uint8Array>; byName: Map<string, Uint8Array | null> };
function indexAssets(files: ZipFiles): AssetIndex {
  const byPath = new Map<string, Uint8Array>();
  const byName = new Map<string, Uint8Array | null>();
  for (const [name, bytes] of Object.entries(files)) {
    byPath.set(normalizePath(name).toLowerCase(), bytes);
    const base = baseName(name);
    if (!base) continue;
    byName.set(base, byName.has(base) ? null : bytes);
  }
  return { byPath, byName };
}
// A scene's reference to a picture: the archive file whose path ends with it, else its name if that is unique.
function assetFor(index: AssetIndex, src: string): Uint8Array | null {
  const wanted = normalizePath(src).toLowerCase().replace(/^\.?\/+/, "");
  if (!wanted) return null;
  for (const [path, bytes] of index.byPath) if (path === wanted || path.endsWith(`/${wanted}`)) return bytes;
  return index.byName.get(baseName(src)) ?? null;
}

export function loadBundle(bytes: Uint8Array): LoadedAdventure {
  const meta = unzip(bytes, (name) => name.endsWith("bundle.json") && !name.includes("__MACOSX"));
  const adventure = readAdventureRecord(meta);
  const scenes = parseScenes(adventure);
  const needed = new Set(
    scenes
      .flatMap((scene) => [
        scene.backgroundSrc ? baseName(scene.backgroundSrc) : "",
        ...scene.tokens.map((token) => (token.imageName ? baseName(token.imageName) : "")),
        ...scene.tiles.map((tile) => baseName(tile.src)),
      ])
      .filter(Boolean),
  );
  const assets = indexAssets(
    needed.size === 0
      ? {}
      : unzip(bytes, (name) => needed.has(baseName(name)) && !name.includes("__MACOSX")),
  );
  return {
    name: asString(adventure.name, "Untitled adventure"),
    scenes: scenes.map((scene) => ({
      ...scene,
      image: scene.backgroundSrc ? assetFor(assets, scene.backgroundSrc) : null,
      tokens: scene.tokens.map((token) => ({
        ...token,
        image: token.imageName ? assetFor(assets, token.imageName) : null,
      })),
      tiles: scene.tiles.map((tile) => ({ ...tile, image: assetFor(assets, tile.src) })),
    })),
  };
}

export function inspectZip(bytes: Uint8Array): ImportCandidate[] {
  const top = unzip(
    bytes,
    (name) => !name.includes("__MACOSX") && (name.endsWith("bundle.json") || name.toLowerCase().endsWith(".zip")),
  );
  if (bundleEntry(top)) {
    const name = asString(readAdventureRecord(top).name, "Untitled adventure");
    return [{ name, load: () => loadBundle(bytes) }];
  }

  const candidates: ImportCandidate[] = [];
  for (const [fileName, zipBytes] of Object.entries(top)) {
    if (!fileName.toLowerCase().endsWith(".zip")) continue;
    try {
      const inner = unzip(zipBytes, (name) => name.endsWith("bundle.json") && !name.includes("__MACOSX"));
      if (!bundleEntry(inner)) continue;
      const name = asString(readAdventureRecord(inner).name, baseName(fileName));
      const held = zipBytes;
      candidates.push({ name, load: () => loadBundle(held) });
    } catch {
      // A nested zip that is not an adventure bundle is skipped.
    }
  }
  return candidates;
}

// A bare picture (a map with nothing on it yet) as a one-scene bundle, so the
// GM can build it into a playable scene in the map editor: grid, walls, doors,
// lights, text. Its scene id follows the picture's bytes, so the same picture
// opened again finds the walls and tokens already made for it.
export const PICTURE = /\.(png|jpe?g|webp|gif)$/i;
export function pictureBundle(bytes: Uint8Array, fileName: string, size: { width: number; height: number }, given: { walls?: unknown[]; lights?: unknown[]; grid?: number; name?: string; ext?: string } = {}): Uint8Array {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let index = 0; index < bytes.length; index += step) hash = Math.imul(hash ^ bytes[index], 16777619) >>> 0;
  hash = Math.imul(hash ^ bytes.length, 16777619) >>> 0;
  const name = given.name ?? (baseName(fileName).replace(PICTURE, "").replace(/[_-]+/g, " ").trim() || "Map");
  const file = `map${given.ext ?? (PICTURE.exec(fileName)?.[0] ?? ".png").toLowerCase()}`;
  const scene = {
    _id: `pic-${hash.toString(36)}`,
    name,
    width: Math.round(size.width),
    height: Math.round(size.height),
    padding: 0,
    backgroundColor: "#000000",
    // A square grid to start with (FG's default 50 px is small on most battle maps): the Grid tab fits it to the picture.
    grid: { size: given.grid ?? 100, type: 1, distance: 5, units: "ft", color: "#000000", alpha: 0.25 },
    background: { src: file },
    walls: given.walls ?? [],
    lights: given.lights ?? [],
    tokens: [],
    notes: [],
  };
  return zipSync({ "bundle.json": strToU8(JSON.stringify({ adventureData: { name, scenes: [scene] } })), [file]: bytes }, { level: 0 });
}

// A Universal VTT map (.dd2vtt from Dungeondraft, .df2vtt from DungeonFog, .uvtt): its picture with its grid, walls,
// doors and lights, as a one-scene bundle like a bare picture's (docs/feature-parity.md M13). Points are in grid squares
// from map_origin; a portal is a door (open or closed); a light's range is in squares (five feet each).
export const UVTT = /\.(dd2vtt|df2vtt|uvtt)$/i;
type UvttPoint = { x: number; y: number };
export function uvttBundle(bytes: Uint8Array, fileName: string): Uint8Array {
  let data: { resolution?: { map_origin?: UvttPoint; map_size?: UvttPoint; pixels_per_grid?: number }; line_of_sight?: UvttPoint[][]; objects_line_of_sight?: UvttPoint[][]; portals?: { bounds?: UvttPoint[]; closed?: boolean }[]; lights?: { position?: UvttPoint; range?: number; color?: string; intensity?: number }[]; image?: string };
  try {
    data = JSON.parse(strFromU8(bytes));
  } catch {
    throw new Error(`${fileName} is not a Universal VTT map (it is not JSON).`);
  }
  if (typeof data.image !== "string" || !data.image) throw new Error(`${fileName} has no map picture in it.`);
  const grid = Number(data.resolution?.pixels_per_grid) || 70;
  const origin = { x: Number(data.resolution?.map_origin?.x) || 0, y: Number(data.resolution?.map_origin?.y) || 0 };
  const squares = { x: Number(data.resolution?.map_size?.x) || 0, y: Number(data.resolution?.map_size?.y) || 0 };
  const binary = atob(data.image.replace(/^data:[^,]*,/, ""));
  const picture = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) picture[index] = binary.charCodeAt(index);
  // The picture's kind from its first bytes (Dungeondraft writes PNG or WebP).
  const ext = picture[0] === 0x89 && picture[1] === 0x50 ? ".png" : picture[8] === 0x57 && picture[9] === 0x45 ? ".webp" : picture[0] === 0xff && picture[1] === 0xd8 ? ".jpg" : ".png";
  const at = (point: UvttPoint) => [Math.round((Number(point.x) - origin.x) * grid * 10) / 10, Math.round((Number(point.y) - origin.y) * grid * 10) / 10];
  const walls: unknown[] = [];
  let n = 0;
  for (const line of [...(data.line_of_sight ?? []), ...(data.objects_line_of_sight ?? [])]) {
    if (!Array.isArray(line)) continue;
    for (let index = 0; index + 1 < line.length; index += 1) {
      const [x1, y1] = at(line[index]);
      const [x2, y2] = at(line[index + 1]);
      if (x1 === x2 && y1 === y2) continue;
      walls.push({ _id: `uv-${n++}`, c: [x1, y1, x2, y2], sight: 20, light: 20, sound: 20, move: 20, dir: 0, door: 0, ds: 0 });
    }
  }
  (data.portals ?? []).forEach((portal, index) => {
    const [a, b] = portal.bounds ?? [];
    if (!a || !b) return;
    walls.push({ _id: `uv-door-${index}`, c: [...at(a), ...at(b)], sight: 20, light: 20, sound: 20, move: 20, dir: 0, door: 1, ds: portal.closed === false ? 1 : 0 });
  });
  const lights = (data.lights ?? []).flatMap((light, index) => {
    if (!light.position) return [];
    const [x, y] = at(light.position);
    const range = Math.max(0, Number(light.range) || 0);
    // Colours are written AARRGGBB (or RRGGBB).
    const color = /^#?(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(String(light.color ?? ""))?.[1];
    return [{ _id: `uv-light-${index}`, x, y, hidden: false, config: { bright: Math.round(range * 2.5), dim: range * 5, color: color ? `#${color}` : "#FFB347" } }];
  });
  const name = baseName(fileName).replace(UVTT, "").replace(/[_-]+/g, " ").trim() || "Map";
  return pictureBundle(picture, `${name}${ext}`, { width: squares.x * grid, height: squares.y * grid }, { walls, lights, grid, name, ext });
}
