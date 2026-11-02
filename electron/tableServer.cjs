const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { WebSocketServer } = require("ws");
const { createRecordStore, canSee } = require("./records.cjs");
const { createDice } = require("./dice.cjs");
const { siege, siegeLibrary, siegeCheck } = require("./siege.cjs");

const PALETTE = ["#d2a15a", "#6cb6ff", "#e07a6a", "#81b90c", "#ca81ff", "#77e7e8", "#ffb347", "#f4f1ea"];
const MAX_CLIENTS = 16;

function eachAddress() {
  const v4 = [];
  const v6 = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      const family = entry.family;
      if (family === "IPv4" || family === 4) v4.push(entry.address);
      if (family === "IPv6" || family === 6) v6.push(String(entry.address).split("%")[0]);
    }
  }
  return { v4, v6 };
}

function lanAddresses() {
  return eachAddress().v4;
}

function isLoopback(address) {
  const raw = String(address || "").toLowerCase();
  const ip = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  return ip === "127.0.0.1" || ip === "::1";
}

function decideRole(remoteAddress, hostToken, offeredToken, dmAlreadySeated) {
  if (dmAlreadySeated) return "player";
  if (typeof offeredToken !== "string" || offeredToken.length === 0 || offeredToken !== hostToken) return "player";
  if (!isLoopback(remoteAddress)) return "player";
  return "dm";
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function text(value, fallback) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const clean = raw.replace(/[\u0000-\u001f]/g, "").trim();
  return clean || fallback;
}

function num(value, fallback) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeScene(input) {
  if (!input || typeof input !== "object") return null;
  const width = num(input.width, 0);
  const height = num(input.height, 0);
  if (width <= 0 || height <= 0 || width > 100000 || height > 100000) return null;
  const grid = input.grid && typeof input.grid === "object" ? input.grid : {};
  const lights = [];
  for (const [index, light] of (Array.isArray(input.lights) ? input.lights : []).entries()) {
    if (!light || typeof light !== "object" || light.hidden) continue;
    if (lights.length >= 500) break;
    lights.push({
      id: text(light.id, `light-${index}`).slice(0, 80),
      x: num(light.x, 0),
      y: num(light.y, 0),
      brightPx: Math.max(0, num(light.brightPx, 0)),
      dimPx: Math.max(0, num(light.dimPx, 0)),
      bright: num(light.bright, 0),
      dim: num(light.dim, 0),
      units: text(light.units, "ft").slice(0, 12),
      color: text(light.color, "#ffb347").slice(0, 32),
      hidden: false,
    });
  }
  const tokens = [];
  for (const [index, token] of (Array.isArray(input.tokens) ? input.tokens : []).entries()) {
    if (!token || typeof token !== "object" || token.hidden || Number(token.disposition) === -2) continue;
    if (tokens.length >= 300) break;
    tokens.push({
      id: text(token.id, `token-${index}`).slice(0, 80),
      name: text(token.name, "Creature").slice(0, 48),
      x: num(token.x, 0),
      y: num(token.y, 0),
      width: Math.max(1, num(token.width, 100)),
      height: Math.max(1, num(token.height, 100)),
      disposition: num(token.disposition, 0),
      hidden: false,
    });
  }
  return {
    id: text(input.id, "scene").slice(0, 80),
    name: text(input.name, "Scene").slice(0, 80),
    width,
    height,
    padding: Math.min(2, Math.max(0, num(input.padding, 0))),
    backgroundColor: text(input.backgroundColor, "#000000").slice(0, 32),
    grid: {
      size: Math.max(1, num(grid.size, 100)),
      type: num(grid.type, 1),
      color: text(grid.color, "#000000").slice(0, 20),
      alpha: Math.min(1, Math.max(0, num(grid.alpha, 0.2))),
      distance: Math.max(0, num(grid.distance, 5)),
      units: text(grid.units, "ft").slice(0, 12),
    },
    offsetX: num(input.offsetX, 0),
    offsetY: num(input.offsetY, 0),
    scaleX: num(input.scaleX, 1) || 1,
    scaleY: num(input.scaleY, 1) || 1,
    anchorX: Math.min(1, Math.max(0, num(input.anchorX, 0))),
    anchorY: Math.min(1, Math.max(0, num(input.anchorY, 0))),
    fit: ["fill", "contain", "cover", "width", "height"].includes(input.fit) ? input.fit : "fill",
    lights,
    tokens,
  };
}

function sceneCenter(scene) {
  if (!scene) return { x: 0, y: 0 };
  // Same padding rule as src/foundry/geometry.ts sceneFrame.
  const size = scene.grid.size > 0 ? scene.grid.size : 100;
  const padX = Math.ceil(scene.padding * scene.width * (1 / size)) * size;
  const padY = Math.ceil(scene.padding * scene.height * (1 / size)) * size;
  return { x: padX + scene.width / 2, y: padY + scene.height / 2 };
}

function savedChat(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line) => line && typeof line === "object" && typeof line.text === "string")
    .slice(-100)
    .map((line) => ({
      id: text(line.id, "").slice(0, 32),
      from: text(line.from, "Player").slice(0, 24),
      text: text(line.text, "").slice(0, 500),
      at: num(line.at, 0),
      ...(line.roll && typeof line.roll === "object" ? { roll: line.roll } : {}),
    }))
    .filter((line) => line.text || line.roll);
}

function savedSpots(value) {
  const spots = {};
  if (!value || typeof value !== "object") return spots;
  for (const [sceneId, byName] of Object.entries(value).slice(0, 500)) {
    if (!byName || typeof byName !== "object") continue;
    const row = {};
    for (const [name, spot] of Object.entries(byName).slice(0, 64)) {
      const x = num(spot?.x, NaN);
      const y = num(spot?.y, NaN);
      if (Number.isFinite(x) && Number.isFinite(y)) row[name.slice(0, 24)] = { x, y };
    }
    spots[sceneId.slice(0, 80)] = row;
  }
  return spots;
}

// saved: { chat, spots, records, dice } from an earlier session. Spots remember where each
// named pawn stood on each scene, so a player who rejoins lands where they left.
// onChange(kind) fires whenever something to save changes: kind is "records"
// for record changes and "table" for chat, pawns and dice.
// The web client players open in a browser: the built app (dist/).
const WEB_ROOT = path.join(__dirname, "..", "dist");
const WEB_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serveWeb(url, res, root) {
  const wanted = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(root, wanted));
  if (!file.startsWith(root + path.sep) && file !== path.join(root, "index.html")) return false;
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return false;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    "Content-Type": WEB_TYPES[ext] ?? "application/octet-stream",
    "Content-Length": bytes.length,
    // Built assets carry a content hash in their names; the page itself does not.
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(bytes);
  return true;
}

function createTableServer({ saved = {}, onChange = () => undefined, webRoot = WEB_ROOT } = {}) {
  let password = "";
  let hostToken = "";
  let image = null;
  let imageVersion = 0;
  let scene = null;
  let colorIndex = 0;
  const clients = new Map();
  const pawns = new Map();
  const chat = savedChat(saved.chat);
  const spots = savedSpots(saved.spots);
  const records = createRecordStore({ saved: saved.records, onChange: () => onChange("records") });
  const dice = createDice(saved.dice);

  function seatOf(client) {
    return { role: client.role, name: client.name };
  }

  function addChat(entry) {
    chat.push(entry);
    if (chat.length > 100) chat.shift();
    broadcast({ type: "chat", ...entry });
    onChange("table");
    return entry;
  }

  // label: what the roll is for ("Strength check"). from: who rolled.
  // tag: the asker's own marker (a wizard waiting for its roll), echoed back.
  function rollDice(formula, label, from, id, tag) {
    const result = dice.roll(formula);
    const roll = { ...result, label: text(label, "").slice(0, 120), ...(tag ? { tag: text(tag, "").slice(0, 80) } : {}) };
    addChat({ id, from, text: "", roll, at: Date.now() });
    return roll;
  }

  // Each seat hears only about records it may see. A record that stops being
  // visible to a seat is removed from that seat.
  records.subscribe(({ kind, record, before }) => {
    for (const [ws, client] of clients) {
      const seat = seatOf(client);
      const sees = kind === "upsert" && canSee(record, seat);
      if (sees) send(ws, { type: "record", record });
      else if ((before && canSee(before, seat)) || kind === "delete") send(ws, { type: "record-gone", id: record.id });
    }
  });

  function spotFor(name) {
    const spot = scene ? spots[scene.id]?.[name] : null;
    return spot ? { x: spot.x, y: spot.y } : sceneCenter(scene);
  }

  function remember(pawn) {
    if (!scene || !pawn.name) return;
    spots[scene.id] = spots[scene.id] ?? {};
    spots[scene.id][pawn.name] = { x: pawn.x, y: pawn.y };
    onChange("table");
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/table/image") {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      if (!allowed || !image) {
        res.writeHead(404, { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": image.mime,
        "Content-Length": image.bytes.length,
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(image.bytes);
      return;
    }
    if (req.method === "GET" && serveWeb(url, res, webRoot)) return;
    res.writeHead(404, { "Access-Control-Allow-Origin": "*" });
    res.end();
  });

  const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 * 1024 });

  function send(ws, message) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  }

  function broadcast(message, except) {
    const data = JSON.stringify(message);
    for (const ws of clients.keys()) {
      if (ws !== except && ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  function playerList() {
    return [...clients.values()].map((client) => ({ id: client.id, name: client.name, role: client.role }));
  }

  function pawnList() {
    return [...pawns.values()].map(({ id, name, color, x, y }) => ({ id, name, color, x, y }));
  }

  function sceneFor(client) {
    if (!scene) return null;
    return {
      ...scene,
      image: image ? `/table/image?token=${client.assetToken}&v=${imageVersion}` : null,
    };
  }

  function broadcastScene() {
    for (const [ws, client] of clients) {
      if (client.role === "dm") continue;
      send(ws, { type: "scene", scene: sceneFor(client) });
    }
  }

  function removeClient(ws) {
    const client = clients.get(ws);
    if (!client) return;
    clients.delete(ws);
    pawns.delete(client.id);
    broadcast({ type: "players", players: playerList() });
    broadcast({ type: "pawns", pawns: pawnList() });
  }

  wss.on("connection", (ws, request) => {
    const remote = request.socket?.remoteAddress || ws._socket?.remoteAddress || "";
    const client = {
      id: crypto.randomBytes(8).toString("hex"),
      name: "",
      role: "player",
      assetToken: "",
      joined: false,
    };
    const joinTimer = setTimeout(() => {
      if (!client.joined) ws.close();
    }, 10000);

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        if (!client.joined) ws.close();
        return;
      }
      if (!msg || typeof msg !== "object") return;

      if (!client.joined) {
        if (msg.type !== "join") {
          ws.close();
          return;
        }
        if (password && !sameSecret(msg.password ?? "", password)) {
          send(ws, { type: "no", reason: "Wrong password." });
          ws.close();
          return;
        }
        if (clients.size >= MAX_CLIENTS) {
          send(ws, { type: "no", reason: "This table is full." });
          ws.close();
          return;
        }
        const dmSeated = [...clients.values()].some((seat) => seat.role === "dm");
        client.role = decideRole(remote, hostToken, msg.hostToken, dmSeated);
        client.name = text(msg.name, client.role === "dm" ? "DM" : "Player").slice(0, 24);
        client.assetToken = crypto.randomBytes(18).toString("hex");
        client.joined = true;
        clearTimeout(joinTimer);
        clients.set(ws, client);
        const start = spotFor(client.name);
        pawns.set(client.id, {
          id: client.id,
          name: client.name,
          color: PALETTE[colorIndex++ % PALETTE.length],
          x: start.x,
          y: start.y,
          seq: 0,
        });
        send(ws, {
          type: "ok",
          you: { id: client.id, name: client.name, role: client.role },
          players: playerList(),
          pawns: pawnList(),
          chat,
          records: records.list({ seat: seatOf(client) }),
          scene: client.role === "player" ? sceneFor(client) : null,
        });
        broadcast({ type: "players", players: playerList() }, ws);
        broadcast({ type: "pawns", pawns: pawnList() }, ws);
        return;
      }

      if (msg.type === "chat") {
        const line = text(msg.text, "").slice(0, 500);
        if (!line) return;
        addChat({ id: client.id, from: client.name, text: line, at: Date.now() });
        return;
      }

      if (msg.type === "roll") {
        try {
          rollDice(msg.formula, msg.label, client.name, client.id, msg.tag);
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." });
        }
        return;
      }

      // The creation wizard's finished character: the host builds it from the
      // spec with the campaign's books. A player's character is theirs.
      if (msg.type === "build-character") {
        const answer = (body) => send(ws, { type: "op-result", req: msg.req ?? null, ...body });
        siege()
          .then(({ builder }) => {
            const library = siegeLibrary(records);
            const { character, report } = builder.buildFromSpec(msg.spec ?? {}, library);
            if (!character) throw new Error(report.problems.join("; ") || "Could not build that character.");
            const owner = client.role === "dm" ? text(msg.owner, "").slice(0, 24) : client.name;
            const record = records.create(
              { type: "character", name: character.name || "Unnamed character", owner, visibility: owner ? "owner" : "gm", data: character },
              client.role === "dm" ? seatOf(client) : { role: "dm", name: client.name },
            );
            addChat({ id: client.id, from: client.name, text: `Created ${record.name}: ${character.race ?? ""} ${msg.spec?.class ?? ""} ${character.level ?? 1}.`, at: Date.now() });
            answer({ ok: true, id: record.id, problems: report.problems });
          })
          .catch((error) => answer({ ok: false, error: error instanceof Error ? error.message : "Could not build that character." }));
        return;
      }

      // A SIEGE check from a sheet: the owner or the GM rolls it.
      if (msg.type === "siege-check") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot roll for that character." });
          return;
        }
        siegeCheck(agentHandle, record, { attribute: msg.attribute, cl: msg.cl, bonus: msg.bonus, label: msg.label }, client.role === "dm" ? record.name : client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not roll that." }),
        );
        return;
      }

      // Record changes from a client: { op: create | update | delete, ... }.
      // The answer carries req back so the client can match it.
      if (msg.type === "op") {
        const seat = seatOf(client);
        try {
          let record;
          if (msg.op === "create") record = records.create(msg.input, seat);
          else if (msg.op === "update") record = records.update(msg.id, msg.patch, seat, { replace: msg.replace === true });
          else if (msg.op === "delete") record = records.remove(msg.id, seat);
          else throw new Error("Unknown change.");
          send(ws, { type: "op-result", req: msg.req ?? null, ok: true, id: record.id });
        } catch (error) {
          send(ws, { type: "op-result", req: msg.req ?? null, ok: false, error: error instanceof Error ? error.message : "Not allowed." });
        }
        return;
      }

      if (msg.type === "pawn") {
        const targetId = typeof msg.id === "string" && msg.id ? msg.id : client.id;
        const pawn = pawns.get(targetId);
        if (!pawn || (client.role !== "dm" && targetId !== client.id)) {
          send(ws, { type: "pawns", pawns: pawnList() });
          return;
        }
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7) return;
        const seq = Number(msg.seq);
        if (Number.isFinite(seq) && seq < pawn.seq) return;
        if (Number.isFinite(seq)) pawn.seq = seq;
        pawn.x = x;
        pawn.y = y;
        broadcast({ type: "pawns", pawns: pawnList() });
        if (msg.done !== false) remember(pawn);
        return;
      }

      if (msg.type === "scene") {
        if (client.role !== "dm") return;
        const next = sanitizeScene(msg.scene);
        if (!next) return;
        const changed = scene?.id !== next.id;
        scene = next;
        if (changed) {
          for (const pawn of pawns.values()) {
            const start = spotFor(pawn.name);
            pawn.x = start.x;
            pawn.y = start.y;
            pawn.seq += 1;
          }
        }
        broadcastScene();
        if (changed) broadcast({ type: "pawns", pawns: pawnList() });
      }
    });

    ws.on("close", () => {
      clearTimeout(joinTimer);
      removeClient(ws);
    });
    ws.on("error", () => {
      clearTimeout(joinTimer);
      ws.close();
    });
  });

  // What agents (the MCP server, the in-app assistant) use. They act as the GM.
  const agentHandle = {
    seat: { role: "dm", name: "Agent" },
    records,
    dice,
    roll: (formula, label, from = "Agent") => rollDice(formula, label, from, "agent"),
    say: (line, from = "Agent") => addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: text(line, "").slice(0, 500), at: Date.now() }),
    chatLog: (count = 20) => chat.slice(-Math.max(1, Math.min(100, Number(count) || 20))),
    players: () => playerList(),
    pawns: () => pawnList(),
    scene: () => scene,
  };

  return {
    listen({ port, password: nextPassword }) {
      password = String(nextPassword ?? "").trim();
      hostToken = crypto.randomBytes(24).toString("hex");
      return new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once("error", onError);
        server.listen(port, "0.0.0.0", () => {
          server.off("error", onError);
          server.on("error", (error) => console.error("table server", error));
          const address = server.address();
          resolve({
            port: typeof address === "object" && address ? address.port : port,
            hostToken,
            addresses: lanAddresses(),
          });
        });
      });
    },
    setImage(bytes, mime) {
      if (!bytes || bytes.length === 0) image = null;
      else {
        const type = typeof mime === "string" && mime.startsWith("image/") ? mime : "application/octet-stream";
        image = { bytes: Buffer.from(bytes), mime: type };
      }
      imageVersion += 1;
    },
    persisted() {
      return {
        chat: chat.slice(),
        spots: JSON.parse(JSON.stringify(spots)),
        records: records.toJSON(),
        dice: dice.toJSON(),
      };
    },
    // What agents (the MCP server, the in-app assistant) use. They act as the GM.
    agent: agentHandle,
    snapshot() {
      return {
        players: playerList(),
        pawns: pawnList(),
        sceneId: scene?.id ?? null,
        imageBytes: image?.bytes.length ?? 0,
      };
    },
    stop() {
      for (const ws of clients.keys()) ws.close();
      clients.clear();
      wss.close();
      return new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
      });
    },
  };
}

module.exports = { createTableServer, decideRole, lanAddresses, eachAddress };
