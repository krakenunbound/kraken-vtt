import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Picture } from "../characters/ArtPicker";
import { CharacterPanel } from "../characters/CharacterPanel";
import { CharacterSelect } from "../characters/CharacterSelect";
import { RecordsWindow, RecordWindow } from "../books/Records";
import { CombatTracker } from "../combat/CombatTracker";
import { PartySheet } from "../party/PartySheet";
import { savedSignIn, type Session } from "../session/useSession";
import { diceStore } from "../dice/diceStore";
import { agentCommands } from "./agentCommands";
import { ChatDock } from "./ChatDock";
import { Mark } from "./Emblem";
import { DecalPicker, SettingsWindow, TableDecal } from "./Settings";
import { DiceWindow } from "../dice/DiceWindow";
import { SoundWindow } from "../sound/SoundWindow";
import { QuickSlots, slotDrag } from "./QuickSlots";
import { KritsWindow } from "../combat/KritsWindow";
import { LibraryWindow } from "../books/Library";
import { NotesWindow, NoteWindow } from "../notes/Notes";
import { BooksWindow, BookWindow, ImagesWindow, PictureWindow } from "../books/Books";
import { Icon } from "./icons";
import { sound } from "../sound/soundEngine";
import { FloatingWindow, useWindows, type WindowKind } from "./Windows";
import { AssistantWindow } from "./AssistantWindow";

// The 3D dice (three.js and cannon) load when the table first shows them.
const DiceLayer = lazy(() => import("../dice/DiceLayer"));

// launch: the button's data-launch when it is not the kind (the player's Characters button opening Character Selection).
type Launcher = { kind: WindowKind; label: string; icon: string; title: string; launch?: string };

// Everyone at the table, and how players connect (the GM's).
function PlayersWindow({ session }: { session: Session }) {
  const info = session.hostInfo;
  return (
    <div className="players-window">
      {info ? (
        <div className="share-card">
          <p>Players open one of these in a browser:</p>
          <p>
            This computer <span className="secret">http://127.0.0.1:{info.port}</span>
          </p>
          {info.lan
            ? info.addresses.map((address) => (
                <p key={address}>
                  Your network <span className="secret">http://{address}:{info.port}</span>
                </p>
              ))
            : null}
          {info.cloud && info.externalV4 ? (
            <p>
              Internet <span className="secret">http://{info.externalV4}:{info.port}</span>
            </p>
          ) : null}
          <p>{info.publicGame ? "Public game: players leave the table password blank." : <>Table password <span className="secret">{info.password}</span></>}</p>
        </div>
      ) : null}
      <h3>At the table</h3>
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
                <input type="password" aria-label={`New password for ${account.name}`} value={password} minLength={4} required onChange={(event) => setPassword(event.target.value)} placeholder="New password" />
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
        {session.accounts.list.length === 0 ? <li className="hint">No accounts yet.</li> : null}
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
        <input aria-label="New account password" type="password" placeholder="Password" value={makePassword} minLength={4} required onChange={(event) => setMakePassword(event.target.value)} />
        <button type="submit" data-action="account-create">
          Make account
        </button>
      </form>
    </section>
  );
}

// The GM's wallpaper tiles the desktop, darkened so the decal and windows stand out.
function wallpaperStyle(session: Session) {
  const url = session.options.wallpaper ? session.decalUrl(session.options.wallpaper, "wallpaper") : "";
  return url ? { backgroundImage: `linear-gradient(rgba(6, 8, 10, 0.42), rgba(6, 8, 10, 0.42)), url("${url}")`, backgroundSize: "auto, 384px 384px", backgroundRepeat: "repeat" } : undefined;
}

// The table for both sides, laid out as FG's desktop: the map (or the emblem)
// fills the screen; the sidebar on the right opens windows; chat with the
// dice tray sits bottom left; characters' portraits along the top.
export function Desktop({
  session,
  scene,
  sceneBar,
  emptyGM,
  onOpenAdventure,
  openMaps = async () => undefined,
  overlay,
}: {
  session: Session;
  scene: ReactNode | null;
  sceneBar: ReactNode;
  emptyGM: ReactNode;
  onOpenAdventure: () => void;
  // Opens a map bundle on the table (an FG module's maps from the Library).
  openMaps?: (bytes: Uint8Array, name: string) => Promise<unknown>;
  overlay: ReactNode;
}) {
  const gm = session.role === "dm";
  const windows = useWindows();
  const characters = Object.values(session.records)
    .filter((record) => record.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));
  // FG's character list along the top: every character at the table, for both sides.
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const portraits = session.roster;
  const launchers: Launcher[] = gm
    ? [
        { kind: "characters", label: "Characters", icon: "character", title: "Characters" },
        { kind: "party", label: "Party", icon: "party", title: "Party Sheet" },
        { kind: "combat", label: "Combat", icon: "combat", title: "Combat Tracker" },
        { kind: "books", label: "Books", icon: "book", title: "Books" },
        { kind: "library", label: "Library", icon: "map", title: "Library: an adventure's maps, encounters, NPCs, parcels and tables" },
        { kind: "records", label: "Lists", icon: "shield", title: "Lists" },
        { kind: "notes", label: "Notes", icon: "chat", title: "Notes" },
        { kind: "assistant", label: "Assistant", icon: "sparkle", title: "DM Assistant" },
        { kind: "players", label: "Players", icon: "players", title: "Players" },
        { kind: "sound", label: "Sound", icon: "music", title: "Sound" },
        { kind: "settings", label: "Settings", icon: "settings", title: "Settings" },
      ]
    : [
        // With no character yet, FG's Characters button opens Character Selection.
        characters.length === 0
          ? { kind: "charselect", label: "Characters", icon: "character", title: "Character Selection", launch: "characters" }
          : { kind: "characters", label: characters.length === 1 ? "Character" : "Characters", icon: "character", title: characters.length === 1 ? characters[0].name : "My characters" },
        { kind: "party", label: "Party", icon: "party", title: "Party Sheet" },
        { kind: "combat", label: "Combat", icon: "combat", title: "Combat Tracker" },
        { kind: "books", label: "Books", icon: "book", title: "Books" },
        { kind: "records", label: "Lists", icon: "shield", title: "Lists" },
        { kind: "notes", label: "Notes", icon: "chat", title: "Player Notes" },
        { kind: "sound", label: "Sound", icon: "music", title: "Sound" },
        { kind: "settings", label: "Settings", icon: "settings", title: "Settings" },
      ];
  const dice = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  // A sheet whose character this seat may no longer see (the GM took it back) closes.
  useEffect(() => {
    for (const item of windows.windows) if (item.kind === "sheet" && item.payload && !session.records[item.payload]) windows.close(item.key);
  }, [session.records]);
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
  const live = useRef({ windows, launchers, characters, records: session.records });
  live.current = { windows, launchers, characters, records: session.records };
  useEffect(
    () =>
      agentCommands.register("windows", (command) => {
        if (command.kind !== "windows") return null;
        const { windows: manager, launchers: kinds, characters: sheets } = live.current;
        const list = () => manager.windows.map((item) => ({ key: item.key, kind: item.kind, title: item.title, poppedOut: item.popped }));
        if (command.action === "list") return { open: list(), kinds: [...kinds.map((item) => item.kind), "sheet", "book", "images", "picture", "note", "decals", "wallpapers", "gmicons", "krits", "dice", "charselect"] };
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
                  : command.window === "gmicons"
                    ? { kind: "gmicons" as const, title: "GM Icon" }
                  : command.window === "charselect"
                    ? { kind: "charselect" as const, title: "Character Selection" }
                  : command.window === "krits"
                    ? { kind: "krits" as const, title: "Critical Hits & Fumbles" }
                  : kinds.find((item) => item.kind === command.window);
          if (!launcher) throw new Error(`No window "${command.window ?? ""}". Kinds: ${kinds.map((item) => item.kind).join(", ")}, sheet.`);
          if (command.action === "open") manager.open(launcher.kind, launcher.title);
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
  const myTurn = session.combat.entries.some((entry) => entry.mine && entry.id === session.combat.active);
  // A player's turn coming round rings once, on their screen alone (the GM runs every turn).
  const turnRang = useRef("");
  useEffect(() => {
    const key = myTurn ? `${session.combat.round}:${session.combat.active}` : "";
    if (!gm && key && key !== turnRang.current) sound.yourTurn();
    turnRang.current = key;
  }, [myTurn, session.combat.round, session.combat.active]);

  return (
    <div className="shell desktop-shell" data-session={session.role}>
      <header className="menubar">
        <div className="brand">
          <Mark /> Kraken <span className="brand-version" title="Alpha test version">{__KRAKEN_VERSION__}</span>
        </div>
        <div className={portraits.length > 3 ? "portrait-strip compact" : "portrait-strip"} aria-label={gm ? "The party" : "Your characters"}>
          {portraits.map((entry) => {
            const active = session.combat.entries.some((item) => item.recordId === entry.id && item.id === session.combat.active);
            // The GM opens any sheet; a player their own. Whose it is shows beneath, as FG's.
            const opens = gm || (Boolean(me) && entry.owner === me);
            const classes = ["portrait-chip", active ? "active" : "", entry.owner && !entry.online ? "away" : "", opens ? "" : "theirs"].filter(Boolean).join(" ");
            return (
              <button
                key={entry.id}
                type="button"
                className={classes}
                data-portrait={entry.id}
                title={opens ? `${entry.name}: open the sheet` : entry.owner ? `${entry.name} (${entry.owner})` : `${entry.name}: no one holds it yet; take it in Character Selection`}
                onClick={() => (opens ? windows.open("sheet", entry.name, entry.id) : !entry.owner ? windows.open("charselect", "Character Selection") : undefined)}
                {...(opens ? slotDrag({ kind: "sheet", record: entry.id, label: entry.name }) : {})}
              >
                <span className="chip-face">{entry.portrait ? <Picture session={session} id={entry.portrait} alt="" /> : entry.name.slice(0, 1)}</span>
                <span className="chip-name">{entry.name}</span>
                <span className="chip-holder">{entry.owner || "Server"}</span>
              </button>
            );
          })}
        </div>
        <div className="scene-bar">{sceneBar}</div>
        <div className="session-status">
          {myTurn ? <span className="turn-flag">Your turn</span> : null}
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

      <div className="desktop">
        <div className="desktop-surface" style={wallpaperStyle(session)}>
          {scene ?? (
            <div className="desktop-empty">
              <TableDecal session={session} />
              {gm ? emptyGM : <p className="desktop-hint">The GM has not opened a map yet.</p>}
            </div>
          )}
        </div>

        <nav className="sidebar" aria-label="Open">
          {launchers.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={windows.isOpen(item.kind) ? "launcher open" : "launcher"}
              data-launch={item.launch ?? item.kind}
              title={item.title}
              onClick={() => (item.kind === "charselect" ? windows.open(item.kind, item.title) : windows.toggle(item.kind, item.title))}
            >
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
              {item.kind === "combat" && session.combat.round > 0 ? <i className="launcher-badge">{session.combat.round}</i> : null}
            </button>
          ))}
        </nav>

        <ChatDock session={session} />

        <div className="window-layer">
          {windows.windows.map((item) => (
            <FloatingWindow key={item.key} item={item}>
              {item.kind === "characters" ? <CharacterPanel session={session} dock={!gm} create={item.payload === "new"} /> : null}
              {item.kind === "records" ? <RecordsWindow session={session} onOpen={(record) => windows.open("record", record.name, record.id)} /> : null}
              {item.kind === "record" && item.payload ? <RecordWindow session={session} id={item.payload} /> : null}
              {item.kind === "charselect" ? <CharacterSelect session={session} onSheet={(id, name) => windows.open("sheet", name, id)} onWizard={() => windows.open("characters", "Character Wizard", "new")} onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "sheet" ? <CharacterPanel session={session} dock selected={item.payload ?? null} /> : null}
              {item.kind === "party" ? <PartySheet session={session} /> : null}
              {item.kind === "combat" ? <CombatTracker session={session} /> : null}
              {item.kind === "players" ? <PlayersWindow session={session} /> : null}
              {item.kind === "settings" ? <SettingsWindow session={session} /> : null}
              {item.kind === "dice" ? <DiceWindow session={session} /> : null}
              {item.kind === "assistant" && gm ? <AssistantWindow /> : null}
              {item.kind === "sound" ? <SoundWindow session={session} /> : null}
              {item.kind === "books" ? <BooksWindow session={session} onOpenAdventure={gm ? onOpenAdventure : undefined} /> : null}
              {item.kind === "book" && item.payload ? <BookWindow session={session} book={item.payload} /> : null}
              {item.kind === "images" ? <ImagesWindow session={session} /> : null}
              {item.kind === "picture" && item.payload ? <PictureWindow session={session} payload={item.payload} /> : null}
              {item.kind === "notes" ? <NotesWindow session={session} /> : null}
              {item.kind === "note" && item.payload ? <NoteWindow session={session} id={item.payload} /> : null}
              {item.kind === "decals" ? <DecalPicker session={session} onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "wallpapers" ? <DecalPicker session={session} kind="wallpaper" onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "krits" ? <KritsWindow session={session} /> : null}
              {item.kind === "library" ? <LibraryWindow session={session} openMaps={openMaps} /> : null}
              {item.kind === "gmicons" ? <DecalPicker session={session} kind="gmicon" onClose={() => windows.close(item.key)} /> : null}
            </FloatingWindow>
          ))}
        </div>
        {/* Above the windows, as FG's hotkey bar: always there to drop onto. */}
        <QuickSlots session={session} />
        {overlay}
      </div>
      {dice.show ? (
        <Suspense fallback={null}>
          <DiceLayer />
        </Suspense>
      ) : null}
    </div>
  );
}
