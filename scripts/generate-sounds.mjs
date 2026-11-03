// Makes Kraken's sound set with your ElevenLabs account (sound effects,
// ambience loops, voices spoken by ElevenLabs voices that fit each character,
// and music if your plan has it), into the sounds
// folder Kraken plays from (and the chat's triggers point at):
//   %APPDATA%\kraken-vtt\assets\sounds\<oneshots|sfx|ambience|music>\<folder>\
//
//   set ELEVENLABS_API_KEY=your-key          (PowerShell: $env:ELEVENLABS_API_KEY="your-key")
//   node scripts/generate-sounds.mjs --dry   what it would make, and how many seconds
//   node scripts/generate-sounds.mjs         make everything not made yet
//   node scripts/generate-sounds.mjs --only sfx/Weapons --limit 20
//   node scripts/generate-sounds.mjs --only ambience/Forest --force   make these again
//   node scripts/generate-sounds.mjs --music  music too (ElevenLabs Music, if your plan has it)
//
// Sounds already there are kept, so it can be run again and again: delete the
// ones you do not like and run it once more to make them again. Your key stays
// on this computer; it is only sent to ElevenLabs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { catalog } = require("../electron/soundCatalog.cjs");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const appData = process.env.APPDATA ?? path.join(os.homedir(), ".config");
const out = value("out") ?? path.join(appData, "kraken-vtt", "assets", "sounds");
const only = value("only");
const limit = Number(value("limit") ?? Infinity);
const key = process.env.ELEVENLABS_API_KEY ?? "";

const jobs = [];
for (const item of catalog()) {
  if (item.music && !flag("music")) continue;
  if (only && !item.group.toLowerCase().startsWith(only.toLowerCase())) continue;
  for (let variant = 1; variant <= (Number(value("variants")) || item.variants); variant++) {
    const file = path.join(out, ...item.group.split("/"), `${item.file}-${variant}.mp3`);
    if (existsSync(file) && !flag("force")) continue;
    jobs.push({ ...item, variant, path: file });
  }
}
const todo = jobs.slice(0, limit);
const seconds = todo.reduce((sum, job) => sum + job.seconds, 0);
console.log(`${todo.length} sounds to make (${Math.round(seconds)} s of audio) into ${out}`);
if (flag("dry")) {
  for (const job of todo.slice(0, 40)) console.log(job.say ? `  ${job.group}  (voice: ${job.voice})  "${job.say}"` : `  ${job.group}  (${job.seconds}s${job.loop ? ", loop" : ""})  ${job.prompt}`);
  if (todo.length > 40) console.log(`  ... and ${todo.length - 40} more`);
  process.exit(0);
}
if (!key) {
  console.error("Set ELEVENLABS_API_KEY to your ElevenLabs API key first (elevenlabs.io > your profile > API keys).");
  process.exit(1);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let plain = false; // older accounts: no v2 model or loop option

async function effect(job) {
  const body = plain
    ? { text: job.prompt, duration_seconds: Math.min(22, job.seconds), prompt_influence: 0.45 }
    : { text: job.prompt, duration_seconds: Math.min(30, job.seconds), prompt_influence: 0.45, model_id: "eleven_text_to_sound_v2", ...(job.loop ? { loop: true } : {}) };
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (response.status === 422 && !plain) {
    plain = true;
    return effect(job);
  }
  return response;
}

// One ElevenLabs voice per character, chosen from your account's voices by
// how they are described (gender, age, accent, tone), the same for all its lines.
let voices = null;
const chosen = new Map();
async function voiceFor(job) {
  const who = job.group;
  if (chosen.has(who)) return chosen.get(who);
  if (!voices) {
    const response = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
    voices = response.ok ? ((await response.json()).voices ?? []) : [];
  }
  const wanted = job.voice.toLowerCase().split(/\s+/);
  const taken = new Set(chosen.values());
  const gender = wanted.includes("female") ? "female" : wanted.includes("male") ? "male" : "";
  const score = (voice) => {
    const words = new Set(`${Object.values(voice.labels ?? {}).join(" ")} ${voice.description ?? ""}`.toLowerCase().split(/[^a-z]+/));
    const theirs = String(voice.labels?.gender ?? "").toLowerCase();
    const fit = wanted.filter((word) => word !== gender && words.has(word)).length;
    return fit + (gender && theirs === gender ? 5 : gender && theirs ? -5 : 0) - (taken.has(voice.voice_id) ? 0.5 : 0);
  };
  const best = [...voices].sort((a, b) => score(b) - score(a))[0];
  const id = best?.voice_id ?? "21m00Tcm4TlvDq8ikWAM";
  chosen.set(who, id);
  console.log(`  ${who.split("/").pop()}: ${best?.name ?? "default voice"}`);
  return id;
}

async function speak(job) {
  const voice = await voiceFor(job);
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: job.say, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.4 } }),
  });
}

async function song(job) {
  return fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ prompt: job.prompt, music_length_ms: job.seconds * 1000 }),
  });
}

const made = [];
const failed = [];
let next = 0;
let stopMusic = false;
async function worker() {
  while (next < todo.length) {
    const job = todo[next++];
    if (job.music && stopMusic) continue;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const response = job.music ? await song(job) : job.say ? await speak(job) : await effect(job);
        if (response.status === 429 || response.status >= 500) {
          await pause(2000 * attempt);
          continue;
        }
        if (!response.ok) {
          const reason = (await response.text()).slice(0, 300);
          if (response.status === 401) {
            console.error(`ElevenLabs refused the key: ${reason}`);
            process.exit(1);
          }
          if (job.music && (response.status === 403 || response.status === 404)) {
            stopMusic = true;
            console.log(`  (music is not on this ElevenLabs plan: ${reason})`);
            break;
          }
          if (/quota|credits/i.test(reason)) {
            console.error(`Out of ElevenLabs credits: ${reason}`);
            process.exit(1);
          }
          failed.push({ group: job.group, reason });
          console.log(`  ✗ ${job.group}: ${reason}`);
          break;
        }
        mkdirSync(path.dirname(job.path), { recursive: true });
        writeFileSync(job.path, Buffer.from(await response.arrayBuffer()));
        made.push({ group: job.group, file: path.basename(job.path), prompt: job.prompt ?? job.say, at: new Date().toISOString() });
        console.log(`  ✓ ${made.length}/${todo.length}  ${job.group}/${path.basename(job.path)}`);
        break;
      } catch (error) {
        if (attempt === 4) {
          failed.push({ group: job.group, reason: String(error) });
          console.log(`  ✗ ${job.group}: ${error}`);
        } else await pause(1500 * attempt);
      }
    }
  }
}
await Promise.all([worker(), worker(), worker()]);

// What was made, and from what words, for remaking the ones that did not come out well.
const log = path.join(out, "generated.json");
let earlier = [];
try {
  earlier = JSON.parse(readFileSync(log, "utf8"));
} catch {
  /* first run */
}
mkdirSync(out, { recursive: true });
writeFileSync(log, JSON.stringify([...earlier, ...made], null, 1));
console.log(`\nMade ${made.length} sound${made.length === 1 ? "" : "s"}${failed.length ? `, ${failed.length} failed` : ""}. They are in ${out}`);
console.log("Listen in Kraken's Sound window; delete any you do not like and run this again to make them again.");
