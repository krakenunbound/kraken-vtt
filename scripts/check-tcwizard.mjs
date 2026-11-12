// Traveller's character wizard: the GM's own FG extension KrakenCharWizardMGT2
// (its term engine and career tables, read from the FG extensions folder or
// Kraken's copy beside the packs) run in Kraken through its tool, with the
// table's dice: characteristics rolled and swapped, the species, background
// skills, careers term by term to mustering out (answers at random, staying
// several terms), benefits' items chosen, a Connection, starting gear bought
// with the cash left, the Traveller built. Twelve Travellers. Skipped (with a
// note) on a computer without the extension or its copy.
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { available } = require("../electron/tcwizard.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
if (!available()) {
  console.log("skipped tcwizard: the GM's KrakenCharWizardMGT2 extension is not on this computer");
  process.exit(0);
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
const wiz = (action, more = {}) => tool("kraken_traveller_lifepath", { action, owner: "Ann", ...more }).then((result) => result.life ?? result);
const any = (list) => list[Math.floor(Math.random() * list.length)];

// A player (not the GM) rolls the characteristics once (FG: only the host may re-roll), and the
// steps take only what the wizard's pages offer.
{
  const { lifeAction } = require("../electron/mgt2.cjs");
  const seat = { role: "dm", name: "Bo", player: true };
  const as = (body) => lifeAction(agent, "Bo", body, seat).then((result) => result.life);
  const refused = (body) => as(body).then(() => false, () => true);
  let life = await as({ action: "start", name: "Bo" });
  life = await as({ action: "call", fn: "rollCharacteristics" });
  assert(life.rolled === 6 && !life.canReroll, `a player cannot re-roll: ${life.canReroll}`);
  assert(await refused({ action: "call", fn: "selectSpecies", args: ["item.id-2"] }), "a species from the list only");
  assert(await refused({ action: "call", fn: "applyConnection", args: [3, "Pilot"] }), "Connections 1 and 2 only");
  assert(await refused({ action: "call", fn: "setConnection", args: [1, "applied", false] }), "a Connection's name only");
  assert(await refused({ action: "call", fn: "chooseOption", args: [99] }), "an answer the page shows");
  assert(await refused({ action: "call", fn: "chooseBenefitItem", args: [1, "item.id-1"] }), "a benefit item from its own choices");
  // The GM's own wizard (and the agent's) may re-roll; a player named "GM" has a wizard of their own.
  const gm = (await lifeAction(agent, "", { action: "start" }, agent.seat)).life;
  const gmRolled = (await lifeAction(agent, "", { action: "call", fn: "rollCharacteristics" }, agent.seat)).life;
  assert(gm && gmRolled.canReroll, "the GM may re-roll");
  const named = (await lifeAction(agent, "GM", { action: "view" }, { role: "dm", name: "GM", player: true })).life;
  assert(named === null, "a player called GM does not see the GM's wizard");
  await as({ action: "cancel" });
  await lifeAction(agent, "", { action: "cancel" }, agent.seat);
}

let made = 0;
let terms = 0;
const careersSeen = new Set();
for (let run = 0; run < 12; run++) {
  let life = await wiz("start", { name: `Traveller ${run}` });
  assert(life.tab === "characteristics" && life.rolled === 0, "the wizard starts on Characteristics");
  life = await wiz("call", { fn: "rollCharacteristics" });
  assert(life.rolled === 6 && life.stats.every((stat) => stat.value >= 2 && stat.value <= 12), `six 2D rolls: ${JSON.stringify(life.stats)}`);
  const [a, b] = [life.stats[0], life.stats[3]];
  life = await wiz("call", { fn: "swapScores", args: [a.key, b.key] });
  assert(life.stats[0].base === b.base && life.stats[3].base === a.base, "two scores swapped");
  life = await wiz("call", { fn: "selectSpecies", args: [life.species[0].path] });
  for (const skill of life.background.slice(run % 5, run % 5 + life.bgAllowed)) life = await wiz("call", { fn: "toggleBackground", args: [skill, true] });
  assert(life.bgChosen === life.bgAllowed, `background skills: ${life.bgChosen} of ${life.bgAllowed}`);
  life = await wiz("call", { fn: "showTab", args: ["careers"] });
  assert(life.started && life.task, "the first term begins");
  for (let guard = 0; guard < 500 && !life.done; guard++) {
    const options = life.task?.options.map((option, index) => ({ ...option, n: index + 1 })).filter((option) => !option.disabled) ?? [];
    if (!options.length) {
      life = await wiz("call", { fn: "retryRoll" });
      assert(life.task, `stuck: ${JSON.stringify(life.task)}`);
      continue;
    }
    // Stay several terms: finish only from age 30.
    const finish = options.find((option) => /finish|stop/i.test(option.label));
    let pick = any(options);
    if (finish && life.age >= 30) pick = finish;
    else if (finish && options.length > 1) pick = any(options.filter((option) => option !== finish));
    life = await wiz("call", { fn: "chooseOption", args: [pick.n] });
  }
  assert(life.done, `run ${run}: the careers ended`);
  for (const benefit of life.benefits.filter((item) => item.kind === "item" && item.choices?.length)) life = await wiz("call", { fn: "chooseBenefitItem", args: [benefit.index, benefit.choices[0].path] });
  for (const [index, injury] of (life.injuries ?? []).entries()) {
    if (injury.cover === undefined) life = await wiz("call", { fn: "rollMedical", args: [index + 1] });
    life = await wiz("call", { fn: "settleMedical", args: [index + 1, true] });
  }
  life = await wiz("call", { fn: "applyConnection", args: [1, "Streetwise"] });
  const cash = life.finalCash;
  const buy = cash >= 300 ? [["Autopistol", 1], ["Backpack", 1]] : cash >= 25 ? [["Backpack", 1]] : [];
  const built = await tool("kraken_traveller_lifepath", { action: "build", owner: "Ann", build: { name: `Traveller ${run}`, gender: "any", homeworld: "Regina", buy } });
  const record = agent.records.get(built.id);
  assert(record && record.owner === "Ann" && record.data.upp.length === 6 && record.data.age === life.age, `built: ${JSON.stringify({ upp: record?.data.upp, age: record?.data.age })}`);
  assert(Object.keys(record.data.skills).length >= life.bgAllowed, "skills on the sheet");
  for (const [itemName] of buy) assert(Object.values(record.data.inventorylist).some((item) => item.name === itemName), `${itemName} bought`);
  const credits = Object.values(record.data.coins ?? {}).reduce((sum, coin) => sum + Number(coin.amount || 0), 0);
  const spent = buy.reduce((sum, [itemName]) => sum + ({ Autopistol: 200, Backpack: 25 }[itemName] ?? 0), 0);
  assert(credits === Math.max(0, cash) - spent, `the cash left: ${credits} vs ${cash} - ${spent}`);
  assert(/CREATION LOG/.test(record.data.notes) && /UPP/.test(record.data.appearance ?? ""), "the creation log in the notes, the UPP in the background");
  record.data.careers.forEach((career) => careersSeen.add(career.name));
  terms += record.data.careers.reduce((sum, career) => sum + career.terms, 0);
  made += 1;
}
assert(agent.chatLog(400).some((line) => /\[TRAVELLER CREATION\]/.test(line.roll?.label ?? line.text ?? "")), "the rolls went to chat");
await server.close?.();
console.log(`ok tcwizard: the GM's KrakenCharWizardMGT2 run in Kraken: ${made} Travellers (rolled and swapped characteristics, species, background, ${terms} career terms through ${[...careersSeen].sort().join(", ")}, benefits' items, medical care, a Connection, gear bought with the cash left)`);
process.exit(0);
