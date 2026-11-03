// Which sound a chat line sets off, as Syrinscape's chat triggers in FG (Kraken's
// C&C Syrinscape extension): what the line is (an attack, its damage, a spell
// cast, a save, healing, initiative, any roll, or words in the line) and, for an
// attack, a natural 20's crit or a natural 1's fumble. An attack plays the
// weapon's swing, its damage roll the hit. Triggers are tried in order; the
// first that fits, and whose folder has sounds, plays.

const ON = new Set(["attack", "damage", "save", "cast", "heal", "init", "roll", "text"]);
const RESULTS = new Set(["any", "crit", "fumble", "success", "failure"]);

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

// What a line is, the results it counts as (the first that has a sound wins),
// and the words a trigger looks at: for an attack or damage, what it is made
// with ("(M) Hammer, War"), never who it is at ("-> [at Orc]").
function classify(line) {
  const label = String(line.roll?.label ?? "");
  const said = `${label} ${line.text ?? ""}`;
  const kinds = [];
  let results = ["any"];
  if (line.roll) kinds.push("roll");
  const tag = /^\[([A-Z ]+)\]/.exec(label)?.[1] ?? "";
  if (tag === "ATTACK") {
    kinds.push("attack");
    const face = natural(line.roll);
    if (face === 20) results = ["crit", "any"];
    else if (face === 1) results = ["fumble", "any"];
  } else if (tag === "DAMAGE") kinds.push("damage");
  else if (tag === "SAVE") {
    kinds.push("save");
    results = /\[SUCCESS/.test(label) ? ["success", "any"] : /\[FAILURE/.test(label) ? ["failure", "any"] : ["any"];
  } else if (tag === "CAST") kinds.push("cast");
  else if (tag === "HEAL") kinds.push("heal");
  else if (tag === "INIT") kinds.push("init");
  kinds.push("text");
  const name = label
    .replace(/^\[[A-Z ]+\]\s*/, "")
    .replace(/->.*$/, "")
    .replace(/\[(AC|HIT|MISS|NO TARGET|TYPE|SUCCESS|FAILURE|CB|HALF|EFFECT)[^\]]*\]/g, "")
    .replace(/\[[^\]]*=[^\]]*\]/g, "")
    .trim();
  return { kinds, results, name, said };
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
  const { kinds, results, name, said } = classify(line);
  for (const result of results) {
    for (const rule of triggers) {
      if (!rule.enabled || !kinds.includes(rule.on) || rule.result !== result) continue;
      if (!matches(rule, rule.on === "text" || rule.on === "roll" ? said : name)) continue;
      const picked = library.pick(rule.sound);
      if (picked) return { id: picked.id, trigger: rule.id };
    }
  }
  return null;
}

module.exports = { soundFor, cleanTriggers, classify };
