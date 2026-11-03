import { useState } from "react";
import type { RollResult, Session } from "./useSession";

function RollCard({ roll }: { roll: RollResult }) {
  return (
    <span className="roll-card" data-total={roll.total}>
      {roll.label ? <span className="roll-label">{roll.label}</span> : null}
      <span className="roll-formula">{roll.formula}</span>
      <span className="roll-dice">
        {roll.terms.map((term, index) =>
          term.kind === "number" ? (
            <span key={index} className="roll-mod">
              {term.sign < 0 ? "−" : "+"}
              {term.value}
            </span>
          ) : (
            term.rolls.map((value, die) => (
              <span key={`${index}-${die}`} className={term.kept[die] ? "die" : "die dropped"} title={`d${term.sides}`}>
                {value}
              </span>
            ))
          ),
        )}
      </span>
      <b className="roll-total">{roll.total}</b>
    </span>
  );
}

// "/r 1d20+3 Strength check" rolls; anything else is a message.
function submitLine(session: Session, draft: string) {
  const command = /^\/(?:r|roll)\s+(\S+)\s*(.*)$/i.exec(draft.trim());
  if (command) session.roll(command[1], command[2]);
  else session.sendChat(draft);
}

export function PartyPanel({ session }: { session: Session }) {
  const [draft, setDraft] = useState("");

  return (
    <section className="party" role="tabpanel">
      <aside className="roster">
        <h1>Party</h1>
        {session.role === "dm" && session.hostInfo ? (
          <div className="share-card">
            <p>Players connect to one of these.</p>
            <p>
              Same computer <span className="secret">127.0.0.1:{session.hostInfo.port}</span>
            </p>
            {session.hostInfo.lan
              ? session.hostInfo.addresses.map((address) => (
                  <p key={address}>
                    LAN <span className="secret">{address}:{session.hostInfo?.port}</span>
                  </p>
                ))
              : null}
            {session.hostInfo.cloud && session.hostInfo.externalV4 ? (
              <p>
                Cloud <span className="secret">{session.hostInfo.externalV4}:{session.hostInfo.port}</span>
              </p>
            ) : null}
            {session.hostInfo.lan && session.hostInfo.addresses.length === 0 ? (
              <p className="hint">No other network address found.</p>
            ) : null}
            {session.hostInfo.publicGame ? (
              <p>Public game. Players leave the password blank.</p>
            ) : (
              <p>
                Password <span className="secret">{session.hostInfo.password}</span>
              </p>
            )}
            <p className="hint">Walls, doors, and traps stay on your table. Players see the map, lights, and the tokens their characters can see.</p>
          </div>
        ) : (
          <p className="hint">Connected to {session.remoteLabel}.</p>
        )}
        <ul className="roster-list">
          {session.players.map((seat) => {
            const token = session.map.tokens.find((item) => item.owner === seat.name);
            return (
              <li key={seat.id} data-player={seat.id} data-role={seat.role}>
                <span className="seat-dot" style={{ background: token?.color ?? "#888" }} />
                <span>{seat.name}</span>
                <span className="seat-role">{seat.role === "dm" ? "DM" : "Player"}</span>
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="chat-pane">
        <div className="chat-log" aria-live="polite">
          {session.chat.length === 0 ? <p className="hint">No messages yet.</p> : null}
          {session.chat.map((line, index) => (
            <p key={`${line.at}-${index}`} className="chat-line">
              <b>{line.from}</b> {line.roll ? <RollCard roll={line.roll} /> : line.text}
            </p>
          ))}
        </div>
        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitLine(session, draft);
            setDraft("");
          }}
        >
          <input
            aria-label="Message"
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Message the table, or /r 1d20+2 to roll"
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </section>
  );
}
