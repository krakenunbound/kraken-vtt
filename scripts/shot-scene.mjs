// Opens a Foundry bundle scene in the real Kraken app (throwaway profile) and
// screenshots the same world area Foundry shows, for side-by-side checks.
// node scripts/shot-scene.mjs <zip> <scene name> <centerX> <centerY> <worldWidthShown> <out.png>
import "./loopback.mjs";
import { _electron as electron } from "playwright-core";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [zip, sceneName, cx, cy, shownWidth, out] = process.argv.slice(2);
const profile = mkdtempSync(path.join(tmpdir(), "kraken-shot-"));
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd() });
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => {
  const win = BrowserWindow.getAllWindows()[0];
  win.setBounds({ x: 0, y: 0, width: 1600, height: 900 });
  win.show();
});
await page.waitForSelector("text=My Campaigns");
await page.fill('input[name="new-campaign"]', "Shot");
await page.locator('form[data-form="create"]').evaluate((form) => form.requestSubmit());
await page.waitForSelector('form[data-form="play"]');
await page.fill('form[data-form="play"] input[name="port"]', "47399");
await page.locator('form[data-form="play"]').evaluate((form) => form.requestSubmit());
await page.waitForSelector("text=Put a map on the table");
await page.setInputFiles("input.file-input", zip);
await page.waitForSelector("[data-scene]", { timeout: 120000 });
const scene = page.getByLabel("Scene");
if (await scene.count()) {
  const value = await scene.locator("option", { hasText: sceneName }).first().getAttribute("value");
  await scene.selectOption(value);
}
await page.waitForFunction((name) => document.querySelector("[data-scene]")?.getAttribute("data-scene") === name, sceneName);
await page.waitForFunction(() => { const img = document.querySelector(".world img"); return img && img.complete && img.naturalWidth > 0; }, null, { timeout: 60000 });
await page.evaluate(({ cx, cy, shownWidth }) => {
  const view = document.querySelector(".viewport").getBoundingClientRect();
  const scale = view.width / shownWidth;
  const world = document.querySelector(".world");
  world.style.transform = `translate(${view.width / 2 - cx * scale}px, ${view.height / 2 - cy * scale}px) scale(${scale})`;
}, { cx: Number(cx), cy: Number(cy), shownWidth: Number(shownWidth) });
await page.waitForTimeout(500);
await page.locator(".viewport").screenshot({ path: out });
const info = await page.evaluate(() => {
  const img = document.querySelector(".world img");
  return { left: img.style.left, top: img.style.top, width: img.style.width, height: img.style.height, natural: [img.naturalWidth, img.naturalHeight] };
});
console.log(JSON.stringify(info));
await app.close();
