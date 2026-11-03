import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { DecalItem, Session } from "../session/useSession";
import { Emblem } from "./Emblem";
import { useWindows } from "./Windows";

// The GM's settings, as FG's campaign settings cog: a button for each thing
// the GM sets for the whole table.
export function SettingsWindow({ session }: { session: Session }) {
  const windows = useWindows();
  return (
    <div className="settings-window">
      <div className="settings-grid">
        <button type="button" className="settings-button" data-setting="decal" onClick={() => windows.open("decals", "Background Decal")}>
          Background Decal
        </button>
      </div>
      <label className="settings-check">
        <input type="checkbox" checked={session.options.towerReveal} onChange={(event) => session.setTableOptions({ towerReveal: event.target.checked })} />
        Dice tower: players see their own result
      </label>
    </div>
  );
}

// The picture on the table's background, for every seat: FG's desktop decal.
export function TableDecal({ session }: { session: Session }) {
  const id = session.options.decal;
  if (id === "") return null;
  if (id === "kraken") return <Emblem />;
  const url = session.decalUrl(id);
  return url ? <img key={id} className="emblem decal" src={url} alt="" draggable={false} /> : <Emblem />;
}

const KRAKEN: DecalItem = { id: "kraken", name: "Kraken", group: "Kraken" };

// Choose the background decal, as FG's Select Decal: pictures by name, a
// search, no decal at all. Better than FG: Browse picks a picture from
// anywhere on this computer (or drop one here); it is copied into Kraken's
// assets folder, so every campaign can use it from then on.
export function DecalPicker({ session, onClose }: { session: Session; onClose: () => void }) {
  const [items, setItems] = useState<DecalItem[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState(session.options.decal);
  const [dropping, setDropping] = useState(false);
  const kraken = window.kraken;

  useEffect(() => {
    let live = true;
    session
      .decalList()
      .then((list) => live && setItems(list))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [session.decalList]);

  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    return [KRAKEN, ...(items ?? [])].filter((item) => !wanted || `${item.group} ${item.name}`.toLowerCase().includes(wanted));
  }, [items, search]);

  function apply(id: string) {
    session.setTableOptions({ decal: id });
    onClose();
  }

  function added(item: DecalItem) {
    setItems((current) => [item, ...(current ?? []).filter((other) => other.id !== item.id)]);
    setChosen(item.id);
    setSearch("");
  }

  async function browse() {
    setFailed("");
    try {
      const item = await kraken?.pickDecal();
      if (item) added(item);
    } catch (error) {
      setFailed(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Could not add that picture.");
    }
  }

  async function drop(event: DragEvent) {
    event.preventDefault();
    setDropping(false);
    const file = event.dataTransfer.files[0];
    if (!file || !kraken) return;
    setFailed("");
    try {
      added(await kraken.addDecal(file.name, new Uint8Array(await file.arrayBuffer())));
    } catch (error) {
      setFailed(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Could not add that picture.");
    }
  }

  return (
    <div
      className={dropping ? "decal-picker dropping" : "decal-picker"}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => void drop(event)}
    >
      <div className="decal-grid" role="listbox" aria-label="Decals">
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={chosen === item.id}
            className={chosen === item.id ? "decal-tile on" : "decal-tile"}
            data-decal={item.id}
            title={`${item.group}\n${item.name}`}
            onClick={() => setChosen(item.id)}
            onDoubleClick={() => apply(item.id)}
          >
            <span className="decal-thumb">{item.id === "kraken" ? <Emblem className="decal-image" /> : <img className="decal-image" src={session.decalUrl(item.id)} alt="" loading="lazy" draggable={false} />}</span>
            <span className="decal-name">{item.name}</span>
          </button>
        ))}
        {items === null ? <p className="hint">Gathering decals…</p> : null}
        {items !== null && shown.length === 1 && !search ? (
          <p className="hint decal-empty">Browse for a picture, or drop one here: it is kept in your assets folder for every campaign. (FG's vault art packs are locked by SmiteWorks, so Kraken does not read them.)</p>
        ) : null}
      </div>
      <div className="decal-search">
        <input type="search" placeholder="Search decals" aria-label="Search decals" value={search} onChange={(event) => setSearch(event.target.value)} />
        {kraken ? (
          <button type="button" className="ghost" title="Open the folder Kraken keeps decals in" onClick={() => void kraken.openDecalFolder()}>
            Assets folder
          </button>
        ) : null}
      </div>
      {failed ? (
        <p className="error" role="alert">
          {failed}
        </p>
      ) : null}
      <div className="decal-actions">
        {kraken ? (
          <button type="button" data-action="decal-browse" onClick={() => void browse()}>
            Browse…
          </button>
        ) : null}
        <button type="button" data-action="decal-empty" onClick={() => apply("")}>
          Use Empty Decal
        </button>
        <span className="spacer" />
        <button type="button" className="primary" data-action="decal-ok" onClick={() => apply(chosen)}>
          OK
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
