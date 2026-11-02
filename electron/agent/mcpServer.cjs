const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { listTools, callTool } = require("./tools.cjs");

// The built-in agent bridge: an MCP server (JSON-RPC over HTTP, the
// "streamable HTTP" transport answering with plain JSON) on 127.0.0.1 only.
// Clients send the token from ~/.kraken-vtt/agent.json as a bearer token.
// electron/agent/mcp-stdio.cjs turns it into a stdio MCP server for clients
// that only speak stdio.

const PROTOCOL = "2025-06-18";
const DEFAULT_PORT = 47310;

function agentFile() {
  return process.env.KRAKEN_AGENT_FILE || path.join(os.homedir(), ".kraken-vtt", "agent.json");
}

function loadToken(file) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof saved.token === "string" && saved.token.length >= 32) return saved.token;
  } catch {
    /* A new token is made below. */
  }
  return crypto.randomBytes(24).toString("hex");
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function reply(res, status, body) {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handle(message, ctx, version) {
  const { id, method, params } = message ?? {};
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: typeof params?.protocolVersion === "string" ? params.protocolVersion : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kraken-vtt", title: "Kraken VTT", version },
        instructions:
          "Kraken VTT: you are the GM's assistant with full control of the table. Call kraken_status first. " +
          "Records (characters, NPCs, items, notes) are JSON the ruleset defines; read one before writing another of the same type. " +
          "Rolls go to the table's chat. Ask before disconnecting players or deleting records the GM made.",
      },
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: listTools() } };
  if (method === "tools/call") {
    try {
      const result = await callTool(params?.name, params?.arguments, ctx);
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
    }
  }
  if (typeof method === "string" && method.startsWith("notifications/")) return null;
  return rpcError(id, -32601, `Unknown method ${method}.`);
}

function startAgentServer(ctx, { version = "0.1.0", port = Number(process.env.KRAKEN_AGENT_PORT) || DEFAULT_PORT } = {}) {
  const file = agentFile();
  const token = loadToken(file);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    // Loopback only, and no browser pages: a web page could otherwise reach
    // this port through DNS rebinding.
    const host = String(req.headers.host || "").replace(/:\d+$/, "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host) || req.headers.origin) {
      reply(res, 403, rpcError(null, -32000, "Forbidden."));
      return;
    }
    if (url.pathname !== "/mcp") {
      reply(res, 404, rpcError(null, -32000, "Not found."));
      return;
    }
    const auth = String(req.headers.authorization || "");
    if (!auth.startsWith("Bearer ") || !sameSecret(auth.slice(7), token)) {
      reply(res, 401, rpcError(null, -32000, "Missing or wrong token. It is in ~/.kraken-vtt/agent.json."));
      return;
    }
    if (req.method !== "POST") {
      // No server-to-client stream: every answer comes back on its POST.
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) req.destroy();
      else chunks.push(chunk);
    });
    req.on("end", async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        reply(res, 400, rpcError(null, -32700, "Parse error."));
        return;
      }
      if (Array.isArray(body)) {
        const answers = (await Promise.all(body.map((message) => handle(message, ctx, version)))).filter(Boolean);
        if (answers.length === 0) {
          res.writeHead(202);
          res.end();
        } else reply(res, 200, answers);
        return;
      }
      const answer = await handle(body, ctx, version);
      if (!answer) {
        res.writeHead(202);
        res.end();
        return;
      }
      reply(res, 200, answer);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      const actual = server.address().port;
      const info = { url: `http://127.0.0.1:${actual}/mcp`, token, pid: process.pid };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(info, null, 2), { mode: 0o600 });
      resolve({ ...info, file, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

module.exports = { startAgentServer, agentFile };
