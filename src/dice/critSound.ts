// A natural 20 and a natural 1, heard: made on the spot with Web Audio (no
// sound files). A 1 is the sad trombone, wah wah wah-waaah, four notes
// sliding down through a plunger mute, the last one wobbling as it droops. A
// 20 is a bugle's "Charge!" (the old cavalry call), brassy and a little too
// proud of itself, with a sparkle on top. They play where the die flares.

export type Note = { at: number; length: number; freq: number; slideTo?: number; wobble?: number; wah?: boolean; loud?: number };

// The tunes, as notes (seconds, hertz): what the sound plays, and what the checks read.
export function naturalTune(kind: "high" | "low"): Note[] {
  if (kind === "low") {
    // G3, F#3, F3, then E3 held, sagging a little, with a sorry vibrato.
    return [
      { at: 0, length: 0.38, freq: 196, slideTo: 192, wah: true },
      { at: 0.42, length: 0.38, freq: 185, slideTo: 181, wah: true },
      { at: 0.84, length: 0.38, freq: 174.6, slideTo: 171, wah: true },
      { at: 1.26, length: 1.5, freq: 164.8, slideTo: 150, wobble: 6, wah: true, loud: 1.1 },
    ];
  }
  // Charge! G4 C5 E5 G5, then E5 G5 held high.
  const g4 = 392;
  const c5 = 523.25;
  const e5 = 659.25;
  const g5 = 783.99;
  return [
    { at: 0, length: 0.13, freq: g4 },
    { at: 0.15, length: 0.13, freq: c5 },
    { at: 0.3, length: 0.13, freq: e5 },
    { at: 0.45, length: 0.32, freq: g5, loud: 1.05 },
    { at: 0.8, length: 0.13, freq: e5 },
    { at: 0.95, length: 0.9, freq: g5, wobble: 5, loud: 1.15 },
  ];
}

let context: AudioContext | null = null;
let lastAt = 0;
function audio() {
  if (!context) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    context = new Context();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

// One brass note: two detuned saws and a square, through a lowpass that opens
// with the note (the blare), or opens and closes (the plunger's wah).
function brass(ctx: AudioContext, out: AudioNode, start: number, note: Note, bright: number) {
  const end = start + note.length;
  const level = 0.18 * (note.loud ?? 1);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + 0.035);
  gain.gain.setValueAtTime(level * 0.85, Math.max(start + 0.05, end - 0.08));
  gain.gain.exponentialRampToValueAtTime(0.0008, end + 0.06);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = note.wah ? 7 : 2;
  if (note.wah) {
    filter.frequency.setValueAtTime(300, start);
    filter.frequency.linearRampToValueAtTime(1500, start + Math.min(0.14, note.length * 0.4));
    filter.frequency.linearRampToValueAtTime(520, end);
  } else {
    filter.frequency.setValueAtTime(bright * 0.5, start);
    filter.frequency.linearRampToValueAtTime(bright, start + 0.05);
  }
  filter.connect(gain).connect(out);
  const voices: [OscillatorType, number, number][] = [
    ["sawtooth", -6, 1],
    ["sawtooth", 6, 1],
    ["square", 0, 0.35],
  ];
  for (const [type, cents, mix] of voices) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = cents;
    osc.frequency.setValueAtTime(note.freq, start);
    if (note.slideTo) osc.frequency.linearRampToValueAtTime(note.slideTo, end);
    if (note.wobble) {
      // The wobble grows as the note goes on.
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = note.wobble;
      depth.gain.setValueAtTime(0, start);
      depth.gain.linearRampToValueAtTime(note.freq * 0.025, end);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(start);
      lfo.stop(end + 0.1);
    }
    const voice = ctx.createGain();
    voice.gain.value = mix;
    osc.connect(voice).connect(filter);
    osc.start(start);
    osc.stop(end + 0.1);
  }
}

// A little sparkle: quick high bell notes, up the chord.
function sparkle(ctx: AudioContext, out: AudioNode, start: number) {
  [1568, 2093, 2637, 3136, 4186].forEach((freq, index) => {
    const at = start + index * 0.06;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.07, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 0.4);
  });
}

// Play a natural 20 ("high") or 1 ("low") at this volume (0 to 1).
export function playNatural(kind: "high" | "low", volume: number) {
  if (volume <= 0) return;
  // Several d20s landing on the same face play it once.
  const now = performance.now();
  if (now - lastAt < 600) return;
  lastAt = now;
  const ctx = audio();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = Math.min(1, volume) * 0.9;
  // A touch of room: a short echo, quieter.
  const echo = ctx.createDelay(0.5);
  const echoGain = ctx.createGain();
  echo.delayTime.value = kind === "high" ? 0.11 : 0.16;
  echoGain.gain.value = 0.22;
  master.connect(ctx.destination);
  master.connect(echo).connect(echoGain).connect(ctx.destination);
  const start = ctx.currentTime + 0.05;
  for (const note of naturalTune(kind)) brass(ctx, master, start + note.at, note, kind === "high" ? 3200 : 1200);
  if (kind === "high") sparkle(ctx, master, start + 0.95);
  heard(ctx, master, kind);
}

// What this screen played, as it played: the loudest sample a meter on the
// sound read (0 when the browser kept audio shut), on the page for the checks
// (data-natural-sound = "high|low:running|suspended:peak:count").
let played = 0;
function heard(ctx: AudioContext, master: AudioNode, kind: "high" | "low") {
  played += 1;
  const count = played;
  const meter = ctx.createAnalyser();
  meter.fftSize = 2048;
  master.connect(meter);
  const samples = new Float32Array(meter.fftSize);
  let peak = 0;
  const started = performance.now();
  const read = () => {
    meter.getFloatTimeDomainData(samples);
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    if (performance.now() - started < 900) window.setTimeout(read, 60);
    else {
      document.documentElement.dataset.naturalSound = `${kind}:${ctx.state}:${peak.toFixed(3)}:${count}`;
      meter.disconnect();
    }
  };
  window.setTimeout(read, 60);
}
