import { useEffect, useRef, useState } from "react";
import type { ChatLine, RollResult, Session } from "../session/useSession";
import { DieShape, Icon } from "./icons";

const TRAY = [4, 6, 8, 10, 12, 20, 100];

// A roll as FG shows it in chat: what it was for, each die (dropped dice
// faded), the modifier, and the total.
export function RollCard({ roll }: { roll: RollResult }) {
  return (
    <span className="roll-card" data-total={roll.total}>
      {roll.label ? <span className="roll-label">{roll.label}</span> : null}
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
                <DieShape sides={term.sides === 100 ? 10 : term.sides} size={28} label={value} />
              </span>
            ))
          ),
        )}
      </span>
      <span className="roll-formula">{roll.formula}</span>
      {roll.result ? <span className={`roll-result ${roll.result === "HIT" || roll.result === "SAVED" ? "hit" : roll.result === "MISS" || roll.result === "FAILED" ? "miss" : "none"}`}>{roll.result}</span> : null}
      <b className="roll-total">{roll.total}</b>
    </span>
  );
}

function Line({ line }: { line: ChatLine }) {
  const system = line.from === "Combat";
  const kind = system ? "chat-line system" : line.secret ? "chat-line secret" : "chat-line";
  return (
    <div className={kind} data-from={line.from}>
      {!system ? <b className="chat-from">{line.from}</b> : null}
      {line.secret ? <span className="chat-tag">GM only</span> : null}
      {line.roll ? <RollCard roll={line.roll} /> : <span className="chat-text">{line.text}</span>}
    </div>
  );
}

// "/r 1d20+3 Strength check" (or /roll) rolls; anything else is said.
function submit(session: Session, draft: string, modifier: number, tower: boolean) {
  const command = /^\/(?:r|roll)\s+(\S+)\s*(.*)$/i.exec(draft.trim());
  if (command) session.roll(withModifier(command[1], modifier), command[2], "", tower);
  else session.sendChat(draft);
}

function withModifier(formula: string, modifier: number) {
  if (!modifier) return formula;
  return `${formula}${modifier > 0 ? "+" : ""}${modifier}`;
}

// The chat window (FG's, bottom left): the log, a line to type in, the dice
// tray (click dice to gather a pool, then roll), the modifier box, and the
// dice tower (a roll only the GM sees).
export function ChatDock({ session }: { session: Session }) {
  const [draft, setDraft] = useState("");
  const [pool, setPool] = useState<number[]>([]);
  const [modifier, setModifier] = useState(0);
  const [tower, setTower] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [session.chat.length]);

  const poolFormula = () => {
    const counts = new Map<number, number>();
    for (const sides of pool) counts.set(sides, (counts.get(sides) ?? 0) + 1);
    return [...counts].map(([sides, count]) => `${count}d${sides}`).join("+");
  };
  const rollPool = () => {
    if (pool.length === 0) return;
    session.roll(withModifier(poolFormula(), modifier), "", "", tower);
    setPool([]);
    setModifier(0);
  };

  return (
    <section className="chat-dock" aria-label="Chat">
      <div className="chat-log" aria-live="polite" ref={log}>
        {session.chat.length === 0 ? <p className="hint">The table is quiet.</p> : null}
        {session.chat.map((line, index) => (
          <Line key={`${line.at}-${index}`} line={line} />
        ))}
      </div>
      <form
        className="chat-entry"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          submit(session, draft, modifier, tower);
          setDraft("");
          setModifier(0);
        }}
      >
        <input aria-label="Message" value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder="Say something, or /r 1d20+2 Strength" />
        <button type="submit" aria-label="Send">
          <Icon name="chat" />
        </button>
      </form>
      <div className="dice-tray" aria-label="Dice tray">
        {TRAY.map((sides) => (
          <button
            key={sides}
            type="button"
            className="tray-die"
            title={`Add a d${sides} (right-click rolls one now)`}
            aria-label={`d${sides}`}
            onClick={() => setPool([...pool, sides])}
            onContextMenu={(event) => {
              event.preventDefault();
              session.roll(withModifier(`1d${sides}`, modifier), "", "", tower);
              setModifier(0);
            }}
          >
            <DieShape sides={sides === 100 ? 10 : sides} size={30} label={sides === 100 ? "%" : sides} />
          </button>
        ))}
        <div className="modifier-box" title="Modifier for the next roll (FG's modifier box)">
          <button type="button" aria-label="Modifier down" onClick={() => setModifier(modifier - 1)}>
            −
          </button>
          <input aria-label="Modifier" type="number" value={modifier} onChange={(event) => setModifier(Number(event.target.value) || 0)} />
          <button type="button" aria-label="Modifier up" onClick={() => setModifier(modifier + 1)}>
            +
          </button>
        </div>
        <button
          type="button"
          className={tower ? "tower on" : "tower"}
          aria-pressed={tower}
          title={session.role === "dm" ? "Dice tower: your rolls stay hidden from players" : "Dice tower: only the GM sees your roll"}
          onClick={() => setTower(!tower)}
        >
          <Icon name="tower" size={20} />
        </button>
      </div>
      {pool.length > 0 ? (
        <div className="dice-pool">
          <span>
            {poolFormula()}
            {modifier ? (modifier > 0 ? ` + ${modifier}` : ` − ${-modifier}`) : ""}
          </span>
          <button type="button" className="play-button" onClick={rollPool}>
            Roll{tower ? " in the tower" : ""}
          </button>
          <button type="button" onClick={() => setPool([])}>
            Clear
          </button>
        </div>
      ) : null}
    </section>
  );
}
