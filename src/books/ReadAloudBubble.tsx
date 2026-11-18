import { useEffect, useSyncExternalStore } from "react";
import { diceStore } from "../dice/diceStore";
import { Icon } from "../ui/icons";
import { useWindows } from "../ui/Windows";
import type { ReadAloud } from "../session/useSession";

// How many maps are on this screen now: with none, the bubble floats over the table.
let mapsShown = 0;
const mapListeners = new Set<() => void>();
export function useMapShown() {
  useEffect(() => {
    mapsShown += 1;
    mapListeners.forEach((listener) => listener());
    return () => {
      mapsShown -= 1;
      mapListeners.forEach((listener) => listener());
    };
  }, []);
}
export const useAnyMapShown = () => useSyncExternalStore((listener) => (mapListeners.add(listener), () => mapListeners.delete(listener)), () => mapsShown > 0);

// The GM's read-aloud over the map, for everyone: a speech bubble at the top
// of the map with the words in it, gone after the time it takes to read them
// (or a click).
export function ReadAloudBubble({ now, onDone, floating = false }: { now: ReadAloud | null; onDone: () => void; floating?: boolean }) {
  // This screen may keep read-aloud to the chat only (Settings > You at the table).
  const shown = useSyncExternalStore(diceStore.subscribe, diceStore.settings).readAloud !== false;
  // In its own window (open, not tucked away), it goes there instead of a bubble.
  const windows = useWindows();
  const inWindow = windows.windows.some((item) => item.kind === "readaloud" && !item.minimized);
  // Its time counts from when it came (at: when this screen got it), however
  // often the map it sits over opens and closes in the meantime.
  useEffect(() => {
    if (!now) return;
    const left = Math.min(45000, Math.max(8000, 6000 + now.text.length * 55)) - (Date.now() - now.at);
    if (left <= 0) {
      onDone();
      return;
    }
    const timer = window.setTimeout(onDone, left);
    return () => window.clearTimeout(timer);
  }, [now?.at]);
  if (!now || !shown || inWindow) return null;
  return (
    <div key={now.at} className={floating ? "read-aloud-bubble floating" : "read-aloud-bubble"} role="status" data-read-aloud={now.at} title="Click to close" onClick={onDone} onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" className="read-aloud-close read-aloud-window" data-action="read-aloud-window" aria-label="Open in a window" title="Open in a window: move it, or pop it out to another screen" onClick={(event) => { event.stopPropagation(); windows.open("readaloud", "Read aloud"); onDone(); }}>
        <Icon name="popout" size={13} />
      </button>
      <button type="button" className="read-aloud-close" data-action="read-aloud-close" aria-label="Close" title="Close" onClick={(event) => { event.stopPropagation(); onDone(); }}>
        ×
      </button>
      {now.title ? <span className="read-aloud-title">{now.title}</span> : null}
      <p>{now.text}</p>
    </div>
  );
}

// The read-alouds in a window of their own (the bubble's pop-out button, or the Windows tool): the newest
// first, each with what it was read from; a window like any other, to move, tuck away or pop out.
export function ReadAloudWindow({ log }: { log: ReadAloud[] }) {
  const items = [...log].reverse();
  return (
    <div className="read-aloud-list" data-read-aloud-window>
      {items.length === 0 ? <p className="hint empty-state">Nothing read aloud yet. What the GM reads aloud appears here.</p> : null}
      {items.map((item, index) => (
        <article key={item.at} className={index === 0 ? "read-aloud-entry newest" : "read-aloud-entry"} data-read-aloud-entry={item.at}>
          {item.title ? <span className="read-aloud-title">{item.title}</span> : null}
          <p>{item.text}</p>
        </article>
      ))}
    </div>
  );
}
