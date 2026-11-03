import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Session, SoundItem, SoundLibrary, SoundTrigger } from "../session/useSession";
import { Icon } from "../ui/icons";
import { KINDS, sound, type SoundKind } from "./soundEngine";

// The Sound window (Syrinscape's, inside Kraken): the GM's one-shots, sound
// effects, ambience loops and music, all from the GM's own sounds and played
// to every seat; the chat's sound triggers; and each seat's own volumes.

type Tab = SoundKind | "triggers" | "volume";
const TABS: { id: Tab; name: string; gm: boolean }[] = [
  { id: "oneshots", name: "Voices", gm: true },
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

// The folders of a kind as a tree: Weapons > Sword > Hit. A folder with
// sounds of its own (a group) plays one of them at random; opened, it lists
// each sound, to hear (on this screen only) or play for the table.
type FolderNode = { name: string; path: string; count: number; group: boolean; children: FolderNode[] };
function folderTree(groups: { id: string; count: number }[]): FolderNode[] {
  const root: FolderNode = { name: "", path: "", count: 0, group: false, children: [] };
  for (const group of groups) {
    const [kind, ...parts] = group.id.split("/");
    let at = root;
    parts.forEach((part, index) => {
      const path = [kind, ...parts.slice(0, index + 1)].join("/");
      let next = at.children.find((child) => child.path === path);
      if (!next) {
        next = { name: part, path, count: 0, group: false, children: [] };
        at.children.push(next);
      }
      next.count += group.count;
      if (index === parts.length - 1) next.group = true;
      at = next;
    });
  }
  return root.children;
}
// A play button that is a stop button while its sound (or any sound in its
// folder) plays on this screen.
function PlayToggle({
  id,
  className,
  label,
  title,
  onPlay,
  onStop,
  data,
  children,
}: {
  id: string;
  className: string;
  label: string;
  title: string;
  onPlay: () => void;
  onStop: () => void;
  data: Record<string, string>;
  children: React.ReactNode;
}) {
  useSyncExternalStore(sound.subscribe, sound.playingNow);
  const on = sound.isPlaying(id);
  return (
    <button type="button" className={on ? `${className} playing` : className} title={on ? "Stop it" : title} aria-label={on ? `Stop ${label}` : label} aria-pressed={on} onClick={on ? onStop : onPlay} {...data}>
      {on ? "\u25a0" : children}
    </button>
  );
}

// "weapons sword hit 2" is the folder's #2.
const variant = (name: string) => /(\d+)$/.exec(name)?.[1];

function Folder({
  node,
  kind,
  depth,
  isOpen,
  toggle,
  inGroup,
  loop,
  play,
  stop,
}: {
  node: FolderNode;
  kind: SoundKind;
  depth: number;
  isOpen: (path: string) => boolean;
  toggle: (path: string) => void;
  inGroup: (group: string) => SoundItem[];
  loop: (id: string) => boolean;
  play: (id: string) => void;
  stop: (id: string) => void;
}) {
  const open = isOpen(node.path);
  const files = node.group && open ? inGroup(node.path) : [];
  return (
    <div className={open ? "sound-group open" : "sound-group"} role="treeitem" aria-expanded={open} style={{ marginLeft: depth ? 14 : 0 }}>
      <div className="sound-group-row">
        <button type="button" className="sound-twisty" aria-label={`${open ? "Close" : "Open"} ${node.name}`} data-folder={node.path} onClick={() => toggle(node.path)}>
          {open ? "▾" : "▸"}
        </button>
        {node.group ? (
          <PlayToggle
            id={node.path}
            className="sound-play"
            title={kind === "ambience" ? "Play this loop for the table" : kind === "music" ? "Play this folder for the table, track after track" : "Play one of these, at random, for the table"}
            label={`Play ${node.path}`}
            data={{ "data-sound-group": node.path }}
            onPlay={() => play(node.path)}
            onStop={() => stop(node.path)}
          >
            <Icon name="sound" size={14} />
          </PlayToggle>
        ) : null}
        <button type="button" className="sound-group-name" onClick={() => toggle(node.path)}>
          {node.name}
          <small>
            {node.count} sound{node.count === 1 ? "" : "s"}
          </small>
        </button>
      </div>
      {files.length > 0 ? (
        <div className="sound-files">
          {files.map((item) => (
            <div key={item.id} className={loop(item.id) ? "sound-file on" : "sound-file"}>
              <PlayToggle id={item.id} className="sound-hear" title="Hear it (on your screen only)" label={`Hear ${item.name}`} data={{ "data-hear": item.id }} onPlay={() => void sound.play(item.id, kind)} onStop={() => sound.stop(item.id)}>
                {"\u25b6"}
              </PlayToggle>
              <span className="sound-file-name">
                {variant(item.name) ? <b>#{variant(item.name)}</b> : null} {item.name}
              </span>
              <PlayToggle id={item.id} className="ghost" title="Play it for the table" label={`Play ${item.name} for the table`} data={{ "data-sound": item.id }} onPlay={() => play(item.id)} onStop={() => stop(item.id)}>
                <Icon name="sound" size={12} /> Table
              </PlayToggle>
            </div>
          ))}
        </div>
      ) : null}
      {open ? node.children.map((child) => <Folder key={child.path} node={child} kind={kind} depth={depth + 1} isOpen={isOpen} toggle={toggle} inGroup={inGroup} loop={loop} play={play} stop={stop} />) : null}
    </div>
  );
}

function Browser({ session, kind, library, reload }: { session: Session; kind: SoundKind; library: SoundLibrary; reload: () => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [folder, setFolder] = useState("");
  const scape = session.soundscape;
  const groups = useMemo(
    () => library.groups.filter((group) => group.id.startsWith(`${kind}/`) && (!search || group.id.toLowerCase().includes(search.toLowerCase()))),
    [library, kind, search],
  );
  const inGroup = (group: string): SoundItem[] => library.sounds.filter((item) => `${item.kind}/${item.group}` === group);
  const nodes = useMemo(() => folderTree(groups), [groups]);
  // While searching, every folder that matches is open.
  const isOpen = (path: string) => Boolean(search) || open.has(path);
  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const loop = (id: string) => scape.ambience.some((item) => item.id === id);
  const play = (id: string) => {
    if (kind === "ambience") session.soundCommand({ type: "ambience", action: "add", id });
    else if (kind === "music") session.soundCommand({ type: "music", action: "play", id });
    else session.soundCommand({ type: "sound-play", id });
  };
  // Stop it for the table: a loop (or a folder's loops), the music, or an effect.
  const stop = (id: string) => {
    const under = (other: string) => other === id || other.startsWith(`${id}/`);
    if (kind === "ambience") for (const item of scape.ambience.filter((loop) => under(loop.id))) session.soundCommand({ type: "ambience", action: "remove", id: item.id });
    else if (kind === "music") session.soundCommand({ type: "music", action: "stop" });
    else session.soundCommand({ type: "sound-stop", id });
    sound.stop(id);
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
      <div className="sound-stops">
        {kind === "oneshots" || kind === "sfx" ? (
          <button type="button" className="sound-stop" onClick={() => session.soundCommand({ type: "sound-stop" })}>
            Stop all sounds
          </button>
        ) : null}
        <button type="button" className="sound-stop ghost" data-hear-stop onClick={() => sound.stopAll()}>
          Stop what I hear
        </button>
      </div>
      <input type="search" placeholder="Search" aria-label="Search sounds" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="sound-groups" role="tree">
        {groups.length === 0 ? <p className="hint">No {KINDS.find((item) => item.id === kind)?.name.toLowerCase()} yet.{kind === "oneshots" ? " Voices are spoken lines (Syrinscape's one-shots): a guard's \"Halt!\", an innkeeper's welcome." : ""}</p> : null}
        {nodes.map((node) => (
          <Folder key={node.path} node={node} kind={kind} depth={0} isOpen={isOpen} toggle={toggle} inGroup={inGroup} loop={loop} play={play} stop={stop} />
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
  const [note, setNote] = useState("");
  const [shownSounds, setShownSounds] = useState<string | null>(null);
  useEffect(() => setList(session.soundTriggers), [session.soundTriggers]);
  const soundsOf = (folder: string) => library.sounds.filter((one) => `${one.kind}/${one.group}` === folder || `${one.kind}/${one.group}`.startsWith(`${folder}/`));
  const count = (folder: string) => library.groups.filter((group) => group.id === folder || group.id.startsWith(`${folder}/`)).reduce((sum, group) => sum + group.count, 0);
  const save = (next: SoundTrigger[]) => {
    setList(next);
    session.soundCommand({ type: "sound-triggers", triggers: next });
  };
  const shown = list.filter((item) => !search || `${item.name} ${item.on} ${item.result} ${item.sound}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="sound-triggers">
      <p className="hint">As Syrinscape in FG: an attack plays its weapon's swing, the damage roll its hit, a natural 20 its crit and a natural 1 its fumble. The first trigger that fits, and has sounds, plays for everyone who sees the line, as its result shows. ▶ plays a trigger's sound on your screen only.</p>
      <div className="sound-trigger-options">
        <label>
          The GM's hidden rolls
          <select value={session.options.soundHidden} onChange={(event) => session.setTableOptions({ soundHidden: event.target.value as "off" | "combat" | "all" })}>
            <option value="off">Silent</option>
            <option value="combat">Combat only</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Same sound again after
          <select value={session.options.soundRepeat} onChange={(event) => session.setTableOptions({ soundRepeat: Number(event.target.value) })}>
            {[0, 1, 3, 5, 10].map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds} s
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sound-add">
        <input type="search" placeholder="Search triggers" aria-label="Search triggers" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" onClick={() => session.soundCommand({ type: "sound-triggers", triggers: "default" })}>
          Kraken's triggers
        </button>
      </div>
      {note ? <p className="hint sound-note">{note}</p> : null}
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
              {sounds ? (
                <button type="button" className="sound-count has" title="Show each sound, to hear them one by one" aria-expanded={shownSounds === item.id} data-trigger-sounds={item.id} onClick={() => setShownSounds(shownSounds === item.id ? null : item.id)}>
                  {shownSounds === item.id ? "▾" : "▸"} {sounds} sound{sounds === 1 ? "" : "s"}
                </button>
              ) : (
                <small className="none">no sounds yet</small>
              )}
              <PlayToggle
                id={item.sound}
                className="sound-play"
                title={sounds ? "Hear it (on your screen only)" : "No sounds in this folder yet"}
                label={`Hear ${item.name}`}
                data={{ "data-try": item.id }}
                onPlay={() => {
                  const found = soundsOf(item.sound);
                  if (found.length === 0) setNote(`${item.name}: no sounds in ${item.sound} yet.`);
                  else {
                    setNote("");
                    void sound.play(found[Math.floor(Math.random() * found.length)].id, item.sound.startsWith("oneshots/") ? "oneshots" : "sfx");
                  }
                }}
                onStop={() => sound.stop(item.sound)}
              >
                ▶
              </PlayToggle>
              {shownSounds === item.id ? (
                <div className="sound-files sound-trigger-files">
                  {soundsOf(item.sound).map((one) => (
                    <div key={one.id} className="sound-file">
                      <PlayToggle id={one.id} className="sound-hear" title="Hear it (on your screen only)" label={`Hear ${one.name}`} data={{ "data-hear": one.id }} onPlay={() => void sound.play(one.id, item.sound.startsWith("oneshots/") ? "oneshots" : "sfx")} onStop={() => sound.stop(one.id)}>
                        {"\u25b6"}
                      </PlayToggle>
                      <span className="sound-file-name">
                        {variant(one.name) ? <b>#{variant(one.name)}</b> : null} {one.group.split("/").slice(-1)[0]} <small>{one.id.split("/").pop()}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
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
