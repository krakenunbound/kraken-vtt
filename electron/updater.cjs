const { app, ipcMain } = require("electron");

// Kraken's updater (electron-updater, from the GitHub releases of kraken-vtt:
// latest.yml beside each release's installer). The GM's rules:
//  - it looks for a new version once, when Kraken starts, and never again
//    while it runs (never during a game);
//  - what it finds is shown on the start screen alone, before a campaign is
//    opened: no notice, badge or window during a session;
//  - it downloads only when the GM asks, and installs (Kraken closes, the
//    installer runs, the new version opens) only when the GM asks, never while
//    a campaign is hosted.
// KRAKEN_UPDATE_URL points it at another place holding a latest.yml (a test's
// own server); KRAKEN_NO_UPDATES turns it off. Run from the source (not
// installed), it looks nowhere unless KRAKEN_UPDATE_URL is set.

let state = { status: "idle", current: app.getVersion() };
let updater = null;
const listeners = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  for (const send of listeners) send(state);
};
// Release notes as plain text (GitHub gives them as HTML).
const plain = (notes) =>
  (Array.isArray(notes) ? notes.map((item) => item?.note ?? "").join("\n") : String(notes ?? ""))
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);

function startUpdater({ hosting, register = () => undefined }) {
  const feed = process.env.KRAKEN_UPDATE_URL;
  if (process.env.KRAKEN_NO_UPDATES === "1") set({ status: "off", reason: "Updates are turned off." });
  else if (!app.isPackaged && !feed) set({ status: "off", reason: "Kraken is running from its source, not installed." });
  else {
    try {
      const { autoUpdater } = require("electron-updater");
      updater = autoUpdater;
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      // Every Kraken release so far is a pre-release (an alpha).
      updater.allowPrerelease = true;
      updater.logger = null;
      if (feed) {
        // Run from the source, the updater's own settings (an installed Kraken
        // carries them as app-update.yml) are written to Kraken's data folder.
        if (!app.isPackaged) {
          const path = require("path");
          const file = path.join(app.getPath("userData"), "dev-app-update.yml");
          require("fs").writeFileSync(file, `provider: generic\nurl: ${feed}\nupdaterCacheDirName: kraken-vtt-updater\n`);
          updater.forceDevUpdateConfig = true;
          updater.updateConfigPath = file;
        }
        updater.setFeedURL({ provider: "generic", url: feed });
      }
      updater.on("update-available", (info) => set({ status: "available", version: info.version, notes: plain(info.releaseNotes), date: info.releaseDate ?? null }));
      updater.on("update-not-available", () => set({ status: "current" }));
      updater.on("download-progress", (progress) => set({ status: "downloading", percent: Math.round(progress.percent ?? 0) }));
      updater.on("update-downloaded", (info) => set({ status: "ready", version: info.version, percent: 100 }));
      updater.on("error", (error) => set({ status: state.status === "downloading" ? "available" : "error", error: String(error?.message ?? error).split("\n")[0].slice(0, 300) }));
      // Once, now: never again while Kraken runs.
      set({ status: "checking" });
      updater.checkForUpdates().catch((error) => set({ status: "error", error: String(error?.message ?? error).split("\n")[0].slice(0, 300) }));
    } catch (error) {
      set({ status: "error", error: String(error?.message ?? error).slice(0, 300) });
    }
  }

  ipcMain.handle("updater-state", () => state);
  const download = async () => {
    if (!updater || state.status !== "available") return state;
    if (await hosting()) throw new Error("Not while a campaign is hosted: leave the table first.");
    set({ status: "downloading", percent: 0, error: null });
    await updater.downloadUpdate();
    return state;
  };
  const install = async () => {
    if (!updater || state.status !== "ready") throw new Error("The new version is not downloaded yet.");
    if (await hosting()) throw new Error("Not while a campaign is hosted: leave the table first.");
    set({ status: "installing" });
    // Kraken closes, the installer runs (Windows asks to allow it), the new version opens.
    setImmediate(() => updater.quitAndInstall(false, true));
    return state;
  };
  ipcMain.handle("updater-download", download);
  ipcMain.handle("updater-install", install);
  register("updater-download", download);
  register("updater-install", install);
  return {
    state: () => state,
    onChange(send) {
      listeners.add(send);
      return () => listeners.delete(send);
    },
  };
}

module.exports = { startUpdater };
