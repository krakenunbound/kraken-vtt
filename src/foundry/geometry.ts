export type SquareGrid = {
  size: number;
  type: number;
  color: string;
  alpha: number;
  distance: number;
  units: string;
};

export type SceneFrame = {
  padX: number;
  padY: number;
  worldWidth: number;
  worldHeight: number;
};

// Foundry adds padding on every side. Walls use that padded origin.
// The padding is rounded up to whole grid squares (SquareGrid#calculateDimensions),
// so the map and grid always start on a square boundary.
export function sceneFrame(scene: {
  width: number;
  height: number;
  padding: number;
  grid: { size: number };
}): SceneFrame {
  const size = scene.grid.size > 0 ? scene.grid.size : 100;
  const padX = Math.ceil(scene.padding * scene.width * (1 / size)) * size;
  const padY = Math.ceil(scene.padding * scene.height * (1 / size)) * size;
  return {
    padX,
    padY,
    worldWidth: scene.width + padX * 2,
    worldHeight: scene.height + padY * 2,
  };
}

export type BackgroundFit = "fill" | "contain" | "cover" | "width" | "height";

export type BackgroundRect = { left: number; top: number; width: number; height: number };

// Where the background image lands, following Foundry's background mesh:
// it is fitted to the scene rectangle (fill by default), scaled, and the scene
// rectangle itself moves by -offset (Scene#getDimensions uses x - shiftX).
export function backgroundRect(
  scene: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    scaleX: number;
    scaleY: number;
    anchorX?: number;
    anchorY?: number;
    fit?: BackgroundFit;
  },
  frame: SceneFrame,
  natural: { width: number; height: number } | null,
): BackgroundRect {
  const textureWidth = natural?.width || scene.width;
  const textureHeight = natural?.height || scene.height;
  const ratioX = scene.width / textureWidth;
  const ratioY = scene.height / textureHeight;
  let sx = ratioX;
  let sy = ratioY;
  if (scene.fit === "cover") sx = sy = Math.max(ratioX, ratioY);
  else if (scene.fit === "contain") sx = sy = Math.min(ratioX, ratioY);
  else if (scene.fit === "width") sx = sy = ratioX;
  else if (scene.fit === "height") sx = sy = ratioY;
  const width = textureWidth * sx * (scene.scaleX || 1);
  const height = textureHeight * sy * (scene.scaleY || 1);
  const anchorX = scene.anchorX ?? 0;
  const anchorY = scene.anchorY ?? 0;
  return {
    left: frame.padX - scene.offsetX + anchorX * (scene.width - width),
    top: frame.padY - scene.offsetY + anchorY * (scene.height - height),
    width,
    height,
  };
}

export function gridStops(length: number, size: number): number[] {
  if (!(size > 0) || !(length >= 0)) return [];
  const count = Math.floor(length / size);
  const stops: number[] = [];
  for (let i = 0; i <= count; i += 1) stops.push(i * size);
  const last = stops[stops.length - 1];
  if (last !== length) stops.push(length);
  return stops;
}

export function gridLabel(grid: SquareGrid): string {
  if (grid.type === 0) return "Gridless";
  const measure = grid.units ? `${grid.distance} ${grid.units}` : `${grid.distance}`;
  if (grid.type === 1) return `Square · ${grid.size} px · ${measure}`;
  return `${grid.type >= 4 ? "Hex columns" : "Hex rows"} · ${grid.size} px · ${measure}`;
}

export function cssColor(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${(value >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(text) || /^#?[0-9a-fA-F]{3}$/.test(text)) {
      return text.startsWith("#") ? text : `#${text}`;
    }
  }
  return fallback;
}

export function colorWithAlpha(color: string, alpha: number): string {
  const hex = color.slice(1);
  const full = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const red = Number.parseInt(full.slice(0, 2), 16);
  const green = Number.parseInt(full.slice(2, 4), 16);
  const blue = Number.parseInt(full.slice(4, 6), 16);
  const clamped = Math.min(1, Math.max(0, alpha));
  return `rgba(${red}, ${green}, ${blue}, ${clamped})`;
}

export function preferredCandidateIndex(candidates: { name: string }[]): number {
  const morning = candidates.findIndex((candidate) => /morning/i.test(candidate.name));
  return morning >= 0 ? morning : 0;
}

export function preferredSceneIndex(scenes: { name: string }[]): number {
  const played = scenes.findIndex((scene) => !/empty/i.test(scene.name));
  return played >= 0 ? played : 0;
}
