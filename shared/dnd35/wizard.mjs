// Kraken's D&D 3.5E character wizard, ported from the GM's own Fantasy
// Grounds extension (KrakenCharWizard35E, manager_charwizard35e.lua): its
// pages (Abilities, Race, Class, Languages, Alignment, Skills, Feats, Gear,
// Spells, Details, Commit), its tables and its rules, as plain functions on a
// build (the choices made so far) and the campaign's books. The window
// (src/characters/Wizard35.tsx) shows them; the host builds the character
// from the spec they make (rules.mjs buildFromSpec), as an agent's spec.
//
// A build: { method, rolled, rolledEach {stat}, lowRerolled {stat}, abilities
// {stat: base score}, increases {stat: n}, targetLevel, race (name), plan
// [{name, levels}], adding, languages [names], alignment, skills {"Craft
// (alchemy)": ranks}, feats [{id, name, base, target}], pendingTarget, gold
// (gp, null until rolled), equipment {item key: qty}, spells [{id, bucket,
// name, classkey, classlabel, level, record}] (class choices too: deity,
// domain, school...), details {name, gender, age, height, weight, deity,
// appearance, notes} }.
// The books (makeLib): { races, classes, feats, items, spells, domains }.
// The GM's options (FG's CW35M1-4, CW35RL, CW35LOW, CW35VOTK): { methods
// [1..4], rollLock, lowReroll, vault }.

export const PAGES = ["basics", "race", "class", "languages", "alignment", "skills", "feats", "equipment", "spells", "details", "commit"];
export const PAGE_LABEL = { basics: "Abilities", race: "Race", class: "Class", languages: "Languages", alignment: "Alignment", skills: "Skills", feats: "Feats", equipment: "Gear", spells: "Spells", details: "Details", commit: "Commit" };
export const PAGE_HEADER = { basics: "Ability Scores", race: "Choose Race", class: "Choose Class", languages: "Choose Languages", alignment: "Choose Alignment", skills: "Spend Skill Points", feats: "Choose Feats", equipment: "Buy Starting Equipment", spells: "Class Choices and Spells", details: "Character Details", commit: "Commit Character" };
export const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
export const MAX_LEVEL = 20;
const DEFAULT_ABILITIES = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

export const ABILITY_METHODS = [
  { id: 1, name: "PHB Default", short: "4d6 drop lowest, arrange", arrange: true, formula: "4d6d1" },
  { id: 2, name: "Classic", short: "3d6 in order", arrange: false, formula: "3d6" },
  { id: 3, name: "Standard Array", short: "15, 14, 13, 12, 10, 8", arrange: true, scores: [15, 14, 13, 12, 10, 8] },
  { id: 4, name: "Manual Entry", short: "type scores directly", arrange: true, manual: true },
];
export const methodLabel = (method) => (method ? `${method.name} (${method.short})` : "");
export const DEFAULT_OPTIONS = { methods: [1, 2, 3, 4], rollLock: false, lowReroll: false, vault: false };
export function wizardOptions(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const methods = Array.isArray(value.methods) ? [...new Set(value.methods.map(Number).filter((n) => n >= 1 && n <= 4))].sort() : DEFAULT_OPTIONS.methods;
  return { methods: methods.length ? methods : [1], rollLock: Boolean(value.rollLock), lowReroll: Boolean(value.lowReroll), vault: Boolean(value.vault) };
}

export const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"];

// Starting gold by class (PHB Table 7-1); above 1st level, wealth by level (DMG Table 5-1).
export const STARTING_GOLD = {
  barbarian: { expr: "4d4*10", average: 100 },
  bard: { expr: "4d4*10", average: 100 },
  cleric: { expr: "5d4*10", average: 125 },
  druid: { expr: "2d4*10", average: 50 },
  fighter: { expr: "6d4*10", average: 150 },
  monk: { expr: "5d4", average: 12 },
  paladin: { expr: "6d4*10", average: 150 },
  ranger: { expr: "6d4*10", average: 150 },
  rogue: { expr: "5d4*10", average: 125 },
  sorcerer: { expr: "3d4*10", average: 75 },
  wizard: { expr: "3d4*10", average: 75 },
  warlock: { expr: "4d4*10", average: 100 },
  mesmer: { expr: "4d4*10", average: 100 },
  necromancer: { expr: "3d4*10", average: 75 },
};
export const WEALTH_BY_LEVEL_GP = [0, 0, 900, 2700, 5400, 9000, 13000, 19000, 27000, 36000, 49000, 66000, 88000, 110000, 150000, 200000, 260000, 340000, 440000, 580000, 760000];

export const RACE_ABILITY_MODS = {
  dwarf: { constitution: 2, charisma: -2 },
  drow: { dexterity: 2, constitution: -2, intelligence: 2, charisma: 2 },
  elf: { dexterity: 2, constitution: -2 },
  gnome: { constitution: 2, strength: -2 },
  "half-orc": { strength: 2, intelligence: -2, charisma: -2 },
  halfling: { dexterity: 2, strength: -2 },
  tiefling: { dexterity: 2, intelligence: 2, charisma: -2 },
  goblin: { strength: -2, dexterity: 2, charisma: -2 },
};
export const RACE_LEVEL_ADJUSTMENT = { drow: 2, tiefling: 1 };
export const RACE_FAVORED_CLASS = { human: "any", dwarf: "fighter", elf: "wizard", gnome: "bard", "half-elf": "any", "half-orc": "barbarian", halfling: "rogue", tiefling: "rogue", goblin: "rogue", drow: { wizard: true, cleric: true } };

export const SKILL_ORDER = [
  ["Appraise"], ["Balance"], ["Bluff"], ["Climb"], ["Concentration"], ["Craft", "alchemy"], ["Craft", "chosen specialty"], ["Decipher Script"], ["Diplomacy"],
  ["Disable Device"], ["Disguise"], ["Escape Artist"], ["Forgery"], ["Gather Information"], ["Handle Animal"], ["Heal"], ["Hide"], ["Intimidate"], ["Jump"],
  ["Knowledge", "arcana"], ["Knowledge", "dungeoneering"], ["Knowledge", "geography"], ["Knowledge", "history"], ["Knowledge", "local"], ["Knowledge", "nature"],
  ["Knowledge", "nobility and royalty"], ["Knowledge", "religion"], ["Knowledge", "the planes"], ["Listen"], ["Move Silently"], ["Open Lock"], ["Perform", "chosen specialty"],
  ["Profession", "chosen specialty"], ["Ride"], ["Search"], ["Sense Motive"], ["Sleight of Hand"], ["Speak Language"], ["Spellcraft"], ["Spot"], ["Survival"], ["Swim"],
  ["Tumble"], ["Use Magic Device"], ["Use Rope"],
].map(([label, sub]) => ({ label, sub: sub ?? "", name: sub ? `${label} (${sub})` : label }));

const SPELL_KNOWN_LEVEL1 = { bard: { 0: 4 }, sorcerer: { 0: 4, 1: 2 }, wizard: { 1: 3 } };
const row = (...counts) => Object.fromEntries(counts.map((count, level) => [level, count]));
export const SPELLS_KNOWN_BY_LEVEL = {
  bard: [null, row(4), row(5, 2), row(6, 3), row(6, 3, 2), row(6, 4, 3), row(6, 4, 3), row(6, 4, 4, 2), row(6, 4, 4, 3), row(6, 4, 4, 3), row(6, 4, 4, 4, 2), row(6, 4, 4, 4, 3), row(6, 4, 4, 4, 3), row(6, 4, 4, 4, 4, 2), row(6, 4, 4, 4, 4, 3), row(6, 4, 4, 4, 4, 3), row(6, 5, 4, 4, 4, 4, 2), row(6, 5, 5, 4, 4, 4, 3), row(6, 5, 5, 5, 4, 4, 3), row(6, 5, 5, 5, 5, 4, 4), row(6, 5, 5, 5, 5, 5, 4)],
  sorcerer: [null, row(4, 2), row(5, 2), row(5, 3), row(6, 3, 1), row(6, 4, 2), row(7, 4, 2, 1), row(7, 5, 3, 2), row(8, 5, 3, 2, 1), row(8, 5, 4, 3, 2), row(9, 5, 4, 3, 2, 1), row(9, 5, 5, 4, 3, 2), row(9, 5, 5, 4, 3, 2, 1), row(9, 5, 5, 4, 4, 3, 2), row(9, 5, 5, 4, 4, 3, 2, 1), row(9, 5, 5, 4, 4, 4, 3, 2), row(9, 5, 5, 4, 4, 4, 3, 2, 1), row(9, 5, 5, 4, 4, 4, 3, 3, 2), row(9, 5, 5, 4, 4, 4, 3, 3, 2, 1), row(9, 5, 5, 4, 4, 4, 3, 3, 3, 2), row(9, 5, 5, 4, 4, 4, 3, 3, 3, 3)],
};
SPELLS_KNOWN_BY_LEVEL.mesmer = SPELLS_KNOWN_BY_LEVEL.bard;

export const MANUAL_CLASS_CHOICES = {
  fighter: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20].map((level) => ({ level, note: "fighter bonus feat must be a legal fighter bonus feat" })),
  monk: [
    { level: 1, note: "choose monk bonus feat: Improved Grapple or Stunning Fist" },
    { level: 2, note: "choose monk bonus feat: Combat Reflexes or Deflect Arrows" },
    { level: 6, note: "choose monk bonus feat: Improved Disarm or Improved Trip" },
  ],
  wizard: [5, 10, 15, 20].map((level) => ({ level, note: "wizard bonus feat must be metamagic, item creation, or Spell Mastery" })),
  necromancer: [
    { level: 1, note: "set up rebuke/command undead tracking and necromancer spellbook choices" },
    { level: 5, note: "choose or create commanded undead cohort" },
    { level: 8, note: "track fear aura 1/day" },
    { level: 11, note: "update undead mastery control limits" },
    { level: 13, note: "track death ward 1/day" },
    { level: 16, note: "update fear aura to 2/day" },
    { level: 17, note: "update greater undead mastery bonuses" },
    { level: 20, note: "review Master of the Black Art daily necromancy boost" },
  ],
};

export const ALL_STANDARD_LANGUAGES = ["Abyssal", "Aquan", "Auran", "Celestial", "Common", "Draconic", "Dwarven", "Elven", "Giant", "Gnoll", "Gnome", "Goblin", "Halfling", "Ignan", "Infernal", "Orc", "Sylvan", "Terran", "Undercommon"];
export const RACE_LANGUAGES = {
  human: { automatic: ["Common"], bonus: "any" },
  dwarf: { automatic: ["Common", "Dwarven"], bonus: ["Giant", "Gnome", "Goblin", "Orc", "Terran", "Undercommon"] },
  elf: { automatic: ["Common", "Elven"], bonus: ["Draconic", "Gnoll", "Gnome", "Goblin", "Orc", "Sylvan"] },
  gnome: { automatic: ["Common", "Gnome"], bonus: ["Draconic", "Dwarven", "Elven", "Giant", "Goblin", "Orc"] },
  "half-elf": { automatic: ["Common", "Elven"], bonus: "any" },
  "half-orc": { automatic: ["Common", "Orc"], bonus: ["Draconic", "Giant", "Gnoll", "Goblin", "Abyssal"] },
  halfling: { automatic: ["Common", "Halfling"], bonus: ["Dwarven", "Elven", "Gnome", "Goblin", "Orc"] },
  drow: { automatic: ["Common", "Elven", "Undercommon"], bonus: ["Abyssal", "Aquan", "Draconic", "Drow Sign Language", "Gnome", "Goblin"] },
  tiefling: { automatic: ["Common", "Infernal"], bonus: ["Draconic", "Dwarven", "Elven", "Gnome", "Goblin", "Halfling", "Orc"] },
  goblin: { automatic: ["Goblin"], bonus: ["Common", "Draconic", "Elven", "Giant", "Gnoll", "Orc"] },
};

// Complete Arcane's invocations (names and grades only).
export const WARLOCK_INVOCATIONS = [
  ...["Baleful Utterance", "Beguiling Influence", "Breath of the Night", "Dark One's Own Luck", "Darkness", "Devil's Sight", "Eldritch Spear", "Entropic Warding", "Frightful Blast", "Hideous Blow", "Leaps and Bounds", "See the Unseen", "Sickening Blast", "Spiderwalk", "Summon Swarm"].map((name) => ({ name, grade: 1 })),
  ...["Beshadowed Blast", "Brimstone Blast", "Charm", "Curse of Despair", "The Dead Walk", "Eldritch Chain", "Fell Flight", "Flee the Scene", "Hellrime Blast", "Hungry Darkness", "Stony Grasp", "Voidsense", "Voracious Dispelling", "Walk Unseen", "Wall of Gloom"].map((name) => ({ name, grade: 2 })),
  ...["Bewitching Blast", "Chilling Tentacles", "Devour Magic", "Eldritch Cone", "Enervating Shadow", "Noxious Blast", "Repelling Blast", "Tenacious Plague", "Vitriolic Blast", "Wall of Perilous Flame", "Warlock's Call"].map((name) => ({ name, grade: 3 })),
  ...["Dark Discorporation", "Dark Foresight", "Eldritch Doom", "Path of Shadow", "Retributive Invisibility", "Utterdark Blast", "Word of Changing"].map((name) => ({ name, grade: 4 })),
];
const WARLOCK_INVOCATIONS_KNOWN = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 11, 12];
const warlockGrade = (level) => (level >= 16 ? 4 : level >= 11 ? 3 : level >= 6 ? 2 : 1);
const warlockGradeLabel = (grade) => ["Least", "Lesser", "Greater", "Dark"][grade - 1] ?? "Invocation";
const MESMER_SPELL_BY_NAME = {
  daze: 0, "detect magic": 0, "ghost sound": 0, light: 0, "mage hand": 0, prestidigitation: 0, "read magic": 0, resistance: 0,
  "charm person": 1, "color spray": 1, "disguise self": 1, hypnotism: 1, "magic weapon": 1, "silent image": 1, ventriloquism: 1,
  blur: 2, "hypnotic pattern": 2, invisibility: 2, "mirror image": 2, scare: 2, "see invisibility": 2, "touch of idiocy": 2,
  "deep slumber": 3, displacement: 3, heroism: 3, "hold person": 3, "invisibility sphere": 3, "major image": 3, suggestion: 3,
  "charm monster": 4, confusion: 4, "dimension door": 4, "greater invisibility": 4, "phantasmal killer": 4, "rainbow pattern": 4,
  "dominate person": 5, "mind fog": 5, "persistent image": 5, "shadow evocation": 5, "true seeing": 5,
  "greater heroism": 6, "mass suggestion": 6, mislead: 6, "programmed image": 6, "shadow walk": 6, veil: 6,
};
const NECROMANCER_SUPPORT_SPELLS = new Set([
  "detect magic", "read magic", "resistance", "arcane mark", "mage hand", "prestidigitation", "alarm", "comprehend languages", "detect secret doors", "endure elements", "identify", "mage armor", "protection from good", "protection from evil",
  "arcane lock", "detect thoughts", "false life", "gentle repose", "resist energy", "see invisibility", "dispel magic", "halt undead", "magic circle against good", "magic circle against evil", "nondetection", "protection from energy", "speak with dead",
  "dimensional anchor", "enervation", "fear", "scrying", "break enchantment", "dismissal", "magic jar", "permanency", "analyze dweomer", "antimagic field", "circle of death", "create undead", "true seeing",
]);

const STARTER_GEAR_COMMON = ["backpack", "bedroll", "blanket", "flint and steel", "waterskin", "rope", "rations", "torch", "lantern", "oil", "pouch", "sack", "whetstone"];
export const STARTER_GEAR_BY_CLASS = {
  barbarian: ["battleaxe", "greatsword", "greataxe", "longsword", "shortbow", "longbow", "arrows", "hide armor", "hide", "scale mail", "chain shirt"],
  bard: ["rapier", "short sword", "shortbow", "arrows", "leather armor", "leather", "studded leather", "musical instrument"],
  cleric: ["mace light", "mace heavy", "heavy mace", "light mace", "morningstar", "scale mail", "chainmail", "chain mail", "shield heavy wooden", "shield light wooden", "shield heavy steel", "shield light steel", "buckler", "holy symbol"],
  druid: ["scimitar", "spear", "sling", "bullets", "leather armor", "leather", "shield heavy wooden", "shield light wooden", "holly", "mistletoe"],
  fighter: ["longsword", "battleaxe", "greatsword", "greataxe", "longbow", "shortbow", "arrows", "scale mail", "chainmail", "chain mail", "shield heavy wooden", "shield light wooden", "shield heavy steel", "shield light steel", "tower shield", "buckler"],
  monk: ["quarterstaff", "sling", "bullets", "dart", "javelin"],
  paladin: ["longsword", "battleaxe", "lance", "morningstar", "scale mail", "chainmail", "chain mail", "shield heavy wooden", "shield light wooden", "shield heavy steel", "shield light steel", "buckler", "holy symbol"],
  ranger: ["longsword", "short sword", "longbow", "shortbow", "arrows", "leather armor", "leather", "studded leather", "hide armor", "hide"],
  rogue: ["rapier", "short sword", "dagger", "shortbow", "arrows", "leather armor", "leather", "studded leather", "thieves' tools", "thieves tools"],
  sorcerer: ["dagger", "quarterstaff", "light crossbow", "crossbow light", "bolts", "spell component pouch"],
  wizard: ["dagger", "quarterstaff", "light crossbow", "crossbow light", "bolts", "spell component pouch", "spellbook", "spell book"],
  warlock: ["dagger", "spear", "quarterstaff", "light crossbow", "crossbow light", "bolts", "leather armor", "leather", "studded leather", "spell component pouch"],
  mesmer: ["rapier", "short sword", "dagger", "shortbow", "arrows", "leather armor", "leather", "studded leather", "spell component pouch"],
  necromancer: ["dagger", "quarterstaff", "light crossbow", "crossbow light", "bolts", "spell component pouch", "spellbook", "spell book"],
};
const VAULT_HANDMEDOWN_TERMS = ["poor", "secondhand", "hand-me-down", "hand me down", "starter"];

// Class choices made on the Spells page (PHB tables).
export const WIZARD_SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
export const PREPARED_CASTERS = { cleric: true, druid: true, paladin: true, ranger: true };
export const DEITIES = [
  { name: "Heironeous", align: "LG", domains: ["Good", "Law", "War"] },
  { name: "Moradin", align: "LG", domains: ["Earth", "Good", "Law", "Protection"] },
  { name: "Yondalla", align: "LG", domains: ["Good", "Law", "Protection"] },
  { name: "Ehlonna", align: "NG", domains: ["Animal", "Good", "Plant", "Sun"] },
  { name: "Garl Glittergold", align: "NG", domains: ["Good", "Protection", "Trickery"] },
  { name: "Pelor", align: "NG", domains: ["Good", "Healing", "Strength", "Sun"] },
  { name: "Corellon Larethian", align: "CG", domains: ["Chaos", "Good", "Protection", "War"] },
  { name: "Kord", align: "CG", domains: ["Chaos", "Good", "Luck", "Strength"] },
  { name: "Wee Jas", align: "LN", domains: ["Death", "Law", "Magic"] },
  { name: "St. Cuthbert", align: "LN", domains: ["Destruction", "Law", "Protection", "Strength"] },
  { name: "Boccob", align: "NN", domains: ["Knowledge", "Magic", "Trickery"] },
  { name: "Fharlanghn", align: "NN", domains: ["Luck", "Protection", "Travel"] },
  { name: "Obad-Hai", align: "NN", domains: ["Air", "Animal", "Earth", "Fire", "Plant", "Water"] },
  { name: "Olidammara", align: "CN", domains: ["Chaos", "Luck", "Trickery"] },
  { name: "Hextor", align: "LE", domains: ["Destruction", "Evil", "Law", "War"] },
  { name: "Nerull", align: "NE", domains: ["Death", "Evil", "Trickery"] },
  { name: "Vecna", align: "NE", domains: ["Evil", "Knowledge", "Magic"] },
  { name: "Erythnul", align: "CE", domains: ["Chaos", "Evil", "Trickery", "War"] },
  { name: "Gruumsh", align: "CE", domains: ["Chaos", "Evil", "Strength", "War"] },
];
export const NO_DEITY = "No deity (devoted to an ideal)";
export const FAMILIARS = [
  ["Bat", "Master gains +3 on Listen checks"], ["Cat", "Master gains +3 on Move Silently checks"], ["Hawk", "Master gains +3 on Spot checks in bright light"], ["Lizard", "Master gains +3 on Climb checks"],
  ["Owl", "Master gains +3 on Spot checks in shadows"], ["Rat", "Master gains +2 on Fortitude saves"], ["Raven", "Master gains +3 on Appraise checks; the raven speaks one language"], ["Snake, Tiny viper", "Master gains +3 on Bluff checks"],
  ["Toad", "Master gains +3 hit points"], ["Weasel", "Master gains +2 on Reflex saves"], ["No familiar", ""],
];
export const COMPANIONS = ["Badger", "Camel", "Dire rat", "Dog", "Dog, riding", "Eagle", "Hawk", "Horse, heavy", "Horse, light", "Owl", "Pony", "Porpoise", "Shark, Medium", "Snake, Medium viper", "Snake, Small viper", "Squid", "Wolf", "Choose later"];
export const MOUNTS = ["Heavy warhorse (Medium paladin)", "Warpony (Small paladin)"];
export const COMBAT_STYLES = {
  Archery: [[2, "Rapid Shot"], [6, "Manyshot"], [11, "Improved Precise Shot"]],
  "Two-Weapon Combat": [[2, "Two-Weapon Fighting"], [6, "Improved Two-Weapon Fighting"], [11, "Greater Two-Weapon Fighting"]],
};
export const FAVORED_ENEMIES = ["Aberration", "Animal", "Construct", "Dragon", "Elemental", "Fey", "Giant", "Humanoid (aquatic)", "Humanoid (dwarf)", "Humanoid (elf)", "Humanoid (goblinoid)", "Humanoid (gnoll)", "Humanoid (gnome)", "Humanoid (halfling)", "Humanoid (human)", "Humanoid (orc)", "Humanoid (reptilian)", "Magical beast", "Monstrous humanoid", "Ooze", "Outsider (air)", "Outsider (chaotic)", "Outsider (earth)", "Outsider (evil)", "Outsider (fire)", "Outsider (good)", "Outsider (lawful)", "Outsider (native)", "Outsider (water)", "Plant", "Undead", "Vermin"];
export const ROGUE_SPECIALS = [
  ["Crippling Strike", "Sneak attacks also deal 2 points of Strength damage."],
  ["Defensive Roll", "Once per day, when a blow would reduce you to 0 or fewer hp, a Reflex save (DC = damage) halves it."],
  ["Improved Evasion", "Half damage on a failed Reflex save against attacks that allow one for half."],
  ["Opportunist", "Once per round, an attack of opportunity against a foe just struck in melee by another character."],
  ["Skill Mastery", "Take 10 with 3 + Int modifier chosen skills even when stressed or distracted."],
  ["Slippery Mind", "A second save, one round later, against an enchantment that failed."],
  ["Feat", "A bonus feat (choose it on the Feats page)."],
];
export const CHOICE_KINDS = {
  deity: { label: "deity", order: 1 }, domain: { label: "domains", order: 2 }, channel: { label: "turn or rebuke undead", order: 3 },
  school: { label: "school (specialist or Generalist)", order: 4 }, prohibited: { label: "prohibited schools", order: 5 },
  familiar: { label: "familiar", order: 6 }, companion: { label: "animal companion", order: 7 }, mount: { label: "special mount", order: 8 },
  combatstyle: { label: "combat style", order: 9 }, favoredenemy: { label: "new favored enemies", order: 10 },
  febonus: { label: "favored enemy +2 increases", order: 11, repeatable: true }, roguespecial: { label: "special abilities", order: 12 },
  advlearning: { label: "Advanced Learning: Illusion or Enchantment spells", order: 13 },
};
const MESMER_ADVANCED_LEARNING_LEVELS = [3, 7, 11, 15, 19];

// Weapons and armor each class (and race) is proficient with.
const CLASS_WEAPONS = {
  barbarian: { simple: true, martial: true }, fighter: { simple: true, martial: true }, paladin: { simple: true, martial: true }, ranger: { simple: true, martial: true },
  cleric: { simple: true }, sorcerer: { simple: true },
  bard: { simple: true, list: ["longsword", "rapier", "sap", "short sword", "shortbow", "whip"] },
  rogue: { simple: true, list: ["hand crossbow", "rapier", "sap", "shortbow", "short sword"] },
  druid: { list: ["club", "dagger", "dart", "quarterstaff", "scimitar", "sickle", "shortspear", "sling", "spear"] },
  monk: { list: ["club", "light crossbow", "heavy crossbow", "dagger", "handaxe", "javelin", "kama", "nunchaku", "quarterstaff", "sai", "shuriken", "siangham", "sling"] },
  wizard: { list: ["club", "dagger", "heavy crossbow", "light crossbow", "quarterstaff"] },
  warlock: { simple: true },
  mesmer: { simple: true, list: ["rapier", "short sword", "sap", "shortbow", "whip", "hand crossbow"] },
  necromancer: { list: ["club", "dagger", "heavy crossbow", "light crossbow", "quarterstaff"] },
};
const RACE_WEAPONS = { elf: ["longsword", "rapier", "longbow", "composite longbow", "shortbow", "composite shortbow"], drow: ["hand crossbow", "rapier", "short sword"] };
const RACE_MARTIAL = { dwarf: ["dwarven waraxe", "dwarven urgrosh"], gnome: ["gnome hooked hammer"] };
const CLASS_ARMOR = {
  barbarian: { light: true, medium: true, shield: true }, bard: { light: true }, cleric: { light: true, medium: true, heavy: true, shield: true },
  druid: { light: true, medium: true, shield: true }, fighter: { light: true, medium: true, heavy: true, shield: true, tower: true },
  paladin: { light: true, medium: true, heavy: true, shield: true }, ranger: { light: true, shield: true }, rogue: { light: true }, warlock: { light: true }, mesmer: { light: true },
};
const TARGET_FEATS = {
  "weapon focus": "weapon", "weapon specialization": "weapon", "greater weapon focus": "weapon", "greater weapon specialization": "weapon", "improved critical": "weapon",
  "martial weapon proficiency": "martial", "exotic weapon proficiency": "exotic", "rapid reload": "crossbow",
  "spell focus": "school", "greater spell focus": "school", "skill focus": "skill",
};
const FEAT_ABILITY_ABBR = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };
const BAB_RATE = { barbarian: 1, fighter: 1, paladin: 1, ranger: 1, bard: 0.75, cleric: 0.75, druid: 0.75, monk: 0.75, rogue: 0.75, warlock: 0.75, mesmer: 0.75, sorcerer: 0.5, wizard: 0.5, necromancer: 0.5 };
const CASTER_CLASSES = { bard: 1, cleric: 1, druid: 1, sorcerer: 1, wizard: 1, necromancer: 1, mesmer: 1, paladin: 0.5, ranger: 0.5 };
const CLASS_BONUS_FEAT_LEVELS = { fighter: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20], monk: [1, 2, 6], wizard: [5, 10, 15, 20] };

// --- Small helpers -------------------------------------------------------------
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
export const abilityMod = (score) => Math.floor((num(score, 10) - 10) / 2);
const titled = (text) => String(text ?? "").replace(/^\w/, (letter) => letter.toUpperCase());
// FG's normalizeText: lowercase, punctuation to spaces (apostrophes kept), spaces collapsed.
const normalizeText = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ");

export function raceKeyOf(text) {
  const s = String(text ?? "").toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (s.includes("drow")) return "drow";
  if (s.includes("tiefling")) return "tiefling";
  if (s.includes("goblin")) return "goblin";
  if (s.includes("half orc") || s.includes("halforc")) return "half-orc";
  if (s.includes("half elf") || s.includes("halfelf")) return "half-elf";
  if (s.includes("halfling")) return "halfling";
  if (s.includes("dwarf") || s.includes("dwarven")) return "dwarf";
  if (s.includes("gnome")) return "gnome";
  if (s.includes("elf") || s.includes("elven")) return "elf";
  if (s.includes("human")) return "human";
  return s;
}
const CLASS_KEYS = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "wizard", "warlock", "mesmer", "necromancer"];
export function classKeyOf(text) {
  const s = String(text ?? "").toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return CLASS_KEYS.find((key) => s.includes(key)) ?? s;
}
// A race's ability adjustments: Kraken's table for the races it knows, else none.
export const raceMods = (raceName) => RACE_ABILITY_MODS[raceKeyOf(raceName)] ?? {};
export const knownRace = (raceName) => Object.hasOwn(RACE_FAVORED_CLASS, raceKeyOf(raceName));
export const raceLevelAdjustment = (raceName) => RACE_LEVEL_ADJUSTMENT[raceKeyOf(raceName)] ?? 0;

// --- The books -------------------------------------------------------------------
// records: [{ id, type, name, data, source }]: the campaign's 3.5E records.
const sourceOf = (record) => /@(.+)$/.exec(String(record?.data?.fgPath ?? ""))?.[1] ?? String(record?.source ?? "") ?? "Campaign";
const pathOf = (record) => String(record?.data?.fgPath ?? record?.id ?? "").replace(/@.*$/, "");
export function makeLib(records) {
  const all = (Array.isArray(records) ? records : []).filter((record) => record && record.name);
  const unique = (type) => {
    const seen = new Map();
    for (const record of all.filter((item) => (Array.isArray(type) ? type.includes(item.type) : item.type === type))) {
      const key = String(record.name).toLowerCase();
      if (!seen.has(key)) seen.set(key, { key: String(record.id ?? record.name), name: String(record.name), data: record.data ?? {}, source: sourceOf(record) || "Campaign", path: pathOf(record) });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const items = all.filter((record) => record.type === "item").map((record) => ({ key: String(record.id ?? record.name), name: String(record.name), data: record.data ?? {}, source: sourceOf(record) || "Campaign", path: pathOf(record) }));
  const spells = unique(["spell", "spelldesc"]);
  const byPath = new Map(spells.map((spell) => [String(spell.data.fgPath ?? ""), spell]));
  const domains = [];
  for (const list of all.filter((record) => record.type === "spelllists" && record.data?.domains)) {
    for (const [id, domain] of Object.entries(list.data.domains)) {
      const name = String(domain?.description ?? "").trim();
      if (!name || domains.some((item) => item.name.toLowerCase() === name.toLowerCase())) continue;
      const entries = Object.entries(domain.spells ?? {}).map(([spellId, entry]) => ({ level: num(entry?.level), name: byPath.get(String(entry?.link?.recordname ?? ""))?.name ?? titled(spellId) }));
      domains.push({ key: `${list.id ?? "domains"}:${id}`, name, grantedpower: plain(domain.grantedpower), spells: entries.sort((a, b) => a.level - b.level) });
    }
  }
  return { races: unique("race"), classes: unique("class"), feats: unique("feat"), items, spells, domains: domains.sort((a, b) => a.name.localeCompare(b.name)) };
}
const findByName = (list, name) => list.find((item) => item.name.toLowerCase() === String(name ?? "").toLowerCase());

// --- A build ---------------------------------------------------------------------
export function newBuild(options) {
  const opts = wizardOptions(options);
  return { method: opts.methods.includes(1) ? 1 : opts.methods[0], rolled: false, rolledEach: {}, lowRerolled: {}, abilities: { ...DEFAULT_ABILITIES }, increases: {}, targetLevel: 1, race: null, plan: [], adding: false, languages: [], alignment: null, skills: {}, feats: [], pendingTarget: null, gold: null, equipment: {}, spells: [], details: { name: "" }, seq: 0 };
}
const methodOf = (b, opts) => ABILITY_METHODS.find((method) => method.id === currentMethod(b, opts)) ?? ABILITY_METHODS[0];
export function currentMethod(b, options) {
  const allowed = wizardOptions(options).methods;
  if (allowed.includes(b.method)) return b.method;
  return allowed.includes(1) ? 1 : allowed[0];
}
export const methodArranges = (b, opts) => methodOf(b, opts).arrange === true;
export const methodPerAbility = (b, opts) => {
  const method = methodOf(b, opts);
  return !method.manual && !method.scores && method.arrange === false;
};
export function setMethod(b, id, opts) {
  const method = ABILITY_METHODS.find((item) => item.id === id);
  if (!method || !wizardOptions(opts).methods.includes(id)) return b;
  // Not rolled yet (and not typed): the scores go back to 10.
  return { ...b, method: id, abilities: b.rolled || method.manual ? b.abilities : { ...DEFAULT_ABILITIES } };
}
export function canLowReroll(b, opts, stat) {
  return wizardOptions(opts).lowReroll && currentMethod(b, opts) === 1 && b.rolled === true && !b.lowRerolled?.[stat] && num(b.abilities[stat], 10) < 8;
}
export const swapScores = (b, from, to) => (from === to ? b : { ...b, abilities: { ...b.abilities, [from]: b.abilities[to], [to]: b.abilities[from] } });

export const raceOf = (b, lib) => (b.race ? findByName(lib.races, b.race) ?? null : null);
export const raceKey = (b) => raceKeyOf(b.race ?? "");
export const isHuman = (b) => raceKey(b) === "human";
export const levelAdjustment = (b) => raceLevelAdjustment(b.race ?? "");
const clampLevel = (n) => Math.min(MAX_LEVEL, Math.max(1, Math.floor(num(n, 1))));
export const targetClassLevel = (b) => Math.max(1, clampLevel(b.targetLevel) - levelAdjustment(b));
export const maxClassLevels = (b) => Math.max(1, MAX_LEVEL - levelAdjustment(b));
const clampClassLevel = (b, n) => Math.max(1, Math.min(clampLevel(n), MAX_LEVEL - levelAdjustment(b)));
export const plan = (b) => (b.plan ?? []).filter((entry) => num(entry.levels) > 0).map((entry) => ({ ...entry, key: classKeyOf(entry.name) }));
export const hasClassPlan = (b) => plan(b).length > 0;
export const totalLevels = (b) => plan(b).reduce((sum, entry) => sum + num(entry.levels), 0);
export const primaryClass = (b) => plan(b)[0] ?? null;
export const effectiveLevel = (b) => totalLevels(b) + levelAdjustment(b);
export function classLevelMap(b) {
  const levels = {};
  const labels = {};
  for (const entry of plan(b)) {
    levels[entry.key] = (levels[entry.key] ?? 0) + num(entry.levels);
    labels[entry.key] ??= entry.name;
  }
  return { levels, labels };
}
const classRecord = (lib, entry) => (entry ? findByName(lib.classes, entry.name) ?? null : null);
export function planSummary(b) {
  const parts = plan(b).map((entry) => `${entry.name} ${entry.levels}`);
  if (parts.length === 0) return "None selected";
  const la = levelAdjustment(b);
  return `${parts.join(" / ")}${la > 0 ? ` (LA +${la} / ECL ${effectiveLevel(b)})` : ""}`;
}
export const levelSummaryLabel = (b) => `Level ${totalLevels(b)}`;

// What changing an earlier choice clears, as FG's wizard.
const clearAfterPlan = (b) => ({ ...b, pendingTarget: null, alignment: null, skills: {}, feats: [], spells: [], equipment: {}, gold: null });
const syncTargetFromPlan = (b) => (totalLevels(b) > 0 ? { ...b, targetLevel: clampLevel(totalLevels(b) + levelAdjustment(b)) } : b);

export function setTargetLevel(b, level) {
  const next = clampLevel(level);
  let out = { ...b, targetLevel: next };
  const entries = (b.plan ?? []).filter((entry) => num(entry.levels) > 0);
  if (entries.length === 1) out.plan = [{ ...entries[0], levels: targetClassLevel(out) }];
  else if (entries.length > 1) out = syncTargetFromPlan(out);
  if (out.targetLevel !== b.targetLevel) out = { ...out, skills: {}, feats: [], equipment: {}, spells: [], gold: null };
  return out;
}
export function chooseRace(b, name) {
  return { ...b, race: name || null, plan: [], adding: false, alignment: null, skills: {}, feats: [], equipment: {}, spells: [], gold: null, pendingTarget: null };
}
export const pendingClassLevels = (b, wanted) => {
  const levels = num(wanted) > 0 ? num(wanted) : Math.max(1, targetClassLevel(b) - totalLevels(b));
  return Math.min(clampClassLevel(b, levels), Math.max(0, maxClassLevels(b) - totalLevels(b)));
};
// Choose a class: the plan's only class, or (Add Class) one more in a multiclass plan.
export function chooseClass(b, name, wanted) {
  if (!name) return { ...clearAfterPlan(b), plan: [], adding: false };
  const adding = b.adding && hasClassPlan(b);
  const levels = adding ? Math.max(0, Math.min(num(wanted) || 1, maxClassLevels(b) - totalLevels(b))) : clampClassLevel(b, num(wanted) || targetClassLevel(b));
  if (levels <= 0) return { ...b, adding: false, problem: "No class levels remain under the selected race's effective character level cap." };
  let entries;
  if (adding) {
    const existing = b.plan.find((entry) => entry.name === name);
    entries = existing
      ? b.plan.map((entry) => (entry === existing ? { ...entry, levels: Math.min(clampClassLevel(b, num(entry.levels) + levels), Math.max(1, maxClassLevels(b) - (totalLevels(b) - num(entry.levels)))) } : entry))
      : [...b.plan, { name, levels }];
  } else entries = [{ name, levels }];
  return syncTargetFromPlan({ ...clearAfterPlan(b), plan: entries, adding: false });
}
export function setClassLevels(b, wanted) {
  const entries = plan(b);
  if (entries.length === 0) return b;
  const levels = clampClassLevel(b, wanted);
  let next;
  if (entries.length === 1) next = [{ name: entries[0].name, levels: Math.min(levels, maxClassLevels(b)) }];
  else {
    const others = entries.slice(0, -1).reduce((sum, entry) => sum + num(entry.levels), 0);
    next = entries.map((entry, index) => ({ name: entry.name, levels: index === entries.length - 1 ? Math.max(1, Math.min(levels, maxClassLevels(b) - others)) : entry.levels }));
  }
  return syncTargetFromPlan({ ...clearAfterPlan(b), plan: next });
}
export const startAddClass = (b) => (hasClassPlan(b) && maxClassLevels(b) - totalLevels(b) > 0 ? { ...b, adding: true } : b);

// --- Abilities -------------------------------------------------------------------
export const increasesDue = (b) => Math.max(0, Math.floor(Math.max(targetClassLevel(b), totalLevels(b)) / 4));
export const increasesChosen = (b) => STATS.reduce((sum, stat) => sum + Math.max(0, Math.floor(num(b.increases?.[stat]))), 0);
export const increasesComplete = (b) => increasesChosen(b) === increasesDue(b);
export const raceMod = (b, stat) => num(raceMods(b.race ?? "")[stat]);
export const sheetScore = (b, stat) => num(b.abilities?.[stat], 10) + Math.max(0, Math.floor(num(b.increases?.[stat])));
export const finalScore = (b, stat) => sheetScore(b, stat) + raceMod(b, stat);
export const intMod = (b) => abilityMod(finalScore(b, "intelligence"));
export function increaseSummary(b) {
  const due = increasesDue(b);
  if (due <= 0) return "No level-based ability increases due.";
  const parts = STATS.filter((stat) => num(b.increases?.[stat]) > 0).map((stat) => `${titled(stat).slice(0, 3)} +${num(b.increases[stat])}`);
  return `Level ability increases: ${parts.join(", ") || "none assigned"} (${increasesChosen(b)}/${due})`;
}

// --- Class skills, skill points ----------------------------------------------------
export function isClassSkillForText(text, label, sub) {
  const t = plain(text).toLowerCase();
  if (!t) return false;
  const l = String(label ?? "").toLowerCase();
  const s = String(sub ?? "").toLowerCase();
  if (!l) return false;
  if (l === "knowledge" && t.includes("knowledge (all")) return true;
  if (l === "knowledge" && s) return t.includes(`${l} (${s})`);
  if (["craft", "perform", "profession"].includes(l) && t.includes(l)) return true;
  if (l === "speak language" && t.includes("speak language")) return true;
  if (s && t.includes(`${l} (${s})`)) return true;
  return t.includes(l);
}
const classSkillText = (lib, entry) => String(classRecord(lib, entry)?.data?.classskills ?? "");
export const isClassSkillFor = (lib, entry, skill) => isClassSkillForText(classSkillText(lib, entry), skill.label, skill.sub);
export const isClassSkill = (b, lib, skill) => plan(b).some((entry) => isClassSkillFor(lib, entry, skill));
const baseSkillPoints = (lib, entry) => num(classRecord(lib, entry)?.data?.skillranks, 0);
function budgetForPlanClass(b, lib, entry, first) {
  let levels = Math.max(0, num(entry?.levels));
  if (levels <= 0) return 0;
  let total = 0;
  const base = baseSkillPoints(lib, entry);
  if (base > 0) {
    const perLevel = Math.max(base + intMod(b), 1);
    if (first) {
      total += perLevel * 4;
      levels -= 1;
    }
    total += perLevel * levels;
  }
  if (isHuman(b)) total += Math.max(0, num(entry.levels)) + (first ? 3 : 0);
  return total;
}
export function skillBudget(b, lib) {
  let total = 0;
  plan(b).forEach((entry, index) => (total += budgetForPlanClass(b, lib, entry, index === 0)));
  return total;
}
export const skillCap = (b, lib, skill) => (isClassSkill(b, lib, skill) ? totalLevels(b) + 3 : (totalLevels(b) + 3) / 2);
export const skillStep = (b, lib, skill) => (!isClassSkill(b, lib, skill) || plan(b).length > 1 ? 0.5 : 1);
// Multiclass: a rank costs 1 point only when a class that has the skill can
// still pay for it (each class pays for its own levels' points).
function multiclassCost(b, lib) {
  const entries = plan(b);
  if (entries.length <= 1) return null;
  const caps = entries.map((entry, index) => budgetForPlanClass(b, lib, entry, index === 0) * 2);
  const units = [];
  let total = 0;
  for (const skill of SKILL_ORDER) {
    const half = Math.floor(num(b.skills?.[skill.name]) * 2 + 0.5);
    if (half <= 0) continue;
    const candidates = entries.map((_, index) => index).filter((index) => caps[index] > 0 && isClassSkillFor(lib, entries[index], skill));
    for (let k = 0; k < half; k++) {
      total += 1;
      if (candidates.length) units.push({ candidates });
    }
  }
  units.sort((a, c) => a.candidates.length - c.candidates.length);
  const assigned = {};
  const tryAssign = (unit, seen) => {
    for (const index of units[unit].candidates) {
      if (seen[index]) continue;
      seen[index] = true;
      assigned[index] ??= [];
      if (assigned[index].length < caps[index]) {
        assigned[index].push(unit);
        return true;
      }
      for (let slot = 0; slot < assigned[index].length; slot++) {
        const other = assigned[index][slot];
        if (!units[other].candidates.includes(index) || tryAssign(other, seen)) {
          assigned[index][slot] = unit;
          return true;
        }
      }
    }
    return false;
  };
  let discounted = 0;
  for (let unit = 0; unit < units.length; unit++) if (tryAssign(unit, {})) discounted += 1;
  return (total * 2 - discounted) / 2;
}
export function skillsSpent(b, lib) {
  const multi = multiclassCost(b, lib);
  if (multi !== null) return multi;
  return SKILL_ORDER.reduce((sum, skill) => sum + num(b.skills?.[skill.name]) * (isClassSkill(b, lib, skill) ? 1 : 2), 0);
}
export function adjustSkill(b, lib, name, delta) {
  const skill = SKILL_ORDER.find((item) => item.name === name);
  if (!skill) return { b };
  const current = num(b.skills?.[name]);
  const next = Math.min(skillCap(b, lib, skill), Math.max(0, current + num(delta) * skillStep(b, lib, skill)));
  const out = { ...b, skills: { ...b.skills, [name]: next } };
  if (delta > 0 && skillsSpent(out, lib) > skillBudget(out, lib) + 0.0001) return { b, error: "You cannot spend more than the available skill-point total." };
  return { b: out };
}
export const formatNumber = (n) => (Math.abs(n - Math.round(n)) < 0.0001 ? String(Math.round(n)) : n.toFixed(1));
export function skillSummary(b, lib) {
  const budget = skillBudget(b, lib);
  if (budget <= 0) return "Choose a class before spending skill points.";
  return `${levelSummaryLabel(b)}     Spent ${formatNumber(skillsSpent(b, lib))} / ${formatNumber(budget)} skill points`;
}
export const skillsComplete = (b, lib) => skillBudget(b, lib) <= 0 || Math.abs(skillsSpent(b, lib) - skillBudget(b, lib)) < 0.0001;
export const skillsOverspent = (b, lib) => skillsSpent(b, lib) > skillBudget(b, lib) + 0.0001;

// --- Languages ---------------------------------------------------------------------
const languageRule = (b) => RACE_LANGUAGES[raceKey(b)] ?? { automatic: [], bonus: "any" };
const planHas = (b, key) => plan(b).some((entry) => entry.key === key);
export function automaticLanguages(raceName, classKeys) {
  const rule = RACE_LANGUAGES[raceKeyOf(raceName)] ?? { automatic: [] };
  const out = [...(rule.automatic ?? [])];
  if (classKeys.includes("druid")) out.push("Druidic");
  return [...new Set(out)].sort();
}
export const knownLanguages = (b) => automaticLanguages(b.race ?? "", plan(b).map((entry) => entry.key));
export function languageOptions(b) {
  const rule = languageRule(b);
  const options = new Set(rule.bonus === "any" ? ALL_STANDARD_LANGUAGES : rule.bonus ?? []);
  if (planHas(b, "cleric")) ["Abyssal", "Celestial", "Infernal"].forEach((name) => options.add(name));
  if (planHas(b, "druid")) options.add("Sylvan");
  if (planHas(b, "wizard")) options.add("Draconic");
  for (const known of knownLanguages(b)) options.delete(known);
  return [...options].sort();
}
export const languageLimit = (b) => Math.max(0, intMod(b)) + Math.floor(num(b.skills?.["Speak Language"]));
// The chosen languages that still stand (a new race or Intelligence drops the rest).
export function chosenLanguages(b) {
  const options = new Set(languageOptions(b));
  return (b.languages ?? []).filter((name) => options.has(name)).slice(0, languageLimit(b));
}
export const languagesComplete = (b) => chosenLanguages(b).length === languageLimit(b);
export function toggleLanguage(b, name) {
  const chosen = chosenLanguages(b);
  if (chosen.includes(name)) return { b: { ...b, languages: chosen.filter((item) => item !== name) } };
  if (chosen.length >= languageLimit(b)) return { b, error: "That choice limit is already reached." };
  if (!languageOptions(b).includes(name)) return { b };
  return { b: { ...b, languages: [...chosen, name] } };
}
export const languageSummary = (b) => [...new Set([...knownLanguages(b), ...chosenLanguages(b)])].sort().join(", ") || "None";

// --- Alignment ---------------------------------------------------------------------
export function alignmentAllowedForClass(alignment, className) {
  const key = classKeyOf(className);
  if (key === "paladin") return alignment === "Lawful Good";
  if (key === "monk") return /^Lawful/.test(alignment);
  if (key === "barbarian" || key === "bard") return !/^Lawful/.test(alignment);
  if (key === "druid") return alignment.includes("Neutral");
  if (key === "warlock") return /^Chaotic/.test(alignment) || /Evil$/.test(alignment);
  return true;
}
export const alignmentAllowed = (b, alignment) => plan(b).every((entry) => alignmentAllowedForClass(alignment, entry.name));
export const allowedAlignments = (b) => ALIGNMENTS.filter((alignment) => alignmentAllowed(b, alignment));
export function alignmentCode(alignment) {
  const s = String(alignment ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("true neutral") || s === "neutral") return "NN";
  return `${s.includes("lawful") ? "L" : s.includes("chaotic") ? "C" : "N"}${s.includes("good") ? "G" : s.includes("evil") ? "E" : "N"}`;
}
const STEP = { L: 0, N: 1, C: 2, G: 0, E: 2 };
const alignmentSteps = (a, c) => Math.abs(STEP[a[0]] - STEP[c[0]]) + Math.abs(STEP[a[1]] - STEP[c[1]]);

// --- Class choices (deity, domains, school...) ---------------------------------------
export const isChoiceKind = (key) => Object.hasOwn(CHOICE_KINDS, key ?? "");
const choiceSelections = (b, kind) => (b.spells ?? []).filter((spell) => spell.classkey === kind).sort((a, c) => a.name.localeCompare(c.name));
export const choiceText = (b, kind) => choiceSelections(b, kind)[0]?.name ?? null;
export const deityOf = (name) => DEITIES.find((deity) => deity.name === name) ?? null;
export function isDomainAllowed(b, domain) {
  const name = String(domain ?? "").replace(/ domain$/i, "").trim();
  const deity = deityOf(choiceText(b, "deity") ?? "");
  if (deity && !deity.domains.includes(name)) return false;
  const code = alignmentCode(b.alignment);
  if (code) {
    if (name === "Good" && code[1] !== "G") return false;
    if (name === "Evil" && code[1] !== "E") return false;
    if (name === "Law" && code[0] !== "L") return false;
    if (name === "Chaos" && code[0] !== "C") return false;
  }
  return true;
}
// "Turn Undead", "Rebuke Undead", or null when the cleric chooses.
export function forcedChannel(b) {
  const code = alignmentCode(b.alignment) ?? "NN";
  if (code[1] === "G") return "Turn Undead";
  if (code[1] === "E") return "Rebuke Undead";
  const deity = deityOf(choiceText(b, "deity") ?? "");
  if (deity?.align[1] === "G") return "Turn Undead";
  if (deity?.align[1] === "E") return "Rebuke Undead";
  return null;
}
const countThresholds = (levels, to) => levels.filter((level) => level <= to).length;
const addChoiceBucket = (buckets, kind, label, needed) => {
  if (needed > 0) buckets[`${kind}:0`] = { key: `${kind}:0`, classkey: kind, classlabel: label, level: 0, needed, order: CHOICE_KINDS[kind].order, optional: Boolean(CHOICE_KINDS[kind].optional) };
};
function addClassChoiceBuckets(b, buckets) {
  for (const entry of plan(b)) {
    const key = entry.key;
    const level = num(entry.levels);
    const label = entry.name;
    if (key === "cleric") {
      addChoiceBucket(buckets, "deity", label, 1);
      addChoiceBucket(buckets, "domain", label, 2);
      if (!forcedChannel(b)) addChoiceBucket(buckets, "channel", label, 1);
    } else if (key === "wizard") {
      addChoiceBucket(buckets, "school", label, 1);
      const school = choiceText(b, "school");
      if (school && school !== "Generalist") addChoiceBucket(buckets, "prohibited", label, school === "Divination" ? 1 : 2);
    }
    if (key === "wizard" || key === "sorcerer") addChoiceBucket(buckets, "familiar", label, 1);
    else if (key === "druid" || (key === "ranger" && level >= 4)) addChoiceBucket(buckets, "companion", label, 1);
    else if (key === "paladin" && level >= 5) addChoiceBucket(buckets, "mount", label, 1);
    if (key === "ranger") {
      if (level >= 2) addChoiceBucket(buckets, "combatstyle", label, 1);
      addChoiceBucket(buckets, "favoredenemy", label, countThresholds([1, 5, 10, 15, 20], level));
      addChoiceBucket(buckets, "febonus", label, countThresholds([5, 10, 15, 20], level));
    } else if (key === "rogue") addChoiceBucket(buckets, "roguespecial", label, countThresholds([10, 13, 16, 19], level));
    else if (key === "mesmer") addChoiceBucket(buckets, "advlearning", label, countThresholds(MESMER_ADVANCED_LEARNING_LEVELS, level));
  }
}
const favoredEnemyNames = (b) => [...new Set(choiceSelections(b, "favoredenemy").map((choice) => choice.name))];
export const rogueBonusFeats = (b) => choiceSelections(b, "roguespecial").filter((choice) => choice.name === "Feat").length;
export const rangerStyleFeats = (b, rangerLevel) => (COMBAT_STYLES[choiceText(b, "combatstyle") ?? ""] ?? []).filter(([level]) => num(rangerLevel) >= level).map(([, feat]) => feat);

// --- Spells -------------------------------------------------------------------------
const TOKENS = {
  barbarian: ["barbarian", "brb"], bard: ["bard", "brd"], cleric: ["cleric", "clr"], druid: ["druid", "drd"], fighter: ["fighter", "ftr"], monk: ["monk", "mnk"],
  paladin: ["paladin", "pal"], ranger: ["ranger", "rgr"], rogue: ["rogue", "rog"], sorcerer: ["sorcerer", "sor"], wizard: ["wizard", "wiz"],
  mesmer: ["mesmer", "bard", "brd"], necromancer: ["necromancer", "wizard", "wiz"],
};
// "invisibility, greater" is also "greater invisibility".
const lookupSpell = (table, name) => {
  if (table[name] !== undefined) return table[name];
  const match = /^(.*?),\s*(.+)$/.exec(name);
  return match ? table[`${match[2]} ${match[1]}`] : undefined;
};
export const spellSchool = (spell) => (/^([a-z]+)/i.exec(String(spell?.data?.school ?? ""))?.[1] ?? "").toLowerCase();
// A spell's level for a class, from its record ("Sor/Wiz 2, Clr 3").
export function spellLevelForClass(spell, classKey) {
  const levelText = String(spell?.data?.level ?? "").toLowerCase();
  if (!levelText || !classKey) return null;
  const name = String(spell?.data?.name ?? spell?.name ?? "").toLowerCase().trim();
  if (classKey === "mesmer") return lookupSpell(MESMER_SPELL_BY_NAME, name) ?? null;
  if (classKey === "necromancer" && !String(spell?.data?.school ?? "").toLowerCase().includes("necromancy") && !NECROMANCER_SUPPORT_SPELLS.has(name)) return null;
  for (const part of levelText.split(/[,;]/)) {
    for (const token of TOKENS[classKey] ?? []) {
      if (part.includes(token)) {
        const level = /(\d+)/.exec(part);
        if (level) return Number(level[1]);
      }
    }
  }
  return null;
}
export function prohibitedSchools(b) {
  return new Set(choiceSelections(b, "prohibited").map((choice) => choice.name.toLowerCase()));
}
export const isProhibitedWizardSpell = (b, spell) => {
  const school = spellSchool(spell);
  return school !== "" && prohibitedSchools(b).has(school);
};
function spellsKnownFor(key, level) {
  if (level <= 0) return {};
  if (key === "warlock") return { [warlockGrade(level)]: WARLOCK_INVOCATIONS_KNOWN[Math.min(20, level) - 1] ?? 0 };
  if (SPELLS_KNOWN_BY_LEVEL[key]) return SPELLS_KNOWN_BY_LEVEL[key][level] ?? SPELLS_KNOWN_BY_LEVEL[key][1] ?? {};
  return { ...(SPELL_KNOWN_LEVEL1[key] ?? {}) };
}
// The groups of picks the Spells page needs: { key: { classkey, classlabel, level, needed, order, optional } }.
export function spellBuckets(b) {
  const buckets = {};
  for (const entry of plan(b)) {
    const key = entry.key;
    const level = num(entry.levels);
    let counts = {};
    if (key === "wizard" || key === "necromancer") counts = { [Math.min(9, Math.floor((level + 1) / 2))]: 3 + Math.max(0, intMod(b)) + 2 * Math.max(0, level - 1) };
    else counts = spellsKnownFor(key, level);
    for (const [spellLevel, count] of Object.entries(counts)) {
      if (num(count) <= 0) continue;
      const bucketKey = `${key}:${spellLevel}`;
      buckets[bucketKey] = { key: bucketKey, classkey: key, classlabel: entry.name, level: Number(spellLevel), needed: (buckets[bucketKey]?.needed ?? 0) + num(count), order: 99, optional: false };
    }
  }
  addClassChoiceBuckets(b, buckets);
  return buckets;
}
export const spellCounts = (b) => {
  const counts = {};
  for (const spell of b.spells ?? []) counts[spell.bucket] = (counts[spell.bucket] ?? 0) + 1;
  return counts;
};
export function bucketLabel(bucket) {
  if (isChoiceKind(bucket.classkey)) return CHOICE_KINDS[bucket.classkey].label;
  if (bucket.classkey === "warlock") return `${warlockGradeLabel(bucket.level)} invocations`;
  if (bucket.classkey === "wizard" || bucket.classkey === "necromancer") return `spells through level ${bucket.level}`;
  return bucket.level === 0 ? "Level 0 cantrips" : `Level ${bucket.level} spells`;
}
function advancedLearningOptions(b, lib) {
  const mesmer = classLevelMap(b).levels.mesmer ?? 0;
  let max = 0;
  for (const [level, count] of Object.entries(SPELLS_KNOWN_BY_LEVEL.bard[Math.max(1, Math.min(20, mesmer))] ?? {})) if (num(count) > 0 && Number(level) > max) max = Number(level);
  return lib.spells
    .map((spell) => ({ spell, level: spellLevelForClass(spell, "wizard"), school: titled(spellSchool(spell)) }))
    .filter(({ spell, level, school }) => level !== null && level <= max && (school === "Illusion" || school === "Enchantment") && lookupSpell(MESMER_SPELL_BY_NAME, spell.name.toLowerCase()) === undefined && spell.name.toLowerCase() !== "true strike");
}
// The rows offered for a group: { name, record } (record: a spell's key, or "@choice:kind:id").
export function choiceRows(b, lib, bucket) {
  const kind = bucket.classkey;
  const out = [];
  const add = (name, id) => out.push({ name, record: `@choice:${kind}:${id ?? name}`, source: "" });
  if (kind === "deity") {
    const code = alignmentCode(b.alignment);
    for (const deity of DEITIES) if (!code || alignmentSteps(code, deity.align) <= 1) add(`${deity.name} (${deity.align.replace("NN", "N")}; ${deity.domains.join(", ")})`, deity.name);
    add(NO_DEITY, NO_DEITY);
  } else if (kind === "domain") {
    for (const domain of lib.domains) if (isDomainAllowed(b, domain.name)) add(domain.name, domain.name);
  } else if (kind === "channel") ["Turn Undead", "Rebuke Undead"].forEach((name) => add(name));
  else if (kind === "school") ["Generalist", ...WIZARD_SCHOOLS].forEach((name) => add(name));
  else if (kind === "prohibited") {
    const chosen = choiceText(b, "school");
    WIZARD_SCHOOLS.filter((school) => school !== chosen && school !== "Divination").forEach((name) => add(name));
  } else if (kind === "familiar") FAMILIARS.forEach(([name]) => add(name));
  else if (kind === "companion") COMPANIONS.forEach((name) => add(name));
  else if (kind === "mount") MOUNTS.forEach((name) => add(name));
  else if (kind === "combatstyle") Object.keys(COMBAT_STYLES).forEach((name) => add(name));
  else if (kind === "favoredenemy") {
    const held = new Set(favoredEnemyNames(b));
    FAVORED_ENEMIES.filter((name) => !held.has(name) || choiceSelections(b, "favoredenemy").some((choice) => choice.name === name)).forEach((name) => add(name));
  } else if (kind === "febonus") favoredEnemyNames(b).forEach((name) => add(name));
  else if (kind === "advlearning") advancedLearningOptions(b, lib).forEach(({ spell, level, school }) => add(`${spell.name} (Sor/Wiz ${level}, ${school})`, spell.name));
  else if (kind === "roguespecial") ROGUE_SPECIALS.forEach(([name]) => add(name));
  return out;
}
// Every row of a group: spells of the right level (a wizard's spellbook takes
// any level it can cast), invocations, or the choice's options.
export function bucketRows(b, lib, bucket) {
  if (isChoiceKind(bucket.classkey)) return choiceRows(b, lib, bucket);
  if (bucket.classkey === "warlock") return WARLOCK_INVOCATIONS.filter((item) => item.grade <= bucket.level).map((item) => ({ name: item.name, record: `@invocation:${item.grade}:${item.name}`, level: item.grade, source: "" }));
  const flexible = bucket.classkey === "wizard" || bucket.classkey === "necromancer";
  return lib.spells
    .map((spell) => ({ spell, level: spellLevelForClass(spell, bucket.classkey) }))
    .filter(({ spell, level }) => level !== null && (flexible ? level >= 1 && level <= bucket.level : level === bucket.level) && !(bucket.classkey === "wizard" && isProhibitedWizardSpell(b, spell)))
    .map(({ spell, level }) => ({ name: spell.name, record: spell.key, level, source: spell.source, school: spellSchool(spell) }));
}
const dropWhere = (b, drop) => ({ ...b, spells: (b.spells ?? []).filter((spell) => !drop(spell)) });
// Keeps the choices that depend on another one consistent (FG's onClassChoiceChanged).
function afterChoice(b, lib, kind) {
  let out = b;
  if (kind === "deity") {
    out = dropWhere(out, (spell) => spell.classkey === "domain" && !isDomainAllowed(out, spell.name));
    if (forcedChannel(out)) out = dropWhere(out, (spell) => spell.classkey === "channel");
  } else if (kind === "school") out = dropWhere(out, (spell) => spell.classkey === "prohibited");
  else if (kind === "favoredenemy") {
    const held = new Set(favoredEnemyNames(out));
    out = dropWhere(out, (spell) => spell.classkey === "febonus" && !held.has(spell.name));
  }
  if (kind === "school" || kind === "prohibited") {
    out = dropWhere(out, (spell) => spell.classkey === "wizard" && isProhibitedWizardSpell(out, lib.spells.find((item) => item.key === spell.record)));
  }
  return out;
}
export function addSpell(b, lib, bucketKey, rowItem) {
  const buckets = spellBuckets(b);
  const bucket = buckets[bucketKey];
  if (!bucket || !rowItem) return { b };
  const counts = spellCounts(b);
  const kind = bucket.classkey;
  const choice = isChoiceKind(kind);
  const already = (b.spells ?? []).some((spell) => spell.bucket === bucketKey && spell.record === rowItem.record);
  const repeatable = choice && (CHOICE_KINDS[kind].repeatable || (kind === "roguespecial" && rowItem.name === "Feat"));
  if (already && !repeatable) return { b };
  if (!choice && (b.spells ?? []).some((spell) => spell.classkey === kind && spell.name.toLowerCase() === rowItem.name.toLowerCase())) return { b, error: `${rowItem.name} is already known.` };
  if ((counts[bucketKey] ?? 0) >= bucket.needed) return { b, error: "That choice limit is already reached." };
  const seq = num(b.seq) + 1;
  // A deity is kept by its name; the other choices by what the row says.
  const name = kind === "deity" ? rowItem.record.replace(/^@choice:deity:/, "") : choice && kind === "advlearning" ? rowItem.record.replace(/^@choice:advlearning:/, "") : rowItem.name;
  const level = choice ? 0 : kind === "warlock" ? bucket.level : num(rowItem.level, bucket.level);
  const out = { ...b, seq, spells: [...(b.spells ?? []), { id: `${bucketKey}|${rowItem.record}#${seq}`, bucket: bucketKey, name, classkey: kind, classlabel: bucket.classlabel, level, record: rowItem.record }] };
  return { b: choice ? afterChoice(out, lib, kind) : out };
}
export function removeSpell(b, lib, bucketKey, record) {
  const index = (b.spells ?? []).findIndex((spell) => spell.bucket === bucketKey && spell.record === record);
  if (index < 0) return b;
  const spell = b.spells[index];
  const out = { ...b, spells: b.spells.filter((_, at) => at !== index) };
  return isChoiceKind(spell.classkey) ? afterChoice(out, lib, spell.classkey) : out;
}
export const spellsComplete = (b) => {
  const counts = spellCounts(b);
  return Object.values(spellBuckets(b)).every((bucket) => bucket.optional || (counts[bucket.key] ?? 0) >= bucket.needed);
};
export function spellHeaderSummary(b) {
  const counts = spellCounts(b);
  let chosen = 0;
  let needed = 0;
  let open = 0;
  for (const bucket of Object.values(spellBuckets(b))) {
    const have = Math.min(counts[bucket.key] ?? 0, bucket.needed);
    chosen += have;
    needed += bucket.needed;
    if (have < bucket.needed && !bucket.optional) open += 1;
  }
  if (needed === 0) return `${levelSummaryLabel(b)}     No spells to choose`;
  return `${levelSummaryLabel(b)}     Chosen ${chosen} / ${needed}${open ? `  (${open} ${open === 1 ? "group needs picks" : "groups need picks"})` : ""}`;
}
export const maxSpellLevelFor = (key, level) => {
  if (key === "cleric" || key === "druid" || key === "wizard") return level > 0 ? Math.min(9, Math.floor((level + 1) / 2)) : -1;
  if (key === "paladin" || key === "ranger") return level >= 14 ? 4 : level >= 11 ? 3 : level >= 8 ? 2 : level >= 4 ? 1 : -1;
  return -1;
};
export function spellGuidance(b) {
  const buckets = Object.values(spellBuckets(b));
  if (buckets.length === 0) return "";
  const counts = spellCounts(b);
  const classes = new Set(buckets.map((bucket) => bucket.classkey));
  const lines = [
    buckets
      .map((bucket) => `${bucket.classlabel} ${bucketLabel(bucket)} ${Math.min(counts[bucket.key] ?? 0, bucket.needed)}/${bucket.needed}${(counts[bucket.key] ?? 0) >= bucket.needed ? " (done)" : ""}`)
      .sort()
      .join(";  ") + ".",
  ];
  if (classes.has("wizard") || classes.has("school") || classes.has("prohibited")) {
    const school = choiceText(b, "school") ?? "";
    const barred = [...prohibitedSchools(b)].map(titled).sort();
    if (school && school !== "Generalist") lines.push(`Specialist (${school}): one extra spell slot of each level for ${school.toLowerCase()} spells${barred.length ? `; no ${barred.join(" or ")} spells` : "; choose two prohibited schools (one if Divination)"}.`);
    else if (school) lines.push("Generalist: every school.");
    lines.push("Spellbook: every 0-level spell, plus three 1st-level spells and one per point of Intelligence bonus; two new spells each wizard level.");
  }
  if (classes.has("necromancer")) lines.push("Necromancer: necromancy spells and the necromancer support list, wizard spells per day.");
  if (["sorcerer", "bard", "mesmer"].some((key) => classes.has(key))) lines.push("Spells known come from the class table; each group takes spells of its own level. A high Charisma adds spells per day, not spells known.");
  if (classes.has("warlock")) lines.push("Invocations are at will; eldritch blast needs no pick.");
  return lines.join(" ");
}
// What commit adds by itself (prepared casters' whole lists) and the class choices left to the table.
export function manualChoiceNotes(b) {
  const notes = [];
  for (const entry of plan(b)) for (const choice of MANUAL_CLASS_CHOICES[entry.key] ?? []) if (choice.level <= num(entry.levels)) notes.push(`${entry.name} ${choice.level}: ${choice.note}`);
  return notes.sort();
}
export function autoSpellNote(b) {
  const prepared = [];
  for (const entry of plan(b)) {
    if (!PREPARED_CASTERS[entry.key]) continue;
    const max = maxSpellLevelFor(entry.key, classLevelMap(b).levels[entry.key] ?? 0);
    if (max < 0) continue;
    const min = entry.key === "cleric" || entry.key === "druid" ? 0 : 1;
    prepared.push(`${entry.name} spell of levels ${min}-${max}${entry.key === "cleric" ? " (plus your domain spells)" : ""}`);
  }
  const manual = manualChoiceNotes(b);
  return [prepared.length ? `Added to the sheet automatically: every ${prepared.join("; every ")}.` : "", manual.length ? `Manual class choices: ${manual.join("; ")}.` : ""].filter(Boolean).join(" ");
}

// --- Feats -------------------------------------------------------------------------
export const featBaseName = (name) => String(name ?? "").toLowerCase().replace(/\([^()]*\)/g, "").replace(/ with weapon$/, "").replace(/ with [a-z]+$/, "").trim();
export const featTargetKind = (name) => TARGET_FEATS[featBaseName(name)] ?? null;
const featRecord = (lib, name) => findByName(lib.feats, name) ?? findByName(lib.feats, String(name ?? "").replace(/\s*\(.*\)$/, ""));
export function requiredFeatCount(b) {
  let count = 1 + Math.floor(Math.max(1, totalLevels(b)) / 3) + (isHuman(b) ? 1 : 0);
  for (const entry of plan(b)) count += (CLASS_BONUS_FEAT_LEVELS[entry.key] ?? []).filter((level) => num(entry.levels) >= level).length;
  return count + rogueBonusFeats(b);
}
export function bonusFeatSlots(b) {
  const slots = [];
  for (const entry of plan(b)) for (const level of CLASS_BONUS_FEAT_LEVELS[entry.key] ?? []) if (level <= num(entry.levels)) slots.push({ classkey: entry.key, level });
  const rank = (slot) => (slot.classkey === "monk" ? 1 : slot.classkey === "wizard" ? 2 : 3);
  return slots.sort((a, c) => rank(a) - rank(c));
}
export function featFitsSlot(lib, feat, slot) {
  const record = featRecord(lib, feat.base ?? feat.name);
  const name = String(feat.name ?? record?.name ?? "").toLowerCase();
  const type = String(record?.data?.type ?? "").toLowerCase();
  const special = plain(record?.data?.special).toLowerCase();
  if (slot.classkey === "fighter") return special.includes("fighter may select");
  if (slot.classkey === "wizard") return type.includes("metamagic") || type.includes("item creation") || name === "spell mastery";
  if (slot.classkey === "monk") {
    if (slot.level === 1) return name === "improved grapple" || name === "stunning fist";
    if (slot.level === 2) return name === "combat reflexes" || name === "deflect arrows";
    if (slot.level === 6) return name === "improved disarm" || name === "improved trip";
  }
  return false;
}
export function bonusFeatsLegal(b, lib) {
  const slots = bonusFeatSlots(b);
  if (slots.length === 0) return true;
  const feats = b.feats ?? [];
  const used = new Set();
  const match = (slot) => {
    if (slot >= slots.length) return true;
    for (let index = 0; index < feats.length; index++) {
      if (used.has(index) || !featFitsSlot(lib, feats[index], slots[slot])) continue;
      used.add(index);
      if (match(slot + 1)) return true;
      used.delete(index);
    }
    return false;
  };
  return match(0);
}
const isMonkBonusChoice = (b, lib, feat) => bonusFeatSlots(b).some((slot) => slot.classkey === "monk" && featFitsSlot(lib, feat, slot));
const naturalWeaponName = (name) => {
  let s = String(name ?? "").toLowerCase().replace(/\s*\(\d+\)$/, "").trim();
  const match = /^(.*?), (.+)$/.exec(s);
  if (match) s = `${match[2]} ${match[1]}`;
  return s;
};
export function weaponCatalog(b, lib) {
  const raceMartial = new Set(RACE_MARTIAL[raceKey(b)] ?? []);
  const out = [];
  const seen = new Set();
  for (const item of lib.items) {
    if (!/^reference\.(equipment|weapon)\./.test(item.path) || item.data?.type !== "Weapon") continue;
    const sub = String(item.data.subtype ?? "").toLowerCase();
    const name = naturalWeaponName(item.name);
    let category = /^([a-z]+)/.exec(sub)?.[1];
    if (!["simple", "martial", "exotic"].includes(category) || sub.includes("weapons") || /^[a-z]+ shield$/.test(name) || seen.has(name)) continue;
    seen.add(name);
    if (raceMartial.has(name)) category = "martial";
    out.push({ name, category, crossbow: name.includes("crossbow") });
  }
  return out.sort((a, c) => a.name.localeCompare(c.name));
}
export function proficiencies(b, lib, exceptId) {
  const weapons = new Set(["unarmed strike"]);
  const armor = new Set();
  const cats = new Set();
  for (const key of Object.keys(classLevelMap(b).levels)) {
    const row = CLASS_WEAPONS[key] ?? {};
    if (row.simple) cats.add("simple");
    if (row.martial) cats.add("martial");
    (row.list ?? []).forEach((name) => weapons.add(name));
    Object.keys(CLASS_ARMOR[key] ?? {}).forEach((kind) => armor.add(kind));
  }
  (RACE_WEAPONS[raceKey(b)] ?? []).forEach((name) => weapons.add(name));
  for (const feat of b.feats ?? []) {
    if (feat.id === exceptId) continue;
    const s = feat.name.toLowerCase();
    const target = /\((.+)\)$/.exec(s)?.[1];
    if (s.startsWith("simple weapon proficiency")) cats.add("simple");
    else if ((s.startsWith("martial weapon proficiency") || s.startsWith("exotic weapon proficiency")) && target) weapons.add(target);
    else if (s.startsWith("armor proficiency (light")) armor.add("light");
    else if (s.startsWith("armor proficiency (medium")) armor.add("medium");
    else if (s.startsWith("armor proficiency (heavy")) armor.add("heavy");
    else if (s.startsWith("tower shield proficiency")) armor.add("tower");
    else if (s.startsWith("shield proficiency")) armor.add("shield");
  }
  for (const weapon of weaponCatalog(b, lib)) if (cats.has(weapon.category)) weapons.add(weapon.name);
  return { weapons, armor };
}
const takenTargets = (b, base) => new Set((b.feats ?? []).filter((feat) => featBaseName(feat.name) === base && /\((.+)\)$/.test(feat.name)).map((feat) => /\((.+)\)$/.exec(feat.name.toLowerCase())[1]));
// The targets a feat may still take: weapons, schools or skills.
export function featTargets(b, lib, featName) {
  const base = featBaseName(featName);
  const kind = TARGET_FEATS[base];
  if (!kind) return [];
  const taken = takenTargets(b, base);
  const { weapons } = proficiencies(b, lib);
  const out = [];
  if (kind === "weapon") {
    const require = base === "weapon specialization" || base === "greater weapon focus" ? [takenTargets(b, "weapon focus")] : base === "greater weapon specialization" ? [takenTargets(b, "greater weapon focus"), takenTargets(b, "weapon specialization")] : [];
    const names = [...weapons, "grapple", ...(base === "weapon focus" ? ["ray"] : [])].sort();
    for (const name of names) {
      if (taken.has(name) || (base === "improved critical" && name === "grapple")) continue;
      if (require.every((set) => set.has(name))) out.push(name);
    }
  } else if (kind === "martial" || kind === "exotic" || kind === "crossbow") {
    for (const weapon of weaponCatalog(b, lib)) {
      const ok = kind === "crossbow" ? weapon.crossbow && weapons.has(weapon.name) && !weapon.name.includes("repeating") : weapon.category === kind && !weapons.has(weapon.name);
      if (ok && !taken.has(weapon.name)) out.push(weapon.name);
    }
  } else if (kind === "school") {
    const require = base === "greater spell focus" ? takenTargets(b, "spell focus") : null;
    for (const school of WIZARD_SCHOOLS) if (!taken.has(school.toLowerCase()) && (!require || require.has(school.toLowerCase()))) out.push(school.toLowerCase());
  } else if (kind === "skill") for (const skill of SKILL_ORDER) if (!taken.has(skill.name.toLowerCase())) out.push(skill.name);
  return out;
}
function redundantProficiency(b, lib, featName, exceptId) {
  const s = featBaseName(featName);
  if (!s.endsWith("proficiency") || s === "martial weapon proficiency" || s === "exotic weapon proficiency") return null;
  const { weapons, armor } = proficiencies(b, lib, exceptId);
  const full = String(featName ?? "").toLowerCase();
  if (s === "armor proficiency") {
    for (const kind of ["light", "medium", "heavy"]) if (full.includes(kind) && armor.has(kind)) return `has ${kind} armor`;
  } else if (s === "shield proficiency" && armor.has("shield")) return "has shields";
  else if (s === "tower shield proficiency" && armor.has("tower")) return "has tower shields";
  else if (s === "simple weapon proficiency" && weapons.has("quarterstaff") && weapons.has("morningstar") && weapons.has("light crossbow")) return "has simple weapons";
  return null;
}
export const buildBaseAttack = (b) => Object.entries(classLevelMap(b).levels).reduce((sum, [key, level]) => sum + Math.floor(level * (BAB_RATE[key] ?? 0.75)), 0);
export const buildCasterLevel = (b) => Object.entries(classLevelMap(b).levels).reduce((best, [key, level]) => (CASTER_CLASSES[key] ? Math.max(best, CASTER_CLASSES[key] === 1 ? level : level >= 4 ? Math.floor(level / 2) : 0) : best), 0);
function buildFeatNames(b, exceptId) {
  const names = new Set((b.feats ?? []).filter((feat) => feat.id !== exceptId).map((feat) => featBaseName(feat.name)));
  const levels = classLevelMap(b).levels;
  if ((levels.monk ?? 0) >= 1) names.add("improved unarmed strike");
  for (const feat of rangerStyleFeats(b, levels.ranger ?? 0)) names.add(feat.toLowerCase());
  return names;
}
const skillRanksByName = (b, skill) => {
  const wanted = skill.toLowerCase();
  return Object.entries(b.skills ?? {}).reduce((sum, [name, ranks]) => {
    const key = name.toLowerCase();
    return key === wanted || (key.startsWith(wanted) && /[ :(|]/.test(key[wanted.length] ?? "")) ? sum + num(ranks) : sum;
  }, 0);
};
// What a feat still needs ([] when the build may take it), FG's prerequisites read word by word.
export function featProblems(b, lib, record, exceptId) {
  const problems = [];
  const redundant = redundantProficiency(b, lib, record?.name, exceptId);
  if (redundant) return [`nothing (${redundant})`];
  const text = plain(record?.data?.prerequisites);
  if (!text) return problems;
  const levels = classLevelMap(b).levels;
  let feats = null;
  for (const raw of text.split(/[,;]/)) {
    const part = raw.trim();
    if (!part) continue;
    const s = part.toLowerCase();
    const ability = /^([a-z]{3}) (\d+)$/.exec(s);
    const bab = /^base attack bonus \+(\d+)$/.exec(s);
    const caster = /^caster level (\d+)/.exec(s);
    const classLevel = /^([a-z]+) level (\d+)/.exec(s);
    const ranks = /^(.*?) (\d+) ranks?$/.exec(s);
    if (ability && FEAT_ABILITY_ABBR[ability[1]]) {
      if (finalScore(b, FEAT_ABILITY_ABBR[ability[1]]) < Number(ability[2])) problems.push(part);
    } else if (bab) {
      if (buildBaseAttack(b) < Number(bab[1])) problems.push(part);
    } else if (caster) {
      if (buildCasterLevel(b) < Number(caster[1])) problems.push(part);
    } else if (classLevel && classLevel[1] === "character") {
      if (totalLevels(b) < Number(classLevel[2])) problems.push(part);
    } else if (classLevel) {
      if ((levels[classKeyOf(classLevel[1])] ?? 0) < Number(classLevel[2])) problems.push(part);
    } else if (ranks) {
      if (skillRanksByName(b, ranks[1]) < Number(ranks[2])) problems.push(part);
    } else if (s === "ability to turn or rebuke creatures") {
      if ((levels.cleric ?? 0) < 1 && (levels.paladin ?? 0) < 4 && (levels.necromancer ?? 0) < 1) problems.push(part);
    } else if (s.includes("wild shape")) {
      if ((levels.druid ?? 0) < 5) problems.push(part);
    } else if (s.startsWith("armor proficiency")) {
      const kind = /\(([a-z]+)\)/.exec(s)?.[1];
      if (kind && !proficiencies(b, lib, exceptId).armor.has(kind)) problems.push(part);
    } else if (s === "shield proficiency") {
      if (!proficiencies(b, lib, exceptId).armor.has("shield")) problems.push(part);
    } else if (s.includes("proficien")) {
      // a weapon proficiency: the target list offers only weapons that qualify
    } else {
      feats ??= buildFeatNames(b, exceptId);
      const base = featBaseName(part);
      if (base && !feats.has(base)) problems.push(part);
    }
  }
  return problems;
}
export function invalidFeats(b, lib) {
  const out = [];
  for (const feat of b.feats ?? []) {
    const problems = featProblems(b, lib, featRecord(lib, feat.base ?? feat.name), feat.id);
    if (problems.length && !isMonkBonusChoice(b, lib, feat)) out.push(`${feat.name} needs ${problems.join(", ")}`);
  }
  return out.sort();
}
export const featsComplete = (b, lib) => (b.feats ?? []).length >= requiredFeatCount(b) && bonusFeatsLegal(b, lib) && invalidFeats(b, lib).length === 0;
export function featSummary(b, lib) {
  let text = `${levelSummaryLabel(b)}     Selected ${(b.feats ?? []).length} / ${requiredFeatCount(b)} feats`;
  if ((b.feats ?? []).length >= requiredFeatCount(b) && !bonusFeatsLegal(b, lib)) text += " - class bonus feat choice is not legal";
  const invalid = invalidFeats(b, lib);
  if (invalid.length) text += ` - ${invalid.join("; ")}`;
  return text;
}
// A row of the Feats list: chosen how often, and what it needs.
export function featStatus(b, lib, record) {
  const chosen = (b.feats ?? []).filter((feat) => (feat.base ?? feat.name).toLowerCase() === record.name.toLowerCase());
  if (chosen.length > 0) {
    if (featTargetKind(record.name)) return { chosen: chosen.length, text: `Selected: ${chosen.map((feat) => feat.target).filter(Boolean).sort().join(", ")}`, blocked: false };
    return { chosen: chosen.length, text: `Selected x${chosen.length}`, blocked: false };
  }
  let unmet = featProblems(b, lib, record);
  if (unmet.length && isMonkBonusChoice(b, lib, { name: record.name })) unmet = [];
  const needs = unmet.join(", ");
  const noBenefit = /^nothing \((.+)\)$/.exec(needs)?.[1];
  return { chosen: 0, text: noBenefit ? `No benefit: ${noBenefit}` : unmet.length ? `Needs ${needs}` : "", blocked: unmet.length > 0 };
}
export function addFeat(b, lib, name) {
  const record = findByName(lib.feats, name);
  if (!record) return { b };
  if ((b.feats ?? []).length >= requiredFeatCount(b)) return { b, error: "That choice limit is already reached." };
  const unmet = featProblems(b, lib, record);
  if (unmet.length && !isMonkBonusChoice(b, lib, { name: record.name })) return { b, error: `${record.name} needs ${unmet.join(", ")}.` };
  if (featTargetKind(record.name)) {
    if (featTargets(b, lib, record.name).length === 0) return { b, error: `No weapon, school or skill qualifies for another ${record.name}.` };
    return { b: { ...b, pendingTarget: record.name } };
  }
  const repeat = String(record.data?.mult ?? "") === "1" || plain(record.data?.special).toLowerCase().includes("multiple times");
  if ((b.feats ?? []).some((feat) => feat.base === record.name) && !repeat) return { b, error: "This feat cannot normally be selected more than once." };
  const seq = num(b.seq) + 1;
  return { b: { ...b, seq, feats: [...(b.feats ?? []), { id: `feat#${seq}`, name: record.name, base: record.name, target: null }] } };
}
export function chooseFeatTarget(b, target) {
  if (!b.pendingTarget) return b;
  if (!target) return { ...b, pendingTarget: null };
  const seq = num(b.seq) + 1;
  return { ...b, seq, pendingTarget: null, feats: [...(b.feats ?? []), { id: `feat#${seq}`, name: `${b.pendingTarget} (${target})`, base: b.pendingTarget, target }] };
}
export function removeFeat(b, name) {
  const index = (b.feats ?? []).findIndex((feat) => feat.base === name || feat.name === name);
  return index < 0 ? b : { ...b, feats: b.feats.filter((_, at) => at !== index) };
}

// --- Gear ----------------------------------------------------------------------------
// Starting gear follows class levels, not effective level (a level-adjusted race is better, not higher).
export const gearLevel = (b) => Math.max(1, Math.min(totalLevels(b) || targetClassLevel(b), MAX_LEVEL));
export function goldInfo(b, lib) {
  if (gearLevel(b) > 1) return { wealth: true, expr: "wealth-by-level", average: WEALTH_BY_LEVEL_GP[gearLevel(b)] ?? 0, dice: "", times: 1 };
  const key = primaryClass(b)?.key ?? "";
  const known = STARTING_GOLD[key];
  const fromBook = /(\d+d\d+)\s*(?:[x×*]\s*(\d+))?/i.exec(String(classRecord(lib, primaryClass(b))?.data?.startingwealth ?? ""));
  const expr = known?.expr ?? (fromBook ? `${fromBook[1]}${fromBook[2] ? `*${fromBook[2]}` : ""}` : "3d4*10");
  const [dice, times] = expr.split("*");
  return { wealth: false, expr, average: known?.average ?? 75, dice, times: Number(times) || 1 };
}
// "15 gp", "5 sp", "1/2 cp", "1,000 gp" -> copper (FG's parseCostToCopper).
export function parseCostToCopper(cost) {
  const s = String(cost ?? "").toLowerCase().replace(/,/g, "");
  if (!s || s === "-") return 0;
  let value = 0;
  const fraction = /(\d+)\s*\/\s*(\d+)/.exec(s);
  if (fraction && Number(fraction[2]) !== 0) value = Number(fraction[1]) / Number(fraction[2]);
  else value = Number(/(\d+\.?\d*)/.exec(s)?.[1] ?? 0);
  if (s.includes("pp")) return Math.floor(value * 10 * 100 + 0.5);
  if (s.includes("sp")) return Math.floor(value * 10 + 0.5);
  if (s.includes("cp")) return Math.floor(value + 0.5);
  return Math.floor(value * 100 + 0.5);
}
const isVaultHandMeDown = (opts, item) => {
  if (!wizardOptions(opts).vault || !normalizeText(item.source).includes("vault of the kraken")) return false;
  const name = normalizeText(item.name);
  return Boolean(name) && VAULT_HANDMEDOWN_TERMS.some((term) => name.includes(normalizeText(term)));
};
export const itemCost = (opts, item) => (isVaultHandMeDown(opts, item) ? 0 : parseCostToCopper(item?.data?.cost));
export const itemCostText = (opts, item) => (isVaultHandMeDown(opts, item) ? "Free" : String(item?.data?.cost ?? ""));
const termMatches = (name, alt, term) => {
  const t = normalizeText(term);
  return name === t || name.startsWith(`${t} `) || (alt !== null && (alt === t || alt.startsWith(`${t} `)));
};
// The class storefront: only what the classes in the plan would start with (and the common kit).
export function isStarterItem(b, opts, item) {
  const name = normalizeText(item.name);
  if (!name) return false;
  const parts = /^([^,]+),\s*([^(]+)/.exec(item.name);
  const alt = parts ? normalizeText(`${parts[2]} ${parts[1]}`).replace(/\s+$/, "") : null;
  if (isVaultHandMeDown(opts, item)) return true;
  if (STARTER_GEAR_COMMON.some((term) => termMatches(name, alt, term))) return true;
  return plan(b).some((entry) => (STARTER_GEAR_BY_CLASS[entry.key] ?? []).some((term) => termMatches(name, alt, term)));
}
export const shopItems = (b, lib, opts) => lib.items.filter((item) => isStarterItem(b, opts, item)).sort((a, c) => a.name.localeCompare(c.name) || a.source.localeCompare(c.source));
export const goldRolled = (b) => b.gold !== null && b.gold !== undefined;
export const spentCopper = (b, lib, opts) => Object.entries(b.equipment ?? {}).reduce((sum, [key, qty]) => sum + itemCost(opts, lib.items.find((item) => item.key === key)) * num(qty), 0);
export const remainingCopper = (b, lib, opts) => (goldRolled(b) ? Math.max(0, Math.round(num(b.gold) * 100) - spentCopper(b, lib, opts)) : 0);
export const equipmentOverspent = (b, lib, opts) => (goldRolled(b) ? spentCopper(b, lib, opts) > Math.round(num(b.gold) * 100) : spentCopper(b, lib, opts) > 0);
export function adjustEquipment(b, lib, opts, key, delta) {
  if (delta > 0 && !goldRolled(b)) return { b, error: "You do not have enough money. Please roll for starting funds." };
  const item = lib.items.find((entry) => entry.key === key);
  if (!item) return { b };
  if (delta > 0 && itemCost(opts, item) > remainingCopper(b, lib, opts)) return { b, error: "You do not have enough money for that item." };
  const qty = Math.max(0, num(b.equipment?.[key]) + delta);
  const equipment = { ...b.equipment };
  if (qty <= 0) delete equipment[key];
  else equipment[key] = qty;
  return { b: { ...b, equipment } };
}
export const coinText = (copper) => {
  const value = Math.max(0, Math.floor(num(copper)));
  return `${Math.floor(value / 100)} gp, ${Math.floor((value % 100) / 10)} sp, ${value % 10} cp`;
};
export function equipmentSummary(b, lib, opts) {
  if (!goldRolled(b)) return gearLevel(b) > 1 ? "Set wealth by level before buying gear." : "Roll starting funds before buying gear.";
  return `Remaining ${coinText(remainingCopper(b, lib, opts))} (spent ${formatNumber(spentCopper(b, lib, opts) / 100)} of ${formatNumber(num(b.gold))} gp)${wizardOptions(opts).vault ? " - Vault freebies enabled" : ""}`;
}
export function goldInstruction(b, lib, opts) {
  let text;
  if (gearLevel(b) > 1) {
    const wealth = WEALTH_BY_LEVEL_GP[gearLevel(b)] ?? 0;
    text = goldRolled(b) ? `Wealth by level has been set (${formatNumber(wealth)} gp for level ${gearLevel(b)}). Your remaining funds are shown below.` : `A level ${gearLevel(b)} character starts with wealth by level (DMG Table 5-1): ${formatNumber(wealth)} gp. Click the die button below to set it before purchasing equipment.`;
  } else text = goldRolled(b) ? "Starting gold has been rolled. Your remaining funds are shown below." : "Roll starting gold with the die button below before purchasing equipment.";
  // Unspent coins go on the sheet: 50 coins to the pound.
  if (goldRolled(b)) {
    const copper = remainingCopper(b, lib, opts);
    const coins = Math.floor(copper / 100) + Math.floor((copper % 100) / 10) + (copper % 10);
    const pounds = Math.floor(coins / 50);
    if (pounds >= 5) text += ` Unspent coins go on the sheet and weigh ${formatNumber(pounds)} lb (50 coins = 1 lb).`;
  }
  return text;
}

// --- Pages, warnings, the spec -----------------------------------------------------------
export function pageComplete(b, lib, opts, page) {
  switch (page) {
    case "basics":
      return (b.rolled === true || methodOf(b, opts).manual === true) && increasesComplete(b);
    case "race":
      return Boolean(b.race);
    case "class":
      return hasClassPlan(b);
    case "languages":
      return languagesComplete(b);
    case "alignment":
      return Boolean(b.alignment);
    case "skills":
      return skillsComplete(b, lib);
    case "feats":
      return featsComplete(b, lib);
    case "equipment":
      return goldRolled(b);
    case "spells":
      return spellsComplete(b);
    case "details":
      return String(b.details?.name ?? "").trim() !== "";
    case "commit":
      return readyToCommit(b, lib, opts);
    default:
      return false;
  }
}
export function readyToCommit(b, lib, opts) {
  return String(b.details?.name ?? "").trim() !== "" && Boolean(b.race) && hasClassPlan(b) && languagesComplete(b) && Boolean(b.alignment) && goldRolled(b) && skillsComplete(b, lib) && !equipmentOverspent(b, lib, opts) && featsComplete(b, lib) && spellsComplete(b) && increasesComplete(b);
}
export function warnings(b, lib, opts, text) {
  const out = PAGES.filter((page) => page !== "commit" && !pageComplete(b, lib, opts, page)).map((page) => ({ page, text: text?.[page] ?? PAGE_LABEL[page], note: false }));
  if (equipmentOverspent(b, lib, opts)) out.push({ page: "equipment", text: "Gear: you have spent more than your starting gold", note: false });
  const la = levelAdjustment(b);
  if (la > 0 && b.race) {
    const ecl = effectiveLevel(b);
    out.push({ page: "race", note: true, text: `DM approval: ${b.race} counts as ${la} extra level${la === 1 ? "" : "s"} (level adjustment +${la}). This character is effective level ${ecl} (${planSummary(b).replace(/\s*\(.*\)$/, "")}), starts with ${(500 * ecl * Math.max(ecl - 1, 0)).toLocaleString("en-US")} XP and levels up as a level ${ecl} character. Ask your DM before playing it.` });
  }
  return out;
}
// What is still open when the character is saved anyway (FG: "saved unfinished").
export function createIssues(b, lib, opts) {
  const issues = [];
  const add = (text, page) => issues.push({ text, page });
  if (!String(b.details?.name ?? "").trim()) add("Enter a character name on the Details page.", "details");
  if (!b.race) add("Choose a race from the loaded records.", "race");
  if (!hasClassPlan(b)) add("Choose a class from the loaded records.", "class");
  if (!b.race || !hasClassPlan(b)) {
    if (!b.alignment) add("Choose an alignment.", "alignment");
    add("Languages, skills, feats, equipment and spells follow from race and class.", "race");
    return issues;
  }
  if (!languagesComplete(b)) add("Select exactly the available number of bonus languages.", "languages");
  if (!b.alignment) add("Choose an alignment.", "alignment");
  if (b.alignment && !alignmentAllowed(b, b.alignment)) add("The current alignment is not allowed by the selected class plan.", "alignment");
  if (skillsOverspent(b, lib)) add("Skill points are overspent.", "skills");
  if (!skillsComplete(b, lib)) add("Spend all required skill points before committing.", "skills");
  if (!featsComplete(b, lib)) add("Choose the required feats before committing.", "feats");
  if (equipmentOverspent(b, lib, opts)) add("Starting equipment costs more than available gold.", "equipment");
  if (!spellsComplete(b)) add("Choose the required starting spells before committing.", "spells");
  if (!increasesComplete(b)) add(`Assign exactly ${increasesDue(b)} level-based ability increase(s) on the Abilities page.`, "basics");
  return issues;
}

// The spec the host builds the character from (rules.mjs buildFromSpec).
export function toSpec(b, lib, opts) {
  const choice = (kind) => choiceSelections(b, kind).map((item) => item.name);
  const unfinished = createIssues(b, lib, opts).map((issue) => issue.text);
  const gear = Object.entries(b.equipment ?? {})
    .map(([key, qty]) => [lib.items.find((item) => item.key === key)?.name, num(qty)])
    .filter(([name, qty]) => name && qty > 0);
  const details = b.details ?? {};
  const deity = String(details.deity ?? "").trim() || (choiceText(b, "deity") && choiceText(b, "deity") !== NO_DEITY ? choiceText(b, "deity") : "");
  return {
    name: String(details.name ?? "").trim() || "Unnamed character",
    race: b.race ?? "",
    classes: plan(b).map((entry) => ({ name: entry.name, level: num(entry.levels) })),
    level: totalLevels(b) || 1,
    scores: Object.fromEntries(STATS.map((stat) => [stat, num(b.abilities?.[stat], 10)])),
    increases: Object.fromEntries(STATS.map((stat) => [stat, Math.max(0, Math.floor(num(b.increases?.[stat])))])),
    alignment: b.alignment ?? "",
    languages: [...new Set([...knownLanguages(b), ...chosenLanguages(b)])].sort(),
    skills: Object.fromEntries(Object.entries(b.skills ?? {}).filter(([, ranks]) => num(ranks) > 0)),
    feats: (b.feats ?? []).map((feat) => feat.name),
    gold: goldRolled(b) ? remainingCopper(b, lib, opts) / 100 : 0,
    gear,
    spells: (b.spells ?? []).filter((spell) => !isChoiceKind(spell.classkey)).map((spell) => ({ name: spell.name, class: spell.classlabel, level: spell.level })),
    choices: {
      deity: choiceText(b, "deity") ?? "",
      domains: choice("domain"),
      channel: forcedChannel(b) ?? choiceText(b, "channel") ?? "",
      school: choiceText(b, "school") ?? "",
      prohibited: choice("prohibited"),
      familiar: choiceText(b, "familiar") ?? "",
      companion: choiceText(b, "companion") ?? "",
      mount: choiceText(b, "mount") ?? "",
      combatstyle: choiceText(b, "combatstyle") ?? "",
      favoredenemies: choice("favoredenemy"),
      febonus: choice("febonus"),
      roguespecials: choice("roguespecial"),
      advlearning: choice("advlearning"),
    },
    deity,
    gender: String(details.gender ?? ""),
    age: String(details.age ?? ""),
    height: String(details.height ?? ""),
    weight: String(details.weight ?? ""),
    appearance: String(details.appearance ?? ""),
    notes: [unfinished.length ? `Unfinished in the character wizard (finish with your DM): ${unfinished.join(" ")}` : "", String(details.notes ?? "")].filter(Boolean).join("\n\n"),
    fill: false,
  };
}

// The features a class's choices put on the sheet (FG adds them as special abilities).
export function choiceFeatures(choices, levels, lib) {
  const out = [];
  const c = choices && typeof choices === "object" ? choices : {};
  const list = (value) => (Array.isArray(value) ? value.map(String).filter(Boolean) : value ? [String(value)] : []);
  const cleric = levels.cleric ?? 0;
  const maxDomain = maxSpellLevelFor("cleric", cleric);
  for (const name of list(c.domains)) {
    const domain = (lib?.domains ?? []).find((item) => item.name.toLowerCase() === name.toLowerCase() || item.name.toLowerCase() === `${name.toLowerCase()} domain`);
    const spells = (domain?.spells ?? []).map((spell) => `${spell.level} ${spell.name}`).join(", ");
    out.push({ name: domain?.name ?? name, class: "Cleric", level: 1, text: `Granted power: ${domain?.grantedpower ?? ""}\nDomain spells: ${spells}. Prepare one domain spell of each level you can cast in your domain slot.`, spells: (domain?.spells ?? []).filter((spell) => spell.level >= 1 && spell.level <= maxDomain).map((spell) => spell.name) });
  }
  if (c.channel && (c.deity || list(c.domains).length)) out.push({ name: c.channel, class: "Cleric", level: 1, text: `${c.channel === "Turn Undead" ? "Turn (or destroy) undead" : "Rebuke (or command) undead"} 3 + Charisma modifier times per day, as a cleric of your level.` });
  if (c.school === "Generalist") out.push({ name: "Generalist Wizard", class: "Wizard", level: 1, text: "No specialist school; all schools of magic are open." });
  else if (c.school) out.push({ name: `Specialist Wizard: ${c.school}`, class: "Wizard", level: 1, text: `One extra ${c.school} spell per day of each spell level you can cast; +2 on Spellcraft checks to learn ${c.school} spells. Prohibited schools: ${list(c.prohibited).join(", ")}.` });
  if (c.familiar && c.familiar !== "No familiar") out.push({ name: `Familiar: ${c.familiar}`, class: levels.wizard ? "Wizard" : "Sorcerer", level: 1, text: FAMILIARS.find(([name]) => name === c.familiar)?.[1] ?? "" });
  if (c.companion && c.companion !== "Choose later") out.push({ name: `Animal Companion: ${c.companion}`, class: levels.druid ? "Druid" : "Ranger", level: levels.druid ? 1 : 4, text: "" });
  if (c.mount) out.push({ name: `Special Mount: ${c.mount}`, class: "Paladin", level: 5, text: "" });
  if (c.combatstyle) out.push({ name: `Combat Style: ${c.combatstyle}`, class: "Ranger", level: 2, text: "The style's feats count even without their prerequisites, but only in light or no armor." });
  const bonus = {};
  for (const enemy of list(c.favoredenemies)) bonus[enemy] ??= 2;
  for (const enemy of list(c.febonus)) bonus[enemy] = (bonus[enemy] ?? 2) + 2;
  for (const [enemy, plus] of Object.entries(bonus)) out.push({ name: `Favored Enemy: ${enemy} (+${plus})`, class: "Ranger", level: 1, text: `+${plus} on Bluff, Listen, Sense Motive, Spot and Survival checks and on weapon damage rolls against this type of creature.` });
  for (const special of list(c.roguespecials)) {
    const found = ROGUE_SPECIALS.find(([name]) => name === special);
    if (found && found[0] !== "Feat") out.push({ name: found[0], class: "Rogue", level: 10, text: found[1] });
  }
  if (list(c.advlearning).length) out.push({ name: "Advanced Learning Spells", class: "Mesmer", level: 3, text: `Learned: ${list(c.advlearning).join("; ")}. These sorcerer/wizard Illusion and Enchantment spells are on this mesmer's spell list and are known in addition to the normal spells known.` });
  return out;
}
