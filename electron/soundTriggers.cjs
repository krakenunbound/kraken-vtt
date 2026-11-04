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

// A creature's own sounds (sfx/Monsters/<Orc>, sfx/Animals/<Wolf>, each with
// Attack, Hurt, Death), found from its name: "Orc 2" is an orc, "Dire Wolf" a
// wolf, "Giant Spider" a spider (the last word that names a creature wins).
const NATURAL = /\b(bite|bites|claw|claws|slam|sting|gore|talon|talons|tail|tentacle|tentacles|hoof|hooves|horn|horns|tusk|tusks|butt|pincer|pincers|touch|kick|wing|wings|crush|constrict|rake|stomp|beak|peck|swarm|engulf|breath)\b/i;
function creatureFolder(who, library) {
  const words = String(who ?? "").toLowerCase().replace(/\s+\d+$/, "");
  if (!words) return null;
  let best = null;
  for (const group of library.groups("sfx")) {
    const match = /^sfx\/(Monsters|Animals)\/([^/]+)\/Attack$/.exec(group.id);
    if (!match) continue;
    const name = match[2].toLowerCase();
    // The name, or its plural ("orcs", "wolves").
    const plain = name.replace(/[^a-z ]/g, "");
    const pattern = new RegExp(`\\b(${plain}(s|es)?|${plain.replace(/f$/, "v")}es)\\b`);
    const at = words.search(pattern);
    if (at >= 0 && (!best || at > best.at || (at === best.at && name.length > best.name.length))) best = { at, name, folder: `sfx/${match[1]}/${match[2]}` };
  }
  return best?.folder ?? null;
}

// The sound for a line: { id, trigger } or null. library: sounds.cjs.
function soundFor(line, triggers, library) {
  if (!library || !Array.isArray(triggers) || line.local) return null;
  const { kinds, results, name, said } = classify(line);
  // A creature's natural attack (an orc's bite, a wolf's claws) is its own attack sound.
  const creature = kinds.includes("attack") && library.groups ? creatureFolder(line.from, library) : null;
  if (creature && NATURAL.test(name)) {
    const picked = library.pick(`${creature}/Attack`);
    if (picked) return { id: picked.id, trigger: "creature" };
  }
  // A creature killed: its death cry ("-> Orc 2: 7 (Dead)").
  const died = /->\s*(.+?):\s*\d+\s*\((Dead|Dying)/.exec(String(line.text ?? ""));
  if (died && library.groups) {
    const folder = creatureFolder(died[1], library);
    const picked = folder ? library.pick(`${folder}/Death`) : null;
    if (picked) return { id: picked.id, trigger: "creature-death" };
  }
  for (const result of results) {
    for (const rule of triggers) {
      if (!rule.enabled || !kinds.includes(rule.on) || rule.result !== result) continue;
      if (!matches(rule, rule.on === "text" || rule.on === "roll" ? said : name)) continue;
      const picked = library.pick(rule.sound);
      if (picked) return { id: picked.id, trigger: rule.id };
    }
  }
  // A creature's attack with nothing else to play (a weapon Kraken has no sound for): its own attack sound.
  if (creature) {
    const picked = library.pick(`${creature}/Attack`);
    if (picked) return { id: picked.id, trigger: "creature" };
  }
  return null;
}

module.exports = { soundFor, cleanTriggers, classify, creatureFolder };
