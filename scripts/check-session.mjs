import http from "node:http";
import { WebSocket } from "ws";
import { createTableServer, decideRole } from "../electron/tableServer.cjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("join timed out"));
    }, 4000);
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== "ok" && msg.type !== "no") return;
      clearTimeout(timer);
      resolve({ ws, msg });
    });
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}

function nextOf(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 3000);
    const onMessage = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type !== type) return;
      clearTimeout(timer);
      ws.off("message", onMessage);
      resolve(msg);
    };
    ws.on("message", onMessage);
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      })
      .on("error", reject);
  });
}

const token = "host-token-sample";
assert(decideRole("192.168.0.20", token, token, false) === "player", "remote address with the host token stays a player");
assert(decideRole("::ffff:192.168.1.50", token, token, false) === "player", "mapped remote address stays a player");
assert(decideRole("127.0.0.1", token, token, false) === "dm", "loopback with the host token is the DM");
assert(decideRole("::ffff:127.0.0.1", token, token, false) === "dm", "mapped loopback is the DM");
assert(decideRole("::1", token, token, false) === "dm", "ipv6 loopback is the DM");
assert(decideRole("127.0.0.1", token, "nope", false) === "player", "wrong host token is a player");
assert(decideRole("127.0.0.1", token, token, true) === "player", "a second local token does not take the DM seat");

const open = createTableServer();
const openSockets = [];
try {
  const openInfo = await open.listen({ port: 0, password: "" });
  const guest = await connect(openInfo.port, { name: "Guest", password: "" });
  openSockets.push(guest.ws);
  assert(guest.msg.type === "ok" && guest.msg.you.role === "player", "a blank password is a public game");
  const walker = await connect(openInfo.port, { name: "Walker", password: "anything" });
  openSockets.push(walker.ws);
  assert(walker.msg.type === "ok", "a public game accepts a player who types a password");
} finally {
  for (const ws of openSockets) ws.close();
  await open.stop();
}

const server = createTableServer();
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "secret" });
  assert(decideRole("10.0.0.8", info.hostToken, info.hostToken, false) === "player", "live host token from another IP is not DM");

  const wrong = await connect(info.port, { name: "Eve", password: "nope" });
  sockets.push(wrong.ws);
  assert(wrong.msg.type === "no", "wrong password should be refused");
  const blank = await connect(info.port, { name: "Blank", password: "" });
  sockets.push(blank.ws);
  assert(blank.msg.type === "no", "a locked table still refuses a blank password");
  assert(server.snapshot().players.length === 0, "refused join left the roster empty");

  const dm = await connect(info.port, { name: "DM", password: "secret", hostToken: info.hostToken });
  sockets.push(dm.ws);
  assert(dm.msg.type === "ok" && dm.msg.you.role === "dm", "loopback host token is DM");

  const player = await connect(info.port, { name: "Player", password: "secret" });
  sockets.push(player.ws);
  assert(player.msg.you.role === "player", "password without host token is a player");

  const second = await connect(info.port, { name: "Other", password: "secret", hostToken: info.hostToken });
  sockets.push(second.ws);
  assert(second.msg.you.role === "player", "second loopback host token stays a player");

  const ignored = nextOf(player.ws, "scene");
  player.ws.send(JSON.stringify({ type: "scene", scene: { id: "stolen", name: "Stolen", width: 100, height: 100 } }));
  const stolen = await Promise.race([ignored, new Promise((resolve) => setTimeout(() => resolve(null), 250))]);
  assert(stolen === null, "player scene publish was ignored");
  assert(server.snapshot().sceneId === null, "server kept no player scene");

  const image = Buffer.from("not-a-real-jpeg-but-bytes");
  server.setImage(image, "image/jpeg");
  const playerScene = nextOf(player.ws, "scene");
  const otherScene = nextOf(second.ws, "scene");
  const playerMap = nextOf(player.ws, "map");
  dm.ws.send(
    JSON.stringify({
      type: "scene",
      scene: {
        id: "morning",
        name: "Morning",
        width: 300,
        height: 200,
        padding: 0,
        backgroundColor: "#111111",
        grid: { size: 50, type: 1, color: "#000000", alpha: 0.2, distance: 5, units: "ft" },
        lights: [{ id: "lamp", x: 10, y: 20, brightPx: 30, dimPx: 60, bright: 5, dim: 10, units: "ft", color: "#ffb347", hidden: false }],
        tokens: [
          { id: "orc", name: "Orc", x: 1, y: 2, width: 50, height: 50, disposition: -1, hidden: false },
          { id: "hidden", name: "Lurker", x: 3, y: 4, width: 50, height: 50, disposition: -1, hidden: true },
          { id: "secret", name: "Secret", x: 5, y: 6, width: 50, height: 50, disposition: -2, hidden: false },
        ],
        walls: [{ id: "w", x1: 0, y1: 0, x2: 10, y2: 10, category: "normal" }],
      },
    }),
  );
  const shown = await playerScene;
  const shownToo = await otherScene;
  assert(shown.scene.id === "morning", "player received the scene");
  assert(shown.scene.walls === undefined && shownToo.scene.walls === undefined, "players did not receive walls");
  assert(shown.scene.lights.length === 1, "player received the light");
  const firstMap = await playerMap;
  assert(shown.scene.tokens === undefined, "tokens come with the map view, not the scene");
  assert(firstMap.tokens.length === 1 && firstMap.tokens[0].name === "Orc", `hidden and secret tokens stayed off the player map: ${firstMap.tokens.map((t) => t.name)}`);
  assert(typeof shown.scene.image === "string" && shown.scene.image.includes("token="), "scene points at the image");
  assert(!shown.scene.image.includes(info.hostToken), "image url is not the host token");

  const imageUrl = new URL(shown.scene.image, `http://127.0.0.1:${info.port}`);
  const fetched = await get(imageUrl);
  assert(fetched.status === 200, "image GET succeeded");
  assert(fetched.body.equals(image), "image bytes match");
  const missing = await get(`http://127.0.0.1:${info.port}/table/image?token=nope`);
  assert(missing.status === 404, "bad image token is 404");

  // Tokens: a player cannot move the GM's creature, can place and move their own character.
  const orc = server.snapshot().tokens.find((item) => item.name === "Orc");
  const refused = nextOf(player.ws, "error");
  player.ws.send(JSON.stringify({ type: "token-move", id: orc.id, x: 999, y: 999 }));
  assert((await refused).reason.includes("not your token"), "player cannot move the GM's token");
  assert(server.snapshot().tokens.find((item) => item.id === orc.id).x === orc.x, "the orc did not move");

  const heroId = server.agent.records.create({ type: "character", name: "Halvar", owner: "Player", visibility: "owner", data: { hp: { total: 10, wounds: 6 } } }, server.agent.seat).id;
  player.ws.send(JSON.stringify({ type: "token-place", recordId: heroId, x: 130, y: 70 }));
  let hero = null;
  const placeDeadline = Date.now() + 2000;
  while (!hero && Date.now() < placeDeadline) {
    hero = server.snapshot().tokens.find((item) => item.recordId === heroId);
    if (!hero) await new Promise((resolve) => setTimeout(resolve, 20));
  }
  // 50px squares: the drop at 130, 70 lands in the square centred on 125, 75.
  assert(hero && hero.x === 125 && hero.y === 75 && hero.owner === "Player", `player placed their own character, snapped: ${JSON.stringify(hero)}`);
  player.ws.send(JSON.stringify({ type: "token-move", id: hero.id, x: 240, y: 160 }));
  const moveDeadline = Date.now() + 2000;
  let moved = null;
  while (Date.now() < moveDeadline) {
    moved = server.snapshot().tokens.find((item) => item.id === hero.id);
    if (moved.x === 225 && moved.y === 175) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert(moved.x === 225 && moved.y === 175, `player moved their own token onto a square: ${moved.x},${moved.y}`);
  const view = server.agent.viewFor("Player").tokens.find((item) => item.id === hero.id);
  // 6 of 10 wounds: Heavy, CoreRPG's token gradient between mid and bottom.
  assert(view.health.status === "Heavy" && view.health.color === "#FF9A00", `health dot ${JSON.stringify(view.health)}`);
  assert(server.persisted().map.tokens.morning.some((item) => item.id === hero.id), "tokens are saved with the table");

  const chat = nextOf(player.ws, "chat");
  dm.ws.send(JSON.stringify({ type: "chat", text: "Roll init" }));
  const line = await chat;
  assert(line.from === "DM" && line.text === "Roll init", "chat reached the player");

  console.log("SESSION_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
