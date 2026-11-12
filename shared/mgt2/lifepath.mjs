// The Traveller lifepath: a character made the game's way, term by term, every
// roll the host's (dice it cannot be talked out of). A state machine: start()
// makes the state; answer(state, input, roll) takes the player's answer to the
// question in state.pending and runs on until the next question (or the end).
// roll(formula) is the host's dice: a total. Tables: careers.mjs.
//
// The procedure (Mongoose Traveller 2E's): characteristics (2D each, then
// arranged), background skills (3 + EDU DM, at 0), a university or a military
// academy (or neither), then careers: qualification (or the draft, or the
// Drifters), basic training, a skill roll a term on a table of the player's
// choosing, survival (or a mishap, and out), an event, a commission or
// advancement (with a rank's bonus skill and another skill roll), aging from
// the fourth term, leaving or staying; when a career ends, its benefit rolls
// (cash or benefits) are rolled. Prison when a roll says so.

import { AGING, BACKGROUND, BENEFIT_EFFECTS, CAREERS, DRAFT, EDUCATION, INJURY, LIFE_EVENTS } from "./careers.mjs";
import { STAT_NAMES, SKILLS, dm, skillKey, skillName } from "./rules.mjs";

export const STATS = ["str", "dex", "end", "int", "edu", "soc"];
const SHORT_TO = { STR: "str", DEX: "dex", END: "end", INT: "int", EDU: "edu", SOC: "soc" };
const PHYSICAL = ["str", "dex", "end"];
const MAX_TERMS = 12;
const clone = (value) => JSON.parse(JSON.stringify(value));
const rankBonusRolls = (rank) => (rank >= 5 ? 3 : rank >= 3 ? 2 : rank >= 1 ? 1 : 0);
const label = (stat) => stat.toUpperCase();

export function start(name = "Traveller", roll) {
  return run({
    name: String(name || "Traveller"),
    stats: null,
    skills: {},
    log: [],
    age: 18,
    terms: 0,
    careers: [],
    current: null,
    left: [],
    drafted: false,
    educated: false,
    academy: null,
    prison: false,
    dms: { advancement: 0, benefit: 0, qualification: 0 },
    cash: 0,
    cashRolls: 0,
    benefits: [],
    contacts: [],
    allies: [],
    rivals: [],
    enemies: [],
    notes: [],
    items: [],
    shares: 0,
    ships: [],
    tasks: [{ do: "characteristics" }],
    pending: null,
    done: false,
  }, undefined, roll);
}

// --- Skills ------------------------------------------------------------------------
function levelNow(state, key) {
  return state.skills[key] ?? null;
}
// Gain a skill: level undefined is +1 (a new skill at 1); a number sets it at least that.
function setSkill(state, key, level) {
  const now = levelNow(state, key);
  const next = level === undefined ? (now === null ? 1 : now + 1) : Math.max(now ?? -1, level);
  state.skills[key] = Math.min(6, next);
  return state.skills[key];
}
// A table entry: a characteristic ("STR +1"), a skill with its speciality, a skill
// to specialise (asked), or a choice of entries (asked).
function gainTasks(entry, level, why) {
  if (Array.isArray(entry)) return [{ do: "choose-gain", options: entry, level, why }];
  const stat = /^(STR|DEX|END|INT|EDU|SOC)\s*([+-]\d+)$/.exec(String(entry));
  if (stat) return [{ do: "stat", stat: SHORT_TO[stat[1]], by: Number(stat[2]), why }];
  const parsed = skillKey(entry);
  const specs = SKILLS[parsed.base]?.[2] ?? [];
  if (!SKILLS[parsed.base]) return [{ do: "note", text: `${entry} (${why})` }];
  if (!parsed.spec && specs.length && level !== 0) return [{ do: "choose-spec", base: parsed.base, level, why }];
  return [{ do: "skill", key: parsed.key, level, why }];
}
// The best DM of the skills named (or a characteristic's alone) for a check.
function checkDm(state, check) {
  if (check.stat) return { dm: dm(state.stats[check.stat]), what: label(check.stat) };
  let best = { dm: -99, what: "" };
  for (const name of check.skills ?? []) {
    const parsed = skillKey(name);
    const stat = SKILLS[parsed.base]?.[1] ?? "int";
    let level = levelNow(state, parsed.key);
    if (level === null && !parsed.spec) {
      const specs = Object.keys(state.skills).filter((key) => key === parsed.base || key.startsWith(`${parsed.base}-`));
      if (specs.length) level = Math.max(...specs.map((key) => state.skills[key]));
    }
    if (level === null && parsed.spec && levelNow(state, parsed.base) !== null) level = 0;
    const value = (level === null ? -3 : level) + dm(state.stats[stat]);
    if (value > best.dm) best = { dm: value, what: `${skillName(parsed.key)}${level === null ? " (untrained)" : ` ${level}`}` };
  }
  return best;
}

// --- Effects (events, mishaps, benefits) -------------------------------------------
function effectTasks(effects, why) {
  const out = [];
  for (const fx of effects ?? []) {
    if (fx.gain) out.push(...gainTasks(fx.gain.length === 1 ? fx.gain[0] : fx.gain, fx.level, why));
    if (fx.stat) out.push({ do: "stat", stat: fx.stat, by: fx.by, why });
    if (fx.dm) out.push({ do: "dm", key: fx.dm, by: fx.by });
    if (fx.benefit) out.push({ do: "benefit-extra", by: fx.benefit });
    if (fx.lose) out.push({ do: "benefit-lose" });
    for (const kind of ["contact", "ally", "rival", "enemy"]) if (fx[kind]) out.push({ do: "connection", kind, why });
    if (fx.injury) out.push({ do: "injury", kind: fx.injury });
    if (fx.life) out.push({ do: "life" });
    if (fx.check) out.push({ do: "check", check: fx.check, why });
    if (fx.choice) out.push({ do: "choice", options: fx.choice, why });
    if (fx.leave) out.push({ do: "leave" });
    if (fx.stay) out.push({ do: "stay" });
    if (fx.promote) out.push({ do: "promote", why });
    if (fx.prison) out.push({ do: "prison" });
    if (fx.credits) out.push({ do: "credits", amount: fx.credits });
    if (fx.mishap) out.push({ do: "mishap", stay: Boolean(fx.stay) });
    if (fx.table) out.push({ do: "skill-roll", table: fx.table });
    if (fx.note) out.push({ do: "note", text: fx.note });
    if (fx.item) out.push({ do: "item", kind: fx.item });
    if (fx.shares) out.push({ do: "shares", by: fx.shares });
    if (fx.ship) out.push({ do: "ship", design: fx.ship, note: fx.note });
  }
  return out;
}

// --- The machine -------------------------------------------------------------------
const ask = (state, pending) => {
  state.pending = pending;
  return false;
};
const say = (state, line) => state.log.push(line);
const careerOf = (state) => (state.current ? CAREERS[state.current.career] : null);

// Runs tasks until one needs an answer. input: the answer to the head task's question.
function run(state, input, roll) {
  let answer = input;
  for (let guard = 0; guard < 500 && state.tasks.length; guard++) {
    const task = state.tasks[0];
    const done = step(state, task, answer, roll);
    answer = undefined;
    if (done === false) return state;
    state.tasks.shift();
    if (Array.isArray(done)) state.tasks.unshift(...done);
  }
  if (!state.tasks.length && !state.done) state.tasks.push({ do: "next" });
  return state.tasks.length ? run(state, undefined, roll) : state;
}

const optionsOf = (options) => options.map((option) => (typeof option === "string" ? option : option.label));
function pick(state, input, options) {
  const want = input && typeof input === "object" ? input.choice : input;
  const chosen = typeof want === "number" ? options[want] : options.find((option) => (typeof option === "string" ? option : option.label) === want);
  return chosen ?? null;
}

// One task: true when done, an array of tasks to run next, or false (asked).
function step(state, task, input, roll) {
  const career = careerOf(state);
  switch (task.do) {
    case "characteristics": {
      if (!state.rolled) {
        state.rolled = STATS.map(() => roll("2d6"));
        say(state, `Characteristics rolled: ${state.rolled.join(", ")}.`);
      }
      if (input === undefined) return ask(state, { kind: "arrange", values: state.rolled, stats: STATS, text: "Put each roll on a characteristic (or keep them in order: STR, DEX, END, INT, EDU, SOC)." });
      const values = state.rolled.slice();
      let assigned;
      if (input?.keep) assigned = Object.fromEntries(STATS.map((stat, index) => [stat, values[index]]));
      else {
        assigned = {};
        const left = values.slice();
        for (const stat of STATS) {
          const value = Number(input?.assign?.[stat]);
          const at = left.indexOf(value);
          if (at < 0) return ask(state, { ...state.pending, error: "Use each roll once." });
          assigned[stat] = value;
          left.splice(at, 1);
        }
      }
      state.stats = assigned;
      say(state, `Characteristics: ${STATS.map((stat) => `${label(stat)} ${assigned[stat]}`).join(", ")}.`);
      return [{ do: "background" }, { do: "education" }, { do: "career-choice" }];
    }
    case "background": {
      const count = Math.max(0, 3 + dm(state.stats.edu));
      if (count === 0) return true;
      if (input === undefined) return ask(state, { kind: "pick", count, options: BACKGROUND, text: `Background skills from your homeworld: pick ${count} (3 + EDU DM), each at 0.` });
      const picks = [...new Set((input?.picks ?? []).filter((name) => BACKGROUND.includes(name)))];
      if (picks.length !== count) return ask(state, { ...state.pending, error: `Pick ${count}.` });
      for (const name of picks) setSkill(state, skillKey(name).base, 0);
      say(state, `Background skills: ${picks.map((name) => `${name} 0`).join(", ")}.`);
      return true;
    }
    case "education": {
      const options = ["University", EDUCATION.army.name, EDUCATION.marine.name, EDUCATION.navy.name, "Straight into a career"];
      if (input === undefined) return ask(state, { kind: "choose", options, text: "Before a career: a university, a military academy, or neither." });
      const chosen = pick(state, input, options);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      if (chosen === "Straight into a career") return true;
      const school = Object.values(EDUCATION).find((item) => item.name === chosen);
      const [stat, target] = school.entry;
      const entry = roll("2d6") + dm(state.stats[stat]);
      const admitted = entry >= target;
      say(state, `${school.name}: entry ${label(stat)} ${target}+, rolled ${entry}: ${admitted ? "admitted" : "not admitted"}.`);
      if (!admitted) return true;
      state.educated = true;
      state.terms += 1;
      state.age += 4;
      return [{ do: "school", school: chosen }];
    }
    case "school": {
      const school = Object.values(EDUCATION).find((item) => item.name === task.school);
      if (!school.career) {
        if (input === undefined) return ask(state, { kind: "pick", count: 2, options: school.skills, text: "University: pick two subjects. The first is your major (level 1 on graduation), the second your minor (level 0)." });
        const picks = [...new Set(input?.picks ?? [])].filter((name) => school.skills.includes(name));
        if (picks.length !== 2) return ask(state, { ...state.pending, error: "Pick two." });
        const [stat, target] = school.graduate;
        const total = roll("2d6") + dm(state.stats[stat]);
        const graduated = total >= target;
        const honours = total >= target + 4;
        say(state, `University: graduation ${label(stat)} ${target}+, rolled ${total}: ${graduated ? (honours ? "graduated with honours" : "graduated") : "did not graduate"}.`);
        const out = [{ do: "skill-named", entry: picks[0], level: graduated ? 1 : 0, why: "university" }, { do: "skill-named", entry: picks[1], level: 0, why: "university" }];
        if (graduated) out.push({ do: "stat", stat: "edu", by: honours ? 2 : 1, why: "university" }, { do: "dm", key: "qualification", by: honours ? 2 : 1 });
        return out;
      }
      const [stat, target] = school.graduate;
      const total = roll("2d6") + dm(state.stats[stat]);
      const graduated = total >= target;
      say(state, `${school.name}: graduation ${label(stat)} ${target}+, rolled ${total}: ${graduated ? `graduated: the ${school.career} will take you as an officer` : "did not graduate"}. Its Service skills at 0.`);
      const service = CAREERS[school.career].service;
      const out = service.flatMap((entry) => gainTasks(entry, 0, "academy").filter((item) => item.do !== "stat"));
      if (graduated) state.academy = school.career;
      return out;
    }
    case "career-choice": {
      if (state.prison) {
        state.prison = false;
        return [{ do: "enter", career: "Prisoner", auto: true }];
      }
      const allowed = Object.keys(CAREERS).filter((name) => name !== "Prisoner" && !state.left.includes(name));
      if (input === undefined)
        return ask(state, {
          kind: "career",
          careers: allowed.map((name) => ({ name, desc: CAREERS[name].desc, qualification: CAREERS[name].qualification ? `${label(CAREERS[name].qualification[0])} ${CAREERS[name].qualification[1]}+` : "automatic", assignments: Object.entries(CAREERS[name].assignments).map(([key, item]) => ({ key, name: item.name, desc: item.desc })) })),
          text: "Choose a career and an assignment.",
        });
      if (!allowed.includes(input?.career) || !CAREERS[input.career].assignments[input?.assignment]) return ask(state, { ...state.pending, error: "Choose a career and one of its assignments." });
      return [{ do: "qualify", career: input.career, assignment: input.assignment }];
    }
    case "qualify": {
      const plan = CAREERS[task.career];
      if (!plan.qualification || state.academy === task.career || state.dms.qualification >= 12) {
        if (state.dms.qualification >= 12) state.dms.qualification = 0;
        say(state, `${task.career}: qualified.`);
        return [{ do: "enter", career: task.career, assignment: task.assignment }];
      }
      const [stat, target] = plan.qualification;
      const previous = state.careers.filter((item) => item.career !== "Prisoner").length;
      const mod = dm(state.stats[stat]) - previous - (state.age >= 30 ? 2 : 0) + state.dms.qualification;
      state.dms.qualification = 0;
      const total = roll("2d6") + mod;
      const ok = total >= target;
      say(state, `${task.career} qualification: ${label(stat)} ${target}+${previous ? `, -${previous} for earlier careers` : ""}${state.age >= 30 ? ", -2 for age" : ""}: rolled ${total}. ${ok ? "Qualified." : "Not taken."}`);
      if (ok) return [{ do: "enter", career: task.career, assignment: task.assignment }];
      return [{ do: "not-qualified" }];
    }
    case "not-qualified": {
      const options = [...(state.drafted ? [] : ["Submit to the draft"]), "Become a Drifter", ...(state.careers.length ? ["Stop here"] : [])];
      if (input === undefined) return ask(state, { kind: "choose", options, text: "Not taken. The draft (1D: Navy, Army, Marines, Merchant Marine, Scouts, Law Enforcement), the Drifters, or stop." });
      const chosen = pick(state, input, options);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      if (chosen === "Stop here") return [{ do: "finish" }];
      if (chosen === "Become a Drifter") return [{ do: "assignment", career: "Drifter" }];
      state.drafted = true;
      const which = DRAFT[roll("1d6") - 1];
      say(state, `Drafted: ${which}.`);
      const forced = { Merchant: "merchantmarine", Agent: "law" }[which];
      return forced ? [{ do: "enter", career: which, assignment: forced }] : [{ do: "assignment", career: which }];
    }
    case "assignment": {
      const options = Object.entries(CAREERS[task.career].assignments).map(([key, item]) => ({ label: item.name, key }));
      if (input === undefined) return ask(state, { kind: "choose", options: optionsOf(options), text: `${task.career}: choose an assignment.` });
      const chosen = pick(state, input, options);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      return [{ do: "enter", career: task.career, assignment: chosen.key }];
    }
    case "enter": {
      const plan = CAREERS[task.career];
      const assignment = task.assignment ?? Object.keys(plan.assignments)[0];
      if (task.auto && !task.assignment) return [{ do: "assignment", career: task.career }];
      const first = !state.careers.length || state.careers.every((item) => item.career === "Prisoner");
      state.current = { career: task.career, assignment, term: 0, rank: 0, officer: false, lost: 0, extra: 0, leaving: false, mustStay: false, first };
      if (state.academy === task.career && plan.officerRanks) {
        state.current.officer = true;
        state.current.rank = 1;
        say(state, `Commissioned on entry from the academy: ${plan.officerRanks[0].title}.`);
        state.academy = null;
      }
      state.careers.push({ career: task.career, assignment, terms: 0, rank: state.current.rank, officer: state.current.officer });
      say(state, `Career: ${task.career} (${plan.assignments[assignment].name}).`);
      const out = [{ do: "term" }];
      if (state.current.officer && plan.officerRanks?.[0]?.bonus) out.unshift(...gainTasks(plan.officerRanks[0].bonus, 1, "rank"));
      return out;
    }
    case "term": {
      const now = state.current;
      now.term += 1;
      say(state, `— ${now.career}, term ${now.term} (age ${state.age}).`);
      const out = [];
      if (now.term === 1) out.push({ do: "basic" });
      out.push({ do: "skill-roll" }, { do: "survival" });
      return out;
    }
    case "basic": {
      if (state.current.first) {
        say(state, `Basic training: every Service skill at 0.`);
        return career.service.flatMap((entry) => gainTasks(entry, 0, "basic training"));
      }
      const options = career.service;
      if (input === undefined) return ask(state, { kind: "choose", options: options.map(String), text: "Basic training: one Service skill at 0." });
      const chosen = pick(state, input, options.map(String));
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      return gainTasks(chosen, 0, "basic training");
    }
    case "skill-roll": {
      const now = state.current;
      const plan = career;
      const tables = [
        ["Personal Development", plan.personal],
        ["Service Skills", plan.service],
        [`Specialist: ${plan.assignments[now.assignment].name}`, plan.assignments[now.assignment].specialist],
        ...(plan.advanced && state.stats.edu >= 8 ? [["Advanced Education (EDU 8+)", plan.advanced]] : []),
        ...(plan.officer && now.officer ? [["Officer", plan.officer]] : []),
      ];
      let chosen = null;
      if (task.table === "advanced") chosen = tables.find(([name]) => name.startsWith("Advanced")) ?? tables[2];
      else {
        if (input === undefined) return ask(state, { kind: "choose", options: tables.map(([name]) => name), tables: tables.map(([name, rows]) => ({ name, rows: rows.map(String) })), text: "Roll on a skill table: which one?" });
        const name = pick(state, input, tables.map(([table]) => table));
        chosen = name ? tables.find(([table]) => table === name) : null;
        if (!chosen) return ask(state, { ...state.pending, error: "Choose a table." });
      }
      const die = roll("1d6");
      const entry = chosen[1][die - 1];
      say(state, `${chosen[0]}: 1D = ${die}: ${Array.isArray(entry) ? entry.join(" or ") : entry}.`);
      return gainTasks(entry, undefined, chosen[0]);
    }
    case "survival": {
      const now = state.current;
      const [stat, target] = career.assignments[now.assignment].survival;
      const die = roll("2d6");
      const total = die + dm(state.stats[stat]);
      const ok = die === 12 || (die !== 2 && total >= target);
      say(state, `Survival: ${label(stat)} ${target}+, rolled ${total}: ${ok ? "survived" : "a mishap"}.`);
      if (ok) return [{ do: "event" }, { do: "advance" }, { do: "end-term" }];
      now.leaving = true;
      now.lost += 1;
      return [{ do: "mishap" }, { do: "end-term", mishap: true }];
    }
    case "event": {
      const total = roll("2d6");
      const row = career.events[total - 2];
      say(state, `Event (2D = ${total}): ${row.text}`);
      return effectTasks(row.effects, `${state.current.career} event`);
    }
    case "mishap": {
      const die = roll("1d6");
      const row = career.mishaps[die - 1];
      say(state, `Mishap (1D = ${die}): ${row.text}`);
      if (task.stay) state.current.mustStay = true;
      return effectTasks(row.effects, `${state.current.career} mishap`);
    }
    case "advance": {
      const now = state.current;
      if (now.leaving) return true;
      const plan = career;
      const canCommission = plan.commission && !now.officer;
      if (canCommission && input === undefined) return ask(state, { kind: "choose", options: ["Try for a commission", "Advancement"], text: `Try for a commission (${label(plan.commission[0])} ${plan.commission[1]}+${now.term > 1 ? ", -1 after the first term" : ""}) or for advancement?` });
      const commissioning = canCommission && pick(state, input, ["Try for a commission", "Advancement"]) === "Try for a commission";
      const [stat, target] = commissioning ? plan.commission : plan.assignments[now.assignment].advancement;
      const die = roll("2d6");
      const mod = dm(state.stats[stat]) + state.dms.advancement - (commissioning && now.term > 1 ? 1 : 0);
      state.dms.advancement = 0;
      const total = die + mod;
      const ok = total >= target;
      say(state, `${commissioning ? "Commission" : "Advancement"}: ${label(stat)} ${target}+, rolled ${total}: ${ok ? "yes" : "no"}.`);
      const out = [];
      if (ok) out.push({ do: commissioning ? "commission" : "rank-up" });
      if (!commissioning) {
        if (die === 12) {
          now.mustStay = true;
          say(state, "A natural 12: you must stay another term.");
        } else if (total <= now.term && !ok) {
          now.leaving = true;
          say(state, `${total} is no more than your ${now.term} term${now.term === 1 ? "" : "s"} here: you must leave.`);
        }
      }
      return out;
    }
    case "commission": {
      const now = state.current;
      now.officer = true;
      now.rank = 1;
      const row = career.officerRanks[0];
      say(state, `Commissioned: ${row.title}.`);
      return [...(row.bonus ? gainTasks(row.bonus, 1, "rank") : []), { do: "skill-roll" }];
    }
    case "rank-up": {
      const now = state.current;
      const list = now.officer ? career.officerRanks : career.ranks;
      if (now.rank + 1 >= list.length + (now.officer ? 1 : 0)) {
        say(state, "Already at the top: no higher rank.");
        return true;
      }
      now.rank += 1;
      const row = now.officer ? list[now.rank - 1] : list[now.rank];
      say(state, `Promoted to rank ${now.officer ? "O" : ""}${now.rank}${row?.title ? `: ${row.title}` : ""}.`);
      return [...(row?.bonus ? gainTasks(row.bonus, 1, "rank") : []), { do: "skill-roll" }];
    }
    case "promote": {
      const now = state.current;
      if (!now) return true;
      if (career.commission && !now.officer) return [{ do: "commission" }];
      return [{ do: "rank-up" }];
    }
    case "end-term": {
      const now = state.current;
      state.terms += 1;
      state.age += 4;
      const record = state.careers[state.careers.length - 1];
      Object.assign(record, { terms: now.term, rank: now.rank, officer: now.officer });
      const out = [];
      if (state.terms >= 4) out.push({ do: "aging" });
      if (state.prison) now.leaving = true;
      if (now.leaving && !now.mustStay) out.push({ do: "muster" });
      else if (now.mustStay || state.terms >= MAX_TERMS) out.push(now.mustStay && state.terms < MAX_TERMS ? { do: "term", forced: true } : { do: "muster" });
      else out.push({ do: "continue" });
      now.mustStay = false;
      return out;
    }
    case "continue": {
      if (input === undefined) return ask(state, { kind: "choose", options: ["Another term", "Leave the career"], text: `Age ${state.age}, ${state.terms} term${state.terms === 1 ? "" : "s"} in all. Another term in the ${state.current.career}?` });
      const chosen = pick(state, input, ["Another term", "Leave the career"]);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      return chosen === "Another term" ? [{ do: "term" }] : [{ do: "muster" }];
    }
    case "aging": {
      const die = roll("2d6") - state.terms;
      if (die >= 1) {
        say(state, `Aging: 2D - ${state.terms} = ${die}: no effect.`);
        return true;
      }
      const row = AGING.find(([value]) => value === Math.max(-6, die));
      say(state, `Aging: 2D - ${state.terms} = ${die}: ${row[1]}`);
      const out = row[2].physical.map((by, index) => ({ do: "lose-stat", options: PHYSICAL, by, why: "aging", distinct: index }));
      if (row[2].mental) out.push({ do: "lose-stat", options: ["int", "edu", "soc"], by: row[2].mental, why: "aging" });
      state.agingPicked = [];
      return out;
    }
    case "lose-stat": {
      // Aging takes from different characteristics (each once).
      const options = task.distinct !== undefined ? task.options.filter((stat) => !(state.agingPicked ?? []).includes(stat)) : task.options;
      const by = typeof task.by === "string" ? task.rolled ?? (task.rolled = roll(task.by)) : task.by;
      if (input === undefined) return ask(state, { kind: "choose", options: options.map(label), text: `${task.why === "aging" ? "Aging" : "An injury"}: which characteristic loses ${by}?` });
      const chosen = pick(state, input, options.map(label));
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      const stat = SHORT_TO[chosen];
      if (task.distinct !== undefined) state.agingPicked.push(stat);
      const out = [{ do: "stat", stat, by: -by, why: task.why }];
      if (task.others) for (const other of PHYSICAL.filter((item) => item !== stat)) out.push({ do: "stat", stat: other, by: -task.others, why: task.why });
      return out;
    }
    case "muster": {
      const now = state.current;
      if (!now) return true;
      const rolls = Math.max(0, now.term - now.lost + now.extra + rankBonusRolls(now.rank));
      state.left.push(now.career);
      const record = state.careers[state.careers.length - 1];
      Object.assign(record, { terms: now.term, rank: now.rank, officer: now.officer, title: rankTitle(now) });
      say(state, `Leaving the ${now.career}${record.title ? ` as ${record.title}` : ""}: ${rolls} benefit roll${rolls === 1 ? "" : "s"}.`);
      state.current = { ...now, musterLeft: rolls };
      return [{ do: "benefit" }];
    }
    case "benefit": {
      const now = state.current;
      if (now.musterLeft <= 0) {
        state.current = null;
        if (state.terms >= 5 && !state.retired && now.career !== "Prisoner") {
          state.retired = true;
          state.notes.push("a pension, after five terms or more");
        }
        return [{ do: "next" }];
      }
      const options = [...(state.cashRolls < 3 ? ["Cash"] : []), "Benefits"];
      if (input === undefined) return ask(state, { kind: "choose", options, text: `${now.musterLeft} benefit roll${now.musterLeft === 1 ? "" : "s"} left from the ${now.career}: Cash (at most three in all) or Benefits?`, tables: [{ name: "Cash", rows: CAREERS[now.career].cash.map((value) => `Cr${value}`) }, { name: "Benefits", rows: CAREERS[now.career].benefits.map(String) }] });
      const chosen = pick(state, input, options);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      const plan = CAREERS[now.career];
      const gambler = chosen === "Cash" && levelNow(state, "gambler") !== null && levelNow(state, "gambler") >= 1 ? 1 : 0;
      const die = roll("1d6");
      const total = Math.min(7, Math.max(1, die + state.dms.benefit + gambler + (chosen === "Benefits" && now.rank >= 5 ? 1 : 0)));
      state.dms.benefit = 0;
      now.musterLeft -= 1;
      if (chosen === "Cash") {
        state.cashRolls += 1;
        const amount = plan.cash[total - 1];
        state.cash += amount;
        say(state, `Cash (${total}): Cr${amount}.`);
        return [{ do: "benefit" }];
      }
      const name = plan.benefits[total - 1];
      state.benefits.push(name);
      say(state, `Benefit (${total}): ${name}.`);
      return [...effectTasks(BENEFIT_EFFECTS[name] ?? [{ note: name }], `${now.career} benefit`), { do: "benefit" }];
    }
    case "next": {
      if (state.prison) return [{ do: "career-choice" }];
      if (state.terms >= MAX_TERMS) return [{ do: "finish" }];
      if (input === undefined) return ask(state, { kind: "choose", options: ["Another career", "Finish"], text: `Age ${state.age}. Begin another career, or finish and muster out for good?` });
      const chosen = pick(state, input, ["Another career", "Finish"]);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      return chosen === "Finish" ? [{ do: "finish" }] : [{ do: "career-choice" }];
    }
    case "finish": {
      state.done = true;
      state.pending = null;
      state.tasks = [];
      say(state, `Finished at age ${state.age}, after ${state.terms} term${state.terms === 1 ? "" : "s"}.`);
      return false;
    }
    // --- Small steps --------------------------------------------------------------
    case "skill":
      say(state, `Skill: ${skillName(task.key)} ${setSkill(state, task.key, task.level)}${task.why ? ` (${task.why})` : ""}.`);
      return true;
    case "skill-named":
      return gainTasks(task.entry, task.level, task.why);
    case "choose-gain": {
      const options = task.options.map(String);
      if (input === undefined) return ask(state, { kind: "choose", options, text: `${task.why ? `${task.why}: ` : ""}choose one.` });
      const chosen = pick(state, input, options);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      return gainTasks(chosen, task.level, task.why);
    }
    case "choose-spec": {
      const specs = SKILLS[task.base][2];
      if (input === undefined) return ask(state, { kind: "choose", options: specs, text: `${SKILLS[task.base][0]}: which speciality?` });
      const chosen = pick(state, input, specs);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      return [{ do: "skill", key: skillKey(`${SKILLS[task.base][0]} (${chosen})`).key, level: task.level, why: task.why }];
    }
    case "stat": {
      const before = state.stats[task.stat];
      state.stats[task.stat] = Math.max(0, Math.min(15, before + task.by));
      say(state, `${STAT_NAMES[task.stat]} ${task.by >= 0 ? "+" : ""}${task.by}: ${state.stats[task.stat]}${task.why ? ` (${task.why})` : ""}.`);
      if (state.stats[task.stat] === 0 && PHYSICAL.includes(task.stat)) {
        state.stats[task.stat] = 1;
        state.notes.push(`${STAT_NAMES[task.stat]} fell to 0 and was saved by medical care (Cr${10000 * Math.max(1, Math.abs(task.by))})`);
        state.cash -= 10000 * Math.max(1, Math.abs(task.by));
      }
      return true;
    }
    case "dm":
      state.dms[task.key] = (state.dms[task.key] ?? 0) + task.by;
      return true;
    case "benefit-extra":
      if (state.current) state.current.extra += task.by;
      say(state, "An extra benefit roll.");
      return true;
    case "benefit-lose":
      if (state.current) state.current.lost += 1;
      say(state, "A benefit roll lost.");
      return true;
    case "connection": {
      const list = { contact: state.contacts, ally: state.allies, rival: state.rivals, enemy: state.enemies }[task.kind];
      list.push(task.why ?? "");
      say(state, `A new ${task.kind}${task.why ? ` (${task.why})` : ""}.`);
      return true;
    }
    case "injury": {
      if (typeof task.kind === "string" && task.kind !== "worse") return injuryTasks(task.kind);
      const first = roll("1d6");
      const die = task.kind === "worse" ? Math.min(first, roll("1d6")) : first;
      const row = INJURY[die - 1];
      say(state, `Injury (1D = ${die}): ${row.text}`);
      return effectTasks(row.effects, "injury");
    }
    case "life": {
      const total = roll("2d6");
      const row = LIFE_EVENTS[total];
      say(state, `Life event (2D = ${total}): ${row.text}`);
      return effectTasks(row.effects, "life event");
    }
    case "check": {
      const { dm: mod, what } = checkDm(state, task.check);
      const total = roll("2d6") + mod;
      const ok = total >= task.check.target;
      say(state, `Check: ${what} ${task.check.target}+, rolled ${total}: ${ok ? "success" : "failure"}.`);
      return effectTasks(ok ? task.check.pass : task.check.fail, task.why);
    }
    case "choice": {
      const options = task.options.map((option) => option.label);
      if (input === undefined) return ask(state, { kind: "choose", options, text: "Your choice:" });
      const chosen = pick(state, input, task.options);
      if (!chosen) return ask(state, { ...state.pending, error: "Choose one." });
      say(state, `Chose: ${chosen.label}.`);
      return effectTasks(chosen.effects, task.why);
    }
    case "leave":
      if (state.current) state.current.leaving = true;
      return true;
    case "stay":
      if (state.current) state.current.mustStay = true;
      return true;
    case "prison":
      state.prison = true;
      if (state.current) state.current.leaving = true;
      say(state, "Sent to prison: the next career is the Prisoner's.");
      return true;
    case "credits":
      state.cash += task.amount;
      say(state, `Cr${task.amount}.`);
      return true;
    case "note":
      state.notes.push(task.text);
      return true;
    case "item":
      state.items.push(task.kind);
      return true;
    case "shares":
      state.shares += task.by;
      return true;
    case "ship":
      state.ships.push(task.note ?? task.design);
      return true;
    default:
      return true;
  }
}

function rankTitle(now) {
  const plan = CAREERS[now.career];
  const row = now.officer ? plan.officerRanks?.[now.rank - 1] : plan.ranks?.[now.rank];
  return row?.title || "";
}

function injuryTasks(kind) {
  if (kind === "nearly-killed") return [{ do: "lose-stat", options: PHYSICAL, by: "1d6", others: 2, why: "injury" }];
  if (kind === "severe") return [{ do: "lose-stat", options: PHYSICAL, by: "1d6", why: "injury" }];
  if (kind === "limb") return [{ do: "lose-stat", options: ["str", "dex"], by: 2, why: "injury" }];
  if (kind === "scarred") return [{ do: "lose-stat", options: PHYSICAL, by: 2, why: "injury" }];
  if (kind === "hurt") return [{ do: "lose-stat", options: PHYSICAL, by: 1, why: "injury" }];
  return [];
}

// The player's answer to state.pending, and the machine runs on.
export function answer(input, stateIn, roll) {
  const state = clone(stateIn);
  if (state.done) throw new Error("This Traveller is finished.");
  state.pending = null;
  return run(state, input, roll);
}
// What the finished lifepath gives the character builder.
export function toSpec(state) {
  const careers = state.careers.filter((item) => item.terms > 0).map((item) => ({ name: item.career, terms: item.terms, rank: item.rank, title: item.title ?? "" }));
  const lines = [
    ...state.contacts.map((why) => `Contact${why ? ` (${why})` : ""}`),
    ...state.allies.map((why) => `Ally${why ? ` (${why})` : ""}`),
    ...state.rivals.map((why) => `Rival${why ? ` (${why})` : ""}`),
    ...state.enemies.map((why) => `Enemy${why ? ` (${why})` : ""}`),
  ];
  const notes = [
    `Careers: ${careers.map((item) => `${item.name} ${item.terms} term${item.terms === 1 ? "" : "s"}${item.title ? `, ${item.title}` : ""}`).join("; ") || "none"}.`,
    state.benefits.length ? `Benefits: ${state.benefits.join(", ")}.` : "",
    state.shares ? `Ship shares: ${state.shares}.` : "",
    state.ships.length ? `A ship: ${state.ships.join(", ")}.` : "",
    ...state.notes.map((note) => `${note[0].toUpperCase()}${note.slice(1)}.`),
    "",
    "The lifepath:",
    ...state.log,
  ].filter((line, index, all) => line !== "" || all[index + 1]);
  return {
    name: state.name,
    characteristics: { ...state.stats },
    careers,
    age: state.age,
    skills: Object.fromEntries(Object.entries(state.skills).map(([key, level]) => [key, level])),
    credits: Math.max(0, state.cash),
    contacts: lines.join("\n"),
    notes: notes.join("\n"),
    freeItems: state.items,
    lifepath: true,
  };
}
