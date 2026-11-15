import { classKey, signed } from "../../shared/adnd2e/rules.mjs";
import { num, type Row } from "../core/sheet/context";

// AD&D 2E's formatters (docs/core-ui-design.md 4.4, level 3): what each
// ability's table says beside its score, as FG's 2E sheet shows it, and a
// class's key for its level's data-stat. The sheet is the core's parts,
// arranged its own way by shared/adnd2e/manifest.mjs (as FG's 2E sheet
// rearranges CoreRPG's).

const NOTES: Record<string, (row: Row) => string> = {
  strength: (row) => `Hit ${signed(num(row.hitadj))}, damage ${signed(num(row.dmgadj))}, weight ${num(row.weightallow)} lb., open doors ${String(row.opendoors ?? "")}, bend bars ${num(row.bendbars)}%`,
  dexterity: (row) => `Reaction ${signed(num(row.reactionadj))}, missile ${signed(num(row.missileadj))}, defense ${signed(num(row.defenseadj))}`,
  constitution: (row) => `Hit points ${signed(num(row.hitpointadj))} (warriors ${signed(num(row.warriorhpadj))}), system shock ${num(row.systemshock)}%, resurrection ${num(row.resurrectionsurvival)}%`,
  intelligence: (row) => `${num(row.languages)} languages, spell level ${num(row.spelllevel) || "—"}, learn ${num(row.learn)}%, max spells ${num(row.maxspells) >= 99 ? "all" : num(row.maxspells)}`,
  wisdom: (row) => `Magic defense ${signed(num(row.magicdefenseadj))}, bonus spells ${String(row.spellbonus ?? "None")}, failure ${num(row.failure)}%`,
  charisma: (row) => `Henchmen ${num(row.maxhench)}, loyalty ${signed(num(row.loyalty))}, reaction ${signed(num(row.reaction))}`,
};
export const adnd2eAbilityNote = (row: Row, key = "") => NOTES[key]?.(row) ?? "";
export const adnd2eClassKey = (row: Row) => classKey(String(row.name));
