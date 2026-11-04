// Critical hits and fumbles for Castles & Crusades: the Castle Keeper's
// Guide's optional rules for a natural 20 and a natural 1 (Chapter 17,
// Options 1, 4, 5 and 6), as the GM's Kraken Krits & Fumbles (built into
// SiegeCore as KrakenKrits) rolls and applies them. The CK picks the option.
//
// A row: [from, to, title, text, effects]. An effect part is one of
//   { effect, dur }  a tracker effect (on the victim; who: "a" the attacker)
//   { dmg, title }   a real damage roll on the victim (the attacker on a fumble)
//   { mark }         the attacker's next damage roll: "max", "min", "die"
//                    (one more die), "double" (dice and bonus), or a number
//                    (maximum times that)
//   { death }        instant death (the CK's call unless the option applies it)
//   { note }         told to the GM: what the tracker cannot keep

const table = (name, die, rows) => ({ name, die, rows });
const row = (from, to, title, text, fx = []) => [from, to, title, text, fx];
const one = (n, text, fx = []) => [n, n, text, text, fx];
const LOSE = { effect: "Kraken Loses next round", dur: 1 };

export const TABLES = {
  opt5_crit: table("CKG Table 17.1A - Critical Hits (Option 5)", 20, [
    one(1, "Knock opponent down", [ { effect: "Prone" } ]),
    one(2, "Head blow, teeth shatter, 1d4 damage, can't eat until healed",
      [ { dmg: "1d4", title: "teeth shatter" }, { effect: "Kraken Teeth shattered (cannot eat until healed)" } ]),
    one(3, "Ear cut off, 1 point of damage, -1 listen checks",
      [ { dmg: "1", title: "ear cut off" }, { effect: "Kraken Ear cut off; ABIL: -1 listen" } ]),
    one(4, "Chop off 1-4 fingers, 1 point of damage per finger, -1 dexterity",
      [ { dmg: "1d4", title: "fingers" }, { effect: "Kraken Fingers lost (-1 dexterity per finger)" } ]),
    one(5, "Crushing/stabbing blow, blade stuck in rib cage. Reduces AC by 2, 1d8 damage per round",
      [ { effect: "Kraken Blade in ribs; AC: -2; DMGO: 1d8" } ]),
    one(6, "Crush bone, render one limb of opponent useless, 1d8 damage",
      [ { dmg: "1d8", title: "crushed bone" }, { effect: "Kraken Limb useless" } ]),
    one(7, "Jaw destroyed, 1d8 damage, can't speak or eat",
      [ { dmg: "1d8", title: "jaw destroyed" }, { effect: "Kraken Jaw destroyed (cannot speak or eat)" } ]),
    one(8, "Elbow shattered by blow, arm crippled, 1d8 damage",
      [ { dmg: "1d8", title: "elbow shattered" }, { effect: "Kraken Arm crippled" } ]),
    one(9, "Knee shattered by blow, crippled, can't walk, 1d10 damage",
      [ { dmg: "1d10", title: "knee shattered" }, { effect: "Kraken Knee shattered (cannot walk)" }, { effect: "Prone" } ]),
    one(10, "Crushing blow to opponent's chest, collapsed lung, 1d10 damage, constitution cut in half",
      [ { dmg: "1d10", title: "collapsed lung" }, { effect: "Kraken Collapsed lung (constitution halved)" } ]),
    one(11, "Gut wound, spleen ruptures or is punctured, 1d12 damage", [ { dmg: "1d12", title: "gut wound" } ]),
    one(12, "Slice opponent in the face, blinded in both eyes", [ { effect: "Blinded" } ]),
    one(13, "Lung punctured; reduce constitution by 50% per round until 0 (monsters lose physical primes), then death",
      [ { effect: "Kraken Lung punctured (constitution halves each round, then death)" }, { note: "halve the victim's constitution each round until healed" } ]),
    one(14, "Head blow, force knocks eye out of socket, explodes globe, blind in that eye, 1d10 damage",
      [ { dmg: "1d10", title: "eye lost" }, { effect: "Kraken Blind in one eye" } ]),
    one(15, "Massive blow to chest, victim's chest collapses, can't breathe, death in 1d4 rounds unless healed",
      [ { effect: "Kraken Chest collapsed (death in 1d4 rounds unless healed)" }, { note: "roll 1d4: the victim dies after that many rounds unless healed" } ]),
    one(16, "Sever artery, if wound goes untreated 1d12 damage per round until healed",
      [ { effect: "Kraken Severed artery; DMGO: 1d12" } ]),
    one(17, "Chop off random limb, 1d12 points of bleed damage until wound staunched",
      [ { effect: "Kraken Limb severed; DMGO: 1d12" }, { note: "roll for the limb lost" } ]),
    one(18, "Crushing blow to the skull, opponent knocked unconscious, 1d12 points damage",
      [ { dmg: "1d12", title: "skull crushed" }, { effect: "Unconscious" } ]),
    one(19, "Eviscerated, instant death", [ { death: true } ]),
    one(20, "Chop off opponent's head, instant death", [ { death: true } ]),
  ]),

  opt5_fumble: table("CKG Table 17.1B - Critical Fumble (Option 5)", 20, [
    one(1, "Trip and fall upon the ground. Lose round of combat", [ { effect: "Prone" }, LOSE ]),
    one(2, "Drop weapon, lose round of combat", [ { note: "the weapon drops" }, LOSE ]),
    one(3, "Weapon breaks, lose round of combat", [ { note: "the weapon breaks" }, LOSE ]),
    one(4, "Blow ricochets off target hits wielder, 1d4 damage", [ { dmg: "1d4", title: "ricochet" } ]),
    one(5, "Slip on ground, on battlefield, hit ground, 1d4 damage", [ { dmg: "1d4", title: "slip" }, { effect: "Prone" } ]),
    one(6, "Strike companion next to wielder. Companion takes 1d6 damage", [ { note: "an adjacent companion takes 1d6 damage (roll it on them)" } ]),
    one(7, "Wild exertions cause attacker to bite own tongue off", [ { effect: "Kraken Tongue bitten off (cannot speak)" } ]),
    one(8, "Stab or crush foot, 1d6 damage", [ { dmg: "1d6", title: "own foot" } ]),
    one(9, "Stab or crush knee, 1d8 damage, initiative reduced by 2",
      [ { dmg: "1d8", title: "own knee" }, { effect: "Kraken Crushed knee; INIT: -2" } ]),
    one(10, "Strike eye, blind in that eye", [ { effect: "Kraken Blind in one eye" } ]),
    one(11, "Blow ricochets and smashes helm, helm driven into skull, temporarily blind", [ { effect: "Blinded", dur: 2 } ]),
    one(12, "Thrust/swing places arm in cusp of enemy grip and remains stuck on armor, scales, etc.",
      [ { effect: "Kraken Arm stuck on the foe (lose next attack)", dur: 1 } ]),
    one(13, "Weapon shatters, shards strike wielder for 1d4 damage", [ { dmg: "1d4", title: "shards" }, { note: "the weapon shatters" } ]),
    one(14, "Overshoot blow, wrist strike opponent and shatters, drop weapon",
      [ { effect: "Kraken Shattered wrist" }, { note: "the weapon drops" } ]),
    one(15, "Force of swing causes weight imbalance and knee blows out, crippled for 1 week",
      [ { effect: "Kraken Knee blown out (crippled 1 week)" } ]),
    one(16, "Weapon shatters, large chunk lacerates wielder's eye",
      [ { effect: "Kraken Lacerated eye" }, { note: "the weapon shatters" } ]),
    one(17, "Wild swing, gore, imbalance, wielder trips, and falls, breaking weapon punctures self, 1d12 damage",
      [ { dmg: "1d12", title: "fell on own weapon" }, { effect: "Prone" }, { note: "the weapon breaks" } ]),
    one(18, "Trip past opponent, fall and drop weapon, 1d8 damage from fall, broken jaw",
      [ { dmg: "1d8", title: "fall" }, { effect: "Prone" }, { effect: "Kraken Broken jaw" }, { note: "the weapon drops" } ]),
    one(19, "Weapon shatters; small piece punctures head/skull. Instant death", [ { death: true } ]),
    one(20, "Smash self in head or fall on blade, spear, etc. Instant death", [ { death: true } ]),
  ]),

  opt6_crit: table("CKG Table 17.1C - Critical Hit (Option 6)", 20, [
    row(1, 5, "No critical", "Normal damage."),
    row(6, 10, "Normal damage +1d4", "Add 1d4.", [ { dmg: "1d4", title: "+1d4" } ]),
    row(11, 14, "Max damage", "The damage roll is maximum.", [ { mark: "max" } ]),
    row(15, 17, "Max damage x2", "Twice the maximum damage.", [ { mark: 2 } ]),
    row(18, 19, "Max damage x3", "Three times the maximum damage.", [ { mark: 3 } ]),
    row(20, 20, "Max damage x4", "Four times the maximum damage.", [ { mark: 4 } ]),
  ]),

  opt6_fumble: table("CKG Table 17.1D - Critical Fumble (Option 6)", 20, [
    row(1, 1, "Damage self for 1-8 hp", "", [ { dmg: "1d8", title: "self" } ]),
    row(2, 3, "Damage self for 1-4 hp", "", [ { dmg: "1d4", title: "self" } ]),
    row(4, 6, "Break weapon", "", [ { note: "the weapon breaks" } ]),
    row(7, 10, "Minimum damage", "The next hit does minimum damage.", [ { mark: "min", who: "a" } ]),
    row(11, 15, "Lose next round's action", "", [ LOSE ]),
    row(16, 20, "No fumble", ""),
  ]),

  opt1_crit: table("CKG Option 1 - Critical Hit", 1, [
    row(1, 1, "Critical hit", "The weapon does maximum damage +1d4, +strength modifier.",
      [ { mark: "max" }, { dmg: "1d4", title: "+1d4" }, { note: "add the attacker's strength modifier" } ]),
  ]),
  opt4_crit: table("CKG Option 4 - Roadhouse Critical", 1, [
    row(1, 1, "Roadhouse critical", "Double the attack dice and double any bonus damage.", [ { mark: "double" } ]),
  ]),
  opt1_fumble: table("CKG Option 1 - Fumble", 1, [
    row(1, 1, "Fumble", "The character drops their weapon (a noosed weapon only loses its grip).", [ { note: "the weapon drops (noosed: only the grip is lost)" } ]),
  ]),
  opt1_fumble_ranged: table("CKG Option 1 - Fumble (missile)", 6, [
    row(1, 1, "Bow breaks", "The bow breaks (not the string).", [ { effect: "Kraken Bow broken" } ]),
    row(2, 6, "Bowstring breaks", "The bowstring breaks.", [ { effect: "Kraken Bowstring broken (restring)" } ]),
  ]),
};

// The CK's choices (FG's Options > Kraken Krits & Fumbles), with FG's defaults.
export const OPTIONS = {
  mode: { label: "Critical and fumble rules", values: ["opt5", "opt6", "opt1", "opt4"], labels: ["CKG Option 5: tables 17.1A and 17.1B", "CKG Option 6: tables 17.1C and 17.1D", "CKG Option 1: maximum damage +1d4; drop or break", "CKG Option 4: roadhouse (double dice and bonus)"], default: "opt5" },
  crit: { label: "Roll on the critical table", values: ["always", "half", "third", "off"], labels: ["Every time", "1 in 2", "1 in 3", "Off"], default: "always" },
  fumble: { label: "Roll on the fumble table", values: ["always", "half", "third", "off"], labels: ["Every time", "1 in 2", "1 in 3", "Off"], default: "always" },
  auto: { label: "Apply results", values: ["yes", "no"], labels: ["Automatically", "Chat only"], default: "yes" },
  npc: { label: "Tables for", values: ["yes", "no"], labels: ["PCs and NPCs", "PCs only"], default: "yes" },
  show: { label: "Results seen by", values: ["all", "gm"], labels: ["Everyone", "GM only"], default: "all" },
  death: { label: "Instant death results", values: ["gm", "apply"], labels: ["GM decides", "Apply"], default: "gm" },
};

export function cleanSettings(raw) {
  const out = {};
  for (const [key, spec] of Object.entries(OPTIONS)) out[key] = spec.values.includes(raw?.[key]) ? raw[key] : spec.default;
  return out;
}

// Which table an attack uses (KrakenKritsData.pickTable).
export function pickTable(kind, mode, ranged) {
  if (kind === "crit") return mode === "opt1" ? "opt1_crit" : mode === "opt4" ? "opt4_crit" : `${mode}_crit`;
  if (mode === "opt1" || mode === "opt4") return ranged ? "opt1_fumble_ranged" : "opt1_fumble";
  return `${mode}_fumble`;
}

export function findRow(tableRow, roll) {
  return tableRow.rows.find((entry) => roll >= entry[0] && roll <= entry[1]) ?? null;
}

// The marks a result leaves on the attacker, as tracker effect labels.
export const MARKS = { max: "Kraken Krit: maximum damage", die: "Kraken Krit: extra damage die", min: "Kraken Krit: minimum damage", double: "Kraken Krit: double dice and bonus", times: "Kraken Krit: damage x" };
export const markLabel = (mark) => (mark === "max" ? MARKS.max : mark === "die" ? MARKS.die : mark === "min" ? MARKS.min : mark === "double" ? MARKS.double : `${MARKS.times}${mark}`);
export const isMark = (label) => label === MARKS.max || label === MARKS.die || label === MARKS.min || label === MARKS.double || label.startsWith(MARKS.times);

// A damage formula changed by a mark (KrakenKrits.adjustDamageRoll): "1d8"
// with bonus 2 is "8+2" at maximum, "1d8+1d8+2" with an extra die, "2d8+4"
// doubled, "24+6" at maximum x3, "1+2" at minimum.
export function markedFormula(dice, bonus, label) {
  const parts = [];
  let flat = Number(bonus) || 0;
  for (const term of String(dice).replace(/\s+/g, "").matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g)) {
    if (term[3]) parts.push({ sign: term[1] === "-" ? -1 : 1, count: Number(term[2] || 1), sides: Number(term[3]) });
    else if (term[5]) flat += (term[4] === "-" ? -1 : 1) * Number(term[5]);
  }
  const join = (items, mod) => {
    const text = items.map((item, index) => (index === 0 || item.startsWith("-") ? item : `+${item}`)).join("") || "0";
    return mod ? `${text}${mod > 0 ? "+" : ""}${mod}` : text;
  };
  const dieText = (part, count = part.count) => `${part.sign < 0 ? "-" : ""}${count}d${part.sides}`;
  if (label === MARKS.max || label === MARKS.min || label.startsWith(MARKS.times)) {
    const times = label.startsWith(MARKS.times) ? Number(label.slice(MARKS.times.length)) || 2 : 1;
    // Only positive dice are set; negative dice and the bonus follow CoreRPG's roll.
    let total = 0;
    const left = [];
    for (const part of parts) {
      if (part.sign > 0) total += part.count * (label === MARKS.min ? 1 : part.sides * times);
      else left.push(dieText(part));
    }
    const mod = label.startsWith(MARKS.times) ? flat * times : flat;
    return { formula: join([String(total), ...left], mod), tag: label === MARKS.max ? "[KRAKEN KRIT: MAX]" : label === MARKS.min ? "[KRAKEN FUMBLE: MIN]" : `[KRAKEN KRIT: MAX x${times}]` };
  }
  if (label === MARKS.double) return { formula: join(parts.map((part) => dieText(part, part.sign > 0 ? part.count * 2 : part.count)), flat * 2), tag: "[KRAKEN KRIT: DOUBLE]" };
  if (label === MARKS.die && parts[0]) return { formula: join([...parts.map((part) => dieText(part)), `1d${parts[0].sides}`], flat), tag: `[KRAKEN KRIT: +1d${parts[0].sides}]` };
  return null;
}
