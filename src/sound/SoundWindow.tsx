import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Session, SoundItem, SoundLibrary, SoundTrigger } from "../session/useSession";
import { Icon } from "../ui/icons";
import { KINDS, sound, type SoundKind } from "./soundEngine";

// The Sound window (Syrinscape's, inside Kraken): the GM's one-shots, sound
// effects, ambience loops and music, all from the GM's own sounds and played
// to every seat; the chat's sound triggers; and each seat's own volumes.

type Tab = SoundKind | "triggers" | "volume";
const TABS: { id: Tab; name: string; gm: boolean }[] = [
  { id: "oneshots", name: "One-shots", gm: true },
  { id: "sfx", name: "Sound effects", gm: true },
  { id: "ambience", name: "Ambience", gm: true },
  { id: "music", name: "Music", gm: true },
  { id: "triggers", name: "Chat triggers", gm: true },
  { id: "volume", name: "Volume", gm: false },
];

export function VolumePanel() {
  const volumes = useSyncExternalStore(sound.subscribe, sound.volumes);
  const row = (key: "master" | SoundKind, name: string) => (
    <label key={key} className="sound-volume">
      <span>{name}</span>
      <input type="range" min={0} max={1} step={0.05} value={volumes[key]} aria-label={`${name} volume`} onChange={(event) => sound.setVolumes({ [key]: Number(event.target.value) })} />
      <b>{Math.round(volumes[key] * 100)}%</b>
    </label>
  );
  return (
    <div className="sound-volumes">
      {row("master", "Everything")}
      {KINDS.map((kind) => row(kind.id, kind.name))}
      <label className="check">
        <input type="checkbox" checked={volumes.muted} onChange={(event) => sound.setVolumes({ muted: event.target.checked })} />
        Mute this screen
      </label>
      <p className="hint">These are yours: every player sets their own.</p>
    </div>
  );
}

const leaf = (group: string) => group.split("/").pop() || group;

function Browser({ session, kind, library, reload }: { session: Session; kind: SoundKind; library: SoundLibrary; reload: () => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [folder, setFolder] = useState("");
  const scape = session.soundscape;
  const groups = useMemo(
    () => library.groups.filter((group) => group.id.startsWith(`${kind}/`) && (!search || group.id.toLowerCase().includes(search.toLowerCase()))),
    [library, kind, search],
  );
  const inGroup = (group: string): SoundItem[] => library.sounds.filter((item) => `${item.kind}/${item.group}` === group);
  const loop = (id: string) => scape.ambience.some((item) => item.id === id);
  const play = (id: string) => {
    if (kind === "ambience") session.soundCommand({ type: "ambience", action: "add", id });
    else if (kind === "music") session.soundCommand({ type: "music", action: "play", id });
    else session.soundCommand({ type: "sound-play", id });
  };
  const add = async () => {
    await window.kraken?.pickSounds(kind, folder);
    reload();
  };
  return (
    <div className="sound-browser">
      {kind === "ambience" && scape.ambience.length > 0 ? (
        <div className="sound-now">
          <b>Playing now</b>
          {scape.ambience.map((item) => (
            <div key={item.id} className="sound-now-row">
              <span>{leaf(item.id.split("/").slice(1, -1).join("/") || item.id)}</span>
              <input type="range" min={0} max={1} step={0.05} value={item.volume} aria-label="Loop volume" onChange={(event) => session.soundCommand({ type: "ambience", action: "volume", id: item.id, volume: Number(event.target.value) })} />
              <button type="button" onClick={() => session.soundCommand({ type: "ambience", action: "remove", id: item.id })}>
                Stop
              </button>
            </div>
          ))}
          <button type="button" onClick={() => session.soundCommand({ type: "ambience", action: "clear" })}>
            Stop all
          </button>
        </div>
      ) : null}
      {kind === "music" && scape.music ? (
        <div className="sound-now">
          <b>Playing now</b>
          <div className="sound-now-row">
            <span>{leaf(scape.music.id.replace(/\.[^.]+$/, ""))}</span>
            <input type="range" min={0} max={1} step={0.05} value={scape.music.volume} aria-label="Music volume" onChange={(event) => session.soundCommand({ type: "music", action: "volume", volume: Number(event.target.value) })} />
            {scape.music.group ? (
              <button type="button" onClick={() => session.soundCommand({ type: "music", action: "next" })}>
                Next
              </button>
            ) : null}
            <button type="button" onClick={() => session.soundCommand({ type: "music", action: "stop" })}>
              Stop
            </button>
          </div>
        </div>
      ) : null}
      {kind === "oneshots" || kind === "sfx" ? (
        <button type="button" className="sound-stop" onClick={() => session.soundCommand({ type: "sound-stop" })}>
          Stop all sounds
        </button>
      ) : null}
      <input type="search" placeholder="Search" aria-label="Search sounds" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="sound-groups">
        {groups.length === 0 ? <p className="hint">No {KINDS.find((item) => item.id === kind)?.name.toLowerCase()} yet.</p> : null}
        {groups.map((group) => (
          <div key={group.id} className={open === group.id ? "sound-group open" : "sound-group"}>
            <div className="sound-group-row">
              <button type="button" className="sound-play" title={kind === "ambience" ? "Play this loop for the table" : kind === "music" ? "Play this folder for the table, track after track" : "Play one of these for the table"} aria-label={`Play ${group.id}`} data-sound-group={group.id} onClick={() => play(group.id)}>
                <Icon name="sound" size={14} />
              </button>
              <button type="button" className="sound-group-name" onClick={() => setOpen(open === group.id ? null : group.id)}>
                {group.id.split("/").slice(1).join(" › ")}
                <small>{group.count}</small>
              </button>
            </div>
            {open === group.id ? (
              <div className="sound-files">
                {inGroup(group.id).map((item) => (
                  <button key={item.id} type="button" className={loop(item.id) ? "on" : ""} data-sound={item.id} onClick={() => play(item.id)}>
                    <Icon name="sound" size={12} /> {item.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {window.kraken ? (
        <div className="sound-add">
          <input placeholder="Folder (e.g. Doors/Creaky)" aria-label="Folder to add sounds to" value={folder} onChange={(event) => setFolder(event.target.value)} />
          <button type="button" onClick={() => void add()}>
            Add sounds…
          </button>
          <button type="button" className="ghost" onClick={() => void window.kraken?.openSoundFolder()}>
            Sounds folder
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Triggers({ session, library }: { session: Session; library: SoundLibrary }) {
  const [list, setList] = useState<SoundTrigger[]>(session.soundTriggers);
  const [search, setSearch] = useState("");
  useEffect(() => setList(session.soundTriggers), [session.soundTriggers]);
  const count = (folder: string) => library.groups.filter((group) => group.id === folder || group.id.startsWith(`${folder}/`)).reduce((sum, group) => sum + group.count, 0);
  const save = (next: SoundTrigger[]) => {
    setList(next);
    session.soundCommand({ type: "sound-triggers", triggers: next });
  };
  const shown = list.filter((item) => !search || `${item.name} ${item.on} ${item.result} ${item.sound}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="sound-triggers">
      <p className="hint">When a chat line fits a trigger, its sound plays for everyone who sees the line, as its result shows. The first trigger that fits, and has sounds, plays.</p>
      <div className="sound-add">
        <input type="search" placeholder="Search triggers" aria-label="Search triggers" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" onClick={() => session.soundCommand({ type: "sound-triggers", triggers: "default" })}>
          Kraken's triggers
        </button>
      </div>
      <div className="sound-trigger-list">
        {shown.map((item) => {
          const sounds = count(item.sound);
          return (
            <div key={item.id} className={item.enabled ? "sound-trigger" : "sound-trigger off"} data-trigger={item.id}>
              <input type="checkbox" checked={item.enabled} aria-label={`${item.name} on`} onChange={(event) => save(list.map((other) => (other.id === item.id ? { ...other, enabled: event.target.checked } : other)))} />
              <span className="sound-trigger-name">
                <b>{item.name}</b>
                <small>
                  {item.on} · {item.result}
                  {item.match ? ` · "${item.match.length > 40 ? `${item.match.slice(0, 40)}…` : item.match}"` : ""}
                </small>
              </span>
              <input className="sound-trigger-sound" value={item.sound} aria-label={`${item.name} sound`} onChange={(event) => setList(list.map((other) => (other.id === item.id ? { ...other, sound: event.target.value } : other)))} onBlur={() => save(list)} />
              <small className={sounds ? "has" : "none"}>{sounds ? `${sounds} sound${sounds === 1 ? "" : "s"}` : "no sounds yet"}</small>
              <button type="button" className="sound-play" aria-label={`Hear ${item.name}`} disabled={!sounds} onClick={() => session.soundCommand({ type: "sound-play", id: item.sound })}>
                <Icon name="sound" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SoundWindow({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const [tab, setTab] = useState<Tab>(gm ? "oneshots" : "volume");
  const [library, setLibrary] = useState<SoundLibrary | null>(null);
  const reload = () => {
    if (gm) session.soundList().then(setLibrary).catch(() => setLibrary({ sounds: [], groups: [], folder: "" }));
  };
  useEffect(reload, [gm]);
  // A folder of music plays track after track: the GM's screen asks for the next.
  useEffect(() => {
    if (!gm) return;
    sound.onMusicEnded(() => session.soundCommand({ type: "music", action: "next" }));
    return () => sound.onMusicEnded(null);
  }, [gm, session.soundCommand]);
  const empty = library && library.sounds.length === 0;
  return (
    <div className="sound-window">
      <div className="sound-tabs" role="tablist">
        {TABS.filter((item) => gm || !item.gm).map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "dice-chip on" : "dice-chip"} data-tab={item.id} onClick={() => setTab(item.id)}>
            {item.name}
          </button>
        ))}
      </div>
      {gm && empty && tab !== "volume" ? (
        <div className="sound-empty">
          <b>No sounds yet</b>
          <p>
            Kraken's own set (about 500 sounds: weapons, spells, creatures, monsters, one-shots and ambience loops, in the folders the chat triggers use) is made with your ElevenLabs account: run <code>node scripts/generate-sounds.mjs</code> with your key set as <code>ELEVENLABS_API_KEY</code>. Or add your own sounds below; any folder works.
          </p>
        </div>
      ) : null}
      {tab === "volume" ? <VolumePanel /> : !library ? <p className="hint">Gathering sounds…</p> : tab === "triggers" ? <Triggers session={session} library={library} /> : <Browser session={session} kind={tab} library={library} reload={reload} />}
    </div>
  );
}
