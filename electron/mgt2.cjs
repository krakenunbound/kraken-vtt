const path = require("path");
const { pathToFileURL } = require("url");

// Host side of Traveller (shared/mgt2/rules.mjs): Travellers built by the
// wizard, tasks rolled in front of the table (2d6 + DM + skill against a
// difficulty, with the Effect), and the sheet's edits. A record's
// data.ruleset is "mgt2".

let loaded = null;
const rulesMgt2 = () => (loaded ??= import(pathToFileURL(path.join(__dirname, "..", "shared", "mgt2", "rules.mjs")).href));
const RULESET_NAME = "Traveller";
const isMgt2 = (thing) => thing?.data?.ruleset === "mgt2";
const isMgt2Ruleset = (name) => String(name ?? "") === RULESET_NAME;

// Kraken's science fiction portraits (Apeira Astra's: an origin and a path)
// for a human Traveller: the path by the first career, the origin by where
// they come from (high Social Standing Coreborn, a rogue the Undercity, a
// scout the Frontier, a spacer's career Spacer, else a Belter). Other species
// keep their own name, for the GM's art.
const ART_PATH = { agent: "Drifter", army: "Marine", citizen: "Merchant", drifter: "Drifter", entertainer: "Merchant", marine: "Marine", merchant: "Merchant", navy: "Fleet", noble: "Merchant", prisoner: "Drifter", rogue: "Drifter", scholar: "Medic", scout: "Scout" };
function artFor(data) {
  const career = String(data.careers?.[0]?.name ?? "").toLowerCase();
  if (!/^human$/i.test(String(data.species ?? "Human"))) return { race: data.species, class: career };
  const origin = Number(data.characteristics?.soc?.score) >= 10 ? "Coreborn" : ["rogue", "prisoner"].includes(career) ? "Undercity" : ["scout", "drifter"].includes(career) ? "Frontier" : ["navy", "merchant"].includes(career) ? "Spacer" : "Belter";
  return { race: origin, class: ART_PATH[career] ?? "Engineer" };
}

async function buildMgt2(table, spec, owner, seat) {
  const rules = await rulesMgt2();
  const built = rules.buildFromSpec(spec ?? {}, { items: table.records.list({ type: "item" }) });
  // The art is picked by the portraits' origin; the record keeps its species.
  const art = artFor(built.data);
  const data = { ...require("./characterArt.cjs").withArt({ ...built.data, race: art.race }, { ...spec, class: art.class }, table.art), race: built.data.race };
  const record = table.records.create({ type: "character", name: built.name, owner: owner ?? "", visibility: owner ? "owner" : "gm", data }, seat ?? table.seat);
  return { record, problems: built.problems };
}

// A task: 2d6 + the characteristic's DM + the skill's level (untrained -3,
// less Jack-of-all-Trades) + a modifier, against the difficulty's number
// (Average 8); a Boon keeps the best two of 3d6, a Bane the worst. The margin
// is the Effect.
async function taskMgt2(table, record, { skill = "", attribute = "", difficulty = 8, modifier = 0, boon = "", label } = {}, from) {
  const rules = await rulesMgt2();
  const data = rules.derive(record.data);
  const { modifier: dm, label: tag } = rules.taskModifier(data, skill, String(attribute ?? "").toLowerCase().slice(0, 3));
  const target = Math.min(20, Math.max(2, Math.round(Number(difficulty) || 8)));
  const total = dm + (Math.round(Number(modifier)) || 0);
  const dice = boon === "boon" ? "3d6kh2" : boon === "bane" ? "3d6kl2" : "2d6";
  const rolled = table.dice.roll(`${dice}${total ? rules.signed(total) : ""}`);
  const effect = rolled.total - target;
  const success = effect >= 0;
  const name = rules.DIFFICULTIES.find(([, value]) => value === target)?.[0] ?? `${target}+`;
  const words = `${label ? `${label} ` : ""}${tag} [${name.toUpperCase()} ${target}+]${Number(modifier) ? ` [${rules.signed(Math.round(Number(modifier)))}]` : ""}${boon ? ` [${boon.toUpperCase()}]` : ""} [${success ? "SUCCESS" : "FAILURE"} ${rolled.total} vs ${target}, Effect ${rules.signed(effect)}]`;
  table.postRoll(rolled, words, from || record.name, false, { by: record.name, result: success ? "SUCCESS" : "FAILURE", against: target });
  return { total: rolled.total, modifier: total, target, effect, success };
}

// What the sheet may change, then every number worked out again.
const TEXT = new Set(["playername", "notes", "appearance", "gender", "species", "homeworld", "contacts", "allies", "enemies", "ship", "background"]);
const NUMBERS = [/^characteristics\.(str|dex|end|int|edu|soc)\.score$/, /^skills\.[a-z0-9-]+\.level$/, /^hp\.wounds$/, /^age$/, /^ac\.misc$/, /^initiative\.misc$/, /^careers\.\d+\.(terms|rank)$/, /^coins\.id-\d+\.amount$/, /^inventorylist\.id-\d+\.(count|carried)$/];
function setPath(data, key, value) {
  const keys = key.split(".");
  let node = data;
  for (const part of keys.slice(0, -1)) node = node[part] = node[part] && typeof node[part] === "object" ? node[part] : {};
  node[keys.at(-1)] = value;
}
async function editMgt2(table, record, changes, seat) {
  if (seat.role !== "dm" && record.owner !== seat.name) throw new Error("You can only change your own character.");
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("What changes?");
  const rules = await rulesMgt2();
  const data = structuredClone(record.data);
  let name = record.name;
  for (const change of changes.slice(0, 50)) {
    let key = String(change?.path ?? "");
    const value = change?.value;
    // A skill by its name ("skills.Gun Combat (Slug).level") as well as its key.
    const named = /^skills\.(.+)\.level$/.exec(key);
    if (named && !/^[a-z0-9-]+$/.test(named[1])) key = `skills.${rules.skillKey(named[1]).key}.level`;
    if (key === "name") name = String(value ?? "").trim().slice(0, 120) || record.name;
    else if (TEXT.has(key)) data[key] = String(value ?? "").slice(0, 8000);
    else if (key === "careers") data.careers = (Array.isArray(value) ? value : []).slice(0, 12).map((item) => ({ name: String(item?.name ?? "").slice(0, 60), terms: Math.max(0, Math.round(Number(item?.terms) || 0)), rank: Math.max(0, Math.round(Number(item?.rank) || 0)) }));
    else if (/^skills\.[a-z0-9-]+$/.test(key) && value === null) delete data.skills?.[key.split(".")[1]];
    else if (NUMBERS.some((pattern) => pattern.test(key))) {
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) throw new Error(`${key} needs a number.`);
      if (key.startsWith("skills.") && !rules.SKILLS[key.split(".")[1].split("-")[0]]) throw new Error(`No skill ${key.split(".")[1]}.`);
      setPath(data, key, key === "hp.wounds" ? Math.max(0, n) : n);
    } else if (/^inventorylist\.id-\d+$/.test(key) && value === null) delete data.inventorylist?.[key.split(".")[1]];
    else throw new Error(`The sheet cannot change ${key}.`);
  }
  return table.records.update(record.id, { name, data: rules.derive(data) }, table.seat, { replace: true });
}

// --- The character wizard --------------------------------------------------------
// The GM's FG extension KrakenCharWizardMGT2 itself (electron/tcwizard.cjs):
// one wizard a player, its term engine run as it runs in FG, every roll the
// table's. The window shows its pages; Create makes a Kraken Traveller from it.
const tables = new WeakMap();
const livesOf = (table) => {
  if (!tables.has(table)) tables.set(table, new Map());
  return tables.get(table);
};
// What the wizard's pages may call (the FG pages' own calls).
const CALLS = new Set(["rollCharacteristics", "swapScores", "selectSpecies", "toggleBackground", "showTab", "chooseOption", "retryRoll", "chooseBenefitItem", "rollMedical", "settleMedical", "setConnection", "applyConnection", "setPackage", "togglePackageSkill", "applyPackage", "startOver"]);
// The page data, gathered in the wizard's own Lua.
const VIEW = String.raw`
  local W, D, S = TCWizard, TCData, TCWizard.getState()
  local stats = {}
  for _, s in ipairs(D.STATS) do stats[#stats + 1] = { key = s, short = W.statShort(s), name = W.statName(s), base = S.base[s], value = W.getStat(s), dm = W.getStatDM(s) } end
  local species = {}
  for _, node in ipairs(W.getSpeciesList()) do species[#species + 1] = { path = node._path, name = node.name, mods = node.characteristics or "", text = node.text or "" } end
  local chosen, allowed = W.getBackgroundCounts()
  local task = nil
  if S.task then
    task = { title = S.task.title, text = S.task.text, options = {} }
    for i, o in ipairs(S.task.options or {}) do task.options[i] = { label = o.label, tip = o.tip, disabled = o.disabled and true or false, roll = o.roll and { dice = o.roll.dice, mod = o.roll.mod, target = o.roll.target, desc = o.roll.desc } or nil } end
  end
  local benefits = {}
  for i, b in ipairs(S.benefits) do
    local entry = { index = i, name = b.name, kind = b.kind, item = b.item, itemname = b.itemname, declined = b.declined, skilltaken = b.skilltaken }
    if b.kind == "item" then
      entry.choices = {}
      for _, node in ipairs(W.getBenefitItems(b)) do entry.choices[#entry.choices + 1] = { path = node._path, name = node.name, cost = node.cost, tl = node.tl } end
    end
    benefits[#benefits + 1] = entry
  end
  local tabs = {}
  for _, t in ipairs(W.TABS) do tabs[#tabs + 1] = { key = t, alerts = W.getTabAlerts(t) } end
  local packages = {}
  for _, p in ipairs(D.SKILL_PACKAGES) do packages[#packages + 1] = { name = p.name, text = p.text, skills = p.skills } end
  return {
    tab = S.tab, tabs = tabs, started = S.started, done = S.done, canReroll = W.canReroll(), rolled = #S.rolls,
    stats = stats, upp = W.getUPP(), age = W.getAge(),
    species = species, speciesChosen = S.species,
    background = D.BACKGROUND_SKILLS, bg = S.bg, bgChosen = chosen, bgAllowed = allowed, homeworld = S.homeworld,
    task = task, waiting = S.waiting and true or false, log = S.log,
    careers = W.getCareerSummary(), skills = S.skills, skillText = W.getSkillListText(), skillWarnings = W.getSkillWarnings(),
    benefits = benefits, benefitsText = W.getBenefitsText(), injuries = S.injuries, debts = S.debts, cash = S.cash, finalCash = W.getFinalCash(), shares = S.shares, pension = S.pension,
    connections = S.connections, packages = packages, package = S.package, packagePicks = S.packagePicks,
    assoc = W.getAssocText(), warnings = W.getAllWarnings(),
    name = S.name, gender = S.gender, appearance = S.appearance, why = S.why,
  }
`;
const DONE = String.raw`
  local W, S = TCWizard, TCWizard.getState()
  local visits = {}
  for _, v in ipairs(S.visits) do visits[#visits + 1] = { name = TCData.CAREERS[v.key].name, assignment = W.getAssignment(v).name, terms = v.terms, rank = v.officer and v.orank or v.rank, officer = v.officer and true or false, title = W.getRankTitle(v) } end
  local stats = {}
  for _, s in ipairs(TCData.STATS) do stats[s] = W.getStat(s) end
  local items = {}
  for _, b in ipairs(S.benefits) do if b.kind == "item" and b.item then items[#items + 1] = { path = b.item, name = b.itemname } end end
  local debts = {}
  for _, d in ipairs(S.debts) do debts[#debts + 1] = string.format("Cr%d %s", d.amount, d.what) end
  local species = W.getSpeciesNode()
  return { stats = stats, skills = S.skills, talents = S.talents, visits = visits, age = W.getAge(), upp = W.getUPP(), assoc = W.getAssocText(), cash = W.getFinalCash(),
    benefits = W.getBenefitsText(), debts = debts, notes = S.notes, log = W.getLogText(), items = items, species = species and species.name or "Human",
    name = S.name, gender = S.gender, homeworld = S.homeworld, appearance = S.appearance, why = S.why, summary = W.getCareerSummary() }
`;
// The wizard's database: species, skills and items from the campaign's books;
// Kraken's weapons, armour and gear priced as FG's MGT2 items are.
async function wizardRecords(table) {
  const rules = await rulesMgt2();
  const list = (type) => table.records.list({ type });
  const species = list("race").map((record) => ({ name: record.name, characteristics: String(record.data?.characteristics ?? ""), text: String(record.data?.text ?? ""), traits: [] }));
  return {
    race: species.length ? species : [{ name: "Human", characteristics: "", text: "Humans (no characteristic modifiers).", traits: [] }],
    "reference.skilldata": list("skill").map((record) => ({ name: record.name, text: String(record.data?.text ?? "") })),
    item: [...rules.catalog(), ...list("item").map((record) => ({ ...record.data, name: record.name }))],
  };
}
const FIELDS = ["name", "gender", "homeworld", "appearance", "why"];
// A step's arguments, as the FG pages could send them (the extension trusts its
// own window): a choice from the page's own list, a slot that exists.
function checkCall(fn, args, life) {
  const no = (why) => {
    throw new Error(`Not a choice the wizard offers: ${why}.`);
  };
  const int = (value) => (Number.isInteger(value) ? value : NaN);
  const stats = new Set((life.stats ?? []).map((stat) => stat.key));
  if (fn === "swapScores" && !(stats.has(args[0]) && stats.has(args[1]))) no("those characteristics");
  if (fn === "selectSpecies" && !(life.species ?? []).some((item) => item.path === args[0])) no("that species");
  if (fn === "toggleBackground" && !(life.background ?? []).includes(args[0])) no("that background skill");
  if (fn === "showTab" && !(life.tabs ?? []).some((tab) => tab.key === args[0])) no("that page");
  if (fn === "chooseOption") {
    const option = life.task?.options?.[int(args[0]) - 1];
    if (!option || option.disabled) no("that answer");
  }
  if (fn === "chooseBenefitItem") {
    const benefit = (life.benefits ?? []).find((item) => item.index === int(args[0]));
    if (!benefit || (args[1] !== null && args[1] !== undefined && !(benefit.choices ?? []).some((choice) => choice.path === args[1]))) no("that item");
  }
  if (["rollMedical", "settleMedical"].includes(fn)) {
    const injury = (life.injuries ?? [])[int(args[0]) - 1];
    if (!injury) no("that injury");
    if (fn === "settleMedical" && injury.cover === undefined) no("roll the medical bills first");
  }
  if (["applyConnection", "setConnection"].includes(fn) && ![1, 2].includes(int(args[0]))) no("a Connection is 1 or 2");
  if (fn === "setConnection" && args[1] !== "who") no("a Connection's name");
  if (fn === "setPackage" && args[0] !== "" && !(life.packages ?? []).some((item) => item.name === args[0])) no("that package");
}
// A price in credits: "Cr200", "MCr 1.5", "1,000".
function priceCr(text) {
  const value = priceCrRaw(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
function priceCrRaw(text) {
  const source = String(text ?? "").replace(/,/g, "").trim();
  const mcr = /^MCr\s*([\d.]+)/i.exec(source);
  if (mcr) return Math.round(Number(mcr[1]) * 1e6);
  const cr = /^(?:Cr)?\s*([\d.]+)$/i.exec(source);
  return cr ? Math.round(Number(cr[1])) : null;
}
async function lifeAction(table, owner, { action = "view", name, fn, args, build } = {}, seat) {
  if (!isMgt2Ruleset(table.ruleset?.())) throw new Error("This is Traveller's character wizard.");
  const wizards = require("./tcwizard.cjs");
  const rules = await rulesMgt2();
  const lives = livesOf(table);
  // The GM's own wizard under a key no player's name can be.
  const key = owner ? `player:${owner}` : "@gm";
  const view = (wizard) => (wizard ? wizard.eval(VIEW) : null);
  const setDetails = (wizard, input) => {
    for (const field of FIELDS) if (input?.[field] !== undefined) wizard.eval(`TCWizard.getState().${field} = ${wizards.toLua(String(input[field]).slice(0, 2000))}`);
  };
  if (action === "start") {
    const player = String(owner || "GM");
    // The GM (and the agent) may re-roll the characteristics; a player may not (FG: Session.IsHost).
    const isHost = !seat?.player;
    const wizard = wizards.createWizard({
      isHost,
      roll: (formula, label, mod) => {
        const rolled = table.dice.roll(`${formula}${mod ? (mod > 0 ? `+${mod}` : mod) : ""}`);
        table.postRoll(rolled, String(label).replace(/^\[Traveller creation\]\s*/, "[TRAVELLER CREATION] "), player, false, { by: player });
        return rolled.terms.filter((term) => term.kind === "dice").flatMap((term) => term.rolls);
      },
      say: (text) => table.say(text, player),
      user: player,
      records: await wizardRecords(table),
    });
    if (name) setDetails(wizard, { name });
    // The old one goes only once the new one is made.
    lives.get(key)?.close();
    lives.set(key, wizard);
    return { life: view(wizard) };
  }
  const wizard = lives.get(key);
  if (action === "cancel") {
    wizard?.close();
    lives.delete(key);
    return { life: null };
  }
  if (!wizard) {
    if (action === "view") return { life: null };
    throw new Error("No Traveller under way: start one.");
  }
  if (action === "view") return { life: view(wizard) };
  if (action === "call") {
    if (!CALLS.has(String(fn))) throw new Error(`The wizard has no step ${fn}.`);
    const list = Array.isArray(args) ? args.slice(0, 4) : [];
    checkCall(String(fn), list, view(wizard));
    wizard.call(String(fn), ...list);
    return { life: view(wizard) };
  }
  if (action === "details") {
    setDetails(wizard, build);
    return { life: view(wizard) };
  }
  if (action === "build") {
    if (!view(wizard).done) throw new Error("Play the careers and muster out first.");
    setDetails(wizard, build);
    const done = wizard.eval(DONE);
    const records = await wizardRecords(table);
    // The items the benefits gave (the wizard's database: Kraken's list and the campaign's items).
    const byPath = (text) => records.item[Number(/id-(\d+)$/.exec(String(text))?.[1]) - 1];
    // By the item's name (the records list is made again here: a book made active since would move its places).
    const gear = (done.items ?? [])
      .map((entry) => (entry?.name ? (records.item.find((item) => item.name === entry.name) ?? { name: entry.name }) : byPath(entry?.path ?? entry)))
      .filter(Boolean)
      .map((item) => [item.name, 1]);
    // Starting gear bought with the final cash (Kraken's shop, after the wizard's Benefits).
    let cash = Math.max(0, Math.round(Number(done.cash) || 0));
    const bought = [];
    for (const [itemName, countIn] of Array.isArray(build?.buy) ? build.buy : []) {
      const item = records.item.find((entry) => String(entry.name).toLowerCase() === String(itemName).toLowerCase());
      const count = Math.max(1, Math.min(20, Math.round(Number(countIn) || 1)));
      const price = priceCr(item?.cost);
      if (!item || price === null) throw new Error(`${itemName} is not for sale.`);
      if (price * count > cash) throw new Error(`${itemName} costs Cr${price * count}; Cr${cash} is left.`);
      cash -= price * count;
      bought.push([item.name, count]);
    }
    const notes = [
      done.benefits ? `BENEFITS\n${done.benefits}` : "",
      done.debts?.length ? `PAID OUT OF CASH\n${done.debts.join("\n")}` : "",
      bought.length ? `BOUGHT\n${bought.map(([item, count]) => `${count} x ${item}`).join("\n")}` : "",
      done.notes?.length ? `FOR THE REFEREE\n${done.notes.join("\n")}` : "",
      `CREATION LOG\n${done.log}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const careers = (done.visits ?? []).map((visit) => ({ name: visit.name, terms: visit.terms, rank: visit.rank, title: visit.title, assignment: visit.assignment }));
    const spec = {
      lifepath: true,
      name: String(done.name || build?.name || "Traveller").trim() || "Traveller",
      species: done.species,
      homeworld: done.homeworld,
      characteristics: done.stats,
      careers,
      age: done.age,
      skills: done.skills ?? {},
      gear: [...gear, ...bought],
      credits: cash,
      contacts: done.assoc,
      gender: done.gender,
      notes,
      appearance: [done.appearance, done.why ? `Why travelling: ${done.why}` : "", `UPP ${done.upp}. ${String(done.summary ?? "").replace(/\n/g, ". ")}`].filter(Boolean).join("\n"),
      catalog: records.item,
    };
    void rules;
    const made = await buildMgt2(table, spec, owner, seat);
    wizard.close();
    lives.delete(key);
    table.say(`[TRAVELLER CREATION] ${made.record.name}: ${made.record.data.upp}, age ${made.record.data.age}${careers.length ? `, ${careers.map((career) => `${career.name} ${career.terms}${career.title ? ` (${career.title})` : ""}`).join(", ")}` : ""}.`, owner || "GM");
    return { id: made.record.id, problems: made.problems };
  }
  throw new Error("Which action? start, view, call, details, build or cancel.");
}

module.exports = { rulesMgt2, buildMgt2, taskMgt2, editMgt2, isMgt2, isMgt2Ruleset, lifeAction, RULESET_NAME };
