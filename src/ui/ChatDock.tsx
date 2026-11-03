import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChatLine, RollResult, Session } from "../session/useSession";
import { diceStore, rolling, setThrow, tower as towerDrops, type DiceLook } from "../dice/diceStore";
import { DieShape, Icon } from "./icons";
import { openPopOut, PopOutWindow, screenOffset, type ScreenPlace } from "./PopOut";

// Where chat last was in a window of its own (in this browser).
function chatPlace(): ScreenPlace | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem("kraken-window:chat") ?? "null");
    return saved && Number.isFinite(saved.sx) ? saved : null;
  } catch {
    return null;
  }
}

// How big the chat is in the main window (stretched from its top-right corner), in this browser.
type ChatSize = { w: number; h: number } | null;
function chatSize(): ChatSize {
  try {
    const saved = JSON.parse(window.localStorage.getItem("kraken-chat-size") ?? "null");
    return saved && Number.isFinite(saved.w) && Number.isFinite(saved.h) ? saved : null;
  } catch {
    return null;
  }
}

function rememberChat(place: ScreenPlace | null) {
  try {
    window.localStorage.setItem("kraken-window:chat", JSON.stringify(place));
  } catch {
    /* only the place is lost */
  }
}

const TRAY = [4, 6, 8, 10, 12, 20, 100];
// FG's right-click on a tray die: roll that many of it at once.
const MANY = [20, 15, 10, 5, 4, 3, 2];
// Dice with no shape of their own (FG's Custom Dice): rolled in chat.
const CUSTOM = [2, 3, 16, 30];
// FG's modifier box: quick values on a right-click.
const QUICK = [10, 5, 4, 3, 2, 1, -1, -2, -3, -4, -5, -10];

// The tray's dice drawn in 3D in this seat's set (three.js loads for it).
function useTrayArt(look: DiceLook) {
  const [art, setArt] = useState<Record<number, string>>({});
  const key = JSON.stringify(look);
  useEffect(() => {
    let live = true;
    import("../dice/trayArt")
      .then(({ renderTray }) => renderTray(look))
      .then((pictures) => live && setArt(pictures))
      .catch(() => live && setArt({}));
    return () => {
      live = false;
    };
    // The look is compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return art;
}

// A roll as FG shows it in chat: what it was for, each die (dropped dice
// faded), the modifier, and the total. While its dice are still rolling on
// the table it shows only what was rolled.
// The dice on a card wear the roller's set (the look the roll carries).
export function RollCard({ roll, pending = false }: { roll: RollResult; pending?: boolean }) {
  const look = (roll as { look?: DiceLook }).look;
  if (pending) {
    return (
      <span className="roll-card rolling" data-rolling="true">
        {roll.label ? <span className="roll-label">{roll.label}</span> : null}
        <span className="roll-dice">
          {roll.terms.flatMap((term, index) =>
            term.kind === "dice"
              ? term.rolls.map((_, die) => (
                  <span key={`${index}-${die}`} className="die spinning">
                    <DieShape sides={term.sides === 100 ? 10 : term.sides} size={28} label="" look={look} />
                  </span>
                ))
              : [],
          )}
        </span>
        <span className="roll-formula">{roll.formula}</span>
      </span>
    );
  }
  return (
    <span className="roll-card" data-total={roll.total}>
      {roll.label ? <span className="roll-label">{roll.label}</span> : null}
      <span className="roll-dice">
        {roll.terms.map((term, index) =>
          term.kind === "number" ? (
            <span key={index} className="roll-mod">
              {term.sign < 0 ? "−" : "+"}
              {term.value}
            </span>
          ) : (
            term.rolls.map((value, die) => (
              <span key={`${index}-${die}`} className={term.kept[die] ? "die" : "die dropped"} title={`d${term.sides}`}>
                <DieShape sides={term.sides === 100 ? 10 : term.sides} size={28} label={value} look={look} />
              </span>
            ))
          ),
        )}
      </span>
      <span className="roll-formula">{roll.formula}</span>
      {roll.result ? <span className={`roll-result ${roll.result === "HIT" || roll.result === "SAVED" ? "hit" : roll.result === "MISS" || roll.result === "FAILED" ? "miss" : "none"}`}>{roll.result}</span> : null}
      <b className="roll-total">{roll.total}</b>
    </span>
  );
}

function Line({ line }: { line: ChatLine }) {
  useSyncExternalStore(rolling.subscribe, rolling.version);
  const system = line.from === "Combat";
  const kind = system ? "chat-line system" : line.secret || line.tower ? "chat-line secret" : "chat-line";
  return (
    <div className={kind} data-from={line.from}>
      {!system ? <b className="chat-from">{line.from}</b> : null}
      {line.secret ? <span className="chat-tag">{line.shownTo ? "GM and you" : "GM only"}</span> : null}
      {line.tower ? <span className="chat-tag">To the GM</span> : null}
      {line.roll ? <RollCard roll={line.roll} pending={rolling.has(line)} /> : <span className="chat-text">{line.text}</span>}
    </div>
  );
}

function formulaOf(dice: number[]) {
  const counts = new Map<number, number>();
  for (const sides of dice) counts.set(sides, (counts.get(sides) ?? 0) + 1);
  return [...counts].map(([sides, count]) => `${count}d${sides}`).join("+");
}

// "/r 1d20+3 Strength check" (or /roll) rolls; anything else is said.
function submit(session: Session, draft: string, modifier: number, tower: boolean) {
  const command = /^\/(?:r|roll)\s+(\S+)\s*(.*)$/i.exec(draft.trim());
  if (command) session.roll(withModifier(command[1], modifier), command[2], "", tower);
  else session.sendChat(draft);
}

function withModifier(formula: string, modifier: number) {
  if (!modifier) return formula;
  return `${formula}${modifier > 0 ? "+" : ""}${modifier}`;
}

// The chat window (FG's, bottom left): the log, a line to type in, the dice
// tray (click dice to gather a pool, then roll), the modifier box, and the
// dice tower (a roll only the GM sees).
export function ChatDock({ session }: { session: Session }) {
  const [draft, setDraft] = useState("");
  const [pool, setPool] = useState<number[]>([]);
  const [modifier, setModifier] = useState(0);
  const [tower, setTower] = useState(false);
  const [size, setSize] = useState<ChatSize>(chatSize);
  // A right-click menu over the tray: how many of a die to roll, or the modifier's quick values.
  const [menu, setMenu] = useState<{ x: number; y: number; sides: number | null; custom?: boolean } | null>(null);
  // This seat's own set, on the tray's dice (the GM's too).
  const diceSettings = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  const mine = diceSettings.look;
  const traySize = Math.round(29 * Math.min(1.6, Math.max(0.6, diceSettings.tray ?? 1)));
  const trayArt = useTrayArt(mine);
  const trayDie = (sides: number, size: number) =>
    trayArt[sides] ? (
      <img className="tray-die-3d" src={trayArt[sides]} width={size} height={size} alt="" draggable={false} />
    ) : (
      <DieShape sides={sides === 100 ? 10 : sides} size={size - 8} label={sides === 100 ? "%" : sides} look={mine} />
    );
  useEffect(() => {
    if (!menu) return;
    const view = dock.current?.ownerDocument.defaultView ?? window;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".tray-menu")) return;
      setMenu(null);
    };
    view.addEventListener("pointerdown", close, true);
    view.addEventListener("keydown", close);
    return () => {
      view.removeEventListener("pointerdown", close, true);
      view.removeEventListener("keydown", close);
    };
  }, [menu]);  // A die being dragged from the tray, to throw or to drop in the tower.
  const [ghost, setGhost] = useState<{ x: number; y: number; sides: number | null; overTower: boolean } | null>(null);
  const dragged = useRef(false);
  const towerButton = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  // Chat in a window of its own, for another monitor.
  const [out, setOut] = useState<Window | null>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [session.chat.length, out]);
  // Left out last time: out again (the app allows it; a browser may not).
  useEffect(() => {
    const place = chatPlace();
    if (!place) return;
    const child = openPopOut("Chat", place);
    if (child) setOut(child);
    return () => child?.close();
  }, []);
  // It goes when the table does.
  useEffect(() => {
    if (!out) return;
    const close = () => out.close();
    window.addEventListener("pagehide", close);
    return () => {
      window.removeEventListener("pagehide", close);
      close();
    };
  }, [out]);
  const popOut = () => {
    const rect = dock.current?.getBoundingClientRect();
    const offset = screenOffset();
    const place = { sx: offset.x + (rect?.left ?? 12), sy: offset.y + (rect?.top ?? 200), w: rect?.width ?? 380, h: rect?.height ?? 460 };
    const child = openPopOut("Chat", place);
    if (!child) return;
    rememberChat(place);
    setOut(child);
  };
  const bringBack = () => {
    out?.close();
    rememberChat(null);
    setOut(null);
  };

  const poolFormula = () => formulaOf(pool);

  // A roll into the tower the roller will not see: the dice still drop in.
  const dropInTower = (dice: number[], from?: { x: number; y: number }) => {
    if (session.role === "dm" || session.options.towerReveal || out) return;
    const rect = towerButton.current?.getBoundingClientRect();
    if (!rect) return;
    // Dropped right on the tower, they still tumble in from just beside it.
    const near = from && Math.hypot(from.x - rect.left, from.y - rect.top) > 90;
    const start = near && from ? from : { x: rect.left - 120, y: rect.top - 160 };
    towerDrops.drop({ sides: dice, from: { x: start.x / window.innerWidth, y: start.y / window.innerHeight, vx: 0, vy: 0 }, to: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } });
  };
  const rollDice = (dice: number[], inTower: boolean, from?: { x: number; y: number }) => {
    if (dice.length === 0) return;
    session.roll(withModifier(formulaOf(dice), modifier), "", "", inTower);
    if (inTower) dropInTower(dice, from);
    setPool([]);
    setModifier(0);
  };
  const rollPool = () => rollDice(pool, tower);

  // FG's tray: drag a die (or the pool) out and let go to throw it the way
  // the hand moved, or drop it on the dice tower. A click adds it to the pool.
  const startDrag = (event: React.PointerEvent, sides: number | null) => {
    if (event.button !== 0) return;
    const view = event.currentTarget.ownerDocument.defaultView ?? window;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let samples: { x: number; y: number; t: number }[] = [];
    const overTower = (x: number, y: number) => Boolean(view.document.elementFromPoint(x, y)?.closest(".tower"));
    const move = (moveEvent: PointerEvent) => {
      if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 10) dragging = true;
      if (!dragging) return;
      const now = performance.now();
      samples = [...samples.filter((sample) => now - sample.t < 140), { x: moveEvent.clientX, y: moveEvent.clientY, t: now }];
      setGhost({ x: moveEvent.clientX, y: moveEvent.clientY, sides, overTower: overTower(moveEvent.clientX, moveEvent.clientY) });
    };
    const up = (upEvent: PointerEvent) => {
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerup", up);
      view.removeEventListener("pointercancel", up);
      setGhost(null);
      if (!dragging) return;
      dragged.current = true;
      view.setTimeout(() => (dragged.current = false), 0);
      const dice = sides ? [...pool, sides] : pool;
      if (overTower(upEvent.clientX, upEvent.clientY)) {
        rollDice(dice, true, { x: upEvent.clientX, y: upEvent.clientY });
        return;
      }
      // Thrown on the table (the main window's): the dice leave the hand there, that fast.
      if (view === window) {
        const first = samples.find((sample) => performance.now() - sample.t >= 30) ?? samples[0];
        const seconds = first ? Math.max(0.016, (performance.now() - first.t) / 1000) : 1;
        let vx = first ? (upEvent.clientX - first.x) / seconds / window.innerWidth : 0;
        let vy = first ? (upEvent.clientY - first.y) / seconds / window.innerHeight : 0;
        if (Math.hypot(vx, vy) < 0.15) {
          // Let go without a throw: they tumble out toward the middle.
          const dx = 0.5 - upEvent.clientX / window.innerWidth;
          const dy = 0.45 - upEvent.clientY / window.innerHeight;
          const length = Math.hypot(dx, dy) || 1;
          vx = (dx / length) * 0.5;
          vy = (dy / length) * 0.5;
        }
        setThrow({ x: upEvent.clientX / window.innerWidth, y: upEvent.clientY / window.innerHeight, vx, vy });
      }
      rollDice(dice, tower, { x: upEvent.clientX, y: upEvent.clientY });
    };
    view.addEventListener("pointermove", move);
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", up);
  };

  // Stretch the chat from its top-right corner: up for taller, right for wider.
  const stretch = (event: React.PointerEvent) => {
    if (event.button !== 0 || !dock.current) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, w: dock.current.offsetWidth, h: dock.current.offsetHeight };
    const room = dock.current.parentElement?.getBoundingClientRect();
    const move = (moveEvent: PointerEvent) => {
      const w = Math.round(Math.min((room?.width ?? window.innerWidth) - 24, Math.max(280, start.w + moveEvent.clientX - start.x)));
      const h = Math.round(Math.min((room?.height ?? window.innerHeight) - 24, Math.max(220, start.h - (moveEvent.clientY - start.y))));
      setSize({ w, h });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSize((now) => {
        try {
          window.localStorage.setItem("kraken-chat-size", JSON.stringify(now));
        } catch {
          /* only this browser forgets */
        }
        return now;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resetSize = () => {
    setSize(null);
    try {
      window.localStorage.removeItem("kraken-chat-size");
    } catch {
      /* nothing kept */
    }
  };

  const body = (
    <section className={out ? "chat-dock popped" : "chat-dock"} aria-label="Chat" ref={dock} style={!out && size ? { width: size.w, height: size.h } : undefined}>
      {out ? null : <span className="chat-grip" role="separator" aria-label="Stretch the chat" title="Drag to stretch the chat; double-click for its usual size" onPointerDown={stretch} onDoubleClick={resetSize} />}
      <button
        type="button"
        className="chat-popout"
        title={out ? "Back into the main window" : "Out to a window of its own (for another monitor)"}
        aria-label={out ? "Put chat back in the main window" : "Pop out chat"}
        onClick={out ? bringBack : popOut}
      >
        <Icon name={out ? "dock" : "popout"} size={15} />
      </button>
      <div className="chat-log" aria-live="polite" ref={log}>
        {session.chat.length === 0 ? <p className="hint">The table is quiet.</p> : null}
        {session.chat.map((line, index) => (
          <Line key={`${line.at}-${index}`} line={line} />
        ))}
      </div>
      <form
        className="chat-entry"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          submit(session, draft, modifier, tower);
          if (tower) {
            const command = /^\/(?:r|roll)\s+(\S+)/i.exec(draft.trim());
            if (command) dropInTower([...command[1].matchAll(/d(\d+|%)/gi)].map((match) => (match[1] === "%" ? 100 : Number(match[1]))));
          }
          setDraft("");
          setModifier(0);
        }}
      >
        <input aria-label="Message" value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder="Say something, or /r 1d20+2 Strength" />
        <button type="submit" aria-label="Send">
          <Icon name="chat" />
        </button>
      </form>
      <div className="dice-tray" aria-label="Dice tray" style={{ ["--tray-glow" as string]: mine.accent ?? mine.body }}>
        {TRAY.map((sides) => (
          <button
            key={sides}
            type="button"
            className="tray-die"
            title={`Pick up a d${sides} and throw it: drag out and let go, or drop it on the dice tower. Click adds it to the pool; right-click rolls several.`}
            aria-label={`d${sides}`}
            onPointerDown={(event) => startDrag(event, sides)}
            onClick={() => {
              if (!dragged.current) setPool([...pool, sides]);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY, sides });
            }}
          >
            {trayDie(sides, traySize)}
          </button>
        ))}
        <div
          className={modifier ? "modifier-box set" : "modifier-box"}
          title="Modifier for the next roll (FG's modifier box): the wheel or the buttons change it, a right-click picks one"
          onWheel={(event) => setModifier(modifier + (event.deltaY < 0 ? 1 : -1))}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, sides: null });
          }}
        >
          <button type="button" aria-label="Modifier down" onClick={() => setModifier(modifier - 1)}>
            −
          </button>
          <span className="modifier-value">
            <input aria-label="Modifier" type="number" value={modifier} onChange={(event) => setModifier(Number(event.target.value) || 0)} />
            <small>Modifier</small>
          </span>
          <button type="button" aria-label="Modifier up" onClick={() => setModifier(modifier + 1)}>
            +
          </button>
        </div>
        <button
          type="button"
          ref={towerButton}
          className={["tower", tower ? "on" : "", ghost?.overTower ? "drop" : ""].filter(Boolean).join(" ")}
          aria-pressed={tower}
          title={
            session.role === "dm"
              ? "Dice tower: your rolls stay hidden from players. Drop dice here, or click to roll everything in it"
              : session.options.towerReveal
                ? "Dice tower: the GM and you see the roll. Drop dice here, or click to roll everything in it"
                : "Dice tower: only the GM sees the roll. Drop dice here, or click to roll everything in it"
          }
          onClick={() => setTower(!tower)}
        >
          <Icon name="tower" size={20} />
        </button>
      </div>
      {ghost ? (
        <span className={ghost.overTower ? "dice-ghost over-tower" : "dice-ghost"} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {(ghost.sides ? [...pool, ghost.sides] : pool).slice(-6).map((sides, index) => (
            <span key={index}>{trayDie(sides, 46)}</span>
          ))}
        </span>
      ) : null}
      {menu ? (
        <div className="tray-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          {menu.sides === null ? (
            <>
              {QUICK.map((value) => (
                <button key={value} type="button" role="menuitem" onClick={() => (setModifier(modifier + value), setMenu(null))}>
                  {value > 0 ? `+${value}` : `−${-value}`}
                </button>
              ))}
              <button type="button" role="menuitem" onClick={() => (setModifier(0), setMenu(null))}>
                Clear
              </button>
            </>
          ) : menu.custom ? (
            <>
              <button type="button" role="menuitem" className="tray-menu-head" onClick={() => setMenu({ ...menu, custom: false })}>
                ‹ Custom Dice
              </button>
              {CUSTOM.map((sides) => (
                <button key={sides} type="button" role="menuitem" onClick={() => (rollDice([sides], tower), setMenu(null))}>
                  Roll a d{sides}
                </button>
              ))}
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="tray-menu-head" onClick={() => setMenu({ ...menu, custom: true })}>
                Custom Dice ›
              </button>
              {MANY.map((count) => (
                <button key={count} type="button" role="menuitem" data-many={count} onClick={() => (rollDice(Array(count).fill(menu.sides), tower), setMenu(null))}>
                  <b>{count}×</b> Roll {count} d{menu.sides === 100 ? "%" : menu.sides}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
      {pool.length > 0 ? (
        <div className="dice-pool">
          <span>
            {poolFormula()}
            {modifier ? (modifier > 0 ? ` + ${modifier}` : ` − ${-modifier}`) : ""}
          </span>
          <button type="button" className="play-button" title="Click to roll, or drag out and throw" onPointerDown={(event) => startDrag(event, null)} onClick={() => !dragged.current && rollPool()}>
            Roll{tower ? " in the tower" : ""}
          </button>
          <button type="button" onClick={() => setPool([])}>
            Clear
          </button>
        </div>
      ) : null}
    </section>
  );

  if (!out) return body;
  return (
    <PopOutWindow
      child={out}
      title="Chat · Kraken"
      onClosed={() => {
        rememberChat(null);
        setOut(null);
      }}
      onPlaced={(place) => rememberChat(place)}
    >
      {body}
    </PopOutWindow>
  );
}
