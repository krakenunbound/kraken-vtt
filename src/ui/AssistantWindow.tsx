import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

// The DM assistant (the GM's alone): a chat with the AI model of the GM's
// choice (Claude, OpenAI, Gemini, Grok, DeepSeek, OpenRouter or another
// OpenAI-compatible service, on the GM's own key), which acts at the table
// with Maelstrom's own tools (electron/assistant.cjs). Each tool it uses is
// shown as it runs, so the GM sees what it did.

type AssistantEvent =
  | { kind: "user" | "assistant"; text: string; at?: number }
  | { kind: "tool"; name: string; input?: unknown }
  | { kind: "tool-result"; name: string; ok: boolean; text: string }
  | { kind: "note" | "error"; text: string }
  | { kind: "thinking" | "done" | "reset" };
type Provider = { id: string; name: string; placeholder: string; env: string; hasKey: boolean; keyFrom: string | null };
type Status = { busy: boolean; provider: string; model: string; base: string; log: AssistantEvent[]; hasKey: boolean; keyFrom: string | null; providers: Provider[] };

const IDEAS = [
  "Roll a random encounter for the party's level and put it on the tracker",
  "Re-roll that last roll: the die fell off the table",
  "What does Hold Person do, and what save does it allow?",
  "Who is hurt? Sum up the party's hit points",
];

function toolLine(event: { name: string; input?: unknown }) {
  const input = event.input && typeof event.input === "object" ? (event.input as Record<string, unknown>) : {};
  const bits = Object.entries(input)
    .filter(([, value]) => value !== undefined && value !== null && typeof value !== "object")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 40)}`);
  return `${event.name.replace(/^kraken_/, "")}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

export function AssistantWindow() {
  const api = window.kraken?.assistant;
  const [status, setStatus] = useState<Status | null>(null);
  const [log, setLog] = useState<AssistantEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [key, setKey] = useState("");
  const [problem, setProblem] = useState("");
  // The chosen provider's models (its own list), and a service's address being typed.
  const [models, setModels] = useState<string[] | null>(null);
  const [base, setBase] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api) return;
    void api.status().then((value) => {
      setStatus(value);
      setLog(value.log);
      setBusy(value.busy);
    });
    const off: unknown = api.onEvent((event: AssistantEvent) => {
      if (event.kind === "reset") setLog([]);
      else if (event.kind === "thinking") setBusy(true);
      else if (event.kind === "done") setBusy(false);
      else setLog((items) => [...items, event].slice(-400));
    });
    // What comes back over the preload bridge may not be callable here.
    return () => {
      if (typeof off === "function") off();
    };
  }, [api]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log, busy]);
  // The provider's own list of models, once it has a key.
  useEffect(() => {
    if (!api || !status?.hasKey) return setModels(null);
    let live = true;
    setModels(null);
    void api
      .models()
      .then((list: string[]) => live && setModels(list))
      .catch((error: unknown) => {
        if (!live) return;
        setModels([]);
        setProblem(`The model list could not be read: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      live = false;
    };
  }, [api, status?.provider, status?.hasKey, status?.base]);
  useEffect(() => setBase(status?.base ?? ""), [status?.base]);

  if (!api) return <p className="assistant-empty">The assistant runs in the GM's Maelstrom app.</p>;

  const send = async (said = text) => {
    if (!said.trim() || busy) return;
    setText("");
    setProblem("");
    setBusy(true);
    try {
      await api.ask(said);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const choose = async (patch: { provider?: string; model?: string; base?: string }) => {
    try {
      setProblem("");
      setStatus(await api.settings(patch));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };
  const provider = status?.providers.find((item) => item.id === status.provider) ?? null;
  const saveKey = async () => {
    try {
      setStatus(await api.setKey(key, status?.provider));
      setKey("");
      setProblem("");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="assistant" data-assistant={busy ? "busy" : "idle"}>
      {status ? (
        <div className="assistant-setup">
          <label>
            Provider{" "}
            <select data-assistant="provider" value={status.provider} disabled={busy} onChange={(event) => void choose({ provider: event.target.value })}>
              {status.providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.hasKey ? "" : " (no key)"}
                </option>
              ))}
            </select>
          </label>
          {status.provider === "custom" ? (
            <label title="Where the local AI answers: Ollama on this computer is 127.0.0.1:11434; on another computer, its IP and port (192.168.1.20:11434). LM Studio is port 1234. A full URL works too.">
              Address{" "}
              <input
                data-assistant="base"
                value={base}
                placeholder="127.0.0.1:11434"
                onChange={(event) => setBase(event.target.value)}
                onBlur={() => base !== status.base && void choose({ base })}
                onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && base !== status.base && void choose({ base })}
                spellCheck={false}
              />
            </label>
          ) : null}
          {status.hasKey ? (
            <label>
              Model{" "}
              {models && models.length ? (
                <select data-assistant="model" value={status.model} disabled={busy} onChange={(event) => void choose({ model: event.target.value })}>
                  {status.model && !models.includes(status.model) ? <option value={status.model}>{status.model}</option> : null}
                  {status.model ? null : <option value="">Choose a model…</option>}
                  {models.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              ) : (
                <input data-assistant="model" defaultValue={status.model} key={`${status.provider}-${status.model}`} placeholder={models ? "the model's name" : "reading its models…"} onBlur={(event) => event.target.value !== status.model && void choose({ model: event.target.value.trim() })} spellCheck={false} />
              )}
            </label>
          ) : null}
        </div>
      ) : null}
      {status && !status.hasKey && provider ? (
        <div className="assistant-key">
          <p>
            The assistant works with any AI provider you have a key for. Paste your {provider.name} API key: it stays on this computer, encrypted, and is never shown to players.
            {provider.env ? ` (Or put ${provider.env} in .env.local.)` : ""}
          </p>
          <div className="assistant-key-row">
            <input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={provider.placeholder} aria-label={`${provider.name} API key`} autoComplete="off" spellCheck={false} />
            <button type="button" onClick={() => void saveKey()} disabled={!key.trim()}>
              Save key
            </button>
          </div>
        </div>
      ) : null}

      <div className="assistant-log" aria-live="polite">
        {log.length === 0 ? (
          <div className="assistant-ideas">
            <p>Ask for anything at the table: look up a rule, roll or re-roll, run a combat round, make a random encounter, set up a map.</p>
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="ghost" onClick={() => setText(idea)}>
                {idea}
              </button>
            ))}
          </div>
        ) : null}
        {log.map((event, index) =>
          event.kind === "user" ? (
            <div key={index} className="assistant-line you">
              {event.text}
            </div>
          ) : event.kind === "assistant" ? (
            <div key={index} className="assistant-line it">
              {event.text}
            </div>
          ) : event.kind === "tool" ? (
            <div key={index} className="assistant-tool" data-tool={event.name}>
              <Icon name="sparkle" size={12} /> {toolLine(event)}
            </div>
          ) : event.kind === "tool-result" ? (
            event.ok ? null : (
              <div key={index} className="assistant-tool failed">
                {event.name.replace(/^kraken_/, "")}: {event.text}
              </div>
            )
          ) : event.kind === "note" || event.kind === "error" ? (
            <div key={index} className={`assistant-note ${event.kind}`}>
              {event.text}
            </div>
          ) : null,
        )}
        {busy ? <div className="assistant-note">Working...</div> : null}
        <div ref={end} />
      </div>

      {problem ? <p className="assistant-note error">{problem}</p> : null}
      <form
        className="assistant-say"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Ask the assistant..."
          aria-label="Ask the assistant"
          rows={2}
        />
        <div className="assistant-buttons">
          {busy ? (
            <button type="button" className="ghost" onClick={() => void api.stop()}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!text.trim()}>
              Send
            </button>
          )}
          <button type="button" className="ghost" title="Start a fresh conversation" disabled={busy} onClick={() => void api.reset().then(() => setLog([]))}>
            New chat
          </button>
          {status?.hasKey && status.keyFrom === "app" ? (
            <button type="button" className="ghost" title={`Forget the saved ${provider?.name ?? ""} key`} disabled={busy} onClick={() => void api.setKey("", status.provider).then(setStatus)}>
              Forget key
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
