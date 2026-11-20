// The DM assistant: a chat with an AI model for the GM alone, in the GM's own
// window (the sidebar's Assistant). It drives the table with the same tools
// the MCP bridge gives an outside agent (electron/agent/tools.cjs), through
// the same host functions and permission checks as the GM's clicks: look
// things up in the books and records, roll (or re-roll) in front of the table
// or secretly, run the combat tracker, build random encounters from an
// adventure's tables and NPCs, and so on. Its instructions are the skill
// document skills/kraken-dm-assistant/SKILL.md.
//
// Any provider the GM has a key for: Claude (Anthropic's API), and every
// service with an OpenAI-style API: OpenAI (GPT, Codex), Google Gemini, xAI's
// Grok, DeepSeek, OpenRouter (many models behind one key), or another such
// service at an address the GM gives (Ollama, LM Studio, a company's own).
// The model is the GM's choice from the provider's own list.
//
// The keys: one for each provider, in the environment or in .env.local beside
// the app (ANTHROPIC_API_KEY, OPENAI_API_KEY...), or typed into the Assistant
// window (kept on this computer, encrypted with the operating system's
// keychain by Electron's safeStorage). They are never sent to players,
// written to chat or logged.

const fs = require("node:fs");
const path = require("node:path");
const { listTools, callTool } = require("./agent/tools.cjs");

// Claude's model when none is chosen (the other providers': the first of their own list the GM picks).
const MODEL = "claude-opus-5-5";
// The providers, as the Assistant window offers them. kind: which API they speak.
const PROVIDERS = {
  anthropic: { name: "Claude (Anthropic)", kind: "anthropic", env: ["ANTHROPIC_API_KEY"], placeholder: "sk-ant-...", model: MODEL },
  openai: { name: "OpenAI (GPT, Codex)", kind: "openai", base: "https://api.openai.com/v1", env: ["OPENAI_API_KEY"], placeholder: "sk-..." },
  gemini: { name: "Google Gemini", kind: "openai", base: "https://generativelanguage.googleapis.com/v1beta/openai", env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], placeholder: "AIza..." },
  xai: { name: "xAI Grok", kind: "openai", base: "https://api.x.ai/v1", env: ["XAI_API_KEY"], placeholder: "xai-..." },
  deepseek: { name: "DeepSeek", kind: "openai", base: "https://api.deepseek.com/v1", env: ["DEEPSEEK_API_KEY"], placeholder: "sk-..." },
  openrouter: { name: "OpenRouter (many models)", kind: "openai", base: "https://openrouter.ai/api/v1", env: ["OPENROUTER_API_KEY"], placeholder: "sk-or-..." },
  custom: { name: "Other (OpenAI-compatible)", kind: "openai", base: "", env: [], placeholder: "its key (none for a local one)" },
};
const providerOf = (id) => PROVIDERS[id] ?? PROVIDERS.anthropic;

// Tools the assistant does not get: running code in the GM's window, and
// players' accounts (it reads what players write, so it never resets a password),
// and code mode (kraken_code could call either of the other two).
const WITHHELD = new Set(["kraken_ui_eval", "kraken_accounts", "kraken_code"]);
// Nor does it read or write the GM's files by a path: what players write (a
// note, a backstory, chat) could ask it to. It works on the table's own records,
// books and libraries; the GM imports and exports files themself.
// The arguments that are a place on the GM's disk, tool by tool (elsewhere a path is a record's inside a
// book, a file a picture's in a book: those are the table's own and allowed).
const DISK_ARGS = {
  kraken_campaigns: ["path"],
  kraken_character_import: ["path"],
  kraken_character_export: ["path"],
  kraken_dice_packs: ["path"],
  kraken_open_adventure: ["path"],
  kraken_packs: ["path", "file", "folder"],
  kraken_tile: ["file"],
  kraken_map_studio: ["file", "folder"],
};
function touchesDisk(name, input) {
  for (const key of DISK_ARGS[name] ?? []) if (typeof input?.[key] === "string" && input[key].trim()) return true;
  if (typeof input?.module === "string" && /[\\/:]/.test(input.module)) return true;
  return false;
}
// One request at most runs this many tool rounds before it stops and says so.
const MAX_ROUNDS = 40;
const SKILL_FILE = path.join(__dirname, "..", "skills", "kraken-dm-assistant", "SKILL.md");

function skillText() {
  try {
    // The skill's body, without its front matter.
    return fs.readFileSync(SKILL_FILE, "utf8").replace(/^---[\s\S]*?---\s*/, "");
  } catch {
    return "You are the GM's assistant in Maelstrom VTT. Use the kraken_* tools to look things up and act at the table.";
  }
}

// A provider's key from the environment, or from .env.local (KEY=value lines).
function envKey(dir, provider = "anthropic") {
  const names = providerOf(provider).env;
  for (const name of names) if (process.env[name]) return { key: process.env[name], from: "environment" };
  try {
    const text = fs.readFileSync(path.join(dir, ".env.local"), "utf8");
    for (const name of names) {
      const line = text.split(/\r?\n/).find((item) => new RegExp(`^\\s*${name}\\s*=`).test(item));
      const key = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
      if (key) return { key, from: ".env.local" };
    }
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
      if (!safeStorage?.isEncryptionAvailable()) throw new Error("This computer cannot keep the key encrypted; put it in .env.local instead.");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, safeStorage.encryptString(String(key).trim()));
    },
  };
}
// Each provider's key file (Claude's keeps the name it always had).
const keyFileOf = (folder, provider) => path.join(folder, provider === "anthropic" ? "assistant-key.bin" : `assistant-key-${provider}.bin`);

// MCP tool results (text and images) as Anthropic's tool_result content.
function resultContent(result) {
  return (result.content ?? []).map((item) =>
    item.type === "image" ? { type: "image", source: { type: "base64", media_type: item.mimeType ?? "image/png", data: item.data } } : { type: "text", text: String(item.text ?? "") },
  );
}
// The same as plain text, for an OpenAI-style tool message (pictures are named, not sent).
function resultText(result) {
  return (result.content ?? []).map((item) => (item.type === "image" ? "[a picture]" : String(item.text ?? ""))).join("\n") || (result.isError ? "Failed." : "Done.");
}

function summary(result) {
  const text = (result.content ?? []).find((item) => item.type === "text")?.text ?? "";
  return text.length > 240 ? `${text.slice(0, 240)}...` : text;
}

// An OpenAI-style API: one request (fetchImpl: tests pass a stand-in).
async function openaiRequest(fetchImpl, base, key, route, body) {
  const response = await fetchImpl(`${String(base).replace(/\/+$/, "")}${route}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(String(data?.error?.message ?? data?.message ?? text ?? `HTTP ${response.status}`).slice(0, 400));
    error.status = response.status;
    throw error;
  }
  return data;
}

/**
 * ctx: the agent context (table, ui, window...). onEvent(event): what the
 * Assistant window shows as it happens. settings(): { provider, model, base }
 * (Claude when not given). key(provider): that provider's key, or null.
 * makeClient(key): an Anthropic client; fetchImpl: fetch for the OpenAI-style
 * providers (tests pass stand-ins for both).
 */
function createAssistant({ ctx, onEvent = () => {}, makeClient, key, settings = () => ({ provider: "anthropic" }), fetchImpl = globalThis.fetch }) {
  let messages = [];
  // Which provider the history is in (a conversation is in one API's shape: another provider starts afresh).
  let historyOf = "";
  let log = [];
  let busy = false;
  let stopped = false;
  const emit = (event) => {
    log.push(event);
    if (log.length > 400) log = log.slice(-400);
    onEvent(event);
  };
  const toolList = () => listTools().filter((tool) => !WITHHELD.has(tool.name));
  const tools = () => toolList().map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));
  const current = () => {
    const chosen = settings() ?? {};
    const id = PROVIDERS[chosen.provider] ? chosen.provider : "anthropic";
    const provider = providerOf(id);
    return { id, provider, model: String(chosen.model || provider.model || ""), base: id === "custom" ? String(chosen.base || "") : provider.base };
  };
  const keyFor = (id) => {
    const found = key(id);
    if (!found && id !== "custom") throw new Error(`The assistant has no ${providerOf(id).name} API key yet. Add one in the Assistant window, or put ${providerOf(id).env[0]} in .env.local.`);
    return found ?? "";
  };

  // A tool the model asked for, with the assistant's own limits, as an MCP result.
  async function runTool(name, input) {
    emit({ kind: "tool", name, input });
    let result;
    if (WITHHELD.has(name)) result = { isError: true, content: [{ type: "text", text: `${name} is not available to the assistant.` }] };
    // Nor does it delete a campaign or restore one over what is there (players' words reach it): the GM's own.
    else if (name === "kraken_campaigns" && ["delete", "restore"].includes(input?.action)) result = { isError: true, content: [{ type: "text", text: "Deleting or restoring a campaign is the GM's own: use the campaign's menu on the start screen." }] };
    else if (touchesDisk(name, input)) result = { isError: true, content: [{ type: "text", text: "The assistant does not read or write files on this computer by a path: ask the GM to import or export it." }] };
    else
      try {
        result = await callTool(name, input && typeof input === "object" ? input : {}, ctx);
      } catch (error) {
        result = { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
      }
    emit({ kind: "tool-result", name, ok: !result.isError, text: summary(result) });
    return result;
  }

  // Claude, on Anthropic's own API.
  async function anthropicRounds(model) {
    const api = makeClient(keyFor("anthropic"));
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (stopped) return emit({ kind: "note", text: "Stopped." });
      emit({ kind: "thinking" });
      const response = await api.beta.messages.create({
        model,
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
      const uses = response.content.filter((block) => block.type === "tool_use");
      // A reply cut off (or declined) with tools asked for: each gets a "not run" result, so the next request is valid.
      const unanswered = () => uses.length && messages.push({ role: "user", content: uses.map((use) => ({ type: "tool_result", tool_use_id: use.id, content: "Not run: the reply was cut off.", is_error: true })) });
      if (response.stop_reason === "refusal") {
        unanswered();
        return emit({ kind: "note", text: "The model declined that request." });
      }
      if (response.stop_reason === "max_tokens") {
        unanswered();
        return emit({ kind: "note", text: "The answer was cut off (too long)." });
      }
      if (response.stop_reason !== "tool_use" || uses.length === 0) return;
      // Every tool the reply asked for, in order (they act on one table), all results in one message.
      const results = [];
      for (const use of uses) {
        const result = await runTool(use.name, use.input);
        results.push({ type: "tool_result", tool_use_id: use.id, content: resultContent(result), ...(result.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
      if (round === MAX_ROUNDS - 1) emit({ kind: "note", text: `Stopped after ${MAX_ROUNDS} rounds of tools; ask it to carry on.` });
    }
  }

  // Any OpenAI-style API (OpenAI, Gemini, Grok, DeepSeek, OpenRouter, a local server).
  async function openaiRounds({ id, model, base }) {
    if (!base) throw new Error("Give the address of the OpenAI-compatible service (for Ollama, http://localhost:11434/v1).");
    if (!model) throw new Error("Choose a model for the assistant first.");
    const apiKey = keyFor(id);
    const functions = toolList().map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description.slice(0, 1024), parameters: tool.inputSchema } }));
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (stopped) return emit({ kind: "note", text: "Stopped." });
      emit({ kind: "thinking" });
      const data = await openaiRequest(fetchImpl, base, apiKey, "/chat/completions", { model, messages: [{ role: "system", content: skillText() }, ...messages], tools: functions, tool_choice: "auto" });
      const choice = data?.choices?.[0];
      const reply = choice?.message ?? { role: "assistant", content: "" };
      messages.push({ role: "assistant", content: reply.content ?? "", ...(reply.tool_calls?.length ? { tool_calls: reply.tool_calls } : {}) });
      if (typeof reply.content === "string" && reply.content.trim()) emit({ kind: "assistant", text: reply.content, at: Date.now() });
      const calls = reply.tool_calls ?? [];
      // Cut off or declined with tools asked for: each gets a "not run" answer, so the next request is valid.
      const unanswered = () => calls.forEach((call) => messages.push({ role: "tool", tool_call_id: call.id, content: "Not run: the reply was cut off." }));
      if (choice?.finish_reason === "length") {
        unanswered();
        return emit({ kind: "note", text: "The answer was cut off (too long)." });
      }
      if (choice?.finish_reason === "content_filter") {
        unanswered();
        return emit({ kind: "note", text: "The model declined that request." });
      }
      if (!calls.length) return;
      for (const call of calls) {
        let input = {};
        try {
          input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          input = {};
        }
        const result = await runTool(call.function?.name ?? "", input);
        messages.push({ role: "tool", tool_call_id: call.id, content: resultText(result) });
      }
      if (round === MAX_ROUNDS - 1) emit({ kind: "note", text: `Stopped after ${MAX_ROUNDS} rounds of tools; ask it to carry on.` });
    }
  }

  // The GM's own message, answered with as many tool rounds as it needs.
  async function ask(text) {
    const said = String(text ?? "").trim();
    if (!said) throw new Error("Say something to the assistant.");
    if (busy) throw new Error("The assistant is still working on the last request.");
    busy = true;
    stopped = false;
    emit({ kind: "user", text: said, at: Date.now() });
    const now = current();
    if (historyOf && historyOf !== now.provider.kind) {
      messages = [];
      emit({ kind: "note", text: `A new conversation with ${now.provider.name}.` });
    }
    historyOf = now.provider.kind;
    messages.push({ role: "user", content: said });
    try {
      if (now.provider.kind === "anthropic") await anthropicRounds(now.model || MODEL);
      else await openaiRounds(now);
    } catch (error) {
      // The history stays as it is: every tool call already has its result,
      // so the next request carries on from here.
      const message = error instanceof Error ? error.message : String(error);
      emit({ kind: "error", text: error?.status === 401 || error?.status === 403 ? `The ${now.provider.name} API key was refused: ${message}` : message });
    } finally {
      busy = false;
      emit({ kind: "done" });
    }
    return view();
  }

  // The models the chosen provider offers this key (its own list).
  async function models(choice = current()) {
    const id = choice.id ?? "anthropic";
    const provider = providerOf(id);
    const apiKey = keyFor(id);
    if (provider.kind === "anthropic") {
      const response = await fetchImpl("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error?.message ?? `HTTP ${response.status}`));
      return (data?.data ?? []).map((item) => item.id).filter(Boolean);
    }
    const base = id === "custom" ? choice.base : provider.base;
    if (!base) throw new Error("Give the service's address first.");
    const data = await openaiRequest(fetchImpl, base, apiKey, "/models", null);
    return (data?.data ?? data?.models ?? []).map((item) => String(item.id ?? item.name ?? "").replace(/^models\//, "")).filter(Boolean).sort();
  }

  function view() {
    const now = current();
    return { busy, provider: now.id, model: now.model, base: now.base, log: log.filter((event) => event.kind !== "thinking" && event.kind !== "done") };
  }

  return {
    ask,
    view,
    models,
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

module.exports = { createAssistant, keyStore, keyFileOf, envKey, MODEL, PROVIDERS, WITHHELD, touchesDisk };
