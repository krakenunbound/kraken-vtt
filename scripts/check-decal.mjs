// The background decal, as FG's: the GM chooses it (or the agent does), every
// seat sees it, and it is saved with the campaign. Kraken's own decals are
// there from the start; a picture from anywhere is copied into the GM's
// assets folder once and offered to every campaign; FG's vault packs are
// locked and left alone. Players can see the decal but not choose one.
import "./loopback.mjs";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { createDecalLibrary } = require("../electron/decals.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { fgDataFolder } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    let options = null;
    const errors = [];
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "options") options = msg.options;
      if (msg.type === "error") errors.push(msg.reason);
      if (msg.type === "ok") {
        options = msg.options;
        resolve({ ws, you: msg.you, options: () => options, errors, send: (body) => ws.send(JSON.stringify(body)) });
      }
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

const work = mkdtempSync(path.join(tmpdir(), "kraken-decal-"));
const folder = path.join(work, "assets", "decals");
const decals = createDecalLibrary({ folder, builtin: path.join(process.cwd(), "public", "decals"), fgData: fgDataFolder() });
const server = createTableServer({ decals });
const tool = async (args) => JSON.parse((await callTool("kraken_decal", args, { table: () => server })).content[0].text);
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const gm = await connect(port, { name: "GM", hostToken });
  const ann = await connect(port, { name: "Ann" });
  const base = `http://127.0.0.1:${port}`;

  // The Kraken emblem to begin with; Kraken's own decals to choose from; FG's locked packs are not read.
  assert(ann.options().decal === "kraken", "the Kraken emblem is the table's first decal");
  const list = await tool({ action: "list" });
  const own = list.decals.filter((item) => item.group === "Kraken");
  assert(own.length >= 7 && own[0].id === "kraken", `Kraken's own decals: ${own.map((item) => item.name).join(", ")}`);
  assert(!list.decals.some((item) => item.id.startsWith("pack/")), "nothing read out of FG's encrypted vault packs");
  assert((await tool({ action: "list", search: "dragon" })).decals.every((item) => /dragon/i.test(item.name + item.group)), "search");

  // The GM chooses one: every seat sees it, and the picture is served to them.
  gm.send({ type: "table-options", options: { decal: "kraken/Dragon Seal.webp" } });
  await settle();
  assert(ann.options().decal === "kraken/Dragon Seal.webp", "Ann sees the GM's decal");
  const picture = await fetch(`${base}/decal/file?token=${ann.you.assetToken}&id=${encodeURIComponent("kraken/Dragon Seal.webp")}`);
  assert(picture.ok && picture.headers.get("content-type") === "image/webp" && (await picture.arrayBuffer()).byteLength > 10000, "Ann's screen gets the picture");
  assert((await fetch(`${base}/decal/file?token=nobody&id=${encodeURIComponent("kraken/Dragon Seal.webp")}`)).status === 404, "not without a seat");
  assert((await fetch(`${base}/decal/list?token=${ann.you.assetToken}`)).status === 404, "a player does not get the list");
  assert((await fetch(`${base}/decal/list?token=${gm.you.assetToken}`)).ok, "the GM does");
  assert((await fetch(`${base}/decal/file?token=${ann.you.assetToken}&id=${encodeURIComponent("../package.json")}`)).status === 404, "an id is never a path");

  // A player cannot change it; an unknown decal is refused.
  ann.send({ type: "table-options", options: { decal: "" } });
  await settle();
  assert(ann.options().decal === "kraken/Dragon Seal.webp", "a player cannot change the decal");
  gm.send({ type: "table-options", options: { decal: "lib/nothing.png" } });
  await settle();
  assert(gm.errors.some((reason) => reason.includes("No decal")) && ann.options().decal === "kraken/Dragon Seal.webp", "an unknown decal is refused");

  // A picture from anywhere: copied into the assets folder once, put up, and kept with the campaign.
  const mine = path.join(work, "My Banner.png");
  writeFileSync(mine, Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201c2a3e1f70000000049454e44ae426082", "hex"));
  const imported = await tool({ action: "import", path: mine });
  assert(imported.decal === "lib/My Banner.png" && readdirSync(folder).includes("My Banner.png"), `imported ${JSON.stringify(imported)}`);
  await settle();
  assert(ann.options().decal === "lib/My Banner.png", "the imported picture is up for everyone");
  const again = await tool({ action: "import", path: mine });
  assert(again.decal === "lib/My Banner.png" && readdirSync(folder).length === 1, "the same picture twice is kept once");
  assert((await tool({ action: "list" })).decals.some((item) => item.id === "lib/My Banner.png" && item.group === "Kraken assets"), "and offered from then on");
  assert(server.persisted().options.decal === "lib/My Banner.png", "saved with the campaign");
  let refused = "";
  try {
    await tool({ action: "import", path: path.join(work, "notes.txt") });
  } catch (error) {
    refused = error.message;
  }
  assert(refused, "only pictures can be decals");

  // No decal at all, as FG's Use Empty Decal.
  assert((await tool({ action: "set", id: "" })).decal === "", "an empty decal");
  for (const seat of [gm, ann]) seat.ws.close();
  console.log(`DECAL_OK ${own.length - 1} decals of Kraken's own`);
} finally {
  await server.stop();
}
