import { useState } from "react";
import type { ChatLine, QuickSlot, Session } from "../session/useSession";
import { LINK_ICON, slotDrag, useOpenLink } from "./QuickSlots";
import { Icon } from "./icons";
import { useWindows } from "./Windows";
import { FormattedText } from "../books/Records";

// The parts of a chat line beyond its words: a link (FG's links in chat), a
// shared record's text (FG's Share), the speaker's portrait (FG's chat
// portrait), and a prompt the GM sent the players (ask the players to roll).

// May this seat open the link? A record only if the host sent it here (shared
// with this player), a book page if the book is shared, a picture once shown.
export function mayOpen(link: QuickSlot, session: Session) {
  if (session.role === "dm") return true;
  if (link.kind === "record" || link.kind === "sheet" || link.kind === "note") return Boolean(session.records[link.record]);
  if (link.kind === "book") return session.bookShelf.shared.includes(link.book);
  if (link.kind === "picture") return session.bookShelf.images.some((image) => image.book === link.book && image.file === link.file);
  return true;
}

// A link as a chip: a click opens it (if this seat may see it), a drag carries it on.
export function ChatLinkChip({ link, session }: { link: QuickSlot; session: Session }) {
  const open = useOpenLink(session);
  const allowed = mayOpen(link, session);
  return (
    <button
      type="button"
      className={allowed ? "chat-link" : "chat-link closed"}
      data-chat-link={link.kind}
      aria-disabled={!allowed}
      title={allowed ? `Open ${link.label}; drag it to a quick slot, a note or a story` : `${link.label}: not shared with you`}
      onClick={() => allowed && open(link)}
      {...(allowed ? slotDrag(link) : { draggable: false })}
    >
      <Icon name={LINK_ICON[link.kind] ?? "book"} size={13} />
      {link.label}
    </button>
  );
}

// The GM's Share: the record's name and words, under the line.
export function SharedRecord({ share, session }: { share: NonNullable<ChatLine["share"]>; session: Session }) {
  const open = useOpenLink(session);
  return (
    <div className="chat-share" data-chat-share={share.type}>
      <b>{share.name}</b>
      {share.text ? <FormattedText text={share.text} onOpen={open} /> : null}
    </div>
  );
}

// The speaker's portrait: a click opens its sheet (or record), a drag carries the link.
export function SpeakerPortrait({ line, session }: { line: ChatLine; session: Session }) {
  const windows = useWindows();
  const [failed, setFailed] = useState(false);
  const id = line.recordId;
  if (!id || failed) return null;
  const record = session.records[id];
  const character = record?.type === "character";
  const link: QuickSlot = character ? { kind: "sheet", record: id, label: record?.name ?? line.from } : { kind: "record", record: id, label: record?.name ?? line.from };
  const visible = Boolean(record);
  return (
    <img
      className="chat-portrait"
      src={session.recordArtUrl(id, "portrait")}
      alt=""
      title={visible ? `${link.label}: click to open, drag to a quick slot` : link.label}
      data-chat-portrait={id}
      onError={() => setFailed(true)}
      onClick={() => visible && windows.open(character ? "sheet" : "record", link.label, id)}
      {...(visible ? slotDrag(link) : { draggable: false })}
    />
  );
}

// Ask the players: each owner rolls for their own character from the card (their sheet's
// roll, their modifier box); the GM may roll for anyone. The line updates as they roll.
export function PromptCard({ line, session }: { line: ChatLine; session: Session }) {
  const prompt = line.prompt;
  if (!prompt) return null;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const gm = session.role === "dm";
  const passed = prompt.rows.filter((row) => row.success).length;
  const rolled = prompt.rows.filter((row) => row.total !== undefined).length;
  return (
    <div className="chat-prompt" data-prompt={prompt.id}>
      <b>{prompt.label}</b>
      <ul>
        {prompt.rows.map((row) => {
          const mine = row.owner && row.owner === me;
          const done = row.total !== undefined;
          return (
            <li key={row.id} data-prompt-row={row.name} data-rolled={done ? String(row.total) : undefined}>
              <span>{row.name}</span>
              {done ? (
                <b className={row.success === true ? "hit" : row.success === false ? "miss" : ""}>{row.total}</b>
              ) : mine || gm ? (
                <button type="button" className="play-button" data-prompt-roll={row.id} title={mine ? "Roll it from your sheet (your modifier box counts)" : `Roll for ${row.name} (offline, or the GM's call)`} onClick={() => session.tableCommand({ type: "party-prompt-roll", prompt: prompt.id, member: row.id })}>
                  <Icon name="d20" size={13} /> Roll
                </button>
              ) : (
                <i className="hint">waiting</i>
              )}
            </li>
          );
        })}
      </ul>
      <small className="chat-prompt-summary">
        {rolled} of {prompt.rows.length} rolled{prompt.dc ? `, ${passed} succeed` : ""}
      </small>
    </div>
  );
}
