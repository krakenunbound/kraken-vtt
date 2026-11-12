// The GM's own AD&D 2E packs in the real app (a probe, not a check: it needs
// the GM's packs): a fresh profile, no FG modules folder; an AD&D 2E campaign
// with B2's 2E pack and the 2E pregens active; a pregen taken, a fighter
// built, B2's creatures on the tracker and a round of attacks. Screenshots go
// to the temp folder.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-2e-real-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: process.env.KRAKEN_PACKS || path.join(process.env.USERPROFILE || process.env.HOME || "", "Documents", "Kraken VTT", "Packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  answers.get(message.id)?.(message);
});
let nextId = 0;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    answers.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
const tool = async (name, args = {}) => {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
};
const listOf = (value) => (Array.isArray(value) ? value : value.records ?? []);
try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  const campaign = await tool("kraken_campaign_create", { name: "2E from packs", ruleset: "AD&D 2E" });
  await tool("kraken_host", { campaignId: campaign.id, port: 47452, password: "" });
  await page.waitForSelector("text=Hosting");
  const shelf = await tool("kraken_books", { action: "list" });
  const books = shelf.books ?? shelf;
  console.log(`2E shelf: ${books.length} books: ${books.map((book) => book.title).join(" | ")}`);
  for (const name of ["B2 The Keep on the Borderlands (AD&D 2E)", "Kraken's AD&D 2E One-Shot Pregens"]) {
    const started = performance.now();
    await tool("kraken_books", { action: "activate", book: name });
    console.log(`  ${name} active in ${Math.round(performance.now() - started)} ms`);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const npcs = listOf(await tool("kraken_records_list", { type: "npc" }));
  const pregens = listOf(await tool("kraken_records_list", { type: "pregencharsheet" })).filter((item) => item.name !== "public");
  console.log(`  records: ${npcs.length} creatures, ${pregens.length} pregens`);
  const kael = pregens.find((item) => item.name === "Kael the Red") ?? pregens[0];
  const taken = await tool("kraken_build_character", { spec: { pregen: kael.id } });
  console.log(`  ${kael.name}: ${JSON.stringify(taken)}`);
  const built = await tool("kraken_build_character", { spec: { name: "Lirael", race: "Elf", class: "Fighter/Mage/Thief", level: 3 } });
  console.log(`  Lirael: ${JSON.stringify(built)}`);
  for (const name of ["Ogre", "Mountain Lion", "Gnoll"]) {
    const found = npcs.find((item) => item.name === name || item.name.startsWith(name));
    if (found) await tool("kraken_combat", { action: "add", recordId: found.id });
  }
  await tool("kraken_combat", { action: "add", recordId: taken.id });
  await tool("kraken_combat", { action: "init", which: "all" });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  console.log(`  tracker (lowest first): ${view.map((entry) => `${entry.name} init ${entry.initresult} hp ${entry.hp} ac ${entry.ac}${entry.attacks ? ` [${entry.attacks.map((attack) => `${attack.name} ${attack.damage}`).join("; ")}]` : ""}`).join(" | ")}`);
  const mine = view.find((entry) => entry.recordId === taken.id);
  const foe = view.find((entry) => entry.attacks?.length);
  await tool("kraken_combat", { action: "target", id: mine.id, targetId: foe.id, on: true });
  const hero = await tool("kraken_record_get", { id: taken.id });
  const weapon = Object.keys(hero.data.attacks)[0];
  console.log(`  ${hero.name}: THAC0 ${hero.data.thaco}, AC ${hero.data.ac.total}, attacks ${Object.values(hero.data.attacks).map((attack) => `${attack.name} ${attack.tohit} ${attack.damage}/${attack.damagelarge}`).join("; ")}`);
  console.log(`  attack: ${JSON.stringify((await tool("kraken_combat", { action: "attack", recordId: taken.id, weapon })).results)}`);
  console.log(`  damage: ${JSON.stringify((await tool("kraken_combat", { action: "damage-roll", recordId: taken.id, weapon })).damage)}`);
  await tool("kraken_combat", { action: "target", id: foe.id, targetId: mine.id, on: true });
  console.log(`  ${foe.name} all attacks: ${JSON.stringify((await tool("kraken_combat", { action: "attack", id: foe.id, weapon: "0", full: true })).results)}`);
  console.log(`  save: ${JSON.stringify((await tool("kraken_combat", { action: "save", id: mine.id, attribute: "breath" })).save)}`);
  await page.click('.sidebar [data-launch="characters"]');
  await page.waitForSelector(".sheet-2e", { timeout: 15000 }).catch(() => undefined);
  await page.screenshot({ path: path.join(tmpdir(), "kraken-2e-real-sheet.png") });
  await tool("kraken_stop_host").catch(() => undefined);
  console.log(`screenshots: ${path.join(tmpdir(), "kraken-2e-real-*.png")}`);
} finally {
  child.kill();
  await app.close();
}
