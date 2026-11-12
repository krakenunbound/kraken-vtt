// A small FG AD&D 2E module for the 2E tests, in the shapes of the GM's 2E
// adventures (NPC blocks: AC, THAC0, hit dice, a weapon list, the saves) and
// pregens (an FG 2E character sheet in client.xml): made up, no licensed text.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const s = (tag, value) => `<${tag} type="string">${value}</${tag}>`;
const n = (tag, value) => `<${tag} type="number">${value}</${tag}>`;
const score = (value) => `<score type="number">${value}</score>`;
const saves = (death, rod, petri, breath, spell) => `<saves><death>${score(death)}</death><rod>${score(rod)}</rod><petrification>${score(petri)}</petrification><breath>${score(breath)}</breath><spell>${score(spell)}</spell></saves>`;
const weapon = (id, name, dice, bonus = 0) => `<id-0000${id}>${s("name", name)}${n("attackbonus", 0)}<damagelist><id-00001>${s("dice", dice)}${n("bonus", bonus)}${s("type", "")}</id-00001></damagelist></id-0000${id}>`;

export function makeAdnd2eBooks() {
  const folder = mkdtempSync(path.join(tmpdir(), "kraken-2e-"));
  const NAME = "Test 2E Adventure";
  const module = path.join(folder, NAME);
  mkdirSync(module, { recursive: true });
  writeFileSync(path.join(module, "definition.xml"), `<?xml version="1.0" encoding="UTF-8"?><root version="4.6">${["name", "displayname"].map((tag) => `<${tag}>${NAME}</${tag}>`).join("")}<category>Adventures</category><author>Kraken tests</author><ruleset>2E</ruleset></root>`);
  const db = `<?xml version="1.0" encoding="UTF-8"?>
<root version="4.6">
  <npc>
    <ogre>${s("name", "Ogre")}${n("ac", 4)}${n("thaco", 17)}${n("hp", 25)}${s("hitDice", "4+1")}${s("size", "Large (9'+)")}${s("numberattacks", "1")}${s("damage", "1d10+2")}<weaponlist>${weapon(1, "Club", "1d10", 2)}</weaponlist>${saves(13, 15, 14, 16, 16)}</ogre>
    <lion>${s("name", "Mountain Lion")}${n("ac", 6)}${n("thaco", 17)}${n("hp", 18)}${s("hitDice", "3+1")}${s("size", "M")}${s("numberattacks", "3")}${s("damage", "1d3/1d3/1d6")}<weaponlist>${weapon(1, "Claw", "1d3")}${weapon(2, "Claw", "1d3")}${weapon(3, "Bite", "1d6")}</weaponlist>${saves(14, 16, 15, 17, 17)}</lion>
  </npc>
</root>
`;
  // The players' part (FG's client.xml): a pregenerated character.
  const ability = (value) => `${n("score", value)}${n("base", value)}`;
  const client = `<?xml version="1.0" encoding="UTF-8"?>
<root version="4.6">
  <pregencharsheet>
    <id-00001>${s("name", "Sister Mara")}${s("race", "Human")}${s("alignment", "Lawful Good")}<abilities><strength>${ability(12)}</strength><dexterity>${ability(9)}</dexterity><constitution>${ability(15)}</constitution><intelligence>${ability(10)}</intelligence><wisdom>${ability(17)}</wisdom><charisma>${ability(13)}</charisma></abilities><classes><id-00001>${s("name", "Cleric")}${n("level", 2)}</id-00001></classes><hp>${n("total", 14)}${n("wounds", 0)}</hp><inventorylist><id-00001>${s("name", "Mace")}${s("type", "Weapon")}${n("carried", 2)}${s("damage", "1d6+1 bludgeoning;1d6 bludgeoning, large;")}${n("speedfactor", 7)}</id-00001><id-00002>${s("name", "Banded mail")}${s("type", "Armor")}${s("subtype", "Armor")}${n("ac", 4)}${n("carried", 2)}</id-00002></inventorylist><proficiencylist><id-00001>${s("name", "Mace")}</id-00001></proficiencylist><skilllist><id-00001>${s("name", "Healing")}</id-00001></skilllist>${n("exp", 1600)}</id-00001>
  </pregencharsheet>
</root>
`;
  writeFileSync(path.join(module, "db.xml"), db);
  writeFileSync(path.join(module, "client.xml"), client);
  return folder;
}
