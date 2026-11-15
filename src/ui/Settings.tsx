import type { StudioSettings } from "../kraken";
import { diceStore } from "../dice/diceStore";
import { PALETTE } from "../dice/DiceWindow";
import { TOWER_LOOKS, TowerArt, towerLook } from "./TowerArt";
import { useEffect, useMemo, useState, useSyncExternalStore, type DragEvent } from "react";
import { cardsStore } from "../cards/cardsStore";
import type { DecalItem, PictureKind, Session } from "../session/useSession";
import { Emblem } from "./Emblem";
import { useWindows } from "./Windows";
import { SettingRow, SettingsSection, Toggle } from "./SettingsParts";
import { manifestOf, PANELS } from "../rulesets";
import { TokenOptionsSection } from "../table/TokenOptions";
import { BookkeepingSettings } from "../bookkeeping/BookkeepingSettings";

// Settings, as FG's settings cog: a button for each thing to set. Everyone
// sets their own dice; the GM also sets what the whole table sees.
// You at the table (every seat): your colour (your token's ring, your pings,
// your drawings on the map, for everyone) and what happens when your turn
// comes round. Kept with your name by the GM's app, so they follow you.
function YouAtTheTable() {
  const settings = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  return (
    <SettingsSection title="You at the table" setting="you">
      <div className="set-row set-colours">
        <span className="set-text">
          <span className="set-label">Your colour</span>
          <span className="set-hint">Rings your tokens and colours your pings and drawings, so everyone knows who is who.</span>
        </span>
        <div className="you-colours" role="radiogroup" aria-label="Your colour">
          <button type="button" role="radio" aria-checked={settings.color === null} className={settings.color === null ? "swatch mine on" : "swatch mine"} title="The table's colour for your name" data-you-color="default" onClick={() => diceStore.update({ color: null })}>
            Auto
          </button>
          {PALETTE.map((color) => (
            <button key={color} type="button" role="radio" aria-checked={settings.color === color} aria-label={`Colour ${color}`} className={settings.color === color ? "swatch on" : "swatch"} style={{ background: color }} data-you-color={color} onClick={() => diceStore.update({ color })} />
          ))}
          <label className="you-other" title="Pick any colour">
            <input type="color" aria-label="Pick your colour" value={settings.color ?? "#e8c46a"} onChange={(event) => diceStore.update({ color: event.target.value })} />
          </label>
        </div>
      </div>
      <Toggle label="Chime on your turn" hint="A soft chime when your turn comes round in combat." setting="turn-sound" checked={settings.turnSound !== false} onChange={(on) => diceStore.update({ turnSound: on })} />
      <Toggle label="Banner on your turn" hint="Your name across the screen when it is your turn." setting="turn-banner" checked={settings.turnBanner !== false} onChange={(on) => diceStore.update({ turnBanner: on })} />
    </SettingsSection>
  );
}

export function SettingsWindow({ session }: { session: Session }) {
  const windows = useWindows();
  const gm = session.role === "dm";
  return (
    <div className="settings-window">
      <div className="settings-grid" role="group" aria-label="Look and feel">
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
            <button type="button" className="settings-button" data-setting="death-markers" onClick={() => windows.open("deathmarkers", "Death Markers")}>
              Death Markers
            </button>
            {window.kraken?.openKrakenFolder ? (
              <button type="button" className="settings-button" data-setting="kraken-folder" title="Documents/Kraken VTT: a folder for each kind of thing you add (books, dice packs, dice towers, GM icons, decals, wallpapers), each with a README on what goes in it and how to make one" onClick={() => void window.kraken?.openKrakenFolder?.("")}>
                Kraken VTT Folder
              </button>
            ) : null}
            {window.kraken?.openLogs ? (
              <button type="button" className="settings-button" data-setting="open-logs" title="Kraken's logs: what went wrong in the table server and in this window (the newest three files of each), for a bug report" onClick={() => void window.kraken?.openLogs?.()}>
                Open logs
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <YouAtTheTable />
      <CardsSetting />
      {gm ? (
        <SettingsSection title="Dice and the dice tower" setting="dice-table">
          <Toggle label="Players see their own tower rolls" hint="Off: only you see what goes into the dice tower, as in Fantasy Grounds." checked={Boolean(session.options.towerReveal)} onChange={(on) => session.setTableOptions({ towerReveal: on })} setting="tower-reveal" />
          <Toggle
            label="Dice tower on the table"
            hint="It stands apart from the chat, for everyone; each person places it where they like (right-click to lock it). Off: it sits in the chat."
            setting="tower-external"
            checked={Boolean(session.options.towerExternal)}
            onChange={(on) => session.setTableOptions({ towerExternal: on })}
          />
          {session.options.towerExternal ? (
            <SettingRow label="The tower's look" hint="Six drawn looks, painted towers, or a picture of your own.">
              <button type="button" className="settings-button" data-setting="tower-look" onClick={() => windows.open("towers", "Dice Tower")}>
                Choose…
              </button>
            </SettingRow>
          ) : null}
          <DiceHoldSetting session={session} />
        </SettingsSection>
      ) : null}
      {gm ? (
        <SettingsSection title="Combat" setting="combat">
          <SettingRow label="Clear targets" hint="When a creature's targets are cleared on the combat tracker.">
            <select value={(session.options as { clearTargets?: string }).clearTargets ?? "never"} onChange={(event) => session.setTableOptions({ clearTargets: event.target.value } as never)} aria-label="Clear targets" data-setting="clear-targets">
              <option value="never">Never (as FG)</option>
              <option value="action">After a spell or an attack's damage</option>
              <option value="turn">At the end of the creature's turn</option>
            </select>
          </SettingRow>
          <SettingRow label="Initiative" hint="Each creature rolls its own, or one roll for each kind of creature (all the goblins together), as FG's group initiative.">
            <select value={(session.options as { initGroup?: string }).initGroup ?? "each"} onChange={(event) => session.setTableOptions({ initGroup: event.target.value } as never)} aria-label="Initiative" data-setting="init-group">
              <option value="each">Each creature</option>
              <option value="kind">By kind of creature</option>
            </select>
          </SettingRow>
          <Toggle label="Roll initiative every round" hint="FG's house rule: at each new round everyone rolls initiative again and the order changes." checked={Boolean((session.options as { initEachRound?: boolean }).initEachRound)} onChange={(on) => session.setTableOptions({ initEachRound: on } as never)} setting="init-each-round" />
          <Toggle label="Stop at the start of each round" hint="FG's option: a new round waits for your next click before anyone acts, so you can handle what happens at the top of the round." checked={Boolean((session.options as { roundStop?: boolean }).roundStop)} onChange={(on) => session.setTableOptions({ roundStop: on } as never)} setting="round-stop" />
          <SettingRow label="Skip turns" hint="Whose turns the tracker passes over: dead and unconscious creatures (FG's), characters too, or no one.">
            <select value={(session.options as { skipDead?: string }).skipDead ?? "enemies"} onChange={(event) => session.setTableOptions({ skipDead: event.target.value } as never)} aria-label="Skip turns" data-setting="skip-dead">
              <option value="enemies">The dead and unconscious creatures</option>
              <option value="all">Characters too</option>
              <option value="off">No one</option>
            </select>
          </SettingRow>
          <SettingRow label="NPC numbering" hint="The same creature added again: numbered in order (Goblin 1, Goblin 2), with a random number (Goblin 14), or left as it is.">
            <select value={(session.options as { npcNumbering?: string }).npcNumbering ?? "append"} onChange={(event) => session.setTableOptions({ npcNumbering: event.target.value } as never)} aria-label="NPC numbering" data-setting="npc-numbering">
              <option value="append">In order</option>
              <option value="random">Random</option>
              <option value="off">Off</option>
            </select>
          </SettingRow>
          <SettingRow label="Token effects" hint="Conditions and effects on tokens (Zzz, flames, frost, a buff's glow): animated, icons only, or not drawn. Everyone's screen; motion stops anyway where the computer asks for reduced motion.">
            <select value={session.options.tokenEffects ?? "full"} onChange={(event) => session.setTableOptions({ tokenEffects: event.target.value as "full" })} aria-label="Token effects" data-setting="token-effects">
              <option value="full">Animated</option>
              <option value="icons">Icons only</option>
              <option value="off">Off</option>
            </select>
          </SettingRow>
          <SettingRow label="Apply damage" hint="Damage and healing land as the roll does (FG), or wait on the chat card's buttons (Foundry). Either way the card's buttons change what a creature took.">
            <select value={session.options.autoApply === false ? "card" : "auto"} onChange={(event) => session.setTableOptions({ autoApply: event.target.value === "auto" })} aria-label="Apply damage" data-setting="auto-apply">
              <option value="auto">At once (FG)</option>
              <option value="card">From the chat card (Foundry)</option>
            </select>
          </SettingRow>
        </SettingsSection>
      ) : null}
      {gm ? <BookkeepingSettings session={session} /> : null}
      {gm ? <TokenOptionsSection session={session} /> : null}
      {/* The rows the game adds (its manifest's settings), only in that game. */}
      {(manifestOf(session.ruleset).settings ?? []).map((item) => {
        const ref = "component" in item && (!item.gm || gm) ? item.component : "";
        const Part = ref ? PANELS[ref] : null;
        return Part ? <Part key={ref} session={session} /> : null;
      })}
      {gm ? <StudioFoldersSetting /> : null}
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
    <SettingsSection title="Map Studio art" setting="studio-folders">
      {error ? <p className="error">{error}</p> : null}
      {lists.map(([key, kind, label, hint]) => (
        <div key={key} className="studio-folder-list" data-studio-folders={key}>
          <span className="set-text">
            <span className="set-label">{label}</span>
            <span className="set-hint">{hint}.</span>
          </span>
          <div className="studio-folder-items">
          {(settings?.[key] ?? []).length === 0 ? <span className="set-hint">None yet.</span> : null}
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
        </div>
      ))}
    </SettingsSection>
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
    <SettingRow label="Dice stay on the table" hint="Seconds the landed dice stay before they fade, for everyone." className="settings-dice-hold">
      <input type="range" min={0.5} max={15} step={0.1} value={Math.min(15, seconds)} aria-label="Dice on the table (slider)" data-setting="dice-hold-slider" onChange={(event) => setSeconds(Number(event.target.value))} onPointerUp={() => send(seconds)} onKeyUp={() => send(seconds)} onBlur={() => send(seconds)} />
      <input type="number" className="set-number" min={0.5} max={60} step={0.1} value={seconds} aria-label="Dice on the table (seconds)" data-setting="dice-hold" onChange={(event) => setSeconds(Number(event.target.value))} onBlur={(event) => send(Number(event.target.value))} onKeyDown={(event) => event.key === "Enter" && send(Number((event.target as HTMLInputElement).value))} />
      <span className="set-unit">s</span>
    </SettingRow>
  );
}

// Ability cards: off unless this player wants them (kept in this browser).
function CardsSetting() {
  const cards = useSyncExternalStore(cardsStore.subscribe, cardsStore.settings);
  return (
    <SettingsSection title="Ability cards" setting="cards-section">
      <Toggle label="Spells and weapons as cards" hint="A Cards button in the sidebar with your character's abilities as painted cards." setting="cards" checked={cards.on} onChange={(on) => cardsStore.set({ on })} />
      {cards.on ? <Toggle label="Card effects" hint="Flips, foil and sparks." setting="card-effects" checked={cards.effects} onChange={(on) => cardsStore.set({ effects: on })} /> : null}
    </SettingsSection>
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
  // The dice tower: Kraken's drawn looks first, then the GM's own tower pictures.
  const tower = kind === "tower";
  const current = wallpaper ? session.options.wallpaper : gmIcon ? session.options.gmIcon : tower ? session.options.towerStyle || "stone" : session.options.decal;
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

  const all = useMemo(
    () => [...(tower ? TOWER_LOOKS.map((look): DecalItem => ({ id: look.id, name: look.name, group: "Kraken" })) : wallpaper || gmIcon ? [] : [KRAKEN]), ...(items ?? [])],
    [items, wallpaper, gmIcon, tower],
  );
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
    session.setTableOptions(wallpaper ? { wallpaper: id } : gmIcon ? { gmIcon: id } : tower ? { towerStyle: id || "stone" } : { decal: id });
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
              <span className={gmIcon ? "decal-thumb icon" : tower ? "decal-thumb tower" : "decal-thumb"}>
                {tower && towerLook(item.id) ? <TowerArt on={chosen === item.id} style={item.id} size={52} /> : item.id === "kraken" ? <Emblem className="decal-image" /> : <img className="decal-image" src={session.decalUrl(item.id, kind)} alt="" loading="lazy" draggable={false} />}
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
        <input type="search" placeholder={wallpaper ? "Search wallpapers" : gmIcon ? "Search icons" : tower ? "Search towers" : "Search decals"} aria-label="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
        {kraken ? (
          <button type="button" className="ghost" title="Open the folder Kraken keeps these in" onClick={() => void kraken.openDecalFolder(kind)}>
            Assets folder
          </button>
        ) : null}
      </div>
      {tower ? <p className="hint">How the dice tower looks on the table, for everyone. Browse or drop a picture of your own (a PNG with a clear background stands best); it is kept in your assets folder for every campaign.</p> : null}
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
        {tower ? null : (
          <button type="button" data-action="decal-empty" onClick={() => apply("")}>
            {wallpaper ? "Plain Desktop" : gmIcon ? "Name Only" : "Use Empty Decal"}
          </button>
        )}
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
