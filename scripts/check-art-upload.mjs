// A player's own portrait from their computer (the art picker's From my computer): the host keeps it with the
// campaign under the player's name and lists it in the art library, so everyone at the table sees it; a WebM
// portrait stays a video; a file that is not the picture its name says, an unknown seat or too big a file is refused.
import "./loopback.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { createArtLibrary } = require("../electron/artLibrary.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const folder = fs.mkdtempSync(path.join(os.tmpdir(), "kraken-art-upload-"));
const playerArt = path.join(folder, "player-art");
const roots = ["portrait", "token"].map((kind) => ({ dir: path.join(playerArt, `${kind}s`), kind, group: "Players", prefix: `players/${kind}s/` }));
const server = createTableServer({ art: createArtLibrary({ base: folder, roots }), playerArt: { folder: (kind) => path.join(playerArt, `${kind}s`) } });
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "ok") resolve({ ws, you: msg.you });
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([20, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(12)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(28)]);
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const base = `http://127.0.0.1:${port}`;
  const gm = await connect(port, { name: "GM", hostToken });
  const player = await connect(port, { name: "Ana" });
  const upload = (seat, kind, name, body) => fetch(`${base}/art/upload?${new URLSearchParams({ token: seat ? seat.you.assetToken : "nobody", kind, name })}`, { method: "POST", body });

  const added = await upload(player, "portrait", "Ulfgar the Bold.webp", WEBP);
  const { id } = await added.json();
  assert(added.ok && id === "players/portraits/Ana/Ulfgar the Bold.webp", `a player's portrait is kept under their name: ${added.status} ${id}`);
  assert(fs.existsSync(path.join(playerArt, "portraits", "Ana", "Ulfgar the Bold.webp")), "in the campaign's player-art folder");
  const listed = await (await fetch(`${base}/art/list?token=${gm.you.assetToken}&kind=portrait`)).json();
  assert(listed.some((item) => item.id === id && item.group === "Players · Ana"), `the GM's picker lists it under the player: ${JSON.stringify(listed)}`);
  const served = await fetch(`${base}/art/file?token=${gm.you.assetToken}&id=${encodeURIComponent(id)}`);
  assert(served.ok && served.headers.get("content-type") === "image/webp", "everyone at the table is served it");

  const again = await (await upload(player, "portrait", "Ulfgar the Bold.webp", WEBP)).json();
  assert(again.id === "players/portraits/Ana/Ulfgar the Bold 2.webp", `a second of the same name is kept beside it: ${again.id}`);
  const video = await (await upload(player, "portrait", "breathing.webm", WEBM)).json();
  const videoItem = (await (await fetch(`${base}/art/list?token=${player.you.assetToken}&kind=portrait`)).json()).find((item) => item.id === video.id);
  assert(videoItem?.video === true, `a WebM portrait stays a video: ${JSON.stringify(videoItem)}`);
  const token = await (await upload(gm, "token", "goblin.webp", WEBP)).json();
  assert(token.id === "players/tokens/GM/goblin.webp", `the GM's own lands under GM, as a token: ${token.id}`);

  const fake = await upload(player, "portrait", "evil.webp", Buffer.from("<script>alert(1)</script>"));
  assert(fake.status === 415, `a file that is not the picture its name says is refused: ${fake.status}`);
  const kind = await upload(player, "portrait", "notes.html", WEBP);
  assert(kind.status === 415, `only pictures and WebM: ${kind.status}`);
  const stranger = await upload(null, "portrait", "x.webp", WEBP);
  assert(stranger.status === 404, `no seat, no upload: ${stranger.status}`);
  const big = await upload(player, "portrait", "huge.webp", Buffer.concat([WEBP, Buffer.alloc(26 * 1024 * 1024)])).catch(() => ({ status: 413 }));
  assert(big.status === 413, `too big is refused: ${big.status}`);
  assert(!fs.existsSync(path.join(playerArt, "portraits", "Ana", "huge.webp")), "and nothing is kept");
  const sneaky = await (await upload(player, "portrait", "../../escape.webp", WEBP)).json();
  assert(sneaky.id?.startsWith("players/portraits/Ana/") && !fs.existsSync(path.join(playerArt, "escape.webp")), `a path in the name stays in the player's folder: ${sneaky.id}`);
  gm.ws.close();
  player.ws.close();
  console.log("ART_UPLOAD_OK a player's own portrait or token: kept with the campaign under their name, listed and served to the table, WebM a video; fakes, strangers, paths and too-big files refused");
} finally {
  await server.close?.();
  fs.rmSync(folder, { recursive: true, force: true });
}
