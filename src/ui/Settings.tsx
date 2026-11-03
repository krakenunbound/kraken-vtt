import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { DecalItem, PictureKind, Session } from "../session/useSession";
import { Emblem } from "./Emblem";
import { useWindows } from "./Windows";

// Settings, as FG's settings cog: a button for each thing to set. Everyone
// sets their own dice; the GM also sets what the whole table sees.
export function SettingsWindow({ session }: { session: Session }) {
  const windows = useWindows();
  const gm = session.role === "dm";
  return (
    <div className="settings-window">
      <div className="settings-grid">
        <button type="button" className="settings-button" data-setting="dice" onClick={() => windows.open("dice", "Dice")}>
          Dice
        </button>
        {gm ? (
          <>
            <button type="button" className="settings-button" data-setting="decal" onClick={() => windows.open("decals", "Background Decal")}>
              Background Decal
            </button>
            <button type="button" className="settings-button" data-setting="wallpaper" onClick={() => windows.open("wallpapers", "Desktop Wallpaper")}>
              Desktop Wallpaper
            </button>
            <button type="button" className="settings-button" data-setting="gmicon" onClick={() => windows.open("gmicons", "GM Icon")}>
              GM Icon
            </button>
          </>
        ) : null}
      </div>
      {gm ? <label className="settings-check">
        <input type="checkbox" checked={session.options.towerReveal} onChange={(event) => session.setTableOptions({ towerReveal: event.target.checked })} />
        Let players see their own dice-tower rolls (unticked: only the GM sees them, as in FG)
      </label> : null}
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
  const gmIcon = kind === "gmicon";
  const current = wallpaper ? session.options.wallpaper : gmIcon ? session.options.gmIcon : session.options.decal;
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

  const all = useMemo(() => [...(wallpaper || gmIcon ? [] : [KRAKEN]), ...(items ?? [])], [items, wallpaper, gmIcon]);
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
    session.setTableOptions(wallpaper ? { wallpaper: id } : gmIcon ? { gmIcon: id } : { decal: id });
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
              <span className={gmIcon ? "decal-thumb icon" : "decal-thumb"}>
                {item.id === "kraken" ? <Emblem className="decal-image" /> : <img className="decal-image" src={session.decalUrl(item.id, kind)} alt="" loading="lazy" draggable={false} />}
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
        <input type="search" placeholder={wallpaper ? "Search wallpapers" : gmIcon ? "Search icons" : "Search decals"} aria-label="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        {kraken ? (
          <button type="button" className="ghost" title="Open the folder Kraken keeps these in" onClick={() => void kraken.openDecalFolder(kind)}>
            Assets folder
          </button>
        ) : null}
      </div>
      {gmIcon ? <p className="hint">Your picture beside everything you say in chat, for the whole table. It follows you into every new campaign.</p> : null}
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
          {wallpaper ? "Plain Desktop" : gmIcon ? "Name Only" : "Use Empty Decal"}
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
