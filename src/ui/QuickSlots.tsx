import { useState } from "react";
import type { QuickSlot, Session } from "../session/useSession";
import { Icon } from "./icons";
import { useWindows } from "./Windows";
import { useBookWindows } from "../books/Books";

// Quick slots: a bar along the bottom of the table, ten things this seat
// keeps at hand (a book, or a page of one; a picture or map; a character's
// sheet), opened again with a click. Drag a book, a page, a picture or a
// character onto a slot; right-click a slot to empty it. The host keeps each
// seat's own, with the campaign.
export const SLOT_DRAG = "text/kraken-slot";

// What a thing gives a drag, so it can be dropped on a quick slot.
export function slotDrag(slot: QuickSlot) {
  return {
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(SLOT_DRAG, JSON.stringify(slot));
      event.dataTransfer.effectAllowed = "copy";
    },
  };
}

const ICON: Record<QuickSlot["kind"], string> = { book: "book", picture: "map", sheet: "character" };

export function QuickSlots({ session }: { session: Session }) {
  const windows = useWindows();
  const { openBook, openPicture } = useBookWindows();
  const [over, setOver] = useState(-1);
  const slots = session.quickSlots;
  const set = (index: number, slot: QuickSlot | null) => session.setQuickSlots(slots.map((item, at) => (at === index ? slot : item)));
  const open = (slot: QuickSlot) => {
    if (slot.kind === "book") openBook(slot.book, slot.label, slot.page);
    else if (slot.kind === "picture") openPicture({ book: slot.book, file: slot.file, name: slot.label });
    else windows.open("sheet", slot.label, slot.record);
  };
  return (
    <div className="quick-slots" role="toolbar" aria-label="Quick slots">
      {slots.map((slot, index) => (
        <button
          key={index}
          type="button"
          className={`quick-slot${slot ? " full" : ""}${over === index ? " over" : ""}`}
          data-quick-slot={index}
          title={slot ? `${slot.label} (right-click to empty)` : "Drag a book, a page, a map or your character here"}
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
            try {
              const slot = JSON.parse(event.dataTransfer.getData(SLOT_DRAG)) as QuickSlot;
              if (slot && slot.kind) set(index, slot);
            } catch {
              /* not something a slot keeps */
            }
          }}
        >
          {slot ? (
            <>
              <Icon name={ICON[slot.kind] ?? "book"} size={16} />
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
