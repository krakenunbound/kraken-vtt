// The D&D 5E character wizard's rules, after Fantasy Grounds' 5E wizard
// (charwizard/: manager_charwizard*.lua, CharBuildManager's text parsing).
// Plain functions (no DOM, no Node): the 5E wizard (src/characters/Wizard5e.tsx)
// asks them what a species, class and background offer and what is still to
// choose; the host's buildFromSpec (rules.mjs) uses them to build the same
// character from a spec. A record is "2024" when its data.version says so
// (FG reads the record, not the campaign option); otherwise it is read the
// Legacy (2014) way. Kraken's Descending Darkness books are read the same way,
// with their own coin (gold crowns).
import { SKILLS, STATS, skillKey } from "./rules.mjs";

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const rows = (value) => (value && typeof value === "object" ? Object.values(value).filter((row) => row && typeof row === "object") : []);
export const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const simplify = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const titled = (word) => String(word ?? "").replace(/\b\w/g, (letter) => letter.toUpperCase());

// The tabs, in FG's order (a level up shows only Class and Commit).
export const TABS = ["species", "class", "abilities", "background", "equipment", "commit"];
export const TAB_LABEL = { species: "Species", class: "Class", abilities: "Abilities", background: "Background", equipment: "Equipment", commit: "Commit" };

export const is2024 = (record) => String(record?.data?.version ?? "") === "2024";

// FG's convertSingleNumberTextToNumber.
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
export const countWord = (text, fallback = 0) => (/^\d+$/.test(String(text ?? "")) ? Number(text) : WORDS[String(text ?? "").toLowerCase()] ?? fallback);

// FG's parseOptionsFromString: split on " and ", " or ", commas.
export function parseOptions(text) {
  return String(text ?? "")
    .split(/\s+and\s+/i)
    .flatMap((part) => part.split(/\s+or\s+/i))
    .flatMap((part) => part.split(","))
    .map((part) => part.replace(/^\s*(and|or)\s+/i, "").trim())
    .filter(Boolean);
}
// parseOptionsFromText: up to the first period.
const parseOptionsText = (text) => parseOptions(String(text ?? "").split(".")[0]);
export const parseAbilities = (text) => parseOptions(text).map((word) => word.toLowerCase()).filter((word) => STATS.includes(word));
export const parseSizes = (text) => ["Medium", "Small", "Large"].filter((size) => String(text ?? "").includes(size));
const skillNames = (list) => list.map(skillKey).filter((key) => SKILLS[key]);
const allSkills = () => Object.keys(SKILLS);

// CharBuildManager.parseSkillsField (2024 and 2014): { base, options, picks } as skill keys.
export function parseSkillsField(text, version2024) {
  const s = String(text ?? "").trim();
  const result = (base, options, picks) => ({ base: skillNames(base), options: picks > 0 && options.length === 0 ? allSkills() : skillNames(options), picks });
  if (!s) return result([], [], 0);
  if (version2024) {
    let match = /Choose any (\w+) skills?/i.exec(s);
    if (match) return result([], [], countWord(match[1]));
    match = /Choose (\w+):/i.exec(s);
    if (match) return result([], parseOptions(s.replace(/Choose (\w+):/i, "")), countWord(match[1]));
    return result(parseOptions(s), [], 0);
  }
  let match = /Choose any (\w+)/i.exec(s);
  if (match) return result([], [], countWord(match[1]));
  for (const pattern of [/Choose (\w+) skills? from/i, /Choose (\w+) from among/i, /Choose (\w+) from/i, /Choose (\w+):/i]) {
    match = pattern.exec(s);
    if (match) return result([], parseOptionsText(s.slice(match.index + match[0].length)), countWord(match[1]));
  }
  for (const pattern of [/ plus (\w+) from among/i, / plus (\w+) of your choice from among/i, / plus your choice of (\w+) from among/i]) {
    match = pattern.exec(s);
    if (match) return result(parseOptionsText(s.slice(0, match.index)), parseOptionsText(s.slice(match.index + match[0].length)), countWord(match[1]));
  }
  match = / and one Intelligence, Wisdom, or Charisma skill of your choice/i.exec(s);
  if (match) return result(parseOptionsText(s.slice(0, match.index)), allSkills().filter((key) => ["intelligence", "wisdom", "charisma"].includes(SKILLS[key][1])), 1);
  return result(parseOptionsText(s), [], 0);
}

// CharBuildManager.getSkillsFromText2024: a species trait's skills (Keen Senses, Skillful).
export function skillsFromTrait2024(text) {
  const s = plain(text);
  const result = (base, options, picks) => ({ base: skillNames(base), options: picks > 0 && options.length === 0 ? allSkills() : skillNames(options), picks });
  let match = /[Pp]roficiency in the ([\w\s]+), ([\w\s]+),? or ([\w\s]+) skill/.exec(s);
  if (match) return result([], [match[1], match[2], match[3]], 1);
  match = /[Pp]roficiency in the ([\w\s]+) and ([\w\s]+) skills/.exec(s);
  if (match) return result([match[1], match[2]], [], 0);
  match = /[Pp]roficiency in the ([\w\s]+) skill/.exec(s);
  if (match) return result([match[1]], [], 0);
  match = /[Pp]roficiency (?:in|with) (\w+) skills? of your choice/.exec(s);
  if (match) return result([], [], countWord(match[1]));
  match = /[Pp]roficiency in (\w+) of these skills of your choice: ([\w\s,]+)/.exec(s);
  if (match) return result([], parseOptions(match[2]), countWord(match[1]));
  return result([], [], 0);
}

// CharBuildManager.parseToolsField: tools by kind from the books' items.
export function parseToolsField(text, version2024, items = []) {
  const s = String(text ?? "").trim();
  if (!s || /^none$/i.test(s)) return { base: [], options: [], picks: 0 };
  const kind = (...subtypes) => [...new Set(items.filter((item) => subtypes.some((sub) => simplify(item.data?.subtype) === simplify(sub)) && !/magic/i.test(String(item.data?.properties ?? ""))).map((item) => item.name))].sort();
  if (version2024) {
    let match = /Choose (\w+) Musical Instruments?/i.exec(s);
    if (match) return { base: [], options: kind("Musical Instrument"), picks: countWord(match[1]) };
    match = /Choose (\w+) types? of Artisan's Tools or Musical Instruments?/i.exec(s);
    if (match) return { base: [], options: kind("Artisan's Tools", "Musical Instrument"), picks: countWord(match[1]) };
    if (/Choose one kind of Musical Instrument/i.test(s)) return { base: [], options: kind("Musical Instrument"), picks: 1 };
    if (/Choose one kind of Artisan's Tools/i.test(s)) return { base: [], options: kind("Artisan's Tools"), picks: 1 };
    if (/Choose one kind of Gaming Set/i.test(s)) return { base: [], options: kind("Gaming Set"), picks: 1 };
    return { base: [s], options: [], picks: 0 };
  }
  const base = [];
  const options = [];
  let picks = 0;
  for (const part of parseOptions(s.replace(/, likely something native to your homeland/i, ""))) {
    const lower = part.toLowerCase();
    if (!picks) picks = /^\d+/.test(lower) ? Number(/\d+/.exec(lower)[0]) : countWord(lower.split(" ")[0]);
    if (/musical/.test(lower)) options.push(...kind("Musical Instrument"));
    else if (/gaming/.test(lower)) options.push(...kind("Gaming Set"));
    else if (/artisan/.test(lower)) options.push(...kind("Artisan's Tools"));
    else base.push(part);
  }
  return { base, options, picks: options.length ? picks || 1 : 0 };
}

// CharBuildManager.parseLanguagesField (2014 only; a 2024 background has none).
export function parseLanguagesField(text, version2024) {
  const s = String(text ?? "").trim();
  if (version2024 || !s || /^none$/i.test(s)) return { base: [], options: [], picks: 0 };
  let match = /Choose any (\w+)/i.exec(s);
  if (match) return { base: [], options: [], picks: countWord(match[1]) };
  match = /Choose (\w+) of/i.exec(s);
  if (match) return { base: [], options: parseOptionsText(s.slice(match.index + match[0].length)), picks: countWord(match[1]) };
  match = /(\w+) of your choice/i.exec(s);
  if (match) return { base: [], options: [], picks: countWord(match[1].toLowerCase()) };
  return { base: parseOptionsText(s), options: [], picks: 0 };
}

// GameSystem.languagestandard: a 2024 species gives Common and two of these.
export const STANDARD_LANGUAGES = ["Common Sign Language", "Draconic", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc"];

// A decision: what the wizard asks (FG's decision windows).
//   { id, type: skill|expertise|language|toolprof|feat|asioption|asi|size|subclass|asiorfeat, label, options, adj?, category? }
const decision = (id, type, label, options = [], extra = {}) => ({ id, type, label, options, ...extra });
const DECISION_LABEL = {
  skill: "Select Skill",
  expertise: "Select Expertise",
  language: "Select Language",
  toolprof: "Select Tool Proficiency",
  feat: "Select Feat",
  size: "Select Size",
  subclass: "Select Subclass",
  asiorfeat: "Select Option",
  asioption: "Select Ability Score Option",
};
const picksOf = (prefix, type, picks, options, extra = {}) => Array.from({ length: picks }, (_, index) => decision(`${prefix}:${type}:${index}`, type, DECISION_LABEL[type], options, extra));

// The species: its fields and traits, and the decisions they leave (manager_charwizard_species.lua).
export function speciesInfo(species, ancestry) {
  if (!species) return null;
  const version = is2024(species);
  const traits = [...rows(species.data?.traits).map((trait) => ({ ...trait, from: species.name })), ...rows(ancestry?.data?.traits).map((trait) => ({ ...trait, from: ancestry?.name }))];
  const out = { name: species.name, is2024: version, size: "Medium", sizeOptions: [], speed: Number(/\d+/.exec(String(species.data?.speed ?? ""))?.[0] ?? 30), darkvision: 0, languages: { base: [], options: [], picks: 0 }, skills: { base: [] }, traits, decisions: [], feats: [], increases: {} };
  if (version) {
    const sizes = parseSizes(species.data?.size);
    if (sizes.length > 1) {
      out.sizeOptions = sizes;
      out.decisions.push(decision("species:size", "size", DECISION_LABEL.size, sizes));
    } else out.size = sizes[0] ?? "Medium";
    out.languages = { base: ["Common"], options: STANDARD_LANGUAGES, picks: 2 };
    out.decisions.push(...picksOf("species", "language", 2, STANDARD_LANGUAGES));
  } else {
    const sizeTrait = traits.find((trait) => /^size$/i.test(String(trait.name)));
    const sizeText = plain(sizeTrait?.text ?? species.data?.size ?? "").toLowerCase();
    if (/choice/.test(sizeText)) {
      out.sizeOptions = ["Small", "Medium"];
      out.decisions.push(decision("species:size", "size", DECISION_LABEL.size, out.sizeOptions));
    } else out.size = titled(/your size is (\w+)/.exec(sizeText)?.[1] ?? /you are (\w+)/.exec(sizeText)?.[1] ?? (parseSizes(species.data?.size)[0] || "Medium"));
    // A Legacy species' Ability Score Increase trait ("Your Constitution score increases by 2"). With
    // none (and no kin adjustments, Descending Darkness's way): +2/+1 or three +1s (handleMissingSpeciesASI).
    const asi = traits.filter((trait) => /abilityscoreincrease/.test(simplify(trait.name)));
    for (const trait of asi) {
      for (const match of plain(trait.text).matchAll(/(\w+) score increases by (\d+)/gi)) {
        const stat = match[1].toLowerCase();
        if (STATS.includes(stat)) out.increases[stat] = (out.increases[stat] ?? 0) + Number(match[2]);
      }
    }
    if (!asi.length && species.data?.abilityadjust === undefined && species.data?.classes === undefined) out.decisions.push(decision("species:asioption", "asioption", DECISION_LABEL.asioption, ["Option 1: One +2, One +1", "Option 2: Three +1's"]));
  }
  for (const trait of traits) {
    const key = simplify(trait.name);
    const text = plain(trait.text);
    if (/darkvision/.test(key)) {
      const range = Number(/(\d+)/.exec(text)?.[1] ?? 0);
      if (range) out.darkvision = Math.max(out.darkvision, range);
    } else if (version && ["keensenses", "primalknowledge", "bonusproficiencies", "skillful", "skillversatility", "changelinginstincts", "bestialinstincts", "specializeddesign"].includes(key)) {
      const found = skillsFromTrait2024(text);
      out.skills.base.push(...found.base);
      if (found.picks > 0) out.decisions.push(...picksOf(`species:${key}`, "skill", found.picks, found.options));
    } else if (version && key === "versatile") {
      out.decisions.push(decision("species:feat", "feat", DECISION_LABEL.feat, [], { category: "Origin" }));
    } else if (!version && /feat/.test(key) && /feat of your choice/i.test(text)) {
      out.decisions.push(decision("species:feat", "feat", DECISION_LABEL.feat, []));
    }
  }
  return out;
}

// The species' ancestries (FG: race_subrace records naming the species).
export const ancestriesOf = (species, list = []) => (species ? list.filter((item) => simplify(item.data?.race) === simplify(species.name)) : []);

// The background (manager_charwizard_background.lua): ability options (2024),
// skills, tools, languages (2014), feat, starting kit options or gold (2014).
export function backgroundInfo(background, items = []) {
  if (!background) return null;
  const version = is2024(background);
  const data = background.data ?? {};
  const out = { name: background.name, is2024: version, abilities: version ? parseAbilities(data.abilities) : [], decisions: [], skills: parseSkillsField(data.skill, version), tools: parseToolsField(data.tool, version, items), languages: parseLanguagesField(data.languages, version), feat: String(data.feat ?? "").trim(), kits: kitOptions(data.equipmentlist), gold: 0, features: rows(data.features).map((feature) => feature.name) };
  if (version && String(data.abilities ?? "").trim()) out.decisions.push(decision("background:asioption", "asioption", DECISION_LABEL.asioption, ["Option 1: One +2, One +1", "Option 2: Three +1's"]));
  if (out.skills.picks > 0) out.decisions.push(...picksOf("background", "skill", out.skills.picks, out.skills.options));
  if (out.tools.picks > 0) out.decisions.push(...picksOf("background", "toolprof", out.tools.picks, out.tools.options));
  if (out.languages.picks > 0) out.decisions.push(...picksOf("background", "language", out.languages.picks, out.languages.options.length ? out.languages.options : STANDARD_LANGUAGES));
  if (!out.feat && version) out.decisions.push(decision("background:feat", "feat", DECISION_LABEL.feat, [], { category: "Origin" }));
  // A Legacy background's coin from its equipment text ("a pouch containing 10 gp").
  if (!out.kits.length) out.gold = Number(/(\d+)\s*g[pc]\b/i.exec(String(data.equipment ?? ""))?.[1] ?? 0);
  return out;
}

// The ability score choices a 2024 background's option opens (processBackgroundDecisionASIOption).
// A Legacy species without its own increases asks the same (prefix "species").
export function backgroundAsiDecisions(option, abilities, prefix = "background") {
  const opts = abilities.length ? abilities.map(titled) : STATS.map(titled);
  if (/option 1/i.test(option)) return [decision(`${prefix}:asi:0`, "asi", "Increase Ability Score +2", opts, { adj: 2 }), decision(`${prefix}:asi:1`, "asi", "Increase Ability Score +1", opts, { adj: 1 })];
  if (/option 2/i.test(option)) {
    if (abilities.length === 3) return [];
    return [0, 1, 2].map((index) => decision(`${prefix}:asi:${index}`, "asi", "Increase Ability Score +1", opts, { adj: 1 }));
  }
  return [];
}
// Option 2 with exactly three abilities: each +1 without asking.
export const backgroundFixedIncreases = (option, abilities) => (/option 2/i.test(option) && abilities.length === 3 ? Object.fromEntries(abilities.map((stat) => [stat, 1])) : {});

// A starting kit's options (a class's startingequipmentlist, a background's
// equipmentlist): [{ letter, items [{ name, count, data }], wealth }].
export function kitOptions(list) {
  return rows(list).map((option, index) => ({
    letter: "ABC"[index] ?? String(index + 1),
    items: rows(option.items).map((item) => {
      const { count, ...data } = item;
      delete data.fgPath;
      return { name: String(item.name ?? ""), count: Math.max(1, num(count, 1)), data };
    }),
    wealth: num(option.wealth, 0),
  }));
}
// As FG lists a 2024 kit: "A: Chain Mail, Greatsword, 8 Javelin, 4 GP".
export const kitText = (option, coin = "GP") => [...option.items.map((item) => (item.count > 1 ? `${item.count} ${item.name}` : item.name)), ...(option.wealth ? [`${option.wealth} ${coin}`] : [])].join(", ");

// FG's charwizard_starting_equipment: a Legacy (2014) class's starting wealth roll.
export const STARTING_WEALTH_2014 = { "anti paladin": "5d4x10", artificer: "5d4x10", barbarian: "5d4x10", bard: "5d4x10", cleric: "5d4x10", druid: "2d4x10", fighter: "5d4x10", monk: "5d4", paladin: "5d4x10", ranger: "5d4x10", rogue: "4d4x10", sorcerer: "3d4x10", warlock: "4d4x10", wizard: "4d4x10" };
// "5d4x10" -> { dice "5d4", times 10 } (the host rolls the dice; the wizard multiplies).
export function wealthRoll(text) {
  const match = /^(\d+d\d+)(?:\s*[x*]\s*(\d+))?$/i.exec(String(text ?? "").trim());
  return match ? { dice: match[1], times: Number(match[2] ?? 1) } : null;
}

// The class at a level (manager_charwizard_class.lua): proficiencies, the
// features it has by then (its subclass's too) and the decisions they ask.
const FEAT_FEATURES_2024 = { epicboon: "Epic Boon", versatile: "Origin", fightingstyle: "Fighting Style", additionalfightingstyle: "Fighting Style" };
export function classInfo(cls, level = 1, subclass) {
  if (!cls) return null;
  const version = is2024(cls);
  const prof = cls.data?.proficiencies ?? {};
  const text = (node) => String(node?.text ?? "").trim();
  const skills = parseSkillsField(text(prof.skills), version);
  const out = {
    name: cls.name,
    is2024: version,
    saves: parseAbilities(text(prof.savingthrows)),
    armor: text(prof.armor),
    weapons: text(prof.weapons),
    tools: text(prof.tools),
    skills,
    features: [],
    decisions: [],
    kits: kitOptions(cls.data?.startingequipmentlist),
    wealthRoll: STARTING_WEALTH_2014[String(cls.name).toLowerCase()] ?? "",
  };
  if (skills.picks > 0) out.decisions.push(...picksOf("class:proficiencies", "skill", skills.picks, skills.options));
  const subName = subclass?.name ?? "";
  const all = [...rows(cls.data?.features).map((feature) => ({ ...feature, subclass: String(feature.specialization ?? "").trim() })), ...rows(subclass?.data?.features).map((feature) => ({ ...feature, subclass: subName }))];
  const seen = new Set();
  for (const feature of all.sort((a, b) => num(a.level) - num(b.level))) {
    if (num(feature.level) > level) continue;
    if (feature.subclass && simplify(feature.subclass) !== simplify(subName)) continue;
    const name = String(feature.name ?? "");
    const key = simplify(name);
    const id = `class:${key}:${num(feature.level)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.features.push({ id, name, level: num(feature.level), text: plain(feature.text), subclass: feature.subclass || "" });
    if (/subclass$/.test(key) || num(feature.specializationchoice) > 0) out.decisions.push(decision(`${id}:subclass`, "subclass", DECISION_LABEL.subclass, [], { feature: name }));
    else if (key === "abilityscoreimprovement") out.decisions.push(decision(`${id}:asiorfeat`, "asiorfeat", DECISION_LABEL.asiorfeat, ["Ability Score Increase", "Feat"], { feature: name }));
    else if (key === "expertise") out.decisions.push(...picksOf(`${id}`, "expertise", 2, [], { feature: name }));
    else if (version && FEAT_FEATURES_2024[key]) out.decisions.push(decision(`${id}:feat`, "feat", DECISION_LABEL.feat, [], { feature: name, category: FEAT_FEATURES_2024[key] }));
  }
  return out;
}
// What an Ability Score Improvement's choice opens (handleASIOrFeatDecision, handleClassASIOptionDecision).
export function asiOrFeatDecisions(id, choice, option) {
  if (choice === "Feat") return [decision(`${id}:feat`, "feat", DECISION_LABEL.feat, [])];
  if (choice !== "Ability Score Increase") return [];
  const out = [decision(`${id}:asioption`, "asioption", "Select Ability Score Option", ["Option 1: One +2", "Option 2: Two +1's"])];
  const opts = STATS.map(titled);
  if (/option 1/i.test(option ?? "")) out.push(decision(`${id}:asi:0`, "asi", "Increase Ability Score +2", opts, { adj: 2 }));
  else if (/option 2/i.test(option ?? "")) out.push(decision(`${id}:asi:0`, "asi", "Increase Ability Score +1", opts, { adj: 1 }), decision(`${id}:asi:1`, "asi", "Increase Ability Score +1", opts, { adj: 1 }));
  return out;
}

// Abilities (manager_charwizard_abilities.lua): the methods, the standard
// array, point buy's 27 points (8 to 15), 4d6 drop the lowest.
export const METHODS = ["Standard Array", "Point Buy", "Dice Roll"];
export const POINT_BUY_MAX = 27;
const COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const pointCost = (score) => (num(score) >= 15 ? 9 : COST[num(score)] ?? 0);
export const pointsSpent = (scores) => STATS.reduce((sum, stat) => sum + pointCost(scores[stat]), 0);
export const GEN_ROLL = "4d6d1";
// Swap with the next ability right or left (handleAbilitySwapRight / Left).
export function swapAbility(scores, stat, direction) {
  const index = STATS.indexOf(stat);
  const other = STATS[index + (direction === "right" ? 1 : -1)];
  if (!other) return scores;
  return { ...scores, [stat]: scores[other], [other]: scores[stat] };
}

// Spells a class knows at a level (SRD 5.2.1 class tables; FG shows them as the counts to aim for).
const CANTRIPS = {
  bard: [2, 4, 10],
  cleric: [3, 4, 10],
  druid: [2, 4, 10],
  sorcerer: [4, 4, 10],
  warlock: [2, 4, 10],
  wizard: [3, 4, 10],
};
const PREPARED = {
  full: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  half: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  sorcerer: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  wizard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
};
export function spellCounts(className, level) {
  const key = String(className ?? "").toLowerCase();
  const at = Math.min(20, Math.max(1, Math.round(num(level, 1))));
  const cantrip = CANTRIPS[key];
  const cantrips = cantrip ? cantrip[0] + (at >= cantrip[1] ? 1 : 0) + (at >= cantrip[2] ? 1 : 0) : 0;
  const table = ["paladin", "ranger"].includes(key) ? PREPARED.half : PREPARED[key] ?? (["bard", "cleric", "druid"].includes(key) ? PREPARED.full : null);
  return { cantrips, prepared: table ? table[at - 1] : 0 };
}
// The class's spells (a spell's source names the classes that cast it), up to the highest slot it has.
export function classSpells(spells, className, maxLevel) {
  const pattern = new RegExp(`\\b${String(className ?? "").replace(/[^A-Za-z ]/g, "")}\\b`, "i");
  return spells.filter((spell) => num(spell.data?.level) <= maxLevel && (!spell.data?.source || pattern.test(String(spell.data.source)))).sort((a, b) => num(a.data?.level) - num(b.data?.level) || a.name.localeCompare(b.name));
}

// The coins of a game (FG's CurrencyManager): 5E's five, Descending Darkness's gold crowns.
export const currenciesOf = (profileId) => (profileId === "descending" ? ["GC"] : ["PP", "GP", "EP", "SP", "CP"]);
export const mainCurrency = (profileId) => (profileId === "descending" ? "GC" : "GP");
// updateTotalWealth: the main coin is custom + rolled, or custom + class + background wealth.
export function totalWealth({ custom = {}, rolled = 0, classGold = 0, backgroundGold = 0, profileId = "dnd5e" }) {
  const main = mainCurrency(profileId);
  return Object.fromEntries(currenciesOf(profileId).map((coin) => [coin, num(custom[coin], 0) + (coin === main ? (rolled > 0 ? rolled : classGold + backgroundGold) : 0)]));
}
// Extra items (equipment_sub_additems.lua): every item but treasure, wondrous items and magic.
export const addableItem = (item) => !/^(treasure|wondrous item|woundrous item)$/i.test(String(item?.data?.type ?? "").trim()) && !/magic/i.test(String(item?.data?.properties ?? ""));
export const itemKind = (item) => (/^weapon$/i.test(String(item?.data?.type ?? "")) ? "weapon" : /^armor$/i.test(String(item?.data?.type ?? "")) ? "armor" : "gear");
