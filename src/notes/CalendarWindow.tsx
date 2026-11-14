import { useMemo, useState } from "react";
import type { CalendarNote, Session } from "../session/useSession";
import { Icon } from "../ui/icons";
import { calendarOf, dateWords, monthsOf, weekday } from "../../shared/calendars.mjs";

// FG's Calendar (with the GM's Kraken Calendar Notes): the year's months laid
// out, today marked, a day's notes underlined in its writer's colour. A click
// opens a day's page beside it: the players' notes (each signed in its
// writer's colour, the table's or kept to them and the GM) and the GM's (shown
// to the players or kept to the GM), and a note added there. The GM sets the
// date and the time, moves them on, and says them in chat; anyone may.
export function CalendarWindow({ session }: { session: Session }) {
  const view = session.calendar;
  const gm = session.role === "dm";
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const [shownYear, setShownYear] = useState<number | null>(null);
  const [picked, setPicked] = useState<{ year: number; day: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [keep, setKeep] = useState(false);
  const calendar = calendarOf(view?.id ?? "gregorian");
  const year = shownYear ?? view?.year ?? calendar.year;
  const months = useMemo(() => monthsOf(calendar, year), [calendar, year]);
  // The notes on each day of this year, by day.
  const byDay = useMemo(() => {
    const out = new Map<number, CalendarNote[]>();
    for (const note of view?.notes ?? []) if (note.year === year) out.set(note.day, [...(out.get(note.day) ?? []), note]);
    return out;
  }, [view?.notes, year]);
  if (!view) return <p className="hint">The calendar comes with the table.</p>;
  const op = (message: Record<string, unknown>) => session.calendarOp(message);
  const day = picked ?? { year: view.year, day: view.day };
  const dayNotes = (view.notes ?? []).filter((note) => note.year === day.year && note.day === day.day);
  const playerNotes = dayNotes.filter((note) => note.by !== "");
  const gmNotes = dayNotes.filter((note) => note.by === "");
  const short = (name: string) => (name.length > 3 && /-day$/.test(name) ? name.replace(/-day$/, "").slice(0, 3) : name.startsWith("Span") ? name.replace("Span ", "") : name.slice(0, 2));
  let start = 0;

  const add = () => {
    const words = draft.trim();
    if (!words) return;
    op({ action: "note-add", year: day.year, day: day.day, text: words, shown: !keep });
    setDraft("");
  };
  const noteRow = (note: CalendarNote) => {
    const mine = gm || note.by === me;
    return (
      <li key={note.id} className={note.shown ? "cal-note" : "cal-note kept"} data-cal-note={note.id}>
        {note.by ? (
          <b style={{ color: note.color ?? undefined }}>{note.by}:</b>
        ) : null}{" "}
        <span>{note.text}</span>
        {mine ? (
          <span className="cal-note-tools">
            <button type="button" className="ghost icon-button" data-action="cal-note-shown" aria-pressed={note.shown} title={note.by ? (note.shown ? "The whole table sees it: click to keep it to you and the GM" : "Kept to you and the GM: click to show the table") : note.shown ? "The players see it: click to keep it to the GM" : "The GM's alone: click to show the players"} onClick={() => op({ action: "note-update", id: note.id, patch: { shown: !note.shown } })}>
              <Icon name={note.shown ? "eye" : "lock"} size={14} />
            </button>
            <button type="button" className="ghost icon-button" data-action="cal-note-remove" title="Remove this note" aria-label="Remove this note" onClick={() => op({ action: "note-remove", id: note.id })}>
              <Icon name="trash" size={14} />
            </button>
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="calendar-window" data-calendar={view.id}>
      <header className="cal-head">
        <button type="button" className="ghost icon-button" data-action="cal-say" title="Say today's date and time in chat" aria-label="Say the date in chat" onClick={() => op({ action: "say" })}>
          <Icon name="chat" size={16} />
        </button>
        <div className="cal-today">
          <span className="cal-label">Date</span>
          <strong data-cal-today>{view.today}</strong>
        </div>
        {gm ? (
          <div className="cal-gm">
            <button type="button" className="ghost icon-button" data-action="cal-day-back" title="A day back" aria-label="A day back" onClick={() => op({ action: "advance", days: -1 })}>
              ‹
            </button>
            <button type="button" className="ghost icon-button" data-action="cal-day-on" title="The next day" aria-label="The next day" onClick={() => op({ action: "advance", days: 1 })}>
              ›
            </button>
            <span className="cal-time">
              <input type="number" min={0} max={23} aria-label="Hour" data-field="cal-hour" value={view.hour} onChange={(event) => op({ action: "set", patch: { hour: Number(event.target.value) } })} />:
              <input type="number" min={0} max={59} aria-label="Minute" data-field="cal-minute" value={String(view.minute).padStart(2, "0")} onChange={(event) => op({ action: "set", patch: { minute: Number(event.target.value) } })} />
            </span>
            <button type="button" className="ghost" data-action="cal-hour-on" title="An hour passes" onClick={() => op({ action: "advance", hours: 1 })}>
              +1h
            </button>
            <button type="button" className="ghost" data-action="cal-rest" title="A night's rest: eight hours pass" onClick={() => op({ action: "advance", hours: 8 })}>
              +8h
            </button>
            <select aria-label="Calendar" data-field="cal-calendar" value={view.id} onChange={(event) => (setShownYear(null), setPicked(null), op({ action: "set", patch: { id: event.target.value } }))}>
              {view.calendars.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="cal-time-shown">{`${String(view.hour).padStart(2, "0")}:${String(view.minute).padStart(2, "0")}`}</span>
        )}
      </header>
      <div className="cal-body">
        <div className="cal-year">
          <div className="cal-year-nav">
            <button type="button" className="ghost icon-button" title="The year before" aria-label="The year before" onClick={() => setShownYear(year - 1)}>
              ‹
            </button>
            <b data-cal-year={year}>
              {year} {calendar.era}
            </b>
            <button type="button" className="ghost icon-button" title="The year after" aria-label="The year after" onClick={() => setShownYear(year + 1)}>
              ›
            </button>
            {year !== view.year ? (
              <button type="button" className="ghost" onClick={() => setShownYear(null)}>
                This year
              </button>
            ) : null}
          </div>
          <div className="cal-months">
            {months.map((month: { name: string; days: number; festival?: boolean }, monthIndex: number) => {
              const first = start;
              start += month.days;
              const lead = calendar.weekRestarts || calendar.imperial ? 0 : weekday(calendar, year, first);
              const weekLength = calendar.week.length;
              return (
                <section key={`${month.name}-${monthIndex}`} className={month.festival ? "cal-month festival" : "cal-month"} data-cal-month={month.name}>
                  <h4>{month.name}</h4>
                  {month.days > 1 ? (
                    <div className="cal-week" style={{ gridTemplateColumns: `repeat(${weekLength}, 1fr)` }}>
                      {calendar.week.map((name) => (
                        <span key={name} title={name}>
                          {short(name)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="cal-days" style={{ gridTemplateColumns: `repeat(${month.days > 1 ? weekLength : 1}, 1fr)` }}>
                    {Array.from({ length: month.days > 1 ? lead : 0 }, (_, index) => (
                      <span key={`lead-${index}`} />
                    ))}
                    {Array.from({ length: month.days }, (_, index) => {
                      const at = first + index;
                      const notes = byDay.get(at) ?? [];
                      const today = year === view.year && at === view.day;
                      const chosen = day.year === year && day.day === at;
                      return (
                        <button
                          key={at}
                          type="button"
                          className={["cal-day", today ? "today" : "", chosen ? "chosen" : "", notes.length ? "noted" : ""].filter(Boolean).join(" ")}
                          data-cal-day={at}
                          title={`${dateWords(calendar, year, at)}${notes.length ? `: ${notes.length} note${notes.length === 1 ? "" : "s"}` : ""}`}
                          style={notes.length ? { textDecorationColor: notes.find((note) => note.color)?.color ?? "var(--brass)" } : undefined}
                          onClick={() => setPicked({ year, day: at })}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        <aside className="cal-page" data-cal-page={`${day.year}:${day.day}`}>
          <h3>{dateWords(calendar, day.year, day.day)}</h3>
          {gm && !(day.year === view.year && day.day === view.day) ? (
            <button type="button" className="ghost" data-action="cal-make-today" title="Make this day today" onClick={() => op({ action: "set", patch: { year: day.year, day: day.day } })}>
              <Icon name="flag" size={14} /> Make it today
            </button>
          ) : null}
          <h4>Player notes</h4>
          <ul className="cal-notes" data-cal-notes="players">
            {playerNotes.length ? playerNotes.map(noteRow) : <li className="hint">None.</li>}
          </ul>
          <h4>GM notes</h4>
          <ul className="cal-notes" data-cal-notes="gm">
            {gmNotes.length ? gmNotes.map(noteRow) : <li className="hint">None.</li>}
          </ul>
          <textarea
            className="cal-draft"
            aria-label="A note on this day"
            data-field="cal-note"
            placeholder={gm ? "A note on this day (\"The smith has the sword ready\")" : "Your note on this day"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) add();
            }}
            onDragOver={(event) => {
              if ([...event.dataTransfer.types].includes("text/plain")) event.preventDefault();
            }}
            onDrop={(event) => {
              const words = event.dataTransfer.getData("text/plain");
              if (!words) return;
              event.preventDefault();
              setDraft((current) => `${current}${current && !current.endsWith("\n") ? "\n" : ""}${words}`);
            }}
          />
          <div className="cal-add">
            <label className="check" title={gm ? "Only you see it" : "Only you and the GM see it"}>
              <input type="checkbox" checked={keep} data-field="cal-keep" onChange={(event) => setKeep(event.target.checked)} />
              <Icon name="lock" size={13} /> {gm ? "GM only" : "Just me and the GM"}
            </label>
            <button type="button" className="play-button" data-action="cal-note-add" disabled={!draft.trim()} onClick={add}>
              <Icon name="plus" size={14} /> Add note
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
