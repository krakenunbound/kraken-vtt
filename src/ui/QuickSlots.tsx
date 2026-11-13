import { useEffect, useRef, useState } from "react";
import type { QuickSlot, Session } from "../session/useSession";
import { Icon } from "./icons";
import { useWindows } from "./Windows";
import { useBookWindows } from "../books/Books";
import { sound } from "../sound/soundEngine";
import { chatRunner } from "./chatRunner";
import { agentCommands } from "./agentCommands";

// Quick slots: a bar along the bottom of the table, ten things this seat
// keeps at hand (a book, or a page of one; a picture or map; a character's
// sheet; dice; a chat line such as /roll 4d6k3), used again with a click or
// its number key (1-9, 0). Drag a link onto a slot, drop dice on it from the
// tray (or put down dice held in the hand), or drag a line from the chat's
// entry. A right-click opens the slot's menu: use it, rename it, or clear it.
// The host keeps each seat's own, with the campaign.
export const SLOT_DRAG = "text/kraken-slot";

// What a thing gives a drag, so it can be dropped on a quick slot, into a
// note or a story: the same link everywhere.
export function slotDrag(slot: QuickSlot) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.stopPropagation();
      event.dataTransfer.setData(SLOT_DRAG, JSON.stringify(slot));
      // A sound goes into a book's story as well.
      if (slot.kind === "sound") event.dataTransfer.setData("text/kraken-sound", JSON.stringify({ sound: slot.sound, kind: slot.soundKind, label: slot.label }));
      // A character goes onto the combat tracker or the map as well.
      if (slot.kind === "sheet") event.dataTransfer.setData("application/x-kraken-record", slot.record);
      event.dataTransfer.effectAllowed = "copyMove";
    },
  };
}

export const LINK_ICON: Record<QuickSlot["kind"], string> = { book: "book", picture: "map", sheet: "character", sound: "sound", note: "chat", record: "shield", dice: "tower", macro: "scroll" };
// A link read from a drop, if it is one.
export function linkFrom(event: React.DragEvent): QuickSlot | null {
  try {
    const link = JSON.parse(event.dataTransfer.getData(SLOT_DRAG)) as QuickSlot;
    return link && typeof link.kind === "string" ? link : null;
  } catch {
    return null;
  }
}
export const hasLink = (event: React.DragEvent) => [...event.dataTransfer.types].includes(SLOT_DRAG);
// A chat command dragged as text (the words selected in the chat's entry, as
// FG's macro): a slot takes it as a macro.
function macroFrom(event: React.DragEvent): QuickSlot | null {
  const text = event.dataTransfer.getData("text/plain").trim();
  return /^\/\S/.test(text) && text.length <= 300 ? { kind: "macro", text, label: text.slice(0, 80) } : null;
}

// Opens a link, wherever it was dropped: a book at its page, a picture, a
// sheet, a note; a sound plays (for the table, from the GM; here, for a player).
export function useOpenLink(session: Session) {
  const windows = useWindows();
  const { openBook, openPicture } = useBookWindows();
  return (link: QuickSlot) => {
    if (link.kind === "book") openBook(link.book, link.label, link.page);
    else if (link.kind === "picture") openPicture({ book: link.book, file: link.file, name: link.label });
    else if (link.kind === "sheet") windows.open("sheet", link.label, link.record);
    else if (link.kind === "note") windows.open("note", link.label, link.record);
    else if (link.kind === "record") windows.open("record", link.label, link.record);
    // Dice and macros run as the chat would run them (who speaks, the tower).
    else if (link.kind === "dice") {
      if (chatRunner.run) chatRunner.run(`/roll ${link.formula}`);
      else session.roll(link.formula, "", "", false, "public", "");
    } else if (link.kind === "macro") chatRunner.run?.(link.text);
    else if (link.kind === "sound") {
      if (sound.isPlaying(link.sound)) {
        if (session.role === "dm") stopSoundForTable(session, link.sound, link.soundKind);
        sound.stop(link.sound);
      } else if (session.role === "dm") playSoundForTable(session, link.sound, link.soundKind);
      else void sound.play(link.sound, link.soundKind === "oneshots" ? "oneshots" : "sfx");
    }
  };
}
export function playSoundForTable(session: Session, id: string, kind: string) {
  if (kind === "ambience") session.soundCommand({ type: "ambience", action: "add", id });
  else if (kind === "music") session.soundCommand({ type: "music", action: "play", id });
  else session.soundCommand({ type: "sound-play", id });
}
export function stopSoundForTable(session: Session, id: string, kind: string) {
  if (kind === "ambience") for (const loop of session.soundscape.ambience.filter((item) => item.id === id || item.id.startsWith(`${id}/`))) session.soundCommand({ type: "ambience", action: "remove", id: loop.id });
  else if (kind === "music") session.soundCommand({ type: "music", action: "stop" });
  else session.soundCommand({ type: "sound-stop", id });
}

// Where the bar sits: docked (centred along the bottom) or undocked at a
// place of this screen's choosing, kept on this screen.
const PLACE_KEY = "kraken-quickslots-place";
type Place = { x: number; y: number } | null;
function readPlace(): Place {
  try {
    const value = JSON.parse(window.localStorage.getItem(PLACE_KEY) ?? "null");
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null;
  } catch {
    return null;
  }
}
function keepPlace(place: Place) {
  try {
    if (place) window.localStorage.setItem(PLACE_KEY, JSON.stringify(place));
    else window.localStorage.removeItem(PLACE_KEY);
  } catch {
    /* this screen only */
  }
}

const USE_LABEL: Record<QuickSlot["kind"], string> = { book: "Open", picture: "Open", sheet: "Open", note: "Open", record: "Open", sound: "Play", dice: "Roll", macro: "Run" };

export function QuickSlots({ session }: { session: Session }) {
  const openLink = useOpenLink(session);
  const [over, setOver] = useState(-1);
  // A slot's right-click menu (where it opened), and a rename being typed.
  const [menu, setMenu] = useState<{ index: number; x: number; y: number; rename?: string } | null>(null);
  const [place, setPlace] = useState<Place>(readPlace);
  const bar = useRef<HTMLDivElement>(null);
  const slots = session.quickSlots;
  const set = (index: number, slot: QuickSlot | null) => session.setQuickSlots(slots.map((item, at) => (at === index ? slot : item)));
  const open = openLink;
  // The number keys use the slots (1-9, then 0), unless something is being typed.
  const live = useRef({ slots, open });
  live.current = { slots, open };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      const index = "1234567890".indexOf(event.key);
      if (index < 0) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const slot = live.current.slots[index];
      if (!slot) return;
      event.preventDefault();
      live.current.open(slot);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // The agent's press (kraken_quickslots press): the slot used as a click uses it.
  useEffect(
    () =>
      agentCommands.register("quickslots", (command) => {
        if (command.kind !== "quickslots") return null;
        const slot = live.current.slots[command.index];
        if (!slot) throw new Error(`Quick slot ${command.index + 1 === 10 ? 0 : command.index + 1} is empty.`);
        live.current.open(slot);
        return { used: command.index, slot };
      }),
    [],
  );
  // The menu closes on a click elsewhere, or Escape.
  useEffect(() => {
    if (!menu) return;
    const away = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".quick-slot-menu")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", away);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", away);
    };
  }, [menu]);
  const menuSlot = menu ? slots[menu.index] : null;
  // Inside the table area, whatever the window's size.
  const clamp = (x: number, y: number) => {
    const parent = bar.current?.offsetParent as HTMLElement | null;
    const width = bar.current?.offsetWidth ?? 0;
    const height = bar.current?.offsetHeight ?? 0;
    if (!parent) return { x, y };
    return { x: Math.max(0, Math.min(parent.clientWidth - width, x)), y: Math.max(0, Math.min(parent.clientHeight - height, y)) };
  };
  useEffect(() => {
    if (!place) return;
    const refit = () => setPlace((current) => (current ? clamp(current.x, current.y) : current));
    refit();
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place === null]);
  // Drag the grip: the bar comes off the dock and goes where it is put.
  const grab = (event: React.PointerEvent) => {
    const element = bar.current;
    if (!element || event.button !== 0) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop };
    let moved: Place = null;
    const move = (next: PointerEvent) => {
      moved = clamp(start.left + next.clientX - start.x, start.top + next.clientY - start.y);
      setPlace(moved);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) keepPlace(moved);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const dock = () => {
    setPlace(null);
    keepPlace(null);
  };
  return (
    <div ref={bar} className={place ? "quick-slots undocked" : "quick-slots"} role="toolbar" aria-label="Quick slots" data-docked={place ? "false" : "true"} style={place ? { left: place.x, top: place.y } : undefined}>
      <span className="quick-slots-grip" title={place ? "Drag to move the quick slots" : "Drag to undock and move the quick slots"} aria-label="Move quick slots" data-action="quickslots-move" onPointerDown={grab} onDoubleClick={dock}>
        <i />
        <i />
        <i />
      </span>
      {slots.map((slot, index) => (
        <button
          key={index}
          type="button"
          className={`quick-slot${slot ? " full" : ""}${over === index ? " over" : ""}`}
          data-quick-slot={index}
          title={slot ? `${slot.label}${slot.kind === "macro" ? ` (${slot.text})` : slot.kind === "dice" && slot.label !== slot.formula ? ` (${slot.formula})` : ""}: click or press ${index + 1 === 10 ? 0 : index + 1}; right-click for its menu` : "Drag anything here: a book, a page, a map, a character, a sound, a note, dice from the tray, or a line from the chat's entry"}
          {...(slot ? slotDrag(slot) : {})}
          aria-label={slot ? `Open ${slot.label}` : `Empty quick slot ${index + 1}`}
          onClick={() => slot && open(slot)}
          onContextMenu={(event) => {
            event.preventDefault();
            if (slot) setMenu({ index, x: event.clientX, y: event.clientY });
          }}
          onDragOver={(event) => {
            const types = [...event.dataTransfer.types];
            if (!types.includes(SLOT_DRAG) && !types.includes("text/plain")) return;
            event.preventDefault();
            setOver(index);
          }}
          onDragLeave={() => setOver((current) => (current === index ? -1 : current))}
          onDrop={(event) => {
            event.preventDefault();
            setOver(-1);
            const slot = linkFrom(event) ?? macroFrom(event);
            if (slot) set(index, slot);
          }}
        >
          {slot ? (
            <>
              <Icon name={LINK_ICON[slot.kind] ?? "book"} size={16} />
              <span>{slot.label}</span>
            </>
          ) : (
            <span className="quick-slot-number">{index + 1 === 10 ? 0 : index + 1}</span>
          )}
        </button>
      ))}
      {menu && menuSlot ? (
        <div className="quick-slot-menu tray-menu" role="menu" aria-label={`Quick slot ${menu.index + 1 === 10 ? 0 : menu.index + 1}`} style={{ left: menu.x, top: menu.y }}>
          <span className="quick-slot-menu-head">{menuSlot.label}</span>
          {menu.rename === undefined ? (
            <>
              <button type="button" role="menuitem" data-slot-action="use" onClick={() => (setMenu(null), open(menuSlot))}>
                {USE_LABEL[menuSlot.kind] ?? "Open"}
              </button>
              <button type="button" role="menuitem" data-slot-action="rename" onClick={() => setMenu({ ...menu, rename: menuSlot.label })}>
                Rename…
              </button>
              <button type="button" role="menuitem" data-slot-action="clear" className="danger" onClick={() => (setMenu(null), set(menu.index, null))}>
                Clear this slot
              </button>
            </>
          ) : (
            <form
              className="quick-slot-rename"
              onSubmit={(event) => {
                event.preventDefault();
                const label = (menu.rename ?? "").trim().slice(0, 80);
                if (label) set(menu.index, { ...menuSlot, label });
                setMenu(null);
              }}
            >
              <input autoFocus aria-label="The slot's name" value={menu.rename} maxLength={80} onChange={(event) => setMenu({ ...menu, rename: event.target.value })} />
              <button type="submit" data-slot-action="rename-save">
                Save
              </button>
            </form>
          )}
        </div>
      ) : null}
      {place ? (
        <button type="button" className="quick-slots-dock" title="Dock the quick slots at the bottom" aria-label="Dock quick slots" data-action="quickslots-dock" onClick={dock}>
          <Icon name="dock" size={14} />
        </button>
      ) : null}
    </div>
  );
}
