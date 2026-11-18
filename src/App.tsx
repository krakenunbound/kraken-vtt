import { useEffect, useMemo, useRef, useState } from "react";
import { rangesOf } from "../shared/map/ranges.mjs";
import { dicePacks } from "./dice/dicePacks";
import { bookOf } from "../shared/table/restore.mjs";
import { Icon } from "./ui/icons";
import { imageWindow, mapWindow, studioOpener, type ImageRef } from "./table/imageWindow";
import { gridLabel, preferredCandidateIndex, preferredSceneIndex } from "./foundry/geometry";
import { withGrid } from "../shared/map/geometry.mjs";
import { imageMime, inspectZip, PICTURE, pictureBundle, type ImportCandidate, type LoadedAdventure } from "./foundry/importBundle";
import { useSession } from "./session/useSession";
import { SetupScreen } from "./setup/SetupScreen";
import { forgetView, MapView, type MapScene } from "./table/MapView";
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
  // Kraken's presets, then the dice packs' sets (Documents/Kraken VTT/Dice).
  const sets = [...PRESETS, ...dicePacks.list().flatMap((pack) => pack.sets)];
  const found = patch.preset ? sets.find((item) => item.name.toLowerCase() === String(patch.preset).toLowerCase()) : null;
  if (patch.preset && !found) throw new Error(`No dice preset "${patch.preset}". Presets: ${sets.map((item) => item.name).join(", ")}.`);
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
  const look = { ...(found ? { pips: Boolean((preset as Partial<DiceLook>).pips), texture: undefined, glowTexture: undefined } : {}), ...preset, ...parts };
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
    ...(typeof patch.turnSound === "boolean" ? { turnSound: patch.turnSound } : {}),
    ...(typeof patch.turnBanner === "boolean" ? { turnBanner: patch.turnBanner } : {}),
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

// A book as the shelf lists it (its names, and whether it is active here).
type ShelfBook = { id: string; name: string; title: string; active?: boolean };

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
        // An animated map: the video loops as the map (MapVideo.tsx).
        video: /\.(webm|mp4|m4v)$/i.test(scene.backgroundSrc ?? ""),
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
  const targeters = useMemo(() => targetersOf(session), [session.combat, session.map.tokens]);
  const targetLinks = useMemo(() => targetLinksOf(session), [session.combat, session.map.tokens]);
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
  // The table map whose window the GM closed: not opened again by itself (until another map is).
  const [mapHeld, setMapHeld] = useState("");

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
        // internet: players anywhere (and upnp: the router's port opened by itself).
        const internet = Boolean(command.internet || command.upnp);
        const failed = await current.host({ name: touched?.gmName || "DM", port: command.port, password: command.password, lan: true, cloud: internet, upnp: Boolean(command.upnp), campaignId: command.campaignId });
        if (failed) throw new Error(failed);
        const invite = await kraken.invite?.().catch(() => null);
        return { hosting: true, campaignId: command.campaignId, port: command.port, ...(invite ? { invite: invite.internet || invite.lan[0] || invite.local, invites: invite } : {}) };
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
        // Assets' Make it a map: the picture joins Campaign > Images (a record of the campaign's own) and opens to edit.
        if (command.action === "make") {
          const file = String(command.file ?? "");
          const book = String(command.book ?? "");
          if (!file || !book) throw new Error("Give the book and the picture's file (kraken_books contents lists a book's assets).");
          const name = command.name || file.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "Map";
          const known = Object.values(current.records).find((record) => record.type === "image" && (record.data as { file?: string; book?: string })?.file === file && (record.data as { book?: string })?.book === book);
          const id = known?.id ?? (await current.op({ op: "create", input: { type: "image", name, visibility: "gm", data: { book, file } } }));
          const opened = await live.current.openImage({ book, file, name });
          return { record: id, ...opened };
        }
        if (command.action === "preview") {
          current.visionPreview(Boolean(command.on));
          return { previewing: Boolean(command.on) };
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

  function saveView(adventure: string, sceneId: string, closed = false) {
    if (!campaignId) return;
    void window.kraken?.saveView(campaignId, { adventure, sceneId, ...(closed ? { closed } : {}) }).catch(() => undefined);
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
      forgetView(next.id);
      void publishCurrent(next);
      saveView(candidate.name, next.id);
    }
    return table;
  }

  // The books on the shelf, with which are active in this campaign.
  const shelf = async () => (await session.bookFetch<{ books: ShelfBook[] }>("list").catch(() => ({ books: [] as ShelfBook[] }))).books;

  // Put the campaign back the way the DM left it: the same adventure and scene.
  // A book's maps are read from the book itself, and only while that book is
  // active in the campaign; the campaign keeps a copy of the GM's own picture
  // or bundle alone (bundle.zip). A copy of a book's maps left there by an
  // older Kraken is removed, never shown.
  useEffect(() => {
    if (!campaignId || restored.current === campaignId) return;
    restored.current = campaignId;
    const kraken = window.kraken;
    if (!kraken) return;
    let cancel = false;
    void (async () => {
      try {
        const { view, hasBundle } = await kraken.campaignView(campaignId);
        if (cancel) return;
        const books = await shelf();
        let bytes: Uint8Array | null = null;
        if (hasBundle) {
          const kept = await kraken.campaignBundle(campaignId);
          const keptFound = kept ? inspectZip(new Uint8Array(kept)) : [];
          // An older Kraken kept a copy of a book's maps here: it goes.
          if (keptFound.some((candidate) => bookOf({ adventure: candidate.name, sceneId: "" }, books).fromBook)) await kraken.saveBundle(campaignId, null);
          else if (kept) bytes = new Uint8Array(kept);
        }
        const fromBook = view ? bookOf(view, books) : { fromBook: false, book: null };
        if (fromBook.fromBook) {
          // A book's map: from the book, while it is active; else nothing (and the view is forgotten).
          if (!fromBook.book?.active) {
            await kraken.saveView(campaignId, null).catch(() => undefined);
            return;
          }
          bytes = await session.fgMaps(fromBook.book.name);
        }
        if (!bytes || cancel) return;
        const found = inspectZip(bytes);
        if (found.length === 0 || cancel) return;
        const named = view ? found.findIndex((candidate) => candidate.name === view.adventure) : -1;
        const index = named >= 0 ? named : fromBook.fromBook ? 0 : preferredCandidateIndex(found);
        // The GM closed its window last time: it stays closed until a map is opened.
        if (view?.closed) setMapHeld(view.sceneId);
        setBusy(true);
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
      setCandidates(found);
      setAdventureIndex(index);
      const table = showAdventure(found[index]);
      // The campaign keeps the GM's own picture or bundle; a book's maps stay in the
      // book (read from it again when the campaign is hosted, while it is active).
      if (campaignId) {
        const books = await shelf();
        const ofBook = found.some((candidate) => bookOf({ adventure: candidate.name, sceneId: "" }, books).fromBook) || table.scenes.some((scene) => /^fg-/.test(scene.id));
        await window.kraken?.saveBundle(campaignId, ofBook ? null : bytes);
      }
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
    let bytes: Uint8Array;
    try {
      // A map or picture the book keeps as an image record (its walls, lights, pins).
      // By its file when the book names one (a caption need not be the record's name).
      bytes = await session.fgMaps(image.book, image.file ? "" : (image.name ?? ""), image.file ?? "");
    } catch (caught) {
      // Any other picture the book shows (a handout, a painting in its text):
      // an image of its own, its master kept by the picture itself.
      if (!image.file) throw caught;
      const response = await fetch(session.bookUrl("picture", image.book, image.file));
      if (!response.ok) throw caught;
      const raw = new Uint8Array(await response.arrayBuffer());
      const shown = await createImageBitmap(new Blob([raw as Uint8Array<ArrayBuffer>]));
      const ext = /\.[a-z0-9]+$/i.exec(image.file)?.[0] ?? ".png";
      bytes = pictureBundle(raw, `${image.name || image.file.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "Picture"}${ext}`, { width: shown.width, height: shown.height });
      shown.close();
    }
    const found = inspectZip(bytes);
    if (found.length === 0) throw new Error("That picture could not be opened.");
    for (const url of prepUrls.current) URL.revokeObjectURL(url);
    prepUrls.current = [];
    const opened = toTable(found[0].load(), prepUrls.current);
    const wanted = (image.name ?? "").toLowerCase();
    // By name when asked so; by file, the record that is the map (most walls, then lights:
    // a book often keeps a handout of the same picture beside its map).
    const byName = image.file ? null : opened.scenes.find((item) => wanted && item.name.toLowerCase() === wanted);
    const chosen = byName ?? [...opened.scenes].sort((a, b) => (b.walls?.length ?? 0) - (a.walls?.length ?? 0) || (b.lights?.length ?? 0) - (a.lights?.length ?? 0))[0];
    if (!chosen) throw new Error("That picture could not be opened.");
    const onTable = pack?.scenes[sceneIndex]?.id === chosen.id;
    if (onTable) {
      if (prep) closeImage();
      // Opened by the GM: no longer held closed.
      setMapHeld("");
      saveView(candidates[adventureIndex]?.name ?? pack?.name ?? "", chosen.id);
      mapWindow.front?.();
      return { opened: chosen.name, id: chosen.id, onTable: true };
    }
    // Opened afresh: fitted and centred in its window, not where it was last left.
    forgetView(chosen.id);
    setPrep({ scene: chosen, bytes, book: image.book });
    await session.publish(chosen, { prep: true });
    // Already the image shown (in a window minimized, or behind others): to the front again.
    mapWindow.front?.();
    return { opened: chosen.name, id: chosen.id, onTable: false };
  }
  // Map Studio on this image: its picture (as this window has it) and its master.
  async function openInStudio(shown: MapScene) {
    const kraken = window.kraken;
    if (!kraken?.studioOpenImage) throw new Error("Map Studio runs in the Maelstrom VTT app.");
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
  // The GM closed the table map's window: remembered, so hosting again does not open it.
  function closeTableMap(sceneId: string) {
    setMapHeld(sceneId);
    saveView(candidates[adventureIndex]?.name ?? pack?.name ?? "", sceneId, true);
  }
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
  // The GM's screen opens every picture in the image window; a player's keeps its viewer.
  useEffect(() => {
    imageWindow.open = dm ? (image) => live.current.openImage(image) : null;
    return () => {
      imageWindow.open = null;
    };
  }, [dm]);
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
  // The player vision preview: the GM's window draws the map as the players see it.
  const previewing = dm && Boolean(session.map.previewing);
  // The image window's bar: whose it is (the GM's alone), put in play, a play test, close.
  const imageBar =
    dm && prep ? (
      <div className="toolbar image-bar" data-image-window={prep.scene.name}>
        <strong className="adventure-name">{prep.scene.name}</strong>
        <button type="button" className="share-toggle" data-action="image-play" aria-pressed={false} title="Not shared: only you see it. Share it: it is the players' map (on their screens)" onClick={() => void playImage().catch((caught: Error) => setError(caught.message))}>
          <Icon name="eye-off" size={14} /> Not shared · Share
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
        <button type="button" data-action="image-studio" title="Open it in Map Studio: paint art, walls, doors, lights and weather; Save to Maelstrom writes them into this image" onClick={() => void openInStudio(prep.scene).catch((caught: Error) => setError(caught.message))}>
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
        <button
          type="button"
          className={session.map.sceneHidden ? "share-toggle" : "share-toggle on"}
          data-action="table-share"
          aria-pressed={!session.map.sceneHidden}
          title={session.map.sceneHidden ? "Not shared: the players see no map. Share it: it opens on their screens" : "Shared: the players see this map. Click to stop sharing it (they see no map)"}
          onClick={() => session.shareTableMap(Boolean(session.map.sceneHidden))}
        >
          <Icon name={session.map.sceneHidden ? "eye-off" : "share"} size={14} /> {session.map.sceneHidden ? "Not shared · Share" : "Shared"}
        </button>
      ) : null}
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
              <MapView scene={scene} gm={dm && !testing && !previewing} map={session.map} records={recordList} pings={session.pings} floats={session.floats} bubbles={session.bubbles} notice={session.notice} actions={mapActions} targeted={targeted} targeters={targeters} targetLinks={targetLinks} templateAsk={session.templateAsk} onTemplateDone={session.clearTemplateAsk} fxMode={session.options.tokenEffects ?? "full"} me={testing ? "@test" : myName} startEditing={dm && Boolean(prep) && !testing} gmSeat={dm} readAloud={session.readAloudNow} onReadAloudDone={session.dismissReadAloud} viewPull={session.viewPull} />
            ) : null
          }
          sceneId={scene?.id ?? ""}
          sceneName={scene?.name ?? ""}
          sceneBar={sceneBar}
          onMapClosed={prep ? closeImage : dm && tableScene ? () => closeTableMap(tableScene.id) : undefined}
          mapHeld={mapHeld}
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

// Who aims at each token, as their colours (each targeter's token ring: a player's
// chosen colour, an NPC's side): the GM is sent every creature's targets, a player
// their own creatures' (combat.cjs viewFor), so the GM sees all the aiming at once.
function targetersOf(session: ReturnType<typeof useSession>): Record<string, string[]> {
  const { entries } = session.combat;
  const tokenOf = (entry: (typeof entries)[number]) => session.map.tokens.find((token) => token.id === entry.tokenId) ?? session.map.tokens.find((token) => entry.recordId && token.recordId === entry.recordId);
  const out: Record<string, string[]> = {};
  for (const source of entries) {
    if (!source.targets?.length) continue;
    const color = tokenOf(source)?.color || "#ff5a4d";
    for (const id of source.targets) {
      const target = entries.find((entry) => entry.id === id);
      const token = target ? tokenOf(target) : null;
      if (!token) continue;
      out[token.id] = [...(out[token.id] ?? []), color];
    }
  }
  return out;
}

// Each creature's line to each of its targets (a range line), in its token's colour (the player's own).
function targetLinksOf(session: ReturnType<typeof useSession>): { from: string; to: string; color: string; ranges: { normal: number; long: number } | null }[] {
  const { entries } = session.combat;
  const tokenOf = (entry: (typeof entries)[number]) => session.map.tokens.find((token) => token.id === entry.tokenId) ?? session.map.tokens.find((token) => entry.recordId && token.recordId === entry.recordId);
  const out: { from: string; to: string; color: string; ranges: { normal: number; long: number } | null }[] = [];
  for (const source of entries) {
    const from = source.targets?.length ? tokenOf(source) : null;
    if (!from) continue;
    // Its weapons' and spells' reach, from its record when this seat may see it (a player's own, the GM's all).
    const record = source.recordId ? session.records[source.recordId] : undefined;
    const ranges = record ? rangesOf(record.data) : null;
    for (const id of source.targets) {
      const target = entries.find((entry) => entry.id === id);
      const token = target ? tokenOf(target) : null;
      if (token && token.id !== from.id) out.push({ from: from.id, to: token.id, color: from.color || "#ff5a4d", ranges });
    }
  }
  return out;
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
