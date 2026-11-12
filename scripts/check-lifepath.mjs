// Traveller's lifepath through its tool, with fixed dice: the characteristics
// rolled and kept, background skills (3 + EDU DM), straight into the Navy
// (INT qualification), basic training (every Service skill at 0), a skill
// roll on the Specialist table (a speciality asked), survival, an event (a
// Life Event: a Contact), a commission (an Ensign, the rank's bonus skill and
// another skill roll), leaving, two benefit rolls (cash and a weapon), the
// Traveller built with the weapon the benefit gave. Then forty lifepaths with
// the table's own dice, every answer at random, each built.
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
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
const life = (input) => tool("kraken_traveller_lifepath", { action: "answer", owner: "Ann", input }).then((result) => result.life);
const lastLine = (state) => state.log[state.log.length - 1];
const logged = (state, pattern) => state.log.some((line) => pattern.test(line));

force(4, 4, 5, 5, 3, 4, 6, 5, 5, 4, 3, 3);
let state = (await tool("kraken_traveller_lifepath", { action: "start", owner: "Ann", name: "Mira Sol" })).life;
assert(state.pending.kind === "arrange" && state.pending.values.join() === "8,10,7,11,9,6", `six 2D rolls: ${JSON.stringify(state.pending)}`);
state = await life({ assign: { str: 8, dex: 10, end: 7, int: 11, edu: 9, soc: 7 } });
assert(state.pending.error, "an arrangement must use each roll once");
state = await life({ keep: true });
assert(state.pending.kind === "pick" && state.pending.count === 4, `background: 3 + EDU 9's +1 = 4: ${JSON.stringify(state.pending)}`);
state = await life({ picks: ["Vacc Suit", "Electronics", "Athletics", "Carouse"] });
assert(state.skills.vaccsuit === 0 && state.pending.options.includes("University"), "background skills at 0; then education");
state = await life({ choice: "Straight into a career" });
assert(state.pending.kind === "career" && state.pending.careers.some((career) => career.name === "Navy" && career.qualification === "INT 6+"), "the careers, with their qualifications");
// Navy (Flight): INT 6+ with INT 11 (+1): 3 + 3 + 1 = 7; basic training; the Specialist table's 1: Pilot, a speciality.
force(3, 3);
state = await life({ career: "Navy", assignment: "flight" });
assert(logged(state, /Navy qualification: INT 6\+: rolled 7\. Qualified\./) && logged(state, /Basic training: every Service skill at 0/) && state.skills.gunner === 0 && state.skills.guncombat === 0, `qualified; basic training: ${state.log.slice(-6).join(" | ")}`);
assert(state.pending.kind === "choose" && state.pending.options.includes("Specialist: Flight") && state.pending.tables.length >= 3, "a skill table to choose");
force(1);
state = await life({ choice: "Specialist: Flight" });
assert(state.pending.options.includes("Spacecraft"), `Pilot: which speciality: ${JSON.stringify(state.pending)}`);
// Survival DEX 7+ (DEX 10, +1): 4 + 3 + 1 = 8; event 3 + 4 = 7: a Life Event, 3 + 3 = 6: a Contact; then a commission is offered.
force(4, 3, 3, 4, 3, 3);
state = await life({ choice: "Spacecraft" });
assert(state.skills["pilot-spacecraft"] === 1 && logged(state, /Survival: DEX 7\+, rolled 8: survived/) && logged(state, /Life event \(2D = 6\)/) && state.connections.contacts === 1, `Pilot (Spacecraft) 1, survived, a Contact: ${state.log.slice(-5).join(" | ")}`);
assert(state.pending.options.includes("Try for a commission"), "a commission or advancement");
// Commission SOC 8+ (SOC 6, 0): 5 + 4 = 9: an Ensign, Melee (Blade) 1, another skill roll: Officer 1: Leadership.
force(5, 4);
state = await life({ choice: "Try for a commission" });
assert(state.current.officer && state.current.rank === 1 && state.skills["melee-blade"] === 1 && state.pending.options.includes("Officer"), `commissioned: ${JSON.stringify(state.current)} ${JSON.stringify(state.skills)}`);
force(1);
state = await life({ choice: "Officer" });
assert(state.skills.leadership === 1 && state.pending.options.includes("Leave the career"), `Leadership 1; another term? ${JSON.stringify(state.pending)}`);
// Leave: 1 term + rank 1's roll = 2 benefit rolls: Cash 3 (Cr5000) and Benefits 4 (a Weapon).
state = await life({ choice: "Leave the career" });
assert(logged(state, /Leaving the Navy as Ensign: 2 benefit rolls/) && state.pending.options.join() === "Cash,Benefits", `mustering out: ${lastLine(state)}`);
force(3);
state = await life({ choice: "Cash" });
force(4);
state = await life({ choice: "Benefits" });
assert(state.cash === 5000 && state.benefits.join() === "Weapon" && state.items.join() === "weapon" && state.pending.options.includes("Finish"), `Cr5000 and a Weapon: ${JSON.stringify(state)}`);
state = await life({ choice: "Finish" });
assert(state.done && state.age === 22 && state.terms === 1, "finished at 22");
let refused = "";
try {
  await tool("kraken_traveller_lifepath", { action: "build", owner: "Ann", build: { gear: ["Combat Armour"] } });
} catch (error) {
  refused = error.message;
}
assert(/no benefit gives that/.test(refused), `armour the benefits did not give: ${refused}`);
const built = await tool("kraken_traveller_lifepath", { action: "build", owner: "Ann", build: { name: "Mira Sol", homeworld: "Tessaly", gear: ["Laser Pistol"] } });
const mira = agent.records.get(built.id);
assert(mira.owner === "Ann" && mira.data.upp === "8A7B96" && mira.data.age === 22 && mira.data.careers[0].name === "Navy" && mira.data.careers[0].terms === 1 && mira.data.careers[0].title === "Ensign", `built: ${JSON.stringify({ upp: mira.data.upp, age: mira.data.age, careers: mira.data.careers })}`);
assert(mira.data.skills["pilot-spacecraft"].level === 1 && mira.data.skills.leadership.level === 1 && Object.values(mira.data.inventorylist).some((item) => item.name === "Laser Pistol") && Object.values(mira.data.coins)[0].amount === 5000 && /Contact/.test(mira.data.contacts) && /The lifepath:/.test(mira.data.notes), "skills, the laser pistol, Cr5000, the contact, the lifepath in the notes");
assert(agent.chatLog(50).some((line) => /\[LIFEPATH\] Mira Sol: 8A7B96, age 22, Navy 1 \(Ensign\)/.test(line.text ?? "")), "the table hears of it");

// Forty with the table's dice, every answer at random.
let built40 = 0;
let terms = 0;
const careersSeen = new Set();
for (let run = 0; run < 40; run++) {
  agent.dice.force([]);
  let now = (await tool("kraken_traveller_lifepath", { action: "start", owner: "Bob", name: `Random ${run}` })).life;
  for (let guard = 0; guard < 300 && !now.done; guard++) {
    const p = now.pending;
    assert(p && !p.error, `stuck or refused: ${JSON.stringify(p)}`);
    const any = (list) => list[Math.floor(Math.random() * list.length)];
    const input =
      p.kind === "arrange" ? { keep: true } : p.kind === "pick" ? { picks: p.options.slice(0, p.count) } : p.kind === "career" ? (() => { const career = any(p.careers); return { career: career.name, assignment: any(career.assignments).key }; })() : { choice: p.options.includes("Finish") && now.terms < 2 ? "Another career" : any(p.options) };
    now = (await tool("kraken_traveller_lifepath", { action: "answer", owner: "Bob", input })).life;
  }
  assert(now.done, `run ${run} did not finish`);
  now.careers.forEach((career) => careersSeen.add(career.career));
  const gear = now.items.map((kind) => (kind === "armour" ? "Mesh" : kind === "blade" ? "Dagger" : "Autopistol"));
  const made = await tool("kraken_traveller_lifepath", { action: "build", owner: "Bob", build: { gear } });
  const record = agent.records.get(made.id);
  assert(record.data.age === now.age && record.data.upp.length === 6, `run ${run} built: ${record.data.upp} ${record.data.age}`);
  built40 += 1;
  terms += now.terms;
}
await server.close?.();
console.log(`ok lifepath: Mira Sol by fixed dice (characteristics kept, four background skills, the Navy by INT, basic training, Pilot (Spacecraft) from the Specialist table, survival, a Life Event's Contact, a commission as Ensign with Melee (Blade) and Leadership, two benefit rolls: Cr5000 and a laser pistol; built 8A7B96, age 22); ${built40} random lifepaths built (${terms} terms; careers ${[...careersSeen].sort().join(", ")})`);
process.exit(0);
