// Ability cards (shared/cards/cards.mjs and kraken_cards), with Kraken's own
// Descending Darkness, fixed dice: a character's spells and weapons as cards;
// a spell card spent when no slot of its level or higher is left (a cantrip
// never); a cast uses the card's slot; a concentration spell is held (one at a
// time) and ends; a long rest stands every card up; a card used on a target
// makes it the only target; the GM's Cards window and the player's toggle.
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { cardsFor, freeSlot, restChanges, weaponKind } from "../shared/cards/cards.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { importModule } = require("../electron/importers/fgModule.cjs");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// The model alone.
assert(freeSlot({ l1: { max: 2, used: 2 }, l2: { max: 1, used: 0 } }, 1) === 2, "a 1st-level spell with no 1st-level slot uses a 2nd");
assert(freeSlot({ l1: { max: 2, used: 2 } }, 1) === null && freeSlot({}, 0) === 0, "no slot: null; a cantrip: 0");
const model = cardsFor(
  { spells: ["Kindle", "Mystery"], slots: { l1: { max: 1, used: 1 } }, attacks: { a1: { name: "Staff", bonus: 2, damage: "1d6", type: "melee" } } },
  [{ id: "s1", name: "Kindle", data: { level: 0, school: "Evocation", description: "<p>Light.</p>" } }],
);
assert(model.length === 3 && model[0].id === "spell:kindle" && !model[0].spent && model[1].known === false && model[2].kind === "weapon" && /\+2 to hit, 1d6/.test(model[2].text), `cards from a sheet: ${JSON.stringify(model)}`);
assert(model[2].weaponKind === "staff" && weaponKind("Light Crossbow") === "crossbow" && weaponKind("Laser Pistol") === "firearm" && weaponKind("Odd Thing", "ranged") === "bow", "a weapon card's picture by its kind");
assert(weaponKind("Blowgun", "ranged") === "sling" && weaponKind("Moonstone Dagger") === "blade" && weaponKind("Elbow Spike") !== "bow" && weaponKind("Longbow") === "bow" && weaponKind("Sling") === "sling" && weaponKind("Shotgun") === "firearm", `whole words: ${["Blowgun", "Moonstone Dagger", "Elbow Spike", "Longbow", "Sling", "Shotgun"].map((name) => weaponKind(name)).join(", ")}`);
assert(restChanges({ slots: { l1: { max: 2, used: 2 }, l2: { max: 1, used: 0 } }, concentration: "Blessing" }).length === 2, "a rest: the used level and concentration");

const server = createTableServer({ ruleset: "Descending Darkness" });
await server.listen({ port: 0, password: "" });
const ctx = { table: () => server };
const tool = async (name, args = {}) => {
  const result = await callTool(name, args, ctx);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};
const refused = async (name, args) => {
  try {
    const result = await callTool(name, args, ctx);
    return result.isError ? result.content[0].text : null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
const agent = server.agent;
const force = (...values) => agent.dice.force(values);
const done = [];
try {
  for (const name of ["Descending Darkness Player's Handbook", "Descending Darkness Bestiary"]) importModule(agent.records, agent.seat, path.join(ROOT, "games", "modules", name));
  const wizard = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Ilse", species: "Human", class: "Wizard", level: 1, scores: { strength: 8, dexterity: 14, constitution: 13, intelligence: 17, wisdom: 12, charisma: 10 }, spells: ["Spark Lash", "Burning Fan", "Ember Ray"], gear: [["Dagger", 1]] } });
  let cards = (await tool("kraken_cards", { action: "list", id: "Ilse" })).cards;
  const byId = (id) => cards.find((card) => card.id === id);
  assert(byId("spell:spark-lash")?.level === 0 && !byId("spell:spark-lash").spent, `a cantrip card, never spent: ${JSON.stringify(byId("spell:spark-lash"))}`);
  assert(byId("spell:burning-fan")?.level === 1 && byId("spell:burning-fan").slot === 1 && byId("spell:burning-fan").pool.max === 2 && byId("spell:burning-fan").school === "evocation", `a 1st-level card with its slots: ${JSON.stringify(byId("spell:burning-fan"))}`);
  assert(byId("spell:ember-ray")?.spent === true, "a 2nd-level spell at 1st level: no slot, spent");
  assert(cards.some((card) => card.kind === "weapon" && card.name === "Dagger"), "the dagger is a weapon card");
  done.push("cards from the sheet");

  // Two casts spend the two slots; then the card is spent and refused.
  const sentinel = agent.records.list({ type: "npc" }).find((record) => record.name === "Bone Sentinel");
  await tool("kraken_combat", { action: "add", recordId: wizard.id });
  await tool("kraken_combat", { action: "add", recordId: sentinel.id });
  const entries = (await tool("kraken_combat", { action: "view" })).entries;
  const foe = entries.find((entry) => entry.name !== "Ilse");
  force(1, 1, 1, 1, 1, 1, 1, 1);
  await tool("kraken_cards", { action: "use", id: wizard.id, card: "spell:burning-fan", targetId: foe.id });
  const ilseEntry = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.name === "Ilse");
  assert(ilseEntry.targets.length === 1 && ilseEntry.targets[0] === foe.id, `used on a target: it is the only target: ${JSON.stringify(ilseEntry.targets)}`);
  force(1, 1, 1, 1, 1, 1, 1, 1);
  await tool("kraken_cards", { action: "use", id: wizard.id, card: "spell:burning-fan" });
  cards = (await tool("kraken_cards", { action: "list", id: wizard.id })).cards;
  assert(byId("spell:burning-fan").spent && agent.records.get(wizard.id).data.slots.l1.used === 2, `two casts: both slots used, the card spent: ${JSON.stringify(byId("spell:burning-fan"))}`);
  const no = await refused("kraken_cards", { action: "use", id: wizard.id, card: "spell:burning-fan" });
  assert(no && /no slot of level 1/.test(no), `a spent card cannot be used: ${no}`);
  force(15, 3);
  const struck = await tool("kraken_cards", { action: "use", id: wizard.id, card: "spell:spark-lash" });
  assert(struck.used === "spell:spark-lash", "a cantrip card is still used with no slots left");
  done.push("casting spends the card's slot; spent cards refuse");

  // A long rest stands every card up.
  await tool("kraken_cards", { action: "rest", id: wizard.id });
  cards = (await tool("kraken_cards", { action: "list", id: wizard.id })).cards;
  assert(!byId("spell:burning-fan").spent && agent.records.get(wizard.id).data.slots.l1.used === 0, "a long rest: slots back, the card stands up");
  done.push("a long rest");

  // A weapon card: attack, then damage.
  const dagger = cards.find((card) => card.kind === "weapon");
  force(15);
  const attacked = await tool("kraken_cards", { action: "use", id: wizard.id, card: dagger.id });
  force(2);
  const hurt = await tool("kraken_cards", { action: "damage", id: wizard.id, card: dagger.id });
  assert(Array.isArray(attacked.result) && hurt.damage && hurt.damage.total >= 0, `a weapon card attacks and deals damage: ${JSON.stringify({ attacked, hurt })}`);
  done.push("weapon cards");

  // Concentration: Blessing is held; a second concentration spell replaces it; it ends.
  const cleric = await tool("kraken_build_character", { owner: "Bob", spec: { name: "Tomas", species: "Human", class: "Cleric", level: 1, scores: { strength: 12, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 17, charisma: 13 }, spells: ["Blessing", "Ward of Faith"] } });
  await tool("kraken_cards", { action: "use", id: cleric.id, card: "spell:blessing" });
  cards = (await tool("kraken_cards", { action: "list", id: cleric.id })).cards;
  assert(byId("spell:blessing").concentration && byId("spell:blessing").concentrating, `Blessing is held: ${JSON.stringify(byId("spell:blessing"))}`);
  await tool("kraken_cards", { action: "use", id: cleric.id, card: "spell:ward-of-faith" });
  cards = (await tool("kraken_cards", { action: "list", id: cleric.id })).cards;
  assert(!byId("spell:blessing").concentrating && byId("spell:ward-of-faith").concentrating, "a second concentration spell ends the first");
  await tool("kraken_cards", { action: "end-concentration", id: cleric.id });
  cards = (await tool("kraken_cards", { action: "list", id: cleric.id })).cards;
  assert(!cards.some((card) => card.concentrating), "concentration ends");
  done.push("concentration");
} finally {
  await server.close?.();
}
console.log(`ok cards: ${done.join("; ")}`);
process.exit(0);
