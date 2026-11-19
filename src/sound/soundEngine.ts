import type { ChatLine } from "../session/useSession";
import { rolling } from "../dice/diceStore";

// This seat's sound: what the GM plays for the table (one-shots and
// effects), what the chat's triggers set off (played as the line's result
// shows, after its dice land), the ambience loops (seamless, from Web Audio)
// and the music. Each kind has its own volume, under a master, set by each
// player for themselves and kept in this browser.

export type SoundKind = "oneshots" | "sfx" | "ambience" | "music";
export type Volumes = { master: number; oneshots: number; sfx: number; ambience: number; music: number; muted: boolean };
// music: startedAt on the host's clock; elapsed, how far into the track it was when the host sent it (a seat joins in time).
export type Soundscape = { ambience: { id: string; volume: number }[]; music: { id: string; volume: number; loop: boolean; group: string | null; startedAt?: number; elapsed?: number; order?: "order" | "shuffle"; repeat?: boolean } | null };

const DEFAULTS: Volumes = { master: 0.8, oneshots: 0.9, sfx: 0.8, ambience: 0.5, music: 0.45, muted: false };
export const KINDS: { id: SoundKind; name: string }[] = [
  { id: "oneshots", name: "Voices" },
  { id: "sfx", name: "Sound effects" },
  { id: "ambience", name: "Ambience" },
  { id: "music", name: "Music" },
];

function load(): Volumes {
  try {
    const saved = JSON.parse(window.localStorage.getItem("kraken-sound") ?? "null");
    if (saved && typeof saved === "object") return { ...DEFAULTS, ...saved };
  } catch {
    /* defaults */
  }
  return DEFAULTS;
}

let volumes: Volumes = typeof window === "undefined" ? DEFAULTS : load();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buses = new Map<SoundKind, GainNode>();
let urlOf: (id: string) => string = () => "";
const buffers = new Map<string, Promise<AudioBuffer>>();
const ambience = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
let music: { id: string; startedAt: number; element: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode } | null = null;
// Where the track is meant to be now (seconds), from how far in the host said it was and when that arrived.
function seekTo(element: HTMLAudioElement, elapsedMs: number, received: number) {
  const go = () => {
    const seconds = (elapsedMs + (performance.now() - received)) / 1000;
    const length = element.duration;
    if (!Number.isFinite(length) || length <= 0) return;
    // A second or two late is in time enough; a loop (or a host that restarted) goes round.
    if (seconds > 1.5) element.currentTime = seconds % length;
  };
  if (element.readyState >= 1) go();
  else element.addEventListener("loadedmetadata", go, { once: true });
}
let musicDone: (() => void) | null = null;
// How long a playlist's tracks overlap as one gives way to the next.
const CROSSFADE_SECONDS = 4;
// The one-shots and effects playing here, by the sound's id (so a play
// button can show it is playing, and stop just that one).
const playing = new Map<AudioBufferSourceNode, string>();
let nowPlaying: ReadonlySet<string> = new Set();
const playingChanged = () => {
  nowPlaying = new Set([...playing.values(), ...ambience.keys(), ...(music ? [music.id] : [])]);
  changed();
};

function graph() {
  if (context) return context;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  context = new Context();
  master = context.createGain();
  // A meter on what leaves this screen, for checks (window.maelstromSoundPeak: the loudest sample just now).
  const meter = context.createAnalyser();
  meter.fftSize = 2048;
  master.connect(meter);
  meter.connect(context.destination);
  const samples = new Float32Array(meter.fftSize);
  (window as unknown as { maelstromSoundPeak?: () => number }).maelstromSoundPeak = () => {
    meter.getFloatTimeDomainData(samples);
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    return peak;
  };
  for (const { id } of KINDS) {
    const bus = context.createGain();
    bus.connect(master);
    buses.set(id, bus);
  }
  applyVolumes();
  return context;
}

// A slider's place as loudness, as the ear hears it: the level squared, so halfway sounds about
// half as loud and "way down" is quiet (a straight line left a loud set loud until nearly 0).
const heard = (slider: number) => Math.max(0, Math.min(1, slider)) ** 2;
function applyVolumes() {
  if (!context || !master) return;
  master.gain.setTargetAtTime(volumes.muted ? 0 : heard(volumes.master), context.currentTime, 0.05);
  for (const { id } of KINDS) buses.get(id)?.gain.setTargetAtTime(heard(volumes[id]), context.currentTime, 0.05);
}

// Browsers let a page play sound only after a click or key: the first one
// anywhere wakes the sound up.
if (typeof window !== "undefined") {
  const wake = () => void graph()?.resume().catch(() => undefined);
  window.addEventListener("pointerdown", wake, true);
  window.addEventListener("keydown", wake, true);
}

function buffer(id: string) {
  let pending = buffers.get(id);
  if (!pending) {
    const ctx = graph();
    if (!ctx) return Promise.reject(new Error("No sound here."));
    pending = fetch(urlOf(id))
      .then((response) => {
        if (!response.ok) throw new Error("Sound not found.");
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes));
    buffers.set(id, pending);
    pending.catch(() => buffers.delete(id));
  }
  return pending;
}

// Sounds placed on the map (the host says which this seat hears and how loud):
// each loops on the ambience bus, its gain eased as tokens move, a low-pass
// filter closing when walls stand between (muffled).
const placed = new Map<string, { sound: string; source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }>();
let placedWanted = new Map<string, { sound: string; gain: number; muffled: boolean }>();
async function startPlaced(id: string) {
  const ctx = graph();
  const want = placedWanted.get(id);
  if (!ctx || !want || placed.has(id)) return;
  try {
    const data = await buffer(want.sound);
    const now = placedWanted.get(id);
    if (!now || placed.has(id)) return;
    const source = ctx.createBufferSource();
    source.buffer = data;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = now.muffled ? 700 : 20000;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(buses.get("ambience")!);
    source.start();
    gain.gain.setTargetAtTime(now.gain, ctx.currentTime, 0.5);
    placed.set(id, { sound: now.sound, source, gain, filter });
  } catch {
    /* a missing sound is quiet */
  }
}

// When each triggered sound's folder last played (a burst plays once).
const recentlyPlayed = new Map<string, number>();

export const sound = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  volumes: () => volumes,
  setVolumes(patch: Partial<Volumes>) {
    volumes = { ...volumes, ...patch };
    try {
      window.localStorage.setItem("kraken-sound", JSON.stringify(volumes));
    } catch {
      /* this screen only */
    }
    applyVolumes();
    changed();
  },
  // Where this seat fetches a sound (the host serves them).
  setSource(fn: (id: string) => string) {
    urlOf = fn;
  },
  // A one-shot or effect, once.
  async play(id: string, kind: SoundKind = "sfx", level = 1) {
    const ctx = graph();
    if (!ctx || !id) return;
    try {
      const data = await buffer(id);
      const source = ctx.createBufferSource();
      source.buffer = data;
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(buses.get(kind) ?? master!);
      playing.set(source, id);
      source.onended = () => {
        playing.delete(source);
        playingChanged();
      };
      source.start();
      playingChanged();
    } catch {
      /* a missing sound is quiet */
    }
  },
  // What is playing on this screen now: effects, loops and the music, by id.
  playingNow: () => nowPlaying,
  // Is this sound, or any sound in this folder, playing here?
  isPlaying(idOrFolder: string) {
    for (const id of nowPlaying) if (id === idOrFolder || id.startsWith(`${idOrFolder}/`)) return true;
    return false;
  },
  // Stop one sound, or every sound in a folder, playing here.
  stop(idOrFolder: string) {
    for (const [source, id] of playing) {
      if (id !== idOrFolder && !id.startsWith(`${idOrFolder}/`)) continue;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      playing.delete(source);
    }
    playingChanged();
  },
  stopAll() {
    for (const source of playing.keys()) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    playing.clear();
    playingChanged();
  },
  // What the GM has playing under the game: loops fade in and out, music changes track.
  async setScape(scape: Soundscape) {
    const ctx = graph();
    if (!ctx) return;
    const wanted = new Map(scape.ambience.map((item) => [item.id, item.volume]));
    for (const [id, loop] of ambience) {
      if (wanted.has(id)) {
        loop.gain.gain.setTargetAtTime(wanted.get(id)!, ctx.currentTime, 0.3);
        continue;
      }
      loop.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => {
        try {
          loop.source.stop();
        } catch {
          /* gone */
        }
      }, 2000);
      ambience.delete(id);
      playingChanged();
    }
    for (const [id, level] of wanted) {
      if (ambience.has(id)) continue;
      try {
        const data = await buffer(id);
        if (ambience.has(id)) continue;
        const source = ctx.createBufferSource();
        source.buffer = data;
        source.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(buses.get("ambience")!);
        source.start();
        gain.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
        ambience.set(id, { source, gain });
        playingChanged();
      } catch {
        /* a missing loop is quiet */
      }
    }
    const track = scape.music;
    if (!track) {
      if (music) {
        const old = music;
        old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(() => old.element.pause(), 2500);
        music = null;
        playingChanged();
      }
      return;
    }
    const received = performance.now();
    if (music?.id === track.id && music.startedAt !== (track.startedAt ?? music.startedAt)) {
      // The same track started again (a folder of one, or played again): from where the host says it is now.
      music.startedAt = track.startedAt ?? music.startedAt;
      music.element.currentTime = 0;
      seekTo(music.element, track.elapsed ?? 0, received);
      void music.element.play().catch(() => undefined);
    }
    if (music?.id === track.id) {
      music.gain.gain.setTargetAtTime(track.volume, ctx.currentTime, 0.3);
      music.element.loop = track.loop;
      // The same track again after it ended (a folder of one): from the top.
      if (music.element.ended) {
        music.element.currentTime = 0;
        void music.element.play().catch(() => undefined);
      }
      return;
    }
    if (music) {
      const old = music;
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      setTimeout(() => old.element.pause(), 3000);
    }
    const element = new Audio(urlOf(track.id));
    element.crossOrigin = "anonymous";
    element.loop = track.loop;
    const source = ctx.createMediaElementSource(element);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(buses.get("music")!);
    // A playlist's next track is asked for a few seconds before this one ends, so the two cross-fade (the old fades
    // out as the new fades in, below); "ended" stays for a track too short to have been caught.
    let asked = false;
    const next = () => {
      if (asked) return;
      asked = true;
      musicDone?.();
    };
    element.addEventListener("timeupdate", () => {
      if (!element.loop && Number.isFinite(element.duration) && element.duration > CROSSFADE_SECONDS * 2 && element.duration - element.currentTime <= CROSSFADE_SECONDS) next();
    });
    element.addEventListener("ended", next);
    music = { id: track.id, startedAt: track.startedAt ?? 0, element, source, gain };
    playingChanged();
    // Joined after the track began (a late seat, a reload): in at the same bar as everyone else.
    seekTo(element, track.elapsed ?? 0, received);
    void element.play().catch(() => undefined);
    gain.gain.setTargetAtTime(track.volume, ctx.currentTime, 0.8);
  },
  // The map's placed sounds this seat hears now ({id, sound, gain, muffled}); the rest fade out.
  setPlaced(list: { id: string; sound: string; gain: number; muffled?: boolean }[]) {
    placedWanted = new Map(list.filter((item) => item && typeof item.id === "string" && typeof item.sound === "string").map((item) => [item.id, { sound: item.sound, gain: Math.min(1, Math.max(0, Number(item.gain) || 0)), muffled: Boolean(item.muffled) }]));
    const ctx = context;
    for (const [id, loop] of placed) {
      const want = placedWanted.get(id);
      if (want && want.sound === loop.sound) {
        if (ctx) {
          loop.gain.gain.setTargetAtTime(want.gain, ctx.currentTime, 0.4);
          loop.filter.frequency.setTargetAtTime(want.muffled ? 700 : 20000, ctx.currentTime, 0.3);
        }
        continue;
      }
      if (ctx) loop.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      placed.delete(id);
      setTimeout(() => {
        try {
          loop.source.stop();
        } catch {
          /* gone */
        }
      }, 2500);
    }
    for (const id of placedWanted.keys()) if (!placed.has(id)) void startPlaced(id);
  },
  placedNow: () => [...placed.keys()],
  // When a folder's track ends (the GM's screen asks the host for the next).
  onMusicEnded(fn: (() => void) | null) {
    musicDone = fn;
  },
  // A chat line's triggered sound: as soon as its result shows.
  lineArrived(line: ChatLine) {
    const id = (line as { sound?: string }).sound;
    if (!id) return;
    const kind: SoundKind = id.startsWith("oneshots/") ? "oneshots" : "sfx";
    // A burst of lines with the same sound (Roll all: a line of initiative for
    // each creature) is heard once, not once a line.
    const once = () => {
      const folder = id.slice(0, id.lastIndexOf("/"));
      const now = Date.now();
      if (now - (recentlyPlayed.get(folder) ?? 0) < 1500) return;
      recentlyPlayed.set(folder, now);
      void sound.play(id, kind);
    };
    if (!rolling.has(line)) {
      once();
      return;
    }
    const stop = rolling.subscribe(() => {
      if (rolling.has(line)) return;
      stop();
      once();
    });
  },
  // Your turn has come (the combat tracker), on this screen only: a soft
  // two-note chime, or a starship console's tone in the science-fiction games.
  yourTurn(ruleset = "") {
    const scifi = ["Apeira Astra", "Traveller", "Starforged"].includes(ruleset);
    void sound.play(`sfx/Effects/Turn/${scifi ? "turn-console" : "turn-chime"}.mp3`, "sfx");
  },
  // For tests and the Sound window: what is playing here.
  // musicAt: where the music is in its track (seconds), to see a seat joined in time.
  playingHere: () => ({ ambience: [...ambience.keys()], music: music?.id ?? null, musicAt: music ? music.element.currentTime : null, effects: playing.size, running: context?.state === "running" }),
};

// Tests and the agent's eyes (kraken_ui_eval) can see what plays on this screen.
if (typeof window !== "undefined") (window as unknown as { __krakenSound?: typeof sound }).__krakenSound = sound;
