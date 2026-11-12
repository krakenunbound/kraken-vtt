// Traveller (Mongoose Traveller 2E as FG's MGT2 ruleset plays it), with fixed
// dice: characteristic DMs and the UPP, skills and specialities (untrained
// -3, Jack-of-all-Trades), tasks against the difficulties with Effect, Boon
// and Bane; a Traveller built, its sheet's edits; the tracker: initiative
// 2d6 + the better of DEX and INT DM, attacks against 8 with Effect, damage
// + Effect - armour (less AP), damage off Endurance, Strength, Dexterity,
// unconscious and dead; an NPC and an animal. Made-up records, no book text.
import "./loopback.mjs";
import { createRequire } from "node:module";
import * as m from "../shared/mgt2/rules.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { fitsRuleset } = require("../electron/books.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- The rules ------------------------------------------------------------------
assert([0, 1, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15].map(m.dm).join() === "-3,-2,-2,-1,-1,0,0,1,1,2,2,3", "characteristic DMs");
assert(m.uppOf({ str: { score: 7 }, dex: { score: 10 }, end: { score: 8 }, int: { score: 11 }, edu: { score: 12 }, soc: { score: 15 } }) === "7A8BCF", "the UPP in hex");
assert(m.skillKey("Gun Combat (Slug)").key === "guncombat-slug" && m.skillKey("Jack-of-all-Trades").key === "jackofalltrades" && m.skillKey("Engineer (M-Drive)").key === "engineer-mdrive" && m.skillName("pilot-smallcraft") === "Pilot (Small Craft)", "skills and specialities by name");
assert(m.diceOf("3D-3") === "3d6-3" && m.diceOf("1D+2") === "1d6+2" && m.diceOf("4D") === "4d6" && m.apOf("AP 5, Auto 3") === 5, "Traveller's dice and AP");
assert(m.bodyState({ end: 8, str: 7, dex: 9 }, 7) === "Wounded" && m.bodyState({ end: 8, str: 7, dex: 9 }, 15) === "Unconscious" && m.bodyState({ end: 8, str: 7, dex: 9 }, 24) === "Dead", "Endurance, then Strength: unconscious; all three: dead");
const spec = { name: "Ilsa Varn", homeworld: "Regina", characteristics: { str: 7, dex: 10, end: 8, int: 11, edu: 9, soc: 6 }, career: "Scout", terms: 3, rank: 1, skills: { "Pilot (Small Craft)": 2, "Gun Combat (Slug)": 1, "Vacc Suit": 0, "Jack-of-all-Trades": 1, Astrogation: 1 }, gear: ["Autopistol", "Cloth", "Gauss Rifle"], credits: 2500 };
const local = m.buildFromSpec(spec);
assert(local.problems.length === 0 && local.data.upp === "7A8B96" && local.data.age === 30 && local.data.hp.total === 25 && local.data.ac.total === 5 && local.data.initiative.total === 1, `a Scout of three terms: UPP 7A8B96, age 30, physical 25, Cloth 5, initiative +1: ${JSON.stringify({ problems: local.problems, upp: local.data.upp, age: local.data.age, hp: local.data.hp, ac: local.data.ac })}`);
const pistol = Object.values(local.data.attacks).find((attack) => attack.name === "Autopistol");
const gauss = Object.values(local.data.attacks).find((attack) => attack.name === "Gauss Rifle");
assert(pistol.bonus === 2 && pistol.damage === "3d6-3" && gauss.ap === 5 && local.data.attacks.unarmed.bonus === -1, `Gun Combat (Slug) 1 + DEX +1; the gauss rifle's AP 5; unarmed: untrained -3 + Jack-of-all-Trades 1 + DEX 1: ${JSON.stringify(local.data.attacks)}`);
assert(m.taskModifier(local.data, "Pilot (Spacecraft)").modifier === 1 && m.taskModifier(local.data, "Pilot (Small Craft)").modifier === 3 && m.taskModifier(local.data, "Medic").modifier === -1 && m.taskModifier(local.data, "", "soc").modifier === 0, "a speciality not held is 0 when the skill is held; untrained -3 + Jack-of-all-Trades 1 + EDU 1");
const wounded = m.derive({ ...local.data, hp: { wounds: 10 } });
assert(wounded.characteristics.end.now === 0 && wounded.characteristics.str.now === 5 && wounded.characteristics.str.dm === -1 && wounded.characteristics.dex.dm === 1, "10 damage: Endurance 0, Strength 5 (DM -1), Dexterity untouched");
const bad = m.buildFromSpec({ characteristics: { str: 1, dex: 7, end: 7, int: 7, edu: 7, soc: 7 }, career: "Pirate", skills: { Pilot: 5 } });
assert(bad.problems.length === 3, `out of range, not a core career, above 4: ${bad.problems}`);

// --- A Traveller table ----------------------------------------------------------
const server = createTableServer({ ruleset: "Traveller" });
await server.listen({ port: 0, password: "" });
const ctx = { table: () => server };
const tool = async (name, args = {}) => {
  const result = await callTool(name, args, ctx);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};
const agent = server.agent;
const force = (...values) => agent.dice.force(values);
const last = (pattern) => [...agent.chatLog(300)].reverse().find((line) => line.roll && pattern.test(line.roll.label ?? ""));
const said = (pattern) => agent.chatLog(300).some((line) => pattern.test(line.text ?? ""));
const make = (type, name, data) => agent.records.create({ type, name, visibility: "gm", data }, agent.seat);

const built = await tool("kraken_build_character", { spec });
assert(built.upp === "7A8B96" && built.physical === 25 && built.armour === 5 && built.skills["Pilot (Small Craft)"] === 2 && built.problems.length === 0, `kraken_build_character: ${JSON.stringify(built)}`);
const ilsa = agent.records.get(built.id);
// Tasks: Pilot (Small Craft) 2 + DEX 1 against Difficult (10): 7 + 3 = 10, Effect 0.
force(3, 4);
let task = await tool("kraken_siege_check", { id: ilsa.id, kind: "skill", skill: "Pilot (Small Craft)", dc: 10 });
assert(task.success && task.effect === 0 && /\[SKILL\] Pilot \(Small Craft\) 2 \(DEX\) \[DIFFICULT 10\+\] \[SUCCESS 10 vs 10, Effect \+0\]/.test(last(/\[SKILL\]/).roll.label), `a Difficult task: ${JSON.stringify(task)} ${last(/\[SKILL\]/).roll.label}`);
// Medic untrained (-3 + Jack-of-all-Trades 1 + EDU 1 = -1) at Average 8, with a Boon (3d6, the best two).
force(6, 1, 5);
task = await tool("kraken_siege_check", { id: ilsa.id, kind: "skill", skill: "Medic", advantage: "boon" });
assert(task.total === 10 && task.effect === 2 && /untrained/.test(last(/\[SKILL\]/).roll.label) && /\[BOON\]/.test(last(/\[SKILL\]/).roll.label), `untrained with a Boon: 6 + 5 - 1 = 10, Effect +2: ${JSON.stringify(task)}`);
force(2, 3);
task = await tool("kraken_siege_check", { id: ilsa.id, kind: "check", attribute: "soc", dc: 6, bonus: 1 });
assert(task.success && task.effect === 0 && task.target === 6 && /\[CHECK\] Social Standing \[ROUTINE 6\+\] \[\+1\]/.test(last(/\[CHECK\]/).roll.label), `a SOC check, Routine, DM +1: 5 + 1 = 6, Effect 0: ${JSON.stringify(task)} ${last(/\[CHECK\]/).roll.label}`);
// The sheet's edits: a skill raised by name, a new speciality, damage.
await tool("kraken_character_edit", { id: ilsa.id, changes: [{ path: "skills.Gun Combat (Slug).level", value: 2 }, { path: "skills.engineer-mdrive.level", value: 1 }, { path: "characteristics.str.score", value: 9 }] });
let sheet = agent.records.get(ilsa.id).data;
assert(sheet.skills["guncombat-slug"].level === 2 && sheet.skills["engineer-mdrive"].name === "Engineer (M-Drive)" && sheet.upp === "9A8B96" && Object.values(sheet.attacks).find((attack) => attack.name === "Autopistol").bonus === 3, `the sheet's edits: ${JSON.stringify(sheet.skills)} ${sheet.upp}`);
let refused = "";
try {
  await tool("kraken_level_up", { id: ilsa.id });
} catch (error) {
  refused = error.message;
}
assert(/no levels/.test(refused), `Traveller has no levels: ${refused}`);

// --- The fight ----------------------------------------------------------------
// A pirate (characteristics, a skill, a rifle, Mesh) and a beast (Hits, a bite).
const pirate = make("npc", "Pirate", { characteristics: { str: { score: 8 }, dex: { score: 9 }, end: { score: 7 }, int: { score: 6 }, edu: { score: 5 }, soc: { score: 4 } }, skills: "Gun Combat (Slug) 1, Melee (Blade) 1", weapons: { a: { name: "Rifle", damage: "3D", skill: "Gun Combat (Slug)" }, b: { name: "Blade", damage: "2D", skill: "Melee (Blade)" } }, armour: 2 });
const beast = make("npc", "Kian", { hits: 12, damage: "2D", weapon: "bite", attack: 1, armour: 1 });
await tool("kraken_combat", { action: "add", recordId: ilsa.id });
await tool("kraken_combat", { action: "add", recordId: pirate.id });
await tool("kraken_combat", { action: "add", recordId: beast.id });
let view = (await tool("kraken_combat", { action: "view" })).entries;
const me = view.find((entry) => entry.recordId === ilsa.id);
const pir = view.find((entry) => entry.name === "Pirate");
const kian = view.find((entry) => entry.name === "Kian");
assert(pir.hp === 24 && pir.ac === 2 && pir.attacks?.length === 2 && pir.attacks[0].bonus === 2 && kian.hp === 12 && kian.ac === 1 && kian.attacks[0].damage === "2d6", `the pirate's 24 (STR + DEX + END), Mesh 2, Rifle +2; the kian's 12 Hits: ${JSON.stringify(pir.attacks)} ${JSON.stringify(kian)}`);
// Initiative: 2d6 + the better of DEX and INT DM (Ilsa: +1; the pirate: DEX 9, +1).
force(4, 4, 3, 3, 5, 5);
await tool("kraken_combat", { action: "init", which: "all" });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === me.id).initresult === 9 && view.find((entry) => entry.id === pir.id).initresult === 7 && view.find((entry) => entry.id === kian.id).initresult === 10, `initiative: ${view.map((entry) => `${entry.name} ${entry.initresult}`)}`);
// Ilsa's gauss rifle (Gun Combat (Slug) 2 + DEX 1 = +3) at the pirate: 4 + 3 = 7 misses; 6 + 3 = 9 hits, Effect +1.
await tool("kraken_combat", { action: "target", id: me.id, targetId: pir.id, on: true });
const gaussKey = Object.entries(sheet.attacks).find(([, attack]) => attack.name === "Gauss Rifle")[0];
force(2, 2);
let results = (await tool("kraken_combat", { action: "attack", recordId: ilsa.id, weapon: gaussKey })).results;
assert(!results[0].hit, "4 + 3 misses");
force(3, 3);
results = (await tool("kraken_combat", { action: "attack", recordId: ilsa.id, weapon: gaussKey })).results;
assert(results[0].hit && results[0].effect === 1 && /\[ARMOUR 0, AP 5\]|\[HIT 9 vs 8, Effect \+1\]/.test(last(/\[ATTACK\]/).roll.label), `9 hits, Effect +1: ${JSON.stringify(results)} ${last(/\[ATTACK\]/).roll.label}`);
// 4d6 = 10 + Effect 1, Mesh 2 less AP 5: 11 damage: Endurance 7 to 0, Strength 8 to 4.
force(1, 2, 3, 4);
let damage = await tool("kraken_combat", { action: "damage-roll", recordId: ilsa.id, weapon: gaussKey });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(damage.damage.targets[0].damage === 11 && view.find((entry) => entry.id === pir.id).wounds === 11 && view.find((entry) => entry.id === pir.id).health.status === "Wounded", `AP 5 goes through Mesh 2: 10 + 1 = 11: ${JSON.stringify(damage.damage)}`);
// The pirate's blade at Ilsa (Melee (Blade) 1 + the better of STR 8 / DEX 9 = +2): 12 + 2 = 14, Effect +6; 2D 5 + 6 - Cloth 5 = 6.
await tool("kraken_combat", { action: "target", id: pir.id, targetId: me.id, on: true });
force(6, 6);
results = (await tool("kraken_combat", { action: "attack", id: pir.id, weapon: "1" })).results;
force(2, 3);
damage = await tool("kraken_combat", { action: "damage-roll", id: pir.id, weapon: "1" });
assert(results[0].effect === 6 && damage.damage.targets[0].damage === 6 && agent.records.get(ilsa.id).data.hp.wounds === 6, `a blade through Cloth: 5 + 6 - 5 = 6: ${JSON.stringify(results)} ${JSON.stringify(damage.damage)}`);
// A wounded Endurance is weaker: Ilsa's END 8 - 6 = 2, DM -2.
force(4, 4);
const endCheck = (await tool("kraken_combat", { action: "save", id: me.id, attribute: "end" })).save;
assert(endCheck.total === 6 && !endCheck.success, `END now 2: DM -2: ${JSON.stringify(endCheck)}`);
// The pirate at 4 more: Endurance 0 and Strength 0: unconscious, out of the fight.
await tool("kraken_combat", { action: "damage", id: pir.id, amount: 4 });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === pir.id).health.status === "Unconscious", `END and STR at 0: Unconscious (${view.find((entry) => entry.id === pir.id).health.status})`);
refused = "";
try {
  await tool("kraken_combat", { action: "attack", id: pir.id, weapon: "0" });
} catch (error) {
  refused = error.message;
}
assert(/unconscious/.test(refused), `the unconscious cannot attack: ${refused}`);
await tool("kraken_combat", { action: "damage", id: pir.id, amount: 30 });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === pir.id).health.status === "Dead" && view.find((entry) => entry.id === pir.id).wounds === 24, "all three at 0: Dead (no damage past the total)");
// The kian's 12 Hits: 12 damage and it is dead.
await tool("kraken_combat", { action: "damage", id: kian.id, amount: 12 });
view = (await tool("kraken_combat", { action: "view" })).entries;
assert(view.find((entry) => entry.id === kian.id).health.status === "Dead", "an animal at 0 Hits: Dead");
await tool("kraken_combat", { action: "heal", id: me.id, amount: 3 });
assert(agent.records.get(ilsa.id).data.hp.wounds === 3, "healing takes damage off");
await tool("kraken_combat", { action: "end", removeNpcs: true });

// Books: FG's MGT2 modules and packs on a Traveller shelf.
assert(fitsRuleset({ ruleset: "MGT2" }, "Traveller") && !fitsRuleset({ ruleset: "MGT2" }, "Apeira Astra") && fitsRuleset({ kraken: "Traveller", ruleset: "MGT2" }, "Traveller"), "Traveller books on a Traveller shelf");
await server.close?.();
console.log("ok mgt2: characteristic DMs and the UPP, skills and specialities, Jack-of-all-Trades, Traveller's dice and AP, damage off END, STR, DEX; a Scout built; tasks against Difficult and Average with Effect, a Boon, a characteristic check; the sheet's edits; initiative, attacks against 8 with Effect, AP through armour, Cloth stopping a blade, a wounded END's DM, unconscious and dead, an animal's Hits, healing; the shelf");
process.exit(0);
