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

// A layer's scale and turn from its matrix (column-major 4x4).
function layerShape(layer) {
  const m = nums(layer?.matrix);
  if (m.length !== 16) return { sx: 1, sy: 1, rotation: 0 };
  const sx = Math.hypot(m[0], m[1]) || 1;
  const sy = Math.hypot(m[4], m[5]) || 1;
  // FG's y is up, the screen's down: a turn counter-clockwise in FG is clockwise here.
  const rotation = Math.round((-Math.atan2(m[1], m[0]) * 180) / Math.PI);
  return { sx, sy, rotation: ((rotation % 360) + 360) % 360 };
}

// FG's #AARRGGBB (or #RRGGBB) colour as #RRGGBB.
function fgColor(value, fallback) {
  const match = /^#(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(String(value ?? ""));
  return match ? `#${match[1].toUpperCase()}` : fallback;
}

// FG's text layer fonts (file names) as the label fonts Kraken has.
function fgFont(file) {
  const name = String(file ?? "").toLowerCase();
  if (name.includes("bebas")) return "Bebas Neue";
  if (name.includes("cinzel")) return "Cinzel";
  if (name.includes("signika")) return "Signika";
  if (name.includes("courier") || name.includes("mono")) return "Courier New";
  if (name.includes("georgia") || name.includes("serif")) return "Georgia";
  return "Bebas Neue";
}

const FX_MAP = { rain: "rain", snow: "snow", blizzard: "blizzard", myst: "fog", clouds: "clouds", water: "water", ocean: "water" };

// One FG image record as a scene for the bundle, and Kraken's extras for it.
function imageScene(record, moduleName, sceneId, label = moduleName) {
  const image = record.data?.image ?? {};
  const layers = list(image.layers?.layer);
  // FG Unity's layers; an older module's image is its bitmap alone (no layers).
  const base = layers.find((layer) => layer.type === "image" && layer.bitmap) ?? (image.bitmap ? { type: "image", bitmap: image.bitmap } : null);
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
      link: { kind: "fg", id: `${layer.shortcut.record}@${label}`, class: String(layer.shortcut.class ?? "") },
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
  // FG's folders: layer groups. A layer in a folder (its parentid) is in that group.
  const folders = new Map(layers.filter((layer) => layer.type === "folder").map((layer) => [String(layer.id), { name: String(layer.name ?? "Folder").slice(0, 40), shown: !layer.invisible }]));
  const groupOf = (layer) => folders.get(String(layer.parentid ?? ""))?.name ?? "";
  // The base picture's other image layers (seasons, overlays, a second map piece): image layers (tiles), in FG's order.
  const tiles = [];
  for (const layer of layers) {
    if (layer === base || layer.type !== "image" || typeof layer.bitmap !== "string" || !layer.bitmap) continue;
    const art = modulePicture(layer.bitmap, moduleName);
    const own = art ? pictureSize(art.bytes) : null;
    if (!own) continue;
    const shape = layerShape(layer);
    const shift = layerOffset(layer);
    const width = own.width * shape.sx;
    const height = own.height * shape.sy;
    const center = { x: size.width / 2 + shift.x, y: size.height / 2 - shift.y };
    tiles.push({
      name: String(layer.name ?? "").slice(0, 60),
      x: Math.round(center.x - width / 2),
      y: Math.round(center.y - height / 2),
      width: Math.round(width),
      height: Math.round(height),
      rotation: shape.rotation,
      // FG's hidden layer: the GM sees it faintly and can show it (a season, a revealed secret).
      hidden: Boolean(layer.invisible),
      group: groupOf(layer),
      file: layer.bitmap.slice(layer.bitmap.lastIndexOf("/") + 1),
      bytes: art.bytes,
    });
  }
  // FG's text layers: labels (a number is a numbered label of its group).
  const texts = [];
  for (const layer of layers.filter((item) => item.type === "text" && String(item.displayText ?? item.name ?? "").trim())) {
    const shift = layerOffset(layer);
    const words = String(layer.displayText ?? layer.name).slice(0, 200);
    const fontSize = Number(layer.fontsize);
    texts.push({
      x: Math.round(size.width / 2 + shift.x),
      y: Math.round(size.height / 2 - shift.y),
      text: words,
      font: fgFont(layer.fontname),
      // FG's font size is in squares, a little larger than Kraken's.
      size: Number.isFinite(fontSize) && fontSize > 0 ? Math.min(20, fontSize / 1.25) : 1,
      color: fgColor(layer.textColor, "#FFFFFF"),
      outline: { width: Math.min(10, Number(layer.strokeSize) * 4 || 0), color: fgColor(layer.strokeColor, "#000000") },
      rotation: layerShape(layer).rotation,
      hidden: Boolean(layer.invisible),
      group: groupOf(layer) || "Text",
      ...(/^\d+$/.test(words.trim()) ? { number: Number(words.trim()) } : {}),
    });
  }
  // Text is the players' to see (FG shares text layers); map keys and encounter pins stay the GM's.
  const groups = [...folders.values()].map((folder) => ({ ...folder, players: true }));
  if (texts.some((item) => item.group === "Text") && !groups.some((group) => group.name === "Text")) groups.push({ name: "Text", shown: true, players: true });
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
    tiles,
    texts,
    groups,
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
  // An older module's map: a grid size and no grid switch.
  if (image.grid !== "off" && Number(String(image.gridsize ?? "").split(",")[0]) > 0) return true;
  return list(image.layers?.layer).some((layer) => layer.occluders);
}

function fgModuleBundle(moduleName, { only, all = false } = {}) {
  const module = readModule(moduleName, { only: new Set(["image"]) });
  // The book's own name (moduleName may be its file, as the shelf resolves it): scene ids, pins and the adventure go by the name.
  const label = String(module.info?.name || moduleName);
  const files = {};
  const scenes = [];
  const extras = {};
  const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const images = module.records.filter((item) => item.type === "image");
  // A name asked for: that map exactly, when there is one by that name; else those whose names hold it.
  const exact = only ? images.filter((record) => only.some((name) => String(record.name).toLowerCase() === String(name).toLowerCase())) : [];
  for (const record of exact.length ? exact : images) {
    if (only && !exact.length && !only.some((name) => String(record.name).toLowerCase().includes(String(name).toLowerCase()))) continue;
    if (!only && !all && !isMap(record)) continue;
    const id = `fg-${slug(label).slice(0, 16)}-${slug(record.name)}`.slice(0, 70);
    const made = imageScene(record, moduleName, id, label);
    if (!made) continue;
    files[made.file] = new Uint8Array(made.bytes);
    scenes.push(made.scene);
    extras[id] = { pins: [...made.pins, ...made.texts], fx: made.fx, tiles: made.tiles, groups: made.groups, gridOffset: made.gridOffset, walls: made.scene.walls.length, lights: made.scene.lights.length, frame: { image: String(record.data.fgPath ?? "").replace(/@.*$/, ""), module: label, width: made.scene.width, height: made.scene.height } };
  }
  if (scenes.length === 0) throw new Error(`No maps in ${label}.`);
  files["bundle.json"] = strToU8(JSON.stringify({ adventureData: { name: label, scenes } }));
  return { bytes: zipSync(files, { level: 0 }), name: `${label}.zip`, scenes: scenes.map((scene) => ({ id: scene._id, name: scene.name, walls: scene.walls.length, lights: scene.lights.length })), extras };
}

// A map record's picture file (its base layer's, or an older module's bitmap).
function mapPicture(record) {
  const image = record?.data?.image ?? {};
  const layer = list(image.layers?.layer).find((item) => item.type === "image" && item.bitmap);
  return String(layer?.bitmap ?? image.bitmap ?? "");
}

module.exports = { fgModuleBundle, pictureSize, imageScene, isMap, mapPicture };
