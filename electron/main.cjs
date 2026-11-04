const { app, BrowserWindow, Menu, ipcMain, clipboard, dialog, shell, safeStorage } = require("electron");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { createTableServer, eachAddress } = require("./tableServer.cjs");
const { createArtLibrary, defaultRoots } = require("./artLibrary.cjs");
const { createDecalLibrary } = require("./decals.cjs");
const { createSoundLibrary } = require("./sounds.cjs");
const { createBookShelf } = require("./books.cjs");
const { fgDataFolder } = require("./importers/fgModule.cjs");
const campaigns = require("./campaigns.cjs");
const { startAgentServer } = require("./agent/mcpServer.cjs");
const assistantModule = require("./assistant.cjs");

// The development copy (Kraken VTT.bat) and the installed app keep their
// campaigns and assets in one place, whichever is opened.
// (Tests and demos pass a throwaway folder of their own: theirs is kept.)
if (!app.commandLine.hasSwitch("user-data-dir")) app.setPath("userData", path.join(app.getPath("appData"), "kraken-vtt"));

if (process.env.KRAKEN_E2E === "1" || process.env.KRAKEN_SMOKE === "1") {
  app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "kraken-vtt-")));
  // Test runs are silent (no test sounds or dice on the GM's speakers).
  app.commandLine.appendSwitch("mute-audio");
  // Test runs host on this computer only, out of the firewall's way.
  if (!process.env.KRAKEN_BIND) process.env.KRAKEN_BIND = "127.0.0.1";
  // Test runs get their own agent bridge, so a running copy of the app keeps its own.
  if (!process.env.KRAKEN_AGENT_FILE) process.env.KRAKEN_AGENT_FILE = path.join(app.getPath("userData"), "agent.json");
  if (!process.env.KRAKEN_AGENT_PORT) process.env.KRAKEN_AGENT_PORT = "0";
}

Menu.setApplicationMenu(null);

function campaignFile() {
  return path.join(app.getPath("userData"), "campaigns.json");
}

let networkCache = { at: 0, v4: [], v6: [], externalV4: "", externalV6: "" };

function fetchText(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 2500 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8").trim();
        resolve(res.statusCode === 200 ? body : "");
      });
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
  const parts = value.split(".").map(Number);
  return parts.every((part) => part <= 255) ? value : "";
}

function ipv6(value) {
  return /^[0-9a-f:]+$/i.test(value) && value.includes(":") ? value : "";
}

async function networkSnapshot() {
  const local = eachAddress();
  if (Date.now() - networkCache.at < 60000 && networkCache.v4.join() === local.v4.join()) return { ...networkCache, v4: local.v4, v6: local.v6 };
  const [externalV4, externalV6] = await Promise.all([
    fetchText("https://api.ipify.org"),
    fetchText("https://api6.ipify.org"),
  ]);
  networkCache = {
    at: Date.now(),
    v4: local.v4,
    v6: local.v6,
    externalV4: ipv4(externalV4),
    externalV6: ipv6(externalV6),
  };
  return networkCache;
}

let table = null;
let quitting = false;

// Background decals: Kraken's own, the GM's assets folder (shared by every
// campaign; a picture the GM picks is copied in), and FG's decals.
let decalLibrary = null;
let wallpaperLibrary = null;
let gmIconLibrary = null;
let soundLibrary = null;
let bookShelf = null;
// The GM's books: the FG modules on this computer, read in place.
function books() {
  if (!bookShelf) bookShelf = createBookShelf({ folder: process.env.KRAKEN_BOOKS || path.join(fgDataFolder(), "modules"), cache: path.join(app.getPath("userData"), "books-index.json") });
  return bookShelf;
}
// The GM's sounds (one-shots, effects, ambience, music), shared by every campaign.
function sounds() {
  if (!soundLibrary) soundLibrary = createSoundLibrary({ folder: path.join(app.getPath("userData"), "assets", "sounds"), builtin: path.join(__dirname, "..", "sounds") });
  return soundLibrary;
}
// The GM's chat pictures: the Kraken GM Icon set and the GM's own.
function gmIcons() {
  if (!gmIconLibrary) {
    gmIconLibrary = createDecalLibrary({
      folder: path.join(app.getPath("userData"), "assets", "gm-icons"),
      builtin: path.join(__dirname, "..", "dist", "gm-icons"),
      own: [],
    });
  }
  return gmIconLibrary;
}
// The GM's own choices that follow them into every campaign (the GM icon), on this computer.
function preferencesFile() {
  return path.join(app.getPath("userData"), "preferences.json");
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
    fs.writeFileSync(preferencesFile(), JSON.stringify({ ...preferences(), [key]: value }));
  } catch {
    /* the campaign still has it */
  }
}
// The desktop's wallpapers (FG's desktop theme): Kraken's own, one per game,
// and the GM's own, in the assets folder too.
function wallpapers() {
  if (!wallpaperLibrary) {
    wallpaperLibrary = createDecalLibrary({
      folder: path.join(app.getPath("userData"), "assets", "wallpapers"),
      builtin: path.join(__dirname, "..", "dist", "wallpapers"),
      own: [],
      named: true,
    });
  }
  return wallpaperLibrary;
}
function decals() {
  if (!decalLibrary) {
    decalLibrary = createDecalLibrary({
      folder: path.join(app.getPath("userData"), "assets", "decals"),
      builtin: path.join(__dirname, "..", "dist", "decals"),
      fgData: fgDataFolder(),
    });
  }
  return decalLibrary;
}

// The campaign being hosted. Its table (view, chat, tokens and doors) is saved to disk
// when something changes (after a short pause), every 30 seconds while dirty,
// when the DM leaves, and when the app quits.
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

ipcMain.handle("addresses", () => eachAddress().v4);
ipcMain.handle("network", () => networkSnapshot());
ipcMain.handle("campaigns", () => campaigns.read(campaignFile()));
ipcMain.handle("save-campaign", (_event, input) => campaigns.create(campaignFile(), input));
ipcMain.handle("touch-campaign", (_event, input) => campaigns.touch(campaignFile(), input));
ipcMain.handle("campaign-ruleset", (_event, input) => setCampaignRuleset(input));
ipcMain.handle("copy", (_event, text) => {
  clipboard.writeText(String(text ?? "").slice(0, 200));
});

ipcMain.handle("start-host", async (_event, options) => {
  const port = Number(options?.port);
  const password = String(options?.password ?? "");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be from 1 to 65535.");
  if (!options?.lan && !options?.cloud) throw new Error("Turn on LAN or Cloud.");
  await stopTable();
  const campaignId = typeof options?.campaignId === "string" ? options.campaignId : "";
  const saved = openCampaign(campaignId) ?? {};
  // The GM's icon follows them: a campaign that has none yet takes the last one chosen.
  const remembered = preferences().gmIcon;
  if (typeof remembered === "string" && !(saved.options && "gmIcon" in saved.options)) saved.options = { ...(saved.options ?? {}), gmIcon: remembered };
  const dataFolder = fgDataFolder();
  const ruleset = campaigns.read(campaignFile()).find((item) => item.id === campaignId)?.ruleset ?? "";
  const next = createTableServer({ saved, ruleset, onChange: markDirty, art: createArtLibrary({ base: dataFolder, roots: defaultRoots(dataFolder) }), decals: decals(), wallpapers: wallpapers(), gmIcons: gmIcons(), sounds: sounds(), books: books() });
  try {
    const info = await next.listen({ port, password });
    table = next;
    if (hosted) hosted.port = info.port;
    const net = await networkSnapshot();
    return { ...info, v6: net.v6, externalV4: net.externalV4, externalV6: net.externalV6 };
  } catch (error) {
    await next.stop().catch(() => undefined);
    closeCampaign();
    throw new Error(plain(error));
  }
});

ipcMain.handle("stop-host", () => stopTable());

ipcMain.handle("campaign-view", (_event, id) => {
  const current = requireHosted(id);
  return { view: current.state.view ?? null, hasBundle: Boolean(campaigns.readBundle(campaignFile(), id)) };
});

ipcMain.handle("campaign-bundle", (_event, id) => {
  requireHosted(id);
  return campaigns.readBundle(campaignFile(), id);
});

ipcMain.handle("save-bundle", (_event, id, bytes) => {
  requireHosted(id);
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buffer.length === 0) throw new Error("That adventure was empty.");
  campaigns.writeBundle(campaignFile(), id, buffer);
});

ipcMain.handle("save-view", (_event, id, view) => {
  const current = requireHosted(id);
  const adventure = typeof view?.adventure === "string" ? view.adventure.slice(0, 200) : "";
  const sceneId = typeof view?.sceneId === "string" ? view.sceneId.slice(0, 80) : "";
  current.state.view = adventure ? { adventure, sceneId } : null;
  markDirty();
});

ipcMain.handle("set-token-art", (_event, list) => {
  if (!table) throw new Error("Not hosting.");
  table.setTokenArt(
    (Array.isArray(list) ? list : []).map((item) => ({ id: item?.id, mime: item?.mime, bytes: item?.bytes ? Buffer.from(item.bytes) : null })),
  );
});

// The decal picker's Browse: a picture from anywhere, copied into the assets folder.
const libraryOf = (kind) => (kind === "wallpaper" ? wallpapers() : kind === "gmicon" ? gmIcons() : decals());
ipcMain.handle("decal-pick", async (_event, kind) => {
  const library = libraryOf(kind);
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: kind === "wallpaper" ? "Choose a desktop wallpaper (a picture that tiles)" : kind === "gmicon" ? "Choose your GM icon" : "Choose a background decal",
    properties: ["openFile"],
    filters: [{ name: "Pictures", extensions: ["png", "webp", "jpg", "jpeg", "gif"] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  return library.addFile(picked.filePaths[0]);
});
// A picture dropped on the picker.
ipcMain.handle("decal-add", (_event, name, bytes, kind) => libraryOf(kind).add(String(name ?? ""), Buffer.from(bytes ?? [])));
// Sounds from anywhere, copied into a kind and folder of the sounds library.
ipcMain.handle("sound-pick", async (_event, kind, group) => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: "Add sounds",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Sounds", extensions: ["mp3", "ogg", "wav", "m4a", "webm", "flac", "opus"] }],
  });
  if (picked.canceled) return [];
  return picked.filePaths.map((file) => sounds().addFile(String(kind), String(group ?? ""), file));
});
ipcMain.handle("sound-add", (_event, kind, group, name, bytes) => sounds().add(String(kind), String(group ?? ""), String(name ?? ""), Buffer.from(bytes ?? [])));
ipcMain.handle("sound-folder", async () => {
  fs.mkdirSync(sounds().folder, { recursive: true });
  return shell.openPath(sounds().folder);
});
ipcMain.handle("decal-folder", async (_event, kind) => {
  const folder = libraryOf(kind).folder;
  fs.mkdirSync(folder, { recursive: true });
  return shell.openPath(folder);
});

ipcMain.handle("set-scene-image", (_event, bytes, mime) => {
  if (!table) throw new Error("Not hosting.");
  const buffer = bytes == null ? Buffer.alloc(0) : Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length > 80 * 1024 * 1024) throw new Error("Map image is too large.");
  table.setImage(buffer, typeof mime === "string" ? mime : "");
});

// The agent bridge asks the app window to do what a GM would do with the
// mouse (host, leave), and waits for the window's answer.
let mainWindow = null;
let agentRequest = 0;
const agentWaits = new Map();

ipcMain.handle("agent-reply", (_event, req, ok, value) => {
  const wait = agentWaits.get(req);
  if (!wait) return;
  agentWaits.delete(req);
  if (ok) wait.resolve(value);
  else wait.reject(new Error(String(value || "The app could not do that.")));
});

function askWindow(command, timeout = 60000) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return Promise.reject(new Error("The app window is closed."));
  const req = ++agentRequest;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      agentWaits.delete(req);
      reject(new Error("The app window did not answer."));
    }, timeout);
    agentWaits.set(req, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    win.webContents.send("agent-command", req, command);
  });
}

const agentContext = {
  table: () => table,
  hosting: () => (hosted && table ? { campaignId: hosted.id, port: hosted.port ?? null } : null),
  campaigns: {
    list: () => campaigns.read(campaignFile()),
    create: (input) => campaigns.create(campaignFile(), input),
    setRuleset: (input) => setCampaignRuleset(input),
  },
  ui: (command, timeout) => askWindow(command, timeout),
  window: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
  assistant: () => assistant,
};

// The DM assistant (GM only): the key from the environment or .env.local, or
// one the GM typed into its window (kept encrypted on this computer).
const assistantKeys = assistantModule.keyStore(path.join(app.getPath("userData"), "assistant-key.bin"), safeStorage);
function assistantKey() {
  const typed = assistantKeys.get();
  if (typed) return { key: typed, from: "app" };
  return assistantModule.envKey(path.join(__dirname, ".."));
}
const assistant = assistantModule.createAssistant({
  ctx: agentContext,
  key: () => assistantKey()?.key ?? null,
  makeClient: (key) => {
    const Anthropic = require("@anthropic-ai/sdk").default;
    return new Anthropic({ apiKey: key });
  },
  onEvent: (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("assistant-event", event);
  },
});
function assistantStatus() {
  const found = assistantKey();
  return { ...assistant.view(), hasKey: Boolean(found), keyFrom: found?.from ?? null };
}
// Only the GM's own window asks: players never reach the assistant (they are browsers on the table server).
ipcMain.handle("assistant-status", () => assistantStatus());
ipcMain.handle("assistant-ask", (_event, text) => assistant.ask(String(text ?? "")));
ipcMain.handle("assistant-stop", () => assistant.stop());
ipcMain.handle("assistant-reset", () => assistant.reset());
ipcMain.handle("assistant-key", (_event, key) => {
  assistantKeys.set(typeof key === "string" ? key : "");
  return assistantStatus();
});

let agentServer = null;

async function startAgent() {
  try {
    const port = process.env.KRAKEN_AGENT_PORT === undefined ? undefined : Number(process.env.KRAKEN_AGENT_PORT);
    agentServer = await startAgentServer(agentContext, { version: app.getVersion(), ...(Number.isInteger(port) ? { port } : {}) });
  } catch (error) {
    console.error("agent bridge did not start", error instanceof Error ? error.message : error);
  }
}

function createWindow() {
  const headless = process.env.KRAKEN_SMOKE === "1" || process.env.KRAKEN_E2E === "1";
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#121418",
    title: "Kraken VTT",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => {
    if (!headless) win.show();
  });

  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  // Panels popped out of the table (the renderer draws into them), so they can
  // go on another monitor. Nothing else may open a window.
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (url !== "about:blank" || !frameName.startsWith("kraken-popout-")) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        backgroundColor: "#1b1916",
        icon: path.join(__dirname, "..", "build", "icon.png"),
        autoHideMenuBar: true,
        useContentSize: true,
        minWidth: 320,
        minHeight: 200,
        show: !headless,
      },
    };
  });
  win.webContents.on("did-create-window", (child) => {
    child.webContents.on("will-navigate", (event) => event.preventDefault());
    child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  });

  const smokeErrors = [];
  win.webContents.on("console-message", (event) => {
    const text = typeof event?.message === "string" ? event.message : "";
    const level = event?.level;
    if (process.env.KRAKEN_SMOKE === "1") smokeErrors.push(text);
    if (process.env.KRAKEN_E2E === "1" && (level === "error" || level === 3)) console.error("RENDER", text);
  });

  if (process.env.KRAKEN_SMOKE === "1" && process.env.KRAKEN_E2E !== "1") {
    win.webContents.once("did-finish-load", () => {
      const script = `new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const text = document.body ? document.body.innerText : "";
          if (text.toLowerCase().includes("campaign") || Date.now() - start > 3000) resolve(text);
          else setTimeout(tick, 50);
        };
        tick();
      })`;
      win.webContents
        .executeJavaScript(script)
        .then((text) => {
          const folded = text.toLowerCase();
          const ok = folded.includes("kraken") && folded.includes("my campaigns");
          if (!ok) {
            console.error("SMOKE_FAIL");
            console.error(text.slice(0, 500));
            for (const line of smokeErrors) console.error(line);
          } else {
            console.log("SMOKE_OK");
          }
          app.exit(ok ? 0 : 1);
        })
        .catch((error) => {
          console.error(error);
          app.exit(1);
        });
    });
  }

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  return win;
}

app.whenReady().then(async () => {
  const win = createWindow();
  mainWindow = win;
  await startAgent();
  if (process.env.KRAKEN_E2E !== "1") return;
  try {
    await require("./e2e.cjs").run(win, createWindow);
    console.log("E2E_OK");
    app.exit(0);
  } catch (error) {
    console.error("E2E_FAIL");
    console.error(error instanceof Error ? error.stack || error.message : error);
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  if (process.env.KRAKEN_E2E === "1" || process.env.KRAKEN_SMOKE === "1") return;
  app.quit();
});

app.on("before-quit", (event) => {
  if ((!table && !hosted) || quitting) return;
  event.preventDefault();
  quitting = true;
  stopTable().finally(() => app.quit());
});
