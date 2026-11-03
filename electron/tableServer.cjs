const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { WebSocketServer } = require("ws");
const { createRecordStore, canSee } = require("./records.cjs");
const { soundFor, cleanTriggers } = require("./soundTriggers.cjs");
const { defaultTriggers, TRIGGERS_VERSION } = require("./soundCatalog.cjs");
const { createDice } = require("./dice.cjs");
const { siege, siegeLibrary, siegeCheck, levelUp } = require("./siege.cjs");
const { createMapState, playerColor } = require("./mapState.cjs");
const party = require("./party.cjs");
const { createCombat } = require("./combat.cjs");
const { modulePicture } = require("./importers/fgModule.cjs");
const { fitsRuleset } = require("./books.cjs");

const MAX_CLIENTS = 16;

function eachAddress() {
  const v4 = [];
  const v6 = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      const family = entry.family;
      if (family === "IPv4" || family === 4) v4.push(entry.address);
      if (family === "IPv6" || family === 6) v6.push(String(entry.address).split("%")[0]);
    }
  }
  return { v4, v6 };
}

function lanAddresses() {
  return eachAddress().v4;
}

function isLoopback(address) {
  const raw = String(address || "").toLowerCase();
  const ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return ip === "127.0.0.1" || ip === "::1";
}

function decideRole(remoteAddress, hostToken, offeredToken, dmAlreadySeated) {
  if (dmAlreadySeated) return "player";
  if (typeof offeredToken !== "string" || offeredToken.length === 0 || offeredToken !== hostToken) return "player";
  if (!isLoopback(remoteAddress)) return "player";
  return "dm";
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function text(value, fallback) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const clean = raw.replace(/[\u0000-\u001f]/g, "").trim();
  return clean || fallback;
}

function num(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeScene(input) {
  if (!input || typeof input !== "object") return null;
  const width = num(input.width, 0);
  const height = num(input.height, 0);
  if (width <= 0 || height <= 0 || width > 100000 || height > 100000) return null;
  const grid = input.grid && typeof input.grid === "object" ? input.grid : {};
  const lights = [];
  for (const [index, light] of (Array.isArray(input.lights) ? input.lights : []).entries()) {
    // Foundry's hidden lights are switched off; the GM can turn them on.
    if (!light || typeof light !== "object") continue;
    if (lights.length >= 500) break;
    lights.push({
      id: text(light.id, `light-${index}`).slice(0, 80),
      x: num(light.x, 0),
      y: num(light.y, 0),
      brightPx: Math.max(0, num(light.brightPx, 0)),
      dimPx: Math.max(0, num(light.dimPx, 0)),
      bright: num(light.bright, 0),
      dim: num(light.dim, 0),
      units: text(light.units, "ft").slice(0, 12),
      color: text(light.color, "#ffb347").slice(0, 32),
      hidden: Boolean(light.hidden),
    });
  }
  const tokens = [];
  for (const [index, token] of (Array.isArray(input.tokens) ? input.tokens : []).entries()) {
    if (!token || typeof token !== "object") continue;
    if (tokens.length >= 300) break;
    tokens.push({
      id: text(token.id, `token-${index}`).slice(0, 80),
      name: text(token.name, "Creature").slice(0, 48),
      x: num(token.x, 0),
      y: num(token.y, 0),
      width: Math.max(1, num(token.width, 100)),
      height: Math.max(1, num(token.height, 100)),
      disposition: num(token.disposition, 0),
      hidden: Boolean(token.hidden) || Number(token.disposition) === -2,
    });
  }
  // Walls stay on the host: players are sent what they can see, never the walls.
  const walls = [];
  for (const [index, wall] of (Array.isArray(input.walls) ? input.walls : []).entries()) {
    if (!wall || typeof wall !== "object") continue;
    if (walls.length >= 5000) break;
    const coords = [wall.x1, wall.y1, wall.x2, wall.y2].map((value) => num(value, NaN));
    if (coords.some((value) => !Number.isFinite(value))) continue;
    walls.push({
      id: text(wall.id, `wall-${index}`).slice(0, 80),
      x1: coords[0],
      y1: coords[1],
      x2: coords[2],
      y2: coords[3],
      sight: num(wall.sight, 20),
      move: num(wall.move, 20),
      door: num(wall.door, 0),
      ds: num(wall.ds, 0),
      dir: num(wall.dir, 0),
      light: num(wall.light, 20),
      threshold: num(wall.threshold, 0) > 0 ? num(wall.threshold, 0) : null,
    });
  }
  return {
    id: text(input.id, "scene").slice(0, 80),
    name: text(input.name, "Scene").slice(0, 80),
    width,
    height,
    padding: Math.min(2, Math.max(0, num(input.padding, 0))),
    backgroundColor: text(input.backgroundColor, "#000000").slice(0, 32),
    grid: {
      size: Math.max(1, num(grid.size, 100)),
      type: num(grid.type, 1),
      color: text(grid.color, "#000000").slice(0, 20),
      alpha: Math.min(1, Math.max(0, num(grid.alpha, 0.2))),
      distance: Math.max(0, num(grid.distance, 5)),
      units: text(grid.units, "ft").slice(0, 12),
    },
    offsetX: num(input.offsetX, 0),
    offsetY: num(input.offsetY, 0),
    scaleX: num(input.scaleX, 1) || 1,
    scaleY: num(input.scaleY, 1) || 1,
    anchorX: Math.min(1, Math.max(0, num(input.anchorX, 0))),
    anchorY: Math.min(1, Math.max(0, num(input.anchorY, 0))),
    fit: ["fill", "contain", "cover", "width", "height"].includes(input.fit) ? input.fit : "fill",
    lights,
    tokens,
    walls,
    darkness: Math.min(1, Math.max(0, num(input.darkness, 0))),
  };
}

// How a seat's dice leave its hand (fractions of its window, and per second)
// and how its dice look, for the 3D dice every screen throws.
const DICE_THEMES = new Set(["classic", "dragonhide", "starfall", "bone", "magma", "leviathan", "marble", "swirl", "speckle", "wood", "runes", "stripes"]);
const DICE_MATERIALS = new Set(["plastic", "glass", "metal", "pearl", "stone", "wood"]);
const DICE_EFFECTS = new Set(["none", "sparkles", "fire", "frost", "arcane", "shadow", "glow"]);
const DICE_FONTS = new Set(["classic", "bold", "runic", "script"]);
function diceThrow(value) {
  if (!value || typeof value !== "object") return null;
  const n = (key, low, high) => Math.min(high, Math.max(low, Number(value[key])));
  const out = { x: n("x", 0, 1), y: n("y", 0, 1), vx: n("vx", -8, 8), vy: n("vy", -8, 8) };
  return Object.values(out).every(Number.isFinite) ? out : null;
}
function diceLook(value) {
  if (!value || typeof value !== "object") return null;
  const color = (item) => (typeof item === "string" && /^#[0-9a-f]{3,8}$/i.test(item) ? item : null);
  const body = color(value.body);
  const ink = color(value.ink);
  if (!body || !ink || !DICE_THEMES.has(value.theme)) return null;
  // The rest is optional: what is missing or unknown is left out (the dice use their defaults).
  const look = { theme: value.theme, body, ink };
  const accent = color(value.accent);
  if (accent) look.accent = accent;
  if (DICE_MATERIALS.has(value.material)) look.material = value.material;
  if (DICE_EFFECTS.has(value.effect)) look.effect = value.effect;
  if (DICE_FONTS.has(value.font)) look.font = value.font;
  if (typeof value.crit === "boolean") look.crit = value.crit;
  return look;
}

// The table's own options. towerReveal: a roll in the dice tower is shown to
// whoever rolled it too (FG shows it to the GM only). decal: the picture on
// the table's background, as FG's Background Decal: "kraken" (the emblem),
// "" (none) or a decal id (decals.cjs). wallpaper: the tiles behind the
// desktop, as FG's desktop theme: "" (plain) or a wallpaper id.
// The GM's chat picture (the Kraken GM Icon extension's): "" for the name alone.
const GM_ICON = "kraken/01 The Kraken.png";

function savedOptions(value) {
  const options = value && typeof value === "object" ? value : {};
  const id = (text, fallback) => (typeof text === "string" && text.length <= 400 ? text : fallback);
  return {
    towerReveal: Boolean(options.towerReveal),
    decal: id(options.decal, "kraken"),
    wallpaper: id(options.wallpaper, ""),
    gmIcon: id(options.gmIcon, GM_ICON),
    // Sounds for the GM's hidden rolls, as Kraken's Syrinscape extension:
    // "off" none, "combat" attacks, damage, healing and initiative only, "all".
    soundHidden: ["off", "combat", "all"].includes(options.soundHidden) ? options.soundHidden : "combat",
    // The same sound again only after this many seconds.
    soundRepeat: Math.min(30, Math.max(0, Number.isFinite(Number(options.soundRepeat)) ? Number(options.soundRepeat) : 1)),
  };
}

// What a chat line is (FG's and Foundry's chat commands): said, an emote
// (/emote, /me), an action (/action), out of character (/ooc), the GM's story
// text (/story), a line with a mood (/mood); a whisper has `to`.
const CHAT_KINDS = new Set(["say", "emote", "action", "ooc", "story", "mood"]);

function savedChat(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line) => line && typeof line === "object" && typeof line.text === "string")
    .slice(-100)
    .map((line) => ({
      id: text(line.id, "").slice(0, 32),
      from: text(line.from, "Player").slice(0, 24),
      text: text(line.text, "").slice(0, 500),
      at: num(line.at, 0),
      ...(line.roll && typeof line.roll === "object" ? { roll: line.roll } : {}),
      ...(line.secret ? { secret: true } : {}),
      ...(typeof line.shownTo === "string" ? { shownTo: line.shownTo.slice(0, 24) } : {}),
      ...(line.gm ? { gm: true } : {}),
      ...(CHAT_KINDS.has(line.kind) ? { kind: line.kind } : {}),
      ...(Array.isArray(line.to) ? { to: line.to.filter((name) => typeof name === "string").slice(0, 12) } : {}),
      ...(line.self ? { self: true } : {}),
      ...(typeof line.mood === "string" ? { mood: line.mood.slice(0, 24) } : {}),
      ...(line.vote && typeof line.vote === "object" ? { vote: line.vote } : {}),
      ...(line.secret ? { secret: true } : {}),
    }))
    .filter((line) => line.text || line.roll);
}

// saved: { chat, map, records, dice } from an earlier session. map holds each
// scene's tokens and doors (mapState.cjs).
// onChange(kind) fires whenever something to save changes: kind is "records"
// for record changes and "table" for chat, the map and dice.
// The web client players open in a browser: the built app (dist/).
const WEB_ROOT = path.join(__dirname, "..", "dist");
const WEB_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveWeb(url, res, root) {
  const wanted = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(root, wanted));
  if (!file.startsWith(root + path.sep) && file !== path.join(root, "index.html")) return false;
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return false;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": WEB_TYPES[ext] ?? "application/octet-stream",
    "Content-Length": bytes.length,
    // Built assets carry a content hash in their names; the page itself does not.
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(bytes);
  return true;
}

// art: the GM's portraits and tokens (artLibrary.cjs), served to the table.
// decals, wallpapers: the background decals and desktop tiles the GM can
// choose from (decals.cjs).
// sounds: the GM's sounds (sounds.cjs): one-shots, effects, ambience and music.
function createTableServer({ saved = {}, onChange = () => undefined, webRoot = WEB_ROOT, art = null, decals = null, wallpapers = null, gmIcons = null, sounds = null, books = null, ruleset = "" } = {}) {
  let password = "";
  let hostToken = "";
  let image = null;
  let imageVersion = 0;
  let scene = null;
  const clients = new Map();
  const tokenArt = new Map();
  const chat = savedChat(saved.chat);
  // Books (FG's Library): the modules that fit the campaign's ruleset; those
  // the GM has made active for this campaign (FG's Activation); of those, the
  // ones the players may read (shared); and the pictures and maps shown to
  // them (FG's shared images, a tab each).
  const ids = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === "string").slice(0, 300) : []);
  const shelf = {
    active: new Set(ids(saved.books?.active)),
    shared: new Set(ids(saved.books?.shared)),
    images: Array.isArray(saved.books?.images)
      ? saved.books.images.filter((item) => item && typeof item.book === "string" && typeof item.file === "string").slice(-40).map((item) => ({ id: text(item.id, "").slice(0, 40), book: item.book, file: item.file, name: text(item.name, "Picture").slice(0, 120), at: num(item.at, 0) }))
      : [],
  };
  const shelfView = () => ({ active: [...shelf.active], shared: [...shelf.shared].filter((id) => shelf.active.has(id)), images: shelf.images });
  const fits = (info) => Boolean(info) && fitsRuleset(info, ruleset);
  const canRead = (client, book) => (client.role === "dm" ? fits(books?.info(book)) : shelf.active.has(book) && shelf.shared.has(book));
  // A seat's shelf: the GM's, every module that fits (with whether it is
  // active and shared); a player's, the active books shared with them.
  const shelfFor = (client) =>
    (books ? books.list() : [])
      .filter((item) => fits(item) && (client.role === "dm" || canRead(client, item.id)))
      .map((item) => ({ ...item, active: shelf.active.has(item.id), shared: shelf.active.has(item.id) && shelf.shared.has(item.id) }));
  const canSeePicture = (client, book, file) => canRead(client, book) || shelf.images.some((item) => item.book === book && item.file === file);
  // When each seat last cleared its chat (/clear), by name (the GM's as "@gm"):
  // its screen shows only newer lines, also after a restart. The table's own
  // record (the agent's chat log) keeps them.
  const chatCleared = new Map(Object.entries(saved.chatCleared && typeof saved.chatCleared === "object" ? saved.chatCleared : {}).filter(([, at]) => Number.isFinite(at)));
  const clearKey = (client) => (client.role === "dm" ? "@gm" : client.name);
  let options = savedOptions(saved.options);
  // The chat's sound triggers, and what plays under the game (ambience loops
  // and music), for every seat; saved with the campaign.
  let soundTriggers = (saved.soundTriggersVersion === TRIGGERS_VERSION && cleanTriggers(saved.soundTriggers)) || defaultTriggers();
  const cleanScape = (value) => {
    const scape = value && typeof value === "object" ? value : {};
    const level = (item) => Math.min(1, Math.max(0, Number(item?.volume ?? 1)));
    return {
      ambience: (Array.isArray(scape.ambience) ? scape.ambience : []).filter((item) => typeof item?.id === "string").slice(0, 8).map((item) => ({ id: item.id.slice(0, 300), volume: level(item) })),
      music: scape.music && typeof scape.music.id === "string" ? { id: scape.music.id.slice(0, 300), volume: level(scape.music), loop: scape.music.loop !== false, group: typeof scape.music.group === "string" ? scape.music.group.slice(0, 300) : null } : null,
    };
  };
  let soundscape = cleanScape(saved.sound);
  // When each folder last played (the same sound again only after a pause).
  const lastSound = new Map();
  function setSoundscape(next) {
    soundscape = cleanScape(next);
    broadcast({ type: "soundscape", soundscape });
    onChange("table");
    return soundscape;
  }
  function setOptions(patch) {
    const next = patch && typeof patch === "object" ? patch : {};
    if (next.decal !== undefined && !(next.decal === "" || next.decal === "kraken" || (decals && decals.has(String(next.decal))))) throw new Error(`No decal "${next.decal}".`);
    if (next.wallpaper !== undefined && !(next.wallpaper === "" || (wallpapers && wallpapers.has(String(next.wallpaper))))) throw new Error(`No wallpaper "${next.wallpaper}".`);
    if (next.gmIcon !== undefined && !(next.gmIcon === "" || (gmIcons && gmIcons.has(String(next.gmIcon))))) throw new Error(`No GM icon "${next.gmIcon}".`);
    options = savedOptions({ ...options, ...next });
    broadcast({ type: "options", options });
    onChange("table");
    return options;
  }
  // The seat whose request is being handled now (and when).
  let asking = null;
  const records = createRecordStore({ saved: saved.records, onChange: () => onChange("records") });
  const dice = createDice(saved.dice);
  const map = createMapState({
    saved: saved.map,
    records,
    onChange: () => {
      onChange("table");
      sendMaps();
    },
    hasArt: (id) => tokenArt.has(id),
    hasPicture: (id) => Boolean(art && art.has(id)),
    // An NPC token's health and the active turn come from the tracker.
    combatFor: (tokenId) => {
      const entry = combat.entries().find((item) => item.tokenId === tokenId);
      return entry ? { health: combat.health(entry), active: combat.active() === entry.id } : null;
    },
    activeRecord: () => combat.entries().find((item) => item.id === combat.active())?.recordId ?? null,
  });

  // The combat tracker: each seat is sent its own view (combat.cjs viewFor).
  const combat = createCombat({
    saved: saved.combat,
    table: () => agentHandle,
    onChange: () => {
      onChange("table");
      sendCombat();
      sendMaps();
    },
  });
  let combatPending = false;
  function sendCombat() {
    if (combatPending) return;
    combatPending = true;
    setImmediate(() => {
      combatPending = false;
      for (const [ws, client] of clients) send(ws, { type: "combat", combat: combat.viewFor(seatOf(client)) });
    });
  }

  // The party sheet summary goes to everyone when the party or a member changes.
  let partyPending = false;
  function sendParty() {
    if (partyPending) return;
    partyPending = true;
    setTimeout(() => {
      partyPending = false;
      party
        .partyView(agentHandle)
        .then((view) => broadcast({ type: "party", party: view }))
        .catch((error) => console.error("party view", error));
    }, 30);
  }

  // Each seat is sent its own view of the map (mapState viewFor), once per
  // burst of changes.
  let mapsPending = false;
  function sendMaps() {
    if (mapsPending) return;
    mapsPending = true;
    setImmediate(() => {
      mapsPending = false;
      for (const [ws, client] of clients) send(ws, { type: "map", ...map.viewFor(seatOf(client), client.assetToken) });
    });
  }

  function seatOf(client) {
    return { role: client.role, name: client.name };
  }

  // A secret line (FG's GM-only message: a hidden creature's turn) reaches the
  // GM, and the one seat it is shown to (shownTo).
  const sameName = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
  const seesLine = (client, line) => {
    // A self roll (Foundry's /selfroll) is the roller's alone.
    if (line.self) return client.id === line.id;
    // A whisper: who sent it, who it is to, and the GM (as FG's GM sees every whisper).
    if (line.to) return client.role === "dm" || client.id === line.id || line.to.some((name) => sameName(name, client.name) || (client.role === "dm" && /^(gm|dm)$/i.test(name)));
    return !line.secret || client.role === "dm" || (line.shownTo && line.shownTo === client.name);
  };

  function addChat(entry) {
    // A roll goes out with the throw its roller just made, for the 3D dice.
    // (A tracker's roll is the agent's: it is thrown by the seat that just asked for it.)
    if (entry.roll) {
      const roller = [...clients.values()].find((client) => client.id === entry.id) ?? (asking && Date.now() - asking.at < 1500 ? asking.client : null);
      const hand = roller?.hand;
      if (hand && Date.now() - hand.at < 4000) {
        if (hand.throw) entry.roll.throw = hand.throw;
        if (hand.look) entry.roll.look = hand.look;
      } else if (hand?.look) entry.roll.look = hand.look;
    }
    // A trigger's sound goes with the line: every seat that sees it hears it (as its result shows).
    if (sounds && !entry.sound) {
      const found = soundFor(entry, soundTriggers, sounds);
      const hidden = entry.secret || entry.self;
      const combatLine = /^\[(ATTACK|DAMAGE|HEAL|INIT)\]/.test(String(entry.roll?.label ?? ""));
      const allowed = !hidden || options.soundHidden === "all" || (options.soundHidden === "combat" && combatLine);
      const folder = found ? found.id.split("/").slice(0, -1).join("/") : "";
      const again = found && Date.now() - (lastSound.get(folder) ?? 0) < options.soundRepeat * 1000;
      if (found && allowed && !again) {
        entry.sound = found.id;
        lastSound.set(folder, Date.now());
      }
    }
    // What the GM's seat (or the GM's agent) says carries the GM's chat picture.
    const speaker = [...clients.values()].find((client) => client.id === entry.id);
    if (speaker?.role === "dm" || (entry.id === "agent" && ["Agent", "GM", "DM"].includes(entry.from))) entry.gm = true;
    chat.push(entry);
    if (chat.length > 100) chat.shift();
    for (const [ws, client] of clients) if (seesLine(client, entry)) send(ws, { type: "chat", ...entry });
    onChange("table");
    return entry;
  }

  function shelfChanged() {
    broadcast({ type: "books", ...shelfView() });
    onChange("table");
  }
  function bookFor(book) {
    const info = books?.info(book);
    if (!info) throw new Error(`No book "${book}".`);
    if (!fits(info)) throw new Error(`${info.title} is for ${info.ruleset || "another game"}, not this campaign's ${ruleset}.`);
    return info;
  }
  // Active for this campaign (FG's Activation). A book the players may read
  // starts shared with them; the GM's books (monsters, guides, adventures) not.
  function activateBook(book, on = true) {
    const info = bookFor(book);
    if (on && !shelf.active.has(info.id)) {
      shelf.active.add(info.id);
      if (info.forPlayers) shelf.shared.add(info.id);
    } else if (!on) {
      shelf.active.delete(info.id);
      shelf.shared.delete(info.id);
    }
    shelfChanged();
    return shelfView();
  }
  // The players may read it, or not (it is made active too). Never an
  // adventure: the players see its pictures and maps, as the GM shows them.
  function shareBook(book, on = true) {
    const info = bookFor(book);
    if (on && info.adventure) throw new Error(`${info.title} is an adventure, the GM's alone. Show the players its pictures and maps instead.`);
    if (on && !info.hasBook) throw new Error(`${info.title} has no book to read.`);
    if (on) {
      shelf.active.add(info.id);
      shelf.shared.add(info.id);
    } else shelf.shared.delete(info.id);
    shelfChanged();
    return shelfView();
  }
  function showImage(book, file, name) {
    if (!books?.picture(book, file)) throw new Error("There is no such picture in that book.");
    const existing = shelf.images.find((item) => item.book === book && item.file === file);
    const shown = existing ?? { id: crypto.randomBytes(6).toString("hex"), book, file: String(file), name: text(name, "Picture").slice(0, 120), at: Date.now() };
    if (!existing) shelf.images = [...shelf.images, shown].slice(-40);
    shelfChanged();
    broadcast({ type: "image-shown", id: shown.id });
    return shown;
  }
  function hideImage(id) {
    shelf.images = id === "all" ? [] : shelf.images.filter((item) => item.id !== id);
    shelfChanged();
    return shelfView();
  }

  function chatFor(client) {
    const since = chatCleared.get(clearKey(client)) ?? 0;
    return chat.filter((line) => (line.at ?? 0) > since && seesLine(client, line));
  }

  // label: what the roll is for ("Strength check"). from: who rolled.
  // tag: the asker's own marker (a wizard waiting for its roll), echoed back.
  // extra: what an action adds to its roll card (an attack's HIT or MISS, its target).
  // secret: the GM's only, or shown to that one seat too (a name).
  function rollDice(formula, label, from, id, tag, secret = false, extra = null) {
    const result = dice.roll(formula);
    const roll = { ...result, label: text(label, "").slice(0, 160), ...(tag ? { tag: text(tag, "").slice(0, 80) } : {}), ...(extra ?? {}) };
    addChat({ id, from, text: "", roll, at: Date.now(), ...(secret ? { secret: true } : {}), ...(typeof secret === "string" ? { shownTo: secret } : {}) });
    return roll;
  }

  // Each seat hears only about records it may see. A record that stops being
  // visible to a seat is removed from that seat.
  records.subscribe(({ kind, record, before }) => {
    for (const [ws, client] of clients) {
      const seat = seatOf(client);
      const sees = kind === "upsert" && canSee(record, seat);
      if (sees) send(ws, { type: "record", record });
      else if ((before && canSee(before, seat)) || kind === "delete") send(ws, { type: "record-gone", id: record.id });
    }
    // A token's health dot follows its record.
    if (map.tokens().some((token) => token.recordId === record.id)) sendMaps();
    if (record.id === party.PARTY_ID || record.type === "character") sendParty();
    if (combat.entries().some((entry) => entry.recordId === record.id)) sendCombat();
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/table/image") {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      if (!allowed || !image) {
        res.writeHead(404, { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": image.mime,
        "Content-Length": image.bytes.length,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(image.bytes);
      return;
    }
    // The art library: a list for the pickers, and the files themselves.
    if (req.method === "GET" && (url.pathname === "/art/list" || url.pathname === "/art/file")) {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      if (!allowed || !art) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      if (url.pathname === "/art/list") {
        const kind = url.searchParams.get("kind");
        const body = JSON.stringify(art.list(kind === "portrait" || kind === "token" ? kind : undefined));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(body);
        return;
      }
      const found = art.file(url.searchParams.get("id") || "");
      if (!found) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      fs.stat(found.path, (error, stat) => {
        if (error) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": found.mime, "Content-Length": stat.size, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
        fs.createReadStream(found.path).pipe(res);
      });
      return;
    }
    // Books: the list, a book's contents, a page, a picture and a cover. The GM
    // reads every book; a player those the GM shares, and the pictures shown.
    if (req.method === "GET" && url.pathname.startsWith("/book/")) {
      const token = url.searchParams.get("token") || "";
      const client = token ? [...clients.values()].find((item) => item.assetToken === token) : null;
      const book = url.searchParams.get("book") || "";
      const nothing = () => {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
      };
      if (!client || !books) return nothing();
      const json = (value) => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify(value));
      };
      const picture = (found) => {
        if (!found) return nothing();
        res.writeHead(200, { "Content-Type": found.mime, "Content-Length": found.bytes.length, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
        res.end(found.bytes);
      };
      try {
        if (url.pathname === "/book/list") return json({ books: shelfFor(client), ruleset, ...shelfView() });
        if (url.pathname === "/book/cover") return canRead(client, book) ? picture(books.cover(book)) : nothing();
        if (url.pathname === "/book/picture") return canSeePicture(client, book, url.searchParams.get("file") || "") ? picture(books.picture(book, url.searchParams.get("file") || "")) : nothing();
        if (!canRead(client, book)) return nothing();
        if (url.pathname === "/book/contents") return json(books.contents(book));
        if (url.pathname === "/book/page") return json(books.page(book, url.searchParams.get("page") || ""));
      } catch {
        return nothing();
      }
      return nothing();
    }
    // Sounds: the GM's list, and the files for every seat (with ranges, so music can seek).
    if (req.method === "GET" && (url.pathname === "/sound/list" || url.pathname === "/sound/file")) {
      const token = url.searchParams.get("token") || "";
      const client = token ? [...clients.values()].find((item) => item.assetToken === token) : null;
      if (!client || !sounds || (url.pathname === "/sound/list" && client.role !== "dm")) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      if (url.pathname === "/sound/list") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ sounds: sounds.list(), groups: sounds.groups(), folder: sounds.folder, triggers: soundTriggers }));
        return;
      }
      const found = sounds.file(url.searchParams.get("id") || "");
      if (!found) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      fs.stat(found.path, (error, stat) => {
        if (error) {
          res.writeHead(404);
          res.end();
          return;
        }
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(stat.size - 1, Number(range[2])) : stat.size - 1;
          if (start >= stat.size || start > end) {
            res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
            res.end();
            return;
          }
          res.writeHead(206, { "Content-Type": found.mime, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
          fs.createReadStream(found.path, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, { "Content-Type": found.mime, "Content-Length": stat.size, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
        fs.createReadStream(found.path).pipe(res);
      });
      return;
    }
    // Background decals and wallpapers: the list for the GM's picker, and the pictures for every seat.
    const pictures = { "/decal/list": decals, "/decal/file": decals, "/wallpaper/list": wallpapers, "/wallpaper/file": wallpapers, "/gmicon/list": gmIcons, "/gmicon/file": gmIcons };
    if (req.method === "GET" && Object.hasOwn(pictures, url.pathname)) {
      const library = pictures[url.pathname];
      const token = url.searchParams.get("token") || "";
      const client = token ? [...clients.values()].find((item) => item.assetToken === token) : null;
      const found = client && library ? (url.pathname.endsWith("/list") ? (client.role === "dm" ? { list: library.list() } : null) : library.file(url.searchParams.get("id") || "")) : null;
      if (!found) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      if (found.list) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify(found.list));
        return;
      }
      res.writeHead(200, { "Content-Type": found.mime, "Content-Length": found.bytes.length, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
      res.end(found.bytes);
      return;
    }
    // A creature's picture from its module (an NPC's token or portrait). A seat
    // may have it when it can see the record or a visible token of it.
    if (req.method === "GET" && url.pathname === "/table/record-art") {
      const token = url.searchParams.get("token") || "";
      const client = [...clients.values()].find((item) => item.assetToken === token);
      const record = client ? records.get(url.searchParams.get("record") || "") : null;
      const allowed =
        record &&
        (canSee(record, seatOf(client)) || map.tokens().some((item) => item.recordId === record.id && !item.hidden) || client.role === "dm");
      const kind = url.searchParams.get("kind") === "portrait" ? "picture" : "token";
      const picture = allowed ? modulePicture(record.data?.[kind] || record.data?.picture || record.data?.token, record.source) : null;
      if (!picture) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": picture.mime, "Content-Length": picture.bytes.length, "Cache-Control": "private, max-age=3600" });
      res.end(picture.bytes);
      return;
    }
    if (req.method === "GET" && url.pathname === "/table/token") {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      const art = allowed ? tokenArt.get(url.searchParams.get("id") || "") : null;
      if (!art) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": art.mime, "Content-Length": art.bytes.length, "Cache-Control": "private, max-age=3600" });
      res.end(art.bytes);
      return;
    }
    if (req.method === "GET" && serveWeb(url, res, webRoot)) return;
    res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
    res.end();
  });

  const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 * 1024 });
  // The http server's errors (a port in use) come here too; listen() reports them.
  wss.on("error", () => {});

  function send(ws, message) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  function broadcast(message, except) {
    const data = JSON.stringify(message);
    for (const ws of clients.keys()) {
      if (ws !== except && ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  function playerList() {
    return [...clients.values()].map((client) => ({ id: client.id, name: client.name, role: client.role }));
  }

  // The scene a player is sent: the map and lights. Walls stay on the host
  // and tokens come with the player's map view.
  function sceneFor(client) {
    if (!scene) return null;
    const { walls, tokens, lights, ...shown } = scene;
    return {
      ...shown,
      image: image ? `/table/image?token=${client.assetToken}&v=${imageVersion}` : null,
    };
  }

  function broadcastScene() {
    for (const [ws, client] of clients) {
      if (client.role === "dm") continue;
      send(ws, { type: "scene", scene: sceneFor(client) });
    }
  }

  function removeClient(ws) {
    const client = clients.get(ws);
    if (!client) return;
    clients.delete(ws);
    broadcast({ type: "players", players: playerList() });
  }

  wss.on("connection", (ws, request) => {
    const remote = request.socket?.remoteAddress || ws._socket?.remoteAddress || "";
    const client = {
      id: crypto.randomBytes(8).toString("hex"),
      name: "",
      role: "player",
      assetToken: "",
      joined: false,
    };
    const joinTimer = setTimeout(() => {
      if (!client.joined) ws.close();
    }, 10000);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        if (!client.joined) ws.close();
        return;
      }
      if (!msg || typeof msg !== "object") return;
      if (client.joined) asking = { client, at: Date.now() };
      // Any request may say how its dice are thrown; the roll it makes carries that.
      if (client.joined && (msg.throw || msg.look)) {
        const look = diceLook(msg.look) ?? client.hand?.look ?? null;
        client.hand = { throw: diceThrow(msg.throw), look, at: Date.now() };
      }

      if (!client.joined) {
        if (msg.type !== "join") {
          ws.close();
          return;
        }
        if (password && !sameSecret(msg.password ?? "", password)) {
          send(ws, { type: "no", reason: "Wrong password." });
          ws.close();
          return;
        }
        if (clients.size >= MAX_CLIENTS) {
          send(ws, { type: "no", reason: "This table is full." });
          ws.close();
          return;
        }
        const dmSeated = [...clients.values()].some((seat) => seat.role === "dm");
        client.role = decideRole(remote, hostToken, msg.hostToken, dmSeated);
        client.name = text(msg.name, client.role === "dm" ? "DM" : "Player").slice(0, 24);
        client.assetToken = crypto.randomBytes(18).toString("hex");
        client.joined = true;
        clearTimeout(joinTimer);
        clients.set(ws, client);
        send(ws, {
          type: "ok",
          you: { id: client.id, name: client.name, role: client.role, assetToken: client.assetToken },
          players: playerList(),
          map: map.viewFor(seatOf(client), client.assetToken),
          combat: combat.viewFor(seatOf(client)),
          chat: chatFor(client),
          options,
          soundscape,
          books: shelfView(),
          records: records.list({ seat: seatOf(client) }),
          scene: client.role === "player" ? sceneFor(client) : null,
        });
        broadcast({ type: "players", players: playerList() }, ws);
        party
          .partyView(agentHandle)
          .then((view) => send(ws, { type: "party", party: view }))
          .catch(() => undefined);
        return;
      }

      // The GM shares a book with the players, or stops; shows them a picture
      // (it opens as a tab on their screens), or takes it back.
      if (msg.type === "book-activate" || msg.type === "book-share" || msg.type === "image-share" || msg.type === "image-unshare") {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM shares books and pictures." });
          return;
        }
        try {
          if (msg.type === "book-activate") activateBook(msg.book, msg.active !== false);
          else if (msg.type === "book-share") shareBook(msg.book, msg.shared !== false);
          else if (msg.type === "image-share") showImage(msg.book, msg.file, msg.name);
          else hideImage(msg.id);
        } catch (error) {
          send(ws, { type: "error", reason: error.message });
        }
        return;
      }

      if (msg.type === "chat-clear") {
        chatCleared.set(clearKey(client), Date.now());
        onChange("table");
        return;
      }

      if (msg.type === "chat") {
        const line = text(msg.text, "").slice(0, 500);
        if (!line) return;
        const kind = CHAT_KINDS.has(msg.kind) ? msg.kind : "say";
        // The GM's alone: story text, and speaking as someone else (/id, /gmid).
        if (kind === "story" && client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM tells the story (/story)." });
          return;
        }
        const as = client.role === "dm" ? text(msg.as, "").slice(0, 24) : "";
        const to = Array.isArray(msg.to) ? msg.to.map((name) => text(name, "").slice(0, 24)).filter(Boolean).slice(0, 12) : null;
        addChat({
          id: client.id,
          from: as || client.name,
          text: line,
          at: Date.now(),
          ...(kind !== "say" ? { kind } : {}),
          ...(kind === "mood" ? { mood: text(msg.mood, "").slice(0, 24) } : {}),
          ...(to && to.length ? { to } : {}),
        });
        return;
      }

      if (msg.type === "table-options") {
        if (client.role !== "dm") return;
        try {
          setOptions(msg.options);
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
        }
        return;
      }

      if (msg.type === "roll") {
        try {
          // The dice tower, as FG's: the GM's roll, marked [TOWER]. Its roller sees
          // what went in (FG's line with the dice, no result) unless the GM
          // lets them see the result too; the rest of the table sees nothing.
          if (msg.tower) {
            const label = `[TOWER] ${text(msg.label, "")}`.trim();
            const reveal = client.role !== "dm" && options.towerReveal;
            const roll = rollDice(msg.formula, label, client.name, client.id, msg.tag, reveal ? client.name : true);
            if (client.role !== "dm" && !reveal) {
              send(ws, { type: "chat", id: client.id, from: client.name, text: `${label} [${roll.formula}]`, at: Date.now(), tower: true });
            }
          } else if (msg.mode === "blind") {
            // Foundry's /blindroll: the GM sees it, the roller sees only that it was rolled.
            const roll = rollDice(msg.formula, `[BLIND] ${text(msg.label, "")}`.trim(), client.name, client.id, msg.tag, true);
            if (client.role !== "dm") send(ws, { type: "chat", id: client.id, from: client.name, text: `[BLIND] ${text(msg.label, "")} [${roll.formula}]`.replace(/\s+/g, " "), at: Date.now(), tower: true });
          } else if (msg.mode === "gm") {
            // Foundry's /gmroll: the GM and the roller.
            rollDice(msg.formula, msg.label, client.name, client.id, msg.tag, client.role === "dm" ? true : client.name);
          } else if (msg.mode === "self") {
            // Foundry's /selfroll: the roller alone.
            const result = dice.roll(msg.formula);
            addChat({ id: client.id, from: client.name, text: "", roll: { ...result, label: text(msg.label, "").slice(0, 160) }, at: Date.now(), self: true });
          } else rollDice(msg.formula, msg.label, client.role === "dm" && msg.as ? text(msg.as, "").slice(0, 24) : client.name, client.id, msg.tag);
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." });
        }
        return;
      }

      // The creation wizard's finished character: the host builds it from the
      // spec with the campaign's books. A player's character is theirs.
      if (msg.type === "build-character") {
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        siege()
          .then(({ builder }) => {
            const library = siegeLibrary(records);
            const { character, report } = builder.buildFromSpec(msg.spec ?? {}, library);
            if (!character) throw new Error(report.problems.join("; ") || "Could not build that character.");
            const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
            const record = records.create(
              { type: "character", name: character.name || "Unnamed character", owner, visibility: owner ? "owner" : "gm", data: character },
              client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name },
            );
            addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${character.race ?? ""} ${msg.spec?.class ?? ""} ${character.level ?? 1}.`, at: Date.now() });
            answer({ ok: true, id: record.id, problems: report.problems });
          })
          .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
        return;
      }

      // Level up from a sheet: the owner or the GM.
      if (msg.type === "level-up") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot level up that character." });
          return;
        }
        levelUp(agentHandle, record, msg.package, client.role === "dm" ? record.name : client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not level up." }),
        );
        return;
      }

      // A SIEGE check from a sheet: the owner or the GM rolls it.
      if (msg.type === "siege-check") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot roll for that character." });
          return;
        }
        siegeCheck(agentHandle, record, { attribute: msg.attribute, cl: msg.cl, bonus: msg.bonus, label: msg.label }, client.role === "dm" ? record.name : client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." }),
        );
        return;
      }

      // Record changes from a client: { op: create | update | delete, ... }.
      // The answer carries req back so the client can match it.
      if (msg.type === "op") {
        const seat = seatOf(client);
        try {
          let record;
          if (msg.op === "create") record = records.create(msg.input, seat);
          else if (msg.op === "update") record = records.update(msg.id, msg.patch, seat, { replace: msg.replace === true });
          else if (msg.op === "delete") record = records.remove(msg.id, seat);
          else throw new Error("Unknown change.");
          send(ws, { type: "op-result", req: msg.req ?? null, ok: true, id: record.id });
        } catch (error) {
          send(ws, { type: "op-result", req: msg.req ?? null, ok: false, error: error instanceof Error ? error.message : "Not allowed." });
        }
        return;
      }

      // Sounds, the GM's: a one-shot or effect for everyone (a folder plays one of
      // its sounds at random), the ambience loops, the music, and the chat's triggers.
      if (["sound-play", "sound-stop", "ambience", "music", "sound-triggers"].includes(msg.type)) {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM plays sounds for the table." });
          return;
        }
        try {
          if (msg.type === "sound-play") playSound(msg.id, msg.volume);
          else if (msg.type === "sound-stop") broadcast({ type: "sound-stop" });
          else if (msg.type === "ambience") ambience(msg.action, msg.id, msg.volume);
          else if (msg.type === "music") music(msg.action, msg.id, msg);
          else setTriggers(msg.triggers);
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not play that." });
        }
        return;
      }

      // FG's /kick: the GM sends a player away from the table.
      if (msg.type === "kick") {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM can kick." });
          return;
        }
        const gone = kick(msg.name);
        if (!gone) send(ws, { type: "error", reason: `Nobody called ${text(msg.name, "")} is at the table.` });
        return;
      }
      // FG's /vote: a question everyone answers yes or no; the counts show to all.
      if (msg.type === "vote") {
        const question = text(msg.question, "").slice(0, 200);
        if (question) startVote(question, client);
        return;
      }
      if (msg.type === "vote-cast") {
        castVote(String(msg.id ?? ""), msg.choice, client.name);
        return;
      }
      // FG's /save: the GM saves the campaign now.
      if (msg.type === "save") {
        if (client.role !== "dm") return;
        onChange("save");
        send(ws, { type: "notice", text: "Campaign saved." });
        return;
      }

      // The map: tokens, doors, line of sight and pings (mapState.cjs decides
      // who may do what).
      if (["token-place", "token-move", "token-remove", "token-update", "door", "sight", "lock", "scene-settings", "light-place", "light-update", "light-remove"].includes(msg.type)) {
        const seat = seatOf(client);
        try {
          if (msg.type === "token-place") {
            map.place({ recordId: msg.recordId, name: msg.name, x: num(msg.x, NaN), y: num(msg.y, NaN), hidden: msg.hidden }, seat);
          } else if (msg.type === "token-move") {
            const to = { x: num(msg.x, NaN), y: num(msg.y, NaN) };
            if (!Number.isFinite(to.x) || !Number.isFinite(to.y) || Math.abs(to.x) > 1e7 || Math.abs(to.y) > 1e7) throw new Error("Where to?");
            const { blocked } = map.move(String(msg.id ?? ""), to, seat, { snap: msg.snap !== false });
            if (blocked) send(ws, { type: "notice", text: "A wall is in the way." });
          } else if (msg.type === "token-remove") {
            map.remove(String(msg.id ?? ""), seat);
          } else if (msg.type === "token-update") {
            map.update(String(msg.id ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "door") {
            map.setDoor(String(msg.id ?? ""), msg.state === undefined ? undefined : num(msg.state, -1), seat);
          } else if (msg.type === "sight") {
            if (client.role !== "dm") throw new Error("Only the GM can change line of sight.");
            map.setSight(Boolean(msg.on));
          } else if (msg.type === "scene-settings") {
            map.updateSettings(msg.patch ?? {}, seat);
          } else if (msg.type === "light-place") {
            map.placeLight(msg.light ?? {}, seat);
          } else if (msg.type === "light-update") {
            map.updateLight(String(msg.id ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "light-remove") {
            map.removeLight(String(msg.id ?? ""), seat);
          } else if (msg.type === "lock") {
            if (client.role !== "dm") throw new Error("Only the GM can lock token movement.");
            map.setLocked(Boolean(msg.on));
          }
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
          sendMaps();
        }
        return;
      }

      // The combat tracker. Players may roll their own initiative and end their own turn.
      if (msg.type === "ct") {
        const seat = seatOf(client);
        const run = async () => {
          switch (msg.action) {
            case "add":
              if (msg.place && msg.recordId) {
                const added = await combat.add({ recordId: msg.recordId, count: msg.count, hidden: msg.hidden }, seat);
                for (const entry of Array.isArray(added) ? added : [added]) {
                  if (entry.tokenId || !map.scene()) continue;
                  const token = map.place({ recordId: msg.recordId, name: entry.name, hidden: entry.hidden, faction: entry.faction }, seat);
                  combat.update(entry.id, { tokenId: token.id }, seat);
                }
              } else await combat.add(msg.entry ?? { recordId: msg.recordId, count: msg.count, tokenId: msg.tokenId, name: msg.name, faction: msg.faction }, seat);
              return;
            case "add-party":
              for (const record of (await party.partyView(agentHandle)).members) await combat.add({ recordId: record.id }, seat);
              return;
            case "update":
              return combat.update(String(msg.id), msg.patch ?? {}, seat);
            case "remove":
              return combat.remove(String(msg.id), seat);
            case "init":
              return combat.rollInit(String(msg.which ?? ""), seat);
            case "next":
              return combat.next(seat);
            case "round":
              return combat.nextRound(seat);
            case "end":
              return combat.end(seat, { removeNpcs: Boolean(msg.removeNpcs) });
            case "effect":
              return combat.addEffect(String(msg.id), msg.effect ?? {}, seat);
            case "effect-remove":
              return combat.removeEffect(String(msg.id), String(msg.effectId), seat);
            case "damage":
              return combat.damage(String(msg.id), msg.amount, seat);
            case "target": {
              // A target by token: the source is the player's own entry (the active
              // one if several), or the GM's chosen or active entry.
              const entries = combat.entries();
              const target = msg.targetId ? entries.find((entry) => entry.id === msg.targetId) : entries.find((entry) => entry.tokenId === msg.tokenId || (msg.tokenId && entry.recordId && map.tokens().find((token) => token.id === msg.tokenId)?.recordId === entry.recordId));
              if (!target) throw new Error("Add that token to the combat tracker first.");
              const source = msg.sourceId
                ? entries.find((entry) => entry.id === msg.sourceId)
                : client.role === "dm"
                  ? entries.find((entry) => entry.id === combat.active())
                  : entries.find((entry) => entry.id === combat.active() && combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine) ??
                    entries.find((entry) => combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine);
              if (!source) throw new Error(client.role === "dm" ? "Whose target? Start combat or pick a creature." : "Your character is not in the fight.");
              const already = source.targets.includes(target.id);
              return combat.target(source.id, target.id, msg.on ?? !already, seat);
            }
            case "save": {
              // The GM asks any creature for a save; a player rolls their own.
              const entry = combat.entries().find((item) => item.id === msg.id);
              if (!entry) throw new Error("No one like that is in the fight.");
              if (client.role !== "dm" && !combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine) throw new Error("You can roll saves for your own character.");
              return combat.save(entry.id, String(msg.attribute), msg.cl, client.role === "dm" ? entry.name : client.name);
            }
            case "cast":
              return combat.cast(String(msg.recordId), String(msg.power), msg.action ? String(msg.action) : "", seat, client.role === "dm" ? "Combat" : client.name);
            case "clear-targets":
              return combat.clearTargets(String(msg.id), seat);
            case "attack":
              return combat.attack(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.weapon), seat, client.role === "dm" ? "Combat" : client.name);
            case "damage-roll":
              return combat.damageRoll(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.weapon), seat, client.role === "dm" ? "Combat" : client.name);
            case "heal":
              return combat.heal(String(msg.id), msg.amount, seat);
            default:
              throw new Error("Unknown tracker action.");
          }
        };
        run().catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      // The party sheet's actions (the GM's): award XP, hand out the parcel,
      // group checks and saves.
      if (["party-award-xp", "party-award", "party-distribute", "party-group"].includes(msg.type)) {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM can do that." });
          return;
        }
        const run =
          msg.type === "party-award-xp"
            ? party.awardXP(agentHandle, msg.xp, client.name)
            : msg.type === "party-award"
              ? party.awardEntries(agentHandle, msg.kind, msg.id, client.name)
              : msg.type === "party-distribute"
                ? party.distribute(agentHandle, client.name)
                : party.groupCheck(agentHandle, msg.kind === "save" ? "save" : "check", msg.attribute, msg.cl, client.name);
        run.catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      if (msg.type === "ping") {
        const x = num(msg.x, NaN);
        const y = num(msg.y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        broadcast({ type: "ping", x, y, from: client.name, color: playerColorOf(client) });
        return;
      }

      if (msg.type === "scene") {
        if (client.role !== "dm") return;
        const next = sanitizeScene(msg.scene);
        if (!next) return;
        scene = next;
        map.setScene(next);
        broadcastScene();
        sendMaps();
      }
    });

    ws.on("close", () => {
      clearTimeout(joinTimer);
      removeClient(ws);
    });
    ws.on("error", () => {
      clearTimeout(joinTimer);
      ws.close();
    });
  });

  // What agents (the MCP server, the in-app assistant) use. They act as the GM.
  const agentHandle = {
    seat: { role: "dm", name: "Agent" },
    records,
    dice,
    options: () => ({ ...options }),
    setOptions,
    roll: (formula, label, from = "Agent", secret = false, extra = null) => rollDice(formula, label, from, "agent", undefined, secret, extra),
    // Posts a roll already made (an attack decides HIT or MISS before its card goes out).
    postRoll: (result, label, from = "Agent", secret = false, extra = null) =>
      addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: "", roll: { ...result, label: text(label, "").slice(0, 160), ...(extra ?? {}) }, at: Date.now(), ...(secret ? { secret: true } : {}) }),
    say: (line, from = "Agent", secret = false, extra = {}) =>
      addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: text(line, "").slice(0, 500), at: Date.now(), ...(secret ? { secret: true } : {}), ...extra }),
    kick: (name) => kick(name),
    vote: (question, by = "Agent") => startVote(text(question, "").slice(0, 200), { id: "agent", name: by }),
    votes: () => chat.filter((line) => line.vote).map((line) => line.vote),
    save: () => onChange("save"),
    // The GM's /clear: the GM's chat windows clear, now and when they come back.
    clearChat() {
      chatCleared.set("@gm", Date.now());
      for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "chat-cleared" });
      onChange("table");
      return { cleared: true };
    },
    chatLog: (count = 20) => chat.slice(-Math.max(1, Math.min(100, Number(count) || 20))),
    players: () => playerList(),
    scene: () => scene,
    map,
    combat,
    viewFor: (name) => map.viewFor({ role: "player", name }, ""),
    decals: () => decals,
    wallpapers: () => wallpapers,
    gmIcons: () => gmIcons,
    sounds: () => sounds,
    playSound,
    stopSounds: () => (broadcast({ type: "sound-stop" }), { stopped: true }),
    ambience,
    music,
    soundscape: () => soundscape,
    // Books: what there is, a book's contents and pages, and sharing.
    books: () => shelfFor({ role: "dm" }),
    activateBook,
    bookContents: (book) => {
      if (!books) throw new Error("There are no books here.");
      return books.contents(book);
    },
    bookPage: (book, page) => {
      if (!books) throw new Error("There are no books here.");
      return books.page(book, page);
    },
    shelf: shelfView,
    shareBook,
    showImage,
    hideImage,
    triggers: () => soundTriggers,
    setTriggers,
    // The GM's portraits and tokens (artLibrary.cjs), as the pickers show them.
    art: (kind) => (art ? art.list(kind) : []),
    // A ping on the map at a square, as a GM's click would make.
    ping(col, row, from = "Agent") {
      if (!scene) throw new Error("No scene is on the table.");
      const at = map.squareCenter(col, row, 1);
      broadcast({ type: "ping", x: at.x, y: at.y, from: text(from, "Agent").slice(0, 24), color: "#f4f1ea" });
      return at;
    },
  };

  function playSound(idOrGroup, volume) {
    const picked = sounds?.pick(idOrGroup);
    if (!picked) throw new Error(`No sound "${idOrGroup}".`);
    broadcast({ type: "sound", id: picked.id, kind: picked.kind, volume: Math.min(1, Math.max(0, Number(volume ?? 1))) });
    return picked;
  }
  // Ambience: loops playing together (add, remove, volume, clear).
  function ambience(action, idOrGroup, volume) {
    const list = soundscape.ambience.slice();
    if (action === "clear") return setSoundscape({ ...soundscape, ambience: [] });
    if (action === "remove") return setSoundscape({ ...soundscape, ambience: list.filter((item) => item.id !== idOrGroup) });
    if (action === "volume") return setSoundscape({ ...soundscape, ambience: list.map((item) => (item.id === idOrGroup ? { ...item, volume } : item)) });
    const picked = sounds?.pick(idOrGroup);
    if (!picked) throw new Error(`No ambience "${idOrGroup}".`);
    if (list.some((item) => item.id === picked.id)) return soundscape;
    return setSoundscape({ ...soundscape, ambience: [...list, { id: picked.id, volume: volume ?? 0.8 }] });
  }
  // Music: one track (or a folder, a track at a time from it), looped or not.
  function music(action, idOrGroup, extra = {}) {
    if (action === "stop") return setSoundscape({ ...soundscape, music: null });
    if (action === "volume" && soundscape.music) return setSoundscape({ ...soundscape, music: { ...soundscape.music, volume: extra.volume } });
    const group = action === "next" ? soundscape.music?.group : idOrGroup;
    const picked = sounds?.pick(group ?? idOrGroup);
    if (!picked) throw new Error(`No music "${group ?? idOrGroup}".`);
    const fromFolder = sounds.has(String(group ?? idOrGroup)) ? null : String(group ?? idOrGroup);
    return setSoundscape({ ...soundscape, music: { id: picked.id, volume: extra.volume ?? soundscape.music?.volume ?? 0.7, loop: extra.loop !== false && !fromFolder, group: fromFolder } });
  }
  function setTriggers(list) {
    const cleaned = list === "default" ? defaultTriggers() : cleanTriggers(list);
    if (!cleaned) throw new Error("Triggers are a list.");
    soundTriggers = cleaned;
    for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "sound-triggers", triggers: soundTriggers });
    onChange("table");
    return soundTriggers;
  }

  function kick(name) {
    const entry = [...clients.entries()].find(([, client]) => client.role !== "dm" && sameName(client.name, name));
    if (!entry) return null;
    const [ws, client] = entry;
    send(ws, { type: "kicked", reason: "The GM has asked you to leave the table." });
    setTimeout(() => ws.close(4001, "kicked"), 50);
    addChat({ id: "table", from: "Table", text: `${client.name} has left the table.`, at: Date.now(), kind: "story" });
    return client.name;
  }
  function startVote(question, client) {
    const id = crypto.randomBytes(6).toString("hex");
    addChat({ id: client?.id ?? "agent", from: client?.name ?? "Agent", text: question, at: Date.now(), vote: { id, question, yes: [], no: [] } });
    return id;
  }
  function castVote(id, choice, name) {
    const line = chat.find((item) => item.vote?.id === id);
    if (!line || (choice !== "yes" && choice !== "no")) return null;
    const vote = line.vote;
    vote.yes = vote.yes.filter((who) => !sameName(who, name));
    vote.no = vote.no.filter((who) => !sameName(who, name));
    vote[choice].push(String(name).slice(0, 24));
    broadcast({ type: "vote", id, yes: vote.yes, no: vote.no });
    onChange("table");
    return vote;
  }

  function playerColorOf(client) {
    return client.role === "dm" ? "#f4f1ea" : playerColor(client.name);
  }

  return {
    listen({ port, password: nextPassword }) {
      password = String(nextPassword ?? "").trim();
      hostToken = crypto.randomBytes(24).toString("hex");
      return Promise.all([map.ready, combat.ready]).then(() => new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        // Every network, for LAN and internet players; tests set KRAKEN_BIND to 127.0.0.1.
        server.listen(port, process.env.KRAKEN_BIND || "0.0.0.0", () => {
          server.off("error", onError);
          server.on("error", (error) => console.error("table server", error));
          const address = server.address();
          resolve({
            port: typeof address === "object" && address ? address.port : port,
            hostToken,
            addresses: lanAddresses(),
          });
        });
      }));
    },
    setImage(bytes, mime) {
      if (!bytes || bytes.length === 0) image = null;
      else {
        const type = typeof mime === "string" && mime.startsWith("image/") ? mime : "application/octet-stream";
        image = { bytes: Buffer.from(bytes), mime: type };
      }
      imageVersion += 1;
    },
    // Token pictures from the GM's adventure, by Foundry token id, so players see them too.
    setTokenArt(list) {
      tokenArt.clear();
      for (const item of Array.isArray(list) ? list.slice(0, 400) : []) {
        if (!item || typeof item.id !== "string" || !item.bytes || item.bytes.length === 0 || item.bytes.length > 8 * 1024 * 1024) continue;
        const mime = typeof item.mime === "string" && item.mime.startsWith("image/") ? item.mime : "application/octet-stream";
        tokenArt.set(item.id.slice(0, 80), { bytes: Buffer.from(item.bytes), mime });
      }
      sendMaps();
    },
    persisted() {
      return {
        chat: chat.slice(),
        options,
        map: map.persisted(),
        combat: combat.persisted(),
        records: records.toJSON(),
        dice: dice.toJSON(),
        sound: soundscape,
        books: shelfView(),
        soundTriggers,
        soundTriggersVersion: TRIGGERS_VERSION,
        chatCleared: Object.fromEntries(chatCleared),
      };
    },
    // What agents (the MCP server, the in-app assistant) use. They act as the GM.
    agent: agentHandle,
    snapshot() {
      return {
        players: playerList(),
        tokens: map.tokens().map((token) => ({ ...token })),
        sceneId: scene?.id ?? null,
        imageBytes: image?.bytes.length ?? 0,
      };
    },
    stop() {
      for (const ws of clients.keys()) ws.close();
      clients.clear();
      wss.close();
      return new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
      });
    },
  };
}

module.exports = { createTableServer, decideRole, lanAddresses, eachAddress };
