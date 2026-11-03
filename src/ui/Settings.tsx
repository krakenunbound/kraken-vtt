import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { DecalItem, PictureKind, Session } from "../session/useSession";
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
        <button type="button" className="settings-button" data-setting="wallpaper" onClick={() => windows.open("wallpapers", "Desktop Wallpaper")}>
          Desktop Wallpaper
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
const cleanError = (error: unknown) => (error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Could not add that picture.");

// The game this campaign is played with (Kraken's own pictures come in a set for each).
function useCampaignRuleset(session: Session) {
  const [ruleset, setRuleset] = useState("");
  const campaignId = session.hostInfo?.campaignId ?? "";
  useEffect(() => {
    let live = true;
    void window.kraken
      ?.campaigns()
      .then((list) => live && setRuleset(list.find((item) => item.id === campaignId)?.ruleset ?? ""))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [campaignId]);
  return ruleset;
}

// Choose the background decal, as FG's Select Decal, or the desktop's
// wallpaper (FG's desktop theme): pictures by name, a set for each game
// (this campaign's first), a search, none at all. Better than FG: Browse picks
// a picture from anywhere on this computer (or drop one here); it is copied
// into Kraken's assets folder, so every campaign can use it from then on.
export function DecalPicker({ session, kind = "decal", onClose }: { session: Session; kind?: PictureKind; onClose: () => void }) {
  const wallpaper = kind === "wallpaper";
  const current = wallpaper ? session.options.wallpaper : session.options.decal;
  const [items, setItems] = useState<DecalItem[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [chosen, setChosen] = useState(current);
  const [dropping, setDropping] = useState(false);
  const kraken = window.kraken;
  const ruleset = useCampaignRuleset(session);

  useEffect(() => {
    let live = true;
    session
      .decalList(kind)
      .then((list) => live && setItems(list))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [session.decalList, kind]);

  const all = useMemo(() => [...(wallpaper ? [] : [KRAKEN]), ...(items ?? [])], [items, wallpaper]);
  // A chip for each set: this campaign's game first, then Kraken's, then the rest.
  const sets = useMemo(() => {
    const names = [...new Set(all.map((item) => item.ruleset ?? item.group))];
    return names.sort((a, b) => Number(b === ruleset) - Number(a === ruleset) || Number(b === "Kraken") - Number(a === "Kraken"));
  }, [all, ruleset]);
  const shown = useMemo(() => {
    const wanted = search.trim().toLowerCase();
    const mine = (item: DecalItem) => Number(!!ruleset && item.ruleset === ruleset);
    return all
      .filter((item) => !group || (item.ruleset ?? item.group) === group)
      .filter((item) => !wanted || `${item.group} ${item.name} ${item.ruleset ?? ""}`.toLowerCase().includes(wanted))
      .sort((a, b) => mine(b) - mine(a));
  }, [all, group, search, ruleset]);

  function apply(id: string) {
    session.setTableOptions(wallpaper ? { wallpaper: id } : { decal: id });
    onClose();
  }

  function added(item: DecalItem) {
    setItems((list) => [item, ...(list ?? []).filter((other) => other.id !== item.id)]);
    setChosen(item.id);
    setSearch("");
    setGroup("");
  }

  async function browse() {
    setFailed("");
    try {
      const item = await kraken?.pickDecal(kind);
      if (item) added(item);
    } catch (error) {
      setFailed(cleanError(error));
    }
  }

  async function drop(event: DragEvent) {
    event.preventDefault();
    setDropping(false);
    const file = event.dataTransfer.files[0];
    if (!file || !kraken) return;
    setFailed("");
    try {
      added(await kraken.addDecal(file.name, new Uint8Array(await file.arrayBuffer()), kind));
    } catch (error) {
      setFailed(cleanError(error));
    }
  }

  return (
    <div
      className={dropping ? "decal-picker dropping" : "decal-picker"}
      data-kind={kind}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => void drop(event)}
    >
      {sets.length > 1 ? (
        <div className="decal-sets" role="tablist" aria-label="Sets">
          <button type="button" role="tab" aria-selected={group === ""} className={group === "" ? "decal-set on" : "decal-set"} onClick={() => setGroup("")}>
            All
          </button>
          {sets.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={group === name} className={group === name ? "decal-set on" : "decal-set"} data-set={name} onClick={() => setGroup(name)}>
              {name}
              {name === ruleset ? <span className="decal-set-mark">this campaign</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className={wallpaper ? "decal-grid walls" : "decal-grid"} role="listbox" aria-label={wallpaper ? "Wallpapers" : "Decals"}>
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
            {wallpaper ? (
              <span className="decal-thumb wall" style={{ backgroundImage: `url("${session.decalUrl(item.id, "wallpaper")}")` }} />
            ) : (
              <span className="decal-thumb">
                {item.id === "kraken" ? <Emblem className="decal-image" /> : <img className="decal-image" src={session.decalUrl(item.id)} alt="" loading="lazy" draggable={false} />}
              </span>
            )}
            <span className="decal-name">{item.name}</span>
            {group === "" && item.group !== "Kraken" && item.group !== item.name ? <span className="decal-group">{item.group}</span> : null}
          </button>
        ))}
        {items === null ? <p className="hint">Gathering pictures…</p> : null}
        {items !== null && shown.length === 0 ? <p className="hint decal-empty">Nothing by that name.</p> : null}
      </div>
      <div className="decal-search">
        <input type="search" placeholder={wallpaper ? "Search wallpapers" : "Search decals"} aria-label="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        {kraken ? (
          <button type="button" className="ghost" title="Open the folder Kraken keeps these in" onClick={() => void kraken.openDecalFolder(kind)}>
            Assets folder
          </button>
        ) : null}
      </div>
      {wallpaper ? <p className="hint">A wallpaper repeats across the desktop, so a picture that tiles works best. A picture you add is kept in your assets folder for every campaign.</p> : null}
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
          {wallpaper ? "Plain Desktop" : "Use Empty Decal"}
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
