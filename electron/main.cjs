const { app, BrowserWindow, Menu, ipcMain, clipboard, dialog, shell, safeStorage, utilityProcess } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assistantModule = require("./assistant.cjs");

// The window's process: it draws the GM's window and forwards everything else
// to the backend (backend.cjs: the table server, campaigns, libraries, books,
// the agent bridge, the assistant), which runs in a process of its own so
// nothing it does can freeze this one, and so the window.

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

// --- The backend ------------------------------------------------------------------
let backend = null;
let backendReady = null;
let quitting = false;
let called = 0;
const waiting = new Map();

function startBackend() {
  const child = utilityProcess.fork(path.join(__dirname, "backend.cjs"), [], {
    serviceName: "Kraken backend",
    stdio: "inherit",
    env: { ...process.env, KRAKEN_USER_DATA: app.getPath("userData"), KRAKEN_VERSION: app.getVersion() },
  });
  backend = child;
  backendReady = new Promise((resolve) => {
    const onReady = (message) => {
      if (message?.type !== "ready") return;
      child.off("message", onReady);
      resolve();
    };
    child.on("message", onReady);
  });
  child.on("message", (message) => onBackend(child, message));
  child.on("exit", (code) => {
    for (const [, wait] of waiting) wait.reject(new Error("The backend stopped."));
    waiting.clear();
    if (backend !== child || quitting) return;
    // It should never stop: if it does, start it again (the table must be hosted again).
    console.error(`the backend stopped (${code}); starting it again`);
    startBackend();
    backendReady.then(sendTypedKey);
  });
}

async function call(name, ...args) {
  await backendReady;
  const id = ++called;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    backend.postMessage({ type: "call", id, name, args });
  });
}

// The backend asks for what only this process can do: the window (a command
// for it, a screenshot, its text, a script), answered back.
async function onBackend(child, message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "result") {
    const wait = waiting.get(message.id);
    if (!wait) return;
    waiting.delete(message.id);
    if (message.ok) wait.resolve(message.value);
    else wait.reject(new Error(message.error));
    return;
  }
  if (message.type === "event") {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(message.channel, message.payload);
    return;
  }
  if (message.type !== "ask") return;
  const answer = (ok, value) => child.postMessage({ type: "answer", id: message.id, ok, ...(ok ? { value } : { error: value }) });
  try {
    if (message.op === "ui") answer(true, await askWindow(message.payload, message.timeout));
    else if (message.op === "window") answer(true, await windowOp(message.payload));
    else answer(false, `No such request: ${message.op}`);
  } catch (error) {
    answer(false, error instanceof Error ? error.message : String(error));
  }
}

async function windowOp({ op, code }) {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  if (!win) throw new Error("The app window is closed.");
  if (op === "screenshot") {
    const image = await win.webContents.capturePage();
    const size = image.getSize();
    const scaled = size.width > 1600 ? image.resize({ width: 1600 }) : image;
    return scaled.toPNG().toString("base64");
  }
  if (op === "text") return win.webContents.executeJavaScript("document.body ? document.body.innerText : ''");
  if (op === "eval") {
    // Try the code as an expression; only if that does not parse, as statements.
    const source = JSON.stringify(String(code ?? ""));
    const value = await win.webContents.executeJavaScript(
      `(async () => {
        const AsyncFunction = (async () => {}).constructor;
        let fn;
        try { fn = new AsyncFunction("return (" + ${source} + ");"); }
        catch (error) { if (!(error instanceof SyntaxError)) throw error; fn = new AsyncFunction(${source}); }
        return await fn();
      })()`,
      true,
    );
    return value === undefined ? "undefined" : value;
  }
  throw new Error(`No such window request: ${op}`);
}

// --- The window's calls, forwarded ---------------------------------------------------
for (const name of [
  "addresses",
  "network",
  "campaigns",
  "save-campaign",
  "touch-campaign",
  "campaign-ruleset",
  "ruleset-logos",
  "start-host",
  "stop-host",
  "campaign-view",
  "campaign-bundle",
  "save-bundle",
  "save-view",
  "set-token-art",
  "decal-add",
  "sound-add",
  "set-scene-image",
  "assistant-status",
  "assistant-ask",
  "assistant-stop",
  "assistant-reset",
  "packs",
  "packs-make",
])
  ipcMain.handle(name, (_event, ...args) => call(name, ...args));

// True when the text is on the clipboard afterwards.
ipcMain.handle("copy", (_event, text) => {
  const value = String(text ?? "").slice(0, 200);
  clipboard.writeText(value);
  return clipboard.readText() === value;
});
// The decal picker's Browse: a picture from anywhere, copied into the assets folder.
ipcMain.handle("decal-pick", async (_event, kind) => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: kind === "wallpaper" ? "Choose a desktop wallpaper (a picture that tiles)" : kind === "gmicon" ? "Choose your GM icon" : kind === "tile" ? "Choose a picture to place on the map" : "Choose a background decal",
    properties: ["openFile"],
    filters: [{ name: "Pictures", extensions: ["png", "webp", "jpg", "jpeg", "gif"] }],
  });
  if (picked.canceled || picked.filePaths.length === 0) return null;
  return call("decal-add-file", kind, picked.filePaths[0]);
});
// Sounds from anywhere, copied into a kind and folder of the sounds library.
ipcMain.handle("sound-pick", async (_event, kind, group) => {
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: "Add sounds",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Sounds", extensions: ["mp3", "ogg", "wav", "m4a", "webm", "flac", "opus"] }],
  });
  if (picked.canceled) return [];
  return call("sound-add-files", kind, group, picked.filePaths);
});
ipcMain.handle("sound-folder", async () => shell.openPath(await call("sound-folder")));
ipcMain.handle("packs-folder", async () => shell.openPath(await call("packs-folder")));
ipcMain.handle("decal-folder", async (_event, kind) => shell.openPath(await call("decal-folder", kind)));

// The DM assistant's key the GM typed: kept encrypted on this computer, known to the backend for the run.
const assistantKeys = assistantModule.keyStore(path.join(app.getPath("userData"), "assistant-key.bin"), safeStorage);
const sendTypedKey = () => call("assistant-typed-key", assistantKeys.get() ?? "").catch(() => undefined);
ipcMain.handle("assistant-key", (_event, key) => {
  assistantKeys.set(typeof key === "string" ? key : "");
  return call("assistant-typed-key", typeof key === "string" ? key : "");
});

// --- The agent bridge's commands for the window -------------------------------------------
// The agent asks the app window to do what a GM would do with the mouse (host,
// leave), and waits for the window's answer.
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

// --- The window -------------------------------------------------------------------------------
function createWindow() {
  const headless = process.env.KRAKEN_SMOKE === "1" || process.env.KRAKEN_E2E === "1";
  // Where it opens, when told (test runs on another monitor while the GM plays): "x,y".
  const at = /^(-?\d+),(-?\d+)$/.exec(process.env.KRAKEN_WINDOW_AT ?? "");
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...(at ? { x: Number(at[1]), y: Number(at[2]) } : {}),
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
    // A book's web link (FG's url links): the system's browser, never a Kraken window.
    if (/^https?:\/\//i.test(url) && frameName !== "kraken-popout") {
      void require("electron").shell.openExternal(url);
      return { action: "deny" };
    }
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
    // A window of its own always lands where it can be seen: one remembered on
    // a monitor no longer there (or off every screen) comes up beside Kraken's.
    try {
      const { screen } = require("electron");
      const bounds = child.getBounds();
      const seen = screen.getAllDisplays().some(({ workArea: area }) => {
        const wide = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
        const high = Math.min(bounds.y + 40, area.y + area.height) - Math.max(bounds.y, area.y);
        return wide >= 120 && high >= 30;
      });
      if (!seen) {
        const area = screen.getDisplayMatching(win.getBounds()).workArea;
        const width = Math.min(bounds.width, area.width - 40);
        const height = Math.min(bounds.height, area.height - 40);
        child.setBounds({ x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height });
      }
    } catch {
      /* placed as asked */
    }
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
  startBackend();
  const win = createWindow();
  mainWindow = win;
  await backendReady;
  await sendTypedKey();
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

// Quitting: the backend saves and stops the table first (at most 10 seconds), then goes.
app.on("before-quit", (event) => {
  if (quitting || !backend) return;
  event.preventDefault();
  quitting = true;
  const stop = backend;
  Promise.race([call("quit"), new Promise((resolve) => setTimeout(resolve, 10000))])
    .catch(() => undefined)
    .finally(() => {
      stop.kill();
      app.quit();
    });
});
