// Kraken's records from Datasworn's CC BY 4.0 data (games/ironsworn/data,
// kept by tools/filter-datasworn.mjs): moves (ironmove), assets (ironasset),
// oracles as FG tables (ironoracle), Delve's site themes and domains
// (irondelve) and Starforged's sample foes (npc). The text is Shawn
// Tomkin's (CC BY 4.0); its markup is turned into Kraken's (games/lib/fg.mjs md).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ids, md } from "../lib/fg.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(here, "data", `${name}.json`), "utf8"));
export const DATA = { classic: read("classic"), delve: read("delve"), starforged: read("starforged") };
const BY = "https://creativecommons.org/licenses/by/4.0";
// Never anything not CC BY (the filter's work, checked again here).
function onlyBy(node, where) {
  if (node?._source && node._source.license !== BY) throw new Error(`${where} is not CC BY 4.0`);
  return node;
}

// Datasworn's markdown: links to their label, __bold__ to **bold**, "  * " lists to "- ", embedded tables out.
export function clean(text) {
  return String(text ?? "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\[([^\]]+)\]\(datasworn:[^)]*\)/g, "$1")
    .replace(/__([^_]+)__/g, "**$1**")
    .replace(/^\s*\* /gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
// Plain text (chat): no markup at all.
export const plain = (text) => clean(text).replace(/\*\*/g, "").replace(/^- /gm, "• ");
// md() wants every line of a list block to be a list line: a paragraph and its list are split.
function blocks(text) {
  const out = [];
  let list = null;
  for (const line of clean(text).split("\n")) {
    const isList = line.startsWith("- ");
    if (line.trim() && list !== null && isList !== list) out.push("");
    out.push(line);
    list = line.trim() ? isList : null;
  }
  return out.join("\n");
}

const gameOfId = (id) => String(id ?? "").split(":")[1]?.split("/")[0] ?? "";
const SOURCE = { classic: "Ironsworn", delve: "Ironsworn: Delve", starforged: "Ironsworn: Starforged" };

// --- Moves ----------------------------------------------------------------------
const SUFFERS = { endure_harm: "health", endure_stress: "spirit", companion_endure_harm: "asset", companion_takes_a_hit: "asset", withstand_damage: "asset", sacrifice_resources: "supply", lose_momentum: "momentum", check_your_gear: "", out_of_supply: "" };
function rollOptions(move) {
  return (move.trigger?.conditions ?? [])
    .filter((condition) => (condition.roll_options ?? []).length)
    .map((condition) => ({
      label: plain(condition.text ?? ""),
      method: String(condition.method ?? "player_choice"),
      roll: (condition.roll_options ?? []).map((option) => `${option.using}:${option.stat ?? option.condition_meter ?? option.control ?? option.assets?.[0] ?? ""}`).join("|"),
    }));
}
export function moveRecords(packages, game) {
  const out = [];
  const embedded = [];
  for (const name of packages) {
    for (const [, category] of Object.entries(DATA[name].moves ?? {})) {
      onlyBy(category, category._id);
      for (const [key, move] of Object.entries(category.contents ?? {})) {
        onlyBy(move, move._id);
        const oracles = Object.values(move.oracles ?? {});
        for (const oracle of oracles) embedded.push(oracleRecord(oracle, `Moves: ${move.name}`, game, name));
        out.push({
          name: move.name,
          __category: `${name === "delve" ? "Delve: " : ""}${category.name}`,
          moveid: move._id,
          key,
          game,
          source: SOURCE[name],
          rolltype: move.roll_type,
          trigger: plain(move.trigger?.text ?? ""),
          text: md(blocks(move.text)),
          ...(move.outcomes ? { strong: clean(move.outcomes.strong_hit?.text ?? ""), weak: clean(move.outcomes.weak_hit?.text ?? ""), miss: clean(move.outcomes.miss?.text ?? "") } : {}),
          options: ids(rollOptions(move)),
          burn: move.allow_momentum_burn ? 1 : 0,
          ...(move.tracks?.category ? { track: move.tracks.category } : {}),
          ...(SUFFERS[key] !== undefined ? { suffer: SUFFERS[key] } : {}),
          oracles: oracles.map((oracle) => oracle._id).join(","),
        });
      }
    }
  }
  return { moves: out, embedded };
}

// --- Oracles (FG's table records) -----------------------------------------------
function oracleRecord(oracle, category, game, pack) {
  onlyBy(oracle, oracle._id);
  const columns = Object.keys(oracle.column_labels ?? {}).filter((key) => key !== "roll");
  const cols = columns.length ? columns : ["text"];
  const rows = (oracle.rows ?? []).filter((row) => row.roll && Number.isFinite(row.roll.min));
  return {
    name: oracle.name,
    __category: category,
    oracleid: oracle._id,
    game,
    source: SOURCE[pack] ?? pack,
    dice: String(oracle.dice ?? "1d100").replace(/^1d/, "d"),
    resultscols: cols.length,
    ...Object.fromEntries(cols.map((key, index) => [`labelcol${index + 1}`, oracle.column_labels?.[key] ?? "Result"])),
    ...(oracle.summary || oracle.description ? { description: plain(oracle.summary ?? oracle.description) } : {}),
    tablerows: ids(
      rows.map((row) => ({
        fromrange: row.roll.min,
        torange: row.roll.max,
        results: ids(cols.map((key) => ({ result: plain(row[key] ?? "") }))),
        // Rows that send you to another table (or this one again: "Roll twice").
        ...(row.oracle_rolls?.length ? { rolls: row.oracle_rolls.map((item) => `${item.oracle ?? "self"}*${item.number_of_rolls ?? 1}`).join(",") } : /roll twice/i.test(String(row.text ?? "")) ? { rolls: "self*2" } : {}),
      })),
    ),
  };
}
function oracleWalk(collection, trail, game, pack, out) {
  onlyBy(collection, collection._id);
  const here = [...trail, collection.name].filter(Boolean);
  for (const oracle of Object.values(collection.contents ?? {})) if (oracle.type === "oracle_rollable") out.push(oracleRecord(oracle, here.join(": "), game, pack));
  for (const inner of Object.values(collection.collections ?? {})) oracleWalk(inner, here, game, pack, out);
}
export function oracleRecords(packages, game) {
  const out = [];
  for (const name of packages) for (const collection of Object.values(DATA[name].oracles ?? {})) oracleWalk(collection, name === "delve" ? ["Delve"] : [], game, name, out);
  return out;
}

// --- Assets ---------------------------------------------------------------------
export function assetRecords(packages, game) {
  const out = [];
  for (const name of packages) {
    for (const collection of Object.values(DATA[name].assets ?? {})) {
      onlyBy(collection, collection._id);
      for (const asset of Object.values(collection.contents ?? {})) {
        onlyBy(asset, asset._id);
        const meter = Object.values(asset.controls ?? {}).find((control) => control.field_type === "condition_meter");
        const marks = meter ? Object.entries(meter.controls ?? {}).filter(([, control]) => control.is_impact).map(([key]) => key) : [];
        const field = Object.values(asset.options ?? {}).find((option) => option.field_type === "text" || option.label);
        const abilities = (asset.abilities ?? []).map((ability) => ({ ...(ability.name ? { name: ability.name } : {}), text: plain(ability.text), enabled: ability.enabled ? 1 : 0 }));
        out.push({
          name: asset.name,
          __category: asset.category,
          assetid: asset._id,
          game,
          source: SOURCE[name],
          category: asset.category,
          ...(asset.requirement ? { requirement: plain(asset.requirement) } : {}),
          ...(field ? { fieldlabel: String(field.label ?? "name") } : {}),
          ...(meter ? { meterlabel: String(meter.label ?? "health"), metermax: Number(meter.max) || 0 } : {}),
          ...(marks.length ? { marks: marks.join(",") } : {}),
          abilities: ids(abilities),
          text: md(
            [
              asset.requirement ? `*${clean(asset.requirement)}*` : "",
              ...(asset.abilities ?? []).map((ability, index) => `${ability.enabled ? "**(Starts marked)** " : ""}**${index + 1}.** ${ability.name ? `**${ability.name}:** ` : ""}${clean(ability.text).replace(/\n+/g, " ")}`),
              meter ? `**${meter.label}** ${meter.max}${marks.length ? ` (${marks.join(", ")})` : ""}` : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
          ),
        });
      }
    }
  }
  return out;
}

// --- Delve's site themes and domains ----------------------------------------------
const tableRows = (rows) => ids((rows ?? []).filter((row) => row.roll).map((row) => ({ fromrange: row.roll.min, torange: row.roll.max, results: ids([{ result: plain(row.text) }]) })));
export function siteRecords() {
  const out = [];
  for (const [kind, group] of [
    ["theme", DATA.delve.site_themes],
    ["domain", DATA.delve.site_domains],
  ]) {
    for (const item of Object.values(group ?? {})) {
      onlyBy(item, item._id);
      out.push({
        name: item.name,
        __category: kind === "theme" ? "Themes" : "Domains",
        siteid: item._id,
        kind,
        summary: plain(item.summary ?? ""),
        ...(item.description ? { description: plain(item.description) } : {}),
        features: tableRows(item.features),
        dangers: tableRows(item.dangers),
        text: md(
          [
            `*${clean(item.summary ?? "")}*`,
            ...(item.description ? [clean(item.description)] : []),
            "### Features",
            ...(item.features ?? []).map((row) => `- ${row.roll.min}-${row.roll.max}: ${plain(row.text)}`),
            "",
            "### Dangers",
            ...(item.dangers ?? []).map((row) => `- ${row.roll.min}-${row.roll.max}: ${plain(row.text)}`),
          ]
            .join("\n")
            .replace(/(### \w+)\n/g, "$1\n\n")
            .replace(/(- [^\n]+)\n(?=###)/g, "$1\n\n"),
        ),
      });
    }
  }
  return out;
}

// --- Starforged's sample foes (the npc records the tracker takes) -------------------
export function starforgedFoes() {
  const out = [];
  for (const collection of Object.values(DATA.starforged.npcs ?? {})) {
    onlyBy(collection, collection._id);
    for (const npc of Object.values(collection.contents ?? {})) {
      onlyBy(npc, npc._id);
      const one = (item, base = null) => ({
        name: item.name,
        __category: base ? base.name : npc.nature ?? "Foes",
        foe: 1,
        game: "starforged",
        rank: ["troublesome", "dangerous", "formidable", "extreme", "epic"][Math.max(1, Math.min(5, Number(item.rank) || 2)) - 1],
        nature: item.nature ?? npc.nature ?? "",
        summary: plain(item.summary ?? npc.summary ?? ""),
        features: (base ? npc.features : item.features ?? []).map(plain).join("; "),
        drives: (base ? npc.drives : item.drives ?? []).map(plain).join("; "),
        tactics: (base ? npc.tactics : item.tactics ?? []).map(plain).join("; "),
        text: md(
          [
            `*${plain(item.summary ?? npc.summary ?? "")}* — ${["Troublesome", "Dangerous", "Formidable", "Extreme", "Epic"][Math.max(1, Math.min(5, Number(item.rank) || 2)) - 1]} ${item.nature ?? npc.nature ?? ""}`,
            clean(item.description ?? ""),
            `**Features:** ${(npc.features ?? []).map(plain).join("; ")}`,
            `**Drives:** ${(npc.drives ?? []).map(plain).join("; ")}`,
            `**Tactics:** ${(npc.tactics ?? []).map(plain).join("; ")}`,
            npc.quest_starter && !base ? `**Quest starter:** ${plain(npc.quest_starter)}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      });
      out.push(one(npc));
      for (const variant of Object.values(npc.variants ?? {})) out.push(one(variant, npc));
    }
  }
  return out;
}

// --- Starforged's setting truths (pages) -----------------------------------------------
export function truthPages() {
  return Object.values(DATA.starforged.truths ?? {}).map((truth) => {
    onlyBy(truth, truth._id);
    const options = (truth.options ?? []).map((option) => `**${option.roll?.min ?? ""}-${option.roll?.max ?? ""}.** ${clean(option.summary ?? "")} ${clean(option.description ?? "").replace(/\n+/g, " ")}`.trim());
    return { name: truth.name, keywords: `truth ${truth.name}`, text: [truth.summary ? `*${clean(truth.summary)}*` : "", ...options].filter(Boolean).join("\n\n") || "-" };
  });
}

export const datasets = { classic: ["classic", "delve"], starforged: ["starforged"] };
export { gameOfId };
