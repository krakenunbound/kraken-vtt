import { useEffect, useMemo, useRef, useState } from "react";
import type { QuickSlot, Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { hasLink, LINK_ICON, linkFrom, slotDrag, useOpenLink } from "../ui/QuickSlots";
import { useWindows } from "../ui/Windows";

// Notes, as FG's Player Notes: everyone keeps their own; a note is its
// writer's (and the GM's) until its writer shares it with the table. A note
// has a title and text, and links: anything dragged into it (a book page, a
// map, a character, a sound, another note), opened again with a click and
// dragged on from there. A note is a link too (to a quick slot, another note).
type NoteData = { text?: string; links?: QuickSlot[] };
const noteOf = (record: TableRecord) => record.data as NoteData;

export function NotesWindow({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const windows = useWindows();
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const isMine = (record: TableRecord) => (gm ? record.owner === "" : record.owner === me);
  const notes = useMemo(
    () =>
      Object.values(session.records)
        .filter((record) => record.type === "note" && (!mine || isMine(record)))
        .filter((record) => !search || `${record.name} ${noteOf(record).text ?? ""}`.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [session.records, search, mine, me],
  );
  const create = async () => {
    const id = await session.op({ op: "create", input: { type: "note", name: "New note", visibility: gm ? "gm" : "owner", data: { text: "", links: [] } } });
    windows.open("note", "New note", id);
  };
  return (
    <div className="notes-window">
      <div className="notes-list" role="list">
        {notes.length === 0 ? <p className="hint">{search ? "No note says that." : "No notes yet. The + makes one."}</p> : null}
        {notes.map((record) => (
          <button key={record.id} type="button" role="listitem" className="notes-row" data-note={record.id} onClick={() => windows.open("note", record.name, record.id)} {...slotDrag({ kind: "note", record: record.id, label: record.name })}>
            <Icon name="chat" size={15} />
            <span>
              <b>{record.name || "Untitled"}</b>
              <small>
                {record.owner || "GM"}
                {record.visibility === "all" ? " · shared" : ""}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="notes-bar">
        <input type="search" placeholder="Search" aria-label="Search notes" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className={mine ? "dice-chip on" : "dice-chip"} aria-pressed={mine} onClick={() => setMine(!mine)} title={mine ? "Showing only your notes" : "Showing every note you can see"}>
          {mine ? "Mine" : "All"}
        </button>
        <button type="button" className="notes-new" aria-label="New note" title="New note" data-action="new-note" onClick={() => void create()}>
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}

export function NoteWindow({ session, id }: { session: Session; id: string }) {
  const gm = session.role === "dm";
  const windows = useWindows();
  const openLink = useOpenLink(session);
  const record = session.records[id];
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const editable = Boolean(record) && (gm || record.owner === me);
  const [name, setName] = useState(record?.name ?? "");
  const [text, setText] = useState(noteOf(record ?? ({ data: {} } as TableRecord)).text ?? "");
  const [dropping, setDropping] = useState(false);
  const typing = useRef(false);
  // Someone else's change shows, unless this screen is typing.
  useEffect(() => {
    if (!record || typing.current) return;
    setName(record.name);
    setText(noteOf(record).text ?? "");
  }, [record?.updatedAt]);
  if (!record) return <p className="hint">That note is gone.</p>;
  const links = noteOf(record).links ?? [];
  const save = (patch: { name?: string; data?: NoteData; visibility?: "owner" | "all" | "gm" }) => void session.op({ op: "update", id, patch }).catch(() => undefined);
  const shared = record.visibility === "all";
  return (
    <div className="note-window" data-note-window={id}>
      <div className="note-head">
        <span className="note-link" title="Drag this note to a quick slot or into another note" {...slotDrag({ kind: "note", record: id, label: record.name })}>
          <Icon name="chat" size={16} />
        </span>
        <input
          className="note-title"
          aria-label="Note title"
          value={name}
          readOnly={!editable}
          onChange={(event) => {
            typing.current = true;
            setName(event.target.value);
          }}
          onBlur={() => {
            typing.current = false;
            if (name !== record.name) save({ name });
          }}
        />
        {editable ? (
          <button type="button" className={shared ? "share-button on" : "share-button"} aria-pressed={shared} data-share-note title={shared ? "Shared with the table (click to make it yours alone)" : "Share with the table"} onClick={() => save({ visibility: shared ? (gm && record.owner === "" ? "gm" : "owner") : "all" })}>
            <Icon name="share" size={15} />
          </button>
        ) : null}
        {editable ? (
          <button
            type="button"
            className="ghost"
            aria-label="Delete the note"
            title="Delete the note"
            onClick={() => {
              if (!window.confirm(`Delete "${record.name}"?`)) return;
              void session.op({ op: "delete", id }).then(() => windows.close(`note:${id}`));
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        ) : null}
      </div>
      <p className="note-owner">
        <b>Owner:</b> {record.owner || "GM"}
        {shared ? " · shared with the table" : ""}
      </p>
      <textarea
        className="note-text"
        aria-label="Note text"
        placeholder={editable ? "Click to enter text" : ""}
        readOnly={!editable}
        value={text}
        onChange={(event) => {
          typing.current = true;
          setText(event.target.value);
        }}
        onBlur={() => {
          typing.current = false;
          if (text !== (noteOf(record).text ?? "")) save({ data: { text } });
        }}
      />
      <div
        className={dropping ? "note-links dropping" : "note-links"}
        data-note-links
        onDragOver={(event) => {
          if (!editable || !hasLink(event)) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          setDropping(false);
          const link = linkFrom(event);
          if (!editable || !link) return;
          event.preventDefault();
          if (link.kind === "note" && link.record === id) return;
          save({ data: { links: [...links, link].slice(0, 60) } });
        }}
      >
        {links.length === 0 ? <span className="hint">{editable ? "Drag anything here to link it: a book page, a map, a character, a sound, another note." : "No links."}</span> : null}
        {links.map((link, index) => (
          <span key={`${link.kind}-${index}`} className="note-chip" data-note-chip={link.kind} {...slotDrag(link)}>
            <button type="button" onClick={() => openLink(link)} title={`Open ${link.label}`}>
              <Icon name={LINK_ICON[link.kind] ?? "book"} size={13} /> {link.label}
            </button>
            {editable ? (
              <button type="button" className="note-chip-remove" aria-label={`Unlink ${link.label}`} onClick={() => save({ data: { links: links.filter((_, at) => at !== index) } })}>
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
