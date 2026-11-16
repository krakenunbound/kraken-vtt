import { ShipsWindow } from "../ships/ShipsWindow";
import { SessionLogWindow } from "../notes/SessionLog";
import { DelveWindow, OraclesWindow } from "../ironsworn/IronswornWindows";
import { Fragment, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { BellAndHands, HandButton, InviteCard, PauseButton, PauseVeil, PlayerMenu, ReconnectBanner, SceneTitleCard, seatState, useIdle, usePlayerMenu } from "./SessionTools";
import { Picture } from "../characters/ArtPicker";
import { CharacterPanel } from "../characters/CharacterPanel";
import { CharacterSelect } from "../characters/CharacterSelect";
import { BookRecordWindow, listOf, RecordsWindow, RecordWindow, sidebarLists } from "../books/Records";
import { shareDrop, UndoToast } from "../books/RecordEditor";
import { CombatTracker } from "../combat/CombatTracker";
import { PartySheet } from "../party/PartySheet";
import { savedSignIn, type Session } from "../session/useSession";
import { diceStore } from "../dice/diceStore";
import { agentCommands } from "./agentCommands";
import { ChatDock } from "./ChatDock";
import { manifestOf, PANELS } from "../rulesets";
import { setActionRolls } from "./InlineRolls";
import { has } from "../../shared/rulesets/registry.mjs";
import { Mark } from "./Emblem";
import { DecalPicker, SettingsWindow, TableDecal } from "./Settings";
import { DiceWindow } from "../dice/DiceWindow";
import { SoundWindow } from "../sound/SoundWindow";
import { QuickSlots, slotDrag } from "./QuickSlots";
import { KritsWindow } from "../combat/KritsWindow";
import { DeathMarkersWindow } from "../combat/DeathMarkersWindow";
import { AdventureList, LibraryWindow, StoryWindow, type Kind as AdventureKind } from "../books/Library";
import { NotesWindow, NoteWindow } from "../notes/Notes";
import { CalendarWindow } from "../notes/CalendarWindow";
import { EffectsWindow } from "../effects/EffectsWindow";
import { ClocksStrip, ClocksWindow } from "../notes/ClocksWindow";
import { MotdWindow } from "../notes/MotdWindow";
import { ReadAloudBubble, useAnyMapShown } from "../books/ReadAloudBubble";
import { readAloud } from "../books/readAloud";
import { BooksWindow, BookWindow, ImagesWindow, PictureWindow } from "../books/Books";
import { ImagesList } from "../books/ImagesList";
import { AssetsWindow } from "../books/AssetsWindow";
import { StudioWindow } from "../studio/StudioWindow";
import { mapWindow, studioOpener } from "../table/imageWindow";
import { Icon } from "./icons";
import { sound } from "../sound/soundEngine";
import { FloatingWindow, useWindows } from "./Windows";
import { AssistantWindow } from "./AssistantWindow";
import { CardsWindow } from "../cards/CardsWindow";
import { cardsStore } from "../cards/cardsStore";
import { entryId, Sidebar, type SidebarEntry, type SidebarGroup } from "./Sidebar";
import { TurnCard } from "../combat/TurnCard";

// The 3D dice (three.js and cannon) load when the table first shows them.
const DiceLayer = lazy(() => import("../dice/DiceLayer"));

// launch: the button's data-launch when it is not the kind (the player's Characters button opening Character Selection).

// Everyone at the table, and how players connect (the GM's).
function PlayersWindow({ session, onMenu }: { session: Session; onMenu?: (name: string, event: ReactMouseEvent) => void }) {
  const info = session.hostInfo;
  return (
    <div className="players-window">
      {info ? (
        <div className="share-card">
          <h3>Joining</h3>
          <p className="hint">Players open one of these in a browser.</p>
          <dl className="share-addresses">
            <dt>This computer</dt>
            <dd>
              <span className="secret">http://127.0.0.1:{info.port}</span>
            </dd>
            {info.lan
              ? info.addresses.map((address) => (
                  <Fragment key={address}>
                    <dt>Your network</dt>
                    <dd>
                      <span className="secret">http://{address}:{info.port}</span>
                    </dd>
                  </Fragment>
                ))
              : null}
            {info.cloud && info.externalV4 ? (
              <>
                <dt>Internet</dt>
                <dd>
                  <span className="secret">http://{info.externalV4}:{info.port}</span>
                </dd>
              </>
            ) : null}
            <dt>Password</dt>
            <dd>{info.publicGame ? <span className="hint">None: a public game, players leave it blank</span> : <span className="secret">{info.password}</span>}</dd>
          </dl>
          <InviteCard session={session} />
        </div>
      ) : null}
      <h3>At the table</h3>
      <ul className="roster-list">
        {session.players.map((seat) => {
          const token = session.map.tokens.find((item) => item.owner === seat.name);
          const state = seatState(seat);
          const controls = session.role === "dm" && seat.role === "player";
          return (
            <li key={seat.id} data-player={seat.id} data-player-name={seat.name} data-role={seat.role} data-state={state || undefined} className={state ? `seat-${state}` : undefined} onContextMenu={controls && onMenu ? (event) => onMenu(seat.name, event) : undefined}>
              <span className="seat-dot" style={{ background: token?.color ?? "#888" }} />
              <span>{seat.name}</span>
              {seat.hand ? <span className="seat-hand" title="Hand raised"><Icon name="raise" size={14} title="Hand raised" /></span> : null}
              {state ? <small className="seat-state">{state === "reconnecting" ? "reconnecting…" : state}</small> : null}
              <span className="seat-role">{seat.role === "dm" ? "GM" : "Player"}</span>
              {controls ? (
                <span className="seat-actions">
                  <button type="button" className="ghost icon-button" data-action="ring" aria-label={`Ring ${seat.name}'s bell`} title="Ring bell: a chime and a flash on their screen" disabled={seat.lost} onClick={() => session.ringPlayer(seat.name)}>
                    <Icon name="bell" size={15} />
                  </button>
                  {onMenu ? (
                    <button type="button" className="ghost icon-button" data-action="player-menu" aria-haspopup="menu" aria-label={`More for ${seat.name}`} title="More: View as, Mark away, Kick, Ban" onClick={(event) => onMenu(seat.name, event)}>
                      <Icon name="more" size={15} />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {session.role === "dm" && session.bans.length ? (
        <section className="bans-panel" data-panel="bans">
          <h3>Banned</h3>
          <ul className="accounts-list">
            {session.bans.map((ban) => (
              <li key={`${ban.name}|${ban.address}`} data-ban={ban.name}>
                <Icon name="ban" size={14} />
                <span className="account-name">{ban.name || "(no name)"}</span>
                <small className="hint">{ban.address ? `from ${ban.address} · ` : ""}since {new Date(ban.at).toLocaleDateString()}</small>
                <button type="button" className="ghost" data-action="unban" onClick={() => session.unbanPlayer(ban.name)}>
                  Unban
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {session.role === "dm" ? <AccountsPanel session={session} /> : null}
    </div>
  );
}

// Players' accounts (the GM's, kept by this app for all its campaigns): a
// player's name with an account needs its password to sit down, so no one
// else can take their characters. Make one ahead for a player, set a new
// password for one who forgot theirs (their browsers are signed out), remove one.
function AccountsPanel({ session }: { session: Session }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [makePassword, setMakePassword] = useState("");
  const seatedKey = session.players.map((seat) => seat.name).join("|");
  useEffect(() => session.accountAction({ action: "list" }), [seatedKey]);
  const when = (at: number | null) => (at ? new Date(at).toLocaleDateString() : "never");
  return (
    <section className="accounts-panel" data-panel="accounts">
      <h3>Accounts</h3>
      <p className="hint">A player chooses a password the first time they sit down; after that their name needs it, and their browser remembers them.</p>
      {session.accounts.note ? (
        <p className="hint" role="status">
          Done: {session.accounts.note}.
        </p>
      ) : null}
      {session.accounts.error ? (
        <p className="error-line" role="alert">
          {session.accounts.error}
        </p>
      ) : null}
      <ul className="accounts-list">
        {session.accounts.list.map((account) => (
          <li key={account.name} data-account={account.name}>
            <span className="seat-dot" style={{ background: account.seated ? "#7ccf8a" : "#555" }} title={account.seated ? "At the table" : "Away"} />
            <span className="account-name">{account.name}</span>
            <small className="hint">
              last seen {when(account.seenAt)} · {account.devices} browser{account.devices === 1 ? "" : "s"}
            </small>
            {editing === account.name ? (
              <form
                className="account-reset"
                onSubmit={(event) => {
                  event.preventDefault();
                  session.accountAction({ action: "password", name: account.name, password });
                  setPassword("");
                  setEditing(null);
                }}
              >
                <input type="password" aria-label={`New password for ${account.name}`} value={password} minLength={6} required onChange={(event) => setPassword(event.target.value)} placeholder="New password" />
                <button type="submit">Set</button>
                <button type="button" className="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <span className="account-actions">
                <button type="button" className="ghost" data-action="account-password" onClick={() => setEditing(account.name)} title="Set a new password (a player who forgot theirs); their browsers are signed out">
                  New password
                </button>
                <button
                  type="button"
                  className="ghost"
                  data-action="account-remove"
                  title="Remove the account (their characters keep their name; anyone could sit under it again)"
                  onClick={() => {
                    if (window.confirm(`Remove ${account.name}'s account? Anyone could then sit down under that name.`)) session.accountAction({ action: "remove", name: account.name });
                  }}
                >
                  Remove
                </button>
              </span>
            )}
          </li>
        ))}
        {session.accounts.list.length === 0 ? <li className="hint empty-state">No accounts yet. A player makes one the first time they sit down, or make one here.</li> : null}
      </ul>
      <form
        className="account-create"
        onSubmit={(event) => {
          event.preventDefault();
          session.accountAction({ action: "create", name, password: makePassword });
          setName("");
          setMakePassword("");
        }}
      >
        <input aria-label="New account name" placeholder="Player's name" value={name} maxLength={24} required onChange={(event) => setName(event.target.value)} />
        <input aria-label="New account password" type="password" placeholder="Password" value={makePassword} minLength={6} required onChange={(event) => setMakePassword(event.target.value)} />
        <button type="submit" data-action="account-create">
          Make account
        </button>
      </form>
    </section>
  );
}

// The GM's wallpaper tiles the desktop, darkened so the decal and windows stand
// out. A small tile (Kraken's game patterns, 768 drawn at 384 for sharpness)
// repeats at 384; a big picture (a hex grid on black, 2048 across, as FG's
// desktop) shows at its own size, so the repeat hardly shows and a grid keeps
// its scale.
function useWallpaperStyle(session: Session) {
  const url = session.options.wallpaper ? session.decalUrl(session.options.wallpaper, "wallpaper") : "";
  const [big, setBig] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!url || url in big) return;
    const image = new Image();
    image.onload = () => setBig((known) => ({ ...known, [url]: image.naturalWidth >= 1500 }));
    image.src = url;
  }, [url]);
  if (!url) return undefined;
  const size = big[url] ? "auto" : "384px 384px";
  return { backgroundImage: `linear-gradient(rgba(6, 8, 10, ${big[url] ? 0.2 : 0.42}), rgba(6, 8, 10, ${big[url] ? 0.2 : 0.42})), url("${url}")`, backgroundSize: `auto, ${size}`, backgroundRepeat: "repeat" };
}

// The table for both sides, laid out as FG's desktop: the map (or the emblem)
// fills the screen; the sidebar on the right opens windows; chat with the
// dice tray sits bottom left; characters' portraits along the top.
export function Desktop({
  session,
  scene,
  sceneId = "",
  sceneName = "",
  sceneBar,
  emptyGM,
  onOpenAdventure,
  openMaps = async () => undefined,
  onMapClosed,
  mapHeld = "",
  overlay,
}: {
  session: Session;
  scene: ReactNode | null;
  // The open map's scene: its window opens when a new one does (FG's image window).
  sceneId?: string;
  sceneName?: string;
  sceneBar: ReactNode;
  emptyGM: ReactNode;
  onOpenAdventure: () => void;
  // Opens a map bundle on the table (an FG module's maps from the Library).
  openMaps?: (bytes: Uint8Array, name: string) => Promise<unknown>;
  // The image window's image: its map window closed closes it (the table's map again).
  onMapClosed?: () => void;
  // The table map the GM closed: its window is not opened by itself again.
  mapHeld?: string;
  overlay: ReactNode;
}) {
  const gm = session.role === "dm";
  const windows = useWindows();
  // A player gone quiet dims (idle); the GM's menu for a player (Players' rows, the portraits).
  useIdle(session);
  const playerMenu = usePlayerMenu();
  const characters = Object.values(session.records)
    .filter((record) => record.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));
  // FG's character list along the top: every character at the table, for both sides.
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  // The party along the top; in a fight, in initiative order when the GM chooses (the table option
  // partyByInitiative): those on the tracker in turn order, the rest after them as they were.
  const byInitiative = Boolean((session.options as { partyByInitiative?: boolean }).partyByInitiative) && session.combat.entries.length > 0;
  const turnIndex = (id: string) => {
    const at = session.combat.entries.findIndex((item) => item.recordId === id);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  const portraits = byInitiative ? [...session.roster].sort((a, b) => turnIndex(a.id) - turnIndex(b.id)) : session.roster;
  // When their order changes the portraits slide to their new places (measured before and after), not jump.
  const stripRef = useRef<HTMLDivElement>(null);
  const chipPlaces = useRef(new Map<string, number>());
  const portraitOrder = portraits.map((entry) => entry.id).join(",");
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const chip of strip.querySelectorAll<HTMLElement>("[data-portrait]")) {
      const id = chip.dataset.portrait ?? "";
      const left = chip.getBoundingClientRect().left;
      const before = chipPlaces.current.get(id);
      chipPlaces.current.set(id, left);
      if (before !== undefined && Math.abs(before - left) > 1 && !still) chip.animate([{ transform: `translateX(${before - left}px)` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }, [portraitOrder]);
  // FG's sidebar: the tools along the top, then the categories. A list
  // (Items, NPCs, Classes, Races, Spells...) opens on its own window, every
  // active book's records under the book's name.
  const listEntry = (id: string, label: string, icon: string): SidebarEntry => ({ kind: "records", payload: id, label, icon, title: label });
  const characterIcon: Record<string, string> = { "siegepackage:class": "shield", class: "shield", "siegepackage:race": "crown", race: "crown", siegepower: "wand", spell: "wand", feat: "sparkle", background: "scroll", skill: "check", class_specialization: "shield", race_subrace: "crown" };
  const characterLists = sidebarLists(session.records, "Character", session.ruleset)
    .filter((item) => item.id !== "siegepackage")
    .map((item) => listEntry(item.id, item.label, characterIcon[item.id] ?? "shield"));
  const hasPackages = Object.values(session.records).some((record) => record.type === "siegepackage" && listOf(record) === "siegepackage");
  // The campaign's own story, tables and quests a player has been shown (the GM's are under World and Campaign).
  const sharedLists = sidebarLists(session.records, "Campaign", session.ruleset)
    .filter((item) => ["story", "table", "quest"].includes(item.id))
    .map((item) => listEntry(item.id, item.label, item.id === "story" ? "scroll" : item.id === "table" ? "table" : "flag"));
  const combatBadge = session.combat.round > 0 ? session.combat.round : undefined;
  // A player's way back to the table's map after closing its window (the GM
  // opens maps from Images, the Library or a book, and the map window comes to
  // the front by itself: no button for it).
  const mapTool: SidebarEntry[] = scene ? [{ kind: "map", label: "Map", icon: "map", title: sceneName || "Map" }] : [];
  // The campaign's game: what its manifest switches on (docs/core-ui-design.md, 4.6).
  const game = manifestOf(session.ruleset);
  // The combat window, under the game's own word (Forged in the Dark: its Score panel).
  const combatTool: SidebarEntry = game.combatLabel ? { kind: "combat", label: game.combatLabel, icon: "combat", title: game.combatLabel } : { kind: "combat", label: "Combat", icon: "combat", title: "Combat Tracker", badge: combatBadge };
  // The game's own windows (starships, oracles, Delve's sites), each only where its feature is on.
  const gameWindows: SidebarEntry[] = (game.windows ?? []).filter((item) => (!item.gm || gm) && (!item.feature || has(game, item.feature))).map((item) => ({ kind: item.kind as SidebarEntry["kind"], label: item.label, icon: item.icon, title: item.title ?? item.label }));
  const tools: SidebarEntry[] = gm
    ? [
        combatTool,
        { kind: "assistant", label: "Assistant", icon: "sparkle", title: "DM Assistant" },
        { kind: "studio", label: "Map Studio", icon: "pen", title: "Map Studio" },
        { kind: "players", label: "Players", icon: "players", title: "Players" },
        { kind: "settings", label: "Settings", icon: "settings", title: "Settings" },
      ]
    : [
        ...mapTool,
        combatTool,
        { kind: "settings", label: "Settings", icon: "settings", title: "Settings" },
      ];
  // FG's Characters button opens Character Selection, for the GM (every character) and a player alike;
  // a card there opens its sheet in a window of its own (as does a portrait at the top).
  const charactersEntry: SidebarEntry = { kind: "charselect", label: "Characters", icon: "character", title: "Character Selection", launch: "characters", openOnly: true };
  const cardsOn = useSyncExternalStore(cardsStore.subscribe, cardsStore.settings).on;
  const groups: SidebarGroup[] = [
    {
      id: "library",
      label: "Library",
      entries: [
        ...(gm ? [{ kind: "books" as const, payload: "activation", label: "Modules", icon: "package", title: "Modules", hint: "Make a book active for this campaign" }] : []),
        { kind: "books", label: "Books", icon: "book", title: "Books" },
        { kind: "sound", label: "Sound Sets", icon: "music", title: "Sound" },
        ...(gm ? [{ kind: "assets" as const, label: "Assets", icon: "image", title: "Assets" }] : []),
      ],
    },
    {
      id: "player",
      label: "Player",
      entries: [
        charactersEntry,
        ...(hasPackages ? [listEntry("siegepackage", "Packages", "package")] : []),
        // Ability cards, for whoever turned them on in Settings (this browser's choice).
        ...(cardsOn ? [{ kind: "cards" as const, label: "Cards", icon: "wand", title: "Cards" }] : []),
        { kind: "party", label: "Party", icon: "party", title: "Party Sheet" },
        // The game's own windows: starships in the 2d6 games, Ironsworn's oracles and Delve's sites.
        ...gameWindows,
        { kind: "notes", label: gm ? "Notes" : "Player Notes", icon: "chat", title: gm ? "Notes" : "Player Notes" },
        { kind: "calendar", label: "Calendar", icon: "calendar", title: "Calendar" },
        // FG's Effects window: conditions, buffs, lights and the GM's own, each dragged onto a creature.
        { kind: "effects", label: "Effects", icon: "flask", title: "Effects" },
        // Progress clocks: a game with the clocks feature (Forged in the Dark), or any game that has some.
        ...(has(game, "clocks") || session.clocks.clocks.length ? [{ kind: "clocks" as const, label: "Clocks", icon: "hourglass", title: "Clocks" }] : []),
        ...(gm || session.options.motd?.text || session.options.motd?.links?.length ? [{ kind: "motd" as const, label: "Message", icon: "flag", title: "Message of the Day" }] : []),
        // The GM's Session Log: each sitting's chat, read back and exported.
        ...(gm ? [{ kind: "sessionlog" as const, label: "Session Log", icon: "scroll", title: "Session Log" }] : []),
      ],
    },
    {
      id: "campaign",
      label: "Campaign",
      entries: gm
        ? [
            { kind: "adventure", payload: "battle", label: "Encounters", icon: "encounter", title: "Encounters", hint: "Every active adventure's encounters" },
            { kind: "imagelist", label: "Images", icon: "image", title: "Images" },
            { kind: "library", label: "Adventures", icon: "map", title: "Library" },
            listEntry("item", "Items", "bag"),
            listEntry("npc", "NPCs", "skull"),
            { kind: "adventure", payload: "parcel", label: "Parcels", icon: "coins", title: "Parcels", hint: "Every active adventure's treasure parcels" },
            { kind: "adventure", payload: "table", label: "Tables", icon: "table", title: "Tables", hint: "The campaign's random tables and every active adventure's" },
            listEntry("quest", "Quests", "flag"),
            listEntry("vehicle", "Vehicles", "ship"),
          ]
        : [listEntry("item", "Items", "bag"), listEntry("npc", "NPCs", "skull"), ...sharedLists],
    },
    ...(gm ? [{ id: "world", label: "World", entries: [listEntry("location", "Locations", "map"), { kind: "adventure" as const, payload: "story", label: "Story", icon: "scroll", title: "Story", hint: "Every active adventure's story entries" }] }] : []),
    { id: "character", label: "Character", entries: characterLists },
  ];
  const launchers = [...tools, ...groups.flatMap((group) => group.entries)];
  const entryOpen = (entry: SidebarEntry) => windows.windows.some((item) => item.key === (entry.payload ? `${entry.kind}:${entry.payload}` : entry.kind));
  const launch = (entry: SidebarEntry) => (entry.openOnly ? windows.open(entry.kind, entry.title, entry.payload) : windows.toggle(entry.kind, entry.title, entry.payload));
  // The Character Wizard, a new one each time, in a window of its own (which shows the new sheet when it
  // is done); one still open closes first.
  const openWizard = () => {
    for (const item of windows.windows) if (item.kind === "characters" && String(item.payload ?? "").startsWith("new")) windows.close(item.key);
    windows.open("characters", "Character Wizard", `new-${Date.now()}`);
  };
  // Action links in text know this game's checks, saves and skills.
  setActionRolls((manifestOf(session.ruleset).party?.groupCheck || undefined)?.rolls);
  const dice =useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  // A sheet whose character this seat may no longer see (the GM took it back) closes.
  useEffect(() => {
    for (const item of windows.windows) if (item.kind === "sheet" && item.payload && !session.records[item.payload]) windows.close(item.key);
  }, [session.records]);
  // The map opens in its own window (FG's image window), with its tools and
  // settings: when a map is opened, or the GM changes the scene; it goes when
  // the map does. Closed, it stays shut until the next scene or the Map button.
  const shownMap = useRef("");
  const mapOpenKey = scene ? sceneId || sceneName || "map" : "";
  useEffect(() => {
    if (!mapOpenKey) {
      shownMap.current = "";
      for (const item of windows.windows) if (item.kind === "map") windows.close(item.key);
      return;
    }
    if (shownMap.current !== mapOpenKey) {
      shownMap.current = mapOpenKey;
      if (mapHeld && (mapOpenKey === mapHeld || sceneId === mapHeld)) return;
      windows.open("map", sceneName || "Map");
    }
  }, [mapOpenKey, sceneName]);
  // The map window to the front (an image clicked that is the table's map already).
  useEffect(() => {
    mapWindow.front = () => windows.open("map", sceneName || "Map");
    return () => {
      mapWindow.front = null;
    };
  });
  // Map Studio opened on an image (its page made by Kraken): one window, at that page.
  useEffect(() => {
    studioOpener.open = (url) => {
      for (const item of windows.windows.filter((entry) => entry.kind === "studio" && entry.payload !== url)) windows.close(item.key);
      windows.open("studio", "Map Studio", url);
    };
    return () => {
      studioOpener.open = null;
    };
  });
  // The image window's map window closed by the GM: the image closes too.
  const mapWindowOpen = windows.windows.some((item) => item.kind === "map");
  const hadMapWindow = useRef(mapWindowOpen);
  useEffect(() => {
    if (hadMapWindow.current && !mapWindowOpen) onMapClosed?.();
    hadMapWindow.current = mapWindowOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapWindowOpen]);
  // The GM shared the map: it opens again, closed or not.
  const sharedSeen = useRef(session.mapShared);
  useEffect(() => {
    if (session.mapShared === sharedSeen.current) return;
    sharedSeen.current = session.mapShared;
    if (scene) windows.open("map", sceneName || "Map");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.mapShared]);
  // A player who holds no character is shown Character Selection on joining, as in FG.
  const offered = useRef(false);
  useEffect(() => {
    if (gm || offered.current || !session.selfId) return;
    offered.current = true;
    if (characters.length === 0) windows.open("charselect", "Character Selection");
  }, [gm, session.selfId, characters.length]);
  // The GM shows the players a picture: it opens on their screens, as FG's.
  useEffect(() => {
    if (session.imageShown && !gm) windows.open("images", "Pictures");
  }, [session.imageShown]);

  // The agent opens, closes, pops out and docks windows as the GM's clicks do.
  const live = useRef({ windows, launchers, characters, records: session.records, mapTitle: scene ? sceneName || "Map" : "" });
  live.current = { windows, launchers, characters, records: session.records, mapTitle: scene ? sceneName || "Map" : "" };
  useEffect(
    () =>
      agentCommands.register("windows", (command) => {
        if (command.kind !== "windows") return null;
        const { windows: manager, launchers: kinds, characters: sheets } = live.current;
        const list = () => manager.windows.map((item) => ({ key: item.key, kind: item.kind, title: item.title, poppedOut: item.popped }));
        if (command.action === "list") return { open: list(), kinds: [...kinds.map((item) => entryId(item)), "sheet", "book", "images", "picture", "note", "decals", "wallpapers", "gmicons", "towers", "deathmarkers", "krits", "dice", "charselect", "cards"] };
        let key: string = command.window ?? "";
        if (command.window === "note") {
          const id = String(command.record ?? "");
          if (!id) throw new Error("Which note? record is its id.");
          if (command.action === "open") manager.open("note", id, id);
          key = `note:${id}`;
        } else if (command.window === "picture") {
          // record: "<book>|<file>", a picture out on its own.
          const picture = String(command.record ?? "");
          if (!picture.includes("|")) throw new Error('Which picture? record is "<book id>|<file>" (kraken_books contents).');
          if (command.action === "open") manager.open("picture", picture.split("|")[1].split("/").pop() ?? picture, picture);
          key = `picture:${picture}`;
        } else if (command.window === "record") {
          // record: a record's id, or its name.
          const wanted = String(command.record ?? "");
          const found = live.current.records[wanted] ?? Object.values(live.current.records).find((item) => item.name.toLowerCase() === wanted.toLowerCase());
          if (!found) throw new Error(`No record "${wanted}" shown here.`);
          if (command.action === "open") manager.open("record", found.name, found.id);
          key = `record:${found.id}`;
        } else if (command.window === "book") {
          const book = String(command.record ?? "");
          if (!book) throw new Error("Which book? Give its id (kraken_books list).");
          if (command.action === "open") manager.open("book", book, book);
          key = `book:${book}`;
        } else if (command.window === "sheet") {
          const wanted = String(command.record ?? "").toLowerCase();
          const record = sheets.find((item) => item.id === command.record || item.name.toLowerCase() === wanted);
          if (!record) throw new Error(`No character "${command.record ?? ""}".`);
          if (command.action === "open") manager.open("sheet", record.name, record.id);
          key = `sheet:${record.id}`;
        } else {
          const launcher =
            command.window === "decals"
              ? { kind: "decals" as const, title: "Background Decal" }
              : command.window === "wallpapers"
                ? { kind: "wallpapers" as const, title: "Desktop Wallpaper" }
                : command.window === "dice"
                  ? { kind: "dice" as const, title: "Dice" }
                  : command.window === "map"
                    ? live.current.mapTitle
                      ? { kind: "map" as const, title: live.current.mapTitle }
                      : (() => {
                          throw new Error("No map is open on the table.");
                        })()
                  : command.window === "gmicons"
                    ? { kind: "gmicons" as const, title: "GM Icon" }
                  : command.window === "towers"
                    ? { kind: "towers" as const, title: "Dice Tower" }
                  : command.window === "deathmarkers"
                    ? { kind: "deathmarkers" as const, title: "Death Markers" }
                  : command.window === "charselect"
                    ? { kind: "charselect" as const, title: "Character Selection" }
                  : command.window === "krits"
                    ? { kind: "krits" as const, title: "Critical Hits & Fumbles" }
                  : command.window === "cards"
                    ? cardsStore.settings().on
                      ? { kind: "cards" as const, title: "Cards" }
                      : (() => {
                          throw new Error("Ability cards are off at this seat: turn them on in Settings first.");
                        })()
                  : kinds.find((item) => entryId(item) === command.window || (item.kind === command.window && !item.payload)) ?? kinds.find((item) => item.kind === command.window);
          if (!launcher) throw new Error(`No window "${command.window ?? ""}". Kinds: ${kinds.map((item) => entryId(item)).join(", ")}, sheet.`);
          if (command.action === "open") manager.open(launcher.kind, launcher.title, "payload" in launcher ? launcher.payload : undefined);
          // (The window's own key: "characters" is the sidebar's Characters, Character Selection's window.)
          if ("payload" in launcher && launcher.payload) key = `${launcher.kind}:${launcher.payload}`;
          else key = launcher.kind;
        }
        if (command.action === "open") return { opened: key };
        if (!manager.windows.some((item) => item.key === key)) throw new Error(`${key} is not open.`);
        if (command.action === "close") manager.close(key);
        if (command.action === "dock") manager.dockBack(key);
        if (command.action === "popout" && !manager.popOut(key)) throw new Error("The window could not pop out.");
        return { [command.action]: key };
      }),
    [],
  );
  const myEntry = session.combat.entries.find((entry) => entry.mine && entry.id === session.combat.active) ?? null;
  const myTurn = Boolean(myEntry);
  // A player's turn coming round, on their screen alone (the GM runs every
  // turn): a bell, and a banner across the screen, each as they chose
  // (Settings > You at the table; kept with their name).
  const alerts = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  const anyMapShown = useAnyMapShown();
  const wallpaperStyle = useWallpaperStyle(session);
  // The GM's theme for the table (Settings > Look): the page's colours, live on every screen; gone with the table.
  const theme = session.options.theme ?? "";
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);
  const turnRang = useRef("");
  // FG's Message of the Day: it opens on a player's screen as they join (once a sitting).
  const motdShown = useRef(false);
  // Only as they join (the first moments at the table): a message the GM writes mid-game waits for the sidebar.
  const joinedAt = useRef(Date.now());
  useEffect(() => {
    const motd = session.options.motd;
    if (gm || motdShown.current || !(motd?.text || motd?.links?.length)) return;
    if (Date.now() - joinedAt.current > 8000) {
      motdShown.current = true;
      return;
    }
    motdShown.current = true;
    windows.open("motd", "Message of the Day");
  }, [gm, session.options.motd]);
  // The GM reads boxed text aloud (books, stories, records): the buttons show on the GM's screen only.
  useEffect(() => {
    readAloud.register(gm ? session.sendReadAloud : null);
    return () => readAloud.register(null);
  }, [gm, session.sendReadAloud]);
  const [banner, setBanner] = useState<{ key: string; name: string } | null>(null);
  useEffect(() => {
    const key = myTurn ? `${session.combat.round}:${session.combat.active}` : "";
    if (!gm && key && key !== turnRang.current) {
      if (alerts.turnSound !== false) sound.yourTurn(session.ruleset);
      if (alerts.turnBanner !== false) setBanner({ key, name: myEntry?.name ?? "" });
    }
    if (!key) setBanner(null);
    turnRang.current = key;
  }, [myTurn, session.combat.round, session.combat.active]);
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 4200);
    return () => window.clearTimeout(timer);
  }, [banner]);

  return (
    <div className="shell desktop-shell" data-session={session.role}>
      <header className="menubar">
        <div className="brand">
          <Mark /> Kraken <span className="brand-version" title="Alpha test version">{__KRAKEN_VERSION__}</span>
        </div>
        <div ref={stripRef} className={portraits.length > 3 ? "portrait-strip compact" : "portrait-strip"} aria-label={gm ? "The party" : "Your characters"}>
          {portraits.map((entry) => {
            const active = session.combat.entries.some((item) => item.recordId === entry.id && item.id === session.combat.active);
            // The GM opens any sheet; a player their own. Whose it is shows beneath, as FG's.
            const opens = gm || (Boolean(me) && entry.owner === me);
            // Its holder away (/afk), idle or reconnecting: the portrait dims; a raised hand shows on it.
            const holder = entry.owner ? session.players.find((seat) => seat.role === "player" && seat.name === entry.owner) : undefined;
            const quiet = seatState(holder);
            const classes = ["portrait-chip", active ? "active" : "", entry.owner && !entry.online ? "away" : "", quiet ? "quiet" : "", opens ? "" : "theirs"].filter(Boolean).join(" ");
            return (
              <button
                key={entry.id}
                type="button"
                className={classes}
                data-portrait={entry.id}
                data-quiet={quiet || undefined}
                title={(opens ? `${entry.name}: open the sheet` : entry.owner ? `${entry.name} (${entry.owner})` : `${entry.name}: no one holds it yet; take it in Character Selection`) + (quiet ? ` · ${entry.owner} is ${quiet}` : "") + (gm && holder ? " · right-click: Ring bell, View as, Kick, Ban" : "")}
                onClick={() => (opens ? windows.open("sheet", entry.name, entry.id) : !entry.owner ? windows.open("charselect", "Character Selection") : undefined)}
                onContextMenu={gm && entry.owner ? (event) => playerMenu.open(entry.owner, event) : undefined}
                {...(opens ? slotDrag({ kind: "sheet", record: entry.id, label: entry.name }) : {})}
                // FG's share with one: a record, a note, a story or a picture dropped on a player's portrait (the GM's).
                {...(gm && entry.owner ? shareDrop(session, entry.owner) : {})}
              >
                <span className="chip-face">
                  {entry.portrait ? <Picture session={session} id={entry.portrait} alt="" still /> : entry.name.slice(0, 1)}
                  {active ? <i className="chip-turn-ring" aria-hidden="true" /> : null}
                </span>
                {active ? (
                  <span className="chip-turn" data-turn-badge>
                    Turn
                  </span>
                ) : null}
                <span className="chip-name">{entry.name}</span>
                <span className="chip-holder">{entry.owner || "Server"}</span>
                {holder?.hand ? (
                  <span className="chip-hand" aria-label={`${entry.owner} raised a hand`}>
                    <Icon name="raise" size={14} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="session-status">
          {myTurn ? <span className="turn-flag">Your turn</span> : null}
          {gm ? <PauseButton session={session} /> : <HandButton session={session} />}
          <span className="where">{gm ? `Hosting · ${session.players.length - 1} player${session.players.length === 2 ? "" : "s"}` : `At ${session.remoteLabel}`}</span>
          {!gm && savedSignIn(session.remoteLabel) ? (
            <button type="button" className="ghost" data-action="sign-out" onClick={() => session.signOut()} title="Sign this browser out of your account at this table, and leave">
              Sign out
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={() => session.leave()} title="Leave the table">
            <Icon name="leave" size={16} /> Leave
          </button>
        </div>
      </header>
      {/* The game's strips over the table for everyone (Fate: the scene's aspects and the GM's pool). */}
      {(manifestOf(session.ruleset).strips ?? []).map((ref) => {
        const Strip = PANELS[ref];
        return Strip ? <Strip key={ref} session={session} /> : null;
      })}
      {/* The GM's read-aloud with no map up: over the table. */}
      {!anyMapShown ? <ReadAloudBubble now={session.readAloudNow} onDone={session.dismissReadAloud} floating /> : null}
      <TurnCard session={session} />
      {banner ? (
        <div key={banner.key} className="turn-banner" role="alert" data-turn-banner={banner.name} onClick={() => setBanner(null)}>
          <span className="turn-banner-glow" aria-hidden="true" />
          <strong>Your turn</strong>
          {banner.name ? <span>{banner.name}</span> : null}
        </div>
      ) : null}

      <div className="desktop">
        <div className="desktop-surface" style={wallpaperStyle}>
          <div className="desktop-empty">
            <TableDecal session={session} />
            {scene ? null : gm ? emptyGM : <p className="desktop-hint">The GM has not opened a map yet.</p>}
          </div>
        </div>

        <Sidebar tools={tools} groups={groups} isOpen={entryOpen} onLaunch={launch} />

        <ChatDock session={session} />
        <ClocksStrip session={session} />
        {gm ? <UndoToast session={session} /> : null}

        <div className="window-layer">
          {windows.windows.map((item) =>
            item.kind === "map" ? (
              // The map's window (FG's image window): a window like the others, in front when it opens.
              <FloatingWindow key={item.key} item={item}>
                {scene ? (
                  <div className="map-window">
                    <div className="scene-bar">{sceneBar}</div>
                    {scene}
                  </div>
                ) : (
                  <p className="desktop-hint">No map is open.</p>
                )}
              </FloatingWindow>
            ) : (
            <FloatingWindow key={item.key} item={item}>
              {item.kind === "characters" ? <CharacterPanel session={session} create={String(item.payload ?? "").startsWith("new")} onTitle={(title) => windows.open("characters", title, item.payload)} /> : null}
              {item.kind === "records" ? <RecordsWindow session={session} only={item.payload} onOpen={(record) => windows.open("record", record.name, record.id)} /> : null}
              {item.kind === "adventure" && item.payload && gm ? <AdventureList session={session} kind={item.payload as AdventureKind} onStory={(path, name) => windows.open("story", name, path)} /> : null}
              {item.kind === "story" && item.payload && gm ? <StoryWindow session={session} path={item.payload} /> : null}
              {item.kind === "record" && item.payload ? <RecordWindow session={session} id={item.payload} /> : null}
              {item.kind === "bookrecord" && item.payload ? <BookRecordWindow session={session} book={item.payload.split("|")[0]} path={item.payload.split("|").slice(1).join("|")} /> : null}
              {item.kind === "charselect" ? <CharacterSelect session={session} onSheet={(id, name) => windows.open("sheet", name, id)} onWizard={openWizard} onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "sheet" ? <CharacterPanel session={session} selected={item.payload ?? null} /> : null}
              {item.kind === "party" ? <PartySheet session={session} /> : null}
              {item.kind === "imagelist" && gm ? <ImagesList session={session} /> : null}
              {item.kind === "assets" && gm ? <AssetsWindow session={session} /> : null}
              {item.kind === "studio" && gm ? <StudioWindow project={item.payload} /> : null}
              {item.kind === "cards" ? <CardsWindow session={session} characterId={item.payload} /> : null}
              {item.kind === "combat" ? <CombatTracker session={session} /> : null}
              {item.kind === "players" ? <PlayersWindow session={session} onMenu={gm ? playerMenu.open : undefined} /> : null}
              {item.kind === "settings" ? <SettingsWindow session={session} /> : null}
              {item.kind === "dice" ? <DiceWindow session={session} /> : null}
              {item.kind === "assistant" && gm ? <AssistantWindow /> : null}
              {item.kind === "sound" ? <SoundWindow session={session} /> : null}
              {item.kind === "books" ? <BooksWindow session={session} start={item.payload === "activation" ? "activation" : "books"} onOpenAdventure={gm ? onOpenAdventure : undefined} /> : null}
              {item.kind === "book" && item.payload ? <BookWindow session={session} book={item.payload} /> : null}
              {item.kind === "images" ? <ImagesWindow session={session} /> : null}
              {item.kind === "picture" && item.payload ? <PictureWindow session={session} payload={item.payload} /> : null}
              {item.kind === "notes" ? <NotesWindow session={session} /> : null}
              {item.kind === "calendar" ? <CalendarWindow session={session} /> : null}
              {item.kind === "effects" ? <EffectsWindow session={session} /> : null}
              {item.kind === "clocks" ? <ClocksWindow session={session} /> : null}
              {item.kind === "motd" ? <MotdWindow session={session} /> : null}
              {item.kind === "sessionlog" ? <SessionLogWindow session={session} /> : null}
              {item.kind === "note" && item.payload ? <NoteWindow session={session} id={item.payload} /> : null}
              {item.kind === "decals" ? <DecalPicker session={session} onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "wallpapers" ? <DecalPicker session={session} kind="wallpaper" onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "krits" ? <KritsWindow session={session} /> : null}
              {item.kind === "ships" ? <ShipsWindow session={session} openMaps={openMaps} /> : null}
              {item.kind === "oracles" ? <OraclesWindow session={session} /> : null}
              {item.kind === "delve" && gm ? <DelveWindow session={session} /> : null}
              {item.kind === "library" ? <LibraryWindow session={session} openMaps={openMaps} /> : null}
              {item.kind === "gmicons" ? <DecalPicker session={session} kind="gmicon" onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "deathmarkers" ? <DeathMarkersWindow session={session} /> : null}
              {item.kind === "towers" ? <DecalPicker session={session} kind="tower" onClose={() => windows.close(item.key)} /> : null}
            </FloatingWindow>
            ),
          )}
        </div>
        {/* Above the windows, as FG's hotkey bar: always there to drop onto. */}
        <QuickSlots session={session} />
        {overlay}
        <PauseVeil session={session} />
        <SceneTitleCard session={session} />
        <BellAndHands session={session} />
      </div>
      {gm ? <PlayerMenu session={session} menu={playerMenu.state} onClose={playerMenu.close} /> : null}
      <ReconnectBanner session={session} />
      {dice.show ? (
        <Suspense fallback={null}>
          <DiceLayer holdSeconds={session.options.diceHold} />
        </Suspense>
      ) : null}
    </div>
  );
}
