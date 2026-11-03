import { useEffect, useRef, useState } from "react";
import { gridLabel, preferredCandidateIndex, preferredSceneIndex } from "./foundry/geometry";
import { imageMime, inspectZip, type ImportCandidate, type LoadedAdventure } from "./foundry/importBundle";
import { useSession } from "./session/useSession";
import { SetupScreen } from "./setup/SetupScreen";
import { MapView, type MapScene } from "./table/MapView";
import { Desktop } from "./ui/Desktop";
import { WindowProvider } from "./ui/Windows";

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
      throw new Error("Unknown command.");
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
    setError(null);
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const found = inspectZip(bytes);
      if (found.length === 0) {
        setError("No Foundry adventure bundle was in that zip.");
        return;
      }
      const index = preferredCandidateIndex(found);
      if (campaignId) await window.kraken?.saveBundle(campaignId, bytes);
      setCandidates(found);
      setAdventureIndex(index);
      showAdventure(found[index]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that bundle.");
    } finally {
      setBusy(false);
    }
  }

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
          scene={scene ? <MapView scene={scene} gm={dm} map={session.map} records={Object.values(session.records)} pings={session.pings} notice={session.notice} actions={session} /> : null}
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
