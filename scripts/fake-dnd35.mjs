// A small FG 3.5E module for the 3.5E tests, in the shapes of the GM's 3.5E
// Player's Handbook (classes, races, skills and gear under <reference>, by
// category) and Monster Manual (an NPC block): made up, no licensed text.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const s = (tag, value) => `<${tag} type="string">${value}</${tag}>`;
const n = (tag, value) => `<${tag} type="number">${value}</${tag}>`;
const f = (tag, value) => `<${tag} type="formattedtext"><p>${value}</p></${tag}>`;
const trait = (id, name, text) => `<id-0000${id}>${s("name", name)}${f("text", text)}</id-0000${id}>`;
const item = (id, fields) => `<id-0${id}>${Object.entries(fields).map(([key, value]) => (typeof value === "number" ? n(key, value) : s(key, value))).join("")}</id-0${id}>`;

export function makeDnd35Books() {
  const folder = mkdtempSync(path.join(tmpdir(), "kraken-35-"));
  const NAME = "Test 3.5E Handbook";
  const module = path.join(folder, NAME);
  mkdirSync(module, { recursive: true });
  writeFileSync(path.join(module, "definition.xml"), `<?xml version="1.0" encoding="UTF-8"?><root version="4.6">${["name", "displayname"].map((tag) => `<${tag}>${NAME}</${tag}>`).join("")}<category>Core Rules</category><author>Kraken tests</author><ruleset>3.5E</ruleset></root>`);
  const db = `<?xml version="1.0" encoding="UTF-8"?>
<root version="4.6">
  <npc>
    <ogre>${s("name", "Ogre")}${s("ac", "16 (-1 size, -1 Dex, +5 natural, +3 hide), touch 8, flat-footed 16")}${s("hd", "4d8+11")}${n("hp", 29)}${n("init", -1)}${s("babgrp", "+3/+12")}${s("atk", "Greatclub +8 melee (2d8+7)")}${s("fullatk", "Greatclub +8 melee (2d8+7) or javelin +1 ranged (1d8+5)")}${n("fortitudesave", 6)}${n("reflexsave", 0)}${n("willsave", 1)}${n("strength", 21)}${n("dexterity", 8)}</ogre>
    <troll>${s("name", "Troll")}${s("ac", "16 (+2 Dex, +5 natural, -1 size), touch 11, flat-footed 14")}${n("hp", 63)}${n("init", 2)}${s("babgrp", "+4/+14")}${s("atk", "Claw +9 melee (1d6+6)")}${s("fullatk", "2 claws +9 melee (1d6+6) and bite +4 melee (1d6+3)")}${n("fortitudesave", 11)}${n("reflexsave", 4)}${n("willsave", 3)}</troll>
  </npc>
</root>
`;
  // The player's book (FG's client.xml): what the players may see.
  const client = `<?xml version="1.0" encoding="UTF-8"?>
<root version="4.6">
  <reference>
    <classes><category name="" baseicon="0" decalicon="0">
      <id-00001>${s("name", "Fighter")}${s("hitdie", "d10")}${s("bab", "Fast")}${s("fort", "Good")}${s("ref", "Bad")}${s("will", "Bad")}${s("skillranks", "2")}${s("classskills", "Climb (Str), Craft (Int), Handle Animal (Cha), Intimidate (Cha), Jump (Str), Ride (Dex), Swim (Str)")}<classfeatures><id-00001>${n("level", 1)}${s("name", "Bonus Feat")}</id-00001></classfeatures></id-00001>
      <id-00002>${s("name", "Wizard")}${s("hitdie", "d4")}${s("bab", "Slow")}${s("fort", "Bad")}${s("ref", "Bad")}${s("will", "Good")}${s("skillranks", "2")}${s("classskills", "Concentration (Con), Craft (Int), Decipher Script (Int), Knowledge (arcana) (Int), Spellcraft (Int)")}</id-00002>
    </category></classes>
    <races><category name="" baseicon="0" decalicon="0">
      <id-00001>${s("name", "Dwarf")}<racialtraits>${trait(1, "Ability Score Racial Traits", "+2 Constitution, -2 Charisma.")}${trait(2, "Medium", "Medium.")}${trait(3, "Slow and Steady", "Dwarves have a base land speed of 20 feet.")}</racialtraits></id-00001>
      <id-00002>${s("name", "Human")}<racialtraits>${trait(1, "Medium", "Medium.")}${trait(2, "Human Base Speed", "Human base land speed of 30 feet.")}</racialtraits></id-00002>
    </category></races>
    <equipment><category name="" baseicon="0" decalicon="0">
      ${item(1001, { name: "Longsword", type: "Weapon", subtype: "Martial One-Handed Melee", properties: "One-Handed Melee", damage: "1d8", critical: "19-20/x2", damagetype: "Slashing" })}
      ${item(1002, { name: "Shortbow", type: "Weapon", subtype: "Martial Ranged", properties: "Ranged", damage: "1d6", critical: "x3", range: 60 })}
      ${item(1003, { name: "Arrows (20)", type: "Goods and Services", subtype: "Ammunition" })}
      ${item(1004, { name: "Scale mail", type: "Armor", subtype: "Medium", ac: 4, maxstatbonus: 3, checkpenalty: -4, spellfailure: 25 })}
      ${item(1005, { name: "Shield, heavy steel", type: "Armor", subtype: "Shield", ac: 2, checkpenalty: -2, spellfailure: 15 })}
      ${item(1006, { name: "Quarterstaff", type: "Weapon", subtype: "Simple Two-Handed Melee", properties: "Two-Handed Melee", damage: "1d6", critical: "x2" })}
    </category></equipment>
  </reference>
</root>
`;
  writeFileSync(path.join(module, "db.xml"), db);
  writeFileSync(path.join(module, "client.xml"), client);
  return folder;
}
