// Basic Fantasy Player's Handbook: the player's half of the Basic Fantasy
// Role-Playing Game, 4th Edition (CC BY-SA 4.0: see LICENSE.md). The rules
// chapters as pages, and the records the wizard, the sheet and the shop
// use: races, classes, spells, equipment.
import { md } from "../lib/fg.mjs";
import { chapter, credits, data, RULESET } from "./common.mjs";
import { BASE_CLASSES, CLASSES, RACES } from "../../shared/bfrpg/rules.mjs";

export const MODULE = "Basic Fantasy Player's Handbook";
const chapters = data("chapters");
const page = (key, name) => chapters[key].pages.find((item) => item.name === name)?.text ?? "";

// The equipment, as records (a weapon's damage, a missile or thrown flag, an armour's class).
export const ITEMS = data("equipment").map((item) => ({
  name: item.name,
  type: item.type,
  ...(item.subtype ? { subtype: item.subtype } : {}),
  cost: item.cost,
  ...(item.weight ? { weight: item.weight } : {}),
  ...(item.size ? { size: item.size } : {}),
  ...(item.damage ? { damage: item.damage } : {}),
  ...(item.range ? { range: item.range } : {}),
  ...(item.missile ? { missile: 1 } : {}),
  ...(item.thrown ? { thrown: 1 } : {}),
  ...(item.ac ? { ac: item.ac } : {}),
  ...(item.acbonus ? { acbonus: item.acbonus } : {}),
  ...(item.text ? { description: md(item.text) } : {}),
  __category: item.type === "Weapon" || item.type === "Ammunition" ? "Weapons" : item.type === "Armor" ? "Armor and Shields" : item.type === "Animal" ? "Beasts of Burden" : "Equipment",
}));

const levelWord = (n) => ["", "1st", "2nd", "3rd", "4th", "5th", "6th"][n] ?? `${n}th`;
export const SPELLS = data("spells").map((spell) => {
  const lists = [spell.levels.cleric ? `Cleric ${spell.levels.cleric}` : "", spell.levels.magicuser ? `Magic-User ${spell.levels.magicuser}` : ""].filter(Boolean);
  return {
    name: spell.name,
    level: lists.join(", "),
    ...(spell.levels.cleric ? { cleric: spell.levels.cleric } : {}),
    ...(spell.levels.magicuser ? { magicuser: spell.levels.magicuser } : {}),
    range: spell.range,
    duration: spell.duration,
    ...(spell.reversible ? { reversible: "Yes" } : {}),
    description: md(spell.text || "(No description.)"),
    __category: spell.levels.magicuser ? `Magic-User ${levelWord(spell.levels.magicuser)} level` : `Cleric ${levelWord(spell.levels.cleric)} level`,
  };
});

const CLASS_PAGES = { cleric: "Cleric", fighter: "Fighter", magicuser: "Magic Users", thief: "Thief" };
const classRecord = (cls) => {
  const base = BASE_CLASSES[cls.key];
  const parts = cls.parts ?? [cls.key];
  return {
    name: cls.name,
    prime: parts.map((part) => BASE_CLASSES[part].prime.replace(/^\w/, (letter) => letter.toUpperCase())).join(" and "),
    hitdie: `d${cls.die}`,
    afterninth: `+${cls.after9} hit point${cls.after9 === 1 ? "" : "s"} a level`,
    ...(cls.parts ? { races: "Elf only" } : {}),
    description: md(base ? page("classes", CLASS_PAGES[cls.key]) : page("classes", "Combination Classes")),
  };
};
const RACE_PAGES = { dwarf: "Dwarves", elf: "Elves", halfling: "Halflings", human: "Humans" };
const raceRecord = (race) => ({
  name: race.name,
  classes: race.classes.map((key) => CLASSES[key].name).join(", "),
  requirements: [...Object.entries(race.min).map(([stat, low]) => `${stat} ${low}+`), ...Object.entries(race.max).map(([stat, high]) => `${stat} at most ${high}`)].join(", ") || "None",
  description: md(page("races", RACE_PAGES[race.key])),
});

export const PLAYERS_HANDBOOK = {
  name: MODULE,
  displayName: MODULE,
  category: "Basic Fantasy",
  ruleset: RULESET,
  author: "Chris Gonnerman (Basic Fantasy RPG); arranged for Kraken VTT",
  playersBook: true,
  players: {
    race: Object.values(RACES).map(raceRecord),
    class: Object.values(CLASSES).map(classRecord),
    spell: SPELLS,
    item: ITEMS,
  },
  reference: [
    credits(`The **Basic Fantasy Player's Handbook** holds the player's chapters of the *Basic Fantasy Role-Playing Game*, 4th Edition: making a character, the races and classes, equipment, spells, adventuring and combat. The *Basic Fantasy Game Master's Guide* holds the monsters, treasure, magic items and the Game Master's chapters.

In Kraken, a new character is made with the character wizard (it follows *How to Create a Player Character*); the sheet rolls saving throws, ability rolls, thief abilities and attacks in front of the table, and the combat tracker plays the Encounter rules.`),
    { name: "Introduction", sections: [chapter(chapters, "introduction")] },
    { name: "Player Characters", sections: [chapter(chapters, "creation"), chapter(chapters, "abilities"), chapter(chapters, "races"), chapter(chapters, "classes"), chapter(chapters, "equipment"), chapter(chapters, "vehicles")] },
    { name: "Magic", sections: [chapter(chapters, "spells"), { name: "Spells, Alphabetical", pages: SPELLS.map((spell) => ({ name: spell.name, keywords: "spell", text: md(`*${spell.level}. Range ${spell.range || "-"}; duration ${spell.duration || "-"}${spell.reversible ? "; reversible" : ""}.*`).__rich + spell.description.__rich })).map((entry) => ({ ...entry, text: { __rich: entry.text } })) }] },
    { name: "Adventure", sections: [chapter(chapters, "dungeon"), chapter(chapters, "wilderness"), chapter(chapters, "hirelings"), chapter(chapters, "advancement")] },
    { name: "Encounters", sections: [chapter(chapters, "combat")] },
  ],
};
