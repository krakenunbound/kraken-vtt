import { useState } from "react";
import type { QuickSlot, Session } from "../session/useSession";
import { Icon } from "./icons";
import { useWindows } from "./Windows";
import { useBookWindows } from "../books/Books";
import { sound } from "../sound/soundEngine";

// Quick slots: a bar along the bottom of the table, ten things this seat
// keeps at hand (a book, or a page of one; a picture or map; a character's
// sheet), opened again with a click. Drag a book, a page, a picture or a
// character onto a slot; right-click a slot to empty it. The host keeps each
// seat's own, with the campaign.
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

export const LINK_ICON: Record<QuickSlot["kind"], string> = { book: "book", picture: "map", sheet: "character", sound: "sound", note: "chat" };
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

export function QuickSlots({ session }: { session: Session }) {
  const openLink = useOpenLink(session);
  const [over, setOver] = useState(-1);
  const slots = session.quickSlots;
  const set = (index: number, slot: QuickSlot | null) => session.setQuickSlots(slots.map((item, at) => (at === index ? slot : item)));
  const open = openLink;
  return (
    <div className="quick-slots" role="toolbar" aria-label="Quick slots">
      {slots.map((slot, index) => (
        <button
          key={index}
          type="button"
          className={`quick-slot${slot ? " full" : ""}${over === index ? " over" : ""}`}
          data-quick-slot={index}
          title={slot ? `${slot.label} (right-click to empty; drag it on to a note)` : "Drag anything here: a book, a page, a map, a character, a sound, a note"}
          {...(slot ? slotDrag(slot) : {})}
          aria-label={slot ? `Open ${slot.label}` : `Empty quick slot ${index + 1}`}
          onClick={() => slot && open(slot)}
          onContextMenu={(event) => {
            event.preventDefault();
            if (slot) set(index, null);
          }}
          onDragOver={(event) => {
            if (![...event.dataTransfer.types].includes(SLOT_DRAG)) return;
            event.preventDefault();
            setOver(index);
          }}
          onDragLeave={() => setOver((current) => (current === index ? -1 : current))}
          onDrop={(event) => {
            event.preventDefault();
            setOver(-1);
            const slot = linkFrom(event);
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
    </div>
  );
}
