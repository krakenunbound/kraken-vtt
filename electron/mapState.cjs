const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");

// The map side of the table, kept by the host: tokens on each scene, door
// states, and whether line of sight is on. Players are sent only what their
// tokens can see (FG with line of sight on): other tokens and doors outside
// their view stay on the host.

let geometry = null;
const geometryReady = import(pathToFileURL(path.join(__dirname, "..", "shared", "map", "geometry.mjs")).href).then((module) => {
  geometry = module;
  return module;
});

// FG's faction colours (ColorManager token faction defaults).
const FACTION_COLOR = { friend: "#56B33F", neutral: "#A6A6A6", foe: "#C23741", none: "#18A9D1" };
const FACTIONS = Object.keys(FACTION_COLOR);
const PLAYER_COLORS = ["#d2a15a", "#6cb6ff", "#e07a6a", "#81b90c", "#ca81ff", "#77e7e8", "#ffb347", "#f4f1ea"];
const MAX_TOKENS = 400;

function text(value, fallback) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const clean = raw.replace(/[\u0000-\u001f]/g, "").trim();
  return clean || fallback;
}

function num(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// A player's colour stays the same from session to session.
function playerColor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

function cleanToken(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: text(raw.id, "").slice(0, 40) || `t-${crypto.randomBytes(6).toString("hex")}`,
    recordId: raw.recordId ? text(raw.recordId, "").slice(0, 160) : null,
    sourceId: raw.sourceId ? text(raw.sourceId, "").slice(0, 80) : null,
    name: text(raw.name, "Token").slice(0, 48),
    x,
    y,
    squares: Math.min(10, Math.max(0.25, num(raw.squares, 1))),
    owner: text(raw.owner, "").slice(0, 24),
    faction: FACTIONS.includes(raw.faction) ? raw.faction : "none",
    hidden: Boolean(raw.hidden),
    // A carried light (feet; FG's LIGHT effect) and a sight range in the dark
    // (feet; null: from the character's senses).
    light: cleanCarried(raw.light),
    vision: raw.vision == null ? null : Math.min(1000, Math.max(0, num(raw.vision, 0))),
  };
}

function cleanCarried(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bright = Math.min(1000, Math.max(0, num(raw.bright, 0)));
  const dim = Math.min(1000, Math.max(bright, num(raw.dim, bright * 2)));
  if (dim <= 0) return null;
  return { name: text(raw.name, "Light").slice(0, 40), bright, dim, color: text(raw.color, "#FFF3E1").slice(0, 16) };
}

// A light on the scene (Foundry's ambient light), radii in scene units.
function cleanLight(raw) {
  if (!raw || typeof raw !== "object") return null;
  const x = num(raw.x, NaN);
  const y = num(raw.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const bright = Math.min(1000, Math.max(0, num(raw.bright, 0)));
  return {
    id: text(raw.id, "").slice(0, 80) || `l-${crypto.randomBytes(6).toString("hex")}`,
    x,
    y,
    bright,
    dim: Math.min(2000, Math.max(bright, num(raw.dim, bright))),
    color: text(raw.color, "#FFB347").slice(0, 16),
    on: raw.on !== false,
    hidden: Boolean(raw.hidden),
  };
}

const WEATHER = ["none", "rain", "storm", "snow", "blizzard", "fog", "clouds", "sandstorm", "embers", "ash", "leaves", "water"];

function cleanSettings(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const grid = value.grid && typeof value.grid === "object" ? value.grid : {};
  const weather = value.weather && typeof value.weather === "object" ? value.weather : {};
  return {
    darkness: value.darkness == null ? null : Math.min(1, Math.max(0, num(value.darkness, 0))),
    grid: {
      show: grid.show !== false,
      alpha: grid.alpha == null ? null : Math.min(1, Math.max(0, num(grid.alpha, 0.2))),
      color: grid.color == null ? null : text(grid.color, "#000000").slice(0, 16),
    },
    weather: {
      type: WEATHER.includes(weather.type) ? weather.type : "none",
      intensity: Math.min(1, Math.max(0, num(weather.intensity, 0.5))),
      direction: ((num(weather.direction, 250) % 360) + 360) % 360,
    },
  };
}

// A line drawn on a scene, for everyone: who drew it, its colour and width
// (scene pixels), and its points (x, y, x, y, ...).
function cleanDrawing(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.points)) return null;
  const points = raw.points.slice(0, 4000).map(Number);
  if (points.length < 4 || points.length % 2 || !points.every((value) => Number.isFinite(value) && Math.abs(value) < 1e7)) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(raw.color)) ? String(raw.color) : "#ffcc33";
  return { id: text(raw.id, "") || crypto.randomBytes(6).toString("hex"), by: text(raw.by, "").slice(0, 24), color, width: Math.min(80, Math.max(1, num(raw.width, 6))), points: points.map((value) => Math.round(value * 10) / 10) };
}

function savedMap(value) {
  const tokens = {};
  const doors = {};
  const sight = {};
  const locked = {};
  const settings = {};
  const lights = {};
  const drawings = {};
  if (!value || typeof value !== "object") return { tokens, doors, sight, locked, settings, lights, drawings };
  for (const [sceneId, list] of Object.entries(value.tokens ?? {}).slice(0, 500)) {
    if (!Array.isArray(list)) continue;
    tokens[sceneId.slice(0, 80)] = list.map(cleanToken).filter(Boolean).slice(0, MAX_TOKENS);
  }
  for (const [sceneId, row] of Object.entries(value.doors ?? {}).slice(0, 500)) {
    if (!row || typeof row !== "object") continue;
    doors[sceneId.slice(0, 80)] = Object.fromEntries(
      Object.entries(row)
        .filter(([, state]) => [0, 1, 2].includes(state))
        .slice(0, 2000),
    );
  }
  for (const [sceneId, on] of Object.entries(value.sight ?? {}).slice(0, 500)) sight[sceneId.slice(0, 80)] = Boolean(on);
  for (const [sceneId, on] of Object.entries(value.locked ?? {}).slice(0, 500)) locked[sceneId.slice(0, 80)] = Boolean(on);
  for (const [sceneId, row] of Object.entries(value.settings ?? {}).slice(0, 500)) settings[sceneId.slice(0, 80)] = cleanSettings(row);
  for (const [sceneId, list] of Object.entries(value.lights ?? {}).slice(0, 500)) {
    if (Array.isArray(list)) lights[sceneId.slice(0, 80)] = list.map(cleanLight).filter(Boolean).slice(0, 500);
  }
  for (const [sceneId, list] of Object.entries(value.drawings ?? {}).slice(0, 500)) {
    if (Array.isArray(list)) drawings[sceneId.slice(0, 80)] = list.map(cleanDrawing).filter(Boolean).slice(-MAX_DRAWINGS);
  }
  return { tokens, doors, sight, locked, settings, lights, drawings };
}
const MAX_DRAWINGS = 400;

// A light from CoreRPG's presets (squares), in feet at 5 ft a square, or the
// game's own light profiles by name (SiegeCore: radius r is bright r, dim 2r).
function presetLight(name, profiles = []) {
  const key = String(name).toLowerCase();
  if (key === "none" || key === "") return null;
  const profile = profiles.find((item) => String(item.name).toLowerCase() === key);
  if (profile) return cleanCarried({ name: profile.name, bright: profile.radius, dim: profile.radius * 2, color: geometry.LIGHT_PRESETS[key.split(/[ ,]/)[0]]?.color ?? "#FFB45C" });
  const preset = geometry.LIGHT_PRESETS[key];
  return preset ? cleanCarried({ name: preset.name, bright: preset.bright * 5, dim: preset.dim * 5, color: preset.color }) : null;
}

function createMapState({ saved, records, onChange = () => undefined, hasArt = () => false, hasPicture = () => false, combatFor = () => null, activeRecord = () => null }) {
  const state = savedMap(saved);
  let scene = null;
  const visionCache = new Map();

  function tokensHere() {
    if (!scene) return [];
    state.tokens[scene.id] = state.tokens[scene.id] ?? [];
    return state.tokens[scene.id];
  }

  function doorsHere() {
    if (!scene) return {};
    state.doors[scene.id] = state.doors[scene.id] ?? {};
    return state.doors[scene.id];
  }

  function settingsHere() {
    if (!scene) return cleanSettings({});
    state.settings[scene.id] = state.settings[scene.id] ?? cleanSettings({});
    return state.settings[scene.id];
  }

  // The darkness now: the GM's setting, else the scene's own (from Foundry).
  function darkness() {
    const set = settingsHere().darkness;
    return set == null ? (scene?.darkness ?? 0) : set;
  }

  function drawingsHere() {
    if (!scene) return [];
    state.drawings[scene.id] = state.drawings[scene.id] ?? [];
    return state.drawings[scene.id];
  }

  function lightsHere() {
    if (!scene) return [];
    state.lights[scene.id] = state.lights[scene.id] ?? [];
    return state.lights[scene.id];
  }

  // The game's light profiles (SiegeCore Game Settings: Torch 40, lanterns...).
  function lightProfiles() {
    const game = records.list({ type: "siegegame" })[0];
    return Object.values(game?.data?.lightprofiles ?? {}).filter((row) => row && typeof row === "object" && Number(row.radius) > 0);
  }

  function pixelsPerUnit() {
    return geometry.gridSize(scene) / units();
  }

  // How far a token sees in the dark, in feet: its own setting, else its
  // character's senses (C&C deepvision, darkvision, twilight vision).
  function visionRange(token) {
    if (token.vision != null) return token.vision;
    const record = token.recordId ? records.get(token.recordId) : null;
    return geometry.sensesRange(record?.data?.senses);
  }

  // Every light shining now: the scene's lights that are on, and the lights
  // tokens carry. Each with its reach (pixels) and its own line of sight.
  function lightSources() {
    const per = pixelsPerUnit();
    const out = [];
    const add = (id, x, y, bright, dim, color, hidden) => {
      const key = `L|${scene.id}|${Math.round(x)}|${Math.round(y)}`;
      let polygon = visionCache.get(key);
      if (!polygon) {
        polygon = geometry.sceneSight(scene, { x, y }, doorsHere());
        visionCache.set(key, polygon);
      }
      out.push({ id, x, y, brightPx: bright * per, dimPx: dim * per, color, hidden, polygon });
    };
    for (const light of lightsHere()) if (light.on && !light.hidden) add(light.id, light.x, light.y, light.bright, light.dim, light.color, light.hidden);
    for (const token of tokensHere()) if (token.light) add(`token:${token.id}`, token.x, token.y, token.light.bright, token.light.dim, token.light.color, token.hidden);
    return out;
  }

  function sightOn() {
    if (!scene) return false;
    if (scene.id in state.sight) return state.sight[scene.id];
    return scene.walls.some((wall) => geometry.blocksSight(wall, {}));
  }

  function changed() {
    visionCache.clear();
    onChange();
  }

  function units() {
    return scene && scene.grid.distance > 0 ? scene.grid.distance : 5;
  }

  // The centre of a square (col, row) for a token that many squares wide.
  function squareCenter(col, row, squares) {
    const size = geometry.gridSize(scene);
    const origin = geometry.gridOrigin(scene);
    return { x: origin.x + (col + squares / 2) * size, y: origin.y + (row + squares / 2) * size };
  }

  function squareOf(token) {
    const size = geometry.gridSize(scene);
    const origin = geometry.gridOrigin(scene);
    return { col: Math.round((token.x - origin.x) / size - token.squares / 2), row: Math.round((token.y - origin.y) / size - token.squares / 2) };
  }

  // A free square near x, y for a new token: the drop point, else the nearest
  // square no other token covers, spiralling out.
  function freeSpot(x, y, squares) {
    const size = geometry.gridSize(scene);
    const start = geometry.snapCenter(scene, x, y, squares);
    const taken = (point) => tokensHere().some((token) => Math.abs(token.x - point.x) < size / 2 && Math.abs(token.y - point.y) < size / 2);
    if (!taken(start)) return start;
    for (let ring = 1; ring < 12; ring += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const point = { x: start.x + dx * size, y: start.y + dy * size };
          if (!taken(point)) return point;
        }
      }
    }
    return start;
  }

  function sceneCenter() {
    const origin = geometry.gridOrigin(scene);
    return { x: origin.x + scene.width / 2, y: origin.y + scene.height / 2 };
  }

  function canMove(token, seat) {
    return seat.role === "dm" || (token.owner !== "" && token.owner === seat.name);
  }

  // Health for the token's dot, from its record (FG's token health dot).
  function health(token) {
    const tracked = combatFor(token.id);
    if (tracked) return tracked.health;
    if (!token.recordId) return null;
    const record = records.get(token.recordId);
    const hp = record?.data?.hp;
    if (!hp || !(Number(hp.total) > 0)) return null;
    return geometry.healthStatus(hp.total, hp.wounds);
  }

  function publicToken(token, seat, assetToken) {
    const out = {
      id: token.id,
      recordId: token.recordId,
      name: token.name,
      x: token.x,
      y: token.y,
      squares: token.squares,
      owner: token.owner,
      faction: token.faction,
      color: token.owner ? playerColor(token.owner) : FACTION_COLOR[token.faction],
      hidden: token.hidden,
      mine: seat.role === "player" && token.owner === seat.name,
      health: health(token),
      // Whose turn it is on the combat tracker.
      active: Boolean(combatFor(token.id)?.active) || (token.recordId != null && token.recordId === activeRecord()),
      light: token.light,
      vision: token.vision,
      seesFt: visionRange(token),
    };
    // A character's token picture, else its portrait (FG's token from the sheet).
    const data = token.recordId ? records.get(token.recordId)?.data : null;
    const picture = [data?.token, data?.portrait].find((id) => typeof id === "string" && hasPicture(id));
    if (picture) {
      out.art = `/art/file?token=${assetToken}&id=${encodeURIComponent(picture)}`;
      out.video = picture.toLowerCase().endsWith(".webm");
    } else if (token.sourceId && hasArt(token.sourceId)) out.art = `/table/token?token=${assetToken}&id=${encodeURIComponent(token.sourceId)}`;
    else if (token.recordId && (data?.token || data?.picture) && records.get(token.recordId)?.type !== "character") {
      // An NPC's own token picture, from its module.
      out.art = `/table/record-art?token=${assetToken}&record=${encodeURIComponent(token.recordId)}`;
    }
    return out;
  }

  function polygonFor(token) {
    const doors = doorsHere();
    const key = `${scene.id}|${token.x}|${token.y}|${token.squares}`;
    let polygon = visionCache.get(key);
    if (!polygon) {
      polygon = geometry.sceneSight(scene, { x: token.x, y: token.y }, doors, (token.squares * geometry.gridSize(scene)) / 2);
      visionCache.set(key, polygon);
    }
    return polygon;
  }

  // What a seat is shown of the map now. The GM sees everything. A player
  // with tokens on a line-of-sight scene sees what those tokens see; a player
  // with none sees the whole map, as in FG.
  function viewFor(seat, assetToken) {
    if (!scene) return { sceneId: null, tokens: [], doors: [], vision: null, sight: false, locked: false, darkness: 0, lights: [], seeing: [], settings: cleanSettings({}), sceneLights: [] };
    const locked = Boolean(state.locked[scene.id]);
    const settings = settingsHere();
    const dark = darkness();
    const sources = lightSources();
    const per = pixelsPerUnit();
    const doors = doorsHere();
    const all = tokensHere();
    const doorList = scene.walls
      .filter((wall) => wall.door > 0)
      .map((wall) => ({ id: wall.id, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, secret: wall.door === 2, state: wall.id in doors ? doors[wall.id] : wall.ds }));
    const shared = { sceneId: scene.id, sight: sightOn(), locked, darkness: dark, settings: { grid: settings.grid, weather: settings.weather, darkness: settings.darkness }, drawings: drawingsHere() };
    const lightOut = (list) => list.map(({ id, x, y, brightPx, dimPx, color, polygon }) => ({ id, x, y, brightPx, dimPx, color, polygon }));
    if (seat.role === "dm") {
      return {
        ...shared,
        tokens: all.map((token) => publicToken(token, seat, assetToken)),
        doors: doorList,
        vision: null,
        lights: lightOut(sources),
        seeing: [],
        sceneLights: lightsHere(),
      };
    }
    const shown = all.filter((token) => !token.hidden);
    const mine = shown.filter((token) => token.owner === seat.name);
    const vision = sightOn() && mine.length > 0 ? mine.map(polygonFor) : null;
    const slack = geometry.gridSize(scene) * 0.05;
    const shining = sources;
    // In the dark, a player sees only lit places and what their own tokens'
    // darkvision reaches (inside that token's line of sight).
    const seeing = mine
      .map((token, index) => ({ x: token.x, y: token.y, radiusPx: visionRange(token) * per, polygon: vision ? vision[index] : null }))
      .filter((item) => item.radiusPx > 0);
    // Twilight vision: a moonlit night is like dusk, and dim light is enough.
    const twilight = mine.some((token) => token.recordId && geometry.hasTwilightVision(records.get(token.recordId)?.data?.senses));
    const needsLight = mine.length > 0 && (twilight ? dark >= 1 : dark >= geometry.NEEDS_LIGHT);
    const visibleInDark = (x, y) =>
      !needsLight || geometry.lit(x, y, shining) || seeing.some((item) => Math.hypot(x - item.x, y - item.y) <= item.radiusPx && (!item.polygon || geometry.pointInPolygon(x, y, item.polygon)));
    const tokens = shown.filter((token) => token.owner === seat.name || ((!vision || geometry.seen(token.x, token.y, vision, slack)) && visibleInDark(token.x, token.y)));
    const playerDoors = doorList.filter((door) => !door.secret && (!vision || geometry.seen((door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2, vision, slack)));
    return {
      tokens: tokens.map((token) => publicToken(token, seat, assetToken)),
      ...shared,
      doors: playerDoors.map(({ secret, ...door }) => door),
      vision,
      lights: lightOut(shining),
      seeing,
      twilight,
      sceneLights: [],
    };
  }

  function findToken(id) {
    const token = tokensHere().find((item) => item.id === id);
    if (!token) throw new Error(`No token ${id} on this scene.`);
    return token;
  }

  return {
    ready: geometryReady,
    scene: () => scene,
    units,
    squareCenter,
    squareOf,
    // A new scene from the GM. Its Foundry tokens and lights become the
    // table's the first time it is shown; after that the table's own are kept.
    setScene(next) {
      scene = next;
      visionCache.clear();
      if (!state.lights[next.id]) {
        state.lights[next.id] = (next.lights ?? [])
          .map((light) => cleanLight({ id: light.id, x: light.x, y: light.y, bright: light.bright, dim: light.dim, color: light.color, on: !light.hidden }))
          .filter(Boolean);
      }
      if (!state.tokens[next.id]) {
        const size = geometry.gridSize(next);
        state.tokens[next.id] = next.tokens
          .map((token) =>
            cleanToken({
              id: `f-${token.id}`.slice(0, 40),
              sourceId: token.id,
              name: token.name,
              x: token.x + token.width / 2,
              y: token.y + token.height / 2,
              squares: token.width / size,
              faction: token.disposition === 1 ? "friend" : token.disposition === -1 ? "foe" : "neutral",
              hidden: token.hidden,
            }),
          )
          .filter(Boolean)
          .slice(0, MAX_TOKENS);
        onChange();
      }
    },
    tokens: () => tokensHere(),
    viewFor,
    sightOn,
    setSight(on) {
      if (!scene) throw new Error("No scene is open.");
      state.sight[scene.id] = Boolean(on);
      changed();
    },
    // FG's token lock: players cannot move their tokens until the GM unlocks.
    lockedNow: () => Boolean(scene && state.locked[scene.id]),
    setLocked(on) {
      if (!scene) throw new Error("No scene is open.");
      state.locked[scene.id] = Boolean(on);
      changed();
    },
    // Places a token. A player may place only a character they own, once.
    place(input, seat) {
      if (!scene) throw new Error("No scene is open.");
      const record = input.recordId ? records.get(input.recordId, seat) : null;
      if (input.recordId && !record) throw new Error("You cannot place that.");
      if (seat.role !== "dm" && (!record || record.owner !== seat.name)) throw new Error("You can place only your own character.");
      const pc = record && record.type === "character";
      if (pc && !input.allowSecond) {
        const existing = tokensHere().find((token) => token.recordId === record.id);
        if (existing) return existing;
      }
      if (tokensHere().length >= MAX_TOKENS) throw new Error("This scene has too many tokens.");
      const squares = Math.min(10, Math.max(0.25, num(input.squares, record ? geometry.tokenSquares(record.data?.space, units()) : 1)));
      let point;
      if (Number.isFinite(input.col) && Number.isFinite(input.row)) point = squareCenter(input.col, input.row, squares);
      else if (Number.isFinite(input.x) && Number.isFinite(input.y)) point = { x: input.x, y: input.y };
      else point = sceneCenter();
      point = freeSpot(point.x, point.y, squares);
      const token = cleanToken({
        recordId: record?.id ?? null,
        name: input.name || record?.name || "Token",
        x: point.x,
        y: point.y,
        squares,
        owner: pc ? record.owner : seat.role === "dm" ? text(input.owner, "") : seat.name,
        faction: input.faction ?? (pc ? "friend" : "foe"),
        hidden: seat.role === "dm" && Boolean(input.hidden),
      });
      tokensHere().push(token);
      changed();
      return token;
    },
    // Moves a token. Players are stopped by walls and closed doors on a
    // line-of-sight scene; the GM is not (as in FG).
    move(id, to, seat, { snap = true, collide } = {}) {
      if (!scene) throw new Error("No scene is open.");
      const token = findToken(id);
      if (!canMove(token, seat)) throw new Error("That is not your token.");
      if (seat.role !== "dm" && state.locked[scene.id]) throw new Error("The GM has locked token movement.");
      const blockByWalls = collide ?? (seat.role !== "dm" && sightOn());
      const result = geometry.settleMove(scene, scene.walls, doorsHere(), { x: token.x, y: token.y }, to, token.squares, { snap, collide: blockByWalls });
      token.x = result.x;
      token.y = result.y;
      changed();
      return { token, blocked: result.blocked };
    },
    update(id, patch, seat) {
      const token = findToken(id);
      // A player may light or put out a light on their own token, nothing else.
      if (seat.role !== "dm") {
        const keys = Object.keys(patch);
        if (!canMove(token, seat) || keys.some((key) => key !== "light")) throw new Error("Only the GM can change tokens.");
      }
      if (patch.light !== undefined) token.light = typeof patch.light === "string" ? presetLight(patch.light, lightProfiles()) : cleanCarried(patch.light);
      if (patch.vision !== undefined) token.vision = patch.vision == null ? null : Math.min(1000, Math.max(0, num(patch.vision, 0)));
      if (patch.name !== undefined) token.name = text(patch.name, token.name).slice(0, 48);
      if (patch.hidden !== undefined) token.hidden = Boolean(patch.hidden);
      if (patch.squares !== undefined) token.squares = Math.min(10, Math.max(0.25, num(patch.squares, token.squares)));
      if (patch.faction !== undefined && FACTIONS.includes(patch.faction)) token.faction = patch.faction;
      if (patch.owner !== undefined) token.owner = text(patch.owner, "").slice(0, 24);
      changed();
      return token;
    },
    remove(id, seat) {
      const list = tokensHere();
      const token = findToken(id);
      if (!canMove(token, seat)) throw new Error("That is not your token.");
      list.splice(list.indexOf(token), 1);
      changed();
      return token;
    },
    // Opens, closes or locks a door. Players may open and close doors they can
    // see; they cannot unlock a locked door or use a secret one.
    setDoor(wallId, wanted, seat) {
      if (!scene) throw new Error("No scene is open.");
      const wall = scene.walls.find((item) => item.id === wallId && item.door > 0);
      if (!wall) throw new Error(`No door ${wallId}.`);
      const doors = doorsHere();
      const current = wallId in doors ? doors[wallId] : wall.ds;
      const next = wanted === undefined ? (current === 1 ? 0 : 1) : wanted;
      if (![0, 1, 2].includes(next)) throw new Error("A door is open, closed or locked.");
      if (seat.role !== "dm") {
        if (wall.door === 2) throw new Error("You cannot see a door there.");
        if (current === 2) throw new Error("The door is locked.");
        if (next === 2) throw new Error("Only the GM can lock a door.");
        const view = viewFor(seat, "");
        if (!view.doors.some((door) => door.id === wallId)) throw new Error("You cannot see that door.");
      }
      doors[wallId] = next;
      changed();
      return next;
    },
    darkness,
    lightProfiles,
    settings: settingsHere,
    lights: lightsHere,
    // Scene settings: darkness, grid, weather (the GM's map settings).
    updateSettings(patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change the scene.");
      if (!scene) throw new Error("No scene is open.");
      const current = settingsHere();
      state.settings[scene.id] = cleanSettings({
        darkness: patch.darkness !== undefined ? patch.darkness : current.darkness,
        grid: { ...current.grid, ...(patch.grid ?? {}) },
        weather: { ...current.weather, ...(patch.weather ?? {}) },
      });
      changed();
      return state.settings[scene.id];
    },
    // Drawing on the map, for everyone: anyone draws; a player rubs out
    // their own lines, the GM anyone's, or clears them all.
    drawings: () => drawingsHere(),
    draw(input, seat) {
      if (!scene) throw new Error("No scene is open.");
      const line = cleanDrawing({ ...input, id: undefined, by: seat.role === "dm" ? "" : seat.name, color: input?.color ?? playerColor(seat.name) });
      if (!line) throw new Error("A line needs two points or more.");
      const list = drawingsHere();
      list.push(line);
      if (list.length > MAX_DRAWINGS) list.splice(0, list.length - MAX_DRAWINGS);
      changed();
      return line;
    },
    erase(id, seat) {
      const list = drawingsHere();
      const at = list.findIndex((line) => line.id === id);
      if (at < 0) throw new Error("That line is gone.");
      if (seat.role !== "dm" && list[at].by !== seat.name) throw new Error("You can only rub out your own lines.");
      list.splice(at, 1);
      changed();
    },
    clearDrawings(seat, who = null) {
      if (seat.role !== "dm") throw new Error("Only the GM can clear the drawings.");
      if (!scene) return;
      state.drawings[scene.id] = who === null ? [] : drawingsHere().filter((line) => line.by !== who);
      changed();
    },
    placeLight(input, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can place lights.");
      if (!scene) throw new Error("No scene is open.");
      const preset = typeof input.preset === "string" ? presetLight(input.preset) : null;
      const light = cleanLight({ color: "#FFB347", bright: 20, dim: 40, ...(preset ?? {}), ...input, id: undefined });
      if (!light) throw new Error("Where?");
      if (lightsHere().length >= 500) throw new Error("This scene has too many lights.");
      lightsHere().push(light);
      changed();
      return light;
    },
    updateLight(id, patch, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can change lights.");
      const list = lightsHere();
      const index = list.findIndex((light) => light.id === id);
      if (index < 0) throw new Error(`No light ${id}.`);
      list[index] = cleanLight({ ...list[index], ...patch, id });
      changed();
      return list[index];
    },
    removeLight(id, seat) {
      if (seat.role !== "dm") throw new Error("Only the GM can remove lights.");
      const list = lightsHere();
      const index = list.findIndex((light) => light.id === id);
      if (index < 0) throw new Error(`No light ${id}.`);
      list.splice(index, 1);
      changed();
    },
    persisted: () => JSON.parse(JSON.stringify(state)),
  };
}

module.exports = { createMapState, playerColor, geometryReady, FACTION_COLOR };
