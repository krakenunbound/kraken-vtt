const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kraken", {
  addresses: () => ipcRenderer.invoke("addresses"),
  network: () => ipcRenderer.invoke("network"),
  campaigns: () => ipcRenderer.invoke("campaigns"),
  saveCampaign: (input) => ipcRenderer.invoke("save-campaign", input),
  touchCampaign: (input) => ipcRenderer.invoke("touch-campaign", input),
  setCampaignRuleset: (input) => ipcRenderer.invoke("campaign-ruleset", input),
  rulesetLogos: () => ipcRenderer.invoke("ruleset-logos"),
  studioUrl: () => ipcRenderer.invoke("studio-url"),
  studioOpenImage: (input) => ipcRenderer.invoke("studio-open-image", input),
  studioSettings: (input) => ipcRenderer.invoke("studio-settings", input),
  // Kraken's updates (looked for once, at launch; the start screen shows them).
  updater: {
    state: () => ipcRenderer.invoke("updater-state"),
    download: () => ipcRenderer.invoke("updater-download"),
    install: () => ipcRenderer.invoke("updater-install"),
    onEvent: (handler) => {
      const listener = (_event, value) => handler(value);
      ipcRenderer.on("updater-event", listener);
      return () => ipcRenderer.removeListener("updater-event", listener);
    },
  },
  studioPickFolder: (kind) => ipcRenderer.invoke("studio-pick-folder", kind),
  // Map Studio saved into an image of the hosted campaign (its picture may be new).
  onStudioSaved: (handler) => {
    const listener = (_event, value) => handler(value);
    ipcRenderer.on("studio-saved", listener);
    return () => ipcRenderer.removeListener("studio-saved", listener);
  },
  copy: (text) => ipcRenderer.invoke("copy", text),
  startHost: (options) => ipcRenderer.invoke("start-host", options),
  stopHost: () => ipcRenderer.invoke("stop-host"),
  setSceneImage: (bytes, mime) => ipcRenderer.invoke("set-scene-image", bytes, mime),
  setTokenArt: (list) => ipcRenderer.invoke("set-token-art", list),
  pickDecal: (kind) => ipcRenderer.invoke("decal-pick", kind),
  addDecal: (name, bytes, kind) => ipcRenderer.invoke("decal-add", name, bytes, kind),
  openDecalFolder: (kind) => ipcRenderer.invoke("decal-folder", kind),
  pickSounds: (kind, group) => ipcRenderer.invoke("sound-pick", kind, group),
  addSound: (kind, group, name, bytes) => ipcRenderer.invoke("sound-add", kind, group, name, bytes),
  openSoundFolder: () => ipcRenderer.invoke("sound-folder"),
  campaignView: (id) => ipcRenderer.invoke("campaign-view", id),
  campaignBundle: (id) => ipcRenderer.invoke("campaign-bundle", id),
  saveBundle: (id, bytes) => ipcRenderer.invoke("save-bundle", id, bytes),
  saveView: (id, view) => ipcRenderer.invoke("save-view", id, view),
  // Kraken packs: the GM's FG books in Kraken's own files (the GM's window only).
  packs: {
    view: (input) => ipcRenderer.invoke("packs", input),
    make: (ids) => ipcRenderer.invoke("packs-make", ids),
    openFolder: () => ipcRenderer.invoke("packs-folder"),
    onEvent: (handler) => {
      const listener = (_event, value) => handler(value);
      ipcRenderer.on("packs-event", listener);
      return () => ipcRenderer.removeListener("packs-event", listener);
    },
  },
  // The DM assistant (the GM's window only).
  assistant: {
    status: () => ipcRenderer.invoke("assistant-status"),
    ask: (text) => ipcRenderer.invoke("assistant-ask", text),
    stop: () => ipcRenderer.invoke("assistant-stop"),
    reset: () => ipcRenderer.invoke("assistant-reset"),
    setKey: (key) => ipcRenderer.invoke("assistant-key", key),
    onEvent: (handler) => {
      const listener = (_event, value) => handler(value);
      ipcRenderer.on("assistant-event", listener);
      return () => ipcRenderer.removeListener("assistant-event", listener);
    },
  },
  // Commands from the agent bridge (host, leave...). The handler's answer goes back.
  onAgentCommand: (handler) => {
    const listener = async (_event, req, command) => {
      try {
        ipcRenderer.invoke("agent-reply", req, true, await handler(command));
      } catch (error) {
        ipcRenderer.invoke("agent-reply", req, false, error instanceof Error ? error.message : String(error));
      }
    };
    ipcRenderer.on("agent-command", listener);
    return () => ipcRenderer.removeListener("agent-command", listener);
  },
});
