// A Kraken of its own for Map Studio's agent tools (check-studio-tools.mjs and
// the map build scripts): the app launched with a throwaway profile (no FG
// modules, so the library is Kraken's shipped packs and nothing else), its MCP
// server, a campaign hosted. tool(name, args) calls any Kraken tool; studio(action,
// args) calls kraken_map_studio. Windows open at KRAKEN_WINDOW_AT (default
// -2500,40: the left monitor) with sound off.
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron } from "playwright-core";

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startKraken({ name = "Map Studio tools", ruleset = "Ironsworn", port = 47461 } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), "kraken-studio-tools-"));
  const env = { ...process.env, KRAKEN_WINDOW_AT: process.env.KRAKEN_WINDOW_AT || "-2500,40", KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs") };
  const app = process.env.KRAKEN_APP
    ? await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env })
    : await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1700, height: 1000 }).catch(() => undefined);
  await page.waitForSelector("text=My Campaigns", { timeout: 60000 });
  const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
  const answers = new Map();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    answers.get(message.id)?.(message);
  });
  let nextId = 0;
  const rpc = (method, params, timeout = 300000) => {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), timeout);
      answers.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };
  // A tool's answer: its JSON parsed (the first text part), with any picture as .image.
  async function tool(toolName, args = {}) {
    const result = await rpc("tools/call", { name: toolName, arguments: args });
    const text = result.content?.find((part) => part.type === "text")?.text ?? "";
    if (result.isError) throw new Error(`${toolName} ${args.action ?? ""}: ${text}`);
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      value = text;
    }
    const image = result.content?.find((part) => part.type === "image");
    if (image && value && typeof value === "object") value.image = image.data;
    return value;
  }
  for (let tries = 0; ; tries++) {
    try {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "studio-tools", version: "1" } }, 5000);
      break;
    } catch (error) {
      if (tries > 30) throw error;
      await settle(500);
    }
  }
  const campaign = await tool("kraken_campaign_create", { name, ruleset });
  await tool("kraken_host", { campaignId: campaign.id, port, password: "pw" });
  await page.waitForSelector("text=Hosting", { timeout: 60000 });
  const studio = (action, args = {}) => tool("kraken_map_studio", { action, ...args });
  // Map Studio's page inside Kraken's window, once it is open.
  const studioFrame = () => page.frames().find((frame) => /^http:\/\/127\.0\.0\.1:\d+\//.test(frame.url()));
  async function close() {
    child.kill();
    await app.close().catch(() => undefined);
  }
  return { app, page, profile, tool, studio, studioFrame, close };
}
