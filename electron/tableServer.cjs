const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { WebSocketServer } = require("ws");
const { createRecordStore, canSee } = require("./records.cjs");
const { createDice } = require("./dice.cjs");
const { siege, siegeLibrary, siegeCheck, levelUp } = require("./siege.cjs");
const { createMapState, playerColor } = require("./mapState.cjs");
const party = require("./party.cjs");
const { createCombat } = require("./combat.cjs");
const { modulePicture } = require("./importers/fgModule.cjs");

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
    // Foundry's hidden lights are switched off; the GM can turn them on.
    if (!light || typeof light !== "object") continue;
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
      hidden: Boolean(light.hidden),
    });
  }
  const tokens = [];
  for (const [index, token] of (Array.isArray(input.tokens) ? input.tokens : []).entries()) {
    if (!token || typeof token !== "object") continue;
    if (tokens.length >= 300) break;
    tokens.push({
      id: text(token.id, `token-${index}`).slice(0, 80),
      name: text(token.name, "Creature").slice(0, 48),
      x: num(token.x, 0),
      y: num(token.y, 0),
      width: Math.max(1, num(token.width, 100)),
      height: Math.max(1, num(token.height, 100)),
      disposition: num(token.disposition, 0),
      hidden: Boolean(token.hidden) || Number(token.disposition) === -2,
    });
  }
  // Walls stay on the host: players are sent what they can see, never the walls.
  const walls = [];
  for (const [index, wall] of (Array.isArray(input.walls) ? input.walls : []).entries()) {
    if (!wall || typeof wall !== "object") continue;
    if (walls.length >= 5000) break;
    const coords = [wall.x1, wall.y1, wall.x2, wall.y2].map((value) => num(value, NaN));
    if (coords.some((value) => !Number.isFinite(value))) continue;
    walls.push({
      id: text(wall.id, `wall-${index}`).slice(0, 80),
      x1: coords[0],
      y1: coords[1],
      x2: coords[2],
      y2: coords[3],
      sight: num(wall.sight, 20),
      move: num(wall.move, 20),
      door: num(wall.door, 0),
      ds: num(wall.ds, 0),
      dir: num(wall.dir, 0),
      light: num(wall.light, 20),
      threshold: num(wall.threshold, 0) > 0 ? num(wall.threshold, 0) : null,
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
    walls,
    darkness: Math.min(1, Math.max(0, num(input.darkness, 0))),
  };
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
      ...(line.secret ? { secret: true } : {}),
    }))
    .filter((line) => line.text || line.roll);
}

// saved: { chat, map, records, dice } from an earlier session. map holds each
// scene's tokens and doors (mapState.cjs).
// onChange(kind) fires whenever something to save changes: kind is "records"
// for record changes and "table" for chat, the map and dice.
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

// art: the GM's portraits and tokens (artLibrary.cjs), served to the table.
function createTableServer({ saved = {}, onChange = () => undefined, webRoot = WEB_ROOT, art = null } = {}) {
  let password = "";
  let hostToken = "";
  let image = null;
  let imageVersion = 0;
  let scene = null;
  const clients = new Map();
  const tokenArt = new Map();
  const chat = savedChat(saved.chat);
  const records = createRecordStore({ saved: saved.records, onChange: () => onChange("records") });
  const dice = createDice(saved.dice);
  const map = createMapState({
    saved: saved.map,
    records,
    onChange: () => {
      onChange("table");
      sendMaps();
    },
    hasArt: (id) => tokenArt.has(id),
    hasPicture: (id) => Boolean(art && art.has(id)),
    // An NPC token's health and the active turn come from the tracker.
    combatFor: (tokenId) => {
      const entry = combat.entries().find((item) => item.tokenId === tokenId);
      return entry ? { health: combat.health(entry), active: combat.active() === entry.id } : null;
    },
    activeRecord: () => combat.entries().find((item) => item.id === combat.active())?.recordId ?? null,
  });

  // The combat tracker: each seat is sent its own view (combat.cjs viewFor).
  const combat = createCombat({
    saved: saved.combat,
    table: () => agentHandle,
    onChange: () => {
      onChange("table");
      sendCombat();
      sendMaps();
    },
  });
  let combatPending = false;
  function sendCombat() {
    if (combatPending) return;
    combatPending = true;
    setImmediate(() => {
      combatPending = false;
      for (const [ws, client] of clients) send(ws, { type: "combat", combat: combat.viewFor(seatOf(client)) });
    });
  }

  // The party sheet summary goes to everyone when the party or a member changes.
  let partyPending = false;
  function sendParty() {
    if (partyPending) return;
    partyPending = true;
    setTimeout(() => {
      partyPending = false;
      party
        .partyView(agentHandle)
        .then((view) => broadcast({ type: "party", party: view }))
        .catch((error) => console.error("party view", error));
    }, 30);
  }

  // Each seat is sent its own view of the map (mapState viewFor), once per
  // burst of changes.
  let mapsPending = false;
  function sendMaps() {
    if (mapsPending) return;
    mapsPending = true;
    setImmediate(() => {
      mapsPending = false;
      for (const [ws, client] of clients) send(ws, { type: "map", ...map.viewFor(seatOf(client), client.assetToken) });
    });
  }

  function seatOf(client) {
    return { role: client.role, name: client.name };
  }

  // A secret line (FG's GM-only message: a hidden creature's turn) reaches the GM only.
  function addChat(entry) {
    chat.push(entry);
    if (chat.length > 100) chat.shift();
    if (entry.secret) {
      for (const [ws, client] of clients) if (client.role === "dm") send(ws, { type: "chat", ...entry });
    } else broadcast({ type: "chat", ...entry });
    onChange("table");
    return entry;
  }

  function chatFor(client) {
    return client.role === "dm" ? chat : chat.filter((line) => !line.secret);
  }

  // label: what the roll is for ("Strength check"). from: who rolled.
  // tag: the asker's own marker (a wizard waiting for its roll), echoed back.
  // extra: what an action adds to its roll card (an attack's HIT or MISS, its target).
  function rollDice(formula, label, from, id, tag, secret = false, extra = null) {
    const result = dice.roll(formula);
    const roll = { ...result, label: text(label, "").slice(0, 160), ...(tag ? { tag: text(tag, "").slice(0, 80) } : {}), ...(extra ?? {}) };
    addChat({ id, from, text: "", roll, at: Date.now(), ...(secret ? { secret: true } : {}) });
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
    // A token's health dot follows its record.
    if (map.tokens().some((token) => token.recordId === record.id)) sendMaps();
    if (record.id === party.PARTY_ID || record.type === "character") sendParty();
    if (combat.entries().some((entry) => entry.recordId === record.id)) sendCombat();
  });

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
    // The art library: a list for the pickers, and the files themselves.
    if (req.method === "GET" && (url.pathname === "/art/list" || url.pathname === "/art/file")) {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      if (!allowed || !art) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      if (url.pathname === "/art/list") {
        const kind = url.searchParams.get("kind");
        const body = JSON.stringify(art.list(kind === "portrait" || kind === "token" ? kind : undefined));
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(body);
        return;
      }
      const found = art.file(url.searchParams.get("id") || "");
      if (!found) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      fs.stat(found.path, (error, stat) => {
        if (error) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": found.mime, "Content-Length": stat.size, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" });
        fs.createReadStream(found.path).pipe(res);
      });
      return;
    }
    // A creature's picture from its module (an NPC's token or portrait). A seat
    // may have it when it can see the record or a visible token of it.
    if (req.method === "GET" && url.pathname === "/table/record-art") {
      const token = url.searchParams.get("token") || "";
      const client = [...clients.values()].find((item) => item.assetToken === token);
      const record = client ? records.get(url.searchParams.get("record") || "") : null;
      const allowed =
        record &&
        (canSee(record, seatOf(client)) || map.tokens().some((item) => item.recordId === record.id && !item.hidden) || client.role === "dm");
      const kind = url.searchParams.get("kind") === "portrait" ? "picture" : "token";
      const picture = allowed ? modulePicture(record.data?.[kind] || record.data?.picture || record.data?.token, record.source) : null;
      if (!picture) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": picture.mime, "Content-Length": picture.bytes.length, "Cache-Control": "private, max-age=3600" });
      res.end(picture.bytes);
      return;
    }
    if (req.method === "GET" && url.pathname === "/table/token") {
      const token = url.searchParams.get("token") || "";
      const allowed = token.length > 0 && [...clients.values()].some((client) => client.assetToken === token);
      const art = allowed ? tokenArt.get(url.searchParams.get("id") || "") : null;
      if (!art) {
        res.writeHead(404, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": art.mime, "Content-Length": art.bytes.length, "Cache-Control": "private, max-age=3600" });
      res.end(art.bytes);
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

  // The scene a player is sent: the map and lights. Walls stay on the host
  // and tokens come with the player's map view.
  function sceneFor(client) {
    if (!scene) return null;
    const { walls, tokens, lights, ...shown } = scene;
    return {
      ...shown,
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
    broadcast({ type: "players", players: playerList() });
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
        send(ws, {
          type: "ok",
          you: { id: client.id, name: client.name, role: client.role, assetToken: client.assetToken },
          players: playerList(),
          map: map.viewFor(seatOf(client), client.assetToken),
          combat: combat.viewFor(seatOf(client)),
          chat: chatFor(client),
          records: records.list({ seat: seatOf(client) }),
          scene: client.role === "player" ? sceneFor(client) : null,
        });
        broadcast({ type: "players", players: playerList() }, ws);
        party
          .partyView(agentHandle)
          .then((view) => send(ws, { type: "party", party: view }))
          .catch(() => undefined);
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
          // The dice tower: the roll goes to the GM only; the table hears that it happened.
          if (msg.tower) {
            rollDice(msg.formula, msg.label, client.name, client.id, msg.tag, true);
            if (client.role !== "dm") addChat({ id: client.id, from: client.name, text: "rolls in the dice tower.", at: Date.now() });
          } else rollDice(msg.formula, msg.label, client.name, client.id, msg.tag);
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

      // Level up from a sheet: the owner or the GM.
      if (msg.type === "level-up") {
        const record = records.get(msg.id, seatOf(client));
        if (!record || (client.role !== "dm" && record.owner !== client.name)) {
          send(ws, { type: "error", reason: "You cannot level up that character." });
          return;
        }
        levelUp(agentHandle, record, msg.package, client.role === "dm" ? record.name : client.name).catch((error) =>
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not level up." }),
        );
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

      // The map: tokens, doors, line of sight and pings (mapState.cjs decides
      // who may do what).
      if (["token-place", "token-move", "token-remove", "token-update", "door", "sight", "lock", "scene-settings", "light-place", "light-update", "light-remove"].includes(msg.type)) {
        const seat = seatOf(client);
        try {
          if (msg.type === "token-place") {
            map.place({ recordId: msg.recordId, name: msg.name, x: num(msg.x, NaN), y: num(msg.y, NaN), hidden: msg.hidden }, seat);
          } else if (msg.type === "token-move") {
            const to = { x: num(msg.x, NaN), y: num(msg.y, NaN) };
            if (!Number.isFinite(to.x) || !Number.isFinite(to.y) || Math.abs(to.x) > 1e7 || Math.abs(to.y) > 1e7) throw new Error("Where to?");
            const { blocked } = map.move(String(msg.id ?? ""), to, seat, { snap: msg.snap !== false });
            if (blocked) send(ws, { type: "notice", text: "A wall is in the way." });
          } else if (msg.type === "token-remove") {
            map.remove(String(msg.id ?? ""), seat);
          } else if (msg.type === "token-update") {
            map.update(String(msg.id ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "door") {
            map.setDoor(String(msg.id ?? ""), msg.state === undefined ? undefined : num(msg.state, -1), seat);
          } else if (msg.type === "sight") {
            if (client.role !== "dm") throw new Error("Only the GM can change line of sight.");
            map.setSight(Boolean(msg.on));
          } else if (msg.type === "scene-settings") {
            map.updateSettings(msg.patch ?? {}, seat);
          } else if (msg.type === "light-place") {
            map.placeLight(msg.light ?? {}, seat);
          } else if (msg.type === "light-update") {
            map.updateLight(String(msg.id ?? ""), msg.patch ?? {}, seat);
          } else if (msg.type === "light-remove") {
            map.removeLight(String(msg.id ?? ""), seat);
          } else if (msg.type === "lock") {
            if (client.role !== "dm") throw new Error("Only the GM can lock token movement.");
            map.setLocked(Boolean(msg.on));
          }
        } catch (error) {
          send(ws, { type: "error", reason: error instanceof Error ? error.message : "Not allowed." });
          sendMaps();
        }
        return;
      }

      // The combat tracker. Players may roll their own initiative and end their own turn.
      if (msg.type === "ct") {
        const seat = seatOf(client);
        const run = async () => {
          switch (msg.action) {
            case "add":
              if (msg.place && msg.recordId) {
                const added = await combat.add({ recordId: msg.recordId, count: msg.count, hidden: msg.hidden }, seat);
                for (const entry of Array.isArray(added) ? added : [added]) {
                  if (entry.tokenId || !map.scene()) continue;
                  const token = map.place({ recordId: msg.recordId, name: entry.name, hidden: entry.hidden, faction: entry.faction }, seat);
                  combat.update(entry.id, { tokenId: token.id }, seat);
                }
              } else await combat.add(msg.entry ?? { recordId: msg.recordId, count: msg.count, tokenId: msg.tokenId, name: msg.name, faction: msg.faction }, seat);
              return;
            case "add-party":
              for (const record of (await party.partyView(agentHandle)).members) await combat.add({ recordId: record.id }, seat);
              return;
            case "update":
              return combat.update(String(msg.id), msg.patch ?? {}, seat);
            case "remove":
              return combat.remove(String(msg.id), seat);
            case "init":
              return combat.rollInit(String(msg.which ?? ""), seat);
            case "next":
              return combat.next(seat);
            case "round":
              return combat.nextRound(seat);
            case "end":
              return combat.end(seat, { removeNpcs: Boolean(msg.removeNpcs) });
            case "effect":
              return combat.addEffect(String(msg.id), msg.effect ?? {}, seat);
            case "effect-remove":
              return combat.removeEffect(String(msg.id), String(msg.effectId), seat);
            case "damage":
              return combat.damage(String(msg.id), msg.amount, seat);
            case "target": {
              // A target by token: the source is the player's own entry (the active
              // one if several), or the GM's chosen or active entry.
              const entries = combat.entries();
              const target = msg.targetId ? entries.find((entry) => entry.id === msg.targetId) : entries.find((entry) => entry.tokenId === msg.tokenId || (msg.tokenId && entry.recordId && map.tokens().find((token) => token.id === msg.tokenId)?.recordId === entry.recordId));
              if (!target) throw new Error("Add that token to the combat tracker first.");
              const source = msg.sourceId
                ? entries.find((entry) => entry.id === msg.sourceId)
                : client.role === "dm"
                  ? entries.find((entry) => entry.id === combat.active())
                  : entries.find((entry) => entry.id === combat.active() && combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine) ??
                    entries.find((entry) => combat.viewFor(seat).entries.find((item) => item.id === entry.id)?.mine);
              if (!source) throw new Error(client.role === "dm" ? "Whose target? Start combat or pick a creature." : "Your character is not in the fight.");
              const already = source.targets.includes(target.id);
              return combat.target(source.id, target.id, msg.on ?? !already, seat);
            }
            case "clear-targets":
              return combat.clearTargets(String(msg.id), seat);
            case "attack":
              return combat.attack(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.weapon), seat, client.role === "dm" ? "Combat" : client.name);
            case "damage-roll":
              return combat.damageRoll(msg.recordId ? { recordId: String(msg.recordId) } : { entryId: String(msg.id) }, String(msg.weapon), seat, client.role === "dm" ? "Combat" : client.name);
            case "heal":
              return combat.heal(String(msg.id), msg.amount, seat);
            default:
              throw new Error("Unknown tracker action.");
          }
        };
        run().catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      // The party sheet's actions (the GM's): award XP, hand out the parcel,
      // group checks and saves.
      if (["party-award-xp", "party-award", "party-distribute", "party-group"].includes(msg.type)) {
        if (client.role !== "dm") {
          send(ws, { type: "error", reason: "Only the GM can do that." });
          return;
        }
        const run =
          msg.type === "party-award-xp"
            ? party.awardXP(agentHandle, msg.xp, client.name)
            : msg.type === "party-award"
              ? party.awardEntries(agentHandle, msg.kind, msg.id, client.name)
              : msg.type === "party-distribute"
                ? party.distribute(agentHandle, client.name)
                : party.groupCheck(agentHandle, msg.kind === "save" ? "save" : "check", msg.attribute, msg.cl, client.name);
        run.catch((error) => send(ws, { type: "error", reason: error instanceof Error ? error.message : "Could not do that." }));
        return;
      }

      if (msg.type === "ping") {
        const x = num(msg.x, NaN);
        const y = num(msg.y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        broadcast({ type: "ping", x, y, from: client.name, color: playerColorOf(client) });
        return;
      }

      if (msg.type === "scene") {
        if (client.role !== "dm") return;
        const next = sanitizeScene(msg.scene);
        if (!next) return;
        scene = next;
        map.setScene(next);
        broadcastScene();
        sendMaps();
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
    roll: (formula, label, from = "Agent", secret = false, extra = null) => rollDice(formula, label, from, "agent", undefined, secret, extra),
    // Posts a roll already made (an attack decides HIT or MISS before its card goes out).
    postRoll: (result, label, from = "Agent", secret = false, extra = null) =>
      addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: "", roll: { ...result, label: text(label, "").slice(0, 160), ...(extra ?? {}) }, at: Date.now(), ...(secret ? { secret: true } : {}) }),
    say: (line, from = "Agent", secret = false) =>
      addChat({ id: "agent", from: text(from, "Agent").slice(0, 24), text: text(line, "").slice(0, 500), at: Date.now(), ...(secret ? { secret: true } : {}) }),
    chatLog: (count = 20) => chat.slice(-Math.max(1, Math.min(100, Number(count) || 20))),
    players: () => playerList(),
    scene: () => scene,
    map,
    combat,
    viewFor: (name) => map.viewFor({ role: "player", name }, ""),
  };

  function playerColorOf(client) {
    return client.role === "dm" ? "#f4f1ea" : playerColor(client.name);
  }

  return {
    listen({ port, password: nextPassword }) {
      password = String(nextPassword ?? "").trim();
      hostToken = crypto.randomBytes(24).toString("hex");
      return Promise.all([map.ready, combat.ready]).then(() => new Promise((resolve, reject) => {
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
      }));
    },
    setImage(bytes, mime) {
      if (!bytes || bytes.length === 0) image = null;
      else {
        const type = typeof mime === "string" && mime.startsWith("image/") ? mime : "application/octet-stream";
        image = { bytes: Buffer.from(bytes), mime: type };
      }
      imageVersion += 1;
    },
    // Token pictures from the GM's adventure, by Foundry token id, so players see them too.
    setTokenArt(list) {
      tokenArt.clear();
      for (const item of Array.isArray(list) ? list.slice(0, 400) : []) {
        if (!item || typeof item.id !== "string" || !item.bytes || item.bytes.length === 0 || item.bytes.length > 8 * 1024 * 1024) continue;
        const mime = typeof item.mime === "string" && item.mime.startsWith("image/") ? item.mime : "application/octet-stream";
        tokenArt.set(item.id.slice(0, 80), { bytes: Buffer.from(item.bytes), mime });
      }
      sendMaps();
    },
    persisted() {
      return {
        chat: chat.slice(),
        map: map.persisted(),
        combat: combat.persisted(),
        records: records.toJSON(),
        dice: dice.toJSON(),
      };
    },
    // What agents (the MCP server, the in-app assistant) use. They act as the GM.
    agent: agentHandle,
    snapshot() {
      return {
        players: playerList(),
        tokens: map.tokens().map((token) => ({ ...token })),
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
