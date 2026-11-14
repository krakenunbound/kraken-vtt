const fate = require("./fate.cjs");

// Fate's conflicts on Kraken's combat tracker (electron/combat.cjs calls in
// here when the campaign plays Fate Core or Fate Accelerated):
// - turn order without dice: Core physical Notice (then Athletics, Physique),
//   mental Empathy (then Rapport, Will); FAE physical Quick, mental Careful;
// - an attack: the attacker's 4dF + skill (or approach) + invokes against the
//   target's 4dF + its best defence; the difference is the shifts. A tie
//   gives the attacker a boost; a defence by three or more, the defender;
// - a hit on a player's character waits for its player to absorb it (one
//   stress box and any free consequences, named) or to concede; an NPC
//   absorbs by itself (the lightest way), and is taken out when it cannot;
// - conceding (before being taken out) gives a fate point and one more for
//   each consequence taken in the conflict;
// - the taken out and the conceded lose their turns; the conflict's end
//   clears everyone's stress (consequences stay).
// An entry's own Fate state: entry.fate { stress {track: {box: 1}}, cons
// {key: text} (an NPC's), out, pending {shifts, track, by}, taken }.

function cleanState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (raw.stress && typeof raw.stress === "object") out.stress = Object.fromEntries(Object.entries(raw.stress).slice(0, 3).map(([track, boxes]) => [String(track).slice(0, 12), Object.fromEntries(Object.entries(boxes ?? {}).slice(0, 12).map(([box, on]) => [String(box).slice(0, 2), Number(on) ? 1 : 0]))]));
  if (raw.cons && typeof raw.cons === "object") out.cons = Object.fromEntries(Object.entries(raw.cons).slice(0, 8).map(([key, text]) => [String(key).slice(0, 12), String(text ?? "").slice(0, 200)]));
  out.out = ["taken out", "conceded"].includes(raw.out) ? raw.out : "";
  out.pending = raw.pending && typeof raw.pending === "object" && Number(raw.pending.shifts) > 0 ? { shifts: Math.round(Number(raw.pending.shifts)), track: String(raw.pending.track ?? "physical").slice(0, 12), by: String(raw.pending.by ?? "").slice(0, 60) } : null;
  out.taken = Math.max(0, Math.round(Number(raw.taken) || 0));
  return out;
}

function createFateCombat({ table, state, record, find, mustGM, targetsOf, changed, owner }) {
  let rules = null;
  const ready = fate.rulesFate().then((module) => {
    rules = module;
  });
  const game = () => fate.gameFor(table().ruleset?.());
  const kindNow = () => (fate.fateTable(table()).data.conflict === "mental" ? "mental" : "physical");
  const own = (entry) => (entry.fate ??= cleanState({}));
  const isPC = (entry) => record(entry)?.type === "character";
  // The numbers a creature plays by: a character's sheet, an NPC's record.
  function sheetOf(entry) {
    const linked = record(entry);
    if (linked?.type === "character") return rules.derive(linked.data ?? {});
    const stats = rules.npcStats(linked?.data ?? {}, game());
    const data = rules.derive({ ...stats.data, stress: own(entry).stress ?? {} });
    // An NPC's tracks and consequences are its record's, not a player's.
    const tracks = Object.entries(stats.tracks).map(([key, size]) => ({ key, label: rules.TRACK_NAMES[key], boxes: Array.from({ length: size }, (_, index) => ({ value: index + 1, marked: Boolean(own(entry).stress?.[key]?.[String(index + 1)]) })) }));
    const cons = own(entry).cons ?? {};
    return { ...data, tracks, consequences: Object.fromEntries(stats.consequences.map((key) => [key, { text: cons[key] ?? "" }])), slots: { all: stats.consequences, free: stats.consequences.filter((key) => !cons[key]) }, npc: stats };
  }
  const outOf = (entry) => (isPC(entry) ? String(record(entry)?.data?.out ?? "") || own(entry).out : own(entry).out);
  function health(entry) {
    if (!rules) return { status: "Fresh", percent: 0, color: "#00C000" };
    const out = outOf(entry);
    if (out === "taken out") return { status: "Taken Out", percent: 100, color: "#404040" };
    if (out === "conceded") return { status: "Conceded", percent: 100, color: "#6C2DC7" };
    if (own(entry).pending) return { status: "Hit", percent: 60, color: "#E06000" };
    const sheet = sheetOf(entry);
    const boxes = sheet.tracks.flatMap((track) => track.boxes);
    const marked = boxes.filter((box) => box.marked).length;
    const cons = sheet.slots.all.filter((key) => sheet.consequences[key]?.text).length;
    if (cons) return { status: "Consequences", percent: Math.min(95, 40 + cons * 20), color: "#C08000" };
    if (marked) return { status: "Stressed", percent: Math.round((marked / Math.max(1, boxes.length)) * 50), color: "#C0C000" };
    return { status: "Fresh", percent: 0, color: "#00C000" };
  }
  const skips = (entry) => ["Taken Out", "Conceded"].includes(health(entry).status);

  // Turn order: no dice, the skill (or approach) the book names.
  async function initiative(pick, seat) {
    await ready;
    const kind = kindNow();
    const lines = [];
    for (const entry of pick) {
      const sheet = sheetOf(entry);
      // Each by its own ratings: a character of approaches by Quick (Careful), of skills by Notice (Empathy).
      entry.initresult = rules.initiativeOf(sheet, kind, sheet.game);
      const first = sheet.game === "fae" ? (kind === "mental" ? "Careful" : "Quick") : kind === "mental" ? "Empathy" : "Notice";
      lines.push(`${entry.name} ${first} ${rules.signed(rules.ratingIn(sheet, first))}`);
    }
    table().say(`[INIT] ${kind === "mental" ? "A mental" : "A physical"} conflict, in order of ${game() === "fae" ? (kind === "mental" ? "Careful" : "Quick") : kind === "mental" ? "Empathy (then Rapport, Will)" : "Notice (then Athletics, Physique)"}: ${lines.join(", ")}.`, seat.role === "dm" ? "Combat" : seat.name);
    changed();
  }

  // What a creature attacks with: a skill (Core) or an approach (FAE).
  function weapon(who, key, seat) {
    if (who.recordId) {
      const linked = table().records.get(who.recordId);
      if (!linked || linked.type !== "character") throw new Error("No such character.");
      if (seat.role !== "dm" && linked.owner !== seat.name) throw new Error("That is not your character.");
      const data = rules.derive(linked.data);
      const attack = rules.attacksOf(data).find((item) => item.key.toLowerCase() === String(key ?? "").toLowerCase()) ?? { key: String(key), name: String(key), rating: rules.ratingIn(data, key), kind: kindNow() };
      return { actor: linked.name, name: attack.name, rating: rules.ratingIn(data, attack.key), kind: attack.kind ?? kindNow(), entry: state.entries.find((entry) => entry.recordId === linked.id) ?? null, record: linked, gm: false };
    }
    mustGM(seat);
    const entry = find(who.entryId);
    const sheet = sheetOf(entry);
    const attacks = sheet.npc?.attacks ?? rules.attacksOf(sheet);
    const attack = attacks.find((item) => item.key.toLowerCase() === String(key ?? "").toLowerCase()) ?? attacks[Number(key)] ?? attacks[0];
    return { actor: entry.name, name: attack.name, rating: rules.ratingIn(sheet, attack.key), kind: attack.kind ?? kindNow(), entry, gm: true };
  }

  // An attack: 4dF + the skill against the first target's 4dF + its defence.
  // opts.invokes: [{aspect, free}] paid first (+2 each; the GM's pool for an NPC).
  async function attack(plan, from, opts = {}) {
    await ready;
    const source = plan.entry;
    if (source && skips(source)) throw new Error(`${source.name} is ${health(source).status.toLowerCase()} and out of the conflict.`);
    const target = targetsOf(source)[0];
    const paid = await fate.payInvokes(table(), plan.record ?? null, opts.invokes, { gm: plan.gm });
    const attackRoll = fate.fourDF(table(), plan.rating + 2 * paid.count);
    const words = `${plan.name} ${rules.signed(plan.rating)}${paid.count ? ` +${paid.count * 2} invoked` : ""}`;
    if (!target) {
      table().postRoll(attackRoll.rolled, `[ATTACK] ${plan.actor}: ${words}`, from, false, { by: plan.actor, result: "NO TARGET", ladder: rules.ladder(attackRoll.total) });
      return [{ total: attackRoll.total, target: null }];
    }
    if (skips(target)) throw new Error(`${target.name} is already ${health(target).status.toLowerCase()}.`);
    const kind = plan.kind === "mental" ? "mental" : "physical";
    const defender = sheetOf(target);
    const defence = rules.defenseOf(defender, kind) ?? { name: "Mediocre", rating: 0 };
    const defendRoll = fate.fourDF(table(), defence.rating);
    const result = rules.outcome(attackRoll.total, defendRoll.total);
    table().postRoll(attackRoll.rolled, `[ATTACK] ${plan.actor}: ${words} -> [at ${target.name}] [${fate.RESULT[result.outcome]} ${rules.signed(result.shifts)}]`, from, Boolean(target.hidden), { by: plan.actor, target: target.name, result: result.shifts > 0 ? "HIT" : "MISS", ladder: rules.ladder(attackRoll.total) });
    table().postRoll(defendRoll.rolled, `[DEFEND] ${target.name}: ${defence.name} ${rules.signed(defence.rating)}`, target.name, Boolean(target.hidden), { by: target.name, ladder: rules.ladder(defendRoll.total) });
    if (paid.words.length) table().say(`[INVOKE] ${plan.actor} invokes ${paid.words.map((word) => `"${word}"`).join(", ")} (+2 each).`, from);
    const out = { target: target.name, attack: attackRoll.total, defend: defendRoll.total, shifts: result.shifts, outcome: result.outcome };
    if (result.shifts > 0) {
      table().say(`[HIT] ${plan.actor} hits ${target.name}: ${rules.ladder(attackRoll.total)} against ${rules.ladder(defendRoll.total)}, ${result.shifts} shift${result.shifts === 1 ? "" : "s"}${result.outcome === "style" ? " (with style: one less for a boost, if the attacker likes)" : ""}.`, "Combat", Boolean(target.hidden));
      Object.assign(out, await hit(target, result.shifts, kind, plan.actor));
    } else if (result.shifts === 0) {
      table().say(`[TIE] ${target.name} holds, but ${plan.actor} gets a boost.`, "Combat", Boolean(target.hidden));
      fate.addAspect(table(), { name: `${plan.actor}'s opening on ${target.name}`, invokes: 1, kind: "boost", by: plan.actor }, "Combat");
    } else {
      table().say(`[DEFEND] ${target.name} holds ${plan.actor} off${result.shifts <= -3 ? ", with style: a boost" : ""}.`, "Combat", Boolean(target.hidden));
      if (result.shifts <= -3) fate.addAspect(table(), { name: `${target.name}'s counter`, invokes: 1, kind: "boost", by: target.name }, "Combat");
    }
    if (source && table().options?.().clearTargets === "action") source.targets = [];
    changed();
    return [out];
  }

  // A hit of shifts on a creature: a player's character waits for its
  // player's choice; an NPC takes it the lightest way, or is taken out.
  async function hit(entry, shifts, kind = "physical", by = "") {
    await ready;
    const sheet = sheetOf(entry);
    // The track it has: FAE's one (an NPC's too, in a FAE game), else physical or mental.
    const track = sheet.tracks.some((item) => item.key === "stress") ? "stress" : kind === "mental" ? "mental" : "physical";
    if (isPC(entry)) {
      const pending = own(entry).pending;
      own(entry).pending = { shifts: (pending?.track === track ? pending.shifts : 0) + shifts, track, by };
      const options = rules.absorbOptions(own(entry).pending.shifts, rules.freeOf(sheet, track));
      table().say(`[HIT] ${entry.name} takes ${own(entry).pending.shifts} ${rules.TRACK_NAMES[track].toLowerCase()} shift${own(entry).pending.shifts === 1 ? "" : "s"}: ${options.length ? `absorb them (${rules.planWords(options[0])}, or another way) or concede` : "nothing left to absorb them: taken out, unless they concede"}.`, "Combat", Boolean(entry.hidden));
      changed();
      return { pending: own(entry).pending.shifts, options: options.length };
    }
    const options = rules.absorbOptions(shifts, rules.freeOf(sheet, track));
    if (!options.length) {
      own(entry).out = "taken out";
      table().say(`[TAKEN OUT] ${entry.name} is taken out (${shifts} shift${shifts === 1 ? "" : "s"}, more than it can take): the attacker says how.`, "Combat", Boolean(entry.hidden));
      changed();
      return { takenOut: true };
    }
    const plan = options[0];
    applyToEntry(entry, plan, track, {});
    table().say(`[STRESS] ${entry.name} takes ${shifts}: ${rules.planWords(plan)}.`, "Combat", Boolean(entry.hidden));
    changed();
    return { absorbed: rules.planWords(plan) };
  }
  function applyToEntry(entry, plan, track, names) {
    const linked = record(entry);
    if (linked?.type === "character") {
      const data = structuredClone(linked.data);
      rules.applyPlan(data, plan, track, names);
      table().records.update(linked.id, { data: rules.derive(data) }, table().seat, { replace: true });
    } else {
      const state = own(entry);
      if (plan.box) state.stress = { ...(state.stress ?? {}), [track]: { ...(state.stress?.[track] ?? {}), [String(plan.box)]: 1 } };
      state.cons = { ...(state.cons ?? {}) };
      for (const key of plan.consequences) state.cons[key] = String(names[key] ?? "").trim() || `${rules.CONSEQUENCE_NAMES[key]} consequence`;
    }
    own(entry).taken += plan.consequences.length;
  }

  // The pending hit absorbed, as its player chooses: choice { plan: index in
  // options (0 the lightest), or box + consequences, names {mild: "Cracked Ribs"} }
  // or { out: true } (taken out).
  async function absorb(entryId, choice = {}, seat) {
    await ready;
    const entry = find(entryId);
    if (seat.role !== "dm" && owner(entry) !== seat.name) throw new Error("Absorb hits on your own character.");
    const pending = own(entry).pending;
    if (!pending) throw new Error(`${entry.name} has no hit to absorb.`);
    const sheet = sheetOf(entry);
    const options = rules.absorbOptions(pending.shifts, rules.freeOf(sheet, pending.track));
    if (choice.out || !options.length) {
      own(entry).pending = null;
      setOut(entry, "taken out");
      table().say(`[TAKEN OUT] ${entry.name} is taken out (${pending.shifts} shifts): ${pending.by || "the attacker"} says what happens to them.`, "Combat", Boolean(entry.hidden));
      changed();
      return { takenOut: true };
    }
    let plan = options[Math.max(0, Math.min(options.length - 1, Math.round(Number(choice.plan) || 0)))];
    if (choice.box !== undefined || Array.isArray(choice.consequences)) {
      const wanted = options.find((item) => item.box === Math.round(Number(choice.box) || 0) && item.consequences.join() === (choice.consequences ?? []).join());
      if (!wanted) throw new Error(`That does not take ${pending.shifts} shifts: ${options.map(rules.planWords).slice(0, 4).join("; ")}.`);
      plan = wanted;
    }
    applyToEntry(entry, plan, pending.track, choice.names ?? {});
    own(entry).pending = null;
    const named = plan.consequences.map((key) => `"${String(choice.names?.[key] ?? "").trim() || `${rules.CONSEQUENCE_NAMES[key]} consequence`}"`);
    table().say(`[STRESS] ${entry.name} absorbs ${pending.shifts}: ${rules.planWords(plan)}${named.length ? `, ${named.join(", ")}` : ""}.`, "Combat", Boolean(entry.hidden));
    changed();
    return { absorbed: rules.planWords(plan) };
  }
  function setOut(entry, out) {
    const linked = record(entry);
    if (linked?.type === "character") {
      const data = structuredClone(linked.data);
      data.out = out;
      table().records.update(linked.id, { data: rules.derive(data) }, table().seat, { replace: true });
    }
    own(entry).out = out;
  }
  // Conceding: out of the conflict on one's own terms; a character gains a
  // fate point, and one for each consequence taken in this conflict.
  async function concede(entryId, seat) {
    await ready;
    const entry = find(entryId);
    if (seat.role !== "dm" && owner(entry) !== seat.name) throw new Error("Concede for your own character.");
    if (outOf(entry)) throw new Error(`${entry.name} is already ${health(entry).status.toLowerCase()}.`);
    own(entry).pending = null;
    const gain = 1 + own(entry).taken;
    setOut(entry, "conceded");
    const linked = record(entry);
    if (linked?.type === "character") {
      const data = structuredClone(table().records.get(linked.id).data);
      data.fatepoints = Number(data.fatepoints ?? 0) + gain;
      table().records.update(linked.id, { data: rules.derive(data) }, table().seat, { replace: true });
      table().say(`[CONCEDE] ${entry.name} concedes: out of the conflict on their own terms, and ${gain} fate point${gain === 1 ? "" : "s"} (1${own(entry).taken ? ` + ${own(entry).taken} for the consequences taken` : ""}).`, "Combat", Boolean(entry.hidden));
    } else table().say(`[CONCEDE] ${entry.name} concedes and leaves the conflict.`, "Combat", Boolean(entry.hidden));
    changed();
    return { conceded: true, fatepoints: gain };
  }
  // A roll from the tracker (the GM's NPC, or anyone's: its skill against an
  // opposition), as kraken_combat save does in other games.
  async function rollEntry(entry, skill, opposition, from) {
    await ready;
    const linked = record(entry);
    if (linked?.type === "character") return fate.rollFate(table(), linked, { skill, action: "overcome", opposition }, from);
    const sheet = sheetOf(entry);
    const rating = rules.ratingIn(sheet, skill);
    const { rolled, total } = fate.fourDF(table(), rating);
    const result = opposition === undefined || opposition === null || opposition === "" ? null : rules.outcome(total, rules.ratingOf(opposition));
    table().postRoll(rolled, `[FATE] ${entry.name}: ${skill} ${rules.signed(rating)}${result ? ` [${fate.RESULT[result.outcome]} ${rules.signed(result.shifts)}]` : ""}`, from || entry.name, Boolean(entry.hidden), { by: entry.name, ladder: rules.ladder(total), ...(result ? { result: fate.RESULT[result.outcome] } : {}) });
    return { name: entry.name, total, ladder: rules.ladder(total), ...(result ? { outcome: result.outcome, shifts: result.shifts, success: result.shifts >= 0 } : {}) };
  }
  // The conflict is over: everyone's stress clears; the out come back; consequences stay.
  async function endConflict() {
    await ready;
    for (const entry of state.entries) {
      const linked = record(entry);
      if (linked?.type === "character") {
        const data = structuredClone(linked.data);
        for (const track of Object.keys(data.stress ?? {})) for (const box of Object.keys(data.stress[track])) data.stress[track][box] = 0;
        data.out = "";
        table().records.update(linked.id, { data: rules.derive(data) }, table().seat, { replace: true });
      }
      entry.fate = cleanState({ cons: entry.fate?.cons ?? {} });
    }
  }
  // The GM's damage by hand on the tracker is a hit of that many shifts; healing clears stress.
  async function clearStress(entry) {
    await ready;
    const linked = record(entry);
    if (linked?.type === "character") {
      const data = structuredClone(linked.data);
      for (const track of Object.keys(data.stress ?? {})) for (const box of Object.keys(data.stress[track])) data.stress[track][box] = 0;
      table().records.update(linked.id, { data: rules.derive(data) }, table().seat, { replace: true });
    } else own(entry).stress = {};
    own(entry).pending = null;
    table().say(`${entry.name}'s stress clears.`, "Combat", Boolean(entry.hidden));
    changed();
  }
  // What a seat sees of an entry's Fate state.
  function view(entry, seat) {
    if (!rules) return undefined;
    const numbers = seat.role === "dm" || entry.faction === "friend" || owner(entry) === seat.name;
    const sheet = sheetOf(entry);
    const pending = own(entry).pending;
    const options = pending ? rules.absorbOptions(pending.shifts, rules.freeOf(sheet, pending.track)) : [];
    const linked = record(entry);
    return {
      out: outOf(entry),
      ...(numbers || seat.role === "dm"
        ? {
            tracks: sheet.tracks.map((track) => ({ key: track.key, label: track.label, boxes: track.boxes.map((box) => ({ value: box.value, marked: box.marked })) })),
            consequences: sheet.slots.all.map((key) => ({ key, label: rules.CONSEQUENCE_NAMES[key], value: rules.CONSEQUENCES[key], text: String(sheet.consequences[key]?.text ?? "") })),
          }
        : {}),
      ...(pending && (seat.role === "dm" || owner(entry) === seat.name) ? { pending: { shifts: pending.shifts, track: pending.track, by: pending.by, options: options.slice(0, 6).map((plan, index) => ({ index, words: rules.planWords(plan), box: plan.box, consequences: plan.consequences })) } } : pending ? { pending: { shifts: pending.shifts, track: pending.track, by: pending.by, options: [] } } : {}),
      ...(linked?.type === "character" ? { fatepoints: Number(linked.data?.fatepoints ?? 0) } : { kind: sheet.npc?.kind ?? "nameless", ...(seat.role === "dm" ? { aspects: sheet.npc?.aspects ?? [] } : {}) }),
      taken: own(entry).taken,
    };
  }
  function attacksFor(entry) {
    if (!rules) return [];
    const sheet = sheetOf(entry);
    return (sheet.npc?.attacks ?? rules.attacksOf(sheet)).map((item) => ({ key: item.key, name: item.name, bonus: rules.ratingIn(sheet, item.key), damage: "", kind: item.kind ?? "physical" }));
  }
  // A new NPC entry's numbers: no hit points (stress is its own).
  function setup(source) {
    return { hp: 0, ac: 0, init: 0 };
  }
  return { ready, cleanState, health, skips, initiative, weapon, attack, hit, absorb, concede, rollEntry, endConflict, clearStress, view, attacksFor, setup, sheetOf, kindNow };
}

module.exports = { createFateCombat, cleanState };
