// Pop-out windows in the Electron app: a panel's window ("kraken-popout-*",
// about:blank) opens as a real window that the page draws into; any other
// window.open is refused.
import "./loopback.mjs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profile = mkdtempSync(path.join(tmpdir(), "kraken-popout-"));
const app = await electron.launch({
  args: [".", "--mute-audio", `--user-data-dir=${profile}`],
  env: { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" },
});
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const result = await page.evaluate(() => {
    const child = window.open("", "kraken-popout-test", "popup=yes,width=500,height=300,left=40,top=40");
    const other = window.open("https://example.com", "elsewhere");
    if (child) {
      child.document.body.innerHTML = "<p id=hello>drawn by the table</p>";
    }
    return { child: Boolean(child), text: child?.document.getElementById("hello")?.textContent, other: Boolean(other) };
  });
  assert(result.child && result.text === "drawn by the table", `pop-out opened and drawn into: ${JSON.stringify(result)}`);
  assert(!result.other, "other windows refused");
  await page.waitForTimeout(300);
  assert(app.windows().length === 2, `two windows: ${app.windows().length}`);
  const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((win) => win.getContentSize()));
  assert(size.some(([w, h]) => w === 500 && h === 300), `content size as asked: ${JSON.stringify(size)}`);
  // Owned by the table's window, so a click on the table never puts the table over it.
  const owned = await app.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows();
    const child = all.find((win) => win.getParentWindow());
    return { parent: child?.getParentWindow()?.id ?? null, others: all.filter((win) => win !== child).map((win) => win.id) };
  });
  assert(owned.parent !== null && owned.others.includes(owned.parent), `the pop-out is owned by the table's window: ${JSON.stringify(owned)}`);
  console.log("POPOUT_OK");
} finally {
  await app.close();
}
