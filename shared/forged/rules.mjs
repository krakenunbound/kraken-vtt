// Forged in the Dark: Kraken's rules engine for the Blades in the Dark SRD
// (One Seven Design, John Harper, CC BY 3.0; this code is Kraken's own). It
// is shared by the host (electron/forged.cjs) and the app (the sheet, the
// wizard, the Score panel): the twelve actions under three attributes, d6
// pools read by their highest die (two 6s a critical, zero dice two dice
// keeping the lowest), position and effect, stress and trauma, harm and its
// penalties, armor, the healing clock, xp tracks and advances, load, the
// crew's rep, tier, hold, heat and wanted level, entanglements, and the
// downtime activities. A character's data.ruleset is "forged".

export const RULESET = "Forged in the Dark";
export const KEY = "forged";

// --- Actions and attributes ----------------------------------------------------
export const ATTRIBUTES = ["insight", "prowess", "resolve"];
export const ACTIONS_BY_ATTRIBUTE = {
  insight: ["hunt", "study", "survey", "tinker"],
  prowess: ["finesse", "prowl", "skirmish", "wreck"],
  resolve: ["attune", "command", "consort", "sway"],
};
export const ACTIONS = ATTRIBUTES.flatMap((attribute) => ACTIONS_BY_ATTRIBUTE[attribute]);
export const ATTRIBUTE_OF = Object.fromEntries(ATTRIBUTES.flatMap((attribute) => ACTIONS_BY_ATTRIBUTE[attribute].map((action) => [action, attribute])));
export const titled = (word) => String(word ?? "").replace(/^./, (letter) => letter.toUpperCase());
// What each action is for (the SRD's one-line descriptions).
export const ACTION_WORDS = {
  attune: "open your mind to arcane power",
  command: "compel swift obedience",
  consort: "socialize with friends and contacts",
  finesse: "employ dextrous manipulation or subtle misdirection",
  hunt: "carefully track a target",
  prowl: "traverse skillfully and quietly",
  skirmish: "entangle a target in close combat",
  study: "scrutinize details and interpret evidence",
  survey: "observe the situation and anticipate outcomes",
  sway: "influence with guile, charm, or argument",
  tinker: "fiddle with devices and mechanisms",
  wreck: "unleash savage force",
};
export const RESIST_WORDS = {
  insight: "consequences from deception or understanding",
  prowess: "consequences from physical strain or injury",
  resolve: "consequences from mental strain or willpower",
};
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// An attribute's rating: how many of its actions have at least one dot.
export function attributeRating(actions, attribute) {
  return (ACTIONS_BY_ATTRIBUTE[attribute] ?? []).filter((action) => num(actions?.[action]) > 0).length;
}

// --- Dice ------------------------------------------------------------------------
// The pool's formula: n dice read by the highest; zero (or fewer) dice is two
// dice keeping the lowest, and can never be a critical.
export const poolFormula = (dice) => (dice > 0 ? `${Math.min(dice, 12)}d6kh1` : "2d6kl1");
// The outcome of rolled dice (all of them), for a pool of `dice`.
export function outcome(rolls, dice) {
  const list = (rolls ?? []).map((value) => num(value));
  const zero = dice <= 0;
  const highest = zero ? Math.min(...list) : Math.max(...list);
  const sixes = list.filter((value) => value === 6).length;
  const result = !zero && sixes >= 2 ? "critical" : highest === 6 ? "success" : highest >= 4 ? "partial" : "bad";
  return { highest, sixes, result, zero };
}
export const RESULT_WORDS = { critical: "CRITICAL", success: "SUCCESS", partial: "PARTIAL", bad: "BAD" };
// A result moved up or down a level (coin spent in downtime, a special ability's +1 result level).
const RESULT_ORDER = ["bad", "partial", "success", "critical"];
export const shiftResult = (result, by = 1) => RESULT_ORDER[clamp(RESULT_ORDER.indexOf(result) + by, 0, RESULT_ORDER.length - 1)];

// --- Position and effect ------------------------------------------------------------
export const POSITIONS = ["controlled", "risky", "desperate"];
export const EFFECTS = ["zero", "limited", "standard", "great", "extreme"];
// A progress clock's ticks for an effect level (the SRD: limited 1, standard 2,
// great 3; zero effect ticks nothing; extreme, beyond great, is Kraken's 4).
export const EFFECT_TICKS = { zero: 0, limited: 1, standard: 2, great: 3, extreme: 4 };
export const shiftEffect = (effect, by) => EFFECTS[clamp(EFFECTS.indexOf(EFFECTS.includes(effect) ? effect : "standard") + by, 0, EFFECTS.length - 1)];
// What happens, by position and result (the SRD's action roll summary).
export const OUTCOMES = {
  controlled: {
    critical: "You do it with increased effect.",
    success: "You do it.",
    partial: "You hesitate: withdraw and try a different approach, or do it with a minor consequence (a minor complication, reduced effect, lesser harm, or a risky position).",
    bad: "You falter: press on by seizing a risky opportunity, or withdraw and try a different approach.",
  },
  risky: {
    critical: "You do it with increased effect.",
    success: "You do it.",
    partial: "You do it, but there's a consequence: harm, a complication, reduced effect, or a desperate position.",
    bad: "Things go badly: harm, a complication, a desperate position, or this opportunity is lost.",
  },
  desperate: {
    critical: "You do it with increased effect.",
    success: "You do it.",
    partial: "You do it, but there's a consequence: severe harm, a serious complication, or reduced effect.",
    bad: "It's the worst outcome: severe harm, a serious complication, and this opportunity is lost.",
  },
};
// A clock's ticks from an action roll's result: a critical's effect is increased by one level; a 1-3 has no effect.
export function ticksFor(result, effect) {
  if (result === "bad") return 0;
  return EFFECT_TICKS[result === "critical" ? shiftEffect(effect, 1) : effect] ?? 0;
}

// An action roll's dice: the action's rating, +1d for assistance, +1d for
// pushing yourself or a Devil's Bargain (one or the other), plus any bonus
// dice (special abilities) and less any penalty (moderate harm: -1d).
export function actionPool({ rating = 0, assist = false, pushDice = false, bargain = false, bonus = 0, penalty = 0 } = {}) {
  if (pushDice && bargain) throw new Error("Push yourself or take the Devil's Bargain: one or the other, not both.");
  return num(rating) + (assist ? 1 : 0) + (pushDice || bargain ? 1 : 0) + num(bonus) - num(penalty);
}
// The stress an action roll costs its roller: 2 for each push (+1d, +1 effect, acting while incapacitated).
export const pushStress = ({ pushDice = false, pushEffect = false, pushIncapacitated = false } = {}) => 2 * ((pushDice ? 1 : 0) + (pushEffect ? 1 : 0) + (pushIncapacitated ? 1 : 0));
export const ASSIST_STRESS = 1;

// A resistance roll: 6 stress less the highest die; a critical clears 1 stress instead.
export function resistance(rolls, dice) {
  const read = outcome(rolls, dice);
  return { ...read, stress: read.result === "critical" ? -1 : 6 - read.highest };
}

// A fortune roll (an engagement, a faction's move, gathering information): its result's words.
export const FORTUNE_WORDS = { critical: "Exceptional result: great, extreme effect.", success: "Good result: standard, full effect.", partial: "Mixed result: limited, partial effect.", bad: "Bad result: poor, little effect." };
// The engagement roll: 1d for sheer luck, +1d for each major advantage, -1d for each disadvantage.
export const engagementPool = (advantages = 0, disadvantages = 0) => 1 + num(advantages) - num(disadvantages);
export const ENGAGEMENT = {
  critical: { position: "controlled", words: "Exceptional result: you've already overcome the first obstacle and you're in a controlled position for what's next." },
  success: { position: "controlled", words: "Good result: you're in a controlled position when the action starts." },
  partial: { position: "risky", words: "Mixed result: you're in a risky position when the action starts." },
  bad: { position: "desperate", words: "Bad result: you're in a desperate position when the action starts." },
};
export const PLANS = {
  assault: { name: "Assault", words: "Do violence to a target.", detail: "The point of attack" },
  deception: { name: "Deception", words: "Lure, trick, or manipulate.", detail: "The method of deception" },
  stealth: { name: "Stealth", words: "Trespass unseen.", detail: "The point of infiltration" },
  occult: { name: "Occult", words: "Engage a supernatural power.", detail: "The arcane method" },
  social: { name: "Social", words: "Negotiate, bargain, or persuade.", detail: "The social connection" },
  transport: { name: "Transport", words: "Carry cargo or people through danger.", detail: "The route and means" },
};
// A flashback's stress: 0 an ordinary action, 1 a complex one, 2 (or more) an elaborate one.
export const FLASHBACK = { 0: "An ordinary action for which you had easy opportunity.", 1: "A complex action or unlikely opportunity.", 2: "An elaborate action that involved special opportunities or contingencies." };

// --- Stress, trauma, harm -------------------------------------------------------------
export const STRESS_MAX = 9;
export const TRAUMA_MAX = 4;
export const TRAUMAS = {
  Cold: "You're not moved by emotional appeals or social bonds.",
  Haunted: "You're often lost in reverie, reliving past horrors, seeing things.",
  Obsessed: "You're enthralled by one thing: an activity, a person, an ideology.",
  Paranoid: "You imagine danger everywhere; you can't trust others.",
  Reckless: "You have little regard for your own safety or best interests.",
  Soft: "You lose your edge; you become sentimental, passive, gentle.",
  Unstable: "Your emotional state is volatile. You can instantly rage, or fall into despair, act impulsively, or freeze up.",
  Vicious: "You seek out opportunities to hurt people, even for no good reason.",
};
export const VICES = {
  Faith: "You're dedicated to an unseen power, forgotten god, ancestor, etc.",
  Gambling: "You crave games of chance, betting on sporting events, etc.",
  Luxury: "Expensive or ostentatious displays of opulence.",
  Obligation: "You're devoted to a family, a cause, an organization, a charity, etc.",
  Pleasure: "Gratification from lovers, food, drink, drugs, art, theater, etc.",
  Stupor: "You seek oblivion in the abuse of drugs, drinking to excess, getting beaten to a pulp in the fighting pits, etc.",
  Weird: "You experiment with strange essences, consort with rogue spirits, observe bizarre rituals or taboos, etc.",
};
export const OVERINDULGENCE = {
  "Attract Trouble": "Select or roll an additional entanglement.",
  Brag: "You brag about your exploits: the crew takes +2 heat.",
  Lost: "Your character vanishes for a few weeks: play a different character until this one returns (healed of any harm).",
  Tapped: "Your current purveyor cuts you off: find a new source for your vice.",
};
// Harm rows: two lesser (1), two moderate (2), one severe (3); level 4 is fatal.
export const HARM_SLOTS = { 1: 2, 2: 2, 3: 1 };
export const HARM_PENALTY = { 1: "Less effect", 2: "-1d", 3: "Need help", 4: "Fatal" };
export const HARM_WORDS = { 1: "Lesser", 2: "Moderate", 3: "Severe", 4: "Fatal" };
const emptyHarm = () => ({ 1: ["", ""], 2: ["", ""], 3: [""] });
export function cleanHarm(harm) {
  const out = emptyHarm();
  for (const level of [1, 2, 3]) for (let i = 0; i < HARM_SLOTS[level]; i += 1) out[level][i] = String(harm?.[level]?.[i] ?? "").slice(0, 120);
  return out;
}
// Marks harm at a level: a full row moves it up; past the top row it is fatal
// (a catastrophic, permanent consequence). Returns where it landed.
export function addHarm(data, level, text) {
  const harm = cleanHarm(data.harm);
  let at = clamp(Math.round(num(level, 1)), 1, 4);
  const words = String(text ?? "").trim().slice(0, 120) || HARM_WORDS[at];
  while (at <= 3) {
    const free = harm[at].findIndex((slot) => !slot);
    if (free >= 0) {
      harm[at][free] = words;
      break;
    }
    at += 1;
  }
  data.harm = harm;
  if (at >= 4) data.fatal = words;
  // New harm clears the healing clock's ticks.
  data.healing = 0;
  return { level: at, text: words, fatal: at >= 4 };
}
// The penalties that apply now, with Tough as nails (one level less severe; fatal stays fatal).
export function harmPenalties(data) {
  const harm = cleanHarm(data.harm);
  const tough = hasAbility(data, "Tough as nails") ? 1 : 0;
  const has = (level) => harm[level].some(Boolean);
  const worst = has(3) ? 3 : has(2) ? 2 : has(1) ? 1 : 0;
  const felt = Math.max(0, worst - tough);
  // Each row's penalty applies (if its harm applies to the situation): Kraken applies them all.
  const rows = [1, 2, 3].filter((level) => has(level)).map((level) => Math.max(0, level - tough)).filter(Boolean);
  return { worst, felt, lessEffect: rows.includes(1), minusDice: rows.includes(2) ? 1 : 0, needHelp: rows.includes(3) };
}
// The healing clock fills: every harm is reduced one level (level 1 goes away).
export function healOneLevel(data) {
  // Severe becomes moderate, moderate lesser; lesser harm goes away (each row has room for the one above).
  const harm = cleanHarm(data.harm);
  const fill = (list, size) => [...list.filter(Boolean), ...Array(size).fill("")].slice(0, size);
  data.harm = { 1: fill(harm[2], 2), 2: fill(harm[3], 2), 3: [""] };
  return data.harm;
}
// The healing clock's size: 4 segments (Vigorous: 3).
export const healingSize = (data) => (hasAbility(data, "Vigorous") ? 3 : 4);
// Segments from a downtime roll (recover, a long-term project): 1-3 one, 4/5 two, 6 three, critical five.
export const DOWNTIME_TICKS = { bad: 1, partial: 2, success: 3, critical: 5 };
// Ticks the healing clock; each time it fills, harm goes down a level and the rest rolls over.
export function tickHealing(data, ticks) {
  let filled = num(data.healing) + num(ticks);
  const size = healingSize(data);
  let healed = 0;
  while (filled >= size) {
    healOneLevel(data);
    filled -= size;
    healed += 1;
  }
  data.healing = filled;
  return { healed, healing: filled, size };
}

// Adds stress (or clears it, negative). Marking the last box is trauma: the
// character is taken out of action and comes back with zero stress; the
// fourth trauma retires them.
export function addStress(data, amount) {
  const max = stressMax(data);
  const before = num(data.stress);
  let stress = before + Math.round(num(amount));
  let trauma = false;
  if (stress >= max && amount > 0) {
    trauma = true;
    stress = 0;
    data.traumaPending = num(data.traumaPending) + 1;
  }
  data.stress = clamp(stress, 0, max);
  return { before, stress: data.stress, trauma, cleared: Math.max(0, before - data.stress) };
}
// A trauma condition marked (the one the player chose for a pending trauma).
export function markTrauma(data, condition) {
  const name = Object.keys(TRAUMAS).find((key) => key.toLowerCase() === String(condition ?? "").toLowerCase()) ?? String(condition ?? "").trim().slice(0, 40);
  if (!name) throw new Error(`Which trauma condition: ${Object.keys(TRAUMAS).join(", ")}?`);
  const list = Array.isArray(data.traumas) ? data.traumas : [];
  if (list.includes(name)) throw new Error(`${name} is marked already.`);
  data.traumas = [...list, name];
  data.traumaPending = Math.max(0, num(data.traumaPending) - 1);
  return { traumas: data.traumas, retired: data.traumas.length >= traumaMax(data) };
}

// --- Special abilities, items, load ----------------------------------------------------
export function hasAbility(data, name) {
  const list = Array.isArray(data?.abilities) ? data.abilities : Object.values(data?.abilities ?? {});
  return list.some((ability) => String(ability?.name ?? ability ?? "").toLowerCase() === String(name).toLowerCase());
}
// An ability that uses the special armor box: "expend your special armor".
export const usesSpecialArmor = (ability) => /special armor/i.test(String(ability?.text ?? ""));
export const LOADS = { light: 3, normal: 5, heavy: 6 };
// Mule: Light 5, Normal 7, Heavy 8.
export const loadLimits = (data) => (hasAbility(data, "Mule") ? { light: 5, normal: 7, heavy: 8 } : { ...LOADS });
export const itemLoad = (item) => (item?.free ? 0 : clamp(Math.round(num(item?.load, 1)), 0, 3));
// The load carried now: the items checked for this score (an item marked free counts nothing).
export function loadUsed(data) {
  return Object.values(data.inventorylist ?? {}).reduce((sum, item) => sum + (num(item?.carried) > 0 ? itemLoad(item) : 0), 0);
}
// The conspicuousness of a load: 1-3 light, 4/5 normal, 6 heavy, 7-9 encumbered.
export function loadWord(data) {
  const used = loadUsed(data);
  const limits = loadLimits(data);
  return used <= limits.light ? "Light" : used <= limits.normal ? "Normal" : used <= limits.heavy ? "Heavy" : "Encumbered";
}

// --- Experience ---------------------------------------------------------------------------
// The tracks: the playbook's 8 boxes, each attribute's 6.
export const XP_TRACKS = { playbook: 8, insight: 6, prowess: 6, resolve: 6 };
export const CREW_XP = 8;
// Marks xp on a track; a full track clears and gives an advance (a special
// ability from the playbook, an action dot under the attribute).
export function markXp(data, track, amount = 1) {
  if (!(track in XP_TRACKS)) throw new Error(`Which xp track: ${Object.keys(XP_TRACKS).join(", ")}?`);
  const xp = { playbook: 0, insight: 0, prowess: 0, resolve: 0, ...(data.xp ?? {}) };
  xp[track] = Math.max(0, num(xp[track]) + Math.round(num(amount, 1)));
  let advanced = 0;
  while (xp[track] >= XP_TRACKS[track]) {
    xp[track] = 0;
    advanced += 1;
    if (num(amount) > 0) break;
  }
  data.xp = xp;
  if (advanced) data.advances = { ...(data.advances ?? {}), [track]: num(data.advances?.[track]) + advanced };
  return { track, xp: xp[track], advanced };
}
// Action ratings: 2 at most at creation, 3 after (4 with the crew's Mastery).
export const actionCap = (mastery = false) => (mastery ? 4 : 3);

// --- Crew -------------------------------------------------------------------------------
export const REPUTATIONS = ["Ambitious", "Brutal", "Daring", "Honorable", "Professional", "Savvy", "Subtle", "Strange"];
export const STATUS_WORDS = { 3: "Allies", 2: "Friendly", 1: "Helpful", 0: "Neutral", "-1": "Interfering", "-2": "Hostile", "-3": "War" };
export const GANG_SCALE = { 0: "1 or 2 people", 1: "Small gangs (3-6 people)", 2: "Medium gangs (12 people)", 3: "Large gangs (20 people)", 4: "Huge gangs (40 people)", 5: "Massive gangs (80 people)" };
export const GANG_TYPES = { Adepts: "Scholars, tinkerers, occultists, and chemists.", Rooks: "Con artists, spies, and socialites.", Rovers: "Sailors, carriage drivers, and scavengers.", Skulks: "Scouts, infiltrators, and thieves.", Thugs: "Killers, brawlers, and roustabouts." };
export const EDGES = { Fearsome: "The cohort is terrifying in aspect and reputation.", Independent: "The cohort can be trusted to make good decisions and act on their own initiative in the absence of direct orders.", Loyal: "The cohort can't be bribed or turned against you.", Tenacious: "The cohort won't be deterred from a task." };
export const FLAWS = { Principled: "The cohort has an ethic or values that it won't betray.", Savage: "The cohort is excessively violent and cruel.", Unreliable: "The cohort isn't always available, due to other obligations, stupefaction from their vices, etc.", Wild: "The cohort is drunken, debauched, and loud-mouthed." };
export const COHORT_HARM = ["", "Weakened", "Impaired", "Broken", "Dead"];
export const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI"];
// A new crew: Tier 0, strong hold, 0 rep, 2 coin.
export function newCrew(spec = {}) {
  return {
    name: String(spec.name ?? "").trim().slice(0, 80) || "The Crew",
    type: String(spec.type ?? ""),
    reputation: String(spec.reputation ?? ""),
    lair: String(spec.lair ?? "").slice(0, 400),
    huntingGrounds: String(spec.huntingGrounds ?? "").slice(0, 400),
    huntingOp: String(spec.huntingOp ?? ""),
    tier: 0,
    hold: "strong",
    rep: 0,
    turf: 0,
    heat: 0,
    wanted: 0,
    coin: 2,
    xp: 0,
    abilities: [],
    upgrades: {},
    contacts: [],
    cohorts: [],
    claims: [],
    factions: {},
    advances: 0,
    notes: "",
  };
}
// The vault: 4 coin in the lair, 8 and 16 with the Vault upgrade's boxes.
export const vaultOf = (crew) => [4, 8, 16][clamp(num(crew?.upgrades?.Vault), 0, 2)];
export const repToFill = (crew) => 12 - clamp(num(crew?.turf), 0, 6);
// The rep a score earns: 2, +1 a Tier the target is above the crew, -1 a Tier below (0 at least); a quiet one none.
export const scoreRep = (crewTier, targetTier, quiet = false) => (quiet ? 0 : Math.max(0, 2 + (num(targetTier) - num(crewTier))));
// The heat a score earns: its exposure, +1 a high-profile target, +1 hostile turf, +1 at war, +2 killing.
export const HEAT_EXPOSURE = { 0: "Smooth & quiet; low exposure.", 2: "Contained; standard exposure.", 4: "Loud & chaotic; high exposure.", 6: "Wild; devastating exposure." };
export const scoreHeat = ({ exposure = 2, highProfile = false, hostileTurf = false, war = false, killing = false } = {}) => num(exposure, 2) + (highProfile ? 1 : 0) + (hostileTurf ? 1 : 0) + (war ? 1 : 0) + (killing ? 2 : 0);
// Heat marked: at 9 a wanted level (4 at most) and the excess rolls over.
export function addHeat(crew, amount) {
  let heat = num(crew.heat) + Math.round(num(amount));
  let wanted = num(crew.wanted);
  let raised = 0;
  while (heat >= 9) {
    heat -= 9;
    if (wanted < 4) {
      wanted += 1;
      raised += 1;
    }
  }
  crew.heat = Math.max(0, heat);
  crew.wanted = wanted;
  return { heat: crew.heat, wanted, raised };
}
// Tier and hold: a full rep tracker strengthens a weak hold, else pays for a new Tier (its number x 8 coin).
export function develop(crew) {
  if (num(crew.rep) < repToFill(crew)) throw new Error(`The rep tracker is not full: ${num(crew.rep)} of ${repToFill(crew)}.`);
  if (crew.hold === "weak") {
    crew.hold = "strong";
    crew.rep = 0;
    return { hold: "strong", tier: crew.tier, cost: 0 };
  }
  const next = num(crew.tier) + 1;
  const cost = Math.ceil(next * 8 * (crewHas(crew, "Patron") ? 0.5 : 1)) - (crew.claims ?? []).filter((claim) => /hardcase/i.test(String(claim))).length * 2;
  if (num(crew.coin) < cost) throw new Error(`Tier ${ROMAN[next]} costs ${cost} coin; the crew has ${num(crew.coin)}.`);
  crew.coin = num(crew.coin) - cost;
  crew.tier = next;
  crew.rep = 0;
  crew.hold = "weak";
  return { hold: "weak", tier: next, cost };
}
export const crewHas = (crew, name) => (crew?.abilities ?? []).some((ability) => String(ability?.name ?? ability).toLowerCase() === String(name).toLowerCase());
// The crew's upgrade boxes: an upgrade's cost in boxes (Mastery 4, Composed and Hardened 3, a cohort 2, else 1).
export function upgradeCost(name) {
  if (/^mastery$/i.test(name)) return 4;
  if (/^(composed|hardened)$/i.test(name)) return 3;
  if (/^cohort/i.test(name)) return 2;
  return 1;
}
// What the crew's upgrades give a character: +1 stress box (Composed), +1 trauma box (Hardened).
export const stressMax = (data) => STRESS_MAX + (num(data?.crewBonus?.stress) > 0 ? 1 : 0);
export const traumaMax = (data) => TRAUMA_MAX + (num(data?.crewBonus?.trauma) > 0 ? 1 : 0);

// --- Entanglements ---------------------------------------------------------------------------
// The table: the heat column, the result of wanted-level dice (0: two dice keeping the lowest).
export const ENTANGLEMENTS = {
  low: { bad: ["Gang Trouble", "The Usual Suspects"], partial: ["Rivals", "Unquiet Dead"], success: ["Cooperation"] },
  mid: { bad: ["Gang Trouble", "Questioning"], partial: ["Reprisals", "Unquiet Dead"], success: ["Show of Force"] },
  high: { bad: ["Flipped", "Interrogation"], partial: ["Demonic Notice", "Show of Force"], success: ["Arrest"] },
};
export const heatColumn = (heat) => (num(heat) <= 3 ? "low" : num(heat) <= 5 ? "mid" : "high");
export function entanglement(heat, result) {
  const column = ENTANGLEMENTS[heatColumn(heat)];
  return column[result === "critical" ? "success" : result] ?? column.bad;
}
export const ENTANGLEMENT_WORDS = {
  Arrest: "An Inspector presents a case file to a magistrate: a detail comes to arrest you (a gang at least equal in scale to your wanted level). Pay them off with coin equal to your wanted level +3, hand someone over for arrest (this clears your heat), or try to evade capture.",
  Cooperation: "A +3 status faction asks you for a favor. Agree to do it, or forfeit 1 rep per Tier of the friendly faction, or lose 1 status with them. Without a +3 faction status, you avoid entanglements right now.",
  "Demonic Notice": "A demon approaches the crew with a dark offer. Accept their bargain, hide until it loses interest (forfeit 3 rep), or deal with it another way.",
  Flipped: "One of your rivals arranges for one of your contacts, patrons, clients, or a group of your customers to switch allegiances due to the heat on you.",
  "Gang Trouble": "One of your gangs (or other cohorts) causes trouble due to their flaw(s). Lose face (forfeit rep equal to your Tier +1), make an example of one of the gang members, or face reprisals from the wronged party.",
  Interrogation: "The officers round up one of the PCs to question them about the crew's crimes. Pay them off with 3 coin, or they beat you up (level 2 harm) and you tell them what they want to know (+3 heat). You can resist each of those consequences separately.",
  Questioning: "The cops grab an NPC member of your crew or one of the crew's contacts to question them. Make a fortune roll to see how much they talk (1-3: +2 heat, 4/5: +1 heat), or pay the constables off with 2 coin.",
  Reprisals: "An enemy faction makes a move against you (or a friend, contact, or vice purveyor). Pay them (1 rep and 1 coin) per Tier of the enemy as an apology, allow them to mess with you or yours, or fight back.",
  Rivals: "A neutral faction throws their weight around. They threaten you, a friend, a contact, or one of your vice purveyors. Forfeit (1 rep or 1 coin) per Tier of the rival, or stand up to them and lose 1 status with them.",
  "Show of Force": "A faction with whom you have a negative status makes a play against your holdings. Give them 1 claim or go to war (drop to -3 status). If you have no claims, lose 1 hold instead.",
  "Unquiet Dead": "A rogue spirit is drawn to you, perhaps a past victim. Acquire the services of an occultist to destroy or banish it, or deal with it yourself.",
  "The Usual Suspects": "The cops grab someone in the periphery of your crew. Make a fortune roll to see if they resist questioning (1-3: +2 heat, 4/5: level 2 harm), or pay them off with 1 coin.",
};

// --- Downtime ------------------------------------------------------------------------------------
export const ACTIVITIES = {
  acquire: "Acquire Asset",
  project: "Long-Term Project",
  recover: "Recover",
  heat: "Reduce Heat",
  train: "Train",
  vice: "Indulge Vice",
};
// Two activities each downtime (one at war); more cost 1 coin or 1 rep each.
export const freeActivities = (atWar = false) => (atWar ? 1 : 2);
// Acquire an asset: the crew's Tier rolled; the asset's quality by the result.
export const assetQuality = (tier, result) => num(tier) + { bad: -1, partial: 0, success: 1, critical: 2 }[result];
// Reduce heat: 1-3 one, 4/5 two, 6 three, critical five.
export const HEAT_CLEARED = { bad: 1, partial: 2, success: 3, critical: 5 };
// The vice roll: the lowest attribute's dice; clear stress equal to the highest die; clearing more than marked is overindulging.
export const lowestAttribute = (data) => Math.min(...ATTRIBUTES.map((attribute) => attributeRating(data.actions, attribute)));
// Stash: 2 stash out for 1 coin; a lifestyle level for each full 10; retirement by the stash.
export const lifestyle = (stash) => clamp(Math.floor(num(stash) / 10), 0, 4);
export const retirement = (stash) => (num(stash) >= 40 ? "Fine: a well-appointed home or apartment, claiming a few luxuries." : num(stash) >= 21 ? "Modest: a simple home or apartment, with some small comforts." : num(stash) >= 11 ? "Meager: a tiny hovel that you can call your own." : "Poor soul: you end up in the gutter, awash in vice and misery.");
export const coinOf = (data) => Object.values(data?.coins ?? {}).filter((row) => /coin/i.test(String(row?.name ?? ""))).reduce((sum, row) => sum + num(row?.amount), 0);
export function setCoin(data, amount) {
  const coins = { ...(data.coins ?? {}) };
  const key = Object.keys(coins).find((id) => /coin/i.test(String(coins[id]?.name ?? ""))) ?? "id-00001";
  coins[key] = { name: "Coin", amount: Math.max(0, Math.round(num(amount))) };
  data.coins = coins;
  return coins[key].amount;
}

// --- A character's numbers, worked out again -----------------------------------------------------------
export function derive(input) {
  const data = { ...input, ruleset: KEY };
  const actions = Object.fromEntries(ACTIONS.map((action) => [action, clamp(Math.round(num(data.actions?.[action])), 0, 4)]));
  data.actions = actions;
  data.attributes = Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, attributeRating(actions, attribute)]));
  data.harm = cleanHarm(data.harm);
  data.stressmax = stressMax(data);
  data.stress = clamp(Math.round(num(data.stress)), 0, data.stressmax);
  data.traumamax = traumaMax(data);
  data.traumas = (Array.isArray(data.traumas) ? data.traumas : []).map(String).slice(0, data.traumamax);
  data.xp = { playbook: 0, insight: 0, prowess: 0, resolve: 0, ...(data.xp ?? {}) };
  data.healingsize = healingSize(data);
  data.healing = clamp(Math.round(num(data.healing)), 0, data.healingsize - 1);
  data.armor = { armor: 0, heavy: 0, special: 0, ...(data.armor ?? {}) };
  data.loadlimits = loadLimits(data);
  data.loadused = loadUsed(data);
  data.loadword = loadWord(data);
  data.stash = clamp(Math.round(num(data.stash)), 0, 40);
  data.lifestyle = lifestyle(data.stash);
  const penalties = harmPenalties(data);
  data.penalties = penalties;
  data.status = data.fatal ? "Dead" : data.traumas.length >= data.traumamax ? "Retired" : penalties.needHelp ? "Incapacitated" : "";
  // Kraken's sheets and party sheet read hp and ac: harm stands for health.
  const harmCount = [1, 2, 3].reduce((sum, level) => sum + data.harm[level].filter(Boolean).length, 0);
  data.hp = { total: 5, wounds: data.fatal ? 5 : harmCount };
  return data;
}

// --- Building a character --------------------------------------------------------------------
// The book's steps: a playbook (its three starting dots), a heritage and a
// background (each a detail), four more dots (none above 2), a special
// ability, a close friend and a rival, a vice and its purveyor, a name, an
// alias and a look. lib: { playbooks: [records], items: [records] }.
export function buildFromSpec(spec, lib) {
  const problems = [];
  const playbook = (lib.playbooks ?? []).find((record) => record.name.toLowerCase() === String(spec.playbook ?? "").toLowerCase());
  if (!playbook) throw new Error(`Which playbook: ${(lib.playbooks ?? []).map((record) => record.name).join(", ")}?`);
  const pb = playbook.data ?? {};
  const actions = Object.fromEntries(ACTIONS.map((action) => [action, num(pb.actions?.[action])]));
  const start = ACTIONS.reduce((sum, action) => sum + actions[action], 0);
  const dots = spec.dots && typeof spec.dots === "object" ? spec.dots : {};
  let added = 0;
  for (const [action, count] of Object.entries(dots)) {
    const key = String(action).toLowerCase();
    if (!ACTIONS.includes(key)) throw new Error(`No action ${action}: ${ACTIONS.join(", ")}.`);
    actions[key] += Math.max(0, Math.round(num(count)));
    added += Math.max(0, Math.round(num(count)));
  }
  if (added !== 4) throw new Error(`Assign four action dots (one for the heritage, one for the background, two anywhere): ${added} given.`);
  const over = ACTIONS.filter((action) => actions[action] > 2);
  if (over.length) throw new Error(`No action may begin above 2: ${over.map(titled).join(", ")}.`);
  const abilities = Object.values(pb.abilities ?? {});
  const wanted = String(spec.ability ?? "") || String(abilities[0]?.name ?? "");
  const ability = abilities.find((item) => String(item.name).toLowerCase() === wanted.toLowerCase());
  if (!ability) throw new Error(`${playbook.name} has no special ability ${wanted}: ${abilities.map((item) => item.name).join(", ")}.`);
  const friends = Object.values(pb.friends ?? {}).map((friend) => ({ name: String(friend.name ?? ""), text: String(friend.text ?? ""), bond: "" }));
  const mark = (who, bond) => {
    if (!who) return;
    const found = friends.find((friend) => friend.name.toLowerCase() === String(who).toLowerCase());
    if (!found) problems.push(`${who} is not on ${playbook.name}'s list.`);
    else found.bond = bond;
  };
  mark(spec.friend, "friend");
  mark(spec.rival, "rival");
  if (spec.friend && spec.rival && String(spec.friend).toLowerCase() === String(spec.rival).toLowerCase()) throw new Error("A close friend and a rival: two different people.");
  const vice = Object.keys(VICES).find((name) => name.toLowerCase() === String(spec.vice ?? "").toLowerCase());
  if (!vice) problems.push(`Pick a vice: ${Object.keys(VICES).join(", ")}.`);
  // The playbook's own items and the standard items, unchecked: load is chosen on the job.
  const inventorylist = {};
  let n = 0;
  const add = (item, source) => {
    const key = `id-${String(++n).padStart(5, "0")}`;
    inventorylist[key] = { name: String(item.name), load: itemLoad(item), ...(item.free ? { free: 1 } : {}), text: String(item.text ?? ""), source, carried: 0 };
  };
  for (const item of Object.values(pb.items ?? {})) add(item, playbook.name);
  for (const item of lib.items ?? []) add({ ...item.data, name: item.name }, "Standard");
  const data = derive({
    ruleset: KEY,
    playbook: playbook.name,
    alias: String(spec.alias ?? "").slice(0, 80),
    look: String(spec.look ?? "").slice(0, 400),
    heritage: String(spec.heritage ?? "").slice(0, 80),
    heritagedetail: String(spec.heritageDetail ?? "").slice(0, 400),
    background: String(spec.background ?? "").slice(0, 80),
    backgrounddetail: String(spec.backgroundDetail ?? "").slice(0, 400),
    vice: vice ?? "",
    vicedetail: String(spec.viceDetail ?? "").slice(0, 400),
    purveyor: String(spec.purveyor ?? "").slice(0, 200),
    xptrigger: String(pb.xptrigger ?? ""),
    actions,
    abilities: [{ name: String(ability.name), text: String(ability.text ?? "") }],
    friends,
    stress: 0,
    traumas: [],
    harm: {},
    healing: 0,
    xp: { playbook: 0, insight: 0, prowess: 0, resolve: 0 },
    coins: { "id-00001": { name: "Coin", amount: 0 } },
    stash: 0,
    inventorylist,
    projects: {},
    downtime: { used: 0, trained: {}, indulged: 0 },
    notes: String(spec.notes ?? "").slice(0, 8000),
  });
  if (start !== 3) problems.push(`${playbook.name} starts with ${start} dots, not 3.`);
  return { name: String(spec.name ?? "").trim().slice(0, 120) || "New scoundrel", data, problems };
}
