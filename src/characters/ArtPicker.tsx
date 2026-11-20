import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/icons";
import type { Session } from "../session/useSession";

export type ArtItem = { id: string; kind: "portrait" | "token"; group: string; name: string; video: boolean };

// A picture from the GM's art library: an image, or a looping video portrait.
// still: a small picture (the top bar, lists, the tracker) shows a video
// portrait's still (the picture beside it, as it was made from), so only
// sheets and tokens play: every video playing costs the table frames.
export function Picture({ session, id, alt = "", still = false }: { session: Session; id: string; alt?: string; still?: boolean }) {
  const video = id.toLowerCase().endsWith(".webm");
  const [noStill, setNoStill] = useState(false);
  const url = session.artUrl(id);
  if (!url) return null;
  if (video && still && !noStill) {
    const stillUrl = session.artUrl(id.replace(/\.webm$/i, ".png"));
    if (stillUrl) return <img src={stillUrl} alt={alt} loading="lazy" draggable={false} onError={() => setNoStill(true)} />;
  }
  return video ? (
    <video src={url} autoPlay loop muted playsInline aria-label={alt} />
  ) : (
    <img src={url} alt={alt} loading="lazy" draggable={false} />
  );
}

const PAGE = 120;

// Choose a portrait or a token from the GM's collection (FG's portrait
// selection and token bag): by folder, or by name.
export function ArtPicker({
  session,
  kind,
  current,
  race = "",
  onPick,
  onClose,
}: {
  session: Session;
  kind: "portrait" | "token";
  current?: string;
  // The character's race: the picker opens on that race's folder (Kraken's own first).
  race?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ArtItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let live = true;
    session
      .artList(kind)
      .then((list) => {
        if (!live) return;
        setItems(list);
        const wanted = race.trim().toLowerCase();
        const byRace = wanted ? list.find((item) => item.group === `Maelstrom · ${race.trim()}`)?.group ?? list.find((item) => item.group.toLowerCase().endsWith(`· ${wanted}`))?.group : undefined;
        const preferred = list.find((item) => item.id === current)?.group ?? byRace ?? list.find((item) => item.group.startsWith("Maelstrom"))?.group ?? "";
        setGroup(preferred);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [kind]);

  // A modal <dialog> (the top layer: never clipped by the window it opens from), moved by its handle.
  const dialog = useRef<HTMLDialogElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const grab = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    // Light dismiss where the dialog has no closedby (Safari): a click on the backdrop, outside the box.
    if (!element || "closedBy" in HTMLDialogElement.prototype) return;
    const outside = (event: MouseEvent) => {
      if (event.target !== element) return;
      const box = element.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) element.close();
    };
    element.addEventListener("click", outside);
    return () => element.removeEventListener("click", outside);
  }, []);
  const moveTo = (x: number, y: number) => {
    const element = dialog.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView ?? window;
    setAt({ x: Math.max(0, Math.min(x, view.innerWidth - element.offsetWidth)), y: Math.max(0, Math.min(y, view.innerHeight - 48)) });
  };
  const here = () => dialog.current?.getBoundingClientRect() ?? { left: 0, top: 0 };

  // A picture from this computer: the host keeps it with the campaign, shared with everyone; then it is chosen.
  const [adding, setAdding] = useState("");
  async function addOwn(file: File | undefined) {
    if (!file) return;
    setAdding("Adding…");
    try {
      const id = await session.uploadArt(kind, file);
      setAdding("");
      onPick(id);
    } catch (error) {
      setAdding(error instanceof Error ? error.message : "That picture could not be added.");
    }
  }

  const groups = useMemo(() => [...new Set((items ?? []).map((item) => item.group))], [items]);
  const needle = search.trim().toLowerCase();
  const matches = (items ?? []).filter((item) => (needle ? item.name.toLowerCase().includes(needle) : !group || item.group === group));
  const title = kind === "portrait" ? "Choose a portrait" : "Choose a token";

  return (
    <dialog
      ref={dialog}
      className="art-picker"
      aria-label={title}
      {...({ closedby: "any" } as object)}
      style={at ? { margin: 0, left: at.x, top: at.y } : undefined}
      onClose={onClose}
    >
      <div className="art-picker-body">
        <header>
          <button
            type="button"
            className="art-picker-handle"
            aria-label={`Move the ${kind} picker (drag, or the arrow keys)`}
            title="Drag to move (or the arrow keys)"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const box = here();
              grab.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (grab.current && event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event.clientX - grab.current.dx, event.clientY - grab.current.dy);
            }}
            onLostPointerCapture={() => (grab.current = null)}
            onKeyDown={(event) => {
              const step = ({ ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, -15], ArrowDown: [0, 15] } as Record<string, number[]>)[event.key];
              if (!step) return;
              event.preventDefault();
              const box = here();
              moveTo(box.left + step[0], box.top + step[1]);
            }}
          >
            <Icon name="hand" size={16} />
          </button>
          <h2>{title}</h2>
          <input type="search" placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search" autoFocus />
          <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Folder" disabled={Boolean(needle)}>
            <option value="">All folders</option>
            {groups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label className="art-own" title={`A ${kind} of your own from this computer (PNG, WebP, JPEG, GIF or a WebM video): kept with the campaign, and everyone at the table sees it`}>
            <Icon name="import" size={15} /> From my computer…
            <input type="file" accept="image/png,image/webp,image/jpeg,image/gif,video/webm,.webm" data-action="art-own" hidden onChange={(event) => void addOwn(event.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </header>
        {adding ? (
          <p className="hint" role="status">
            {adding}
          </p>
        ) : null}
        {failed ? <p className="hint">The host's art library could not be read.</p> : null}
        {items && items.length === 0 ? <p className="hint">No {kind}s yet: add one from your computer, or the GM adds them in the Folders window.</p> : null}
        <div className="art-grid">
          {current ? (
            <button type="button" className="art-cell art-clear" onClick={() => onPick(null)} title="No picture">
              <span>None</span>
            </button>
          ) : null}
          {matches.slice(0, shown).map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === current ? "art-cell selected" : "art-cell"}
              data-art={item.id}
              title={`${item.name} (${item.group})`}
              onClick={() => onPick(item.id)}
            >
              <Picture session={session} id={item.id} alt={item.name} still />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        {matches.length > shown ? (
          <button type="button" className="art-more" onClick={() => setShown(shown + PAGE)}>
            Show more ({matches.length - shown} left)
          </button>
        ) : null}
      </div>
    </dialog>
  );
}

// The default for a race and class, as the host picks it (electron/characterArt.cjs):
// Kraken's own pair, then one of that race's from any folder.
export function defaultArt(items: ArtItem[], race: string, cls: string) {
  const r = race.trim().toLowerCase();
  const c = cls.trim().toLowerCase();
  if (!r) return null;
  const inRace = items.filter((item) => item.group.toLowerCase().endsWith(`· ${r}`));
  const kraken = inRace.filter((item) => item.group.startsWith("Maelstrom"));
  return kraken.find((item) => item.name.toLowerCase() === `${r} ${c}`) ?? inRace.find((item) => c && item.name.toLowerCase().includes(c)) ?? kraken[0] ?? inRace.find((item) => !item.video) ?? null;
}

// The wizard's portrait and token, chosen before the character is made: the
// race and class's own shown at once, either changed from the collection.
// value: what was chosen ({} for the defaults); onChange gives the ids.
export function ArtChoice({ session, race, cls, value, onChange }: { session: Session; race: string; cls: string; value: { portrait?: string; token?: string }; onChange: (next: { portrait?: string; token?: string }) => void }) {
  const [lists, setLists] = useState<{ portrait: ArtItem[]; token: ArtItem[] }>({ portrait: [], token: [] });
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([session.artList("portrait"), session.artList("token")])
      .then(([portrait, token]) => live && setLists({ portrait, token }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const shown = {
    portrait: value.portrait ?? defaultArt(lists.portrait, race, cls)?.id,
    token: value.token ?? defaultArt(lists.token, race, cls)?.id,
  };
  return (
    <div className="art-choice" data-art-choice>
      {(["portrait", "token"] as const).map((kind) => (
        <div key={kind} className={`art-choice-${kind}`}>
          <button type="button" className="art-choice-face" data-action={`choose-${kind}`} title={`Choose the ${kind}`} onClick={() => setPicking(kind)}>
            {shown[kind] ? <Picture session={session} id={shown[kind]!} alt="" /> : <span>?</span>}
          </button>
          <small>{kind === "portrait" ? "Portrait" : "Token"}</small>
        </div>
      ))}
      {picking ? (
        <ArtPicker
          session={session}
          kind={picking}
          current={shown[picking]}
          race={race}
          onPick={(id) => {
            onChange({ ...value, [picking]: id ?? undefined });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </div>
  );
}
