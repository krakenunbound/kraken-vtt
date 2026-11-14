// kraken_code (code mode): one piece of JavaScript calling several Kraken
// tools. Parallel and chained calls, a lone expression, a failed call caught,
// console lines, the limits (a loop that never ends, before and after an
// await; kraken_code calling itself), and the sandbox (no process, no
// require, no way back to Kraken's realm through a constructor).
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

let checks = 0;
function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

const server = createTableServer({ ruleset: "Descending Darkness" });
await server.listen({ port: 0, password: "" });
const ctx = { table: () => server };
// kraken_code's report: { ok, result | error, calls, logs }.
const code = async (source, extra = {}) => {
  const answer = await callTool("kraken_code", { code: source, ...extra }, ctx);
  return { ...JSON.parse(answer.content[0].text), isError: Boolean(answer.isError) };
};

try {
  // Three rolls at once, with fixed dice, and only the totals back.
  {
    const run = await code(`await kraken("kraken_dice_force", { values: [3, 5, 6] });
const rolls = await Promise.all(["1d6", "1d6", "1d6"].map((formula, index) => kraken("kraken_roll", { formula, label: "die " + index })));
return rolls.map((roll) => roll.total ?? roll.result?.total);`);
    assert(run.ok && Array.isArray(run.result) && run.result.length === 3, `parallel rolls: ${JSON.stringify(run)}`);
    assert([...run.result].sort().join() === "3,5,6", `the fixed dice came back: ${JSON.stringify(run.result)}`);
    assert(run.calls.length === 4 && run.calls.filter((name) => name === "kraken_roll").length === 3, `four calls made: ${run.calls}`);
  }
  // One result used in the next call, and console lines.
  {
    const run = await code(`await kraken("kraken_dice_force", { values: [4, 2] });
const first = await kraken("kraken_roll", { formula: "1d6", label: "first" });
const total = first.total ?? first.result?.total;
console.log("first was", total);
const second = await kraken("kraken_roll", { formula: total + "d6", label: "as many dice as the first" });
return { first: total, dice: (second.dice ?? second.result?.dice ?? []).length || second.formula || second.result?.formula };`);
    assert(run.ok && run.result.first === 4, `chained: ${JSON.stringify(run)}`);
    assert(run.logs.length === 1 && run.logs[0] === "first was 4", `console lines: ${JSON.stringify(run.logs)}`);
  }
  // A lone expression is the result.
  {
    const run = await code(`[1, 2, 3].map((n) => n * 2)`);
    assert(run.ok && run.result.join() === "2,4,6", `a lone expression: ${JSON.stringify(run)}`);
  }
  // A failed call throws in the code, which can catch it.
  {
    const run = await code(`try { await kraken("kraken_no_such_tool"); return "no"; } catch (error) { return "caught: " + error.message; }`);
    assert(run.ok && /caught: Unknown tool/.test(run.result), `a failed call is caught: ${JSON.stringify(run)}`);
    const uncaught = await code(`await kraken("kraken_no_such_tool");`);
    assert(!uncaught.ok && uncaught.isError && /Unknown tool/.test(uncaught.error), `an uncaught failure is the tool's error: ${JSON.stringify(uncaught)}`);
  }
  // Limits: kraken_code cannot call itself; a loop that never ends is stopped, before or after an await.
  {
    const self = await code(`try { await kraken("kraken_code", { code: "1" }); return "ran"; } catch (error) { return error.message; }`);
    assert(self.ok && /cannot call itself/.test(self.result), `no code calling code: ${JSON.stringify(self)}`);
    const t0 = Date.now();
    const before = await code(`while (true) {}`);
    assert(!before.ok && /timed out|Script execution|Stopped/i.test(before.error), `a loop before any await is stopped: ${JSON.stringify(before)}`);
    const after = await code(`await kraken("kraken_dice_force", { values: [1] }); while (true) {}`);
    assert(!after.ok && Date.now() - t0 < 30000, `a loop after an await is stopped too: ${JSON.stringify(after).slice(0, 200)}`);
    const slow = await code(`await new Promise(() => {}); return 1;`, { timeoutSeconds: 1 });
    assert(!slow.ok && /Stopped after/.test(slow.error), `code that never finishes stops at its time limit: ${JSON.stringify(slow)}`);
  }
  // The sandbox: nothing of Kraken's realm is reachable.
  {
    const run = await code(`const out = {};
out.process = typeof process; out.require = typeof require; out.global = typeof global;
try { out.ctor = String(this && this.constructor && this.constructor.constructor("return typeof process")()); } catch (error) { out.ctor = "refused: " + error.name; }
try { out.krakenCtor = String(kraken.constructor("return typeof process")()); } catch (error) { out.krakenCtor = "refused: " + error.name; }
try { out.evalCall = String(eval("1 + 1")); } catch (error) { out.evalCall = "refused: " + error.name; }
try { out.objectCtor = String(({}).constructor.constructor("return typeof process")()); } catch (error) { out.objectCtor = "refused: " + error.name; }
return out;`);
    assert(run.ok, `the sandbox probe ran: ${JSON.stringify(run)}`);
    const probe = run.result;
    assert(probe.process === "undefined" && probe.require === "undefined" && probe.global === "undefined", `no process, require or global: ${JSON.stringify(probe)}`);
    for (const key of ["ctor", "krakenCtor", "evalCall", "objectCtor"]) assert(/^refused/.test(probe[key]) || probe[key] === "undefined", `${key} cannot reach Kraken's realm: ${probe[key]}`);
  }
  console.log(`ok code-mode: ${checks} checks (parallel and chained tool calls, a lone expression, failures caught, console lines, kraken_code not calling itself, endless loops stopped before and after an await, a time limit, and a sandbox with no way out)`);
} finally {
  await server.close?.();
}
process.exit(0);
