const crypto = require("crypto");

// The host's dice. Every roll in the game comes from here, so every screen
// shows the same result and tests can fix the numbers.
//
// Formulas: terms joined by + or -. A term is a number, or NdS with any of
// (FG's and Foundry's forms both):
//   keep/drop   4d6dl1 or 4d6d1 (drop lowest 1), 4d6kh3 or 4d6k3 (keep highest 3), kl, dh
//   exploding   4d6! or 4d6x (a die on its highest rolls another), 4d6!>5 or x>=5
//   reroll      4d6r1 (dice of 1 or less are rolled again, once), r<3 also reads
//   successes   6d10cs>=7 (the total is how many dice reach 7), cs>5
// d% is d100; dF (Fate) is -1, 0 or +1.

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
  const pattern = /([+-]?)(?:(\d*)d(\d+|%|f)((?:kh|kl|k|dh|dl|d)\d+|[!x](?:[<>]=?\d+)?|ro?[<>]?=?\d+|cs[<>]=?\d+)*|(\d+))/y;
  const modifier = /(kh|kl|k|dh|dl|d)(\d+)|[!x](?:([<>]=?)(\d+))?|ro?([<>]?=?)(\d+)|cs([<>]=?)(\d+)/y;
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
    const fate = match[3] === "f";
    const sides = match[3] === "%" ? 100 : fate ? 3 : Number(match[3]);
    if (count < 1 || sides < 2 || sides > MAX_SIDES) throw new Error(`Could not read "${formula}".`);
    dice += count;
    if (dice > MAX_DICE) throw new Error("That is too many dice.");
    // The modifiers after the dice, in any order.
    const tail = text.slice(match.index + match[0].length - (match[0].length - match[0].indexOf("d") - 1 - match[3].length), index);
    let keep = null;
    let explode = null;
    let reroll = null;
    let success = null;
    for (let at = 0; at < tail.length; ) {
      modifier.lastIndex = at;
      const part = modifier.exec(tail);
      if (!part) throw new Error(`Could not read "${formula}".`);
      at = modifier.lastIndex;
      if (part[1]) {
        const n = Number(part[2]);
        if (n < 1 || n > count) throw new Error(`Could not read "${formula}".`);
        keep = { mode: part[1] === "k" ? "kh" : part[1] === "d" ? "dl" : part[1], n };
      } else if (part[0][0] === "!" || part[0][0] === "x") {
        explode = { op: part[3] || ">=", n: part[4] ? Number(part[4]) : sides };
        if (!fate && (explode.op === ">=" ? explode.n : explode.n + 1) <= 1) throw new Error("Those dice would explode for ever.");
      } else if (part[0].startsWith("cs")) {
        success = { op: part[7], n: Number(part[8]) };
      } else {
        // r1 rerolls dice of 1 or less; r<3, r<=2, r>5 say which.
        const op = part[5] || "<=";
        reroll = { op: op === "=" ? "<=" : op, n: Number(part[6]) };
      }
    }
    terms.push({ kind: "dice", sign, count, sides, keep, ...(fate ? { fate: true } : {}), ...(explode ? { explode } : {}), ...(reroll ? { reroll } : {}), ...(success ? { success } : {}) });
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
        const meets = (value, test) => (test.op === ">" ? value > test.n : test.op === ">=" ? value >= test.n : test.op === "<" ? value < test.n : value <= test.n);
        const one = () => (term.fate ? face(3) - 2 : face(term.sides));
        let rolls = Array.from({ length: term.count }, one);
        // Rerolled once, the new result stands.
        if (term.reroll) rolls = rolls.map((value) => (meets(value, term.reroll) ? one() : value));
        // An exploding die rolls another, and that one may explode too (a hundred at most).
        if (term.explode) {
          let extra = 0;
          for (let i = 0; i < rolls.length && extra < 100; i++) {
            if (meets(rolls[i], term.explode)) {
              rolls.push(one());
              extra += 1;
            }
          }
        }
        const kept = keptFlags(rolls, term.keep);
        const sum = term.success
          ? rolls.filter((value, i) => kept[i] && meets(value, term.success)).length
          : rolls.reduce((acc, value, i) => acc + (kept[i] ? value : 0), 0);
        total += term.sign * sum;
        return { kind: "dice", sign: term.sign, count: term.count, sides: term.sides, keep: term.keep, rolls, kept, sum, ...(term.fate ? { fate: true } : {}), ...(term.success ? { success: term.success } : {}) };
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
