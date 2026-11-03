// Dice sounds, made on the spot: a bright resin clack when dice strike each
// other, a duller knock with a click on top when they hit the table, louder
// the harder they hit.

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let last = 0;

function audio() {
  if (!context) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    context = new Context();
    noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.25), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

function burst(ctx: AudioContext, at: number, filter: BiquadFilterType, frequency: number, q: number, gain: number, decay: number) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.playbackRate.value = 0.9 + Math.random() * 0.25;
  const shape = ctx.createBiquadFilter();
  shape.type = filter;
  shape.frequency.value = frequency * (0.9 + Math.random() * 0.2);
  shape.Q.value = q;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.002);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  source.connect(shape).connect(envelope).connect(ctx.destination);
  source.start(at, Math.random() * 0.1, decay + 0.02);
}

// strength: the speed of the hit along its normal (world units a second).
export function playHit(strength: number, onDie: boolean, volume: number) {
  if (strength < 1 || volume <= 0) return;
  const now = performance.now();
  if (now - last < 28) return;
  last = now;
  const ctx = audio();
  if (!ctx || !noise) return;
  const at = ctx.currentTime;
  const loud = Math.min(1, strength / 9) * volume;
  if (onDie) {
    burst(ctx, at, "bandpass", 3400, 6, 0.5 * loud, 0.045);
    burst(ctx, at, "highpass", 6000, 0.7, 0.12 * loud, 0.02);
  } else {
    burst(ctx, at, "lowpass", 700, 1.2, 0.7 * loud, 0.08);
    burst(ctx, at, "bandpass", 1900, 3, 0.32 * loud, 0.035);
  }
}
