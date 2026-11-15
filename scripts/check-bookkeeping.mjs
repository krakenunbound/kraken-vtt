// Bookkeeping (electron/bookkeeping.cjs, shared/bookkeeping): the GM's ask, "an automatic tracker
// for potions and arrows and bullets etc too. rations consumed during rests ... with a DM option to
// disable ... Same goes for bag space and encumbrance". Each part is played through the tools the
// way the sheet's buttons and the tracker do it, with its switch on and then off:
//   ammunition (a longbow's arrows from the SRD kit's "Arrows (20)", refused when out, the low
//   warning, half picked up after the fight; C&C's own counting tallied), consumables (a potion
//   drunk heals, dragged onto another heals them), rations and water (eaten as days end on the
//   calendar and on a long rest, never twice; 5E Exhaustion for a day without water), light (a
//   torch from the pack, a lantern's oil, a player with none refused), the load (5E capacity and
//   the variant, the effect on the token, a bag of holding's weightless contents, Basic Fantasy's
//   movement and Cairn's full inventory switched off), packs unpacked, rests (5E short with Hit
//   Point Dice, long, the party's with the calendar, refused in a fight; Cairn's own), the Cards
//   window's long rest, and the pause holding a player's bookkeeping.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import * as bk from "../shared/bookkeeping/bookkeeping.mjs";
import { rulesetFor } from "../shared/rulesets/registry.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

let passed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
}
const scene = { id: "camp", name: "Camp", width: 1000, height: 600, padding: 0, backgroundColor: "#000", darkness: 1, grid: { size: 50, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, lights: [], tokens: [], walls: [] };
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox = [];
    ws.on("message", (data) => inbox.push(JSON.parse(data.toString())));
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
    const start = Date.now();
    const poll = setInterval(() => {
      const ok = inbox.find((m) => m.type === "ok");
      if (ok || Date.now() - start > 4000) {
        clearInterval(poll);
        if (ok) resolve({ ws, inbox, ok });
        else reject(new Error("join timed out"));
      }
    }, 10);
  });
}
async function latest(seat, type, test = () => true, label = type) {
  const start = Date.now();
  while (Date.now() - start < 3000) {
    const found = [...seat.inbox].reverse().find((m) => m.type === type && test(m));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`waiting for ${label}`);
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

// --- The core alone: 3.5E's loads, 2E's steps, a Traveller magazine, a pack's contents --------------
{
  const d35 = rulesetFor("D&D 3.5E").bookkeeping;
  const medium = bk.encumbranceOf(d35, { abilities: { strength: { score: 14 } }, speed: 30, inventorylist: { a: { name: "Chainmail", type: "Armor", weight: 40, carried: 2 }, b: { name: "Longsword", weight: 4 }, c: { name: "Rope", weight: 15 } } });
  assert(medium.level.id === "medium" && medium.level.speed === 20 && medium.level.effect === "SKILL: -3", `3.5E Str 14 with 59 lb.: a medium load, speed 20, -3: ${JSON.stringify(medium.level)}`);
  assert(bk.encumbranceOf(d35, { abilities: { strength: { score: 25 } }, inventorylist: {} }).max === 800, "3.5E Str 25: a heavy load of 800 lb. (x4 for each 10 above 20)");
  assert(bk.encumbranceOf(d35, { abilities: { strength: { score: 10 } }, size: "Small", inventorylist: {} }).max === 75, "3.5E Small: three quarters");
  const d2e = rulesetFor("AD&D 2E").bookkeeping;
  const two = bk.encumbranceOf(d2e, { abilities: { strength: { score: 12, weightallow: 45 } }, movement: 12, inventorylist: { a: { name: "Plate", weight: 50, carried: 2, type: "Armor" }, b: { name: "Sack of loot", weight: 40 } } });
  assert(two.level.id === "moderate" && two.level.speed === 6 && two.level.effect === "ATK: -1", `2E 90 lb. on a 45 lb. allowance: moderate, movement 6, -1 to hit: ${JSON.stringify(two.level)}`);
  const mg = rulesetFor("Traveller").bookkeeping;
  let t = { inventorylist: { g: { name: "Autopistol", type: "Weapon", damage: "3D-3", magazine: 2, subtype: "Ranged" }, m: { name: "Autopistol Magazine", count: 1 } } };
  const shots = [];
  for (let i = 0; i < 5; i += 1) {
    const s = bk.spendAmmo(mg, t, "g");
    shots.push(s.ok ? `${s.left}${s.reloaded ? "r" : ""}` : "x");
    if (s.ok) t = s.data;
  }
  assert(shots.join(",") === "1,0,1r,0,x", `a magazine of 2 and one spare: ${shots.join(",")}`);
  // C&C's units: a quiver of 20 as one row; three fired across a unit's end come back as whole units.
  const cnc = rulesetFor("Castles & Crusades").bookkeeping;
  let quiver = { inventorylist: { q: { name: "Arrows", count: 2, ammoperunit: 20, ammoused: 18 } }, bookkeeping: { spent: { q: { name: "Arrows", n: 4 } } } };
  quiver = bk.recoverAmmo(cnc, quiver).data;
  assert(bk.quantity(quiver.inventorylist.q) === 24 && quiver.inventorylist.q.count === 2 && quiver.inventorylist.q.ammoused === 16, `C&C's quiver gets 2 back across units: ${JSON.stringify(quiver.inventorylist.q)}`);
  // A Traveller medikit is a tool, not used up; a 5E healer's kit's ten uses are.
  assert(bk.consumableOf(mg, { name: "Medikit", description: "Medical supplies: DM+2 to Medic checks." }) === null, "a medikit is not used up");
  assert(bk.consumableOf(rulesetFor("D&D 5E").bookkeeping, { name: "Healer's Kit", description: "This kit has 10 uses." })?.left === 10, "a healer's kit has ten uses");
  const pack = bk.packContents({ name: "Explorer's Pack", description: "Includes a Backpack, a Bedroll, 2 Flasks of Oil, 10 days of Rations, a Rope, a Tinderbox, 10 Torches, and a Waterskin." });
  assert(pack.length === 8 && pack.some((item) => item.name === "Rations" && item.count === 10) && pack.some((item) => item.name === "Torch" && item.count === 10) && pack.some((item) => item.name === "Oil" && item.count === 2), `the pack's contents: ${JSON.stringify(pack)}`);
}

// --- D&D 5E at the table ------------------------------------------------------------------------
const server = createTableServer({ ruleset: "D&D 5E" });
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const books = (id, action, rest = {}) => tool("kraken_bookkeeping", { id, action, ...rest });
  const dm = await connect(info.port, { name: "DM", password: "", hostToken: info.hostToken });
  sockets.push(dm.ws);
  dm.ws.send(JSON.stringify({ type: "scene", scene }));
  await latest(dm, "map", (m) => m.sceneId === "camp", "the map");
  await agent.map.ready;
  await agent.bookkeeping.ready;
  const lines = (count = 12) => agent.chatLog(count).map((line) => line.text ?? line.roll?.label ?? "");

  const kit = {
    "id-00001": { name: "Longbow", type: "Weapon", subtype: "Martial Ranged Weapons", damage: "1d8 piercing", properties: "Ammunition (Range 150/600; Arrow), Heavy, Two-Handed", weight: 2, carried: 2 },
    "id-00002": { name: "Arrows (20)", type: "Adventuring Gear", subtype: "Ammunition", count: 1, weight: 1, carried: 1 },
    "id-00003": { name: "Potion of Healing", type: "Potion", count: 2, weight: 0.5, description: "You regain 2d4 + 2 Hit Points when you drink this potion." },
    "id-00004": { name: "Explorer's Pack", type: "Adventuring Gear", subtype: "Equipment Pack", weight: 55, carried: 1, description: "Includes a Backpack, a Bedroll, 2 Flasks of Oil, 10 days of Rations, a Rope, a Tinderbox, 10 Torches, and a Waterskin." },
    "id-00005": { name: "Bag of Holding", type: "Wondrous Item", weight: 5, carried: 1 },
    "id-00006": { name: "Lantern, Hooded", type: "Adventuring Gear", weight: 2, carried: 1 },
  };
  const base = { ruleset: "dnd5e", level: 3, packages: { "id-00001": { packagetype: "class", name: "Wizard" } }, abilities: { strength: { score: 10 }, dexterity: { score: 16 }, constitution: { score: 14 } }, hp: { total: 28, wounds: 0 }, hitdice: { die: 10, total: 3, used: 0 }, slots: { l1: { max: 3, used: 2 } }, deathsaves: { success: 1, failure: 2 }, speed: "30 ft.", coins: { "id-00001": { name: "GP", amount: 50 } } };
  const ryn = agent.records.create({ type: "character", name: "Ryn", owner: "a test player", visibility: "owner", data: { ...base, inventorylist: structuredClone(kit) } }, agent.seat);
  const ox = agent.records.create({ type: "character", name: "Ox", owner: "another player", visibility: "owner", data: { ...base, hp: { total: 30, wounds: 12 }, inventorylist: {} } }, agent.seat);
  const goblin = agent.records.create({ type: "npc", name: "Goblin", data: { hp: 7, ac: 13 } }, agent.seat);
  const party = agent.records.get("party") ?? agent.records.create({ id: "party", type: "party", name: "Party", visibility: "all", data: { members: [] } }, agent.seat);
  agent.records.update(party.id, { data: { members: [ryn.id, ox.id] } }, agent.seat);
  const data = (record) => agent.records.get(record.id).data;
  const row = (record, key) => data(record).inventorylist?.[key];
  const find = (record, name) => Object.entries(data(record).inventorylist ?? {}).find(([, item]) => item.name === name);

  // Unpack the Explorer's Pack: its contents become rows; a backpack among them is a container.
  let out = await books(ryn.id, "unpack", { item: "id-00004" });
  assert(out.contents.length === 8 && !row(ryn, "id-00004") && find(ryn, "Rations")?.[1].count === 10 && find(ryn, "Torch")?.[1].count === 10, `the pack is opened: ${JSON.stringify(out.contents)}`);
  assert(out.now.load.containers.some((box) => box.name === "Backpack" && box.capacity === 30), "the backpack holds 30 lb.");

  // --- Ammunition ---
  await tool("kraken_token_place", { recordId: ryn.id, col: 2, row: 5 });
  await tool("kraken_token_place", { recordId: goblin.id, col: 14, row: 5 });
  const tokenOf = (record) => agent.map.tokens().find((token) => token.recordId === record.id);
  await tool("kraken_combat", { action: "add", entry: { recordId: ryn.id, tokenId: tokenOf(ryn).id, name: "Ryn", faction: "friend" } });
  await tool("kraken_combat", { action: "add", entry: { recordId: goblin.id, tokenId: tokenOf(goblin).id, name: "Goblin", faction: "foe", hp: 7, ac: 13 } });
  let view = await tool("kraken_combat", { action: "view" });
  const rynEntry = view.entries.find((entry) => entry.name === "Ryn");
  const gobEntry = view.entries.find((entry) => entry.name === "Goblin");
  await tool("kraken_combat", { action: "init", which: "all" });
  await tool("kraken_combat", { action: "target", id: rynEntry.id, targetId: gobEntry.id, on: true });
  await tool("kraken_combat", { action: "attack", recordId: ryn.id, weapon: "id-00001" });
  assert(row(ryn, "id-00002").name === "Arrows" && row(ryn, "id-00002").count === 19, `a shot from the bundle: ${JSON.stringify(row(ryn, "id-00002"))}`);
  // Down to 5: the low warning; then none left: refused.
  agent.records.update(ryn.id, { data: { inventorylist: { "id-00002": { count: 6 } } } }, agent.seat);
  await tool("kraken_combat", { action: "attack", recordId: ryn.id, weapon: "id-00001" });
  assert(lines().some((line) => /Ryn is low on arrows: 5 left/.test(line)), `the low warning: ${lines().join(" | ")}`);
  agent.records.update(ryn.id, { data: { inventorylist: { "id-00002": { count: 0 } } } }, agent.seat);
  out = await tool("kraken_combat", { action: "attack", recordId: ryn.id, weapon: "id-00001" });
  assert(JSON.stringify(out).includes("no arrows left") && lines().some((line) => /Longbow: no arrows left to fire/.test(line)), `refused with none left: ${JSON.stringify(out)}`);
  // Two shots fired in this fight: End tells Ryn one can be picked up (half, rounded down).
  agent.records.update(ryn.id, { data: { inventorylist: { "id-00002": { count: 10 } } } }, agent.seat);
  await tool("kraken_combat", { action: "attack", recordId: ryn.id, weapon: "id-00001" });
  await tool("kraken_combat", { action: "attack", recordId: ryn.id, weapon: "id-00001" });
  assert(data(ryn).bookkeeping.spent["id-00002"].n === 4, `four shots in the tally: ${JSON.stringify(data(ryn).bookkeeping)}`);
  await tool("kraken_combat", { action: "end" });
  assert(lines().some((line) => /Ryn can pick up 2 Arrows after the fight/.test(line)), `End offers the recovery: ${lines().join(" | ")}`);
  out = await books(ryn.id, "recover");
  assert(row(ryn, "id-00002").count === 10 && !data(ryn).bookkeeping.spent, `two picked up (8 + 2): ${JSON.stringify(row(ryn, "id-00002"))}`);
  // The GM's switch off: no arrows, the bow fires anyway and counts nothing.
  await tool("kraken_table_options", { bookkeeping: { ammo: false } });
  agent.records.update(ryn.id, { data: { inventorylist: { "id-00002": { count: 0 } } } }, agent.seat);
  out = await tool("kraken_combat", { action: "attack", recordId: ryn.id, weapon: "id-00001" });
  assert(!JSON.stringify(out).includes("refused") && row(ryn, "id-00002").count === 0 && !data(ryn).bookkeeping?.spent, `ammo off: fired, nothing counted: ${JSON.stringify(out)}`);
  await tool("kraken_table_options", { bookkeeping: { ammo: true } });
  assert((await tool("kraken_table_options", {})).bookkeeping.consumables === true, "a partial bookkeeping change keeps the rest");

  // --- Consumables ---
  agent.records.update(ryn.id, { data: { hp: { wounds: 10 } } }, agent.seat);
  out = await books(ryn.id, "use", { item: "id-00003" });
  assert(out.healed >= 4 && out.healed <= 10 && row(ryn, "id-00003").count === 1, `a potion drunk on the tracker heals 2d4+2: ${JSON.stringify(out)}`);
  // Dragged onto Ox (not in the fight): the healing lands on Ox, the last one gone from the list.
  out = await books(ryn.id, "use", { item: "id-00003", to: { recordId: ox.id } });
  assert(out.to === "Ox" && data(ox).hp.wounds === 12 - out.healed && !row(ryn, "id-00003"), `onto Ox: ${JSON.stringify(out)} wounds ${data(ox).hp.wounds}`);
  await tool("kraken_table_options", { bookkeeping: { consumables: false } });
  agent.records.update(ryn.id, { data: { inventorylist: { "id-00003": { name: "Potion of Healing", count: 1, description: "You regain 2d4 + 2 Hit Points." } } } }, agent.seat);
  let refused = await books(ryn.id, "use", { item: "id-00003" }).catch((error) => error.message);
  assert(/not counting consumables/.test(String(refused)), `consumables off: ${refused}`);
  await tool("kraken_table_options", { bookkeeping: { consumables: true } });

  // --- Light ---
  const torches = () => find(ryn, "Torch")[1].count;
  out = await tool("kraken_effects", { action: "apply", to: { tokenId: tokenOf(ryn).id }, preset: "torch" });
  assert(torches() === 9 && out.spent === "Torch", `a torch from the pack: ${torches()} ${JSON.stringify(out.spent)}`);
  const oil = () => find(ryn, "Oil")[1].count;
  await tool("kraken_effects", { action: "apply", to: { tokenId: tokenOf(ryn).id }, preset: "lantern" });
  assert(oil() === 1, `the lantern burns a flask of oil: ${oil()}`);
  // A player lights a candle with none: refused. (The player's seat, through the table's message.)
  const player = await connect(info.port, { name: "a test player", password: "" });
  sockets.push(player.ws);
  player.ws.send(JSON.stringify({ type: "effects", action: "apply", to: { tokenId: tokenOf(ryn).id }, preset: "candle" }));
  const error = await latest(player, "error", (m) => /candle/.test(m.reason ?? ""), "the candle refused");
  assert(/Ryn has no candle to light/.test(error.reason), `a player with no candle is refused: ${error.reason}`);
  // The GM lights one anyway, said so.
  await tool("kraken_effects", { action: "apply", to: { tokenId: tokenOf(ryn).id }, preset: "candle" });
  assert(lines().some((line) => /Ryn carries no candle: lit by the GM anyway/.test(line)), "the GM's candle goes on anyway");
  await tool("kraken_table_options", { bookkeeping: { light: false } });
  await tool("kraken_effects", { action: "apply", to: { tokenId: tokenOf(ryn).id }, preset: "torch" });
  assert(torches() === 9, "light off: no torch taken");
  await tool("kraken_table_options", { bookkeeping: { light: true } });

  // --- The load ---
  // Strength 10: 150 lb. Over it with an anvil: the effect on Ryn's entry; in the bag of holding it weighs nothing.
  agent.records.update(ryn.id, { data: { inventorylist: { "id-00090": { name: "Anvil", weight: 120, carried: 1 } } } }, agent.seat);
  await settle();
  view = await books(ryn.id, "view");
  assert(view.load.level.id === "over" && view.load.used > 150, `over capacity: ${JSON.stringify(view.load.level)} ${view.load.used}`);
  const entryEffects = async () => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.name === "Ryn").effects.map((effect) => effect.label);
  assert((await entryEffects()).includes("Over capacity"), `the load's effect on Ryn: ${await entryEffects()}`);
  out = await books(ryn.id, "pack", { item: "id-00090", into: "id-00005" });
  await settle();
  view = await books(ryn.id, "view");
  assert(out.in === "Bag of Holding" && view.load.used < 150 && view.load.level.id === "fine" && !(await entryEffects()).includes("Over capacity"), `in the bag of holding it weighs nothing: ${view.load.used}`);
  // The variant: Strength x 5 (50 lb.) and x 10 (100 lb.).
  await tool("kraken_table_options", { bookkeeping: { variant: true } });
  await settle();
  view = await books(ryn.id, "view");
  assert(view.load.level.id === "encumbered" && view.load.level.speed === 20 && (await entryEffects()).includes("Encumbered; SPEED: -10"), `variant: encumbered (${view.load.used} lb.), speed 20: ${JSON.stringify(view.load.level)} ${await entryEffects()}`);
  // Switched off: no penalty, no effect.
  await tool("kraken_table_options", { bookkeeping: { encumbrance: false } });
  await settle();
  view = await books(ryn.id, "view");
  assert(view.load.off && !view.load.level.effect && !(await entryEffects()).some((label) => /Encumbered/.test(label)), "encumbrance off: no effect");
  await tool("kraken_table_options", { bookkeeping: { encumbrance: true, variant: false } });
  await settle();

  // --- Rations and water by the day ---
  await tool("kraken_calendar", { action: "set", hour: 20, minute: 0 });
  const rations = () => find(ryn, "Rations")[1].count;
  const water = () => find(ryn, "Waterskin")[1].charges;
  await tool("kraken_calendar", { action: "advance", hours: 6 });
  await settle();
  assert(rations() === 9 && water() === 0, `a day ended: a ration eaten, the waterskin drunk: ${rations()} ${water()}`);
  // A long rest the next day eats for that day; the night after does not eat again for it.
  await tool("kraken_rest", { id: ryn.id, kind: "long" });
  assert(rations() === 8, `the long rest eats for its day: ${rations()}`);
  const dayAfterRest = data(ryn).bookkeeping;
  assert(dayAfterRest.thirsty === 1, `no water for the rest's day: thirsty ${dayAfterRest.thirsty}`);
  assert(data(ryn).exhaustion === 1, `5E: a day without water is an Exhaustion level: ${data(ryn).exhaustion}`);
  await tool("kraken_calendar", { action: "advance", hours: 24 });
  await settle();
  assert(rations() === 8 && data(ryn).exhaustion === 1, `the rest's day ends: eaten and counted already, nothing twice: ${rations()} exhaustion ${data(ryn).exhaustion}`);
  await tool("kraken_calendar", { action: "advance", hours: 24 });
  await settle();
  assert(rations() === 7 && data(ryn).exhaustion === 2, `the next day ends: a ration, thirsty again: ${rations()} exhaustion ${data(ryn).exhaustion}`);
  view = await books(ryn.id, "view");
  assert(view.effects.some((effect) => /^Exhaustion 2; ATK: -4/.test(effect.label)), `exhaustion as an effect: ${JSON.stringify(view.effects)}`);
  // Thirsty, the long rest takes no exhaustion off; filled up, the next rest does.
  await tool("kraken_rest", { id: ryn.id, kind: "long" });
  assert(data(ryn).exhaustion === 3, `no exhaustion off while thirsty, and the rest's day is one more without water: ${data(ryn).exhaustion}`);
  await books(ryn.id, "refill");
  await tool("kraken_calendar", { action: "advance", hours: 24 });
  await settle();
  await tool("kraken_rest", { id: ryn.id, kind: "long" });
  assert(data(ryn).bookkeeping.thirsty === 0 && data(ryn).exhaustion === 3, `drank on this rest, the exhaustion stays until a rest fed and watered: ${JSON.stringify(data(ryn).bookkeeping)} ${data(ryn).exhaustion}`);
  await books(ryn.id, "refill");
  await tool("kraken_calendar", { action: "advance", hours: 24 });
  await settle();
  await tool("kraken_rest", { id: ryn.id, kind: "long" });
  assert(data(ryn).exhaustion === 2, `fed and watered, a long rest takes one off: ${data(ryn).exhaustion}`);
  await tool("kraken_table_options", { bookkeeping: { rations: false } });
  const before = rations();
  await tool("kraken_calendar", { action: "advance", days: 2 });
  await settle();
  assert(rations() === before, "rations off: the days pass, nothing eaten");
  await tool("kraken_table_options", { bookkeeping: { rations: true } });
  // A party member whose food is still in an unopened Explorer's Pack: the pack is opened when the day ends.
  const kip = agent.records.create({ type: "character", name: "Kip", owner: "", visibility: "gm", data: { ...base, inventorylist: { "id-00001": structuredClone(kit["id-00004"]) } } }, agent.seat);
  agent.records.update("party", { data: { members: [ryn.id, ox.id, kip.id] } }, agent.seat);
  await tool("kraken_calendar", { action: "advance", days: 1 });
  await settle();
  assert(find(kip, "Rations")?.[1].count === 9 && !find(kip, "Explorer's Pack") && data(kip).bookkeeping.thirsty === 0, `the pack opened for the day's food and water: ${JSON.stringify(find(kip, "Rations"))} ${JSON.stringify(data(kip).bookkeeping)}`);
  agent.records.update("party", { data: { members: [ryn.id, ox.id] } }, agent.seat);
  // An effect that lasts until a long rest comes off with it.
  await tool("kraken_effects", { action: "apply", to: { tokenId: tokenOf(ryn).id }, effect: { label: "Aid; until a long rest" } });
  await tool("kraken_rest", { id: ryn.id, kind: "long" });
  assert(!(await tool("kraken_effects", { action: "on", to: { tokenId: tokenOf(ryn).id } })).effects.some((effect) => /^Aid/.test(effect.label)), "the long rest ends what lasts until a long rest");

  // --- Rests ---
  // Short rest: Hit Point Dice (d10 + 2 each).
  agent.records.update(ryn.id, { data: { hp: { wounds: 15 }, hitdice: { used: 0 } } }, agent.seat);
  out = await tool("kraken_rest", { id: ryn.id, kind: "short", hitDice: 2 });
  assert(data(ryn).hitdice.used === 2 && data(ryn).hp.wounds <= 15 - 6 && data(ryn).hp.wounds >= 0, `two Hit Point Dice: ${JSON.stringify(data(ryn).hp)} ${JSON.stringify(out.words)}`);
  refused = await tool("kraken_rest", { id: ryn.id, kind: "short", hitDice: 5 }).catch((error) => error.message);
  assert(/1 Hit Point Die left/.test(String(refused)), `not more than are left: ${refused}`);
  // Long rest: every HP, half the dice (1 of 3), slots and death saves.
  agent.records.update(ryn.id, { data: { slots: { l1: { used: 3 } }, deathsaves: { success: 1, failure: 2 } } }, agent.seat);
  await tool("kraken_rest", { id: ryn.id, kind: "long" });
  const rested = data(ryn);
  assert(rested.hp.wounds === 0 && rested.hitdice.used === 1 && rested.slots.l1.used === 0 && rested.deathsaves.success === 0 && rested.deathsaves.failure === 0, `a long rest: ${JSON.stringify({ hp: rested.hp, hitdice: rested.hitdice, slots: rested.slots, deathsaves: rested.deathsaves })}`);
  // The party rests: everyone, and the clock moves on 8 hours; not during a fight.
  const clock = (await tool("kraken_calendar", {})).hour ?? (await tool("kraken_calendar", { action: "view" })).hour;
  agent.records.update(ox.id, { data: { hp: { wounds: 9 } } }, agent.seat);
  out = await tool("kraken_rest", { party: true, kind: "long" });
  const after = (await tool("kraken_calendar", {})).hour ?? (await tool("kraken_calendar", { action: "view" })).hour;
  assert(out.results.length === 2 && data(ox).hp.wounds === 0 && (clock + 8) % 24 === after, `the party's long rest, 8 hours on: ${clock} -> ${after} ${JSON.stringify(out.results.map((item) => item.skipped ?? item.words))}`);
  await tool("kraken_combat", { action: "init", which: "all" });
  await tool("kraken_combat", { action: "next" });
  refused = await tool("kraken_rest", { party: true, kind: "short" }).catch((error) => error.message);
  assert(/Not while the fight goes on/.test(String(refused)), `no party rest in a fight: ${refused}`);
  await tool("kraken_combat", { action: "end" });
  // The Cards window's Long rest is the same long rest.
  agent.records.update(ox.id, { data: { hp: { wounds: 5 }, slots: { l1: { used: 1 } } } }, agent.seat);
  await tool("kraken_cards", { id: ox.id, action: "rest" }).catch(() => tool("kraken_cards", { character: ox.id, action: "rest" }));
  assert(data(ox).hp.wounds === 0 && data(ox).slots.l1.used === 0, `the cards' long rest heals too: ${JSON.stringify(data(ox).hp)}`);

  // --- The penalties land on rolls: 5E Exhaustion 2 is -4 to the tracker's attack and save ---
  agent.records.update(ryn.id, { data: { exhaustion: 0, inventorylist: { "id-00002": { count: 10 } } } }, agent.seat);
  await settle();
  const fight = async () => {
    await tool("kraken_dice_force", { values: [10] });
    const shot = await tool("kraken_combat", { action: "attack", recordId: ryn.id, weapon: "id-00001" });
    await tool("kraken_dice_force", { values: [10] });
    const saved = await tool("kraken_combat", { action: "save", id: rynEntry.id, attribute: "constitution", cl: 30 });
    return [JSON.stringify(shot).match(/"total":(-?\d+)/)?.[1], JSON.stringify(saved).match(/"total":(-?\d+)/)?.[1]].map(Number);
  };
  const [atk0, save0] = await fight();
  agent.records.update(ryn.id, { data: { exhaustion: 2 } }, agent.seat);
  await settle();
  const [atk2, save2] = await fight();
  assert(atk0 - atk2 === 4 && save0 - save2 === 4, `Exhaustion 2 takes 4 off the attack and the save: attack ${atk0} -> ${atk2}, save ${save0} -> ${save2}`);
  agent.records.update(ryn.id, { data: { exhaustion: 0 } }, agent.seat);

  // --- Paused: a player's bookkeeping waits ---
  await tool("kraken_table_options", { paused: true });
  player.ws.send(JSON.stringify({ type: "rest", id: ryn.id, req: 7, args: { kind: "short" } }));
  const held = await latest(player, "op-result", (m) => m.req === 7, "the pause");
  assert(!held.ok && /paused/.test(held.error), `paused: ${JSON.stringify(held)}`);
  await tool("kraken_table_options", { paused: false });
  // A player rests their own character through the table's message (answered as an op).
  player.ws.send(JSON.stringify({ type: "rest", id: ryn.id, req: 8, args: { kind: "long" } }));
  const answer = await latest(player, "op-result", (m) => m.req === 8, "the player's rest");
  assert(answer.ok && answer.result.rested === "Ryn", `the player's own long rest: ${JSON.stringify(answer)}`);
  player.ws.send(JSON.stringify({ type: "rest", id: ox.id, req: 9, args: { kind: "long" } }));
  const not = await latest(player, "op-result", (m) => m.req === 9, "another's rest");
  assert(!not.ok && /not your character/.test(not.error), `not another's: ${JSON.stringify(not)}`);
} finally {
  for (const ws of sockets) ws.close();
  await server.close?.();
}

// --- Basic Fantasy and Cairn: the rules' own load switched off and on; Cairn's rations and rest ---
for (const [game, make, test] of [
  [
    "Basic Fantasy",
    { ruleset: "bfrpg", class: "fighter", race: "human", level: 1, abilities: { strength: { score: 9 } }, hp: { total: 8, wounds: 0 }, inventorylist: { a: { name: "Chain Mail", type: "Armor", ac: 15, weight: 40, carried: 2 }, b: { name: "Iron spikes", weight: 30, carried: 1 } } },
    (data) => data.movement,
  ],
  ["Cairn", { ruleset: "cairn", attributes: { str: { score: 10 }, dex: { score: 10 }, wil: { score: 10 } }, hp: { max: 4, wounds: 0 }, inventorylist: Object.fromEntries(Array.from({ length: 10 }, (_, n) => [`id-0000${n}`, { name: n === 0 ? "Rations (3 uses)" : `Rock ${n}`, uses: n === 0 ? 3 : undefined, carried: 1 }])) }, (data) => data.hp.total],
]) {
  const table = createTableServer({ ruleset: game });
  try {
    await table.listen({ port: 0, password: "" });
    const agent = table.agent;
    const ctx = { table: () => table };
    const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
    await agent.bookkeeping.ready;
    const hero = agent.records.create({ type: "character", name: "Hero", owner: "a test player", visibility: "owner", data: make }, agent.seat);
    await tool("kraken_table_options", { bookkeeping: { encumbrance: false } });
    await settle();
    await settle();
    const off = test(agent.records.get(hero.id).data);
    // A character made while the switch is off is not penalised either.
    const late = agent.records.create({ type: "character", name: "Late", owner: "a test player", visibility: "owner", data: make }, agent.seat);
    await settle();
    await settle();
    assert(test(agent.records.get(late.id).data) === off, `${game}: a character made while encumbrance is off is not penalised: ${test(agent.records.get(late.id).data)}`);
    await tool("kraken_table_options", { bookkeeping: { encumbrance: true } });
    await settle();
    await settle();
    const on = test(agent.records.get(hero.id).data);
    if (game === "Basic Fantasy") assert(off === 20 && on === 10, `Basic Fantasy: chain mail and 70 lb. on Strength 9 is heavily loaded (10'); off, 20': off ${off} on ${on}`);
    else assert(off === 4 && on === 0, `Cairn: a full inventory is HP 0; off, HP back: off ${off} on ${on}`);
    if (game === "Cairn") {
      // Rations by their uses; none left: Deprived, then a Fatigue a day. The long rest is Cairn's sleep.
      agent.records.update("party", { data: { members: [hero.id] } }, agent.seat);
      await tool("kraken_calendar", { action: "set", hour: 23 });
      await tool("kraken_calendar", { action: "advance", hours: 2 });
      await settle();
      assert(agent.records.get(hero.id).data.inventorylist["id-00000"].uses === 2, "a day: a ration's use eaten");
      agent.records.update(hero.id, { data: { inventorylist: { "id-00000": { uses: 0 } } } }, agent.seat);
      await tool("kraken_calendar", { action: "advance", days: 1 });
      await settle();
      assert(agent.records.get(hero.id).data.deprived === 1, `no rations: Deprived: ${agent.records.get(hero.id).data.deprived}`);
      await tool("kraken_calendar", { action: "advance", days: 1 });
      await settle();
      assert(agent.records.get(hero.id).data.fatigue === 1, `Deprived another day: a Fatigue: ${agent.records.get(hero.id).data.fatigue}`);
      const slept = await tool("kraken_rest", { id: hero.id, kind: "long" }).catch((error) => error.message);
      assert(/deprived/i.test(String(slept)), `Cairn's sleep is refused while Deprived: ${slept}`);
    }
  } finally {
    await table.close?.();
  }
}

console.log(`ok bookkeeping: ${passed} checks (ammunition, consumables, light, the load, rations and water, rests, the GM's switches; 3.5E, 2E, Traveller, Basic Fantasy and Cairn)`);
process.exit(0);
