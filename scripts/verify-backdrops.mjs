// The start screen's painted scenes: one picked at random each time Kraken
// opens, and never the same twice running; a dot for each scene at the
// bottom, the current one lit; clicking a dot brings its scene, with its own
// lights and particles. A screenshot of each in the temp folder.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-backdrops-"));
const launch = () => electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env: { ...process.env, KRAKEN_AGENT_PORT: "0", KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT ?? "", KRAKEN_AGENT_FILE: path.join(profile, "agent.json") } });
let app = await launch();
const failures = [];
try {
  let page = await app.firstWindow();
  page.on("pageerror", (error) => failures.push(error.message));
  await page.waitForSelector("[data-backdrop]");
  const first = await page.getAttribute("[data-backdrop]", "data-backdrop");
  const dots = await page.$$eval("[data-backdrop-dot]", (all) => all.map((dot) => dot.getAttribute("data-backdrop-dot")));
  assert(dots.length === 6, `six dots: ${dots}`);
  assert((await page.getAttribute(`[data-backdrop-dot="${first}"]`, "aria-current")) === "true", "the current scene's dot is lit");
  const shots = [];
  for (const id of dots) {
    await page.click(`[data-backdrop-dot="${id}"]`);
    await page.waitForSelector(`[data-backdrop="${id}"]`);
    const lights = await page.$$eval(".backdrop-light", (all) => all.length);
    assert(lights >= 3, `${id} has its lights: ${lights}`);
    await page.waitForTimeout(2600);
    const shot = path.join(tmpdir(), `kraken-backdrop-${id}.png`);
    await page.screenshot({ path: shot });
    shots.push(shot);
  }
  // Opened again, a different scene.
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.waitForSelector("[data-backdrop]");
  const second = await page.getAttribute("[data-backdrop]", "data-backdrop");
  assert(second !== first, `a different scene the next time: ${first} then ${second}`);
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok backdrops: six scenes (${dots.join(", ")}), each with its lights; opened with ${first}, then ${second}; ${shots[0]} ...`);
} finally {
  await app.close();
}
