// Critical hits and fumbles (KrakenKrits, built into SiegeCore: the Castle
// Keeper's Guide's Chapter 17 options), ammunition (SiegeChar.fireAmmunition)
// and spell resistance (ActionSpellResistance), on the host's tracker with
// fixed dice.
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = createTableServer();
try {
  await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, { table: () => server });
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  const ct = async (args) => {
    const result = await callTool("kraken_combat", args, { table: () => server });
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  const lines = (count = 8) => agent.chatLog(count).map((line) => line.roll?.label ?? line.text);
  agent.records.create({ type: "siegegame", name: "Rules", data: { options: { SIEGE_INIT_STAT: "none", SIEGE_MELEE_DMG_STAT: "none", SIEGE_RANGED_DMG_STAT: "none" } } }, agent.seat);
  const hero = agent.records.create(
    {
      type: "character",
      name: "Aldric",
      owner: "a test player",
      visibility: "owner",
      data: {
        hp: { total: 30, wounds: 0 },
        ac: { total: 15 },
        bth: 2,
        level: 3,
        attack: { melee: { total: 2 }, ranged: { total: 2 } },
        attributes: { strength: { score: 10 } },
        inventorylist: {
          "id-00001": { name: "Sword, Long", damage: "1d8", dmgbonus: 2, attacktype: "melee", carried: 2 },
          "id-00002": { name: "Bow, Short", damage: "1d6", attacktype: "ranged", ammotype: "arrow", carried: 2 },
          "id-00003": { name: "Arrows", subtype: "Ammunition", ammotype: "arrow", count: 2, carried: 1 },
        },
        powers: { "id-00001": { name: "Magic Missile", level: 1, srmode: "on", damage: "1d4+1" } },
      },
    },
    agent.seat,
  );
  const ogre = agent.records.create({ type: "npc", name: "Ogre", data: { hptotal: 60, ac: { total: 12 }, bth: 4, attacks: { a01: { name: "Club", bth: 0, attacktype: "melee", damage: "2d6" } } } }, agent.seat);
  const imp = agent.records.create({ type: "npc", name: "Imp", data: { hptotal: 20, ac: { total: 12 }, spellresistance: 15, attacks: {} } }, agent.seat);
  await ct({ action: "add", recordId: hero.id });
  await ct({ action: "add", recordId: ogre.id });
  let view = await ct({ action: "add", recordId: imp.id });
  const id = (name) => view.entries.find((entry) => entry.name === name).id;
  await ct({ action: "target", id: id("Aldric"), targetId: id("Ogre") });

  // FG's defaults: Option 5, every crit and fumble, applied, everyone sees.
  const settings = (await ct({ action: "krits" })).settings;
  assert(JSON.stringify(settings) === JSON.stringify({ mode: "opt5", crit: "always", fumble: "always", auto: "yes", npc: "yes", show: "all", death: "gm" }), `defaults ${JSON.stringify(settings)}`);

  // A natural 20, then Table 17.1A rolls 2: teeth shatter, 1d4 (3) damage and an effect on the ogre.
  agent.dice.force([20, 2, 3]);
  let result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  let krit = result.results[0].krit;
  assert(result.results[0].hit && krit?.kind === "crit" && krit.table === "opt5_crit" && krit.roll === 2, `crit ${JSON.stringify(result.results)}`);
  view = result.combat;
  const ogreEntry = () => view.entries.find((entry) => entry.name === "Ogre");
  assert(ogreEntry().wounds === 3, `teeth shatter damage ${ogreEntry().wounds}`);
  assert(ogreEntry().effects.some((effect) => effect.label.startsWith("Kraken Teeth shattered")), "teeth effect");
  assert(lines().some((line) => /^\[KRAKEN CRITICAL\] Aldric: CKG Table 17\.1A - Critical Hits \(Option 5\) d20 = 2: Head blow, teeth shatter/.test(line)), `crit line ${lines().join(" | ")}`);

  // Table 17.1A 16: a severed artery bleeds 1d12 at the ogre's turn (DMGO).
  await ct({ action: "krit-test", kind: "crit", id: id("Aldric"), targetId: id("Ogre"), table: "opt5_crit", roll: 16 });
  view = await ct({ action: "view" });
  const before = ogreEntry().wounds;
  await ct({ action: "update", id: id("Aldric"), patch: { initresult: 9 } });
  await ct({ action: "update", id: id("Ogre"), patch: { initresult: 5 } });
  await ct({ action: "update", id: id("Imp"), patch: { initresult: 1 } });
  agent.dice.force([7]);
  await ct({ action: "next" });
  view = await ct({ action: "next" });
  assert(ogreEntry().wounds === before + 7, `ongoing damage at the ogre's turn: ${before} -> ${ogreEntry().wounds}`);
  assert(lines().some((line) => line.startsWith("[DAMAGE] Ongoing damage (Kraken Severed artery)")), "ongoing damage line");

  // Option 6: max damage x2 marks the attacker; the next damage roll is 1d8+2 at maximum x2 = 20, then the mark is gone.
  await ct({ action: "krits", settings: { mode: "opt6" } });
  agent.dice.force([20, 16]);
  result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  assert(result.results[0].krit?.title === "Max damage x2", `opt6 ${JSON.stringify(result.results[0].krit)}`);
  const woundsBefore = result.combat.entries.find((entry) => entry.name === "Ogre").wounds;
  result = await ct({ action: "damage-roll", recordId: hero.id, weapon: "id-00001" });
  assert(result.damage.total === 20, `max x2: ${result.damage.total}`);
  assert(result.combat.entries.find((entry) => entry.name === "Ogre").wounds === woundsBefore + 20, "applied");
  assert(lines().some((line) => line.includes("[KRAKEN KRIT: MAX x2]")), "max x2 tag");
  assert(!result.combat.entries.find((entry) => entry.name === "Aldric").effects.some((effect) => effect.label.startsWith("Kraken Krit:")), "mark used up");

  // Option 4: a roadhouse critical doubles the dice and the bonus: 2d8+4 = 3+5+4.
  await ct({ action: "krits", settings: { mode: "opt4" } });
  agent.dice.force([20]);
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  agent.dice.force([3, 5]);
  result = await ct({ action: "damage-roll", recordId: hero.id, weapon: "id-00001" });
  assert(result.damage.total === 12, `doubled ${result.damage.total}`);

  // A natural 1 with Option 5: Table 17.1B 4, the blow ricochets: 1d4 (2) on the attacker.
  await ct({ action: "krits", settings: { mode: "opt5" } });
  const heroWounds = (await ct({ action: "view" })).entries.find((entry) => entry.name === "Aldric").wounds;
  agent.dice.force([1, 4, 2]);
  result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  assert(result.results[0].krit?.kind === "fumble" && result.results[0].hit === false, `fumble ${JSON.stringify(result.results[0])}`);
  assert(result.combat.entries.find((entry) => entry.name === "Aldric").wounds === heroWounds + 2, "ricochet hits the wielder");

  // Instant death is the GM's call by default: told, not applied.
  const ogreWounds = (await ct({ action: "view" })).entries.find((entry) => entry.name === "Ogre").wounds;
  await ct({ action: "krit-test", kind: "crit", id: id("Aldric"), targetId: id("Ogre"), table: "opt5_crit", roll: 20 });
  assert((await ct({ action: "view" })).entries.find((entry) => entry.name === "Ogre").wounds === ogreWounds, "no instant death");
  assert(lines().some((line) => line.includes("GM: INSTANT DEATH for Ogre if you allow it")), "the GM is told");

  // Off: a natural 20 is just a hit.
  await ct({ action: "krits", settings: { crit: "off" } });
  agent.dice.force([20]);
  result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00001" });
  assert(!result.results[0].krit, "crits off");
  await ct({ action: "krits", settings: { crit: "always" } });

  // Ammunition: two arrows; each shot takes one; then none left, no attack.
  agent.dice.force([10]);
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00002" });
  assert(lines().some((line) => line === "Bow, Short: fired Arrows, 1 left."), `fired ${lines().join(" | ")}`);
  agent.dice.force([10]);
  await ct({ action: "attack", recordId: hero.id, weapon: "id-00002" });
  assert(agent.records.get(hero.id).data.inventorylist["id-00003"].count === 0, "arrows used up");
  result = await ct({ action: "attack", recordId: hero.id, weapon: "id-00002" });
  assert(result.results[0].refused && lines().some((line) => line === "Bow, Short: no arrow left to fire."), `refused ${JSON.stringify(result.results)}`);

  // Spell resistance 15: a d20 of 9 resists the missile (no damage); 17 lets it through (1d4+1 = 4).
  await ct({ action: "clear-targets", id: id("Aldric") });
  await ct({ action: "target", id: id("Aldric"), targetId: id("Imp") });
  agent.dice.force([9]);
  result = await ct({ action: "cast", recordId: hero.id, power: "id-00001" });
  assert(result.cast.results.length === 0, `resisted ${JSON.stringify(result.cast)}`);
  assert(lines().some((line) => line.startsWith("[SPELL RESISTANCE] vs SR 15 [Spell resisted 9 vs SR 15]")), "resisted line");
  agent.dice.force([17, 3]);
  result = await ct({ action: "cast", recordId: hero.id, power: "id-00001" });
  assert(result.cast.results[0]?.damage === 4, `through ${JSON.stringify(result.cast)}`);

  // NPC spellcasting: the drider's Poison (constitution save, Paralyzed 2 turns on a failure) and
  // a once-a-day Lightning (3d6, half on a save) at caster level = its 7 hit dice.
  const drider = agent.records.create(
    {
      type: "npc",
      name: "Drider",
      data: {
        hd: "7d8",
        hptotal: 40,
        ac: { total: 17 },
        primeset: "physical",
        powers: {
          p1: { name: "Poison", powertype: "Special Ability", noslot: 1, uses: 0, save: "constitution", failedeffect: "Paralyzed", failedduration: "2 turns" },
          p2: { name: "Lightning", powertype: "Spell", noslot: 1, uses: 1, damage: "3d6", save: "dexterity", saveeffect: "half" },
          p3: { name: "Lore", powertype: "Special Ability", noslot: 1, uses: 0 },
        },
      },
    },
    agent.seat,
  );
  view = await ct({ action: "add", recordId: drider.id });
  const driderId = view.entries.find((entry) => entry.name === "Drider").id;
  const listed = view.entries.find((entry) => entry.name === "Drider").powers;
  assert(listed?.map((power) => power.key).join() === "p1,p2", `the GM sees the drider's usable powers: ${JSON.stringify(listed)}`);
  await ct({ action: "target", id: driderId, targetId: id("Aldric") });
  // Aldric's constitution save (10, secondary: CB 18 + CL 7 = 25) fails on a 4.
  agent.dice.force([4]);
  result = await ct({ action: "cast", id: driderId, power: "p1" });
  assert(result.cast.casterLevel === 7, `caster level from hit dice: ${result.cast.casterLevel}`);
  const paralyzed = result.combat.entries.find((entry) => entry.name === "Aldric").effects.find((effect) => effect.label === "Paralyzed");
  assert(paralyzed && paralyzed.duration === 20, `paralyzed for 2 turns (20 rounds: SiegeCore leaves the round length unset, CoreRPG counts a minute as 10): ${JSON.stringify(paralyzed)}`);
  // Lightning: save fails on 2; 3d6 = 4+5+6 = 15.
  const heroBefore = result.combat.entries.find((entry) => entry.name === "Aldric").wounds;
  agent.dice.force([2, 4, 5, 6]);
  result = await ct({ action: "cast", id: driderId, power: "p2" });
  assert(result.combat.entries.find((entry) => entry.name === "Aldric").wounds === heroBefore + 15, "lightning 15");
  assert(result.combat.entries.find((entry) => entry.name === "Drider").powers.find((power) => power.key === "p2").used === 1, "one use counted");
  let refused = "";
  try {
    await ct({ action: "cast", id: driderId, power: "p2" });
  } catch (error) {
    refused = error.message;
  }
  assert(/used Lightning once today/.test(refused), `once a day: ${refused}`);

  // The table's option: targets clear after a spell.
  await tool("kraken_table_options", { clearTargets: "action" });
  await ct({ action: "target", id: id("Aldric"), targetId: id("Imp") });
  agent.dice.force([17, 2]);
  await ct({ action: "cast", recordId: hero.id, power: "id-00001" });
  assert((await ct({ action: "view" })).entries.find((entry) => entry.name === "Aldric").targets.length === 0, "targets clear after the spell");
  await tool("kraken_table_options", { clearTargets: "never" });

  console.log("ok krits: Option 5 crit and fumble tables applied (damage, effects, ongoing bleed), Option 6 maximum x2 and Option 4 doubling on the next damage, instant death left to the GM, crits off; ammunition fired and refused; spell resistance resists and lets through; an NPC casts at its hit dice, a failed save paralyses, uses per day are counted; targets clear after a spell by the table's option");
} finally {
  await server.stop();
}
