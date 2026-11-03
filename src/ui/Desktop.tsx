import { lazy, Suspense, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Picture } from "../characters/ArtPicker";
import { CharacterPanel } from "../characters/CharacterPanel";
import { CombatTracker } from "../combat/CombatTracker";
import { PartySheet } from "../party/PartySheet";
import type { Session } from "../session/useSession";
import { diceStore } from "../dice/diceStore";
import { agentCommands } from "./agentCommands";
import { ChatDock } from "./ChatDock";
import { Mark } from "./Emblem";
import { DecalPicker, SettingsWindow, TableDecal } from "./Settings";
import { DiceWindow } from "../dice/DiceWindow";
import { SoundWindow } from "../sound/SoundWindow";
import { QuickSlots } from "./QuickSlots";
import { BooksWindow, BookWindow, ImagesWindow, PictureWindow } from "../books/Books";
import { Icon } from "./icons";
import { FloatingWindow, useWindows, type WindowKind } from "./Windows";

// The 3D dice (three.js and cannon) load when the table first shows them.
const DiceLayer = lazy(() => import("../dice/DiceLayer"));

type Launcher = { kind: WindowKind; label: string; icon: string; title: string };

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
          <p>{info.publicGame ? "Public game: players leave the password blank." : <>Password <span className="secret">{info.password}</span></>}</p>
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
    </div>
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
  overlay,
}: {
  session: Session;
  scene: ReactNode | null;
  sceneBar: ReactNode;
  emptyGM: ReactNode;
  onOpenAdventure: () => void;
  overlay: ReactNode;
}) {
  const gm = session.role === "dm";
  const windows = useWindows();
  const characters = Object.values(session.records)
    .filter((record) => record.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));
  const portraits = gm ? characters.filter((record) => session.party?.members.some((member) => member.id === record.id)) : characters;
  const launchers: Launcher[] = gm
    ? [
        { kind: "characters", label: "Characters", icon: "character", title: "Characters" },
        { kind: "party", label: "Party", icon: "party", title: "Party Sheet" },
        { kind: "combat", label: "Combat", icon: "combat", title: "Combat Tracker" },
        { kind: "books", label: "Books", icon: "book", title: "Books" },
        { kind: "players", label: "Players", icon: "players", title: "Players" },
        { kind: "sound", label: "Sound", icon: "music", title: "Sound" },
        { kind: "settings", label: "Settings", icon: "settings", title: "Settings" },
      ]
    : [
        { kind: "characters", label: characters.length === 1 ? "Character" : "Characters", icon: "character", title: characters.length === 1 ? characters[0].name : "My characters" },
        { kind: "party", label: "Party", icon: "party", title: "Party Sheet" },
        { kind: "combat", label: "Combat", icon: "combat", title: "Combat Tracker" },
        { kind: "books", label: "Books", icon: "book", title: "Books" },
        { kind: "sound", label: "Sound", icon: "music", title: "Sound" },
        { kind: "settings", label: "Settings", icon: "settings", title: "Settings" },
      ];
  const dice = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  // The GM shows the players a picture: it opens on their screens, as FG's.
  useEffect(() => {
    if (session.imageShown && !gm) windows.open("images", "Pictures");
  }, [session.imageShown]);

  // The agent opens, closes, pops out and docks windows as the GM's clicks do.
  const live = useRef({ windows, launchers, characters });
  live.current = { windows, launchers, characters };
  useEffect(
    () =>
      agentCommands.register("windows", (command) => {
        if (command.kind !== "windows") return null;
        const { windows: manager, launchers: kinds, characters: sheets } = live.current;
        const list = () => manager.windows.map((item) => ({ key: item.key, kind: item.kind, title: item.title, poppedOut: item.popped }));
        if (command.action === "list") return { open: list(), kinds: [...kinds.map((item) => item.kind), "sheet", "book", "images", "picture", "decals", "wallpapers", "gmicons", "dice"] };
        let key: string = command.window ?? "";
        if (command.window === "picture") {
          // record: "<book>|<file>", a picture out on its own.
          const picture = String(command.record ?? "");
          if (!picture.includes("|")) throw new Error('Which picture? record is "<book id>|<file>" (kraken_books contents).');
          if (command.action === "open") manager.open("picture", picture.split("|")[1].split("/").pop() ?? picture, picture);
          key = `picture:${picture}`;
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

  return (
    <div className="shell desktop-shell" data-session={session.role}>
      <header className="menubar">
        <div className="brand">
          <Mark /> Kraken
        </div>
        <div className="portrait-strip" aria-label={gm ? "The party" : "Your characters"}>
          {portraits.map((record) => {
            const active = session.combat.entries.some((entry) => entry.recordId === record.id && entry.id === session.combat.active);
            return (
              <button
                key={record.id}
                type="button"
                className={active ? "portrait-chip active" : "portrait-chip"}
                title={`${record.name}: open the sheet`}
                onClick={() => windows.open("sheet", record.name, record.id)}
              >
                <span className="chip-face">
                  {typeof record.data.portrait === "string" && record.data.portrait ? <Picture session={session} id={record.data.portrait} alt="" /> : record.name.slice(0, 1)}
                </span>
                <span className="chip-name">{record.name}</span>
              </button>
            );
          })}
        </div>
        <div className="scene-bar">{sceneBar}</div>
        <div className="session-status">
          {myTurn ? <span className="turn-flag">Your turn</span> : null}
          <span className="where">{gm ? `Hosting · ${session.players.length - 1} player${session.players.length === 2 ? "" : "s"}` : `At ${session.remoteLabel}`}</span>
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
              data-launch={item.kind}
              title={item.title}
              onClick={() => windows.toggle(item.kind, item.title)}
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
              {item.kind === "characters" ? <CharacterPanel session={session} dock={!gm} /> : null}
              {item.kind === "sheet" ? <CharacterPanel session={session} dock selected={item.payload ?? null} /> : null}
              {item.kind === "party" ? <PartySheet session={session} /> : null}
              {item.kind === "combat" ? <CombatTracker session={session} /> : null}
              {item.kind === "players" ? <PlayersWindow session={session} /> : null}
              {item.kind === "settings" ? <SettingsWindow session={session} /> : null}
              {item.kind === "dice" ? <DiceWindow session={session} /> : null}
              {item.kind === "sound" ? <SoundWindow session={session} /> : null}
              {item.kind === "books" ? <BooksWindow session={session} onOpenAdventure={gm ? onOpenAdventure : undefined} /> : null}
              {item.kind === "book" && item.payload ? <BookWindow session={session} book={item.payload} /> : null}
              {item.kind === "images" ? <ImagesWindow session={session} /> : null}
              {item.kind === "picture" && item.payload ? <PictureWindow session={session} payload={item.payload} /> : null}
              {item.kind === "decals" ? <DecalPicker session={session} onClose={() => windows.close(item.key)} /> : null}
              {item.kind === "wallpapers" ? <DecalPicker session={session} kind="wallpaper" onClose={() => windows.close(item.key)} /> : null}
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
