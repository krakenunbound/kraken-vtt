// Ironsworn and Starforged with fixed dice: the action roll (d6 + stat +
// adds, at most 10, against two d10: strong hit, weak hit, miss, matches; an
// action die cancelled by negative momentum), burning momentum (it becomes
// the score, then resets by the debilities marked), progress marked by rank
// and the progress roll, harm, stress and supply (past 0 off momentum;
// supply shared by the party), experience (classic from vows; Starforged
// from the legacy tracks) and Advance; then at the table, from Kraken's own
// books: a character from the wizard's spec, moves from the data with their
// outcomes applied (Face Danger, Swear an Iron Vow, Reach a Milestone,
// Fulfill Your Vow, Endure Harm), a foe on the tracker as a ranked progress
// track struck, then ended; the oracles (with "roll twice"); Delve's site
// tables; a parcel's supply and the party's experience; and Starforged: two
// paths, the starship and one more, Strike marking progress twice, Take
// Decisive Action from a bad spot, legacy experience. Run after
// npm run build-games.   node scripts/check-ironsworn.mjs
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as rules from "../shared/ironsworn/rules.mjs";

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
  const capped = rules.actionRoll({ actionDie: 5, challenge: [9, 9], stat: 3, adds: 4, momentum: 2 });
  assert(capped.score === 10 && capped.capped && capped.outcome === "strong" && capped.match, `5 + 3 + 4 is 10 at most, beating two 9s, a match: ${JSON.stringify(capped)}`);
  const tie = rules.actionRoll({ actionDie: 4, challenge: [6, 3], stat: 2 });
  assert(tie.score === 6 && tie.outcome === "weak" && !tie.match, "a tie goes to the challenge die: 6 against 6 and 3 is a weak hit");
  const miss = rules.actionRoll({ actionDie: 1, challenge: [8, 7], stat: 1 });
  assert(miss.outcome === "miss", "2 against 8 and 7 misses");
  const cancelled = rules.actionRoll({ actionDie: 3, challenge: [3, 1], stat: 2, momentum: -3 });
  assert(cancelled.cancelled && cancelled.score === 2 && cancelled.outcome === "weak", `an action die of 3 at momentum -3 counts 0: ${JSON.stringify(cancelled)}`);
  const burn = rules.actionRoll({ actionDie: 2, challenge: [7, 3], stat: 2, momentum: 8 });
  assert(burn.outcome === "weak" && burn.burnable && burn.burnOutcome === "strong", "momentum 8 could burn a weak hit (4 against 7 and 3) to a strong hit");
  assert(!rules.actionRoll({ actionDie: 6, challenge: [2, 1], stat: 3, momentum: 9 }).burnable, "nothing to gain: no burn");
  const progress = rules.progressRoll({ ticks: 25, challenge: [5, 8] });
  assert(progress.score === 6 && progress.outcome === "weak", "25 ticks are 6 boxes: a weak hit against 5 and 8");
  assert(rules.progressRoll({ ticks: 0, challenge: [3, 3], score: 10 }).outcome === "strong", "a cleared legacy track rolls as 10");
  const bad = rules.inBadSpot({ outcome: "strong", match: false });
  assert(bad.outcome === "weak" && rules.inBadSpot({ outcome: "weak" }).outcome === "miss" && rules.inBadSpot({ outcome: "strong", match: true }).outcome === "strong", "a bad spot: strong without a match is weak, weak is a miss");
  const ticks = rules.RANKS.map((rank) => rules.markProgress(0, rank));
  assert(ticks.join(",") === "12,8,4,2,1" && rules.markProgress(36, "troublesome") === 40 && rules.boxes(39) === 9, `a mark by rank: ${ticks}`);
  assert(rules.markProgress(0, "dangerous", 2) === 16 && rules.raiseRank("dangerous") === "formidable" && rules.raiseRank("epic") === "epic", "marked twice; a rank raised");
  const one = rules.derive({ game: "classic", debilities: { wounded: true }, momentum: 10 });
  const two = rules.derive({ game: "classic", debilities: { wounded: true, maimed: true }, momentum: 10 });
  assert(one.momentummax === 9 && one.momentum === 9 && one.momentumreset === 1 && two.momentummax === 8 && two.momentumreset === 0 && rules.momentumReset({ game: "classic" }) === 2, "debilities: maximum 9 and reset 1 with one, 8 and 0 with two");
  assert(rules.derive({ game: "starforged", impacts: { doomed: true }, assets: { a01: { marks: { battered: true } } } }).momentumreset === 0, "Starforged: an impact and a battered starship: reset 0");
  const hurt = rules.suffer(rules.blank("classic"), "health", 3);
  assert(hurt.data.meters.health === 2 && hurt.overflow === 0, "3 harm: health 5 to 2");
  const past = rules.suffer({ ...rules.blank("classic"), meters: { health: 1, spirit: 5, supply: 5 }, momentum: 2 }, "health", 3);
  assert(past.data.meters.health === 0 && past.overflow === 2 && past.data.momentum === 0, "3 harm at health 1: health 0 and -2 momentum");
  assert(rules.blocked({ game: "classic", debilities: { wounded: true } }, "health") === "Wounded", "wounded blocks health");
  assert(rules.vowReward("classic", "dangerous", "strong") === 2 && rules.vowReward("classic", "dangerous", "weak") === 1 && rules.vowReward("classic", "troublesome", "weak") === 0 && rules.vowReward("classic", "epic", "strong") === 5, "classic experience by rank (one less on a weak hit)");
  assert(rules.vowReward("starforged", "formidable", "strong") === 4 && rules.vowReward("starforged", "formidable", "weak") === 8 - 0 && rules.vowReward("starforged", "epic", "strong") === 1, "Starforged quests legacy ticks by rank (formidable 4; a weak hit one rank lower: dangerous 8; epic 1)");
  const legacy = rules.markLegacy({ ticks: 36, cleared: 0 }, 8);
  assert(legacy.cleared === 1 && legacy.ticks === 4 && rules.legacyXp(legacy) === 21 && rules.legacyXp({ ticks: 12 }) === 6, `legacy: 3 boxes are 6 experience; a full track clears (20) and the next box is 1: ${JSON.stringify(legacy)}`);
  const strike = rules.outcomeEffects("On a **strong hit**, inflict +1 harm. You retain initiative.");
  assert(strike.auto.harm === 2 && strike.auto.control === true, `classic Strike's strong hit: 2 harm, initiative: ${JSON.stringify(strike)}`);
  const fray = rules.outcomeEffects("On a **weak hit**, choose one.\n- Take +2 momentum\n- You are in control");
  assert(Object.keys(fray.auto).length === 0 && fray.choices.length === 2 && fray.choices[0].effects.momentum === 2 && fray.choices[1].effects.control === true, `Starforged Enter the Fray's weak hit: two choices: ${JSON.stringify(fray)}`);
  const harm = rules.outcomeEffects("On a **miss**, it’s worse than you thought. Suffer an additional -1 health or Lose Momentum (-2).");
  assert(Object.keys(harm.auto).length === 0 && harm.choices[0].effects.health === -1, `an "or" of two effects is a choice: ${JSON.stringify(harm)}`);
}
console.log("rules ok");

// --- At the table: Ironsworn --------------------------------------------------------
async function table(ruleset, books) {
  const server = createTableServer({ ruleset });
  await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const agent = server.agent;
  for (const name of books) importModule(agent.records, agent.seat, book(name));
  const refused = (name, args) => callTool(name, args, ctx).then((result) => (result.isError ? result.content[0].text : null)).catch((error) => error.message);
  return { server, tool, refused, agent, force: (...values) => agent.dice.force(values), data: (id) => agent.records.get(id).data, said: (pattern) => agent.chatLog(400).some((line) => pattern.test(`${line.text ?? ""} ${line.roll?.label ?? ""} ${line.roll?.result ?? ""}`)) };
}

const done = [];
{
  const { server, tool, refused, agent, force, data, said } = await table("Ironsworn", ["Ironsworn Reference", "Ironsworn Foes and Sites", "The Cinder Barrow"]);
  try {
    const counts = Object.fromEntries(["ironmove", "ironasset", "ironoracle", "irondelve", "npc"].map((type) => [type, agent.records.list({ type }).length]));
    assert(counts.ironmove === 48 && counts.ironasset === 78 && counts.ironoracle > 80 && counts.irondelve === 20 && counts.npc >= 14, `the books' records: ${JSON.stringify(counts)}`);
    // The wizard's spec: 3, 2, 2, 1, 1; three assets; an extreme background vow; two bonds.
    const badStats = await refused("kraken_build_character", { spec: { name: "Bad", stats: { edge: 3, heart: 3, iron: 2, shadow: 1, wits: 1 }, assets: ["Hound", "Archer", "Alchemist"], backgroundVow: { name: "x", rank: "epic" } } });
    assert(/3, 2, 2, 1 and 1/.test(String(badStats)), "the stats must be 3, 2, 2, 1, 1");
    const built = await tool("kraken_build_character", { owner: "Ann", spec: { name: "Kira Ashdown", stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 }, assets: [{ name: "Hound", field: "Ember" }, "Archer", "Alchemist"], backgroundVow: { name: "Avenge my clan", rank: "extreme" }, bonds: ["Brannoch", "Wenna Tull"], look: "Scarred hands", gear: ["Bow", "Bedroll"] } });
    const kira = built.id;
    let pc = data(kira);
    assert(pc.game === "classic" && pc.meters.health === 5 && pc.momentum === 2 && Object.keys(pc.assets).length === 3 && pc.assets.a01.fields.name === "Ember" && pc.bonds.ticks === 2 && Object.values(pc.tracks)[0].rank === "extreme" && Object.keys(pc.inventorylist).length === 2, `Kira: ${JSON.stringify({ assets: pc.assets.a01, bonds: pc.bonds, tracks: pc.tracks })}`);
    assert(pc.assets.a02.abilities[0] === true && pc.assets.a01.max === 4, "an asset's first ability marked; the Hound's health 4");

    // Face Danger +edge (3): a 5 against 4 and 6: 8 beats both: strong hit, +1 momentum.
    force(5, 4, 6);
    let result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "face_danger", option: 0 });
    assert(result.lastroll.outcome === "strong" && result.lastroll.score === 8 && result.momentum === 3 && said(/\[MOVE\] Kira Ashdown: Face Danger \(\+Edge 3\)/), `Face Danger: strong hit, momentum 3: ${JSON.stringify(result.lastroll)}`);
    // A weak hit: its choices wait (Face Danger's: -1 momentum, Endure Harm...).
    force(1, 2, 9);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "face_danger", option: 0 });
    assert(result.lastroll.outcome === "weak" && !result.lastroll.pending && result.lastroll.choices.length === 4, `a weak hit with four choices: ${JSON.stringify(result.lastroll.choices)}`);
    result = await tool("kraken_ironsworn", { id: kira, action: "choose", index: 0 });
    assert(data(kira).momentum === 2 && result.applied.includes("-1 momentum"), "the first choice: -1 momentum");
    // Burn: momentum 9; Secure an Advantage +wits (1): a 3 against 7 and 3: 4, weak; burn: 9 beats both: strong; momentum resets to 2.
    await tool("kraken_character_edit", { id: kira, changes: [{ path: "momentum", value: 9 }] });
    force(3, 7, 3);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "Secure an Advantage", option: 4 });
    assert(result.lastroll.pending && result.lastroll.burnable && result.lastroll.outcome === "weak", "a weak hit that momentum could better waits");
    result = await tool("kraken_ironsworn", { id: kira, action: "resolve", burn: true });
    pc = data(kira);
    assert(pc.lastroll.outcome === "strong" && pc.lastroll.burned.from === "weak" && pc.momentum === 2 && said(/\[BURN\] Kira Ashdown burns 9 momentum/), `burned: a strong hit, momentum reset to 2: ${JSON.stringify(pc.lastroll)}`);
    // Negative momentum cancels a matching action die.
    await tool("kraken_character_edit", { id: kira, changes: [{ path: "momentum", value: -4 }] });
    force(4, 2, 5);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "face_danger", option: 2 });
    assert(result.lastroll.cancelled && result.lastroll.score === 2 && result.lastroll.outcome === "miss", `momentum -4 cancels a 4: 0 + iron 2 = 2: ${JSON.stringify(result.lastroll)}`);
    await tool("kraken_character_edit", { id: kira, changes: [{ path: "momentum", value: 2 }] });
    done.push("action roll, choices, burn, cancelled die");

    // Swear an Iron Vow (dangerous) +heart 2: a 6 against 2 and 5: strong: +2 momentum.
    force(6, 2, 5);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "swear_an_iron_vow", vow: { name: "End the burning", rank: "dangerous" } });
    const vow = Object.entries(result.tracks).find(([, track]) => track.name === "End the burning")[0];
    assert(result.lastroll.outcome === "strong" && result.momentum === 4 && result.tracks[vow].rank === "dangerous", "a vow sworn: +2 momentum");
    await tool("kraken_ironsworn", { id: kira, action: "move", move: "reach_a_milestone", track: vow });
    await tool("kraken_ironsworn", { id: kira, action: "move", move: "reach_a_milestone", track: vow });
    await tool("kraken_ironsworn", { id: kira, action: "track-mark", track: vow, times: 1 });
    assert(data(kira).tracks[vow].ticks === 24, "three marks on a dangerous vow: 24 ticks (6 boxes)");
    // Fulfill Your Vow: 6 progress against 3 and 5: strong: 2 experience.
    force(3, 5);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "fulfill_your_vow", track: vow });
    pc = data(kira);
    assert(result.lastroll.kind === "progress" && result.lastroll.outcome === "strong" && pc.exp === 2 && pc.tracks[vow].done === "fulfilled" && pc.experience.available === 2, `a dangerous vow fulfilled: 2 experience: ${JSON.stringify(pc.experience)}`);
    // Advance: 2 to upgrade (the Archer's second ability).
    await tool("kraken_ironsworn", { id: kira, action: "advance", upgrade: "a02" });
    pc = data(kira);
    assert(pc.assets.a02.abilities[1] && pc.expspent === 2 && pc.experience.available === 0, "an upgrade costs 2");
    const poor = await refused("kraken_ironsworn", { id: kira, action: "advance", asset: "Hawk" });
    assert(/costs 3 experience/.test(String(poor)), "a new asset costs 3");
    done.push("vows: sworn, milestones, fulfilled for 2 experience, Advance");

    // Endure Harm: 2 harm (health 3), then +iron or +health, the higher (3): a 3 against 2 and 1: strong: choices.
    force(3, 2, 1);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "endure_harm", amount: 2 });
    assert(result.meters.health === 3 && result.lastroll.statValue === 3 && result.lastroll.outcome === "strong" && result.lastroll.choices.length === 2, `Endure Harm: health 3, rolled +health 3: ${JSON.stringify(result.lastroll)}`);
    await tool("kraken_ironsworn", { id: kira, action: "choose", index: 0 });
    assert(data(kira).meters.health === 4, "shake it off: +1 health");
    // Endure Stress 6 at spirit 5: spirit 0, 1 off momentum.
    force(1, 9, 9);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "endure_stress", amount: 6 });
    assert(result.meters.spirit === 0 && result.lastroll.outcome === "miss" && result.lastroll.match, "Endure Stress 6: spirit 0, the rest off momentum; a miss with a match");
    done.push("harm and stress (past 0 off momentum)");

    // --- A fight: a troublesome Raider on the tracker.
    const raider = agent.records.list({ type: "npc" }).find((item) => item.name === "Raider");
    await tool("kraken_combat", { action: "add", recordId: kira });
    await tool("kraken_combat", { action: "add", recordId: raider.id });
    let view = await tool("kraken_combat", { action: "view" });
    const foe = view.entries.find((entry) => entry.name === "Raider");
    assert(foe.iron.rank === "troublesome" && foe.iron.ticks === 0 && foe.iron.harm === 1 && foe.health.status === "Fresh", `the foe as a ranked track: ${JSON.stringify(foe.iron)}`);
    // Enter the Fray +heart (2): 6 + 2 = 8 against 1 and 7: strong: +2 momentum, initiative.
    force(6, 1, 7);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "enter_the_fray", option: 0, target: foe.id });
    assert(result.control === true && result.lastroll.outcome === "strong", "Enter the Fray: the initiative");
    // Strike +iron (2): 6 + 2 = 8 against 2 and 3: strong: 2 harm (troublesome: 12 ticks each): 24 ticks; initiative kept.
    force(6, 2, 3);
    result = await tool("kraken_ironsworn", { id: kira, action: "move", move: "strike", option: 0, target: foe.id });
    view = await tool("kraken_combat", { action: "view" });
    assert(view.entries.find((entry) => entry.id === foe.id).iron.ticks === 24 && result.control === true, `Strike marks 2 harm on a troublesome foe: ${JSON.stringify(view.entries.find((entry) => entry.id === foe.id).iron)}`);
    assert(view.entries.find((entry) => entry.recordId === kira).iron.control === true, "the tracker shows Kira's initiative");
    // The foe's harm on Kira: troublesome, 1.
    await tool("kraken_ironsworn", { action: "inflict", target: foe.id, id: kira });
    assert(data(kira).meters.health === 3, "a troublesome foe inflicts 1 harm");
    // End the Fight: 6 progress against 4 and 5: strong: out of the fight.
    force(4, 5);
    await tool("kraken_ironsworn", { id: kira, action: "move", move: "end_the_fight", target: foe.id });
    view = await tool("kraken_combat", { action: "view" });
    assert(view.entries.find((entry) => entry.id === foe.id).health.status === "Defeated", "End the Fight: the Raider is out of the fight");
    // The GM's buttons: rank and progress; the tracker's damage marks harm.
    await tool("kraken_combat", { action: "add", recordId: agent.records.list({ type: "npc" }).find((item) => item.name === "Cave Bear").id });
    view = await tool("kraken_combat", { action: "view" });
    const bear = view.entries.find((entry) => entry.name === "Cave Bear");
    await tool("kraken_ironsworn", { action: "foe-mark", target: bear.id, times: 2 });
    await tool("kraken_ironsworn", { action: "foe-rank", target: bear.id, rank: "dangerous" });
    await tool("kraken_combat", { action: "damage", id: bear.id, amount: 1 });
    view = await tool("kraken_combat", { action: "view" });
    assert(view.entries.find((entry) => entry.id === bear.id).iron.ticks === 16 && view.entries.find((entry) => entry.id === bear.id).iron.rank === "dangerous", "a formidable bear marked twice (8), made dangerous, then 1 harm (8): 16");
    const attack = await refused("kraken_combat", { action: "attack", recordId: kira, weapon: "x" });
    assert(/no attack rolls/.test(String(attack)), "no attack rolls in Ironsworn");
    await tool("kraken_combat", { action: "end", removeNpcs: true });
    done.push("a fight: Enter the Fray, Strike (2 harm), the foe's harm, End the Fight; the GM's marks");

    // --- Oracles: Action (d100 37); a "roll twice" row rolls again.
    force(37);
    const oracle = await tool("kraken_ironsworn", { action: "oracle", oracle: "Action and Theme Oracles: Action" });
    const row = rules.oracleRow(agent.records.list({ type: "ironoracle" }).find((item) => item.name === "Action").data, 37);
    assert(oracle.roll === 37 && oracle.result === rules.rowText(row) && said(/\[ORACLE\] Action and Theme Oracles: Action = 37/), `the Action oracle at 37: ${oracle.result}`);
    const twice = agent.records.list({ type: "ironoracle" }).find((item) => Object.values(item.data.tablerows ?? {}).some((r) => r.rolls === "self*2"));
    const twiceRow = Object.values(twice.data.tablerows).find((r) => r.rolls === "self*2");
    force(twiceRow.fromrange, 1, 2);
    const again = await tool("kraken_ironsworn", { action: "oracle", oracle: twice.id });
    assert(again.also.length === 2, `"roll twice" rolls twice more (${twice.name})`);
    // Ask the Oracle (a move's own tables): 50/50.
    force(30);
    const asked = await tool("kraken_ironsworn", { id: kira, action: "move", move: "ask_the_oracle", oracle: "fifty_fifty" });
    assert(asked.lastroll.kind === "none" && said(/\[ORACLE\] Moves: Ask the Oracle: 50\/50 = 30/i), "Ask the Oracle rolls its odds");
    done.push("oracles (with roll twice; Ask the Oracle)");

    // --- Delve: a haunted barrow's features and dangers; a site's track.
    force(3);
    const feature = await tool("kraken_ironsworn", { action: "site", theme: "Haunted", domain: "Barrow", what: "feature" });
    force(40);
    const domainDanger = await tool("kraken_ironsworn", { action: "site", theme: "Haunted", domain: "Barrow", what: "danger" });
    force(90);
    const general = await tool("kraken_ironsworn", { action: "site", theme: "Haunted", domain: "Barrow", what: "danger" });
    assert(feature.from === "Haunted" && domainDanger.from === "Barrow" && general.from === "Reveal a Danger", `the site's tables: theme, domain, Reveal a Danger: ${feature.from}, ${domainDanger.from}, ${general.from}`);
    const site = await tool("kraken_ironsworn", { id: kira, action: "site-add", theme: "Haunted", domain: "Barrow", rank: "dangerous", name: "The Cinder Barrow" });
    assert(data(kira).tracks[site.track].kind === "site", "the site's progress track");
    // Delve the Depths +wits marks progress on the site on a strong hit (and Find an Opportunity).
    force(6, 1, 2);
    await tool("kraken_ironsworn", { id: kira, action: "move", move: "delve_the_depths", option: 2, track: site.track });
    assert(data(kira).tracks[site.track].ticks === 8, "Delve the Depths: a mark on the dangerous site");
    done.push("Delve: theme and domain tables, a site's track");

    // --- The party: supply shared; a parcel's supply; each one's experience.
    const bo = (await tool("kraken_build_character", { owner: "Bo", spec: { name: "Bo Fenn", stats: { edge: 1, heart: 1, iron: 3, shadow: 2, wits: 2 }, assets: ["Horse", "Brawler", "Bonded"], backgroundVow: { name: "Find my sister", rank: "epic" } } })).id;
    await tool("kraken_party_edit", { members: [kira, bo] });
    await tool("kraken_ironsworn", { id: kira, action: "adjust", what: "supply", delta: -2 });
    assert(data(bo).meters.supply === 3, "supply is shared: Bo's follows Kira's");
    const party = require("../electron/party.cjs");
    await party.addToParcel(agent, { coins: { Supply: 2 }, items: [{ name: "Silver Torc", count: 1 }], from: "Test" });
    agent.records.update("party", { data: { parcel: { items: Object.fromEntries(Object.entries(agent.records.get("party").data.parcel.items).map(([key, item]) => [key, { ...item, assign: "Kira Ashdown" }])) } } }, agent.seat);
    await party.distribute(agent, "Test");
    assert(data(kira).meters.supply === 4 && data(bo).meters.supply === 4 && Object.values(data(kira).inventorylist).some((item) => item.name === "Silver Torc"), `the parcel: 1 supply each (shared), the torc to Kira: ${data(kira).meters.supply}, ${data(bo).meters.supply}`);
    await party.awardXP(agent, 3, "Test");
    assert(data(kira).exp === 5 && data(bo).exp === 3, "experience: each their own");
    done.push("party: shared supply, a parcel's supply and gear, experience");
  } finally {
    await server.close?.();
  }
}

// --- Starforged ------------------------------------------------------------------
{
  const { server, tool, refused, agent, force, data } = await table("Starforged", ["Starforged Reference", "Starforged Foes", "The Silent Hulk"]);
  try {
    const counts = Object.fromEntries(["ironmove", "ironasset", "ironoracle", "npc"].map((type) => [type, agent.records.list({ type }).length]));
    assert(counts.ironmove === 56 && counts.ironasset === 87 && counts.ironoracle > 250 && counts.npc === 55, `Starforged's records: ${JSON.stringify(counts)}`);
    const wrong = await refused("kraken_build_character", { spec: { name: "X", stats: { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 }, assets: ["Ace", "Archer", "Glowcat", "Rover"], backgroundVow: { name: "x", rank: "epic" } } });
    assert(/starship/i.test(String(wrong)), "Starforged needs the starship");
    const built = await tool("kraken_build_character", { owner: "Cy", spec: { name: "Vesna Kade", callsign: "Needle", stats: { edge: 2, heart: 1, iron: 3, shadow: 1, wits: 2 }, assets: ["Ace", "Blademaster", { name: "Starship", field: "Lantern" }, "Glowcat"], backgroundVow: { name: "Find the lost fleet", rank: "epic" }, incitingVow: { name: "Bring the colonists home", rank: "dangerous" }, connection: { name: "Ashe Varo", role: "Broker", rank: "dangerous" } } });
    const vesna = built.id;
    let pc = data(vesna);
    assert(pc.game === "starforged" && Object.keys(pc.assets).length === 4 && Object.values(pc.tracks).some((track) => track.kind === "connection" && track.role === "Broker") && pc.legacy.quests.ticks === 0 && pc.experience.earned === 0, `Vesna: ${JSON.stringify(pc.tracks)}`);
    const starship = Object.values(pc.assets).find((asset) => asset.name === "Starship");
    assert(starship.max === 5 && starship.fields.name === "Lantern" && "battered" in starship.marks, "the starship's integrity 5, its name, battered and cursed");
    // A sample foe on the tracker (formidable: 4 ticks a mark).
    const foeRecord = agent.records.list({ type: "npc" }).find((item) => item.name === "Pirate boarding party");
    await tool("kraken_combat", { action: "add", recordId: vesna });
    await tool("kraken_combat", { action: "add", recordId: foeRecord.id });
    let view = await tool("kraken_combat", { action: "view" });
    const foe = view.entries.find((entry) => entry.name === "Pirate boarding party");
    assert(foe.iron.rank === "formidable", "the boarding party is formidable");
    // Enter the Fray +iron (3): 5 + 3 against 2 and 4: strong: +2 momentum and in control.
    force(5, 2, 4);
    let result = await tool("kraken_ironsworn", { id: vesna, action: "move", move: "enter_the_fray", option: 2, target: foe.id });
    assert(result.control && result.momentum === 4, "in control, momentum 4");
    // Strike: strong: mark progress twice (formidable: 4 ticks each): 8.
    force(6, 1, 1);
    result = await tool("kraken_ironsworn", { id: vesna, action: "move", move: "strike", option: 0, target: foe.id });
    view = await tool("kraken_combat", { action: "view" });
    assert(view.entries.find((entry) => entry.id === foe.id).iron.ticks === 8 && result.control && result.lastroll.match, "Strike: progress marked twice; a match");
    // Strike, a weak hit: marked twice, but in a bad spot.
    force(1, 2, 9);
    result = await tool("kraken_ironsworn", { id: vesna, action: "move", move: "strike", option: 0, target: foe.id });
    view = await tool("kraken_combat", { action: "view" });
    assert(view.entries.find((entry) => entry.id === foe.id).iron.ticks === 16 && result.control === false, "a weak Strike: progress twice, in a bad spot");
    // Take Decisive Action in a bad spot: 4 progress against 1 and 3 is a strong hit without a match: counted a weak hit.
    force(1, 3);
    result = await tool("kraken_ironsworn", { id: vesna, action: "move", move: "take_decisive_action", target: foe.id });
    assert(result.lastroll.outcome === "weak" && result.lastroll.downgraded, `a bad spot: a strong hit counts as weak: ${JSON.stringify(result.lastroll)}`);
    view = await tool("kraken_combat", { action: "view" });
    assert(view.entries.find((entry) => entry.id === foe.id).health.status === "Defeated", "the objective seized");
    await tool("kraken_combat", { action: "end", removeNpcs: true });
    // A vow (the inciting one) fulfilled: dangerous: 2 boxes a milestone; 3 milestones: 6 boxes; strong hit: 2 ticks on the quests legacy.
    const inciting = Object.entries(data(vesna).tracks).find(([, track]) => track.name === "Bring the colonists home")[0];
    for (let i = 0; i < 3; i++) await tool("kraken_ironsworn", { id: vesna, action: "move", move: "reach_a_milestone", track: inciting });
    force(2, 5);
    await tool("kraken_ironsworn", { id: vesna, action: "move", move: "fulfill_your_vow", track: inciting });
    pc = data(vesna);
    assert(pc.legacy.quests.ticks === 8 && pc.experience.earned === 4 && pc.tracks[inciting].done === "fulfilled", `a dangerous vow: 8 ticks (2 boxes) on quests legacy: 4 experience: ${JSON.stringify(pc.legacy)} ${JSON.stringify(pc.experience)}`);
    // Forge a Bond with the connection (dangerous): 8 ticks on bonds legacy.
    const ashe = Object.entries(pc.tracks).find(([, track]) => track.kind === "connection")[0];
    await tool("kraken_ironsworn", { id: vesna, action: "track-mark", track: ashe, times: 4 });
    force(1, 1);
    await tool("kraken_ironsworn", { id: vesna, action: "move", move: "forge_a_bond", track: ashe });
    pc = data(vesna);
    assert(pc.legacy.bonds.ticks === 8 && pc.experience.earned === 8 && pc.tracks[ashe].bonded, "a bond forged: bonds legacy 8 ticks, 8 experience");
    // Advance: a module for 3.
    await tool("kraken_ironsworn", { id: vesna, action: "advance", asset: "Medbay" });
    assert(data(vesna).experience.available === 5, "a new asset: 3 experience");
    // Impacts lower momentum's maximum; a battered starship counts.
    await tool("kraken_ironsworn", { id: vesna, action: "debility", key: "wounded", on: true });
    const shipKey = Object.entries(data(vesna).assets).find(([, asset]) => asset.name === "Starship")[0];
    await tool("kraken_character_edit", { id: vesna, changes: [{ path: `assets.${shipKey}.marks.battered`, value: true }] });
    assert(data(vesna).momentummax === 8 && data(vesna).momentumreset === 0, "wounded and battered: maximum 8, reset 0");
    // Withstand Damage: the starship's integrity -2.
    force(4, 9, 9);
    await tool("kraken_ironsworn", { id: vesna, action: "move", move: "withstand_damage", amount: 2, asset: shipKey });
    assert(data(vesna).assets[shipKey].meter === 3, "Withstand Damage: integrity 5 to 3");
    // An oracle of the Forge.
    force(55);
    const planet = await tool("kraken_ironsworn", { action: "oracle", oracle: "oracle_rollable:starforged/planet/desert/atmosphere" });
    assert(planet.roll === 55 && planet.result, "a desert world's atmosphere");
    done.push("Starforged: the wizard's four assets, Strike twice, a bad spot's Take Decisive Action, legacy experience, impacts, Withstand Damage, an oracle");
  } finally {
    await server.close?.();
  }
}
console.log(`ok ironsworn: ${checks} checks. ${done.join("; ")}.`);
process.exit(0);
