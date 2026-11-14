import { useCallback, useEffect, useRef, useState } from "react";
import { dicePacks } from "../dice/dicePacks";
import type { MapScene } from "../table/MapView";
import { sound, type Soundscape } from "../sound/soundEngine";
import { diceStore, rolling, throwIntent } from "../dice/diceStore";

export type Seat = { id: string; name: string; role: "dm" | "player" };
// The map as the host shows it to this seat (electron/mapState.cjs viewFor).
export type TokenHealth = { status: string; percent: number; color: string };
export type MapToken = {
  id: string;
  recordId: string | null;
  name: string;
  x: number;
  y: number;
  squares: number;
  owner: string;
  faction: "friend" | "neutral" | "foe" | "none";
  color: string;
  hidden: boolean;
  mine: boolean;
  active?: boolean;
  health: TokenHealth | null;
  art?: string;
  video?: boolean;
  light: { name: string; bright: number; dim: number; color: string } | null;
  vision: number | null;
  seesFt: number;
  // Degrees clockwise from up; null: not turned.
  facing?: number | null;
};
// A light shining now, with its own line of sight (pixels).
export type MapLight = { id: string; x: number; y: number; brightPx: number; dimPx: number; color: string; polygon: number[] | null; animation?: string; speed?: number };
// A player's token seeing in the dark (darkvision), pixels.
export type MapSeeing = { x: number; y: number; radiusPx: number; polygon: number[] | null };
// A light placed on the scene, as the GM edits it (radii in feet).
export type SceneLightRecord = { id: string; x: number; y: number; bright: number; dim: number; color: string; on: boolean; hidden: boolean; angle?: number; rotation?: number; animation?: string; speed?: number };
export type MapSettings = {
  darkness: number | null;
  grid: { show: boolean; alpha: number | null; color: string | null; type?: "square" | "hexrow" | "hexcol" | "none" | null; size?: number | null; offsetX?: number | null; offsetY?: number | null; distance?: number | null; units?: string | null; style?: string; thickness?: number };
  weather: { type: import("../table/Weather").WeatherType; intensity: number; direction: number };
};
export type MapDoor = { id: string; group?: string; x1: number; y1: number; x2: number; y2: number; state: number; secret?: boolean; kind?: string };
// A wall in the GM's map editor (FG's kinds with Foundry's senses).
export type WallKind = "wall" | "terrain" | "door" | "secret" | "toggle" | "window" | "illusion" | "invisible" | "ethereal" | "shadow" | "custom";
export type EditWall = { id: string; x1: number; y1: number; x2: number; y2: number; kind: WallKind; sight: number; light: number; sound: number; move: number; dir: number; door: number; ds: number; toggle: "none" | "gm" | "players"; threshold: number | null; hidden: boolean; group?: string };
export type TableMap = {
  sceneId: string | null;
  // The GM's: the image open privately in the image window (its scene id), whether a play test runs,
  // whether the player vision preview is on, and whether the table map is held back from the players.
  prep?: string | null;
  testing?: boolean;
  previewing?: boolean;
  sceneHidden?: boolean;
  tokens: MapToken[];
  doors: MapDoor[];
  vision: number[][] | null;
  sight: boolean;
  locked: boolean;
  darkness: number;
  lights: MapLight[];
  seeing: MapSeeing[];
  // This player's tokens have twilight vision (C&C elves).
  twilight?: boolean;
  // This player's tokens whose darkvision a bright light spoils now (C&C).
  spoiled?: string[];
  sceneLights: SceneLightRecord[];
  settings: MapSettings;
  drawings?: MapDrawing[];
  // Where creatures died (FG's death markers): drawn under the tokens, for everyone.
  deathMarkers?: DeathMarker[];
  // The GM's: the scene's walls as the table keeps them.
  walls?: EditWall[];
  // FG's mask: on, and the shapes that reveal or hide again, in order.
  mask?: MapMask | null;
  labels?: MapLabel[];
  groups?: MapGroup[];
  fx?: MapFx[];
  tiles?: MapTile[];
};
// An image layer (FG's image layers, Foundry's tiles): url is where this seat loads it.
export type MapTile = { id: string; name: string; src: string; url: string; x: number; y: number; width: number; height: number; rotation: number; alpha: number; flipX: boolean; flipY: boolean; level: "below" | "above"; hidden: boolean; locked?: boolean; group: string };
// Text on the map (FG's text layers): labels, numbers, pins.
export type MapLabel = { id: string; x: number; y: number; text: string; font: string; size: number; color: string; rotation: number; anchor: string; outline: { width: number; color: string }; shadow: { offset: number; blur: number; color: string }; hidden: boolean; group: string; number: number | null; icon: string; link: { kind: string; id: string } | null };
export type MapGroup = { name: string; shown?: boolean; players?: boolean; locked?: boolean; nextNumber?: number; prefix?: string };
export type LibraryItem = { path: string; name: string; category: string; npcs?: string; summary?: string; html?: string; file?: string; map?: boolean };
export type MapMask = { on: boolean; shapes: { id: string; mode: "reveal" | "hide"; points: number[] }[] };
export type Ping = { id: number; x: number; y: number; from: string; color: string };
// A line drawn on the map, for everyone (by "" is the GM's).
export type CalendarNote = { id: string; year: number; day: number; by: string; color: string | null; text: string; shown: boolean; at: number };
export type CalendarView = { id: string; year: number; day: number; hour: number; minute: number; today: string; calendars: { id: string; name: string }[]; notes: CalendarNote[] };
export type DeathMarker = { id: string; x: number; y: number; set: string; variant: number; rotation: number; size: number; name: string };
export type MapDrawing = { id: string; by: string; color: string; width: number; points: number[]; shape?: "line" | "arrow" | "rect" | "ellipse" | "circle" | "cone" | "poly"; fill?: string; fillAlpha?: number; alpha?: number; group?: string };
// An FX layer (FG's FX tab).
export type MapFx = { id: string; name: string; type: import("../table/Weather").WeatherType; amount: number; intensity: number; speed: number; direction: number; mask: { use: boolean; mode: "inside" | "outside"; polygons: number[][]; strokes?: { width: number; points: number[] }[]; soft?: number }; group: string; players: boolean; shown: boolean };
const EMPTY_MAP: TableMap = { sceneId: null, tokens: [], doors: [], vision: null,
  sight: false,
  locked: false,
  darkness: 0,
  lights: [],
  seeing: [],
  sceneLights: [],
  settings: { darkness: null, grid: { show: true, alpha: null, color: null }, weather: { type: "none", intensity: 0.5, direction: 250 } },
};
export type RollTerm =
  | { kind: "number"; sign: number; value: number }
  | { kind: "dice"; sign: number; count: number; sides: number; rolls: number[]; kept: boolean[]; sum: number };
export type RollResult = { formula: string; label: string; total: number; terms: RollTerm[]; tag?: string; result?: string; target?: string; against?: number; by?: string };
// kind: what the line is (FG's chat commands): said, an emote, an action, out of character, the GM's story, a mood.
export type ChatKind = "say" | "emote" | "action" | "ooc" | "story" | "mood" | "readaloud";
export type ChatVote = { id: string; question: string; yes: string[]; no: string[] };
export type ChatLine = {
  id: string;
  from: string;
  text: string;
  at: number;
  roll?: RollResult;
  secret?: boolean;
  shownTo?: string;
  tower?: boolean;
  gm?: boolean;
  kind?: ChatKind;
  mood?: string;
  to?: string[];
  self?: boolean;
  vote?: ChatVote;
  // Shown on this screen only (/help, /info): never sent.
  local?: boolean;
  // Read aloud: where the words are from (a page, a story).
  title?: string;
};
// The GM's read-aloud, shown over the map as a speech bubble for everyone.
export type ReadAloud = { text: string; title: string; at: number };
// Who sees a roll (Foundry's roll modes): everyone, the GM and you, the GM alone, you alone.
export type RollMode = "public" | "gm" | "blind" | "self";
export type ChatSend = { kind?: ChatKind; mood?: string; to?: string[]; as?: string };
// The table's own options, set by the GM (electron/tableServer.cjs savedOptions).
export type SoundTrigger = { id: string; name: string; on: string; match: string; result: string; sound: string; enabled: boolean };
// Books (FG's Library): what the GM has shared, and the pictures shown to the players.
export type ShownImage = { id: string; book: string; file: string; name: string; at: number };
export type BookShelf = { active: string[]; shared: string[]; images: ShownImage[] };
export type BookInfo = { id: string; name: string; title: string; category: string; ruleset: string; author: string; hasBook: boolean; cover: string; adventure: boolean; forPlayers: boolean; active: boolean; shared: boolean; pack?: boolean };
export type BookPageRef = { id: string; name: string; keywords: string };
export type BookContents = BookInfo & { chapters: { name: string; sections: { name: string; pages: BookPageRef[] }[] }[]; pictures: { name: string; category: string; file: string }[]; assets?: string[] };
export type BookBlock = { kind: "text"; html: string; frame?: string } | { kind: "picture"; file: string; caption: string; align: string; scale: number; name: string };
export type BookPage = { book: string; id: string; name: string; blocks: BookBlock[] };
// A quick slot: something kept at hand, opened with a click.
// The sounds the GM keeps in a book page: bound to its sound links (by the
// link's key), and dropped in between its paragraphs (after block; -1 the top).
export type BookSoundRef = { sound: string; kind: string; label: string };
export type PageSounds = { links: Record<string, BookSoundRef>; blocks: (BookSoundRef & { block: number; id: string })[] };
// A link: anything that can be clicked or dragged in Kraken, and dropped on a
// quick slot, into a note or a story: a book (at a page), a picture or map,
// a character's sheet, a sound, a note.
export type QuickSlot =
  | { kind: "book"; book: string; page?: string; label: string }
  | { kind: "picture"; book: string; file: string; label: string }
  | { kind: "sheet"; record: string; label: string }
  | { kind: "sound"; sound: string; soundKind: string; label: string }
  | { kind: "note"; record: string; label: string }
  // A record in the campaign's lists (an NPC, an item, a spell...).
  | { kind: "record"; record: string; label: string }
  // Dice held in the hand (3d6, 1d20+2): rolled with a click.
  | { kind: "dice"; formula: string; label: string }
  // A chat line run again with a click (/roll 4d6k3, /emote ..., or words said).
  | { kind: "macro"; text: string; label: string };
export type KrakenLink = QuickSlot;
export type SoundItem = { id: string; kind: string; group: string; name: string };
export type SoundLibrary = { sounds: SoundItem[]; groups: { id: string; count: number }[]; folder: string; triggers?: SoundTrigger[] };
export type TableOptions = { towerReveal: boolean; towerExternal?: boolean; towerStyle?: string; deathMarkers?: { on: boolean; default: string; byType: Record<string, string> }; motd?: { text: string; links: QuickSlot[] }; decal: string; wallpaper: string; gmIcon: string; soundHidden: "off" | "combat" | "all"; soundRepeat: number; diceHold?: number; wizard35?: Wizard35Options; wizard2e?: Wizard2eOptions };
// The D&D 3.5E character wizard's options (the GM's, as FG's KrakenCharWizard35E).
export type Wizard35Options = { methods: number[]; rollLock: boolean; lowReroll: boolean; vault: boolean };
// The AD&D 2E character wizard's options (the GM's): ability rolls once only, the PHB methods allowed, gold above 1st level.
export type Wizard2eOptions = { rollLock: boolean; methods: number[]; gold: "phb" | "perlevel" | "xlevel" };
export type DecalItem = { id: string; name: string; group: string; ruleset?: string };
export type PictureKind = "decal" | "wallpaper" | "gmicon" | "tile" | "tower";
// The combat tracker as the host shows it to this seat (electron/combat.cjs viewFor).
// A character's face as everyone is told it (FG's character list).
// A player's account as the GM is shown it (never a password).
export type PlayerAccount = { name: string; createdAt: number; seenAt: number | null; devices: number; seated: boolean };
export type RosterEntry = { id: string; name: string; owner: string; online: boolean; portrait: string | null; species: string; classes: string; level: number };

export type CombatEntry = {
  // 5E: death saves of a Dying character.
  deathsaves?: { success: number; failure: number };
  id: string;
  recordId: string | null;
  tokenId: string | null;
  name: string;
  faction: "friend" | "neutral" | "foe";
  initresult: number;
  init?: number;
  hidden: boolean;
  owner: string;
  mine: boolean;
  health: TokenHealth;
  hp?: number;
  wounds?: number;
  temp?: number;
  ac?: number;
  effects: { id: string; label: string; duration: number }[];
  targets: string[];
  attacks?: { key: string; name: string; bonus: number; bonuses?: number[]; thaco?: number; damage: string }[];
  /** AD&D 2E and Basic Fantasy: the level this character turns undead at. */
  turns?: number;
  /** Basic Fantasy: a monster's morale score (the GM's view). */
  morale?: number;
  /** A starship (the 2d6 games): its weapons and who mans them. */
  ship?: { record: string; thrust: number; criticals: Record<string, number>; weapons: { key: string; name: string; damage: string; range: string; gunner: string; gunnerName: string; mine: boolean; disabled: boolean }[] };
  powers?: { key: string; name: string; uses: number; used: number; damage: string; save: string }[];
  /** Cairn: STR now and its maximum, a detachment, a lost first turn. */
  cairn?: { str: number; max: number; detachment: number; lostTurn: number };
};
export type CombatView = { round: number; active: string | null; entries: CombatEntry[] };
export type TableRecord = {
  id: string;
  type: string;
  name: string;
  owner: string;
  visibility: "gm" | "owner" | "all";
  // The book (module) it came from, if any.
  source?: string;
  data: Record<string, unknown>;
  updatedAt: number;
};
export type RecordInput = { type: string; name?: string; owner?: string; visibility?: TableRecord["visibility"]; data?: unknown; id?: string };
export type RecordPatch = { name?: string; owner?: string; visibility?: TableRecord["visibility"]; data?: unknown };
export type HostInfo = {
  port: number;
  addresses: string[];
  v6: string[];
  externalV4: string;
  externalV6: string;
  password: string;
  publicGame: boolean;
  lan: boolean;
  cloud: boolean;
  campaignId: string;
};

type NetScene = {
  id: string;
  name: string;
  width: number;
  height: number;
  padding: number;
  backgroundColor: string;
  grid: MapScene["grid"];
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  anchorX?: number;
  anchorY?: number;
  fit?: MapScene["fit"];
  lights: MapScene["lights"];
  image: string | null;
};

// account: the player's account at that table (its password, or the token this browser kept).
type JoinMessage = { name: string; password: string; hostToken?: string; account?: { password?: string; token?: string } };

// A browser stays signed in to a table's account: the name and the token the
// host gave, kept per table (address:port). Never the password.
export type SignIn = { name: string; token: string };
const signInKey = (table: string) => `kraken-signin:${table.toLowerCase()}`;
export function savedSignIn(table: string): SignIn | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(signInKey(table)) ?? "null") as SignIn | null;
    return saved && typeof saved.name === "string" && typeof saved.token === "string" ? saved : null;
  } catch {
    return null;
  }
}
export function forgetSignIn(table: string) {
  try {
    window.localStorage.removeItem(signInKey(table));
  } catch {
    /* nothing kept */
  }
}
function keepSignIn(table: string, signIn: SignIn) {
  try {
    window.localStorage.setItem(signInKey(table), JSON.stringify(signIn));
  } catch {
    /* this browser keeps nothing: the password is asked each time */
  }
}

function endpoint(address: string, port: number, scheme: "ws" | "http"): string {
  const host = address.includes(":") && !address.startsWith("[") ? `[${address}]` : address;
  return `${scheme}://${host}:${port}`;
}

export function cleanAddress(value: string): string {
  return value
    .trim()
    .replace(/^wss?:\/\//i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function toPlayerScene(payload: NetScene, origin: string): MapScene {
  return {
    id: payload.id,
    name: payload.name,
    width: payload.width,
    height: payload.height,
    padding: payload.padding,
    backgroundColor: payload.backgroundColor,
    grid: payload.grid,
    imageUrl: payload.image ? `${origin}${payload.image}` : null,
    offsetX: payload.offsetX,
    offsetY: payload.offsetY,
    scaleX: payload.scaleX,
    scaleY: payload.scaleY,
    anchorX: payload.anchorX ?? 0,
    anchorY: payload.anchorY ?? 0,
    fit: payload.fit ?? "fill",
    walls: [],
    darkness: 0,
    lights: payload.lights ?? [],
    markers: [],
    regions: [],
    tokens: [],
  };
}

function checkPort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port must be from 1 to 65535.");
}

function plainError(caught: unknown, fallback: string): string {
  const message = caught instanceof Error ? caught.message : fallback;
  const cut = message.split(": Error: ").pop()?.trim();
  return cut || fallback;
}

export function useSession() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [role, setRole] = useState<"dm" | "player" | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [hostInfo, setHostInfo] = useState<HostInfo | null>(null);
  const [remoteLabel, setRemoteLabel] = useState("");
  const [players, setPlayers] = useState<Seat[]>([]);
  // FG's character list: every character at the table (the portrait bar, Character Selection).
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  // The GM's: players' accounts, and what the last account action said.
  const [accounts, setAccounts] = useState<{ list: PlayerAccount[]; note: string; error: string }>({ list: [], note: "", error: "" });
  const [map, setMap] = useState<TableMap>(EMPTY_MAP);
  const [party, setParty] = useState<import("../party/PartySheet").PartyView | null>(null);
  const [krits, setKrits] = useState<Record<string, string> | null>(null);
  // FG's Library lists, as the host sends them (module|kind -> items).
  const [library, setLibrary] = useState<Record<string, LibraryItem[]>>({});
  const [combat, setCombat] = useState<CombatView>({ round: 0, active: null, entries: [] });
  // The campaign's calendar: today, the time, and the notes this seat may read.
  const [calendar, setCalendar] = useState<CalendarView | null>(null);
  const [readAloudNow, setReadAloudNow] = useState<ReadAloud | null>(null);
  const [soundscape, setSoundscape] = useState<Soundscape>({ ambience: [], music: null });
  // The campaign's ruleset ("Castles & Crusades", "D&D 5E", "Worldbuilding"): it picks the sheet.
  const [ruleset, setRuleset] = useState("");
  // The GM's: the open scene's own sound, if it has one.
  const [sceneSound, setSceneSound] = useState<{ sceneId: string | null; kept: Soundscape | null }>({ sceneId: null, kept: null });
  const [bookSounds, setBookSounds] = useState<Record<string, PageSounds>>({});
  const [quickSlots, setQuickSlotsState] = useState<(QuickSlot | null)[]>(Array(10).fill(null));
  const [bookShelf, setBookShelf] = useState<BookShelf>({ active: [], shared: [], images: [] });
  // The last picture the GM showed the players (a player's screen opens it).
  const [imageShown, setImageShown] = useState<{ id: string; at: number } | null>(null);
  const [soundTriggers, setSoundTriggers] = useState<SoundTrigger[]>([]);
  const [options, setOptions] = useState<TableOptions>({ towerReveal: false, decal: "kraken", wallpaper: "", gmIcon: "", soundHidden: "combat", soundRepeat: 1 });
  const [pings, setPings] = useState<Ping[]>([]);
  // How many times the GM has shared the map (each one opens the map window).
  const [mapShared, setMapShared] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playerScene, setPlayerScene] = useState<MapScene | null>(null);
  const [records, setRecords] = useState<Record<string, TableRecord>>({});
  const opWaits = useRef(new Map<number, { resolve: (id: string, payload?: unknown) => void; reject: (error: Error) => void }>());
  const opCounter = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const generation = useRef(0);
  const roleRef = useRef(role);
  const playersRef = useRef(players);
  const pingCounter = useRef(0);
  const assetRef = useRef("");
  const originRef = useRef("");
  const intentional = useRef(false);
  const stateRef = useRef({ role, selfId, players, map, chat, playerScene, records });
  roleRef.current = role;
  playersRef.current = players;
  stateRef.current = { role, selfId, players, map, chat, playerScene, records };

  const applyMap = useCallback((next: TableMap | undefined) => {
    if (!next || typeof next !== "object") {
      setMap(EMPTY_MAP);
      return;
    }
    // Token pictures are served by the host, under this seat's asset token.
    const tokens = (next.tokens ?? []).map((token) => (token.art && token.art.startsWith("/") ? { ...token, art: `${originRef.current}${token.art}` } : token));
    const tiles = (next.tiles ?? []).map((tile) => (tile.url && tile.url.startsWith("/") ? { ...tile, url: `${originRef.current}${tile.url}` } : tile));
    setMap({ ...EMPTY_MAP, ...next, tokens, tiles });
  }, []);

  const reset = useCallback(() => {
    setConnected(false);
    setConnecting(false);
    setRole(null);
    setSelfId(null);
    setPlayers([]);
    setRoster([]);
    setMap(EMPTY_MAP);
    setParty(null);
    setCombat({ round: 0, active: null, entries: [] });
    setPings([]);
    setChat([]);
    setPlayerScene(null);
    setRecords({});
    for (const wait of opWaits.current.values()) wait.reject(new Error("The table closed."));
    opWaits.current.clear();
    setHostInfo(null);
    setRemoteLabel("");
    roleRef.current = null;
  }, []);

  const connect = useCallback(
    (url: string, join: JoinMessage, label: string, origin: string) => {
      intentional.current = false;
      const gen = ++generation.current;
      originRef.current = origin;
      return new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url);
        socketRef.current = socket;
        let settled = false;
        let opened = false;
        // Why the host sent this seat away (kicked, signed in elsewhere): kept past the close.
        let sentAway = "";
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.close();
          reject(new Error(`No table answered at ${label} in time. Check that the GM has pressed Play and that the address and port match. From another computer, the GM's firewall must allow Kraken VTT.`));
        }, 8000);

        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          intentional.current = true;
          window.clearTimeout(timer);
          socket.close();
          reject(new Error(message));
        };

        socket.onmessage = (event) => {
          if (generation.current !== gen) return;
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          } catch {
            return;
          }
          if (msg.type === "no") {
            // The account would not take this browser's token (a new password, signed out elsewhere): forget it.
            if (msg.account === "password") forgetSignIn(label);
            fail(typeof msg.reason === "string" ? msg.reason : "Wrong password.");
            return;
          }
          if (msg.type === "ok" && !settled) {
            settled = true;
            window.clearTimeout(timer);
            const you = msg.you as Seat & { assetToken?: string; accountToken?: string };
            // Signed in: this browser keeps the token, not the password.
            if (you.accountToken) keepSignIn(label, { name: you.name, token: you.accountToken });
            assetRef.current = you.assetToken ?? "";
            // Sounds come from the host, for this seat.
            sound.setSource((id) => `${originRef.current}/sound/file?token=${assetRef.current}&id=${encodeURIComponent(id)}`);
            // The GM's dice packs (Documents/Kraken VTT/Dice): more sets for this seat to choose from.
            void dicePacks.connect(originRef.current, assetRef.current);
            setRuleset(typeof msg.ruleset === "string" ? msg.ruleset : "");
            if (msg.sceneSound && typeof msg.sceneSound === "object") setSceneSound(msg.sceneSound as { sceneId: string | null; kept: Soundscape | null });
            if (msg.soundscape) {
              setSoundscape(msg.soundscape as Soundscape);
              void sound.setScape(msg.soundscape as Soundscape);
            }
            roleRef.current = you.role;
            setRole(you.role);
            setSelfId(you.id);
            setPlayers((msg.players as Seat[]) ?? []);
            setRoster(Array.isArray(msg.roster) ? (msg.roster as RosterEntry[]) : []);
            applyMap(msg.map as TableMap);
            if (msg.combat) setCombat(msg.combat as CombatView);
            if (msg.calendar) setCalendar(msg.calendar as CalendarView);
            // A new table: no read-aloud left over from the last.
            setReadAloudNow(null);
            if (msg.options) setOptions(msg.options as TableOptions);
            setChat((msg.chat as ChatLine[]) ?? []);
            if (msg.books) setBookShelf(msg.books as BookShelf);
            if (Array.isArray(msg.quickSlots)) setQuickSlotsState(msg.quickSlots as (QuickSlot | null)[]);
            // This person's own settings (their colour and dice), kept by the GM's app.
            diceStore.connect((patch) => {
              const open = socketRef.current;
              if (open && open.readyState === WebSocket.OPEN) open.send(JSON.stringify({ type: "prefs", patch }));
            }, msg.prefs);
            if (msg.bookSounds && typeof msg.bookSounds === "object") setBookSounds(msg.bookSounds as Record<string, PageSounds>);
            setRecords(Object.fromEntries(((msg.records as TableRecord[]) ?? []).map((record) => [record.id, record])));
            setRemoteLabel(label);
            setPlayerScene(you.role === "player" && msg.scene ? toPlayerScene(msg.scene as NetScene, origin) : null);
            setConnected(true);
            setError(null);
            resolve();
            return;
          }
          if (msg.type === "players") setPlayers((msg.players as Seat[]) ?? []);
          if (msg.type === "roster" && Array.isArray(msg.roster)) setRoster(msg.roster as RosterEntry[]);
          if (msg.type === "accounts") setAccounts({ list: Array.isArray(msg.accounts) ? (msg.accounts as PlayerAccount[]) : [], note: typeof msg.done === "string" ? msg.done : "", error: typeof msg.error === "string" ? msg.error : "" });
          if (msg.type === "map") applyMap(msg as unknown as TableMap);
          if (msg.type === "library" && Array.isArray(msg.items)) setLibrary((current) => ({ ...current, [`${msg.module}|${msg.kind}`]: msg.items as LibraryItem[] }));
          if (msg.type === "krits" && msg.settings) setKrits(msg.settings as Record<string, string>);
          if (msg.type === "party" && msg.party) setParty(msg.party as import("../party/PartySheet").PartyView);
          if (msg.type === "combat" && msg.combat) setCombat(msg.combat as CombatView);
          if (msg.type === "calendar" && msg.calendar) setCalendar(msg.calendar as CalendarView);
          if (msg.type === "read-aloud" && typeof msg.text === "string") setReadAloudNow({ text: msg.text, title: String(msg.title ?? ""), at: Date.now() });
          if (msg.type === "options" && msg.options) setOptions(msg.options as TableOptions);
          if (msg.type === "map-share") setMapShared((count) => count + 1);
          if (msg.type === "ping") {
            const ping = { id: ++pingCounter.current, x: Number(msg.x), y: Number(msg.y), from: String(msg.from ?? ""), color: String(msg.color ?? "#fff") };
            setPings((current) => [...current, ping].slice(-12));
            window.setTimeout(() => setPings((current) => current.filter((item) => item.id !== ping.id)), 4200);
          }
          if (msg.type === "notice" && typeof msg.text === "string") {
            const text = msg.text;
            setNotice(text);
            window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 2500);
          }
          if (msg.type === "vote" && typeof msg.id === "string") {
            const id = msg.id;
            setChat((current) => current.map((line) => (line.vote?.id === id ? { ...line, vote: { ...line.vote, yes: (msg.yes as string[]) ?? [], no: (msg.no as string[]) ?? [] } } : line)));
          }
          if (msg.type === "sound" && typeof msg.id === "string") void sound.play(msg.id, (msg.kind as "oneshots" | "sfx") ?? "sfx", Number(msg.volume ?? 1));
          if (msg.type === "sound-stop") {
            if (typeof msg.id === "string") sound.stop(msg.id);
            else sound.stopAll();
          }
          if (msg.type === "scene-sound") setSceneSound({ sceneId: typeof msg.sceneId === "string" ? msg.sceneId : null, kept: (msg.kept as Soundscape | null) ?? null });
          if (msg.type === "soundscape" && msg.soundscape) {
            setSoundscape(msg.soundscape as Soundscape);
            void sound.setScape(msg.soundscape as Soundscape);
          }
          if (msg.type === "sound-triggers" && Array.isArray(msg.triggers)) setSoundTriggers(msg.triggers as SoundTrigger[]);
          if (msg.type === "kicked") {
            sentAway = String(msg.reason ?? "The GM has asked you to leave the table.");
            setError(sentAway);
          }
          if (msg.type === "books") setBookShelf({ active: (msg.active as string[]) ?? [], shared: (msg.shared as string[]) ?? [], images: (msg.images as ShownImage[]) ?? [] });
          if (msg.type === "image-shown" && typeof msg.id === "string") setImageShown({ id: msg.id, at: Date.now() });
          if (msg.type === "book-sounds" && msg.sounds && typeof msg.sounds === "object") setBookSounds(msg.sounds as Record<string, PageSounds>);
          if (msg.type === "prefs") diceStore.adopt(msg.prefs);
          if (msg.type === "quickslots" && Array.isArray(msg.slots)) setQuickSlotsState(msg.slots as (QuickSlot | null)[]);
          if (msg.type === "chat-cleared") {
            setChat([]);
            return;
          }
          if (msg.type === "chat") {
            const line = msg as unknown as ChatLine;
            // Its dice are thrown first; its card waits for them to land.
            rolling.arrived(line);
            // Its triggered sound plays as its result shows.
            sound.lineArrived(line);
            setChat((current) => [...current, line].slice(-1000));
          }
          if (msg.type === "record" && msg.record) {
            const record = msg.record as TableRecord;
            setRecords((current) => ({ ...current, [record.id]: record }));
          }
          if (msg.type === "record-gone" && typeof msg.id === "string") {
            const gone = msg.id;
            setRecords((current) => {
              const next = { ...current };
              delete next[gone];
              return next;
            });
          }
          if (msg.type === "op-result" && typeof msg.req === "number") {
            const wait = opWaits.current.get(msg.req);
            opWaits.current.delete(msg.req);
            if (wait && msg.ok) wait.resolve(String(msg.id ?? ""), msg);
            else if (wait) wait.reject(new Error(typeof msg.error === "string" ? msg.error : "Not allowed."));
          }
          if (msg.type === "error" && typeof msg.reason === "string") setError(msg.reason);
          if (msg.type === "scene" && roleRef.current === "player") {
            // No scene: the GM stopped sharing the map (or none is up): the player has no map.
            setPlayerScene(msg.scene ? toPlayerScene(msg.scene as NetScene, originRef.current) : null);
          }
        };

        socket.onclose = () => {
          if (!settled) {
            // Never opened: nothing answered there. Opened, then closed: the table turned us away.
            fail(
              opened
                ? "The table closed the connection before you were seated. Try again."
                : `No table answered at ${label}. Check that the GM has pressed Play and that the address and port match. From another computer, the GM's firewall must allow Kraken VTT.`,
            );
            return;
          }
          if (generation.current !== gen || intentional.current) return;
          setError(sentAway || "The table closed.");
          reset();
        };

        socket.onopen = () => {
          opened = true;
          socket.send(JSON.stringify({ type: "join", name: join.name, password: join.password, hostToken: join.hostToken, ...(join.account ? { account: join.account } : {}) }));
        };
      });
    },
    [applyMap, reset],
  );

  const leave = useCallback((force = false) => {
    if (!force && roleRef.current === "dm" && playersRef.current.some((seat) => seat.role === "player")) {
      const confirmed = window.confirm("Close the table? Players will be disconnected.");
      if (!confirmed) return;
    }
    intentional.current = true;
    generation.current += 1;
    const wasDm = roleRef.current === "dm";
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    setError(null);
    reset();
    if (wasDm) void window.kraken?.stopHost();
  }, [reset]);

  // A player signs this browser out of their account at this table and leaves:
  // the host forgets this browser's token; the password is needed next time.
  const signOut = useCallback(() => {
    const table = remoteLabel;
    const kept = table ? savedSignIn(table) : null;
    const socket = socketRef.current;
    if (kept && socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "sign-out", token: kept.token }));
    if (table) forgetSignIn(table);
    window.setTimeout(() => leave(true), 150);
  }, [remoteLabel, leave]);

  const host = useCallback(
    async (input: { name: string; port: number; password: string; lan: boolean; cloud: boolean; campaignId: string }) => {
      setConnecting(true);
      setError(null);
      let started = false;
      try {
        if (!window.kraken) throw new Error("Hosting runs in the Kraken VTT app.");
        checkPort(input.port);
        if (!input.lan && !input.cloud) throw new Error("Turn on LAN or Internet.");
        const password = input.password.trim();
        const info = await window.kraken.startHost({
          port: input.port,
          password,
          lan: input.lan,
          cloud: input.cloud,
          campaignId: input.campaignId,
        });
        started = true;
        setHostInfo({
          port: info.port,
          addresses: info.addresses,
          v6: info.v6 ?? [],
          externalV4: info.externalV4 ?? "",
          externalV6: info.externalV6 ?? "",
          password,
          publicGame: password.length === 0,
          lan: input.lan,
          cloud: input.cloud,
          campaignId: input.campaignId,
        });
        await connect(
          endpoint("127.0.0.1", info.port, "ws"),
          { name: input.name, password, hostToken: info.hostToken },
          `127.0.0.1:${info.port}`,
          endpoint("127.0.0.1", info.port, "http"),
        );
        return null;
      } catch (caught) {
        if (started) await window.kraken?.stopHost().catch(() => undefined);
        setHostInfo(null);
        const message = plainError(caught, "Could not host.");
        setError(message);
        return message;
      } finally {
        setConnecting(false);
      }
    },
    [connect],
  );

  const join = useCallback(
    async (input: { name: string; address: string; port: number; password: string; accountPassword?: string }) => {
      setConnecting(true);
      setError(null);
      try {
        const address = cleanAddress(input.address);
        checkPort(input.port);
        if (!address) throw new Error("Enter the DM's address.");
        // This browser's sign-in at that table, when it is the same name.
        const kept = savedSignIn(`${address}:${input.port}`);
        const token = kept && kept.name.toLowerCase() === input.name.trim().toLowerCase() ? kept.token : "";
        const account = input.accountPassword || token ? { ...(input.accountPassword ? { password: input.accountPassword } : {}), ...(token ? { token } : {}) } : undefined;
        await connect(
          endpoint(address, input.port, "ws"),
          { name: input.name, password: input.password, account },
          `${address}:${input.port}`,
          endpoint(address, input.port, "http"),
        );
        return true;
      } catch (caught) {
        setError(plainError(caught, "Could not join."));
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [connect],
  );

  // An image put on the table, or (prep) opened in the GM's image window alone:
  // the same master either way (its walls, lights and paint kept by its id).
  const publish = useCallback(async (scene: MapScene, options: { prep?: boolean } = {}) => {
    const socket = socketRef.current;
    if (!window.kraken || roleRef.current !== "dm" || !socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("The table is not hosting.");
    }
    try {
      // The players' picture stays the table's while the GM works on another image.
      if (options.prep) {
        /* the GM's window draws its own picture */
      } else if (scene.imageUrl) {
        const response = await fetch(scene.imageUrl);
        if (!response.ok) throw new Error("Could not read the map image.");
        const bytes = await response.arrayBuffer();
        const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        await window.kraken.setSceneImage(bytes, mime);
      } else {
        await window.kraken.setSceneImage(new ArrayBuffer(0), "");
      }
    } catch (caught) {
      throw new Error(plainError(caught, "Could not share the map image."));
    }
    const tokens = scene.tokens.map((token) => ({
      id: token.id,
      name: token.name,
      x: token.x,
      y: token.y,
      width: token.width,
      height: token.height,
      disposition: token.disposition,
      hidden: token.hidden,
    }));
    try {
      const art: { id: string; bytes: ArrayBuffer; mime: string }[] = [];
      for (const token of scene.tokens) {
        if (!token.imageUrl) continue;
        const response = await fetch(token.imageUrl);
        if (response.ok) art.push({ id: token.id, bytes: await response.arrayBuffer(), mime: response.headers.get("content-type")?.split(";")[0] || "image/png" });
      }
      await window.kraken.setTokenArt(art);
    } catch {
      /* Token pictures are optional: players then see initials. */
    }
    // A bundle's tiles: their pictures into the tile library, then placed by the host (once per scene).
    const tiles: Record<string, unknown>[] = [];
    for (const tile of scene.tiles ?? []) {
      if (!tile.image) continue;
      try {
        const made = await window.kraken.addDecal(tile.src.split("/").pop() || "tile.webp", tile.image, "tile");
        const { image: _image, src: _src, ...rest } = tile;
        tiles.push({ ...rest, src: made.id });
      } catch {
        /* a picture the library refuses is left off */
      }
    }
    socket.send(
      JSON.stringify({
        type: "scene",
        ...(options.prep ? { prep: true } : {}),
        scene: {
          ...(tiles.length ? { tiles } : {}),
          id: scene.id,
          name: scene.name,
          width: scene.width,
          height: scene.height,
          padding: scene.padding,
          backgroundColor: scene.backgroundColor,
          grid: scene.grid,
          offsetX: scene.offsetX,
          offsetY: scene.offsetY,
          scaleX: scene.scaleX,
          scaleY: scene.scaleY,
          anchorX: scene.anchorX,
          anchorY: scene.anchorY,
          fit: scene.fit,
          lights: scene.lights,
          darkness: scene.darkness,
          tokens,
          walls: scene.walls,
        },
      }),
    );
  }, []);

  // tag comes back on the roll in chat, so a caller can wait for its own roll.
  // tower: FG's dice tower, a roll only the GM sees.
  const roll = useCallback((formula: string, label = "", tag = "", tower = false, mode: RollMode = "public", as = "") => {
    const socket = socketRef.current;
    if (!formula.trim() || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "roll",
        formula: formula.trim().slice(0, 200),
        label: label.slice(0, 120),
        ...(tag ? { tag } : {}),
        ...(tower ? { tower: true } : {}),
        ...(mode !== "public" ? { mode } : {}),
        ...(as ? { as } : {}),
        ...throwIntent(),
      }),
    );
  }, []);

  // The creation wizard's character: the host builds it and answers with its id.
  const buildCharacter = useCallback((spec: unknown, owner = "") => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    const req = ++opCounter.current;
    return new Promise<string>((resolve, reject) => {
      opWaits.current.set(req, { resolve, reject });
      socket.send(JSON.stringify({ type: "build-character", req, spec, owner }));
    });
  }, []);

  // Traveller's character wizard (the GM's KrakenCharWizardMGT2, run on the host): start, call its steps, build.
  const lifeAction = useCallback((body: { action: "start" | "view" | "call" | "details" | "build" | "cancel"; name?: string; fn?: string; args?: unknown[]; build?: unknown }) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    const req = ++opCounter.current;
    return new Promise<{ id: string; life: unknown }>((resolve, reject) => {
      opWaits.current.set(req, { resolve: (id, payload) => resolve({ id, life: (payload as { life?: unknown } | undefined)?.life ?? null }), reject });
      socket.send(JSON.stringify({ type: "mgt2-life", req, ...body }));
    });
  }, []);

  // Starships (the 2d6 games): the GM makes one from a design; its sheet's edits (a player takes a station).
  const shipAction = useCallback((body: { action: "create"; name: string; design: string } | { action: "edit"; id: string; changes: { path: string; value: unknown }[] }) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    const req = ++opCounter.current;
    return new Promise<string>((resolve, reject) => {
      opWaits.current.set(req, { resolve, reject });
      socket.send(JSON.stringify({ type: "starship", req, ...body }));
    });
  }, []);

  // The GM's account controls: list, create (name, password), password (a new one), remove.
  const accountAction = useCallback((input: { action: "list" | "create" | "password" | "remove"; name?: string; password?: string }) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "accounts", ...input }));
  }, []);

  // FG's Character Selection: take a character no one holds; it becomes this seat's.
  const takeCharacter = useCallback((id: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    const req = ++opCounter.current;
    return new Promise<string>((resolve, reject) => {
      opWaits.current.set(req, { resolve, reject });
      socket.send(JSON.stringify({ type: "take-character", req, id }));
    });
  }, []);

  // A character file from another table (Kraken, FG, Foundry, Roll20): the host reads it.
  const importCharacter = useCallback((text: string, owner = "") => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    const req = ++opCounter.current;
    return new Promise<string>((resolve, reject) => {
      opWaits.current.set(req, { resolve, reject });
      socket.send(JSON.stringify({ type: "character-import", req, text, owner }));
    });
  }, []);

  // Record changes go to the host, which answers with the record's id or why not.
  const op = useCallback(
    (message: { op: "create"; input: RecordInput } | { op: "update"; id: string; patch: RecordPatch; replace?: boolean } | { op: "delete"; id: string }) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
      const req = ++opCounter.current;
      return new Promise<string>((resolve, reject) => {
        opWaits.current.set(req, { resolve, reject });
        socket.send(JSON.stringify({ type: "op", req, ...message }));
      });
    },
    [],
  );

  // A SIEGE check for a character; the host rolls it and posts the result.
  const siegeCheck = useCallback((id: string, attribute: string, cl = 0, save = false, extra?: { label?: string; bonus?: number; addLevel?: boolean; kind?: "check" | "save" | "skill" | "morale"; skill?: string; dc?: number; advantage?: string }) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "siege-check", id, attribute, cl, ...(save ? { label: `${attribute[0].toUpperCase()}${attribute.slice(1)} save` } : {}), ...(extra ?? {}), ...throwIntent() }));
  }, []);

  // Dual class or reclass at a level up (the Adventurer's Backpack).
  const changeClass = useCallback((id: string, mode: "dual" | "reclass", className: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "class-change", id, mode, className }));
  }, []);

  // Cairn: rest, Fatigue, spells, Scars, Growth (the host does it: electron/cairn.cjs).
  const cairnAction = useCallback((id: string, action: string, args: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    socket.send(JSON.stringify({ type: "cairn", id, action, args, ...throwIntent() }));
    return Promise.resolve();
  }, []);
  // Apeira Astra: experience spent on a skill's next level or a characteristic +1 (the host checks the cost).
  const improveCharacter = useCallback((id: string, what: { skill?: string; attribute?: string }) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Not connected."));
    socket.send(JSON.stringify({ type: "character-improve", id, ...what }));
    return Promise.resolve();
  }, []);
  const levelUp = useCallback((id: string, packageKey?: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "level-up", id, ...(packageKey ? { package: packageKey } : {}) }));
  }, []);

  const sendChat = useCallback((text: string, how: ChatSend = {}) => {
    const socket = socketRef.current;
    const line = text.trim();
    if (!line || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "chat", text: line.slice(0, 500), ...how }));
  }, []);
  // The table's own commands (FG's): the GM's /kick and /save, anyone's /vote.
  const tableCommand = useCallback((body: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(body));
  }, []);
  // A line on this screen only (/help, /info), and /clear.
  const note = useCallback((text: string, from = "Kraken") => setChat((current) => [...current, { id: "local", from, text, at: Date.now(), local: true }].slice(-100)), []);
  // Sound, the GM's: the library, playing for the table, ambience, music, the chat's triggers.
  const soundList = useCallback(async (): Promise<SoundLibrary> => {
    const response = await fetch(`${originRef.current}/sound/list?token=${assetRef.current}`);
    if (!response.ok) throw new Error("No sounds.");
    const library = (await response.json()) as SoundLibrary;
    if (library.triggers) setSoundTriggers(library.triggers);
    return library;
  }, []);
  const soundCommand = useCallback((body: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(body));
  }, []);

  // The GM's art library (portraits and tokens), served by the host to this seat.
  const artUrl = useCallback((id: string) => (id && assetRef.current ? `${originRef.current}/art/file?token=${assetRef.current}&id=${encodeURIComponent(id)}` : ""), []);
  // A creature's picture from its module (NPCs), served by the host.
  const recordArtUrl = useCallback(
    (recordId: string, kind: "token" | "portrait" | "card" = "token") =>
      assetRef.current ? `${originRef.current}/table/record-art?token=${assetRef.current}&record=${encodeURIComponent(recordId)}&kind=${kind}` : "",
    [],
  );
  // A picture of the GM's FG character wizard (its extension's graphics folder, served by the host).
  const wizardArtUrl = useCallback(
    (extension: string, file: string) => (assetRef.current ? `${originRef.current}/wizard-art?token=${assetRef.current}&ext=${encodeURIComponent(extension)}&file=${encodeURIComponent(file)}` : ""),
    [],
  );
  // A call of the GM's FG character wizard's own script (its race, class and alignment words): values, and pictures for icon names.
  const wizardText = useCallback(async (extension: string, fn: string, args: unknown[] = []): Promise<{ values: (string | null)[]; files: (string | null)[] }> => {
    if (!assetRef.current) return { values: [], files: [] };
    const response = await fetch(`${originRef.current}/wizard-text?token=${assetRef.current}&ext=${encodeURIComponent(extension)}&fn=${encodeURIComponent(fn)}&args=${encodeURIComponent(JSON.stringify(args))}`);
    if (!response.ok) return { values: [], files: [] };
    const body = (await response.json()) as { values?: (string | null)[]; files?: (string | null)[] };
    return { values: body.values ?? [], files: body.files ?? [] };
  }, []);
  // Background decals and wallpapers: a picture (any seat), and the list to choose from (the GM's).
  const decalUrl = useCallback(
    (id: string, kind: PictureKind = "decal") => (id && assetRef.current ? `${originRef.current}/${kind}/file?token=${assetRef.current}&id=${encodeURIComponent(id)}` : ""),
    [],
  );
  // Books: a route of the host's (the list, a book's contents, a page), and pictures.
  const bookFetch = useCallback(async <T,>(route: "list" | "contents" | "page" | "record", params: Record<string, string> = {}): Promise<T> => {
    const query = new URLSearchParams({ token: assetRef.current, ...params });
    const response = await fetch(`${originRef.current}/book/${route}?${query}`);
    if (!response.ok) throw new Error(route === "list" ? "No books here." : "That book is not open to you.");
    return (await response.json()) as T;
  }, []);
  const bookUrl = useCallback(
    (route: "cover" | "picture", book: string, file = "") =>
      assetRef.current ? `${originRef.current}/book/${route}?${new URLSearchParams({ token: assetRef.current, book, ...(file ? { file } : {}) })}` : "",
    [],
  );
  const decalList = useCallback(async (kind: PictureKind = "decal"): Promise<DecalItem[]> => {
    const response = await fetch(`${originRef.current}/${kind}/list?token=${assetRef.current}`);
    if (!response.ok) throw new Error("Nothing to choose from.");
    return (await response.json()) as DecalItem[];
  }, []);
  const artList = useCallback(async (kind: "portrait" | "token") => {
    const response = await fetch(`${originRef.current}/art/list?token=${assetRef.current}&kind=${kind}`);
    if (!response.ok) throw new Error("No art library.");
    return (await response.json()) as import("../characters/ArtPicker").ArtItem[];
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);
  // As FG's /clear, and it stays cleared: the host remembers when this seat cleared.
  const clearChat = useCallback(() => {
    setChat([]);
    send({ type: "chat-clear" });
  }, [send]);

  // Map actions. The host decides (walls, ownership) and sends everyone their view.
  const placeToken = useCallback((recordId: string | null, x?: number, y?: number, name?: string) => {
    send({ type: "token-place", recordId, x, y, name });
  }, [send]);
  const moveToken = useCallback((id: string, x: number, y: number, snap = true) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    setMap((current) => ({ ...current, tokens: current.tokens.map((token) => (token.id === id ? { ...token, x, y } : token)) }));
    send({ type: "token-move", id, x, y, snap });
  }, [send]);
  // A group dragged together: each token to its own place, in one message.
  const moveTokens = useCallback((moves: { id: string; x: number; y: number }[], snap = true) => {
    const at = new Map(moves.map((move) => [move.id, move]));
    setMap((current) => ({ ...current, tokens: current.tokens.map((token) => (at.has(token.id) ? { ...token, x: at.get(token.id)!.x, y: at.get(token.id)!.y } : token)) }));
    send({ type: "token-move", moves, snap });
  }, [send]);
  const removeToken = useCallback((id: string) => send({ type: "token-remove", id }), [send]);
  const updateToken = useCallback(
    (id: string, patch: Partial<Pick<MapToken, "name" | "hidden" | "squares" | "faction" | "owner" | "vision" | "facing">> & { light?: string | MapToken["light"] }) => send({ type: "token-update", id, patch }),
    [send],
  );
  const updateSettings = useCallback((patch: import("../table/SceneSettings").SceneSettingsPatch) => send({ type: "scene-settings", patch }), [send]);
  const draw = useCallback((points: number[], color: string | null, width: number, shape?: string) => send({ type: "draw", points, ...(color ? { color } : {}), width, ...(shape && shape !== "free" ? { shape } : {}) }), [send]);
  // A shape's two points moved (its handles dragged): the drawer's own, or the GM's any.
  const updateDrawing = useCallback((id: string, points: number[]) => send({ type: "draw-update", id, points }), [send]);
  const eraseDrawing = useCallback((id: string) => send({ type: "draw-erase", id }), [send]);
  // The calendar: the GM sets or moves the date; anyone writes notes on a day (calendar.cjs).
  // The GM reads boxed text aloud: to chat, and over the map as a bubble for everyone.
  const sendReadAloud = useCallback((text: string, title?: string) => send({ type: "read-aloud", text, title }), [send]);
  const dismissReadAloud = useCallback(() => setReadAloudNow(null), []);
  const calendarOp = useCallback((message: Record<string, unknown>) => send({ type: "calendar", ...message }), [send]);
  const clearDrawings = useCallback(() => send({ type: "draw-clear" }), [send]);
  // Death markers: the GM removes one (right-click) or clears them all.
  const removeDeathMarker = useCallback((id: string) => send({ type: "death-marker", action: "remove", id }), [send]);
  const clearDeathMarkers = useCallback(() => send({ type: "death-marker", action: "clear" }), [send]);
  // The GM's map editor: walls and undo.
  const wall = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "wall", action, ...payload }), [send]);
  const mapUndo = useCallback(() => send({ type: "map-undo" }), [send]);
  // The GM's image window: closed, or a play test (a test token, the players' view) on or off.
  const prepClose = useCallback(() => send({ type: "prep-close" }), [send]);
  const playtest = useCallback((on: boolean, at?: { x: number; y: number }) => send({ type: "playtest", on, ...(at ? { at } : {}) }), [send]);
  // The player vision preview (the players' view of the GM's map), and the table map shared or not.
  const visionPreview = useCallback((on: boolean) => send({ type: "playtest", preview: on }), [send]);
  const shareTableMap = useCallback((on: boolean) => send(on ? { type: "map-share" } : { type: "scene-share", on: false }), [send]);
  const mask = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "mask", action, ...payload }), [send]);
  const libraryAction = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "library", action, ...payload }), [send]);
  // The GM's: an FG module's maps as a bundle to open on the table.
  const fgMaps = useCallback(async (module: string, only = "", file = "") => {
    const response = await fetch(`${originRef.current}/table/fg-maps?token=${assetRef.current}&module=${encodeURIComponent(module)}${only ? `&only=${encodeURIComponent(only)}` : ""}${file ? `&file=${encodeURIComponent(file)}` : ""}`);
    if (!response.ok) throw new Error(await response.text());
    return new Uint8Array(await response.arrayBuffer());
  }, []);
  const paint = useCallback((payload: Record<string, unknown>) => send({ type: "draw", ...payload }), [send]);
  const fx = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "fx", action, ...payload }), [send]);
  const tile = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "tile", action, ...payload }), [send]);
  const label = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "label", action, ...payload }), [send]);
  const mapGroup = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "map-group", action, ...payload }), [send]);
  const placeLight = useCallback((light: Partial<SceneLightRecord> & { preset?: string }) => send({ type: "light-place", light }), [send]);
  const updateLight = useCallback((id: string, patch: Partial<SceneLightRecord>) => send({ type: "light-update", id, patch }), [send]);
  const removeLight = useCallback((id: string) => send({ type: "light-remove", id }), [send]);
  // The party sheet's GM actions; the host splits and posts them as FG does.
  // The combat tracker: every action goes to the host, which applies FG's rules.
  // The tracker's rolls are thrown from where they were asked for.
  const ct = useCallback((action: string, payload: Record<string, unknown> = {}) => send({ type: "ct", action, ...payload, ...throwIntent() }), [send]);
  const setTableOptions = useCallback((patch: Partial<TableOptions>) => send({ type: "table-options", options: patch }), [send]);
  const partyAwardXP = useCallback((xp: number) => send({ type: "party-award-xp", xp }), [send]);
  const partyAward = useCallback((kind: "quests" | "encounters", id?: string) => send({ type: "party-award", kind, id }), [send]);
  const partyDistribute = useCallback(() => send({ type: "party-distribute" }), [send]);
  const partyGroup = useCallback((kind: "check" | "save", attribute: string, cl: number) => send({ type: "party-group", kind, attribute, cl }), [send]);
  const setDoor = useCallback((id: string, state?: number) => send({ type: "door", id, state }), [send]);
  const setSight = useCallback((on: boolean) => send({ type: "sight", on }), [send]);
  const setLocked = useCallback((on: boolean) => send({ type: "lock", on }), [send]);
  const ping = useCallback((x: number, y: number) => send({ type: "ping", x, y }), [send]);
  // The GM: the map opens on every player's screen.
  const shareMap = useCallback(() => send({ type: "map-share" }), [send]);

  useEffect(() => {
    window.__kraken = {
      publish,
      sendChat,
      moveToken,
      placeToken,
      setDoor,
      roll,
      op,
      snapshot: () => ({
        role: stateRef.current.role,
        selfId: stateRef.current.selfId,
        players: stateRef.current.players,
        map: stateRef.current.map,
        chat: stateRef.current.chat,
        sceneName: stateRef.current.playerScene?.name ?? null,
        records: Object.values(stateRef.current.records),
      }),
    };
    return () => {
      delete window.__kraken;
    };
  }, [publish, sendChat, moveToken, placeToken, setDoor, roll, op]);

  return {
    options,
    setTableOptions,
    connected,
    connecting,
    canHost: typeof window !== "undefined" && Boolean(window.kraken),
    role,
    selfId,
    hostInfo,
    remoteLabel,
    players,
    roster,
    accounts,
    accountAction,
    map,
    party,
    krits,
    library,
    libraryAction,
    fgMaps,
    combat,
    calendar,
    calendarOp,
    readAloudNow,
    sendReadAloud,
    dismissReadAloud,
    pings,
    mapShared,
    notice,
    chat,
    records,
    error,
    playerScene,
    host,
    join,
    leave,
    signOut,
    publish,
    sendChat,
    placeToken,
    moveToken,
    moveTokens,
    removeToken,
    updateToken,
    setDoor,
    setSight,
    setLocked,
    ping,
    shareMap,
    updateSettings,
    placeLight,
    draw,
    updateDrawing,
    eraseDrawing,
    clearDrawings,
    removeDeathMarker,
    clearDeathMarkers,
    updateLight,
    removeLight,
    ct,
    partyAwardXP,
    partyAward,
    partyDistribute,
    partyGroup,
    artUrl,
    artList,
    tableCommand,
    soundscape,
    sceneSound,
    ruleset,
    soundTriggers,
    bookShelf,
    imageShown,
    bookSounds,
    // The GM's: a sound on one of a page's sound links, or in its story.
    setBookSound: (change: { book: string; page: string; action: "bind" | "unbind" | "add" | "remove"; key?: string; block?: number; id?: string; sound?: string; kind?: string; label?: string }) => send({ type: "book-sound", ...change }),
    quickSlots,
    setQuickSlots: (slots: (QuickSlot | null)[]) => {
      setQuickSlotsState(slots);
      send({ type: "quickslots", slots });
    },
    bookFetch,
    bookUrl,
    // The GM's: share a book with the players (or stop), show them a picture, take it back.
    // The character sheet: fields typed on it (the host works the numbers out again).
    importCharacter,
    takeCharacter,
    editCharacter: (id: string, changes: { path: string; value: unknown }[]) => send({ type: "character-edit", id, changes }),
    // A record dropped on the sheet (FG's sheet drop): a race or class, a spell, an item.
    dropOnCharacter: (id: string, recordId: string) => send({ type: "character-drop", id, recordId }),
    activateBook: (book: string, active: boolean) => send({ type: "book-activate", book, active }),
    // The party's watch order and formation (a player moves their own characters).
    partyOrder: (change: { action: "place" | "remove" | "watch" | "fill" | "rotate" | "clear"; id?: string; x?: number; y?: number; watch?: number; columns?: number; direction?: "left" | "right" }) => send({ type: "party-order", ...change }),
    shareBook: (book: string, shared: boolean) => send({ type: "book-share", book, shared }),
    showImage: (book: string, file: string, name: string) => send({ type: "image-share", book, file, name }),
    hideImage: (id: string) => send({ type: "image-unshare", id }),
    soundList,
    soundCommand,
    note,
    clearChat,
    decalUrl,
    decalList,
    recordArtUrl,
    wizardArtUrl,
    wizardText,
    roll,
    op,
    siegeCheck,
    buildCharacter,
    shipAction,
    lifeAction,
    levelUp,
    improveCharacter,
    cairnAction,
    wall,
    mapUndo,
    prepClose,
    playtest,
    visionPreview,
    shareTableMap,
    mask,
    label,
    mapGroup,
    paint,
    fx,
    tile,
    changeClass,
  };
}

export type Session = ReturnType<typeof useSession>;
