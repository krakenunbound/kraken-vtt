// The campaign screen's ruleset picker: more columns as the window widens,
// every ruleset with its emblem, the GM's own picture for one (from
// assets/rulesets in their data) in place of Kraken's, and the chosen one's
// whole description below the tiles. Screenshots at each size (SHOT_DIR).
import "./loopback.mjs";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

const profile = mkdtempSync(path.join(tmpdir(), "kraken-rulesets-shot-"));
const own = path.join(profile, "assets", "rulesets");
mkdirSync(own, { recursive: true });
const tokens = path.join("games", "tokens", "Dwarf");
const token = readdirSync(tokens).find((name) => /\.(png|webp)$/i.test(name));
if (token) copyFileSync(path.join(tokens, token), path.join(own, `Worldbuilding${path.extname(token)}`));
const out = process.env.SHOT_DIR || tmpdir();
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const columnsAt = {};
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env: { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" } });
try {
  const page = await app.firstWindow();
  await page.waitForSelector("text=My Campaigns");
  await page.click('[data-action="campaigns-mode"]');
  await page.waitForSelector(".ruleset-tile");
  for (const [width, height] of [[1450, 900], [1920, 1080], [2560, 1300], [1100, 800]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]), [width, height]);
    await page.waitForTimeout(600);
    const file = path.join(out, `rulesets-${width}.png`);
    await page.screenshot({ path: file });
    const columns = await page.evaluate(() => getComputedStyle(document.querySelector(".ruleset-tiles")).gridTemplateColumns.split(" ").length);
    columnsAt[width] = columns;
  }
  assert(columnsAt[1100] <= 2 && columnsAt[1920] >= 5 && columnsAt[2560] > columnsAt[1920], `more columns on a wider window: ${JSON.stringify(columnsAt)}`);
  const tiles = await page.$$eval(".ruleset-tile", (all) => all.map((tile) => ({ name: tile.dataset.ruleset, emblem: Boolean(tile.querySelector(".ruleset-emblem")), own: Boolean(tile.querySelector("img.ruleset-emblem.own")) })));
  assert(tiles.length >= 8 && tiles.every((tile) => tile.emblem), "every ruleset has its emblem");
  assert(tiles.find((tile) => tile.name === "Worldbuilding")?.own && tiles.filter((tile) => tile.own).length === 1, "the GM's own picture for Worldbuilding, Kraken's for the rest");
  await page.click('[data-ruleset="D&D 3.5E"]');
  await page.waitForSelector('[data-ruleset-about="D&D 3.5E"]');
  assert((await page.textContent(".ruleset-about")).includes("Player's Handbook"), "the chosen ruleset's whole description");
  console.log(`ok rulesets ui: columns by width ${JSON.stringify(columnsAt)}; ${tiles.length} emblems, the GM's own for Worldbuilding; the chosen one described`);
} finally {
  await app.close();
}
