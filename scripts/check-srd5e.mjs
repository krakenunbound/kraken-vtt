// Kraken's own D&D 5E books (games/srd-5e, the SRD 5.2.1 read from its PDF)
// played end to end with nothing else: every book's notice; a level 1
// character of every class built as the 5E wizard commits one (species,
// background, the choices left, kits A), each class's decisions as it levels
// (its subclass at 3, Ability Score Improvements, Epic Boon at 19); Fighter,
// Wizard and Cleric levelled to 20 (hit points, proficiency, spell slots);
// every spell with actions cast on the tracker (no formula refused); every
// creature's attack actions read (bonus, damage, type), and a goblin, a dragon
// and an ogre attacking a character; the magic items.
//   KRAKEN_PACKS=<empty> APPDATA=<empty> node scripts/check-srd5e.mjs
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { importModule, readModule } = require("../electron/importers/fgModule.cjs");
const wiz = await import("../shared/dnd5e/wizard.mjs");
const rules = await import("../shared/dnd5e/rules.mjs");

const BOOKS = ["SRD 5.2.1 Player's Rules", "SRD 5.2.1 Creatures", "SRD 5.2.1 Magic Items"];
const NOTICE = 'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';
const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
  return Boolean(condition);
};
const unescape = (text) => String(text ?? "").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// The notice, word for word, on each book's first page; no D&D trademark in a book's name.
for (const name of BOOKS) {
  const book = readModule(name);
  const legal = book.records.find((record) => record.type === "refpage" && record.name === "Legal Information");
  check(legal && unescape(legal.data.text) === NOTICE, `${name}: the SRD 5.2.1 notice word for word`);
  check(!/D&D|Dungeons/i.test(name) && book.info.ruleset === "5E", `${name}: an FG 5E module, no trademark in its name`);
}

const server = createTableServer({ ruleset: "D&D 5E" });
try {
  await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const agent = server.agent;
  for (const name of BOOKS) importModule(agent.records, agent.seat, name);
  const list = (type) => agent.records.list({ type });
  const counts = Object.fromEntries(["class", "class_specialization", "race", "race_subrace", "background", "feat", "item", "spell", "npc"].map((type) => [type, list(type).length]));
  check(counts.class === 12 && counts.class_specialization === 12 && counts.race === 9 && counts.background === 4 && counts.spell >= 330 && counts.npc >= 320, `the books' records: ${JSON.stringify(counts)}`);

  // Every class at level 1, as the wizard commits it.
  const species = list("race");
  const backgrounds = list("background");
  const items = list("item");
  const classes = list("class");
  const built = {};
  classes.forEach((cls, index) => {
    const info = wiz.classInfo(cls, 1);
    check(info.saves.length === 2 && info.kits.length >= 2 && info.skills.picks >= 2, `${cls.name}: saves, kits and skill choices (${JSON.stringify({ saves: info.saves, kits: info.kits.length, skills: info.skills })})`);
    for (const level of [3, 4, 19]) {
      const at = wiz.classInfo(cls, level);
      const types = at.decisions.map((item) => item.type);
      if (level === 3) check(types.includes("subclass"), `${cls.name} 3 chooses a subclass`);
      if (level === 4) check(types.includes("asiorfeat"), `${cls.name} 4 has an Ability Score Improvement`);
      if (level === 19) check(at.decisions.some((item) => item.type === "feat" && item.category === "Epic Boon"), `${cls.name} 19 has an Epic Boon`);
    }
    check(wiz.classInfo(cls, 20).features.length >= 10, `${cls.name}: its features to level 20`);
    const subclass = list("class_specialization").find((record) => record.data.class === cls.name);
    check(subclass && wiz.classInfo(cls, 20, subclass).features.some((feature) => feature.subclass === subclass.name), `${cls.name}: its subclass ${subclass?.name} brings its features`);
  });
  for (const [index, cls] of classes.entries()) {
    const kin = species[index % species.length];
    const ancestry = wiz.ancestriesOf(kin, list("race_subrace"))[0];
    const bg = backgrounds[index % backgrounds.length];
    const info = wiz.classInfo(cls, 1);
    const speciesInfo = wiz.speciesInfo(kin, ancestry);
    const bgInfo = wiz.backgroundInfo(bg, items);
    // Scores: the standard array, the highest to the class's first save.
    const order = [...info.saves, ...rules.STATS.filter((stat) => !info.saves.includes(stat))];
    const scores = Object.fromEntries(order.map((stat, n) => [stat, rules.STANDARD_ARRAY[n]]));
    const skills = info.skills.options.filter((key) => !bgInfo.skills.base.includes(key)).slice(0, info.skills.picks).map((key) => rules.SKILLS[key][0]);
    const speciesSkills = speciesInfo.decisions.filter((item) => item.type === "skill").map((item, n) => rules.SKILLS[item.options.filter((key) => !bgInfo.skills.base.includes(key) && !skills.map(rules.skillKey).includes(key))[n] ?? item.options[0]][0]);
    const feats = speciesInfo.decisions.filter((item) => item.type === "feat").map(() => "Skilled");
    if (info.decisions.some((item) => item.type === "feat" && item.category === "Fighting Style")) feats.push("Defense");
    const spec = {
      name: `Test ${cls.name}`,
      species: kin.name,
      ...(ancestry ? { ancestry: ancestry.name } : {}),
      ...(speciesInfo.sizeOptions.length ? { size: speciesInfo.sizeOptions[0] } : {}),
      class: cls.name,
      background: bg.name,
      level: 1,
      scores,
      increases: { [bgInfo.abilities[0]]: 2, [bgInfo.abilities[1]]: 1 },
      skills,
      speciesSkills,
      languages: speciesInfo.languages.options.slice(0, speciesInfo.languages.picks),
      tools: bgInfo.tools.options.slice(0, bgInfo.tools.picks),
      feats,
      kits: { class: "A", background: "A" },
    };
    const made = await tool("kraken_build_character", { owner: "Tester", spec });
    const data = agent.records.get(made.id).data;
    const caster = rules.CASTERS[rules.skillKey(cls.name)];
    built[cls.name] = made.id;
    check(made.created && made.problems.length === 0, `${cls.name} (${kin.name}${ancestry ? ` ${ancestry.name}` : ""}, ${bg.name}) built without problems: ${JSON.stringify(made.problems)}`);
    check(data.hp.total >= rules.hitDie(cls) && Object.keys(data.inventorylist).length >= 3 && Object.values(data.coins).some((coin) => coin.amount > 0), `${cls.name}: hit points, kit A's gear and coin (${data.hp.total} HP, ${Object.keys(data.inventorylist).length} items)`);
    check(data.features.length > 0 && data.feats.length > 0, `${cls.name}: features and the background's feat`);
    check(!caster || (data.spellcasting && Object.keys(data.slots).length > 0), `${cls.name}: spellcasting and slots at level 1`);
    check(Object.keys(data.attacks).length > 0, `${cls.name}: a weapon to attack with from the kit (${Object.values(data.inventorylist).map((item) => item.name).join(", ")})`);
    console.log(`  ${cls.name} 1: ${kin.name}${ancestry ? ` (${ancestry.name})` : ""} ${bg.name}, ${data.hp.total} HP, AC ${data.ac.total}, ${Object.values(data.attacks).map((attack) => `${attack.name} ${rules.signed(attack.bonus)} ${attack.damage}`).join("; ")}${data.spellcasting ? `, spell DC ${data.spellcasting.dc}` : ""}; ${Object.values(data.inventorylist).length} items, ${Object.values(data.coins).map((coin) => `${coin.amount} ${coin.name}`).join(" ")}; feats ${data.feats.join(", ")}`);
  }

  // Fighter, Wizard and Cleric to level 20.
  for (const name of ["Fighter", "Wizard", "Cleric"]) {
    let level = 1;
    for (let n = 0; n < 19; n++) level = (await tool("kraken_level_up", { id: built[name] })).level;
    const data = agent.records.get(built[name]).data;
    check(level === 20 && data.level === 20 && data.prof === 6 && data.hitdice.total === 20, `${name} reaches 20 (proficiency +6, 20 hit dice): ${JSON.stringify({ level, prof: data.prof })}`);
    if (name !== "Fighter") check(data.slots.l9?.max === 1 && data.slots.l1?.max === 4, `${name} 20 has a level 9 slot: ${JSON.stringify(data.slots)}`);
    const cls = classes.find((record) => record.name === name);
    const features = wiz.classInfo(cls, 20).features.map((feature) => feature.name);
    check(features.includes({ Fighter: "Three Extra Attacks", Wizard: "Signature Spells", Cleric: "Greater Divine Intervention" }[name]), `${name} 20's capstone: ${features.slice(-3).join(", ")}`);
  }

  // Every spell with actions, cast by a lich on the tracker at a creature that takes it all.
  const lich = list("npc").find((record) => record.name === "Lich");
  const target = list("npc").find((record) => record.name === "Tarrasque");
  await tool("kraken_combat", { action: "add", recordId: lich.id });
  await tool("kraken_combat", { action: "add", recordId: target.id });
  let view = (await tool("kraken_combat", { action: "view" })).entries;
  const lichEntry = view.find((entry) => entry.name.startsWith("Lich"));
  const targetEntry = view.find((entry) => entry.name.startsWith("Tarrasque"));
  const playable = list("spell").filter((spell) => spell.data.actions);
  let cast = 0;
  const refused = [];
  for (const spell of playable) {
    await tool("kraken_combat", { action: "update", id: targetEntry.id, patch: { wounds: 0, effects: [] } }).catch(() => undefined);
    await tool("kraken_combat", { action: "clear-targets", id: lichEntry.id });
    await tool("kraken_combat", { action: "target", id: lichEntry.id, targetId: targetEntry.id, on: true });
    try {
      await tool("kraken_combat", { action: "cast", id: lichEntry.id, power: spell.name });
      cast += 1;
    } catch (error) {
      refused.push(`${spell.name}: ${error.message.slice(0, 120)}`);
    }
  }
  check(refused.length === 0, `every spell with actions casts: ${refused.length} refused: ${refused.slice(0, 8).join(" | ")}`);
  for (const name of ["Fire Bolt", "Magic Missile", "Cure Wounds", "Fireball", "Bless"]) check(playable.some((spell) => spell.name === name), `${name} has actions`);

  // Every creature's attacks read from its stat block.
  let attackActions = 0;
  let read = 0;
  const unread = [];
  for (const npc of list("npc")) {
    const attacks = rules.npcAttacks(npc.data);
    for (const [key, action] of Object.entries(npc.data.actions ?? {})) {
      if (!/Attack Roll:\s*[+-]\d/.test(String(action.desc))) continue;
      attackActions += 1;
      if (attacks[key] && (attacks[key].damage || !/Hit:\s*\d+\s*\(/.test(action.desc))) read += 1;
      else unread.push(`${npc.name}: ${action.name}`);
    }
  }
  check(unread.length === 0, `creatures' attacks read: ${read}/${attackActions}; not: ${unread.slice(0, 10).join(", ")}`);

  // A goblin, a dragon and an ogre attack a character (the Fighter, AC from chain mail).
  await tool("kraken_combat", { action: "add", recordId: built.Fighter });
  for (const name of ["Goblin Warrior", "Adult Red Dragon", "Ogre"]) {
    const npc = list("npc").find((record) => record.name === name);
    await tool("kraken_combat", { action: "add", recordId: npc.id });
  }
  view = (await tool("kraken_combat", { action: "view" })).entries;
  const fighter = view.find((entry) => entry.recordId === built.Fighter);
  for (const name of ["Goblin Warrior", "Adult Red Dragon", "Ogre"]) {
    const entry = view.find((item) => item.name.startsWith(name));
    const attack = entry?.attacks?.find((item) => item.bonus > 0 && item.damage);
    if (!check(attack, `${name} has an attack on the tracker: ${JSON.stringify(entry?.attacks)}`)) continue;
    await tool("kraken_combat", { action: "target", id: entry.id, targetId: fighter.id, on: true });
    agent.dice.force([19]);
    const swing = (await tool("kraken_combat", { action: "attack", id: entry.id, weapon: attack.key })).results[0];
    check(swing && swing.hit && swing.total === 19 + attack.bonus, `${name}'s ${attack.name} (+${attack.bonus}) hits the Fighter: ${JSON.stringify(swing)}`);
    await tool("kraken_combat", { action: "clear-targets", id: entry.id });
  }

  // The magic items.
  const magic = items.filter((item) => item.source === "SRD 5.2.1 Magic Items");
  check(magic.length >= 250 && magic.some((item) => item.name === "Bag of Holding") && magic.every((item) => item.data.rarity), `the magic items: ${magic.length}`);

  const spells = list("spell");
  console.log(`books: ${JSON.stringify(counts)}; spells ${spells.length}, ${playable.length} with actions (${cast} cast on the tracker); creature attacks ${read}/${attackActions}; magic items ${magic.length}`);
} finally {
  await server.stop();
}
if (problems.length) {
  console.log(`FAIL srd5e: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("ok srd5e: the SRD 5.2.1 books alone: the notice in each; every class built at level 1 from the wizard's choices; subclass, ASI and Epic Boon decisions; Fighter, Wizard and Cleric to 20; every spell with actions cast on the tracker; every creature attack read; a goblin, a dragon and an ogre hitting a character; the magic items");
