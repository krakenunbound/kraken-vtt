// Kraken's updater against the real GitHub releases: an older built Kraken
// (KRAKEN_APP, its app-update.yml naming krakenunbound/kraken-vtt) finds the
// newest release on its start screen, downloads its installer and checks it
// (it does not install). Run after a release is published, with an older
// build; skipped without one.
import "./loopback.mjs";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
if (!process.env.KRAKEN_APP || !existsSync(process.env.KRAKEN_APP)) {
  console.log("skip updater github: KRAKEN_APP names no older built Kraken");
  process.exit(0);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-updater-github-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0", KRAKEN_BOOKS: path.join(profile, "no-fg-modules"), KRAKEN_PACKS: path.join(profile, "packs"), LOCALAPPDATA: path.join(profile, "local") };
delete env.KRAKEN_UPDATE_URL;
const app = await electron.launch({ executablePath: process.env.KRAKEN_APP, args: ["--mute-audio", `--user-data-dir=${profile}`], env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector("text=My Campaigns");
  await page.waitForSelector('.update-notice[data-update="available"]', { timeout: 60000 });
  const found = await page.textContent(".update-notice");
  const wanted = process.env.KRAKEN_EXPECT_VERSION;
  assert(!wanted || found.includes(wanted), `the start screen names ${wanted}: ${found}`);
  await page.click('[data-action="update-download"]');
  await page.waitForSelector('.update-notice[data-update="ready"]', { timeout: 600000 });
  assert(await page.$('[data-action="update-install"]'), "Restart and install is offered");
  console.log(`ok updater github: the older Kraken found and downloaded the newest release from GitHub (${found.replace(/\s+/g, " ").slice(0, 80)})`);
} finally {
  await app.close();
}
