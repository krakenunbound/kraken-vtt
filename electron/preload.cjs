const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kraken", {
  addresses: () => ipcRenderer.invoke("addresses"),
  network: () => ipcRenderer.invoke("network"),
  campaigns: () => ipcRenderer.invoke("campaigns"),
  saveCampaign: (input) => ipcRenderer.invoke("save-campaign", input),
  touchCampaign: (input) => ipcRenderer.invoke("touch-campaign", input),
  setCampaignRuleset: (input) => ipcRenderer.invoke("campaign-ruleset", input),
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
