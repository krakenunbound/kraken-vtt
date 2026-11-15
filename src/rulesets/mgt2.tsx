import { useState } from "react";
import { PHYSICAL, SKILLS, STATS, dm, physicalNow, signed, skillName } from "../../shared/mgt2/rules.mjs";
import type { ActionCall } from "../../shared/rulesets/types";
import { num, useSheet, type Row } from "../core/sheet/context";

// Traveller's own parts, where no core part fits (docs/core-ui-design.md 4.4,
// level 3): the two skill pickers under the skills (roll a skill not listed,
// learn one), and two formatters (the careers line, a skill's total with its
// characteristic's current DM). Everything else on the sheet is the core's,
// laid out by shared/mgt2/manifest.mjs.

// Every skill and speciality, for the pickers.
const ALL_SKILLS: [string, string][] = Object.entries(SKILLS).flatMap(([key, [name, , specs]]) => ((specs as string[]).length ? [[key, `${name} (any: 0)`] as [string, string], ...(specs as string[]).map((spec): [string, string] => [`${key}-${spec.toLowerCase().replace(/[^a-z0-9]/g, "")}`, `${name} (${spec})`])] : [[key, name] as [string, string]]));

// "Scout 3 (rank 2), Marine 2 (Lieutenant)", or "-".
export const mgt2Careers = (data: Row) =>
  (Array.isArray(data.careers) ? (data.careers as Row[]) : []).map((career) => `${String(career.name)} ${num(career.terms)}${career.title ? ` (${String(career.title)})` : num(career.rank) ? ` (rank ${num(career.rank)})` : ""}`).join(", ") || "-";

// A skill's task DM: its level and its characteristic's DM as that characteristic is now (a wounded one is weaker).
export const mgt2SkillTotal = (row: Row, _key?: string, data: Row = {}) => {
  const stats = (data.characteristics ?? {}) as Record<string, Row>;
  const scores = Object.fromEntries(STATS.map((stat: string) => [stat, num(stats[stat]?.score)]));
  const now = physicalNow(scores, num((data.hp as Row | undefined)?.wounds)) as Record<string, number>;
  const stat = String(row.stat);
  return signed(num(row.level) + dm(PHYSICAL.includes(stat) ? now[stat] : scores[stat]));
};

// Under the skills: roll a skill not listed (untrained, or a speciality), and learn one (training, a new term).
export function Mgt2SkillPickers({ props }: { props?: Record<string, unknown> }) {
  const { data, editable, change, act } = useSheet();
  const [other, setOther] = useState("");
  const [adding, setAdding] = useState("");
  if (!editable) return null;
  const skills = (data.skills ?? {}) as Record<string, Row>;
  const roll = props?.roll as ActionCall;
  const free = ALL_SKILLS.filter(([key]) => !skills[key]);
  return (
    <>
      <p className="cc-inline">
        <select className="cc-field" value={other} aria-label="Another skill" onChange={(event) => setOther(event.target.value)}>
          <option value="">Roll a skill not listed…</option>
          {free.map(([key, name]) => (
            <option key={key} value={key}>
              {name.replace(" (any: 0)", "")}
            </option>
          ))}
        </select>
        <button type="button" disabled={!other} data-action="roll-other-skill" onClick={() => act(roll, { key: skillName(other) })}>
          Roll
        </button>
      </p>
      <p className="cc-inline">
        <select className="cc-field" value={adding} aria-label="Learn a skill" onChange={(event) => setAdding(event.target.value)}>
          <option value="">Learn a skill (training, a new term)…</option>
          {free.map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-action="learn-skill"
          disabled={!adding}
          onClick={() => {
            change(`skills.${adding}.level`, adding.includes("-") ? 1 : 0);
            setAdding("");
          }}
        >
          Learn
        </button>
      </p>
    </>
  );
}
