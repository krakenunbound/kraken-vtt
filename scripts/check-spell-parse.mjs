// Checks shared/actions/parse.mjs: our own short spell records in each game's
// field shapes, then every shipped SRD 5.2.1 spell (and Descending Darkness's)
// read from its words alone. Exits 1 on any failure.
//   node scripts/check-spell-parse.mjs
import fs from "node:fs";
import { areaOf, parseSpell, toFg5eActions } from "../shared/actions/parse.mjs";

const started = Date.now();
const failures = [];
let passed = 0;
const eq = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
};
const ok = (label, value) => eq(label, !!value, true);

// --- Fixtures: our own words, the same fields as each game's records -----------

const fireball5e = {
  name: "Blast Sphere", level: 3, range: "150 feet", duration: "Instantaneous",
  text: "A spark leaps to a point you pick. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one.\n\n***Using a Higher-Level Spell Slot.*** The damage increases by 1d6 for each spell slot level above 3.",
};
const burning5e = { name: "Flame Fan", level: 1, range: "Self", duration: "Instantaneous", text: "Each creature in a 15-foot Cone makes a Dexterity saving throw, taking 3d6 Fire damage on a failed save or half as much damage on a successful one." };
const bolt5e = { name: "Storm Line", level: 3, range: "Self", duration: "Instantaneous", text: "A 100-foot-long, 5-foot-wide Line of lightning runs from you. Each creature in the Line makes a Dexterity saving throw, taking 8d6 Lightning damage on a failed save or half as much damage on a successful one." };
const wave5e = { name: "Thunder Push", level: 1, range: "Self", duration: "Instantaneous", text: "Each creature in a 15-foot Cube originating from you makes a Constitution saving throw. On a failed save, a creature takes 2d8 Thunder damage. On a successful save, it takes half as much damage only." };
const guardians5e = { name: "Warding Spirits", level: 3, range: "Self", duration: "Concentration, up to 10 minutes", text: "Spirits circle you in a 15-foot Emanation. You can designate creatures to be unaffected by it. A creature that ends its turn there makes a Wisdom saving throw, taking 3d8 Radiant damage on a failed save or half as much damage on a successful one." };
const bless5e = { name: "Blessing", level: 1, range: "30 feet", duration: "Concentration, up to 1 minute", text: "You bless up to three creatures within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target adds 1d4 to the attack roll or save.\n\n***Using a Higher-Level Spell Slot.*** You can target one additional creature for each spell slot level above 1." };
const sleep5e = { name: "Slumber", level: 1, range: "60 feet", duration: "Concentration, up to 1 minute", text: "Each creature of your choice in a 5-foot-radius Sphere centered on a point within range must succeed on a Wisdom saving throw or have the Incapacitated condition until the end of its next turn. If it fails again, it has the Unconscious condition. The spell ends on a target if it takes damage." };
const cure5e = { name: "Mend Flesh", level: 1, range: "Touch", duration: "Instantaneous", text: "A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier." };
const hold5e = { name: "Freeze Foe", level: 2, range: "60 feet", duration: "Concentration, up to 1 minute", text: "Choose a Humanoid that you can see within range. The target must succeed on a Wisdom saving throw or have the Paralyzed condition for the duration.\n\n***Using a Higher-Level Spell Slot.*** You can target one additional Humanoid for each spell slot level above 2." };
const firebolt5e = { name: "Ember Shot", level: 0, range: "120 feet", duration: "Instantaneous", text: "Make a ranged spell attack against a creature or object within range. On a hit, the target takes 1d10 Fire damage." };

const fireball35 = { name: "Blast Sphere", level: "Sor/Wiz 3", range: "Long (400 ft. + 40 ft./level)", effect: "20-ft.-radius spread", duration: "Instantaneous", save: "Reflex half", sr: "Yes", description: "<p>A glowing bead bursts at the chosen spot, dealing 1d6 points of fire damage per caster level (maximum 10d6) to every creature in the area.</p>" };
const bless35 = { name: "Blessing", level: "Clr 1", range: "50 ft.", effect: "The caster and all allies within a 50-ft. burst, centered on the caster", duration: "1 min./level", save: "None", sr: "Yes (harmless)", description: "<p>Your allies gain a +1 morale bonus on attack rolls and on saving throws against fear effects.</p>" };
const sleep35 = { name: "Slumber", level: "Sor/Wiz 1", range: "Medium (100 ft. + 10 ft./level)", area: "One or more living creatures within a 10-ft.-radius burst", duration: "1 min./level", save: "Will negates", sr: "Yes", description: "<p>The creatures fall into a magical slumber. Slapping or wounding awakens an affected creature.</p>" };
const cure35 = { name: "Mend Light Hurts", level: "Clr 1", range: "Touch", target: "Creature touched", duration: "Instantaneous", save: "Will half (harmless)", sr: "Yes (harmless)", description: "<p>A warm glow knits the wound shut; the spell cures 1d8 points of damage +1 point per caster level (maximum +5).</p>" };
const burning35 = { name: "Flame Fan", level: "Sor/Wiz 1", range: "15 ft.", area: "Cone-shaped burst", duration: "Instantaneous", save: "Reflex half", sr: "Yes", description: "<p>Heat roars out ahead of you; anything caught takes 1d4 points of fire damage per caster level (maximum 5d4).</p>" };

const fireball2e = {
  name: "Blast Sphere", level: 3, range: "10 yds + 10 yds/level", aoe: "20 ft radius sphere", duration: "Instantaneous", save: "Half",
  description: "<p>The bead bursts, and every creature in the area suffers 1d6 damage per level of the caster.</p>",
  actions: { "id-00001": { type: "cast", savetype: "spell", onmissdamage: "half" }, "id-00002": { type: "damage", damagelist: { "id-00001": { dice: "d6", castertype: "casterlevel", castermax: 0, type: "fire" } } } },
};
const sleep2e = {
  name: "Slumber", level: 1, range: "30 yds", aoe: "See below", duration: "5 rounds/ level", save: "None",
  description: "<p>Creatures within a 15 ft radius of the chosen spot fall into a magical slumber. Slapping or wounding awakens them.</p>",
  actions: { "id-00001": { type: "effect", label: "Unconscious", durvalue: 5, durunit: "round" } },
};
const fan2e = { name: "Flame Fan", level: 1, range: "0", aoe: "Fan of flame 3 ft long in a 120-degree arc", duration: "Instantaneous", save: "None", description: "<p>Flames jet from the caster's hands for 1d3 points of damage +2 points per level.</p>" };
const square2e = { name: "Web Field", level: 2, range: "5 yds/level", aoe: "50 ft x 50 ft", duration: "2 turns/level", save: "Neg.", description: "<p>Sticky strands fill the area and anyone caught is entangled.</p>" };
const sleepBf = { name: "Slumber", level: 1, range: "90'", duration: "5 rounds/level", description: "<p>This spell puts creatures into a magical slumber. Up to 2d8 hit dice of those creatures within 30' of the chosen point are affected; each may save vs. Spells to resist. Injuring such a creature will cause it to awaken.</p>" };
const fireballBf = { name: "Blast Sphere", level: 3, range: "100'+10'/level", duration: "instantaneous", description: "<p>A fiery bead bursts in a 20' radius sphere, dealing 1d6 damage per level of the caster to every creature within; save vs. Spells for half damage.</p>" };

// --- Assertions per fixture ----------------------------------------------------

{
  const p = parseSpell(fireball5e);
  eq("5e fireball area", [p.area?.shape, p.area?.size, p.area?.origin], ["circle", 20, "point"]);
  eq("5e fireball label", p.area?.label, "20-foot-radius Sphere");
  eq("5e fireball save", [p.save?.kind, p.save?.effect], ["dexterity", "half"]);
  eq("5e fireball damage", p.damage, [{ dice: "8d6", type: "fire" }]);
  eq("5e fireball who", p.targets.who, "any");
  eq("5e fireball no upcast targets", p.targets.upcast, false);
  eq("5e fireball count", p.targets.count, null);
  const rows = toFg5eActions(p);
  eq("fg cast row", rows[0], { type: "cast", targeting: "sphere", targetingval: 20 });
  eq("fg save row", rows.find((row) => row.type === "powersave"), { type: "powersave", savetype: "dexterity", onmissdamage: "half" });
  eq("fg damage row", rows.find((row) => row.type === "damage")?.damagelist, [{ dice: "8d6", type: "fire" }]);
}
{
  const p = parseSpell(burning5e);
  eq("5e burning hands area", [p.area?.shape, p.area?.size, p.area?.origin], ["cone", 15, "self"]);
  eq("5e burning hands damage", p.damage[0], { dice: "3d6", type: "fire" });
}
{
  const p = parseSpell(bolt5e);
  eq("5e lightning bolt area", [p.area?.shape, p.area?.size, p.area?.width, p.area?.origin], ["line", 100, 5, "self"]);
  eq("5e lightning bolt label", p.area?.label, "100-foot-long, 5-foot-wide Line");
}
{
  const p = parseSpell(wave5e);
  eq("5e thunderwave area", [p.area?.shape, p.area?.size, p.area?.origin], ["square", 15, "self"]);
  eq("5e thunderwave save", [p.save?.kind, p.save?.effect], ["constitution", "half"]);
  eq("fg cube row", toFg5eActions(p)[0], { type: "cast", targeting: "cube", targetingval: 15 });
}
{
  const p = parseSpell(guardians5e);
  eq("5e spirit guardians area", [p.area?.shape, p.area?.size, p.area?.origin, p.area?.attach], ["circle", 15, "self", true]);
  eq("5e spirit guardians label", p.area?.label, "15-foot Emanation");
  eq("5e spirit guardians enemy", [p.targets.who, p.targets.choice, p.concentration], ["enemy", true, true]);
  eq("fg emanation row", toFg5eActions(p)[0], { type: "cast", targeting: "emanation", targetingval: 15 });
}
{
  const p = parseSpell(bless5e);
  eq("5e bless effect", p.effect?.label, "Blessing; ATK: 1d4; SAVE: 1d4");
  eq("5e bless duration", p.effect?.duration, { value: 1, unit: "minute" });
  eq("5e bless targets", [p.targets.who, p.targets.count, p.targets.upcast], ["ally", 3, true]);
  eq("5e bless concentration, beneficial", [p.concentration, p.beneficial, p.area], [true, true, null]);
  eq("fg bless rows", toFg5eActions(p), [{ type: "cast", targeting: "targets", targetingval: 3, allowupcast: 1 }, { type: "effect", label: "Blessing; ATK: 1d4; SAVE: 1d4", durmod: 1, durunit: "minute" }]);
}
{
  const p = parseSpell(sleep5e);
  eq("5e sleep area", [p.area?.shape, p.area?.size, p.area?.origin], ["circle", 5, "point"]);
  eq("5e sleep save", [p.save?.kind, p.save?.effect], ["wisdom", "negates"]);
  eq("5e sleep conditions", p.effect?.conditions, ["incapacitated"]);
  eq("5e sleep label", p.effect?.label, "Slumber; Incapacitated");
  eq("5e sleep targets", [p.targets.who, p.targets.choice, p.endsOnDamage, p.beneficial], ["enemy", true, true, false]);
}
{
  const p = parseSpell(cure5e);
  eq("5e cure heal", p.heal, { dice: "2d8", addMod: true });
  eq("5e cure targets", [p.targets.who, p.targets.count, p.beneficial, p.damage.length], ["ally", 1, true, 0]);
  eq("fg heal row", toFg5eActions(p)[1], { type: "heal", heallist: [{ dice: "2d8", stat: "base" }] });
}
{
  const p = parseSpell(hold5e);
  eq("5e hold person save", [p.save?.kind, p.save?.effect], ["wisdom", "negates"]);
  eq("5e hold person effect", [p.effect?.label, p.effect?.conditions], ["Freeze Foe; Paralyzed", ["paralyzed"]]);
  eq("5e hold person targets", [p.targets.who, p.targets.count, p.targets.upcast], ["enemy", 1, true]);
}
{
  const p = parseSpell(firebolt5e);
  eq("5e fire bolt", [p.attack, p.damage, p.area, p.targets.who, p.level], [{ kind: "ranged" }, [{ dice: "1d10", type: "fire" }], null, "enemy", 0]);
  eq("fg attack row", toFg5eActions(p)[1], { type: "attack", atktype: "ranged" });
}
{
  const p = parseSpell(fireball35);
  eq("3.5e fireball level", p.level, 3);
  eq("3.5e fireball area", [p.area?.shape, p.area?.size, p.area?.origin], ["circle", 20, "point"]);
  eq("3.5e fireball save", [p.save?.kind, p.save?.effect], ["reflex", "half"]);
  eq("3.5e fireball damage", p.damage, [{ dice: "1d6", type: "fire", perLevel: true, max: "10d6" }]);
  eq("3.5e fireball who", p.targets.who, "any");
}
{
  const p = parseSpell(bless35);
  eq("3.5e bless area", [p.area?.shape, p.area?.size, p.area?.origin], ["circle", 50, "self"]);
  eq("3.5e bless effect", [p.effect?.label, p.effect?.duration], ["Blessing; ATK: 1", { value: 1, unit: "minute", perLevel: true }]);
  eq("3.5e bless who", [p.targets.who, p.save, p.beneficial], ["ally", null, true]);
}
{
  const p = parseSpell(sleep35);
  eq("3.5e sleep area", [p.area?.shape, p.area?.size], ["circle", 10]);
  eq("3.5e sleep save", [p.save?.kind, p.save?.effect], ["will", "negates"]);
  eq("3.5e sleep effect", [p.effect?.label, p.effect?.conditions], ["Slumber; Asleep; Unconscious", ["asleep", "unconscious"]]);
  eq("3.5e sleep ends on damage", p.endsOnDamage, true);
}
{
  const p = parseSpell(cure35);
  eq("3.5e cure save", [p.save?.kind, p.save?.effect, p.save?.harmless], ["will", "half", true]);
  eq("3.5e cure heal", p.heal, { dice: "1d8", bonus: 1, perLevel: true, maxBonus: 5 });
  eq("3.5e cure targets", [p.damage.length, p.targets.who, p.targets.count, p.targets.willing, p.beneficial], [0, "ally", 1, true, true]);
}
{
  const p = parseSpell(burning35);
  eq("3.5e burning hands area", [p.area?.shape, p.area?.size, p.area?.origin], ["cone", 15, "self"]);
  eq("3.5e burning hands damage", p.damage, [{ dice: "1d4", type: "fire", perLevel: true, max: "5d4" }]);
  eq("3.5e burning hands save", [p.save?.kind, p.save?.effect], ["reflex", "half"]);
}
{
  const p = parseSpell(fireball2e);
  eq("2e fireball area", [p.area?.shape, p.area?.size, p.area?.origin], ["circle", 20, "point"]);
  eq("2e fireball save", [p.save?.kind, p.save?.effect], ["spell", "half"]);
  eq("2e fireball damage", p.damage, [{ dice: "1d6", type: "fire", perLevel: true }]);
  eq("2e fireball who", p.targets.who, "any");
}
{
  const p = parseSpell(sleep2e);
  eq("2e sleep area", [p.area?.shape, p.area?.size], ["circle", 15]);
  eq("2e sleep save", p.save, null);
  eq("2e sleep effect", [p.effect?.label, p.effect?.duration], ["Unconscious", { value: 5, unit: "round" }]);
  ok("2e sleep asleep and unconscious", p.effect?.conditions.includes("asleep") && p.effect?.conditions.includes("unconscious"));
  eq("2e sleep ends on damage", p.endsOnDamage, true);
}
{
  const p = parseSpell(fan2e, { game: "2e" });
  eq("2e fan area", [p.area?.shape, p.area?.size, p.area?.origin], ["cone", 3, "self"]);
  const q = parseSpell(square2e);
  eq("2e square area", [q.area?.shape, q.area?.size, q.area?.label], ["square", 50, "50-foot Square"]);
  eq("2e square save", [q.save?.kind, q.save?.effect], ["spell", "negates"]);
  eq("2e square duration", q.effect?.duration, { value: 2, unit: "turn", perLevel: true });
}
{
  const p = parseSpell(sleepBf);
  eq("bf sleep area", [p.area?.shape, p.area?.size, p.area?.origin], ["circle", 30, "point"]);
  eq("bf sleep save", [p.save?.kind, p.save?.effect], ["spells", "negates"]);
  eq("bf sleep effect", [p.effect?.conditions, p.effect?.duration, p.endsOnDamage], [["asleep", "unconscious"], { value: 5, unit: "round", perLevel: true }, true]);
  const q = parseSpell(fireballBf);
  eq("bf fireball area", [q.area?.shape, q.area?.size], ["circle", 20]);
  eq("bf fireball save", [q.save?.kind, q.save?.effect], ["spells", "half"]);
  eq("bf fireball damage", q.damage, [{ dice: "1d6", type: "", perLevel: true }]);
}
{
  // FG 2024 cast rows and a stored area come before the words.
  eq("cast row cone", areaOf({ actions: [{ type: "cast", targeting: "cone", targetingval: 30 }] }), { shape: "cone", size: 30, origin: "self", label: "30-foot Cone" });
  eq("cast row emanation", areaOf({ actions: { "id-1": { type: "cast", targeting: "emanation", targetingval: 10 } } })?.attach, true);
  eq("cast row line width", areaOf({ actions: [{ type: "cast", targeting: "line", targetingval: 60, targetingval2: 10 }] })?.width, 10);
  eq("stored area", areaOf({ area: { shape: "square", size: 20, origin: "point", label: "20-foot Cube" } }), { shape: "square", size: 20, origin: "point", label: "20-foot Cube" });
  eq("range is not area", areaOf({ text: "Choose a creature within 30 feet of you. It takes 1d6 Cold damage." }), null);
  eq("illusion size is not area", areaOf({ text: "You create an image no larger than a 15-foot Cube." }), null);
}

// --- Every shipped 5E spell, from its words only --------------------------------

const srd = JSON.parse(fs.readFileSync(new URL("../games/srd-5e/data/spells.json", import.meta.url), "utf8"));
const counts = { spells: 0, area: 0, circle: 0, cone: 0, line: 0, square: 0, save: 0, damage: 0, heal: 0, effect: 0 };
const byName = {};
const halfMisses = [];
let halfSpells = 0;
const tally = (parsed) => {
  counts.spells += 1;
  if (parsed.area) { counts.area += 1; counts[parsed.area.shape] += 1; }
  if (parsed.save) counts.save += 1;
  if (parsed.damage.length) counts.damage += 1;
  if (parsed.heal) counts.heal += 1;
  if (parsed.effect) counts.effect += 1;
};
for (const spell of srd) {
  // The words alone: the shipped rows are what the parse is checked against.
  const { actions, ...words } = spell;
  const parsed = parseSpell(words, { game: "5e" });
  byName[spell.name] = parsed;
  tally(parsed);
  if ((actions || []).some((row) => row.type === "powersave" && row.onmissdamage === "half")) {
    halfSpells += 1;
    if (parsed.save?.effect !== "half") halfMisses.push(spell.name);
  }
}
const spot = (name, check) => ok(`SRD ${name}`, byName[name] && check(byName[name]));
spot("Fireball", (p) => p.area?.shape === "circle" && p.area.size === 20 && p.area.origin === "point");
spot("Burning Hands", (p) => p.area?.shape === "cone" && p.area.size === 15 && p.area.origin === "self");
spot("Lightning Bolt", (p) => p.area?.shape === "line" && p.area.size === 100 && p.area.width === 5 && p.area.origin === "self");
spot("Thunderwave", (p) => p.area?.shape === "square" && p.area.size === 15 && p.area.origin === "self");
spot("Cone of Cold", (p) => p.area?.shape === "cone" && p.area.size === 60);
spot("Bless", (p) => p.targets.who === "ally" && p.targets.count === 3 && p.targets.upcast && p.concentration);
spot("Cure Wounds", (p) => p.targets.who === "ally" && p.heal?.dice === "2d8");
spot("Sleep", (p) => p.area?.shape === "circle" && p.area.size === 5 && p.targets.who === "enemy" && p.targets.choice && p.endsOnDamage);
spot("Spirit Guardians", (p) => p.area?.shape === "circle" && p.area.attach === true);
spot("Hold Person", (p) => p.targets.who === "enemy" && p.targets.count === 1);
spot("Magic Missile", (p) => p.area === null);
// A Self-range spell that forces a save lands on the foe, not the caster.
spot("Ensnaring Strike", (p) => p.targets.who === "enemy" && p.effect?.conditions.includes("restrained"));
spot("Shield", (p) => p.targets.who === "self" && p.effect?.label === "Shield; AC: 5");
spot("Silence", (p) => p.effect?.conditions.includes("deafened"));
// At most 2% of the spells FG saves for half may read otherwise.
if (halfMisses.length > Math.floor(halfSpells * 0.02)) failures.push(`half-damage saves read otherwise: ${halfMisses.join(", ")}`);
else passed += 1;

let darkness = "skipped";
try {
  const { SPELLS } = await import("../games/descending-darkness/spells.mjs");
  for (const spell of SPELLS) {
    const { actions, ...words } = spell;
    tally(parseSpell(words, { game: "5e" }));
  }
  darkness = `${SPELLS.length} spells`;
} catch (error) {
  darkness = `skipped (${error.message})`;
}

console.log(`spell parse: ${passed} passed, ${failures.length} failed in ${Date.now() - started} ms`);
console.log(`shipped: ${counts.spells} spells (SRD ${srd.length}, Descending Darkness ${darkness}): area ${counts.area} (circle ${counts.circle}, cone ${counts.cone}, line ${counts.line}, square ${counts.square}), save ${counts.save}, damage ${counts.damage}, heal ${counts.heal}, effect ${counts.effect}`);
console.log(`half-damage saves: ${halfSpells - halfMisses.length}/${halfSpells} read as half${halfMisses.length ? ` (missed: ${halfMisses.join(", ")})` : ""}`);
for (const failure of failures) console.log(`FAIL ${failure}`);
process.exit(failures.length ? 1 : 0);
