const { app, BrowserWindow, Menu, ipcMain, clipboard } = require("electron");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { createTableServer, eachAddress } = require("./tableServer.cjs");
const { createArtLibrary, defaultRoots } = require("./artLibrary.cjs");
const { fgDataFolder } = require("./importers/fgModule.cjs");
const campaigns = require("./campaigns.cjs");
const { startAgentServer } = require("./agent/mcpServer.cjs");

if (process.env.KRAKEN_E2E === "1" || process.env.KRAKEN_SMOKE === "1") {
  app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "kraken-vtt-")));
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
  hosted.dirty = true;
  if (kind === "records") hosted.recordsDirty = true;
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
  const dataFolder = fgDataFolder();
  const next = createTableServer({ saved, onChange: markDirty, art: createArtLibrary({ base: dataFolder, roots: defaultRoots(dataFolder) }) });
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
  },
  ui: (command) => askWindow(command),
  window: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
};

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
