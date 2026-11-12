// Critical hits and fumbles for AD&D 2E, from the GM's own Krits & Fumbles
// book (an FG 2E module or Kraken pack whose tables are named as FG's 2E
// ruleset expects: "Critical Hit" and "Fumble", the entry tables, and
// "Critical Hit - Slashing" ... "Fumble - Natural Attack", one per kind of
// attack). Kraken ships no table text: a natural 20 that hits rolls the book's
// "Critical Hit" table, a natural 1 its "Fumble"; when the row says to roll
// the matching table, the attack's kind picks it (a sword's slash, a spear's
// point, a club, a missile, a claw or bite), and the row's words are read for
// what the tracker can keep (extra damage, maximum damage or an extra die on
// the next damage roll, AC and to-hit penalties, prone, a save or fall prone,
// a lost attack). The rest is told to the GM with the row's text.
//
// An effect part, as Kraken's C&C krits (shared/siege/krits.mjs) apply them:
//   { effect, dur, who }   a tracker effect (who: "a" the attacker, "v" the victim)
//   { dmg, title, who }    a real damage roll
//   { mark }               the attacker's next damage roll: "max" or "die"
//   { save, fail, who }    the creature saves (2E: paralyzation...) or gets fail (an effect part)
//   { note }               told to the GM

export const KINDS = ["slashing", "piercing", "bludgeoning", "missile", "natural"];
const KIND_NAMES = { slashing: "Slashing", piercing: "Piercing", bludgeoning: "Bludgeoning", missile: "Missile", natural: "Natural Attack" };

const rows = (value) => Object.values(value && typeof value === "object" ? value : {}).filter((row) => row && typeof row === "object");
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const low = (text) => String(text ?? "").trim().toLowerCase();

// The tables a book holds that are the 2E krits: { crit, fumble, crit_<kind>, fumble_<kind> }.
export function findTables(records) {
  const out = {};
  for (const record of records ?? []) {
    const name = low(record?.name ?? record?.data?.name);
    if (!record?.data?.tablerows) continue;
    if (name === "critical hit") out.crit ??= record;
    else if (name === "fumble") out.fumble ??= record;
    for (const kind of KINDS) {
      if (name === `critical hit - ${low(KIND_NAMES[kind])}`) out[`crit_${kind}`] ??= record;
      if (name === `fumble - ${low(KIND_NAMES[kind])}`) out[`fumble_${kind}`] ??= record;
    }
  }
  return out;
}
export const hasTables = (found) => Boolean(found && (found.crit || found.crit_slashing) && (found.fumble || found.fumble_slashing));

// A table's die ("d12": 12; "2d6": [2, 6]) as a formula, and its row for a roll.
export function dieOf(record) {
  const text = String(record?.data?.dice ?? "").trim();
  const match = /^(\d*)d(\d+)$/i.exec(text);
  if (match) return `${match[1] || 1}d${match[2]}`;
  const top = Math.max(1, ...rows(record?.data?.tablerows).map((row) => Number(row.torange) || 0));
  return `1d${top}`;
}
export function rowOf(record, roll) {
  const row = rows(record?.data?.tablerows).find((item) => roll >= Number(item.fromrange) && roll <= Number(item.torange));
  if (!row) return null;
  const cells = rows(row.results).map((cell) => plain(cell.result)).filter(Boolean);
  return { title: cells[0] ?? "", text: cells.slice(1).join(" ") || "" };
}
// An entry table's row sends the attack to the matching kind's table.
export const rollsMatching = (text) => /roll the matching/i.test(String(text ?? ""));

// The attack's kind: missile for a ranged attack; a weapon's damage type
// (S slashing, P piercing, B bludgeoning, "P/S" the first); a creature's claw
// or bite natural; else by the weapon's name.
const NATURAL = /\b(claw|bite|horn|gore|butt|tail|sting|tentacle|talon|hoof|kick|slam|fist|punch|tusk|beak|pincer|constrict|hug|crush|touch|trample|wing|pseudopod)/i;
const SLASH = /\b(sword|axe|scimitar|sickle|scythe|glaive|khopesh|cutlass|sabre|saber|falchion|katana|blade)/i;
const PIERCE = /\b(spear|dagger|knife|pick|rapier|lance|pike|trident|javelin|dart|stiletto|bayonet|awl|halberd|fork|harpoon)/i;
const BLUNT = /\b(mace|club|hammer|flail|staff|morning ?star|maul|cudgel|sap|whip|baton|rod)/i;
export function attackKind({ name = "", type = "", dmgtype = "", npc = false } = {}) {
  if (/ranged|missile/i.test(type)) return "missile";
  const first = String(dmgtype ?? "").trim().split(/[\/,; ]+/)[0].toLowerCase();
  if (/^(s|slash)/.test(first)) return "slashing";
  if (/^(p|pierc)/.test(first)) return "piercing";
  if (/^(b|blud|crush)/.test(first)) return "bludgeoning";
  if (NATURAL.test(name)) return "natural";
  if (SLASH.test(name)) return "slashing";
  if (PIERCE.test(name)) return "piercing";
  if (BLUNT.test(name)) return "bludgeoning";
  return npc ? "natural" : "bludgeoning";
}

// What the tracker can keep of a row's words. kind: crit (the victim is the
// target) or fumble (the attacker). Each sentence names its creature ("The
// attacker...", "The target..."); one that names neither is the default's.
const SAVES = { paralyzation: "paralyzation", paralysis: "paralyzation", poison: "paralyzation", death: "paralyzation", rod: "rod", staff: "rod", wand: "rod", petrification: "petrification", polymorph: "petrification", breath: "breath", spell: "spell" };
export function effectsOf(title, text, kind) {
  const fx = [];
  const label = `Kraken ${title || (kind === "fumble" ? "Fumble" : "Critical")}`;
  const words = String(text ?? "");
  // "If an ally is adjacent..., otherwise...": the GM's call, the whole row.
  if (/\bif an ally\b/i.test(words)) return [{ note: words }];
  let kept = false;
  for (const sentence of words.split(/(?<=\.)(?<!\bvs\.)\s+/)) {
    const s = sentence.trim();
    if (!s) continue;
    const who = /\battacker\b|\bcaster\b|\bwielder\b/i.test(s) ? "a" : /\btarget\b/i.test(s) ? "v" : kind === "fumble" ? "a" : "v";
    const next = /next (turn|round|attack)|end of its next|start of its next|for one round/i.test(s);
    const dur = next ? 1 : 0;
    let match;
    if ((match = /\badd (\d+d\d+|\d+) damage/i.exec(s))) fx.push({ dmg: match[1], title, who }), (kept = true);
    else if (/add one extra normal (?:weapon )?damage die/i.test(s)) fx.push({ mark: "die" }), (kept = true);
    else if (/maximum normal (?:weapon )?damage/i.test(s)) fx.push({ mark: "max" }), (kept = true);
    else if (!/per spell level|next moves|end of its next round unless/i.test(s) && (match = /(?:takes|for|suffers) (\d+d\d+|\d+) damage/i.exec(s))) fx.push({ dmg: match[1], title, who }), (kept = true);
    if ((match = /(\d+)-point AC penalty/i.exec(s))) fx.push({ effect: `${label}; AC: -${match[1]}`, dur, who }), (kept = true);
    else if ((match = /(?:suffers?|at) -(\d+) (?:to hit|morale or -\d+ to its next attack|to its next attack)/i.exec(s)) || (match = /-(\d+) to hit/i.exec(s))) {
      fx.push({ effect: `${label}; ATK: -${match[1]}`, dur: /until (an action|repaired)/i.test(s) ? 0 : 1, who });
      kept = true;
    }
    if ((match = /deals -(\d+) damage/i.exec(s))) fx.push({ effect: `${label}; DMG: -${match[1]}`, dur: 0, who }), (kept = true);
    if ((match = /next (?:melee )?attack against the (attacker|target) gains \+(\d+)/i.exec(s))) fx.push({ effect: `${label}; GRANTATK: ${match[2]}`, dur: 1, who: match[1] === "attacker" ? "a" : "v" }), (kept = true);
    if ((match = /attacker gains \+(\d+) to its next attack/i.exec(s))) fx.push({ effect: `${label}; ATK: ${match[1]}`, dur: 1, who: "a" }), (kept = true);
    if ((match = /must save vs\.? ([a-z]+) or fall prone/i.exec(s)) && SAVES[low(match[1])]) fx.push({ save: SAVES[low(match[1])], fail: { effect: "Prone" }, who }), (kept = true);
    else if (/\bfalls? prone\b/i.test(s) && !/must save/i.test(s)) fx.push({ effect: "Prone", dur: 0, who }), (kept = true);
    if (/loses? (its|the) next attack|spend the next action/i.test(s)) fx.push({ effect: `${label} (loses next attack)`, dur: 1, who }), (kept = true);
    if (/acts last next round/i.test(s)) fx.push({ effect: `${label} (acts last next round)`, dur: 1, who }), (kept = true);
    if (/cannot apply shield AC|half rate|cannot move|cannot use the weapon/i.test(s)) fx.push({ effect: label + (/shield/i.test(s) ? " (no shield AC)" : /half rate/i.test(s) ? " (half move)" : /cannot move/i.test(s) ? " (cannot move)" : " (weapon unusable)"), dur: next ? 1 : 0, who }), (kept = true);
  }
  if (!kept && words) fx.push({ note: words });
  else if (/save vs\.? crushing blow|chosen by the DM|squares away|ammunition|noise|notice|drops?|bleed|binding the wound|healed|when it next/i.test(words)) fx.push({ note: words });
  return fx;
}
