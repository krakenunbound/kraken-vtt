import type { CustomPart, Format } from "../core/parts/Parts";
import type { WizardFunctions } from "../core/wizard/Steps";
import { BfStrip, BfTurnUndead } from "./bfrpg";
import { CairnRest, cairnBackgroundGold, cairnBackgroundOfRoll, cairnBuild, cairnItemSlots } from "./cairn";
import { Dnd5eDeathSaves, Dnd5eDread, Dnd5eDying, Dnd5eSpells, dnd5eClassName } from "./dnd5e";
import { adnd2eAbilityNote, adnd2eClassKey } from "./adnd2e";
import { Mgt2SkillPickers, mgt2Careers, mgt2SkillTotal } from "./mgt2";

// The level-3 parts a manifest places inside the core frame ({ part: "custom",
// component: "<ruleset>.<name>" }) and the formatters a list's details name
// ({ format: "<ruleset>.<name>" }). scripts/check-manifests.mjs checks every
// Ref a manifest names is one of these (or a component in index.tsx).
export const CUSTOM_PARTS: Record<string, CustomPart> = {
  "cairn.restStrip": CairnRest,
  "bfrpg.strip": BfStrip,
  "bfrpg.turnUndead": BfTurnUndead,
  "dnd5e.spells": Dnd5eSpells,
  "dnd5e.dread": Dnd5eDread,
  "dnd5e.dying": Dnd5eDying,
  "dnd5e.deathSaves": Dnd5eDeathSaves,
  "mgt2.skillPickers": Mgt2SkillPickers,
};
export const FORMATS: Record<string, Format> = {
  "cairn.itemSlots": cairnItemSlots,
  "dnd5e.className": dnd5eClassName,
  "adnd2e.abilityNote": adnd2eAbilityNote,
  "adnd2e.classKey": adnd2eClassKey,
  "mgt2.careers": mgt2Careers,
  "mgt2.skillTotal": mgt2SkillTotal,
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
