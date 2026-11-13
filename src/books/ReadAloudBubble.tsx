import { useEffect, useSyncExternalStore } from "react";
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
  if (!now) return null;
  return (
    <div key={now.at} className={floating ? "read-aloud-bubble floating" : "read-aloud-bubble"} role="status" data-read-aloud={now.at} title="Click to close" onClick={onDone} onPointerDown={(event) => event.stopPropagation()}>
      {now.title ? <span className="read-aloud-title">{now.title}</span> : null}
      <p>{now.text}</p>
    </div>
  );
}
