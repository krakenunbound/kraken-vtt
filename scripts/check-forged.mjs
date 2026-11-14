// Forged in the Dark (the Blades in the Dark SRD) with fixed dice: d6 pools
// read by their highest die (two 6s a critical; zero dice two keeping the
// lowest, never a critical), action rolls with position and effect,
// assistance and pushing (their stress), the Devil's Bargain, resistance
// (6 less the highest; a critical clears 1), stress past the last box is
// trauma (the fourth retires), harm by level (full rows move up; past the
// top is fatal) and its penalties, armor boxes and load, the healing clock,
// xp (a desperate roll, the tracks, advances, the party's award), the crew
// (creation, payoff, heat and the wanted level, entanglements, Tier and
// hold, upgrades), downtime (activities and their cost, the vice roll and
// overindulging, training, projects, reducing heat, acquiring an asset),
// the engagement roll, group actions, and the clocks (ticks by effect,
// linked, racing, tug-of-war). Run from Kraken's own books (npm run
// build-games first).
//   node scripts/check-forged.mjs
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as rules from "../shared/forged/rules.mjs";

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
{
  assert(rules.outcome([6, 6, 2], 3).result === "critical" && rules.outcome([6, 3], 2).result === "success" && rules.outcome([5, 1], 2).result === "partial" && rules.outcome([3, 2, 1], 3).result === "bad", "the highest die: two 6s critical, 6 success, 4/5 partial, 1-3 bad");
  assert(rules.outcome([6, 6], 0).result === "success" && rules.outcome([2, 6], 0).result === "bad" && rules.outcome([2, 6], 0).highest === 2, "zero dice: two kept lowest, never a critical");
  assert(rules.poolFormula(3) === "3d6kh1" && rules.poolFormula(0) === "2d6kl1" && rules.poolFormula(-1) === "2d6kl1", "the pool's formula");
  assert(rules.resistance([4, 1], 2).stress === 2 && rules.resistance([6], 1).stress === 0 && rules.resistance([6, 6], 2).stress === -1 && rules.resistance([1, 3], 0).stress === 5, "resistance: 6 less the highest, a critical clears 1, zero dice the lowest");
  assert(rules.actionPool({ rating: 2, assist: true, pushDice: true }) === 4 && rules.actionPool({ rating: 1, bargain: true, penalty: 1 }) === 1, "the pool: rating, assist, push or bargain, harm -1d");
  let threw = false;
  try {
    rules.actionPool({ rating: 1, pushDice: true, bargain: true });
  } catch {
    threw = true;
  }
  assert(threw, "push and a Devil's Bargain: one or the other");
  assert(rules.pushStress({ pushDice: true, pushEffect: true }) === 4 && rules.ASSIST_STRESS === 1, "pushing costs 2 a benefit; assisting 1");
  assert(rules.ticksFor("success", "standard") === 2 && rules.ticksFor("critical", "standard") === 3 && rules.ticksFor("partial", "limited") === 1 && rules.ticksFor("bad", "great") === 0 && rules.ticksFor("success", "zero") === 0, "clock ticks by effect: limited 1, standard 2, great 3; a critical one level more");
  const pc = { stress: 8, traumas: [] };
  const over = rules.addStress(pc, 2);
  assert(over.trauma && pc.stress === 0 && pc.traumaPending === 1, `the last stress box is trauma, stress back to 0: ${JSON.stringify(over)}`);
  for (const condition of ["Cold", "Haunted", "Reckless"]) rules.markTrauma(pc, condition);
  assert(rules.markTrauma(pc, "Vicious").retired && pc.traumas.length === 4, "the fourth trauma retires");
  const hurt = {};
  rules.addHarm(hurt, 1, "Battered");
  rules.addHarm(hurt, 1, "Drained");
  const moved = rules.addHarm(hurt, 1, "Bruised Ribs");
  assert(moved.level === 2 && hurt.harm[2][0] === "Bruised Ribs", `a full row moves harm up: ${JSON.stringify(hurt.harm)}`);
  assert(rules.harmPenalties(hurt).lessEffect && rules.harmPenalties(hurt).minusDice === 1 && !rules.harmPenalties(hurt).needHelp, "penalties: less effect, -1d");
  rules.addHarm(hurt, 3, "Shot in the Chest");
  const fatal = rules.addHarm(hurt, 3, "Stabbed Again");
  assert(fatal.fatal && hurt.fatal === "Stabbed Again" && rules.derive({ ...hurt }).status === "Dead", "past the top row: fatal");
  assert(rules.harmPenalties({ harm: { 1: ["", ""], 2: ["", ""], 3: ["Broken Leg"] }, abilities: [{ name: "Tough as nails" }] }).needHelp === false, "Tough as nails: severe harm only -1d");
  const healing = { harm: { 1: ["Battered", ""], 2: ["Deep Cut", ""], 3: ["Broken Leg"] }, healing: 2 };
  const healed = rules.tickHealing(healing, 3);
  assert(healed.healed === 1 && healing.healing === 1 && healing.harm[1][0] === "Deep Cut" && healing.harm[2][0] === "Broken Leg" && !healing.harm[3][0], `the healing clock fills: every harm a level less, the rest rolls over: ${JSON.stringify(healing)}`);
  assert(rules.healingSize({ abilities: [{ name: "Vigorous" }] }) === 3, "Vigorous: a 3-clock");
  const learner = { xp: { playbook: 7 } };
  assert(rules.markXp(learner, "playbook", 1).advanced === 1 && learner.xp.playbook === 0 && learner.advances.playbook === 1, "a full playbook track (8): an advance");
  assert(rules.markXp(learner, "prowess", 6).advanced === 1, "an attribute track: 6");
  const crew = rules.newCrew({ name: "Test" });
  assert(crew.tier === 0 && crew.hold === "strong" && crew.coin === 2 && crew.rep === 0, "a new crew: Tier 0, strong hold, 2 coin");
  crew.heat = 7;
  const hot = rules.addHeat(crew, 4);
  assert(hot.wanted === 1 && hot.heat === 2 && hot.raised === 1, "heat 9: a wanted level, the excess rolls over");
  assert(rules.scoreHeat({ exposure: 4, killing: true, highProfile: true }) === 7 && rules.scoreRep(0, 2) === 4 && rules.scoreRep(3, 1) === 0 && rules.scoreRep(0, 3, true) === 0, "heat and rep from a score");
  assert(rules.entanglement(2, "bad").includes("The Usual Suspects") && rules.entanglement(5, "success").join() === "Show of Force" && rules.entanglement(7, "critical").join() === "Arrest", "the entanglement table by heat");
  const growing = { ...rules.newCrew(), rep: 12, coin: 9 };
  assert(rules.develop(growing).tier === 1 && growing.hold === "weak" && growing.coin === 1 && growing.rep === 0, "a full rep tracker buys Tier I for 8 coin; hold weak");
  growing.rep = 12;
  assert(rules.develop(growing).hold === "strong" && growing.tier === 1, "then a weak hold becomes strong");
  assert(rules.repToFill({ turf: 3 }) === 9 && rules.vaultOf({ upgrades: { Vault: 1 } }) === 8, "turf lowers the rep needed; the vault holds 8");
  assert(rules.lowestAttribute({ actions: { hunt: 1, skirmish: 2, prowl: 1, attune: 0 } }) === 0, "the vice roll's dice: the lowest attribute");
}
console.log("rules ok");

// --- At the table ---------------------------------------------------------------
const server = createTableServer({ ruleset: "Forged in the Dark" });
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
const forged = (id, action, args = {}) => tool("kraken_forged", id ? { id, action, args } : { action, args });
try {
  for (const name of ["Forged in the Dark Scoundrel's Handbook", "Forged in the Dark Game Master's Guide", "The Brine Street Job"]) importModule(agent.records, agent.seat, book(name));
  const count = (type) => agent.records.list({ type }).length;
  const groups = new Set(agent.records.list({ type: "forgedtable" }).map((record) => record.data.group));
  assert(count("playbook") === 7 && count("crewtype") === 6 && agent.records.list({ type: "item" }).filter((item) => item.data.standard).length === 16, `the books' records: ${count("playbook")} playbooks, ${count("crewtype")} crew types`);
  assert(["heritages", "backgrounds", "vices", "traumas", "upgrades", "claims", "abilities", "crewabilities", "factions", "clocks"].every((group) => groups.has(group)), `the tables: ${[...groups].join(", ")}`);
  assert(count("npc") >= 15, `cohorts and the score's people: ${count("npc")}`);
  const abilities = agent.records.list({ type: "forgedtable" }).find((record) => record.data.group === "abilities");
  assert(Object.keys(abilities.data.rows).length === 42, "the SRD's 42 example special abilities");

  // Character creation: four dots exactly, none above 2.
  const spec = { name: "Silas Venn", playbook: "Enforcer", heritage: "Canal-born", heritageDetail: "Barge folk", background: "Military", backgroundDetail: "Marine deserter", dots: { skirmish: 0, prowl: 1, wreck: 1, hunt: 1, sway: 1 }, ability: "Battleborn", friend: "Old Pell", rival: "Sergeant Danna Vey", vice: "Gambling", viceDetail: "Dice", purveyor: "The Drowned Bell", alias: "Hammer", look: "Big, scarred, quiet" };
  assert(/four action dots/.test((await refused("kraken_build_character", { spec: { ...spec, dots: { prowl: 1 } } })) ?? ""), "four dots exactly");
  assert(/above 2/.test((await refused("kraken_build_character", { spec: { ...spec, dots: { skirmish: 1, prowl: 1, wreck: 1, hunt: 1 } } })) ?? ""), "no action above 2 at creation");
  const built = await tool("kraken_build_character", { owner: "Ann", spec });
  const silas = built.id;
  assert(built.actions.skirmish === 2 && built.actions.command === 1 && built.actions.prowl === 1 && built.attributes.insight === 1 && built.attributes.prowess === 3 && built.attributes.resolve === 2, `the Enforcer's dots and four more; attributes by dotted actions: ${JSON.stringify(built.attributes)}`);
  assert(built.abilities.join() === "Battleborn" && built.friends.find((friend) => friend.name === "Old Pell").bond === "friend" && built.friends.find((friend) => friend.name === "Sergeant Danna Vey").bond === "rival", "a special ability, a friend and a rival");
  const second = await tool("kraken_build_character", { owner: "Bo", spec: { name: "Wren", playbook: "Burglar", heritage: "Far Isles", background: "Underworld", dots: { finesse: 1, survey: 1, attune: 1, tinker: 1 }, vice: "Pleasure", purveyor: "The Velvet Room" } });
  const wren = second.id;
  assert(second.abilities.join() === "Infiltrator", "no ability named: the playbook's first");

  // Action rolls: Skirmish 2, assisted (+1d, 1 stress for the helper), desperate: a critical, and 1 Prowess xp.
  force(6, 6, 3);
  const crit = await forged(silas, "action-roll", { action: "skirmish", position: "desperate", effect: "standard", assist: wren });
  assert(crit.result === "critical" && crit.dice === 3 && data(wren).stress === 1 && crit.xp.track === "prowess" && data(silas).xp.prowess === 1, `a critical, assisted, desperate: ${JSON.stringify(crit)}`);
  assert(said(/\[ACTION\] Skirmish 3d · Desperate \/ Standard · assisted by Wren/) && said(/CRITICAL/), "the roll's card in chat: action, dice, position and effect");
  // Zero dice: two dice, the lowest; never a critical.
  force(6, 6);
  const zero = await forged(silas, "action-roll", { action: "study" });
  assert(zero.dice === 0 && zero.result === "success" && zero.position === "risky" && zero.effect === "standard", `zero dice, two 6s: a success, not a critical: ${JSON.stringify(zero)}`);
  force(2, 5);
  assert((await forged(silas, "action-roll", { action: "study" })).result === "bad", "zero dice: the lower die (2) counts");
  // Pushing: +1d and +1 effect for 4 stress; a Devil's Bargain +1d for free.
  force(4, 1, 2);
  const pushed = await forged(silas, "action-roll", { action: "skirmish", pushDice: true, pushEffect: true, effect: "limited" });
  assert(pushed.dice === 3 && pushed.effect === "standard" && pushed.stress === 4 && data(silas).stress === 4 && pushed.result === "partial", `pushed: 3 dice, standard effect, 4 stress: ${JSON.stringify(pushed)}`);
  assert(/one or the other/.test((await refused("kraken_forged", { id: silas, action: "action-roll", args: { action: "skirmish", pushDice: true, bargain: "Collateral damage" } })) ?? ""), "push or bargain, not both");
  force(1, 1, 5);
  const bargain = await forged(silas, "action-roll", { action: "skirmish", bargain: "The crew takes +1 heat" });
  assert(bargain.dice === 3 && data(silas).stress === 4, "a Devil's Bargain: +1d, no stress");
  // A clock ticked by the effect: a standard success, two segments; great, three.
  const vault = (await tool("kraken_clocks", { action: "add", name: "The Vault Door", segments: 4 })).clock;
  force(6, 2);
  const ticked = await forged(silas, "action-roll", { action: "skirmish", effect: "standard", clock: vault.id });
  assert(ticked.clock.filled === 2, `a standard effect ticks 2: ${JSON.stringify(ticked.clock)}`);
  force(6, 6);
  const full = await forged(silas, "action-roll", { action: "skirmish", effect: "standard", clock: vault.id });
  assert(full.clock.filled === 4 && full.clock.full && said(/The Vault Door: 4\/4.*It is full!/), "a critical: one level more; the clock fills and says so");

  // Resistance: Prowess 3d, 6 less the highest; a critical clears 1.
  force(4, 2, 1);
  const resisted = await forged(silas, "resist", { attribute: "prowess", consequence: "a knife in the ribs" });
  assert(resisted.dice === 3 && resisted.stress === 2 && data(silas).stress === 6, `resist: 6 - 4 = 2 stress: ${JSON.stringify(resisted)}`);
  force(6, 6, 1);
  assert((await forged(silas, "resist", { attribute: "prowess" })).stress === -1 && data(silas).stress === 5, "a critical resistance clears 1 stress");
  // Stress past the last box: trauma, taken out, back with 0 stress.
  force(1, 1, 1);
  const traumatic = await forged(silas, "resist", { attribute: "prowess" });
  assert(traumatic.trauma && data(silas).stress === 0 && data(silas).traumaPending === 1 && said(/\[TRAUMA\] Silas Venn/), `5 + 5 stress: trauma: ${JSON.stringify(traumatic)}`);
  await forged(silas, "trauma", { condition: "Reckless" });
  assert(data(silas).traumas.join() === "Reckless" && !data(silas).traumaPending, "a trauma condition marked");

  // Harm: penalties on the next roll; severe harm needs help.
  await forged(silas, "harm", { level: 2, text: "Deep Cut" });
  await forged(silas, "harm", { level: 1, text: "Battered" });
  force(5);
  const hurtRoll = await forged(silas, "action-roll", { action: "skirmish" });
  assert(hurtRoll.dice === 1 && hurtRoll.effect === "limited", `moderate harm -1d, lesser harm less effect: ${JSON.stringify(hurtRoll)}`);
  await forged(silas, "harm", { level: 3, text: "Broken Leg" });
  assert(/need help/.test((await refused("kraken_forged", { id: silas, action: "action-roll", args: { action: "skirmish" } })) ?? ""), "severe harm: needs help");
  force(4, 4);
  assert((await forged(silas, "action-roll", { action: "skirmish", assist: wren })).dice === 2, "assisted through severe harm: 2 + 1 - 1");
  // Armor: only when carried; one box a load; a new load brings it back.
  assert(/not carrying Armor/.test((await refused("kraken_forged", { id: silas, action: "armor", args: { kind: "armor" } })) ?? ""), "no armor carried");
  await forged(silas, "load", { load: "normal" });
  const armorKey = Object.entries(data(silas).inventorylist).find(([, item]) => item.name === "Armor")[0];
  await forged(silas, "item", { key: armorKey, carried: true });
  await forged(silas, "armor", { kind: "armor" });
  assert(data(silas).armor.armor === 1 && /used/.test((await refused("kraken_forged", { id: silas, action: "armor", args: { kind: "armor" } })) ?? ""), "the armor box is marked once");
  await forged(silas, "armor", { kind: "special" });
  assert(data(silas).armor.special === 1, "Battleborn uses special armor");
  const heavyKey = Object.entries(data(silas).inventorylist).find(([, item]) => item.name === "A large weapon")[0];
  const cudgel = Object.entries(data(silas).inventorylist).find(([, item]) => item.name === "Scale-plate vest")[0];
  await forged(silas, "item", { key: heavyKey, carried: true });
  assert(/past a normal load/.test((await refused("kraken_forged", { id: silas, action: "item", args: { key: cudgel, carried: true } })) ?? ""), "the load's limit: normal is 5");
  await forged(silas, "load", { load: "heavy" });
  assert(data(silas).armor.armor === 0 && data(silas).loadused === 0, "a new load: armor back, items unchecked");

  // XP: the playbook track fills: an advance, a new special ability; an action dot from an attribute advance.
  await forged(silas, "xp", { track: "playbook", amount: 8 });
  assert(data(silas).advances.playbook === 1, "a full playbook track: an advance");
  await forged(silas, "advance", { ability: "Mule" });
  assert(data(silas).abilities.some((ability) => ability.name === "Mule") && data(silas).loadlimits.normal === 7 && data(silas).advances.playbook === 0, "Mule taken: load limits 5/7/8");
  await forged(silas, "xp", { track: "prowess", amount: 5 });
  await forged(silas, "advance", { action: "skirmish" });
  assert(data(silas).actions.skirmish === 3 && data(silas).advances.prowess === 0, "a Prowess advance: Skirmish 3");
  await forged(silas, "xp", { track: "prowess", amount: 6 });
  assert(/at 3/.test((await refused("kraken_forged", { id: silas, action: "advance", args: { action: "skirmish" } })) ?? ""), "3 at most without the crew's Mastery");
  // The party sheet's award: playbook xp for each, not split.
  await tool("kraken_party_edit", { members: [silas, wren] });
  await tool("kraken_party_award", { xp: 2 });
  assert(data(silas).xp.playbook === 2 && data(wren).xp.playbook === 2, "the party's XP award marks each scoundrel's playbook track");

  // The crew: Shadows, its upgrades, its hunting grounds paid, a contact.
  assert(/no crew/i.test((await refused("kraken_forged", { action: "payoff", args: { coin: 2 } })) ?? ""), "no crew yet");
  const made = await forged(null, "crew-build", { name: "The Lamplighters", type: "Shadows", reputation: "Daring", lair: "A flooded chapel", huntingGrounds: "Brine Street", huntingOp: "Burglary", huntingFaction: "The Grey Lanterns", huntingDeal: "pay1", ability: "Second story", upgrades: ["Quarters", "Vault"], upgradeHelped: "The Widow's Hand", upgradeHarmed: "The Tallow Guild", contact: "Dowling", contactFriendly: "The Widow's Hand", contactUnfriendly: "The Harbor Watch" });
  const crew = made.crew;
  assert(crew.coin === 1 && crew.tier === 0 && crew.hold === "strong" && crew.upgrades["Hidden Lair"] === 1 && crew.upgrades.Vault === 1 && crew.vault === 8, `2 coin less 1 for the grounds; the type's upgrades and two more: ${JSON.stringify(crew.upgrades)}`);
  assert(crew.factions["The Widow's Hand"].status === 2 && crew.factions["The Tallow Guild"].status === -2 && crew.factions["The Harbor Watch"].status === -1 && crew.factions["The Tallow Guild"].tier === 2, `faction status from the creation: ${JSON.stringify(crew.factions)}`);
  assert(crew.abilities[0].name === "Second story" && crew.contacts.find((contact) => contact.name === "Dowling").favorite === 1, "a crew ability and a favorite contact");
  const view = await tool("kraken_party");
  assert(view.crew?.name === "The Lamplighters" || view.party?.crew?.name === "The Lamplighters" || JSON.stringify(view).includes("The Lamplighters"), "the party sheet shows the crew");

  // The score: the engagement roll (a stealth plan: Second story +1d), then payoff, heat, entanglement.
  force(4, 2, 1);
  const engaged = await forged(null, "engagement", { advantages: 1, disadvantages: 0, plan: "stealth", detail: "The canal dock at the tide's turn", target: "The Tallow Guild", targetTier: 2 });
  assert(engaged.dice === 3 && engaged.position === "risky" && (await tool("kraken_clocks")).score.position === "risky" && (await tool("kraken_clocks")).score.phase === "score", `the engagement: 1 + 1 + Second story = 3d, a 4: risky: ${JSON.stringify(engaged)}`);
  force(6, 1);
  assert((await forged(wren, "action-roll", { action: "prowl" })).position === "risky", "the next action roll takes the Score panel's position");

  const paid = await forged(null, "payoff", { coin: 6 });
  assert(paid.rep === 4 && paid.crew.rep === 4 && paid.crew.coin === 7, `rep 2 +2 for a Tier II target; coin: ${JSON.stringify(paid)}`);
  const heated = await forged(null, "heat", { exposure: 4, highProfile: true, killing: true });
  assert(heated.amount === 7 && heated.heat === 7 && heated.wanted === 0, `heat: 4 +1 +2 = 7: ${JSON.stringify(heated)}`);
  const hotter = await forged(null, "heat", { exposure: 2, hostileTurf: true });
  assert(hotter.heat === 1 && hotter.wanted === 1, "past 9: a wanted level, 1 left over");
  force(5);
  const tangled = await forged(null, "entanglement");
  assert(tangled.entanglements.join() === "Rivals,Unquiet Dead" && said(/\[ENTANGLEMENT\]/), `heat 1, wanted 1 (one die, a 5): ${JSON.stringify(tangled)}`);

  // Downtime: two activities each; a third costs coin or rep.
  await forged(null, "downtime-start");
  await forged(silas, "stress", { amount: 3 });
  force(5);
  const vice = await forged(silas, "vice", { overindulge: "Brag" });
  assert(vice.cleared === 3 && vice.overindulged && vice.choice === "Brag" && data(silas).stress === 0, `the vice roll: lowest attribute (Insight 1), a 5 clears 3 and overindulges: ${JSON.stringify(vice)}`);
  assert(agent.records.get("party").data.crew.heat === 3, "Brag: +2 heat");
  await forged(silas, "train", { track: "insight" });
  assert(data(silas).xp.insight === 1, "train: +1 xp");
  assert(/costs 1 coin/.test((await refused("kraken_forged", { id: silas, action: "train", args: { track: "resolve" } })) ?? ""), "a third activity costs coin or rep");
  await forged(silas, "coin", { amount: 2 });
  await forged(silas, "train", { track: "resolve", pay: "coin" });
  assert(data(silas).xp.resolve === 1 && data(silas).coins["id-00001"].amount === 1 && data(silas).downtime.used === 3, "a third activity paid with 1 coin");
  assert(/already/.test((await refused("kraken_forged", { id: silas, action: "train", args: { track: "insight", pay: "coin" } })) ?? ""), "a track is trained once a downtime");
  // An upgrade marked from a free box; the Shadows' Prowess Training: 2 xp.
  await forged(null, "crew-edit", { boxes: 1 });
  await forged(null, "upgrade", { name: "Workshop" });
  await forged(wren, "train", { track: "prowess" });
  assert(data(wren).xp.prowess === 2, "Prowess Training: 2 xp");
  // Recover: a healer of quality 2; the healing clock (4) ticks 3; then 2 more fill it.
  force(6, 1);
  await forged(silas, "recover", { quality: 2, pay: "rep" });
  assert(data(silas).healing === 3, `three segments: ${data(silas).healing}`);
  await forged(null, "downtime-start");
  force(4, 2);
  const mended = await forged(silas, "recover", { quality: 2 });
  assert(mended.healed === 1 && data(silas).healing === 1 && data(silas).harm[2][0] === "Broken Leg" && data(silas).harm[1][0] === "Deep Cut", `the clock fills: harm a level less, one segment rolls over: ${JSON.stringify(data(silas).harm)}`);
  // A long-term project, reduce heat, acquire an asset.
  const started = await forged(wren, "project", { name: "Map the Old Sewers", segments: 8 });
  force(6, 6);
  const worked = await forged(wren, "project", { project: started.project, action: "finesse" });
  assert(worked.filled === 5 && worked.result === "critical", `a critical: five segments: ${JSON.stringify(worked)}`);
  force(4, 1);
  const cooled = await forged(silas, "reduce-heat", { action: "skirmish" });
  assert(cooled.cleared === 2 && cooled.heat === 1, `a 4: -2 heat: ${JSON.stringify(cooled)}`);
  force(2, 6);
  const asset = await forged(wren, "acquire", { asset: "A fast gondola", pay: "coin" }).catch(async () => {
    await forged(wren, "coin", { amount: 1 });
    force(2, 6);
    return forged(wren, "acquire", { asset: "A fast gondola", pay: "coin" });
  });
  assert(asset.quality === 0 && asset.result === "bad", `Tier 0 (two dice, the lower 2): quality Tier -1, at least 0: ${JSON.stringify(asset)}`);
  // Downtime ends: a vice ignored costs stress equal to trauma.
  await forged(null, "downtime-end");
  assert(data(silas).stress === 0 || said(/Vices ignored/), "downtime ends");
  assert((await tool("kraken_clocks")).score.phase === "free", "back to free play");

  // Crew xp: 8 for an advance; each member's stash +Tier+2.
  await forged(null, "crew-xp", { amount: 8 });
  assert(agent.records.get("party").data.crew.advances === 1 && data(silas).stash === 2, "a crew advance; profits to every stash");
  await forged(null, "crew-advance", { ability: "Pack rats" });
  assert(agent.records.get("party").data.crew.abilities.some((ability) => ability.name === "Pack rats"), "a new crew ability");
  // Composed: +1 stress box for every member (three boxes).
  await forged(null, "crew-edit", { boxes: 3 });
  await forged(null, "upgrade", { name: "Composed" });
  assert(data(silas).stressmax === 10, `Composed: 10 stress boxes: ${data(silas).stressmax}`);

  // A group action: Prowl, the best result for all; the leader takes 1 stress for each 1-3.
  force(2, 1, 6);
  const group = await forged(null, "group", { leader: silas, members: [silas, wren], action: "prowl" });
  assert(group.result === "success" && group.stress === 1, `a group action: the best (6), 1 stress for the one who failed: ${JSON.stringify(group)}`);

  // Clocks: linked (locked until the first fills), racing, tug-of-war.
  const alert = (await tool("kraken_clocks", { action: "add", name: "Alert", segments: 4, kind: "danger" })).clock;
  const trapped = (await tool("kraken_clocks", { action: "add", name: "Trapped", segments: 4, after: alert.id })).clock;
  assert(trapped.locked && /locked/.test((await refused("kraken_clocks", { action: "tick", id: trapped.id })) ?? ""), "a linked clock waits");
  await tool("kraken_clocks", { action: "tick", id: alert.id, amount: 4 });
  assert(!(await tool("kraken_clocks")).clocks.find((clock) => clock.id === trapped.id).locked && said(/Trapped is open now/), "the linked clock opens");
  const escape = (await tool("kraken_clocks", { action: "add", name: "Escape", segments: 4 })).clock;
  const cornered = (await tool("kraken_clocks", { action: "add", name: "Cornered", segments: 6, rival: escape.id })).clock;
  assert(cornered.kind === "racing" && (await tool("kraken_clocks")).clocks.find((clock) => clock.id === escape.id).rival === cornered.id, "racing clocks race each other");
  await tool("kraken_clocks", { action: "tick", id: escape.id, amount: 4 });
  assert(said(/Escape finished before Cornered/), "the first full wins");
  const war = (await tool("kraken_clocks", { action: "add", name: "Turf War", segments: 6, kind: "tug" })).clock;
  await tool("kraken_clocks", { action: "tick", id: war.id, amount: 3 });
  assert((await tool("kraken_clocks", { action: "tick", id: war.id, amount: -2 })).clock.filled === 1, "a tug-of-war clock goes down too");
  const secret = (await tool("kraken_clocks", { action: "add", name: "Guild's Plan", segments: 8, kind: "faction", shown: false })).clock;
  assert(server.agent.clocks().view({ role: "player", name: "Ann" }).clocks.every((clock) => clock.id !== secret.id), "a GM-only clock is not sent to players");

  // No initiative in this game; no levels either.
  await tool("kraken_combat", { action: "add", entry: { name: "Guard", faction: "foe" } });
  assert(/no initiative/.test((await refused("kraken_combat", { action: "init", which: "all" })) ?? ""), "the tracker's initiative is refused");
  assert(/no levels/.test((await refused("kraken_level_up", { id: silas })) ?? ""), "no levels");
  // Retirement at the fourth trauma.
  for (const condition of ["Cold", "Haunted", "Paranoid"]) await forged(silas, "trauma", { condition });
  assert(data(silas).status === "Retired" && said(/retires/), "the fourth trauma retires the scoundrel");
  console.log(`FORGED_OK ${checks} checks`);
} finally {
  await server.close?.();
}
process.exit(0);
