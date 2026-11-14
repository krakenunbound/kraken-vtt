// Code mode for Kraken's agent tools (kraken_code): an agent sends one piece of
// JavaScript that calls several Kraken tools, in parallel or one after another,
// and gets back only what it returns. Each call goes through callTool, the
// same path (and the same checks) as calling that tool on its own.
//
// The code runs in its own V8 context, never in Kraken's: no require, no
// process, no file system, nothing of Kraken's but `kraken()`. Kraken never
// hands the context one of its own objects or functions (whose constructor
// would lead back to Kraken's realm); every request and answer crosses as a
// JSON string. The context's promises run only while Kraken runs a script in
// it (microtaskMode "afterEvaluate"), so every slice of the code, before and
// after each await, is under a time limit: a loop that never ends is stopped.
const vm = require("vm");

const SLICE_MS = 5000; // the longest any one stretch of the code may run without waiting
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 600000;
const MAX_CALLS = 1000;
const MAX_OUTPUT = 100000;

// What runs inside the context first: kraken(), console and the plumbing.
const PRELUDE = `
"use strict";
const __pending = new Map();
let __next = 0;
globalThis.__queue = [];
globalThis.__logs = [];
globalThis.__result = undefined;
globalThis.kraken = (name, args = {}) =>
  new Promise((resolve, reject) => {
    const id = ++__next;
    __pending.set(id, { resolve, reject });
    __queue.push(JSON.stringify({ id, name: String(name), args: args ?? {} }));
  });
globalThis.__settle = (id, ok, text) => {
  const waiting = __pending.get(id);
  if (!waiting) return;
  __pending.delete(id);
  if (!ok) return waiting.reject(new Error(text));
  let value = text;
  try { value = JSON.parse(text); } catch {}
  waiting.resolve(value);
};
const __show = (value) => (typeof value === "string" ? value : (() => { try { return JSON.stringify(value); } catch { return String(value); } })());
globalThis.console = { log: (...items) => { __logs.push(items.map(__show).join(" ")); }, error: (...items) => { __logs.push(items.map(__show).join(" ")); } };
`;

// The agent's code as the body of an async function: a lone expression is
// its result; statements say what they want back with return.
function wrap(code) {
  const body = String(code ?? "");
  let expression = true;
  try {
    new vm.Script(`(async () => (\n${body}\n))`);
  } catch {
    expression = false;
  }
  const inner = expression ? `return (\n${body}\n);` : body;
  return `globalThis.__done = (async () => {\n${inner}\n})().then(
  (value) => { let text; try { text = JSON.stringify(value === undefined ? null : value); } catch (error) { text = JSON.stringify(String(value)); } globalThis.__result = JSON.stringify({ ok: true, text }); },
  (error) => { globalThis.__result = JSON.stringify({ ok: false, error: String(error && error.stack ? error.stack : error) }); });`;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// Runs the code; callTool(name, args) is the host's (one tool call, its MCP result).
async function runCode(code, callTool, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const limit = Math.min(MAX_TIMEOUT_MS, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
  const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: "afterEvaluate" });
  const run = (source) => vm.runInContext(source, context, { timeout: SLICE_MS, displayErrors: false });
  const calls = [];
  const started = Date.now();
  try {
    run(PRELUDE);
    run(wrap(code));
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error), calls, logs: [] };
  }
  const inFlight = new Set();
  const answered = [];
  const logsNow = () => {
    try {
      return JSON.parse(run("JSON.stringify(__logs)"));
    } catch {
      return [];
    }
  };
  try {
    return await pump();
  } catch (error) {
    // A stretch of the code ran past its slice (a loop that never ends), or the context broke.
    const timedOut = error?.code === "ERR_SCRIPT_EXECUTION_TIMEOUT";
    return { ok: false, error: timedOut ? `Stopped: the code ran ${SLICE_MS / 1000} s without waiting (a loop that never ends?).` : String(error?.message ?? error), calls, logs: timedOut ? [] : logsNow() };
  }

  async function pump() {
  while (true) {
    // The context's requests: each a JSON string.
    const requests = run("__queue.splice(0, __queue.length).join('\\n')");
    for (const line of String(requests).split("\n").filter(Boolean)) {
      const request = JSON.parse(line);
      if (calls.length >= MAX_CALLS) {
        answered.push({ id: request.id, ok: false, text: `More than ${MAX_CALLS} tool calls.` });
        continue;
      }
      calls.push(request.name);
      const job = (async () => {
        if (request.name === "kraken_code") throw new Error("kraken_code cannot call itself.");
        const result = await callTool(request.name, request.args && typeof request.args === "object" ? request.args : {});
        const text = (result?.content ?? []).filter((item) => item.type === "text").map((item) => item.text).join("\n");
        if (result?.isError) throw new Error(text || "The tool failed.");
        return text;
      })().then(
        (text) => answered.push({ id: request.id, ok: true, text }),
        (error) => answered.push({ id: request.id, ok: false, text: String(error?.message ?? error) }),
      );
      inFlight.add(job);
      job.finally(() => inFlight.delete(job));
    }
    // Answers back in, as string literals; the context's code runs on from there.
    for (const answer of answered.splice(0)) run(`__settle(${Number(answer.id)}, ${answer.ok ? "true" : "false"}, ${JSON.stringify(answer.text)})`);
    const result = run("__result");
    if (typeof result === "string") {
      const logs = JSON.parse(run("JSON.stringify(__logs)"));
      const done = JSON.parse(result);
      return done.ok ? { ok: true, result: JSON.parse(done.text), calls, logs } : { ok: false, error: done.error, calls, logs };
    }
    if (Date.now() - started > limit) {
      const logs = JSON.parse(run("JSON.stringify(__logs)"));
      return { ok: false, error: `Stopped after ${Math.round(limit / 1000)} s.`, calls, logs };
    }
    // Nothing to answer yet: wait for a tool call to come back (or a turn of the loop).
    if (inFlight.size && !answered.length) await Promise.race([...inFlight, new Promise((resolve) => setTimeout(resolve, 50))]);
    else await tick();
  }
  }
}

// What the tool sends back: the code's result, its console lines and the
// tools it called, cut to a size an agent can read.
function report(outcome) {
  let text = JSON.stringify(outcome, null, 2);
  if (text.length > MAX_OUTPUT) text = `${text.slice(0, MAX_OUTPUT)}\n... (cut at ${MAX_OUTPUT} characters: return less)`;
  return { content: [{ type: "text", text }], ...(outcome.ok ? {} : { isError: true }) };
}

module.exports = { runCode, report, MAX_CALLS };
