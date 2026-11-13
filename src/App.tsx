import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./ui/icons";
import { imageWindow, studioOpener, type ImageRef } from "./table/imageWindow";
import { gridLabel, preferredCandidateIndex, preferredSceneIndex } from "./foundry/geometry";
import { withGrid } from "../shared/map/geometry.mjs";
import { imageMime, inspectZip, PICTURE, pictureBundle, type ImportCandidate, type LoadedAdventure } from "./foundry/importBundle";
import { useSession } from "./session/useSession";
import { SetupScreen } from "./setup/SetupScreen";
import { MapView, type MapScene } from "./table/MapView";
import { DESIGNS, EFFECTS, FONTS, MATERIALS, PRESETS, diceStore, fullLook, type DiceLook } from "./dice/diceStore";
import type { DiceSettingsPatch } from "./kraken";
import { agentCommands } from "./ui/agentCommands";
import { Desktop } from "./ui/Desktop";
import { WindowProvider } from "./ui/Windows";

const COLOUR = /^#[0-9a-f]{6}$/i;

// The agent's dice settings: what this window's dice look like and sound like.
function oneOf<T extends string>(what: string, value: string | undefined, items: { id: T }[]): T | undefined {
  if (value === undefined) return undefined;
  const found = items.find((item) => item.id === value);
  if (!found) throw new Error(`No ${what} "${value}". Choose from: ${items.map((item) => item.id).join(", ")}.`);
  return found.id;
}

function diceSettings(patch: DiceSettingsPatch) {
  const found = patch.preset ? PRESETS.find((item) => item.name.toLowerCase() === String(patch.preset).toLowerCase()) : null;
  if (patch.preset && !found) throw new Error(`No dice preset "${patch.preset}". Presets: ${PRESETS.map((item) => item.name).join(", ")}.`);
  for (const key of ["body", "accent", "ink"] as const) if (patch[key] !== undefined && !COLOUR.test(String(patch[key]))) throw new Error(`${key} must be a colour like #9d2136.`);
  const { name: _name, ...preset } = found ?? { name: "" };
  const parts: Partial<DiceLook> = {
    ...(patch.body ? { body: patch.body } : {}),
    ...(patch.accent ? { accent: patch.accent } : {}),
    ...(patch.ink ? { ink: patch.ink } : {}),
    ...(patch.design !== undefined ? { theme: oneOf("design", patch.design, DESIGNS) } : {}),
    ...(patch.material !== undefined ? { material: oneOf("material", patch.material, MATERIALS) } : {}),
    ...(patch.font !== undefined ? { font: oneOf("font", patch.font, FONTS) } : {}),
    ...(patch.effect !== undefined ? { effect: oneOf("effect", patch.effect, EFFECTS) } : {}),
    ...(typeof patch.crit === "boolean" ? { crit: patch.crit } : {}),
    ...(typeof patch.pips === "boolean" ? { pips: patch.pips } : {}),
  };
  // A preset is the whole look: pips only where it has them.
  const look = { ...(found ? { pips: Boolean((preset as Partial<DiceLook>).pips) } : {}), ...preset, ...parts };
  // A character's own dice (kraken_dice_settings character): the whole look, worked out from what it has; the host keeps it on the character.
  if (patch.resolve) return { look: fullLook({ ...(patch.base ?? diceStore.settings().look), ...look }) };
  if (patch.color !== undefined && patch.color !== "" && !COLOUR.test(String(patch.color))) throw new Error("color must be a colour like #e8c46a.");
  if (patch.set !== undefined && !["mine", "npc", "damage"].includes(patch.set)) throw new Error("set is mine, npc or damage.");
  const key = patch.set === "npc" ? "npc" : patch.set === "damage" ? "damage" : "look";
  const changes = Object.keys(look).length > 0;
  diceStore.update({
    ...(typeof patch.show === "boolean" ? { show: patch.show } : {}),
    ...(typeof patch.sound === "boolean" ? { sound: patch.sound } : {}),
    ...(typeof patch.volume === "number" ? { volume: Math.min(1, Math.max(0, patch.volume)) } : {}),
    ...(patch.color !== undefined ? { color: patch.color ? String(patch.color).toLowerCase() : null } : {}),
    ...(key === "look" ? { look } : patch.same ? { [key]: null } : changes ? { [key]: look } : {}),
  });
  const now = diceStore.settings();
  const nameOf = (value: DiceLook | null) =>
    value ? PRESETS.find((item) => (["theme", "body", "ink", "accent", "material", "effect", "font"] as const).every((part) => item[part] === value[part]) && Boolean(item.pips) === Boolean(value.pips))?.name ?? "custom" : "as my dice";
  return { ...now, preset: nameOf(now.look), npcSet: nameOf(now.npc), damageSet: nameOf(now.damage) };
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
        tiles: scene.tiles,
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
  // What the map is given stays the same object until it changes, so the map
  // (walls, lighting, tokens) is not drawn again for every chat line or roll.
  // Its actions are the session's own, always the latest.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const mapActions = useMemo(() => new Proxy({} as typeof session, { get: (_target, key) => (sessionRef.current as unknown as Record<string | symbol, unknown>)[key] }), []);
  const recordList = useMemo(() => Object.values(session.records), [session.records]);
  const targeted = useMemo(() => targetedTokens(session), [session.combat, session.map.tokens, session.role]);
  const myName = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
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
  // FG's image window: an image opened privately (the GM's alone), its bundle
  // kept to put it in play. The same master as the table's (one per picture).
  const [prep, setPrep] = useState<{ scene: MapScene; bytes: Uint8Array; book: string } | null>(null);
  const prepUrls = useRef<string[]>([]);

  useEffect(() => {
    const owned = urls.current;
    return () => {
      for (const url of owned) URL.revokeObjectURL(url);
      owned.length = 0;
    };
  }, []);

  // The agent bridge drives the window like a GM would: host a campaign, leave.
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
        // The GM plays under the name kept with the campaign.
        const touched = await kraken.touchCampaign({ id: command.campaignId, port: command.port }).catch(() => null);
        const failed = await current.host({ name: touched?.gmName || "DM", port: command.port, password: command.password, lan: true, cloud: false, campaignId: command.campaignId });
        if (failed) throw new Error(failed);
        return { hosting: true, campaignId: command.campaignId, port: command.port };
      }
      if (command.kind === "dice-settings") return diceSettings(command.patch ?? {});
      if (command.kind === "open-adventure") {
        if (!current.connected || current.role !== "dm") throw new Error("Not hosting.");
        return live.current.openBytes(new Uint8Array(command.bytes), command.name);
      }
      if (command.kind === "scenes") return live.current.scenes(command.adventure, command.scene);
      // FG's image window: open an image (the GM's alone), put it in play, a play test, close it.
      if (command.kind === "image") {
        if (!current.connected || current.role !== "dm") throw new Error("Not hosting.");
        if (command.action === "open") return live.current.openImage({ book: command.book ?? "", name: command.name, file: command.file });
        if (command.action === "play") return live.current.playImage();
        if (command.action === "close") {
          live.current.closeImage();
          return { closed: true };
        }
        if (command.action === "studio") {
          const open = live.current.prepNow;
          if (!open) throw new Error("Open the image first (action open).");
          await live.current.openInStudio(open.scene);
          return { studio: open.scene.name };
        }
        if (command.action === "test") {
          current.playtest(Boolean(command.on));
          return { testing: Boolean(command.on) };
        }
        throw new Error("open, play, test or close?");
      }
      if (command.kind === "deck-plan") {
        // A ship's deck plans, drawn here and opened as a map (its decks the scenes).
        if (!current.connected || current.role !== "dm") throw new Error("Not hosting.");
        const { makeDeckBundle } = await import("./ships/deckRender");
        const made = await makeDeckBundle(command.ship);
        return live.current.openBytes(made.bytes, made.name);
      }
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
      // A bare picture becomes a one-scene map to build in the map editor.
      if (PICTURE.test(name)) {
        const picture = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: imageMime(name) }));
        bytes = pictureBundle(bytes, name, { width: picture.width, height: picture.height });
        picture.close();
      }
      const found = inspectZip(bytes);
      if (found.length === 0) throw new Error(`No prepared map bundle was in ${name}.`);
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
  // An image opened in the image window: from the Images list, a book, the
  // Library, the agent. Already on the table: the table's map is that image.
  async function openImage(image: ImageRef) {
    if (!dm) throw new Error("Only the GM opens images to edit.");
    const bytes = await session.fgMaps(image.book, image.name ?? "", image.file ?? "");
    const found = inspectZip(bytes);
    if (found.length === 0) throw new Error("That picture could not be opened.");
    for (const url of prepUrls.current) URL.revokeObjectURL(url);
    prepUrls.current = [];
    const opened = toTable(found[0].load(), prepUrls.current);
    const wanted = (image.name ?? "").toLowerCase();
    const chosen = opened.scenes.find((item) => wanted && item.name.toLowerCase() === wanted) ?? opened.scenes[0];
    if (!chosen) throw new Error("That picture could not be opened.");
    const onTable = pack?.scenes[sceneIndex]?.id === chosen.id;
    if (onTable) {
      if (prep) closeImage();
      return { opened: chosen.name, id: chosen.id, onTable: true };
    }
    setPrep({ scene: chosen, bytes, book: image.book });
    await session.publish(chosen, { prep: true });
    return { opened: chosen.name, id: chosen.id, onTable: false };
  }
  // Map Studio on this image: its picture (as this window has it) and its master.
  async function openInStudio(shown: MapScene) {
    const kraken = window.kraken;
    if (!kraken?.studioOpenImage) throw new Error("Map Studio runs in the Kraken VTT app.");
    if (!shown.imageUrl) throw new Error("This map has no picture to paint on.");
    const picture = new Uint8Array(await (await fetch(shown.imageUrl)).arrayBuffer());
    const { url } = await kraken.studioOpenImage({ sceneId: shown.id, name: shown.name, picture });
    studioOpener.open?.(url);
  }
  // Saved from Map Studio: the image open here is read again (its picture may be new).
  useEffect(() => {
    return window.kraken?.onStudioSaved?.((saved) => {
      const open = live.current.prepNow;
      if (open && open.scene.id === saved.sceneId && saved.picture) void live.current.openImage({ book: open.book, name: open.scene.name }).catch(() => undefined);
    });
  }, []);
  function closeImage() {
    session.prepClose();
    setPrep(null);
  }
  // Put in play: the image window's image becomes the table's (the players see it).
  async function playImage() {
    if (!prep) throw new Error("No image is open in the image window.");
    const { bytes, book, scene: shown } = prep;
    await openBytes(bytes, `${book}.zip`);
    setPrep(null);
    return { onTable: shown.name };
  }
  const live = useRef({ openBytes, scenes, openImage, closeImage, playImage, openInStudio, prepNow: prep });
  live.current = { openBytes, scenes, openImage, closeImage, playImage, openInStudio, prepNow: prep };
  useEffect(() => {
    imageWindow.open = (image) => live.current.openImage(image);
    return () => {
      imageWindow.open = null;
    };
  }, []);
  // The table left: the image window goes with it.
  useEffect(() => {
    if (!session.connected) setPrep(null);
  }, [session.connected]);

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

  const tableScene = dm ? (pack?.scenes[sceneIndex] ?? null) : session.playerScene;
  // The GM's map window shows the image window's image while one is open.
  const scene = dm && prep ? prep.scene : tableScene;
  const testing = dm && Boolean(session.map.testing);
  // The image window's bar: whose it is (the GM's alone), put in play, a play test, close.
  const imageBar =
    dm && prep ? (
      <div className="toolbar image-bar" data-image-window={prep.scene.name}>
        <strong className="adventure-name">{prep.scene.name}</strong>
        <span className="image-private" title="The players do not see this image; its walls, lights and paint are the same wherever it is opened">
          <Icon name="eye-off" size={14} /> Only you see this
        </span>
        <button type="button" data-action="image-play" title="Put it on the table: the players see it (their map)" onClick={() => void playImage().catch((caught: Error) => setError(caught.message))}>
          Put in play
        </button>
        <button
          type="button"
          className={testing ? "on" : ""}
          data-action="image-test"
          aria-pressed={testing}
          title={testing ? "End the play test: back to the GM's view" : "Play test: a test token on the image, seen as a player sees it (walls, doors, light); drag it to find problems"}
          onClick={() => session.playtest(!testing)}
        >
          {testing ? "End play test" : "Play test"}
        </button>
        <button type="button" data-action="image-studio" title="Open it in Map Studio: paint art, walls, doors, lights and weather; Save to Kraken writes them into this image" onClick={() => void openInStudio(prep.scene).catch((caught: Error) => setError(caught.message))}>
          Open in Map Studio
        </button>
        <button type="button" className="ghost" data-action="image-close" title="Close the image (back to the table's map)" onClick={closeImage}>
          Close
        </button>
      </div>
    ) : null;
  const sceneBar = imageBar ?? (scene ? (
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
      <span className="grid-label">{gridLabel(withGrid({ ...scene, grid: scene.baseGrid ?? scene.grid }, session.map.sceneId === scene.id ? session.map.settings.grid : null).grid)}</span>
      {dm ? (
        <button type="button" className="ghost" data-action="table-test" aria-pressed={testing} title={testing ? "End the play test" : "Play test: a test token on this map, seen as a player sees it"} onClick={() => session.playtest(!testing)}>
          {testing ? "End play test" : "Play test"}
        </button>
      ) : null}
    </div>
  ) : null);

  // The table before a map is open: the decal alone (maps and books open from
  // the Books window, or a map bundle dropped on the table).
  const emptyGM = (
    <div className="desktop-start">
      {busy ? <p className="desktop-hint">Reading the bundle…</p> : null}
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
              <MapView scene={scene} gm={dm && !testing} map={session.map} records={recordList} pings={session.pings} notice={session.notice} actions={mapActions} targeted={targeted} me={testing ? "@test" : myName} startEditing={dm && Boolean(prep) && !testing} />
            ) : null
          }
          sceneId={scene?.id ?? ""}
          sceneName={scene?.name ?? ""}
          sceneBar={sceneBar}
          onMapClosed={prep ? closeImage : undefined}
          emptyGM={emptyGM}
          onOpenAdventure={() => fileInput.current?.click()}
          openMaps={(bytes, name) => openBytes(bytes, name)}
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
                  accept=".zip,application/zip,.png,.jpg,.jpeg,.webp,.gif,image/*"
                  aria-label="Map bundle or picture"
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
