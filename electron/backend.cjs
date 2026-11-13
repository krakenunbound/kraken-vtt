// Kraken's backend: everything the GM's app does that is not its window — the
// table server (players, maps, chat, dice), the campaigns and their saving,
// the libraries (art, decals, sounds, books), the agent bridge and the DM
// assistant. It runs in a process of its own (Electron's utility process), so
// nothing it does, however heavy (a module unpacked, a big map read), can
// freeze the window: the window's process only draws and forwards.
//
// The window's process (main.cjs) calls in with { type: "call", id, name, args }
// and is answered { type: "result", id, ok, value | error }. This process asks
// the window's process for what only it can do (the window, a dialog's file,
// the assistant's key) with { type: "ask", id, op, payload }, answered
// { type: "answer", id, ok, value | error }; and tells it of events
// ({ type: "event", channel, payload }: the assistant's progress).
const fs = require("fs");
const https = require("https");
const path = require("path");
const { createTableServer, eachAddress } = require("./tableServer.cjs");
const { createArtLibrary, defaultRoots } = require("./artLibrary.cjs");
const { createDecalLibrary } = require("./decals.cjs");
const { createSoundLibrary } = require("./sounds.cjs");
const { createBookShelf } = require("./books.cjs");
const { fgDataFolder } = require("./importers/fgModule.cjs");
const packs = require("./packs.cjs");
const campaigns = require("./campaigns.cjs");
const { startAgentServer } = require("./agent/mcpServer.cjs");
const assistantModule = require("./assistant.cjs");

const port = process.parentPort;
const USER_DATA = process.env.KRAKEN_USER_DATA;
const APP_DIR = path.join(__dirname, "..");
const VERSION = process.env.KRAKEN_VERSION || "0.0.0";
if (!USER_DATA) throw new Error("The backend needs KRAKEN_USER_DATA.");

// --- Asking the window's process -------------------------------------------
let asked = 0;
const asks = new Map();
function ask(op, payload, timeout = 60000) {
  const id = ++asked;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      asks.delete(id);
      reject(new Error("The app window did not answer."));
    }, timeout + 2000);
    asks.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    port.postMessage({ type: "ask", id, op, payload, timeout });
  });
}
const emit = (channel, payload) => port.postMessage({ type: "event", channel, payload });

function campaignFile() {
  return path.join(USER_DATA, "campaigns.json");
}

let networkCache = { at: 0, v4: [], v6: [], externalV4: "", externalV6: "" };
function fetchText(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 2500 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(res.statusCode === 200 ? Buffer.concat(chunks).toString("utf8").trim() : ""));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => {
      req.destroy();
      resolve("");
    });
  });
}
function ipv4(value) {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return "";
  return value.split(".").map(Number).every((part) => part <= 255) ? value : "";
}
function ipv6(value) {
  return /^[0-9a-f:]+$/i.test(value) && value.includes(":") ? value : "";
}
async function networkSnapshot() {
  const local = eachAddress();
  if (Date.now() - networkCache.at < 60000 && networkCache.v4.join() === local.v4.join()) return { ...networkCache, v4: local.v4, v6: local.v6 };
  const [externalV4, externalV6] = await Promise.all([fetchText("https://api.ipify.org"), fetchText("https://api6.ipify.org")]);
  networkCache = { at: Date.now(), v4: local.v4, v6: local.v6, externalV4: ipv4(externalV4), externalV6: ipv6(externalV6) };
  return networkCache;
}

let table = null;

// --- The libraries ------------------------------------------------------------
// Background decals: Kraken's own, the GM's assets folder (shared by every
// campaign; a picture the GM picks is copied in), and FG's decals.
let decalLibrary = null;
let wallpaperLibrary = null;
let gmIconLibrary = null;
let soundLibrary = null;
let bookShelf = null;
// The GM's books: the FG modules on this computer, read in place, and the
// GM's Kraken packs (Documents/Kraken VTT/Packs), which need no FG at all.
// A test's own shelf of modules (KRAKEN_BOOKS) has its own packs folder too, never the GM's.
process.env.KRAKEN_PACKS ||= process.env.KRAKEN_BOOKS ? path.join(USER_DATA, "packs") : packs.packFolder();
function books() {
  if (!bookShelf) bookShelf = createBookShelf({ folder: process.env.KRAKEN_BOOKS || path.join(fgDataFolder(), "modules"), cache: path.join(USER_DATA, "books-index.json"), also: [packs.BUNDLED, path.join(APP_DIR, "games", "modules")], packsFolder: packs.packFolder() });
  return bookShelf;
}

// Kraken packs made from the GM's FG modules, one at a time in a worker
// thread: the books of a ruleset in Kraken's own files, to take to any
// computer. packsView: each FG module (of a ruleset, or all) and its pack.
const packJob = { queue: [], current: null, progress: null, made: [], failed: [] };
const FG_BACKUP = /\.bak[-.\w]*$|\.mod\.|_retired|backup/i;
function packsView({ ruleset = "" } = {}) {
  const files = books().files();
  // Kraken's own books (shipped, as packs) are not the GM's to make.
  const bundled = [path.join(APP_DIR, "games", "modules"), packs.BUNDLED].map((folder) => path.resolve(folder));
  const ours = (item) => bundled.some((folder) => path.resolve(item.file).startsWith(folder));
  const packsByName = new Map(files.filter((item) => item.pack && !ours(item)).map((item) => [item.name, item]));
  const modules = files.filter((item) => !item.pack && !FG_BACKUP.test(item.file) && !ours(item));
  const fits = (kraken) => !ruleset || kraken === ruleset || kraken === "Any";
  const rows = modules
    .map((item) => {
      const pack = packsByName.get(item.name);
      const kraken = packs.krakenRuleset(item.ruleset);
      return {
        id: item.id,
        name: item.name,
        title: item.title,
        category: item.category,
        ruleset: kraken,
        fgRuleset: item.ruleset,
        hasBook: item.hasBook,
        pack: pack ? { file: path.basename(pack.file), current: (pack.mtime ?? 0) + 1000 >= (item.mtime ?? 0) && packs.packCurrent(pack.file) } : null,
        state: packJob.current === item.id ? "making" : packJob.queue.includes(item.id) ? "waiting" : packJob.failed.find((failed) => failed.id === item.id) ? "failed" : "",
      };
    })
    .filter((row) => fits(row.ruleset));
  // Packs with no FG module here (made on another computer).
  const only = [...packsByName.values()].filter((pack) => !modules.some((item) => item.name === pack.name) && fits(pack.kraken)).map((pack) => ({ id: pack.id, name: pack.name, title: pack.title, category: pack.category, ruleset: pack.kraken, fgRuleset: pack.ruleset, hasBook: pack.hasBook, pack: { file: path.basename(pack.file), current: true }, state: "", packOnly: true }));
  return {
    folder: packs.packFolder(),
    books: [...rows, ...only].sort((a, b) => a.ruleset.localeCompare(b.ruleset) || a.title.localeCompare(b.title)),
    making: packJob.current ? { id: packJob.current, ...packJob.progress, waiting: packJob.queue.length } : null,
    made: packJob.made.slice(-20),
    failed: packJob.failed.slice(-20),
  };
}
function makePacks(ids) {
  const files = books().files();
  const wanted = (Array.isArray(ids) ? ids : [ids]).map(String);
  const queued = [];
  for (const id of wanted) {
    const found = files.find((item) => !item.pack && (item.id === id || item.name === id || item.title === id));
    if (!found) throw new Error(`No FG module "${id}" on this computer.`);
    if (packJob.current === found.id || packJob.queue.includes(found.id)) continue;
    packJob.failed = packJob.failed.filter((failed) => failed.id !== found.id);
    packJob.queue.push(found.id);
    queued.push(found.id);
  }
  setImmediate(nextPack);
  return { queued, waiting: packJob.queue.length + (packJob.current ? 1 : 0) };
}
function nextPack() {
  if (packJob.current || packJob.queue.length === 0) return;
  const id = packJob.queue.shift();
  const found = books().files().find((item) => !item.pack && item.id === id);
  if (!found) return setImmediate(nextPack);
  packJob.current = id;
  packJob.progress = { done: 0, total: 0 };
  const { Worker } = require("worker_threads");
  const worker = new Worker(path.join(__dirname, "packWorker.cjs"), { workerData: { file: found.file, folder: packs.packFolder() } });
  let answered = false;
  const finish = (ok, value) => {
    if (answered) return;
    answered = true;
    if (ok) packJob.made.push({ id, ...value, at: Date.now() });
    else packJob.failed.push({ id, error: String(value), at: Date.now() });
    packJob.current = null;
    packJob.progress = null;
    books().refresh();
    emit("packs-event", { id, ok });
    setImmediate(nextPack);
  };
  worker.on("message", (message) => {
    if (message?.progress) packJob.progress = message.progress;
    else if (message?.ok) finish(true, message.made);
    else if (message && message.ok === false) finish(false, message.error);
  });
  worker.once("error", (error) => finish(false, error?.message ?? error));
  worker.once("exit", (code) => finish(false, `The pack maker stopped (${code}).`));
}
// The GM's sounds (one-shots, effects, ambience, music), shared by every campaign.
function sounds() {
  if (!soundLibrary) soundLibrary = createSoundLibrary({ folder: path.join(USER_DATA, "assets", "sounds"), builtin: path.join(APP_DIR, "sounds") });
  return soundLibrary;
}
// The GM's chat pictures: the Kraken GM Icon set and the GM's own.
function gmIcons() {
  if (!gmIconLibrary) gmIconLibrary = createDecalLibrary({ folder: path.join(USER_DATA, "assets", "gm-icons"), builtin: path.join(APP_DIR, "dist", "gm-icons"), own: [] });
  return gmIconLibrary;
}
// Players' accounts and everyone's own settings: one for every campaign this GM runs.
let accountStore = null;
let prefsStore = null;
function prefs() {
  if (!prefsStore) prefsStore = require("./prefs.cjs").createPrefsStore(path.join(USER_DATA, "prefs.json"), require("./tableServer.cjs").diceLook);
  return prefsStore;
}
function accounts() {
  if (!accountStore) accountStore = require("./accounts.cjs").createAccountStore(path.join(USER_DATA, "accounts.json"));
  return accountStore;
}
// Kraken's own portraits and tokens (a race and class set, round tokens made
// from them), in the assets folder beside the GM's FG collection; by race.
function krakenArtRoots() {
  const assets = path.join(USER_DATA, "assets");
  return [
    { dir: path.join(assets, "portraits"), kind: "portrait", group: "Kraken", prefix: "kraken/portraits/" },
    { dir: path.join(assets, "tokens"), kind: "token", group: "Kraken", prefix: "kraken/tokens/" },
    // Kraken's own games' heroes, shipped with the app: a portrait and token
    // for each kin and class (Descending Darkness) and Origin and Path (Apeira
    // Astra), so a tester's new character has one with nothing else installed.
    { dir: path.join(APP_DIR, "games", "portraits"), kind: "portrait", group: "Kraken", prefix: "kraken-games/portraits/" },
    { dir: path.join(APP_DIR, "games", "tokens"), kind: "token", group: "Kraken", prefix: "kraken-games/tokens/" },
  ];
}
// Image layers' pictures (map tiles): the GM's assets folder, shared by every
// campaign; a module's or bundle's pictures are copied in once, named by content.
let tileLibrary = null;
function tiles() {
  if (!tileLibrary) tileLibrary = createDecalLibrary({ folder: path.join(USER_DATA, "assets", "tiles"), own: [], hashNames: true });
  return tileLibrary;
}
// The GM's own choices that follow them into every campaign (the GM icon), on this computer.
function preferencesFile() {
  return path.join(USER_DATA, "preferences.json");
}
function preferences() {
  try {
    return JSON.parse(fs.readFileSync(preferencesFile(), "utf8")) ?? {};
  } catch {
    return {};
  }
}
function savePreference(key, value) {
  try {
    // Whole or not at all: a crash mid-write never leaves half a file.
    const temp = `${preferencesFile()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ ...preferences(), [key]: value }));
    fs.renameSync(temp, preferencesFile());
  } catch {
    /* the campaign still has it */
  }
}
// The desktop's wallpapers (FG's desktop theme): Kraken's own, one per game, and the GM's own.
function wallpapers() {
  if (!wallpaperLibrary) wallpaperLibrary = createDecalLibrary({ folder: path.join(USER_DATA, "assets", "wallpapers"), builtin: path.join(APP_DIR, "dist", "wallpapers"), own: [], named: true });
  return wallpaperLibrary;
}
function decals() {
  if (!decalLibrary) decalLibrary = createDecalLibrary({ folder: path.join(USER_DATA, "assets", "decals"), builtin: path.join(APP_DIR, "dist", "decals"), fgData: fgDataFolder() });
  return decalLibrary;
}
const libraryOf = (kind) => (kind === "wallpaper" ? wallpapers() : kind === "gmicon" ? gmIcons() : kind === "tile" ? tiles() : decals());

// --- The campaign being hosted --------------------------------------------------
// Its table (view, chat, tokens and doors) is saved to disk when something
// changes (after a short pause), every 30 seconds while dirty, when the DM
// leaves, and when the app quits.
const SAVE_EVERY_MS = 30000;
const SAVE_AFTER_CHANGE_MS = 2000;
let hosted = null;

function flushCampaign() {
  if (!hosted || !hosted.dirty) return;
  const persisted = table ? table.persisted() : {};
  const state = { ...hosted.state, ...persisted, view: hosted.state.view ?? null, savedAt: Date.now() };
  try {
    campaigns.writeState(campaignFile(), hosted.id, state, { records: hosted.recordsDirty });
    hosted.state = state;
    hosted.dirty = false;
    hosted.recordsDirty = false;
  } catch (error) {
    console.error("could not save campaign", error);
  }
}
function markDirty(kind) {
  if (!hosted) return;
  // A GM icon just chosen goes with the GM into every campaign.
  const icon = table?.agent?.options?.().gmIcon;
  if (typeof icon === "string" && icon !== preferences().gmIcon) savePreference("gmIcon", icon);
  hosted.dirty = true;
  if (kind === "records") hosted.recordsDirty = true;
  // FG's /save: now, not after the usual pause.
  if (kind === "save") {
    hosted.recordsDirty = true;
    clearTimeout(hosted.soon);
    flushCampaign();
    return;
  }
  clearTimeout(hosted.soon);
  hosted.soon = setTimeout(flushCampaign, SAVE_AFTER_CHANGE_MS);
}
function closeCampaign() {
  if (!hosted) return;
  flushCampaign();
  clearInterval(hosted.timer);
  clearTimeout(hosted.soon);
  hosted = null;
}
function openCampaign(id) {
  closeCampaign();
  if (!id) return null;
  if (!campaigns.exists(campaignFile(), id)) throw new Error("That campaign is missing.");
  hosted = { id, state: campaigns.readState(campaignFile(), id), dirty: false, recordsDirty: false, soon: null, timer: null };
  hosted.timer = setInterval(flushCampaign, SAVE_EVERY_MS);
  return hosted.state;
}
// A campaign's ruleset is chosen before it is hosted (it decides its books).
function setCampaignRuleset(input) {
  if (hosted && hosted.id === String(input?.id ?? "")) throw new Error("Leave the table first: a campaign's ruleset is changed before it is hosted.");
  return campaigns.setRuleset(campaignFile(), input);
}
function requireHosted(id) {
  if (!hosted || hosted.id !== String(id ?? "")) throw new Error("That campaign is not being hosted.");
  return hosted;
}
async function stopTable() {
  // Save first: table.persisted() needs the server that is about to stop.
  if (hosted) {
    hosted.dirty = true;
    hosted.recordsDirty = true;
    flushCampaign();
  }
  const current = table;
  table = null;
  if (current) await current.stop();
  closeCampaign();
}
function plain(error) {
  if (error && error.code === "EADDRINUSE") return "That port is already in use.";
  return error instanceof Error ? error.message : "Could not host.";
}
const bytesOf = (value) => (value == null ? Buffer.alloc(0) : Buffer.isBuffer(value) ? value : Buffer.from(value));

// The GM's own pictures for the rulesets on the campaign screen (a game's logo
// from their own books, say): assets/rulesets/<ruleset>.png in their data,
// never shipped. Keyed by the ruleset's name in letters and digits only.
const RULESET_PICTURE = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml" };
function rulesetLogos() {
  const folder = path.join(USER_DATA, "assets", "rulesets");
  fs.mkdirSync(folder, { recursive: true });
  const logos = {};
  for (const name of fs.readdirSync(folder)) {
    const type = RULESET_PICTURE[path.extname(name).toLowerCase()];
    if (!type) continue;
    const file = path.join(folder, name);
    if (fs.statSync(file).size > 2 * 1024 * 1024) continue;
    const key = path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key) logos[key] = `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
  }
  return { folder, logos };
}

// --- What the window's process may call -------------------------------------------
const calls = {
  addresses: () => eachAddress().v4,
  network: () => networkSnapshot(),
  campaigns: () => campaigns.read(campaignFile()),
  "save-campaign": (input) => campaigns.create(campaignFile(), input),
  "touch-campaign": (input) => campaigns.touch(campaignFile(), input),
  "campaign-ruleset": (input) => setCampaignRuleset(input),
  "ruleset-logos": () => rulesetLogos(),
  async "start-host"(options) {
    const wanted = Number(options?.port);
    const password = String(options?.password ?? "");
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > 65535) throw new Error("Port must be from 1 to 65535.");
    if (!options?.lan && !options?.cloud) throw new Error("Turn on LAN or Cloud.");
    await stopTable();
    const campaignId = typeof options?.campaignId === "string" ? options.campaignId : "";
    const saved = openCampaign(campaignId) ?? {};
    // The GM's icon follows them: a campaign that has none yet takes the last one chosen.
    const remembered = preferences().gmIcon;
    if (typeof remembered === "string" && !(saved.options && "gmIcon" in saved.options)) saved.options = { ...(saved.options ?? {}), gmIcon: remembered };
    const dataFolder = fgDataFolder();
    const ruleset = campaigns.read(campaignFile()).find((item) => item.id === campaignId)?.ruleset ?? "";
    const next = createTableServer({ saved, ruleset, onChange: markDirty, art: createArtLibrary({ base: dataFolder, roots: [...defaultRoots(dataFolder), ...krakenArtRoots()] }), decals: decals(), wallpapers: wallpapers(), gmIcons: gmIcons(), tiles: tiles(), sounds: sounds(), books: books(), accounts: accounts(), prefs: prefs() });
    try {
      const info = await next.listen({ port: wanted, password });
      table = next;
      if (hosted) hosted.port = info.port;
      const net = await networkSnapshot();
      return { ...info, v6: net.v6, externalV4: net.externalV4, externalV6: net.externalV6 };
    } catch (error) {
      await next.stop().catch(() => undefined);
      closeCampaign();
      throw new Error(plain(error));
    }
  },
  "stop-host": () => stopTable(),
  "campaign-view": (id) => {
    const current = requireHosted(id);
    return { view: current.state.view ?? null, hasBundle: Boolean(campaigns.readBundle(campaignFile(), id)) };
  },
  "campaign-bundle": (id) => {
    requireHosted(id);
    return campaigns.readBundle(campaignFile(), id);
  },
  "save-bundle": (id, bytes) => {
    requireHosted(id);
    const buffer = bytesOf(bytes);
    if (buffer.length === 0) throw new Error("That adventure was empty.");
    campaigns.writeBundle(campaignFile(), id, buffer);
  },
  "save-view": (id, view) => {
    const current = requireHosted(id);
    const adventure = typeof view?.adventure === "string" ? view.adventure.slice(0, 200) : "";
    const sceneId = typeof view?.sceneId === "string" ? view.sceneId.slice(0, 80) : "";
    current.state.view = adventure ? { adventure, sceneId } : null;
    markDirty();
  },
  "set-token-art": (list) => {
    if (!table) throw new Error("Not hosting.");
    table.setTokenArt((Array.isArray(list) ? list : []).map((item) => ({ id: item?.id, mime: item?.mime, bytes: item?.bytes ? bytesOf(item.bytes) : null })));
  },
  // A picture from anywhere (the window's process asked the GM for the file), copied into the assets folder.
  "decal-add-file": (kind, file) => libraryOf(kind).addFile(String(file)),
  "decal-add": (name, bytes, kind) => libraryOf(kind).add(String(name ?? ""), bytesOf(bytes)),
  "sound-add-files": (kind, group, files) => (Array.isArray(files) ? files : []).map((file) => sounds().addFile(String(kind), String(group ?? ""), String(file))),
  "sound-add": (kind, group, name, bytes) => sounds().add(String(kind), String(group ?? ""), String(name ?? ""), bytesOf(bytes)),
  "sound-folder": () => {
    fs.mkdirSync(sounds().folder, { recursive: true });
    return sounds().folder;
  },
  "decal-folder": (kind) => {
    const folder = libraryOf(kind).folder;
    fs.mkdirSync(folder, { recursive: true });
    return folder;
  },
  "set-scene-image": (bytes, mime) => {
    if (!table) throw new Error("Not hosting.");
    const buffer = bytesOf(bytes);
    if (buffer.length > 80 * 1024 * 1024) throw new Error("Map image is too large.");
    table.setImage(buffer, typeof mime === "string" ? mime : "");
  },
  "assistant-status": () => assistantStatus(),
  "assistant-ask": (text) => assistant.ask(String(text ?? "")),
  "assistant-stop": () => assistant.stop(),
  "assistant-reset": () => assistant.reset(),
  // The key the GM typed (kept encrypted by the window's process): known here for this run.
  "assistant-typed-key": (key) => {
    typedKey = typeof key === "string" ? key : "";
    return assistantStatus();
  },
  hosting: () => Boolean(table || hosted),
  packs: (input) => packsView(input ?? {}),
  "packs-make": (ids) => makePacks(ids),
  // The packs folder (made if new): the window's process opens it.
  "packs-folder": () => {
    fs.mkdirSync(packs.packFolder(), { recursive: true });
    return packs.packFolder();
  },
  // Quitting: the table saved and stopped.
  quit: () => stopTable(),
};

// --- The agent bridge and the DM assistant ------------------------------------
const agentContext = {
  table: () => table,
  hosting: () => (hosted && table ? { campaignId: hosted.id, port: hosted.port ?? null } : null),
  campaigns: {
    list: () => campaigns.read(campaignFile()),
    create: (input) => campaigns.create(campaignFile(), input),
    setRuleset: (input) => setCampaignRuleset(input),
  },
  ui: (command, timeout) => ask("ui", command, timeout ?? 60000),
  // The window itself (a screenshot, its text, a script in it): done by the window's process.
  windowOp: (op, payload) => ask("window", { op, ...payload }),
  assistant: () => assistant,
  packs: { view: (input) => packsView(input ?? {}), make: (ids) => makePacks(ids), job: () => packJob },
};

// The DM assistant (GM only): the key from the environment or .env.local, or
// one the GM typed into its window (kept encrypted by the window's process).
let typedKey = "";
function assistantKey() {
  if (typedKey) return { key: typedKey, from: "app" };
  return assistantModule.envKey(APP_DIR);
}
const assistant = assistantModule.createAssistant({
  ctx: agentContext,
  key: () => assistantKey()?.key ?? null,
  makeClient: (key) => {
    const Anthropic = require("@anthropic-ai/sdk").default;
    return new Anthropic({ apiKey: key });
  },
  onEvent: (event) => emit("assistant-event", event),
});
function assistantStatus() {
  const found = assistantKey();
  return { ...assistant.view(), hasKey: Boolean(found), keyFrom: found?.from ?? null };
}

// --- Messages ---------------------------------------------------------------------
port.on("message", async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "answer") {
    const wait = asks.get(message.id);
    if (!wait) return;
    asks.delete(message.id);
    if (message.ok) wait.resolve(message.value);
    else wait.reject(new Error(String(message.error || "The app could not do that.")));
    return;
  }
  if (message.type !== "call") return;
  const run = calls[message.name];
  try {
    if (!run) throw new Error(`No such call: ${message.name}`);
    const value = await run(...(Array.isArray(message.args) ? message.args : []));
    port.postMessage({ type: "result", id: message.id, ok: true, value });
  } catch (error) {
    port.postMessage({ type: "result", id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

(async () => {
  try {
    const agentPort = process.env.KRAKEN_AGENT_PORT === undefined ? undefined : Number(process.env.KRAKEN_AGENT_PORT);
    await startAgentServer(agentContext, { version: VERSION, ...(Number.isInteger(agentPort) ? { port: agentPort } : {}) });
  } catch (error) {
    console.error("agent bridge did not start", error instanceof Error ? error.message : error);
  }
  port.postMessage({ type: "ready" });
})();
