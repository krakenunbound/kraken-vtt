// The ruleset manifests (shared/<id>/manifest.mjs, docs/core-ui-design.md
// 4.8): each is checked against the code it names, so a manifest never
// points at something that is not there. Run by npm run coverage.
//   - names and ids unique; the campaign screen's list is exactly the manifests' names
//   - the engine and host module exist; the host message maps to the agent tool named
//   - every feature is a known FeatureId; every calendar a known calendar
//   - every Ref (sheet, wizard, strips, tracker.replace, statblocks, settings, party
//     tabs, custom parts) is a component src/rulesets supplies
//   - a sheet laid out by the manifest: hooks unique per tab, every field the sheet
//     lets a player type into matched by the manifest's edit whitelist, and that
//     whitelist the same as the host's (electron/<id>.cjs builds its regexes from it)
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { CALENDARS } from "../shared/calendars.mjs";
import { globRegex, samplePath } from "../shared/rulesets/edit.mjs";
import { CAMPAIGN_RULESETS, FEATURES, MANIFESTS, rulesetNamed } from "../shared/rulesets/registry.mjs";

const require = createRequire(import.meta.url);
const { listTools } = require("../electron/agent/tools.cjs");
const tools = new Set(listTools().map((tool) => tool.name));
const coverage = readFileSync(new URL("./check-coverage.mjs", import.meta.url), "utf8");
const messageTool = (message) => new RegExp(`^\\s*"?${message.replace(/[-]/g, "\\-")}"?: "(kraken_\\w+)"`, "m").exec(coverage)?.[1];
// The components src/rulesets supplies, by Ref.
const supplied = new Set(
  ["../src/rulesets/index.tsx", "../src/rulesets/statblocks.tsx", "../src/rulesets/parts.tsx"]
    .map((file) => new URL(file, import.meta.url))
    .filter((url) => existsSync(url))
    .flatMap((url) => [...readFileSync(url, "utf8").matchAll(/^\s*"([a-z0-9]+\.[A-Za-z0-9]+)":/gm)].map((match) => match[1])),
);
const calendars = new Set(CALENDARS.map((item) => item.id));
const problems = [];
const problem = (manifest, text) => problems.push(`${manifest.id}: ${text}`);
const exists = (file) => existsSync(new URL(`../${file}`, import.meta.url));

// Names and ids.
const seenNames = new Map();
const seenIds = new Map();
for (const manifest of MANIFESTS) {
  if (!manifest.id || !/^[a-z0-9]+$/.test(manifest.id)) problem(manifest, `the id "${manifest.id}" is not a plain lower-case word`);
  for (const id of [manifest.id, ...Object.values(manifest.variants ?? {}).map((variant) => variant.id).filter(Boolean)]) {
    if (seenIds.has(id)) problem(manifest, `the id ${id} is also ${seenIds.get(id)}'s`);
    seenIds.set(id, manifest.id);
  }
  if (!manifest.names?.length) problem(manifest, "no campaign names");
  for (const name of manifest.names ?? []) {
    if (seenNames.has(name)) problem(manifest, `the name ${name} is also ${seenNames.get(name)}'s`);
    seenNames.set(name, manifest.id);
    if (!CAMPAIGN_RULESETS.includes(name)) problem(manifest, `${name} is not on the campaign screen (CAMPAIGN_RULESETS)`);
  }
  for (const name of Object.keys(manifest.variants ?? {})) if (!manifest.names.includes(name)) problem(manifest, `the variant ${name} is not one of its names`);
}
for (const name of CAMPAIGN_RULESETS) if (!seenNames.has(name)) problems.push(`the campaign screen lists ${name}, which no manifest names`);

// Each game as it is played: the manifest with its variant applied.
for (const name of CAMPAIGN_RULESETS) {
  const manifest = rulesetNamed(name);
  if (!manifest) continue;
  const where = { id: `${manifest.id} (${name})` };
  if (!manifest.blurb?.trim()) problem(where, "no blurb");
  if (manifest.engine && !exists(manifest.engine)) problem(where, `the engine ${manifest.engine} does not exist`);
  if (manifest.host?.module && !exists(manifest.host.module)) problem(where, `the host module ${manifest.host.module} does not exist`);
  if (manifest.host?.tool && !tools.has(manifest.host.tool)) problem(where, `the tool ${manifest.host.tool} does not exist`);
  if (manifest.host?.message) {
    const tool = messageTool(manifest.host.message);
    if (!tool) problem(where, `the message ${manifest.host.message} has no tool in check-coverage.mjs`);
    else if (manifest.host.tool && tool !== manifest.host.tool) problem(where, `the message ${manifest.host.message} is ${tool}'s, not ${manifest.host.tool}'s`);
  }
  for (const feature of manifest.features ?? []) if (!FEATURES.includes(feature)) problem(where, `unknown feature ${feature}`);
  // A window or tab hangs off a feature (off in a variant: absent there, as Delve in Starforged).
  for (const item of [...(manifest.windows ?? []), ...(manifest.party?.tabs ?? [])]) if (item.feature && !FEATURES.includes(item.feature)) problem(where, `${item.label} hangs off an unknown feature ${item.feature}`);
  if (manifest.calendar && !calendars.has(manifest.calendar)) problem(where, `unknown calendar ${manifest.calendar}`);
  if (!Array.isArray(manifest.party?.currency)) problem(where, "no party.currency");
  // Every Ref names a component.
  const refs = [];
  if (typeof manifest.sheet === "string") refs.push(manifest.sheet);
  if (typeof manifest.wizard === "string") refs.push(manifest.wizard);
  else if (manifest.wizard) refs.push(...checkWizard(where, manifest.wizard));
  refs.push(...(manifest.strips ?? []));
  if (manifest.tracker?.replace) refs.push(manifest.tracker.replace);
  // The tracker's header controls are components; its buttons' hooks are once each per place; a ruleset message is the game's own.
  refs.push(...(manifest.tracker?.headerParts ?? []));
  for (const place of ["rowActions", "headerActions"]) {
    const seen = new Set();
    for (const action of manifest.tracker?.[place] ?? []) {
      if (seen.has(action.hook)) problem(where, `the tracker's ${place} use ${action.hook} twice`);
      seen.add(action.hook);
      if ("message" in action.call && action.call.message !== manifest.host?.message) problem(where, `the tracker's ${action.hook} sends ${action.call.message}, not the game's message ${manifest.host?.message}`);
    }
  }
  for (const record of Object.values(manifest.records ?? {})) {
    if (record.statblock) refs.push(record.statblock);
    if (record.sheet && record.sheet !== "core") refs.push(record.sheet);
  }
  for (const item of manifest.settings ?? []) if ("component" in item) refs.push(item.component);
  for (const tab of manifest.party?.tabs ?? []) if (tab.component) refs.push(tab.component);
  if (manifest.sheet && typeof manifest.sheet === "object") refs.push(...checkSheet(where, manifest));
  for (const ref of refs) if (!supplied.has(ref)) problem(where, `${ref} is not a component in src/rulesets`);
}

// A manifest-laid-out sheet: its parts' hooks, Refs and edit paths.
function checkSheet(where, manifest) {
  const refs = [];
  const editable = [];
  // Two kinds of hook a tab must not repeat: a row's data-* name, and a button's data-action.
  const once = (seen, hook, tab, what) => {
    if (seen.has(hook)) problem(where, `the ${what} ${hook} is used twice on the ${tab} tab`);
    seen.add(hook);
  };
  const walk = (parts, seen, tab) => {
    for (const part of parts) {
      if (part.part === "custom") refs.push(part.component);
      // Refs inside parts: a game's own box, a formatter for a shown field or a row's note, a class's level hook.
      if (part.part === "derived") for (const box of part.boxes) if (box.custom) refs.push(box.custom);
      if (part.part === "statBlock") for (let block = part; block; block = block.inner) if (block.rowNote) refs.push(block.rowNote.format);
      if (part.part === "strip") for (const item of part.items) if (item.kind === "levels") refs.push(item.hook);
      for (const field of part.part === "notes" ? part.fields : []) if (field.format) refs.push(field.format);
      if (part.part === "row") walk(part.parts, seen, tab);
      // A stat block's fields: each row's columns (not its rolls), a second field, and an inner block's.
      const statFields = (block) => [
        ...block.rows.flatMap((row) => block.columns.filter((column) => column.field).flatMap((column) => [{ ...column.field, path: column.path.replace("{key}", row.key) }, ...(column.extra ? [column.extra.field] : [])])),
        ...(block.inner ? statFields(block.inner) : []),
      ];
      const fields =
        part.part === "derived" ? part.boxes.filter((box) => !box.custom).flatMap((box) => [...(box.fields ?? []), ...(box.field ? [box.field] : []), ...(box.lines ?? []).flatMap((line) => line.items.filter((item) => item.field).map((item) => item.field))])
        : part.part === "notes" ? part.fields
        : part.part === "list" ? [part.select, part.check].filter(Boolean).map((field) => ({ ...field, path: `${part.path}.*.${field.path}` }))
        : part.part === "statBlock" ? statFields(part)
        : part.part === "skills" ? [{ ...part.field, path: `${part.path}.%.${part.field.path}` }]
        : [];
      if (part.part === "list") fields.push(...(part.fields ?? []).map((field) => ({ ...field, path: `${part.path}.*.${field.path}` })));
      if (part.part === "track") editable.push(part.each ? `${part.each}.#.${part.used}.#` : `${part.used}.#`);
      if (part.part === "strip") for (const item of part.items) if (item.kind === "xp") editable.push(item.path);
      // A field is typed into when it has an input kind (no kind: shown only) and is not edit: "never" or sent as an action.
      for (const field of fields) if (field.kind && field.kind !== "readonly" && field.edit !== "never" && !field.action) editable.push(field.path);
      if (part.part === "coins") editable.push(`${part.path}.*.amount`);
      if (part.part === "list") {
        editable.push(...(part.remove && !part.remove.action ? [`${part.path}.*`] : []));
        for (const detail of part.details ?? []) if (detail.format) refs.push(detail.format);
        for (const action of part.rowActions ?? []) once(seen.actions, action.hook, tab, "data-action");
      }
      for (const step of part.part === "derived" ? part.boxes.flatMap((box) => box.steps ?? []) : part.part === "advancement" ? part.rolls : []) once(seen.actions, step.hook, tab, "data-action");
      if (part.hook && part.part !== "load") once(seen.rows, part.hook, tab, "row hook");
    }
  };
  for (const field of manifest.sheet.header.identity) if (field.kind && field.kind !== "readonly" && field.edit !== "never") editable.push(field.path);
  for (const field of manifest.sheet.header.identity) if (field.format) refs.push(field.format);
  walk(manifest.sheet.top ?? [], { rows: new Set(), actions: new Set() }, "top");
  for (const tab of manifest.sheet.tabs) walk(tab.parts, { rows: new Set(), actions: new Set() }, tab.id);
  // The whitelist: every editable path is allowed by the manifest's edit globs.
  // Rows a list may drop: "inventorylist" -> inventorylist.<id>.
  const removable = (manifest.edit?.remove ?? []).length ? [`(${manifest.edit.remove.join("|")}).*`] : [];
  const globs = [...(manifest.edit?.text ?? []), ...(manifest.edit?.number ?? []), ...(manifest.edit?.string ?? []), ...(manifest.edit?.list ?? []), ...removable];
  const compiled = globs.map((glob) => globRegex(glob));
  for (const path of editable) {
    const sample = samplePath(path);
    if (!compiled.some((regex) => regex.test(sample))) problem(where, `the sheet edits ${path}, which the manifest's edit whitelist does not allow`);
  }
  // The host builds its whitelist from the manifest: the same regexes.
  if (manifest.host?.module && manifest.edit) {
    const host = require(`../${manifest.host.module}`);
    if (host.EDIT_PATHS) {
      const mine = ["text", "number", "string", "list"].map((kind) => (manifest.edit[kind] ?? []).map((glob) => globRegex(glob).source).join("|")).concat(removable.map((glob) => globRegex(glob).source));
      const theirs = ["text", "number", "string", "list"].map((kind) => (host.EDIT_PATHS[kind] ?? []).map((regex) => regex.source).join("|")).concat((host.EDIT_PATHS.remove ?? []).map((regex) => regex.source));
      if (mine.join("\n") !== theirs.join("\n")) problem(where, `${manifest.host.module}'s EDIT_PATHS are not the manifest's edit globs`);
    }
  }
  return refs;
}
// A manifest-laid-out wizard: its Refs (a roll's pick, a shop's bonus, the build), every button's data-action
// once in the wizard, and every part's spec path written by one part only.
function checkWizard(where, wizard) {
  const refs = [wizard.finish?.build].filter(Boolean);
  if (!wizard.hook) problem(where, "the wizard has no hook (data-wizard)");
  if (!wizard.finish?.build) problem(where, "the wizard has no build Ref");
  const actions = new Set();
  const intos = new Set();
  const once = (seen, value, what) => {
    if (seen.has(value)) problem(where, `the wizard's ${what} ${value} is used twice`);
    seen.add(value);
  };
  const walk = (parts) => {
    for (const part of parts) {
      if (part.kind === "row") {
        walk(part.parts);
        continue;
      }
      if (part.into) once(intos, part.into, "spec path");
      for (const roll of [part.kind === "choose-record" ? part.roll : null, part.kind === "shop" ? part.gold : null, ["roll", "roll-table", "roll-stats", "record-tables"].includes(part.kind) ? part : null]) if (roll?.hook) once(actions, roll.hook, "data-action");
      if (part.kind === "roll-stats" && part.swap) once(actions, part.swap.hook, "data-action");
      if (part.kind === "shop" && part.gold.into) once(intos, part.gold.into, "spec path");
      if (part.kind === "choose-record" && part.roll) refs.push(part.roll.pick);
      if (part.kind === "shop" && part.gold.bonus) refs.push(part.gold.bonus);
    }
  };
  for (const step of wizard.steps ?? []) walk(step.parts ?? []);
  if (actions.has("wizard-finish")) problem(where, "a wizard part uses the frame's wizard-finish");
  return refs;
}

const strictLater = FEATURES.filter((feature) => !existsSync(new URL(`../src/core/features/${feature}`, import.meta.url)));
console.log(`(Not yet strict, docs/core-ui-design.md step 13: ${strictLater.length} features have no src/core/features folder yet.)`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`MANIFESTS_OK ${MANIFESTS.length} manifests, ${CAMPAIGN_RULESETS.length} campaign rulesets, ${supplied.size} components`);
