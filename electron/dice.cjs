const crypto = require("crypto");

// The host's dice. Every roll in the game comes from here, so every screen
// shows the same result and tests can fix the numbers.
//
// Formulas: terms joined by + or -. A term is a number, or NdS with optional
// keep/drop: 4d6dl1 (drop lowest 1), 2d20kh1 (keep highest 1), kl, dh.
// d% is d100.

const MAX_DICE = 200;
const MAX_SIDES = 1000;

// sfc32: small, fast, and good enough for dice. Seeded from a string.
function makeGenerator(seed, draws = 0) {
  const hash = crypto.createHash("sha256").update(String(seed)).digest();
  let a = hash.readUInt32LE(0);
  let b = hash.readUInt32LE(4);
  let c = hash.readUInt32LE(8);
  let d = hash.readUInt32LE(12);
  let count = 0;
  function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    count += 1;
    return (t >>> 0) / 4294967296;
  }
  for (let i = 0; i < draws; i += 1) next();
  return { next, draws: () => count };
}

function parse(formula) {
  const text = String(formula ?? "").replace(/\s+/g, "").toLowerCase();
  if (!text) throw new Error("Give a dice formula, like 1d20+3.");
  if (text.length > 200) throw new Error("That formula is too long.");
  const terms = [];
  const pattern = /([+-]?)(?:(\d*)d(\d+|%)((?:k|kh|kl|d|dh|dl)\d+)?|(\d+))/y;
  let index = 0;
  let dice = 0;
  while (index < text.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (!match || (index > 0 && !match[1])) throw new Error(`Could not read "${formula}".`);
    index = pattern.lastIndex;
    const sign = match[1] === "-" ? -1 : 1;
    if (match[5] !== undefined) {
      terms.push({ kind: "number", sign, value: Number(match[5]) });
      continue;
    }
    const count = match[2] === "" ? 1 : Number(match[2]);
    const sides = match[3] === "%" ? 100 : Number(match[3]);
    if (count < 1 || sides < 2 || sides > MAX_SIDES) throw new Error(`Could not read "${formula}".`);
    dice += count;
    if (dice > MAX_DICE) throw new Error("That is too many dice.");
    let keep = null;
    if (match[4]) {
      const [, mode, amount] = /^(kh|kl|k|dh|dl|d)(\d+)$/.exec(match[4]);
      const n = Number(amount);
      if (n < 1 || n > count) throw new Error(`Could not read "${formula}".`);
      keep = { mode: mode === "k" ? "kh" : mode === "d" ? "dl" : mode, n };
    }
    terms.push({ kind: "dice", sign, count, sides, keep });
  }
  return terms;
}

function keptFlags(rolls, keep) {
  if (!keep) return rolls.map(() => true);
  const order = rolls.map((value, i) => ({ value, i })).sort((x, y) => x.value - y.value || x.i - y.i);
  const keepCount = keep.mode === "kh" || keep.mode === "kl" ? keep.n : rolls.length - keep.n;
  const fromTop = keep.mode === "kh" || keep.mode === "dl";
  const chosen = new Set((fromTop ? order.slice(order.length - keepCount) : order.slice(0, keepCount)).map((item) => item.i));
  return rolls.map((_, i) => chosen.has(i));
}

// state: { seed, draws, forced: number[] } — saved with the campaign.
function createDice(state = {}) {
  let seed = typeof state.seed === "string" && state.seed ? state.seed : crypto.randomBytes(16).toString("hex");
  let generator = makeGenerator(seed, Number(state.draws) || 0);
  const forced = Array.isArray(state.forced) ? state.forced.filter(Number.isInteger) : [];

  function face(sides) {
    // A fixed result is used for the next die whatever its size; tests set
    // values that fit the dice they are about to roll.
    if (forced.length > 0) return Math.min(sides, Math.max(1, forced.shift()));
    return 1 + Math.floor(generator.next() * sides);
  }

  return {
    roll(formula) {
      const terms = parse(formula);
      let total = 0;
      const out = terms.map((term) => {
        if (term.kind === "number") {
          total += term.sign * term.value;
          return { kind: "number", sign: term.sign, value: term.value };
        }
        const rolls = Array.from({ length: term.count }, () => face(term.sides));
        const kept = keptFlags(rolls, term.keep);
        const sum = rolls.reduce((acc, value, i) => acc + (kept[i] ? value : 0), 0);
        total += term.sign * sum;
        return { kind: "dice", sign: term.sign, count: term.count, sides: term.sides, keep: term.keep, rolls, kept, sum };
      });
      return { formula: String(formula).replace(/\s+/g, ""), terms: out, total };
    },
    // Queue exact results for the next dice, in order (tests and parity runs).
    force(values) {
      for (const value of values) {
        if (!Number.isInteger(value) || value < 1 || value > MAX_SIDES) throw new Error("Fixed results are whole numbers from 1 up.");
        forced.push(value);
      }
      return forced.length;
    },
    clearForced() {
      forced.length = 0;
    },
    reseed(next) {
      seed = String(next || crypto.randomBytes(16).toString("hex"));
      generator = makeGenerator(seed, 0);
      return seed;
    },
    toJSON() {
      // draws() counts the replayed draws too, so a restart continues the same sequence.
      return { seed, draws: generator.draws(), forced: forced.slice() };
    },
  };
}

module.exports = { createDice, parse };
