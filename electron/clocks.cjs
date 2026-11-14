const crypto = require("crypto");

// Progress clocks on the table (the Blades in the Dark SRD's, for Forged in
// the Dark, but any game may use them): a circle of segments the GM ticks as
// trouble mounts or effort pays off, shown to every seat (or kept for the GM
// until shown). Kinds: progress, danger, racing (two that race: the first
// full wins), linked (locked until the clock it waits on fills), tug-of-war
// (ticked up and down), mission, project and faction. And the GM's Score
// panel state, which every seat reads: the phase (free play, the score,
// downtime), the position and effect the next action rolls use, the target,
// the plan and its detail, and the engagement roll's result.

const KINDS = ["progress", "danger", "racing", "linked", "tug", "mission", "project", "faction"];
const PHASES = ["free", "score", "downtime"];
const POSITIONS = ["controlled", "risky", "desperate"];
const EFFECTS = ["zero", "limited", "standard", "great", "extreme"];
const PLANS = ["", "assault", "deception", "stealth", "occult", "social", "transport"];
const MAX_CLOCKS = 60;
const text = (value, fallback = "") => (typeof value === "string" ? value : fallback);
const int = (value, fallback) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback);

function cleanClock(raw) {
  if (!raw || typeof raw !== "object") return null;
  const segments = Math.min(12, Math.max(2, int(raw.segments, 4)));
  const name = text(raw.name).trim().slice(0, 80);
  if (!name) return null;
  return {
    id: text(raw.id).slice(0, 20) || crypto.randomBytes(4).toString("hex"),
    name,
    segments,
    filled: Math.min(segments, Math.max(0, int(raw.filled, 0))),
    kind: KINDS.includes(raw.kind) ? raw.kind : "progress",
    // Shown to the players, or the GM's alone.
    shown: raw.shown !== false,
    // Racing: the clock it races; linked: the clock that must fill first (this one is locked till then).
    rival: text(raw.rival).slice(0, 20),
    after: text(raw.after).slice(0, 20),
    note: text(raw.note).slice(0, 400),
    by: text(raw.by).slice(0, 40),
  };
}
function cleanScore(raw) {
  const score = raw && typeof raw === "object" ? raw : {};
  return {
    phase: PHASES.includes(score.phase) ? score.phase : "free",
    position: POSITIONS.includes(score.position) ? score.position : "risky",
    effect: EFFECTS.includes(score.effect) ? score.effect : "standard",
    target: text(score.target).slice(0, 120),
    targetTier: Math.min(6, Math.max(0, int(score.targetTier, 0))),
    plan: PLANS.includes(score.plan) ? score.plan : "",
    detail: text(score.detail).slice(0, 200),
    engagement: score.engagement && typeof score.engagement === "object" ? { result: text(score.engagement.result), highest: int(score.engagement.highest, 0), dice: int(score.engagement.dice, 0), position: text(score.engagement.position) } : null,
  };
}

function createClocks({ saved, onChange = () => undefined, say = () => undefined }) {
  const raw = saved && typeof saved === "object" ? saved : {};
  const state = { clocks: (Array.isArray(raw.clocks) ? raw.clocks : []).map(cleanClock).filter(Boolean).slice(0, MAX_CLOCKS), score: cleanScore(raw.score) };
  const mustGM = (seat) => {
    if (seat?.role !== "dm") throw new Error("Only the GM changes the clocks.");
  };
  const find = (id) => {
    const clock = state.clocks.find((item) => item.id === String(id) || item.name.toLowerCase() === String(id).toLowerCase());
    if (!clock) throw new Error(`No clock ${id}.`);
    return clock;
  };
  // A clock waiting on another that is not yet full.
  const locked = (clock) => Boolean(clock.after && state.clocks.some((item) => item.id === clock.after && item.filled < item.segments));
  const viewOf = (clock) => ({ ...clock, locked: locked(clock) });
  const view = (seat) => ({ clocks: state.clocks.filter((clock) => seat?.role === "dm" || clock.shown).map(viewOf), score: { ...state.score } });
  const changed = () => onChange();
  // Ticks a clock (negative to empty a tug-of-war). A clock that fills says so; its rival, if racing, has lost.
  function tick(id, amount = 1, seat, { why = "", by = "" } = {}) {
    const clock = find(id);
    if (seat && seat.role !== "dm" && !clock.shown) throw new Error(`No clock ${id}.`);
    if (locked(clock)) throw new Error(`${clock.name} is locked until ${find(clock.after).name} fills.`);
    const before = clock.filled;
    clock.filled = Math.min(clock.segments, Math.max(0, before + int(amount, 1)));
    const full = clock.filled >= clock.segments && before < clock.segments;
    const label = `[CLOCK] ${clock.name}: ${clock.filled}/${clock.segments}${why ? ` (${why})` : ""}`;
    say(full ? `${label}. It is full!` : label, by || "Clocks", !clock.shown);
    const events = [];
    if (full) {
      events.push({ full: clock.id });
      const rival = clock.rival ? state.clocks.find((item) => item.id === clock.rival) : null;
      if (rival && rival.filled < rival.segments) say(`[CLOCK] ${clock.name} finished before ${rival.name}.`, by || "Clocks", !clock.shown);
      for (const next of state.clocks.filter((item) => item.after === clock.id)) {
        events.push({ unlocked: next.id });
        say(`[CLOCK] ${next.name} is open now (${next.segments} segments).`, by || "Clocks", !next.shown);
      }
    }
    changed();
    return { ...viewOf(clock), before, full, events };
  }
  return {
    view,
    find,
    list: () => state.clocks.map(viewOf),
    add(spec, seat) {
      mustGM(seat);
      if (state.clocks.length >= MAX_CLOCKS) throw new Error("Too many clocks: remove some first.");
      const clock = cleanClock({ ...spec, id: undefined, by: seat?.name ?? "" });
      if (!clock) throw new Error("Name the clock.");
      for (const key of ["rival", "after"]) if (clock[key]) clock[key] = find(clock[key]).id;
      state.clocks.push(clock);
      // Racing clocks race each other both ways.
      if (clock.rival) {
        const rival = find(clock.rival);
        if (!rival.rival) rival.rival = clock.id;
        clock.kind = "racing";
        rival.kind = "racing";
      }
      if (clock.after && clock.kind === "progress") clock.kind = "linked";
      if (clock.shown) say(`[CLOCK] ${clock.name}: a ${clock.segments}-clock${clock.kind !== "progress" ? ` (${clock.kind})` : ""}.`, "Clocks");
      changed();
      return viewOf(clock);
    },
    tick,
    update(id, patch, seat) {
      mustGM(seat);
      const clock = find(id);
      const next = cleanClock({ ...clock, ...(patch && typeof patch === "object" ? patch : {}), id: clock.id });
      if (!next) throw new Error("Name the clock.");
      const wasHidden = !clock.shown;
      Object.assign(clock, next);
      if (wasHidden && clock.shown) say(`[CLOCK] ${clock.name}: ${clock.filled}/${clock.segments}.`, "Clocks");
      changed();
      return viewOf(clock);
    },
    remove(id, seat) {
      mustGM(seat);
      const clock = find(id);
      state.clocks = state.clocks.filter((item) => item !== clock);
      for (const item of state.clocks) {
        if (item.rival === clock.id) item.rival = "";
        if (item.after === clock.id) item.after = "";
      }
      changed();
      return { removed: clock.id };
    },
    clear(seat) {
      mustGM(seat);
      state.clocks = [];
      changed();
      return { cleared: true };
    },
    score: () => ({ ...state.score }),
    setScore(patch, seat) {
      mustGM(seat);
      state.score = cleanScore({ ...state.score, ...(patch && typeof patch === "object" ? patch : {}) });
      changed();
      return { ...state.score };
    },
    persisted: () => ({ clocks: state.clocks.map((clock) => ({ ...clock })), score: { ...state.score } }),
  };
}

module.exports = { createClocks, cleanClock, KINDS, PHASES, POSITIONS, EFFECTS };
