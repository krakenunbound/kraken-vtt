// D&D 5E against live Fantasy Grounds: every character sheet in the GM's open
// FG 5E campaign, read through the Kraken Agent Bridge (read only: nothing in
// the campaign is changed), has its base fields (scores, save and skill
// proficiencies, level and class, what it wears and carries) put through
// Kraken's 5E rules; the numbers FG worked out and keeps on the sheet
// (proficiency, ability bonuses, saves, skill totals, armor class,
// initiative, passive Perception) must be Kraken's. Skipped when FG is not
// open on a 5E campaign.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import * as rules from "../shared/dnd5e/rules.mjs";

const bridge = path.join(process.env.APPDATA ?? "", "SmiteWorks", "Fantasy Grounds", "extensions", "KrakenAgentBridge", "tools", "fgu.py");
const fg = (tool, args) => JSON.parse(execFileSync("python", [bridge, tool, JSON.stringify(args)], { encoding: "utf8", timeout: 60000 }));
if (!existsSync(bridge)) {
  console.log("skip dnd5e-fg: no Kraken Agent Bridge");
  process.exit(0);
}
let status;
try {
  status = fg("fgu_status", {});
} catch {
  status = null;
}
if (!status?.connected || status.fg?.ruleset !== "5E") {
  console.log(`skip dnd5e-fg: FG is not open on a 5E campaign (${status?.fg?.ruleset ?? "not connected"})`);
  process.exit(0);
}

const rows = (node) => (node && typeof node === "object" ? Object.entries(node).filter(([key, value]) => !key.startsWith("$") && value && typeof value === "object") : []);
const ids = rows(fg("fgu_db_get", { path: "charsheet", depth: 1, max: 200 }).data.value).map(([id]) => id);
const problems = [];
let compared = 0;
for (const id of ids) {
  const sheet = fg("fgu_db_get", { path: `charsheet.${id}`, depth: 5, max: 4000 }).data.value;
  const classes = rows(sheet.classes).map(([, row]) => row);
  const cls = classes[0];
  // FG's base fields as Kraken's 5E record data.
  const input = {
    level: Number(sheet.level) || classes.reduce((sum, row) => sum + (Number(row.level) || 0), 0) || 1,
    abilities: Object.fromEntries(rules.STATS.map((stat) => [stat, { score: Number(sheet.abilities?.[stat]?.score) || 10, saveprof: Number(sheet.abilities?.[stat]?.saveprof) ? 1 : 0 }])),
    skills: Object.fromEntries(
      rows(sheet.skilllist)
        .map(([, row]) => [rules.skillKey(row.name), { prof: Number(row.prof) || 0 }])
        .filter(([key]) => rules.SKILLS[key]),
    ),
    inventorylist: Object.fromEntries(rows(sheet.inventorylist).map(([key, item]) => [key, { ...item, carried: Number(item.carried) || 0 }])),
    packages: cls ? { "id-00001": { name: cls.name, packagetype: "Class", level: Number(cls.level) || 1 } } : {},
    ac: { misc: (Number(sheet.defenses?.ac?.misc) || 0) + (Number(sheet.defenses?.ac?.temporary) || 0) },
    initiative: { misc: (Number(sheet.initiative?.misc) || 0) + (Number(sheet.initiative?.temporary) || 0) },
    hp: { total: Number(sheet.hp?.total) || 1, wounds: Number(sheet.hp?.wounds) || 0 },
  };
  const out = rules.derive(input);
  const want = [
    ["proficiency", Number(sheet.profbonus), out.prof],
    ...rules.STATS.flatMap((stat) => [
      [`${stat} bonus`, Number(sheet.abilities?.[stat]?.bonus), out.abilities[stat].bonus],
      // FG's save includes its own save modifier field (misc).
      [`${stat} save`, Number(sheet.abilities?.[stat]?.save), out.abilities[stat].save + (Number(sheet.abilities?.[stat]?.savemodifier) || 0)],
    ]),
    ...rows(sheet.skilllist)
      .filter(([, row]) => rules.SKILLS[rules.skillKey(row.name)] && row.total !== undefined)
      .map(([, row]) => [`${row.name}`, Number(row.total), out.skills[rules.skillKey(row.name)].total + (Number(row.misc) || 0)]),
    ["armor class", Number(sheet.defenses?.ac?.total), out.ac.total],
    ["initiative", Number(sheet.initiative?.total), out.initiative.total],
    ["passive Perception", Number(sheet.perception), out.passive + (Number(sheet.perceptionmodifier) || 0)],
  ].filter(([, fgValue]) => Number.isFinite(fgValue));
  for (const [what, fgValue, krakenValue] of want) {
    compared += 1;
    if (fgValue !== krakenValue) problems.push(`${sheet.name}: ${what} FG ${fgValue}, Kraken ${krakenValue}`);
  }
  console.log(`${sheet.name} (${cls?.name ?? "?"} ${input.level}): ${want.length} numbers, AC ${out.ac.total} (FG ${sheet.defenses?.ac?.total}), proficiency ${out.prof}`);
}
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log(`ok dnd5e-fg: ${ids.length} characters of FG's open 5E campaign, ${compared} numbers equal to FG's own (proficiency, ability bonuses, saves, skills, AC, initiative, passive Perception)`);
