// Combined classes built live in Fantasy Grounds (CCWizard.buildFromSpec,
// with its multiclass / support / plus fields) and by Kraken's builder from
// the same spec: packages, levels, markers, hit points, experience, the next
// level, base to hit, primes and spell slots must match. Needs FG up with the
// agent bridge and the C&C books loaded; each FG character is deleted again.
import { createRequire } from "node:module";
import { buildFromSpec } from "../shared/siege/builder.mjs";

const require = createRequire(import.meta.url);
const { readModule } = require("../electron/importers/fgModule.cjs");

async function fg(cmd, args) {
  const response = await fetch("http://127.0.0.1:47111/cmd", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cmd, args, timeout: 600 }) });
  const body = await response.json();
  if (!body.ok) throw new Error(`FG ${cmd}: ${body.error}`);
  return body.data;
}
// Skipped when FG is not open on a C&C campaign (no CCWizard to build with).
try {
  await fg("get", { package: "CCWizard", fns: ["buildFromSpec"] });
} catch (error) {
  console.log(`skip combine-fg: FG's C&C wizard is not reachable (${error.message}); open FG on a C&C campaign`);
  process.exit(0);
}

async function liveSheet(spec) {
  const built = (await fg("call", { package: "CCWizard", fn: "buildFromSpec", args: [spec] })).result[0];
  if (!built?.path) throw new Error(`FG built nothing: ${JSON.stringify(built)}`);
  try {
    return { sheet: (await fg("db_get", { path: built.path, depth: 4, max: 8000 })).value, problems: built.problems };
  } finally {
    await fg("call", { package: "DB", fn: "deleteNode", args: [built.path] });
  }
}

const records = [...readModule("C&C Player's Handbook").records, ...readModule("C&C Adventurer's Backpack").records];
const library = {
  packages: records.filter((r) => r.type === "siegepackage").map((r) => r.data),
  items: records.filter((r) => r.type === "item").map((r) => r.data),
  powers: records.filter((r) => r.type === "siegepower").map((r) => r.data),
  game: records.find((r) => r.type === "siegegame")?.data,
};
const scores = { strength: 14, dexterity: 14, constitution: 12, intelligence: 14, wisdom: 14, charisma: 10 };
const SPECS = {
  "fighter-wizard-3": { race: "Human", class: "Fighter", multiclass: "Wizard", level: 3, primes: ["dexterity", "wisdom"] },
  "wizard-fighter-support-6": { race: "Human", class: "Wizard", support: "fighter", level: 6, primes: ["dexterity", "wisdom"] },
  "fighter-killer-3": { race: "Human", class: "Fighter", support: "killer", level: 3, primes: ["wisdom"] },
  "fighter-wizard-support-2": { race: "Human", class: "Fighter", support: "wizard", level: 2, primes: ["dexterity", "wisdom"] },
  "fighter-rogue-plus-2": { race: "Human", class: "Fighter", plus: ["Rogue"], level: 2, primes: ["dexterity", "wisdom"] },
  "dwarf-cleric-thief-3": { race: "Dwarf", class: "Cleric", multiclass: "Fighter", level: 3, primes: [] },
};

const packagesOf = (character) =>
  Object.entries(character.packages ?? {})
    .filter(([, pkg]) => pkg && typeof pkg === "object" && pkg.levels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, pkg]) => `${pkg.name}@${Number(pkg.level)}${pkg.ccmulti ? " multi" : ""}${pkg.ccprincipal ? " principal" : ""}${pkg.ccsupport ? ` support:${pkg.ccsupport}` : ""}`)
    .join(" | ");
const primesOf = (character) => ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].filter((stat) => Number(character.attributes?.[stat]?.prime) === 1).join(",");
const slotsOf = (character) => Object.entries(character.slots ?? {}).filter(([, row]) => Number(row?.max) > 0).map(([key, row]) => `${key}:${Number(row.max)}`).sort().join(",");

let failed = 0;
for (const [key, spec] of Object.entries(SPECS)) {
  const full = { name: `Parity ${key}`, scores, gold: 0, ...spec };
  const { character: mine, report } = buildFromSpec(full, library);
  const { sheet, problems } = await liveSheet(full);
  const wrong = [];
  for (const [field, a, b] of [
    ["packages", packagesOf(mine), packagesOf(sheet)],
    ["hp", Number(mine.hp?.total), Number(sheet.hp?.total)],
    ["exp", Number(mine.exp), Number(sheet.exp)],
    ["expnext", Number(mine.expnext), Number(sheet.expnext)],
    ["expnextsource", String(mine.expnextsource ?? ""), String(sheet.expnextsource ?? "")],
    ["level", Number(mine.level), Number(sheet.level)],
    ["bth", Number(mine.bth), Number(sheet.bth)],
    ["primes", primesOf(mine), primesOf(sheet)],
    ["slots", slotsOf(mine), slotsOf(sheet)],
    ["ccplus", Object.keys(mine.ccplus ?? {}).join(), Object.keys(sheet.ccplus ?? {}).join()],
  ]) {
    if (a !== b) wrong.push(`${field}: kraken ${JSON.stringify(a)} fg ${JSON.stringify(b)}`);
  }
  if (wrong.length) {
    failed += 1;
    console.log(`DIFF ${key} (kraken problems: ${report.problems.join("; ") || "none"}; fg: ${(Object.values(problems ?? {}).join("; ")) || "none"})\n  ${wrong.join("\n  ")}`);
  } else console.log(`same ${key}: ${packagesOf(mine)}; HP ${mine.hp.total}; XP ${mine.exp} -> ${mine.expnext} (${mine.expnextsource})`);
}
if (failed) {
  console.log(`${failed} of ${Object.keys(SPECS).length} combined characters differ from FG`);
  process.exit(1);
}
console.log(`ok combine-fg: ${Object.keys(SPECS).length} combined characters equal FG's live builds`);
