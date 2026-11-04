// The GM's name is kept with the campaign: the GM types "The Kraken" and
// presses Play, sits at the table under it, leaves; the name is still in the
// field, and still there after the app is closed and opened again. A second
// campaign keeps its own (DM until it is played under another).
import "./loopback.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-gmname-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const open = async () => {
  const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  const page = await app.firstWindow();
  await page.waitForSelector("text=My Campaigns");
  await page.click('[data-action="campaigns-mode"]');
  return { app, page };
};
const field = 'form[data-form="play"] input[name="dm-name"]';

let { app, page } = await open();
try {
  for (const name of ["Night Below", "Saltmarsh"]) {
    if (await page.$('form[data-form="play"]')) await page.click('[data-action="new-campaign"]');
    await page.fill('input[name="new-campaign"]', name);
    await page.locator('form[data-form="create"]').evaluate((form) => form.requestSubmit());
    await page.waitForSelector('form[data-form="play"]');
  }
  await page.click('button[data-campaign="Night Below"]');
  await page.waitForSelector(field);
  assert((await page.inputValue(field)) === "DM", "a new campaign starts as DM");
  await page.fill(field, "The Kraken");
  await page.fill('form[data-form="play"] input[name="port"]', "47396");
  await page.click('[data-action="play"]');
  await page.waitForSelector(".sidebar", { timeout: 20000 });
  await page.click('.sidebar [data-launch="players"]');
  await page.waitForSelector('.roster-list li[data-role="dm"]:has-text("The Kraken")', { timeout: 10000 });
  await page.click('button:has-text("Leave")');
  await page.waitForSelector("text=My Campaigns");
  await page.click('[data-action="campaigns-mode"]').catch(() => undefined);
  await page.click('button[data-campaign="Night Below"]');
  await page.waitForSelector(field);
  assert((await page.inputValue(field)) === "The Kraken", `after leaving: ${await page.inputValue(field)}`);
  await page.click('button[data-campaign="Saltmarsh"]');
  await page.waitForFunction((selector) => document.querySelector(selector)?.value === "DM", field, { timeout: 5000 });

  // Closed and opened again.
  await app.close();
  ({ app, page } = await open());
  await page.click('button[data-campaign="Night Below"]');
  await page.waitForSelector(field);
  assert((await page.inputValue(field)) === "The Kraken", `after a restart: ${await page.inputValue(field)}`);
  console.log("ok gmname ui: the GM's name is kept with the campaign (The Kraken at the table, after leaving, after a restart; another campaign keeps its own DM)");
} finally {
  await app.close();
}
