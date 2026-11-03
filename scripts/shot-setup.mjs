// Screenshots of the front screens (campaigns, hosting, joining) in the real app:
// node scripts/shot-setup.mjs <folder>
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";
const out = process.argv[2];
const profile = mkdtempSync(path.join(tmpdir(), "kraken-shot-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1425, height: 860 });
await page.waitForSelector("text=My Campaigns");
for (const name of ["Castles & Crusades", "The Keep on the Borderlands", "Shadows over Saltmarsh"]) {
  await page.fill('input[name="new-campaign"]', name);
  await page.locator('form[data-form="create"]').evaluate((form) => form.requestSubmit());
  await page.waitForSelector('form[data-form="play"]');
  await page.click('[data-action="new-campaign"]');
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/campaigns.png` });
await page.click('button[data-campaign="The Keep on the Borderlands"]');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/host.png` });
await page.click('[data-action="join-mode"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/join.png` });
await app.close();
