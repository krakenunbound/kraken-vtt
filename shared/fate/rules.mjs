// Fate Core and Fate Accelerated (Evil Hat Productions, CC BY 3.0): their
// mechanics as plain functions (no Node, no DOM), one engine for both games,
// used by the host (building, rolls, invokes, conflicts) and the sheet. The
// books' own words (skills, stunts, adversaries, the rules text) live in the
// books (games/fate), not here: this file holds only how the numbers work.
//
// - Four Fate dice (4dF: each -1, 0 or +1) plus a skill (Core) or an approach
//   (FAE), read on the ladder: Legendary +8 ... Terrible -2.
// - Against an opposition: fail (lower), tie (equal), succeed (higher by 1
//   or 2), succeed with style (higher by 3 or more); the difference is the
//   shifts. Four actions: overcome, create an advantage, attack, defend.
// - Aspects: a high concept, a trouble and three more, situation aspects,
//   boosts, consequences; invoked for +2 or a reroll (a fate point, or a free
//   invoke), compelled for a fate point.
// - A hit's shifts are absorbed by one stress box (a box of value n takes n)
//   and any number of free consequences (mild 2, moderate 4, severe 6,
//   extreme 8); what is left takes the character out. Conceding first gives
//   a fate point, and one for each consequence taken in the conflict.
// - Core: 18 skills in a pyramid (Great +4 once, Good +3 twice, Fair +2
//   three times, Average +1 four times), physical stress from Physique and
//   mental from Will (two boxes; Average or Fair adds a 3, Good or Great a 3
//   and a 4; Superb or better also an extra mild consequence). FAE: six
//   approaches (+3, +2, +2, +1, +1, +0) and one track of three boxes.
// - Refresh 3 with three stunts free; each stunt more costs a refresh (never
//   below 1). Milestones (minor, significant, major) instead of experience.
//
// A character's record data:
//   ruleset "fate", game "core" | "fae", aspects {highconcept, trouble, a1,
//   a2, a3}, phases {p1, p2, p3: {title, story, aspect, guest}} (Core),
//   skills {Fight: 3, ...} (Core) | approaches {careful: 2, ...} (FAE),
//   stunts {id: {name, text, skill}}, refreshbase (3), refresh (worked
//   out), fatepoints, stress {physical: {"1": 1, "2": 0}, mental: {...}} or
//   {stress: {...}} (FAE: the box values marked), tracks [{key, label,
//   boxes: [{value, marked}]}] (worked out), consequences {mild, moderate,
//   severe, extreme, mild2: {text, recovering}}, slots (worked out: the free
//   consequences), milestones {id: {kind, text}}, skillpoints, extremeused,
//   out ("" | "taken out" | "conceded"), lastroll, description, notes.

export const RULESET = "fate";
export const RULESETS = { core: "Fate Core", fae: "Fate Accelerated" };
export const gameOf = (ruleset) => (/accelerated|fae/i.test(String(ruleset ?? "")) ? "fae" : "core");

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.entries(value) : []);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// --- The ladder ------------------------------------------------------------------
export const LADDER = { 8: "Legendary", 7: "Epic", 6: "Fantastic", 5: "Superb", 4: "Great", 3: "Good", 2: "Fair", 1: "Average", 0: "Mediocre", "-1": "Poor", "-2": "Terrible" };
export const signed = (value) => {
  const n = Math.round(num(value));
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "+0";
};
// "Good", or beyond the ladder's ends "Legendary+1", "Terrible-1".
export function ladderName(value) {
  const n = Math.round(num(value));
  if (LADDER[n]) return LADDER[n];
  return n > 8 ? `Legendary+${n - 8}` : `Terrible−${-2 - n}`;
}
export const ladder = (value) => `${ladderName(value)} (${signed(value)})`;
// A rating from words: "Good", "Good (+3)", "+3", 3.
export function ratingOf(words) {
  if (typeof words === "number") return Math.round(words);
  const text = String(words ?? "").trim();
  const signedNumber = /([+−-]\s*\d+)/.exec(text);
  if (signedNumber) return Number(signedNumber[1].replace("−", "-").replace(/\s+/g, ""));
  if (/^\d+$/.test(text)) return Number(text);
  const found = Object.entries(LADDER).find(([, name]) => name.toLowerCase() === text.toLowerCase());
  return found ? Number(found[0]) : 0;
}

// --- Dice and outcomes -------------------------------------------------------------
// Fate dice faces from the host's results: -1 "−", 0 " " (blank), +1 "+".
export const face = (value) => (num(value) > 0 ? "+" : num(value) < 0 ? "−" : " ");
export const diceSum = (values) => values.reduce((sum, value) => sum + clamp(Math.round(num(value)), -1, 1), 0);
export const OUTCOMES = { fail: "Fail", tie: "Tie", succeed: "Succeed", style: "Succeed with Style" };
// The result against an opposition: shifts (the difference) and the outcome.
export function outcome(total, opposition = 0) {
  const shifts = Math.round(num(total)) - Math.round(num(opposition));
  return { shifts, outcome: shifts < 0 ? "fail" : shifts === 0 ? "tie" : shifts >= 3 ? "style" : "succeed" };
}
export const ACTIONS = { overcome: "Overcome", advantage: "Create an Advantage", attack: "Attack", defend: "Defend" };
// What an outcome gives, by action (Fate Core's Four Outcomes, in short).
export function resultWords(action, result) {
  const o = result.outcome;
  if (action === "overcome") return { fail: "you fail, or succeed at a serious cost", tie: "you succeed at a minor cost", succeed: "you get what you wanted", style: "you get what you wanted and a boost" }[o];
  if (action === "advantage") return { fail: "no aspect, or the opposition gets a free invoke", tie: "a boost instead", succeed: "the aspect with one free invoke", style: "the aspect with two free invokes" }[o];
  if (action === "attack") return { fail: "no harm done", tie: "no harm, but a boost", succeed: `a hit of ${result.shifts} shift${result.shifts === 1 ? "" : "s"}`, style: `a hit of ${result.shifts} shifts (or one less and a boost)` }[o];
  if (action === "defend") return { fail: "the attack lands", tie: "a tie: the attacker gets a boost", succeed: "you hold them off", style: "you hold them off and get a boost" }[o];
  return OUTCOMES[o];
}
// A free invoke's worth by outcome of create an advantage.
export const freeInvokes = (result) => (result.outcome === "style" ? 2 : result.outcome === "succeed" ? 1 : 0);

// --- Skills and approaches ----------------------------------------------------------
export const SKILLS = ["Athletics", "Burglary", "Contacts", "Crafts", "Deceive", "Drive", "Empathy", "Fight", "Investigate", "Lore", "Notice", "Physique", "Provoke", "Rapport", "Resources", "Shoot", "Stealth", "Will"];
export const APPROACHES = ["careful", "clever", "flashy", "forceful", "quick", "sneaky"];
export const APPROACH_NAMES = { careful: "Careful", clever: "Clever", flashy: "Flashy", forceful: "Forceful", quick: "Quick", sneaky: "Sneaky" };
// The skill pyramid (Great at the top) and FAE's approaches.
export const PYRAMID = { 4: 1, 3: 2, 2: 3, 1: 4 };
export const APPROACH_SPREAD = [3, 2, 2, 1, 1, 0];
// Which skills attack and defend (Core's default list).
export const ATTACK_SKILLS = { physical: ["Fight", "Shoot"], mental: ["Provoke"] };
export const DEFEND_SKILLS = { physical: ["Athletics", "Fight"], mental: ["Will"] };
const titleCase = (word) => String(word ?? "").replace(/^\w/, (c) => c.toUpperCase());
const approachKey = (word) => String(word ?? "").trim().toLowerCase().replace(/ly$/, "").replace(/^flashi$/, "flashy").replace(/^sneaki$/, "sneaky").replace(/^quick$/, "quick");

// A character's rating in a skill or an approach (FAE), by its name in any case.
export function ratingIn(data, name) {
  const game = data?.game === "fae" ? "fae" : "core";
  if (game === "fae") return num(data?.approaches?.[approachKey(name)], 0);
  const wanted = String(name ?? "").trim().toLowerCase();
  const found = rows(data?.skills).find(([key]) => key.toLowerCase() === wanted);
  return found ? num(found[1], 0) : 0;
}
// The ratings a character can roll: [{ name, rating }] best first.
export function ratingsOf(data) {
  if (data?.game === "fae") return APPROACHES.map((key) => ({ name: APPROACH_NAMES[key], key, rating: num(data?.approaches?.[key], 0) }));
  return rows(data?.skills)
    .map(([name, rating]) => ({ name, key: name, rating: num(rating, 0) }))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}
// The pyramid checked: problems in words (none when it fits).
export function pyramidProblems(skills, cap = 4) {
  const problems = [];
  const counts = {};
  for (const [name, value] of rows(skills)) {
    const rating = Math.round(num(value));
    if (rating <= 0) continue;
    if (rating > cap) problems.push(`${name} is above ${ladder(cap)}, the skill cap.`);
    counts[rating] = (counts[rating] ?? 0) + 1;
  }
  for (const [rating, wanted] of Object.entries(PYRAMID)) if ((counts[rating] ?? 0) !== wanted) problems.push(`${ladder(Number(rating))}: ${wanted} skill${wanted === 1 ? "" : "s"} (now ${counts[rating] ?? 0}).`);
  return problems;
}
export function approachProblems(approaches) {
  const values = APPROACHES.map((key) => Math.round(num(approaches?.[key], NaN)));
  if (values.some((value) => !Number.isFinite(value))) return ["Every approach needs a rating."];
  return [...values].sort((a, b) => b - a).join() === APPROACH_SPREAD.join() ? [] : [`The approaches are one Good (+3), two Fair (+2), two Average (+1) and one Mediocre (+0): now ${values.join(", ")}.`];
}

// --- Stress and consequences ---------------------------------------------------------------
// The tracks a character has: Core physical (Physique) and mental (Will), FAE one.
export function trackSizes(data) {
  if (data?.game === "fae") return { stress: 3 };
  const extra = (rating) => (rating >= 3 ? 4 : rating >= 1 ? 3 : 2);
  return { physical: extra(ratingIn(data, "Physique")), mental: extra(ratingIn(data, "Will")) };
}
export const TRACK_NAMES = { physical: "Physical", mental: "Mental", stress: "Stress" };
export const CONSEQUENCES = { mild: 2, moderate: 4, severe: 6, extreme: 8, mild2: 2, mild3: 2 };
export const CONSEQUENCE_NAMES = { mild: "Mild", moderate: "Moderate", severe: "Severe", extreme: "Extreme", mild2: "Mild (physical)", mild3: "Mild (mental)" };
// The consequence slots a character has: mild, moderate, severe (and Core's
// extra mild from a Superb Physique or Will); extreme once between major milestones.
export function consequenceSlots(data) {
  const keys = ["mild", "moderate", "severe"];
  if (data?.game !== "fae") {
    if (ratingIn(data, "Physique") >= 5) keys.push("mild2");
    if (ratingIn(data, "Will") >= 5) keys.push("mild3");
  }
  if (!num(data?.extremeused, 0) || data?.consequences?.extreme?.text) keys.push("extreme");
  return keys;
}
// Which track a kind of harm hits (FAE has only one).
export const trackFor = (data, kind = "physical") => (data?.game === "fae" ? "stress" : kind === "mental" ? "mental" : "physical");
// The ways to take a hit of `shifts` on a track: one free stress box (its
// value) and free consequences, fewest consequences first, then the
// lightest, then the smallest box. Each plan: { box (value or 0),
// consequences [keys], absorbs }. None: the character is taken out.
export function absorbOptions(shifts, { boxes = [], free = [] } = {}, { extreme = true } = {}) {
  const need = Math.max(0, Math.round(num(shifts)));
  if (need === 0) return [{ box: 0, consequences: [], absorbs: 0 }];
  const freeBoxes = [0, ...boxes.filter((box) => !box.marked).map((box) => box.value)];
  const slots = free.filter((key) => extreme || key !== "extreme");
  const plans = [];
  for (let mask = 0; mask < 1 << slots.length; mask += 1) {
    const chosen = slots.filter((_, index) => mask & (1 << index));
    const worth = chosen.reduce((sum, key) => sum + CONSEQUENCES[key], 0);
    for (const box of freeBoxes) {
      if (box + worth < need) continue;
      // Nothing wasted beyond need: no box when consequences alone cover it, no consequence a box alone covers.
      if (box > 0 && worth >= need) continue;
      if (chosen.some((key) => box + worth - CONSEQUENCES[key] >= need)) continue;
      plans.push({ box, consequences: chosen, absorbs: box + worth });
    }
  }
  const weight = (plan) => plan.consequences.reduce((sum, key) => sum + CONSEQUENCES[key], 0);
  plans.sort((a, b) => a.consequences.length - b.consequences.length || weight(a) - weight(b) || a.box - b.box);
  const seen = new Set();
  return plans.filter((plan) => {
    const key = `${plan.box}|${plan.consequences.join()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
// A plan in words: "the 2 box and a mild consequence".
export function planWords(plan) {
  const parts = [plan.box ? `the ${plan.box} stress box` : "", ...plan.consequences.map((key) => `a ${CONSEQUENCE_NAMES[key].toLowerCase()} consequence (${CONSEQUENCES[key]})`)].filter(Boolean);
  return parts.length ? parts.join(" and ") : "nothing";
}

// --- The character -------------------------------------------------------------------------
export const BASE_REFRESH = 3;
export const FREE_STUNTS = 3;
export function refreshOf(data) {
  const stunts = rows(data?.stunts).length;
  return Math.max(1, Math.round(num(data?.refreshbase, BASE_REFRESH)) - Math.max(0, stunts - FREE_STUNTS));
}
export const ASPECT_KEYS = ["highconcept", "trouble", "a1", "a2", "a3"];
export const ASPECT_NAMES = { highconcept: "High Concept", trouble: "Trouble", a1: "Aspect", a2: "Aspect", a3: "Aspect" };
// Every aspect a character can invoke: its own five and its consequences.
export function aspectsOf(data) {
  const out = ASPECT_KEYS.map((key) => ({ key, kind: ASPECT_NAMES[key], name: String(data?.aspects?.[key] ?? "").trim() })).filter((item) => item.name);
  for (const [key, row] of rows(data?.consequences)) if (String(row?.text ?? "").trim()) out.push({ key: `consequence.${key}`, kind: `${CONSEQUENCE_NAMES[key] ?? key} consequence`, name: String(row.text).trim() });
  return out;
}

export function derive(input) {
  const data = { ...input, ruleset: RULESET, game: input?.game === "fae" ? "fae" : "core", level: 0 };
  data.aspects = Object.fromEntries(ASPECT_KEYS.map((key) => [key, String(input?.aspects?.[key] ?? "").slice(0, 200)]));
  if (data.game === "fae") {
    data.approaches = Object.fromEntries(APPROACHES.map((key) => [key, clamp(Math.round(num(input?.approaches?.[key], 0)), -2, 8)]));
    delete data.skills;
  } else {
    data.skills = Object.fromEntries(rows(input?.skills).filter(([name]) => name).map(([name, value]) => [String(name).slice(0, 40), clamp(Math.round(num(value, 0)), -2, 8)]).filter(([, value]) => value !== 0));
    delete data.approaches;
  }
  // Stress: the tracks by the ratings, the marks kept by box value.
  const sizes = trackSizes(data);
  data.stress = Object.fromEntries(
    Object.entries(sizes).map(([key, size]) => [key, Object.fromEntries(Array.from({ length: size }, (_, index) => [String(index + 1), num(input?.stress?.[key]?.[String(index + 1)], 0) ? 1 : 0]))]),
  );
  data.tracks = Object.entries(sizes).map(([key, size]) => ({ key, label: TRACK_NAMES[key], boxes: Array.from({ length: size }, (_, index) => ({ value: index + 1, marked: Boolean(data.stress[key][String(index + 1)]) })) }));
  // Consequences: the slots this character has; text written in one fills it.
  const slots = consequenceSlots(data);
  data.consequences = Object.fromEntries(slots.map((key) => [key, { text: String(input?.consequences?.[key]?.text ?? "").slice(0, 200), recovering: num(input?.consequences?.[key]?.recovering, 0) ? 1 : 0 }]));
  data.slots = { free: slots.filter((key) => !data.consequences[key].text), all: slots };
  data.refreshbase = Math.max(1, Math.round(num(input?.refreshbase, BASE_REFRESH)));
  data.refresh = refreshOf(data);
  data.fatepoints = Math.max(0, Math.round(num(input?.fatepoints, data.refresh)));
  data.skillpoints = Math.max(0, Math.round(num(input?.skillpoints, 0)));
  data.extremeused = num(input?.extremeused, 0) ? 1 : 0;
  data.out = ["taken out", "conceded"].includes(input?.out) ? input.out : "";
  data.status = data.out ? (data.out === "conceded" ? "Conceded" : "Taken Out") : data.tracks.some((track) => track.boxes.some((box) => box.marked)) || slots.some((key) => data.consequences[key].text) ? "Harmed" : "";
  delete data.exp;
  delete data.expnext;
  return data;
}

// A hit absorbed on a character's data (in place): the box marked, the
// consequences written (names: {mild: "Broken Arm"}). Returns what it did.
export function applyPlan(data, plan, track, names = {}) {
  if (plan.box) data.stress = { ...(data.stress ?? {}), [track]: { ...(data.stress?.[track] ?? {}), [String(plan.box)]: 1 } };
  data.consequences = { ...(data.consequences ?? {}) };
  for (const key of plan.consequences) {
    data.consequences[key] = { text: String(names[key] ?? "").trim() || `${CONSEQUENCE_NAMES[key]} consequence`, recovering: 0 };
    if (key === "extreme") data.extremeused = 1;
  }
  return plan;
}
// The free boxes and consequences on a character's data (derived).
export const freeOf = (data, track) => ({ boxes: (data.tracks ?? []).find((item) => item.key === track)?.boxes ?? [], free: data.slots?.free ?? [] });

// Milestones (Fate Core's The Long Game, FAE's Getting Better): what each lets you do.
export const MILESTONES = {
  minor: "Switch two skills (or approaches), rename an aspect that is not the high concept, or trade a stunt for another.",
  significant: "As a minor milestone, and one skill point (Core: a skill one step higher, never past the cap or the pyramid; FAE: an approach +1, up to Superb); a severe consequence may start recovering.",
  major: "As a significant milestone, and one more refresh (a new stunt, or a fate point more each session); rename the high concept; clear an extreme consequence's slot.",
};
export function applyMilestone(data, kind) {
  if (kind === "significant" || kind === "major") data.skillpoints = num(data.skillpoints) + 1;
  if (kind === "major") {
    data.refreshbase = num(data.refreshbase, BASE_REFRESH) + 1;
    data.extremeused = 0;
  }
  return data;
}

// --- Rolls ---------------------------------------------------------------------------------------
// The total of a roll: the dice, the rating, the invokes (+2 each) and a bonus.
export const rollTotal = ({ dice = [], rating = 0, invokes = 0, bonus = 0 }) => diceSum(dice) + Math.round(num(rating)) + 2 * Math.round(num(invokes)) + Math.round(num(bonus));
// A conflict's turn order: Core physical Notice (then Athletics, then Physique),
// mental Empathy (then Rapport, then Will); FAE physical Quick, mental Careful.
export function initiativeOf(data, kind = "physical", game = data?.game) {
  const at = (name) => ratingIn({ ...data, game }, name);
  if (game === "fae") return kind === "mental" ? at("careful") * 100 + at("clever") * 10 : at("quick") * 100 + at("careful") * 10;
  return kind === "mental" ? at("Empathy") * 100 + at("Rapport") * 10 + at("Will") : at("Notice") * 100 + at("Athletics") * 10 + at("Physique");
}
// The best way to defend: Core Athletics or Fight (physical), Will (mental);
// FAE the best of Careful and Quick (physical), Careful and Clever (mental).
export function defenseOf(data, kind = "physical") {
  const options = data?.game === "fae" ? (kind === "mental" ? ["careful", "clever"] : ["careful", "quick", "forceful"]) : DEFEND_SKILLS[kind === "mental" ? "mental" : "physical"];
  return options.map((name) => ({ name: data?.game === "fae" ? APPROACH_NAMES[name] : name, rating: ratingIn(data, name) })).sort((a, b) => b.rating - a.rating)[0];
}
// The ways a character attacks: Core Fight, Shoot, Provoke (those it has, else Fight);
// FAE every approach (Forceful first).
export function attacksOf(data) {
  if (data?.game === "fae") return ["forceful", "flashy", "quick", "sneaky", "clever", "careful"].map((key) => ({ key, name: APPROACH_NAMES[key], rating: ratingIn(data, key), kind: "physical" }));
  const out = [];
  for (const [kind, skills] of Object.entries(ATTACK_SKILLS)) for (const skill of skills) if (ratingIn(data, skill) > 0) out.push({ key: skill, name: skill, rating: ratingIn(data, skill), kind });
  return out.length ? out : [{ key: "Fight", name: "Fight", rating: 0, kind: "physical" }];
}

// --- Non-player characters -----------------------------------------------------------------------
// An NPC record's numbers: kind (nameless, supporting, main), its aspects,
// skills or approaches, stunts, stress boxes by track, consequences.
//   data: { fatekind, game, aspectlist {id: {name}}, skilllist {id: {name,
//   rating}}, approaches, stuntlist {id: {name, text}}, stressphysical,
//   stressmental (box counts), stress (FAE), consequencelist "mild, moderate", mob }
export const NPC_KINDS = { nameless: "Nameless", supporting: "Supporting", main: "Main" };
// An NPC keeps its own way of rating: approaches (a FAE character), or
// skills by name (Core's list, or a FAE mook's "Skilled (+2) at: biting"); it
// plays in either game. Its stress follows the campaign's game: two tracks
// in Core, one in FAE.
export function npcStats(data, game = data?.game ?? "core") {
  const kind = NPC_KINDS[data?.fatekind] ? data.fatekind : "nameless";
  const skills = Object.fromEntries(rows(data?.skilllist).map(([, skill]) => [String(skill?.name ?? ""), num(skill?.rating, 0)]).filter(([name]) => name));
  const hasApproaches = APPROACHES.some((key) => num(data?.approaches?.[key], 0) !== 0);
  const asData = hasApproaches ? { game: "fae", approaches: Object.fromEntries(APPROACHES.map((key) => [key, num(data?.approaches?.[key], 0)])) } : { game: "core", skills };
  const asFae = game === "fae";
  const physical = Math.max(0, Math.round(num(data?.stressphysical ?? data?.stress, 0)));
  const mental = Math.max(0, Math.round(num(data?.stressmental ?? data?.stress, 0)));
  const tracks = asFae ? { stress: Math.max(physical, mental) } : { physical, mental };
  const consequences = String(data?.consequencelist ?? "")
    .split(/[,;]\s*/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => CONSEQUENCES[word]);
  // How it attacks: its fighting skills (Fight, Shoot, Provoke), its approaches, or else its best skills.
  const fighting = hasApproaches ? attacksOf(asData) : Object.keys(skills).some((name) => [...ATTACK_SKILLS.physical, ...ATTACK_SKILLS.mental].includes(name)) ? attacksOf(asData) : Object.entries(skills).sort((a, b) => b[1] - a[1]).map(([name, rating]) => ({ key: name, name, rating, kind: "physical" }));
  return {
    kind,
    game: asFae ? "fae" : "core",
    aspects: rows(data?.aspectlist).map(([, item]) => String(item?.name ?? "")).filter(Boolean),
    ratings: hasApproaches ? asData.approaches : skills,
    data: asData,
    stunts: rows(data?.stuntlist).map(([, item]) => ({ name: String(item?.name ?? ""), text: String(item?.text ?? "") })),
    tracks,
    consequences,
    mob: Math.max(1, Math.round(num(data?.mob, 1))),
    attacks: (fighting.length ? fighting : [{ key: "Fight", name: "Fight", rating: 0, kind: "physical" }]).slice(0, 6),
  };
}

// --- Building ------------------------------------------------------------------------------------
// The books' procedure, as the wizard sends it:
//   { game, name, aspects {highconcept, trouble, a1, a2, a3}, phases {p1, p2,
//   p3: {title, story, aspect, guest}} (Core: each phase's aspect is a1-a3),
//   skills {Fight: 4, ...} (Core: the pyramid), approaches {careful: 2, ...}
//   (FAE: +3 +2 +2 +1 +1 +0), stunts [{name, text, skill}] (three free, two
//   more at a refresh each), description, notes, portrait, token }; or
//   { pregen: data } (a book's pregenerated character, taken as it is).
export function buildFromSpec(spec, { game = spec?.game } = {}) {
  const problems = [];
  const which = game === "fae" ? "fae" : "core";
  if (spec?.pregen && typeof spec.pregen === "object") {
    const data = derive({ ...spec.pregen, game: spec.pregen.game ?? which, fatepoints: undefined });
    return { name: String(spec.name ?? spec.pregen.name ?? "").trim() || "Pregenerated character", data, problems };
  }
  const aspects = Object.fromEntries(ASPECT_KEYS.map((key) => [key, String(spec?.aspects?.[key] ?? "").trim().slice(0, 200)]));
  if (!aspects.highconcept) throw new Error("A character needs a high concept.");
  if (!aspects.trouble) throw new Error("A character needs a trouble.");
  const phases = which === "core" ? Object.fromEntries(["p1", "p2", "p3"].map((key, index) => {
    const phase = spec?.phases?.[key] ?? {};
    if (phase.aspect && !aspects[`a${index + 1}`]) aspects[`a${index + 1}`] = String(phase.aspect).trim().slice(0, 200);
    return [key, { title: String(phase.title ?? "").slice(0, 200), story: String(phase.story ?? "").slice(0, 2000), aspect: aspects[`a${index + 1}`] ?? "", guest: String(phase.guest ?? "").slice(0, 120) }];
  })) : undefined;
  for (const key of ["a1", "a2", "a3"]) if (!aspects[key]) problems.push(`${which === "core" ? `Phase ${key[1]}'s aspect` : "An aspect"} is left blank, to fill in play.`);
  let skills;
  let approaches;
  if (which === "core") {
    skills = {};
    for (const [name, value] of rows(spec?.skills)) {
      const rating = Math.round(num(value, 0));
      if (rating > 0) skills[String(name)] = rating;
    }
    const wrong = pyramidProblems(skills);
    if (wrong.length) throw new Error(`The skill pyramid: ${wrong.join(" ")}`);
  } else {
    approaches = Object.fromEntries(APPROACHES.map((key) => [key, Math.round(num(spec?.approaches?.[key], NaN))]));
    const wrong = approachProblems(approaches);
    if (wrong.length) throw new Error(wrong[0]);
  }
  const stuntList = (Array.isArray(spec?.stunts) ? spec.stunts : []).filter((stunt) => String(stunt?.name ?? "").trim());
  if (stuntList.length > FREE_STUNTS + 2) throw new Error("Five stunts at most: three free, two more at a refresh each.");
  const stunts = Object.fromEntries(stuntList.map((stunt, index) => [`id-${String(index + 1).padStart(5, "0")}`, { name: String(stunt.name).trim().slice(0, 120), text: String(stunt.text ?? "").slice(0, 2000), skill: String(stunt.skill ?? "").slice(0, 40) }]));
  if (stuntList.length < FREE_STUNTS) problems.push(`${FREE_STUNTS - stuntList.length} stunt${FREE_STUNTS - stuntList.length === 1 ? "" : "s"} left to choose in play (refresh stays 3).`);
  const data = derive({
    game: which,
    aspects,
    ...(phases ? { phases } : {}),
    ...(skills ? { skills } : {}),
    ...(approaches ? { approaches } : {}),
    stunts,
    refreshbase: BASE_REFRESH,
    stress: {},
    consequences: {},
    milestones: {},
    description: String(spec?.description ?? "").slice(0, 4000),
    notes: String(spec?.notes ?? "").slice(0, 8000),
  });
  data.fatepoints = data.refresh;
  return { name: String(spec?.name ?? "").trim() || aspects.highconcept, data, problems };
}
