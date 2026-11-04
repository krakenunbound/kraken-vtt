import { strFromU8, unzipSync } from "fflate";
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

function indexAssets(files: ZipFiles): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  const ranked = Object.entries(files).sort((left, right) => {
    const leftRank = normalizePath(left[0]).includes("/assets/") || normalizePath(left[0]).startsWith("assets/") ? 0 : 1;
    const rightRank = normalizePath(right[0]).includes("/assets/") || normalizePath(right[0]).startsWith("assets/") ? 0 : 1;
    return leftRank - rightRank;
  });
  for (const [name, bytes] of ranked) {
    const base = baseName(name);
    if (base && !map.has(base)) map.set(base, bytes);
  }
  return map;
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
      image: scene.backgroundSrc ? assets.get(baseName(scene.backgroundSrc)) ?? null : null,
      tokens: scene.tokens.map((token) => ({
        ...token,
        image: token.imageName ? assets.get(baseName(token.imageName)) ?? null : null,
      })),
      tiles: scene.tiles.map((tile) => ({ ...tile, image: assets.get(baseName(tile.src)) ?? null })),
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
