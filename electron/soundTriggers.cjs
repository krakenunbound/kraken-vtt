// Which sound a chat line sets off (as Syrinscape's chat triggers in FG): what
// the line is (an attack, a save, a spell cast, healing, damage, any roll, or
// words in the text) and how it went (hit, miss, a natural 20's crit, a
// natural 1's fumble, a save's success or failure). Triggers are tried in
// order; the first that fits, and whose folder has sounds, plays.

const ON = new Set(["attack", "spellattack", "save", "cast", "heal", "damage", "roll", "text"]);
const RESULTS = new Set(["any", "hit", "miss", "crit", "fumble", "success", "failure"]);

function cleanTriggers(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter((item) => item && typeof item === "object" && typeof item.sound === "string")
    .slice(0, 1000)
    .map((item, index) => ({
      id: String(item.id ?? `trigger-${index}`).slice(0, 80),
      name: String(item.name ?? "").slice(0, 80),
      on: ON.has(item.on) ? item.on : "text",
      match: String(item.match ?? "").slice(0, 300),
      result: RESULTS.has(item.result) ? item.result : "any",
      sound: String(item.sound).slice(0, 300),
      enabled: item.enabled !== false,
    }));
}

// The first d20 a roll kept: a natural 20 is a crit, a natural 1 a fumble.
function natural(roll) {
  const term = roll?.terms?.find((item) => item.kind === "dice" && item.sides === 20);
  if (!term) return null;
  const index = term.rolls.findIndex((_, i) => term.kept?.[i] !== false);
  return index >= 0 ? term.rolls[index] : null;
}

// What a line is, and the results it may count as (the first that has a sound wins).
function classify(line) {
  const label = String(line.roll?.label ?? "");
  const words = `${label} ${line.text ?? ""}`;
  const kinds = [];
  let results = ["any"];
  if (line.roll) kinds.push("roll");
  if (/^\[ATTACK\]/.test(label)) {
    kinds.push("attack", "spellattack");
    const outcome = String(line.roll.result ?? "").toUpperCase();
    const face = natural(line.roll);
    if (face === 20) results = ["crit", "hit", "any"];
    else if (face === 1) results = ["fumble", "miss", "any"];
    else if (outcome === "HIT") results = ["hit", "any"];
    else if (outcome === "MISS") results = ["miss", "any"];
    // An attack rolled by hand: by its name, with crit and fumble from the die.
    else results = face === null ? ["any"] : ["hit", "any"];
  } else if (/^\[SAVE\]/.test(label)) {
    kinds.push("save");
    results = /\[SUCCESS/.test(label) ? ["success", "any"] : /\[FAILURE/.test(label) ? ["failure", "any"] : ["any"];
  } else if (/^\[CAST\]/.test(label)) kinds.push("cast");
  else if (/^\[HEAL\]/.test(label)) kinds.push("heal");
  else if (/^\[DAMAGE\]/.test(label)) kinds.push("damage");
  kinds.push("text");
  // The name the trigger's words are looked for in: for an attack, what it attacks with.
  const name = label.replace(/^\[[A-Z ]+\]\s*(\([A-Z]\))?\s*/, "").replace(/\[.*$/, "");
  return { kinds, results, name, words };
}

const patterns = new Map();
function matches(rule, text) {
  if (!rule.match) return true;
  let pattern = patterns.get(rule.match);
  if (!pattern) {
    try {
      pattern = new RegExp(rule.match, "i");
    } catch {
      pattern = new RegExp(rule.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    patterns.set(rule.match, pattern);
  }
  return pattern.test(text);
}

// The sound for a line: { id, trigger } or null. library: sounds.cjs.
function soundFor(line, triggers, library) {
  if (!library || !Array.isArray(triggers) || line.local) return null;
  const { kinds, results, name, words } = classify(line);
  for (const result of results) {
    for (const rule of triggers) {
      if (!rule.enabled || !kinds.includes(rule.on)) continue;
      if (rule.result !== result) continue;
      if (!matches(rule, rule.on === "text" ? words : name || words)) continue;
      const picked = library.pick(rule.sound);
      if (picked) return { id: picked.id, trigger: rule.id };
    }
  }
  return null;
}

module.exports = { soundFor, cleanTriggers, classify };
