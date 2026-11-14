// Cairn's rules with fixed dice: saves (a d20 at or under; 1 always succeeds,
// 20 always fails), damage (Armor, at most 3, then HP, then STR; a STR save
// against Critical Damage; STR 0 dead), the Scars (HP to exactly 0), slots
// (ten: bulky two, petty none; Fatigue one each; a full inventory takes HP
// to 0), building from a background (its gear, its tables' items and gold,
// the Marketplace), the sheet's rest, Fatigue, spellbooks and growth, and the
// tracker: the DEX save to act first, attacks that always hit, impaired and
// enhanced dice, two weapons, attackers together, detachments, morale. Run
// from Kraken's own Cairn books (npm run build-games first).
//   node scripts/check-cairn.mjs
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as rules from "../shared/cairn/rules.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { importModule } = require("../electron/importers/fgModule.cjs");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const book = (name) => path.join(ROOT, "games", "modules", name);

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

// --- The rules, alone -----------------------------------------------------------
assert(rules.saveResult(1, 0) === true && rules.saveResult(20, 20) === false && rules.saveResult(12, 12) === true && rules.saveResult(13, 12) === false, "saves: 1 succeeds, 20 fails, at or under");
assert(rules.damageFormula("d6+d6") === "2d6kh1" && rules.damageFormula("d8") === "1d8" && rules.damageFormula("d10", "impaired") === "1d4" && rules.damageFormula("d6", "enhanced") === "1d12", "damage dice: two weapons keep the best; impaired d4; enhanced d12");
{
  const hit = rules.applyDamage({ hp: 4, str: 12, armor: 1 }, 7);
  assert(hit.dealt === 6 && hit.hpLost === 4 && hit.strLoss === 2 && hit.strAfter === 10 && hit.save && !hit.dead && !hit.scar, `7 against 1 Armor and 4 HP: 4 HP, 2 STR, a save: ${JSON.stringify(hit)}`);
  const capped = rules.applyDamage({ hp: 5, str: 10, armor: 5 }, 4);
  assert(capped.armor === 3 && capped.dealt === 1, `Armor is 3 at most: ${JSON.stringify(capped)}`);
  const scar = rules.applyDamage({ hp: 3, str: 10, armor: 0 }, 3);
  assert(scar.scar === 3 && !scar.save && scar.hpAfter === 0, `HP to exactly 0 is a Scar by the HP lost (Walloped): ${JSON.stringify(scar)}`);
  const past = rules.applyDamage({ hp: 3, str: 10, armor: 0 }, 4);
  assert(past.scar === 0 && past.strLoss === 1, "past 0 is no Scar: STR damage");
  const dead = rules.applyDamage({ hp: 0, str: 3, armor: 0 }, 5);
  assert(dead.dead && dead.strAfter === 0 && !dead.save, "STR 0 is death, no save");
}
{
  const item = rules.parseItem("Twin Daggers (d6+d6, _bulky_)");
  assert(item.name === "Twin Daggers" && item.damage === "d6+d6" && item.bulky === 1 && rules.itemSlots(item) === 2, `bulky: two slots: ${JSON.stringify(item)}`);
  assert(rules.itemSlots(rules.parseItem("Chalk (_petty_)")) === 0 && rules.parseItem("Rations (3 uses)").uses === 3 && rules.parseItem("Shield (+1 Armor)").armor === 1, "petty, uses, a shield's Armor");
  const stats = rules.parseStatline("8 HP, 3 Armor, 15 STR, 5 DEX, 3 WIL, sharpened arms (d8+d8), _detachment_");
  assert(stats.hp === 8 && stats.armor === 3 && stats.str === 15 && stats.detachment === 1 && stats.attacks[0].damage === "d8+d8", `a stat line: ${JSON.stringify(stats)}`);
  const data = rules.derive({ attributes: { str: { score: 10 }, dex: { score: 10 }, wil: { score: 10 } }, hp: { max: 5 }, fatigue: 2, inventorylist: { a: { name: "Plate", armor: 3, bulky: 1, carried: 2 }, b: { name: "Shield", armor: 1, carried: 2 }, c: { name: "Rope", carried: 1 }, d: { name: "Tent", bulky: 1, carried: 1 }, e: { name: "Chalk", petty: 1, carried: 1 }, f: { name: "Left at camp", carried: 0 } } });
  assert(data.ac.total === 3, `Armor 3 at most (plate and shield): ${data.ac.total}`);
  assert(data.slots.body === 3 && data.slots.pack === 3 && data.slots.used === 8 && data.hp.total === 5 && !data.encumbered, `slots: body 3, pack 3, Fatigue 2: ${JSON.stringify(data.slots)}`);
  const full = rules.derive({ ...data, fatigue: 4 });
  assert(full.slots.used === 10 && full.encumbered && full.hp.total === 0, "a full inventory: HP 0");
  assert(rules.derive({ ...data, attributes: { str: { score: 0, max: 10 }, dex: { score: 5 }, wil: { score: 5 } } }).status === "Dead" && rules.derive({ ...data, attributes: { str: { score: 5 }, dex: { score: 0, max: 9 }, wil: { score: 5 } } }).status === "Paralyzed" && rules.derive({ ...data, attributes: { str: { score: 5 }, dex: { score: 5 }, wil: { score: 0, max: 9 } } }).status === "Delirious", "STR 0 dead, DEX 0 paralyzed, WIL 0 delirious");
  // A new character's gear: four on the body, ten in all; what does not fit is left behind, the last first.
  const pile = { a: { name: "Plate", armor: 3, bulky: 1, carried: 2 }, b: { name: "Halberd", damage: "d10", bulky: 1, carried: 2 }, c: { name: "Shield", armor: 1, carried: 2 }, d: { name: "Tent", bulky: 1, carried: 1 }, e: { name: "Rope", carried: 1 }, f: { name: "Cart", bulky: 1, carried: 1 }, g: { name: "Chain", carried: 1 }, h: { name: "Lantern", carried: 1 } };
  const leftBehind = rules.fitSlots(pile);
  const packed = rules.derive({ ...data, fatigue: 0, inventorylist: pile });
  assert(packed.slots.body === 3 && packed.slots.used === 10 && leftBehind.join() === "Lantern,Chain" && pile.b.carried === 1, `packing: body ${packed.slots.body}, ${packed.slots.used} slots, left ${leftBehind}`);
  const grown = structuredClone(data);
  assert(/max HP 5 -> 9/.test(rules.applyGrowth(grown, { to: "hp", how: "higher", value: 9 })) && /stays/.test(rules.applyGrowth(grown, { to: "wil", how: "higher", value: 3 })), "growth: higher than the maximum is kept, lower is not");
  assert(rules.moraleDue({ size: 4, fallen: 1, done: {} }).join() === "first" && rules.moraleDue({ size: 4, fallen: 2, done: { first: true } }).join() === "half" && rules.moraleDue({ size: 1, fallen: 1 }).length === 0, "morale: the first casualty, then half");
}
console.log("rules ok");

// --- At the table ---------------------------------------------------------------
const server = createTableServer({ ruleset: "Cairn" });
await server.listen({ port: 0, password: "" });
const ctx = { table: () => server };
const tool = async (name, args = {}) => {
  const result = await callTool(name, args, ctx);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};
const refused = async (name, args) => {
  const result = await callTool(name, args, ctx).catch((error) => ({ isError: true, content: [{ text: error.message }] }));
  return result.isError ? result.content[0].text : null;
};
const agent = server.agent;
const force = (...values) => agent.dice.force(values);
const said = (pattern) => agent.chatLog(400).some((line) => pattern.test(`${line.text ?? ""} ${line.roll?.label ?? ""}`));
const data = (id) => agent.records.get(id).data;
try {
  for (const name of ["Cairn Player's Guide", "Cairn Warden's Guide", "Trouble in Twin Lakes"]) importModule(agent.records, agent.seat, book(name));
  const counts = { background: 0, item: 0, npc: 0, cairntable: 0 };
  for (const type of Object.keys(counts)) counts[type] = agent.records.list({ type }).length;
  assert(counts.background === 20 && counts.npc >= 84 && counts.cairntable === 12 && counts.item > 200, `the books' records: ${JSON.stringify(counts)}`);

  // A Cutpurse: Fence Cutters and +20gp (the last big job, 1), a Glimpse Glass (3); a shield bought.
  const built = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Sparrow", background: "Cutpurse", attributes: { str: 10, dex: 14, wil: 9 }, hp: 4, age: 31, gold: 10, results: [{ table: 0, roll: 1 }, { table: 1, roll: 3 }], traits: { physique: "Lanky", vice: "Greedy" }, bond: "A strange compass", buy: [["Shield", 1]] } });
  const pc = data(built.id);
  const names = Object.values(pc.inventorylist).map((item) => item.name);
  assert(["Backpack", "Rations", "Torch", "Twin Daggers", "Padded Leather", "Lockpicks", "Black Outfit", "Fence Cutters", "Glimpse Glass", "Shield"].every((name) => names.includes(name)), `the Cutpurse's gear: ${names.join(", ")}`);
  assert(built.gold === 20 && pc.ac.total === 2 && pc.hp.max === 4 && pc.attributes.dex.score === 14, `3d6 10 + 20 from the job - 10 for the shield = 20 gp; Armor 2: ${built.gold} ${pc.ac.total}`);
  assert(pc.slots.body === 4 && pc.slots.used === 9 && pc.slots.free === 1, `slots: twin daggers 2, leather 1, shield 1 on the body; five in the pack: ${JSON.stringify(pc.slots)}`);
  assert(pc.attacks && Object.values(pc.attacks).some((attack) => attack.damage === "d6+d6"), "the twin daggers are an attack");
  assert(/not for sale|costs/.test((await refused("kraken_build_character", { spec: { name: "Broke", background: "Cutpurse", attributes: { str: 10, dex: 10, wil: 10 }, hp: 3, gold: 3, results: [{ table: 0, roll: 2 }, { table: 1, roll: 1 }], buy: [["Plate", 1]] } })) ?? ""), "no buying past the purse");

  // Saves from the sheet.
  force(14);
  assert((await tool("kraken_siege_check", { id: built.id, attribute: "dex" })).success === true, "DEX 14, a 14 saves");
  force(1);
  assert((await tool("kraken_siege_check", { id: built.id, attribute: "str" })).success === true, "a 1 always saves");
  force(20);
  assert((await tool("kraken_siege_check", { id: built.id, attribute: "dex" })).success === false, "a 20 always fails");

  // Fatigue fills the last slot: the full inventory takes HP to 0; no room for more.
  await tool("kraken_cairn", { id: built.id, action: "fatigue", amount: 1 });
  assert(data(built.id).encumbered && data(built.id).hp.total === 0, "the tenth slot: HP 0");
  assert(/free slot/.test((await refused("kraken_cairn", { id: built.id, action: "fatigue", amount: 1 })) ?? ""), "no free slot: no more Fatigue");
  await tool("kraken_cairn", { id: built.id, action: "deprived", on: true });
  assert(/deprived/.test((await refused("kraken_cairn", { id: built.id, action: "sleep" })) ?? ""), "deprived: no recovery");
  await tool("kraken_cairn", { id: built.id, action: "deprived", on: false });
  await tool("kraken_cairn", { id: built.id, action: "sleep" });
  assert(data(built.id).fatigue === 0 && data(built.id).hp.total === 4, "a night's rest: Fatigue gone, HP back");
  // A spellbook: a Fatigue; in danger a WIL save first.
  const spellbook = agent.records.list({ type: "item" }).find((item) => item.name === "Spellbook: Charm");
  await tool("kraken_character_drop", { id: built.id, record: spellbook.id }).catch(async () => tool("kraken_cairn", { id: built.id, action: "item-add", text: "Spellbook: Charm" }));
  const bookKey = Object.entries(data(built.id).inventorylist).find(([, item]) => /Charm/.test(item.name))[0];
  assert(data(built.id).slots.used === 10, `the spellbook takes the last slot: ${data(built.id).slots.used}`);
  assert(/free slot/.test((await refused("kraken_cairn", { id: built.id, action: "cast", item: bookKey })) ?? ""), "no slot for its Fatigue: drop something first");
  const torch = Object.entries(data(built.id).inventorylist).find(([, item]) => item.name === "Torch")[0];
  await tool("kraken_character_edit", { id: built.id, changes: [{ path: `inventorylist.${torch}`, value: null }] });
  force(15);
  const cast = await tool("kraken_cairn", { id: built.id, action: "cast", item: bookKey, danger: true });
  assert(cast.saved === false && cast.fatigue === 1 && said(/the Warden decides the cost/), `cast in danger, WIL 9, a 15 fails: ${JSON.stringify(cast.saved)}`);
  await tool("kraken_cairn", { id: built.id, action: "sleep" });
  // Growth: rolled higher than the maximum is kept.
  force(6, 6, 5);
  const grew = await tool("kraken_cairn", { id: built.id, action: "growth-roll", to: "wil", roll: "3d6", reason: "Drank the spirit" });
  assert(grew.attributes.wil.max === 17 && Object.keys(grew.growth).length === 1, `growth: WIL 9 -> 17: ${JSON.stringify(grew.attributes.wil)}`);

  // --- The tracker ---
  const bandit = agent.records.list({ type: "npc" }).find((item) => item.name === "Bandit" && item.source === "Cairn Warden's Guide");
  await tool("kraken_combat", { action: "add", recordId: built.id });
  await tool("kraken_combat", { action: "add", recordId: bandit.id, count: 3 });
  let view = await tool("kraken_combat", { action: "view" });
  const me = view.entries.find((entry) => entry.recordId === built.id).id;
  const foes = view.entries.filter((entry) => entry.faction === "foe").map((entry) => entry.id);
  // The first round: a DEX save to act (DEX 14: a 17 fails, the turn lost).
  force(17);
  await tool("kraken_combat", { action: "init", which: "all" });
  view = await tool("kraken_combat", { action: "view" });
  assert(view.entries[0].id === me && view.entries.find((entry) => entry.id === me).cairn.lostTurn === 1, "the PCs first; a failed DEX save loses the first turn");
  await tool("kraken_combat", { action: "next" });
  view = await tool("kraken_combat", { action: "view" });
  assert(view.active !== me && foes.includes(view.active), "the lost turn is skipped");
  // The PC's twin daggers at a bandit (4 HP, 1 Armor, 12 STR): 2d6, the best kept: 3 and 6 -> 6 - 1 = 5: 4 HP, 1 STR; STR save 11: a 15 fails: dead.
  const daggers = Object.entries(data(built.id).attacks).find(([, attack]) => attack.damage === "d6+d6")[0];
  await tool("kraken_combat", { action: "target", id: me, targetId: foes[0], on: true });
  force(3, 6, 15);
  const hit = (await tool("kraken_combat", { action: "attack", recordId: built.id, weapon: daggers })).results[0];
  assert(hit.total === 6 && hit.armor === 1 && hit.damage === 5, `two daggers keep the best, less Armor: ${JSON.stringify(hit)}`);
  view = await tool("kraken_combat", { action: "view" });
  let foe = view.entries.find((entry) => entry.id === foes[0]);
  assert(foe.health.status === "Dead" && foe.cairn.str === 11, `4 HP, then 1 STR, a failed STR save: ${JSON.stringify(foe.health)} ${JSON.stringify(foe.cairn)}`);
  // The first casualty: the others save WIL 9 (the rolls: 4 stands, 16 flees) -- forced before the attack's own dice ran, so check after.
  assert(said(/\[MORALE\]/), "the first casualty: morale");
  // A bandit at the PC (4 HP, Armor 2): an enhanced d12 of 6 -> 4: HP exactly 0: a Scar (4: Broken Limb).
  await tool("kraken_combat", { action: "target", id: foes[1], targetId: me, on: true });
  force(6, 2);
  const scarred = (await tool("kraken_combat", { action: "attack", id: foes[1], weapon: "id-00001", mode: "enhanced" })).results[0];
  assert(scarred.mode === "enhanced" && scarred.damage === 4, `enhanced d12: ${JSON.stringify(scarred)}`);
  const scars = Object.values(data(built.id).scars ?? {});
  assert(scars.length === 1 && scars[0].roll === 4 && /Broken Limb/.test(scars[0].text) && scars[0].pending === 1, `HP 4 to 0: a Scar, Broken Limb, its roll for later: ${JSON.stringify(scars)}`);
  // Again: impaired d4 of 3, less Armor 2: 1 STR (10 -> 9), the save a 4: still in the fight.
  force(3, 4);
  await tool("kraken_combat", { action: "attack", id: foes[1], weapon: "id-00001", mode: "impaired" });
  assert(data(built.id).attributes.str.score === 9 && !data(built.id).critical, "impaired: a d4, 1 past Armor off STR; the save made");
  // Enhanced d12 of 4, less 2: STR 9 -> 7, a 20 fails: Critical Damage, Dying.
  force(4, 20);
  await tool("kraken_combat", { action: "attack", id: foes[1], weapon: "id-00001", mode: "enhanced" });
  assert(data(built.id).attributes.str.score === 7 && data(built.id).critical === "dying", `STR 7 and dying: ${JSON.stringify(data(built.id).attributes.str)} ${data(built.id).critical}`);
  view = await tool("kraken_combat", { action: "view" });
  assert(view.entries.find((entry) => entry.id === me).health.status === "Dying", "the tracker shows Dying");
  await tool("kraken_cairn", { id: built.id, action: "stabilize" });
  assert(data(built.id).critical === "stable", "bandaged: stable");
  // A mended limb: 2d6 against max HP 4 (5 and 6: 11).
  force(5, 6);
  await tool("kraken_cairn", { id: built.id, action: "scar-recover", scar: Object.keys(data(built.id).scars)[0] });
  assert(data(built.id).hp.max === 11, `Broken Limb mended: max HP 11: ${data(built.id).hp.max}`);
  // A save in the fight, an NPC's: WIL 9.
  force(9);
  assert((await tool("kraken_combat", { action: "save", id: foes[2], attribute: "wil" })).save.success === true, "an NPC's WIL save");
  // Attacking together: the best die of two.
  await tool("kraken_cairn", { id: built.id, action: "recover" });
  force(2, 5);
  const together = (await tool("kraken_combat", { action: "attack-together", ids: [foes[1], foes[2]], targetId: me })).together;
  assert(together.kept === 5 && together.damage === 3, `together: 2 and 5, the 5 kept, less Armor 2: ${JSON.stringify(together)}`);
  // A detachment: an individual's attack is impaired (d4).
  const bones = agent.records.list({ type: "npc" }).find((item) => item.name === "Bone Construct");
  if (bones) {
    await tool("kraken_combat", { action: "add", recordId: bones.id });
    const det = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.name.startsWith("Bone Construct"));
    await tool("kraken_combat", { action: "target", id: me, targetId: foes[0], on: false });
    await tool("kraken_combat", { action: "target", id: me, targetId: det.id, on: true });
    force(4);
    const at = (await tool("kraken_combat", { action: "attack", recordId: built.id, weapon: daggers })).results[0];
    assert(at.mode === "impaired" && at.total === 4, `an attack on a detachment is impaired: ${JSON.stringify(at)}`);
  }
  assert(/always hit/.test((await refused("kraken_combat", { action: "damage-roll", recordId: built.id, weapon: daggers })) ?? ""), "no damage roll: attacks always hit");
  // Morale asked by the GM.
  const morale = (await tool("kraken_combat", { action: "morale", faction: "foe" })).morale;
  assert(Array.isArray(morale) && morale.length >= 1, "the GM's morale check");
  // No experience in Cairn.
  await tool("kraken_party_edit", { members: [built.id] });
  assert(/no experience/i.test((await refused("kraken_party_award", { xp: 100 })) ?? ""), "the party's XP award is refused: Cairn has none");
  console.log(`CAIRN_OK ${checks} checks`);
} finally {
  await server.close?.();
}
process.exit(0);
