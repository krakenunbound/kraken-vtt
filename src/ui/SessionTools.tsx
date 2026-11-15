import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { qrModules, qrSvgPath } from "./qr";
import type { Seat, Session } from "../session/useSession";
import { sound } from "../sound/soundEngine";
import { Icon } from "./icons";
import "./session.css";

// The session's own controls, apart from the game: the connection coming back,
// the GM's pause, a bell rung for a player and a hand raised to the GM, the
// scene's title as the GM shares a map, a player gone quiet, and the GM's menu
// for a player (Ring bell, View as, Kick, Ban).

// The connection dropped: the table stays on screen, dimmed, while Kraken sits down again.
export function ReconnectBanner({ session }: { session: Session }) {
  const state = session.reconnecting;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [state]);
  if (!state) return null;
  const seconds = Math.max(0, Math.ceil((state.at - now) / 1000));
  return (
    <div className="reconnect-veil" data-reconnecting={state.attempt}>
      <div className="reconnect-banner" role="status" aria-live="polite">
        <span className="reconnect-spinner" aria-hidden="true" />
        <strong>Reconnecting…</strong>
        <span className="hint">{seconds > 0 ? `The connection to the table dropped. Trying again in ${seconds} s (attempt ${state.attempt}).` : `Trying again (attempt ${state.attempt})…`}</span>
        <button type="button" className="ghost" data-action="reconnect-leave" onClick={() => session.leave(true)}>
          Leave
        </button>
      </div>
    </div>
  );
}

// The GM has paused the game: a veil on the players' screens; on the GM's, a badge to go on.
export function PauseVeil({ session }: { session: Session }) {
  if (!session.options.paused) return null;
  if (session.role === "dm") {
    return (
      <div className="pause-badge" role="status" data-paused="gm">
        <Icon name="pause" size={16} /> Paused: the players wait
        <button type="button" className="ghost" data-action="resume" onClick={() => session.setPaused(false)}>
          <Icon name="play" size={14} /> Go on
        </button>
      </div>
    );
  }
  return (
    <div className="pause-veil" role="status" aria-live="polite" data-paused="player">
      <div className="pause-card">
        <Icon name="pause" size={40} />
        <strong>The GM has paused the game</strong>
        <span className="hint">Chat goes on; moves and rolls wait until the game goes on.</span>
      </div>
    </div>
  );
}

// The GM's Pause in the menubar (also /pause, and kraken_table_options paused).
export function PauseButton({ session }: { session: Session }) {
  const paused = Boolean(session.options.paused);
  return (
    <button
      type="button"
      className={paused ? "ghost icon-button on" : "ghost icon-button"}
      data-action="pause"
      aria-pressed={paused}
      aria-label={paused ? "Go on with the game" : "Pause the game"}
      title={paused ? "Paused: go on with the game" : "Pause the game: the players see a veil, and their moves and rolls wait (chat goes on)"}
      onClick={() => session.setPaused(!paused)}
    >
      <Icon name={paused ? "play" : "pause"} size={16} />
    </button>
  );
}

// A player's raised hand (to the GM), in the menubar.
export function HandButton({ session }: { session: Session }) {
  const me = session.players.find((seat) => seat.id === session.selfId);
  const up = Boolean(me?.hand);
  return (
    <button
      type="button"
      className={up ? "ghost icon-button on" : "ghost icon-button"}
      data-action="raise-hand"
      aria-pressed={up}
      aria-label={up ? "Lower your hand" : "Raise your hand"}
      title={up ? "Your hand is up: the GM has been told. Click to lower it." : "Raise your hand: the GM hears a chime and sees it by your name"}
      onClick={() => session.setPresence({ hand: !up })}
    >
      <Icon name="raise" size={16} />
    </button>
  );
}

// A bell rung for this player (a chime and a flash), and on the GM's screen a hand raised (a chime and a word).
export function BellAndHands({ session }: { session: Session }) {
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  const bellSeen = useRef(session.bell?.id ?? 0);
  const handSeen = useRef(session.handRaised?.id ?? 0);
  useEffect(() => {
    const bell = session.bell;
    if (!bell || bell.id === bellSeen.current) return;
    bellSeen.current = bell.id;
    sound.yourTurn(session.ruleset);
    setFlash({ id: bell.id, text: `${bell.from} rang your bell` });
  }, [session.bell]);
  useEffect(() => {
    const hand = session.handRaised;
    if (!hand || hand.id === handSeen.current || session.role !== "dm") return;
    handSeen.current = hand.id;
    sound.yourTurn(session.ruleset);
    setFlash({ id: hand.id, text: `${hand.name} raised a hand` });
  }, [session.handRaised]);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(timer);
  }, [flash]);
  if (!flash) return null;
  return (
    <div key={flash.id} className={session.role === "dm" ? "bell-flash hand" : "bell-flash"} role="status" data-bell={flash.text} onClick={() => setFlash(null)}>
      <Icon name={session.role === "dm" ? "raise" : "bell"} size={34} />
      <strong>{flash.text}</strong>
    </div>
  );
}

// The GM shared a map: its name across the players' screens for a moment, as a scene's title card.
export function SceneTitleCard({ session }: { session: Session }) {
  const [card, setCard] = useState<{ key: number; name: string } | null>(null);
  const seen = useRef(session.mapShared);
  useEffect(() => {
    if (session.mapShared === seen.current) return;
    seen.current = session.mapShared;
    if (session.role !== "dm" && session.mapShareName) setCard({ key: session.mapShared, name: session.mapShareName });
  }, [session.mapShared]);
  useEffect(() => {
    if (!card) return;
    const timer = window.setTimeout(() => setCard(null), 3600);
    return () => window.clearTimeout(timer);
  }, [card]);
  if (!card) return null;
  return (
    <div key={card.key} className="scene-title-card" aria-live="polite" data-scene-title={card.name}>
      <span className="scene-title-rule" aria-hidden="true" />
      <strong>{card.name}</strong>
      <span className="scene-title-rule" aria-hidden="true" />
    </div>
  );
}

// How long without a key, click or wheel before a player is shown as idle (their portrait dims).
function idleSeconds() {
  try {
    const kept = Number(window.localStorage.getItem("kraken-idle-seconds"));
    if (Number.isFinite(kept) && kept > 0) return kept;
  } catch {
    /* the default */
  }
  return 300;
}
export function useIdle(session: Session) {
  const player = session.role === "player" && Boolean(session.selfId);
  const idle = useRef(false);
  const setPresence = useRef(session.setPresence);
  setPresence.current = session.setPresence;
  useEffect(() => {
    if (!player) return;
    const limit = idleSeconds() * 1000;
    let last = Date.now();
    const active = () => {
      last = Date.now();
      if (idle.current) {
        idle.current = false;
        setPresence.current({ idle: false });
      }
    };
    const check = window.setInterval(() => {
      if (!idle.current && Date.now() - last >= limit) {
        idle.current = true;
        setPresence.current({ idle: true });
      }
    }, Math.min(5000, Math.max(250, limit / 4)));
    const events = ["pointerdown", "keydown", "wheel", "pointermove"] as const;
    for (const name of events) window.addEventListener(name, active, { passive: true });
    return () => {
      window.clearInterval(check);
      for (const name of events) window.removeEventListener(name, active);
    };
  }, [player]);
}

// A seat's state in words, for its row and its portrait (away, idle, a raised hand, reconnecting).
export function seatState(seat: Seat | undefined) {
  if (!seat) return "";
  if (seat.lost) return "reconnecting";
  if (seat.afk) return "away";
  if (seat.idle) return "idle";
  return "";
}

// The invite (the GM's Players window): a link that seats a player with the table's password
// already filled in (it rides in the link's #fragment, which a browser never sends to a server),
// a Copy button and a QR code for a phone or tablet; and whether the router opened the port.
export function InviteCard({ session }: { session: Session }) {
  const info = session.hostInfo;
  const invite = info?.invite;
  const links = invite ? [...(invite.internet ? [{ label: "Internet", url: invite.internet }] : []), ...invite.lan.map((url) => ({ label: `Network ${new URL(url).hostname}`, url }))] : [];
  const [chosen, setChosen] = useState(0);
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  const link = links[Math.min(chosen, links.length - 1)];
  const modules = useMemo(() => (link ? qrModules(link.url) : null), [link?.url]);
  if (!info || !link) return null;
  const copy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(link.url);
      ok = true;
    } catch {
      ok = (await window.kraken?.copy(link.url).catch(() => false)) !== false && Boolean(window.kraken);
    }
    setCopied(ok ? "copied" : "failed");
    window.setTimeout(() => setCopied(""), 1800);
  };
  const qr = modules ? qrSvgPath(modules) : null;
  return (
    <div className="invite-card" data-invite={link.url}>
      <h3>Invite</h3>
      {info.upnp ? (
        <p className="upnp-line hint" data-upnp={info.upnp.ok ? "mapped" : "failed"}>
          <Icon name={info.upnp.ok ? "check" : "warning"} size={14} />
          {info.upnp.ok ? `Your router opened port ${info.port} for the table (${info.upnp.method}); it closes again when you stop.` : info.upnp.error}
        </p>
      ) : null}
      {links.length > 1 ? (
        <div className="invite-row" role="radiogroup" aria-label="Which link">
          {links.map((item, index) => (
            <label key={item.url} className="hint">
              <input type="radio" name="invite-link" checked={index === chosen} onChange={() => setChosen(index)} /> {item.label}
            </label>
          ))}
        </div>
      ) : null}
      <div className="invite-row">
        <Icon name="link" size={15} />
        <span className="secret" title={link.url}>
          {link.url}
        </span>
        <button type="button" className="ghost" data-action="copy-invite" aria-live="polite" onClick={() => void copy()}>
          {copied === "copied" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}
        </button>
      </div>
      <p className="hint">{info.publicGame ? "Anyone with the link sits down." : "The link carries the table's password: a player opens it and only types their name."}</p>
      {qr ? (
        <details className="invite-qr-box" data-action="invite-qr">
          <summary>QR code, for a phone or tablet</summary>
          <div className="invite-qr" aria-label="QR code of the invite link" role="img">
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges">
              <path d={qr.path} fill="#000" />
            </svg>
          </div>
        </details>
      ) : (
        <p className="hint">The link is too long for a QR code; copy it instead.</p>
      )}
    </div>
  );
}

// The GM's menu for a player (a right-click on their row in Players, or on their portrait):
// Ring bell, View as, Kick, Ban. A popover at the pointer; arrow keys move through it.
export type PlayerMenuState = { name: string; x: number; y: number; keyboard: boolean } | null;
export function usePlayerMenu() {
  const [state, setState] = useState<PlayerMenuState>(null);
  const open = (name: string, event: ReactMouseEvent) => {
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    // A click from the keyboard (detail 0) opens it under the element; a pointer at the pointer.
    const keyboard = event.detail === 0 && event.type === "click";
    setState({ name, x: keyboard ? box.left : event.clientX, y: keyboard ? box.bottom : event.clientY, keyboard });
  };
  return { state, open, close: () => setState(null) };
}

export function PlayerMenu({ session, menu, onClose }: { session: Session; menu: PlayerMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !menu) return;
    opener.current = document.activeElement;
    element.style.left = `${Math.max(4, Math.min(menu.x, window.innerWidth - 220))}px`;
    element.style.top = `${Math.max(4, Math.min(menu.y, window.innerHeight - 220))}px`;
    if (!element.matches(":popover-open")) element.showPopover();
    const first = element.querySelector<HTMLButtonElement>("button:not(:disabled)");
    if (menu.keyboard) first?.focus();
    else first?.focus({ focusVisible: false } as FocusOptions);
  }, [menu]);
  if (!menu) return null;
  const seat = session.players.find((item) => item.role === "player" && item.name.toLowerCase() === menu.name.toLowerCase());
  const done = (run: () => void) => () => {
    run();
    ref.current?.hidePopover();
  };
  const items = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const list = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : (at + (event.key === "ArrowUp" ? -1 : 1) + list.length) % list.length;
    event.preventDefault();
    list[next]?.focus();
  };
  const viewing = Boolean(session.map.previewing) && (session.map.previewAs ?? "").toLowerCase() === menu.name.toLowerCase();
  return (
    <div
      ref={ref}
      className="player-menu"
      popover="auto"
      onToggle={(event) => {
        if ((event.nativeEvent as ToggleEvent).newState === "closed") {
          onClose();
          if (opener.current instanceof HTMLElement && !ref.current?.contains(document.activeElement)) opener.current.focus({ focusVisible: false } as FocusOptions);
        }
      }}
    >
      <div role="menu" aria-label={`${menu.name}`} onKeyDown={items}>
        <p className="player-menu-name" aria-hidden="true">
          {menu.name}
          {seat ? null : <small> (not at the table)</small>}
        </p>
        <button type="button" role="menuitem" data-menu="ring" disabled={!seat || seat.lost} onClick={done(() => session.ringPlayer(menu.name))}>
          <Icon name="bell" size={15} /> Ring bell
        </button>
        <button type="button" role="menuitem" data-menu="view-as" onClick={done(() => session.viewAs(viewing ? "" : menu.name))}>
          <Icon name="eye" size={15} /> {viewing ? "Stop viewing as them" : "View as"}
        </button>
        {seat?.hand ? (
          <button type="button" role="menuitem" data-menu="lower" onClick={done(() => session.setPresence({ hand: false }, menu.name))}>
            <Icon name="raise" size={15} /> Lower hand
          </button>
        ) : null}
        <button type="button" role="menuitem" data-menu="afk" disabled={!seat} onClick={done(() => session.setPresence({ afk: !seat?.afk }, menu.name))}>
          <Icon name="away" size={15} /> {seat?.afk ? "Mark back" : "Mark away"}
        </button>
        <hr />
        <button type="button" role="menuitem" data-menu="kick" disabled={!seat} onClick={done(() => session.kickPlayer(menu.name))}>
          <Icon name="leave" size={15} /> Kick
        </button>
        <button
          type="button"
          role="menuitem"
          className="danger"
          data-menu="ban"
          onClick={done(() => {
            if (window.confirm(`Ban ${menu.name}? They are sent away and cannot sit at this table again (by name, and from the address they came from) until you unban them in Players.`)) session.kickPlayer(menu.name, true);
          })}
        >
          <Icon name="ban" size={15} /> Ban…
        </button>
      </div>
    </div>
  );
}
