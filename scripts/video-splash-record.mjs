// Records the raw footage for the YouTube splash: Maelstrom full screen (the monitor's real size),
// a hosted table with no map, the hex grid and the emblem on the desktop, and a cascade of fancy
// dice rolled across it. The screen is captured with FFmpeg (gdigrab) at 60 fps.
//   node scripts/video-splash-record.mjs <out.mp4>   (KRAKEN_WINDOW_AT picks the monitor)
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const OUT = path.resolve(process.argv[2] || "splash-raw.mp4");
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), "kraken-video-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
// Full screen on its monitor, at the monitor's own size: never the default window.
const screen = await app.evaluate(async ({ BrowserWindow, screen }) => {
  const win = BrowserWindow.getAllWindows()[0];
  const display = screen.getDisplayMatching(win.getBounds());
  win.setFullScreen(true);
  win.focus();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return { x: display.bounds.x, y: display.bounds.y, width: display.size.width, height: display.size.height };
});
console.log("screen", screen);
await page.waitForSelector("text=My Campaigns");
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  answers.get(message.id)?.(message);
});
let nextId = 0;
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = ++nextId;
  answers.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
});
const tool = (name, args = {}) => rpc("tools/call", { name, arguments: args });
for (let tries = 0; ; tries++) {
  try { await Promise.race([rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "video", version: "1" } }), settle(4000).then(() => { throw new Error("slow"); })]); break; } catch (e) { if (tries > 30) throw e; await settle(500); }
}
const campaign = JSON.parse((await tool("kraken_campaign_create", { name: "Maelstrom", ruleset: "Descending Darkness" })).content[0].text);
await tool("kraken_host", { campaignId: campaign.id, port: 47491, password: "" });
await page.waitForSelector("text=Hosting");
// A clear desktop: every window closed, the mouse out of the way.
await page.evaluate(() => document.querySelectorAll('section.window button[aria-label^="Close "]').forEach((b) => b.click()));
await page.mouse.move(screen.width - 4, screen.height - 4);
await settle(2500);

const ffmpeg = spawn("ffmpeg", ["-y", "-f", "gdigrab", "-framerate", "60", "-offset_x", String(screen.x), "-offset_y", String(screen.y), "-video_size", `${screen.width}x${screen.height}`, "-draw_mouse", "0", "-i", "desktop", "-c:v", "h264_nvenc", "-preset", "p5", "-cq", "18", "-pix_fmt", "yuv420p", OUT], { stdio: ["pipe", "ignore", "ignore"] });
await settle(1500);
const throws = [["Gilded", "1d20"], ["Aether Core", "1d12"], ["Classic Ruby", "2d6"], ["Emerald Cut", "1d10"], ["Molten Gold", "1d8"], ["Starfall", "1d20"], ["Kraken Deep", "1d4"]];
for (const [preset, formula] of throws) {
  await tool("kraken_dice_settings", { preset });
  await tool("kraken_roll", { formula });
  await settle(450);
}
await settle(6500);
ffmpeg.stdin.write("q");
await new Promise((resolve) => ffmpeg.on("close", resolve));
console.log("recorded", OUT);
child.kill();
await app.close().catch(() => undefined);
