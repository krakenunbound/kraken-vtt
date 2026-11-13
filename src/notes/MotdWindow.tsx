import { useEffect, useRef, useState } from "react";
import type { QuickSlot, Session } from "../session/useSession";
import { Icon } from "../ui/icons";
import { hasLink, LINK_ICON, linkFrom, slotDrag, useOpenLink } from "../ui/QuickSlots";

// FG's Message of the Day: the GM's words to the players, shown to each as
// they join, with links (a map, an NPC, a book page, a note: anything dragged
// in) they open from it. A note or a story dropped on its icon becomes its
// words, as FG's (a story entry dropped on the icon replaces the text).
export function MotdWindow({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const motd = session.options.motd ?? { text: "", links: [] };
  const [text, setText] = useState(motd.text);
  const [dropping, setDropping] = useState(false);
  const typing = useRef(false);
  const openLink = useOpenLink(session);
  useEffect(() => {
    if (!typing.current) setText(motd.text);
  }, [motd.text]);
  const save = (patch: Partial<{ text: string; links: QuickSlot[] }>) => session.setTableOptions({ motd: { ...motd, ...patch } });
  const links = motd.links ?? [];
  const addLink = (link: QuickSlot) => save({ links: [...links, link].slice(0, 40) });
  // A note dropped on the icon: its words become the message.
  const replaceFrom = (link: QuickSlot) => {
    if (link.kind === "note") {
      const words = String((session.records[link.record]?.data as { text?: string } | undefined)?.text ?? "");
      if (words) {
        setText(words);
        save({ text: words });
        return;
      }
    }
    addLink(link);
  };
  return (
    <div className="motd-window" data-motd>
      <div
        className="motd-head"
        onDragOver={(event) => {
          if (gm && hasLink(event)) event.preventDefault();
        }}
        onDrop={(event) => {
          const link = linkFrom(event);
          if (!gm || !link) return;
          event.preventDefault();
          replaceFrom(link);
        }}
      >
        <span className="motd-icon" title={gm ? "Drop a note here to make its words the message" : "Message of the Day"}>
          <Icon name="flag" size={18} />
        </span>
        <b>Message of the Day</b>
      </div>
      {gm ? (
        <textarea
          className="motd-text"
          aria-label="Message of the Day"
          data-field="motd-text"
          placeholder="Click to enter text: what your players see when they join. Drag a map, an NPC, a book page or a note below to link it."
          value={text}
          onChange={(event) => {
            typing.current = true;
            setText(event.target.value);
          }}
          onBlur={() => {
            typing.current = false;
            if (text !== motd.text) save({ text });
          }}
        />
      ) : (
        <div className="motd-text read" data-motd-text>
          {motd.text || <span className="hint">No message today.</span>}
        </div>
      )}
      <div
        className={dropping ? "note-links dropping" : "note-links"}
        data-motd-links
        onDragOver={(event) => {
          if (!gm || !hasLink(event)) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event) => {
          setDropping(false);
          const link = linkFrom(event);
          if (!gm || !link) return;
          event.preventDefault();
          addLink(link);
        }}
      >
        {links.length === 0 ? <span className="hint">{gm ? "Drag anything here to link it: a map, an NPC, a book page, a note." : "No links."}</span> : null}
        {links.map((link, index) => (
          <span key={`${link.kind}-${index}`} className="note-chip" data-motd-chip={link.kind} {...slotDrag(link)}>
            <button type="button" onClick={() => openLink(link)} title={`Open ${link.label}`}>
              <Icon name={LINK_ICON[link.kind] ?? "book"} size={13} /> {link.label}
            </button>
            {gm ? (
              <button type="button" className="note-chip-remove" aria-label={`Unlink ${link.label}`} onClick={() => save({ links: links.filter((_, at) => at !== index) })}>
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
