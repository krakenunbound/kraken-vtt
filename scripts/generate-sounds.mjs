// Makes Kraken's sound effects, ambience loops and voices (spoken by
// ElevenLabs voices that fit each character) with your ElevenLabs account,
// into Kraken's own sounds folder, which ships with the app (ElevenLabs
// sounds may be handed out; Syrinscape's may not), and which the chat's
// triggers point at:
//   sounds\<oneshots|sfx|ambience>\<folder>// Music is not made here: it is made locally (YuE2 Studio).
//
// The key is in .env.local (made by `npx @elevenlabs/cli onboard init`):
//   npm run sounds -- --dry     what it would make, and how many seconds
//   npm run sounds              make everything not made yet
//   npm run sounds -- --only sfx/Weapons --limit 20
//   npm run sounds -- --only ambience/Forest --force   make these again
//
// Sounds already there are kept, so it can be run again and again: delete the
// ones you do not like and run it once more to make them again. Your key stays
// on this computer; it is only sent to ElevenLabs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { catalog } = require("../electron/soundCatalog.cjs");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const out = value("out") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sounds");
const only = value("only");
const limit = Number(value("limit") ?? Infinity);
const key = process.env.ELEVENLABS_API_KEY ?? "";

const jobs = [];
for (const item of catalog()) {
  if (item.music) continue; // music is made locally
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
  console.error("No ElevenLabs key: run `npx -y @elevenlabs/cli@latest onboard init` in this folder first (it puts the key in .env.local).");
  process.exit(1);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const client = new ElevenLabsClient({ apiKey: key });
const bytes = async (stream) => Buffer.from(await new Response(stream).arrayBuffer());

const effect = async (job) =>
  bytes(
    await client.textToSoundEffects.convert({
      text: job.prompt,
      modelId: "eleven_text_to_sound_v2",
      durationSeconds: Math.min(30, job.seconds),
      promptInfluence: 0.45,
      loop: Boolean(job.loop),
      outputFormat: "mp3_44100_128",
    }),
  );

// One ElevenLabs voice per character, chosen from your account's voices by
// how they are described (gender, age, accent, tone), the same for all its lines.
let voices = null;
const chosen = new Map();
let voiceList = null;
async function voiceFor(job) {
  const who = job.group;
  if (chosen.has(who)) return chosen.get(who);
  voiceList ??= client.voices.getAll();
  voices ??= (await voiceList).voices ?? [];
  if (chosen.has(who)) return chosen.get(who); // another worker chose while this one waited
  const wanted = job.voice.toLowerCase().split(/\s+/);
  const taken = new Set(chosen.values());
  const gender = wanted.includes("female") ? "female" : wanted.includes("male") ? "male" : "";
  const score = (voice) => {
    const words = new Set(`${Object.values(voice.labels ?? {}).join(" ")} ${voice.description ?? ""}`.toLowerCase().split(/[^a-z]+/));
    const theirs = String(voice.labels?.gender ?? "").toLowerCase();
    const fit = wanted.filter((word) => word !== gender && words.has(word)).length;
    return fit + (gender && theirs === gender ? 5 : gender && theirs ? -5 : 0) - (taken.has(voice.voiceId) ? 0.5 : 0);
  };
  const best = [...voices].sort((a, b) => score(b) - score(a))[0];
  const id = best?.voiceId ?? "JBFqnCBsd6RMkjVDRZzb";
  chosen.set(who, id);
  console.log(`  ${who.split("/").pop()}: ${best?.name ?? "default voice"}`);
  return id;
}

const speak = async (job) =>
  bytes(
    await client.textToSpeech.convert(await voiceFor(job), {
      text: job.say,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
      voiceSettings: { stability: 0.45, similarityBoost: 0.75, style: 0.4 },
    }),
  );

const made = [];
const failed = [];
let next = 0;
async function worker() {
  while (next < todo.length) {
    const job = todo[next++];
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const audio = job.say ? await speak(job) : await effect(job);
        mkdirSync(path.dirname(job.path), { recursive: true });
        writeFileSync(job.path, audio);
        made.push({ group: job.group, file: path.basename(job.path), prompt: job.prompt ?? job.say, at: new Date().toISOString() });
        console.log(`  ✓ ${made.length}/${todo.length}  ${job.group}/${path.basename(job.path)}`);
        break;
      } catch (error) {
        const status = error?.statusCode ?? 0;
        const reason = String(error?.body?.detail?.message ?? error?.body?.detail ?? error?.message ?? error).slice(0, 300);
        if (status === 401) {
          console.error(`ElevenLabs refused the key: ${reason}`);
          process.exit(1);
        }
        if (/quota|credits/i.test(reason)) {
          console.error(`Out of ElevenLabs credits: ${reason}`);
          process.exit(1);
        }
        if ((status === 429 || status >= 500 || !status) && attempt < 4) {
          await pause(2000 * attempt);
          continue;
        }
        failed.push({ group: job.group, reason });
        console.log(`  ✗ ${job.group}: ${reason}`);
        break;
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
