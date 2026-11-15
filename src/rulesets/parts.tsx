import type { CustomPart, Format } from "../core/parts/Parts";
import type { WizardFunctions } from "../core/wizard/Steps";
import { BfTurnUndead } from "./bfrpg";
import { CairnRest, cairnBackgroundGold, cairnBackgroundOfRoll, cairnBuild, cairnItemSlots } from "./cairn";
import { Dnd5eDeathSaves, Dnd5eDread, Dnd5eDying, Dnd5eSpells, dnd5eClassName } from "./dnd5e";
import { adnd2eAbilityNote, adnd2eClassKey } from "./adnd2e";
import { Mgt2SkillPickers, mgt2Careers, mgt2SkillTotal } from "./mgt2";
import { AstraMarks, AstraSkillPickers, AstraTrickNotes, astraSkillTotal } from "./astra";
import { SpellCasts } from "../core/parts/SpellCasts";
import { FateCompels, FateHarm, FateLastRoll, FateMilestones, FateProblem, FateRollBar, FateSkills, FateStunts } from "./fate";
import { ForgedAttributes, ForgedCondition, ForgedDowntime, ForgedLoad, ForgedPlaybook, ForgedRollBar } from "./forged";
import { IronAssets, IronCarryLine, IronControl, IronDebilities, IronLastRoll, IronMoves, IronProblem, IronProgress } from "./ironsworn";

// The level-3 parts a manifest places inside the core frame ({ part: "custom",
// component: "<ruleset>.<name>" }) and the formatters a list's details name
// ({ format: "<ruleset>.<name>" }). scripts/check-manifests.mjs checks every
// Ref a manifest names is one of these (or a component in index.tsx).
export const CUSTOM_PARTS: Record<string, CustomPart> = {
  "cairn.restStrip": CairnRest,
  "bfrpg.turnUndead": BfTurnUndead,
  "dnd5e.spells": Dnd5eSpells,
  // The core's: each known spell with Cast (the games whose spells the host reads from their words).
  "core.spellCasts": SpellCasts,
  "dnd5e.dread": Dnd5eDread,
  "dnd5e.dying": Dnd5eDying,
  "dnd5e.deathSaves": Dnd5eDeathSaves,
  "mgt2.skillPickers": Mgt2SkillPickers,
  "astra.marks": AstraMarks,
  "astra.trickNotes": AstraTrickNotes,
  "astra.skillPickers": AstraSkillPickers,
  "ironsworn.control": IronControl,
  "ironsworn.lastRoll": IronLastRoll,
  "ironsworn.problem": IronProblem,
  "ironsworn.debilities": IronDebilities,
  "ironsworn.moves": IronMoves,
  "ironsworn.progress": IronProgress,
  "ironsworn.assets": IronAssets,
  "ironsworn.carryLine": IronCarryLine,
  "fate.rollBar": FateRollBar,
  "fate.skills": FateSkills,
  "fate.harm": FateHarm,
  "fate.lastRoll": FateLastRoll,
  "fate.compels": FateCompels,
  "fate.problem": FateProblem,
  "fate.stunts": FateStunts,
  "fate.milestones": FateMilestones,
  "forged.rollBar": ForgedRollBar,
  "forged.attributes": ForgedAttributes,
  "forged.condition": ForgedCondition,
  "forged.load": ForgedLoad,
  "forged.playbook": ForgedPlaybook,
  "forged.downtime": ForgedDowntime,
};
export const FORMATS: Record<string, Format> = {
  "cairn.itemSlots": cairnItemSlots,
  "dnd5e.className": dnd5eClassName,
  "adnd2e.abilityNote": adnd2eAbilityNote,
  "adnd2e.classKey": adnd2eClassKey,
  "mgt2.careers": mgt2Careers,
  "mgt2.skillTotal": mgt2SkillTotal,
  "astra.skillTotal": astraSkillTotal,
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
