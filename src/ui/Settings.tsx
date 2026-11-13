import type { StudioSettings } from "../kraken";
import { useEffect, useMemo, useState, useSyncExternalStore, type DragEvent } from "react";
import { cardsStore } from "../cards/cardsStore";
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
            <button type="button" className="settings-button" data-setting="krits" onClick={() => windows.open("krits", "Critical Hits & Fumbles")}>
              Critical Hits &amp; Fumbles
            </button>
          </>
        ) : null}
      </div>
      <CardsSetting />
      {gm ? <label className="settings-check">
        <input type="checkbox" checked={session.options.towerReveal} onChange={(event) => session.setTableOptions({ towerReveal: event.target.checked })} />
        Let players see their own dice-tower rolls (unticked: only the GM sees them, as in FG)
      </label> : null}
      {gm ? <DiceHoldSetting session={session} /> : null}
      {gm ? <StudioFoldersSetting /> : null}
      {gm && session.ruleset === "D&D 3.5E" ? <Wizard35Setting session={session} /> : null}
      {gm && session.ruleset === "AD&D 2E" ? <Wizard2eSetting session={session} /> : null}
      {gm ? (
        <label className="settings-check">
          Clear targets{" "}
          <select value={(session.options as { clearTargets?: string }).clearTargets ?? "never"} onChange={(event) => session.setTableOptions({ clearTargets: event.target.value } as never)} aria-label="Clear targets" data-setting="clear-targets">
            <option value="never">Never (as FG)</option>
            <option value="action">After a spell or an attack's damage</option>
            <option value="turn">At the end of the creature's turn</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

// Map Studio's asset packs (the GM's): the folders of Dungeondraft packs and
// of art packs (.mod) it reads. Nothing is assumed: each GM points at their
// own (Fantasy Grounds' modules folder is read anyway). Changed, Map Studio's
// library is read again.
function StudioFoldersSetting() {
  const kraken = window.kraken;
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void kraken?.studioSettings?.().then(setSettings).catch((reason: Error) => setError(reason.message));
  }, []);
  if (!kraken?.studioSettings) return null;
  const save = (patch: { dungeondraftFolders?: string[]; packFolders?: string[] }) =>
    void kraken.studioSettings?.(patch).then(setSettings).catch((reason: Error) => setError(reason.message));
  const lists: [keyof Pick<StudioSettings, "dungeondraftFolders" | "packFolders">, "dd" | "pack", string, string][] = [
    ["dungeondraftFolders", "dd", "Dungeondraft packs", "Folders holding .dungeondraft_pack files"],
    ["packFolders", "pack", "Art packs", "Folders holding art packs (.mod); Fantasy Grounds' modules folder is read anyway"],
  ];
  return (
    <fieldset className="settings-group studio-folders" data-setting="studio-folders">
      <legend>Map Studio art</legend>
      {error ? <p className="error">{error}</p> : null}
      {lists.map(([key, kind, label, hint]) => (
        <div key={key} className="studio-folder-list" data-studio-folders={key}>
          <b title={hint}>{label}</b>
          {(settings?.[key] ?? []).length === 0 ? <span className="hint">None yet.</span> : null}
          {(settings?.[key] ?? []).map((folder) => (
            <span key={folder} className={settings?.found[folder] === false ? "studio-folder missing" : "studio-folder"} data-folder={folder} title={settings?.found[folder] === false ? "This folder is not there" : folder}>
              {folder}
              <button type="button" aria-label={`Stop reading ${folder}`} onClick={() => save({ [key]: (settings?.[key] ?? []).filter((item) => item !== folder) })}>
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            data-action={`studio-add-${kind}`}
            title={hint}
            onClick={() => {
              void kraken.studioPickFolder?.(kind).then((folder) => {
                if (folder) save({ [key]: [...(settings?.[key] ?? []), folder] });
              });
            }}
          >
            Add a folder…
          </button>
        </div>
      ))}
    </fieldset>
  );
}

// How long landed dice stay on the table before they fade, for every seat:
// the GM's to set (a slider and the seconds), sent when the slider is let go.
function DiceHoldSetting({ session }: { session: Session }) {
  const saved = session.options.diceHold ?? 2.6;
  const [seconds, setSeconds] = useState(saved);
  useEffect(() => setSeconds(saved), [saved]);
  const send = (value: number) => {
    const clean = Math.round(Math.min(60, Math.max(0.5, value)) * 10) / 10;
    setSeconds(clean);
    if (clean !== saved) session.setTableOptions({ diceHold: clean } as never);
  };
  return (
    <label className="settings-check settings-dice-hold">
      Dice stay on the table for{" "}
      <input type="range" min={0.5} max={15} step={0.1} value={Math.min(15, seconds)} aria-label="Dice on the table (slider)" data-setting="dice-hold-slider" onChange={(event) => setSeconds(Number(event.target.value))} onPointerUp={() => send(seconds)} onKeyUp={() => send(seconds)} onBlur={() => send(seconds)} />
      <input type="number" min={0.5} max={60} step={0.1} value={seconds} aria-label="Dice on the table (seconds)" data-setting="dice-hold" style={{ width: "4.5em" }} onChange={(event) => setSeconds(Number(event.target.value))} onBlur={(event) => send(Number(event.target.value))} onKeyDown={(event) => event.key === "Enter" && send(Number((event.target as HTMLInputElement).value))} />{" "}
      seconds before they fade
    </label>
  );
}

// The D&D 3.5E character wizard's options, as the GM's FG extension has them
// (CW35M1-4, CW35RL, CW35LOW, CW35VOTK): for every player who makes a character.
const WIZARD35_METHODS: [number, string][] = [
  [1, "PHB Default (4d6 drop lowest, arrange)"],
  [2, "Classic (3d6 in order)"],
  [3, "Standard Array (15, 14, 13, 12, 10, 8)"],
  [4, "Manual Entry (type scores directly)"],
];
function Wizard35Setting({ session }: { session: Session }) {
  const options = session.options.wizard35 ?? { methods: [1, 2, 3, 4], rollLock: false, lowReroll: false, vault: false };
  const set = (patch: Partial<typeof options>) => session.setTableOptions({ wizard35: { ...options, ...patch } });
  return (
    <fieldset className="settings-group" data-setting="wizard35">
      <legend>D&amp;D 3.5E Character Wizard</legend>
      {WIZARD35_METHODS.map(([id, label]) => (
        <label key={id} className="settings-check">
          <input
            type="checkbox"
            data-setting={`wizard35-method-${id}`}
            checked={options.methods.includes(id)}
            onChange={(event) => set({ methods: event.target.checked ? [...options.methods, id].sort() : options.methods.filter((item) => item !== id) })}
          />
          Ability method: {label}
        </label>
      ))}
      <label className="settings-check">
        <input type="checkbox" data-setting="wizard35-roll-lock" checked={options.rollLock} onChange={(event) => set({ rollLock: event.target.checked })} />
        Lock ability scores after the first roll
      </label>
      <label className="settings-check">
        <input type="checkbox" data-setting="wizard35-low-reroll" checked={options.lowReroll} onChange={(event) => set({ lowReroll: event.target.checked })} />
        House rule: a 4d6 score under 8 may be rerolled once with 3d6 (the new result stands)
      </label>
      <label className="settings-check">
        <input type="checkbox" data-setting="wizard35-vault" checked={options.vault} onChange={(event) => set({ vault: event.target.checked })} />
        Vault of the Kraken hand-me-downs: its poor or secondhand gear is free in the wizard&apos;s shop
      </label>
    </fieldset>
  );
}

// The AD&D 2E character wizard's options, as the FG extension's (Options >
// Kraken Character Wizard): ability rolls once only, the PHB methods players
// may pick from, starting gold above 1st level.
const METHOD_NAMES = ["Method I (3d6, in order)", "Method II (3d6 twice each, keep higher)", "Method III (3d6 x6, arrange)", "Method IV (3d6 x12, keep best 6)", "Method V (4d6, drop lowest)", "Method VI (all 8s, then place 7d6)"];
function Wizard2eSetting({ session }: { session: Session }) {
  const options = session.options.wizard2e ?? { rollLock: false, methods: [1, 2, 3, 4, 5, 6], gold: "phb" as const };
  const set = (patch: Partial<typeof options>) => session.setTableOptions({ wizard2e: { ...options, ...patch } });
  return (
    <fieldset className="settings-check" data-setting="wizard2e">
      <legend>AD&amp;D 2E Character Wizard</legend>
      <label>
        <input type="checkbox" checked={options.rollLock} data-setting="wizard2e-lock" onChange={(event) => set({ rollLock: event.target.checked })} /> Lock ability rolls (one roll only)
      </label>
      {METHOD_NAMES.map((label, index) => (
        <label key={label}>
          <input
            type="checkbox"
            checked={options.methods.includes(index + 1)}
            data-setting={`wizard2e-method${index + 1}`}
            onChange={(event) => set({ methods: event.target.checked ? [...options.methods, index + 1].sort() : options.methods.filter((n) => n !== index + 1) })}
          />{" "}
          Allow ability {label}
        </label>
      ))}
      <label>
        Starting gold above 1st level{" "}
        <select value={options.gold} aria-label="Starting gold above 1st level" data-setting="wizard2e-gold" onChange={(event) => set({ gold: event.target.value as typeof options.gold })}>
          <option value="phb">PHB (one roll)</option>
          <option value="perlevel">One roll per level</option>
          <option value="xlevel">Roll x level</option>
        </select>
      </label>
    </fieldset>
  );
}

// Ability cards: off unless this player wants them (kept in this browser).
function CardsSetting() {
  const cards = useSyncExternalStore(cardsStore.subscribe, cardsStore.settings);
  return (
    <>
      <label className="settings-check">
        <input type="checkbox" data-setting="cards" checked={cards.on} onChange={(event) => cardsStore.set({ on: event.target.checked })} />
        Ability cards: my spells and weapons as cards (a Cards button in the sidebar)
      </label>
      {cards.on ? (
        <label className="settings-check">
          <input type="checkbox" data-setting="card-effects" checked={cards.effects} onChange={(event) => cardsStore.set({ effects: event.target.checked })} />
          Card effects (flips, foil, sparks)
        </label>
      ) : null}
    </>
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
