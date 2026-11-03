// Sound on the host, as Syrinscape's in FG: the chat's triggers pick a sound
// for a line by what it is and how it went (a Longsword hit is a sword hit, a
// natural 20 a crit, a fumble falls back to a miss when there is no fumble
// sound), and the line carries it to every seat that sees it, and no other;
// the GM plays one-shots for the table, ambience loops and music, which a seat
// that joins later picks up; music can seek; players cannot play sounds.
import "./loopback.mjs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { createSoundLibrary } = require("../electron/sounds.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { defaultTriggers, catalog } = require("../electron/soundCatalog.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
// A tiny WAV: a short beep.
function wav() {
  const samples = 800;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(Math.sin(i / 4) * 8000), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(16000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const lines = [];
    const events = [];
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") lines.push(msg);
      events.push(msg);
      if (msg.type === "ok") resolve({ ws, you: msg.you, ok: msg, lines, events, send: (body) => ws.send(JSON.stringify(body)) });
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

// The catalogue: every trigger's folder is one the generator makes.
const made = new Set(catalog().map((item) => item.group));
for (const trigger of defaultTriggers()) assert(made.has(trigger.sound) || made.has(`${trigger.sound}`), `trigger ${trigger.id} points at a folder the generator makes: ${trigger.sound}`);

const work = mkdtempSync(path.join(tmpdir(), "kraken-sound-"));
const put = (group, name) => {
  mkdirSync(path.join(work, ...group.split("/")), { recursive: true });
  writeFileSync(path.join(work, ...group.split("/"), name), wav());
};
put("sfx/Weapons/Sword/Hit", "sword-hit-1.wav");
put("sfx/Weapons/Sword/Hit", "sword-hit-2.wav");
put("sfx/Weapons/Sword/Miss", "sword-miss-1.wav");
put("sfx/Weapons/Axe/Hit", "axe-hit-1.wav");
put("sfx/Body/Heal", "heal-1.wav");
put("sfx/Body/Death", "death-1.wav");
put("oneshots/Doors/Wooden Door", "door-1.wav");
put("ambience/Forest at Night", "forest-night-1.wav");
put("ambience/Rain", "rain-1.wav");
put("music/Battle", "battle-1.wav");
put("music/Battle", "battle-2.wav");
const sounds = createSoundLibrary({ folder: work });
const server = createTableServer({ sounds });
const tool = async (args) => JSON.parse((await callTool("kraken_sound", args, { table: () => server })).content[0].text);
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const gm = await connect(port, { name: "GM", hostToken });
  const ann = await connect(port, { name: "Ann" });
  const bob = await connect(port, { name: "Bob" });
  const agent = server.agent;

  // The library, by kind and folder.
  assert(sounds.groups("sfx").length === 5 && sounds.list("music").length === 2, "the library reads folders by kind");
  assert(sounds.pick("sfx/Weapons/Sword/Hit")?.group === "Weapons/Sword/Hit" && sounds.pick("sfx/Weapons")?.kind === "sfx", "a folder plays one of its sounds, or of the folders under it");

  // An attack by name and result.
  const attack = (formula, face, label, result) => {
    agent.dice.force([face]);
    const roll = agent.dice.roll(formula);
    agent.postRoll(roll, label, "Ann", false, { result });
  };
  attack("1d20+3", 14, "[ATTACK] (M) Longsword [AC 13] [HIT 17 vs 13] -> [at Orc]", "HIT");
  await settle();
  assert(/^sfx\/Weapons\/Sword\/Hit\//.test(bob.lines.at(-1).sound ?? ""), `a Longsword hit plays a sword hit: ${bob.lines.at(-1).sound}`);
  attack("1d20+3", 4, "[ATTACK] (M) Longsword [AC 13] [MISS 7 vs 13] -> [at Orc]", "MISS");
  await settle();
  assert(bob.lines.at(-1).sound === "sfx/Weapons/Sword/Miss/sword-miss-1.wav", "a miss, a sword miss");
  attack("1d20+3", 20, "[ATTACK] (M) Longsword [AC 13] [HIT 23 vs 13] -> [at Orc]", "HIT");
  await settle();
  assert(/Sword\/Hit/.test(bob.lines.at(-1).sound ?? ""), "a natural 20 with no crit sound falls back to a hit");
  attack("1d20+3", 1, "[ATTACK] (M) Longsword [AC 13] [MISS 4 vs 13] -> [at Orc]", "MISS");
  await settle();
  assert(/Sword\/Miss/.test(bob.lines.at(-1).sound ?? ""), "a natural 1 with no fumble sound falls back to a miss");
  attack("1d20+2", 12, "[ATTACK] (M) Battleaxe [AC 13] [HIT 14 vs 13] -> [at Orc]", "HIT");
  await settle();
  assert(/Axe\/Hit/.test(bob.lines.at(-1).sound ?? ""), "a battleaxe is an axe");
  ann.send({ type: "roll", formula: "1d20+5", label: "[ATTACK] Scimitar" });
  await settle();
  assert(/Sword\//.test(bob.lines.at(-1).sound ?? ""), "a hand-rolled attack plays by its name");
  agent.say("The orc falls dead.", "Combat");
  await settle();
  assert(bob.lines.at(-1).sound === "sfx/Body/Death/death-1.wav", "words in the chat: a death");
  ann.send({ type: "chat", text: "Hello" });
  await settle();
  assert(!bob.lines.at(-1).sound, "plain talk plays nothing");

  // Only the seats that see a line hear its sound.
  const before = bob.lines.length;
  gm.send({ type: "roll", formula: "1d20", label: "[ATTACK] Longsword", mode: "gm" });
  await settle();
  assert(bob.lines.length === before && gm.lines.at(-1).sound, "a GM-only attack sounds for the GM, not Bob");

  // The GM plays for the table; players cannot.
  ann.send({ type: "sound-play", id: "oneshots/Doors/Wooden Door" });
  await settle();
  assert(!bob.events.some((event) => event.type === "sound"), "a player cannot play sounds for the table");
  gm.send({ type: "sound-play", id: "oneshots/Doors/Wooden Door" });
  await settle();
  const played = bob.events.filter((event) => event.type === "sound").at(-1);
  assert(played?.id === "oneshots/Doors/Wooden Door/door-1.wav" && played.kind === "oneshots", "a one-shot for everyone");

  // Ambience and music, kept and given to a seat that joins later.
  gm.send({ type: "ambience", action: "add", id: "ambience/Forest at Night" });
  gm.send({ type: "ambience", action: "add", id: "ambience/Rain", volume: 0.4 });
  gm.send({ type: "music", action: "play", id: "music/Battle" });
  await settle();
  const scape = bob.events.filter((event) => event.type === "soundscape").at(-1).soundscape;
  assert(scape.ambience.length === 2 && scape.ambience[1].volume === 0.4 && scape.music.group === "music/Battle" && !scape.music.loop, `loops and a music folder: ${JSON.stringify(scape)}`);
  const late = await connect(port, { name: "Cal" });
  assert(late.ok.soundscape.ambience.length === 2 && late.ok.soundscape.music, "a seat that joins later hears what is playing");
  gm.send({ type: "ambience", action: "remove", id: scape.ambience[0].id });
  gm.send({ type: "music", action: "stop" });
  await settle();
  const quiet = late.events.filter((event) => event.type === "soundscape").at(-1).soundscape;
  assert(quiet.ambience.length === 1 && quiet.music === null, "loops and music stop");
  assert(server.persisted().sound.ambience.length === 1, "what plays is saved with the campaign");

  // The files: for every seat; the list for the GM; ranges for seeking.
  const base = `http://127.0.0.1:${port}`;
  const file = await fetch(`${base}/sound/file?token=${ann.you.assetToken}&id=${encodeURIComponent("music/Battle/battle-1.wav")}`, { headers: { Range: "bytes=10-49" } });
  assert(file.status === 206 && (await file.arrayBuffer()).byteLength === 40 && file.headers.get("content-type") === "audio/wav", "a player gets a sound, a range of it");
  assert((await fetch(`${base}/sound/list?token=${ann.you.assetToken}`)).status === 404, "a player does not get the list");
  const list = await (await fetch(`${base}/sound/list?token=${gm.you.assetToken}`)).json();
  assert(list.sounds.length === 11 && list.triggers.length > 100, "the GM gets the list and the triggers");

  // Triggers: turned off, they play nothing; Kraken's back again.
  const off = agent.triggers().map((trigger) => (trigger.on === "attack" || trigger.on === "spellattack" ? { ...trigger, enabled: false } : trigger));
  gm.send({ type: "sound-triggers", triggers: off });
  await settle();
  attack("1d20+3", 15, "[ATTACK] (M) Longsword [AC 13] [HIT 18 vs 13] -> [at Orc]", "HIT");
  await settle();
  assert(!bob.lines.at(-1).sound, `attack triggers turned off play nothing: ${bob.lines.at(-1).sound}`);
  assert(server.persisted().soundTriggers.some((trigger) => !trigger.enabled), "triggers are saved with the campaign");

  // The agent.
  assert((await tool({ action: "list", kind: "ambience" })).groups.length === 2, "the agent lists the ambience");
  assert((await tool({ action: "play", id: "sfx/Body/Heal" })).playing.id === "sfx/Body/Heal/heal-1.wav", "the agent plays a sound");
  assert((await tool({ action: "ambience", do: "add", id: "ambience/Forest at Night" })).ambience.length === 2, "the agent adds a loop");
  assert((await tool({ action: "music", do: "play", id: "music/Battle/battle-2.wav", loop: true })).music.loop === true, "the agent plays a track, looped");
  assert((await tool({ action: "triggers", triggers: "default" })).triggers.every((trigger) => trigger.enabled), "the agent puts Kraken's triggers back");
  for (const seat of [gm, ann, bob, late]) seat.ws.close();
  console.log(`SOUND_OK ${defaultTriggers().length} triggers, ${catalog().length} folders to make`);
} finally {
  await server.stop();
}
