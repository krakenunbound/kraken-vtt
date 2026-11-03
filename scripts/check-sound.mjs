// Sound on the host, as Syrinscape's in FG (Kraken's C&C Syrinscape extension,
// whose answers for FG's own chat lines are the expected results below): an
// attack plays the weapon's swing, its damage roll the hit, a natural 20 the
// crit and a natural 1 the fumble; a monster's attack its own sound; never the
// sound of who is attacked. Tested with a real battle in Kraken's combat
// tracker, and with FG's chat lines. The line carries its sound to the seats
// that see it; the GM's hidden rolls sound only for combat (the option);
// the same sound waits a second; the GM plays sounds, ambience and music,
// which a seat joining later hears; music can seek; players cannot play.
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
const { soundFor } = require("../electron/soundTriggers.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
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
const folderOf = (id) => (id ?? "").split("/").slice(0, -1).join("/");

// The catalogue: every trigger's folder is one the generator makes.
const made = new Set(catalog().map((item) => item.group));
for (const trigger of defaultTriggers()) assert(made.has(trigger.sound), `trigger ${trigger.id} points at a folder the generator makes: ${trigger.sound}`);

// A library with one sound in every folder the generator makes.
const work = mkdtempSync(path.join(tmpdir(), "kraken-sound-"));
for (const group of made) {
  mkdirSync(path.join(work, ...group.split("/")), { recursive: true });
  writeFileSync(path.join(work, ...group.split("/"), "test-1.wav"), wav());
}
const sounds = createSoundLibrary({ folder: work });
const triggers = defaultTriggers();
const d20 = (face, bonus = 0) => ({ formula: `1d20+${bonus}`, total: face + bonus, terms: [{ kind: "dice", sign: 1, count: 1, sides: 20, rolls: [face], kept: [true], sum: face }] });
const played = (label, roll = d20(12, 1), extra = {}) => folderOf(soundFor({ roll: { ...roll, label }, ...extra }, triggers, sounds)?.id);

// FG's chat lines (captured from FG with the C&C Syrinscape extension): what it played.
const FG = [
  ["[ATTACK] (M) Hammer, War [NO TARGET 14] [d20+1 = 14]", d20(13, 1), "sfx/Weapons/Warhammer/Attack", "warhammer_miss (the swing)"],
  ["[ATTACK] (M) Sword, Short [AC 15] [MISS 7 vs 15] -> [at Halvar Runecarver]", d20(7), "sfx/Weapons/Sword/Attack", "shortsword_miss"],
  ["[ATTACK] (R) Dagger [NO TARGET 21] [d20+1 = 21]", d20(20, 1), "sfx/Weapons/Dagger/Crit", "a natural 20: the critical"],
  ["[ATTACK] (M) Hammer, War [NO TARGET 2] [d20+1 = 2]", d20(1, 1), "sfx/Weapons/Warhammer/Fumble", "a natural 1: the fumble"],
  ["[DAMAGE] Hammer, War | [TYPE: bludgeoning (1d8+1=3)] [d8+1 = 3]", { formula: "1d8+1", total: 3, terms: [] }, "sfx/Weapons/Warhammer/Hit", "warhammer_hit"],
  ["[DAMAGE] Sword, Short | [TYPE: piercing (1d6=4)] [d6 = 4]", { formula: "1d6", total: 4, terms: [] }, "sfx/Weapons/Sword/Hit", "shortsword_hit"],
  ["[DAMAGE] Dagger | [TYPE: piercing (1d4=1)] [d4 = 1]", { formula: "1d4", total: 1, terms: [] }, "sfx/Weapons/Dagger/Hit", "dagger_hit"],
  ["[INIT] Halvar Runecarver", { formula: "1d10", total: 7, terms: [] }, "sfx/Effects/Roll Initiative", "roll_initiative"],
  ["[CAST] Fireball at caster level 5", null, "sfx/Spells/Fire/Cast", "spell:fireball"],
  ["[DAMAGE] Fireball [TYPE: fire]", { formula: "6d6", total: 21, terms: [] }, "sfx/Spells/Fire/Hit", "spell:fireball"],
  ["[SAVE] Dexterity (Prime) [CB 12 CL 3 CC 15] [SUCCESS 17 vs 15]", d20(14, 3), "sfx/Effects/Saving Throw", "magical_windchimes"],
  ["[HEAL] Cure Light Wounds", { formula: "1d8", total: 5, terms: [] }, "sfx/Body/Heal", "cure wounds"],
  ["[ATTACK] (M) Bite [AC 14] [HIT 16 vs 14] -> [at Malachi Grey]", d20(14, 2), "sfx/Weapons/Bite/Attack", "bite_attack"],
];
for (const [label, roll, wanted, fg] of FG) {
  const got = roll ? played(label, roll) : folderOf(soundFor({ text: label, roll: { label, formula: "", total: 0, terms: [] } }, triggers, sounds)?.id);
  assert(got === wanted, `${label}\n  FG played ${fg}; Kraken plays ${got || "nothing"}, wanted ${wanted}`);
}
for (const [text, wanted] of [
  ["[KRAKEN CRITICAL] : CKG Table 17.1A - Critical Hits (Option 5) d20 = 7: Jaw destroyed", "sfx/Weapons/Sword/Crit"],
  ["[KRAKEN FUMBLE] : CKG Table 17.1B - Critical Fumble (Option 5) d20 = 9: Stab or crush knee", "sfx/Weapons/Sword/Fumble"],
  ["[STATUS: dying] Malachi Grey", "sfx/Body/Dying"],
]) {
  const got = folderOf(soundFor({ text }, triggers, sounds)?.id);
  assert(got === wanted, `${text}: ${got || "nothing"}, wanted ${wanted}`);
}
assert(played("[ATTACK] (M) Sword, Long [AC 13] [HIT 15 vs 13] -> [at Orc]") === "sfx/Weapons/Sword/Attack", "attacking an orc plays the sword, not the orc");
assert(played("[ATTACK] (M) Claw [AC 15] [HIT 15 vs 15] -> [at Ann]") === "sfx/Weapons/Claws/Attack", "a monster's claws");
assert(played("[ATTACK] (M) Goblin Spear [AC 15] [MISS 9 vs 15] -> [at Ann]") === "sfx/Weapons/Spear/Attack", "a goblin's spear is a spear");

// A real battle in Kraken's combat tracker: a fighter with a longsword against an orc.
const server = createTableServer({ sounds });
const tool = async (name, args) => JSON.parse((await callTool(name, args, { table: () => server })).content[0].text);
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const gm = await connect(port, { name: "GM", hostToken });
  const player = await connect(port, { name: "Ann" });
  const agent = server.agent;
  agent.records.create({ type: "siegegame", name: "Rules", data: { options: { SIEGE_INIT_STAT: "none", SIEGE_MELEE_DMG_STAT: "strength" } } }, agent.seat);
  const hero = agent.records.create(
    {
      type: "character",
      name: "Aldric",
      owner: "Ann",
      visibility: "owner",
      data: {
        hp: { total: 20, wounds: 0 },
        ac: { total: 17 },
        bth: 2,
        attack: { melee: { attr: 1, total: 3 }, ranged: { attr: 0, total: 2 } },
        attributes: { strength: { score: 15 } },
        inventorylist: { "id-00001": { name: "Sword, Long", damage: "1d8", attacktype: "melee", dmgtype: "slashing", carried: 2 } },
      },
    },
    agent.seat,
  );
  const orcRecord = agent.records.create({ type: "npc", name: "Orc", data: { hptotal: 9, ac: { total: 13 }, bth: 1, attacks: { a01: { name: "Battleaxe", bth: 0, attacktype: "melee", damage: "1d8" } } } }, agent.seat);
  const ct = (args) => tool("kraken_combat", args);
  await ct({ action: "add", recordId: hero.id });
  const view = await ct({ action: "add", recordId: orcRecord.id });
  const aldric = view.entries.find((entry) => entry.name === "Aldric");
  const orc = view.entries.find((entry) => entry.name === "Orc");
  await ct({ action: "target", id: aldric.id, targetId: orc.id });
  await ct({ action: "target", id: orc.id, targetId: aldric.id });
  const last = (match) => player.lines.filter((line) => match.test(line.roll?.label ?? line.text ?? "")).at(-1);
  const wait = () => new Promise((resolve) => setTimeout(resolve, 1100));

  agent.dice.force([3]);
  await ct({ action: "init", which: "all" });
  await settle();
  const inits = player.lines.filter((line) => /^\[INIT\]/.test(line.roll?.label ?? ""));
  assert(folderOf(inits[0]?.sound) === "sfx/Effects/Roll Initiative" && inits.slice(1).every((line) => !line.sound), "initiative: the drum once, not once for each fighter");
  await wait();
  agent.dice.force([14]);
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  await settle();
  const swing = last(/^\[ATTACK\]/);
  assert(/\[HIT/.test(swing.roll.label) && folderOf(swing.sound) === "sfx/Weapons/Sword/Attack", `Aldric's longsword swings: ${swing.roll.label} -> ${swing.sound}`);
  agent.dice.force([5]);
  await ct({ action: "damage-roll", recordId: hero.id, weapon: "id-00001" });
  await settle();
  const hit = player.lines.filter((line) => /^\[DAMAGE\]/.test(line.roll?.label ?? "")).at(-1);
  assert(folderOf(hit?.sound) === "sfx/Weapons/Sword/Hit", `and hits: ${hit?.roll?.label} -> ${hit?.sound}`);
  const wound = player.lines.filter((line) => !line.roll && /-> Orc:/.test(line.text ?? "")).at(-1);
  assert(/^sfx\/Body\//.test(wound?.sound ?? ""), `the orc's wound sounds: ${wound?.text} -> ${wound?.sound}`);
  await wait();
  agent.dice.force([20]);
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  await settle();
  assert(folderOf(last(/^\[ATTACK\]/)?.sound) === "sfx/Weapons/Sword/Crit", "a natural 20, the longsword's crit");
  await wait();
  agent.dice.force([12]);
  await ct({ action: "attack", id: orc.id, weapon: "a01" });
  await settle();
  const axe = last(/^\[ATTACK\]/);
  assert(/Battleaxe/.test(axe.roll.label) && folderOf(axe.sound) === "sfx/Weapons/Axe/Attack", `the orc's battleaxe: ${axe.roll.label} -> ${axe.sound}`);
  await wait();
  agent.dice.force([1]);
  await ct({ action: "attack", id: orc.id, weapon: "a01" });
  await settle();
  assert(folderOf(last(/^\[ATTACK\]/)?.sound) === "sfx/Weapons/Axe/Fumble", "a natural 1, the axe's fumble");

  // The same sound waits a second (the option); then plays again.
  agent.dice.force([11, 13]);
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  await settle();
  const twice = player.lines.filter((line) => /^\[ATTACK\] \(M\) Sword/.test(line.roll?.label ?? "")).slice(-2);
  assert(twice[0].sound && !twice[1].sound, "the same swing twice in a second plays once");

  // The GM's hidden rolls: combat only (the default), silent, or all.
  await wait();
  gm.send({ type: "roll", formula: "1d20", label: "[ATTACK] (M) Mace", mode: "gm" });
  gm.send({ type: "roll", formula: "1d20", label: "Perception", mode: "gm" });
  await settle();
  const [mace, look] = gm.lines.slice(-2);
  assert(folderOf(mace.sound) === "sfx/Weapons/Mace/Attack" && !look.sound, "a hidden attack sounds (combat only); a hidden check does not");
  agent.setOptions({ soundHidden: "off" });
  await wait();
  gm.send({ type: "roll", formula: "1d20", label: "[ATTACK] (M) Flail", mode: "gm" });
  await settle();
  assert(!gm.lines.at(-1).sound, "silent: no sound for hidden rolls");
  agent.setOptions({ soundHidden: "combat" });

  // Only the seats that see a line hear its sound.
  const seen = player.lines.length;
  await wait();
  gm.send({ type: "roll", formula: "1d20", label: "[ATTACK] (M) Spear", mode: "gm" });
  await settle();
  assert(player.lines.length === seen, "a player does not hear the GM's hidden attack");

  // The GM plays for the table; players cannot.
  player.send({ type: "sound-play", id: "oneshots/Guard" });
  await settle();
  assert(!player.events.some((event) => event.type === "sound"), "a player cannot play sounds for the table");
  gm.send({ type: "sound-play", id: "oneshots/Guard" });
  await settle();
  const voice = player.events.filter((event) => event.type === "sound").at(-1);
  assert(voice?.id.startsWith("oneshots/Guard/") && voice.kind === "oneshots", "the guard's voice for everyone");

  // Ambience and music, kept and given to a seat that joins later.
  gm.send({ type: "ambience", action: "add", id: "ambience/Forest at Night" });
  gm.send({ type: "ambience", action: "add", id: "ambience/Rain", volume: 0.4 });
  gm.send({ type: "music", action: "play", id: "music/Battle" });
  await settle();
  const scape = player.events.filter((event) => event.type === "soundscape").at(-1).soundscape;
  assert(scape.ambience.length === 2 && scape.ambience[1].volume === 0.4 && scape.music.group === "music/Battle", `loops and a music folder: ${JSON.stringify(scape)}`);
  const late = await connect(port, { name: "Cal" });
  assert(late.ok.soundscape.ambience.length === 2 && late.ok.soundscape.music, "a seat that joins later hears what is playing");
  gm.send({ type: "ambience", action: "clear" });
  gm.send({ type: "music", action: "stop" });
  await settle();
  const quiet = late.events.filter((event) => event.type === "soundscape").at(-1).soundscape;
  assert(quiet.ambience.length === 0 && quiet.music === null, "loops and music stop");

  // The files: for every seat, a range of one; the list for the GM.
  const base = `http://127.0.0.1:${port}`;
  const file = await fetch(`${base}/sound/file?token=${player.you.assetToken}&id=${encodeURIComponent("music/Battle/test-1.wav")}`, { headers: { Range: "bytes=10-49" } });
  assert(file.status === 206 && (await file.arrayBuffer()).byteLength === 40, "a player gets a range of a sound");
  assert((await fetch(`${base}/sound/list?token=${player.you.assetToken}`)).status === 404, "a player does not get the list");
  const list = await (await fetch(`${base}/sound/list?token=${gm.you.assetToken}`)).json();
  assert(list.sounds.length === made.size && list.triggers.length === triggers.length, "the GM gets the list and the triggers");

  // Triggers turned off play nothing; Kraken's come back.
  gm.send({ type: "sound-triggers", triggers: agent.triggers().map((trigger) => (trigger.on === "attack" ? { ...trigger, enabled: false } : trigger)) });
  await settle();
  await wait();
  agent.dice.force([15]);
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  await settle();
  assert(!last(/^\[ATTACK\]/).sound, "attack triggers turned off play nothing");
  assert((await tool("kraken_sound", { action: "triggers", triggers: "default" })).triggers.every((trigger) => trigger.enabled), "Kraken's triggers again");
  assert((await tool("kraken_sound", { action: "play", id: "sfx/Body/Heal" })).playing.id === "sfx/Body/Heal/test-1.wav", "the agent plays a sound");
  for (const seat of [gm, player, late]) seat.ws.close();
  console.log(`SOUND_OK FG's ${FG.length} lines, a battle in the tracker; ${triggers.length} triggers, ${made.size} folders to make`);
} finally {
  await server.stop();
}
