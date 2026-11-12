// Starships in the 2d6 games, with fixed dice: ships from Kraken's designs,
// the sheet's edits (a player takes a station only with their own
// character), a ship on the tracker (hull and armour), initiative 2d6 + the
// pilot's task DM + Thrust, gunnery (the gunner's skill and DM, the weapon's
// DM, fire control, the range) against 8, damage + Effect - armour (less AP)
// off the hull, a critical hit at Effect 6+, a hull critical's more damage,
// a weapon critical, out of range, destroyed; in Traveller and Apeira Astra.
import "./loopback.mjs";
import { createRequire } from "node:module";
import * as s from "../shared/starships/rules.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- The rules ------------------------------------------------------------------
assert(s.hullFor(100) === 40 && s.hullFor(400) === 160 && s.hullFor(10) === 4, "hull points: tons / 2.5");
assert(s.rangeDm("Short") === 1 && s.rangeDm("Long") === -2 && s.rangeDm("Distant") === -6 && s.rangeIndex("Very Long") === 5, "range bands");
const trader = s.fromDesign("Rusty Lark", "Free Trader");
assert(trader.data.hull.max === 80 && trader.data.armour === 2 && trader.data.thrust === 1 && Object.values(trader.data.weapons)[0].name === "Pulse Laser" && trader.data.fireControl === 0, `a Free Trader: ${JSON.stringify(trader.data)}`);
const hit = s.derive({ ...trader.data, criticals: { armour: 1, mdrive: 1, sensors: 2 } });
assert(hit.armour === 1 && hit.thrust === 0 && hit.fireControl === -2, "criticals: armour -1, thrust -1, sensors -2 to fire control");

for (const ruleset of ["Traveller", "Apeira Astra"]) {
  const server = createTableServer({ ruleset });
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
  const traveller = ruleset === "Traveller";

  // A gunner and a pilot: Traveller's Gunner (Turret) 2 + DEX 9 (+1) = +3, Pilot (Spacecraft) 1 + DEX 1 = 2;
  // Apeira Astra's Gunnery 2 + Intellect 10 (+1) = +3, Pilot 1 + Reflex 9 (+1) = 2.
  const spec = traveller
    ? { name: "Gunner Hale", characteristics: { str: 7, dex: 9, end: 7, int: 8, edu: 8, soc: 7 }, skills: { "Gunner (Turret)": 2, "Pilot (Spacecraft)": 1 } }
    : null;
  let hale;
  if (traveller) hale = agent.records.get((await tool("kraken_build_character", { spec, owner: "Ann" })).id);
  else hale = agent.records.create({ type: "character", name: "Gunner Hale", owner: "Ann", visibility: "owner", data: (await import("../shared/astra/rules.mjs")).derive({ characteristics: { brawn: { score: 7 }, reflex: { score: 9 }, grit: { score: 7 }, intellect: { score: 10 }, training: { score: 7 }, presence: { score: 7 } }, skills: { gunnery: { level: 2 }, pilot: { level: 1 } } }) }, agent.seat);
  const other = agent.records.create({ type: "character", name: "Someone Else", owner: "Bob", visibility: "owner", data: { ruleset: traveller ? "mgt2" : "astra" } }, agent.seat);

  const designs = await tool("kraken_starship", { action: "designs" });
  assert(designs.length === 6 && designs.find((item) => item.class === "Patrol Cutter").hull === 160, "six designs");
  const lark = await tool("kraken_starship", { action: "create", name: "Rusty Lark", design: "Free Trader" });
  const cutter = await tool("kraken_starship", { action: "create", name: "ACV Vigil", design: "Patrol Cutter" });
  const laser = lark.weapons[0];
  await tool("kraken_starship", { action: "edit", id: lark.id, changes: [{ path: "weapons." + laser + ".gunner", value: hale.id }, { path: "crew.pilot", value: hale.id }, { path: "weapons.add", value: { name: "Missile Rack" } }] });
  let ship = agent.records.get(lark.id).data;
  assert(ship.weapons[laser].gunner === hale.id && ship.crew.pilot === hale.id && Object.values(ship.weapons).some((weapon) => weapon.name === "Missile Rack"), `stations taken, a missile rack added: ${JSON.stringify(ship.weapons)}`);
  // A player may take a station only with their own character.
  const ships = require("../electron/starships.cjs");
  let refused = "";
  try {
    await ships.editShip(agent, agent.records.get(lark.id), [{ path: "crew.engineer", value: other.id }], { role: "player", name: "Ann" });
  } catch (error) {
    refused = error.message;
  }
  assert(/own character/.test(refused), `Ann cannot post Bob's character: ${refused}`);
  try {
    await ships.editShip(agent, agent.records.get(lark.id), [{ path: "armour", value: 9 }], { role: "player", name: "Ann" });
    refused = "";
  } catch (error) {
    refused = error.message;
  }
  assert(/Only the GM/.test(refused), "a player cannot change the ship itself");
  await ships.editShip(agent, agent.records.get(lark.id), [{ path: "crew.sensors", value: hale.id }], { role: "player", name: "Ann" });
  assert(agent.records.get(lark.id).data.crew.sensors === hale.id, "Ann posts her own character to sensors");

  // On the tracker.
  await tool("kraken_combat", { action: "add", recordId: lark.id, entry: undefined });
  await tool("kraken_combat", { action: "add", recordId: cutter.id });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const larkEntry = view.find((entry) => entry.name === "Rusty Lark");
  const cutEntry = view.find((entry) => entry.name === "ACV Vigil");
  assert(larkEntry.hp === 80 && larkEntry.ac === 2 && cutEntry.hp === 160 && cutEntry.ac === 6 && larkEntry.ship?.weapons.length === 2 && larkEntry.ship.weapons[0].gunnerName === "Gunner Hale", `ships on the tracker: ${JSON.stringify(larkEntry)}`);
  // Initiative: the Lark 2d6 (3 + 3) + the pilot's 2 + Thrust 1 = 9; the cutter 2d6 (2 + 2) + no pilot -3 + Thrust 4 = 5.
  force(3, 3, 2, 2);
  await tool("kraken_combat", { action: "init", which: "all" });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === larkEntry.id).initresult === 9 && view.find((entry) => entry.id === cutEntry.id).initresult === 5, `ship initiative: ${view.map((entry) => `${entry.name} ${entry.initresult}`)}`);
  // The pulse laser (DM +2) at Short (+1): gunner +3, fire control 0: 2 + 3 + 3 = 8... a 2 and a 1: 3 + 6 = 9, Effect +1.
  force(2, 1);
  let shot = (await tool("kraken_combat", { action: "ship-attack", id: larkEntry.id, weapon: laser, targetId: cutEntry.id, range: "Short" })).shot;
  assert(shot.hit && shot.effect === 1 && /\[SHIP ATTACK\] Rusty Lark: Pulse Laser \(Gunner Hale/.test(last(/\[SHIP ATTACK\]/).roll.label), `a hit: ${JSON.stringify(shot)} ${last(/\[SHIP ATTACK\]/).roll.label}`);
  // Its damage: 2D (4 + 5) + 1 - armour 6 = 4 off the hull.
  // (the damage dice were rolled in the same action: re-check from the hull)
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const cutWounds = view.find((entry) => entry.id === cutEntry.id).wounds;
  assert(cutWounds === shot.damage && agent.records.get(cutter.id).data.hull.damage === shot.damage, `the cutter's hull takes the damage: ${cutWounds} ${shot.damage}`);
  // Out of range: a pulse laser reaches Long.
  try {
    await tool("kraken_combat", { action: "ship-attack", id: larkEntry.id, weapon: laser, targetId: cutEntry.id, range: "Distant" });
    refused = "";
  } catch (error) {
    refused = error.message;
  }
  assert(/reaches Long/.test(refused), `out of range: ${refused}`);
  // A critical: 6 + 6 + 6 = 18, Effect +10; 2D 3 + 3 + 10 - 6 = 10; the system: 2d6 = 7, the hull: 1D more (4).
  const before = agent.records.get(cutter.id).data.hull.damage;
  force(6, 6, 3, 3, 3, 4, 4);
  shot = (await tool("kraken_combat", { action: "ship-attack", id: larkEntry.id, weapon: laser, targetId: cutEntry.id, range: "Short" })).shot;
  const after = agent.records.get(cutter.id).data;
  assert(shot.damage === 10 && shot.critical?.system === "hull" && shot.critical.severity === 1 && after.criticals.hull === 1 && after.hull.damage === before + 10 + 4 && said(/\[CRITICAL HIT\] ACV Vigil: Hull \(2d6 = 7\), severity 1/), `a hull critical: ${JSON.stringify(shot)} ${after.hull.damage}`);
  // A weapon critical disables one of the target's weapons: 18 again, 2d6 = 5.
  force(6, 6, 1, 1, 2, 3);
  shot = (await tool("kraken_combat", { action: "ship-attack", id: larkEntry.id, weapon: laser, targetId: cutEntry.id, range: "Short" })).shot;
  assert(shot.critical?.system === "weapon" && Object.values(agent.records.get(cutter.id).data.weapons).filter((weapon) => weapon.disabled).length === 1, `a weapon critical: ${JSON.stringify(shot)}`);
  // A miss: the cutter, with no gunner (-3), fire control 4 and a Beam Laser (+4) at Medium: 1 + 1 + 5 = 7.
  const cutView = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === cutEntry.id);
  const beam = cutView.ship.weapons.find((weapon) => weapon.name === "Beam Laser" && !weapon.disabled) ?? cutView.ship.weapons.find((weapon) => !weapon.disabled);
  force(1, 1);
  shot = (await tool("kraken_combat", { action: "ship-attack", id: cutEntry.id, weapon: beam.key, targetId: larkEntry.id, range: "Medium" })).shot;
  assert(!shot.hit, `a miss: ${JSON.stringify(shot)}`);
  // Destroyed at 0 hull: it cannot fire.
  await tool("kraken_combat", { action: "damage", id: cutEntry.id, amount: 500 });
  view = (await tool("kraken_combat", { action: "view" })).entries;
  assert(view.find((entry) => entry.id === cutEntry.id).health.status === "Destroyed" && agent.records.get(cutter.id).data.state === "Destroyed", "0 hull: Destroyed");
  try {
    await tool("kraken_combat", { action: "ship-attack", id: cutEntry.id, weapon: beam.key, targetId: larkEntry.id, range: "Short" });
    refused = "";
  } catch (error) {
    refused = error.message;
  }
  assert(/destroyed/.test(refused), `the destroyed do not fire: ${refused}`);
  // A player fires only the weapon they man: Bob cannot fire Ann's laser; Ann can.
  try {
    await agent.combat.shipAttack(larkEntry.id, laser, cutEntry.id, "Short", { role: "player", name: "Bob" });
    refused = "";
  } catch (error) {
    refused = error.message;
  }
  assert(/gunner/.test(refused), `Bob is not the gunner: ${refused}`);
  await tool("kraken_combat", { action: "end", removeNpcs: true });
  await server.close?.();
}
console.log("ok starships: hull points, range bands, Kraken's six designs, criticals off armour, thrust and fire control; in Traveller and Apeira Astra: stations taken (a player's only with their own character), a missile rack added, ships on the tracker, initiative by pilot and Thrust, gunnery against 8 with the Effect, armour off the damage, out of range, a hull critical's more damage, a weapon critical, a miss with no gunner, destroyed at 0 hull");
process.exit(0);
