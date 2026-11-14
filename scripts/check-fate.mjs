// Fate Core and Fate Accelerated with fixed dice: the ladder, four Fate dice
// (each -1, 0, +1) and their totals, the four outcomes and their shifts
// (with style), invokes (+2 or a reroll, a fate point or a free invoke),
// compels, refresh, stress and consequences (one box and the free
// consequences; the lightest way first), taken out, conceding (a fate point
// and one a consequence), milestones; the books' records; building from the
// wizard's spec (the pyramid; FAE's approaches) and from a pregen; and a
// conflict on the tracker (turn order by Notice / Quick, attacks against
// defences, a nameless NPC taken out, a supporting NPC's consequence, a
// player's hit absorbed, a concession). Run from Kraken's own Fate books
// (npm run build-games first).
//   node scripts/check-fate.mjs
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as rules from "../shared/fate/rules.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { importModule } = require("../electron/importers/fgModule.cjs");
const { createDice } = require("../electron/dice.cjs");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const book = (name) => path.join(ROOT, "games", "modules", name);

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

// --- The rules, alone ---------------------------------------------------------------
assert(rules.ladder(3) === "Good (+3)" && rules.ladder(-2) === "Terrible (−2)" && rules.ladder(8) === "Legendary (+8)" && rules.ladder(0) === "Mediocre (+0)" && rules.ladderName(10) === "Legendary+2" && rules.ladderName(-3) === "Terrible−1", "the ladder");
assert(rules.ratingOf("Great (+4)") === 4 && rules.ratingOf("Fair") === 2 && rules.ratingOf(-1) === -1 && rules.ratingOf("+3") === 3, "ratings from words");
{
  // The host's Fate dice: a fixed 1 is −, 2 blank, 3 +.
  const dice = createDice({ seed: "fate" });
  dice.force([3, 3, 2, 1]);
  const rolled = dice.roll("4dF+2");
  assert(rolled.terms[0].fate && rolled.terms[0].rolls.join() === "1,1,0,-1" && rolled.total === 3, `4dF+2 with + + blank −: ${JSON.stringify(rolled)}`);
  assert(rules.diceSum([1, 1, 0, -1]) === 1 && rules.face(1) === "+" && rules.face(-1) === "−" && rules.face(0) === " ", "faces and sums");
  let low = 0;
  let high = 0;
  for (let i = 0; i < 400; i += 1) {
    const total = dice.roll("4dF").total;
    low = Math.min(low, total);
    high = Math.max(high, total);
  }
  assert(low >= -4 && high <= 4 && low < 0 && high > 0, `4dF stays within -4..+4: ${low}..${high}`);
}
assert(rules.outcome(5, 2).outcome === "style" && rules.outcome(5, 2).shifts === 3, "succeed with style: 3 shifts");
assert(rules.outcome(4, 2).outcome === "succeed" && rules.outcome(2, 2).outcome === "tie" && rules.outcome(1, 2).outcome === "fail" && rules.outcome(1, 2).shifts === -1, "succeed, tie, fail");
assert(rules.freeInvokes(rules.outcome(5, 2)) === 2 && rules.freeInvokes(rules.outcome(3, 2)) === 1 && rules.freeInvokes(rules.outcome(2, 2)) === 0, "create an advantage: one free invoke, two with style");
assert(rules.rollTotal({ dice: [1, 0, 0, -1], rating: 3, invokes: 2, bonus: 1 }) === 8, "a total: dice + rating + 2 an invoke + bonus");
{
  const pyramid = { Fight: 4, Athletics: 3, Notice: 3, Physique: 2, Will: 2, Shoot: 2, Lore: 1, Stealth: 1, Rapport: 1, Contacts: 1 };
  assert(rules.pyramidProblems(pyramid).length === 0, `the pyramid fits: ${rules.pyramidProblems(pyramid)}`);
  assert(rules.pyramidProblems({ ...pyramid, Lore: 4 }).length > 0 && rules.pyramidProblems({ ...pyramid, Fight: 5 }).some((line) => /cap/.test(line)), "a pyramid that does not fit, and the cap");
  assert(rules.approachProblems({ careful: 2, clever: 1, flashy: 0, forceful: 3, quick: 2, sneaky: 1 }).length === 0 && rules.approachProblems({ careful: 3, clever: 3, flashy: 0, forceful: 3, quick: 2, sneaky: 1 }).length === 1, "FAE's approaches: +3 +2 +2 +1 +1 +0");
  assert(JSON.stringify(rules.trackSizes({ skills: {} })) === '{"physical":2,"mental":2}' && JSON.stringify(rules.trackSizes({ skills: { Physique: 2, Will: 4 } })) === '{"physical":3,"mental":4}' && rules.trackSizes({ game: "fae" }).stress === 3, "stress: two boxes; Average/Fair a 3, Good/Great a 3 and a 4; FAE three");
  assert(rules.consequenceSlots({ skills: { Physique: 5 } }).includes("mild2") && !rules.consequenceSlots({ skills: { Physique: 4 } }).includes("mild2") && rules.consequenceSlots({ skills: { Will: 6 } }).includes("mild3"), "Superb Physique or Will: an extra mild consequence");
  // Absorbing: the lightest way first; one box a hit.
  const boxes = [1, 2, 3].map((value) => ({ value, marked: false }));
  const free = ["mild", "moderate", "severe"];
  assert(JSON.stringify(rules.absorbOptions(3, { boxes, free })[0]) === JSON.stringify({ box: 3, consequences: [], absorbs: 3 }), "3 shifts: the 3 box alone");
  const marked3 = boxes.map((box) => ({ ...box, marked: box.value === 3 }));
  assert(JSON.stringify(rules.absorbOptions(3, { boxes: marked3, free })[0]) === JSON.stringify({ box: 1, consequences: ["mild"], absorbs: 3 }), `3 shifts, the 3 box used: the 1 box and a mild: ${JSON.stringify(rules.absorbOptions(3, { boxes: marked3, free })[0])}`);
  const big = rules.absorbOptions(9, { boxes: boxes.map((box) => ({ ...box, marked: true })), free });
  assert(big[0].consequences.length === 2 && big[0].absorbs >= 9, `9 shifts with every box marked: two consequences: ${JSON.stringify(big[0])}`);
  assert(rules.absorbOptions(9, { boxes: [], free: [] }).length === 0 && rules.absorbOptions(2, { boxes: [], free: [] }).length === 0, "nothing left: taken out");
  assert(rules.absorbOptions(16, { boxes, free: [...free, "extreme"] }).some((plan) => plan.consequences.includes("extreme")), "an extreme consequence takes 8");
  assert(rules.refreshOf({ stunts: { a: {}, b: {}, c: {} } }) === 3 && rules.refreshOf({ stunts: { a: {}, b: {}, c: {}, d: {} } }) === 2 && rules.refreshOf({ stunts: { a: {}, b: {}, c: {}, d: {}, e: {}, f: {} }, refreshbase: 3 }) === 1, "refresh 3, three stunts free, never below 1");
  assert(rules.initiativeOf({ skills: { Notice: 2, Athletics: 1 } }, "physical") > rules.initiativeOf({ skills: { Notice: 1, Athletics: 4 } }, "physical") && rules.initiativeOf({ game: "fae", approaches: { quick: 3 } }, "physical") > rules.initiativeOf({ game: "fae", approaches: { quick: 2, careful: 3 } }, "physical"), "turn order: Notice first (then Athletics); FAE Quick");
  assert(rules.defenseOf({ skills: { Athletics: 1, Fight: 3 } }, "physical").name === "Fight" && rules.defenseOf({ skills: { Will: 2 } }, "mental").rating === 2, "the best defence");
  const plan = rules.applyPlan({ stress: { physical: {} }, consequences: {} }, { box: 2, consequences: ["mild"] }, "physical", { mild: "Bruised Ribs" });
  assert(plan.box === 2, "a plan applied");
  const built = rules.buildFromSpec({ name: "Test", aspects: { highconcept: "A", trouble: "B", a1: "C" }, skills: pyramid, stunts: [{ name: "One" }, { name: "Two" }, { name: "Three" }, { name: "Four" }] }, { game: "core" });
  assert(built.data.refresh === 2 && built.data.fatepoints === 2 && built.data.tracks.find((track) => track.key === "physical").boxes.length === 3 && built.data.tracks.find((track) => track.key === "mental").boxes.length === 3, `a Core character: refresh 2 with four stunts, stress 3/3: ${JSON.stringify(built.data.tracks.map((track) => track.boxes.length))}`);
  let refused = "";
  try {
    rules.buildFromSpec({ aspects: { highconcept: "A", trouble: "B" }, skills: { Fight: 4 } }, { game: "core" });
  } catch (error) {
    refused = error.message;
  }
  assert(/pyramid/.test(refused), "a broken pyramid is refused");
  const npc = rules.npcStats({ fatekind: "nameless", skilllist: { a: { name: "Fight", rating: 2 }, b: { name: "Athletics", rating: 1 } }, stressphysical: 1, aspectlist: { a: { name: "Violent Criminal" } } });
  assert(npc.tracks.physical === 1 && npc.attacks[0].name === "Fight" && npc.aspects[0] === "Violent Criminal", `an NPC's numbers: ${JSON.stringify(npc)}`);
  const mook = rules.npcStats({ skilllist: { a: { name: "Biting", rating: 2 } }, stressphysical: 2 }, "fae");
  assert(mook.tracks.stress === 2 && mook.attacks[0].name === "Biting", "a FAE mook: skilled at biting, one track");
}
console.log("rules ok");

// --- At a Fate Core table ------------------------------------------------------------------------
async function table(ruleset) {
  const server = createTableServer({ ruleset });
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
  return { server, tool, refused, agent: server.agent };
}
const said = (agent, pattern) => agent.chatLog(400).some((line) => pattern.test(`${line.text ?? ""} ${line.roll?.label ?? ""}`));

{
  const { server, tool, refused, agent } = await table("Fate Core");
  const force = (...values) => agent.dice.force(values);
  const data = (id) => agent.records.get(id).data;
  try {
    for (const name of ["Fate Core System", "Fate Toolkit and Adversaries", "The Lighthouse at Gull's End"]) importModule(agent.records, agent.seat, book(name));
    const counts = Object.fromEntries(["fateskill", "fatestunt", "npc", "pregencharsheet", "battle", "encounter"].map((type) => [type, agent.records.list({ type }).length]));
    assert(counts.fateskill === 18 && counts.fatestunt >= 50 && counts.npc >= 18 && counts.pregencharsheet === 6, `the books' records: ${JSON.stringify(counts)}`);

    // A character from the wizard's spec: the phase trio, the pyramid, three stunts.
    const built = await tool("kraken_build_character", {
      owner: "a test player",
      spec: {
        name: "Brennan Hale",
        aspects: { highconcept: "Swordmaster of the Quiet Order", trouble: "My Brother's Debts" },
        phases: { p1: { title: "The Duel at Varn", aspect: "I Never Back Down" }, p2: { title: "Crossing paths", aspect: "Owes Rook a Favour" }, p3: { title: "Crossing paths again", aspect: "Calm Before the Storm" } },
        skills: { Fight: 4, Athletics: 3, Notice: 3, Physique: 2, Will: 2, Shoot: 2, Lore: 1, Stealth: 1, Rapport: 1, Provoke: 1 },
        stunts: [{ name: "Riposte", skill: "Fight", text: "Succeed with style on a Fight defence: a 2-shift hit instead of a boost." }, { name: "Sprinter", skill: "Athletics" }, { name: "Battle Sense", skill: "Notice" }],
      },
    });
    const pc = built.id;
    assert(built.refresh === 3 && built.fatepoints === 3 && built.aspects.a1 === "I Never Back Down" && built.tracks.join() === "Physical 3,Mental 3", `built: ${JSON.stringify(built)}`);
    assert(/pyramid/.test(await refused("kraken_build_character", { spec: { aspects: { highconcept: "X", trouble: "Y" }, skills: { Fight: 4, Lore: 4 } } })), "the wizard's pyramid is checked");

    // Rolls: 4dF + the skill against an opposition; outcomes and shifts.
    force(3, 3, 2, 1);
    let roll = await tool("kraken_fate", { id: pc, action: "roll", skill: "Fight", kind: "overcome", opposition: "Fair" });
    assert(roll.total === 5 && roll.outcome === "style" && roll.shifts === 3 && roll.ladder === "Superb (+5)", `Fight +4 with + + blank −, against Fair: Superb, with style: ${JSON.stringify(roll)}`);
    assert(said(agent, /\[FATE\] Fight \+4 · Overcome vs Fair \(\+2\) \[STYLE \+3\]/) && said(agent, /Boost: /), "the roll in chat, and the boost of an overcome with style");
    force(1, 1, 1, 2);
    roll = await tool("kraken_fate", { id: pc, action: "roll", skill: "Lore", kind: "overcome", opposition: 2 });
    assert(roll.total === -2 && roll.outcome === "fail" && roll.shifts === -4, `Lore +1 with − − − blank: Terrible, a failure: ${JSON.stringify(roll)}`);
    // An invoke for +2 (a fate point), then a reroll (another).
    let invoked = await tool("kraken_fate", { id: pc, action: "invoke", aspect: "I Never Back Down", mode: "bonus" });
    assert(invoked.total === 0 && invoked.fatepoints === 2, `+2 for a fate point: ${JSON.stringify(invoked)}`);
    force(3, 3, 3, 2);
    invoked = await tool("kraken_fate", { id: pc, action: "invoke", aspect: "Swordmaster of the Quiet Order", mode: "reroll" });
    assert(invoked.total === 6 && invoked.outcome === "style" && invoked.fatepoints === 1, `a reroll keeps the +2 invoked: 3 + 1 + 2 = 6: ${JSON.stringify(invoked)}`);
    // Create an advantage: the aspect with a free invoke; then that invoke used, free.
    force(2, 2, 3, 2);
    roll = await tool("kraken_fate", { id: pc, action: "roll", skill: "Notice", kind: "advantage", opposition: 2, aspect: "Weak Spot in His Guard" });
    let scene = (await tool("kraken_fate", { action: "view" })).aspects;
    const weak = scene.find((item) => item.name === "Weak Spot in His Guard");
    assert(roll.outcome === "succeed" && weak?.invokes === 1, `create an advantage: the aspect, one free invoke: ${JSON.stringify(scene)}`);
    force(2, 2, 2, 2);
    roll = await tool("kraken_fate", { id: pc, action: "roll", skill: "Fight", kind: "attack", invokes: [{ aspect: "Weak Spot in His Guard", free: true }] });
    scene = (await tool("kraken_fate", { action: "view" })).aspects;
    assert(roll.total === 6 && roll.invokes === 1 && scene.find((item) => item.name === "Weak Spot in His Guard").invokes === 0 && data(pc).fatepoints === 1, `a free invoke: +2, no fate point: ${JSON.stringify(roll)}`);
    // Compels and refresh.
    await tool("kraken_fate", { id: pc, action: "compel", aspect: "My Brother's Debts", accept: true });
    assert(data(pc).fatepoints === 2, "a compel accepted: a fate point");
    await tool("kraken_fate", { id: pc, action: "compel", aspect: "My Brother's Debts", accept: false });
    assert(data(pc).fatepoints === 1, "a compel refused: a fate point paid");
    await tool("kraken_fate", { id: pc, action: "refresh" });
    assert(data(pc).fatepoints === 3, "refresh: back up to 3");
    // Milestones: a significant gives a skill point; skill-up spends it.
    await tool("kraken_fate", { id: pc, action: "milestone", kind: "significant", text: "Saved the lighthouse" });
    assert(data(pc).skillpoints === 1, "a significant milestone: a skill point");
    await tool("kraken_fate", { id: pc, action: "skill-up", skill: "Lore" });
    assert(data(pc).skills.Lore === 2 && data(pc).skillpoints === 0, "Lore one step up");
    await tool("kraken_fate", { id: pc, action: "milestone", kind: "major" });
    assert(data(pc).refresh === 4 && data(pc).skillpoints === 1, `a major milestone: refresh +1: ${data(pc).refresh}`);
    // The GM's pool for a scene, and the scene's aspects.
    let pool = await tool("kraken_fate", { action: "scene-start", name: "The Strand", count: 3 });
    assert(pool.gmpool === 3 && !pool.aspects.some((item) => item.kind !== "game"), "a new scene: the GM's pool, the old aspects gone");
    await tool("kraken_fate", { action: "aspect-add", name: "The Tide Is Coming In", kind: "situation", invokesCount: 1 });
    pool = await tool("kraken_fate", { action: "gm-pool", amount: -1 });
    assert(pool.gmpool === 2 && pool.aspects.some((item) => item.name === "The Tide Is Coming In" && item.invokes === 1), `the pool spent, the aspect up: ${JSON.stringify(pool)}`);
    assert(/no experience points/.test((await refused("kraken_party_award", { xp: 100 })) ?? ""), "no XP in Fate");
    console.log("table ok");

    // --- A conflict on the tracker ---
    const thug = agent.records.list({ type: "npc" }).find((item) => item.name === "Trained Thug");
    const finn = agent.records.list({ type: "npc" }).find((item) => item.name === "Old Finn, Landon's Mentor");
    await tool("kraken_combat", { action: "add", recordId: pc });
    await tool("kraken_combat", { action: "add", recordId: thug.id });
    await tool("kraken_combat", { action: "add", recordId: finn.id });
    await tool("kraken_fate", { action: "conflict", kind: "physical" });
    await tool("kraken_combat", { action: "init", which: "all" });
    let view = (await tool("kraken_combat", { action: "view" })).entries;
    const me = view.find((entry) => entry.recordId === pc);
    const foe = view.find((entry) => entry.name === "Trained Thug");
    const old = view.find((entry) => entry.name.startsWith("Old Finn"));
    assert(view[0].recordId === pc && said(agent, /\[INIT\] A physical conflict, in order of Notice/), `turn order by Notice: ${view.map((entry) => entry.name).join(", ")}`);
    assert(foe.fate.tracks[0].boxes.length === 1 && old.fate.tracks[0].boxes.length === 2 && old.fate.consequences.length === 1, `the NPCs' stress and consequences: ${JSON.stringify(old.fate)}`);
    // Brennan attacks the thug: Fight +4 (+ + blank blank) = 6 against its best defence, Fight +2 (blank x4): 4 shifts, taken out.
    await tool("kraken_combat", { action: "target", id: me.id, targetId: foe.id, on: true });
    force(3, 3, 2, 2, 2, 2, 2, 2);
    const hit = await tool("kraken_combat", { action: "attack", recordId: pc, weapon: "Fight" });
    view = hit.combat.entries;
    assert(hit.results[0].shifts === 4 && view.find((entry) => entry.id === foe.id).health.status === "Taken Out", `the thug is taken out: ${JSON.stringify(hit.results)}`);
    assert(said(agent, /\[ATTACK\] Brennan Hale: Fight \+4/) && said(agent, /\[DEFEND\] Trained Thug: Fight \+2/) && said(agent, /\[TAKEN OUT\] Trained Thug/), "attack, defence and taken out in chat");
    // A tie: the attacker's boost.
    await tool("kraken_combat", { action: "target", id: me.id, targetId: foe.id, on: false });
    await tool("kraken_combat", { action: "target", id: me.id, targetId: old.id, on: true });
    force(2, 2, 2, 1, 2, 2, 2, 2);
    const tie = await tool("kraken_combat", { action: "attack", recordId: pc, weapon: "Fight" });
    assert(tie.results[0].shifts === 0 && said(agent, /\[TIE\]/) && (await tool("kraken_fate", { action: "view" })).aspects.some((item) => item.kind === "boost" && /opening on Old Finn/.test(item.name)), `a tie: a boost: ${JSON.stringify(tie.results)}`);
    // Old Finn takes 3 shifts by the GM's hand: the 1 box and his mild consequence (the lightest way).
    await tool("kraken_combat", { action: "damage", id: old.id, amount: 3 });
    view = (await tool("kraken_combat", { action: "view" })).entries;
    const finnNow = view.find((entry) => entry.id === old.id).fate;
    assert(finnNow.tracks[0].boxes[0].marked && finnNow.consequences[0].text === "Mild consequence" && view.find((entry) => entry.id === old.id).health.status === "Consequences", `Old Finn absorbs 3: ${JSON.stringify(finnNow)}`);
    // Old Finn attacks Brennan: Shoot +4 (+ + + +) = 8 against Fight +4 (− − blank blank) = 2: 6 shifts, waiting for the player.
    await tool("kraken_combat", { action: "target", id: old.id, targetId: me.id, on: true });
    force(3, 3, 3, 3, 1, 1, 2, 2);
    await tool("kraken_combat", { action: "attack", id: old.id, weapon: "Shoot" });
    view = (await tool("kraken_combat", { action: "view" })).entries;
    let mine = view.find((entry) => entry.id === me.id).fate;
    assert(mine.pending?.shifts === 6 && mine.pending.options[0].words.includes("stress box") && view.find((entry) => entry.id === me.id).health.status === "Hit", `a hit waits for its player: ${JSON.stringify(mine.pending)}`);
    // Absorbed: the 2 box and a moderate consequence, named.
    const choice = mine.pending.options.find((plan) => plan.box === 2 && plan.consequences.join() === "moderate");
    assert(choice, `the 2 box and a moderate among the options: ${JSON.stringify(mine.pending.options)}`);
    await tool("kraken_combat", { action: "absorb", id: me.id, choice: { plan: choice.index, names: { moderate: "Arrow in the Shoulder" } } });
    assert(data(pc).stress.physical["2"] === 1 && data(pc).consequences.moderate.text === "Arrow in the Shoulder", `the sheet: ${JSON.stringify({ stress: data(pc).stress, consequences: data(pc).consequences })}`);
    assert(rules.aspectsOf(data(pc)).some((aspect) => aspect.name === "Arrow in the Shoulder"), "a consequence is an aspect");
    // Another hit, then a concession: a fate point, and one for the consequence taken.
    force(3, 3, 3, 3, 1, 1, 1, 1);
    await tool("kraken_combat", { action: "attack", id: old.id, weapon: "Shoot" });
    const before = data(pc).fatepoints;
    const conceded = await tool("kraken_combat", { action: "concede", id: me.id });
    view = conceded.combat.entries;
    assert(conceded.concede.fatepoints === 2 && data(pc).fatepoints === before + 2 && view.find((entry) => entry.id === me.id).health.status === "Conceded" && data(pc).out === "conceded", `conceding: +2 fate points (1 + 1 consequence): ${JSON.stringify(conceded.concede)}`);
    // The conceded and the taken out lose their turns.
    await tool("kraken_combat", { action: "next" });
    view = (await tool("kraken_combat", { action: "view" })).entries;
    const active = (await tool("kraken_combat", { action: "view" })).active;
    assert(active === old.id, `only Old Finn still acts: ${active}`);
    // The end: stress clears, consequences stay.
    await tool("kraken_combat", { action: "end", removeNpcs: true });
    assert(Object.values(data(pc).stress.physical).every((value) => !value) && data(pc).consequences.moderate.text === "Arrow in the Shoulder" && data(pc).out === "", "the conflict over: stress clear, the consequence stays");
    // Recovery: starts, then done.
    await tool("kraken_fate", { id: pc, action: "recover", key: "moderate" });
    assert(data(pc).consequences.moderate.recovering === 1, "recovering");
    await tool("kraken_fate", { id: pc, action: "recover", key: "moderate", done: true });
    assert(!data(pc).consequences.moderate.text, "recovered");
    // A pregen from the scenario, taken as it is.
    const rook = agent.records.list({ type: "pregencharsheet" }).find((item) => item.name === "Rook Tallow (Fate Core)");
    const taken = await tool("kraken_build_character", { spec: { pregen: rook.id }, owner: "someone" });
    assert(taken.skills.Fight === 4 && taken.stunts.length === 3 && taken.refresh === 3 && taken.tracks.join() === "Physical 4,Mental 3", `Rook taken as he is: ${JSON.stringify(taken)}`);
    const ilsaFae = agent.records.list({ type: "pregencharsheet" }).find((item) => item.name === "Ilsa Fenwright (Fate Accelerated)");
    assert(/Fate Accelerated character/.test((await refused("kraken_build_character", { spec: { pregen: ilsaFae.id } })) ?? ""), "a FAE pregen in a Core game is refused");
    console.log("conflict ok");
  } finally {
    await server.close?.();
  }
}

// --- At a Fate Accelerated table --------------------------------------------------------------------
{
  const { server, tool, refused, agent } = await table("Fate Accelerated");
  const force = (...values) => agent.dice.force(values);
  const data = (id) => agent.records.get(id).data;
  try {
    for (const name of ["Fate Accelerated Edition", "Fate Toolkit and Adversaries", "The Lighthouse at Gull's End"]) importModule(agent.records, agent.seat, book(name));
    const counts = Object.fromEntries(["fateskill", "fatestunt", "pregencharsheet"].map((type) => [type, agent.records.list({ type }).length]));
    assert(counts.fateskill === 6 && counts.fatestunt >= 10 && counts.pregencharsheet === 10, `FAE's records: ${JSON.stringify(counts)}`);
    const built = await tool("kraken_build_character", { owner: "a test player", spec: { name: "Wren", aspects: { highconcept: "Runaway Sky-Pirate", trouble: "Wanted by the Admiralty", a1: "Never Without My Kite" }, approaches: { careful: 1, clever: 2, flashy: 3, forceful: 0, quick: 2, sneaky: 1 }, stunts: [{ name: "Daredevil", text: "Because I am a Daredevil, I get a +2 when I Flashily overcome obstacles in the air." }] } });
    assert(built.approaches.flashy === 3 && built.tracks.join() === "Stress 3" && built.refresh === 3 && built.problems.some((line) => /stunts? left/.test(line)), `a FAE character: ${JSON.stringify(built)}`);
    assert(/approaches/.test((await refused("kraken_build_character", { spec: { aspects: { highconcept: "X", trouble: "Y" }, approaches: { careful: 3, clever: 3, flashy: 3, forceful: 0, quick: 2, sneaky: 1 } } })) ?? ""), "FAE's spread is checked");
    force(3, 3, 3, 1);
    const roll = await tool("kraken_fate", { id: built.id, action: "roll", skill: "flashy", kind: "overcome", opposition: 2 });
    assert(roll.total === 5 && roll.outcome === "style", `Flashy +3 with + + + −: Superb: ${JSON.stringify(roll)}`);
    const voltaire = agent.records.list({ type: "pregencharsheet" }).find((item) => item.name === "Voltaire");
    const taken = await tool("kraken_build_character", { spec: { pregen: voltaire.id } });
    assert(taken.approaches.flashy === 3 && taken.stunts[0] === "Swashbuckling Swordswoman" && taken.fatepoints === 3, `Voltaire, as the book makes her: ${JSON.stringify(taken)}`);
    // A conflict: Quick goes first; a mook from the book; attacks by approach.
    const shark = agent.records.list({ type: "npc" }).find((item) => item.name === "Sky Shark");
    await tool("kraken_combat", { action: "add", recordId: built.id });
    await tool("kraken_combat", { action: "add", recordId: shark.id });
    await tool("kraken_combat", { action: "init", which: "all" });
    let view = (await tool("kraken_combat", { action: "view" })).entries;
    const me = view.find((entry) => entry.recordId === built.id);
    const foe = view.find((entry) => entry.name === "Sky Shark");
    assert(view[0].id === me.id && said(agent, /in order of Quick/) && foe.fate.tracks[0].key === "stress" && foe.fate.tracks[0].boxes.length === 2, `FAE's conflict: ${JSON.stringify(foe.fate)}`);
    await tool("kraken_combat", { action: "target", id: me.id, targetId: foe.id, on: true });
    force(3, 2, 2, 2, 2, 2, 2, 2);
    const hit = await tool("kraken_combat", { action: "attack", recordId: built.id, weapon: "forceful" });
    assert(hit.results[0].attack === 1 && hit.results[0].shifts === 1, `Forceful +0 (+ blank blank blank) against +0: one shift: ${JSON.stringify(hit.results)}`);
    view = hit.combat.entries;
    assert(view.find((entry) => entry.id === foe.id).fate.tracks[0].boxes[0].marked, "the shark's 1 box");
    // The shark bites: Biting +2 against the best of Careful, Quick, Forceful (Quick +2).
    await tool("kraken_combat", { action: "target", id: foe.id, targetId: me.id, on: true });
    force(3, 3, 3, 3, 1, 1, 1, 1);
    await tool("kraken_combat", { action: "attack", id: foe.id, weapon: "Biting" });
    view = (await tool("kraken_combat", { action: "view" })).entries;
    const pending = view.find((entry) => entry.id === me.id).fate.pending;
    assert(pending.shifts === 8 && pending.track === "stress", `Biting +2 (+ + + +) = 6 against Quick +2 (− − − −) = −2: 8 shifts: ${JSON.stringify(pending)}`);
    await tool("kraken_combat", { action: "absorb", id: me.id, choice: { out: true } });
    view = (await tool("kraken_combat", { action: "view" })).entries;
    assert(view.find((entry) => entry.id === me.id).health.status === "Taken Out" && data(built.id).out === "taken out", "taken out by choice");
    console.log("fae ok");
  } finally {
    await server.close?.();
  }
}
console.log(`FATE_OK ${checks} checks`);
process.exit(0);
