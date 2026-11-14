// How long a big map takes to decode in Chrome (Kraken's window decodes the
// same way): each file in a folder, five times, as an <img> decoded on the main
// thread (what blocks), with img.decode() (off it), and with createImageBitmap
// in a worker. Usage: node scripts/probe-decode.mjs <folder>. (A probe, not a check.)
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { CHROME } from "./lib/chrome.mjs";

const folder = process.argv[2];
const files = readdirSync(folder).filter((name) => /\.(webp|jpe?g|png|avif)$/i.test(name));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--mute-audio", "--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.join(folder, files[0])).href);
for (const name of files) {
  const url = pathToFileURL(path.join(folder, name)).href;
  const result = await page.evaluate(async (src) => {
    const bytes = await (await fetch(src)).blob();
    const rounds = [];
    for (let round = 0; round < 5; round++) {
      const blobUrl = URL.createObjectURL(bytes);
      // Main thread: the picture drawn the moment it is put on the page (decode + paint block the frame).
      const image = new Image();
      image.src = blobUrl;
      await new Promise((resolve) => (image.onload = resolve));
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const start = performance.now();
      canvas.getContext("2d").drawImage(image, 0, 0, 64, 64);
      const blocking = performance.now() - start;
      // Off the main thread: decode() first.
      const other = new Image();
      other.src = blobUrl;
      const decodeStart = performance.now();
      await other.decode();
      const decoded = performance.now() - decodeStart;
      // A worker's createImageBitmap.
      const worker = new Worker(URL.createObjectURL(new Blob(["onmessage = async (e) => { const t = performance.now(); const bitmap = await createImageBitmap(e.data); postMessage([performance.now() - t, bitmap.width]); bitmap.close(); }"], { type: "text/javascript" })));
      const [inWorker] = await new Promise((resolve) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.postMessage(bytes);
      });
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
      rounds.push({ blocking, decoded, inWorker });
    }
    const middle = (key) => rounds.map((item) => item[key]).sort((a, b) => a - b)[2];
    return { size: bytes.size, blocking: middle("blocking"), decoded: middle("decoded"), inWorker: middle("inWorker") };
  }, url);
  console.log(`${name.padEnd(16)} ${String(Math.round(statSync(path.join(folder, name)).size / 1024)).padStart(6)} KB   on the main thread ${Math.round(result.blocking)} ms   img.decode() ${Math.round(result.decoded)} ms   worker ${Math.round(result.inWorker)} ms`);
}
await browser.close();
