const crypto = require("crypto");
const { CALENDARS, addDays, calendarFor, calendarOf, dateWords, daysIn, timeWords } = require("../shared/calendars.mjs");

// The campaign's calendar (FG's Calendar, with the GM's Kraken Calendar Notes
// extension): which calendar, today's date and the time, and notes on days.
// The GM sets the date and the time (or moves them on); anyone writes notes on
// a day: a player's are signed with their name and colour and seen by the
// whole table (or kept to themselves and the GM), the GM's are shown to the
// players or kept to the GM. "Your magic item will be ready on the 9th."

const text = (value, fallback = "") => (typeof value === "string" ? value : fallback);
const int = (value, fallback) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback);
const MAX_NOTES = 2000;

function cleanNote(raw) {
  if (!raw || typeof raw !== "object") return null;
  const words = text(raw.text).trim().slice(0, 4000);
  if (!words) return null;
  return {
    id: text(raw.id) || crypto.randomBytes(5).toString("hex"),
    year: int(raw.year, 0),
    day: Math.max(0, int(raw.day, 0)),
    by: text(raw.by).slice(0, 40),
    color: /^#[0-9a-f]{6}$/i.test(text(raw.color)) ? raw.color : null,
    text: words,
    // A GM's note: shown to the players, or the GM's alone. A player's: the table's, or theirs and the GM's.
    shown: raw.shown !== false,
    at: int(raw.at, Date.now()),
  };
}

function createCalendar({ saved, ruleset = "", onChange = () => undefined }) {
  const raw = saved && typeof saved === "object" ? saved : {};
  const first = calendarOf(raw.id ?? calendarFor(ruleset));
  const state = {
    id: first.id,
    year: int(raw.year, first.year),
    day: Math.max(0, int(raw.day, 0)),
    hour: Math.min(23, Math.max(0, int(raw.hour, 8))),
    minute: Math.min(59, Math.max(0, int(raw.minute, 0))),
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map(cleanNote).filter(Boolean).slice(-MAX_NOTES),
  };
  const calendar = () => calendarOf(state.id);
  const fit = () => {
    state.day = Math.min(state.day, daysIn(calendar(), state.year) - 1);
  };
  fit();
  const mustGM = (seat) => {
    if (seat.role !== "dm") throw new Error("Only the GM sets the date.");
  };
  const mayRead = (note, seat) => seat.role === "dm" || note.shown || note.by === seat.name;
  const view = (seat) => ({
    id: state.id,
    year: state.year,
    day: state.day,
    hour: state.hour,
    minute: state.minute,
    today: `${dateWords(calendar(), state.year, state.day)}, ${timeWords(state.hour, state.minute)}`,
    calendars: CALENDARS.map(({ id, name }) => ({ id, name })),
    notes: state.notes.filter((note) => mayRead(note, seat)),
  });
  const changed = () => onChange();

  return {
    view,
    persisted: () => JSON.parse(JSON.stringify(state)),
    // The GM: another calendar; a date (year, day of the year), a time.
    set(patch, seat) {
      mustGM(seat);
      const next = patch && typeof patch === "object" ? patch : {};
      if (next.id !== undefined) {
        if (!CALENDARS.some((item) => item.id === next.id)) throw new Error(`No calendar "${next.id}": ${CALENDARS.map((item) => item.id).join(", ")}.`);
        state.id = next.id;
        if (next.year === undefined) state.year = calendar().year;
        if (next.day === undefined) state.day = 0;
      }
      if (next.year !== undefined) state.year = int(next.year, state.year);
      if (next.day !== undefined) state.day = Math.max(0, Math.min(daysIn(calendar(), state.year) - 1, int(next.day, state.day)));
      if (next.hour !== undefined) state.hour = Math.min(23, Math.max(0, int(next.hour, state.hour)));
      if (next.minute !== undefined) state.minute = Math.min(59, Math.max(0, int(next.minute, state.minute)));
      fit();
      changed();
      return view(seat);
    },
    // Time passes (or goes back): days, hours, minutes; midnight turns the day.
    advance({ days = 0, hours = 0, minutes = 0 } = {}, seat) {
      mustGM(seat);
      let total = state.hour * 60 + state.minute + int(hours, 0) * 60 + int(minutes, 0);
      let byDays = int(days, 0) + Math.floor(total / 1440);
      total = ((total % 1440) + 1440) % 1440;
      state.hour = Math.floor(total / 60);
      state.minute = total % 60;
      const moved = addDays(calendar(), state.year, state.day, byDays);
      state.year = moved.year;
      state.day = moved.day;
      changed();
      return view(seat);
    },
    // A note on a day (today unless a year and day are given), signed by its writer.
    addNote(input, seat, color = null) {
      const note = cleanNote({
        ...input,
        id: undefined,
        year: input?.year ?? state.year,
        day: input?.day ?? state.day,
        by: seat.role === "dm" ? "" : seat.name,
        color: seat.role === "dm" ? null : color,
        at: Date.now(),
      });
      if (!note) throw new Error("A note needs words.");
      if (note.day >= daysIn(calendar(), note.year)) throw new Error("That year has no such day.");
      state.notes.push(note);
      if (state.notes.length > MAX_NOTES) state.notes.splice(0, state.notes.length - MAX_NOTES);
      changed();
      return note;
    },
    // Its writer (or the GM) changes its words, who sees it, or moves it to another day.
    updateNote(id, patch, seat) {
      const note = state.notes.find((item) => item.id === id);
      if (!note || !mayRead(note, seat)) throw new Error("That note is gone.");
      if (seat.role !== "dm" && note.by !== seat.name) throw new Error("You can only change your own notes.");
      const next = cleanNote({ ...note, ...(patch ?? {}), id: note.id, by: note.by, color: note.color });
      if (!next) throw new Error("A note needs words.");
      Object.assign(note, next);
      changed();
      return note;
    },
    removeNote(id, seat) {
      const at = state.notes.findIndex((item) => item.id === id);
      if (at < 0) throw new Error("That note is gone.");
      if (seat.role !== "dm" && state.notes[at].by !== seat.name) throw new Error("You can only remove your own notes.");
      state.notes.splice(at, 1);
      changed();
    },
  };
}

module.exports = { createCalendar };
