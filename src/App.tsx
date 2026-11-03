import { useEffect, useRef, useState } from "react";
import { gridLabel, preferredCandidateIndex, preferredSceneIndex } from "./foundry/geometry";
import { imageMime, inspectZip, type ImportCandidate, type LoadedAdventure } from "./foundry/importBundle";
import { Picture } from "./characters/ArtPicker";
import { CharacterPanel } from "./characters/CharacterPanel";
import { PartySheet } from "./party/PartySheet";
import { ChatPane, PartyPanel } from "./session/PartyPanel";
import { useSession } from "./session/useSession";
import { SetupScreen } from "./setup/SetupScreen";
import { MapView, type MapScene } from "./table/MapView";

const TABS = [
  { id: "table", label: "Table" },
  { id: "party", label: "Party" },
  { id: "characters", label: "Characters" },
  { id: "library", label: "Library" },
  { id: "audio", label: "Audio" },
  { id: "encounters", label: "Encounters" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const PLACEHOLDERS: Record<Exclude<TabId, "table" | "party" | "characters">, string> = {
  library: "Journals and books will live here.",
  audio: "Playlists from the adventure will live here.",
  encounters: "Initiative and dice will live here.",
};

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
  const [tab, setTab] = useState<TabId>("table");
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [adventureIndex, setAdventureIndex] = useState(0);
  const [pack, setPack] = useState<TableAdventure | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The side dock beside the map: chat for the GM; chat, character and party for a player.
  const [dockTab, setDockTab] = useState<"chat" | "character" | "party">("chat");
  const [dockOpen, setDockOpen] = useState(true);
  const [pickedCharacter, setPickedCharacter] = useState<string | null>(null);
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
    setTab("table");
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
  const hostWhere = session.hostInfo
    ? (session.hostInfo.addresses.length > 0 ? session.hostInfo.addresses : ["127.0.0.1"])
        .map((address) => `${address}:${session.hostInfo?.port}`)
        .join(" · ")
    : "";

  const tableSection = (
  <section className="table" role="tabpanel">
    {scene ? (
      <>
        <div className="toolbar" data-adventure={dm ? pack?.name ?? scene.name : scene.name}>
          {dm && pack && candidates.length > 1 ? (
            <label>
              Adventure
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
            </label>
          ) : (
            <strong className="adventure-name">{dm ? pack?.name ?? scene.name : scene.name}</strong>
          )}
          {dm && pack && pack.scenes.length > 1 ? (
            <label>
              Scene
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
            </label>
          ) : null}
          <span className="grid-label">{gridLabel(scene.grid)}</span>
          {dm ? (
            <button type="button" className="open-another" onClick={() => fileInput.current?.click()}>
              Open
            </button>
          ) : null}
        </div>
        <MapView scene={scene} gm={dm} map={session.map} records={Object.values(session.records)} pings={session.pings} notice={session.notice} actions={session} />
      </>
    ) : dm ? (
      <div className="import">
        <h1>Put a map on the table</h1>
        <p>Open a Foundry adventure bundle. Players see the map and lights. Walls, doors, and traps stay on your side.</p>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          {busy ? "Reading bundle…" : "Open bundle"}
        </button>
        <p className="hint">An Adventure Bundler zip, or a zip that contains several of them. Drop the file here.</p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    ) : (
      <div className="import">
        <h1>Waiting for the map</h1>
        <p>The DM has not opened a scene yet. Your character's token goes on it from the Tokens tray.</p>
      </div>
    )}
  </section>
  );

  const common = (
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
  );

  const dock = (
    <aside className={dockOpen ? "dock" : "dock closed"} aria-label="Side panel">
      <div className="dock-tabs" role="tablist">
        <button type="button" className="dock-toggle" onClick={() => setDockOpen(!dockOpen)} aria-label={dockOpen ? "Hide the side panel" : "Show the side panel"}>
          {dockOpen ? "»" : "«"}
        </button>
        {dockOpen
          ? (dm ? (["chat"] as const) : (["chat", "character", "party"] as const)).map((id) => (
              <button key={id} type="button" className="dock-tab" role="tab" aria-selected={dockTab === id} onClick={() => setDockTab(id)}>
                {id === "chat" ? "Chat" : id === "character" ? "Character" : "Party"}
              </button>
            ))
          : null}
      </div>
      {dockOpen ? (
        dm || dockTab === "chat" ? (
          <ChatPane session={session} />
        ) : dockTab === "character" ? (
          <CharacterPanel session={session} dock selected={pickedCharacter} />
        ) : (
          <div className="dock-party-sheet">
            <PartySheet session={session} compact />
            <PlayerParty session={session} />
          </div>
        )
      ) : null}
    </aside>
  );

  // A player at the table: the map with their dock. The GM's tabs (library,
  // audio, encounters, every character) are not theirs.
  if (!dm) {
    const mine = Object.values(session.records).filter((record) => record.type === "character");
    return (
      <div className="shell player-shell" data-session="player">
        <header className="topbar">
          <div className="brand">Kraken</div>
          <div className="portrait-strip" aria-label="Your characters">
            {mine.map((record) => (
              <button
                key={record.id}
                type="button"
                className="portrait-chip"
                title={`${record.name}: open the sheet`}
                onClick={() => {
                  setPickedCharacter(record.id);
                  setDockTab("character");
                  setDockOpen(true);
                }}
              >
                <span className="chip-face">
                  {typeof record.data.portrait === "string" && record.data.portrait ? <Picture session={session} id={record.data.portrait} alt="" /> : record.name.slice(0, 1)}
                </span>
                <span>{record.name}</span>
              </button>
            ))}
          </div>
          <div className="session-status">
            <span>Connected to {session.remoteLabel}</span>
            <button type="button" onClick={() => session.leave()}>
              Leave
            </button>
          </div>
        </header>
        <div className="stage">
          {tableSection}
          {dock}
        </div>
        {common}
      </div>
    );
  }

  return (
    <div
      className="shell"
      data-session={session.role}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={onDrop}
    >
      <header className="topbar">
        <div className="brand">Kraken</div>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="tab"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="session-status">
          <span>{dm ? `Hosting ${hostWhere}` : `Connected to ${session.remoteLabel}`}</span>
          <button type="button" onClick={() => session.leave()}>
            Leave
          </button>
        </div>
      </header>

      {/* The GM's chat stays beside every tab, as FG's chat window does. */}
      <div className="stage">
        <div className="workspace">
          <div className="stage-table" hidden={tab !== "table"}>
            {tableSection}
          </div>
          {tab === "party" ? <PartyPanel session={session} /> : null}
          {tab === "characters" ? <CharacterPanel session={session} /> : null}
          {tab !== "table" && tab !== "party" && tab !== "characters" ? (
            <section className="placeholder" role="tabpanel">
              <h1>{TABS.find((item) => item.id === tab)?.label}</h1>
              <p>{PLACEHOLDERS[tab]}</p>
            </section>
          ) : null}
        </div>
        {dock}
      </div>

      {common}
    </div>
  );
}

// The party as a player sees it: who is at the table.
function PlayerParty({ session }: { session: ReturnType<typeof useSession> }) {
  return (
    <section className="dock-party" role="tabpanel">
      <h2>At the table</h2>
      <ul className="roster-list">
        {session.players.map((seat) => {
          const token = session.map.tokens.find((item) => item.owner === seat.name);
          return (
            <li key={seat.id} data-player={seat.id} data-role={seat.role}>
              <span className="seat-dot" style={{ background: token?.color ?? "#888" }} />
              <span>{seat.name}</span>
              <span className="seat-role">{seat.role === "dm" ? "GM" : "Player"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
