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
  };
}

function savedMap(value) {
  const tokens = {};
  const doors = {};
  const sight = {};
  const locked = {};
  if (!value || typeof value !== "object") return { tokens, doors, sight, locked };
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
  return { tokens, doors, sight, locked };
}

function createMapState({ saved, records, onChange = () => undefined, hasArt = () => false }) {
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
    };
    if (token.sourceId && hasArt(token.sourceId)) out.art = `/table/token?token=${assetToken}&id=${encodeURIComponent(token.sourceId)}`;
    return out;
  }

  function polygonFor(token) {
    const doors = doorsHere();
    const key = `${scene.id}|${token.x}|${token.y}`;
    let polygon = visionCache.get(key);
    if (!polygon) {
      const origin = { x: 0, y: 0 };
      const frame = geometry.gridOrigin(scene);
      const bounds = { x: origin.x, y: origin.y, width: scene.width + frame.x * 2, height: scene.height + frame.y * 2 };
      polygon = geometry.visibilityPolygon({ x: token.x, y: token.y }, scene.walls, doors, bounds);
      visionCache.set(key, polygon);
    }
    return polygon;
  }

  // What a seat is shown of the map now. The GM sees everything. A player
  // with tokens on a line-of-sight scene sees what those tokens see; a player
  // with none sees the whole map, as in FG.
  function viewFor(seat, assetToken) {
    if (!scene) return { sceneId: null, tokens: [], doors: [], vision: null, sight: false, locked: false };
    const locked = Boolean(state.locked[scene.id]);
    const doors = doorsHere();
    const all = tokensHere();
    const doorList = scene.walls
      .filter((wall) => wall.door > 0)
      .map((wall) => ({ id: wall.id, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, secret: wall.door === 2, state: wall.id in doors ? doors[wall.id] : wall.ds }));
    if (seat.role === "dm") {
      return { sceneId: scene.id, tokens: all.map((token) => publicToken(token, seat, assetToken)), doors: doorList, vision: null, sight: sightOn(), locked };
    }
    const shown = all.filter((token) => !token.hidden);
    const mine = shown.filter((token) => token.owner === seat.name);
    const vision = sightOn() && mine.length > 0 ? mine.map(polygonFor) : null;
    const slack = geometry.gridSize(scene) * 0.05;
    const tokens = shown.filter((token) => token.owner === seat.name || !vision || geometry.seen(token.x, token.y, vision, slack));
    const playerDoors = doorList.filter((door) => !door.secret && (!vision || geometry.seen((door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2, vision, slack)));
    return {
      sceneId: scene.id,
      tokens: tokens.map((token) => publicToken(token, seat, assetToken)),
      doors: playerDoors.map(({ secret, ...door }) => door),
      vision,
      sight: sightOn(),
      locked,
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
    // A new scene from the GM. Its Foundry tokens become table tokens the
    // first time it is shown; after that the table's own tokens are kept.
    setScene(next) {
      scene = next;
      visionCache.clear();
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
      if (pc) {
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
      if (seat.role !== "dm") throw new Error("Only the GM can change tokens.");
      const token = findToken(id);
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
    persisted: () => JSON.parse(JSON.stringify(state)),
  };
}

module.exports = { createMapState, playerColor, geometryReady, FACTION_COLOR };
