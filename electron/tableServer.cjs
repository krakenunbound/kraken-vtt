const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { settingCalendar } = require("../shared/calendars.mjs");
const { WebSocketServer } = require("ws");
const { createRecordStore, canSee, viewFor, hideNames, RESERVED_NAMES } = require("./records.cjs");
// The players' view of the party sheet and the records (records.cjs viewFor).
const PLAYER_VIEW = { role: "player", name: "" };
const { withArt } = require("./characterArt.cjs");
const { soundFor, cleanTriggers } = require("./soundTriggers.cjs");
const { defaultTriggers, TRIGGERS_VERSION } = require("./soundCatalog.cjs");
const { createDice } = require("./dice.cjs");
const { createModifiers, kindOf: modifierKind, run: modifierScope } = require("./modifiers.cjs");
const { siege, siegeLibrary, siegeCheck, levelUp, changeClass, dropOnCharacter, editCharacter, importCharacter } = require("./siege.cjs");
const { createMapState, playerColor } = require("./mapState.cjs");
const { createPrefsStore } = require("./prefs.cjs");
const party = require("./party.cjs");
const { createCombat } = require("./combat.cjs");
const { modulePicture, importModule, prepareModule } = require("./importers/fgModule.cjs");
const { fitsRuleset } = require("./books.cjs");
const languages = require("../shared/text/languages.mjs");

const MAX_CLIENTS = 16;
// What a player may not do while the GM has paused the game: move or change tokens, open doors, roll, finish a character wizard or improve a character.
const PAUSE_HOLDS = new Set(["token-place", "token-move", "token-update", "token-remove", "token-undo", "door", "roll", "siege-check", "ct", "template", "effects", "cairn", "fate", "ironsworn", "forged", "party-group", "party-prompt-roll", "starship", "bookkeeping", "rest", "build-character", "level-up"]);


// What a player may do with raw record changes (the GM and the agent may do
// anything). Rules records change only through their sheet's own edits, which
// allow a list of fields and work every number out again: a player's raw
// change to a character may set its pictures, dice, spent slots and its
// words (notes, appearance...), never a number the rules read, and a new
// character starts blank. Notes are the player's own.
const PLAYER_CHARACTER_PATHS = [/^portrait$/, /^token$/, /^dice(\..+)?$/, /^slots\.[^.]+\.used$/, /^(notes|appearance|playername|gender|age|height|weight|alignment|personality|ideals|bonds|flaws|backstory)$/];
// Advantage or disadvantage from the modifier box's ADV or DIS chip tags the roll's label as the rules'
// own do (after its name, before [AC ...], [DC ...] or -> [at ...]); both at once cancel.
function edgeTagged(result, label) {
  const said = String(label ?? "");
  const chip = (id) => Array.isArray(result?.mods) && result.mods.some((mod) => mod.key === id);
  const edge = chip("adv") === chip("dis") ? "" : chip("adv") ? "[ADVANTAGE]" : "[DISADVANTAGE]";
  if (!edge || said.includes(edge)) return label;
  const at = said.search(/ \[(AC|DC) | -> /);
  return at < 0 ? `${said.trim()} ${edge}`.trim() : `${said.slice(0, at)} ${edge}${said.slice(at)}`;
}
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
  // Identifying an item is the GM's (FG's Identified toggle), wherever the item is.
  if (msg.patch?.data !== undefined && leafPaths(msg.patch.data).some((path) => /(^|\.)(isidentified|nonid_name|nonid_notes)$/.test(path))) throw new Error("Only the GM identifies an item.");
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

// Only strings and numbers are read from a message: anything else (an object a client crafted) is the fallback.
function text(value, fallback) {
  const raw = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  const clean = raw.replace(/[\u0000-\u001f]/g, "").trim();
  return clean || fallback;
}

function num(value, fallback) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
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
  // A bundle's regions (traps, difficult terrain, teleports): the host keeps them (mapState.cjs), never a player.
  const regions = (Array.isArray(input.regions) ? input.regions : [])
    .filter((region) => region && typeof region === "object")
    .slice(0, 300)
    .map((region, index) => ({
      id: text(region.id, `region-${index}`).slice(0, 60),
      name: text(region.name, "Region").slice(0, 120),
      trap: Boolean(region.trap),
      kind: ["trap", "pit", "difficult", "teleport"].includes(region.kind) ? region.kind : null,
      note: typeof region.note === "string" ? region.note.slice(0, 4000) : "",
      cost: num(region.cost, 2),
      polygons: (Array.isArray(region.polygons) ? region.polygons : []).filter((points) => Array.isArray(points) && points.length >= 6 && points.length <= 2000).slice(0, 20).map((points) => points.map((value) => num(value, 0))),
    }));
  return {
    id: text(input.id, "scene").slice(0, 80),
    name: text(input.name, "Scene").slice(0, 80),
    regions,
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
const DICE_THEMES = new Set(["classic", "dragonhide", "starfall", "bone", "magma", "leviathan", "marble", "swirl", "speckle", "wood", "runes", "stripes", "aether", "reliquary", "rosewindow", "gilded", "emerald", "frost", "obsidian", "bloodstone", "arcane", "void", "hero", "monster", "wizard", "bard", "necromancer", "goblin", "wyrm", "ghost", "undead", "traveller", "mythos", "picture"]);
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
  // A dice pack's picture dice: the picture on their faces, and its glowing part ("<pack>/<file>", dicePacks.cjs).
  const picture = (item) => (typeof item === "string" && item.length <= 300 && /^[^/\\]+\/[^\\]+$/.test(item) && !item.split("/").includes("..") ? item : null);
  if (value.theme === "picture") {
    if (!picture(value.texture)) return null;
    look.texture = value.texture;
    if (picture(value.glowTexture)) look.glowTexture = value.glowTexture;
  }
  return look;
}

// The table's own options. towerReveal: a roll in the dice tower is shown to
// whoever rolled it too (FG shows it to the GM only). decal: the picture on
// the table's background, as FG's Background Decal: "kraken" (the emblem),
// "" (none) or a decal id (decals.cjs). wallpaper: the tiles behind the
// desktop, as FG's desktop theme: "" (plain) or a wallpaper id.
// The GM's chat picture (the Kraken GM Icon extension's): "" for the name alone.
const GM_ICON = "kraken/01 The Kraken.png";
// The dice tower's looks drawn by Kraken (src/ui/TowerArt.tsx); any other
// towerStyle is a picture from the GM's towers folder (assets/towers).
const TOWER_STYLES = ["stone", "oak", "obsidian", "frost", "brass", "bone"];

function cleanDeathMarkerOptions(value) {
  const { MARKER_SETS } = require("../shared/map/deathMarkers.mjs");
  const raw = value && typeof value === "object" ? value : {};
  const sets = new Set(MARKER_SETS.map((set) => set.id));
  const byType = {};
  for (const [type, set] of Object.entries(raw.byType && typeof raw.byType === "object" ? raw.byType : {}).slice(0, 60)) {
    if (set === "" || sets.has(set)) byType[String(type).toLowerCase().slice(0, 40)] = set;
  }
  return { on: raw.on !== false, default: sets.has(raw.default) ? raw.default : "blood-red", byType };
}

function savedOptions(value) {
  const options = value && typeof value === "object" ? value : {};
  const id = (text, fallback) => (typeof text === "string" && text.length <= 400 ? text : fallback);
  return {
    // The GM has paused the game (Foundry's pause): players see a veil, and their moves and rolls wait.
    paused: Boolean(options.paused),
    towerReveal: Boolean(options.towerReveal),
    // The dice tower on the table, apart from the chat (the GM's choice, for every seat); else docked in the chat's tray.
    towerExternal: Boolean(options.towerExternal),
    // How the tower looks, for every seat: one of TOWER_STYLES, or a tower picture's id.
    towerStyle: id(options.towerStyle, "stone") || "stone",
    // Death markers (FG's): on, and the set for each creature type ("" is the default's).
    deathMarkers: cleanDeathMarkerOptions(options.deathMarkers),
    // The message of the day (FG's): what a player sees when they join: words, and links (a map, an NPC, a page).
    motd: options.motd && typeof options.motd === "object" ? { text: id(options.motd.text, "").slice(0, 8000), links: Array.isArray(options.motd.links) ? options.motd.links.filter((link) => link && typeof link === "object").slice(0, 40) : [] } : { text: "", links: [] },
    decal: id(options.decal, "kraken"),
    wallpaper: id(options.wallpaper, ""),
    // How the wallpaper meets the screen, as Windows': fill (cover), fit, stretch, tile (the default), center.
    wallpaperFit: ["fill", "fit", "stretch", "tile", "center"].includes(options.wallpaperFit) ? options.wallpaperFit : "tile",
    gmIcon: id(options.gmIcon, GM_ICON),
    // Sounds for the GM's hidden rolls, as Kraken's Syrinscape extension:
    // "off" none, "combat" attacks, damage, healing and initiative only, "all".
    soundHidden: ["off", "combat", "all"].includes(options.soundHidden) ? options.soundHidden : "combat",
    // When a creature's targets clear: never (FG), after its spell or attack, or at the end of its turn.
    clearTargets: ["never", "action", "turn"].includes(options.clearTargets) ? options.clearTargets : "never",
    // Conditions and effects on tokens: animated, icons only, or not drawn (every seat).
    tokenEffects: ["full", "icons", "off"].includes(options.tokenEffects) ? options.tokenEffects : "full",
    // What players may put on their own characters from the Effects list: nothing, lights, lights and conditions, or everything.
    playerEffects: ["none", "lights", "conditions", "all"].includes(options.playerEffects) ? options.playerEffects : "conditions",
    // Damage and healing land as the roll does (FG), or wait on the chat card's buttons (Foundry).
    autoApply: options.autoApply !== false,
    // The same sound again only after this many seconds.
    soundRepeat: Math.min(30, Math.max(0, Number.isFinite(Number(options.soundRepeat)) ? Number(options.soundRepeat) : 1)),
    // How long landed dice lie on the table before they fade, in seconds (the GM's choice, for every seat).
    diceHold: Math.round(Math.min(60, Math.max(0.5, Number.isFinite(Number(options.diceHold)) ? Number(options.diceHold) : 2.6)) * 10) / 10,
    wizard35: wizard35Options(options.wizard35),
    // The AD&D 2E character wizard's options (the FG extension's Options): ability
    // rolls once only, the PHB methods (I to VI) players may use, gold above 1st level.
    wizard2e: wizard2eOptions(options.wizard2e),
    // How a diagonal square counts when measuring (FG's HRDD): "1" every square
    // one, "1.5" the 5-10-5 count, "raw" a straight line. A scene may set its own.
    diagonal: ["1", "1.5", "raw"].includes(String(options.diagonal)) ? String(options.diagonal) : "1",
    // FG's token options, what players see on tokens: the health of the GM's
    // creatures and of the characters (bar, bar on hover, dot, dot on hover,
    // off) and names (off, on hover, always). Players are never sent what is off.
    healthNpc: HEALTH_SHOWS.includes(options.healthNpc) ? options.healthNpc : "dot",
    healthPc: HEALTH_SHOWS.includes(options.healthPc) ? options.healthPc : "dot",
    names: ["off", "hover", "always"].includes(options.names) ? options.names : "hover",
    // Bookkeeping (electron/bookkeeping.cjs), each part the GM may switch off for a relaxed table:
    // ammunition, consumables, rations and water, light from the pack, encumbrance; and the 5E
    // variant encumbrance (off unless chosen).
    bookkeeping: bookkeepingOptions(options.bookkeeping),
    // The combat tracker's options (FG's combat options): initiative each (every creature its own
    // roll) or by kind (one roll per kind of creature, its copies sharing it); who is skipped
    // (enemies: dead and unconscious creatures, FG's default; all: characters too; off: no one);
    // NPC numbering (append: the same name numbered, random: a random number, off).
    initGroup: options.initGroup === "kind" ? "kind" : "each",
    // FG's house rule (everyone rolls initiative again each round) and "stop at round start" (a new
    // round waits for the GM's next click).
    ...(options.initEachRound ? { initEachRound: true } : {}),
    ...(options.roundStop ? { roundStop: true } : {}),
    // The party's portraits along the top in initiative order during a fight (the GM's choice).
    ...(options.partyByInitiative ? { partyByInitiative: true } : {}),
    // FG's NPC hit points (HRNH): listed (each game's own), roll, max.
    ...(["roll", "max"].includes(options.npcHp) ? { npcHp: options.npcHp } : {}),
    ...(["enemies", "all", "off"].includes(options.skipDead) ? { skipDead: options.skipDead } : {}),
    npcNumbering: ["append", "random", "off"].includes(options.npcNumbering) ? options.npcNumbering : "append",
    // The GM's own chat languages (FG's Languages list), beside the game's and those its characters know.
    // The GM's theme for the whole table (Settings > Look): Kraken's brass by default.
    ...(THEMES.includes(options.theme) ? { theme: options.theme } : {}),
    // The GM's own modifiers (FG's Modifiers window): named numbers beside every seat's modifier box.
    ...(Array.isArray(options.modifierPresets) && options.modifierPresets.length ? { modifierPresets: options.modifierPresets.map((item) => ({ label: String(item?.label ?? "").trim().slice(0, 24), value: Math.max(-99, Math.min(99, Math.round(Number(item?.value) || 0))) })).filter((item) => item.label && item.value).slice(0, 16) } : {}),
    // The GM's own coins (FG's Currency list), in place of the game's on the party sheet and parcels.
    ...(Array.isArray(options.currencies) && options.currencies.length ? { currencies: [...new Set(options.currencies.map((name) => String(name ?? "").trim().slice(0, 16)).filter(Boolean))].slice(0, 12) } : {}),
    ...(Array.isArray(options.languages) && options.languages.length ? { languages: [...new Set(options.languages.map((name) => String(name ?? "").trim().slice(0, 40)).filter(Boolean))].slice(0, 60) } : {}),
  };
}
const THEMES = ["abyss", "ember", "arcane", "iron"];
function bookkeepingOptions(value) {
  const raw = value && typeof value === "object" ? value : {};
  return { ammo: raw.ammo !== false, consumables: raw.consumables !== false, rations: raw.rations !== false, light: raw.light !== false, encumbrance: raw.encumbrance !== false, variant: raw.variant === true };
}
// numbers: the bar on tokens, and the hit points themselves in the tracker.
const HEALTH_SHOWS = ["bar", "barhover", "dot", "dothover", "numbers", "off"];
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
const CHAT_KINDS = new Set(["say", "emote", "action", "ooc", "story", "mood", "readaloud"]);

function savedChat(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line) => line && typeof line === "object" && typeof line.text === "string")
    .slice(-MAX_CHAT)
    .map((line) => ({
      id: text(line.id, "").slice(0, 32),
      from: text(line.from, "Player").slice(0, 24),
      text: text(line.text, "").slice(0, line.kind === "readaloud" ? 6000 : 500),
      // Its sender's seat (a name, "@gm"): theirs again after a reload; a language and who understands it; a passage's title.
      ...(typeof line.sentBy === "string" ? { sentBy: line.sentBy.slice(0, 40) } : {}),
      ...(typeof line.lang === "string" ? { lang: line.lang.slice(0, 40) } : {}),
      ...(Array.isArray(line.understood) ? { understood: line.understood.filter((name) => typeof name === "string").slice(0, 200) } : {}),
      ...(typeof line.title === "string" ? { title: line.title.slice(0, 120) } : {}),
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
      // A link on the line (a record, a picture, a page), a shared record's text, the speaker's record, a prompt to roll.
      ...(line.link && typeof line.link === "object" ? { link: line.link } : {}),
      ...(line.share && typeof line.share === "object" ? { share: line.share } : {}),
      ...(typeof line.recordId === "string" ? { recordId: line.recordId.slice(0, 160) } : {}),
      ...(line.prompt && typeof line.prompt === "object" ? { prompt: line.prompt } : {}),
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
function createTableServer({ saved = {}, archive = null, onChange = () => undefined, webRoot = WEB_ROOT, art = null, decals = null, wallpapers = null, gmIcons = null, towers = null, dicePacks = null, tiles = null, sounds = null, books = null, ruleset = "", accounts = null, prefs: prefsStore = null, studioPicture = null, ownMaps = null } = {}) {
  // Each person's own settings (prefs.cjs): their colour and dice. Kept by the app for every campaign; in memory without a file.
  const prefs = prefsStore ?? createPrefsStore(null, diceLook);
  const prefsKey = (client) => (client.role === "dm" ? "@gm" : client.name);
  let password = "";
  let hostToken = "";
  let image = null;
  let imageVersion = 0;
  let scene = null;
  // The table map the GM stopped sharing (FG's Share off): the players are sent no map while it is.
  // The maps held back from the players (Share off), each by its scene id (an older save kept one).
  const heldBack = new Set([...(Array.isArray(saved.heldBack) ? saved.heldBack : []), ...(typeof saved.hiddenSceneId === "string" ? [saved.hiddenSceneId] : [])].filter((id) => typeof id === "string").map((id) => id.slice(0, 80)).slice(0, 500));
  const holdBack = (id, on) => {
    if (on) heldBack.add(id);
    else heldBack.delete(id);
  };
  const sceneHiddenNow = () => Boolean(scene && heldBack.has(scene.id));
  const emptyView = () => ({ sceneId: null, tokens: [], doors: [], vision: null, sight: false, locked: false, darkness: 0, lights: [], seeing: [], sceneLights: [], drawings: [], labels: [], tiles: [], fx: [], groups: [] });
  const clients = new Map();
  // Players whose connection dropped, their seats kept for a reconnect (linger below), by name.
  const lingering = new Map();
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
      ? saved.books.images.filter((item) => item && typeof item.book === "string" && typeof item.file === "string").slice(-40).map((item) => ({ id: text(item.id, "").slice(0, 40), book: item.book, file: item.file, name: text(item.name, "Picture").slice(0, 120), at: num(item.at, 0), ...(Array.isArray(item.to) && item.to.length ? { to: item.to.map((name) => text(name, "").slice(0, 24)).filter(Boolean).slice(0, 32) } : {}) }))
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
  // A book's maps, pictures and records are opened only when it is active in
  // this campaign (FG: a module's content is there once it is loaded). The
  // book named by its id, name, title or file.
  function activeBookId(given) {
    const wanted = String(given ?? "").trim();
    if (!books || !wanted) return null;
    const direct = books.info(wanted);
    const found = direct ?? books.list().find((item) => books.file?.(item.id) === wanted || require("path").basename(String(books.file?.(item.id) ?? "")) === require("path").basename(wanted));
    return found && shelf.active.has(found.id) ? found.id : null;
  }
  function requireActiveBook(given) {
    // A table with no shelf (a test's bare server) has no active books to judge by.
    if (!books || activeBookId(given)) return;
    const named = books?.info(String(given ?? ""))?.title ?? String(given ?? "").split(/[\/]/).pop();
    throw new Error(`${named || "That book"} is not active in this campaign: make it active in Modules first.`);
  }
  // A record path's book (npc.goblin@C&C Monsters & Treasure).
  const bookOfPath = (fgPath) => String(fgPath ?? "").split("@").slice(1).join("@");
  // A picture shown to some of the players (to: their names) reaches only them.
  const seesImage = (client, item) => !client || client.role === "dm" || !Array.isArray(item.to) || item.to.some((name) => sameName(name, client.name));
  // A player learns only the books shared with them (never which adventure the GM has loaded).
  const shelfView = (client) => ({ active: !client || client.role === "dm" ? [...shelf.active] : [...shelf.active].filter((id) => shelf.shared.has(id)), shared: [...shelf.shared].filter((id) => shelf.active.has(id)), images: shelf.images.filter((item) => seesImage(client, item)) });
  const fits = (info) => Boolean(info) && fitsRuleset(info, ruleset);
  // The GM reads the campaign's active books; a player, those the GM opened to them.
  const canRead = (client, book) => (client.role === "dm" ? fits(books?.info(book)) && shelf.active.has(books?.info(book)?.id ?? book) : shelf.active.has(book) && shelf.shared.has(book));
  // A seat's shelf: the GM's, every module that fits (with whether it is
  // active and shared); a player's, the active books shared with them.
  const shelfFor = (client) =>
    (books ? books.list() : [])
      .filter((item) => fits(item) && (client.role === "dm" || canRead(client, item.id)))
      .map((item) => ({ ...item, active: shelf.active.has(item.id), shared: shelf.active.has(item.id) && shelf.shared.has(item.id) }));
  const canSeePicture = (client, book, file) => {
    // A picture named from another module ("<file>@<module>") needs that module shared too.
    if (shelf.images.some((item) => item.book === book && item.file === file && seesImage(client, item))) return true;
    // A picture that is a page of a story shared with this seat (the campaign's story records).
    if (client.role !== "dm" && records.list({ type: "story", seat: seatOf(client) }).some((story) => Array.isArray(story.data?.blocks) && story.data.blocks.some((block) => block?.link?.kind === "picture" && block.link.book === book && block.link.file === file))) return true;
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
  // Twelve, one for each function key (F1-F12).
  const SLOTS = 12;
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
  // A table always opens unpaused.
  let options = savedOptions({ ...(saved.options && typeof saved.options === "object" ? saved.options : {}), paused: false });
  // Who may not sit here (the GM's Ban, kept with the campaign): a name, and the address it came from (never this computer's).
  const bans = (Array.isArray(saved.bans) ? saved.bans : [])
    .filter((ban) => ban && (typeof ban.name === "string" || typeof ban.address === "string"))
    .slice(0, 200)
    .map((ban) => ({ name: text(ban.name, "").slice(0, 24), address: text(ban.address, "").slice(0, 60), at: num(ban.at, 0) }));
  // The chat's sound triggers, and what plays under the game (ambience loops
  // and music), for every seat; saved with the campaign.
  let soundTriggers = (saved.soundTriggersVersion === TRIGGERS_VERSION && cleanTriggers(saved.soundTriggers)) || defaultTriggers();
  const cleanScape = (value) => {
    const scape = value && typeof value === "object" ? value : {};
    const level = (item) => Math.min(1, Math.max(0, Number(item?.volume ?? 1)));
    return {
      ambience: (Array.isArray(scape.ambience) ? scape.ambience : []).filter((item) => typeof item?.id === "string").slice(0, 8).map((item) => ({ id: item.id.slice(0, 300), volume: level(item) })),
      // When the track started (the host's clock), so every seat hears the same bar; a folder's playlist plays in
      // order or shuffled, and repeats or stops at its end (docs/feature-parity.md S9).
      music: scape.music && typeof scape.music.id === "string" ? { id: scape.music.id.slice(0, 300), volume: level(scape.music), loop: scape.music.loop !== false, group: typeof scape.music.group === "string" ? scape.music.group.slice(0, 300) : null, startedAt: Number.isFinite(Number(scape.music.startedAt)) ? Number(scape.music.startedAt) : Date.now(), order: scape.music.order === "order" ? "order" : "shuffle", repeat: scape.music.repeat !== false, played: Array.isArray(scape.music.played) ? scape.music.played.filter((id) => typeof id === "string").slice(-500) : [] } : null,
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
      if (kept) setSoundscape(freshScape(kept));
    } else throw new Error("Keep, clear, play or view the scene's sound.");
    onChange("table");
    sendSceneSound();
    return sceneSoundView();
  }
  // When each folder last played (the same sound again only after a pause).
  const lastSound = new Map();
  // What is sent: the music with how far into its track it is now (no seat's clock needed to join in time).
  const scapeOut = () => (soundscape.music ? { ...soundscape, music: { ...soundscape.music, elapsed: Math.max(0, Date.now() - soundscape.music.startedAt) } } : soundscape);
  // A kept soundscape (a scene's own) played again: its music from the top, now.
  const freshScape = (kept) => (kept?.music ? { ...kept, music: { ...kept.music, startedAt: Date.now() } } : kept);
  function setSoundscape(next) {
    soundscape = cleanScape(next);
    broadcast({ type: "soundscape", soundscape: scapeOut() });
    onChange("table");
    return soundscape;
  }
  function setOptions(patch) {
    const next = patch && typeof patch === "object" ? patch : {};
    if (next.decal !== undefined && !(next.decal === "" || next.decal === "kraken" || (decals && decals.has(String(next.decal))))) throw new Error(`No decal "${next.decal}".`);
    if (next.wallpaper !== undefined && !(next.wallpaper === "" || (wallpapers && wallpapers.has(String(next.wallpaper))))) throw new Error(`No wallpaper "${next.wallpaper}".`);
    if (next.gmIcon !== undefined && !(next.gmIcon === "" || (gmIcons && gmIcons.has(String(next.gmIcon))))) throw new Error(`No GM icon "${next.gmIcon}".`);
    if (next.towerStyle !== undefined && !(TOWER_STYLES.includes(String(next.towerStyle)) || (towers && towers.has(String(next.towerStyle))))) throw new Error(`No dice tower look "${next.towerStyle}" (${TOWER_STYLES.join(", ")}, or a picture in the towers folder).`);
    if (next.motd !== undefined) next.motd = { text: String(next.motd?.text ?? "").slice(0, 8000), links: (Array.isArray(next.motd?.links) ? next.motd.links : []).map(cleanSlot).filter(Boolean).slice(0, 40) };
    const wasPaused = options.paused;
    const wasBooks = options.bookkeeping;
    options = savedOptions({ ...options, ...next, ...(next.bookkeeping && typeof next.bookkeeping === "object" ? { bookkeeping: { ...options.bookkeeping, ...next.bookkeeping } } : {}), ...(next.wizard35 && typeof next.wizard35 === "object" ? { wizard35: { ...options.wizard35, ...next.wizard35 } } : {}), ...(next.wizard2e && typeof next.wizard2e === "object" ? { wizard2e: { ...options.wizard2e, ...next.wizard2e } } : {}) });
    broadcast({ type: "options", options });
    if (options.paused !== wasPaused) addChat({ id: "table", from: "Table", text: options.paused ? "The GM has paused the game." : "The game goes on.", at: Date.now(), kind: "story" });
    onChange("table");
    // What tokens show (names, health) and how distance counts are in each seat's map.
    if (["diagonal", "healthNpc", "healthPc", "names"].some((key) => key in next)) sendMaps();
    // A bookkeeping switch changed: the load's effects (and the games whose rules count the load) follow.
    if ("bookkeeping" in next && bookkeepingApi) void bookkeepingApi.switched(wasBooks, options.bookkeeping).catch(() => undefined);
    // What the tracker shows players of the creatures' health follows the same option.
    if (["healthNpc", "healthPc", "skipDead"].some((key) => key in next)) sendCombat();
    return options;
  }
  // The seat whose request is being handled now (and when).
  let asking = null;
  // Each sitting of the campaign (the Session Log): when it began; its chat is archived when the table closes
  // (archive: the campaign folder's chat logs, from the backend; kept here when there is none).
  const sessions = (Array.isArray(saved.sessions) ? saved.sessions : []).filter((item) => item && typeof item.id === "string" && Number.isFinite(Number(item.started))).slice(-199).map((item) => ({ id: item.id.slice(0, 24), started: Number(item.started), ...(Number(item.ended) ? { ended: Number(item.ended) } : {}), ...(item.archived ? { archived: true } : {}) }));
  const thisSession = { id: `s${Date.now().toString(36)}`, started: Date.now() };
  sessions.push(thisSession);
  const archived = new Map();
  const sessionStore = archive ?? { save: (id, lines) => archived.set(id, lines), read: (id) => archived.get(id) ?? null };
  // A book the GM has shared with the players (Modules > Players): its rules records (classes, species, skills,
  // spells, equipment...) are theirs to see, to make and play their characters; a GM's book and an adventure stay the GM's.
  let sharedNames = { key: "", names: new Set() };
  const sharedBookNames = () => {
    const key = [...shelf.shared].filter((id) => shelf.active.has(id)).join("|");
    if (key !== sharedNames.key) sharedNames = { key, names: new Set(key ? key.split("|").map((id) => books?.info(id)?.name).filter(Boolean) : []) };
    return sharedNames.names;
  };
  // A record as a seat is sent it: the GM's copy says when the players see it through its shared book (viaBook).
  const recordFor = (record, seat) => {
    const seen = viewFor(record, seat);
    return seat.role === "dm" && record.visibility === "gm" && record.source && record.type !== "npc" && sharedBookNames().has(record.source) ? { ...seen, viaBook: true } : seen;
  };
  const records = createRecordStore({ saved: saved.records, onChange: () => onChange("records"), alsoSeen: (record) => Boolean(record.source) && record.type !== "npc" && sharedBookNames().has(record.source) });
  const dice = createDice(saved.dice);
  // Each seat's modifier stack (FG's modifier box and keys), read by every roll the seat starts.
  const rulesetManifest = () => {
    try {
      return require("../shared/rulesets/registry.mjs").rulesetFor(ruleset);
    } catch {
      return null;
    }
  };
  const { keysFor: modifierKeysFor, stackFor: modifierStackFor } = require("../shared/rulesets/modifiers.mjs");
  const modifiers = createModifiers({
    saved: saved.modifiers,
    keysFor: () => modifierKeysFor(rulesetManifest()),
    kindsFor: () => modifierStackFor(rulesetManifest()).kinds,
    onChange: (key, stack) => {
      for (const [ws, client] of clients) if (client.joined && clearKey(client) === key) send(ws, { type: "modifiers", modifiers: stack });
      onChange("table");
    },
  });
  // A roll the seat makes with its stack read (an attack, a check, a save: the rules' own d20 rolls).
  const actRoll = (formula, kind = "roll", label = "", options = {}) => modifiers.roll(dice, formula, modifierStackFor(rulesetManifest()).on ? kind : "none", label, options);
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
      if (!entry) return null;
      const concentrating = entry.recordId ? String(records.get(entry.recordId)?.data?.concentration ?? "").trim() : "";
      return { health: combat.health(entry), active: combat.active() === entry.id, effects: entry.effects, ...(concentrating ? { concentrating } : {}) };
    },
    // The active creature's record, for a token that stands for it, only when its entry has no token of its own
    // (else every token of that record would light up as the active turn).
    activeRecord: () => {
      const entry = combat.entries().find((item) => item.id === combat.active());
      return entry && !entry.tokenId ? (entry.recordId ?? null) : null;
    },
    colorOf: (name) => tokenColorOf(name),
    tableOptions: () => options,
    onRegion: (event) => regionSprang(event, false),
    // On the combat tracker (by its token, or a character's record): its path this turn is drawn.
    onTracker: (token) => combat.entries().some((entry) => entry.tokenId === token.id || (token.recordId && !entry.tokenId && entry.recordId === token.recordId)),
    // A token's side changed (its menu, a tool): its tracker entry follows.
    onFaction: (token) => {
      for (const entry of combat.entries()) if (entry.tokenId === token.id && entry.faction !== token.faction) combat.update(entry.id, { faction: token.faction }, { role: "dm", name: "GM" });
    },
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
    colorOf: (name) => tokenColorOf(name),
    tableOptions: () => options,
    onRegion: (event) => regionSprang(event, true),
  });
  // FG's play test: the GM sees the image as a player would, through a test
  // token's eyes ("@test" owns it), and moves it as a player moves.
  const TEST_SEAT = { role: "player", name: "@test" };
  // Player vision preview: the players' view (all their tokens), no test token.
  const PREVIEW_SEAT = { role: "player", name: "@preview", everyone: true };
  let testing = false;
  let previewing = false;
  // View as: the preview through one player's eyes (their tokens alone), else every player's.
  let previewAs = "";
  const previewSeat = () => (previewAs ? { role: "player", name: previewAs } : PREVIEW_SEAT);
  const gmMap = () => (prep.scene() ? prep : map);
  const mapOf = (client) => (client.role === "dm" ? gmMap() : map);

  // The combat tracker: each seat is sent its own view (combat.cjs viewFor).
  const combat = createCombat({
    saved: saved.combat,
    table: () => agentHandle,
    onChange: () => {
      leaveDeathMarkers();
      onChange("table");
      sendCombat();
      sendMaps();
    },
  });
  // The Effects list's actions (electron/effects.cjs): made once the agent handle exists.
  let effectsApi = null;
  const effects = () => (effectsApi ??= require("./effects.cjs").createEffects(agentHandle));
  // Bookkeeping (electron/bookkeeping.cjs): ammunition, consumables, rations, light, the load, rest.
  let bookkeepingApi = null;
  const bookkeeping = () => (bookkeepingApi ??= require("./bookkeeping.cjs").createBookkeeping(agentHandle));
  // A creature that dies on the tracker leaves a death marker where its token
  // stands (FG's Death Markers): its type's set, the default's else; a
  // character does not. Those dead already when the table opens are known.
  const deadKnown = new Set();
  let deadReady = false;
  function leaveDeathMarkers() {
    const { markerFor } = require("../shared/map/deathMarkers.mjs");
    for (const entry of combat.entries()) {
      const dead = ["Dead", "Destroyed"].includes(combat.health(entry).status);
      if (!dead) {
        deadKnown.delete(entry.id);
        continue;
      }
      if (deadKnown.has(entry.id)) continue;
      deadKnown.add(entry.id);
      if (!deadReady) continue;
      const settings = options.deathMarkers;
      const record = entry.recordId ? records.get(entry.recordId) : null;
      if (!settings?.on || record?.type === "character" || entry.faction === "friend") continue;
      const token = map.tokens().find((item) => item.id === entry.tokenId) ?? (entry.recordId ? map.tokens().find((item) => item.recordId === entry.recordId) : null);
      // A creature the players never saw leaves nothing for them to find (nor its name).
      if (!token || !map.scene() || token.hidden || entry.hidden) continue;
      const marker = markerFor(settings, record, entry.name);
      if (!marker) continue;
      try {
        map.addDeathMarker({ ...marker, x: token.x, y: token.y, size: Math.max(1, token.squares ?? 1), name: entry.name }, { role: "dm", name: "Combat" });
      } catch {
        /* no scene */
      }
    }
    deadReady = true;
  }
  let combatPending = false;
  // The campaign's calendar (calendar.cjs): today's date, the time, and the notes on its days.
  const calendar = require("./calendar.cjs").createCalendar({
    saved: saved.calendar,
    ruleset,
    onChange: () => {
      onChange("table");
      for (const [ws, client] of clients) send(ws, { type: "calendar", calendar: calendar.view(seatOf(client)) });
    },
    // Game time moved on: effects with a duration count it down, on the tracker
    // and on tokens out of the fight (a torch burns its hour of game time).
    onTime: (minutes) => passGameTime(minutes),
  });
  function passGameTime(minutes) {
    // A day that ends is eaten and drunk for (bookkeeping: rations and water).
    if (bookkeepingApi) void bookkeepingApi.timePassed(minutes).catch(() => undefined);
    const rounds = combat.passTime(minutes);
    if (rounds <= 0) return;
    for (const token of map.tokensWithEffects()) {
      const kept = combat.tickList(map.tokenEffects(token.id), rounds, token);
      map.setTokenEffects(token.id, kept);
    }
  }
  // Progress clocks and the Score panel (clocks.cjs): every seat sees the clocks shown to it.
  const clocks = require("./clocks.cjs").createClocks({
    saved: saved.clocks,
    onChange: () => {
      onChange("table");
      for (const [ws, client] of clients) send(ws, { type: "clocks", clocks: clocks.view(seatOf(client)) });
    },
    say: (line, from, secret) => agentHandle.say(line, from, secret),
  });
  // What a player is sent with every unidentified item called by its unidentified name (a weapon's
  // attack on the tracker, a line in chat): the GM's seat gets it as it is (records.cjs hideNames).
  // A creature whose token has a "players call it" name (FG's unidentified name) is called that too, in
  // the tracker and chat, unless another token of the same name is known by it.
  // Chat languages: the characters who understand a line spoken in one, and what each seat reads of it
  // (its words if one of their characters knows the language or they said it, its sounds if not).
  function understoodBy(lang) {
    return records
      .list({ type: "character" })
      .filter((record) => languages.knows(record.data, lang))
      .map((record) => record.name)
      .slice(0, 24);
  }
  function heard(client, line) {
    if (!line.lang || client.role === "dm") return line;
    const { understood, ...rest } = line;
    if (line.id === client.id || (typeof line.sentBy === "string" && line.sentBy === seatKey(client))) return rest;
    // Understood by one of this reader's characters (the GM's list, or worked out now: no cap on how many know it).
    const theirs = records.list({ type: "character", owner: client.name });
    if (theirs.some((record) => (understood ?? []).includes(record.name) || languages.knows(record.data, line.lang))) return rest;
    return { ...rest, text: languages.garble(line.text, line.lang), garbled: true };
  }
  function forPlayer(client, value) {
    if (client.role === "dm") return value;
    const tokens = map.tokens();
    const creatures = tokens.filter((token) => token.unidentified && token.name && token.name.trim().length >= 3 && token.unidentified !== token.name);
    if (!creatures.length) return hideNames(value, records.hiddenNames());
    const names = new Map(records.hiddenNames());
    const known = new Set(tokens.filter((token) => !token.unidentified).map((token) => token.name));
    for (const token of creatures) if (!known.has(token.name)) names.set(token.name.trim(), token.unidentified);
    return hideNames(value, names);
  }
  // A token stepped into a trap, a pit or a teleport (mapState.cjs): the GM is
  // told, by name and note, in a line only the GM sees, and on the map; a trap
  // locks movement until the GM lets the table go on.
  function regionSprang({ region, token, seat }, prepOnly) {
    const what = region.kind === "teleport" ? "stepped into the teleport" : `sprang the ${region.kind}`;
    const holds = region.kind === "trap" || region.kind === "pit";
    const line = `${token.name} ${what} "${region.name}"${region.note ? `: ${region.note}` : ""}${holds ? (region.trap?.auto === "apply" ? " (rolled and applied by itself)" : " (it holds them: roll, apply or let them go in Traps sprung)") : ""}`;
    if (!prepOnly) agentHandle.say(line, "Map", true);
    for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "notice", text: line.slice(0, 300) });
    if (seat.role !== "dm" && region.kind !== "teleport") for (const [ws, client] of clients) if (client.name === seat.name && client.role !== "dm") send(ws, { type: "notice", text: `Something happens to ${token.name}. The GM decides what.` });
    // The trap's own automation (Map Studio's "When it springs"): rolled for the GM, or rolled and applied.
    if (!prepOnly && holds && (region.trap?.auto === "roll" || region.trap?.auto === "apply") && token.held) {
      resolveTrap(map, token.id, region.trap.auto === "apply" ? "apply" : "roll").catch((error) => agentHandle.say(`${token.name}: the trap could not ${region.trap.auto} (${error instanceof Error ? error.message : error})`, "Map", true));
    }
  }
  // A token a trap holds, as the GM (or the trap's automation) deals with it: save rolls its save
  // (the game's own save for a creature on the tracker, else a d20 against the DC), damage rolls its
  // damage (for the GM's eyes), roll does both, apply rolls what is still to roll and applies it (half
  // or none on a save, through the tracker so the game's rules run; the creature joins the tracker if
  // it is not on it; the effect on a failed save) and lets the token go; release lets it go.
  // An unrevealed trap is called "Trap" (or "Pit") in chat, never by its name.
  async function resolveTrap(working, tokenId, action) {
    const { token, region } = working.heldToken(tokenId);
    if (action === "release") return working.release(token.id, GM_SEAT);
    const trap = region?.trap ?? {};
    const what = region?.revealed ? region.name : region?.kind === "pit" ? "Pit" : "Trap";
    const roll = (formula, label) => agentHandle.roll(formula, label, "Map", true, { mods: false });
    const rollSave = async () => {
      if (!trap.save?.attribute || token.held.save) return;
      // The game's own save, with the creature's bonuses: it joins the tracker first if it is not on it
      // (traps are mostly sprung exploring, with no fight running), as it does to take the damage.
      let entry = entryOfToken(token.id);
      if (!entry && token.recordId) {
        await combat.add({ recordId: token.recordId }, GM_SEAT).catch(() => undefined);
        entry = entryOfToken(token.id);
      }
      let save = null;
      if (entry) {
        try {
          const made = await combat.save(entry.id, trap.save.attribute, trap.save.dc, what);
          if (made && typeof made.success === "boolean") save = { success: made.success, total: Math.round(num(made.total, 0)) };
        } catch (error) {
          // Not one of this game's saves: the GM is told, then a d20 against the DC.
          agentHandle.say(`${what}: "${trap.save.attribute}" is not a save in this game (${error instanceof Error ? error.message : "refused"}); a plain d20 was rolled. Set the trap's save to one of the game's own.`, "Map", true);
        }
      }
      if (!save) {
        const made = roll("1d20", `[SAVE] ${token.name} vs ${what}: ${trap.save.attribute.toUpperCase()}${trap.save.dc !== undefined ? ` ${trap.save.dc}` : ""}`);
        save = { success: trap.save.dc !== undefined ? made.total >= trap.save.dc : null, total: made.total };
      }
      working.updateHeld(token.id, { save }, GM_SEAT);
    };
    const rollDamage = () => {
      if (!trap.damage || token.held.damage) return;
      const made = roll(trap.damage, `[DAMAGE] ${what} on ${token.name}${trap.damageType ? ` (${trap.damageType})` : ""}`);
      working.updateHeld(token.id, { damage: { total: made.total } }, GM_SEAT);
    };
    if (action === "save" || action === "roll" || action === "apply") await rollSave();
    if (action === "damage" || action === "roll" || action === "apply") rollDamage();
    if (action !== "apply") return working.heldToken(token.id).token.held;
    const held = working.heldToken(token.id).token.held;
    const saved = held.save?.success === true;
    let amount = held.damage?.total ?? 0;
    if (saved) amount = trap.half ? Math.floor(amount / 2) : 0;
    const done = { token: token.id, saved, damage: amount };
    if (amount > 0) {
      let entry = entryOfToken(token.id);
      if (!entry && token.recordId) {
        await combat.add({ recordId: token.recordId }, GM_SEAT);
        entry = entryOfToken(token.id);
      }
      if (!entry) throw new Error(`${token.name} has no sheet to take the damage: apply it by hand.`);
      await combat.dropRoll(entry.id, { kind: "damage", total: amount, type: trap.damageType || undefined, name: what }, GM_SEAT);
    }
    if (trap.effect?.label && !saved) {
      const api = effects();
      await api.ready;
      await api.apply({ to: { tokenId: token.id }, effect: { label: trap.effect.label, duration: trap.effect.duration ?? 0 } }, GM_SEAT);
      done.effect = trap.effect.label;
    }
    working.release(token.id, GM_SEAT);
    return done;
  }
  // A creature's turn begins on the tracker: its token's path (this turn's moves) starts again.
  let turnOf = null;
  function turnStarted() {
    const now = combat.active?.() ?? null;
    if (now === turnOf) return;
    turnOf = now;
    const entry = combat.entries().find((item) => item.id === now);
    if (!entry) return;
    const token = map.tokens().find((item) => item.id === entry.tokenId) ?? (entry.recordId ? map.tokens().find((item) => item.recordId === entry.recordId) : null);
    if (token) map.clearPath(token.id);
  }
  function sendCombat() {
    turnStarted();
    if (combatPending) return;
    combatPending = true;
    setImmediate(() => {
      combatPending = false;
      floatScan();
      for (const [ws, client] of clients) send(ws, { type: "combat", combat: forPlayer(client, combat.viewFor(seatOf(client))) });
    });
  }

  // The party sheet summary goes to everyone when the party or a member changes.
  let partyPending = false;
  function sendParty() {
    if (partyPending) return;
    partyPending = true;
    setTimeout(() => {
      partyPending = false;
      // The GM's view, and the players' (an unidentified item by its unidentified name).
      Promise.all([party.partyView(agentHandle), party.partyView(agentHandle, PLAYER_VIEW)])
        .then(([gmView, playerView]) => {
          for (const [ws, client] of clients) send(ws, { type: "party", party: client.role === "dm" ? gmView : playerView });
        })
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

  // Scrolling combat text (Foundry's, FG's token combat actions): damage and healing float off a token.
  // Hit points as they stand (wounds less temporary hit points, from its tracker entry or its record),
  // compared with the last look; a change floats to the GM, and to players where the tracker would show
  // them the numbers (their own, a friend's, or every creature's when the GM shows numbers). Never a
  // hidden token's.
  const lastHurt = new Map();
  function floatScan() {
    for (const token of map.tokens()) {
      // Its tracker entry: tied to this token, else (added from its record) the record's.
      const entries = combat.entries();
      const entry = entries.find((item) => item.tokenId === token.id) ?? (token.recordId ? entries.find((item) => !item.tokenId && item.recordId === token.recordId) : undefined);
      const record = token.recordId ? records.get(token.recordId) : null;
      const vitals = entry ? combat.vitals(entry) : record?.data?.hp && Number(record.data.hp.total) > 0 ? { wounds: Number(record.data.hp.wounds) || 0, temp: Math.max(0, Number(record.data.hp.temp) || 0) } : null;
      if (!vitals) continue;
      const hurt = (Number(vitals.wounds) || 0) - (Number(vitals.temp) || 0);
      const before = lastHurt.get(token.id);
      lastHurt.set(token.id, hurt);
      if (before === undefined || before === hurt) continue;
      const amount = hurt - before;
      const pc = Boolean(token.owner) || record?.type === "character";
      for (const [ws, client] of clients) {
        if (client.role !== "dm") {
          if (token.hidden) continue;
          const shows = pc || token.faction === "friend" || (token.owner !== "" && token.owner === client.name) ? "numbers" : (options.healthNpc ?? "dot");
          if (shows !== "numbers") continue;
        }
        send(ws, { type: "float", tokenId: token.id, amount: -amount });
      }
    }
  }
  function sendMaps() {
    if (mapsPending) return;
    mapsPending = true;
    setImmediate(() => {
      mapsPending = false;
      floatScan();
      let explored = false;
      for (const [ws, client] of clients) {
        if (client.role !== "dm") {
          const hidden = sceneHiddenNow();
          const view = hidden ? emptyView() : map.viewFor(seatOf(client), client.assetToken);
          send(ws, { type: "map", ...view });
          // Fog of war: what this player sees now joins what they have seen (kept here, sent to them alone).
          if (!hidden && view.vision && map.explore(client.name, view.vision)) explored = true;
          if (!hidden) sendExplored(ws, client, map, client.name);
          continue;
        }
        const working = gmMap();
        const view = working.viewFor(testing ? TEST_SEAT : previewing ? previewSeat() : seatOf(client), client.assetToken);
        send(ws, { type: "map", ...view, prep: working === prep ? working.scene()?.id ?? null : null, testing, previewing, previewAs: previewing ? previewAs : "", sceneHidden: sceneHiddenNow() });
        // The GM's player vision preview shows every player's explored areas together (View as: that player's).
        sendExplored(ws, client, working, previewing ? previewAs || "*" : null);
      }
      if (explored) onChange("table");
    });
  }
  // A seat's explored areas of the scene, sent when they change (not with every map).
  function sendExplored(ws, client, working, who) {
    const sceneId = working.scene()?.id ?? null;
    const key = who === null ? `${sceneId}|none` : `${sceneId}|${who}|${working.exploredVersion(who)}`;
    if (client.exploredKey === key) return;
    client.exploredKey = key;
    send(ws, { type: "explored", sceneId, polygons: who === null ? [] : working.exploredFor(who) });
  }

  // A token's tracker entry: the one tied to that very token, else (a token placed
  // before the fight) an entry of its record with no token of its own on this map.
  // Never another goblin's entry because they share the Goblin record.
  function entryOfToken(tokenId) {
    if (!tokenId) return null;
    const entries = combat.entries();
    const exact = entries.find((entry) => entry.tokenId === tokenId);
    if (exact) return exact;
    const token = map.tokens().find((item) => item.id === tokenId);
    if (!token?.recordId) return null;
    return entries.find((entry) => entry.recordId === token.recordId && !map.tokens().some((item) => item.id === entry.tokenId)) ?? null;
  }
  // A creature's token on the table map: its own, else its record's.
  function tokenOfEntry(entry) {
    return map.tokens().find((token) => token.id === entry.tokenId) ?? map.tokens().find((token) => entry.recordId && token.recordId === entry.recordId) ?? null;
  }
  async function castWithTemplate(who, power, at, seat, from) {
    await Promise.all([map.ready, combat.ready]);
    const info = combat.spellInfo(who, power);
    if (!info) throw new Error(`No spell ${power}.`);
    if (!info.area) throw new Error(`${info.name} has no area to place: target its creatures instead.`);
    const caster = info.casterEntry;
    if (!caster) throw new Error("The caster is not on the combat tracker.");
    if (seat.role !== "dm" && !combat.viewFor(seat).entries.find((item) => item.id === caster.id)?.mine) throw new Error("That is not your character.");
    if (!map.scene()) throw new Error("Open a map first.");
    const casterToken = tokenOfEntry(caster);
    const point = { x: Number(at?.x), y: Number(at?.y) };
    // A direction alone (a cone from the caster): a point that way.
    if (casterToken && Number.isFinite(Number(at?.angle)) && !Number.isFinite(point.x)) {
      const angle = (Number(at.angle) * Math.PI) / 180;
      point.x = casterToken.x + Math.cos(angle) * 100;
      point.y = casterToken.y + Math.sin(angle) * 100;
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Where? Give the template's x and y.");
    const shape = map.areaAt(info.area, casterToken, point.x, point.y);
    const color = seat.role === "dm" ? (prefs.get("@gm").color ?? "#ff9e3d") : tokenColorOf(seat.name);
    const template = map.placeTemplate({ ...shape, label: caster.hidden ? info.name : `${info.name} (${caster.name})`, attach: info.area.attach && casterToken ? casterToken.id : undefined, turn: info.instant, entryId: caster.id, color }, { role: "dm", name: "GM", color });
    const inside = map.tokensInTemplate(template).map((token) => combat.entries().find((entry) => entry.tokenId === token.id) ?? combat.entries().find((entry) => token.recordId && entry.recordId === token.recordId)).filter(Boolean);
    const ids = [...new Set(inside.filter((entry) => combat.health(entry).status !== "Dead").map((entry) => entry.id))];
    const before = [...caster.targets];
    const targeted = combat.targetIds(caster.id, ids, { role: "dm", name: "GM" });
    let cast;
    try {
      cast = await combat.cast(who, power, "", seat, from, { fromTemplate: true });
    } finally {
      // The template's creatures were the spell's alone: the caster's own targets come back
      // (so the next area spell asks for its template again).
      combat.targetIds(caster.id, before, { role: "dm", name: "GM" });
    }
    return { template, targets: targeted, cast };
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
    const sentIt = client.id === line.id || (typeof line.sentBy === "string" && line.sentBy === seatKey(client));
    if (line.self) return sentIt;
    // A whisper: who sent it, who it is to, and the GM (as FG's GM sees every whisper).
    // A whisper to a character reaches whoever holds it.
    if (line.to)
      return (
        client.role === "dm" ||
        sentIt ||
        // To a seat by its name (a player, the GM's "GM"): that seat; otherwise to whoever holds the character of that name.
        line.to.some((name) => sameName(name, client.name) || (!RESERVED_NAMES.has(String(name).toLowerCase()) && ![...clients.values()].some((seat) => sameName(seat.name, name)) && records.list({ type: "character", owner: client.name }).some((record) => sameName(name, record.name))))
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

  // The record a chat line speaks for: its roll's actor or who it is from; a
  // character by name, or (from the GM's side) a creature in the fight or an NPC.
  const spokenArt = new Set();
  function speakerRecord(entry, gmSide) {
    const name = String(entry.roll?.by || entry.from || "").trim();
    if (!name || /^(gm|dm|agent|combat|table|map|calendar|clocks)$/i.test(name)) return null;
    const character = records.list({ type: "character" }).find((record) => sameName(record.name, name));
    if (character) return character;
    if (!gmSide) return null;
    let fighting = null;
    try {
      fighting = combat.entries().find((item) => sameName(item.name, name) && item.recordId);
    } catch {
      /* the tracker is not made yet (a line while the table opens) */
    }
    const linked = fighting ? records.get(fighting.recordId) : null;
    if (linked) return linked;
    return records.list({ type: "npc" }).find((record) => sameName(record.name, name)) ?? null;
  }
  // A seat by who sits in it, not by its connection (new on every reload): the GM, or a player's name.
  const seatKey = (client) => (client.role === "dm" ? "@gm" : String(client.name ?? "").toLowerCase());
  function addChat(entry) {
    // The roller's roll mode (the chat bar's): the GM and them, the GM alone, or them alone.
    const asked = entry.roll && !entry.secret && !entry.self && !entry.to && !entry.tower ? modifiers.modeNow() : null;
    if (asked) {
      const { mode, seat } = asked;
      if (mode === "self") Object.assign(entry, { self: true, id: seat.id });
      else if (mode === "gm") Object.assign(entry, { secret: true, ...(seat.gm ? {} : { shownTo: seat.name }) });
      else if (mode === "blind") {
        entry.secret = true;
        // The roller sees only that it was rolled (Foundry's blind roll).
        if (!seat.gm) {
          const ws = [...clients.entries()].find(([, client]) => client.id === seat.id)?.[0];
          if (ws) send(ws, { type: "chat", id: seat.id, from: entry.from, text: `[BLIND] ${String(entry.roll.label ?? "").slice(0, 120)} [${entry.roll.formula}]`.replace(/\s+/g, " "), at: Date.now(), tower: true });
        }
      }
    }
    if (!entry.sentBy) {
      const sender = [...clients.values()].find((client) => client.id === entry.id);
      if (sender) entry.sentBy = seatKey(sender);
    }
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
    // Who speaks (FG's chat portrait): a character, or a creature the GM speaks or rolls as (/id, the tracker).
    if (!entry.recordId && entry.kind !== "story") {
      const found = speakerRecord(entry, speaker?.role === "dm" || entry.id === "agent" || entry.id === "table");
      if (found) {
        entry.recordId = found.id;
        spokenArt.add(found.id);
        if (speaker && speaker.role !== "dm") speaker.lastSpokenAs = found.id;
      }
    }
    // A player speaking as themselves: their character's token beside the line (as the GM has the GM icon):
    // the one they last spoke as, else their first.
    if (!entry.recordId && speaker && speaker.role !== "dm" && entry.kind !== "story") {
      const theirs = records.list({ type: "character", owner: speaker.name });
      const icon = theirs.find((record) => record.id === speaker.lastSpokenAs) ?? theirs[0];
      if (icon) {
        entry.iconRecord = icon.id;
        spokenArt.add(icon.id);
      }
    }
    chat.push(entry);
    if (chat.length > MAX_CHAT) chat.shift();
    for (const [ws, client] of clients) if (seesLine(client, entry)) send(ws, forPlayer(client, heard(client, { type: "chat", ...entry })));
    onChange("table");
    return entry;
  }

  let sharedSent = "";
  function shelfChanged() {
    for (const [ws, client] of clients) send(ws, { type: "books", ...shelfView(client) });
    // A book shared with the players, or no longer: their records follow (its classes, species, equipment).
    const sharedNow = [...shelf.shared].filter((id) => shelf.active.has(id)).sort().join("|");
    if (sharedNow !== sharedSent) {
      sharedSent = sharedNow;
      for (const [ws, client] of clients) if (client.joined) send(ws, { type: "records", records: records.list({ seat: seatOf(client) }).map((record) => recordFor(record, seatOf(client))) });
    }
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
  const RULES_TYPES = new Set(["siegepackage", "siegepower", "siegegame", "item", "npc", "vehicle", "spell", "pregencharsheet", "cairntable", "fateskill", "fatestunt", "ironmove", "ironasset", "ironoracle", "irondelve", "playbook", "crewtype", "forgedtable", ...require("./dnd5e.cjs").TYPES_5E]);
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
      // A world's book brings its calendar: Mystara the Thyatian, a Greyhawk book the Common Year.
      const world = settingCalendar(info);
      if (world && calendar.persisted().id !== world) calendar.set({ id: world }, GM_SEAT);
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
    if (info && fits(info) && shelf.active.has(id)) {
      const file = books?.file?.(info.id);
      if (file) await prepareModule(file);
      // Deactivated while it waited (or was prepared): its records are not brought back.
      if (shelf.active.has(id)) loadRecords(info);
    }
    setTimeout(loadNextBook, 50);
  };
  if (pendingBooks.length > 0 && books) setTimeout(loadNextBook, 300);
  // The players may read it, or not (it is made active too). Never an
  // adventure: the players see its pictures and maps, as the GM shows them.
  async function shareBook(book, on = true) {
    const info = bookFor(book);
    if (on && info.adventure) throw new Error(`${info.title} is an adventure, the GM's alone. Show the players its pictures and maps instead.`);
    if (on && !info.hasBook) throw new Error(`${info.title} has no book to read.`);
    // Made active the whole way (its records, its world's calendar) before it is shared.
    if (on && !shelf.active.has(info.id)) await activateBook(info.id, true);
    if (on) shelf.shared.add(info.id);
    else shelf.shared.delete(info.id);
    shelfChanged();
    return shelfView();
  }
  // to: the players it is shown to (FG's share with one); none, everyone. Shown
  // again to more players, it is theirs too; shown to everyone, it is everyone's.
  function showImage(book, file, name, to) {
    if (!books?.picture(book, file)) throw new Error("There is no such picture in that book.");
    const names = Array.isArray(to) ? [...new Set(to.map((item) => text(item, "").slice(0, 24)).filter(Boolean))].slice(0, 32) : null;
    const existing = shelf.images.find((item) => item.book === book && item.file === file);
    const shown = existing ?? { id: crypto.randomBytes(6).toString("hex"), book, file: String(file), name: text(name, "Picture").slice(0, 120), at: Date.now() };
    if (!names || !names.length) delete shown.to;
    else if (!existing || Array.isArray(existing.to)) shown.to = [...new Set([...(existing?.to ?? []), ...names])];
    if (!existing) shelf.images = [...shelf.images, shown].slice(-40);
    shelfChanged();
    for (const [ws, client] of clients) if (seesImage(client, shown)) send(ws, { type: "image-shown", id: shown.id });
    return shown;
  }
  function hideImage(id) {
    shelf.images = id === "all" ? [] : shelf.images.filter((item) => item.id !== id);
    shelfChanged();
    return shelfView();
  }

  // A record's words as the players know it (an unidentified item as they see it), for the GM's Share.
  function sharedText(link) {
    if (!["record", "sheet", "note"].includes(link.kind)) return null;
    const record = records.get(link.record);
    if (!record) return null;
    const seen = require("./records.cjs").viewFor(record, { role: "player", name: "" });
    const data = seen.data ?? {};
    const words = [data.description, data.text, data.notes, data.nonid_notes, data.summary].find((value) => typeof value === "string" && value.trim()) ?? "";
    const { sanitizeFormatted } = require("../shared/text/formatted.mjs");
    return { name: String(seen.name ?? "").slice(0, 120), type: record.type, text: sanitizeFormatted(String(words), 6000) };
  }

  function chatFor(client) {
    const since = chatCleared.get(clearKey(client)) ?? 0;
    return chat
      .filter((line) => (line.at ?? 0) > since && seesLine(client, line))
      .slice(-JOIN_CHAT)
      .map((line) => heard(client, line));
  }

  // label: what the roll is for ("Strength check"). from: who rolled.
  // tag: the asker's own marker (a wizard waiting for its roll), echoed back.
  // extra: what an action adds to its roll card (an attack's HIT or MISS, its target).
  // secret: the GM's only, or shown to that one seat too (a name).
  function rollDice(formula, label, from, id, tag, secret = false, extra = null) {
    // The seat's modifier stack, by what the label says the roll is (none for hit points, ongoing damage...).
    // modKind: a plain roll (the tray, /roll) says so, whatever its label's words.
    const result = actRoll(formula, extra?.mods === false ? "none" : extra?.modKind ?? modifierKind(label), String(label ?? ""));
    if (extra && ("mods" in extra || "modKind" in extra)) {
      extra = { ...extra };
      delete extra.mods;
      delete extra.modKind;
    }
    label = edgeTagged(result, label);
    const roll = { ...result, label: text(label, "").slice(0, 160), ...(tag ? { tag: text(tag, "").slice(0, 80) } : {}), ...(extra ?? {}) };
    addChat({ id, from, text: "", roll, at: Date.now(), ...(secret ? { secret: true } : {}), ...(typeof secret === "string" ? { shownTo: secret } : {}) });
    return roll;
  }

  // Each seat hears only about records it may see. A record that stops being
  // visible to a seat is removed from that seat.
  records.subscribe(({ kind, record, before }) => {
    for (const [ws, client] of clients) {
      const seat = seatOf(client);
      const sees = kind === "upsert" && records.seenBy(record, seat);
      if (sees) send(ws, { type: "record", record: recordFor(record, seat) });
      else if ((before && records.seenBy(before, seat)) || kind === "delete") send(ws, { type: "record-gone", id: record.id });
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

  // The campaign's own maps (a picture of the GM's, made a map in Map Studio or
  // from Assets): its file in the campaign's Maps folder, its master by a scene
  // id from its name, so it is one map wherever it is opened.
  const ownMapId = (file) => `own-${String(file).toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;
  const ownMapFile = (file) => {
    const name = path.basename(String(file ?? ""));
    if (!ownMaps || !/\.(png|jpe?g|webp)$/i.test(name)) return null;
    const full = path.join(ownMaps.folder(), name);
    return fs.existsSync(full) ? full : null;
  };
  const gmOf = (url) => {
    const token = url.searchParams.get("token") || "";
    const client = token ? [...clients.values()].find((item) => item.assetToken === token) : null;
    return client?.role === "dm" ? client : null;
  };

  const onRequest = (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    // One of the campaign's own maps: its picture (the painted one when Map Studio painted it), or as a map bundle.
    if (req.method === "GET" && (url.pathname === "/table/own-map" || url.pathname === "/table/own-picture")) {
      const file = ownMapFile(url.searchParams.get("file"));
      if (!gmOf(url) || !file) {
        res.writeHead(gmOf(url) ? 404 : 403, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      const id = ownMapId(path.basename(file));
      const painted = studioPicture?.(id) ?? null;
      const picture = painted ?? fs.readFileSync(file);
      const ext = painted ? ".webp" : path.extname(file).toLowerCase();
      if (url.pathname === "/table/own-picture") {
        res.writeHead(200, { "Content-Type": { ".png": "image/png", ".webp": "image/webp" }[ext] ?? "image/jpeg", "Cache-Control": "no-store" });
        res.end(picture);
        return;
      }
      require("sharp")(picture, { limitInputPixels: 200_000_000 })
        .metadata()
        .then((meta) => {
          const { zipSync, strToU8 } = require("fflate");
          const name = path.basename(file).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || "Map";
          const scene = { _id: id, name, width: meta.width, height: meta.height, padding: 0, backgroundColor: "#000000", grid: { size: 100, type: 1, distance: 5, units: "ft", color: "#000000", alpha: 0.25 }, background: { src: `map${ext}` }, walls: [], lights: [], tokens: [], notes: [] };
          const bytes = zipSync({ "bundle.json": strToU8(JSON.stringify({ adventureData: { name, scenes: [scene] } })), [`map${ext}`]: new Uint8Array(picture) }, { level: 0 });
          res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": bytes.length, "Cache-Control": "no-store" });
          res.end(Buffer.from(bytes));
        })
        .catch(() => {
          res.writeHead(415, { "Cache-Control": "no-store" });
          res.end("That picture could not be read.");
        });
      return;
    }
    // An FG module's maps as a map bundle, for the GM's Library (its scenes' pins and FX seeded here).
    if (req.method === "GET" && url.pathname === "/table/fg-maps") {
      const token = url.searchParams.get("token") || "";
      const client = token ? [...clients.values()].find((item) => item.assetToken === token) : null;
      if (!client || client.role !== "dm") {
        res.writeHead(403, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      // The book by id, name or title, as the Library reads it (the shelf's file); active books only.
      const asked = String(url.searchParams.get("module") || "");
      if (books && !activeBookId(asked)) {
        res.writeHead(403, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
        res.end(`${books?.info(asked)?.title ?? (asked.split(/[\\/]/).pop() || "That book")} is not active in this campaign: make it active in Modules first.`);
        return;
      }
      const wanted = require("./library.cjs").resolved(asked);
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
      const asker = token.length > 0 ? [...clients.values()].find((client) => client.assetToken === token) : null;
      // A player is never sent the picture of a map the GM has not shared.
      const allowed = Boolean(asker) && (asker.role === "dm" || !scene || !heldBack.has(scene.id));
      if (!allowed || !image) {
        res.writeHead(404, { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      // An animated map is a video: the browser asks for it in ranges to play and loop it.
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
      if (range && (range[1] || range[2])) {
        const size = image.bytes.length;
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
        if (start >= size || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${size}`, "Access-Control-Allow-Origin": "*" });
          res.end();
          return;
        }
        res.writeHead(206, { "Content-Type": image.mime, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
        res.end(image.bytes.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, {
        "Content-Type": image.mime,
        "Content-Length": image.bytes.length,
        "Accept-Ranges": "bytes",
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
        if (url.pathname === "/book/list") return json({ books: shelfFor(client), ruleset, ...shelfView(client) });
        // A book's cover, for Modules (the GM chooses what to make active); its content needs it active.
        if (url.pathname === "/book/cover") return canRead(client, book) || (client.role === "dm" && fits(books?.info(book))) ? void Promise.resolve(books.coverSmall ? books.coverSmall(book) : books.cover(book)).then(picture, () => nothing()) : nothing();
        if (url.pathname === "/book/picture") return canSeePicture(client, book, url.searchParams.get("file") || "") ? picture(books.picture(book, url.searchParams.get("file") || "")) : nothing();
        // A book's sound or video file: the GM's, in Assets, from an active book.
        if (url.pathname === "/book/media") return client.role === "dm" && books.media && canRead(client, book) ? picture(books.media(book, url.searchParams.get("file") || "")) : nothing();
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
    // Dice packs (Documents/Kraken VTT/Dice): their sets and pictures, for every seat (each picks its own dice).
    if (req.method === "GET" && (url.pathname === "/dice/packs" || url.pathname === "/dice/file")) {
      const token = url.searchParams.get("token") || "";
      const client = token ? [...clients.values()].find((item) => item.assetToken === token) : null;
      const found = client && dicePacks ? (url.pathname === "/dice/packs" ? { list: dicePacks.list().map(({ problems, ...pack }) => (client.role === "dm" ? { ...pack, problems } : pack)) } : dicePacks.file(url.searchParams.get("id") || "")) : null;
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
      res.writeHead(200, { "Content-Type": found.mime, "Content-Length": found.bytes.length, "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" });
      res.end(found.bytes);
      return;
    }
    // Background decals and wallpapers: the list for the GM's picker, and the pictures for every seat.
    const pictures = { "/decal/list": decals, "/decal/file": decals, "/wallpaper/list": wallpapers, "/wallpaper/file": wallpapers, "/gmicon/list": gmIcons, "/gmicon/file": gmIcons, "/tower/list": towers, "/tower/file": towers, "/tile/list": tiles, "/tile/file": tiles };
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
        (canSee(record, seatOf(client)) || map.tokens().some((item) => item.recordId === record.id && !item.hidden) || client.role === "dm" || (spokenArt.has(record.id) && url.searchParams.get("kind") !== "card"));
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
      // An item in a character's gear (row: its inventory key): the picture its item brought from its book.
      const row = url.searchParams.get("row");
      const reference = row ? record?.data?.inventorylist?.[row]?.picture : record?.data?.[kind] || record?.data?.picture || record?.data?.token;
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
    // away: gone quiet (/afk, or idle); hand: a raised hand for the GM; lost: the connection dropped, a reconnect is awaited.
    const seat = (client, lost) => ({ id: client.id, name: client.name, role: client.role, ...(client.afk ? { afk: true } : {}), ...(client.idle ? { idle: true } : {}), ...(client.handUp ? { hand: true } : {}), ...(lost ? { lost: true } : {}) });
    return [...[...clients.values()].map((client) => seat(client, false)), ...[...lingering.values()].map((held) => seat(held.client, true))];
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
    const seated = new Set([...clients.values(), ...[...lingering.values()].map((held) => held.client)].filter((item) => item.joined && item.role === "player").map((item) => item.name));
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
    // Not shared: a player is sent no map.
    if (client.role !== "dm" && sceneHiddenNow()) return null;
    const { walls, tokens, lights, regions: _regions, ...shown } = scene;
    return {
      ...shown,
      image: image ? `/table/image?token=${client.assetToken}&v=${imageVersion}` : null,
      video: Boolean(image && image.mime.startsWith("video/")),
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

  // A player whose connection dropped (not kicked, not gone on purpose) keeps
  // their seat for a while, so a reconnect finds it and the portraits do not
  // flicker; the GM sees them as reconnecting. After the grace they have left.
  const GRACE_MS = Math.max(200, Number(process.env.KRAKEN_GRACE_MS) || 45000);
  function linger(ws) {
    const client = clients.get(ws);
    if (!client) return;
    clients.delete(ws);
    const key = client.name.toLowerCase();
    clearTimeout(lingering.get(key)?.timer);
    const timer = setTimeout(() => {
      if (lingering.get(key)?.client !== client) return;
      lingering.delete(key);
      broadcast({ type: "players", players: playerList() });
      sendRoster();
    }, GRACE_MS);
    lingering.set(key, { client, timer });
    broadcast({ type: "players", players: playerList() });
  }
  // A seat taken again (the same name rejoined): no longer waiting.
  function unlinger(name) {
    const key = String(name ?? "").toLowerCase();
    const held = lingering.get(key);
    if (!held) return null;
    clearTimeout(held.timer);
    lingering.delete(key);
    return held.client;
  }
  // The GM's Ban list: by name, and by the address it came from (this computer's never counts: the GM's and test players' own).
  const plainAddress = (address) => {
    const raw = String(address || "").toLowerCase();
    return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  };
  const bannedAs = (name, address) => bans.find((ban) => (ban.name && sameName(ban.name, name)) || (ban.address && !isLoopback(address) && ban.address === plainAddress(address))) ?? null;
  function sendBans() {
    for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "bans", bans });
  }
  function unban(name) {
    const before = bans.length;
    for (let index = bans.length - 1; index >= 0; index--) if (sameName(bans[index].name, name)) bans.splice(index, 1);
    if (bans.length === before) return null;
    onChange("table");
    sendBans();
    return text(name, "");
  }
  // A dead connection (a laptop asleep, a network gone) is found by its missing pongs and closed.
  const HEARTBEAT_MS = Math.max(200, Number(process.env.KRAKEN_HEARTBEAT_MS) || 15000);
  const heartbeat = setInterval(() => {
    for (const ws of clients.keys()) {
      if (ws.krakenAlive === false) {
        ws.terminate();
        continue;
      }
      ws.krakenAlive = false;
      try {
        ws.ping();
      } catch {
        /* closing already */
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

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
      address: plainAddress(remote),
    };
    ws.krakenAlive = true;
    ws.on("pong", () => {
      ws.krakenAlive = true;
    });
    const joinTimer = setTimeout(() => {
      if (!client.joined) ws.close();
    }, 10000);

    // Each request runs as its seat's (the modifier stack it reads, electron/modifiers.cjs).
    const onMessage = (raw) => {
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
        // The GM's own window (its host token, from this computer) is never refused, and takes back its seat.
        const theHost = typeof msg.hostToken === "string" && msg.hostToken.length > 0 && msg.hostToken === hostToken && isLoopback(remote);
        // Banned (the GM's Ban): before the password, so a banned player learns nothing more.
        const ban = theHost ? null : bannedAs(text(msg.name, ""), remote);
        if (ban) {
          send(ws, { type: "no", reason: "The GM has banned you from this table.", banned: true });
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
        // The GM's window rejoining after its connection dropped (it says so: rejoin), perhaps before the host has seen it go: it takes back its seat. (A second window with the token sits as a player.)
        if (theHost && msg.rejoin === true) {
          for (const [other, seat] of [...clients]) {
            if (seat.role !== "dm") continue;
            seat.leaving = true;
            clients.delete(other);
            other.terminate();
          }
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
          // (retry: a reconnecting player's old connection may not have been seen to drop yet.)
          if (!accounts?.has(client.name) && [...clients.values()].some((seat) => seat.role === "player" && sameName(seat.name, client.name))) return refuse(`Someone named ${client.name} is already at the table.`, { retry: true });
          // A damaged accounts file: any name might be one with a password, so no player sits until the GM fixes it.
          if (accounts?.damaged?.()) return refuse("The table cannot check players' accounts right now. Ask the GM to look at the Players window.");
          const account = msg.account && typeof msg.account === "object" ? msg.account : {};
          const accountPassword = typeof account.password === "string" ? account.password : "";
          const accountToken = typeof account.token === "string" ? account.token.slice(0, 100) : "";
          if (accounts?.has(client.name)) {
            let signed = null;
            try {
              signed = accounts.signIn(client.name, { password: accountPassword, token: accountToken });
            } catch (error) {
              return refuse(error instanceof Error ? error.message : "Signing in failed.");
            }
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
              seat.leaving = true;
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
        // A seat kept for this player after their connection dropped: theirs again (as /afk and a raised hand were).
        const kept = client.role === "player" ? unlinger(client.name) : null;
        if (kept) {
          client.afk = kept.afk;
          client.handUp = kept.handUp;
        }
        client.assetToken = crypto.randomBytes(18).toString("hex");
        client.joined = true;
        clearTimeout(joinTimer);
        clients.set(ws, client);
        // Their explored areas (and the rest of the map) follow the welcome.
        sendMaps();
        send(ws, {
          type: "ok",
          ruleset,
          you: { id: client.id, name: client.name, role: client.role, assetToken: client.assetToken, ...(client.accountToken ? { accountToken: client.accountToken } : {}), account: Boolean(accounts?.has(client.name)) },
          players: playerList(),
          map: client.role !== "dm" && sceneHiddenNow() ? emptyView() : map.viewFor(seatOf(client), client.assetToken),
          combat: forPlayer(client, combat.viewFor(seatOf(client))),
          calendar: calendar.view(seatOf(client)),
          clocks: clocks.view(seatOf(client)),
          chat: forPlayer(client, chatFor(client)),
          options,
          soundscape: scapeOut(),
          books: shelfView(client),
          quickSlots: slotsFor(client),
          modifiers: modifiers.view(clearKey(client)),
          prefs: prefs.get(prefsKey(client)),
          ...(client.role === "dm" ? { bookSounds: Object.fromEntries(bookSounds), sceneSound: sceneSoundView() } : {}),
          records: records.list({ seat: seatOf(client) }).map((record) => recordFor(record, seatOf(client))),
          scene: client.role === "player" ? sceneFor(client) : null,
          roster: rosterView(),
          ...(client.role === "dm" ? { bans } : {}),
        });
        broadcast({ type: "players", players: playerList() }, ws);
        if (client.role === "player") broadcast({ type: "roster", roster: rosterView() }, ws);
        party
          .partyView(agentHandle, client.role === "dm" ? null : PLAYER_VIEW)
          .then((view) => send(ws, { type: "party", party: view }))
          .catch(() => undefined);
        return;
      }

      // The GM has paused the game: a player's moves and rolls wait (chat goes on).
      if (options.paused && client.role !== "dm" && PAUSE_HOLDS.has(msg.type)) {
        const reason = "The GM has paused the game.";
        if (typeof msg.req === "number") send(ws, { type: "op-result", req: msg.req, ok: false, error: reason });
        send(ws, { type: "notice", text: reason });
        if (msg.type.startsWith("token-")) sendMaps();
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
          else if (msg.type === "book-share") shareBook(msg.book, msg.shared !== false).catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
          else if (msg.type === "image-share") showImage(msg.book, msg.file, msg.name, msg.to);
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

      // FG's read-aloud: the GM reads an adventure's boxed text to the table: to
      // chat, and over the map for everyone as a speech bubble.
      if (msg.type === "read-aloud") {
        if (client.role !== "dm") return send(ws, { type: "error", reason: "Only the GM reads aloud." });
        readAloud(text(msg.text, ""), text(msg.title, ""), client);
        return;
      }

      // The calendar: the GM sets the date and time (or moves them on); anyone writes notes on a day.
      if (msg.type === "calendar") {
        try {
          const seat = seatOf(client);
          if (msg.action === "set") calendar.set(msg.patch ?? {}, seat);
          else if (msg.action === "advance") calendar.advance({ days: msg.days, hours: msg.hours, minutes: msg.minutes }, seat);
          else if (msg.action === "note-add") calendar.addNote({ year: msg.year, day: msg.day, text: msg.text, shown: msg.shown }, seat, client.role === "dm" ? null : tokenColorOf(client.name));
          else if (msg.action === "note-update") calendar.updateNote(String(msg.id ?? ""), msg.patch ?? {}, seat);
          else if (msg.action === "note-remove") calendar.removeNote(String(msg.id ?? ""), seat);
          else if (msg.action === "say") {
            // Today's date and time, said in chat (FG's calendar chat buttons).
            addChat({ id: client.id, from: client.role === "dm" ? "Calendar" : client.name, text: `[DATE] ${calendar.view(seat).today}`, at: Date.now() });
          } else throw new Error("set, advance, note-add, note-update, note-remove or say?");
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "The calendar could not change." });
        }
        return;
      }

      // Progress clocks: the GM adds, ticks, changes and removes them, and sets the Score panel (position, effect, plan).
      if (msg.type === "clocks") {
        try {
          const seat = seatOf(client);
          if (seat.role !== "dm") throw new Error("Only the GM changes the clocks.");
          if (msg.action === "add") clocks.add(msg.clock ?? {}, seat);
          else if (msg.action === "tick") clocks.tick(String(msg.id ?? ""), Number(msg.amount) || 1, seat, { by: "Clocks" });
          else if (msg.action === "update") clocks.update(String(msg.id ?? ""), msg.patch ?? {}, seat);
          else if (msg.action === "remove") clocks.remove(String(msg.id ?? ""), seat);
          else if (msg.action === "clear") clocks.clear(seat);
          else if (msg.action === "score") clocks.setScore(msg.patch ?? {}, seat);
          else throw new Error("add, tick, update, remove, clear or score?");
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "The clocks could not change." });
        }
        return;
      }

      // Forged in the Dark: a scoundrel's rolls and sheet actions (id), or the crew's and the Score panel's (no id).
      if (msg.type === "forged") {
        const forged = require("./forged.cjs");
        const seat = seatOf(client);
        const args = msg.args && typeof msg.args === "object" ? msg.args : {};
        const fail = (error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." });
        if (msg.id) {
          const record = records.get(String(msg.id), seat);
          if (!record || !forged.isForged(record) || (client.role !== "dm" && record.owner !== client.name)) {
            send(ws, { type: "error", reason: "That is not your scoundrel." });
            return;
          }
          forged.actionForged(agentHandle, record, String(msg.action ?? ""), args, seat, client.role === "dm" ? record.name : client.name).catch(fail);
        } else forged.crewAction(agentHandle, String(msg.action ?? ""), args, seat, client.role === "dm" ? "GM" : client.name).catch(fail);
        return;
      }

      // A person's own settings (their colour, dice, how dice show), kept for them
      // by name; every browser they sit at gets them.
      if (msg.type === "prefs") {
        try {
          const before = prefs.get(prefsKey(client)).color;
          const next = prefs.set(prefsKey(client), msg.patch);
          for (const [other, seat] of clients) if (prefsKey(seat) === prefsKey(client)) send(other, { type: "prefs", prefs: next });
          // A new colour: everyone sees their tokens ringed in it.
          if (next.color !== before) sendMaps();
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

      // The seat's modifier stack (FG's modifier box and keys): add, remove, set, clear, key.
      if (msg.type === "modifiers") {
        try {
          modifiers.act(clearKey(client), { action: msg.action, value: msg.value, label: msg.label, index: msg.index, key: msg.key, on: msg.on, keys: msg.keys, mode: msg.mode });
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "The modifier box could not change." });
        }
        return;
      }

      if (msg.type === "chat-clear") {
        chatCleared.set(clearKey(client), Date.now());
        onChange("table");
        return;
      }

      if (msg.type === "chat") {
        // A link on the line (anything dropped into the chat's entry), and the GM's Share: the record's own text (FG's share).
        const link = cleanSlot(msg.link);
        const share = link && msg.share && client.role === "dm" ? sharedText(link) : null;
        const line = text(msg.text, "").slice(0, 500) || (link ? link.label : "");
        if (!line) return;
        const kind = CHAT_KINDS.has(msg.kind) ? msg.kind : "say";
        // The GM's alone: story text, and speaking as someone else (/id, /gmid).
        if (kind === "story" && client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM tells the story (/story)." });
          return;
        }
        const as = client.role === "dm" ? text(msg.as, "").slice(0, 24) : speaksAs(client, msg.as);
        const to = Array.isArray(msg.to) ? msg.to.map((name) => text(name, "").slice(0, 24)).filter(Boolean).slice(0, 12) : null;
        // Spoken in a language (FG's chat language): a player only in one their character knows.
        const lang = ["say", "mood"].includes(kind) ? text(msg.lang, "").slice(0, 40) : "";
        if (lang && client.role !== "dm") {
          const own = records.list({ type: "character", owner: client.name }).find((record) => record.name === as);
          if (!own || !languages.knows(own.data, lang)) {
            send(ws, { type: "error", reason: `${as || "You"} does not speak ${lang}.` });
            return;
          }
        }
        addChat({
          id: client.id,
          from: as || client.name,
          text: line,
          at: Date.now(),
          ...(kind !== "say" ? { kind } : {}),
          ...(kind === "mood" ? { mood: text(msg.mood, "").slice(0, 24) } : {}),
          ...(to && to.length ? { to } : {}),
          ...(link ? { link } : {}),
          ...(share ? { share } : {}),
          ...(lang ? { lang, understood: understoodBy(lang) } : {}),
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
        // The tray's and /roll's: a plain roll for the modifier box, whatever its label says.
        const PLAIN = { modKind: "roll" };
        try {
          // The dice tower, as FG's: the GM's roll, marked [TOWER]. Its roller sees
          // what went in (FG's line with the dice, no result) unless the GM
          // lets them see the result too; the rest of the table sees nothing.
          if (msg.tower) {
            const label = `[TOWER] ${text(msg.label, "")}`.trim();
            const reveal = client.role !== "dm" && options.towerReveal;
            const roll = rollDice(msg.formula, label, client.name, client.id, msg.tag, reveal ? client.name : true, PLAIN);
            if (client.role !== "dm" && !reveal) {
              send(ws, { type: "chat", id: client.id, from: client.name, text: `${label} [${roll.formula}]`, at: Date.now(), tower: true });
            }
          } else if (msg.mode === "blind") {
            // Foundry's /blindroll: the GM sees it, the roller sees only that it was rolled.
            const roll = rollDice(msg.formula, `[BLIND] ${text(msg.label, "")}`.trim(), client.name, client.id, msg.tag, true, PLAIN);
            if (client.role !== "dm") send(ws, { type: "chat", id: client.id, from: client.name, text: `[BLIND] ${text(msg.label, "")} [${roll.formula}]`.replace(/\s+/g, " "), at: Date.now(), tower: true });
          } else if (msg.mode === "gm") {
            // Foundry's /gmroll: the GM and the roller.
            rollDice(msg.formula, msg.label, client.name, client.id, msg.tag, client.role === "dm" ? true : client.name, PLAIN);
          } else if (msg.mode === "self") {
            // Foundry's /selfroll: the roller alone.
            const result = actRoll(msg.formula, "roll", text(msg.label, ""));
            addChat({ id: client.id, from: client.name, text: "", roll: { ...result, label: text(msg.label, "").slice(0, 160) }, at: Date.now(), self: true });
          } else rollDice(msg.formula, msg.label, client.role === "dm" ? (msg.as ? text(msg.as, "").slice(0, 24) : client.name) : speaksAs(client, msg.as) || client.name, client.id, msg.tag, false, PLAIN);
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." });
        }
        return;
      }

      // The creation wizard's finished character: the host builds it from the
      // spec with the campaign's books. A player's character is theirs.
      if (msg.type === "build-character") {
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        if (require("./fate.cjs").isFateRuleset(ruleset)) {
          // A Fate character from its wizard's spec (aspects, skills or approaches, stunts), or a book's pregen.
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./fate.cjs")
            .buildFate(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.aspects.highconcept}${record.data.aspects.trouble ? `, troubled by ${record.data.aspects.trouble}` : ""} (refresh ${record.data.refresh}).`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
        if (require("./ironsworn.cjs").isIronswornRuleset(ruleset)) {
          // An Ironsworn or Starforged character from its wizard's spec (stats, assets, background vow, bonds or a connection).
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./ironsworn.cjs")
            .buildIronsworn(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              const stats = record.data.stats;
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: Edge ${stats.edge}, Heart ${stats.heart}, Iron ${stats.iron}, Shadow ${stats.shadow}, Wits ${stats.wits}; ${Object.values(record.data.assets ?? {}).map((asset) => asset.name).join(", ")}.`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
        if (require("./forged.cjs").isForgedRuleset(ruleset)) {
          // A Forged in the Dark scoundrel from its wizard's spec (a playbook from the active books).
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./forged.cjs")
            .buildForged(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}${record.data.alias ? ` "${record.data.alias}"` : ""}: ${record.data.playbook}, ${record.data.heritage} ${record.data.background}, ${record.data.abilities?.[0]?.name ?? ""}.`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that scoundrel." }));
          return;
        }
        if (require("./cairn.cjs").isCairnRuleset(ruleset)) {
          // A Cairn character from its wizard's spec (the background's tables and the rolls made on the host's dice).
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./cairn.cjs")
            .buildCairn(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.background ?? ""}, STR ${record.data.attributes.str.score} DEX ${record.data.attributes.dex.score} WIL ${record.data.attributes.wil.score}, HP ${record.data.hp.max}.${problems.length ? ` ${problems.join(" ")}` : ""}`, at: Date.now() });
              answer({ ok: true, id: record.id, problems });
            })
            .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
          return;
        }
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
        if (require("./bfrpg.cjs").isBfRuleset(ruleset)) {
          // A Basic Fantasy character from its wizard's spec (the book's procedure, the shop's purchases).
          const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
          require("./bfrpg.cjs")
            .buildBf(agentHandle, msg.spec ?? {}, owner, client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name })
            .then(({ record, problems }) => {
              addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${record.data.race} ${record.data.className} ${record.data.level}.`, at: Date.now() });
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
            addChat({ id: client.id, from: client.name, text: `Imported ${record.name}${client.role === "dm" ? "" : `, level ${Number(record.data?.level) || 0}`} (${format === "fg" ? "an XML file" : format === "foundry" ? "Foundry VTT" : format === "roll20" ? "Roll20" : format === "kraken" ? "Kraken" : "a file"}).`, at: Date.now() });
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

      // Fate: a character's rolls, invokes, compels, fate points, stress and
      // consequences, milestones (id: the character); or the table's own (no
      // id): the scene's aspects, the GM's pool, the conflict's kind.
      if (msg.type === "fate") {
        const fate = require("./fate.cjs");
        const args = msg.args && typeof msg.args === "object" ? msg.args : {};
        const fail = (error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." });
        if (!fate.isFateRuleset(ruleset)) {
          send(ws, { type: "error", reason: "This campaign does not play Fate." });
          return;
        }
        if (!msg.id) {
          fate.tableFate(agentHandle, String(msg.action ?? ""), args, seatOf(client), client.role === "dm" ? "GM" : client.name).catch(fail);
          return;
        }
        const record = records.get(String(msg.id), seatOf(client));
        if (!record || !fate.isFate(record) || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "That is not your Fate character." });
          return;
        }
        fate.actionFate(agentHandle, record, String(msg.action ?? ""), args, seatOf(client), client.role === "dm" ? record.name : client.name).catch(fail);
        return;
      }

      // Ironsworn and Starforged: moves, burning momentum, choices, progress tracks,
      // assets, the oracles, Delve's sites and the tracker's foes (electron/ironsworn.cjs).
      if (msg.type === "ironsworn") {
        const iron = require("./ironsworn.cjs");
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        const action = String(msg.action ?? "");
        const args = msg.args && typeof msg.args === "object" ? msg.args : {};
        let run;
        if (iron.TABLE_ACTIONS.has(action)) run = iron.tableIronsworn(agentHandle, action, args, seatOf(client), client.role === "dm" && !["oracle", "site"].includes(action) ? "Combat" : client.name);
        else {
          const record = records.get(String(msg.id ?? ""), seatOf(client));
          if (!record || !iron.isIronsworn(record) || (client.role !== "dm" && record.owner !== client.name)) {
            answer({ ok: false, error: "That is not your Ironsworn character." });
            return;
          }
          run = iron.actionIronsworn(agentHandle, record, action, args, seatOf(client), client.role === "dm" ? record.name : client.name);
        }
        run
          .then((result) => answer({ ok: true, id: String(msg.id ?? ""), result: result && typeof result === "object" && "record" in result ? { ...result, record: undefined } : result }))
          .catch((error) => {
            answer({ ok: false, error: error instanceof Error ? error.message : "Could not do that." });
            send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." });
          });
        return;
      }

      // Bookkeeping (electron/bookkeeping.cjs): a character's ammunition picked up, an item used
      // (on whom: to), a ration eaten, skins filled, a pack opened, an item put in a container, the
      // GM's exhaustion; and the rests (rest: a character's, or the GM's whole party). Answered as an op.
      if (msg.type === "bookkeeping" || msg.type === "rest") {
        const seat = seatOf(client);
        const reply = (ok, result, error) => send(ws, { type: "op-result", req: msg.req ?? null, ok, id: String(msg.id ?? ""), ...(ok ? { result } : { error }) });
        const args = msg.args && typeof msg.args === "object" ? msg.args : {};
        const run = async () => {
          const api = bookkeeping();
          await api.ready;
          if (msg.type === "rest") return api.rest({ id: msg.id ? String(msg.id) : undefined, party: Boolean(args.party), kind: String(args.kind ?? msg.action ?? "long"), hitDice: args.hitDice === undefined ? undefined : Number(args.hitDice) }, seat);
          const record = records.get(String(msg.id ?? ""), seat);
          if (!record || record.type !== "character") throw new Error("No such character.");
          return api.act(record, String(msg.action ?? ""), args, seat);
        };
        run()
          .then((result) => reply(true, result))
          .catch((error) => {
            reply(false, null, error instanceof Error ? error.message : "Could not do that.");
            send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." });
          });
        return;
      }

      // Cairn: what a character does outside the fight (rest, Fatigue, spells, Scars, Growth).
      if (msg.type === "cairn") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || !require("./cairn.cjs").isCairn(record) || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "That is not your Cairn character." });
          return;
        }
        require("./cairn.cjs")
          .actionCairn(agentHandle, record, String(msg.action ?? ""), msg.args && typeof msg.args === "object" ? msg.args : {}, seatOf(client), client.role === "dm" ? record.name : client.name)
          .catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
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

      // Apeira Astra: a Mark awarded (the GM), a trick learned with it (the player), or a correction (the GM).
      if (msg.type === "character-mark") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot change that character's Marks." });
          return;
        }
        require("./astra.cjs")
          .markAstra(agentHandle, record, { action: String(msg.action ?? ""), trick: String(msg.trick ?? "") }, seatOf(client), client.role === "dm" ? "GM" : client.name)
          .catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not change the Marks." }));
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
          // Only an active book's lists and records.
          requireActiveBook(msg.action === "list" ? moduleName : bookOfPath(msg.path) || moduleName);
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
        // A treasure parcel dropped on a sheet (FG's, the GM's): its items into the gear, its coins into the purse.
        if (source?.type === "treasureparcel") {
          if (client.role !== "dm") {
            send(ws, { type: "error", reason: "The GM hands out parcels." });
            return;
          }
          require("./content.cjs")
            .parcelAction(agentHandle, { action: "character", id: source.id, character: record.id }, "GM")
            .catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not give the parcel." }));
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
        siegeCheck(agentHandle, record, { attribute: msg.attribute, cl: msg.cl, bonus: msg.bonus, label: msg.label, addLevel: typeof msg.addLevel === "boolean" ? msg.addLevel : undefined, ...(["check", "save", "skill", "morale"].includes(msg.kind) ? { kind: msg.kind, skill: text(msg.skill, ""), dc: num(msg.dc, 0), advantage: ["advantage", "disadvantage", "boon", "bane"].includes(msg.advantage) ? msg.advantage : "" } : {}) }, client.role === "dm" ? record.name : client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." }),
        );
        return;
      }

      // The campaign's content (electron/content.cjs): copies, story, random tables, identifying
      // items, encounters, parcels, quests. The GM's, but for a table roll; answered as an op.
      if (["record-copy", "story", "table-roll", "identify", "encounter", "parcel", "quest"].includes(msg.type)) {
        const seat = seatOf(client);
        const reply = (ok, result, error) => send(ws, { type: "op-result", req: msg.req ?? null, ok, id: result?.id ?? "", ...(ok ? { result } : { error }) });
        require("./content.cjs")
          .message(agentHandle, msg, { seat, from: client.role === "dm" ? "GM" : client.name, readBook: agentHandle.readBookRecord })
          .then((result) => reply(true, result))
          .catch((error) => reply(false, null, error instanceof Error ? error.message : "Could not do that."));
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
        const gone = kick(msg.name, { ban: Boolean(msg.ban) });
        if (!gone) send(ws, { type: "error", reason: `Nobody called ${text(msg.name, "")} is at the table.` });
        return;
      }
      // The GM's Ban list: read it, or let someone sit here again.
      if (msg.type === "bans") {
        if (client.role !== "dm") return;
        if (msg.action === "unban" && !unban(msg.name)) send(ws, { type: "error", reason: `${text(msg.name, "")} is not banned.` });
        else send(ws, { type: "bans", bans });
        return;
      }
      // Away (/afk, idle) and a raised hand: a player's own; the GM's for a player (name).
      if (msg.type === "presence") {
        const change = { ...(msg.afk !== undefined ? { afk: msg.afk } : {}), ...(msg.idle !== undefined ? { idle: msg.idle } : {}), ...(msg.hand !== undefined ? { hand: msg.hand } : {}) };
        if (client.role === "dm") {
          const seat = presenceOf(msg.name);
          if (!seat) send(ws, { type: "error", reason: `Nobody called ${text(msg.name, "")} is at the table.` });
          else setPresence(seat, change);
        } else setPresence(client, change);
        return;
      }
      // The GM rings a player's bell.
      if (msg.type === "ring") {
        if (client.role !== "dm") return;
        if (!ring(msg.name, client.name)) send(ws, { type: "error", reason: `Nobody called ${text(msg.name, "")} is at the table.` });
        return;
      }
      // The GM pulls the players' maps to the GM's view.
      if (msg.type === "view-pull") {
        if (client.role !== "dm") return;
        try {
          const done = pullView(msg, client.name);
          send(ws, { type: "notice", text: done.pulled ? `Pulled ${done.pulled} player${done.pulled === 1 ? "" : "s"} to your view.` : "No players to pull." });
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
        }
        return;
      }
      // Ask the players: an owner rolls their character's part of the party's roll from its card (the GM anyone's).
      if (msg.type === "party-prompt-roll") {
        promptRoll(String(msg.prompt ?? ""), String(msg.member ?? ""), seatOf(client)).catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." }));
        return;
      }

      // The GM's Session Log: the sittings, one's chat, an export (answered as an op).
      if (msg.type === "chat-log") {
        const reply = (ok, result, error) => send(ws, { type: "op-result", req: msg.req ?? null, ok, ...(ok ? { result } : { error }) });
        try {
          if (client.role !== "dm") throw new Error("The Session Log is the GM's (your own chat exports from the chat itself).");
          reply(true, sessionLog({ action: msg.action, id: msg.id, format: msg.format, title: msg.title }));
        } catch (error) {
          reply(false, null, error instanceof Error ? error.message : "Could not read the log.");
        }
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
      // The GM's Folders window's Refresh, from a browser seat (the app's own window asks its backend directly).
      if (msg.type === "content-refresh") {
        if (client.role !== "dm") return;
        agentHandle.contentChanged?.();
        return;
      }
      // FG's /save: the GM saves the campaign now.
      if (msg.type === "save") {
        if (client.role !== "dm") return;
        // Only "saved" when it is on the disk (onChange returns false when the write failed).
        if (onChange("save") === false) send(ws, { type: "error", reason: "The campaign could not be saved to the disk. Check the drive has space and nothing has the campaign's files open, then save again. Until then a copy of the unsaved campaign is kept in the recovery folder beside your campaigns." });
        else send(ws, { type: "notice", text: "Campaign saved." });
        return;
      }

      // FG's Share: the table map shown to the players, or not (they are sent no map).
      if (msg.type === "scene-share") {
        if (client.role !== "dm" || !scene) return;
        holdBack(scene.id, !msg.on);
        onChange("table");
        broadcastScene();
        sendMaps();
        return;
      }

      // The GM's image window: an image opened privately, closed, or a test.
      if (msg.type === "prep-close" || msg.type === "playtest") {
        if (client.role !== "dm") return;
        try {
          if (msg.type === "prep-close") {
            testing = false;
            previewing = false;
            prep.clearScene();
          } else if (msg.preview !== undefined) {
            // Player vision preview on or off (a play test ends first).
            if (testing) setPlaytest(false);
            previewing = Boolean(msg.preview);
            previewAs = previewing ? text(msg.as, "").slice(0, 24) : "";
          } else {
            previewing = false;
            setPlaytest(Boolean(msg.on), msg.at);
          }
          sendMaps();
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
        }
        return;
      }

      // The map: tokens, doors, line of sight and pings (mapState.cjs decides
      // who may do what).
      if (["token-place", "token-move", "token-remove", "token-update", "door", "sight", "lock", "scene-settings", "light-place", "light-update", "light-remove", "draw", "draw-update", "draw-erase", "draw-clear", "death-marker", "wall", "map-undo", "mask", "label", "map-group", "fx", "tile", "explored-reset", "token-undo", "move-approve", "map-sound", "trap", "door-found"].includes(msg.type)) {
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
            if (moved.some((item) => item.requested)) send(ws, { type: "notice", text: "The GM has locked token movement: your move waits for the GM." });
            else if (moved.some((item) => item.blocked)) send(ws, { type: "notice", text: "A wall is in the way." });
          } else if (msg.type === "token-move") {
            const to = { x: num(msg.x, NaN), y: num(msg.y, NaN) };
            if (!Number.isFinite(to.x) || !Number.isFinite(to.y) || Math.abs(to.x) > 1e7 || Math.abs(to.y) > 1e7) throw new Error("Where to?");
            const { blocked, requested } = working.move(String(msg.id ?? ""), to, testToken(String(msg.id ?? "")) ? TEST_SEAT : seat, { snap: msg.snap !== false });
            // Locked: FG's TokenMoveManager, the move waits for the GM's yes.
            if (requested) send(ws, { type: "notice", text: "The GM has locked token movement: your move waits for the GM." });
            else if (blocked) send(ws, { type: "notice", text: "A wall is in the way." });
          } else if (msg.type === "token-undo") {
            // Undo a move: a player their own last move, the GM any.
            working.undoMove(String(msg.id ?? ""), testToken(String(msg.id ?? "")) ? TEST_SEAT : seat);
          } else if (msg.type === "map-sound") {
            // The GM's sounds placed on the map (Scene settings): placed, changed, removed.
            if (msg.action === "add") working.addMapSound(msg.sound ?? {}, seat);
            else if (msg.action === "update") working.updateMapSound(String(msg.id ?? ""), msg.patch ?? {}, seat);
            else if (msg.action === "remove") working.removeMapSound(String(msg.id ?? ""), seat);
            else throw new Error("What should the sound do?");
          } else if (msg.type === "move-approve") {
            // The GM's approval strip: a player's locked move (or all of them) accepted or cancelled.
            if (client.role !== "dm") throw new Error("Only the GM approves moves.");
            working.approveMoves(msg.all ? "all" : Array.isArray(msg.ids) ? msg.ids.map(String).slice(0, 400) : [String(msg.id ?? "")], msg.accept !== false, seat);
          } else if (msg.type === "token-remove") {
            working.remove(String(msg.id ?? ""), seat);
          } else if (msg.type === "token-update") {
            working.update(String(msg.id ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "door-found") {
            // A secret door found: the players see it and use it (off: hidden again).
            working.setFound(String(msg.id ?? ""), msg.on !== false, seat);
          } else if (msg.type === "trap") {
            // The GM's Traps sprung strip (and the trap's eye on the map): roll, apply, let go; shown to the players or hidden.
            if (client.role !== "dm") throw new Error("Only the GM decides what a trap does.");
            if (msg.action === "reveal") working.updateRegion(String(msg.region ?? ""), { revealed: msg.on !== false }, seat);
            else if (["save", "damage", "roll", "apply", "release"].includes(msg.action)) resolveTrap(working, String(msg.tokenId ?? ""), msg.action).catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "The trap could not do that." }));
            else throw new Error("What should the trap do?");
          } else if (msg.type === "door") {
            working.setDoor(String(msg.id ?? ""), msg.state === undefined ? undefined : num(msg.state, -1), seat);
          } else if (msg.type === "sight") {
            if (client.role !== "dm") throw new Error("Only the GM can change line of sight.");
            working.setSight(Boolean(msg.on));
          } else if (msg.type === "scene-settings") {
            working.updateSettings(msg.patch ?? {}, seat);
          } else if (msg.type === "draw") {
            working.draw({ points: msg.points, color: msg.color, width: msg.width, shape: msg.shape, fill: msg.fill, fillAlpha: msg.fillAlpha, alpha: msg.alpha, group: msg.group }, seat);
          } else if (msg.type === "draw-update") {
            working.reshape(String(msg.id ?? ""), Array.isArray(msg.points) ? msg.points : [], seat);
          } else if (msg.type === "draw-erase") {
            working.erase(String(msg.id ?? ""), seat);
          } else if (msg.type === "death-marker") {
            if (msg.action === "clear") working.clearDeathMarkers(seat);
            else working.removeDeathMarker(String(msg.id ?? ""), seat);
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
          } else if (msg.type === "explored-reset") {
            // The GM's Reset explored: one player's memory of this scene, or everyone's.
            working.resetExplored(typeof msg.player === "string" ? msg.player.slice(0, 24) : "", seat);
          }
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
          sendMaps();
        }
        return;
      }

      // The Effects list (FG's Effects window): an effect dropped on a token, a tracker
      // row, a sheet or a party row; taken off, changed, put out or relit; the GM's own made or deleted.
      if (msg.type === "effects") {
        const seat = seatOf(client);
        const api = effects();
        api.ready
          .then(() => {
            if (msg.action === "apply") return api.apply({ to: msg.to, preset: msg.preset, effect: msg.effect, duration: msg.duration, gmOnly: msg.gmOnly }, seat);
            if (msg.action === "remove") return api.remove({ to: msg.to, effectId: msg.effectId }, seat);
            if (msg.action === "update") return api.update({ to: msg.to, effectId: msg.effectId, patch: msg.patch ?? {} }, seat);
            if (msg.action === "snuff" || msg.action === "relight") return api.update({ to: msg.to, effectId: msg.effectId, patch: { paused: msg.action === "snuff" } }, seat);
            if (msg.action === "save") return api.save(msg.effect ?? {}, seat);
            if (msg.action === "delete") return api.delete(String(msg.id ?? ""), seat);
            throw new Error("What should the effect do?");
          })
          .catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." }));
        return;
      }

      // Area templates (circle, cone, line, square): anyone places one in their
      // colour; target: true makes the creatures inside the targets of the one
      // who places it (the selected creature's, a player's own, the GM's whose turn it is).
      if (msg.type === "template") {
        const seat = seatOf(client);
        try {
          if (msg.action === "place") {
            const color = client.role === "dm" ? (prefs.get("@gm").color ?? "#ff9e3d") : tokenColorOf(client.name);
            const template = map.placeTemplate({ ...(msg.template ?? {}), turn: false }, { ...seat, color });
            if (msg.target && combat.entries().length) {
              const mine = (entry) => combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine;
              const entries = combat.entries();
              const named = msg.id ? entries.find((entry) => entry.id === String(msg.id) && (client.role === "dm" || mine(entry))) : null;
              const source = named ?? (client.role === "dm" ? entries.find((entry) => entry.id === combat.active()) : (entries.find((entry) => entry.id === combat.active() && mine(entry)) ?? entries.find(mine)));
              if (source) {
                const inside = map.tokensInTemplate(template).map((token) => entries.find((entry) => entry.tokenId === token.id) ?? entries.find((entry) => token.recordId && entry.recordId === token.recordId)).filter((entry) => entry && entry.id !== source.id && combat.health(entry).status !== "Dead");
                combat.targetIds(source.id, inside.map((entry) => entry.id), seat);
              }
            }
          } else if (msg.action === "move") map.moveTemplate(String(msg.id ?? ""), msg.patch ?? {}, seat);
          else if (msg.action === "remove") map.removeTemplate(String(msg.id ?? ""), seat);
          else if (msg.action === "clear") map.clearTemplates(seat);
          else throw new Error("What should the template do?");
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
        }
        return;
      }

      // The combat tracker. Players may roll their own initiative and end their own turn.
      if (msg.type === "ct") {
        // Who targets (FG's getSelectionHelper): the entry named (the selected token's,
        // the GM's any, a player's own), else a player's own creature (the active one
        // if several), else the GM's active one.
        const targeterOf = (wanted, who, whoSeat) => {
          const entries = combat.entries();
          const mine = (entry) => combat.viewFor(whoSeat).entries.find((item) => item.id === entry.id)?.mine;
          const named = wanted ? entries.find((entry) => entry.id === String(wanted)) : null;
          if (named && (who.role === "dm" || mine(named))) return named.id;
          const source = who.role === "dm" ? entries.find((entry) => entry.id === combat.active()) : (entries.find((entry) => entry.id === combat.active() && mine(entry)) ?? entries.find(mine));
          if (!source) throw new Error(who.role === "dm" ? "Whose target? Select a creature's token or start combat." : "Your character is not in the fight.");
          return source.id;
        };
        const tokenOfEntry = (entry) => map.tokens().find((token) => token.id === entry.tokenId) ?? map.tokens().find((token) => entry.recordId && token.recordId === entry.recordId) ?? null;
        // A creature is on the table map when its token is (no map shown: everyone counts).
        const onTableMap = (entry) => !map.scene() || Boolean(tokenOfEntry(entry));
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
            case "prev":
              return combat.previous(seat);
            case "round-back":
              return combat.roundBack(seat);
            case "set-round":
              return combat.setRound(msg.round, seat);
            case "remove-faction":
              return combat.removeFaction(msg.faction === "nonfriend" ? "nonfriend" : "foe", seat);
            case "clear-effects":
              return combat.clearEffects(seat);
            case "set-turn":
              return combat.setTurn(String(msg.id ?? ""), seat);
            // A tracker row's Delay and Act now (its owner, or the GM).
            case "delay":
              return combat.delay(String(msg.id ?? ""), seat);
            case "act-now":
              return combat.actNow(String(msg.id ?? ""), seat);
            case "end":
              return combat.end(seat, { removeNpcs: Boolean(msg.removeNpcs) });
            case "effect":
              return combat.addEffect(String(msg.id), msg.effect ?? {}, seat);
            case "effect-remove":
              return combat.removeEffect(String(msg.id), String(msg.effectId), seat);
            case "damage":
              return combat.damage(String(msg.id), msg.amount, seat);
            case "target": {
              // A target by token or entry: the source is the player's own entry (the
              // active one if several), or the GM's chosen or active entry.
              const entries = combat.entries();
              const target = msg.targetId ? entries.find((entry) => entry.id === msg.targetId) : entryOfToken(msg.tokenId);
              if (!target) throw new Error("Add that token to the combat tracker first.");
              const source = entries.find((entry) => entry.id === targeterOf(msg.sourceId, client, seat));
              const already = source.targets.includes(target.id);
              return combat.target(source.id, target.id, msg.on ?? !already, seat);
            }
            case "target-faction":
              // FG's target friendlies / target foes: the source's side, or the other side, on this map.
              return combat.targetFaction(targeterOf(msg.id, client, seat), msg.faction === "friend" ? "friend" : "foe", seat, onTableMap);
            case "target-box": {
              // Target mode's box: every creature whose token's centre is inside it.
              const [x1, x2] = [num(msg.x1, 0), num(msg.x2, 0)].sort((a, b) => a - b);
              const [y1, y2] = [num(msg.y1, 0), num(msg.y2, 0)].sort((a, b) => a - b);
              const ids = combat.entries().filter((entry) => {
                const token = tokenOfEntry(entry);
                return token && token.x >= x1 && token.x <= x2 && token.y >= y1 && token.y <= y2;
              }).map((entry) => entry.id);
              return combat.targetIds(targeterOf(msg.id, client, seat), ids, seat, Boolean(msg.add));
            }
            case "save": {
              // The GM asks any creature for a save; a player rolls their own.
              const entry = combat.entries().find((item) => item.id === msg.id);
              if (!entry) throw new Error("No one like that is in the fight.");
              if (client.role !== "dm" && !combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine) throw new Error("You can roll saves for your own character.");
              return combat.save(entry.id, String(msg.attribute), msg.cl, client.role === "dm" ? entry.name : client.name, undefined, String(msg.advantage ?? ""));
            }
            case "cast": {
              const who = msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) };
              const from = client.role === "dm" ? "Combat" : client.name;
              // Its area placed where the caster points, then cast at everyone inside.
              if (msg.template && typeof msg.template === "object") return castWithTemplate(who, String(msg.power), msg.template, seat, from);
              // From a screen that can place templates (place: true), a spell with an area
              // cast by a creature on the map with no targets picked asks for its template
              // first (FG: target first; Foundry: place the template). Picked targets cast at once.
              if (msg.place && !msg.castAction) {
                const info = combat.spellInfo(who, String(msg.power));
                const casterToken = info?.casterEntry && map.scene() ? tokenOfEntry(info.casterEntry) : null;
                if (info?.area && casterToken && !info.casterEntry.targets.length) {
                  send(ws, { type: "template-request", power: String(msg.power), recordId: msg.recordId ? String(msg.recordId) : null, id: msg.id ? String(msg.id) : null, name: info.name, area: info.area, casterTokenId: casterToken.id, color: client.role === "dm" ? (prefs.get("@gm").color ?? "#ff9e3d") : tokenColorOf(client.name) });
                  return;
                }
              }
              return combat.cast(who, String(msg.power), msg.castAction ? String(msg.castAction) : "", seat, from);
            }
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
            case "morale":
              // Basic Fantasy: a monster's (or retainer's) 2d6 at or under its score (bonus: the GM's adjustment).
              // Cairn: a WIL save to stand, for one creature (id) or a side (faction).
              return combat.morale(String(msg.id ?? msg.faction ?? "foe"), Number(msg.bonus) || 0, seat);
            case "apply-card": {
              // A damage card's button (Foundry's): x0, x1/2, x1, x2 or heal, for a creature on it or the GM's chosen one.
              const target = msg.targetId ? String(msg.targetId) : entryOfToken(msg.tokenId)?.id;
              if (!target) throw new Error("That creature is not on the combat tracker.");
              return combat.applyCard(String(msg.card ?? ""), target, msg.mult === "heal" ? "heal" : Number(msg.mult), seat);
            }
            case "apply-roll": {
              // A chat roll dropped on a creature (FG): its damage (by type), healing or attack against its AC.
              const target = msg.targetId ? String(msg.targetId) : entryOfToken(msg.tokenId)?.id;
              if (!target) throw new Error("That creature is not on the combat tracker.");
              return combat.dropRoll(target, msg.roll ?? {}, seat);
            }
            case "clear-targets":
              // All of them, or only the friends' or the foes' (the map toolbar's two clears).
              return combat.clearTargets(targeterOf(msg.id, client, seat), seat, ["friend", "foe"].includes(msg.faction) ? msg.faction : null);
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
              return combat.attack(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.weapon), seat, client.role === "dm" ? "Combat" : client.name, { full: Boolean(msg.full), mode: ["impaired", "enhanced"].includes(msg.mode) ? msg.mode : "", invokes: Array.isArray(msg.invokes) ? msg.invokes.slice(0, 6) : [] });
            case "absorb":
              // Fate: a hit's shifts taken by a stress box and consequences, as its player chooses (or taken out).
              return combat.absorb(String(msg.id ?? ""), msg.choice && typeof msg.choice === "object" ? msg.choice : {}, seat);
            case "concede":
              // Fate: out of the conflict before being taken out, for fate points.
              return combat.concede(String(msg.id ?? ""), seat);
            case "attack-together":
              // Cairn: several attackers at one foe, the highest die kept.
              return combat.attackTogether(Array.isArray(msg.ids) ? msg.ids : [], String(msg.targetId ?? ""), seat, client.role === "dm" ? "Combat" : client.name);
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
                : msg.mode || msg.kind === "skill" || msg.skill
                  ? // The party sheet's group roll for every game: a check, save or skill; rolled now, or asked of the players.
                    party.partyRoll(agentHandle, { kind: ["check", "save", "skill"].includes(msg.kind) ? msg.kind : "check", attribute: text(msg.attribute, "").slice(0, 60), skill: text(msg.skill, "").slice(0, 60), dc: num(msg.dc ?? msg.cl, 0), mode: msg.mode === "ask" ? "ask" : "roll", members: Array.isArray(msg.members) ? msg.members.slice(0, 40) : undefined }, client.name)
                  : party.groupCheck(agentHandle, msg.kind === "save" ? "save" : "check", msg.attribute, msg.cl, client.name);
        run.catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      // The GM shares the map (FG's Share on an image): it opens on every player's screen, closed or not.
      if (msg.type === "map-share") {
        if (client.role !== "dm" || !scene) return;
        // Shared: no longer held back, and open on every player's screen.
        holdBack(scene.id, false);
        onChange("table");
        broadcastScene();
        sendMaps();
        broadcast({ type: "map-share", name: scene.name });
        return;
      }

      if (msg.type === "ping") {
        const x = num(msg.x, NaN);
        const y = num(msg.y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        // As the ruler: not to the players while the GM is on a private image or the map is held back.
        const privateToGm = client.role === "dm" && gmMap() === prep;
        const out = { type: "ping", x, y, from: client.name, color: playerColorOf(client), sceneId: scene?.id ?? null };
        for (const [ws, other] of clients) if (other.role === "dm" || !(privateToGm || sceneHiddenNow())) send(ws, out);
        return;
      }

      // A ruler being measured (right-drag, with waypoints): shown to every
      // seat that sees this map as it moves, gone when it is let go. Not kept.
      if (msg.type === "ruler") {
        if (!scene) return;
        relayRuler(client, msg.points);
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
        if (opened && sceneSounds.has(next.id)) setSoundscape(freshScape(sceneSounds.get(next.id)));
        if (opened) sendSceneSound();
        // A bundle's tiles (Foundry's), placed the first time the scene opens.
        if (Array.isArray(msg.scene?.tiles) && msg.scene.tiles.length) map.seed(next.id, { tiles: storeTiles(msg.scene.tiles.slice(0, 300)) });
        map.setScene(next);
        broadcastScene();
        sendMaps();
      }
    };
    // One bad message never stops the table: it is logged, and a seat that has not joined is closed.
    ws.on("message", (raw) => {
      try {
        const done = modifierScope(client.joined ? clearKey(client) : "", () => onMessage(raw), client.joined ? { id: client.id, name: client.name, gm: client.role === "dm" } : null);
        if (done && typeof done.catch === "function") done.catch((error) => console.error("a table message failed", error));
      } catch (error) {
        console.error("a table message failed", error);
        if (!client.joined) ws.close();
        else send(ws, { type: "error", reason: "That could not be done." });
      }
    });

    ws.on("close", (code) => {
      clearTimeout(joinTimer);
      // Dropped, not sent away and not left on purpose (the page's Leave closes with 4000): the seat waits for a reconnect.
      if (client.joined && client.role === "player" && !client.leaving && code !== 4000 && clients.get(ws) === client) linger(ws);
      else removeClient(ws);
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
    // Whether a book is active here, and a refusal when it is not (its maps, pictures and records are off limits).
    activeBookId,
    requireActiveBook,
    seat: { role: "dm", name: "Agent" },
    // A token a trap holds: save, damage, roll, apply or release (as the GM's Traps sprung strip).
    resolveTrap: (tokenId, action) => resolveTrap(map, String(tokenId ?? ""), action),
    // A damage card changed (combat.cjs landOn, applyCard): its chat line keeps it and
    // every seat that sees the line is told; players do not see hidden creatures on it.
    cardUpdate(id, view) {
      const line = [...chat].reverse().find((item) => item.roll?.card === id);
      if (!line) return;
      line.roll.apply = view;
      for (const [ws, client] of clients) {
        if (!seesLine(client, line)) continue;
        const shown = client.role === "dm" ? view : { ...view, targets: view.targets.filter((row) => !row.hidden) };
        send(ws, forPlayer(client, { type: "card", card: id, apply: shown }));
      }
      onChange("table");
    },
    // The Effects list: put on, take off, change, put out and relight, the GM's own effects.
    get effects() {
      return effects();
    },
    // Bookkeeping: ammunition, consumables, rations, light from the pack, the load, rest.
    get bookkeeping() {
      return bookkeeping();
    },
    // A turn starts: the templates of instant spells come off the map.
    onTurn() {
      try {
        map.clearTemplates({ role: "dm", name: "GM" }, { turn: true });
      } catch {
        /* no scene */
      }
    },
    // A token joins the fight: what it carried (a lit torch) moves onto its entry.
    takeTokenEffects(tokenId) {
      try {
        const list = map.tokenEffects(tokenId);
        if (list.length) map.setTokenEffects(tokenId, []);
        return list;
      } catch {
        return [];
      }
    },
    // A creature leaves the fight: its effects stay on its token.
    giveTokenEffects(tokenId, list) {
      try {
        map.setTokenEffects(tokenId, [...map.tokenEffects(tokenId), ...list]);
      } catch {
        /* its token is on another scene, or gone */
      }
    },
    // A spell with an area: its template placed where its caster points (at:
    // {x, y} world pixels, or a whole template {shape, x, y, size, angle}), the
    // creatures inside become the caster's targets, then the spell is cast.
    castWithTemplate: (who, power, at, seat, from) => castWithTemplate(who, power, at, seat, from),
    // An entry's side changed on the tracker: its token follows (map.update tells the tracker back, which already agrees).
    syncTokenFaction(entry) {
      const token = entry.tokenId ? map.tokens().find((item) => item.id === entry.tokenId) : null;
      if (token && token.faction !== entry.faction) map.update(token.id, { faction: entry.faction }, { role: "dm", name: "GM" });
    },
    syncTokenHidden(entry) {
      const token = entry.tokenId ? map.tokens().find((item) => item.id === entry.tokenId) : null;
      if (token && Boolean(token.hidden) !== Boolean(entry.hidden)) map.update(token.id, { hidden: Boolean(entry.hidden) }, { role: "dm", name: "GM" });
    },
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
    // A record an active book's page links to (Copy to campaign), read from the book.
    async readBookRecord(book, bookPath) {
      requireActiveBook(String(book));
      const file = books?.file?.(String(book));
      if (file) await prepareModule(file);
      return books?.record(String(book), String(bookPath)) ?? null;
    },
    setOptions,
    roll: (formula, label, from = "Agent", secret = false, extra = null) => rollDice(formula, label, from, "agent", undefined, secret, extra),
    // A roll read through the modifier stack of the seat whose request this is (kind: attack, save, check, damage...).
    act: (formula, kind = "roll", label = "", options = {}) => actRoll(formula, kind, label, options),
    // A seat's modifier stack (FG's modifier box): view, add, remove, set, clear, key (who: a player's name; the GM's by default).
    modifiers: (args = {}, who = "@gm") => modifiers.act(!who || who === "GM" ? "@gm" : who, args),
    // Posts a roll already made (an attack decides HIT or MISS before its card goes out).
    postRoll: (result, label, from = "Agent", secret = false, extra = null) =>
      addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: "", roll: { ...result, label: text(edgeTagged(result, label), "").slice(0, 160), ...(extra ?? {}) }, at: Date.now(), ...(secret ? { secret: true } : {}) }),
    // A chat line with a link (a record, a page, a picture), or the GM's Share of a record's text.
    sayLink: (line, link, { from = "Agent", share = false, secret = false, extra = {} } = {}) => {
      const clean = cleanSlot(link);
      if (!clean) throw new Error("Give a link: { kind: record|sheet|note|book|picture|sound|dice|macro, ... }.");
      const shared = share ? sharedText(clean) : null;
      if (share && !shared) throw new Error("Only a record (an item, an NPC, a note...) can be shared.");
      return addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: text(line, "").slice(0, 500) || clean.label, at: Date.now(), link: clean, ...(shared ? { share: shared } : {}), ...(secret ? { secret: true } : {}), ...extra, ...(extra.lang ? { understood: understoodBy(extra.lang) } : {}) });
    },
    say: (line, from = "Agent", secret = false, extra = {}) =>
      addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: text(line, "").slice(0, 500), at: Date.now(), ...(secret ? { secret: true } : {}), ...extra, ...(extra.lang ? { understood: understoodBy(extra.lang) } : {}) }),
    kick: (name, how = {}) => kick(name, how),
    // The Players window's controls: the Ban list, Unban, Ring bell, a player away, a raised hand lowered, View as.
    bans: () => bans.map((ban) => ({ ...ban })),
    unban: (name) => unban(name),
    ring: (name, from = "GM") => ring(name, from),
    presence(name, change) {
      const seat = presenceOf(name);
      if (!seat) return null;
      setPresence(seat, change);
      return playerList().find((item) => item.id === seat.id) ?? null;
    },
    viewAs(name) {
      const wanted = text(name, "");
      if (wanted && !presenceOf(wanted) && !records.list({ type: "character", owner: wanted }).length) throw new Error(`No player called ${wanted} at this table.`);
      if (testing) setPlaytest(false);
      previewing = Boolean(wanted);
      previewAs = wanted.slice(0, 24);
      sendMaps();
      return previewing ? { viewingAs: previewAs } : { viewingAs: null };
    },
    pullView: (view, from = "Agent") => pullView(view, from),
    vote: (question, by = "Agent") => startVote(text(question, "").slice(0, 200), { id: "agent", name: by }),
    // Ask the players: a party roll's card (party.cjs partyRoll), and a row of it rolled (as its owner's click, or the GM's).
    prompt: (spec, from = "GM") => postPrompt(spec, from),
    promptRoll: (promptId, memberId, seat = { role: "dm", name: "GM" }) => promptRoll(String(promptId ?? ""), String(memberId ?? ""), seat),
    prompts: () => chat.filter((line) => line.prompt).map((line) => line.prompt),
    votes: () => chat.filter((line) => line.vote).map((line) => line.vote),
    save: () => onChange("save"),
    // The GM's Folders window's Refresh: the art read again, every seat's book shelf and lists sent again,
    // while the table stays up (no one is sent away).
    contentChanged() {
      art?.forget?.();
      for (const [ws, client] of clients) send(ws, { type: "books", ...shelfView(client) });
      broadcast({ type: "content-refreshed", at: Date.now() });
    },
    // The GM's /clear: the GM's chat windows clear, now and when they come back.
    clearChat() {
      chatCleared.set("@gm", Date.now());
      for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "chat-cleared" });
      onChange("table");
      return { cleared: true };
    },
    chatLog: (count = 20) => chat.slice(-Math.max(1, Math.min(MAX_CHAT, Number(count) || 20))),
    // The Session Log: sessions, session (id), export (id, format md|html), archive (the sitting so far).
    sessionLog: (args = {}) => sessionLog(args),
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
    towers: () => towers,
    dicePacks: () => dicePacks,
    calendar: () => calendar,
    // Progress clocks and the Score panel's state (clocks.cjs).
    clocks: () => clocks,
    readAloud: (words, title) => readAloud(words, title),
    sounds: () => sounds,
    playSound,
    stopSounds: () => (broadcast({ type: "sound-stop" }), { stopped: true }),
    ambience,
    music,
    soundscape: () => scapeOut(),
    sceneSound,
    storeTiles,
    // Books: what there is, a book's contents and pages, and sharing.
    books: () => shelfFor({ role: "dm" }),
    // A person's own settings (the GM's, or a player's by name), read or set.
    prefs(who = "@gm", patch) {
      const key = who === "GM" || who === "" ? "@gm" : who;
      if (patch === undefined) return prefs.get(key);
      const before = prefs.get(key).color;
      const next = prefs.set(key, patch);
      for (const [ws, seat] of clients) if (prefsKey(seat) === key) send(ws, { type: "prefs", prefs: next });
      if (next.color !== before) sendMaps();
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
    shareMap(on = true) {
      if (!scene) throw new Error("No scene is on the table.");
      holdBack(scene.id, !on);
      onChange("table");
      broadcastScene();
      sendMaps();
      if (on) broadcast({ type: "map-share", name: scene.name });
      return on ? { shared: scene.name } : { notShared: scene.name };
    },
    // A ruler shown to the table (the agent measuring), and cleared.
    ruler(points) {
      if (!scene) throw new Error("No scene is on the table.");
      relayRuler({ id: "agent", name: "Agent", role: "dm", color: "#f4f1ea" }, points);
    },
    // A ping on the map at a square, as a GM's click would make.
    ping(col, row, from = "Agent") {
      if (!scene) throw new Error("No scene is on the table.");
      const at = map.squareCenter(col, row, 1);
      broadcast({ type: "ping", x: at.x, y: at.y, from: text(from, "Agent").slice(0, 24), color: "#f4f1ea" });
      return at;
    },
    // A square's centre and the size of one square, in map pixels (the view pull's place).
    square: (col, row) => (scene ? { ...map.squareCenter(col, row, 1), size: map.squareSize() } : null),
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
    // The playlist's order and repeat: as asked, else as it was.
    const current = soundscape.music;
    if (action === "playlist" && current) {
      const next = { ...current, ...(extra.order ? { order: extra.order } : {}), ...(typeof extra.repeat === "boolean" ? { repeat: extra.repeat } : {}) };
      // A folder of one track loops with Repeat, and plays out without it.
      if (current.group && typeof extra.repeat === "boolean") {
        const count = sounds?.list("music").filter((item) => `music/${item.group}` === current.group || `music/${item.group}`.startsWith(`${current.group}/`)).length ?? 0;
        if (count <= 1) next.loop = extra.repeat;
      }
      return setSoundscape({ ...soundscape, music: next });
    }
    const order = extra.order === "order" || extra.order === "shuffle" ? extra.order : (current?.order ?? "shuffle");
    const repeat = typeof extra.repeat === "boolean" ? extra.repeat : (current?.repeat ?? true);
    const wanted = String((action === "next" ? current?.group : idOrGroup) ?? idOrGroup ?? "");
    const fromFolder = sounds?.has(wanted) ? null : wanted;
    const inFolder = fromFolder ? sounds.list("music").filter((item) => `music/${item.group}` === fromFolder || `music/${item.group}`.startsWith(`${fromFolder}/`)).sort((a, b) => a.id.localeCompare(b.id)) : [];
    let picked;
    // The tracks of this pass through the folder already played (shuffled: each once before any again).
    let played = action === "next" && current?.id ? [...(current.played ?? []), current.id] : [];
    if (fromFolder && order === "order" && inFolder.length) {
      // In order: the first track, or the one after the current; past the last, from the top again or stop.
      const at = action === "next" ? inFolder.findIndex((item) => item.id === current?.id) + 1 : 0;
      if (at >= inFolder.length && !repeat) return setSoundscape({ ...soundscape, music: null });
      picked = inFolder[at % inFolder.length];
    } else if (fromFolder && inFolder.length) {
      let left = inFolder.filter((item) => !played.includes(item.id));
      if (left.length === 0) {
        // The whole folder played: round again (not the same track twice running), or stop.
        if (!repeat) return setSoundscape({ ...soundscape, music: null });
        played = [];
        left = inFolder.length > 1 ? inFolder.filter((item) => item.id !== current?.id) : inFolder;
      }
      picked = left[Math.floor(Math.random() * left.length)];
    } else picked = sounds?.pick(wanted);
    if (!picked) throw new Error(`No music "${wanted}".`);
    // A track on its own loops; a folder of one loops only with Repeat on (else it plays once and stops).
    const loop = extra.loop !== false && (!fromFolder || (inFolder.length <= 1 && repeat));
    return setSoundscape({ ...soundscape, music: { id: picked.id, volume: extra.volume ?? current?.volume ?? 0.7, loop, group: fromFolder, startedAt: Date.now(), order, repeat, played } });
  }
  function setTriggers(list) {
    const cleaned = list === "default" ? defaultTriggers() : cleanTriggers(list);
    if (!cleaned) throw new Error("Triggers are a list.");
    soundTriggers = cleaned;
    for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "sound-triggers", triggers: soundTriggers });
    onChange("table");
    return soundTriggers;
  }

  // FG's /kick; ban: they may not sit here again (by name, and by the address they came from), until unbanned.
  function kick(name, { ban = false } = {}) {
    const entry = [...clients.entries()].find(([, client]) => client.role !== "dm" && sameName(client.name, name));
    // A player whose connection dropped can be banned too (their seat is waiting for them).
    const held = entry ? null : [...lingering.values()].find((item) => sameName(item.client.name, name))?.client ?? null;
    const client = entry ? entry[1] : held;
    if (!client) {
      if (!ban || !text(name, "")) return null;
      // Not at the table: banned by name alone.
      if (!bannedAs(name, "")) bans.push({ name: text(name, "").slice(0, 24), address: "", at: Date.now() });
      onChange("table");
      sendBans();
      return text(name, "").slice(0, 24);
    }
    client.leaving = true;
    if (held) {
      unlinger(held.name);
      broadcast({ type: "players", players: playerList() });
      sendRoster();
    }
    if (ban) {
      if (!bannedAs(client.name, client.address)) bans.push({ name: client.name, address: isLoopback(client.address) ? "" : client.address, at: Date.now() });
      onChange("table");
      sendBans();
    }
    if (entry) {
      const [ws] = entry;
      send(ws, { type: "kicked", reason: ban ? "The GM has banned you from this table." : "The GM has asked you to leave the table." });
      setTimeout(() => ws.close(4001, "kicked"), 50);
    }
    addChat({ id: "table", from: "Table", text: `${client.name} has left the table.`, at: Date.now(), kind: "story" });
    return client.name;
  }
  // The GM rings a player's bell (a chime and a flash on their screen alone).
  function ring(name, from = "GM") {
    const entry = [...clients.entries()].find(([, client]) => client.role !== "dm" && sameName(client.name, name));
    if (!entry) return null;
    send(entry[0], { type: "bell", from: text(from, "GM").slice(0, 24) });
    return entry[1].name;
  }
  // Away (/afk, or idle at the keyboard) and a raised hand: a player's own, or set by the GM for a player.
  function setPresence(client, change) {
    const before = `${Boolean(client.afk)}${Boolean(client.idle)}${Boolean(client.handUp)}`;
    if (change.afk !== undefined) client.afk = Boolean(change.afk);
    if (change.idle !== undefined) client.idle = Boolean(change.idle);
    if (change.hand !== undefined) client.handUp = Boolean(change.hand);
    if (before === `${Boolean(client.afk)}${Boolean(client.idle)}${Boolean(client.handUp)}`) return false;
    broadcast({ type: "players", players: playerList() });
    if (change.hand === true) for (const [ws, seat] of clients) if (seat.role === "dm") send(ws, { type: "hand", name: client.name });
    return true;
  }
  function presenceOf(name) {
    return [...clients.values()].find((client) => client.role !== "dm" && sameName(client.name, name)) ?? null;
  }
  // The GM pulls every player's map to a place: its centre and how much of it shows (world pixels).
  function pullView(view, from = "GM") {
    const x = num(view?.x, NaN);
    const y = num(view?.y, NaN);
    const width = Math.max(50, Math.min(1e6, num(view?.width, 0) || 1200));
    const height = Math.max(50, Math.min(1e6, num(view?.height, 0) || 800));
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7) throw new Error("Where to?");
    if (!scene) throw new Error("No scene is on the table.");
    if (sceneHiddenNow()) throw new Error("The map is not shared with the players.");
    const message = { type: "view-pull", x, y, width, height, from: text(from, "GM").slice(0, 24) };
    for (const [ws, client] of clients) if (client.role !== "dm") send(ws, message);
    return { pulled: [...clients.values()].filter((client) => client.role !== "dm").length, x, y, width, height };
  }
  // Ask the players (the party sheet's group roll): a card in chat; each row rolled by its owner
  // (their own sheet roll and modifier box), or by the GM; the summary when all have rolled.
  function postPrompt(spec, from = "GM") {
    const id = crypto.randomBytes(6).toString("hex");
    const prompt = { id, kind: text(spec.kind, "check").slice(0, 12), attribute: text(spec.attribute, "").slice(0, 60), skill: text(spec.skill, "").slice(0, 60), dc: num(spec.dc, 0), label: text(spec.label, "Group roll").slice(0, 120), rows: (spec.rows ?? []).slice(0, 40).map((row) => ({ id: text(row.id, "").slice(0, 160), name: text(row.name, "").slice(0, 80), owner: text(row.owner, "").slice(0, 24) })) };
    addChat({ id: "table", from: text(from, "GM").slice(0, 24), text: prompt.label, at: Date.now(), prompt, gm: true });
    return prompt;
  }
  async function promptRoll(promptId, memberId, seat) {
    const line = chat.find((item) => item.prompt?.id === promptId);
    if (!line) throw new Error("That roll is no longer asked for.");
    const prompt = line.prompt;
    const row = prompt.rows.find((item) => item.id === memberId);
    if (!row) throw new Error("They are not asked for this roll.");
    if (row.total !== undefined) throw new Error(`${row.name} has rolled already.`);
    if (seat.role !== "dm" && !sameName(row.owner, seat.name)) throw new Error(`${row.name} is not yours to roll for.`);
    const record = records.get(row.id);
    if (!record) throw new Error(`${row.name} is gone.`);
    row.total = null;
    try {
      // Rolled as the character (its portrait on the line), from whoever clicked.
      const result = await party.rollForMember(agentHandle, record, prompt, record.name);
      row.total = result.total;
      row.success = result.success;
    } catch (error) {
      delete row.total;
      throw error;
    }
    if (prompt.rows.every((item) => item.total !== undefined && item.total !== null)) {
      prompt.done = true;
      const judged = prompt.rows.some((item) => typeof item.success === "boolean");
      const passed = prompt.rows.filter((item) => item.success).length;
      const failed = prompt.rows.filter((item) => item.success === false).map((item) => item.name);
      addChat({ id: "table", from: "GM", text: judged ? `${prompt.label}: ${passed} of ${prompt.rows.length} succeed.${failed.length ? ` Failed: ${failed.join(", ")}.` : ""}` : `${prompt.label}: ${prompt.rows.map((item) => `${item.name} ${item.total}`).join(", ")}.`, at: Date.now(), gm: true });
    }
    broadcast({ type: "prompt", prompt });
    onChange("table");
    return prompt;
  }
  // The Session Log: the campaign's sittings, each one's chat (the GM's whole view), and an export of it.
  function linesOf(session) {
    const index = sessions.indexOf(session);
    const end = session.ended ?? sessions[index + 1]?.started ?? Infinity;
    // What the GM saw: a player's self roll is theirs alone, never in the GM's log.
    const live = chat.filter((line) => (line.at ?? 0) >= session.started && (line.at ?? 0) <= end && (!line.self || line.gm));
    if (session === thisSession) return live;
    const kept = sessionStore.read(session.id);
    return Array.isArray(kept) && kept.length >= live.length ? kept : live;
  }
  function archiveSession() {
    thisSession.ended = Date.now();
    const lines = linesOf(thisSession);
    if (!lines.length) return;
    sessionStore.save(thisSession.id, lines);
    thisSession.archived = true;
  }
  function sessionLog(args = {}) {
    const action = String(args.action ?? "sessions");
    const find = (id) => (id && id !== "current" ? sessions.find((item) => item.id === String(id)) : thisSession);
    if (action === "sessions") return sessions.map((item) => ({ ...item, current: item === thisSession, lines: linesOf(item).length })).reverse();
    const session = find(args.id);
    if (!session) throw new Error("No such session in the log.");
    const lines = linesOf(session);
    if (action === "session") return { ...session, current: session === thisSession, lines };
    if (action === "export") {
      const { chatToHtml, chatToMarkdown } = require("../shared/text/chatExport.mjs");
      const title = `${args.title ? `${text(args.title, "").slice(0, 80)}: ` : ""}session of ${new Date(session.started).toISOString().slice(0, 10)}`;
      const format = args.format === "html" ? "html" : "md";
      return { format, title, file: `${title.replace(/[^\w -]+/g, "").replace(/\s+/g, "-")}.${format === "html" ? "html" : "md"}`, text: format === "html" ? chatToHtml(lines, title) : chatToMarkdown(lines, title) };
    }
    if (action === "archive") {
      archiveSession();
      delete thisSession.ended;
      return { ...thisSession };
    }
    throw new Error("sessions, session, export or archive?");
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

  // A player's chosen colour by name (their tokens' ring), else the table's for that name.
  function tokenColorOf(name) {
    return prefs.get(String(name)).color ?? playerColor(String(name));
  }
  function readAloud(words, title, by = { id: "agent", name: "GM" }) {
    const said = String(words).trim().slice(0, 6000);
    if (!said) throw new Error("Nothing to read.");
    addChat({ id: by.id, from: text(by.name, "GM").slice(0, 24), text: said, at: Date.now(), kind: "readaloud", ...(title ? { title: String(title).slice(0, 120) } : {}) });
    broadcast({ type: "read-aloud", text: said, title: String(title ?? "").slice(0, 120), at: Date.now() });
    return { read: said.length };
  }
  // A ruler to the other seats on this map (points [x, y, ...]: start, waypoints, end; none clears it).
  // The GM measuring on a private image, or a map held back, reaches no player.
  const rulerAt = new Map();
  function relayRuler(client, raw) {
    const points = Array.isArray(raw) ? raw.slice(0, 66).map(Number) : [];
    if (points.length % 2 || points.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e7)) return;
    const clearing = points.length < 4;
    // At most about 25 a second from one seat (a clear always goes).
    const now = Date.now();
    if (!clearing && now - (rulerAt.get(client.id) ?? 0) < 40) return;
    rulerAt.set(client.id, now);
    const privateToGm = client.role === "dm" && gmMap() === prep;
    const out = { type: "ruler", from: text(client.name, "GM").slice(0, 24), id: String(client.id ?? client.name), sceneId: scene?.id ?? null, color: client.color ?? playerColorOf(client), points: clearing ? [] : points };
    for (const [ws, other] of clients) {
      if (other === client) continue;
      if (other.role !== "dm" && (privateToGm || sceneHiddenNow())) continue;
      send(ws, out);
    }
  }

  function playerColorOf(client) {
    return prefs.get(prefsKey(client)).color ?? (client.role === "dm" ? "#f4f1ea" : playerColor(client.name));
  }

  // Bookkeeping starts with the table: the day counting from today, the load's effects kept as records change.
  void bookkeeping().start();

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
        // A picture, or an animated map (a .webm or .mp4 video).
        const type = typeof mime === "string" && (mime.startsWith("image/") || mime === "video/webm" || mime === "video/mp4") ? mime : "application/octet-stream";
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
        heldBack: [...heldBack],
        // (The one-map form an older save kept, cleared: the save merges over what was there.)
        hiddenSceneId: null,
        combat: combat.persisted(),
        calendar: calendar.persisted(),
        clocks: clocks.persisted(),
        records: records.toJSON(),
        dice: dice.toJSON(),
        sound: soundscape,
        books: shelfView(),
        soundTriggers,
        soundTriggersVersion: TRIGGERS_VERSION,
        chatCleared: Object.fromEntries(chatCleared),
        quickSlots: Object.fromEntries(quickSlots),
        modifiers: modifiers.toJSON(),
        sessions,
        bookSounds: Object.fromEntries(bookSounds),
        sceneSounds: Object.fromEntries(sceneSounds),
        bans,
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
      clearInterval(heartbeat);
      // The sitting's chat into the Session Log's archive.
      try {
        archiveSession();
      } catch {
        /* the log stays in the campaign's chat as far as it goes */
      }
      for (const held of lingering.values()) clearTimeout(held.timer);
      lingering.clear();
      // 4003: the table closed (the GM left): players go back to the join screen, not into a reconnect.
      for (const ws of clients.keys()) ws.close(4003, "closed");
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
