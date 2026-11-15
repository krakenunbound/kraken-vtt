import { useEffect, useState } from "react";
import type { ChatLine, Session } from "../session/useSession";
import { chatToHtml, chatToMarkdown, lineWords } from "../../shared/text/chatExport.mjs";
import { Icon } from "../ui/icons";

// A document saved from this browser (the Session Log's Export, the chat's export).
export function saveText(text: string, file: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
// This seat's own chat (what it was shown), as Markdown or HTML.
export function exportChat(lines: ChatLine[], format: "md" | "html", title: string) {
  const shown = lines.filter((line) => !line.local);
  const day = new Date().toISOString().slice(0, 10);
  const name = `${title.replace(/[^\w -]+/g, "").trim() || "Chat"} ${day}`;
  if (format === "html") saveText(chatToHtml(shown, name), `${name.replace(/\s+/g, "-")}.html`, "text/html");
  else saveText(chatToMarkdown(shown, name), `${name.replace(/\s+/g, "-")}.md`, "text/markdown");
}

type SessionRow = { id: string; started: number; ended?: number; current: boolean; lines: number };

// The GM's Session Log (FG keeps the chat of each session): every sitting of
// the campaign, its chat read back, and each exported as Markdown or HTML.
export function SessionLogWindow({ session }: { session: Session }) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [chosen, setChosen] = useState("current");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [status, setStatus] = useState("");
  const ask = <T,>(body: Record<string, unknown>) => session.content<T>("chat-log", body);
  useEffect(() => {
    ask<SessionRow[]>({ action: "sessions" })
      .then((list) => setRows(list ?? []))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not read the log."));
    // The list once; a session's lines when it is chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    ask<{ lines: ChatLine[] }>({ action: "session", id: chosen })
      .then((found) => setLines(found?.lines ?? []))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not read that session."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, chosen === "current" ? session.chat.length : 0]);
  const exportAs = (format: "md" | "html") =>
    ask<{ text: string; file: string }>({ action: "export", id: chosen, format })
      .then((made) => (saveText(made.text, made.file, format === "html" ? "text/html" : "text/markdown"), setStatus(`Saved ${made.file}.`)))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : "Could not export it."));
  const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="session-log" data-session-log={chosen}>
      <div className="session-log-bar">
        <select aria-label="Session" value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {rows.map((row) => (
            <option key={row.id} value={row.current ? "current" : row.id}>
              {row.current ? "This session" : when(row.started)} ({row.lines} lines)
            </option>
          ))}
        </select>
        <button type="button" data-action="session-export-md" title="Export this session's chat as Markdown" aria-label="Export as Markdown" onClick={() => void exportAs("md")}>
          <Icon name="scroll" size={15} /> MD
        </button>
        <button type="button" data-action="session-export-html" title="Export this session's chat as a web page (HTML)" aria-label="Export as HTML" onClick={() => void exportAs("html")}>
          <Icon name="book" size={15} /> HTML
        </button>
      </div>
      {status ? (
        <p className="hint" role="status">
          {status}
        </p>
      ) : null}
      <ol className="session-log-lines">
        {lines.map((line, index) => {
          const { who, said } = lineWords(line);
          return (
            <li key={`${line.at}-${index}`} className={line.roll ? "roll" : line.kind ?? "say"}>
              <time>{new Date(line.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time> {who ? <b>{who}</b> : null} <span>{said}</span>
            </li>
          );
        })}
        {lines.length === 0 ? <li className="hint">Nothing said in this session yet.</li> : null}
      </ol>
    </div>
  );
}
