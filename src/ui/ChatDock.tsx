import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChatLine, RollResult, Session } from "../session/useSession";
import { characterDice, diceStore, rolling, setThrow, tower as towerDrops, type DiceLook } from "../dice/diceStore";
import { commandsFor, runChat, type Command } from "./chatCommands";
import { slotDrag } from "./QuickSlots";
import { chatRunner } from "./chatRunner";
import { TowerArt, towerLook } from "./TowerArt";
import { agentCommands } from "./agentCommands";
import { DieShape, Icon } from "./icons";
import { useWindows } from "./Windows";
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

// Each line's icon says what it is: from the tag the rules put on a roll
// ([ATTACK], [SAVE]...) or the kind of line (a whisper, an emote, a vote...).
const TAGGED: [RegExp, string, string][] = [
  [/^\[ATTACK\]/, "combat", "attack"],
  [/^\[DAMAGE\]/, "damage", "damage"],
  [/^\[HEAL\]/, "heart", "heal"],
  [/^\[SAVE\]|saving throw/i, "shield", "save"],
  [/^\[RESIST\]|resist/i, "resist", "save"],
  [/^\[DEFEN[CS]E\]|defend/i, "shield", "save"],
  [/^\[CHECK\]|^\[SIEGE\]|check\b/i, "check", "check"],
  [/^\[INIT\]|initiative/i, "hourglass", "init"],
  [/^\[CAST\]|^\[SPELL\]|^\[POWER\]/, "sparkle", "spell"],
  [/^\[EFFECT/, "flask", "effect"],
  [/^\[(TURN|ROUND)/, "next", "turn"],
  [/^\[LEVEL UP\]/, "levelup", "level"],
  [/^\[TOWER\]|^\[BLIND\]/, "tower", "tower"],
  [/^\[MUSIC\]/, "music", "music"],
  [/^\[SOUND\]|^\[SFX\]/, "sound", "sound"],
  [/^\[WARNING\]/, "warning", "warning"],
];
function iconOf(line: ChatLine): { icon: string; tone: string } | null {
  const said = line.roll?.label || line.text || "";
  for (const [pattern, icon, tone] of TAGGED) if (pattern.test(said)) return { icon, tone };
  if (line.vote) return { icon: "vote", tone: "vote" };
  if (line.to) return { icon: "whisper", tone: "whisper" };
  if (line.kind === "emote" || line.kind === "action") return { icon: "emote", tone: "emote" };
  if (line.kind === "mood") return { icon: "mood", tone: "emote" };
  if (line.kind === "ooc") return { icon: "chat", tone: "ooc" };
  if (line.kind === "story") return { icon: "book", tone: "story" };
  if (line.roll) return { icon: "d20", tone: "roll" };
  return null;
}

function Line({ line, gmIcon, session }: { line: ChatLine; gmIcon: string; session: Session }) {
  useSyncExternalStore(rolling.subscribe, rolling.version);
  const system = line.from === "Combat" || line.local;
  const story = line.kind === "story";
  const classes = ["chat-line", system ? "system" : "", line.secret || line.tower || line.self ? "secret" : "", line.to ? "whisper" : "", line.kind ? `kind-${line.kind}` : "", line.local ? "local" : ""].filter(Boolean).join(" ");
  const mark = iconOf(line);
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const applied = line.roll && session.role === "dm" && /^\[(DAMAGE|HEAL)/i.test(line.roll.label ?? "") ? { amount: Number(line.roll.total) || 0, heal: /^\[HEAL/i.test(line.roll.label ?? "") } : null;
  const myVote = line.vote ? (line.vote.yes.includes(me) ? "yes" : line.vote.no.includes(me) ? "no" : "") : "";
  return (
    <div
      className={classes}
      data-from={line.from}
      data-kind={line.kind ?? (line.roll ? "roll" : "say")}
      data-dice-body={(line.roll as { look?: { body?: string } } | undefined)?.look?.body}
      // A damage or healing roll is dragged onto a creature (the tracker, its token) to apply it, as in FG.
      {...(applied
        ? {
            draggable: true,
            onDragStart: (event: React.DragEvent) => {
              event.dataTransfer.setData("application/x-kraken-damage", JSON.stringify(applied));
              event.dataTransfer.effectAllowed = "copy";
            },
            title: `Drag onto a creature to ${applied.heal ? "heal" : "deal"} ${applied.amount}`,
          }
        : {})}
    >
      {mark ? (
        <span className={`chat-kind tone-${mark.tone}`} aria-hidden="true">
          <Icon name={mark.icon} size={13} />
        </span>
      ) : null}
      {line.gm && gmIcon && !story ? <img className="chat-icon" src={gmIcon} alt="" draggable={false} /> : null}
      {!system && !story && line.kind !== "emote" ? <b className="chat-from">{line.from}{line.kind === "mood" && line.mood ? <i className="chat-mood"> ({line.mood})</i> : null}</b> : null}
      {line.to ? <span className="chat-tag whisper-tag">to {line.to.join(", ")}</span> : null}
      {line.kind === "ooc" ? <span className="chat-tag">OOC</span> : null}
      {line.secret ? <span className="chat-tag">{line.shownTo ? "GM and you" : "GM only"}</span> : null}
      {line.self ? <span className="chat-tag">Only you</span> : null}
      {line.tower ? <span className="chat-tag">To the GM</span> : null}
      {line.roll ? (
        <RollCard roll={line.roll} pending={rolling.has(line)} />
      ) : line.kind === "emote" ? (
        <span className="chat-text">
          <b className="chat-from">{line.from}</b> {line.text}
        </span>
      ) : (
        <span className="chat-text">{line.text}</span>
      )}
      {line.vote ? (
        <span className="chat-vote">
          <button type="button" className={myVote === "yes" ? "on" : ""} onClick={() => session.tableCommand({ type: "vote-cast", id: line.vote!.id, choice: "yes" })}>
            Yes {line.vote.yes.length}
          </button>
          <button type="button" className={myVote === "no" ? "on" : ""} onClick={() => session.tableCommand({ type: "vote-cast", id: line.vote!.id, choice: "no" })}>
            No {line.vote.no.length}
          </button>
          {line.vote.yes.length + line.vote.no.length > 0 ? <small>{[...line.vote.yes.map((who) => `${who} yes`), ...line.vote.no.map((who) => `${who} no`)].join(", ")}</small> : null}
        </span>
      ) : null}
    </div>
  );
}

function formulaOf(dice: number[]) {
  const counts = new Map<number, number>();
  for (const sides of dice) counts.set(sides, (counts.get(sides) ?? 0) + 1);
  return [...counts].map(([sides, count]) => `${count}d${sides}`).join("+");
}

function withModifier(formula: string, modifier: number) {
  if (!modifier) return formula;
  return `${formula}${modifier > 0 ? "+" : ""}${modifier}`;
}

// The chat window (FG's, bottom left): the log, a line to type in, the dice
// tray (click dice to gather a pool, then roll), the modifier box, and the
// dice tower (a roll only the GM sees).
// Where this screen keeps the tower apart from the chat (by screen, not by
// table), and whether it is locked there (it cannot be dragged).
const TOWER_PLACE = "kraken-tower-place";
type TowerPlace = { x: number; y: number; locked: boolean };
const towerFits = (x: number, y: number) => ({ x: Math.round(Math.min(window.innerWidth - 80, Math.max(0, x))), y: Math.round(Math.min(window.innerHeight - 100, Math.max(0, y))) });
function towerPlace(): TowerPlace {
  try {
    const saved = JSON.parse(window.localStorage.getItem(TOWER_PLACE) ?? "null");
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return { ...towerFits(saved.x, saved.y), locked: saved.locked === true };
  } catch {
    /* the default place */
  }
  return { ...towerFits(window.innerWidth - 300, window.innerHeight - 190), locked: false };
}
function keepTowerPlace(place: TowerPlace) {
  try {
    window.localStorage.setItem(TOWER_PLACE, JSON.stringify(place));
  } catch {
    /* this visit only */
  }
}
// The dice tower standing on the table: a click turns it on or off, a drag
// moves it (kept on this screen) unless it is locked, dice dropped on it go in,
// and a right-click opens its menu beside it: on or off, lock or unlock, fix it
// at x,y; the GM's also change its look (for everyone) or dock it in the chat.
function ExternalTower({ session, on, drop, title, towerRef, onToggle }: { session: Session; on: boolean; drop: boolean; title: string; towerRef: React.RefObject<HTMLButtonElement | null>; onToggle: () => void }) {
  const [place, setPlaceState] = useState(towerPlace);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [at, setAt] = useState({ x: "", y: "" });
  const windows = useWindows();
  const gm = session.role === "dm";
  const style = session.options.towerStyle || "stone";
  const picture = towerLook(style) ? "" : session.decalUrl(style, "tower");
  const litPicture = picture ? session.decalUrl(style.replace(/(\.[a-z0-9]+)$/i, " lit$1"), "tower") : "";
  const placeRef = useRef(place);
  const setPlace = (next: TowerPlace) => {
    placeRef.current = next;
    setPlaceState(next);
    keepTowerPlace(next);
  };
  const live = useRef({ on, onToggle, setPlace });
  live.current = { on, onToggle, setPlace };
  placeRef.current = place;
  // The agent's hands on it (kraken_tower), as this menu.
  useEffect(
    () =>
      agentCommands.register("tower", (command) => {
        if (command.kind !== "tower") return null;
        const current = live.current;
        const xy = Number.isFinite(command.x) && Number.isFinite(command.y) ? towerFits(Number(command.x), Number(command.y)) : null;
        let lit = current.on;
        if (command.action === "lock") current.setPlace({ ...(xy ?? placeRef.current), locked: true });
        else if (command.action === "unlock") current.setPlace({ ...placeRef.current, locked: false });
        else if (command.action === "place") {
          if (!xy) throw new Error("Give x and y (screen pixels).");
          current.setPlace({ ...placeRef.current, ...xy });
        } else if ((command.action === "on" && !current.on) || (command.action === "off" && current.on)) {
          current.onToggle();
          lit = !lit;
        }
        const shown = placeRef.current;
        return { x: shown.x, y: shown.y, locked: shown.locked, on: lit };
      }),
    [],
  );
  // The menu closes on a click elsewhere, or Escape.
  useEffect(() => {
    if (!menu) return;
    const away = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".tower-menu")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", away);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", away);
    };
  }, [menu]);
  const grab = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY, left: place.x, top: place.y };
    let moved = false;
    let last = place;
    const move = (next: PointerEvent) => {
      // Locked: it stays where it is (a click still turns it on or off).
      if (place.locked) return;
      if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 5) return;
      moved = true;
      setDragging(true);
      last = { ...towerFits(start.left + next.clientX - start.x, start.top + next.clientY - start.y), locked: false };
      setPlaceState(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (!moved) return onToggle();
      setPlace(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setAt({ x: String(place.x), y: String(place.y) });
    // Beside it: to its right, or to its left near the screen's right edge.
    const right = place.x + 96;
    setMenu({ x: right + 230 > window.innerWidth ? Math.max(4, place.x - 236) : right, y: Math.min(window.innerHeight - 270, Math.max(4, place.y)) });
  };
  const fixAt = () => {
    const x = Number(at.x);
    const y = Number(at.y);
    if (at.x.trim() === "" || at.y.trim() === "" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    setPlace({ ...towerFits(x, y), locked: true });
    setMenu(null);
  };
  const choose = (run: () => void) => () => {
    run();
    setMenu(null);
  };
  return (
    <>
      <button
        type="button"
        ref={towerRef}
        className={["tower", "tower-external", on ? "on" : "", drop ? "drop" : "", dragging ? "dragging" : "", place.locked ? "locked" : ""].filter(Boolean).join(" ")}
        data-action="tower-external"
        data-locked={place.locked ? "true" : "false"}
        aria-pressed={on}
        aria-label={on ? "Dice tower on" : "Dice tower off"}
        title={`${title}; ${place.locked ? "locked in place" : "drag it to move it"}; right-click for its menu`}
        style={{ left: place.x, top: place.y }}
        onPointerDown={grab}
        onContextMenu={openMenu}
      >
        <TowerArt on={on} busy={drop} style={style} picture={picture} litPicture={litPicture} size={picture ? 104 : 80} />
        {place.locked ? (
          <span className="tower-lock" aria-hidden="true">
            <Icon name="lock" size={11} />
          </span>
        ) : null}
        <span className="tower-label">{on ? "Tower on" : "Tower off"}</span>
      </button>
      {menu ? (
        <div className="tower-menu" role="menu" aria-label="Dice tower" style={{ left: menu.x, top: menu.y }}>
          <button type="button" role="menuitem" data-action="tower-toggle" onClick={choose(onToggle)}>
            {on ? "Turn the tower off" : "Turn the tower on"}
          </button>
          <button type="button" role="menuitem" data-action="tower-lock" onClick={choose(() => setPlace({ ...place, locked: !place.locked }))}>
            {place.locked ? "Unlock (drag it again)" : "Lock it where it stands"}
          </button>
          <div className="tower-at">
            <span>Fix it at</span>
            <input type="number" aria-label="x" data-field="tower-x" value={at.x} onChange={(event) => setAt({ ...at, x: event.target.value })} onKeyDown={(event) => event.key === "Enter" && fixAt()} />
            <input type="number" aria-label="y" data-field="tower-y" value={at.y} onChange={(event) => setAt({ ...at, y: event.target.value })} onKeyDown={(event) => event.key === "Enter" && fixAt()} />
            <button type="button" className="ghost" data-action="tower-fix" title="Put it there and lock it" onClick={fixAt}>
              Set
            </button>
          </div>
          {gm ? (
            <>
              <hr />
              <button type="button" role="menuitem" data-action="tower-look" onClick={choose(() => windows.open("towers", "Dice Tower"))}>
                Change its look…
              </button>
              <button type="button" role="menuitem" data-action="tower-dock" onClick={choose(() => session.setTableOptions({ towerExternal: false }))}>
                Dock it in the chat
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function ChatDock({ session }: { session: Session }) {
  const [draft, setDraft] = useState("");
  const [pool, setPool] = useState<number[]>([]);
  const [modifier, setModifier] = useState(0);
  const [tower, setTower] = useState(false);
  const [size, setSize] = useState<ChatSize>(chatSize);
  const windows = useWindows();
  // /id: who the GM speaks as for now; /gmid: the GM's own name, kept in this browser.
  // A player speaks as one of their characters (FG's identity list under the
  // chat), or as themselves; taking a character makes it who they speak as.
  const [speakAs, setSpeakAs] = useState("");
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const myCharacters = session.role === "dm" ? [] : Object.values(session.records).filter((record) => record.type === "character" && record.owner === me).map((record) => record.name).sort();
  const mineKey = myCharacters.join("|");
  const known = useRef<string[]>([]);
  useEffect(() => {
    if (session.role === "dm") return;
    const added = myCharacters.find((name) => !known.current.includes(name));
    known.current = myCharacters;
    if (added) setSpeakAs(added);
    else if (speakAs && !myCharacters.includes(speakAs)) setSpeakAs(myCharacters[0] ?? "");
  }, [mineKey, session.role]);
  const [gmName, setGmNameState] = useState(() => {
    try {
      return window.localStorage.getItem("kraken-gm-name") ?? "";
    } catch {
      return "";
    }
  });
  const setGmName = (name: string) => {
    setGmNameState(name);
    try {
      window.localStorage.setItem("kraken-gm-name", name);
    } catch {
      /* this time only */
    }
  };
  const [helpOpen, setHelpOpen] = useState(false);
  // A right-click menu over the tray: how many of a die to roll, or the modifier's quick values.
  const [menu, setMenu] = useState<{ x: number; y: number; sides: number | null; custom?: boolean } | null>(null);
  // This seat's own set, on the tray's dice (the GM's too).
  const diceSettings = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  // The GM's chat picture, beside everything the GM says.
  const gmIconUrl = session.options.gmIcon ? session.decalUrl(session.options.gmIcon, "gmicon") : "";
  // Speaking as one of my characters: its own dice (the character tier), if it has them.
  const speaking = speakAs && session.role !== "dm" ? Object.values(session.records).find((record) => record.type === "character" && record.owner === me && record.name === speakAs) : undefined;
  const mine = characterDice(speaking)?.look ?? diceSettings.look;
  const mineCommands = commandsFor(session.role === "dm");
  const typedCommand = /^\/(\S*)$/.exec(draft);
  const suggestions: Command[] = typedCommand ? mineCommands.filter((command) => command.names.some((name) => name.startsWith(typedCommand[1].toLowerCase()))) : [];
  // The name being typed, finished: "/wh" is /whisper, "/w" stays /w.
  const finish = (command: Command) => command.names.find((name) => typedCommand && name.startsWith(typedCommand[1].toLowerCase())) ?? command.names[0];
  const lastWhisperFrom = [...session.chat].reverse().find((line) => line.to && line.id !== session.selfId)?.from ?? null;
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
  // The dice in the hand while a die is dragged from the tray. Only what they are
  // (and whether they are over the tower) is state; where they are is moved on
  // the element itself, so a drag never draws the chat again on every move.
  const [ghost, setGhost] = useState<{ x: number; y: number; sides: number | null; overTower: boolean; held?: number[] } | null>(null);
  // Dice held in the hand (FG's: right-click a die, pick how many): they follow
  // the pointer until a click throws them, drops them in the tower, or puts
  // them on a quick slot; a right-click or Escape puts them back.
  const [held, setHeld] = useState<number[] | null>(null);
  const ghostEl = useRef<HTMLSpanElement | null>(null);
  const dragged = useRef(false);
  const towerButton = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLElement>(null);
  // Chat in a window of its own, for another monitor.
  const [out, setOut] = useState<Window | null>(null);
  // The log stays at the newest line (as FG's chat): whenever anything in it
  // changes (a line, a roll card filling in once its dice land, the window
  // resized), unless the reader has scrolled up to read back.
  const stuck = useRef(true);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const toBottom = () => {
      if (stuck.current) element.scrollTop = element.scrollHeight;
    };
    const onScroll = () => {
      stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    const changes = new MutationObserver(toBottom);
    changes.observe(element, { childList: true, subtree: true, characterData: true });
    const sizes = new ResizeObserver(toBottom);
    sizes.observe(element);
    stuck.current = true;
    toBottom();
    return () => {
      element.removeEventListener("scroll", onScroll);
      changes.disconnect();
      sizes.disconnect();
    };
  }, [out]);
  useEffect(() => {
    const element = log.current;
    if (element && stuck.current) element.scrollTop = element.scrollHeight;
  }, [session.chat]);
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

  // A chat line run as if typed here: from the entry, or from a quick slot
  // (a macro such as /roll 4d6k3, or dice kept on one).
  const runLine = (line: string) => {
    runChat(line, {
      session,
      openWindow: (kind, title) => windows.open(kind, title),
      closeWindow: (kind) => windows.windows.filter((item) => item.kind === kind).forEach((item) => windows.close(item.key)),
      modifier,
      setModifier,
      tower,
      speakAs: speakAs || (session.role === "dm" ? gmName : ""),
      setSpeakAs,
      setGmName,
      lastWhisperFrom,
      showHelp: () => setHelpOpen(true),
    });
    // Dice into the tower, or a blind roll: they drop in, as from the tray.
    const towerRoll = /^\/(?:(r|roll|die)|blindroll|br|tower)\s+(\S+)/i.exec(line.trim());
    if (towerRoll && (!towerRoll[1] || tower)) dropInTower([...towerRoll[2].matchAll(/d(\d+|%)/gi)].map((match) => (match[1] === "%" ? 100 : Number(match[1]))));
  };
  const runner = useRef(runLine);
  runner.current = runLine;
  useEffect(() => {
    chatRunner.run = (line) => runner.current(line);
    return () => {
      chatRunner.run = null;
    };
  }, []);

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
    session.roll(withModifier(formulaOf(dice), modifier), "", "", inTower, "public", speakAs || (session.role === "dm" ? gmName : ""));
    if (inTower) dropInTower(dice, from);
    setPool([]);
    setModifier(0);
  };
  const rollPool = () => rollDice(pool, tower);
  // The tower apart from the chat (the GM's Settings, for every seat), or in the tray.
  const external = Boolean(session.options.towerExternal);
  const towerTitle =
    session.role === "dm"
      ? "Dice tower: your rolls stay hidden from players. Drop dice here, or click to turn it on or off"
      : session.options.towerReveal
        ? "Dice tower: the GM and you see the roll. Drop dice here, or click to turn it on or off"
        : "Dice tower: only the GM sees the roll. Drop dice here, or click to turn it on or off";
  // A quick slot under the pointer (the bar is in the main window).
  const slotAt = (view: Window, x: number, y: number) => {
    if (view !== window) return -1;
    const slot = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-quick-slot]");
    return slot ? Number(slot.dataset.quickSlot) : -1;
  };
  // Dice kept on a quick slot: a click on it rolls them again.
  const keepOnSlot = (index: number, dice: number[]) => {
    const formula = withModifier(formulaOf(dice), modifier);
    session.setQuickSlots(session.quickSlots.map((slot, at) => (at === index ? { kind: "dice", formula, label: formula } : slot)));
    setPool([]);
    setModifier(0);
  };
  // Thrown on the table from a point: toward the middle when let go without a throw.
  const throwFrom = (view: Window, screenX: number, screenY: number, clientX: number, clientY: number, vx = 0, vy = 0) => {
    const offset = view === window ? { x: screenX - clientX, y: screenY - clientY } : screenOffset();
    const x = Math.min(0.98, Math.max(0.02, (screenX - offset.x) / window.innerWidth));
    const y = Math.min(0.98, Math.max(0.02, (screenY - offset.y) / window.innerHeight));
    if (Math.hypot(vx, vy) < 0.15) {
      const dx = 0.5 - x;
      const dy = 0.45 - y;
      const length = Math.hypot(dx, dy) || 1;
      vx = (dx / length) * 0.5;
      vy = (dy / length) * 0.5;
    }
    setThrow({ x, y, vx, vy });
  };
  // The hand follows the pointer; the next click says where the dice go.
  useEffect(() => {
    if (!held) return;
    const view = dock.current?.ownerDocument.defaultView ?? window;
    let frame = 0;
    let last = { x: 0, y: 0 };
    const overTower = (x: number, y: number) => Boolean(view.document.elementFromPoint(x, y)?.closest(".tower"));
    const place = () => {
      frame = 0;
      const element = ghostEl.current;
      if (element) {
        element.style.left = `${last.x}px`;
        element.style.top = `${last.y}px`;
      }
      const nowOver = overTower(last.x, last.y);
      setGhost((current) => (current && current.overTower !== nowOver ? { ...current, overTower: nowOver } : current));
    };
    const move = (event: PointerEvent) => {
      last = { x: event.clientX, y: event.clientY };
      if (!frame) frame = view.requestAnimationFrame(place);
    };
    const done = () => {
      setHeld(null);
      setGhost(null);
    };
    const down = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      done();
      // A right-click puts them back.
      if (event.button !== 0) return;
      const slot = slotAt(view, event.clientX, event.clientY);
      if (slot >= 0) return keepOnSlot(slot, held);
      if (overTower(event.clientX, event.clientY)) return rollDice(held, true, { x: event.clientX, y: event.clientY });
      throwFrom(view, event.screenX, event.screenY, event.clientX, event.clientY);
      rollDice(held, tower, { x: event.clientX, y: event.clientY });
    };
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") done();
    };
    view.addEventListener("pointermove", move, true);
    view.addEventListener("pointerdown", down, true);
    view.addEventListener("click", swallow, true);
    view.addEventListener("contextmenu", swallow, true);
    view.addEventListener("keydown", key);
    return () => {
      if (frame) view.cancelAnimationFrame(frame);
      view.removeEventListener("pointermove", move, true);
      view.removeEventListener("pointerdown", down, true);
      view.removeEventListener("keydown", key);
      // The click (or right-click) that put them down goes by first.
      view.setTimeout(() => {
        view.removeEventListener("click", swallow, true);
        view.removeEventListener("contextmenu", swallow, true);
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held]);
  const pickUp = (dice: number[], at: { x: number; y: number }) => {
    setMenu(null);
    setPool([]);
    setHeld(dice);
    setGhost({ x: at.x, y: at.y, sides: null, overTower: false, held: dice });
  };

  // FG's tray: drag a die (or the pool) out and let go to throw it the way
  // the hand moved, or drop it on the dice tower. A click adds it to the pool.
  const startDrag = (event: React.PointerEvent, sides: number | null) => {
    if (event.button !== 0) return;
    const view = event.currentTarget.ownerDocument.defaultView ?? window;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    // Where the hand was, on the screen (so a popped-out chat on another
    // monitor throws onto the table as the docked one does).
    let samples: { x: number; y: number; t: number }[] = [];
    const overTower = (x: number, y: number) => Boolean(view.document.elementFromPoint(x, y)?.closest(".tower"));
    let over = false;
    let frame = 0;
    let last = { x: startX, y: startY };
    // Once a frame at most: the ghost moved, and the tower asked about.
    const place = () => {
      frame = 0;
      const element = ghostEl.current;
      if (element) {
        element.style.left = `${last.x}px`;
        element.style.top = `${last.y}px`;
      }
      const nowOver = overTower(last.x, last.y);
      if (nowOver !== over) {
        over = nowOver;
        setGhost((current) => (current ? { ...current, overTower: nowOver } : current));
      }
    };
    const move = (moveEvent: PointerEvent) => {
      if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 10) {
        dragging = true;
        over = overTower(moveEvent.clientX, moveEvent.clientY);
        setGhost({ x: moveEvent.clientX, y: moveEvent.clientY, sides, overTower: over });
      }
      if (!dragging) return;
      const now = performance.now();
      samples.push({ x: moveEvent.screenX, y: moveEvent.screenY, t: now });
      while (samples.length > 2 && now - samples[0].t > 140) samples.shift();
      last = { x: moveEvent.clientX, y: moveEvent.clientY };
      if (!frame) frame = view.requestAnimationFrame(place);
    };
    const up = (upEvent: PointerEvent) => {
      if (frame) view.cancelAnimationFrame(frame);
      view.removeEventListener("pointermove", move);
      view.removeEventListener("pointerup", up);
      view.removeEventListener("pointercancel", up);
      setGhost(null);
      if (!dragging) return;
      dragged.current = true;
      view.setTimeout(() => (dragged.current = false), 0);
      const dice = sides ? [...pool, sides] : pool;
      const slot = slotAt(view, upEvent.clientX, upEvent.clientY);
      if (slot >= 0) {
        keepOnSlot(slot, dice);
        return;
      }
      if (overTower(upEvent.clientX, upEvent.clientY)) {
        rollDice(dice, true, { x: upEvent.clientX, y: upEvent.clientY });
        return;
      }
      // Thrown on the table (the main window's): the dice leave the hand there,
      // that fast. From a popped-out chat, the screen says where that is.
      {
        const offset = view === window ? { x: upEvent.screenX - upEvent.clientX, y: upEvent.screenY - upEvent.clientY } : screenOffset();
        const atX = (upEvent.screenX - offset.x) / window.innerWidth;
        const atY = (upEvent.screenY - offset.y) / window.innerHeight;
        const first = samples.find((sample) => performance.now() - sample.t >= 30) ?? samples[0];
        const seconds = first ? Math.max(0.016, (performance.now() - first.t) / 1000) : 1;
        let vx = first ? (upEvent.screenX - first.x) / seconds / window.innerWidth : 0;
        let vy = first ? (upEvent.screenY - first.y) / seconds / window.innerHeight : 0;
        const x = Math.min(0.98, Math.max(0.02, atX));
        const y = Math.min(0.98, Math.max(0.02, atY));
        if (Math.hypot(vx, vy) < 0.15) {
          // Let go without a throw: they tumble out toward the middle.
          const dx = 0.5 - x;
          const dy = 0.45 - y;
          const length = Math.hypot(dx, dy) || 1;
          vx = (dx / length) * 0.5;
          vy = (dy / length) * 0.5;
        }
        setThrow({ x, y, vx, vy });
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
          <Line key={`${line.at}-${index}`} line={line} gmIcon={gmIconUrl} session={session} />
        ))}
      </div>
      <form
        className="chat-entry"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          // A first word that names a command finishes it, as Tab does.
          const typed = /^\/(\S*)$/.exec(draft.trim());
          if (typed && suggestions.length > 0 && !suggestions.some((command) => command.names.includes(typed[1].toLowerCase()))) {
            setDraft(`/${finish(suggestions[0])} `);
            return;
          }
          runLine(draft);
          setDraft("");
        }}
      >
        {draft.trim() ? (
          <span
            className="chat-macro-grip"
            data-action="chat-macro"
            title="Drag this line to a quick slot: a click on the slot (or its number key) runs it again"
            aria-label="Drag this line to a quick slot"
            {...slotDrag({ kind: "macro", text: draft.trim(), label: draft.trim().slice(0, 80) })}
          >
            <Icon name="hand" size={15} />
          </span>
        ) : null}
        <input
          aria-label="Message"
          value={draft}
          maxLength={500}
          onChange={(event) => {
            setDraft(event.target.value);
            if (helpOpen && !event.target.value.startsWith("/")) setHelpOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab" && suggestions.length > 0 && /^\/\S*$/.test(draft)) {
              event.preventDefault();
              setDraft(`/${finish(suggestions[0])} `);
            }
            if (event.key === "Escape") setHelpOpen(false);
          }}
          placeholder={speakAs ? `Speaking as ${speakAs}: say something, or /help` : "Say something, /r 1d20+2 Strength, or /help"}
        />
        <button type="submit" aria-label="Send">
          <Icon name="chat" />
        </button>
      </form>
      {myCharacters.length > 0 ? (
        <select className="chat-identity" aria-label="Speak as" value={speakAs} onChange={(event) => setSpeakAs(event.target.value)} title="Who you speak and roll as">
          {myCharacters.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="">{me || "Yourself"} (out of character)</option>
        </select>
      ) : null}
      {helpOpen || suggestions.length > 0 ? (
        <div className="chat-commands" role="listbox" aria-label="Chat commands">
          {helpOpen ? (
            <header>
              <b>Chat commands</b>
              <button type="button" className="window-close" aria-label="Close the command list" onClick={() => setHelpOpen(false)}>
                <Icon name="close" size={12} />
              </button>
            </header>
          ) : null}
          {(["Dice", "Talk", "GM", "Screen"] as const).map((group) => {
            const items = (helpOpen && !draft.startsWith("/") ? mineCommands : suggestions).filter((command) => command.group === group);
            return items.length === 0 ? null : (
              <div key={group} className="chat-commands-group">
                <span>{group === "GM" ? "GM only" : group === "Screen" ? "This screen" : group}</span>
                {items.map((command) => (
                  <button key={command.names[0]} type="button" role="option" data-command={command.names[0]} onClick={() => setDraft(`/${command.names[0]} `)}>
                    <code>
                      /{command.names[0]} <i>{command.args}</i>
                    </code>
                    <small>
                      {command.help}
                      {command.names.length > 1 ? <em> · also /{command.names.slice(1).join(", /")}</em> : null}
                    </small>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="dice-tray" aria-label="Dice tray" style={{ ["--tray-glow" as string]: mine.accent ?? mine.body }}>
        {TRAY.map((sides) => (
          <button
            key={sides}
            type="button"
            className="tray-die"
            title={`Pick up a d${sides} and throw it: drag out and let go, or drop it on the dice tower. Click adds it to the pool; right-click picks up several (then click the table to throw them, or a quick slot to keep them there).`}
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
        {external ? null : (
          <button type="button" ref={towerButton} className={["tower", tower ? "on" : "", ghost?.overTower ? "drop" : ""].filter(Boolean).join(" ")} aria-pressed={tower} title={towerTitle} onClick={() => setTower(!tower)}>
            <Icon name="tower" size={20} />
          </button>
        )}
      </div>
      {external
        ? createPortal(
            <ExternalTower session={session} on={tower} drop={Boolean(ghost?.overTower)} title={towerTitle} towerRef={towerButton} onToggle={() => setTower(!tower)} />,
            document.body,
          )
        : null}
      {ghost ? (
        <span ref={ghostEl} className={["dice-ghost", ghost.overTower ? "over-tower" : "", ghost.held ? "held" : ""].filter(Boolean).join(" ")} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true" data-held={ghost.held ? formulaOf(ghost.held) : undefined}>
          {(ghost.held ?? (ghost.sides ? [...pool, ghost.sides] : pool)).slice(-6).map((sides, index) => (
            <span key={index}>{trayDie(sides, 46)}</span>
          ))}
          {ghost.held && ghost.held.length > 6 ? <b className="dice-ghost-count">×{ghost.held.length}</b> : null}
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
                <button key={sides} type="button" role="menuitem" onClick={(event) => pickUp([...pool, sides], { x: event.clientX, y: event.clientY })}>
                  Pick up a d{sides}
                </button>
              ))}
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="tray-menu-head" onClick={() => setMenu({ ...menu, custom: true })}>
                Custom Dice ›
              </button>
              {MANY.map((count) => (
                <button key={count} type="button" role="menuitem" data-many={count} title="Pick them up: click the table to throw them, the tower to roll there, or a quick slot to keep them there; a right-click puts them back" onClick={(event) => pickUp([...pool, ...Array<number>(count).fill(menu.sides as number)], { x: event.clientX, y: event.clientY })}>
                  <b>{count}×</b> Pick up {count} d{menu.sides === 100 ? "%" : menu.sides}
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
