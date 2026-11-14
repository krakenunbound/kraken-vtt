// Basic Fantasy Game Master's Guide: the Game Master's half of the Basic
// Fantasy Role-Playing Game, 4th Edition (CC BY-SA 4.0: see LICENSE.md).
// Every monster as an NPC record the combat tracker plays (its armor class,
// hit dice, attacks and damage, saves as, morale, treasure type, XP), the
// magic items as records, and the chapters on monsters, treasure, magic
// items, encounters and making adventures.
import { md, slug } from "../lib/fg.mjs";
import { chapter, credits, data, RULESET } from "./common.mjs";
import { isUndead } from "../../shared/bfrpg/rules.mjs";

export const MODULE = "Basic Fantasy Game Master's Guide";
const chapters = data("chapters");

export const MONSTERS = data("monsters").map((monster) => ({
  name: monster.name,
  ...(monster.group !== monster.name ? { group: monster.group } : {}),
  ac: monster.ac,
  hd: monster.hd,
  attacks: monster.attacks,
  damage: monster.damage,
  movement: monster.movement,
  numberappearing: monster.appearing,
  saveas: monster.saveas,
  morale: monster.morale,
  treasure: monster.treasure,
  xp: monster.xp,
  ...(isUndead(monster.name, monster) ? { type: "Undead", undead: 1 } : {}),
  text: md(monster.text || "(See its group's description.)"),
  __tag: slug(monster.name),
  __category: monster.name[0].toUpperCase() <= "F" ? "Monsters A-F" : monster.name[0].toUpperCase() <= "M" ? "Monsters G-M" : "Monsters N-Z",
}));
// Two monsters whose names make the same tag would lose one: the build stops instead.
{
  const seen = new Set();
  for (const monster of MONSTERS) {
    if (seen.has(monster.__tag)) throw new Error(`Two monsters tagged ${monster.__tag}`);
    seen.add(monster.__tag);
  }
}

// A described item's name as a table would say it: "Potion of Healing", "Ring of Protection".
const magicName = (item) => {
  if (item.subtype === "Potions") return `Potion of ${item.name}`;
  if (item.subtype === "Rings") return `Ring of ${item.name}`;
  if (item.subtype === "Magic Weapons") return `Magic weapon power: ${item.name}`;
  if (item.subtype === "Miscellaneous") return `Miscellaneous item effect: ${item.name}`;
  return item.name;
};
// Magic items: the book's described items, and plain weapons and armour with a bonus.
const PLAIN = [
  ["Dagger +1", "Weapon", "1d4", "2 gp", "S"],
  ["Shortsword +1", "Weapon", "1d6", "6 gp", "S"],
  ["Longsword +1", "Weapon", "1d8", "10 gp", "M"],
  ["Longsword +2", "Weapon", "1d8", "10 gp", "M"],
  ["Mace +1", "Weapon", "1d8", "6 gp", "M"],
  ["Warhammer +1", "Weapon", "1d6", "4 gp", "S"],
  ["Battle Axe +1", "Weapon", "1d8", "7 gp", "M"],
];
export const MAGIC_ITEMS = [
  ...PLAIN.map(([name, type, damage, cost, size]) => ({ name, type, subtype: "Magic Weapon", damage, cost, size, description: md("A magic weapon: its bonus is added to all attack and damage rolls made with it.") , __category: "Magic Weapons and Armor" })),
  { name: "Leather Armor +1", type: "Armor", subtype: "Leather", ac: 13, cost: "20 gp", weight: "15", description: md("Magic armor: its bonus is added to the Armor Class. Magic leather counts as no armor for movement."), __category: "Magic Weapons and Armor" },
  { name: "Chain Mail +1", type: "Armor", subtype: "Metal", ac: 15, cost: "60 gp", weight: "40", description: md("Magic armor: its bonus is added to the Armor Class. Magic metal armor moves as leather."), __category: "Magic Weapons and Armor" },
  { name: "Shield +1", type: "Armor", subtype: "Shield", acbonus: 1, cost: "7 gp", weight: "5", description: md("A magic shield: its bonus is added to the shield's +1 to Armor Class."), __category: "Magic Weapons and Armor" },
  ...data("magic-items").map((item) => ({ name: magicName(item), type: "Magic Item", subtype: item.subtype.replace(/:.*$/, ""), description: md(item.text), __category: item.subtype.replace(/:.*$/, "") })),
];

export const GM_GUIDE = {
  name: MODULE,
  displayName: MODULE,
  category: "Basic Fantasy",
  ruleset: RULESET,
  author: "Chris Gonnerman (Basic Fantasy RPG); arranged for Kraken VTT",
  gm: { npc: MONSTERS, item: MAGIC_ITEMS },
  reference: [
    credits(`The **Basic Fantasy Game Master's Guide** holds the Game Master's chapters of the *Basic Fantasy Role-Playing Game*, 4th Edition: the monsters, treasure and magic items, managing encounters and crafting adventures.

In Kraken every monster is an NPC record: drag one onto the combat tracker or the map. Its hit dice are rolled for its hit points, its attacks use the attack bonus for its hit dice against the target's Armor Class, it saves as its listed class and level, and the tracker's Morale button rolls 2d6 against its morale.`),
    { name: "Monsters", sections: [chapter(chapters, "monsters"), { name: "Monster Index", pages: [{ name: "All Monsters", keywords: "monsters index", text: md(`Each monster is a record in this book's NPC list (its stat block and description). ${MONSTERS.length} monsters:\n\n${MONSTERS.map((monster) => monster.name).join(", ")}.`) }] }] },
    { name: "Treasure", sections: [chapter(chapters, "treasure"), chapter(chapters, "magicitems")] },
    { name: "GM Information", sections: [chapter(chapters, "gm01"), chapter(chapters, "gm02")] },
  ],
};
