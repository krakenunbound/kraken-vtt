import type { CustomPart, Format } from "../core/parts/Parts";
import type { WizardFunctions } from "../core/wizard/Steps";
import { BfStrip, BfTurnUndead } from "./bfrpg";
import { CairnRest, cairnBackgroundGold, cairnBackgroundOfRoll, cairnBuild, cairnItemSlots } from "./cairn";

// The level-3 parts a manifest places inside the core frame ({ part: "custom",
// component: "<ruleset>.<name>" }) and the formatters a list's details name
// ({ format: "<ruleset>.<name>" }). scripts/check-manifests.mjs checks every
// Ref a manifest names is one of these (or a component in index.tsx).
export const CUSTOM_PARTS: Record<string, CustomPart> = {
  "cairn.restStrip": CairnRest,
  "bfrpg.strip": BfStrip,
  "bfrpg.turnUndead": BfTurnUndead,
};
export const FORMATS: Record<string, Format> = {
  "cairn.itemSlots": cairnItemSlots,
};
// A manifest wizard's own rules, by Ref: how a table's roll picks a record, the money a choice brings, the spec build-character takes.
export const WIZARD_FUNCTIONS: WizardFunctions = {
  picks: {
    "cairn.backgroundOfRoll": cairnBackgroundOfRoll,
  },
  bonuses: {
    "cairn.backgroundGold": cairnBackgroundGold,
  },
  builds: {
    "cairn.build": cairnBuild,
  },
};
