// Apeira Astra's rules and books, without the app: Marks and tricks (each Path
// record carries three; a Mark is the GM's, at most six; each Mark teaches one
// trick from the character's own major or minor Path, never twice; the GM can
// take one back), the caps (no skill above 4, no characteristic above 15, in
// derive and in Improve), the host's markAstra/improveAstra on a stand-in
// table (who may do what), the Crew Handbook saying the sheet keeps Marks, the
// built Crew Handbook's Path records carrying their tricks through the FG XML,
// the Threat Dossier's new people rolling their attacks as the tracker reads
// them, and A Lamp in the Rock (its encounters' creatures in the Dossier, its
// maps' walls the size of their pictures, its pictures on disk, no handout of
// lettering). Run: npm run astra
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PATHS, GEAR } from "../games/apeira-astra/crew.mjs";
import { CREW_HANDBOOK } from "../games/apeira-astra/crew-handbook.mjs";
import { DOSSIER, THREATS } from "../games/apeira-astra/dossier.mjs";
import { REACH_THREATS } from "../games/apeira-astra/reach.mjs";
import { LAMP_IN_THE_ROCK } from "../games/apeira-astra/lamp-in-the-rock.mjs";
import { MAX_MARKS, SKILLS, awardMark, buildFromSpec, derive, dm, forgetTrick, learnTrick, npcAttacks, pathTricks, skillCost, skillList, trickChoices, tricksForSkill, tricksOf, unspentMarks } from "../shared/astra/rules.mjs";

const require = createRequire(import.meta.url);
const done = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const throws = (fn, pattern, message) => {
  try {
    fn();
  } catch (error) {
    assert(!pattern || pattern.test(error.message), `${message}: said "${error.message}"`);
    return;
  }
  throw new Error(`${message}: it did not refuse`);
};

// --- The Paths' tricks -------------------------------------------------------
const paths = PATHS.map((entry) => ({ name: entry.name, data: entry }));
for (const entry of PATHS) {
  const tricks = pathTricks(entry);
  assert(tricks.length === 3 && tricks.every((trick) => trick.name && trick.text.length > 20), `${entry.name} has three tricks with text: ${JSON.stringify(tricks)}`);
  for (const trick of tricks) assert(entry.text.__rich.includes(`<b>${trick.name.replace(/'/g, "&#39;")}.</b>`) || entry.text.__rich.includes(`<b>${trick.name}.</b>`), `${entry.name}'s page lists ${trick.name}`);
}
const allTricks = PATHS.flatMap((entry) => pathTricks(entry).map((trick) => trick.name));
assert(new Set(allTricks).size === allTricks.length, "every trick has its own name");
done.push(`${PATHS.length} Paths x 3 tricks, structured and on their pages`);

// The built book: the Path records keep their tricks through FG's XML.
const { convertXml } = require("../electron/importers/fgModule.cjs");
const client = convertXml(readFileSync(path.join("games", "modules", "Apeira Astra Crew Handbook", "client.xml"), "utf8"));
const found = [];
(function walk(node) {
  if (!node || typeof node !== "object") return;
  if (node.tricks && typeof node.tricks === "object" && node.name) found.push(node);
  for (const value of Object.values(node)) walk(value);
})(client);
const builtFleet = found.find((node) => node.name === "Fleet");
assert(found.length >= PATHS.length && builtFleet && pathTricks(builtFleet).map((trick) => trick.name).join() === "Berth Hands,Watch Captain,Skein Stomach", `the built Crew Handbook's Paths carry their tricks: ${found.length} ${JSON.stringify(builtFleet?.tricks)}`);
done.push("the built Crew Handbook's Path records carry their tricks");

// --- A crew member: no Marks at first --------------------------------------
const lib = {
  origins: [{ name: "Spacer", data: { skills: "Zero-G 1, Pilot 0" } }],
  paths,
  items: GEAR.map((entry) => ({ name: entry.name, data: entry })),
};
const built = buildFromSpec({ name: "A test crew member", origin: "Spacer", major: "Fleet", minor: "Medic", majorSkills: ["Pilot", "Astrogation", "Gunnery", "Tactics"], minorSkills: ["Medicine", "Science"], characteristics: { brawn: 7, reflex: 10, grit: 8, intellect: 9, training: 6, presence: 5 } }, lib);
let data = built.data;
assert(data.marks === 0 && Object.keys(data.tricks).length === 0 && unspentMarks(data) === 0, `a new crew member has no Marks: ${data.marks} ${JSON.stringify(data.tricks)}`);
throws(() => learnTrick(data, paths, "Berth Hands"), /No unspent Mark/, "no trick without a Mark");
done.push("a new crew member: 0 Marks, no tricks, nothing to learn");

// --- Marks and tricks -------------------------------------------------------
data = awardMark(data);
assert(data.marks === 1 && unspentMarks(data) === 1, "a Mark awarded: 1, unspent");
const choices = trickChoices(data, paths).map((trick) => `${trick.path}:${trick.name}`);
assert(choices.length === 6 && choices.every((choice) => /^(Fleet|Medic):/.test(choice)), `the choices are Fleet's and Medic's six: ${choices}`);
throws(() => learnTrick(data, paths, "First Through"), /not a trick of Fleet or Medic/, "a Marine trick is not this crew member's");
throws(() => learnTrick(data, paths, "No Such Trick"), /not a trick/, "an unknown trick");
let result = learnTrick(data, paths, "berth hands");
data = derive(result.data);
assert(result.trick.name === "Berth Hands" && result.trick.path === "Fleet" && tricksOf(data)[0].text.startsWith("A Boon on Pilot"), `Berth Hands learned, with its Path and text: ${JSON.stringify(tricksOf(data))}`);
assert(unspentMarks(data) === 0, "the Mark is spent");
throws(() => learnTrick(data, paths, "Watch Captain"), /No unspent Mark/, "one trick per Mark");
data = awardMark(data);
throws(() => learnTrick(data, paths, "Berth Hands"), /learned already/, "never the same trick twice");
data = derive(learnTrick(data, paths, "Stay With Me").data);
assert(tricksOf(data).map((trick) => trick.name).join() === "Berth Hands,Stay With Me", "a minor Path's trick too");
assert(!trickChoices(data, paths).some((trick) => trick.name === "Berth Hands" || trick.name === "Stay With Me"), "the choices leave out what is learned");
// The sheet's reminder: a skill a trick names.
assert(tricksForSkill(data, "pilot").map((trick) => trick.name).join() === "Berth Hands" && tricksForSkill(data, "medicine").map((trick) => trick.name).join() === "Stay With Me" && tricksForSkill(data, "zerog").length === 0, "a trick shows beside the skill it names");
// Up to six, then no more.
for (let n = data.marks; n < MAX_MARKS; n++) data = awardMark(data);
assert(data.marks === 6 && unspentMarks(data) === 4, `six Marks, four unspent: ${data.marks}, ${unspentMarks(data)}`);
throws(() => awardMark(data), /Six Marks/, "no seventh Mark");
for (const trick of trickChoices(data, paths)) data = derive(learnTrick(data, paths, trick.name).data);
assert(tricksOf(data).length === 6 && unspentMarks(data) === 0 && trickChoices(data, paths).length === 0, "six Marks teach the major and minor Paths' six tricks");
// derive keeps Marks between 0 and 6.
assert(derive({ ...data, marks: 9 }).marks === 6 && derive({ ...data, marks: -2 }).marks === 0, "derive keeps Marks in 0..6");
// The GM's correction.
const forgot = forgetTrick(data, "Berth Hands");
assert(unspentMarks(forgot.data) === 1 && !tricksOf(forgot.data).some((trick) => trick.name === "Berth Hands"), "forgetting a trick frees its Mark");
throws(() => forgetTrick(data, "Already Gone"), /No trick/, "forgetting a trick not on the sheet");
// The same Path twice: three tricks to learn, no more.
const twice = derive({ ...data, paths: ["Scout", "Scout"], tricks: {}, marks: 6 });
assert(trickChoices(twice, paths).length === 3, "a major and minor of one Path: its three tricks");
done.push("Marks: award to six (no seventh); one trick per Mark from the major or minor Path, never twice; forget frees a Mark; a trick shows beside its skill");

// --- Caps ---------------------------------------------------------------------
const capped = derive({ characteristics: { brawn: { score: 19 } }, skills: { pilot: { level: 7 } } });
assert(capped.characteristics.brawn.score === 15 && capped.characteristics.brawn.dm === dm(15) && capped.skills.pilot.level === 4, `derive caps skills at 4 and characteristics at 15: ${capped.characteristics.brawn.score}, ${capped.skills.pilot.level}`);
done.push("derive: no skill above 4, no characteristic above 15");

// --- The host: markAstra and improveAstra on a stand-in table ----------------
const astra = require("../electron/astra.cjs");
const said = [];
const store = new Map();
const table = {
  seat: { role: "dm", name: "GM" },
  records: {
    list: ({ type }) => (type === "class" ? paths : type === "race" ? lib.origins : type === "item" ? lib.items : []),
    update: (id, patch) => {
      const next = { ...store.get(id), ...patch };
      store.set(id, next);
      return next;
    },
  },
  say: (text) => said.push(text),
};
store.set("pc", { id: "pc", type: "character", name: "A test crew member", owner: "A test player", data: built.data });
const gm = { role: "dm", name: "GM" };
const player = { role: "player", name: "A test player" };
const stranger = { role: "player", name: "Someone else" };
const current = () => store.get("pc");
const refuses = async (promise, pattern, message) => {
  try {
    await promise;
  } catch (error) {
    assert(pattern.test(error.message), `${message}: said "${error.message}"`);
    return;
  }
  throw new Error(`${message}: it did not refuse`);
};
await refuses(astra.markAstra(table, current(), { action: "award" }, player), /The GM awards Marks/, "a player cannot award a Mark");
await refuses(astra.markAstra(table, current(), { action: "learn", trick: "Berth Hands" }, stranger), /your own character/, "someone else cannot learn a trick for this character");
let marked = await astra.markAstra(table, current(), { action: "award" }, gm, "GM");
assert(marked.marks === 1 && marked.unspent === 1 && /\[MARK\] A test crew member gains a Mark \(1 of 6\)/.test(said.at(-1)), `the GM's Mark, in chat: ${said.at(-1)}`);
await refuses(astra.markAstra(table, current(), { action: "learn", trick: "Count the Room" }, player), /not a trick of Fleet or Medic/, "the host refuses another Path's trick");
marked = await astra.markAstra(table, current(), { action: "learn", trick: "Watch Captain" }, player);
assert(marked.unspent === 0 && marked.tricks.map((trick) => trick.name).join() === "Watch Captain" && /learns Watch Captain \(Fleet\)/.test(said.at(-1)), `the player learns Watch Captain: ${JSON.stringify(marked.tricks)} ${said.at(-1)}`);
await refuses(astra.markAstra(table, current(), { action: "learn", trick: "Berth Hands" }, player), /No unspent Mark/, "the host: one trick per Mark");
await refuses(astra.markAstra(table, current(), { action: "forget", trick: "Watch Captain" }, player), /Only the GM/, "a player cannot forget a trick");
await refuses(astra.markAstra(table, current(), { action: "take" }, gm), /forget a trick first/, "no unspent Mark to take back");
marked = await astra.markAstra(table, current(), { action: "forget", trick: "Watch Captain" }, gm);
assert(marked.unspent === 1 && marked.tricks.length === 0, "the GM's forget frees the Mark");
marked = await astra.markAstra(table, current(), { action: "take" }, gm);
assert(marked.marks === 0 && marked.unspent === 0, "the GM takes the unspent Mark back");
// Improve: the caps hold at the host.
store.set("pc", { ...current(), data: derive({ ...current().data, exp: 100, skills: { ...current().data.skills, pilot: { level: 4 } }, characteristics: { ...current().data.characteristics, reflex: { score: 15 } } }) });
await refuses(astra.improveAstra(table, current(), { skill: "Pilot" }, player), /at its height/, "Improve: no skill above 4");
await refuses(astra.improveAstra(table, current(), { attribute: "reflex" }, player), /at its height/, "Improve: no characteristic above 15");
const gunnery = current().data.skills.gunnery?.level;
const improved = await astra.improveAstra(table, current(), { skill: "Gunnery" }, player);
assert(improved.now === `Gunnery ${gunnery + 1}` && improved.cost === skillCost(gunnery + 1) && /\[IMPROVE\]/.test(said.at(-1)), `Improve still buys under the cap: ${improved.now} for ${improved.cost}`);
done.push("host: the GM awards, the owner learns (own Paths only, one per Mark), the GM forgets / takes back; Improve stops at 4 and 15");

// --- The Crew Handbook says the sheet keeps Marks ------------------------------
const bookText = JSON.stringify(CREW_HANDBOOK.reference);
assert(!/does not track them/.test(bookText) && /the sheet tracks it all/i.test(bookText) && /Award a Mark/.test(bookText), "the Crew Handbook says the sheet tracks Marks");
assert(/No skill goes above 4\. No characteristic goes above 15\./.test(bookText), "the Advancement page states the caps");
done.push("the Crew Handbook: the sheet tracks Marks; the caps stated");

// --- The Threat Dossier's people roll their attacks ---------------------------
for (const npc of REACH_THREATS) {
  assert(THREATS.includes(npc), `${npc.name} is in the Dossier`);
  assert(Number.isFinite(npc.hp) && npc.hp > 0 && Number.isFinite(npc.armour), `${npc.name}: Stamina and Armour`);
  const attacks = Object.values(npcAttacks(npc));
  const wordsOnly = Object.values(npc.actions).filter((action) => !/Attack/.test(action.desc));
  assert(attacks.length + wordsOnly.length === Object.keys(npc.actions).length, `${npc.name}: every attack line reads as an attack`);
  for (const attack of attacks) assert(/^\d*d\d+([+-]\d+)?$/.test(attack.damage) && Number.isInteger(attack.bonus), `${npc.name} ${attack.name}: ${JSON.stringify(attack)}`);
  for (const key of Object.keys(skillList(npc.skills))) assert(SKILLS[key], `${npc.name}: ${key} is a skill`);
  // A person's attack bonus is their skill + characteristic modifier (untrained -3), as a crew member's would be.
  if (npc.type === "Human") {
    const skills = skillList(npc.skills);
    for (const attack of attacks) {
      const skill = attack.type === "melee" ? "melee" : "firearms";
      const stat = attack.type === "melee" ? "brawn" : "reflex";
      const expected = (skills[skill] ?? -3) + dm(npc.characteristics[stat].score);
      assert(attack.bonus === expected, `${npc.name}'s ${attack.name}: +${attack.bonus}, the engine would say ${expected}`);
    }
  }
}
const pages = DOSSIER.reference[0].sections.flatMap((section) => section.pages.map((page) => page.name));
assert(["Running a Job", "Salvage", "Six Jobs"].every((name) => pages.includes(name)), `the Dossier's Work pages: ${pages.slice(-4)}`);
done.push(`the Dossier's ${REACH_THREATS.length} new people and creatures: Stamina, Armour, attacks the tracker reads (people's bonuses = skill + modifier)`);

// --- A Lamp in the Rock ---------------------------------------------------------
const dossierNames = new Set(THREATS.map((npc) => npc.name));
for (const battle of LAMP_IN_THE_ROCK.gm.battle) for (const row of Object.values(battle.npclist)) assert(dossierNames.has(row.name) && row.link.__link.recordname.endsWith("@Apeira Astra Threat Dossier"), `${battle.name}: ${row.name} is in the Dossier`);
for (const [inside, file] of Object.entries(LAMP_IN_THE_ROCK.pictures)) assert(existsSync(file), `${inside} on disk`);
assert(!Object.keys(LAMP_IN_THE_ROCK.pictures).some((name) => /handout-(claim|offer|chit|plate)/.test(name)), "no handout of lettering (the papers are in the story text)");
const { default: sharp } = await import("sharp");
for (const map of LAMP_IN_THE_ROCK.gm.image.filter((image) => image.__category === "Maps")) {
  const layer = map.image.layers.layer[0];
  const occluders = layer.occluders?.occluder ?? [];
  assert(occluders.length > 10 && occluders.some((wall) => wall.toggleable), `${map.name}: walls and hatches (${occluders.length})`);
  const file = LAMP_IN_THE_ROCK.pictures[layer.bitmap];
  const walls = JSON.parse(readFileSync(path.join("games", "apeira-astra", "maps", `${path.basename(layer.bitmap, ".webp")}.walls.json`), "utf8"));
  {
    const meta = await sharp(file).metadata();
    assert(meta.width === walls.width && meta.height === walls.height, `${map.name}: the walls fit the picture (${meta.width}x${meta.height} vs ${walls.width}x${walls.height})`);
  }
}
const story = JSON.stringify(LAMP_IN_THE_ROCK.gm.encounter);
assert(/Award a Mark/.test(story) && /Dividend, berth clear/.test(story) && /Claim 441/.test(story), "the story: the Mark, the plate's phrase and the claim in its text");
done.push(`A Lamp in the Rock: ${LAMP_IN_THE_ROCK.gm.encounter.length} story entries, ${LAMP_IN_THE_ROCK.gm.battle.length} encounters from the Dossier, maps whose walls fit their pictures`);

console.log(done.map((line) => `ok ${line}`).join("\n"));
console.log("ASTRA_OK");
