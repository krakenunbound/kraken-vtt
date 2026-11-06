// Big maps as tiles, as map viewers do (Google's, Foundry's large scenes):
// the picture is decoded once in a worker, off the window's thread, and cut
// into 1024-pixel tiles at every halving of its size, the coarsest first, so a
// map shows at once and only the tiles in view are ever drawn, at the detail
// the zoom needs. An opaque map's tiles are JPEG (it decodes ~4x faster than
// WebP: B1's lower level 166 ms against 683 ms); one with transparency keeps
// it as WebP. The last few maps' tiles are kept for this visit.

export type MapTile = { level: number; x: number; y: number; width: number; height: number; url: string };
// A level: its scale (1 the picture's own pixels, 0.5 half...) and its tiles, in the picture's pixels.
export type TileLevel = { scale: number; tiles: MapTile[] };
export type TileSet = { width: number; height: number; levels: TileLevel[]; done: boolean };

const TILE = 1024;
// Small pictures are drawn as they are.
const WORTH_TILING = 2048 * 2048;

const WORKER = `
const TILE = ${TILE};
onmessage = async (event) => {
  const { url, id } = event.data;
  try {
    const blob = await (await fetch(url)).blob();
    const full = await createImageBitmap(blob);
    const width = full.width, height = full.height;
    // Does it have transparency? A small copy's alpha says.
    const probe = new OffscreenCanvas(64, 64).getContext("2d");
    probe.drawImage(full, 0, 0, 64, 64);
    const alpha = probe.getImageData(0, 0, 64, 64).data;
    let clear = false;
    for (let i = 3; i < alpha.length; i += 4) if (alpha[i] < 250) { clear = true; break; }
    const type = clear ? "image/webp" : "image/jpeg";
    postMessage({ id, kind: "size", width, height });
    // Every level from the coarsest (a single tile) to the picture's own pixels.
    const levels = [];
    for (let scale = 1; ; scale /= 2) {
      levels.push(scale);
      if (Math.max(width, height) * scale <= TILE) break;
    }
    levels.reverse();
    for (let level = 0; level < levels.length; level++) {
      const scale = levels[level];
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      const source = scale === 1 ? full : await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
      const tiles = [];
      for (let ty = 0; ty < h; ty += TILE)
        for (let tx = 0; tx < w; tx += TILE) {
          const tw = Math.min(TILE, w - tx), th = Math.min(TILE, h - ty);
          const canvas = new OffscreenCanvas(tw, th);
          canvas.getContext("2d").drawImage(source, tx, ty, tw, th, 0, 0, tw, th);
          const out = await canvas.convertToBlob({ type, quality: 0.9 });
          tiles.push({ x: tx / scale, y: ty / scale, width: tw / scale, height: th / scale, blob: out });
        }
      if (source !== full) source.close();
      postMessage({ id, kind: "level", level, count: levels.length, scale, tiles });
    }
    full.close();
    postMessage({ id, kind: "done" });
  } catch (error) {
    postMessage({ id, kind: "error", error: String(error && error.message || error) });
  }
};`;

let worker: Worker | null = null;
let asked = 0;
const sets = new Map<string, TileSet>();
const listeners = new Map<string, Set<(set: TileSet) => void>>();
const inWork = new Set<string>();

function workerFor(): Worker {
  if (!worker) {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" })));
    worker.onmessage = (event: MessageEvent) => onWorker(event.data);
  }
  return worker;
}
const ids = new Map<number, string>();
function onWorker(message: { id: number; kind: string; width?: number; height?: number; level?: number; count?: number; scale?: number; tiles?: { x: number; y: number; width: number; height: number; blob: Blob }[]; error?: string }) {
  const url = ids.get(message.id);
  if (!url) return;
  const set = sets.get(url);
  if (message.kind === "size" && message.width && message.height) {
    if (message.width * message.height < WORTH_TILING) {
      // Not worth it: drawn as it is.
      finish(url, null);
      return;
    }
    sets.set(url, { width: message.width, height: message.height, levels: [], done: false });
  } else if (message.kind === "level" && set && message.tiles) {
    const level: TileLevel = { scale: message.scale ?? 1, tiles: message.tiles.map((tile) => ({ level: message.level ?? 0, x: tile.x, y: tile.y, width: tile.width, height: tile.height, url: URL.createObjectURL(tile.blob) })) };
    set.levels = [...set.levels, level];
    tell(url, { ...set });
  } else if (message.kind === "done" && set) {
    set.done = true;
    finish(url, set);
  } else if (message.kind === "error") finish(url, null);
}
function tell(url: string, set: TileSet) {
  for (const listener of listeners.get(url) ?? []) listener(set);
}
function finish(url: string, set: TileSet | null) {
  inWork.delete(url);
  for (const [id, wanted] of ids) if (wanted === url) ids.delete(id);
  if (!set) {
    sets.delete(url);
    tell(url, { width: 0, height: 0, levels: [], done: true });
    return;
  }
  tell(url, { ...set });
  // The last four maps kept; the rest let go.
  const keys = [...sets.keys()].filter((key) => sets.get(key)?.done);
  for (const old of keys.slice(0, Math.max(0, keys.length - 4))) {
    for (const level of sets.get(old)?.levels ?? []) for (const tile of level.tiles) URL.revokeObjectURL(tile.url);
    sets.delete(old);
  }
}

// The map's tiles, as they come (the coarsest level first). An empty set that
// is done: not worth tiling (or could not be), draw the picture itself.
export function watchTiles(url: string, listener: (set: TileSet) => void): () => void {
  const known = sets.get(url);
  if (known) listener({ ...known });
  const group = listeners.get(url) ?? new Set();
  group.add(listener);
  listeners.set(url, group);
  if (!known && !inWork.has(url)) {
    inWork.add(url);
    const id = ++asked;
    ids.set(id, url);
    workerFor().postMessage({ url, id });
  }
  return () => {
    group.delete(listener);
  };
}

// The finest level worth drawing at this zoom (screen pixels per map pixel), and its tiles in view.
export function tilesInView(set: TileSet, zoom: number, view: { left: number; top: number; right: number; bottom: number }): MapTile[] {
  if (!set.levels.length) return [];
  // The coarsest level that still has at least one of its pixels per screen pixel (or the finest there is).
  let chosen = set.levels[set.levels.length - 1];
  for (const level of set.levels) {
    if (level.scale >= zoom * 0.95) {
      chosen = level;
      break;
    }
  }
  return chosen.tiles.filter((tile) => tile.x < view.right && tile.x + tile.width > view.left && tile.y < view.bottom && tile.y + tile.height > view.top);
}
