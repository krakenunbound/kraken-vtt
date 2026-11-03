const fs = require("fs");

const PORT = 47321;
const PASSWORD = "table-secret";
const BUNDLE = String.raw`G:\TTRPG Books (pdf)\Professional Maps\Troll Trouble (prepared Foundry).zip`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function whenLoaded(win) {
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => win.webContents.once("did-finish-load", resolve));
  }
  await delay(50);
}

async function bodyText(win) {
  return win.webContents.executeJavaScript("document.body ? document.body.innerText : ''");
}

async function waitForText(win, needle, timeout = 8000) {
  const start = Date.now();
  let text = "";
  while (Date.now() - start < timeout) {
    text = await bodyText(win);
    if (text.toLowerCase().includes(needle.toLowerCase())) return text;
    await delay(50);
  }
  throw new Error(`Timed out waiting for "${needle}". Body: ${text.slice(0, 400)}`);
}

async function waitFor(win, expression, timeout, label) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await win.webContents.executeJavaScript(expression);
    if (last) return last;
    await delay(100);
  }
  const text = await bodyText(win);
  throw new Error(`${label}. Last=${JSON.stringify(last)} Body=${text.slice(0, 400)}`);
}

async function fill(win, selector, value) {
  const ok = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`Missing ${selector}`);
}

async function chooseBundle(win, filePath) {
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach("1.3");
  try {
    const doc = await dbg.sendCommand("DOM.getDocument", { depth: 0 });
    const found = await dbg.sendCommand("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: "input.file-input",
    });
    if (!found.nodeId) throw new Error("file input missing");
    await dbg.sendCommand("DOM.setFileInputFiles", { nodeId: found.nodeId, files: [filePath] });
  } finally {
    if (dbg.isAttached()) dbg.detach();
  }
}

async function run(hostWindow, createWindow) {
  await whenLoaded(hostWindow);
  await waitForText(hostWindow, "My Campaigns");
  await fill(hostWindow, 'form[data-form="create"] input[name="new-campaign"]', "E2E Table");
  await hostWindow.webContents.executeJavaScript('document.querySelector(\'form[data-form="create"]\').requestSubmit()');
  await waitForText(hostWindow, "public game");
  await fill(hostWindow, 'form[data-form="play"] input[name="dm-name"]', "DM");
  await fill(hostWindow, 'form[data-form="play"] input[name="port"]', String(PORT));
  await fill(hostWindow, 'form[data-form="play"] input[name="password"]', PASSWORD);
  await hostWindow.webContents.executeJavaScript('document.querySelector(\'form[data-form="play"]\').requestSubmit()');
  await waitForText(hostWindow, "Hosting", 15000);
  await waitFor(hostWindow, "Boolean(window.__kraken && window.__kraken.snapshot().role === 'dm')", 5000, "DM handle missing");

  const player = createWindow();
  await whenLoaded(player);
  await waitForText(player, "My Campaigns");
  await player.webContents.executeJavaScript('document.querySelector(\'button[data-action="join-mode"]\').click()');
  await waitForText(player, "Take your seat");
  await fill(player, 'form[data-form="join"] input[name="name"]', "Player");
  await fill(player, 'form[data-form="join"] input[name="address"]', "127.0.0.1");
  await fill(player, 'form[data-form="join"] input[name="port"]', String(PORT));
  await fill(player, 'form[data-form="join"] input[name="password"]', PASSWORD);
  await player.webContents.executeJavaScript('document.querySelector(\'form[data-form="join"]\').requestSubmit()');
  await waitForText(player, "At 127.0.0.1:47321", 10000);
  await waitFor(player, "Boolean(window.__kraken && window.__kraken.snapshot().role === 'player')", 5000, "Player handle missing");

  await hostWindow.webContents.executeJavaScript(
    'document.querySelector("[data-launch=players]").click()',
  );
  await waitFor(hostWindow, 'document.querySelectorAll("[data-player]").length === 2', 5000, "Roster did not list both seats");
  const roles = await hostWindow.webContents.executeJavaScript(
    '[...document.querySelectorAll("[data-role]")].map((el) => el.getAttribute("data-role")).sort().join(",")',
  );
  if (roles !== "dm,player") throw new Error(`Roster roles were ${roles}`);

  await hostWindow.webContents.executeJavaScript('window.__kraken.sendChat("The troll is at the door")');
  await waitFor(
    player,
    'window.__kraken.snapshot().chat.some((line) => line.text === "The troll is at the door")',
    5000,
    "Player did not receive chat",
  );
  // A player has no GM tabs: chat is in the dock beside the map.
  // A player's sidebar has no GM launchers (players, open map).
  const playerLaunchers = await player.webContents.executeJavaScript('[...document.querySelectorAll("[data-launch]")].map((b) => b.dataset.launch).join()');
  if (playerLaunchers.includes("players") || playerLaunchers.includes("adventure")) throw new Error(`Player saw GM launchers: ${playerLaunchers}`);
  await waitForText(player, "The troll is at the door");
  const playerParty = await bodyText(player);
  if (playerParty.includes(PASSWORD)) throw new Error("Player party showed the table password");

  if (!fs.existsSync(BUNDLE)) throw new Error(`Missing adventure zip: ${BUNDLE}`);
  await chooseBundle(hostWindow, BUNDLE);
  await waitFor(
    hostWindow,
    '(() => { const legend = document.querySelector(".legend"); return Boolean(legend && Number(legend.getAttribute("data-walls")) > 0); })()',
    90000,
    "DM did not draw walls",
  );
  const dmWalls = await hostWindow.webContents.executeJavaScript('document.querySelector(".legend").getAttribute("data-walls")');
  const sceneName = await hostWindow.webContents.executeJavaScript('document.querySelector("[data-scene]")?.getAttribute("data-scene") || ""');
  await waitFor(
    player,
    `(() => {
      const scene = document.querySelector("[data-scene]");
      const img = document.querySelector(".viewport img");
      return Boolean(scene && scene.getAttribute("data-scene") === ${JSON.stringify(sceneName)} && img && img.complete && img.naturalWidth >= 1000);
    })()`,
    90000,
    "Player did not receive the map image",
  );
  const playerWalls = await player.webContents.executeJavaScript('document.querySelectorAll("g.wall").length');
  const playerGm = await player.webContents.executeJavaScript('document.querySelector(".viewport")?.getAttribute("data-gm")');
  const playerLegend = await player.webContents.executeJavaScript('document.querySelectorAll(".legend").length');
  if (playerWalls !== 0 || playerGm !== "false" || playerLegend !== 0) {
    throw new Error(`Player saw GM walls. walls=${playerWalls} gm=${playerGm} legend=${playerLegend}`);
  }
  if (Number(dmWalls) < 20) throw new Error(`DM wall count was ${dmWalls}`);

  // The DM gives the player a character; the player puts its token on the map.
  const heroId = await hostWindow.webContents.executeJavaScript(
    'window.__kraken.op({ op: "create", input: { type: "character", name: "Player Hero", owner: "Player", visibility: "owner", data: {} } })',
  );
  await waitFor(player, `window.__kraken.snapshot().records.some((record) => record.id === ${JSON.stringify(heroId)})`, 5000, "Player did not get their character");
  await player.webContents.executeJavaScript(`window.__kraken.placeToken(${JSON.stringify(heroId)}, 640, 480)`);
  await waitFor(
    hostWindow,
    `window.__kraken.snapshot().map.tokens.some((token) => token.recordId === ${JSON.stringify(heroId)})`,
    5000,
    "DM did not see the player's token",
  );
  const placed = await hostWindow.webContents.executeJavaScript(
    `(() => { const t = window.__kraken.snapshot().map.tokens.find((token) => token.recordId === ${JSON.stringify(heroId)}); return { x: t.x, y: t.y }; })()`,
  );
  await waitFor(player, `document.querySelectorAll("[data-token]").length > 0`, 5000, "Player's map shows no tokens");
  player.close();

  // Leave and host the same campaign again: the map, scene, chat and the
  // player's token must come back.
  await waitFor(hostWindow, 'window.__kraken.snapshot().players.length === 1', 5000, "Player seat did not close");
  await hostWindow.webContents.executeJavaScript('[...document.querySelectorAll(".session-status button")].find((b) => b.textContent.trim() === "Leave").click()');
  await waitForText(hostWindow, "My Campaigns", 10000);
  await hostWindow.webContents.executeJavaScript('document.querySelector(\'button[data-campaign="E2E Table"]\').click()');
  await waitForText(hostWindow, "public game");
  await fill(hostWindow, 'form[data-form="play"] input[name="port"]', String(PORT));
  await fill(hostWindow, 'form[data-form="play"] input[name="password"]', PASSWORD);
  await hostWindow.webContents.executeJavaScript('document.querySelector(\'form[data-form="play"]\').requestSubmit()');
  await waitForText(hostWindow, "Hosting", 15000);
  await waitFor(
    hostWindow,
    `document.querySelector("[data-scene]")?.getAttribute("data-scene") === ${JSON.stringify(sceneName)}`,
    90000,
    "The campaign did not reopen its scene",
  );
  await waitFor(
    hostWindow,
    'window.__kraken.snapshot().chat.some((line) => line.text === "The troll is at the door")',
    5000,
    "The campaign did not keep its chat",
  );

  const again = createWindow();
  await whenLoaded(again);
  await waitForText(again, "My Campaigns");
  await again.webContents.executeJavaScript('document.querySelector(\'button[data-action="join-mode"]\').click()');
  await fill(again, 'form[data-form="join"] input[name="name"]', "Player");
  await fill(again, 'form[data-form="join"] input[name="address"]', "127.0.0.1");
  await fill(again, 'form[data-form="join"] input[name="port"]', String(PORT));
  await fill(again, 'form[data-form="join"] input[name="password"]', PASSWORD);
  await again.webContents.executeJavaScript('document.querySelector(\'form[data-form="join"]\').requestSubmit()');
  await waitFor(again, "Boolean(window.__kraken && window.__kraken.snapshot().role === 'player')", 10000, "Player could not rejoin");
  await waitFor(
    again,
    `window.__kraken.snapshot().map.tokens.some((token) => token.recordId === ${JSON.stringify(heroId)} && token.x === ${placed.x} && token.y === ${placed.y})`,
    5000,
    "The rejoining player's token was not where they left it",
  );
  again.close();
}

module.exports = { run };
