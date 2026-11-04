const { zipSync, strToU8 } = require("fflate");
const { readModule, modulePicture } = require("./fgModule.cjs");

// An FG adventure module's maps as a prepared map bundle Kraken opens the
// way it opens any (bundle.json with Foundry-shaped scenes, and the
// pictures), plus what Kraken keeps per scene itself: FG's shortcuts as pins
// (labels linked to the story entry or encounter) and FG's FX layers.
//
// FG keeps an image's layers with walls (occluders), lights and shortcuts in
// image-centred coordinates; Kraken's scenes start at the picture's top left.
// FG's y axis points up (Unity), so y is flipped.

const list = (value) => (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []);
const nums = (text) =>
  String(text ?? "")
    .split(",")
    .map(Number)
    .filter((value) => Number.isFinite(value));

// A picture's pixel size from its header (PNG, JPEG, WebP).
function pictureSize(bytes) {
  const b = Buffer.from(bytes);
  if (b.length > 24 && b.toString("ascii", 1, 4) === "PNG") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const chunk = b.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at < b.length - 9) {
      if (b[at] !== 0xff) {
        at += 1;
        continue;
      }
      const marker = b[at + 1];
      const length = b.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(at + 7), height: b.readUInt16BE(at + 5) };
      at += 2 + length;
    }
  }
  return null;
}

// A layer's offset from its 4x4 matrix (column-major: the translation is 12, 13).
function layerOffset(layer) {
  const matrix = nums(layer?.matrix);
  return matrix.length === 16 ? { x: matrix[12], y: matrix[13] } : { x: 0, y: 0 };
}

const FX_MAP = { rain: "rain", snow: "snow", blizzard: "blizzard", myst: "fog", clouds: "clouds", water: "water", ocean: "water" };

// One FG image record as a scene for the bundle, and Kraken's extras for it.
function imageScene(record, moduleName, sceneId) {
  const image = record.data?.image ?? {};
  const layers = list(image.layers?.layer);
  const base = layers.find((layer) => layer.type === "image" && layer.bitmap) ?? null;
  const picture = base ? modulePicture(base.bitmap, moduleName) : null;
  if (!picture) return null;
  const size = pictureSize(picture.bytes);
  if (!size) return null;
  const [gridW] = nums(image.gridsize).length ? nums(image.gridsize) : [50];
  const [offsetX = 0, offsetY = 0] = nums(image.gridoffset);
  const baseAt = layerOffset(base);
  // FG point -> scene pixel: from the picture's centre, y up.
  const at = (x, y, layer = base) => {
    const shift = layerOffset(layer);
    return { x: size.width / 2 + x + shift.x, y: size.height / 2 - (y + shift.y) };
  };
  const walls = [];
  let n = 0;
  for (const layer of layers) {
    for (const occluder of list(layer.occluders?.occluder)) {
      const points = nums(occluder.points);
      if (occluder.closed && points.length >= 6) points.push(points[0], points[1]);
      const door = occluder.toggleable ? 1 : 0;
      const vision = Boolean(occluder.allow_vision);
      const move = occluder.allow_move ? 0 : 20;
      const dir = occluder.single_sided ? (occluder.counterclockwise ? 2 : 1) : 0;
      for (let i = 0; i + 3 < points.length; i += 2) {
        const a = at(points[i], points[i + 1], layer);
        const b = at(points[i + 2], points[i + 3], layer);
        if (a.x === b.x && a.y === b.y) continue;
        walls.push({
          _id: `fg-${occluder.id ?? n}-${i / 2}`,
          c: [a.x, a.y, b.x, b.y].map((value) => Math.round(value * 10) / 10),
          sight: vision ? 0 : 20,
          light: vision ? 0 : 20,
          sound: 20,
          move,
          dir,
          door,
          ds: occluder.open ? 1 : 0,
          ...(occluder.hidden ? { flags: { kraken: { hidden: true } } } : {}),
        });
        n += 1;
      }
    }
  }
  const lights = [];
  for (const layer of layers) {
    for (const light of list(layer.lights?.light)) {
      const [x, y] = nums(light.position);
      if (!Number.isFinite(x)) continue;
      // FG range: bright squares, bright intensity, dim squares, dim intensity.
      const [bright = 0, , dim = bright] = nums(light.range);
      const point = at(x, y, layer);
      const color = /^#([0-9a-f]{2})?([0-9a-f]{6})$/i.exec(String(light.color ?? ""))?.[2];
      lights.push({ _id: `fg-light-${light.id}`, x: point.x, y: point.y, hidden: light.on === false, config: { bright: bright * 5, dim: Math.max(dim, bright) * 5, color: color ? `#${color}` : "#FFB347" } });
    }
  }
  // FG's shortcuts: map pins that open the story entry or encounter.
  const pins = [];
  for (const layer of layers.filter((item) => item.type === "shortcut" && item.shortcut?.record)) {
    const shift = layerOffset(layer);
    const point = { x: size.width / 2 + shift.x, y: size.height / 2 - shift.y };
    const encounter = String(layer.name ?? "").startsWith("Encounter:");
    pins.push({
      x: Math.round(point.x),
      y: Math.round(point.y),
      text: String(layer.name ?? "").replace(/^Encounter:\s*/, "").slice(0, 200),
      icon: encounter ? "trap" : "pin",
      size: 0.4,
      group: encounter ? "Encounters" : "Map keys",
      link: { kind: "fg", id: `${layer.shortcut.record}@${moduleName}`, class: String(layer.shortcut.class ?? "") },
    });
  }
  const fx = layers
    .filter((layer) => layer.type === "fx" && FX_MAP[layer.fx?.type])
    .map((layer) => ({
      name: String(layer.name ?? layer.fx.type),
      type: FX_MAP[layer.fx.type],
      shown: !layer.invisible,
      intensity: Number(layer.fx.RainIntensity ?? layer.fx.WaterIntensity ?? 0.5),
      speed: Number(layer.fx.RainSpeed ?? layer.fx.MystSpeed ?? 0.5),
      direction: Math.round((Number(layer.fx.RainDirection ?? 0.7) % 1) * 360),
      mask: layer.fx.usemask && layer.fx.mask?.points ? { use: true, mode: "inside", polygons: [nums(layer.fx.mask.points).flatMap((value, index, all) => (index % 2 ? [] : (() => {
        const p = at(value, all[index + 1], layer);
        return [Math.round(p.x), Math.round(p.y)];
      })()))] } : { use: false, mode: "inside", polygons: [] },
    }));
  const file = `${sceneId}${base.bitmap.slice(base.bitmap.lastIndexOf(".")).toLowerCase()}`;
  return {
    scene: {
      _id: sceneId,
      name: record.name,
      width: size.width,
      height: size.height,
      padding: 0,
      backgroundColor: "#000000",
      grid: { size: gridW, type: image.grid === "on" ? (image.gridtype === "hexcolumn" ? 4 : image.gridtype === "hexrow" ? 2 : 1) : 0, distance: 5, units: "ft", color: "#000000", alpha: 0.2 },
      background: { src: file },
      walls,
      lights,
      tokens: [],
      notes: [],
    },
    // FG's grid offset, in scene pixels from the picture's corner.
    gridOffset: { x: ((size.width / 2 + offsetX) % gridW + gridW) % gridW, y: ((size.height / 2 - offsetY) % gridW + gridW) % gridW },
    file,
    bytes: picture.bytes,
    pins,
    fx,
    baseAt,
  };
}

// Every map of an FG module as a bundle (zip bytes) and Kraken's extras per scene id.
// A playable map: in FG's Maps (or Region map) category, or with a grid or walls.
// Handouts, portraits and book pictures stay in Images & Maps.
function isMap(record) {
  const category = String(record.data?.fgCategory ?? "");
  if (/^(maps|region map)$/i.test(category)) return true;
  const image = record.data?.image ?? {};
  if (image.grid === "on") return true;
  return list(image.layers?.layer).some((layer) => layer.occluders);
}

function fgModuleBundle(moduleName, { only, all = false } = {}) {
  const module = readModule(moduleName, { only: new Set(["image"]) });
  const files = {};
  const scenes = [];
  const extras = {};
  const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  for (const record of module.records.filter((item) => item.type === "image")) {
    if (only && !only.some((name) => String(record.name).toLowerCase().includes(String(name).toLowerCase()))) continue;
    if (!only && !all && !isMap(record)) continue;
    const id = `fg-${slug(moduleName).slice(0, 16)}-${slug(record.name)}`.slice(0, 70);
    const made = imageScene(record, moduleName, id);
    if (!made) continue;
    files[made.file] = new Uint8Array(made.bytes);
    scenes.push(made.scene);
    extras[id] = { pins: made.pins, fx: made.fx, gridOffset: made.gridOffset, walls: made.scene.walls.length, lights: made.scene.lights.length, frame: { image: String(record.data.fgPath ?? "").replace(/@.*$/, ""), module: moduleName, width: made.scene.width, height: made.scene.height } };
  }
  if (scenes.length === 0) throw new Error(`No maps in ${moduleName}.`);
  files["bundle.json"] = strToU8(JSON.stringify({ adventureData: { name: module.name ?? moduleName, scenes } }));
  return { bytes: zipSync(files, { level: 0 }), name: `${moduleName}.zip`, scenes: scenes.map((scene) => ({ id: scene._id, name: scene.name, walls: scene.walls.length, lights: scene.lights.length })), extras };
}

module.exports = { fgModuleBundle, pictureSize, imageScene };
