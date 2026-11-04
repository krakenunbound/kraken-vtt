// The DM assistant: a chat with Claude for the GM alone, in the GM's own
// window (the sidebar's Assistant). It drives the table with the same tools
// the MCP bridge gives an outside agent (electron/agent/tools.cjs), through
// the same host functions and permission checks as the GM's clicks: look
// things up in the books and records, roll (or re-roll) in front of the table
// or secretly, run the combat tracker, build random encounters from an
// adventure's tables and NPCs, and so on. Its instructions are the skill
// document skills/kraken-dm-assistant/SKILL.md.
//
// The key: ANTHROPIC_API_KEY in the environment or in .env.local beside the
// app, or one the GM types into the Assistant window (kept on this computer,
// encrypted with the operating system's keychain by Electron's safeStorage).
// It is never sent to players, written to chat or logged.

const fs = require("node:fs");
const path = require("node:path");
const { listTools, callTool } = require("./agent/tools.cjs");

const MODEL = "claude-opus-5-5";
// Tools the assistant does not get: running code in the GM's window.
const WITHHELD = new Set(["kraken_ui_eval"]);
// One request at most runs this many tool rounds before it stops and says so.
const MAX_ROUNDS = 40;
const SKILL_FILE = path.join(__dirname, "..", "skills", "kraken-dm-assistant", "SKILL.md");

function skillText() {
  try {
    // The skill's body, without its front matter.
    return fs.readFileSync(SKILL_FILE, "utf8").replace(/^---[\s\S]*?---\s*/, "");
  } catch {
    return "You are the GM's assistant in Kraken VTT. Use the kraken_* tools to look things up and act at the table.";
  }
}

// ANTHROPIC_API_KEY from the environment, or from .env.local (KEY=value lines).
function envKey(dir) {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, from: "environment" };
  try {
    const text = fs.readFileSync(path.join(dir, ".env.local"), "utf8");
    const line = text.split(/\r?\n/).find((item) => /^\s*ANTHROPIC_API_KEY\s*=/.test(item));
    const key = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
    if (key) return { key, from: ".env.local" };
  } catch {
    /* no file */
  }
  return null;
}

// A key the GM typed in, kept encrypted in the app's data folder.
function keyStore(file, safeStorage) {
  return {
    get() {
      try {
        if (!fs.existsSync(file)) return null;
        const bytes = fs.readFileSync(file);
        return safeStorage?.isEncryptionAvailable() ? safeStorage.decryptString(bytes) : null;
      } catch {
        return null;
      }
    },
    set(key) {
      if (!key) {
        fs.rmSync(file, { force: true });
        return;
      }
      if (!safeStorage?.isEncryptionAvailable()) throw new Error("This computer cannot keep the key encrypted; set ANTHROPIC_API_KEY in .env.local instead.");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, safeStorage.encryptString(String(key).trim()));
    },
  };
}

// MCP tool results (text and images) as the API's tool_result content.
function resultContent(result) {
  return (result.content ?? []).map((item) =>
    item.type === "image" ? { type: "image", source: { type: "base64", media_type: item.mimeType ?? "image/png", data: item.data } } : { type: "text", text: String(item.text ?? "") },
  );
}

function summary(result) {
  const text = (result.content ?? []).find((item) => item.type === "text")?.text ?? "";
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

/**
 * ctx: the agent context (table, ui, window...). onEvent(event): what the
 * Assistant window shows as it happens. makeClient(key): an Anthropic client
 * (tests pass a stand-in). key(): the key to use, or null.
 */
function createAssistant({ ctx, onEvent = () => {}, makeClient, key }) {
  /** @type {import("@anthropic-ai/sdk").default.Beta.BetaMessageParam[]} */
  let messages = [];
  let log = [];
  let busy = false;
  let stopped = false;
  const emit = (event) => {
    log.push(event);
    if (log.length > 400) log = log.slice(-400);
    onEvent(event);
  };
  const tools = () =>
    listTools()
      .filter((tool) => !WITHHELD.has(tool.name))
      .map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));
  const client = () => {
    const found = key();
    if (!found) throw new Error("The assistant has no Claude API key yet. Add one in the Assistant window, or put ANTHROPIC_API_KEY in .env.local.");
    return makeClient(found);
  };

  // The GM's own message, answered with as many tool rounds as it needs.
  async function ask(text) {
    const said = String(text ?? "").trim();
    if (!said) throw new Error("Say something to the assistant.");
    if (busy) throw new Error("The assistant is still working on the last request.");
    busy = true;
    stopped = false;
    emit({ kind: "user", text: said, at: Date.now() });
    messages.push({ role: "user", content: said });
    try {
      const api = client();
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (stopped) {
          emit({ kind: "note", text: "Stopped." });
          break;
        }
        emit({ kind: "thinking" });
        const response = await api.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          cache_control: { type: "ephemeral" },
          system: skillText(),
          tools: tools(),
          messages,
        });
        // The whole reply goes back next time, unchanged (thinking blocks too).
        messages.push({ role: "assistant", content: response.content });
        for (const block of response.content) if (block.type === "text" && block.text.trim()) emit({ kind: "assistant", text: block.text, at: Date.now() });
        if (response.stop_reason === "refusal") {
          emit({ kind: "note", text: "Claude declined that request." });
          break;
        }
        if (response.stop_reason === "max_tokens") {
          emit({ kind: "note", text: "The answer was cut off (too long)." });
          break;
        }
        const uses = response.content.filter((block) => block.type === "tool_use");
        if (response.stop_reason !== "tool_use" || uses.length === 0) break;
        // Every tool the reply asked for, in order (they act on one table), all results in one message.
        const results = [];
        for (const use of uses) {
          emit({ kind: "tool", name: use.name, input: use.input });
          let result;
          if (WITHHELD.has(use.name)) result = { isError: true, content: [{ type: "text", text: `${use.name} is not available to the assistant.` }] };
          else
            try {
              result = await callTool(use.name, use.input && typeof use.input === "object" ? use.input : {}, ctx);
            } catch (error) {
              result = { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
            }
          emit({ kind: "tool-result", name: use.name, ok: !result.isError, text: summary(result) });
          results.push({ type: "tool_result", tool_use_id: use.id, content: resultContent(result), ...(result.isError ? { is_error: true } : {}) });
        }
        messages.push({ role: "user", content: results });
        if (round === MAX_ROUNDS - 1) emit({ kind: "note", text: `Stopped after ${MAX_ROUNDS} rounds of tools; ask it to carry on.` });
      }
    } catch (error) {
      // The history stays as it is: every tool call already has its result,
      // so the next request carries on from here.
      const message = error instanceof Error ? error.message : String(error);
      emit({ kind: "error", text: error?.status === 401 ? `The Claude API key was refused: ${message}` : message });
    } finally {
      busy = false;
      emit({ kind: "done" });
    }
    return view();
  }

  function view() {
    return { busy, model: MODEL, log: log.filter((event) => event.kind !== "thinking" && event.kind !== "done") };
  }

  return {
    ask,
    view,
    // Stops after the round under way.
    stop() {
      stopped = true;
      return view();
    },
    // A fresh conversation.
    reset() {
      if (busy) throw new Error("The assistant is still working.");
      messages = [];
      log = [];
      onEvent({ kind: "reset" });
      return view();
    },
    tools,
  };
}

module.exports = { createAssistant, keyStore, envKey, MODEL, WITHHELD };
