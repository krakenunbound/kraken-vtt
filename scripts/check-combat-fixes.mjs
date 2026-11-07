// The combat and rules fixes (the alpha.60 review), each checked with Kraken's
// own games (Descending Darkness, Apeira Astra, and a Castles & Crusades table
// with made-up records) and fixed dice:
//  1 removing the creature whose turn it is: the next turn goes to whoever
//    followed it, and effects are not counted down twice
//  2 a player who may not end this turn leaves the active creature's targets alone
//  3 a dead creature loses its turns (no ongoing damage on a corpse)
//  4 damage to a stable creature makes it dying again (5E, Descending Darkness, C&C)
//  5 D&D 5E hit points stop at 0; damage at 0 is a failed death save; instant
//    death only when the leftover reaches the maximum (Descending Darkness keeps negative Health)
//  6 ending a fight resets its round markers (bleeding counts from round 1 again)
//  7 concentration: a new spell ends the last one's effects; damage asks for a
//    Constitution save (DC 10 or half the damage); falling ends it
//  8 5E damage resistance, immunity and vulnerability; the paralyzed fail Strength and Dexterity saves
//  9 Apeira Astra: an attack with no targets does not stop the next damage; hits survive a restart
// 10 a spell part with no dice and a minus bonus rolls ("1d8-2"), one slot spent;
//    an NPC's daily use is not spent on an action that does not exist
// 11 the 5E sheet cannot set used slots or death saves below 0
// (12, C&C failed-effect minutes, stays FG's count: 10 rounds; see check-krits)
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { importModule } = require("../electron/importers/fgModule.cjs");
const { createCombat } = require("../electron/combat.cjs");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const book = (name) => path.join(ROOT, "games", "modules", name);
const DD_BOOKS = ["Descending Darkness Player's Handbook", "Descending Darkness Bestiary"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function table(ruleset, books) {
  const server = createTableServer(ruleset ? { ruleset } : undefined);
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
  for (const name of books) importModule(agent.records, agent.seat, book(name));
  const ct = (args) => tool("kraken_combat", args);
  const view = async () => (await ct({ action: "view" }));
  const entry = async (id) => (await view()).entries.find((item) => item.id === id);
  const last = (pattern) => [...agent.chatLog(300)].reverse().find((line) => line.roll && pattern.test(line.roll.label ?? ""));
  const said = (pattern) => agent.chatLog(300).some((line) => pattern.test(line.text ?? ""));
  const raw = (id) => agent.combat.entries().find((item) => item.id === id);
  return { server, tool, refused, agent, ct, view, entry, last, said, raw, force: (...values) => agent.dice.force(values) };
}

const done = [];

// --- Descending Darkness: turn order, removal, players' turns, the dead, bleeding ---
{
  const t = await table("Descending Darkness", DD_BOOKS);
  try {
    const { tool, agent, ct, view, entry, raw, force } = t;
    const ilse = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Ilse", species: "Human", class: "Wizard", level: 3, scores: { strength: 8, dexterity: 14, constitution: 13, intelligence: 17, wisdom: 12, charisma: 10 } } });
    const helper = await tool("kraken_build_character", { owner: "Bob", spec: { name: "Tomas", species: "Human", class: "Cleric", level: 1, scores: { strength: 12, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 17, charisma: 13 } } });
    const sentinel = agent.records.list({ type: "npc" }).find((record) => record.name === "Bone Sentinel");
    await ct({ action: "add", recordId: ilse.id });
    await ct({ action: "add", recordId: sentinel.id, count: 3 });
    let list = (await view()).entries;
    const id = (name) => list.find((item) => item.name === name).id;
    const [A, B, C, D] = ["Ilse", "Bone Sentinel 1", "Bone Sentinel 2", "Bone Sentinel 3"].map(id);
    for (const [who, init] of [[A, 20], [B, 15], [C, 10], [D, 5]]) await ct({ action: "update", id: who, patch: { initresult: init } });
    const active = async () => (await view()).active;
    const round = async () => (await view()).round;

    // 1. B's turn; an effect on D (counted at 15); B leaves: C is next, same round, the effect untouched.
    await ct({ action: "next" });
    await ct({ action: "next" });
    assert((await active()) === B, "B's turn");
    await ct({ action: "effect", id: D, effect: { label: "Marked", duration: 3 } });
    await ct({ action: "remove", id: B });
    await ct({ action: "next" });
    assert((await active()) === C && (await round()) === 1, `after removing the active entry the next turn is the one that followed it (C, round 1): ${await active()} round ${await round()}`);
    let marked = (await entry(D)).effects.find((effect) => effect.label === "Marked");
    assert(marked.duration === 3, `no countdown yet: ${marked.duration}`);
    // D (the last) gets an effect on A at its count (5) and leaves: the round ends once, the effect is not counted twice.
    await ct({ action: "next" });
    assert((await active()) === D, "D's turn");
    await ct({ action: "effect", id: A, effect: { label: "Late", duration: 2 } });
    await ct({ action: "remove", id: D });
    await ct({ action: "next" });
    const late = (await entry(A)).effects.find((effect) => effect.label === "Late");
    assert((await round()) === 2 && (await active()) === A && late?.duration === 2, `removing the last active entry: round 2, Ilse up, Late not counted down twice: ${JSON.stringify(late)} round ${await round()}`);
    done.push("1 removing the active entry keeps the turn order and effect counts");

    // 2. Sentinel 2's turn with targets (clear at turn end): Ann may not end it, and the targets stay.
    await ct({ action: "next" });
    assert((await active()) === C, "Sentinel 2's turn");
    agent.setOptions({ clearTargets: "turn" });
    await ct({ action: "target", id: C, targetId: A, on: true });
    let refusedTurn = null;
    try {
      await agent.combat.next({ role: "player", name: "Ann" });
    } catch (error) {
      refusedTurn = error.message;
    }
    assert(/not your turn/.test(refusedTurn ?? "") && raw(C).targets.includes(A), `a player's refused next leaves the targets: ${refusedTurn} ${JSON.stringify(raw(C).targets)}`);
    agent.setOptions({ clearTargets: "never" });
    done.push("2 a refused player's next turn clears nothing");

    // 3. A dead Sentinel 2 with ongoing damage loses its turn (a third creature, Sentinel 4, goes on).
    await ct({ action: "add", recordId: sentinel.id });
    list = (await view()).entries;
    const E = list.find((item) => ![A, C].includes(item.id) && item.name.startsWith("Bone Sentinel")).id;
    await ct({ action: "update", id: E, patch: { initresult: 1 } });
    await ct({ action: "effect", id: C, effect: { label: "Burning; DMGO: 1d4" } });
    await ct({ action: "damage", id: C, amount: 999 });
    assert((await entry(C)).health.status === "Dead", "Sentinel 2 is dead");
    const woundsBefore = raw(C).wounds;
    await ct({ action: "round" });
    assert((await active()) === A, "Ilse starts the round");
    await ct({ action: "next" });
    assert((await active()) === E && raw(C).wounds === woundsBefore, `the dead lose their turn and take no ongoing damage: active ${await active()}, wounds ${raw(C).wounds}`);
    done.push("3 the dead lose their turns");
    await ct({ action: "remove", id: C });
    await ct({ action: "remove", id: E });

    // 4 (Descending Darkness). Ilse dying, steadied (Unconscious), then stabbed: dying (and bleeding) again.
    const hpTotal = agent.records.get(ilse.id).data.hp.total;
    await ct({ action: "damage", id: A, amount: hpTotal });
    assert((await entry(A)).health.status === "Dying", "Ilse is dying");
    force(20);
    await ct({ action: "stabilize", id: A, recordId: helper.id });
    assert((await entry(A)).health.status === "Unconscious", "steadied: unconscious");
    await ct({ action: "damage", id: A, amount: 1 });
    assert((await entry(A)).health.status === "Dying" && !raw(A).stabilized, `a steadied character stabbed is dying again: ${(await entry(A)).health.status}`);
    // 5 (Descending Darkness unchanged): Health goes below 0.
    assert(agent.records.get(ilse.id).data.hp.wounds === hpTotal + 1, `Descending Darkness keeps negative Health: ${agent.records.get(ilse.id).data.hp.wounds}`);
    done.push("4 damage ends Descending Darkness steadying");

    // 6. Ilse bleeds through a few rounds; the fight ends; in the next one she bleeds in round 1.
    for (let i = 0; i < 3; i += 1) await ct({ action: "round" });
    assert(raw(A).bleedRound >= 3, `bleeding marked round ${raw(A).bleedRound}`);
    await ct({ action: "end" });
    assert(raw(A).bleedRound === -1, `end resets the bleeding round: ${raw(A).bleedRound}`);
    const before = agent.records.get(ilse.id).data.hp.wounds;
    await ct({ action: "next" });
    assert((await round()) === 1 && (await active()) === A && agent.records.get(ilse.id).data.hp.wounds === before + 1, `the next fight's round 1: Ilse bleeds: ${before} -> ${agent.records.get(ilse.id).data.hp.wounds}`);
    done.push("6 ending a fight resets bleeding");
  } finally {
    await t.server.close?.();
  }
}

// --- D&D 5E (Kraken's own books under the 5E rules) ---
{
  const t = await table("D&D 5E", DD_BOOKS);
  try {
    const { tool, refused, agent, ct, view, entry, raw, last, said, force } = t;
    const build = async (name, cls, extra = {}) => tool("kraken_build_character", { owner: "Ann", spec: { name, species: "Human", class: cls, level: 3, scores: { strength: 10, dexterity: 14, constitution: 14, intelligence: 16, wisdom: 16, charisma: 10 }, ...extra } });
    const ilse = await build("Ilse", "Wizard", { spells: ["Ember Ray"], gear: [["Dagger", 1]] });
    const tomas = await build("Tomas", "Cleric", { spells: ["Blessing", "Ward of Faith"] });
    const mara = await build("Mara", "Wizard");
    const sentinel = agent.records.list({ type: "npc" }).find((record) => record.name === "Bone Sentinel");
    for (const who of [ilse, tomas, mara]) await ct({ action: "add", recordId: who.id });
    await ct({ action: "add", recordId: sentinel.id });
    const list = (await view()).entries;
    const id = (name) => list.find((item) => item.name === name).id;
    const [I, T, M, S] = ["Ilse", "Tomas", "Mara", "Bone Sentinel"].map(id);
    const hp = (record) => agent.records.get(record.id).data.hp;
    const saves = (record) => agent.records.get(record.id).data.deathsaves;

    // 5. Hit points stop at 0; damage at 0 is a failed save; instant death on leftover >= maximum.
    const max = hp(ilse).total;
    await ct({ action: "damage", id: I, amount: max - 1 });
    await ct({ action: "damage", id: I, amount: 3 });
    assert(hp(ilse).wounds === max && (await entry(I)).health.status === "Dying" && saves(ilse).failure === 0, `dropped to 0 (2 left over): wounds ${hp(ilse).wounds}/${max}, ${JSON.stringify(saves(ilse))}`);
    await ct({ action: "damage", id: I, amount: 1 });
    assert(hp(ilse).wounds === max && saves(ilse).failure === 1 && (await entry(I)).health.status === "Dying", `1 damage at 0: one failure, not dead: ${JSON.stringify(saves(ilse))} ${(await entry(I)).health.status}`);
    done.push("5 5E hit points stop at 0");

    // 4 (5E). Three successes: stable; then damage: dying again (one failure), death saves roll again.
    force(15);
    await ct({ action: "death-save", id: I });
    force(15);
    await ct({ action: "death-save", id: I });
    force(15);
    await ct({ action: "death-save", id: I });
    assert((await entry(I)).health.status === "Unconscious", "three successes: stable");
    await ct({ action: "damage", id: I, amount: 1 });
    assert((await entry(I)).health.status === "Dying" && saves(ilse).failure === 1 && saves(ilse).success === 0 && !raw(I).stabilized, `a stable character hit is dying again: ${JSON.stringify(saves(ilse))}`);
    force(12);
    const again = (await ct({ action: "death-save", id: I })).deathSave;
    assert(again.deathsaves.success === 1, `death saves roll again: ${JSON.stringify(again)}`);
    // Instant death: at 0, damage of at least the maximum.
    await ct({ action: "damage", id: I, amount: max });
    assert((await entry(I)).health.status === "Dead", "damage of the maximum at 0 kills");
    // From full: the leftover after 0 decides (max - 1 left over: Dying; then a fresh hit of 2 * max: Dead).
    await ct({ action: "damage", id: M, amount: hp(mara).total * 2 - 1 });
    assert((await entry(M)).health.status === "Dying", `leftover below the maximum: Dying: ${(await entry(M)).health.status}`);
    await ct({ action: "heal", id: M, amount: 99 });
    await ct({ action: "damage", id: M, amount: hp(mara).total * 2 });
    assert((await entry(M)).health.status === "Dead", "leftover of the maximum: Dead");
    done.push("4 damage ends 5E stability", "5 instant death by leftover");

    // 7. Concentration: Tomas blesses the sentinel, then wards it (one spell held at a time).
    const conc = () => String(agent.records.get(tomas.id).data.concentration ?? "");
    const effectsBy = async () => (await view()).entries.flatMap((item) => item.effects.map((effect) => `${item.name}:${effect.label.split(";")[0]}`));
    await ct({ action: "target", id: T, targetId: S, on: true });
    await ct({ action: "cast", recordId: tomas.id, power: "Blessing" });
    assert(conc() === "Blessing" && (await effectsBy()).includes("Bone Sentinel:Blessing"), `Blessing held: ${conc()} ${await effectsBy()}`);
    await ct({ action: "cast", recordId: tomas.id, power: "Ward of Faith" });
    let fx = await effectsBy();
    assert(conc() === "Ward of Faith" && !fx.some((label) => /Blessing/.test(label)) && fx.includes("Bone Sentinel:Ward of Faith"), `a new concentration spell ends the last one's effects: ${fx}`);
    // A big hit (half of it over 10 where his hit points allow): DC from the damage, saved on a 20.
    const tMax = hp(tomas).total;
    force(20);
    await ct({ action: "damage", id: T, amount: Math.min(30, tMax - 1) });
    let save = last(/^\[SAVE\] Concentration: Ward of Faith/)?.roll;
    const wantDc = Math.max(10, Math.floor(Math.min(30, tMax - 1) / 2));
    assert(save && new RegExp(`DC ${wantDc}\\]`).test(save.label) && /SUCCESS/.test(save.label) && conc() === "Ward of Faith", `a Constitution save at DC ${wantDc}, kept: ${save?.label}`);
    await ct({ action: "heal", id: T, amount: 99 });
    // A small hit: DC 10, failed on a 1: the ward goes.
    force(1);
    await ct({ action: "damage", id: T, amount: 2 });
    save = last(/^\[SAVE\] Concentration: Ward of Faith/)?.roll;
    fx = await effectsBy();
    assert(/DC 10\]/.test(save.label) && /FAILURE/.test(save.label) && conc() === "" && !fx.some((label) => /Ward of Faith/.test(label)) && said(/Tomas loses concentration on Ward of Faith/), `a failed save ends concentration and its effects: ${save.label} ${fx}`);
    // Falling ends it with no save.
    await ct({ action: "heal", id: T, amount: 99 });
    await ct({ action: "cast", recordId: tomas.id, power: "Blessing" });
    assert(conc() === "Blessing", "Blessing again");
    const savesBefore = agent.chatLog(300).filter((line) => /Concentration/.test(line.roll?.label ?? "")).length;
    await ct({ action: "damage", id: T, amount: hp(tomas).total });
    fx = await effectsBy();
    assert((await entry(T)).health.status === "Dying" && conc() === "" && !fx.some((label) => /Blessing/.test(label)) && agent.chatLog(300).filter((line) => /Concentration/.test(line.roll?.label ?? "")).length === savesBefore, `dropping to 0 ends concentration without a save: ${conc()} ${fx}`);
    // Ended from the cards' End (the sheet's concentration cleared): its effects go too.
    await ct({ action: "heal", id: T, amount: 99 });
    await ct({ action: "cast", recordId: tomas.id, power: "Blessing" });
    assert((await effectsBy()).includes("Bone Sentinel:Blessing"), "Blessing held again");
    await tool("kraken_cards", { action: "end-concentration", id: tomas.id });
    fx = await effectsBy();
    assert(conc() === "" && !fx.some((label) => /Blessing/.test(label)), `ending it from the cards ends its effects: ${fx}`);
    done.push("7 concentration: replaced, Constitution saves, ends on falling, ended from the cards");

    // 8. Resistance, immunity, vulnerability (the sentinel's record) against a fresh fighter's dagger.
    const vera = await build("Vera", "Fighter", { gear: [["Dagger", 1]] });
    await ct({ action: "add", recordId: vera.id });
    const V = (await view()).entries.find((item) => item.name === "Vera").id;
    const dagger = Object.entries(agent.records.get(vera.id).data.attacks).find(([, attack]) => attack.name === "Dagger");
    assert(dagger && /piercing/i.test(dagger[1].dmgtype ?? ""), `Vera's dagger pierces: ${JSON.stringify(dagger)}`);
    await ct({ action: "target", id: V, targetId: S, on: true });
    const dealt = async (fields, die) => {
      agent.records.update(sentinel.id, { data: { damageresistances: "", damageimmunities: "", damagevulnerabilities: "", ...fields } }, agent.seat);
      await ct({ action: "update", id: S, patch: { wounds: 0 } });
      force(18);
      await ct({ action: "attack", recordId: vera.id, weapon: dagger[0] });
      force(die);
      const result = (await ct({ action: "damage-roll", recordId: vera.id, weapon: dagger[0] })).damage;
      return { rolled: result.total, wounds: raw(S).wounds };
    };
    const plain = await dealt({}, 3);
    const resisted = await dealt({ damageresistances: "bludgeoning, piercing, and slashing from nonmagical attacks" }, 3);
    const immune = await dealt({ damageimmunities: "poison; piercing" }, 3);
    const vulnerable = await dealt({ damagevulnerabilities: "piercing" }, 3);
    assert(plain.wounds === plain.rolled && resisted.wounds === Math.floor(plain.rolled / 2) && immune.wounds === 0 && vulnerable.wounds === plain.rolled * 2, `piercing ${plain.rolled}: plain ${plain.wounds}, resisted ${resisted.wounds}, immune ${immune.wounds}, vulnerable ${vulnerable.wounds}`);
    agent.records.update(sentinel.id, { data: { damageresistances: "", damageimmunities: "", damagevulnerabilities: "" } }, agent.seat);
    // An effect's RESIST: piercing halves it too.
    await ct({ action: "effect", id: S, effect: { label: "Warded; RESIST: piercing" } });
    const warded = await dealt({}, 3);
    assert(warded.wounds === Math.floor(plain.rolled / 2), `RESIST: piercing halves ${plain.rolled}: ${warded.wounds}`);
    await ct({ action: "effect-remove", id: S, effectId: (await entry(S)).effects.find((effect) => /Warded/.test(effect.label)).id });
    await ct({ action: "update", id: S, patch: { wounds: 0 } });
    done.push("8 resistance, immunity and vulnerability");

    // 8 (saves). Paralyzed: Dexterity and Strength fail on a 20; Wisdom does not.
    await ct({ action: "effect", id: S, effect: { label: "Held; Paralyzed" } });
    force(20);
    const dex = (await ct({ action: "save", id: S, attribute: "dexterity", cl: 5 })).save;
    force(20);
    const str = (await ct({ action: "save", id: S, attribute: "strength", cl: 5 })).save;
    force(20);
    const wis = (await ct({ action: "save", id: S, attribute: "wisdom", cl: 5 })).save;
    assert(dex.success === false && str.success === false && wis.success === true && /AUTOMATIC FAILURE/.test(last(/^\[SAVE\] Strength/).roll.label), `paralyzed: Dex ${dex.success}, Str ${str.success}, Wis ${wis.success}`);
    done.push("8 the paralyzed fail Strength and Dexterity saves");

    // 10. A spell whose damage has a part with no dice and a minus bonus: "1d8-2", one slot.
    agent.records.create({ type: "spell", name: "Test Hex", data: { level: 1, duration: "Instantaneous", actions: { "id-00001": { type: "cast", targeting: "targets", targetingval: 1 }, "id-00002": { type: "damage", damagelist: { "id-00001": { dice: "1d8", type: "necrotic" }, "id-00002": { dice: "", bonus: -2, type: "necrotic" } } } } } }, agent.seat);
    const nova = await build("Nova", "Wizard");
    await ct({ action: "add", recordId: nova.id });
    const N = (await view()).entries.find((item) => item.name === "Nova").id;
    await ct({ action: "target", id: N, targetId: S, on: true });
    const usedBefore = agent.records.get(nova.id).data.slots.l1.used;
    force(6);
    await ct({ action: "cast", recordId: nova.id, power: "Test Hex" });
    const hex = last(/^\[DAMAGE\] Test Hex/)?.roll;
    assert(hex?.formula === "1d8-2" && hex.total === 4 && agent.records.get(nova.id).data.slots.l1.used === usedBefore + 1, `Test Hex rolls 1d8-2 = 4, one slot: ${hex?.formula} ${hex?.total} used ${agent.records.get(nova.id).data.slots.l1.used}`);
    // A refused cast keeps the slots.
    const before = JSON.stringify(agent.records.get(nova.id).data.slots);
    const nope = await refused("kraken_combat", { action: "cast", recordId: nova.id, power: "No Such Spell" });
    assert(nope && JSON.stringify(agent.records.get(nova.id).data.slots) === before, `a refused cast spends nothing: ${nope}`);
    done.push("10 a minus bonus without dice rolls, one slot");

    // 11. The sheet cannot set used slots or death saves below 0.
    await tool("kraken_character_edit", { id: nova.id, changes: [{ path: "slots.l1.used", value: -5 }, { path: "deathsaves.failure", value: -3 }, { path: "deathsaves.success", value: -1 }] });
    const data = agent.records.get(nova.id).data;
    assert(data.slots.l1.used === 0 && data.deathsaves.failure === 0 && data.deathsaves.success === 0, `clamped at 0: ${JSON.stringify(data.slots.l1)} ${JSON.stringify(data.deathsaves)}`);
    const { derive } = await import("../shared/dnd5e/rules.mjs");
    const derived = derive({ ...structuredClone(data), slots: { l1: { max: 4, used: -7 } }, deathsaves: { success: -2, failure: -9 } });
    assert(derived.slots.l1.used === 0 && derived.deathsaves.success === 0 && derived.deathsaves.failure === 0, `derive clamps too: ${JSON.stringify(derived.slots.l1)} ${JSON.stringify(derived.deathsaves)}`);
    done.push("11 used slots and death saves never negative");
  } finally {
    await t.server.close?.();
  }
}

// --- Apeira Astra: an attack with no targets; hits kept over a restart ---
{
  const t = await table("Apeira Astra", ["Apeira Astra Crew Handbook", "Apeira Astra Threat Dossier"]);
  try {
    const { tool, agent, ct, view, raw, force } = t;
    const built = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Rook", origin: "Spacer", major: "Marine", majorSkills: ["Firearms", "Melee", "Athletics", "Zero-G"], minor: "Engineer", minorSkills: ["Mechanics", "Engineering"], gear: [["Carbine", 1]] } });
    const weapon = Object.keys(agent.records.get(built.id).data.attacks ?? {})[0];
    assert(weapon, "Rook has a weapon");
    const threat = agent.records.list({ type: "npc" })[0];
    await ct({ action: "add", recordId: built.id });
    await ct({ action: "add", recordId: threat.id });
    const list = (await view()).entries;
    const rook = list.find((item) => item.name === "Rook").id;
    const foe = list.find((item) => item.id !== rook).id;
    // An attack at no one, then a target, then damage: it lands.
    force(6, 6);
    await ct({ action: "attack", recordId: built.id, weapon });
    assert(raw(rook).effectOn === null, `no targets: no hit list: ${JSON.stringify(raw(rook).effectOn)}`);
    await ct({ action: "target", id: rook, targetId: foe, on: true });
    force(6, 6, 6, 6, 6, 6);
    const dmg = (await ct({ action: "damage-roll", recordId: built.id, weapon })).damage;
    assert(dmg.targets.some((item) => item.target === raw(foe).name), `damage after an untargeted attack lands on the target: ${JSON.stringify(dmg)}`);
    // A miss, then the host restarts: damage still misses.
    agent.dice.clearForced();
    force(1, 1);
    await ct({ action: "attack", recordId: built.id, weapon });
    assert(raw(rook).effectOn && !(foe in raw(rook).effectOn), `a miss: ${JSON.stringify(raw(rook).effectOn)}`);
    const revived = createCombat({ saved: JSON.parse(JSON.stringify(agent.combat.persisted())), table: () => agent });
    const kept = revived.entries().find((item) => item.id === rook);
    assert(kept.effectOn && typeof kept.effectOn === "object" && !(foe in kept.effectOn), `the hit list survives a restart: ${JSON.stringify(kept.effectOn)}`);
    done.push("9 Astra: untargeted attacks and restarts");
  } finally {
    await t.server.close?.();
  }
}

// --- Castles & Crusades (made-up records): stability, NPC daily uses, durations ---
{
  const t = await table(null, []);
  try {
    const { agent, ct, refused, raw, force } = t;
    agent.records.create({ type: "siegegame", name: "Rules", data: { options: { SIEGE_INIT_STAT: "none", SIEGE_MELEE_DMG_STAT: "none", SIEGE_RANGED_DMG_STAT: "none" } } }, agent.seat);
    const hero = agent.records.create({ type: "character", name: "Aldric", owner: "a test player", visibility: "owner", data: { hp: { total: 10, wounds: 0 }, ac: { total: 15 }, level: 3, attributes: { constitution: { score: 10 } } } }, agent.seat);
    const witch = agent.records.create(
      {
        type: "npc",
        name: "Hag",
        data: {
          hd: "5d8",
          hptotal: 30,
          ac: { total: 14 },
          powers: {
            p1: { name: "Stiffen", powertype: "Spell", noslot: 1, uses: 1, save: "constitution", failedeffect: "Paralyzed", failedduration: "1 minute" },
            p2: { name: "Slow", powertype: "Spell", noslot: 1, uses: 0, duration: "1 minute", effect: "Slowed" },
          },
        },
      },
      agent.seat,
    );
    await ct({ action: "add", recordId: hero.id });
    const view = await ct({ action: "add", recordId: witch.id });
    const id = (name) => view.entries.find((item) => item.name === name).id;
    const [H, W] = [id("Aldric"), id("Hag")];
    await ct({ action: "target", id: W, targetId: H });

    // 10 (C&C). An action that does not exist spends no daily use.
    const no = await refused("kraken_combat", { action: "cast", id: W, power: "p1", castAction: "nope" });
    assert(no && /No such action/.test(no) && !raw(W).used?.p1, `no use spent on a missing action: ${no} ${JSON.stringify(raw(W).used)}`);
    // 12. Stiffen fails (a 1): Paralyzed for 1 minute = 6 rounds; Slow (1 minute) is 6 rounds too.
    force(1);
    let result = await ct({ action: "cast", id: W, power: "p1" });
    const paralyzed = result.combat.entries.find((item) => item.id === H).effects.find((effect) => effect.label === "Paralyzed");
    assert(paralyzed?.duration === 10 && raw(W).used.p1 === 1, `failed effect 1 minute = 10 rounds (FG's count), one use: ${JSON.stringify(paralyzed)} ${JSON.stringify(raw(W).used)}`);
    result = await ct({ action: "cast", id: W, power: "p2" });
    const slowed = result.combat.entries.find((item) => item.id === H).effects.find((effect) => effect.label === "Slowed");
    assert(slowed?.duration === 6, `spell effect 1 minute = 6 rounds: ${JSON.stringify(slowed)}`);
    done.push("10 C&C daily uses only for real actions");

    // 4 (C&C). Dying at -8, healed 1 (stabilised at -7), stabbed: no longer stable.
    await ct({ action: "damage", id: H, amount: 18 });
    await ct({ action: "heal", id: H, amount: 1 });
    assert(raw(H).stabilized === true, "healing the dying stabilises");
    await ct({ action: "damage", id: H, amount: 1 });
    assert(raw(H).stabilized === false, "damage to the stabilised ends it");
    done.push("4 damage ends C&C stability");
  } finally {
    await t.server.close?.();
  }
}

console.log(`ok combat-fixes: ${done.join("; ")}`);
process.exit(0);
