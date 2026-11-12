// Descending Darkness: the seven classes and five kin of the playtest, filled
// out to tenth level. Fields are what Kraken's d20 engine reads from a class
// (hit die, saves, skill choices, starting gear) and a kin (speed, traits,
// ability adjustments, the classes it may take).
import { ids, md } from "../lib/fg.mjs";
import { ARMOUR, GEAR, PACKS, WEAPONS } from "./gear.mjs";

const ALL_ITEMS = [...WEAPONS, ...ARMOUR, ...GEAR];
const item = (name, count = 1) => {
  const found = ALL_ITEMS.find((entry) => entry.name === name);
  if (!found) throw new Error(`No item ${name} for a starting kit.`);
  const { __category, ...fields } = found;
  return { ...fields, count };
};
// A starting kit as the 2024 books give one: (A) the class's gear, or (B)
// gold crowns to buy your own (the gear's worth, rounded up to 5 gc).
const worth = (list) => list.reduce((sum, entry) => sum + (Number(String(entry.cost ?? "").replace(/[^0-9.]/g, "")) || 0) * (entry.count ?? 1), 0);
const kitWealth = (...lists) => Math.ceil(worth(lists.flat(2).map(([name, count]) => item(name, count))) / 5) * 5;
const kit = (...lists) => ({ "id-00001": { option: "Option 1", items: ids(lists.flat(2).map(([name, count]) => item(name, count))) }, "id-00002": { option: "Option 2", wealth: kitWealth(...lists) } });
const features = (list) => ids(list.map(([level, name, text]) => ({ level, name, text: md(text) })));

const cls = ({ name, die, saves, armor, weapons, skills, ability, gear, gearText, text, feats }) => ({
  name,
  ability,
  hp: { hitdice: { text: `D${die} per ${name} level` } },
  proficiencies: {
    armor: { text: armor },
    weapons: { text: weapons },
    savingthrows: { text: saves },
    skills: { text: skills },
  },
  startingequipment: `Choose A or B: (A) ${gearText.replace(/\.$/, "")}; or (B) ${kitWealth(gear)} gc.`,
  startingequipmentlist: kit(gear),
  text: md(text),
  features: features(feats),
});

export const CLASSES = [
  cls({
    name: "Fighter",
    die: 10,
    ability: "Strength or Dexterity",
    saves: "Strength and Constitution",
    armor: "All armour and shields",
    weapons: "Simple and Martial weapons",
    skills: "Choose 2: Acrobatics, Athletics, History, Insight, Intimidation, Perception, Survival",
    gear: [[["Chain Hauberk", 1], ["Longsword", 1], ["Shield", 1], ["Light Crossbow", 1], ["Bolts (20)", 1]], PACKS.delver],
    gearText: "Chain hauberk, longsword, shield, light crossbow and 20 bolts, a delver's pack.",
    text: "Fighters stand between the party and what comes out of the dark. They wear the heaviest armour, use every weapon, and keep going when others fall.",
    feats: [
      [1, "Hard Lessons", "Choose a way of fighting: **Shieldwall** (+1 Defense with a shield), **Bladework** (+2 to damage with a one-handed weapon and nothing in the other hand), **Marksman** (+2 to ranged attack rolls) or **Brute** (reroll 1s and 2s on the damage dice of a two-handed weapon, once)."],
      [1, "Second Breath", "Once per safe rest, as a bonus action, you regain 1d10 + your Fighter level Health."],
      [2, "Press On", "Once per safe rest, on your turn, you take one more action."],
      [3, "Battle-Scarred", "You score a critical hit on a 19 or 20. Your first point of Dread each fight is ignored."],
      [4, "Ability Improvement", "Add 2 to one ability score, or 1 to two (to a most of 20). Again at 8th level."],
      [5, "Extra Attack", "When you take the Attack action you attack twice."],
      [6, "Hold the Line", "When a creature within 5 feet of you hits an ally, you may use your reaction to make one weapon attack against it."],
      [7, "Iron Nerve", "You have advantage on saves against being frightened, and a safe rest lowers your Dread by 2, not 1."],
      [9, "Indomitable", "Once per safe rest, reroll a saving throw you failed; you must use the new roll."],
      [10, "Champion of the Lost", "Allies within 10 feet of you who can see you add 1 to their saves. Second Breath heals 2d10 + your level."],
    ],
  }),
  cls({
    name: "Cleric",
    die: 8,
    ability: "Wisdom",
    saves: "Wisdom and Charisma",
    armor: "Light and medium armour and shields",
    weapons: "Simple weapons",
    skills: "Choose 2: History, Insight, Medicine, Persuasion, Religion",
    gear: [[["Scale Hauberk", 1], ["Mace", 1], ["Shield", 1], ["Holy Symbol", 1], ["Healer's Satchel", 1]], PACKS.delver],
    gearText: "Scale hauberk, mace, shield, holy symbol, healer's satchel, a delver's pack.",
    text: "Clerics carry a light that is not a lantern's. They mend the wounded, steady the afraid, and turn back the dead that should not walk.",
    feats: [
      [1, "Spellcasting", "You cast cleric spells with Wisdom: spell save DC 8 + your proficiency + Wisdom; spell attack your proficiency + Wisdom. You know every cleric spell of a circle you can cast; prepare a number of them equal to your Wisdom modifier + your level after a safe rest."],
      [1, "Lantern of Faith", "Your holy symbol is a light: as a bonus action it sheds bright light 20 feet and dim 20 beyond until you douse it, burning no oil."],
      [2, "Turn the Dead", "Once per safe rest (twice from 6th level), as an action, present your symbol: each undead within 30 feet that can see it makes a Wisdom save against your spell DC or flees for a minute."],
      [2, "Steadying Word", "As an action, a companion within 30 feet loses 1 Dread. Once per safe rest; twice from 6th level."],
      [4, "Ability Improvement", "Add 2 to one ability score, or 1 to two (to a most of 20). Again at 8th level."],
      [5, "Burn the Dead", "When an undead of low power (the GM says) fails its save against Turn the Dead, it is destroyed."],
      [6, "Sanctuary of Light", "Within your Lantern of Faith's bright light, companions have advantage on saves against being frightened."],
      [8, "Blessed Strikes", "Once on each of your turns, a weapon hit or cantrip deals 1d8 radiant damage more."],
      [10, "Miracle", "Once per week, call on your faith for something only a god could do; the GM decides how it is answered."],
    ],
  }),
  cls({
    name: "Wizard",
    die: 6,
    ability: "Intelligence",
    saves: "Intelligence and Wisdom",
    armor: "None",
    weapons: "Daggers, quarterstaffs, slings and light crossbows",
    skills: "Choose 2: Arcana, History, Insight, Investigation, Medicine, Religion",
    gear: [[["Quarterstaff", 1], ["Dagger", 1], ["Spellbook", 1], ["Arcane Focus", 1]], PACKS.scholar],
    gearText: "Quarterstaff, dagger, spellbook, arcane focus, a scholar's pack.",
    text: "Wizards read the dark, and sometimes it reads back. They are fragile, and the most dangerous people in any room.",
    feats: [
      [1, "Spellcasting", "You cast wizard spells with Intelligence: spell save DC 8 + your proficiency + Intelligence; spell attack your proficiency + Intelligence. Your spellbook holds six 1st-circle spells and you learn two more each level; prepare Intelligence modifier + level of them after a safe rest."],
      [1, "Quiet Study", "Once per safe rest, after a short rest of an exploration turn, you regain spell slots whose circles add up to half your level (rounded up), none higher than 5th."],
      [2, "Lorekeeper", "Choose Arcana, History or Religion: your proficiency bonus doubles for it."],
      [4, "Ability Improvement", "Add 2 to one ability score, or 1 to two (to a most of 20). Again at 8th level."],
      [5, "Sculpted Spells", "When you cast a spell that makes several creatures save, choose up to your Intelligence modifier of them: they succeed automatically and take no damage."],
      [6, "Words of Warding", "Once per safe rest, when a creature you can see would gain Dread from magic, it does not."],
      [9, "Spell Mastery", "Choose a 1st-circle spell you know: you can cast it without a slot."],
      [10, "Unweaving Hand", "You learn Unweave and always have it prepared; once per safe rest you cast it without a slot."],
    ],
  }),
  cls({
    name: "Thief",
    die: 8,
    ability: "Dexterity",
    saves: "Dexterity and Intelligence",
    armor: "Light armour",
    weapons: "Simple weapons, hand crossbows, rapiers and shortswords",
    skills: "Choose 4: Acrobatics, Athletics, Deception, Insight, Intimidation, Investigation, Perception, Performance, Persuasion, Sleight of Hand, Stealth",
    gear: [[["Leather Jerkin", 1], ["Shortsword", 1], ["Dagger", 2], ["Shortbow", 1], ["Arrows (20)", 1], ["Thieves' Tools", 1]], PACKS.delver],
    gearText: "Leather jerkin, shortsword, two daggers, shortbow and 20 arrows, thieves' tools, a delver's pack.",
    text: "Thieves go first into the dark and come back with what was in it. Locks, traps and unwary throats are their trade.",
    feats: [
      [1, "Sneak Strike", "Once per turn, a hit with a finesse or ranged weapon deals 1d6 more damage when you have advantage, or when an ally stands within 5 feet of your target. The bonus grows by 1d6 at every odd level (2d6 at 3rd, 3d6 at 5th, and so on)."],
      [1, "Cant and Craft", "You speak the thieves' cant, and you are proficient with thieves' tools: double your proficiency bonus for them."],
      [2, "Slip Away", "As a bonus action on your turn: Dash, Disengage or Hide."],
      [3, "Light Fingers", "You can pick a lock, disarm a trap or use a healer's satchel as a bonus action."],
      [4, "Ability Improvement", "Add 2 to one ability score, or 1 to two (to a most of 20). Again at 8th level."],
      [5, "Duck and Weave", "When an attacker you can see hits you, use your reaction to halve the damage."],
      [7, "Evasion", "When a spell or trap lets you make a Dexterity save for half damage, you take none on a success and half on a failure."],
      [9, "Shadow-Born", "In dim light or darkness you have advantage on Stealth, and a creature that does not see you does not gain advantage against you."],
      [10, "Thief's Luck", "Once per safe rest, turn a miss into a hit, or a failed check into a 20."],
    ],
  }),
  cls({
    name: "Paladin",
    die: 10,
    ability: "Strength and Charisma",
    saves: "Wisdom and Charisma",
    armor: "All armour and shields",
    weapons: "Simple and Martial weapons",
    skills: "Choose 2: Athletics, Insight, Intimidation, Medicine, Persuasion, Religion",
    gear: [[["Chain Hauberk", 1], ["Longsword", 1], ["Shield", 1], ["Spear", 2], ["Holy Symbol", 1]], PACKS.delver],
    gearText: "Chain hauberk, longsword, shield, two spears, holy symbol, a delver's pack.",
    text: "Paladins have sworn to stand against the dark, and their oath stands with them: it heals by their hands, and burns in their blade.",
    feats: [
      [1, "Laying On of Hands", "You have a pool of healing equal to five times your Paladin level, refilled by a safe rest. As an action, touch a creature and give it Health from the pool, or spend 5 to end a disease or poison."],
      [1, "Sense the Unholy", "As an action, you know where undead and fiends are within 60 feet, until the end of your next turn. Once per safe rest, plus your Charisma modifier."],
      [2, "Spellcasting", "From 2nd level you cast paladin spells with Charisma; slots as a half-caster (Kraken counts them)."],
      [2, "Smite", "When you hit with a melee weapon, spend a spell slot: 2d8 radiant damage more, +1d8 per circle above the first, +1d8 against undead or fiends."],
      [3, "Oath's Shelter", "You and companions within 10 feet of you cannot be frightened while you are conscious."],
      [4, "Ability Improvement", "Add 2 to one ability score, or 1 to two (to a most of 20). Again at 8th level."],
      [5, "Extra Attack", "When you take the Attack action you attack twice."],
      [6, "Aura of Resolve", "You and companions within 10 feet add your Charisma modifier (at least 1) to their saving throws while you are conscious."],
      [10, "Radiant Arms", "Every melee weapon hit you make deals 1d8 radiant damage more."],
    ],
  }),
  cls({
    name: "Ranger",
    die: 10,
    ability: "Dexterity and Wisdom",
    saves: "Strength and Dexterity",
    armor: "Light and medium armour and shields",
    weapons: "Simple and Martial weapons",
    skills: "Choose 3: Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth, Survival",
    gear: [[["Hide Coat", 1], ["Shortsword", 2], ["Longbow", 1], ["Arrows (20)", 2]], PACKS.delver],
    gearText: "Hide coat, two shortswords, longbow and 40 arrows, a delver's pack.",
    text: "Rangers know the wild places between the towns and the ruins, and what hunts there. They track it, and they hunt it back.",
    feats: [
      [1, "Pathfinder", "You and companions travelling with you cannot be lost by anything but magic, and you always know which way is north and how far you have come. Foraging finds food for two more people."],
      [1, "Favoured Prey", "Choose beasts, the undead, or the folk of the deep (goblins and their kin): advantage to track them and recall what you know of them, and +2 damage against them."],
      [2, "Spellcasting", "From 2nd level you cast ranger spells with Wisdom; slots as a half-caster."],
      [2, "Fighting Style", "**Archer** (+2 to ranged attack rolls) or **Twin Blades** (add your ability modifier to the off-hand attack's damage)."],
      [3, "Hunter's Eye", "Once per turn, a weapon hit on a creature you have marked with Hunter's Quarry deals 1d8 more damage."],
      [4, "Ability Improvement", "Add 2 to one ability score, or 1 to two (to a most of 20). Again at 8th level."],
      [5, "Extra Attack", "When you take the Attack action you attack twice."],
      [6, "Night Eyes", "You see in dim light as if it were bright, and in darkness 30 feet as if it were dim."],
      [10, "Unseen Hunter", "Hiding is a bonus action for you, and you stay hidden after a missed attack."],
    ],
  }),
  cls({
    name: "Bard",
    die: 8,
    ability: "Charisma",
    saves: "Dexterity and Charisma",
    armor: "Light armour",
    weapons: "Simple weapons, hand crossbows, longswords, rapiers and shortswords",
    skills: "Choose any 3",
    gear: [[["Leather Jerkin", 1], ["Rapier", 1], ["Dagger", 1], ["Arcane Focus", 1]], PACKS.delver],
    gearText: "Leather jerkin, rapier, dagger, a worn instrument (arcane focus), a delver's pack.",
    text: "Bards are lorekeepers: they remember the old songs, the names of the dead, and where the stairs go. Their stories keep the dark at bay.",
    feats: [
      [1, "Spellcasting", "You cast bard spells with Charisma: spell save DC 8 + your proficiency + Charisma. You know four spells and learn one more each level."],
      [1, "Inspiration", "Three times per safe rest (more with Charisma: your modifier, at least 3), when a companion who can hear you rolls a d20, add 1d4 to it after seeing the roll but before the outcome is told. The die is 1d6 at 5th level and 1d8 at 9th."],
      [1, "Fireside Tales", "During a safe rest, every companion who listens regains 1 more Health per Recovery Die spent, and loses 1 Dread more."],
      [2, "Jack of All Trades", "Add half your proficiency bonus to checks you are not proficient in."],
      [3, "Expertise", "Choose two skills you are proficient in: double your proficiency bonus for them. Two more at 10th level."],
      [4, "Ability Improvement", "Add 2 to one ability score, or 1 to two (to a most of 20). Again at 8th level."],
      [6, "Song of Courage", "As an action, until the end of your next turn, companions who can hear you have advantage on saves against being frightened and ignore new Dread."],
      [10, "Lore of the Lost", "Learn two spells from any class's list; they are bard spells for you."],
    ],
  }),
];

const kin = ({ name, size, speed, adjust, classes, text, traits, hpperlevel = 0 }) => ({
  name,
  size,
  speed,
  abilityadjust: adjust,
  classes,
  ...(hpperlevel ? { hpperlevel } : {}),
  text: md(text),
  traits: ids(traits.map(([trait, body]) => ({ name: trait, text: md(body) }))),
});

export const KIN = [
  kin({
    name: "Human",
    size: "Medium",
    speed: "30 feet",
    adjust: "",
    classes: "Fighter, Cleric, Wizard, Thief, Paladin, Ranger, Bard",
    text: "The most numerous folk, and the most stubborn. Humans build towns on the bones of older towns and swear this time will be different.",
    traits: [
      ["Any Path", "A human may take any class."],
      ["Stubborn", "Once per safe rest, when you would gain Dread, ignore one point of it."],
      ["Quick Study", "You are proficient in one skill of your choice."],
    ],
  }),
  kin({
    name: "Elf",
    size: "Medium",
    speed: "30 feet",
    adjust: "Dexterity +1, Constitution -1",
    classes: "Fighter, Cleric, Wizard, Thief, Ranger, Bard",
    text: "Elves live long and remember longer. They were old when the first towers fell, and they have watched the dark rise before.",
    traits: [
      ["Dimsight", "In faint light you make out shapes and find your way as well as in daylight, 60 feet around you; you cannot read fine writing or see detail at a distance. In total darkness you see nothing, like anyone."],
      ["Keen Senses", "You are proficient in Perception."],
      ["Long Memory", "Advantage on checks to recall the history of a place or a thing older than a human lifetime."],
    ],
  }),
  kin({
    name: "Half-Elf",
    size: "Medium",
    speed: "30 feet",
    adjust: "",
    classes: "Fighter, Cleric, Wizard, Thief, Ranger, Bard",
    text: "Born of two peoples and at home in neither, half-elves make their own way, and are often very good at it.",
    traits: [
      ["Dimsight", "As an elf's, to 30 feet."],
      ["Two Worlds", "You are proficient in two skills of your choice."],
    ],
  }),
  kin({
    name: "Dwarf",
    size: "Medium",
    speed: "25 feet",
    adjust: "Constitution +1, Charisma -1",
    classes: "Fighter, Cleric, Thief",
    hpperlevel: 1,
    text: "Dwarves dug the first deep halls, and lost most of them. They are hard, slow to trust, and slower to forgive.",
    traits: [
      ["Dimsight", "As an elf's, to 60 feet."],
      ["Hardy", "+1 Health at each level. Advantage on saves against poison."],
      ["Stonewise", "Advantage on checks about stonework: its age, who made it, where it is weak, and where a passage leads."],
    ],
  }),
  kin({
    name: "Gnome",
    size: "Small",
    speed: "25 feet",
    adjust: "Intelligence +1, Wisdom -1",
    classes: "Cleric, Wizard, Thief, Bard",
    text: "Small, curious and impossible to bore, gnomes take apart locks, clocks and spells to see how they work, and usually put them back together.",
    traits: [
      ["Dimsight", "As an elf's, to 60 feet."],
      ["Tinker's Eye", "Advantage on checks to understand, open or disable a mechanism: a lock, a trap, a clockwork."],
      ["Small and Quick", "You can move through the space of a creature larger than you."],
    ],
  }),
];

// Each background's kit: [[item, count]], gold crowns.
const BACKGROUND_KITS = {"Grave Digger":[[["Shovel",1],["Holy Symbol",1]],10],"Lamplighter":[[["Lantern, Hooded",1],["Oil, Flask",2]],10],"Deserter":[[["Dagger",1]],5],"Acolyte of the Ash":[[["Holy Symbol",1]],10],"Smuggler":[[],15],"Hedge Scholar":[[["Ink and Quill",1]],10],"Hunter":[[["Hunting Trap",1],["Dagger",1]],10],"Street Rat":[[["Lucky Charm",1]],5]};

export const BACKGROUNDS = [
  ["Grave Digger", "Athletics, Religion", "You buried the dead of a town that had too many. You know the old rites, and what a disturbed grave looks like.", "A shovel, a holy symbol of the dead, 10 gc"],
  ["Lamplighter", "Perception, Investigation", "You kept the street lamps of a city burning through the long nights. You know how long a flame lasts, and what moves when it goes out.", "A hooded lantern, two flasks of oil, 10 gc"],
  ["Deserter", "Athletics, Stealth", "You fled a war you did not believe in, and they are still looking for you.", "A worn sword-belt, a forged pass, 5 gc"],
  ["Acolyte of the Ash", "Religion, Insight", "You served a temple that keeps vigil fires against the dark. Its priests will give you a meal and a bed, and ask questions.", "A holy symbol, prayer beads, incense, 10 gc"],
  ["Smuggler", "Deception, Sleight of Hand", "You moved what was not allowed across borders that were not watched. You know who to pay, and how much.", "A coat with hidden pockets, 15 gc"],
  ["Hedge Scholar", "Arcana, History", "You learned from books nobody else wanted, in libraries nobody else visited.", "Ink, a quill, a book of half-remembered lore, 10 gc"],
  ["Hunter", "Survival, Nature", "You fed your family from the forest's edge, and learned which tracks to follow and which to run from.", "A hunting trap, a skinning knife, 10 gc"],
  ["Street Rat", "Stealth, Sleight of Hand", "You grew up on the streets and the rooftops, fed by quick hands and quicker feet.", "A map of a city's back ways, a lucky charm, 5 gc"],
].map(([name, skill, text, flavour]) => {
  // Its starting kit, as a 2024 background's: (A) its gear and coin, or (B) coin to buy your own.
  const [gear, coin] = BACKGROUND_KITS[name];
  const items = gear.map(([itemName, count]) => item(itemName, count));
  const wealth = Math.ceil((worth(items) + coin) / 5) * 5;
  const a = [...gear.map(([itemName, count]) => (count > 1 ? `${count} ${itemName}` : itemName)), `${coin} gc`].join(", ");
  const equipment = items.length ? `Choose A or B: (A) ${a}; or (B) ${wealth} gc. ${flavour}` : `${coin} gc. ${flavour}`;
  const equipmentlist = items.length ? { "id-00001": { option: "Option 1", items: ids(items), wealth: coin }, "id-00002": { option: "Option 2", wealth } } : { "id-00001": { option: "Option 1", wealth: coin } };
  return { name, skill, text: md(text), equipment, equipmentlist };
});
