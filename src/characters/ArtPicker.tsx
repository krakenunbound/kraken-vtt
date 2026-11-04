import { useEffect, useMemo, useState } from "react";
import type { Session } from "../session/useSession";

export type ArtItem = { id: string; kind: "portrait" | "token"; group: string; name: string; video: boolean };

// A picture from the GM's art library: an image, or a looping video portrait.
export function Picture({ session, id, alt = "" }: { session: Session; id: string; alt?: string }) {
  const url = session.artUrl(id);
  if (!url) return null;
  return id.toLowerCase().endsWith(".webm") ? (
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
        const byRace = wanted ? list.find((item) => item.group === `Kraken · ${race.trim()}`)?.group ?? list.find((item) => item.group.toLowerCase().endsWith(`· ${wanted}`))?.group : undefined;
        const preferred = list.find((item) => item.id === current)?.group ?? byRace ?? list.find((item) => item.group.startsWith("Kraken"))?.group ?? "";
        setGroup(preferred);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = useMemo(() => [...new Set((items ?? []).map((item) => item.group))], [items]);
  const needle = search.trim().toLowerCase();
  const matches = (items ?? []).filter((item) => (needle ? item.name.toLowerCase().includes(needle) : !group || item.group === group));

  return (
    <div className="art-picker-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="art-picker" role="dialog" aria-label={kind === "portrait" ? "Choose a portrait" : "Choose a token"}>
        <header>
          <h2>{kind === "portrait" ? "Choose a portrait" : "Choose a token"}</h2>
          <input type="search" placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search" autoFocus />
          <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Folder" disabled={Boolean(needle)}>
            <option value="">All folders</option>
            {groups.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        {failed ? <p className="hint">The host's art library could not be read.</p> : null}
        {items && items.length === 0 ? <p className="hint">The GM has no {kind}s in Fantasy Grounds' {kind}s folders.</p> : null}
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
              <Picture session={session} id={item.id} alt={item.name} />
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
    </div>
  );
}

// The default for a race and class, as the host picks it (electron/characterArt.cjs):
// Kraken's own pair, then one of that race's from any folder.
export function defaultArt(items: ArtItem[], race: string, cls: string) {
  const r = race.trim().toLowerCase();
  const c = cls.trim().toLowerCase();
  if (!r) return null;
  const inRace = items.filter((item) => item.group.toLowerCase().endsWith(`· ${r}`));
  const kraken = inRace.filter((item) => item.group.startsWith("Kraken"));
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
