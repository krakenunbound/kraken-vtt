// The DM assistant's loop, with a stand-in for Claude (no key, no network):
// a reply asking for tools runs them on a live table through the same tools
// as the MCP bridge, each result goes back in one message, the history stays
// valid for the next request (thinking blocks and all), a failing tool comes
// back as an error result, a refusal stops, no key says what to do, the tool
// that runs code in the GM's window is withheld, and kraken_assistant drives it.
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { createAssistant, MODEL } = require("../electron/assistant.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// A scripted Claude: each request gets the next reply; the requests are kept.
function standIn(replies) {
  const requests = [];
  return {
    requests,
    client: {
      beta: {
        messages: {
          async create(params) {
            requests.push(JSON.parse(JSON.stringify(params)));
            const reply = replies.shift();
            if (!reply) throw new Error("no more scripted replies");
            return reply;
          },
        },
      },
    },
  };
}
const toolUse = (id, name, input) => ({ type: "tool_use", id, name, input });

const server = createTableServer();
try {
  await server.listen({ port: 0, password: "" });
  const events = [];
  const ctx = { table: () => server };

  // No key: it says where one goes.
  const keyless = createAssistant({ ctx, key: () => null, makeClient: () => null, onEvent: () => {} });
  const none = await keyless.ask("Roll for me");
  assert(none.log.some((event) => event.kind === "error" && /API key/.test(event.text)), "no key: says to add one");

  // A re-roll and a look at the tracker, then an answer.
  const script = standIn([
    {
      stop_reason: "tool_use",
      content: [
        { type: "thinking", thinking: "", signature: "sig-1" },
        { type: "text", text: "Re-rolling it with the +2." },
        toolUse("t1", "kraken_roll", { formula: "1d20+2", label: "Re-roll: Orc 2 attack (+2 added)", as: "Orc 2" }),
        toolUse("t2", "kraken_combat", { action: "view" }),
        toolUse("t3", "kraken_record_get", { id: "no-such-record" }),
      ],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Orc 2 rolled 14 (12 + 2): a hit on AC 13." }] },
  ]);
  const assistant = createAssistant({ ctx, key: () => "test-key", makeClient: (key) => (assert(key === "test-key", "the key reaches the client"), script.client), onEvent: (event) => events.push(event) });
  server.agent.dice.force([12]);
  const done = await assistant.ask("Re-roll Orc 2's attack, it should have had +2");

  const first = script.requests[0];
  assert(first.model === MODEL && first.model === "claude-opus-5-5", `model: ${first.model}`);
  assert(first.thinking?.type === "adaptive" && first.fallbacks === "default" && first.betas.includes("server-side-fallback-2026-07-01"), "adaptive thinking, refusal fallbacks");
  assert(/DM assistant/.test(first.system) && /Re-rolls/.test(first.system), "the skill document is its system prompt");
  assert(!first.tools.some((tool) => tool.name === "kraken_ui_eval" || tool.name === "kraken_code") && first.tools.some((tool) => tool.name === "kraken_combat") && first.tools.every((tool) => tool.input_schema), "the bridge's tools, without kraken_ui_eval or kraken_code");

  // The roll really happened at the table.
  const chat = JSON.parse((await callTool("kraken_chat_log", {}, ctx)).content[0].text);
  const line = chat.find((item) => item.roll?.label === "Re-roll: Orc 2 attack (+2 added)");
  assert(line && line.roll.total === 14 && line.from === "Orc 2", `the re-roll is in chat: ${JSON.stringify(line?.roll)}`);

  // The second request carries the whole first reply (thinking too) and all three results in one message.
  const second = script.requests[1].messages;
  assert(second.length === 3 && second[1].role === "assistant" && second[1].content[0].type === "thinking" && second[1].content[0].signature === "sig-1", "the reply goes back unchanged");
  const results = second[2].content;
  assert(second[2].role === "user" && results.length === 3 && results.map((item) => item.tool_use_id).join() === "t1,t2,t3", "three results, one message, in order");
  assert(results[2].is_error === true && !results[0].is_error, "a failing tool is an error result, the others are not");
  assert(done.log.some((event) => event.kind === "tool" && event.name === "kraken_roll") && done.log.at(-1).text.includes("a hit"), "the window sees the tools and the answer");
  assert(events.some((event) => event.kind === "thinking") && events.at(-1).kind === "done", "busy and done events");

  // A refusal stops the turn; the history is still valid for the next one.
  script.client.beta.messages.create = (async (params) => {
    script.requests.push(JSON.parse(JSON.stringify(params)));
    return { stop_reason: "refusal", content: [] };
  });
  const refused = await assistant.ask("Something it won't do");
  assert(refused.log.some((event) => event.kind === "note" && /declined/.test(event.text)), "a refusal is said");
  const last = script.requests.at(-1).messages;
  assert(last.at(-1).role === "user" && last.at(-2).role === "assistant", "the next request follows on");

  // The withheld tool never runs, even if asked for.
  const sneaky = standIn([{ stop_reason: "tool_use", content: [toolUse("x", "kraken_ui_eval", { code: "1+1" })] }, { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }]);
  const other = createAssistant({ ctx, key: () => "k", makeClient: () => sneaky.client });
  await other.ask("run code");
  const blocked = sneaky.requests[1].messages.at(-1).content[0];
  assert(blocked.is_error && /not available/.test(blocked.content[0].text), "kraken_ui_eval is refused");

  // kraken_assistant: view, ask and reset through the MCP tool.
  const viaTool = standIn([{ stop_reason: "end_turn", content: [{ type: "text", text: "Hello, GM." }] }]);
  const third = createAssistant({ ctx, key: () => "k", makeClient: () => viaTool.client });
  const toolCtx = { ...ctx, assistant: () => third };
  const asked = JSON.parse((await callTool("kraken_assistant", { action: "ask", text: "hi" }, toolCtx)).content[0].text);
  assert(asked.log.at(-1).text === "Hello, GM." && asked.model === MODEL, "kraken_assistant ask");
  const reset = JSON.parse((await callTool("kraken_assistant", { action: "reset" }, toolCtx)).content[0].text);
  assert(reset.log.length === 0, "kraken_assistant reset");
  // Step 6's "done when", through the assistant's own loop with a stand-in that
  // decides each next call from the last results, as Claude would: build a
  // character, start combat with an orc, run a round. (Real Claude needs the GM's key.)
  const { listModules } = require("../electron/importers/fgModule.cjs");
  const phb = listModules().find((item) => (item.name ?? item) === "C&C Player's Handbook");
  let stepNote = "the C&C Player's Handbook was not on this computer";
  if (phb) {
    const lastResults = (params) => {
      const last = params.messages.at(-1);
      return Array.isArray(last.content) ? last.content.map((item) => JSON.parse(item.content?.[0]?.text ?? "null")) : [];
    };
    let step = 0;
    const planner = {
      beta: {
        messages: {
          async create(params) {
            step += 1;
            const [result] = lastResults(params);
            const call = (name, input) => ({ stop_reason: "tool_use", content: [toolUse(`p${step}`, name, input)] });
            if (step === 1) return call("kraken_import_fg_module", { module: "C&C Player's Handbook" });
            if (step === 2) return call("kraken_build_character", { owner: "Ann", spec: { name: "Thorin Ironfist", race: "Dwarf", class: "Fighter", level: 1, scores: { strength: 17, dexterity: 12, constitution: 15, intelligence: 10, wisdom: 11, charisma: 8 }, primes: ["constitution"], gold: 100, gear: [["Sword, Long", 1], ["Scale Mail", 1]] } });
            if (step === 3) {
              planner.thorin = result.id;
              return { stop_reason: "tool_use", content: [toolUse("p3a", "kraken_record_create", { type: "npc", name: "Orc", data: { hd: "1d8", hp: 6, ac: 13, atk: "1d8" } }), toolUse("p3b", "kraken_combat", { action: "add", recordId: planner.thorin })] };
            }
            if (step === 4) {
              const orc = lastResults(params)[0];
              return { stop_reason: "tool_use", content: [toolUse("p4a", "kraken_combat", { action: "add", recordId: orc.id }), toolUse("p4b", "kraken_combat", { action: "init", which: "all" })] };
            }
            if (step === 5) return call("kraken_combat", { action: "view" });
            if (step === 6) {
              planner.view = result;
              const thorin = result.entries.find((entry) => entry.name === "Thorin Ironfist");
              const orc = result.entries.find((entry) => /Orc/.test(entry.name));
              // As Claude would read it from kraken_record_get: the longsword's key on Thorin's sheet.
              const sword = Object.entries(server.agent.records.get(planner.thorin).data.inventorylist ?? {}).find(([, item]) => /Sword/.test(item.name))?.[0];
              return { stop_reason: "tool_use", content: [toolUse("p6a", "kraken_combat", { action: "target", id: thorin.id, targetId: orc.id, on: true }), toolUse("p6b", "kraken_combat", { action: "attack", recordId: planner.thorin, weapon: sword })] };
            }
            // Round 1: the first turn, the second; then round 2 begins.
            if (step < 6 + 4) return call("kraken_combat", { action: "next" });
            if (step === 10) return call("kraken_combat", { action: "view" });
            planner.after = result;
            return { stop_reason: "end_turn", content: [{ type: "text", text: `Thorin is built, the fight with the orc has started and round ${result.round} is under way.` }] };
          },
        },
      },
    };
    const runner = createAssistant({ ctx, key: () => "k", makeClient: () => planner });
    const finished = await runner.ask("Build Ann a dwarf fighter, Thorin, put him against an orc and run the first round.");
    const failed = finished.log.filter((event) => event.kind === "tool-result" && !event.ok);
    assert(failed.length === 0, `every call worked: ${JSON.stringify(failed).slice(0, 300)}`);
    const thorin = server.agent.records.get(planner.thorin);
    assert(thorin?.type === "character" && thorin.owner === "Ann" && thorin.data.hp?.total > 0, "Thorin was built for Ann");
    assert(planner.view.entries.length === 2 && planner.view.entries.every((entry) => entry.initresult != null), `both are on the tracker with initiative: ${JSON.stringify(planner.view.entries.map((entry) => [entry.name, entry.initresult]))}`);
    const attackLine = JSON.parse((await callTool("kraken_chat_log", { count: 40 }, ctx)).content[0].text).find((line) => /^\[ATTACK\]/.test(line.roll?.label ?? "") && /Thorin/.test(line.roll?.by ?? line.from));
    assert(attackLine, `Thorin's attack is in chat: ${JSON.stringify(JSON.parse((await callTool("kraken_chat_log", { count: 12 }, ctx)).content[0].text).map((line) => [line.from, line.roll?.label ?? line.text]))}`);
    const turns = JSON.parse((await callTool("kraken_chat_log", { count: 40 }, ctx)).content[0].text).filter((line) => /^\[TURN\]/.test(line.text ?? "")).map((line) => line.text);
    assert(planner.after.round === 2 && turns.some((line) => /Thorin/.test(line)) && turns.some((line) => /Orc/.test(line)), `round 1 run, each had a turn, round 2 begun: ${JSON.stringify({ round: planner.after.round, turns })}`);
    stepNote = `step 6 through the loop: Thorin built, on the tracker with an orc, initiative, his attack in chat, round ${planner.after.round}`;
  }
  // Any provider with an OpenAI-style API (OpenAI, Gemini, Grok, DeepSeek, OpenRouter, a local server):
  // a stand-in service answers; the tool runs at the table and its result goes back as a tool message.
  {
    const calls = [];
    const replies = [
      { choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: "Rolling it.", tool_calls: [{ id: "c1", type: "function", function: { name: "kraken_roll", arguments: JSON.stringify({ formula: "1d20+5", label: "Any provider's roll" }) } }] } }] },
      { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "A 15 (10 + 5)." } }] },
    ];
    const fakeFetch = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "grok-a" }, { id: "grok-b" }] }), { status: 200 });
      if (init.headers?.Authorization !== "Bearer xai-key") return new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 });
      return new Response(JSON.stringify(replies.shift()), { status: 200 });
    };
    let choice = { provider: "xai", model: "grok-b" };
    const anyEvents = [];
    const any = createAssistant({ ctx, settings: () => choice, key: (provider) => (provider === "xai" ? "xai-key" : null), makeClient: () => null, fetchImpl: fakeFetch, onEvent: (event) => anyEvents.push(event) });
    assert(JSON.stringify(await any.models()) === JSON.stringify(["grok-a", "grok-b"]), "the provider's own list of models");
    server.agent.dice.force([10]);
    await any.ask("Roll 1d20+5 for me");
    const asked = calls.filter((call) => call.url.endsWith("/chat/completions"));
    assert(asked.length === 2 && asked[0].url === "https://api.x.ai/v1/chat/completions", `Grok's address (${asked.map((call) => call.url)})`);
    const body = JSON.parse(asked[0].init.body);
    assert(body.model === "grok-b" && body.messages[0].role === "system" && body.tools.some((tool) => tool.type === "function" && tool.function.name === "kraken_roll") && !body.tools.some((tool) => tool.function.name === "kraken_ui_eval"), "the chosen model, the skill as its system message, the bridge's tools as functions (none withheld)");
    const second = JSON.parse(asked[1].init.body);
    const toolMessage = second.messages.find((message) => message.role === "tool");
    assert(toolMessage?.tool_call_id === "c1" && /15/.test(toolMessage.content), `the tool's result goes back to it (${JSON.stringify(toolMessage)})`);
    const rolled = JSON.parse((await callTool("kraken_chat_log", {}, ctx)).content[0].text).find((item) => item.roll?.label === "Any provider's roll");
    assert(rolled?.roll?.total === 15, "the roll happened at the table");
    assert(anyEvents.some((event) => event.kind === "assistant" && /A 15/.test(event.text)), "its answer is shown");
    // Another provider: a fresh conversation in that API's shape; a refused key says whose.
    choice = { provider: "anthropic" };
    const switched = await any.ask("Hello");
    assert(switched.log.some((event) => event.kind === "error" && /Claude \(Anthropic\) API key/.test(event.text)), "Claude with no key: says to add Claude's key");
    choice = { provider: "deepseek", model: "deepseek-x" };
    const refused = await createAssistant({ ctx, settings: () => choice, key: () => "wrong", makeClient: () => null, fetchImpl: fakeFetch }).ask("Hi");
    assert(refused.log.some((event) => event.kind === "error" && /DeepSeek API key was refused/.test(event.text)), "a refused key says which provider refused it");
  }
  console.log("ok assistant, any provider: an OpenAI-style service (Grok here) gets the chosen model, the skill and the tools; its tool call runs at the table and the result goes back; the model list is the provider's; another provider starts afresh; a refused key is named");
  console.log(`${stepNote}`);
  console.log("ok assistant: tools run on the table (a re-roll in chat, the tracker read), results go back together, thinking kept, a failing tool and a refusal handled, no key explained, kraken_ui_eval withheld, kraken_assistant drives it");
} finally {
  await server.stop();
}
