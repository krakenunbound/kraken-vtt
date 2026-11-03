import { chromium } from "playwright-core";

const zipPath = String.raw`G:\TTRPG Books (pdf)\Professional Maps\Troll Trouble (prepared Foundry).zip`;
const shotFit = String.raw`C:\Users\THEKRA~1\AppData\Local\Temp\kraken-vtt-fit.png`;
const shotZoom = String.raw`C:\Users\THEKRA~1\AppData\Local\Temp\kraken-vtt-zoom.png`;
const chrome = String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
const tabs = await page.getByRole("tab").allTextContents();
assert(tabs.join("|") === "Table|Party|Library|Audio|Encounters", `tabs ${tabs.join("|")}`);

await page.getByLabel("Map bundle").setInputFiles(zipPath);
await page.waitForFunction(
  () => document.querySelector(".toolbar")?.getAttribute("data-adventure") === "Troll's Pot Morning",
  null,
  { timeout: 60000 },
);
await page.waitForFunction(() => {
  const image = document.querySelector(".world img");
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth === 9300 && image.naturalHeight === 7500;
}, null, { timeout: 30000 });

const gridLabel = (await page.locator(".grid-label").textContent())?.trim();
assert(gridLabel === "Square · 150 px · 5 ft", `grid label ${gridLabel}`);
const lines = await page.locator("svg.grid line").count();
assert(lines === 114, `grid lines ${lines}`);
const legend = page.locator(".legend");
assert((await legend.getAttribute("data-walls")) === "141", "wall count");
assert((await legend.getAttribute("data-normal")) === "20", "normal walls");
assert((await legend.getAttribute("data-invisible")) === "56", "see-through");
assert((await legend.getAttribute("data-terrain")) === "51", "terrain");
assert((await legend.getAttribute("data-ethereal")) === "14", "los walls");
assert((await page.locator("g.wall").count()) === 141, "drawn walls");

const aligned = await page.evaluate(() => {
  const image = document.querySelector(".world img")?.getBoundingClientRect();
  const grid = document.querySelector("svg.grid")?.getBoundingClientRect();
  if (!image || !grid) return null;
  return {
    dx: Math.abs(image.left - grid.left),
    dy: Math.abs(image.top - grid.top),
    dw: Math.abs(image.width - grid.width),
    dh: Math.abs(image.height - grid.height),
  };
});
assert(aligned && aligned.dx < 1 && aligned.dy < 1 && aligned.dw < 1 && aligned.dh < 1, `alignment ${JSON.stringify(aligned)}`);

const sceneName = await page.locator(".viewport").getAttribute("data-scene");
assert(sceneName === "Troll's Pot Morning", `scene ${sceneName}`);

const scaleBefore = Number(await page.locator(".world").getAttribute("data-scale"));
await page.getByRole("button", { name: "Zoom in" }).click();
const scaleAfter = Number(await page.locator(".world").getAttribute("data-scale"));
assert(scaleAfter > scaleBefore, `zoom ${scaleBefore} -> ${scaleAfter}`);

const transformBefore = await page.locator(".world").getAttribute("style");
const box = await page.locator(".viewport").boundingBox();
assert(box, "viewport missing");
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 70);
await page.mouse.up();
const transformAfter = await page.locator(".world").getAttribute("style");
assert(transformBefore !== transformAfter, "pan did not move the map");

await page.getByRole("button", { name: "Fit" }).click();
await page.screenshot({ path: shotFit });

await page.getByRole("button", { name: "Zoom in" }).click();
await page.getByRole("button", { name: "Zoom in" }).click();
await page.getByRole("button", { name: "Zoom in" }).click();
await page.getByRole("button", { name: "Zoom in" }).click();
await page.screenshot({ path: shotZoom });

for (const name of ["Party", "Library", "Audio", "Encounters"]) {
  await page.getByRole("tab", { name }).click();
  const heading = (await page.getByRole("heading", { level: 1 }).textContent())?.trim();
  assert(heading === name, `placeholder ${name} showed ${heading}`);
}
await page.getByRole("tab", { name: "Table" }).click();
assert((await page.locator(".viewport").getAttribute("data-scene")) === "Troll's Pot Morning", "map lost after tabs");

await page.getByLabel("Scene").selectOption({ label: "Troll's Pot Morning Empty" });
await page.waitForFunction(
  () => document.querySelector(".viewport")?.getAttribute("data-scene") === "Troll's Pot Morning Empty",
);
await page.waitForFunction(() => {
  const image = document.querySelector(".world img");
  return image instanceof HTMLImageElement && image.complete && image.naturalWidth === 9300;
});
await page.getByLabel("Scene").selectOption({ label: "Troll's Pot Morning" });
await page.waitForFunction(
  () => document.querySelector(".viewport")?.getAttribute("data-scene") === "Troll's Pot Morning",
);

await page.getByLabel("Adventure").selectOption({ label: "Troll's Pot Night" });
await page.waitForFunction(() => document.querySelector(".legend")?.getAttribute("data-lights") === "2");
await page.waitForFunction(() => document.querySelectorAll(".light").length === 2);

await page.getByLabel("Map bundle").setInputFiles(String.raw`G:\TTRPG Books (pdf)\Professional Maps\Dirty Rotten Looters (Prepared Foundry).zip`);
await page.waitForFunction(() => Number(document.querySelector(".legend")?.getAttribute("data-door") ?? 0) > 0, null, {
  timeout: 60000,
});
const door = page.locator(".door").first();
const fillBefore = await door.getAttribute("fill");
await door.click({ force: true });
const fillAfter = await door.getAttribute("fill");
assert(fillBefore !== fillAfter, `door fill stayed ${fillBefore}`);

assert(failures.length === 0, `page errors ${failures.join(" | ")}`);
await browser.close();
console.log(`ok fit=${shotFit}`);
console.log(`ok zoom=${shotZoom}`);
