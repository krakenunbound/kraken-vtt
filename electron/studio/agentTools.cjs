// kraken_map_studio: Map Studio, Kraken's map maker, for agents. Each action is
// done by the editor itself (studio/web/agent.js, run in the GM's Map Studio
// window, which opens if it is closed: the GM sees the map made in a tab of its
// own), through the same code as the editor's buttons and tools. What only the
// app can do is done here: pictures written to files (a render to look at, an
// export for a book: the picture and its walls), Save to Kraken into the hosted
// campaign's open image, projects read from files.
//
// Units are squares (x right, y down from the map's top-left corner); light
// radii are feet. skills/kraken-map-studio/SKILL.md is the guide.

const fs = require("fs");
const path = require("path");

const ACTIONS = ["library", "new", "generate", "floor", "paint", "scatter", "place", "wall", "door", "light", "ambient", "weather", "region", "update", "remove", "undo", "redo", "map", "check", "render", "save", "projects", "open", "tabs", "export", "kraken"];

const point = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "[x, y] in squares" };
const points = (description) => ({ type: "array", items: point, description });
const rect = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["x", "y", "width", "height"], additionalProperties: false, description: "A box in squares: x, y its top-left corner" };

const DESCRIPTION = [
  "Map Studio (Kraken's map maker) for agents: build a battle map with the editor's own tools and its art packs, in the GM's Map Studio window (it opens if closed; the work is in its active tab). Read skills/kraken-map-studio/SKILL.md first. Units: squares (x right, y down from the map's top-left corner; the centre of the square in column 3, row 4 is [3.5, 4.5]); light radii in feet. Needs a hosted campaign.",
  "Actions:",
  "library (search, kind (Floors, Ground, Walls, Doors & windows, Furniture, Lights, Plants, Terrain...), pack, shippedOnly: art with id, name, kind, pack, shipped (Kraken Map Art and Battle Map Forge are the only art for maps that ship publicly), squares (its size on the grid), wallArt, tiles);",
  "new (name, width, height in squares, grid px per square (default 100), background #rrggbb: a blank map in a new tab);",
  "generate (setting, seed, rooms 4-12, composition compact|sprawling, loops, deadEnds, roomFloor, corridorFloor (art), doorsOpen, stairs, grid: the dungeon generator, a new map with floors, walls and doors);",
  "floor (art: a floor or ground; rect, polygon or polygons (holes even-odd); feather in squares (soft edge that blends into what is under it); name; room true marks a room for check; layer, default map: tiled from the map's corner, so floors join without seams);",
  "paint (art, path, size in squares, softness 0-80: the Texture brush, soft-edged art along a stroke: worn paths, moss, scorch, blending);",
  "scatter (art, path, size, seed, spacing, scale [min, max], rotation [min, max]: the Scatter brush);",
  "place (art, at [x, y] centre, rotation degrees, scale (1 = its own size on the grid) or width/height in squares, opacity, layer (default objects), name, light (a light preset or light fields: a light on it); or items: [many of these]);",
  "wall (points, closed; art: wall art (the Wall tool: repeated along the path, joined at corners, end caps, baked into one picture, with its line-of-sight wall unless los false); without art: a line-of-sight wall of type wall, terrain, door, secret, window, invisible, illusion, pit, shadow);",
  "door (from, to: the ends of a gap in a wall line; kind door|secret|window; open, locked; art (default Door, wooden / Window; none for secret; false for none): the door's wall, any wall along the gap cut away, door art stamped across it);",
  "light (at, preset candle|lamp|torch|lantern|bullseye|spell|darkness|campfire|glow|custom, color, bright, dim (feet), strength, falloff, dimFalloff, animation flicker|pulse, speed, inverse, on; or items);",
  "ambient (preset night|dawn|sunlight|dusk|moonlight|custom|none, color, alpha, shadows, angle, length: time of day);",
  "weather (type rain|snow|blizzard|myst|clouds|water|ocean, settings (FG's: e.g. RainIntensity 0-1), areas: [{rect} | {polygon} | {hide: true, ...}] where it shows; none = the whole map);",
  "region (kind trap|pit|difficult, rect or points, name, note, cost);",
  "update (id, and at, size, scale, rotation, opacity, layer, name, hidden for art; light fields; type, points, open, locked for walls; settings for weather; name, note for regions);",
  "remove (ids); undo; redo;",
  "map (detail: the map read back: size, layers, art, walls, doors, lights, effects, regions, in squares); check (the skill's quality rules: doors on wall lines, lights on light-source art, rooms with props...);",
  "render (view picture (what Kraken shows) | editor (walls, grid, lighting preview) | play (the play test: token [x, y], light, vision, darkness 0-1); region (a box in squares to look at closely); scale; file (a .png path; default in Kraken's data); inline: also return the picture). Render at full size and LOOK at it;",
  "save (Map Studio's Save project); projects (saved projects); open (saved: a project id, or file: a .json or portable .kraken.zip); tabs;",
  "export (folder, name: the picture as name.webp, its walls, doors and lights as name.walls.json (the shape a Kraken book's map takes), the project as name.kraken.zip with its art);",
  "kraken (Save to Kraken: into open (default: the image open in Kraken's image window or on the table) or new (a new scene on the table from this map): its picture, walls, doors, windows, lights and weather).",
].join(" ");

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action"],
  properties: {
    action: { type: "string", enum: ACTIONS },
    art: { description: "Art id or name from library (with place: false for no art on a door)", type: ["string", "boolean"] },
    search: { type: "string" },
    kind: { type: "string", description: "library: kind of art; door: door, secret or window; region: trap, pit or difficult" },
    pack: { type: "string" },
    shippedOnly: { type: "boolean" },
    limit: { type: "number" },
    name: { type: "string" },
    width: { type: "number", description: "Squares" },
    height: { type: "number", description: "Squares" },
    grid: { description: "new, generate: pixels per square; render: draw the grid", type: ["number", "boolean"] },
    background: { type: "string" },
    setting: { type: "string" },
    seed: { type: ["string", "number"] },
    rooms: { type: "number" },
    composition: { type: "string", enum: ["compact", "sprawling"] },
    loops: { type: "number" },
    deadEnds: { type: "number" },
    roomFloor: { type: "string" },
    corridorFloor: { type: "string" },
    doorsOpen: { type: "boolean" },
    stairs: { type: "boolean" },
    rect,
    polygon: points("Outline corners"),
    polygons: { type: "array", items: points("An outline"), description: "Outlines, filled even-odd" },
    feather: { type: "number", description: "Squares of soft edge" },
    room: { type: "boolean" },
    layer: { type: "string" },
    path: points("A stroke"),
    size: { description: "paint, scatter: brush size in squares; update: [width, height] in squares", type: ["number", "array"] },
    softness: { type: "number" },
    spacing: { type: "number" },
    scale: { description: "place, update: size factor; scatter: [min, max]; render: picture scale", type: ["number", "array"] },
    rotation: { description: "Degrees; scatter: [min, max]", type: ["number", "array"] },
    at: point,
    opacity: { type: "number" },
    light: { description: "place: a light preset or light fields for a light on the art; render play: the token's light", type: ["string", "object"] },
    items: { type: "array", items: { type: "object" }, description: "place, light: many at once (each with the same fields)" },
    points: points("Corners"),
    closed: { type: "boolean" },
    los: { type: "boolean" },
    type: { type: "string", description: "wall: line-of-sight type; weather: rain, snow, blizzard, myst, clouds, water, ocean" },
    flags: { type: "array", items: { type: "string" } },
    from: point,
    to: point,
    open: { type: "boolean" },
    locked: { type: "boolean" },
    preset: { type: "string" },
    color: { type: "string" },
    bright: { type: "number", description: "Feet" },
    dim: { type: "number", description: "Feet" },
    strength: { type: "number" },
    falloff: { type: "number" },
    dimFalloff: { type: "number" },
    animation: { type: "string", enum: ["flicker", "pulse"] },
    speed: { type: "number" },
    inverse: { type: "boolean" },
    on: { type: "boolean" },
    alpha: { type: "number" },
    shadows: { type: "boolean" },
    angle: { type: "number" },
    length: { type: "number" },
    settings: { type: "object" },
    areas: { type: "array", items: { type: "object" } },
    note: { type: "string" },
    cost: { type: "number" },
    id: { type: "string" },
    ids: { type: "array", items: { type: "string" } },
    hidden: { type: "boolean" },
    detail: { type: "boolean" },
    view: { type: "string", enum: ["picture", "editor", "play"] },
    walls: { type: "boolean" },
    lighting: { type: "boolean" },
    token: point,
    vision: { type: "string" },
    darkness: { type: "number" },
    region: rect,
    file: { type: "string", description: "render: the .png to write; open: a .json or .kraken.zip project" },
    inline: { type: "boolean" },
    saved: { type: "string", description: "open: a saved project's id (projects)" },
    folder: { type: "string" },
    portable: { type: "boolean" },
    into: { type: "string", enum: ["open", "new"] },
  },
};

const dataUrl = (value) => {
  const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(value ?? ""));
  if (!match) throw new Error("Map Studio sent no picture.");
  return Buffer.from(match[2], "base64");
};
const slug = (text) => String(text || "map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "map";
const out = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const sharp = () => require("sharp");

// A picture cropped to a box of squares and scaled, as PNG.
async function framed(buffer, { region, scale, grid, width, height }) {
  let image = sharp()(buffer, { limitInputPixels: 300_000_000 });
  if (region) {
    const left = Math.max(0, Math.round(region.x * grid)), top = Math.max(0, Math.round(region.y * grid));
    const w = Math.min(width - left, Math.round(region.width * grid)), h = Math.min(height - top, Math.round(region.height * grid));
    if (w < 1 || h < 1) throw new Error("That region is outside the map.");
    image = image.extract({ left, top, width: w, height: h });
  }
  if (scale && Number(scale) !== 1) {
    const meta = await sharp()(await image.png().toBuffer()).metadata();
    image = sharp()(await image.png().toBuffer()).resize({ width: Math.max(1, Math.round(meta.width * Number(scale))) });
  }
  return image.png().toBuffer();
}

// A book's map walls (games/*/maps/*.walls.json, read by games/lib/fg.mjs imageRecord()):
// points in picture pixels; door: true for doors (secret: true for secret ones), window: true,
// closed: true for closed shapes. type keeps Map Studio's own kind; lights are kept too.
function bookWalls(project) {
  const walls = (project.walls ?? []).map((wall) => {
    const flags = new Set(wall.flags ?? []);
    return {
      points: wall.points.map((v) => Math.round(v * 10) / 10),
      ...(wall.type === "door" || wall.type === "secret" ? { door: true } : {}),
      ...(wall.type === "secret" ? { secret: true } : {}),
      ...(wall.type === "window" ? { window: true } : {}),
      ...(flags.has("closed") ? { closed: true } : {}),
      ...(wall.type !== "wall" ? { type: wall.type } : {}),
    };
  });
  const lights = (project.lights ?? []).map((l) => ({ x: Math.round(l.x), y: Math.round(l.y), bright: l.bright, dim: l.dim, color: l.color, ...(l.animation ? { animation: l.animation } : {}), ...(l.on === false ? { on: false } : {}) }));
  return { width: project.width, height: project.height, grid: project.grid, walls, lights };
}

async function run(args, ctx) {
  if (!ctx.studio?.page) throw new Error("Map Studio's tools run in the Kraken app.");
  if (!ctx.hosting?.()) throw new Error("Host a campaign first (kraken_host): Map Studio opens in the GM's window.");
  const action = String(args.action ?? "");
  if (!ACTIONS.includes(action)) throw new Error(`action is one of ${ACTIONS.join(", ")}.`);
  const { action: _drop, ...rest } = args;
  const page = (name, input = rest) => ctx.studio.page(name, input);

  if (action === "render") {
    const made = await page("render", rest);
    const map = await page("map", { detail: false });
    const png = await framed(dataUrl(made.image), { region: rest.region, scale: rest.scale, grid: map.grid, width: made.width, height: made.height });
    const file = rest.file ? path.resolve(String(rest.file)) : path.join(ctx.studio.folder(), `${slug(map.name)}-${rest.view ?? "picture"}-${Date.now()}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, png);
    const meta = await sharp()(png).metadata();
    const answer = { file, width: meta.width, height: meta.height, view: rest.view ?? "picture", ...(made.token ? { token: made.token } : {}) };
    if (!rest.inline) return out(answer);
    const small = meta.width > 1600 ? await sharp()(png).resize({ width: 1600 }).png().toBuffer() : png;
    return { content: [{ type: "text", text: JSON.stringify(answer) }, { type: "image", data: small.toString("base64"), mimeType: "image/png" }] };
  }
  if (action === "export") {
    if (!rest.folder) throw new Error("Give the folder to export into.");
    const { project, image } = await page("picture", {});
    const folder = path.resolve(String(rest.folder));
    const name = slug(rest.name || project.name);
    fs.mkdirSync(folder, { recursive: true });
    const picture = path.join(folder, `${name}.webp`);
    await sharp()(dataUrl(image), { limitInputPixels: 300_000_000 }).webp({ quality: 90 }).toFile(picture);
    const walls = path.join(folder, `${name}.walls.json`);
    fs.writeFileSync(walls, JSON.stringify(bookWalls(project)) + "\n");
    const files = { picture, walls };
    if (rest.portable !== false) {
      const studio = ctx.studio.assets();
      await studio.whenReady();
      files.project = path.join(folder, `${name}.kraken.zip`);
      fs.writeFileSync(files.project, await studio.portableProject(project));
    }
    const counts = bookWalls(project);
    return out({ ...files, width: project.width, height: project.height, grid: project.grid, walls: counts.walls.filter((w) => !w.door && !w.window).length, doors: counts.walls.filter((w) => w.door).length, lights: counts.lights.length });
  }
  if (action === "kraken") {
    const table = ctx.table();
    const { project, image } = await page("picture", {});
    if (rest.into === "new") {
      const file = path.join(ctx.studio.folder(), `${slug(rest.name || project.name)}.png`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, dataUrl(image));
      await ctx.ui({ kind: "open-adventure", name: path.basename(file), bytes: new Uint8Array(fs.readFileSync(file)) }, 60000);
      table.agent.map.updateSettings({ grid: { size: project.grid } }, table.agent.seat);
    }
    return out(await ctx.studio.saveOpen(project, image));
  }
  if (action === "open") {
    if (rest.saved) return out(await page("openSaved", { id: rest.saved }));
    if (!rest.file) throw new Error("Give saved (a project id from projects) or file (.json or .kraken.zip).");
    const file = path.resolve(String(rest.file));
    let project;
    if (/\.zip$/i.test(file)) {
      const studio = ctx.studio.assets();
      await studio.whenReady();
      project = await studio.importPortable(fs.readFileSync(file));
    } else project = JSON.parse(fs.readFileSync(file, "utf8"));
    return out(await page("open", { project: project.project ?? project }));
  }
  return out(await page(action));
}

module.exports = {
  tool: { name: "kraken_map_studio", description: DESCRIPTION, inputSchema, run },
  ACTIONS,
  bookWalls,
};
