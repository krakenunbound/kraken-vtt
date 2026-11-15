import type { ComponentType } from "react";
import type { Session, TableRecord } from "../session/useSession";
import type { RulesetManifest } from "../../shared/rulesets/types";
import { rulesetFor, rulesetOfRecord } from "../../shared/rulesets/registry.mjs";
import { CCSheet } from "../characters/CCSheet";
import { Wizard } from "../characters/Wizard";
import { Sheet5e, Wizard5e } from "../characters/Sheet5e";
import { Sheet35 } from "../characters/Sheet35";
import { Wizard35 } from "../characters/Wizard35";
import { Sheet2e, Wizard2e } from "../characters/Sheet2e";
import { SheetBf, WizardBf } from "../characters/SheetBf";
import { SheetMgt2 } from "../characters/SheetMgt2";
import { WizardMgt2 } from "../characters/WizardMgt2";
import { SheetAstra, WizardAstra } from "../characters/SheetAstra";
import { SheetCairn, WizardCairn } from "../characters/SheetCairn";
import { SheetFate, WizardFate } from "../characters/SheetFate";
import { SheetIronsworn, WizardIronsworn } from "../characters/SheetIronsworn";
import { SheetForged, WizardForged } from "../characters/SheetForged";
import { ScorePanel } from "../combat/ScorePanel";
import { FateStrip } from "../ui/FateStrip";
import { Wizard2eSetting, Wizard35Setting } from "./WizardSettings";

// The React side of the manifests: every Ref a manifest names ("cairn.sheet")
// and the component that is it (FG's windowclass by name; Foundry's
// registerSheet). scripts/check-manifests.mjs checks every Ref resolves here.

type SheetProps = { record: TableRecord; session: Session };
type WizardProps = { session: Session; onDone: (id: string | null) => void };
type SessionProps = { session: Session };

export const SHEETS: Record<string, ComponentType<SheetProps>> = {
  "cnc.sheet": CCSheet,
  "dnd5e.sheet": Sheet5e,
  "dnd35.sheet": Sheet35,
  "adnd2e.sheet": Sheet2e,
  "bfrpg.sheet": SheetBf,
  "mgt2.sheet": SheetMgt2,
  "astra.sheet": SheetAstra,
  "cairn.sheet": SheetCairn,
  "fate.sheet": SheetFate,
  "ironsworn.sheet": SheetIronsworn,
  "forged.sheet": SheetForged,
};
export const WIZARDS: Record<string, ComponentType<WizardProps>> = {
  "cnc.wizard": Wizard,
  "dnd5e.wizard": Wizard5e,
  "dnd35.wizard": Wizard35,
  "adnd2e.wizard": Wizard2e,
  "bfrpg.wizard": WizardBf,
  "mgt2.wizard": WizardMgt2,
  "astra.wizard": WizardAstra,
  "cairn.wizard": WizardCairn,
  "fate.wizard": WizardFate,
  "ironsworn.wizard": WizardIronsworn,
  "forged.wizard": WizardForged,
};
// Whole windows a game replaces (the tracker), desktop strips and Settings rows.
export const PANELS: Record<string, ComponentType<SessionProps>> = {
  "forged.scorePanel": ScorePanel,
  "fate.sceneAspects": FateStrip,
  "dnd35.wizardSetting": Wizard35Setting,
  "adnd2e.wizardSetting": Wizard2eSetting,
};

const refOf = (spec: RulesetManifest["sheet"] | RulesetManifest["wizard"]) => (typeof spec === "string" ? spec : "");

// The sheet for a character: its own game's (data.ruleset), C&C's when it has none.
export function sheetFor(record: TableRecord): ComponentType<SheetProps> {
  return SHEETS[refOf(rulesetOfRecord(record.data.ruleset).sheet)] ?? CCSheet;
}
// The character wizard of the campaign's game.
export function wizardFor(ruleset: string): ComponentType<WizardProps> {
  return WIZARDS[refOf(rulesetFor(ruleset).wizard)] ?? Wizard;
}
// The campaign's game (C&C's manifest for a name with none).
export const manifestOf = (ruleset: string) => rulesetFor(ruleset);
