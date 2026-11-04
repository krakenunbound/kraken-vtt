// The setup screen's Copy buttons (addresses to give your players): a click
// puts the address on the clipboard and the button says "Copied".
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-copy-ui-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const failures = [];
try {
  const page = await app.firstWindow();
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (line) => line.type() === "error" && failures.push(line.text()));
  await page.waitForSelector("text=My Campaigns");
  await app.evaluate(({ clipboard }) => clipboard.writeText("nothing yet"));
  // A campaign to host, so the host form (with its addresses) shows.
  await page.click('[data-action="campaigns-mode"]');
  await page.fill('input[name="new-campaign"]', "Copy test");
  await page.locator('form[data-form="create"]').evaluate((form) => form.requestSubmit());
  await page.waitForSelector('form[data-form="play"]');
  await page.waitForSelector("summary:has-text('Addresses to give your players')");
  await page.click("summary:has-text('Addresses to give your players')");
  const button = page.locator(".addr-copy").first();
  await button.waitFor();
  const label = await button.getAttribute("aria-label");
  const address = label.replace(/^Copy \S+ /, "");
  await button.click();
  let copied = "";
  for (let wait = 0; wait < 20 && copied !== address; wait++) {
    copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    if (copied !== address) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(copied === address, `the clipboard holds ${address}: ${JSON.stringify(copied)} ${failures.join(" | ")}`);
  assert((await button.textContent()).trim() === "Copied", `the button says Copied: ${await button.textContent()}`);
  assert(failures.length === 0, `page errors: ${failures.join(" | ")}`);
  console.log(`ok copy ui: Copy puts ${address} on the clipboard and the button says Copied`);
} finally {
  await app.close();
}
