// Categories follow Foundry's Wall#getWallCategory order and colors.
export type WallCategory =
  | "blank"
  | "invisible"
  | "terrain"
  | "window"
  | "ethereal"
  | "door"
  | "secret"
  | "normal";

export type SceneWall = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  light: number;
  sight: number;
  sound: number;
  move: number;
  dir: number;
  door: number;
  ds: number;
  // Foundry's proximity threshold for sight, in scene units (null: none).
  threshold: number | null;
  category: WallCategory;
};

export type SceneLight = {
  id: string;
  x: number;
  y: number;
  brightPx: number;
  dimPx: number;
  bright: number;
  dim: number;
  units: string;
  color: string;
  hidden: boolean;
};

export type SceneToken = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  disposition: number;
  hidden: boolean;
  imageName: string | null;
  image: Uint8Array | null;
};

export type SceneMarker = {
  id: string;
  x: number;
  y: number;
  text: string;
  kind: "note" | "trap";
};

export type SceneRegion = {
  id: string;
  name: string;
  trap: boolean;
  polygons: number[][];
};

export const CATEGORY_COLOR: Record<WallCategory, string> = {
  door: "#6666EE",
  ethereal: "#CA81FF",
  invisible: "#77E7E8",
  normal: "#FFFFBB",
  secret: "#A612D4",
  terrain: "#81B90C",
  window: "#C7D8FF",
  blank: "#555555",
};

export const CATEGORY_LABEL: Record<WallCategory, string> = {
  normal: "Walls",
  window: "Windows",
  invisible: "See-through",
  terrain: "Terrain",
  ethereal: "LOS only",
  door: "Doors",
  secret: "Secret doors",
  blank: "Blank",
};

export const CATEGORY_HINT: Record<WallCategory, string> = {
  normal: "Blocks sight and movement",
  window: "Sight depends on distance",
  invisible: "Sight passes, movement is blocked",
  terrain: "Limited sight",
  ethereal: "Blocks sight, movement passes",
  door: "Click to open or close",
  secret: "Hidden door. Click to open or close",
  blank: "Blocks nothing",
};

const SENSE_LABEL: Record<number, string> = {
  0: "passes",
  10: "limited",
  20: "blocked",
  30: "proximity",
  40: "distance",
};

export function classifyWall(wall: {
  sight: number;
  light: number;
  sound: number;
  move: number;
  door: number;
}): WallCategory {
  if (wall.sight === 0) return wall.light + wall.sound + wall.move === 0 ? "blank" : "invisible";
  if (wall.sight === 10) return "terrain";
  if (wall.sight === 30 || wall.sight === 40) return "window";
  if (wall.move === 0) return "ethereal";
  if (wall.door === 1) return "door";
  if (wall.door === 2) return "secret";
  return "normal";
}

export function wallStroke(category: WallCategory, doorState: number): string {
  if (category === "door") {
    if (doorState === 1) return "#66CC66";
    if (doorState === 2) return "#EE4444";
  }
  if (category === "secret") {
    if (doorState === 1) return "#7C1A9B";
    if (doorState === 2) return "#EE4444";
  }
  return CATEGORY_COLOR[category];
}

export function nextDoorState(doorState: number): number {
  return doorState === 1 ? 0 : 1;
}

export function senseLabel(value: number): string {
  return SENSE_LABEL[value] ?? String(value);
}

function doorWord(doorState: number): string {
  if (doorState === 1) return "open";
  if (doorState === 2) return "locked";
  return "closed";
}

export function wallTitle(wall: SceneWall, doorState: number): string {
  const senses = `Sight ${senseLabel(wall.sight)}, light ${senseLabel(wall.light)}, sound ${senseLabel(wall.sound)}, movement ${senseLabel(wall.move)}.`;
  if (wall.door === 2) return `${CATEGORY_LABEL[wall.category]}. ${senses} Secret door ${doorWord(doorState)}.`;
  if (wall.door === 1) return `${CATEGORY_LABEL[wall.category]}. ${senses} Door ${doorWord(doorState)}.`;
  return `${CATEGORY_LABEL[wall.category]}. ${senses}`;
}

export function countCategories(walls: SceneWall[]): Record<WallCategory, number> {
  const counts: Record<WallCategory, number> = {
    blank: 0,
    invisible: 0,
    terrain: 0,
    window: 0,
    ethereal: 0,
    door: 0,
    secret: 0,
    normal: 0,
  };
  for (const wall of walls) counts[wall.category] += 1;
  return counts;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function feetToPixels(feet: number, grid: { size: number; distance: number }): number {
  if (!(grid.distance > 0)) return 0;
  return (feet / grid.distance) * grid.size;
}

export function readWalls(value: unknown): SceneWall[] {
  if (!Array.isArray(value)) return [];
  const walls: SceneWall[] = [];
  for (const [index, entry] of value.entries()) {
    const wall = asRecord(entry);
    if (!wall) continue;
    const coords = Array.isArray(wall.c) ? wall.c.filter((item) => typeof item === "number") : [];
    if (coords.length < 4) continue;
    const sight = asNumber(wall.sight, 20);
    const light = asNumber(wall.light, 20);
    const sound = asNumber(wall.sound, 20);
    const move = asNumber(wall.move, 20);
    const door = asNumber(wall.door, 0);
    walls.push({
      id: asString(wall._id, `wall-${index}`),
      x1: coords[0] ?? 0,
      y1: coords[1] ?? 0,
      x2: coords[2] ?? 0,
      y2: coords[3] ?? 0,
      light,
      sight,
      sound,
      move,
      dir: asNumber(wall.dir, 0),
      door,
      ds: asNumber(wall.ds, 0),
      threshold: (() => {
        const value = asRecord(wall.threshold)?.sight;
        return typeof value === "number" && value > 0 ? value : null;
      })(),
      category: classifyWall({ sight, light, sound, move, door }),
    });
  }
  return walls;
}

export function readLights(
  value: unknown,
  grid: { size: number; distance: number; units: string },
): SceneLight[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const light = asRecord(entry);
    if (!light) return [];
    const config = asRecord(light.config) ?? light;
    const bright = asNumber(config.bright, asNumber(light.bright, 0));
    const dim = asNumber(config.dim, asNumber(light.dim, 0));
    const colorValue = config.color ?? light.color;
    const color = typeof colorValue === "string" && colorValue.startsWith("#") ? colorValue : "#ffb347";
    return [
      {
        id: asString(light._id, `light-${index}`),
        x: asNumber(light.x, 0),
        y: asNumber(light.y, 0),
        bright,
        dim,
        brightPx: feetToPixels(bright, grid),
        dimPx: feetToPixels(dim, grid),
        units: grid.units,
        color,
        hidden: light.hidden === true,
      },
    ];
  });
}

export function tokenImageName(value: unknown): string | null {
  const token = asRecord(value);
  if (!token) return null;
  const texture = asRecord(token.texture);
  const src = asString(texture?.src) || asString(token.img);
  return src || null;
}

export function readTokens(value: unknown, gridSize: number): SceneToken[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const token = asRecord(entry);
    if (!token) return [];
    const imageName = tokenImageName(token);
    return [
      {
        id: asString(token._id, `token-${index}`),
        name: asString(token.name, "Creature"),
        x: asNumber(token.x, 0),
        y: asNumber(token.y, 0),
        width: asNumber(token.width, 1) * gridSize,
        height: asNumber(token.height, 1) * gridSize,
        disposition: asNumber(token.disposition, 0),
        hidden: token.hidden === true,
        imageName,
        image: null,
      },
    ];
  });
}

function isTrap(text: string): boolean {
  return /trap/i.test(text);
}

export function readMarkers(notes: unknown, drawings: unknown): SceneMarker[] {
  const markers: SceneMarker[] = [];
  if (Array.isArray(notes)) {
    for (const [index, entry] of notes.entries()) {
      const note = asRecord(entry);
      if (!note) continue;
      const text = asString(note.text) || asString(note.name) || "Note";
      markers.push({
        id: asString(note._id, `note-${index}`),
        x: asNumber(note.x, 0),
        y: asNumber(note.y, 0),
        text,
        kind: isTrap(text) ? "trap" : "note",
      });
    }
  }
  if (Array.isArray(drawings)) {
    for (const [index, entry] of drawings.entries()) {
      const drawing = asRecord(entry);
      if (!drawing) continue;
      const text = asString(drawing.text);
      if (!isTrap(text)) continue;
      markers.push({
        id: asString(drawing._id, `drawing-${index}`),
        x: asNumber(drawing.x, 0),
        y: asNumber(drawing.y, 0),
        text,
        kind: "trap",
      });
    }
  }
  return markers;
}

export function readRegions(value: unknown): SceneRegion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const region = asRecord(entry);
    if (!region) return [];
    const name = asString(region.name, "Region");
    const polygons: number[][] = [];
    if (Array.isArray(region.shapes)) {
      for (const shape of region.shapes) {
        const record = asRecord(shape);
        const points = Array.isArray(record?.points) ? record.points.filter((item) => typeof item === "number") : [];
        if (points.length >= 6) polygons.push(points);
      }
    }
    return [{ id: asString(region._id, `region-${index}`), name, trap: isTrap(name), polygons }];
  });
}

export function baseName(name: string): string {
  const parts = name.replaceAll("\\", "/").split("/");
  return parts[parts.length - 1] ?? name;
}
