// An agent's call sent while the backend is busy waits for it, and is not cut
// off. An agent client (as mcp-stdio.cjs, Node's fetch) keeps its connection
// open between calls; a backend busy past the server's keep-alive time (5 s
// by default) used to close that connection the moment it was free again,
// unread, and the call failed with "fetch failed" (ECONNRESET).
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";

const require = createRequire(import.meta.url);
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const profile = mkdtempSync(path.join(tmpdir(), "kraken-agent-busy-"));
process.env.KRAKEN_AGENT_FILE = path.join(profile, "agent.json");
const { startAgentServer } = require("../electron/agent/mcpServer.cjs");
const server = await startAgentServer({}, { port: 0 });
// The agent: a call, then another a second later on the same connection.
const agent = `
const info = JSON.parse(require("fs").readFileSync(process.env.KRAKEN_AGENT_FILE, "utf8"));
const call = (id) => fetch(info.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + info.token },
  body: JSON.stringify({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } } }) })
  .then((response) => response.json()).then((answer) => (answer.result ? "answered" : JSON.stringify(answer)), (error) => "failed: " + error.message + " " + (error.cause?.code ?? ""));
(async () => {
  console.log("1 " + (await call(1)));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("2 " + (await call(2)));
})();`;
const child = spawn(process.execPath, ["-e", agent], { env: process.env, stdio: ["ignore", "pipe", "inherit"] });
const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
try {
  const first = (await lines.next()).value;
  assert(first === "1 answered", `the first call is answered: ${first}`);
  // The backend busy for 6 s (a book shelf read cold, say); the agent's second call comes in meanwhile.
  const until = Date.now() + 6000;
  while (Date.now() < until) {
    /* busy */
  }
  const second = (await lines.next()).value;
  assert(second === "2 answered", `the call sent while the backend was busy is answered once it is free, not cut off: ${second}`);
  console.log("ok agent busy: a call sent on the open connection while the backend is busy 6 s is answered when it is free (no ECONNRESET)");
} finally {
  child.kill();
  await server.close();
}
