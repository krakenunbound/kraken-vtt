#!/usr/bin/env node
// stdio MCP server for Kraken VTT: forwards each JSON-RPC line to the running
// app's agent bridge (~/.kraken-vtt/agent.json) and prints the answer.
// Register it with an MCP client as: node <this file>
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const file = process.env.KRAKEN_AGENT_FILE || path.join(os.homedir(), ".kraken-vtt", "agent.json");

function bridge() {
  try {
    const info = JSON.parse(fs.readFileSync(file, "utf8"));
    if (info.url && info.token) return info;
  } catch {
    /* Handled below. */
  }
  return null;
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function forward(message) {
  const info = bridge();
  const id = message?.id ?? null;
  if (!info) {
    if (id !== null) write({ jsonrpc: "2.0", id, error: { code: -32000, message: "Kraken VTT is not running (no agent.json). Start the app." } });
    return;
  }
  try {
    const response = await fetch(info.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${info.token}` },
      body: JSON.stringify(message),
    });
    if (response.status === 202) return;
    const text = await response.text();
    if (text) write(JSON.parse(text));
  } catch (error) {
    if (id !== null) {
      write({ jsonrpc: "2.0", id, error: { code: -32000, message: `Kraken VTT did not answer: ${error instanceof Error ? error.message : error}. Is the app running?` } });
    }
  }
}

const lines = readline.createInterface({ input: process.stdin });
let pending = Promise.resolve();
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } });
    return;
  }
  // Keep answers in request order.
  pending = pending.then(() => forward(message));
});
lines.on("close", () => {
  pending.then(() => process.exit(0));
});
