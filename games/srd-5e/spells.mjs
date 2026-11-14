// The SRD 5.2.1's spells as FG 5E spell records: level, school, casting time,
// range, components, duration, ritual, the classes that cast it (source, which
// the wizard's spell lists read) and the actions Kraken's tracker plays
// (electron/combat.cjs cast5e), read from each spell's own text by
// games/srd-5e/tools/parse.py: an attack roll or a save (half on a success
// where the spell says so), damage dice and types (a cantrip's dice growing at
// levels 5, 11 and 17; a higher slot's dice), healing (+ the casting modifier),
// darts that always hit, and effects (a condition, a bonus to AC, Bless's d4).
import { ids, md } from "../lib/fg.mjs";
import { data } from "./common.mjs";

const SPELLS_DATA = data("spells");

const action = (row) => {
  const out = { ...row };
  if (row.damagelist) out.damagelist = ids(row.damagelist);
  if (row.heallist) out.heallist = ids(row.heallist);
  return out;
};

export const SPELLS = SPELLS_DATA.map((spell) => ({
  name: spell.name,
  level: spell.level,
  school: spell.school,
  castingtime: spell.castingtime,
  range: spell.range,
  components: spell.components,
  duration: spell.duration,
  ritual: spell.ritual ? 1 : 0,
  source: spell.classes.join(", "),
  description: md(`*${spell.level ? `Level ${spell.level} ${spell.school}` : `${spell.school} Cantrip`} (${spell.classes.join(", ")})*\n\n**Casting Time:** ${spell.castingtime}${spell.ritual ? " or Ritual" : ""}\n\n**Range:** ${spell.range}\n\n**Components:** ${spell.components}\n\n**Duration:** ${spell.duration}\n\n${spell.text}`),
  ...(spell.actions.length ? { actions: ids(spell.actions.map(action)) } : {}),
  __category: spell.level === 0 ? "Cantrips" : `Level ${spell.level}`,
}));

export const SPELL_COUNTS = { all: SPELLS.length, withActions: SPELLS.filter((spell) => spell.actions).length };
