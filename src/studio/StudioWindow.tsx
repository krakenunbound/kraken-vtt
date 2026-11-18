import { useEffect, useRef, useState } from "react";
import { SLOT_DRAG, TOKEN_DRAG } from "../ui/QuickSlots";

// What a drag may carry onto Map Studio's map: a character or creature (the Party Sheet, the tracker, Character Selection).
const CARRIED = [TOKEN_DRAG, "application/x-kraken-record", "application/x-kraken-ct"];
const carried = (event: { dataTransfer: DataTransfer | null }) => [...(event.dataTransfer?.types ?? [])].some((type) => CARRIED.includes(type));

// Kraken Map Studio in a window of Kraken's own: the map maker (art, walls,
// doors, lights and time of day, weather with masks, traps and regions, play
// testing, Fantasy Grounds and Foundry export), served by Kraken itself
// (electron/studio/server.cjs). The GM's alone.
// page: the editor's page Kraken made for an image (its master opens there), else Map Studio as it is.
export function StudioWindow({ project: page }: { project?: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  // A character dragged towards Map Studio: a drop zone over it, in this page (a browser hands no drag
  // across to another site's frame); the drop is passed to Map Studio as a message (Play test puts the token there).
  const [catching, setCatching] = useState(false);
  useEffect(() => {
    const doc = frame.current?.ownerDocument;
    if (!doc) return;
    const start = (event: DragEvent) => { if (carried(event)) setCatching(true); };
    // After the drop zone has taken its drop (it goes once the drag is over).
    const stop = () => setTimeout(() => setCatching(false), 0);
    const docs = [...new Set([doc, document])];
    for (const d of docs) {
      // After the row has put its payload on the drag (bubbling, not capturing).
      d.addEventListener("dragstart", start);
      d.addEventListener("dragenter", start, true);
      d.addEventListener("dragend", stop, true);
      d.addEventListener("drop", stop, true);
    }
    return () => {
      for (const d of docs) {
        d.removeEventListener("dragstart", start);
        d.removeEventListener("dragenter", start, true);
        d.removeEventListener("dragend", stop, true);
        d.removeEventListener("drop", stop, true);
      }
    };
  }, [url]);
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    setCatching(false);
    const target = frame.current;
    if (!target?.contentWindow || !url) return;
    const read = (type: string) => { try { return JSON.parse(event.dataTransfer.getData(type) || "null"); } catch { return null; } };
    const slot = read(SLOT_DRAG);
    const token = read(TOKEN_DRAG) ?? (slot && (slot.kind === "sheet" || slot.kind === "record") ? { name: slot.label, record: slot.record } : null) ?? { name: "Character", record: event.dataTransfer.getData("application/x-kraken-record") || null };
    const box = target.getBoundingClientRect();
    target.contentWindow.postMessage({ kind: "kraken-token-drop", token, x: event.clientX - box.left, y: event.clientY - box.top }, url);
  };
  useEffect(() => {
    if (page && /^http:\/\/127\.0\.0\.1:\d+\//.test(page)) {
      setUrl(new URL(page).origin);
      return;
    }
    const kraken = window.kraken;
    if (!kraken?.studioUrl) {
      setError("Map Studio runs in the Maelstrom VTT app.");
      return;
    }
    kraken
      .studioUrl()
      .then((found) => setUrl(found.url))
      .catch((reason: Error) => setError(reason.message || "Map Studio could not start."));
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!url) return <p className="hint">Starting Map Studio…</p>;
  const src = page && page.startsWith(url) ? page : `${url}/`;
  return (
    <div className="studio-host">
      <iframe ref={frame} className="studio-frame" title="Map Studio" src={src} data-studio={url} allow="clipboard-read; clipboard-write" />
      {catching ? <div className="studio-catch" data-studio-catch onDragOver={(event) => { if (carried(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={(event) => { if (event.currentTarget === event.target && !event.currentTarget.contains(event.relatedTarget as Node)) setCatching(false); }} onDrop={drop} /> : null}
    </div>
  );
}
