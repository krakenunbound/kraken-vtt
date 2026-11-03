import { useEffect, useRef, useState } from "react";
import { gridLabel, preferredCandidateIndex, preferredSceneIndex } from "./foundry/geometry";
import { imageMime, inspectZip, type ImportCandidate, type LoadedAdventure } from "./foundry/importBundle";
import { useSession } from "./session/useSession";
import { SetupScreen } from "./setup/SetupScreen";
import { MapView, type MapScene } from "./table/MapView";
import { PRESETS, diceStore } from "./dice/diceStore";
import { agentCommands } from "./ui/agentCommands";
import { Desktop } from "./ui/Desktop";
import { WindowProvider } from "./ui/Windows";

const COLOUR = /^#[0-9a-f]{6}$/i;

// The agent's dice settings: what this window's dice look like and sound like.
function diceSettings(patch: { show?: boolean; sound?: boolean; volume?: number; preset?: string; body?: string; ink?: string }) {
  const preset = patch.preset ? PRESETS.find((item) => item.name.toLowerCase() === String(patch.preset).toLowerCase()) : null;
  if (patch.preset && !preset) throw new Error(`No dice preset "${patch.preset}". Presets: ${PRESETS.map((item) => item.name).join(", ")}.`);
  for (const key of ["body", "ink"] as const) if (patch[key] !== undefined && !COLOUR.test(String(patch[key]))) throw new Error(`${key} must be a colour like #9d2136.`);
  const look = { ...(preset ? { theme: preset.theme, body: preset.body, ink: preset.ink } : {}), ...(patch.body ? { body: patch.body } : {}), ...(patch.ink ? { ink: patch.ink } : {}) };
  diceStore.update({
    ...(typeof patch.show === "boolean" ? { show: patch.show } : {}),
    ...(typeof patch.sound === "boolean" ? { sound: patch.sound } : {}),
    ...(typeof patch.volume === "number" ? { volume: Math.min(1, Math.max(0, patch.volume)) } : {}),
    look,
  });
  const now = diceStore.settings();
  return { ...now, preset: PRESETS.find((item) => item.theme === now.look.theme && item.body === now.look.body && item.ink === now.look.ink)?.name ?? "custom" };
}

type TableAdventure = {
  name: string;
  scenes: MapScene[];
};

function blobUrl(bytes: Uint8Array, mime: string): string {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return URL.createObjectURL(new Blob([copy], { type: mime }));
}

function toTable(loaded: LoadedAdventure, urls: string[]): TableAdventure {
  return {
    name: loaded.name,
    scenes: loaded.scenes.map((scene) => {
      const imageUrl = scene.image && scene.backgroundSrc ? blobUrl(scene.image, imageMime(scene.backgroundSrc)) : null;
      if (imageUrl) urls.push(imageUrl);
      return {
        id: scene.id,
        name: scene.name,
        width: scene.width,
        height: scene.height,
        padding: scene.padding,
        backgroundColor: scene.backgroundColor,
        grid: scene.grid,
        imageUrl,
        offsetX: scene.offsetX,
        offsetY: scene.offsetY,
        scaleX: scene.scaleX,
        scaleY: scene.scaleY,
        anchorX: scene.anchorX,
        anchorY: scene.anchorY,
        fit: scene.fit,
        walls: scene.walls,
        darkness: scene.darkness,
        lights: scene.lights,
        markers: scene.markers,
        regions: scene.regions,
        tokens: scene.tokens.map((token) => {
          const tokenUrl = token.image && token.imageName ? blobUrl(token.image, imageMime(token.imageName)) : null;
          if (tokenUrl) urls.push(tokenUrl);
          return { ...token, image: null, imageUrl: tokenUrl };
        }),
      };
    }),
  };
}

export function App() {
  const session = useSession();
  const urls = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [adventureIndex, setAdventureIndex] = useState(0);
  const [pack, setPack] = useState<TableAdventure | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dm = session.role === "dm";
  const campaignId = dm ? (session.hostInfo?.campaignId ?? "") : "";
  const restored = useRef("");

  useEffect(() => {
    const owned = urls.current;
    return () => {
      for (const url of owned) URL.revokeObjectURL(url);
      owned.length = 0;
    };
  }, []);

  // The agent bridge drives the window like a GM would: host a campaign, leave.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    const kraken = window.kraken;
    if (!kraken?.onAgentCommand) return;
    return kraken.onAgentCommand(async (command) => {
      const current = sessionRef.current;
      if (command.kind === "leave") {
        if (!current.connected) return { left: false, reason: "Not hosting." };
        current.leave(true);
        return { left: true };
      }
      if (command.kind === "host") {
        if (current.connected) current.leave(true);
        await kraken.touchCampaign({ id: command.campaignId, port: command.port }).catch(() => null);
        const failed = await current.host({ name: "DM", port: command.port, password: command.password, lan: true, cloud: false, campaignId: command.campaignId });
        if (failed) throw new Error(failed);
        return { hosting: true, campaignId: command.campaignId, port: command.port };
      }
      if (command.kind === "dice-settings") return diceSettings(command.patch ?? {});
      if (command.kind === "open-adventure") {
        if (!current.connected || current.role !== "dm") throw new Error("Not hosting.");
        return live.current.openBytes(new Uint8Array(command.bytes), command.name);
      }
      if (command.kind === "scenes") return live.current.scenes(command.adventure, command.scene);
      return agentCommands.run(command);
    });
  }, []);

  async function publishCurrent(next: MapScene) {
    if (session.role !== "dm") return;
    try {
      await session.publish(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not share that map.");
    }
  }

  function revoke() {
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.length = 0;
  }

  function saveView(adventure: string, sceneId: string) {
    if (!campaignId) return;
    void window.kraken?.saveView(campaignId, { adventure, sceneId }).catch(() => undefined);
  }

  function showAdventure(candidate: ImportCandidate, sceneId?: string) {
    revoke();
    const loaded = candidate.load();
    const table = toTable(loaded, urls.current);
    const saved = sceneId ? table.scenes.findIndex((item) => item.id === sceneId) : -1;
    const index = saved >= 0 ? saved : preferredSceneIndex(table.scenes);
    setPack(table);
    setSceneIndex(index);
    const next = table.scenes[index];
    if (next) {
      void publishCurrent(next);
      saveView(candidate.name, next.id);
    }
  }

  // Put the campaign back the way the DM left it: the same adventure and scene.
  useEffect(() => {
    if (!campaignId || restored.current === campaignId) return;
    restored.current = campaignId;
    const kraken = window.kraken;
    if (!kraken) return;
    let cancel = false;
    void (async () => {
      try {
        const { view, hasBundle } = await kraken.campaignView(campaignId);
        if (!hasBundle || cancel) return;
        setBusy(true);
        const bytes = await kraken.campaignBundle(campaignId);
        if (!bytes || cancel) return;
        const found = inspectZip(new Uint8Array(bytes));
        if (found.length === 0 || cancel) return;
        const named = view ? found.findIndex((candidate) => candidate.name === view.adventure) : -1;
        const index = named >= 0 ? named : preferredCandidateIndex(found);
        setCandidates(found);
        setAdventureIndex(index);
        showAdventure(found[index], view?.sceneId);
      } catch (caught) {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not reopen this campaign's map.");
      } finally {
        if (!cancel) setBusy(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // showAdventure is recreated each render; the restore runs once per campaign.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  useEffect(() => {
    if (!session.connected) {
      restored.current = "";
      revoke();
      setPack(null);
      setCandidates([]);
    }
  }, [session.connected]);

  async function openFile(file: File) {
    if (!dm) return;
    try {
      await openBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that bundle.");
    }
  }

  // A bundle's bytes (from a file the GM picked, or from the agent) onto the table.
  async function openBytes(bytes: Uint8Array, name: string) {
    setError(null);
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const found = inspectZip(bytes);
      if (found.length === 0) throw new Error(`No Foundry adventure bundle was in ${name}.`);
      const index = preferredCandidateIndex(found);
      if (campaignId) await window.kraken?.saveBundle(campaignId, bytes);
      setCandidates(found);
      setAdventureIndex(index);
      showAdventure(found[index]);
      return { adventures: found.map((candidate) => candidate.name), opened: found[index].name };
    } finally {
      setBusy(false);
    }
  }

  // What the agent sees of the adventures, and how it switches the scene on the table.
  function scenes(adventure?: string, sceneName?: string) {
    let table = pack;
    let at = adventureIndex;
    if (adventure) {
      const wanted = adventure.toLowerCase();
      const index = candidates.findIndex((candidate) => candidate.name.toLowerCase() === wanted);
      if (index < 0) throw new Error(`No adventure "${adventure}" is open. Open: ${candidates.map((candidate) => candidate.name).join(", ") || "none"}.`);
      if (index !== adventureIndex || !pack) {
        revoke();
        table = toTable(candidates[index].load(), urls.current);
        at = index;
        setPack(table);
        setAdventureIndex(index);
      }
    }
    if (!table) throw new Error("No adventure is open (kraken_open_adventure).");
    let index = table === pack ? sceneIndex : preferredSceneIndex(table.scenes);
    if (sceneName) {
      const wanted = sceneName.toLowerCase();
      index = table.scenes.findIndex((item) => item.id === sceneName || item.name.toLowerCase() === wanted);
      if (index < 0) throw new Error(`No scene "${sceneName}" in ${table.name}.`);
    }
    const shown = table.scenes[index];
    if (shown && (table !== pack || index !== sceneIndex)) {
      setSceneIndex(index);
      void publishCurrent(shown);
      saveView(candidates[at]?.name ?? table.name, shown.id);
    }
    return {
      adventures: candidates.map((candidate) => candidate.name),
      adventure: candidates[at]?.name ?? table.name,
      scenes: table.scenes.map((item) => ({ id: item.id, name: item.name })),
      onTable: shown ? { id: shown.id, name: shown.name } : null,
    };
  }
  const live = useRef({ openBytes, scenes });
  live.current = { openBytes, scenes };

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    if (!dm) return;
    const file = event.dataTransfer.files[0];
    if (file) void openFile(file);
  }

  if (!session.connected) {
    return (
      <SetupScreen
        busy={session.connecting}
        error={session.error}
        canHost={session.canHost}
        onHost={session.host}
        onJoin={session.join}
      />
    );
  }

  const scene = dm ? (pack?.scenes[sceneIndex] ?? null) : session.playerScene;
  const sceneBar = scene ? (
    <div className="toolbar" data-adventure={dm ? pack?.name ?? scene.name : scene.name}>
      {dm && pack && candidates.length > 1 ? (
        <select
          aria-label="Adventure"
          value={adventureIndex}
          onChange={(event) => {
            const index = Number(event.target.value);
            setAdventureIndex(index);
            const candidate = candidates[index];
            if (!candidate) return;
            try {
              showAdventure(candidate);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not read that bundle.");
            }
          }}
        >
          {candidates.map((candidate, index) => (
            <option key={`${candidate.name}-${index}`} value={index}>
              {candidate.name}
            </option>
          ))}
        </select>
      ) : (
        <strong className="adventure-name">{dm ? pack?.name ?? scene.name : scene.name}</strong>
      )}
      {dm && pack && pack.scenes.length > 1 ? (
        <select
          aria-label="Scene"
          value={scene.id}
          onChange={(event) => {
            if (!pack) return;
            const index = pack.scenes.findIndex((item) => item.id === event.target.value);
            if (index < 0) return;
            setSceneIndex(index);
            const next = pack.scenes[index];
            if (next) {
              void publishCurrent(next);
              saveView(candidates[adventureIndex]?.name ?? pack.name, next.id);
            }
          }}
        >
          {pack.scenes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      ) : null}
      <span className="grid-label">{gridLabel(scene.grid)}</span>
    </div>
  ) : null;

  const emptyGM = (
    <div className="desktop-start">
      <button type="button" className="play-button" onClick={() => fileInput.current?.click()} disabled={busy}>
        {busy ? "Reading the bundle…" : "Open an adventure"}
      </button>
      <p className="desktop-hint">A Foundry Adventure Bundler zip, or one holding several. You can also drop it here.</p>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      className="app-root"
      onDragOver={(event) => {
        if (dm && [...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <WindowProvider>
        <Desktop
          session={session}
          scene={
            scene ? (
              <MapView scene={scene} gm={dm} map={session.map} records={Object.values(session.records)} pings={session.pings} notice={session.notice} actions={session} targeted={targetedTokens(session)} />
            ) : null
          }
          sceneBar={sceneBar}
          emptyGM={emptyGM}
          onOpenAdventure={() => fileInput.current?.click()}
          overlay={
            <>
              {error && scene ? (
                <p className="toast" role="alert">
                  {error}
                </p>
              ) : null}
              {dm ? (
                <input
                  ref={fileInput}
                  className="file-input"
                  type="file"
                  accept=".zip,application/zip"
                  aria-label="Foundry bundle"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void openFile(file);
                    event.target.value = "";
                  }}
                />
              ) : null}
            </>
          }
        />
      </WindowProvider>
    </div>
  );
}

// The tokens this seat's creatures have targeted: a player's own characters,
// or for the GM the creature whose turn it is.
function targetedTokens(session: ReturnType<typeof useSession>): string[] {
  const { entries, active } = session.combat;
  const sources = session.role === "dm" ? entries.filter((entry) => entry.id === active) : entries.filter((entry) => entry.mine);
  const ids = new Set(sources.flatMap((entry) => entry.targets));
  return entries
    .filter((entry) => ids.has(entry.id))
    .map((entry) => entry.tokenId ?? session.map.tokens.find((token) => entry.recordId && token.recordId === entry.recordId)?.id ?? "")
    .filter(Boolean);
}
