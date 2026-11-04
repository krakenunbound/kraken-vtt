// The host's side of the 3D dice and the dice tower: a roll carries the throw
// and dice look its roller just sent, so every screen throws the same way; a
// tracker roll a player asked for carries theirs; FG's dice tower makes a
// [TOWER] roll the GM's alone, the roller seeing only what went in, unless the
// GM's towerReveal option shows the roller the result too.
import "./loopback.mjs";
import { WebSocket } from "ws";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const lines = [];
    let options = null;
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") lines.push(msg);
      if (msg.type === "options") options = msg.options;
      if (msg.type === "ok") resolve({ ws, ok: msg, lines, options: () => options, send: (body) => ws.send(JSON.stringify(body)) });
      if (msg.type === "no") reject(new Error(msg.reason));
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const look = { theme: "starfall", body: "#101c4c", ink: "#e8f3ff" };

const server = createTableServer();
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const gm = await connect(port, { name: "GM", hostToken });
  const ann = await connect(port, { name: "Ann" });
  const bob = await connect(port, { name: "Bob" });
  assert(gm.ok.you.role === "dm" && ann.ok.you.role === "player", "GM and players seated");
  assert(ann.ok.options && ann.ok.options.towerReveal === false, "options sent on joining; the tower hides results");

  // A thrown roll: everyone gets the throw and Ann's dice.
  ann.send({ type: "roll", formula: "2d6+1", label: "Thrown", throw: { x: 0.2, y: 0.8, vx: 0.6, vy: -0.5 }, look });
  await settle();
  const thrown = bob.lines.at(-1);
  assert(thrown.roll.label === "Thrown" && thrown.roll.throw?.x === 0.2 && thrown.roll.throw.vy === -0.5, `throw carried: ${JSON.stringify(thrown.roll.throw)}`);
  assert(thrown.roll.look?.theme === "starfall" && thrown.roll.look.body === "#101c4c", "dice look carried");

  // The Gilded Die's themes: its own finish, a trail, gilt numbers and pips.
  ann.send({ type: "roll", formula: "1d6", look: { theme: "bard", body: "#6e243f", ink: "#f0d78c", material: "design", effect: "notes", font: "metal", pips: true } });
  await settle();
  const bard = bob.lines.at(-1).roll.look;
  assert(bard.theme === "bard" && bard.material === "design" && bard.effect === "notes" && bard.font === "metal" && bard.pips === true, `the Gilded Die's look carried: ${JSON.stringify(bard)}`);
  ann.send({ type: "roll", formula: "1d20", look });
  await settle();

  // Nonsense is not passed on.
  ann.send({ type: "roll", formula: "1d20", throw: { x: "far", y: 2 }, look: { theme: "plaid", body: "red", ink: "#fff" } });
  await settle();
  const odd = bob.lines.at(-1).roll;
  assert(odd.throw === undefined, "a bad throw is dropped");
  assert(odd.look?.theme === "starfall", "a bad look keeps the last good one");

  // The whole look goes with a roll; parts nobody knows are left out.
  ann.send({ type: "roll", formula: "1d20", look: { theme: "marble", body: "#eeeeee", ink: "#111111", accent: "#445566", material: "glass", effect: "frost", font: "runic", crit: false } });
  await settle();
  const rich = bob.lines.at(-1).roll.look;
  assert(rich.theme === "marble" && rich.accent === "#445566" && rich.material === "glass" && rich.effect === "frost" && rich.font === "runic" && rich.crit === false, `the whole look: ${JSON.stringify(rich)}`);
  ann.send({ type: "roll", formula: "1d20", look: { theme: "swirl", body: "#123456", ink: "#ffffff", material: "plutonium", effect: "<script>", accent: "blue" } });
  await settle();
  const trimmed = bob.lines.at(-1).roll.look;
  assert(trimmed.theme === "swirl" && trimmed.material === undefined && trimmed.effect === undefined && trimmed.accent === undefined, `unknown parts dropped: ${JSON.stringify(trimmed)}`);

  // A tracker roll Ann asks for (her saving throw) is thrown by her.
  server.agent.records.create({ type: "siegegame", name: "Rules", data: { options: { SIEGE_INIT_STAT: "none" } } }, server.agent.seat);
  const elowen = server.agent.records.create({ type: "character", name: "Elowen", owner: "Ann", visibility: "owner", data: { level: 1, attributes: { wisdom: { score: 13 } } } }, server.agent.seat);
  const ct = async (args) => JSON.parse((await callTool("kraken_combat", args, { table: () => server })).content[0].text);
  await ct({ action: "add", recordId: elowen.id });
  const entry = (await ct({ action: "view" })).entries[0];
  ann.send({ type: "ct", action: "save", id: entry.id, attribute: "wisdom", cl: 1, throw: { x: 0.4, y: 0.5, vx: 0.1, vy: 0.2 }, look });
  await settle();
  const save = bob.lines.find((line) => line.roll?.label?.startsWith("[SAVE]"));
  assert(save?.roll.throw?.x === 0.4, `the save is thrown by Ann: ${JSON.stringify(save?.roll)}`);

  // FG's dice sets: the GM's NPC dice for a roll as a creature, damage dice for
  // damage; the GM's roll for a character, or as themself, is their own dice.
  const npcLook = { theme: "monster", body: "#3a5a1c", ink: "#f2e3b0" };
  const damageLook = { theme: "magma", body: "#2a0d05", ink: "#ffb347" };
  const looks = { npc: npcLook, damage: damageLook };
  const lookOfLast = () => bob.lines.at(-1).roll.look?.theme;
  gm.send({ type: "roll", formula: "1d20+2", label: "Orc attack", as: "Orc 1", look, looks });
  await settle();
  assert(lookOfLast() === "monster", `a roll as a creature is in NPC dice: ${lookOfLast()}`);
  gm.send({ type: "roll", formula: "1d8", label: "[DAMAGE] Orc 1 axe", as: "Orc 1", look, looks });
  await settle();
  assert(lookOfLast() === "magma", `damage is in damage dice: ${lookOfLast()}`);
  gm.send({ type: "roll", formula: "1d20", label: "Elowen's check", as: "Elowen", look, looks });
  await settle();
  assert(lookOfLast() === "starfall", `the GM rolling for a character uses their own dice: ${lookOfLast()}`);
  gm.send({ type: "roll", formula: "1d20", label: "GM's roll", look, looks });
  await settle();
  assert(lookOfLast() === "starfall", "the GM as themself: their own dice");
  ann.send({ type: "roll", formula: "2d6", label: "[DAMAGE] Longsword", look, looks: { damage: damageLook, npc: npcLook } });
  await settle();
  assert(lookOfLast() === "magma", "a player's damage dice");
  ann.send({ type: "roll", formula: "1d20", label: "Attack", as: "Orc 1", look, looks });
  await settle();
  assert(lookOfLast() === "starfall", "a player's NPC dice are never used (and a player cannot roll as another)");
  gm.send({ type: "roll", formula: "1d6", label: "Orc morale", as: "Orc 1", look });
  await settle();
  assert(lookOfLast() === "monster", "the sets are remembered from the seat's last request");

  // The dice tower, as FG's: the GM sees "[TOWER]" and the result, Ann sees
  // what went in (no result), Bob sees nothing.
  const before = { ann: ann.lines.length, bob: bob.lines.length, gm: gm.lines.length };
  ann.send({ type: "roll", formula: "1d20+3", label: "Sneak", tower: true });
  await settle();
  const gmTower = gm.lines.slice(before.gm);
  assert(gmTower.length === 1 && gmTower[0].secret && gmTower[0].roll.label === "[TOWER] Sneak", `GM's tower roll: ${JSON.stringify(gmTower)}`);
  const annTower = ann.lines.slice(before.ann);
  assert(annTower.length === 1 && !annTower[0].roll && annTower[0].tower && annTower[0].text === "[TOWER] Sneak [1d20+3]", `Ann sees what went in: ${JSON.stringify(annTower)}`);
  assert(bob.lines.length === before.bob, "Bob sees nothing of it");

  // Players cannot change the table's options; the GM can (and the agent).
  ann.send({ type: "table-options", options: { towerReveal: true } });
  await settle();
  assert(server.agent.options().towerReveal === false, "a player cannot reveal the tower");
  gm.send({ type: "table-options", options: { towerReveal: true } });
  await settle();
  assert(ann.options()?.towerReveal === true && server.agent.options().towerReveal === true, "the GM reveals tower rolls to their rollers");

  // Now Ann sees her own tower result; Bob still sees nothing.
  const next = { ann: ann.lines.length, bob: bob.lines.length };
  ann.send({ type: "roll", formula: "1d20", label: "Listen", tower: true });
  await settle();
  const shown = ann.lines.slice(next.ann);
  assert(shown.length === 1 && shown[0].roll?.label === "[TOWER] Listen" && shown[0].shownTo === "Ann", `Ann sees her result: ${JSON.stringify(shown)}`);
  assert(bob.lines.length === next.bob, "Bob still sees nothing");

  // A seat that joins later gets the history it may see: Ann's revealed line, not the hidden one.
  ann.ws.close();
  await settle();
  const again = await connect(port, { name: "Ann" });
  const history = again.ok.chat.filter((line) => line.roll?.label?.startsWith("[TOWER]")).map((line) => line.roll.label);
  assert(history.join() === "[TOWER] Listen", `Ann's history: ${history.join()}`);
  const bobAgain = await connect(port, { name: "Bob" });
  assert(!bobAgain.ok.chat.some((line) => line.roll?.label?.startsWith("[TOWER]")), "Bob's history has no tower rolls");

  // The agent reads and sets the option too, and it is saved with the campaign.
  const tool = JSON.parse((await callTool("kraken_table_options", { towerReveal: false }, { table: () => server })).content[0].text);
  assert(tool.towerReveal === false && server.persisted().options.towerReveal === false, "agent tool and saved campaign");
  // The agent's secret roll is the GM's alone.
  const quiet = { gm: gm.lines.length, bob: bobAgain.lines.length };
  await callTool("kraken_roll", { formula: "1d20", label: "Wandering monster", secret: true }, { table: () => server });
  await settle();
  assert(gm.lines.slice(quiet.gm).some((line) => line.secret && line.roll?.label === "Wandering monster"), "the GM sees the agent's secret roll");
  assert(bobAgain.lines.length === quiet.bob, "a player does not");
  for (const seat of [gm, bob, again, bobAgain]) seat.ws.close();
  console.log("DICE_OK");
} finally {
  await server.stop();
}
