// @ts-check
// Every ruleset's manifest, and the one way to ask about a game: by its
// campaign name ("Fate Accelerated") or by a record's data.ruleset id
// ("descending"). Read by the host (electron, through require) and the
// client (src) alike. Castles & Crusades is the default: a character with no
// data.ruleset is C&C's, as today (docs/core-ui-design.md, 4.7).
import adnd2e from "../adnd2e/manifest.mjs";
import astra from "../astra/manifest.mjs";
import bfrpg from "../bfrpg/manifest.mjs";
import cairn from "../cairn/manifest.mjs";
import cnc from "../cnc/manifest.mjs";
import dnd35 from "../dnd35/manifest.mjs";
import dnd5e from "../dnd5e/manifest.mjs";
import fate from "../fate/manifest.mjs";
import forged from "../forged/manifest.mjs";
import ironsworn from "../ironsworn/manifest.mjs";
import mgt2 from "../mgt2/manifest.mjs";
import worldbuilding from "../worldbuilding/manifest.mjs";
// Each game's targeting, actions and effects, kept beside its manifest (shared/<id>/actions.mjs).
import adnd2eActions from "../adnd2e/actions.mjs";
import astraActions from "../astra/actions.mjs";
import bfrpgActions from "../bfrpg/actions.mjs";
import cairnActions from "../cairn/actions.mjs";
import cncActions from "../cnc/actions.mjs";
import dnd35Actions from "../dnd35/actions.mjs";
import dnd5eActions from "../dnd5e/actions.mjs";
import fateActions from "../fate/actions.mjs";
import forgedActions from "../forged/actions.mjs";
import ironswornActions from "../ironsworn/actions.mjs";
import mgt2Actions from "../mgt2/actions.mjs";
import worldbuildingActions from "../worldbuilding/actions.mjs";

// What each game counts and spends (ammunition, rations, light, load, rest), beside its manifest (shared/<id>/bookkeeping.mjs).
import adnd2eBooks from "../adnd2e/bookkeeping.mjs";
import astraBooks from "../astra/bookkeeping.mjs";
import bfrpgBooks from "../bfrpg/bookkeeping.mjs";
import cairnBooks from "../cairn/bookkeeping.mjs";
import cncBooks from "../cnc/bookkeeping.mjs";
import dnd35Books from "../dnd35/bookkeeping.mjs";
import dnd5eBooks from "../dnd5e/bookkeeping.mjs";
import fateBooks from "../fate/bookkeeping.mjs";
import forgedBooks from "../forged/bookkeeping.mjs";
import ironswornBooks from "../ironsworn/bookkeeping.mjs";
import mgt2Books from "../mgt2/bookkeeping.mjs";
import worldbuildingBooks from "../worldbuilding/bookkeeping.mjs";

/** @typedef {import("./types").RulesetManifest} RulesetManifest */
/** @typedef {import("./types").FeatureId} FeatureId */

/** @type {RulesetManifest[]} */
export const MANIFESTS = [cnc, dnd5e, dnd35, adnd2e, mgt2, astra, ironsworn, cairn, bfrpg, fate, forged, worldbuilding];
/** @type {Record<string, import("./types").ActionsSpec>} */
const ACTIONS = { adnd2e: adnd2eActions, astra: astraActions, bfrpg: bfrpgActions, cairn: cairnActions, cnc: cncActions, dnd35: dnd35Actions, dnd5e: dnd5eActions, fate: fateActions, forged: forgedActions, ironsworn: ironswornActions, mgt2: mgt2Actions, worldbuilding: worldbuildingActions };
for (const manifest of MANIFESTS) manifest.actions = ACTIONS[manifest.id] ?? manifest.actions;
/** @type {Record<string, import("./types").BookkeepingSpec>} */
const BOOKS = { adnd2e: adnd2eBooks, astra: astraBooks, bfrpg: bfrpgBooks, cairn: cairnBooks, cnc: cncBooks, dnd35: dnd35Books, dnd5e: dnd5eBooks, fate: fateBooks, forged: forgedBooks, ironsworn: ironswornBooks, mgt2: mgt2Books, worldbuilding: worldbuildingBooks };
for (const manifest of MANIFESTS) manifest.bookkeeping = BOOKS[manifest.id] ?? manifest.bookkeeping;

// The games a campaign can be made with, in the campaign screen's order.
export const CAMPAIGN_RULESETS = ["Castles & Crusades", "D&D 5E", "D&D 3.5E", "AD&D 2E", "Traveller", "Descending Darkness", "Apeira Astra", "Ironsworn", "Starforged", "Cairn", "Basic Fantasy", "Fate Core", "Fate Accelerated", "Forged in the Dark", "Worldbuilding"];

// Every optional feature a manifest may switch on (types.d.ts FeatureId).
export const FEATURES = ["deathSaves", "dying.save", "dying.bleed", "morale", "turnUndead", "multiAttack", "dread", "clocks", "crew", "scorePanel", "downtime", "fatePoints", "sceneAspects", "stressConsequences", "oracles", "delve", "progressTracks", "momentum", "assetsCards", "starships", "careers", "slots", "fatigue", "scars", "spellbooks", "thiefSkills", "encumbrance", "abilityCards", "approaches"];

// Objects that a variant joins (one level deep, as FG's merge="join") rather than replaces.
const JOINED = new Set(["records", "labels", "dice", "host"]);
/**
 * @param {RulesetManifest} base
 * @param {string} name
 * @returns {RulesetManifest}
 */
function withVariant(base, name) {
  const variant = base.variants?.[name];
  if (!variant) return base;
  /** @type {Record<string, unknown>} */
  const out = { ...base };
  for (const [key, value] of Object.entries(variant)) {
    const before = out[key];
    if (JOINED.has(key) && before && typeof before === "object" && value && typeof value === "object") {
      /** @type {Record<string, unknown>} */
      const joined = { ...before };
      for (const [inner, part] of Object.entries(value)) {
        const was = joined[inner];
        joined[inner] = was && typeof was === "object" && part && typeof part === "object" && !Array.isArray(part) ? { ...was, ...part } : part;
      }
      out[key] = joined;
    } else out[key] = value;
  }
  return /** @type {RulesetManifest} */ (/** @type {unknown} */ (out));
}

const BY_NAME = new Map(MANIFESTS.flatMap((manifest) => manifest.names.map((name) => [name, withVariant(manifest, name)])));
const BY_ID = new Map();
for (const manifest of MANIFESTS) {
  BY_ID.set(manifest.id, manifest);
  for (const [name, variant] of Object.entries(manifest.variants ?? {})) if (variant.id) BY_ID.set(variant.id, withVariant(manifest, name));
}

// A campaign's game by its name, or null for a name with no manifest.
/** @param {string | undefined | null} name @returns {RulesetManifest | null} */
export const rulesetNamed = (name) => BY_NAME.get(String(name ?? "")) ?? null;
// A record's game by its data.ruleset id; C&C for a record with none.
/** @param {unknown} id @returns {RulesetManifest} */
export const rulesetOfRecord = (id) => BY_ID.get(String(id ?? "")) ?? cnc;
// Either: a campaign name or a record id; C&C when neither matches.
/** @param {unknown} nameOrId @returns {RulesetManifest} */
export const rulesetFor = (nameOrId) => BY_NAME.get(String(nameOrId ?? "")) ?? BY_ID.get(String(nameOrId ?? "")) ?? cnc;
// Is an optional feature on in this game?
/** @param {RulesetManifest | null | undefined} manifest @param {FeatureId} feature */
export const has = (manifest, feature) => Boolean(manifest?.features.includes(feature));
// Whether a record (a character) is of a game, given by its campaign name or id: the campaign's own scoundrels,
// the characters who may take a site's track. A variant is its base's game (a Starforged character is Ironsworn's).
/**
 * @param {{ data?: { ruleset?: unknown } } | null | undefined} record
 * @param {string} nameOrId
 */
export const ofGame = (record, nameOrId) => rulesetOfRecord(record?.data?.ruleset).id === rulesetFor(nameOrId).id;
// The campaign screen's list: each name with its own blurb.
export const campaignRulesets = () => CAMPAIGN_RULESETS.map((name) => ({ name, blurb: rulesetNamed(name)?.blurb ?? "" }));
