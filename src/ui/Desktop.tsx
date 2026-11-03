import type { ReactNode } from "react";
import { Picture } from "../characters/ArtPicker";
import { CharacterPanel } from "../characters/CharacterPanel";
import { CombatTracker } from "../combat/CombatTracker";
import { PartySheet } from "../party/PartySheet";
import type { Session } from "../session/useSession";
import { ChatDock } from "./ChatDock";
import { Emblem, Mark } from "./Emblem";
import { Icon } from "./icons";
import { FloatingWindow, useWindows, type WindowKind } from "./Windows";

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
        { kind: "players", label: "Players", icon: "players", title: "Players" },
      ]
    : [
        { kind: "characters", label: characters.length === 1 ? "Character" : "Characters", icon: "character", title: characters.length === 1 ? characters[0].name : "My characters" },
        { kind: "party", label: "Party", icon: "party", title: "Party Sheet" },
        { kind: "combat", label: "Combat", icon: "combat", title: "Combat Tracker" },
      ];
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
        <div className="desktop-surface">
          {scene ?? (
            <div className="desktop-empty">
              <Emblem />
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
          {gm ? (
            <button type="button" className="launcher" data-launch="adventure" title="Open a Foundry adventure bundle" onClick={onOpenAdventure}>
              <Icon name="open" size={22} />
              <span>Open map</span>
            </button>
          ) : null}
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
            </FloatingWindow>
          ))}
        </div>
        {overlay}
      </div>
    </div>
  );
}
