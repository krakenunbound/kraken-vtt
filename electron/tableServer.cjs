const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { WebSocketServer } = require("ws");
const { createRecordStore, canSee } = require("./records.cjs");
const { withArt } = require("./characterArt.cjs");
const { soundFor, cleanTriggers } = require("./soundTriggers.cjs");
const { defaultTriggers, TRIGGERS_VERSION } = require("./soundCatalog.cjs");
const { createDice } = require("./dice.cjs");
const { siege, siegeLibrary, siegeCheck, levelUp, changeClass, dropOnCharacter, editCharacter, importCharacter } = require("./siege.cjs");
const { createMapState, playerColor } = require("./mapState.cjs");
const { createPrefsStore } = require("./prefs.cjs");
const party = require("./party.cjs");
const { createCombat } = require("./combat.cjs");
const { modulePicture, importModule, prepareModule } = require("./importers/fgModule.cjs");
const { fitsRuleset } = require("./books.cjs");

const MAX_CLIENTS = 16;


// What a player may do with raw record changes (the GM and the agent may do
// anything). Rules records change only through their sheet's own edits, which
// allow a list of fields and work every number out again: a player's raw
// change to a character may set its pictures, dice, spent slots and its
// words (notes, appearance...), never a number the rules read, and a new
// character starts blank. Notes are the player's own.
const PLAYER_CHARACTER_PATHS = [/^portrait$/, /^token$/, /^dice(\..+)?$/, /^slots\.[^.]+\.used$/, /^(notes|appearance|playername|gender|age|height|weight|alignment|personality|ideals|bonds|flaws|backstory)$/];
function leafPaths(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  const keys = Object.keys(value);
  if (keys.length === 0) return [prefix];
  return keys.flatMap((key) => leafPaths(value[key], prefix ? `${prefix}.${key}` : key));
}
function playerOp(msg, records) {
  if (msg.op === "create") {
    const type = String(msg.input?.type ?? "");
    if (type === "note") return;
    if (type !== "character") throw new Error("Players can make notes and characters only.");
    const attributes = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: 10, prime: 0 }]));
    msg.input = { type: "character", name: msg.input?.name, visibility: msg.input?.visibility === "all" ? "all" : "owner", data: { attributes, level: 0, hp: { total: 0, wounds: 0 } } };
    return;
  }
  if (msg.op !== "update") return;
  const before = records.get(String(msg.id ?? ""));
  if (!before || before.type === "note") return;
  if (msg.replace === true) throw new Error("Change your character on its sheet.");
  if (before.type !== "character") return;
  const data = msg.patch?.data;
  const paths = data === undefined ? [] : leafPaths(data);
  if (paths.some((path) => !PLAYER_CHARACTER_PATHS.some((pattern) => pattern.test(path)))) throw new Error("Change your character on its sheet.");
}

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
// The Gilded Die's themes, finishes ("design": the theme's own), trails and lettering too.
const DICE_THEMES = new Set(["classic", "dragonhide", "starfall", "bone", "magma", "leviathan", "marble", "swirl", "speckle", "wood", "runes", "stripes", "aether", "reliquary", "rosewindow", "gilded", "emerald", "frost", "obsidian", "bloodstone", "arcane", "void", "hero", "monster", "wizard", "bard", "necromancer", "goblin", "wyrm", "ghost", "undead", "traveller", "mythos"]);
const DICE_MATERIALS = new Set(["plastic", "glass", "metal", "pearl", "stone", "wood", "design"]);
const DICE_EFFECTS = new Set(["none", "sparkles", "fire", "frost", "arcane", "shadow", "glow", "aura", "wisp", "spark", "embers", "holy", "charge", "notes", "ion"]);
const DICE_FONTS = new Set(["classic", "bold", "runic", "script", "glow", "metal", "engrave"]);
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
  if (typeof value.pips === "boolean") look.pips = value.pips;
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
    // The dice tower on the table, apart from the chat (the GM's choice, for every seat); else docked in the chat's tray.
    towerExternal: Boolean(options.towerExternal),
    decal: id(options.decal, "kraken"),
    wallpaper: id(options.wallpaper, ""),
    gmIcon: id(options.gmIcon, GM_ICON),
    // Sounds for the GM's hidden rolls, as Kraken's Syrinscape extension:
    // "off" none, "combat" attacks, damage, healing and initiative only, "all".
    soundHidden: ["off", "combat", "all"].includes(options.soundHidden) ? options.soundHidden : "combat",
    // When a creature's targets clear: never (FG), after its spell or attack, or at the end of its turn.
    clearTargets: ["never", "action", "turn"].includes(options.clearTargets) ? options.clearTargets : "never",
    // The same sound again only after this many seconds.
    soundRepeat: Math.min(30, Math.max(0, Number.isFinite(Number(options.soundRepeat)) ? Number(options.soundRepeat) : 1)),
    // How long landed dice lie on the table before they fade, in seconds (the GM's choice, for every seat).
    diceHold: Math.round(Math.min(60, Math.max(0.5, Number.isFinite(Number(options.diceHold)) ? Number(options.diceHold) : 2.6)) * 10) / 10,
    wizard35: wizard35Options(options.wizard35),
    // The AD&D 2E character wizard's options (the FG extension's Options): ability
    // rolls once only, the PHB methods (I to VI) players may use, gold above 1st level.
    wizard2e: wizard2eOptions(options.wizard2e),
  };
}
function wizard2eOptions(value) {
  const raw = value && typeof value === "object" ? value : {};
  const methods = Array.isArray(raw.methods) ? [...new Set(raw.methods.map((n) => Math.round(Number(n))).filter((n) => n >= 1 && n <= 6))].sort() : [1, 2, 3, 4, 5, 6];
  return { rollLock: Boolean(raw.rollLock), methods, gold: ["phb", "perlevel", "xlevel"].includes(raw.gold) ? raw.gold : "phb" };
}

// The D&D 3.5E character wizard's options, as the GM's FG extension has them:
// the ability methods players may use (1 4d6 drop lowest arranged, 2 3d6 in
// order, 3 the standard array, 4 typed), rolled scores locked after the first
// roll, one 3d6 reroll of a score under 8, and the Vault of the Kraken's
// hand-me-down gear free in the shop.
function wizard35Options(value) {
  const w = value && typeof value === "object" ? value : {};
  const methods = Array.isArray(w.methods) ? [...new Set(w.methods.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 4))].sort() : [1, 2, 3, 4];
  return { methods: methods.length ? methods : [1], rollLock: Boolean(w.rollLock), lowReroll: Boolean(w.lowReroll), vault: Boolean(w.vault) };
}

// What a chat line is (FG's and Foundry's chat commands): said, an emote
// (/emote, /me), an action (/action), out of character (/ooc), the GM's story
// text (/story), a line with a mood (/mood); a whisper has `to`.
// The session's chat kept with the campaign (FG keeps the whole session); a joining seat gets the last JOIN_CHAT.
const MAX_CHAT = 2000;
const JOIN_CHAT = 300;
const CHAT_KINDS = new Set(["say", "emote", "action", "ooc", "story", "mood"]);

function savedChat(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line) => line && typeof line === "object" && typeof line.text === "string")
    .slice(-MAX_CHAT)
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

// A file streamed to a seat; one that vanished or failed halfway ends that answer only.
function streamFile(file, res, range) {
  const stream = fs.createReadStream(file, range);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

function serveWeb(url, res, root) {
  let wanted;
  try {
    wanted = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  } catch {
    return false;
  }
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
function createTableServer({ saved = {}, onChange = () => undefined, webRoot = WEB_ROOT, art = null, decals = null, wallpapers = null, gmIcons = null, tiles = null, sounds = null, books = null, ruleset = "", accounts = null, prefs: prefsStore = null, studioPicture = null } = {}) {
  // Each person's own settings (prefs.cjs): their colour and dice. Kept by the app for every campaign; in memory without a file.
  const prefs = prefsStore ?? createPrefsStore(null, diceLook);
  const prefsKey = (client) => (client.role === "dm" ? "@gm" : client.name);
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
  // Sounds the GM keeps in the books, as FG's sound links in the story: a
  // sound bound to one of the book's own sound links, and sounds dropped in
  // between its paragraphs. By "<book>|<page>"; the GM's alone.
  const bookSounds = new Map(Object.entries(saved.bookSounds && typeof saved.bookSounds === "object" ? saved.bookSounds : {}).slice(0, 2000));
  const soundRef = (raw) => {
    const id = text(raw?.sound, "").slice(0, 300);
    const kind = ["oneshots", "sfx", "ambience", "music"].includes(raw?.kind) ? raw.kind : id.split("/")[0];
    if (!id || !["oneshots", "sfx", "ambience", "music"].includes(kind)) throw new Error("Which sound?");
    return { sound: id, kind, label: text(raw?.label, "").slice(0, 80) || id.split("/").pop() };
  };
  function setBookSound(change) {
    const key = `${text(change?.book, "").slice(0, 200)}|${text(change?.page, "").slice(0, 120)}`;
    const here = bookSounds.get(key) ?? { links: {}, blocks: [] };
    const action = change?.action;
    if (action === "bind") here.links = { ...here.links, [text(change.key, "").slice(0, 300)]: soundRef(change) };
    else if (action === "unbind") {
      const { [text(change.key, "")]: gone, ...rest } = here.links;
      here.links = rest;
    } else if (action === "add") {
      const block = Math.max(-1, Math.min(500, Math.round(num(change.block, -1))));
      here.blocks = [...here.blocks, { ...soundRef(change), block, id: crypto.randomBytes(5).toString("hex") }].slice(-60);
    } else if (action === "remove") here.blocks = here.blocks.filter((item) => item.id !== change.id);
    else throw new Error("bind, unbind, add or remove.");
    if (Object.keys(here.links).length === 0 && here.blocks.length === 0) bookSounds.delete(key);
    else bookSounds.set(key, here);
    for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "book-sounds", sounds: Object.fromEntries(bookSounds) });
    onChange("table");
    return here;
  }
  const shelfView = () => ({ active: [...shelf.active], shared: [...shelf.shared].filter((id) => shelf.active.has(id)), images: shelf.images });
  const fits = (info) => Boolean(info) && fitsRuleset(info, ruleset);
  const canRead = (client, book) => (client.role === "dm" ? fits(books?.info(book)) : shelf.active.has(book) && shelf.shared.has(book));
  // A seat's shelf: the GM's, every module that fits (with whether it is
  // active and shared); a player's, the active books shared with them.
  const shelfFor = (client) =>
    (books ? books.list() : [])
      .filter((item) => fits(item) && (client.role === "dm" || canRead(client, item.id)))
      .map((item) => ({ ...item, active: shelf.active.has(item.id), shared: shelf.active.has(item.id) && shelf.shared.has(item.id) }));
  const canSeePicture = (client, book, file) => {
    // A picture named from another module ("<file>@<module>") needs that module shared too.
    if (shelf.images.some((item) => item.book === book && item.file === file)) return true;
    const other = String(file).split("@")[1]?.trim();
    if (other && other !== book && client.role !== "dm" && !canRead(client, other)) return false;
    return canRead(client, book);
  };
  // When each seat last cleared its chat (/clear), by name (the GM's as "@gm"):
  // its screen shows only newer lines, also after a restart. The table's own
  // record (the agent's chat log) keeps them.
  const chatCleared = new Map(Object.entries(saved.chatCleared && typeof saved.chatCleared === "object" ? saved.chatCleared : {}).filter(([, at]) => Number.isFinite(at)));
  const clearKey = (client) => (client.role === "dm" ? "@gm" : client.name);
  // Each seat's quick slots (by name; the GM's as "@gm"): what they keep at
  // hand to open again with a click: a book (at a page), a picture or map,
  // a character sheet.
  const SLOTS = 10;
  const cleanSlot = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const label = text(raw.label, "").slice(0, 80);
    if (raw.kind === "book" && typeof raw.book === "string") return { kind: "book", book: raw.book.slice(0, 200), page: text(raw.page, "").slice(0, 120), label: label || raw.book.slice(0, 80) };
    if (raw.kind === "picture" && typeof raw.book === "string" && typeof raw.file === "string") return { kind: "picture", book: raw.book.slice(0, 200), file: raw.file.slice(0, 300), label: label || "Picture" };
    if (raw.kind === "sheet" && typeof raw.record === "string") return { kind: "sheet", record: raw.record.slice(0, 80), label: label || "Character" };
    if (raw.kind === "note" && typeof raw.record === "string") return { kind: "note", record: raw.record.slice(0, 80), label: label || "Note" };
    if (raw.kind === "record" && typeof raw.record === "string") return { kind: "record", record: raw.record.slice(0, 160), label: label || "Record" };
    if (raw.kind === "sound" && typeof raw.sound === "string" && ["oneshots", "sfx", "ambience", "music"].includes(raw.soundKind)) return { kind: "sound", sound: raw.sound.slice(0, 300), soundKind: raw.soundKind, label: label || "Sound" };
    // Dice held in the hand (FG's: right-click a die, pick how many, drop them on a slot): a formula.
    if (raw.kind === "dice" && typeof raw.formula === "string" && /^[\dd%f+\-khl!xrocs<>= ]{1,60}$/i.test(raw.formula.trim())) return { kind: "dice", formula: raw.formula.trim(), label: label || raw.formula.trim() };
    // A chat line kept to run again (FG's macro: /roll 4d6k3 dragged from the chat's entry).
    if (raw.kind === "macro" && typeof raw.text === "string" && raw.text.trim()) return { kind: "macro", text: raw.text.trim().slice(0, 300), label: label || raw.text.trim().slice(0, 80) };
    return null;
  };
  const cleanSlots = (list) => Array.from({ length: SLOTS }, (_, index) => (Array.isArray(list) ? cleanSlot(list[index]) : null));
  const quickSlots = new Map(Object.entries(saved.quickSlots && typeof saved.quickSlots === "object" ? saved.quickSlots : {}).map(([key, list]) => [key, cleanSlots(list)]));
  const slotsFor = (client) => quickSlots.get(clearKey(client)) ?? cleanSlots([]);
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
  // A scene's own sound (Syrinscape's moods in FG, per map): the ambience and
  // music the GM kept for it, started when the scene is opened.
  const sceneSounds = new Map(
    Object.entries(saved.sceneSounds && typeof saved.sceneSounds === "object" ? saved.sceneSounds : {})
      .slice(0, 500)
      .map(([id, value]) => [id.slice(0, 80), cleanScape(value)]),
  );
  const sceneSoundView = () => (scene ? { sceneId: scene.id, kept: sceneSounds.get(scene.id) ?? null } : { sceneId: null, kept: null });
  function sendSceneSound() {
    for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "scene-sound", ...sceneSoundView() });
  }
  // keep: what plays now becomes the scene's; clear: the scene has none of its own; view.
  function sceneSound(action) {
    if (action === "view") return sceneSoundView();
    if (!scene) throw new Error("No scene is open.");
    if (action === "keep") sceneSounds.set(scene.id, cleanScape(soundscape));
    else if (action === "clear") sceneSounds.delete(scene.id);
    else if (action === "play") {
      const kept = sceneSounds.get(scene.id);
      if (kept) setSoundscape(kept);
    } else throw new Error("Keep, clear, play or view the scene's sound.");
    onChange("table");
    sendSceneSound();
    return sceneSoundView();
  }
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
    options = savedOptions({ ...options, ...next, ...(next.wizard35 && typeof next.wizard35 === "object" ? { wizard35: { ...options.wizard35, ...next.wizard35 } } : {}), ...(next.wizard2e && typeof next.wizard2e === "object" ? { wizard2e: { ...options.wizard2e, ...next.wizard2e } } : {}) });
    broadcast({ type: "options", options });
    onChange("table");
    return options;
  }
  // The seat whose request is being handled now (and when).
  let asking = null;
  const records = createRecordStore({ saved: saved.records, onChange: () => onChange("records") });
  const dice = createDice(saved.dice);
  // A character's race and class token (Kraken's pair), when it has no picture of its own.
  const artForCharacter = (data) => {
    if (!art || !data) return null;
    const cls = data.class ?? Object.values(data.packages ?? {}).find((pkg) => pkg && pkg.levels)?.name ?? "";
    return require("./characterArt.cjs").pickArt(art.list("token"), data.race ?? data.species, cls)?.id ?? null;
  };
  const map = createMapState({
    saved: saved.map,
    records,
    onChange: () => {
      onChange("table");
      sendMaps();
    },
    hasArt: (id) => tokenArt.has(id),
    hasPicture: (id) => Boolean(art && art.has(id)),
    artFor: (data) => artForCharacter(data),
    hasTile: (id) => Boolean(tiles && tiles.has(id)),
    // An NPC token's health and the active turn come from the tracker.
    combatFor: (tokenId) => {
      const entry = combat.entries().find((item) => item.tokenId === tokenId);
      return entry ? { health: combat.health(entry), active: combat.active() === entry.id } : null;
    },
    activeRecord: () => combat.entries().find((item) => item.id === combat.active())?.recordId ?? null,
  });

  // The GM's image window (FG's: any image opened from the Images list, a book
  // or the Library): the same master as the table's (one state, keyed by the
  // image's scene id), shown to the GM alone until it is put in play. While
  // it is open, the GM's map tools work on it; the players keep the table's.
  const prep = createMapState({
    saved: null,
    records,
    sharedWith: map,
    onChange: () => {
      onChange("table");
      sendMaps();
    },
    hasArt: (id) => tokenArt.has(id),
    hasPicture: (id) => Boolean(art && art.has(id)),
    artFor: (data) => artForCharacter(data),
    hasTile: (id) => Boolean(tiles && tiles.has(id)),
    combatFor: () => null,
    activeRecord: () => null,
  });
  // FG's play test: the GM sees the image as a player would, through a test
  // token's eyes ("@test" owns it), and moves it as a player moves.
  const TEST_SEAT = { role: "player", name: "@test" };
  let testing = false;
  const gmMap = () => (prep.scene() ? prep : map);
  const mapOf = (client) => (client.role === "dm" ? gmMap() : map);

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
  // The play test: a test token (a player's, "@test") on the GM's map, and the
  // GM's view becomes that player's; off, the test token goes.
  function setPlaytest(on, at) {
    const working = gmMap();
    if (!working.scene()) throw new Error("Open an image first.");
    const seat = { role: "dm", name: "GM" };
    for (const token of working.tokens().filter((item) => item.owner === TEST_SEAT.name)) working.remove(token.id, seat);
    testing = Boolean(on);
    if (!testing) return;
    const x = Number(at?.x);
    const y = Number(at?.y);
    working.place({ name: "Test player", owner: TEST_SEAT.name, faction: "friend", ...(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : {}) }, seat);
  }

  function sendMaps() {
    if (mapsPending) return;
    mapsPending = true;
    setImmediate(() => {
      mapsPending = false;
      for (const [ws, client] of clients) {
        if (client.role !== "dm") {
          send(ws, { type: "map", ...map.viewFor(seatOf(client), client.assetToken) });
          continue;
        }
        const working = gmMap();
        const view = working.viewFor(testing ? TEST_SEAT : seatOf(client), client.assetToken);
        send(ws, { type: "map", ...view, prep: working === prep ? working.scene()?.id ?? null : null, testing });
      }
    });
  }

  function seatOf(client) {
    const color = prefs.get(prefsKey(client)).color;
    return { role: client.role, name: client.name, ...(color ? { color } : {}) };
  }

  // A secret line (FG's GM-only message: a hidden creature's turn) reaches the
  // GM, and the one seat it is shown to (shownTo).
  const sameName = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
  const seesLine = (client, line) => {
    // A self roll (Foundry's /selfroll) is the roller's alone.
    if (line.self) return client.id === line.id;
    // A whisper: who sent it, who it is to, and the GM (as FG's GM sees every whisper).
    // A whisper to a character reaches whoever holds it.
    if (line.to)
      return (
        client.role === "dm" ||
        client.id === line.id ||
        line.to.some((name) => sameName(name, client.name) || records.list({ type: "character", owner: client.name }).some((record) => sameName(name, record.name)))
      );
    return !line.secret || client.role === "dm" || (line.shownTo && line.shownTo === client.name);
  };

  // Which of the roller's dice sets a roll is thrown with: damage dice for a
  // damage roll; the GM's NPC dice for a roll as a creature (not the GM, not a
  // character); else their own.
  function lookFor(entry, roller, hand) {
    const label = String(entry.roll?.label ?? "");
    // Who the roll is for: a tracker roll names its actor (by); else who it is from. The tracker's own voice decides nothing.
    const from = String(entry.roll?.by || entry.from || "");
    // A character's own dice (the character tier, kept on its record) for a roll as that character.
    const character = from ? records.list({ type: "character" }).find((record) => sameName(record.name, from) && (roller.role === "dm" || sameName(record.owner, roller.name))) : null;
    const own = character?.data?.dice;
    const damage = /^\[DAMAGE\]/.test(label);
    if (own && damage && diceLook(own.damage)) return diceLook(own.damage);
    if (hand.looks?.damage && damage) return hand.looks.damage;
    if (own && diceLook(own.look)) return diceLook(own.look);
    const asCreature =
      roller.role === "dm" && from && !sameName(from, roller.name) && !/^(gm|dm|agent|combat)$/i.test(from) && !records.list({ type: "character" }).some((record) => sameName(record.name, from));
    if (hand.looks?.npc && asCreature) return hand.looks.npc;
    return hand.look ?? null;
  }

  function addChat(entry) {
    // A roll goes out with the throw its roller just made, for the 3D dice.
    // (A tracker's roll is the agent's: it is thrown by the seat that just asked for it.)
    if (entry.roll) {
      const roller = [...clients.values()].find((client) => client.id === entry.id) ?? (asking && Date.now() - asking.at < 1500 ? asking.client : null);
      const hand = roller?.hand;
      if (hand && Date.now() - hand.at < 4000 && hand.throw) entry.roll.throw = hand.throw;
      const look = hand ? lookFor(entry, roller, hand) : null;
      if (look) entry.roll.look = look;
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
    if (chat.length > MAX_CHAT) chat.shift();
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
  // Active for this campaign (FG's Activation): its records (races, classes,
  // gear, spells, monsters) are loaded into the campaign, as FG makes an active
  // module's records available, and taken out again when it is made inactive.
  // A book the players may read starts shared with them; the GM's books not.
  // Only what the rules use (classes and races, powers, the game's settings,
  // items, creatures): the book's pages, pictures, tables and encounters are
  // read from the module itself (the Books window), as FG reads them, never
  // copied into the campaign (they made it tens of MB, sent to every player).
  const GM_SEAT = { role: "dm", name: "GM" };
  const RULES_TYPES = new Set(["siegepackage", "siegepower", "siegegame", "item", "npc", "spell", "pregencharsheet", ...require("./dnd5e.cjs").TYPES_5E]);
  function loadRecords(info) {
    const file = books?.file?.(info.id);
    if (!file) return;
    const had = records.list({ source: info.name });
    // An earlier, fuller load: take out what the rules do not use.
    for (const record of had) if (!RULES_TYPES.has(record.type)) records.remove(record.id, GM_SEAT);
    if (had.some((record) => RULES_TYPES.has(record.type))) return;
    try {
      importModule(records, GM_SEAT, file, { only: RULES_TYPES });
    } catch {
      /* a module whose records cannot be read is still a book to read */
    }
  }
  // Its module converted first (off this thread, once), so its records load in milliseconds.
  async function activateBook(book, on = true) {
    const info = bookFor(book);
    if (on && !shelf.active.has(info.id)) {
      const file = books?.file?.(info.id);
      if (file) await prepareModule(file);
      shelf.active.add(info.id);
      if (info.forPlayers) shelf.shared.add(info.id);
      loadRecords(info);
    } else if (!on) {
      shelf.active.delete(info.id);
      shelf.shared.delete(info.id);
      for (const record of records.list({ source: info.name })) records.remove(record.id, GM_SEAT);
    }
    shelfChanged();
    return shelfView();
  }
  // The books already active when the campaign opens have their records too:
  // after the table is open, a book at a time, so Play never waits for them.
  const pendingBooks = [...shelf.active];
  const loadNextBook = async () => {
    const id = pendingBooks.shift();
    if (id === undefined) return;
    const info = books?.info(id);
    if (info && fits(info)) {
      const file = books?.file?.(info.id);
      if (file) await prepareModule(file);
      loadRecords(info);
    }
    setTimeout(loadNextBook, 50);
  };
  if (pendingBooks.length > 0 && books) setTimeout(loadNextBook, 300);
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
    return chat.filter((line) => (line.at ?? 0) > since && seesLine(client, line)).slice(-JOIN_CHAT);
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
    if (record.type === "character" || before?.type === "character") sendRoster();
    // Concentration ended on the sheet (or a card, or a long rest): its effects end too.
    if (kind === "upsert" && record.type === "character" && String(before?.data?.concentration ?? "").trim() && !String(record.data?.concentration ?? "").trim()) combat.concentrationCleared(record.id);
    if (combat.entries().some((entry) => entry.recordId === record.id)) sendCombat();
  });

  // Pictures for image layers that came with a map (an FG module's layers, a
  // bundle's tiles): copied into the tile library once, then placed by id.
  function storeTiles(list) {
    if (!tiles || !Array.isArray(list)) return [];
    const out = [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const { bytes, file, ...tile } = entry;
      try {
        if (bytes && file) out.push({ ...tile, src: tiles.add(file, Buffer.from(bytes)).id });
        else if (tile.src && tiles.has(tile.src)) out.push(tile);
      } catch {
        /* a picture the library refuses (too big, not a picture) is left off */
      }
    }
    return out;
  }

  const onRequest = (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    // An FG module's maps as a map bundle, for the GM's Library (its scenes' pins and FX seeded here).
    if (req.method === "GET" && url.pathname === "/table/fg-maps") {
      const token = url.searchParams.get("token") || "";
      const client = token ? [...clients.values()].find((item) => item.assetToken === token) : null;
      if (!client || client.role !== "dm") {
        res.writeHead(403, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      // The book by id, name or title, as the Library reads it (the shelf's file).
      const wanted = require("./library.cjs").resolved(String(url.searchParams.get("module") || ""));
      prepareModule(wanted).then(() => {
      try {
        const { fgModuleBundle } = require("./importers/fgMaps.cjs");
        // One map (the Library's choice), or the module's maps.
        const one = String(url.searchParams.get("only") || "");
        const file = String(url.searchParams.get("file") || "").slice(0, 300);
        // An image Map Studio painted shows its painted picture, wherever it is opened.
        const picture = (id) => studioPicture?.(id) ?? null;
        const bundle = fgModuleBundle(wanted, file ? { file, all: true, picture, ...(one ? { only: [one] } : {}) } : one ? { only: [one], all: true, picture } : { picture });
        for (const [id, extra] of Object.entries(bundle.extras)) map.seed(id, { ...extra, tiles: storeTiles(extra.tiles) });
        res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": bundle.bytes.length, "Cache-Control": "no-store" });
        res.end(Buffer.from(bundle.bytes));
      } catch (error) {
        res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        res.end(error instanceof Error ? error.message : "No maps.");
      }
      });
      return;
    }
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
    // The GM's FG character wizards' pictures (electron/wizardArt.cjs), to every seat.
    if (req.method === "GET" && url.pathname === "/wizard-art") {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      const found = allowed ? require("./wizardArt.cjs").wizardArt(url.searchParams.get("ext") || "", url.searchParams.get("file") || "") : null;
      if (!found) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": found.mime, "Content-Length": found.bytes.length, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
      res.end(found.bytes);
      return;
    }
    // The GM's FG character wizards' words (electron/extLua.cjs): a call of the
    // extension's own script, its icon names resolved to pictures (files).
    if (req.method === "GET" && url.pathname === "/wizard-text") {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      let body = null;
      try {
        const ext = url.searchParams.get("ext") || "";
        const { callExtension, iconFile, extensionString } = require("./extLua.cjs");
        const fn = url.searchParams.get("fn") || "";
        const args = JSON.parse(url.searchParams.get("args") || "[]");
        // "@string": one of the extension's strings by name.
        const values = !allowed ? null : fn === "@string" ? [extensionString(ext, String(args[0] ?? ""))] : callExtension(ext, fn, args);
        if (values) body = { values, files: values.map((value) => (value ? iconFile(ext, value) : null)) };
      } catch {
        body = null;
      }
      res.writeHead(body ? 200 : 404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": body ? "private, max-age=3600" : "no-store" });
      res.end(JSON.stringify(body ?? { values: [] }));
      return;
    }
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
        streamFile(found.path, res);
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
        // A record a page links to (a creature, spell, item...), as FG opens it from the book.
        if (url.pathname === "/book/record") {
          const file = books.file?.(book);
          (file ? prepareModule(file) : Promise.resolve())
            .then(() => {
              const found = books.record(book, url.searchParams.get("path") || "");
              return found ? json(found) : nothing();
            })
            .catch(() => nothing());
          return;
        }
        if (url.pathname === "/book/contents" || url.pathname === "/book/page") {
          // A book's module converted first, off this thread (once), so the table never waits on it.
          const file = books.file?.(book);
          (file ? prepareModule(file) : Promise.resolve())
            .then(() => json(url.pathname === "/book/contents" ? books.contents(book) : books.page(book, url.searchParams.get("page") || "")))
            .catch(() => nothing());
          return;
        }
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
          streamFile(found.path, res, { start, end });
          return;
        }
        res.writeHead(200, { "Content-Type": found.mime, "Content-Length": stat.size, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" });
        streamFile(found.path, res);
      });
      return;
    }
    // Background decals and wallpapers: the list for the GM's picker, and the pictures for every seat.
    const pictures = { "/decal/list": decals, "/decal/file": decals, "/wallpaper/list": wallpapers, "/wallpaper/file": wallpapers, "/gmicon/list": gmIcons, "/gmicon/file": gmIcons, "/tile/list": tiles, "/tile/file": tiles };
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
      const kind = url.searchParams.get("kind") === "portrait" ? "picture" : url.searchParams.get("kind") === "card" ? "card" : "token";
      // A character's: its token (or portrait, or its race and class's), from the art library, as a still.
      if (allowed && record.type === "character" && art) {
        const data = record.data ?? {};
        const wanted = kind === "picture" ? [data.portrait, data.token] : [data.token, data.portrait];
        const id = [...wanted, artForCharacter(data)].find((item) => typeof item === "string" && art.has(item));
        const still = id && /\.webm$/i.test(id) && art.has(id.replace(/\.webm$/i, ".png")) ? id.replace(/\.webm$/i, ".png") : id;
        const file = still ? art.file(still) : null;
        if (file) {
          let bytes;
          try {
            bytes = fs.readFileSync(file.path);
          } catch {
            res.writeHead(404, { "Cache-Control": "no-store" });
            res.end();
            return;
          }
          res.writeHead(200, { "Content-Type": file.mime, "Content-Length": bytes.length, "Cache-Control": "private, max-age=300" });
          res.end(bytes);
          return;
        }
      }
      // A player's own record (a note, their character) may show a picture from
      // the module it came from or a book shared with them, never from the GM's other modules.
      const reference = record?.data?.[kind] || record?.data?.picture || record?.data?.token;
      const named = String(reference ?? "").split("@")[1]?.trim() ?? "";
      const reaches = !named || client?.role === "dm" || !record.owner || named === record.source || canRead(client, named);
      const picture = allowed && reaches ? modulePicture(reference, record.source) : null;
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
  };
  // No request can take the table down: a bad one (a malformed address, a file
  // gone from the disk) gets an error answer, and the table plays on.
  const server = http.createServer((req, res) => {
    try {
      onRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(400, { "Cache-Control": "no-store" });
      res.end();
    }
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

  // The GM's account controls, for the Players window and the agent.
  function accountAction(input) {
    if (!accounts) throw new Error("This table keeps no accounts.");
    const action = String(input?.action ?? "list");
    const name = text(input?.name, "").slice(0, 24);
    let done = null;
    if (action === "create") done = accounts.create(name, String(input?.password ?? ""), { signIn: false }).name;
    else if (action === "password") done = accounts.setPassword(name, String(input?.password ?? "")).name;
    else if (action === "remove") {
      done = accounts.remove(name).name;
      prefs.remove(done);
    }
    else if (action !== "list") throw new Error("action is list, create, password or remove.");
    const seated = new Set([...clients.values()].filter((item) => item.role === "player").map((item) => item.name.toLowerCase()));
    return { ...(done ? { done: `${action} ${done}` } : {}), accounts: accounts.list().map((row) => ({ ...row, seated: seated.has(row.name.toLowerCase()) })) };
  }

  // FG's character list: every character at the table, for the portrait bar
  // and Character Selection. Everyone is told only the face of each: name,
  // portrait, species, class and level, who holds it, and whether they are
  // seated. A character no one holds ("Server" in FG) a player may take.
  function rosterView() {
    const seated = new Set([...clients.values()].filter((item) => item.joined && item.role === "player").map((item) => item.name));
    return records
      .list({ type: "character" })
      .map((record) => {
        const data = record.data ?? {};
        const packages = data.packages && typeof data.packages === "object" ? Object.values(data.packages) : [];
        const classes = packages
          .filter((pkg) => pkg && String(pkg.packagetype).toLowerCase() === "class")
          .map((pkg) => `${pkg.name} ${Number(pkg.level) || 1}`)
          .join(" / ");
        return {
          id: record.id,
          name: record.name,
          owner: record.owner,
          online: Boolean(record.owner) && seated.has(record.owner),
          portrait: typeof data.portrait === "string" ? data.portrait : null,
          species: String(data.race ?? data.species ?? ""),
          classes,
          level: Number(data.level) || 0,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  function sendRoster() {
    broadcast({ type: "roster", roster: rosterView() });
  }

  // Who a player speaks and rolls as (FG's identity list): one of the characters
  // they hold, or themselves ("").
  function speaksAs(client, name) {
    const wanted = text(name, "").slice(0, 120);
    if (!wanted) return "";
    return records.list({ type: "character", owner: client.name }).some((record) => record.name === wanted) ? wanted : "";
  }

  // A player takes a character no one holds (FG's Character Selection): it
  // becomes theirs, seen by them and the GM.
  function takeCharacter(client, id) {
    if (client.role === "dm") throw new Error("The GM gives a character to a player by setting its owner.");
    const record = records.get(text(id, ""));
    if (!record || record.type !== "character") throw new Error("There is no such character.");
    if (record.owner && record.owner !== client.name) throw new Error(`${record.name} is ${record.owner}'s.`);
    return records.update(record.id, { owner: client.name, visibility: "owner" }, { role: "dm", name: "GM" });
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
    if (client.role === "player") sendRoster();
  }

  // Wrong passwords (the table's or an account's), by address: after five
  // in a row, that address waits before it may try again, longer each time.
  const misses = new Map();
  const waitFor = (address) => Math.max(0, (misses.get(address)?.until ?? 0) - Date.now());
  const missed = (address) => {
    const miss = misses.get(address) ?? { count: 0, until: 0 };
    miss.count += 1;
    if (miss.count >= 5) miss.until = Date.now() + Math.min(5 * 60_000, 15_000 * 2 ** (miss.count - 5));
    misses.set(address, miss);
    if (misses.size > 2000) misses.delete(misses.keys().next().value);
  };

  wss.on("connection", (ws, request) => {
    const remote = request.socket?.remoteAddress || ws._socket?.remoteAddress || "";
    // A browser joins from this table's own page: another website's page may
    // not open a seat here. (Kraken's own app, joining from its window, is no website.)
    const origin = String(request.headers?.origin ?? "");
    if (/^https?:/i.test(origin) && !isLoopback(remote)) {
      let host = "";
      try {
        host = new URL(origin).host;
      } catch {
        /* not an address */
      }
      if (host !== String(request.headers?.host ?? "")) {
        ws.close();
        return;
      }
    }
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
        // FG's other dice sets: the GM's NPC dice, and damage dice.
        const npc = diceLook(msg.looks?.npc);
        const damage = diceLook(msg.looks?.damage);
        client.hand = { throw: diceThrow(msg.throw), look, looks: npc || damage ? { npc, damage } : client.hand?.looks ?? null, at: Date.now() };
      }

      if (!client.joined) {
        if (msg.type !== "join") {
          ws.close();
          return;
        }
        const wait = waitFor(remote);
        if (wait > 0) {
          send(ws, { type: "no", reason: `Too many wrong passwords: try again in ${Math.ceil(wait / 1000)} seconds.` });
          ws.close();
          return;
        }
        if (password && !sameSecret(msg.password ?? "", password)) {
          missed(remote);
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
        // "@..." names are the table's own keys (the GM's settings are kept as "@gm").
        if (client.role === "player" && client.name.startsWith("@")) {
          send(ws, { type: "no", reason: "A name cannot start with @." });
          ws.close();
          return;
        }
        // A player's account (accounts.cjs): a name with one needs its password,
        // or the token this browser kept; a new name with a password makes one.
        // A name already at the table cannot sit twice.
        if (client.role === "player") {
          const refuse = (reason, extra = {}) => {
            send(ws, { type: "no", reason, ...extra });
            ws.close();
          };
          if (!accounts?.has(client.name) && [...clients.values()].some((seat) => seat.role === "player" && sameName(seat.name, client.name))) return refuse(`Someone named ${client.name} is already at the table.`);
          const account = msg.account && typeof msg.account === "object" ? msg.account : {};
          const accountPassword = typeof account.password === "string" ? account.password : "";
          const accountToken = typeof account.token === "string" ? account.token.slice(0, 100) : "";
          if (accounts?.has(client.name)) {
            const signed = accounts.signIn(client.name, { password: accountPassword, token: accountToken });
            if (!signed && accountPassword) missed(remote);
            if (signed) misses.delete(remote);
            if (!signed)
              return refuse(
                accountPassword
                  ? `Wrong password for ${accounts.nameOf(client.name)}. If you forgot it, the GM can set a new one (Players window).`
                  : `${accounts.nameOf(client.name)} has an account: enter its password.`,
                { account: "password" },
              );
            client.name = signed.name;
            client.accountToken = signed.token;
            // Signed in again (a reload, another device): this seat takes the place of the old one.
            for (const [other, seat] of [...clients]) {
              if (seat.role !== "player" || !sameName(seat.name, client.name)) continue;
              send(other, { type: "kicked", reason: `${client.name} signed in somewhere else.` });
              other.close();
              removeClient(other);
            }
          } else if (accounts && accountPassword) {
            try {
              const made = accounts.create(client.name, accountPassword);
              client.name = made.name;
              client.accountToken = made.token;
            } catch (error) {
              return refuse(error.message, { account: "new" });
            }
          }
        }
        client.assetToken = crypto.randomBytes(18).toString("hex");
        client.joined = true;
        clearTimeout(joinTimer);
        clients.set(ws, client);
        send(ws, {
          type: "ok",
          ruleset,
          you: { id: client.id, name: client.name, role: client.role, assetToken: client.assetToken, ...(client.accountToken ? { accountToken: client.accountToken } : {}), account: Boolean(accounts?.has(client.name)) },
          players: playerList(),
          map: map.viewFor(seatOf(client), client.assetToken),
          combat: combat.viewFor(seatOf(client)),
          chat: chatFor(client),
          options,
          soundscape,
          books: shelfView(),
          quickSlots: slotsFor(client),
          prefs: prefs.get(prefsKey(client)),
          ...(client.role === "dm" ? { bookSounds: Object.fromEntries(bookSounds), sceneSound: sceneSoundView() } : {}),
          records: records.list({ seat: seatOf(client) }),
          scene: client.role === "player" ? sceneFor(client) : null,
          roster: rosterView(),
        });
        broadcast({ type: "players", players: playerList() }, ws);
        if (client.role === "player") broadcast({ type: "roster", roster: rosterView() }, ws);
        party
          .partyView(agentHandle)
          .then((view) => send(ws, { type: "party", party: view }))
          .catch(() => undefined);
        return;
      }

      // The GM shares a book with the players, or stops; shows them a picture
      // (it opens as a tab on their screens), or takes it back.
      if (msg.type === "book-sound") {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM keeps sounds in the books." });
          return;
        }
        try {
          setBookSound(msg);
        } catch (error) {
          send(ws, { type: "error", reason: error.message });
        }
        return;
      }

      if (msg.type === "book-activate" || msg.type === "book-share" || msg.type === "image-share" || msg.type === "image-unshare") {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM shares books and pictures." });
          return;
        }
        try {
          if (msg.type === "book-activate") activateBook(msg.book, msg.active !== false).catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
          else if (msg.type === "book-share") shareBook(msg.book, msg.shared !== false);
          else if (msg.type === "image-share") showImage(msg.book, msg.file, msg.name);
          else hideImage(msg.id);
        } catch (error) {
          send(ws, { type: "error", reason: error.message });
        }
        return;
      }

      // A browser signs out of its account: its token is forgotten.
      if (msg.type === "sign-out") {
        if (accounts && client.role === "player") accounts.signOut(client.name, typeof msg.token === "string" ? msg.token : "");
        return;
      }

      // The GM's account controls (the Players window): list, make one for a
      // player, set a new password, remove one.
      if (msg.type === "accounts") {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM manages accounts." });
          return;
        }
        try {
          send(ws, { type: "accounts", ...accountAction(msg), req: msg.req });
        } catch (error) {
          send(ws, { type: "accounts", error: error.message, accounts: accounts?.list() ?? [], req: msg.req });
        }
        return;
      }

      // FG's Character Selection: a player takes a character no one holds.
      if (msg.type === "take-character") {
        try {
          const record = takeCharacter(client, msg.id);
          send(ws, { type: "op-result", req: msg.req, ok: true, id: record.id });
        } catch (error) {
          send(ws, { type: "op-result", req: msg.req, ok: false, error: error.message });
        }
        return;
      }

      // A person's own settings (their colour, dice, how dice show), kept for them
      // by name; every browser they sit at gets them.
      if (msg.type === "prefs") {
        try {
          const next = prefs.set(prefsKey(client), msg.patch);
          for (const [other, seat] of clients) if (prefsKey(seat) === prefsKey(client)) send(other, { type: "prefs", prefs: next });
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Your settings could not be kept." });
        }
        return;
      }

      // A seat's quick slots, set (each seat its own).
      if (msg.type === "quickslots") {
        const slots = cleanSlots(msg.slots);
        quickSlots.set(clearKey(client), slots);
        for (const [other, seat] of clients) if (clearKey(seat) === clearKey(client)) send(other, { type: "quickslots", slots });
        onChange("table");
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
        const as = client.role === "dm" ? text(msg.as, "").slice(0, 24) : speaksAs(client, msg.as);
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
          } else rollDice(msg.formula, msg.label, client.role === "dm" ? (msg.as ? text(msg.as, "").slice(0, 24) : client.name) : speaksAs(client, msg.as) || client.name, client.id, msg.tag);
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." });
        }
        return;
      }

      // The creation wizard's finished character: the host builds it from the
      // spec with the campaign's books. A player's character is theirs.
      if (msg.type === "build-character") {
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        if (ruleset === require("./astra.cjs").RULESET_NAME) {
          // An Apeira Astra character from its wizard's spec.
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./astra.cjs")
            .buildAstra(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.origin ?? ""} ${(record.data.paths ?? []).join(" / ")}.`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
        if (require("./mgt2.cjs").isMgt2Ruleset(ruleset)) {
          // A Traveller from its wizard's spec.
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./mgt2.cjs")
            .buildMgt2(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.upp}${record.data.careers?.length ? `, ${record.data.careers.map((career) => `${career.name} (${career.terms} term${career.terms === 1 ? "" : "s"})`).join(", ")}` : ""}.`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
        if (require("./adnd2e.cjs").is2eRuleset(ruleset)) {
          // A 2E character from its wizard's spec, or a book's pregen.
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./adnd2e.cjs")
            .build2e(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.race ?? ""} ${(record.data.classes ?? []).map((cls) => cls.name).join("/")} ${record.data.level}.`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
        if (require("./dnd35.cjs").is35Ruleset(ruleset)) {
          // A 3.5E character from its wizard's spec.
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./dnd35.cjs")
            .build35(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.race ?? ""} ${record.data.classes?.[0]?.name ?? ""} ${record.data.level}.`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
        if (require("./dnd5e.cjs").isD20Ruleset(ruleset)) {
          // A 5E character from its wizard's spec.
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./dnd5e.cjs")
            .build5e(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.species ?? ""} ${msg.spec?.class ?? ""} ${record.data.level}.`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
        siege()
          .then(({ builder }) => {
            const library = siegeLibrary(records);
            const { character, report } = builder.buildFromSpec(msg.spec ?? {}, library);
            if (!character) throw new Error(report.problems.join("; ") || "Could not build that character.");
            const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
            const record = records.create(
              { type: "character", name: character.name || "Unnamed character", owner, visibility: owner ? "owner" : "gm", data: withArt(character, msg.spec, agentHandle.art) },
              client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name },
            );
            addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${character.race ?? ""} ${msg.spec?.class ?? ""} ${character.level ?? 1}.`, at: Date.now() });
            answer({ ok: true, id: record.id, problems: report.problems });
          })
          .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
        return;
      }

      // A character file from another table. A player's import is theirs;
      // the GM's is for the player named (or the GM's own).
      if (msg.type === "character-import") {
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
        importCharacter(agentHandle, msg.text, { owner, seat: client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name } })
          .then(({ record, format, report }) => {
            addChat({ id: client.id, from: client.name, text: `Imported ${record.name}${client.role === "dm" ? "" : `, level ${Number(record.data?.level) || 0}`} (${format === "fg" ? "Fantasy Grounds" : format === "foundry" ? "Foundry VTT" : format === "roll20" ? "Roll20" : format === "kraken" ? "Kraken" : "a file"}).`, at: Date.now() });
            answer({ ok: true, id: record.id, report });
          })
          .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not import that character." }));
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

      // Apeira Astra: experience spent on a skill or a characteristic.
      if (msg.type === "character-improve") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot improve that character." });
          return;
        }
        require("./astra.cjs")
          .improveAstra(agentHandle, record, { skill: msg.skill ? String(msg.skill) : "", attribute: msg.attribute ? String(msg.attribute) : "" }, seatOf(client), client.role === "dm" ? record.name : client.name)
          .catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not improve." }));
        return;
      }

      // FG's Library of an adventure module (the GM's): NPCs, encounters, parcels, tables.
      if (msg.type === "library") {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "The Library is the GM's." });
          return;
        }
        const library = require("./library.cjs");
        (async () => {
          const moduleName = String(msg.module ?? "");
          // Its module converted first, off this thread (once).
          await prepareModule(library.resolved(moduleName));
          if (msg.action === "list") send(ws, { type: "library", module: moduleName, kind: msg.kind, items: library.list(moduleName, String(msg.kind ?? ""), String(msg.search ?? "")) });
          else if (msg.action === "npc") await combat.add({ recordId: library.ensureNpc(agentHandle, String(msg.path)).id, count: msg.count }, seatOf(client));
          else if (msg.action === "battle") await library.addBattle(agentHandle, String(msg.path), { place: msg.place !== false });
          else if (msg.action === "parcel") library.giveParcel(agentHandle, String(msg.path), party);
          else if (msg.action === "table") library.rollTable(agentHandle, String(msg.path), client.name);
          else if (msg.action === "story") send(ws, { type: "library", module: moduleName, kind: `story:${msg.path}`, items: [library.storyEntry(String(msg.path))] });
          else throw new Error("What should the Library do?");
        })().catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "The Library could not do that." }));
        return;
      }

      // Dual class or reclass at a level up: the owner or the GM.
      if (msg.type === "class-change") {
        const record = records.get(String(msg.id ?? ""), seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot change that character's class." });
          return;
        }
        changeClass(agentHandle, record, String(msg.mode), String(msg.className ?? ""), client.role === "dm" ? record.name : client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not change the class." }),
        );
        return;
      }

      // A record dropped on a character sheet (FG's sheet drop): a race or
      // class, a spell, an item. The owner or the GM, with a record this seat sees.
      if (msg.type === "character-drop") {
        const record = records.get(String(msg.id ?? ""), seatOf(client));
        const source = records.get(String(msg.recordId ?? ""), seatOf(client));
        if (!record || record.type !== "character" || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot change that character." });
          return;
        }
        dropOnCharacter(agentHandle, record, source, client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "That does not go on the sheet." }),
        );
        return;
      }

      // A SIEGE check from a sheet: the owner or the GM rolls it.
      // The character sheet: fields typed on it, then every number worked out again.
      // Starships (the 2d6 games): the GM makes one from a design; its sheet's
      // edits (a player takes a station with their own character).
      if (msg.type === "starship") {
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        const ships = require("./starships.cjs");
        const work =
          msg.action === "create"
            ? ships.createShip(agentHandle, { name: text(msg.name, ""), design: text(msg.design, "Free Trader"), visibility: msg.visibility === "gm" ? "gm" : "all" }, seatOf(client))
            : (async () => {
                const record = records.get(String(msg.id ?? ""), seatOf(client));
                if (!record || record.type !== "starship") throw new Error("No such ship.");
                return ships.editShip(agentHandle, record, msg.changes, seatOf(client));
              })();
        work.then((record) => answer({ ok: true, id: record.id })).catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      // Traveller's character wizard (the GM's KrakenCharWizardMGT2): a player's Traveller made term by term, the host's dice rolling.
      if (msg.type === "mgt2-life") {
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
        require("./mgt2.cjs")
          .lifeAction(agentHandle, owner, { action: text(msg.action, "view"), name: text(msg.name, ""), fn: text(msg.fn, ""), args: Array.isArray(msg.args) ? msg.args.slice(0, 4) : [], build: msg.build && typeof msg.build === "object" ? msg.build : undefined }, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name, player: true })
          .then((result) => answer({ ok: true, id: result.id ?? "", life: result.life ?? null, problems: result.problems ?? [] }))
          .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      if (msg.type === "character-edit") {
        const record = records.get(String(msg.id ?? ""), seatOf(client));
        if (!record || record.type !== "character") {
          send(ws, { type: "error", reason: "No such character." });
          return;
        }
        editCharacter(agentHandle, record, msg.changes, seatOf(client)).catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not change that." }));
        return;
      }

      if (msg.type === "siege-check") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot roll for that character." });
          return;
        }
        siegeCheck(agentHandle, record, { attribute: msg.attribute, cl: msg.cl, bonus: msg.bonus, label: msg.label, addLevel: typeof msg.addLevel === "boolean" ? msg.addLevel : undefined, ...(["check", "save", "skill"].includes(msg.kind) ? { kind: msg.kind, skill: text(msg.skill, ""), dc: num(msg.dc, 0), advantage: ["advantage", "disadvantage", "boon", "bane"].includes(msg.advantage) ? msg.advantage : "" } : {}) }, client.role === "dm" ? record.name : client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." }),
        );
        return;
      }

      // Record changes from a client: { op: create | update | delete, ... }.
      // The answer carries req back so the client can match it.
      if (msg.type === "op") {
        const seat = seatOf(client);
        try {
          if (seat?.role !== "dm") playerOp(msg, records);
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
      if (["sound-play", "sound-stop", "ambience", "music", "sound-triggers", "scene-sound"].includes(msg.type)) {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM plays sounds for the table." });
          return;
        }
        try {
          if (msg.type === "sound-play") playSound(msg.id, msg.volume);
          else if (msg.type === "sound-stop") broadcast({ type: "sound-stop", ...(typeof msg.id === "string" && msg.id ? { id: msg.id.slice(0, 300) } : {}) });
          else if (msg.type === "ambience") ambience(msg.action, msg.id, msg.volume);
          else if (msg.type === "scene-sound") sceneSound(String(msg.action ?? "view"));
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

      // The GM's image window: an image opened privately, closed, or a test.
      if (msg.type === "prep-close" || msg.type === "playtest") {
        if (client.role !== "dm") return;
        try {
          if (msg.type === "prep-close") {
            testing = false;
            prep.clearScene();
          } else setPlaytest(Boolean(msg.on), msg.at);
          sendMaps();
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
        }
        return;
      }

      // The map: tokens, doors, line of sight and pings (mapState.cjs decides
      // who may do what).
      if (["token-place", "token-move", "token-remove", "token-update", "door", "sight", "lock", "scene-settings", "light-place", "light-update", "light-remove", "draw", "draw-erase", "draw-clear", "wall", "map-undo", "mask", "label", "map-group", "fx", "tile"].includes(msg.type)) {
        const working = mapOf(client);
        // Testing: the GM's moves of the test token are a player's (walls, locks).
        const testToken = (id) => testing && client.role === "dm" && working.tokens().some((token) => token.id === id && token.owner === TEST_SEAT.name);
        const seat = seatOf(client);
        try {
          if (msg.type === "token-place") {
            working.place({ recordId: msg.recordId, name: msg.name, x: num(msg.x, NaN), y: num(msg.y, NaN), hidden: msg.hidden }, seat);
          } else if (msg.type === "token-move" && Array.isArray(msg.moves)) {
            // A group dragged together.
            const moved = working.moveMany(msg.moves.slice(0, 400), seat, { snap: msg.snap !== false });
            if (moved.some((item) => item.blocked)) send(ws, { type: "notice", text: "A wall is in the way." });
          } else if (msg.type === "token-move") {
            const to = { x: num(msg.x, NaN), y: num(msg.y, NaN) };
            if (!Number.isFinite(to.x) || !Number.isFinite(to.y) || Math.abs(to.x) > 1e7 || Math.abs(to.y) > 1e7) throw new Error("Where to?");
            const { blocked } = working.move(String(msg.id ?? ""), to, testToken(String(msg.id ?? "")) ? TEST_SEAT : seat, { snap: msg.snap !== false });
            if (blocked) send(ws, { type: "notice", text: "A wall is in the way." });
          } else if (msg.type === "token-remove") {
            working.remove(String(msg.id ?? ""), seat);
          } else if (msg.type === "token-update") {
            working.update(String(msg.id ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "door") {
            working.setDoor(String(msg.id ?? ""), msg.state === undefined ? undefined : num(msg.state, -1), seat);
          } else if (msg.type === "sight") {
            if (client.role !== "dm") throw new Error("Only the GM can change line of sight.");
            working.setSight(Boolean(msg.on));
          } else if (msg.type === "scene-settings") {
            working.updateSettings(msg.patch ?? {}, seat);
          } else if (msg.type === "draw") {
            working.draw({ points: msg.points, color: msg.color, width: msg.width, shape: msg.shape, fill: msg.fill, fillAlpha: msg.fillAlpha, alpha: msg.alpha, group: msg.group }, seat);
          } else if (msg.type === "draw-erase") {
            working.erase(String(msg.id ?? ""), seat);
          } else if (msg.type === "draw-clear") {
            working.clearDrawings(seat);
          } else if (msg.type === "light-place") {
            working.placeLight(msg.light ?? {}, seat);
          } else if (msg.type === "light-update") {
            working.updateLight(String(msg.id ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "light-remove") {
            working.removeLight(String(msg.id ?? ""), seat);
          } else if (msg.type === "wall") {
            // The GM's map editor: walls drawn, changed, split, removed, cleared; every door closed.
            const ids = Array.isArray(msg.ids) ? msg.ids.map(String) : msg.id ? [String(msg.id)] : [];
            if (msg.action === "add") working.addWalls(msg.wall ?? {}, seat);
            else if (msg.action === "update") working.updateWalls(ids, msg.patch ?? {}, seat);
            else if (msg.action === "remove") working.removeWalls(ids, seat);
            else if (msg.action === "move") working.moveWalls(ids, num(msg.dx, NaN), num(msg.dy, NaN), seat);
            else if (msg.action === "move-point") working.movePoint(msg.from, msg.to, ids, seat);
            else if (msg.action === "split") working.splitWall(ids[0], num(msg.x, NaN), num(msg.y, NaN), seat);
            else if (msg.action === "clear") working.clearWalls(seat);
            else if (msg.action === "close-doors") working.closeDoors(seat);
            else throw new Error("What should the walls do?");
          } else if (msg.type === "map-undo") {
            working.undo(seat);
          } else if (msg.type === "label") {
            if (msg.action === "add") working.addLabel(msg.label ?? {}, seat);
            else if (msg.action === "update") working.updateLabel(String(msg.id ?? ""), msg.patch ?? {}, seat);
            else if (msg.action === "remove") working.removeLabel(String(msg.id ?? ""), seat);
            else if (msg.action === "renumber") working.renumber(String(msg.group ?? ""), seat, num(msg.start, 1));
            else throw new Error("What should the text do?");
          } else if (msg.type === "fx") {
            if (msg.action === "add") working.addFx(msg.fx ?? {}, seat);
            else if (msg.action === "update") working.updateFx(String(msg.id ?? ""), msg.patch ?? {}, seat);
            else if (msg.action === "remove") working.removeFx(String(msg.id ?? ""), seat);
            else throw new Error("What should the effect do?");
          } else if (msg.type === "tile") {
            if (msg.action === "add") working.addTile(msg.tile ?? {}, seat);
            else if (msg.action === "update") working.updateTile(String(msg.id ?? ""), msg.patch ?? {}, seat);
            else if (msg.action === "order") working.orderTile(String(msg.id ?? ""), typeof msg.where === "number" ? Math.round(msg.where) : String(msg.where ?? ""), seat);
            else if (msg.action === "remove") working.removeTile(String(msg.id ?? ""), seat);
            else throw new Error("What should the image layer do?");
          } else if (msg.type === "map-group") {
            if (msg.action === "remove") working.removeGroup(String(msg.name ?? ""), seat);
            else working.updateGroup(String(msg.name ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "mask") {
            working.setMask({ action: String(msg.action ?? ""), points: msg.points, id: msg.id }, seat);
          } else if (msg.type === "lock") {
            if (client.role !== "dm") throw new Error("Only the GM can lock token movement.");
            working.setLocked(Boolean(msg.on));
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
            case "place-token": {
              // The GM drags a creature from the tracker onto the map: its token
              // goes where it fell, tied to that entry (players can then target it).
              if (client.role !== "dm") throw new Error("Only the GM places creatures.");
              const entry = combat.entries().find((item) => item.id === msg.id);
              if (!entry) throw new Error("No one like that is in the fight.");
              if (!map.scene()) throw new Error("Open a map first.");
              const old = entry.tokenId ? map.tokens().find((token) => token.id === entry.tokenId) : null;
              const x = num(msg.x, NaN);
              const y = num(msg.y, NaN);
              if (old) return map.move(old.id, { x, y }, seat, { snap: true });
              const token = map.place({ recordId: entry.recordId, name: entry.name, x, y, hidden: entry.hidden, faction: entry.faction, allowSecond: true }, seat);
              return combat.update(entry.id, { tokenId: token.id }, seat);
            }
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
              return combat.save(entry.id, String(msg.attribute), msg.cl, client.role === "dm" ? entry.name : client.name, undefined, String(msg.advantage ?? ""));
            }
            case "cast":
              return combat.cast(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.power), msg.action ? String(msg.action) : "", seat, client.role === "dm" ? "Combat" : client.name);
            case "death-save":
              // 5E: a Dying character's death saving throw (the player rolls their own).
              return combat.deathSave(String(msg.id), seat);
            case "stabilize":
              // Descending Darkness: an ally steadies the dying (Wisdom 12).
              return combat.stabilize(String(msg.id), msg.recordId ? String(msg.recordId) : "", seat);
            case "ship-attack":
              // A ship's weapon fired by its gunner (or the GM) at a ship (Traveller, Apeira Astra).
              return combat.shipAttack(String(msg.id), String(msg.weapon), msg.targetId ? String(msg.targetId) : "", text(msg.range, "Short"), seat, client.role === "dm" ? "" : client.name);
            case "turn-undead":
              // 2E: a cleric (or paladin) turns the undead it targets.
              return combat.turnUndead(msg.id ? String(msg.id) : "", msg.recordId ? String(msg.recordId) : "", Array.isArray(msg.undead) ? msg.undead.map(String).slice(0, 50) : null, seat);
            case "clear-targets":
              return combat.clearTargets(String(msg.id), seat);
            case "target-area": {
              // Feet to scene pixels; each entry's token, by its own or its record's.
              const per = map.units() > 0 ? (map.squareCenter(1, 0, 1).x - map.squareCenter(0, 0, 1).x) / map.units() : 10;
              // No source named: the player's own creature (the active one if several), or the GM's active one.
              const entries = combat.entries();
              const sourceId = msg.id
                ? String(msg.id)
                : client.role === "dm"
                  ? combat.active()
                  : (entries.find((entry) => entry.id === combat.active() && combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine) ?? entries.find((entry) => combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine))?.id;
              if (!sourceId) throw new Error(client.role === "dm" ? "Whose spell? Start combat first." : "Your character is not in the fight.");
              return combat.targetArea(sourceId, { x: num(msg.x, 0), y: num(msg.y, 0), radius: num(msg.radius, 0) * per, faction: msg.faction ?? null }, seat, (entry) => map.tokens().find((token) => token.id === entry.tokenId) ?? map.tokens().find((token) => entry.recordId && token.recordId === entry.recordId) ?? null);
            }
            case "attack":
              return combat.attack(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.weapon), seat, client.role === "dm" ? "Combat" : client.name, { full: Boolean(msg.full) });
            case "damage-roll":
              return combat.damageRoll(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.weapon), seat, client.role === "dm" ? "Combat" : client.name);
            case "heal":
              return combat.heal(String(msg.id), msg.amount, seat);
            case "krits": {
              const settings = await combat.krits(msg.settings, seat);
              send(ws, { type: "krits", ...settings });
              return;
            }
            case "krit-test":
              return combat.kritTest(String(msg.kind), String(msg.id), msg.targetId ? String(msg.targetId) : null, seat);
            default:
              throw new Error("Unknown tracker action.");
          }
        };
        run().catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      // The party's watch order and formation: a player places their own
      // characters; the GM anyone, and fills, turns and clears the formation.
      if (msg.type === "party-order") {
        try {
          party.changeOrder(agentHandle, seatOf(client), msg);
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." });
        }
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

      // The GM shares the map (FG's Share on an image): it opens on every player's screen, closed or not.
      if (msg.type === "map-share") {
        if (client.role !== "dm" || !scene) return;
        broadcast({ type: "map-share", name: scene.name });
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
        // An image opened in the GM's image window: theirs alone, same master.
        if (msg.prep) {
          testing = false;
          if (Array.isArray(msg.scene?.tiles) && msg.scene.tiles.length) prep.seed(next.id, { tiles: storeTiles(msg.scene.tiles.slice(0, 300)) });
          prep.setScene(next);
          sendMaps();
          return;
        }
        // Put in play: the image window's image is the table's now.
        if (prep.scene()?.id === next.id) {
          testing = false;
          prep.clearScene();
        }
        const opened = scene?.id !== next.id;
        scene = next;
        // A scene with its own sound starts it (the soundscape goes on otherwise).
        if (opened && sceneSounds.has(next.id)) setSoundscape(sceneSounds.get(next.id));
        if (opened) sendSceneSound();
        // A bundle's tiles (Foundry's), placed the first time the scene opens.
        if (Array.isArray(msg.scene?.tiles) && msg.scene.tiles.length) map.seed(next.id, { tiles: storeTiles(msg.scene.tiles.slice(0, 300)) });
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

  // The Library reads a book by its id, name or title from the shelf's own file.
  if (books) {
    require("./library.cjs").useShelf((given) => {
      const wanted = String(given ?? "");
      const found = books.list().find((info) => info.id === wanted || info.name === wanted || info.title === wanted);
      return found ? books.file?.(found.id) ?? null : null;
    });
  }
  let bookTablesCache = { key: null, tables: [] };
  // What agents (the MCP server, the in-app assistant) use. They act as the GM.
  const agentHandle = {
    seat: { role: "dm", name: "Agent" },
    // The campaign's ruleset ("Castles & Crusades", "D&D 5E", "Worldbuilding").
    ruleset: () => ruleset,
    // FG's character list: every character's face, who holds it, who is seated.
    roster: () => rosterView(),
    // Players' accounts: list, create, password, remove (accountAction).
    accounts: (input) => accountAction(input),
    records,
    dice,
    options: () => ({ ...options }),
    // The active books' random tables (the 2E krits find their Krits & Fumbles book's), read once per set of active books.
    bookTables: () => {
      const names = [...shelf.active].map((id) => books?.info(id)).filter((info) => info && fits(info)).map((info) => books?.file?.(info.id) || info.name);
      const key = names.join("|");
      if (bookTablesCache.key !== key) {
        bookTablesCache = {
          key,
          tables: names.flatMap((name) => {
            try {
              return require("./library.cjs").tables(name);
            } catch {
              return [];
            }
          }),
        };
      }
      return bookTablesCache.tables;
    },
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
    chatLog: (count = 20) => chat.slice(-Math.max(1, Math.min(MAX_CHAT, Number(count) || 20))),
    players: () => playerList(),
    scene: () => scene,
    // The map the GM works on: the image window's while one is open (the same master), else the table's.
    get map() {
      return gmMap();
    },
    tableMap: map,
    combat,
    viewFor: (name) => map.viewFor({ role: "player", name }, ""),
    decals: () => decals,
    tiles: () => tiles,
    wallpapers: () => wallpapers,
    gmIcons: () => gmIcons,
    sounds: () => sounds,
    playSound,
    stopSounds: () => (broadcast({ type: "sound-stop" }), { stopped: true }),
    ambience,
    music,
    soundscape: () => soundscape,
    sceneSound,
    storeTiles,
    // Books: what there is, a book's contents and pages, and sharing.
    books: () => shelfFor({ role: "dm" }),
    // A person's own settings (the GM's, or a player's by name), read or set.
    prefs(who = "@gm", patch) {
      const key = who === "GM" || who === "" ? "@gm" : who;
      if (patch === undefined) return prefs.get(key);
      const next = prefs.set(key, patch);
      for (const [ws, seat] of clients) if (prefsKey(seat) === key) send(ws, { type: "prefs", prefs: next });
      return next;
    },
    diceLook,
    // A seat's quick slots (the GM's, or a player's by name), read or set.
    quickSlots(who = "@gm", slots) {
      const key = who === "GM" || who === "" ? "@gm" : who;
      if (slots !== undefined) {
        const cleaned = cleanSlots(slots);
        quickSlots.set(key, cleaned);
        for (const [ws, seat] of clients) if (clearKey(seat) === key) send(ws, { type: "quickslots", slots: cleaned });
        onChange("table");
      }
      return quickSlots.get(key) ?? cleanSlots([]);
    },
    activateBook,
    bookContents: async (book) => {
      if (!books) throw new Error("There are no books here.");
      const file = books.file?.(book);
      if (file) await prepareModule(file);
      return books.contents(book);
    },
    bookPage: async (book, page) => {
      if (!books) throw new Error("There are no books here.");
      const file = books.file?.(book);
      if (file) await prepareModule(file);
      return books.page(book, page);
    },
    shelf: shelfView,
    bookSounds: () => Object.fromEntries(bookSounds),
    setBookSound,
    shareBook,
    showImage,
    hideImage,
    triggers: () => soundTriggers,
    setTriggers,
    // The GM's portraits and tokens (artLibrary.cjs), as the pickers show them.
    art: (kind) => (art ? art.list(kind) : []),
    // The map shared: open on every player's screen (the GM's Share with players).
    shareMap() {
      if (!scene) throw new Error("No scene is on the table.");
      broadcast({ type: "map-share", name: scene.name });
      return { shared: scene.name };
    },
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
  // Music: one track, looped; or a folder, a track at a time from it, never
  // the same one twice running, and round again (a folder of one track loops it).
  function music(action, idOrGroup, extra = {}) {
    if (action === "stop") return setSoundscape({ ...soundscape, music: null });
    if (action === "volume" && soundscape.music) return setSoundscape({ ...soundscape, music: { ...soundscape.music, volume: extra.volume } });
    const wanted = String((action === "next" ? soundscape.music?.group : idOrGroup) ?? idOrGroup ?? "");
    const fromFolder = sounds?.has(wanted) ? null : wanted;
    const inFolder = fromFolder ? sounds.list("music").filter((item) => `music/${item.group}` === fromFolder || `music/${item.group}`.startsWith(`${fromFolder}/`)) : [];
    let picked = sounds?.pick(wanted);
    for (let tries = 0; picked && inFolder.length > 1 && picked.id === soundscape.music?.id && tries < 8; tries++) picked = sounds.pick(wanted);
    if (!picked) throw new Error(`No music "${wanted}".`);
    const loop = extra.loop !== false && (!fromFolder || inFolder.length <= 1);
    return setSoundscape({ ...soundscape, music: { id: picked.id, volume: extra.volume ?? soundscape.music?.volume ?? 0.7, loop, group: fromFolder } });
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
    return prefs.get(prefsKey(client)).color ?? (client.role === "dm" ? "#f4f1ea" : playerColor(client.name));
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
        quickSlots: Object.fromEntries(quickSlots),
        bookSounds: Object.fromEntries(bookSounds),
        sceneSounds: Object.fromEntries(sceneSounds),
      };
    },
    // What agents (the MCP server, the in-app assistant) use. They act as the GM.
    agent: agentHandle,
    ruleset: () => ruleset,
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

module.exports = { createTableServer, decideRole, lanAddresses, eachAddress, diceLook };
