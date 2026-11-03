// The front screen in a narrow window and a wide one: "New campaign" brings
// the new-campaign form into view with its name field ready to type in, from
// the list and from a selected campaign. node scripts/check-setup.mjs [folder for screenshots]
import "./loopback.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const shots = process.argv[2];
const profile = mkdtempSync(path.join(tmpdir(), "kraken-setup-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector("text=My Campaigns");
  await page.click('[data-action="campaigns-mode"]');
  for (const name of ["Castles & Crusades", "Night Below", "Saltmarsh"]) {
    if (await page.$('form[data-form="play"]')) await page.click('[data-action="new-campaign"]');
    await page.fill('input[name="new-campaign"]', name);
    await page.locator('form[data-form="create"]').evaluate((form) => form.requestSubmit());
    await page.waitForSelector('form[data-form="play"]');
  }
  for (const [width, height] of [[522, 513], [1425, 860]]) {
    await page.setViewportSize({ width, height });
    await page.click('button[data-campaign="Night Below"]');
    await page.waitForSelector('form[data-form="play"]');
    await page.click('[data-action="new-campaign"]');
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const input = document.querySelector('input[name="new-campaign"]');
      const box = input?.getBoundingClientRect();
      return { focused: document.activeElement === input, inView: Boolean(box && box.top >= 0 && box.bottom <= window.innerHeight) };
    });
    assert(state.focused && state.inView, `${width}px: the new-campaign name is in view and ready (${JSON.stringify(state)})`);
    if (shots) await page.screenshot({ path: path.join(shots, `setup-${width}.png`) });
  }
  console.log("SETUP_OK");
} finally {
  await app.close();
}
