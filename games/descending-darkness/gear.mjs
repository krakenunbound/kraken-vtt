// Descending Darkness: weapons, armour and adventuring gear. Prices in gold
// crowns (gc). Fields are the ones the d20 engine reads (shared/dnd5e/rules.mjs):
// damage "1d8 Slashing", properties, subtype ("Martial Melee Weapons"),
// type "Weapon" / "Armor" / "Adventuring Gear", ac, dexbonus, weight.
import { md } from "../lib/fg.mjs";

const weapon = (name, cost, damage, subtype, properties, weight, text = "") => ({
  name,
  type: "Weapon",
  subtype,
  cost: `${cost} gc`,
  damage,
  properties,
  weight,
  bonus: 0,
  rarity: "common",
  description: md(text || `A ${name.toLowerCase()}. ${properties && properties !== "-" ? `Properties: ${properties}.` : ""}`),
  __category: "Weapons",
});
const armor = (name, cost, ac, subtype, dexbonus, weight, stealth, text) => ({
  name,
  type: "Armor",
  subtype,
  cost: `${cost} gc`,
  ac,
  dexbonus,
  stealth,
  weight,
  bonus: 0,
  rarity: "common",
  description: md(text),
  __category: "Armour",
});
const gear = (name, cost, weight, text, subtype = "Standard") => ({
  name,
  type: "Adventuring Gear",
  subtype,
  cost: `${cost} gc`,
  weight,
  rarity: "common",
  description: md(text),
  __category: "Gear",
});

export const WEAPONS = [
  weapon("Dagger", 2, "1d4 Piercing", "Simple Melee Weapons", "Finesse, Light, Thrown (Range 20/60)", 1, "A long knife, the last weapon anyone gives up."),
  weapon("Club", 0.1, "1d4 Bludgeoning", "Simple Melee Weapons", "Light", 2),
  weapon("Cudgel", 2, "1d8 Bludgeoning", "Simple Melee Weapons", "Two-Handed", 10, "A heavy length of oak bound in iron at one end."),
  weapon("Handaxe", 5, "1d6 Slashing", "Simple Melee Weapons", "Light, Thrown (Range 20/60)", 2),
  weapon("Mace", 5, "1d6 Bludgeoning", "Simple Melee Weapons", "-", 4),
  weapon("Spear", 1, "1d6 Piercing", "Simple Melee Weapons", "Thrown (Range 20/60), Versatile (1d8)", 3),
  weapon("Quarterstaff", 0.2, "1d6 Bludgeoning", "Simple Melee Weapons", "Versatile (1d8)", 4),
  weapon("Sickle", 1, "1d4 Slashing", "Simple Melee Weapons", "Light", 2),
  weapon("Sling", 0.1, "1d4 Bludgeoning", "Simple Ranged Weapons", "Ammunition (Range 30/120)", 0),
  weapon("Shortbow", 25, "1d6 Piercing", "Simple Ranged Weapons", "Ammunition (Range 80/320), Two-Handed", 2),
  weapon("Light Crossbow", 25, "1d8 Piercing", "Simple Ranged Weapons", "Ammunition (Range 80/320), Loading, Two-Handed", 5),
  weapon("Shortsword", 10, "1d6 Piercing", "Martial Melee Weapons", "Finesse, Light", 2),
  weapon("Longsword", 15, "1d8 Slashing", "Martial Melee Weapons", "Versatile (1d10)", 3, "The knight's blade: long enough to keep death an arm away."),
  weapon("Rapier", 25, "1d8 Piercing", "Martial Melee Weapons", "Finesse", 2),
  weapon("Battleaxe", 10, "1d8 Slashing", "Martial Melee Weapons", "Versatile (1d10)", 4),
  weapon("Warhammer", 15, "1d8 Bludgeoning", "Martial Melee Weapons", "Versatile (1d10)", 2),
  weapon("Flail", 10, "1d8 Bludgeoning", "Martial Melee Weapons", "-", 2),
  weapon("Morningstar", 15, "1d8 Piercing", "Martial Melee Weapons", "-", 4),
  weapon("Greatsword", 50, "2d6 Slashing", "Martial Melee Weapons", "Heavy, Two-Handed", 6),
  weapon("Greataxe", 30, "1d12 Slashing", "Martial Melee Weapons", "Heavy, Two-Handed", 7),
  weapon("Halberd", 20, "1d10 Slashing", "Martial Melee Weapons", "Heavy, Reach, Two-Handed", 6),
  weapon("Longbow", 50, "1d8 Piercing", "Martial Ranged Weapons", "Ammunition (Range 150/600), Heavy, Two-Handed", 2),
  weapon("Hand Crossbow", 75, "1d6 Piercing", "Martial Ranged Weapons", "Ammunition (Range 30/120), Light, Loading", 3),
  weapon("Heavy Crossbow", 50, "1d10 Piercing", "Martial Ranged Weapons", "Ammunition (Range 100/400), Heavy, Loading, Two-Handed", 18),
];

export const ARMOUR = [
  armor("Quilted Coat", 5, 11, "Light Armor", "Yes", 8, "Disadvantage", "Layers of stitched cloth. Better than nothing, and warm."),
  armor("Leather Jerkin", 10, 11, "Light Armor", "Yes", 10, "-", "Boiled and oiled leather over the chest and shoulders."),
  armor("Ringed Leather", 45, 12, "Light Armor", "Yes", 13, "-", "Leather sewn with iron rings, quiet enough for thieves."),
  armor("Hide Coat", 10, 12, "Medium Armor", "Max 2", 12, "-", "Thick furs and hides, the hunter's armour."),
  armor("Mail Shirt", 50, 13, "Medium Armor", "Max 2", 20, "-", "A shirt of interlocking rings under a tunic."),
  armor("Scale Hauberk", 50, 14, "Medium Armor", "Max 2", 45, "Disadvantage", "Overlapping plates of steel on a leather coat."),
  armor("Cuirass", 400, 14, "Medium Armor", "Max 2", 20, "-", "A fitted steel breast and back."),
  armor("Ring Mail", 30, 14, "Heavy Armor", "No", 40, "Disadvantage", "Heavy leather with iron rings sewn close."),
  armor("Chain Hauberk", 75, 16, "Heavy Armor", "No", 55, "Disadvantage", "Mail from neck to knee over a padded coat. Strength 13."),
  armor("Plate Harness", 1500, 18, "Heavy Armor", "No", 65, "Disadvantage", "Shaped steel plates over every part of the body. Strength 15."),
  armor("Shield", 10, 2, "Shield", "-", 6, "-", "Wood or metal on the arm: +2 Defense."),
];

export const GEAR = [
  gear("Torch", 0.01, 1, "A torch burns for **six exploration turns** (an hour). It sheds bright light 20 feet and dim light 20 feet beyond. Lit, it shows everyone where you are."),
  gear("Lantern, Hooded", 5, 2, "Burns a flask of oil for **24 turns** (four hours): bright light 30 feet, dim 30 beyond. Hooded, it gives only dim light 5 feet."),
  gear("Lantern, Bullseye", 10, 2, "Burns a flask of oil for 24 turns: a 60-foot cone of bright light and 60 feet of dim beyond. The cone must point somewhere."),
  gear("Oil, Flask", 0.1, 1, "Fuel for a lantern (24 turns). Thrown and set alight, it burns a creature for 1d4 fire a turn for two turns."),
  gear("Candle", 0.01, 0, "Burns for six turns: dim light 5 feet. Enough to read by, not enough to fight by."),
  gear("Tinderbox", 0.5, 1, "Flint, steel and tinder. Lighting a torch takes an action; in the wind or wet, a Dexterity check (DC 12)."),
  gear("Rope, Hempen (50 feet)", 1, 10, "Strong enough for two climbers. A Strength check (DC 18) breaks it."),
  gear("Grappling Hook", 2, 4, "An iron hook for a rope's end."),
  gear("Crowbar", 2, 5, "Advantage on Strength checks where leverage helps: a jammed door, a coffin lid."),
  gear("Iron Spikes (10)", 1, 5, "For wedging doors shut, or open."),
  gear("Chalk (5 sticks)", 0.01, 0, "For marking the way back. Every dungeon has someone who forgot to."),
  gear("Pole (10 feet)", 0.05, 7, "For prodding what you would rather not step on."),
  gear("Caltrops (bag of 20)", 1, 2, "Scattered over a 5-foot square: whoever enters stops and makes a Dexterity save (DC 15) or takes 1 piercing damage and moves at half speed until healed."),
  gear("Bedroll", 1, 7, "A safe rest needs one (or a bed)."),
  gear("Rations (1 day)", 0.5, 2, "Dried meat, hard bread, an onion. A safe rest needs food and water."),
  gear("Waterskin", 0.2, 5, "Holds a day's water."),
  gear("Backpack", 2, 5, "Holds 30 pounds of gear."),
  gear("Healer's Satchel", 5, 3, "Bandages, salves and splints for ten uses. An action and a use steadies a dying creature without a check, or lets a creature spend one Recovery Die outside a rest."),
  gear("Holy Symbol", 5, 1, "A cleric's or paladin's focus: an amulet, a reliquary, a sigil painted on a shield.", "Focus"),
  gear("Arcane Focus", 10, 1, "A wizard's or bard's focus: a wand, a crystal, a worn instrument.", "Focus"),
  gear("Spellbook", 50, 3, "A wizard's book of spells: 100 vellum pages, a lock, and the smell of old candle smoke."),
  gear("Thieves' Tools", 25, 1, "Picks, a small file, a mirror on a stick and a pair of narrow pliers. Needed to pick locks and disarm traps."),
  gear("Mirror, Steel", 5, 0.5, "For looking round corners, and at what you should not look at directly."),
  gear("Manacles", 2, 6, "Iron cuffs. Escaping them: Dexterity (DC 18); breaking them: Strength (DC 20)."),
  gear("Lucky Charm", 1, 0, "A rabbit's foot, a saint's bone, a coin with a hole in it. Once per safe rest, when you gain Dread, you may ignore one point of it."),
  gear("Arrows (20)", 1, 1, "Ammunition for bows.", "Ammunition"),
  gear("Bolts (20)", 1, 1.5, "Ammunition for crossbows.", "Ammunition"),
  gear("Sling Bullets (20)", 0.04, 1.5, "Ammunition for slings.", "Ammunition"),
];

// The packs a class starts with: [item name, count].
export const PACKS = {
  delver: [["Backpack", 1], ["Bedroll", 1], ["Tinderbox", 1], ["Torch", 6], ["Rations (1 day)", 5], ["Waterskin", 1], ["Rope, Hempen (50 feet)", 1], ["Chalk (5 sticks)", 1]],
  scholar: [["Backpack", 1], ["Bedroll", 1], ["Tinderbox", 1], ["Candle", 6], ["Rations (1 day)", 3], ["Waterskin", 1]],
};
