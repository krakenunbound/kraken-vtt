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
const { openPort } = require("./portMapping.cjs");
const { startAgentServer } = require("./agent/mcpServer.cjs");
const assistantModule = require("./assistant.cjs");

const port = process.parentPort;
const USER_DATA = process.env.KRAKEN_USER_DATA;
const APP_DIR = path.join(__dirname, "..");
const VERSION = process.env.KRAKEN_VERSION || "0.0.0";
if (!USER_DATA) throw new Error("The backend needs KRAKEN_USER_DATA.");
// What goes wrong in this process is kept in <userData>/logs/backend.log (Settings > Open logs).
const backendLog = require("./logFile.cjs").createLog(path.join(USER_DATA, "logs"), "backend");
backendLog.capture();
// Something no handler caught: logged (capture's monitor), the hosted campaign saved, and the table goes on.
process.on("uncaughtException", (error) => {
  console.error("uncaught", error);
  try {
    if (typeof flushCampaign === "function") flushCampaign();
  } catch {
    /* saving is best-effort here */
  }
});
process.on("unhandledRejection", (error) => console.error("unhandled rejection", error));

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
// Kraken's folders in Documents/Kraken VTT (kfolders.cjs), made with their
// guides before any library reads them; what the app's data folder held before is copied in.
const kraken = (() => {
  const folders = require("./kfolders.cjs");
  const legacy = { decals: path.join(USER_DATA, "assets", "decals"), wallpapers: path.join(USER_DATA, "assets", "wallpapers"), gmicons: path.join(USER_DATA, "assets", "gm-icons"), towers: path.join(USER_DATA, "assets", "towers") };
  return { ...folders, folderOf: (kind) => (folders.ready({ legacy }), folders.folderOf(kind)) };
})();
// The GM's chat pictures: the Kraken GM Icon set and the GM's own.
function gmIcons() {
  if (!gmIconLibrary) gmIconLibrary = createDecalLibrary({ folder: kraken.folderOf("gmicons"), builtin: path.join(APP_DIR, "dist", "gm-icons"), own: [] });
  return gmIconLibrary;
}
// The GM's own dice tower pictures (a tower look for the table), shared by every campaign.
let towerLibrary = null;
function towers() {
  if (!towerLibrary) {
    towerLibrary = createDecalLibrary({ folder: kraken.folderOf("towers"), builtin: path.join(APP_DIR, "dist", "towers"), own: [] });
    // A picture named "<name> lit" is <name>'s look when the tower is on (FG's dice tower on and off): not a look of its own.
    const list = towerLibrary.list.bind(towerLibrary);
    towerLibrary.list = () => list().filter((item) => !/ lit\.[a-z]+$/i.test(item.id));
  }
  return towerLibrary;
}
// Dice packs: more dice sets for every seat, from Documents/Kraken VTT/Dice.
let dicePackLibrary = null;
function dicePacks() {
  if (!dicePackLibrary) dicePackLibrary = require("./dicePacks.cjs").createDicePacks({ folder: kraken.folderOf("dice"), lookOf: require("./tableServer.cjs").diceLook });
  return dicePackLibrary;
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
    { dir: path.join(assets, "portraits"), kind: "portrait", group: "Maelstrom", prefix: "kraken/portraits/" },
    { dir: path.join(assets, "tokens"), kind: "token", group: "Maelstrom", prefix: "kraken/tokens/" },
    // Kraken's own games' heroes, shipped with the app: a portrait and token
    // for each kin and class (Descending Darkness) and Origin and Path (Apeira
    // Astra), so a tester's new character has one with nothing else installed.
    { dir: path.join(APP_DIR, "games", "portraits"), kind: "portrait", group: "Maelstrom", prefix: "kraken-games/portraits/" },
    { dir: path.join(APP_DIR, "games", "tokens"), kind: "token", group: "Maelstrom", prefix: "kraken-games/tokens/" },
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
  if (!wallpaperLibrary) wallpaperLibrary = createDecalLibrary({ folder: kraken.folderOf("wallpapers"), builtin: path.join(APP_DIR, "dist", "wallpapers"), own: [], named: true });
  return wallpaperLibrary;
}
function decals() {
  if (!decalLibrary) decalLibrary = createDecalLibrary({ folder: kraken.folderOf("decals"), builtin: path.join(APP_DIR, "dist", "decals"), fgData: fgDataFolder() });
  return decalLibrary;
}
const libraryOf = (kind) => (kind === "wallpaper" ? wallpapers() : kind === "gmicon" ? gmIcons() : kind === "tile" ? tiles() : kind === "tower" ? towers() : decals());

// --- The campaign being hosted --------------------------------------------------
// Its table (view, chat, tokens and doors) is saved to disk when something
// changes (after a short pause), every 30 seconds while dirty, when the DM
// leaves, and when the app quits.
const SAVE_EVERY_MS = 30000;
const SAVE_AFTER_CHANGE_MS = 2000;
let hosted = null;

// True when what is in memory is on the disk; false when the write failed (it is still dirty, so it is tried again).
function flushCampaign() {
  if (!hosted || !hosted.dirty) return true;
  const persisted = table ? table.persisted() : {};
  const state = { ...hosted.state, ...persisted, view: hosted.state.view ?? null, savedAt: Date.now() };
  try {
    campaigns.writeState(campaignFile(), hosted.id, state, { records: hosted.recordsDirty });
    hosted.state = state;
    hosted.dirty = false;
    hosted.recordsDirty = false;
    return true;
  } catch (error) {
    console.error("could not save campaign", error);
    // What could not be saved is kept whole in recovery/<campaign id>.json beside the campaigns (the newest
    // failed save), so leaving or quitting loses nothing; it is put back by copying it over the campaign's state.json.
    try {
      const dir = path.join(path.dirname(campaignFile()), "recovery");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${hosted.id}.json`), JSON.stringify(state));
      console.error("the unsaved campaign was written to", path.join(dir, `${hosted.id}.json`));
    } catch (again) {
      console.error("could not write the recovery copy either", again);
    }
    return false;
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
    return flushCampaign();
  }
  clearTimeout(hosted.soon);
  hosted.soon = setTimeout(flushCampaign, SAVE_AFTER_CHANGE_MS);
}
function closeCampaign() {
  if (!hosted) return;
  // Leaving or quitting: a failed save leaves its recovery copy (flushCampaign).
  flushCampaign();
  try {
    if (hosted.lock && Number(fs.readFileSync(hosted.lock, "utf8").split(" ")[0]) === process.pid) fs.rmSync(hosted.lock, { force: true });
  } catch {
    /* already gone */
  }
  clearInterval(hosted.timer);
  clearInterval(hosted.backups);
  clearTimeout(hosted.soon);
  hosted = null;
}
// Rolling backups of the hosted campaign: one as it is played, then one an hour (the newest ten kept).
const BACKUP_EVERY_MS = Math.max(1000, Number(process.env.KRAKEN_BACKUP_EVERY_MS) || 3600_000);
function backupCampaign(id, reason) {
  try {
    if (hosted && hosted.id === id) {
      hosted.dirty = true;
      hosted.recordsDirty = true;
      // A backup of the old disk state would look current: none is made when the save failed.
      if (!flushCampaign()) return null;
    }
    return campaigns.backup(campaignFile(), { id, reason });
  } catch (error) {
    console.error("could not back up the campaign", error);
    return null;
  }
}
function openCampaign(id) {
  closeCampaign();
  if (!id) return null;
  if (!campaigns.exists(campaignFile(), id)) throw new Error("That campaign is missing.");
  // One copy of the app hosts a campaign at a time (two would each save over the other): a lock file with this
  // process's id, in the campaign's folder while it is hosted; one left by a copy that is gone is taken over.
  const lock = path.join(campaigns.folder(campaignFile(), id), "hosting.lock");
  try {
    // "<pid> <boot time>": a lock from before the computer restarted is stale whatever its pid.
    const [holderText, bootText] = fs.readFileSync(lock, "utf8").split(" ");
    const holder = Number(holderText);
    const sameBoot = Math.abs(Number(bootText) - (Date.now() - require("os").uptime() * 1000)) < 120000;
    if (holder && holder !== process.pid && sameBoot) {
      let alive = false;
      try {
        process.kill(holder, 0);
        alive = true;
      } catch (error) {
        alive = error?.code === "EPERM";
      }
      if (alive) throw Object.assign(new Error("That campaign is open in another copy of Maelstrom VTT: close it there first."), { held: true });
    }
  } catch (error) {
    if (error?.held) throw error;
  }
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, `${process.pid} ${Math.round(Date.now() - require("os").uptime() * 1000)}`);
  hosted = { id, state: campaigns.readState(campaignFile(), id), dirty: false, recordsDirty: false, soon: null, timer: null, lock };
  hosted.timer = setInterval(flushCampaign, SAVE_EVERY_MS);
  // A copy as it was before this sitting, then every hour while it is hosted.
  backupCampaign(id, "play");
  hosted.backups = setInterval(() => backupCampaign(id, "hourly"), BACKUP_EVERY_MS);
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
  invite = null;
  // The port opened on the router is closed again.
  const mapping = portMapping;
  portMapping = null;
  if (mapping) await Promise.race([mapping.remove().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))]);
}
// The port the router opened for this table (portMapping.cjs), and the invite links (the password in the #fragment,
// which a browser never sends to the server; the join page reads it).
let portMapping = null;
let invite = null;
function inviteFor({ port, password, lan, internet }) {
  const link = (host) => `http://${host}:${port}/${password ? `#pw=${encodeURIComponent(password)}` : ""}`;
  return { internet: internet ? link(internet) : "", lan: lan.map(link), local: link("127.0.0.1") };
}
function plain(error) {
  if (error && error.code === "EADDRINUSE") return "That port is already in use.";
  return error instanceof Error ? error.message : "Could not host.";
}
const bytesOf = (value) => (value == null ? Buffer.alloc(0) : Buffer.isBuffer(value) ? value : Buffer.from(value));

// Kraken Map Studio (studio/web, its server electron/studio/server.cjs): the
// map maker, started the first time its window opens, on 127.0.0.1 only. Its
// port stays the same from run to run (47821, else another), so its own saved
// tabs and autosave (kept by address in the window) are found again.
let studioServer = null;
// Where Map Studio's asset packs are (the GM's, set in Settings; nothing is
// assumed): Dungeondraft pack folders, and folders of art packs (.mod) beyond
// FG's modules folder. Kept in settings.json in the studio folder.
const STUDIO_SETTINGS = () => path.join(USER_DATA, "studio", "settings.json");
const folderList = (value) => (Array.isArray(value) ? [...new Set(value.filter((folder) => typeof folder === "string" && folder.trim()).map((folder) => folder.trim().slice(0, 400)))].slice(0, 30) : []);
function studioSettings() {
  try {
    const settings = JSON.parse(fs.readFileSync(STUDIO_SETTINGS(), "utf8"));
    return { dungeondraftFolders: folderList(settings.dungeondraftFolders), packFolders: folderList(settings.packFolders) };
  } catch {
    return { dungeondraftFolders: [], packFolders: [] };
  }
}
// Changed by the GM: kept, and Map Studio's library read again with them.
async function setStudioSettings(input) {
  const now = studioSettings();
  const next = {
    dungeondraftFolders: input?.dungeondraftFolders !== undefined ? folderList(input.dungeondraftFolders) : now.dungeondraftFolders,
    packFolders: input?.packFolders !== undefined ? folderList(input.packFolders) : now.packFolders,
  };
  fs.mkdirSync(path.dirname(STUDIO_SETTINGS()), { recursive: true });
  fs.writeFileSync(STUDIO_SETTINGS(), JSON.stringify(next, null, 1));
  if (studioServer) {
    const studio = studioAssets();
    const { config } = studio;
    await studio.configure({ ...config, ddFolders: next.dungeondraftFolders, packFolders: next.packFolders });
  }
  return { ...next, found: Object.fromEntries([...next.dungeondraftFolders, ...next.packFolders].map((folder) => [folder, fs.existsSync(folder)])) };
}
async function studioUrl() {
  if (!studioServer) {
    const { createStudioServer } = require("./studio/server.cjs");
    const options = {
      webRoot: path.join(APP_DIR, "studio", "web"),
      packsDir: path.join(APP_DIR, "studio", "packs"),
      examplesDir: path.join(APP_DIR, "studio", "examples"),
      dataDir: path.join(USER_DATA, "studio"),
      fgDataFolder: fgDataFolder(),
      // The GM's Dungeondraft asset folders: settings.json in the studio folder ({ "dungeondraftFolders": [...] }).
      ddFolders: studioSettings().dungeondraftFolders,
      packFolders: studioSettings().packFolders,
    };
    options.kraken = { open: studioOpen, save: studioSave, pick: studioPick, adopt: studioAdopt };
    studioServer = createStudioServer({ ...options, port: 47821 }).catch(() => createStudioServer({ ...options, port: 0 }));
    studioServer.catch(() => {
      studioServer = null;
    });
  }
  const server = await studioServer;
  return { url: server.url };
}

// An image opened in Map Studio from Kraken (its image window or the table):
// the master the GM has open now. Its picture (from the GM's window) goes into
// Map Studio's library; a token names it for the editor's page.
const bridge = () => require("./studio/krakenBridge.cjs");
const studioAssets = () => require("./studio/assets.cjs");
// A Map Studio session's master: the image open in the image window, or (scene) one of
// the campaign's own maps by its scene, whether it is open anywhere or not.
function openMaster(sceneId, scene = null) {
  if (!table || !hosted) throw new Error("Host the campaign first: Map Studio saves into its images.");
  if (scene) return table.agent.map.studioView(scene);
  const view = table.agent.map.studioView();
  if (!view || (sceneId && view.scene.id !== sceneId)) throw new Error("That image is no longer open in Maelstrom: open it again, then Map Studio.");
  return view;
}
async function studioOpenImage({ sceneId, name, picture }) {
  const { url } = await studioUrl();
  const view = openMaster(sceneId);
  const studio = studioAssets();
  await studio.whenReady();
  const asset = await studio.imageImport(Buffer.from(picture), String(name || view.scene.name || "Map picture"));
  const token = bridge().openSession({ sceneId: view.scene.id, name: String(name || view.scene.name || ""), pictureId: asset.id, size: { width: asset.width, height: asset.height }, campaignId: hosted.id });
  return { url: `${url}/?kraken=${token}` };
}
// Where Map Studio's Open dialogs start: the hosted campaign's own maps folder,
// Documents/Kraken VTT/Campaigns/<campaign>/Maps (made when first asked for);
// with no campaign hosted, Documents/Kraken VTT/Maps.
// Documents/Kraken VTT/Campaigns/<name> ("" when the name has no usable letters).
function campaignNamedFolder(campaignName) {
  const name = String(campaignName ?? "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").trim().slice(0, 80);
  return name ? path.join(kraken.root(), "Campaigns", name) : "";
}
function campaignMapsFolder() {
  const found = hosted ? campaigns.read(campaignFile()).find((item) => item.id === hosted.id) : null;
  const named = campaignNamedFolder(found?.name);
  kraken.ready?.();
  const folder = named ? path.join(named, "Maps") : path.join(kraken.root(), "Maps");
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}
// Map Studio asks for a file (a map picture, or a project): Maelstrom's own dialog,
// opened in that folder (a web page's file picker starts wherever it last was).
async function studioPick(kind) {
  const filters = kind === "project" ? [{ name: "Map Studio project", extensions: ["json", "zip"] }] : [{ name: "Map picture", extensions: ["png", "jpg", "jpeg", "webp"] }];
  // The dialog is the app window's (this process has none); the GM may take their time.
  const file = await ask("pick", { title: kind === "project" ? "Open a project file" : "Open a map picture", defaultPath: campaignMapsFolder(), filters }, 30 * 60000);
  if (!file) return null;
  return { name: path.basename(file), bytes: fs.readFileSync(file) };
}
// Map Studio opened a picture of the GM's: it becomes one of the campaign's own maps,
// as FG's: its file in the campaign's Maps folder, a record in Campaign > Images,
// opened in the image window, and Map Studio working on that one master (Save to
// Kraken, and its saves as it goes), so it is the same map wherever it is opened.
async function studioAdopt({ name, bytes }) {
  if (!table || !hosted) return null;
  const folder = campaignMapsFolder();
  const base = path.basename(String(name || "Map.png")).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  const ext = (path.extname(base) || ".png").toLowerCase();
  const stem = path.basename(base, path.extname(base)).slice(0, 80) || "Map";
  // The same picture already there keeps its file (and so its master); another of the same name gets a number,
  // and so does one whose scene id another map already has (Keep.png and Keep.webp, Lower_Keep and Lower-Keep).
  const sceneOf = (name) => `own-${name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;
  const others = fs.readdirSync(folder).filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
  const taken = (name) => others.some((other) => other !== name && sceneOf(other) === sceneOf(name));
  let file = `${stem}${ext}`;
  for (let n = 2; (fs.existsSync(path.join(folder, file)) && !fs.readFileSync(path.join(folder, file)).equals(bytes)) || taken(file); n++) file = `${stem} (${n})${ext}`;
  if (!fs.existsSync(path.join(folder, file))) fs.writeFileSync(path.join(folder, file), bytes);
  const records = table.agent.records;
  const known = records.list({ type: "image" }).find((record) => record.data?.own && record.data?.file === file);
  const title = stem.replace(/[_-]+/g, " ").trim() || "Map";
  if (!known) records.create({ type: "image", name: title, visibility: "gm", data: { own: true, file } }, table.agent.seat);
  // Map Studio works on the map's master by its scene (as the table's /table/own-map names it):
  // nothing else opens (the image window shows it when the GM opens it from Images).
  const meta = await require("sharp")(bytes, { limitInputPixels: 200_000_000 }).metadata();
  const id = sceneOf(file);
  const grid = table.agent.map.gridOf(id);
  const scene = { id, name: known?.name ?? title, width: meta.width, height: meta.height, padding: 0, grid };
  const { url } = await studioUrl();
  const studio = studioAssets();
  await studio.whenReady();
  const asset = await studio.imageImport(bytes, scene.name);
  const token = bridge().openSession({ sceneId: id, scene, name: scene.name, pictureId: asset.id, size: { width: asset.width, height: asset.height }, campaignId: hosted.id });
  return { url: `${url}/?kraken=${token}`, file, record: known?.id ?? null };
}
// A Map Studio session works on the campaign it was opened from, and only while that one is hosted.
function sameCampaign(found) {
  if (!found) throw new Error("Open the image in Map Studio from Maelstrom again.");
  if (!hosted || !table || found.campaignId !== hosted.id) throw new Error("This Map Studio tab belongs to another campaign: open the image in Map Studio from the campaign being played.");
  return found;
}
async function studioOpen(token) {
  const found = sameCampaign(bridge().session(token));
  const view = openMaster(found.sceneId, found.scene ?? null);
  return { project: bridge().projectFor({ view, pictureId: found.pictureId, size: found.size, name: found.name }), kraken: { scene: view.scene.name } };
}
// Map Studio's pictures for an image, kept with the GM's data by campaign and scene.
const studioPictureFile = (campaignId, picture) => path.join(USER_DATA, "studio", "pictures", String(campaignId).replace(/[^\w.-]/g, "_"), String(picture?.file ?? "").replace(/[^\w.-]/g, "_"));
async function studioSave(token, project, image) {
  const found = sameCampaign(bridge().session(token));
  const view = openMaster(found.sceneId, found.scene ?? null);
  const master = bridge().masterFrom(project, view.scene);
  let picture = null;
  // Art painted on the map: the rendered map is the image's picture now.
  if (bridge().paintsArt(project)) {
    const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(image);
    if (!match) throw new Error("Map Studio sent no picture of the map.");
    picture = { file: `${view.scene.id.replace(/[^\w.-]/g, "_")}.webp`, version: Date.now(), width: project.width, height: project.height };
    const target = studioPictureFile(found.campaignId, picture);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // A new file swapped in, never written over: a backup's link to the old picture keeps its bytes.
    await require("sharp")(Buffer.from(match[2], "base64"), { limitInputPixels: 200_000_000 }).webp({ quality: 92 }).toBuffer().then((bytes) => fs.writeFileSync(`${target}.tmp`, bytes));
    fs.renameSync(`${target}.tmp`, target);
  }
  // The GM may have changed campaigns while the picture was written: nothing goes into another one.
  sameCampaign(found);
  // No art painted now: the map's own picture again (not the last painted one); the grid as Map Studio lined it up.
  const counts = table.agent.map.fromStudio({ ...master, project, picture: picture ?? false, of: found.scene ?? null, grid: { size: project.grid, offsetX: project.gridOffset?.x, offsetY: project.gridOffset?.y } });
  emit("studio-saved", { sceneId: view.scene.id, picture: Boolean(picture) });
  return { saved: true, ...counts, picture: Boolean(picture) };
}
// The picture Map Studio painted for a scene of the hosted campaign, if any.
function studioPicture(sceneId) {
  if (!table || !hosted) return null;
  const picture = table.agent.map.studioPicture?.(sceneId) ?? table.agent.tableMap?.studioPicture?.(sceneId);
  if (!picture?.file) return null;
  try {
    return fs.readFileSync(studioPictureFile(hosted.id, picture));
  } catch {
    return null;
  }
}

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

// --- The GM's Folders window ------------------------------------------------------------------
// Maelstrom's folders, each with what goes in it: books and modules (Packs), dice, dice towers, GM icons,
// background decals, wallpapers, sounds, and the hosted campaign's own maps.
const CONTENT_KINDS = [
  { kind: "packs", label: "Books & modules (.kpack)", accept: /\.kpack$/i },
  { kind: "sounds", label: "Sounds & music", accept: /\.(ogg|mp3|wav|m4a|flac|webm)$/i },
  { kind: "maps", label: "This campaign's maps", accept: /\.(png|jpe?g|webp|dd2vtt|df2vtt|uvtt)$/i },
  { kind: "dice", label: "Dice", accept: /\.(zip|json|png|webp)$/i },
  { kind: "towers", label: "Dice towers", accept: /\.(png|webp|gif|webm|zip)$/i },
  { kind: "gmicons", label: "GM icons", accept: /\.(png|webp|jpe?g|gif|svg)$/i },
  { kind: "decals", label: "Background decals", accept: /\.(png|webp|jpe?g|svg)$/i },
  { kind: "wallpapers", label: "Wallpapers", accept: /\.(png|webp|jpe?g|gif|webm|mp4)$/i },
];
function contentFolder(kind) {
  if (kind === "sounds") return sounds().folder;
  if (kind === "maps") return hosted ? campaignMapsFolder() : "";
  return kraken.folderOf(kind);
}
// What a folder holds that Maelstrom reads (its packs, for Packs); never a hidden or backup folder's files.
function countIn(folder, kind = "") {
  try {
    return fs
      .readdirSync(folder, { recursive: true })
      .map(String)
      .filter((name) => !name.split(/[\/]/).some((part) => part.startsWith(".")) && (kind === "packs" ? /\.kpack$/i.test(name) : !/\.(md|txt|json|tmp|part)$/i.test(name) && /\.[a-z0-9]+$/i.test(name))).length;
  } catch {
    return 0;
  }
}
function contentFolders() {
  kraken.ready?.();
  return { root: kraken.root(), folders: CONTENT_KINDS.map(({ kind, label }) => ({ kind, label, path: contentFolder(kind), files: contentFolder(kind) ? countIn(contentFolder(kind), kind) : 0 })).filter((item) => item.path) };
}
// A pack goes into its game's folder (Packs/<game>), as its own manifest says.
function packHome(bytes) {
  try {
    const { unzipSync } = require("fflate");
    const files = unzipSync(new Uint8Array(bytes), { filter: (entry) => entry.name === "kraken-pack.json" });
    const about = JSON.parse(Buffer.from(files["kraken-pack.json"]).toString("utf8"));
    const game = String(about.ruleset || "Any").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Any";
    return path.join(kraken.folderOf("packs"), game);
  } catch {
    throw new Error("That is not a Maelstrom pack (.kpack) that can be read.");
  }
}
function contentAdd(kind, files) {
  const spec = CONTENT_KINDS.find((item) => item.kind === kind);
  if (!spec) throw new Error("Drop it on one of the folders.");
  const base = contentFolder(kind);
  if (!base) throw new Error("Host a campaign first: its maps go in its own folder.");
  const added = [];
  const refused = [];
  for (const file of files.slice(0, 200)) {
    const name = path.basename(String(file?.name ?? "")).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
    const bytes = bytesOf(file?.bytes);
    if (!name || !spec.accept.test(name) || !bytes.length) {
      refused.push(name || "(no name)");
      continue;
    }
    const folder = kind === "packs" ? packHome(bytes) : base;
    fs.mkdirSync(folder, { recursive: true });
    // Written whole first, then put in place: a half-copied pack is never read.
    fs.writeFileSync(path.join(folder, `${name}.part`), bytes);
    fs.renameSync(path.join(folder, `${name}.part`), path.join(folder, name));
    added.push(path.relative(kraken.root(), path.join(folder, name)));
  }
  contentRefresh();
  return { added, refused };
}
// Everything read again: the books and packs, sounds, art, decals, dice; the table hears of it, nobody is sent away.
function contentRefresh() {
  books().refresh();
  for (const library of [soundLibrary, wallpapers(), decals(), gmIcons(), towers(), dicePacks(), tiles()]) {
    try {
      library?.forget?.();
      library?.refresh?.();
    } catch {
      /* a library that cannot be read again is read at its next look */
    }
  }
  table?.agent?.contentChanged?.();
  return contentFolders();
}

// The campaign menu's actions, for the start screen and the agent alike.
// Never the campaign being played for delete or restore; it is saved first for the rest.
async function manageCampaign(input) {
  const file = campaignFile();
  const action = String(input.action ?? "");
  const id = String(input.id ?? "");
  const playing = hosted && hosted.id === id;
  if (playing && (action === "delete" || action === "restore")) throw new Error("Leave the table first: that campaign is being played.");
  if (playing && (action === "duplicate" || action === "export")) {
    hosted.dirty = true;
    hosted.recordsDirty = true;
    if (!flushCampaign()) throw new Error("The campaign could not be saved to the disk first, so the copy would be out of date. Check the drive, then try again.");
  }
  // The campaign's own maps live in Documents/Kraken VTT/Campaigns/<its name>/Maps: they go with it.
  const before = campaigns.read(file).find((item) => item.id === id);
  // Two campaigns named alike from before names were kept unique share that folder: it is then copied, never moved or trashed.
  const sharesFolder = Boolean(before) && campaigns.read(file).some((item) => item.id !== id && campaigns.folderKey(item.name) === campaigns.folderKey(before.name));
  if (action === "rename") {
    const renamed = campaigns.rename(file, { id, name: input.name });
    const from = before ? campaignNamedFolder(before.name) : "";
    const to = campaignNamedFolder(renamed.name);
    if (from && to && from !== to && fs.existsSync(from)) {
      // Moved; copied instead when the new name's folder exists or something has the old one open.
      try {
        if (fs.existsSync(to) || sharesFolder) throw new Error("exists or shared");
        fs.renameSync(from, to);
      } catch {
        campaigns.copyFolder(from, to);
      }
    }
    return renamed;
  }
  if (action === "duplicate") {
    const copy = campaigns.duplicate(file, { id, name: input.name });
    const from = before ? campaignNamedFolder(before.name) : "";
    const to = campaignNamedFolder(copy.name);
    if (from && to && fs.existsSync(from) && !fs.existsSync(to)) campaigns.copyFolder(from, to);
    return copy;
  }
  if (action === "export") {
    const found = campaigns.read(file).find((item) => item.id === id);
    if (!found) throw new Error("That campaign is missing.");
    const target = input.path ? String(input.path) : path.join(kraken.root(), "Exports", `${found.name.replace(/[^\w .()-]/g, "_").trim() || "campaign"}.zip`);
    return campaigns.exportZip(file, { id, path: target, maps: campaignNamedFolder(found.name) });
  }
  if (action === "delete") {
    if (!campaigns.exists(file, id)) throw new Error("That campaign is missing.");
    // To the recycle bin first (the window's process does it), never gone for good; off the list only once it is there.
    // Its own maps' folder (Documents/Kraken VTT/Campaigns/<name>) goes too, so a new campaign of that name starts empty.
    const folders = [campaigns.folder(file, id), campaigns.picturesFolder(file, id), before && !sharesFolder ? campaignNamedFolder(before.name) : ""].filter((dir) => dir && fs.existsSync(dir));
    await ask("shell", { action: "trash", paths: folders });
    const { removed } = campaigns.remove(file, { id });
    return { deleted: removed.name, trashed: folders.length };
  }
  if (action === "backups") return { backups: campaigns.backups(file, { id }) };
  // Asked for by the GM: no backup made is said, with why (the automatic ones stay quiet).
  if (action === "backup") {
    if (playing) {
      hosted.dirty = true;
      hosted.recordsDirty = true;
      if (!flushCampaign()) throw new Error("No backup made: the campaign could not be saved to the disk first. Check the drive, then try again.");
    }
    const made = campaigns.backup(file, { id, reason: "manual" });
    if (!made) throw new Error("No backup made: this campaign has nothing saved yet (host it once).");
    return { backup: made };
  }
  if (action === "restore") return campaigns.restore(file, { id, backup: input.backup });
  if (action === "folder") {
    const dir = campaigns.folder(file, id);
    fs.mkdirSync(dir, { recursive: true });
    if (input.open !== false) await ask("shell", { action: "open", path: dir });
    return { folder: dir };
  }
  throw new Error("action is rename, duplicate, export, delete, backups, backup, restore or folder.");
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
  "studio-url": () => studioUrl(),
  "studio-open-image": (input) => studioOpenImage(input ?? {}),
  "studio-settings": (input) => (input ? setStudioSettings(input) : { ...studioSettings(), found: Object.fromEntries([...studioSettings().dungeondraftFolders, ...studioSettings().packFolders].map((folder) => [folder, fs.existsSync(folder)])) }),
  async "start-host"(options) {
    const wanted = Number(options?.port);
    const password = String(options?.password ?? "");
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > 65535) throw new Error("Port must be from 1 to 65535.");
    if (!options?.lan && !options?.cloud) throw new Error("Turn on LAN or Internet.");
    await stopTable();
    const campaignId = typeof options?.campaignId === "string" ? options.campaignId : "";
    const saved = openCampaign(campaignId) ?? {};
    // The GM's icon follows them: a campaign that has none yet takes the last one chosen.
    const remembered = preferences().gmIcon;
    if (typeof remembered === "string" && !(saved.options && "gmIcon" in saved.options)) saved.options = { ...(saved.options ?? {}), gmIcon: remembered };
    const dataFolder = fgDataFolder();
    const ruleset = campaigns.read(campaignFile()).find((item) => item.id === campaignId)?.ruleset ?? "";
    // The Session Log's archive: each sitting's chat in the campaign's folder (chat-logs/<session>.json).
    const logs = campaignId ? path.join(campaigns.folder(campaignFile(), campaignId), "chat-logs") : path.join(USER_DATA, "chat-logs");
    const archive = {
      save: (id, lines) => {
        fs.mkdirSync(logs, { recursive: true });
        fs.writeFileSync(path.join(logs, `${String(id).replace(/[^\w-]/g, "")}.json`), JSON.stringify(lines));
      },
      read: (id) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(logs, `${String(id).replace(/[^\w-]/g, "")}.json`), "utf8"));
        } catch {
          return null;
        }
      },
    };
    const next = createTableServer({ saved, archive, ruleset, onChange: markDirty, art: createArtLibrary({ base: dataFolder, roots: [...defaultRoots(dataFolder), ...krakenArtRoots()] }), decals: decals(), wallpapers: wallpapers(), gmIcons: gmIcons(), towers: towers(), dicePacks: dicePacks(), tiles: tiles(), sounds: sounds(), books: books(), accounts: accounts(), prefs: prefs(), studioPicture: (sceneId) => studioPicture(sceneId), ownMaps: { folder: () => campaignMapsFolder() } });
    try {
      const info = await next.listen({ port: wanted, password });
      table = next;
      if (hosted) hosted.port = info.port;
      const net = await networkSnapshot();
      // Internet play: the port opened on the router by itself (UPnP or NAT-PMP), when the GM asked.
      let upnp = null;
      if (options?.upnp && options?.cloud) {
        const opening = openPort(info.port);
        const mapped = await Promise.race([opening, new Promise((resolve) => setTimeout(() => resolve({ ok: false, late: true, error: "The router took too long to answer." }), 9000))]);
        if (mapped.ok) portMapping = mapped;
        // The router answered after all, too late: kept while this table is hosted, else closed at once.
        else if (mapped.late)
          opening
            .then((done) => {
              if (!done?.ok) return;
              if (table === next && !portMapping) portMapping = done;
              else done.remove?.().catch(() => undefined);
            })
            .catch(() => undefined);
        upnp = { ok: mapped.ok, method: mapped.method ?? "", external: mapped.external ?? "", error: mapped.error ?? "" };
      }
      const externalV4 = net.externalV4 || upnp?.external || "";
      invite = inviteFor({ port: info.port, password, lan: options?.lan ? info.addresses : [], internet: options?.cloud ? externalV4 : "" });
      return { ...info, v6: net.v6, externalV4, externalV6: net.externalV6, upnp, invite };
    } catch (error) {
      await next.stop().catch(() => undefined);
      closeCampaign();
      throw new Error(plain(error));
    }
  },
  "stop-host": () => stopTable(),
  // The invite links of the table being hosted (and whether the router opened its port).
  invite: () => (table && invite ? { ...invite, upnp: portMapping ? { ok: true, method: portMapping.method } : null } : null),
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
    // null: the campaign keeps no adventure of its own (a book's maps are read from the book).
    if (bytes === null) return campaigns.removeBundle(campaignFile(), id);
    const buffer = bytesOf(bytes);
    if (buffer.length === 0) throw new Error("That adventure was empty.");
    campaigns.writeBundle(campaignFile(), id, buffer);
  },
  "save-view": (id, view) => {
    const current = requireHosted(id);
    const adventure = typeof view?.adventure === "string" ? view.adventure.slice(0, 200) : "";
    const sceneId = typeof view?.sceneId === "string" ? view.sceneId.slice(0, 80) : "";
    current.state.view = adventure ? { adventure, sceneId, ...(view?.closed ? { closed: true } : {}) } : null;
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
  // The GM's Folders window: where each kind of thing goes, how many are there, to open or drop files on.
  "content-folders": () => contentFolders(),
  // Files dropped on one of them: copied in, then everything read again (the table stays up).
  "content-add": (kind, files) => contentAdd(String(kind ?? ""), Array.isArray(files) ? files : []),
  "content-refresh": () => contentRefresh(),
  // A folder of Documents/Kraken VTT (kfolders.cjs), to open: "" is the top.
  "kraken-folder": (kind) => {
    const folder = kind ? kraken.folderOf(String(kind)) : (kraken.folderOf("dice"), kraken.root());
    fs.mkdirSync(folder, { recursive: true });
    return folder;
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
  "assistant-typed-key": (key, provider = "anthropic") => {
    typedKeys[assistantModule.PROVIDERS[provider] ? provider : "anthropic"] = typeof key === "string" ? key : "";
    return assistantStatus();
  },
  // The GM's choice of provider, model and (another OpenAI-style service) its address.
  "assistant-settings": (patch) => setAssistantChoice(patch),
  // The models the chosen provider offers this key.
  "assistant-models": () => assistant.models(),
  hosting: () => Boolean(table || hosted),
  // The start screen's campaign menu (and kraken_campaigns): rename, duplicate, export, delete, backups, open its folder.
  "campaign-manage": (input) => manageCampaign(input ?? {}),
  // The logs folder (Settings > Open logs): the window's process opens it.
  "logs-folder": () => {
    fs.mkdirSync(backendLog.folder, { recursive: true });
    return backendLog.folder;
  },
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
    manage: (input) => manageCampaign(input ?? {}),
  },
  // Kraken's logs: the last lines of the backend's and the window's, and where they are.
  logs: (lines = 80) => {
    const windowLog = require("./logFile.cjs").createLog(backendLog.folder, "window");
    return { folder: backendLog.folder, backend: backendLog.tail(lines), window: windowLog.tail(lines) };
  },
  openLogs: () => ask("shell", { action: "open", path: (fs.mkdirSync(backendLog.folder, { recursive: true }), backendLog.folder) }),
  ui: (command, timeout) => ask("ui", command, timeout ?? 60000),
  // The window itself (a screenshot, its text, a script in it): done by the window's process.
  windowOp: (op, payload) => ask("window", { op, ...payload }),
  // Kraken's updater (in the main process): its state, a download, an install.
  updater: (action) => ask("updater", { action }),
  assistant: () => assistant,
  packs: { view: (input) => packsView(input ?? {}), make: (ids) => makePacks(ids), job: () => packJob },
  // The GM's Folders window: Maelstrom's folders, and everything in them read again with the table running.
  folders: { list: () => contentFolders(), refresh: () => contentRefresh() },
  // Map Studio's asset pack folders (Settings > Map Studio art).
  // Map Studio's agent tools (kraken_map_studio, electron/studio/agentTools.cjs): an action of the editor
  // (studio/web/agent.js, in the GM's Map Studio window), and the editor's Save to Kraken into the open image.
  studio: {
    settings: (input) => (input ? setStudioSettings(input) : calls["studio-settings"]()),
    async page(action, args, timeout = 180000) {
      const { url } = await studioUrl();
      const answer = await ask("studio", { url, action, args }, timeout);
      if (!answer?.ok) throw new Error(answer?.error || "Map Studio did not answer.");
      return answer.value;
    },
    assets: () => studioAssets(),
    async saveOpen(project, image) {
      const view = openMaster();
      const token = bridge().openSession({ sceneId: view.scene.id, name: view.scene.name, pictureId: null, size: { width: project.width, height: project.height }, campaignId: hosted.id });
      return { scene: { id: view.scene.id, name: view.scene.name }, ...(await studioSave(token, studioAssets().validateProject(project), image)) };
    },
    folder: () => path.join(USER_DATA, "studio", "agent"),
  },
};

// The DM assistant (GM only): the key from the environment or .env.local, or
// one the GM typed into its window (kept encrypted by the window's process).
// Each provider's key, and the GM's choice of provider, model (and a service's address), kept between runs.
const typedKeys = {};
function assistantKey(provider = assistantChoice().provider) {
  if (typedKeys[provider]) return { key: typedKeys[provider], from: "app" };
  return assistantModule.envKey(APP_DIR, provider);
}
const assistantChoiceFile = () => path.join(USER_DATA, "assistant.json");
function assistantChoice() {
  try {
    const saved = JSON.parse(fs.readFileSync(assistantChoiceFile(), "utf8"));
    return { provider: assistantModule.PROVIDERS[saved.provider] ? saved.provider : "anthropic", model: String(saved.model ?? ""), base: String(saved.base ?? "") };
  } catch {
    return { provider: "anthropic", model: "", base: "" };
  }
}
function setAssistantChoice(patch) {
  const next = { ...assistantChoice(), ...(patch && typeof patch === "object" ? patch : {}) };
  if (!assistantModule.PROVIDERS[next.provider]) throw new Error("No such provider.");
  // Another provider: its own model, chosen from its list.
  if (patch?.provider && patch.provider !== assistantChoice().provider && patch.model === undefined) next.model = "";
  fs.mkdirSync(USER_DATA, { recursive: true });
  fs.writeFileSync(assistantChoiceFile(), JSON.stringify({ provider: next.provider, model: String(next.model).slice(0, 200), base: String(next.base).slice(0, 300) }));
  return assistantStatus();
}
const assistant = assistantModule.createAssistant({
  ctx: agentContext,
  settings: () => assistantChoice(),
  key: (provider) => assistantKey(provider)?.key ?? null,
  makeClient: (key) => {
    const Anthropic = require("@anthropic-ai/sdk").default;
    return new Anthropic({ apiKey: key });
  },
  onEvent: (event) => emit("assistant-event", event),
});
function assistantStatus() {
  const choice = assistantChoice();
  const found = assistantKey(choice.provider);
  const providers = Object.entries(assistantModule.PROVIDERS).map(([id, provider]) => {
    const key = assistantKey(id);
    return { id, name: provider.name, placeholder: provider.placeholder, env: provider.env[0] ?? "", hasKey: Boolean(key), keyFrom: key?.from ?? null };
  });
  // A local service (Ollama, LM Studio) may need no key.
  return { ...assistant.view(), hasKey: Boolean(found) || choice.provider === "custom", keyFrom: found?.from ?? null, providers };
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
