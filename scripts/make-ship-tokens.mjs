// Makes Kraken's ship tokens (games/tokens/Ships/Ships <Design>.png) from the
// drawings in shared/starships/art.mjs, in headless Chrome (no window). Run
// it again after changing a drawing.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "games", "tokens", "Ships");
mkdirSync(out, { recursive: true });
const source = readFileSync(path.join(root, "shared", "starships", "art.mjs"), "utf8").replace(/^export /gm, "");
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.setContent("<canvas width=512 height=512></canvas>");
  const designs = await page.evaluate(`(() => { ${source}; window.__draw = drawShip; return SHIP_ART; })()`);
  for (const design of designs) {
    const data = await page.evaluate((name) => {
      const canvas = document.querySelector("canvas");
      window.__draw(canvas.getContext("2d"), name, 512);
      return canvas.toDataURL("image/png");
    }, design);
    const file = path.join(out, `Ships ${design}.png`);
    writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
    console.log(`made ${path.relative(root, file)}`);
  }
} finally {
  await browser.close();
}
