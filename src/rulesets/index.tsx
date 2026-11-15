import type { ComponentType } from "react";
import type { Session, TableRecord } from "../session/useSession";
import type { RulesetManifest } from "../../shared/rulesets/types";
import { rulesetFor, rulesetOfRecord } from "../../shared/rulesets/registry.mjs";
import { CCSheet } from "../characters/CCSheet";
import { Wizard } from "../characters/Wizard";
import { Wizard5e } from "../characters/Wizard5e";
import { Wizard35 } from "../characters/Wizard35";
import { Wizard2e } from "../characters/Wizard2e";
import { WizardBf } from "../characters/WizardBf";
import { WizardMgt2 } from "../characters/WizardMgt2";
import { WizardAstra } from "../characters/WizardAstra";
import { SheetFate, WizardFate } from "../characters/SheetFate";
import { SheetIronsworn, WizardIronsworn } from "../characters/SheetIronsworn";
import { SheetForged, WizardForged } from "../characters/SheetForged";
import { ScorePanel } from "../combat/ScorePanel";
import { FateStrip } from "../ui/FateStrip";
import { FateConflict } from "./fate";
import { Wizard2eSetting, Wizard35Setting } from "./WizardSettings";
import { SheetRenderer } from "../core/sheet/SheetRenderer";
import { WizardRenderer } from "../core/wizard/WizardRenderer";
import { CUSTOM_PARTS, FORMATS, WIZARD_FUNCTIONS } from "./parts";

// The React side of the manifests: every Ref a manifest names ("cairn.sheet")
// and the component that is it (FG's windowclass by name; Foundry's
// registerSheet). scripts/check-manifests.mjs checks every Ref resolves here.

type SheetProps = { record: TableRecord; session: Session };
type WizardProps = { session: Session; onDone: (id: string | null) => void };
type SessionProps = { session: Session };

export const SHEETS: Record<string, ComponentType<SheetProps>> = {
  "cnc.sheet": CCSheet,
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
  "fate.wizard": WizardFate,
  "ironsworn.wizard": WizardIronsworn,
  "forged.wizard": WizardForged,
};
// Whole windows a game replaces (the tracker), desktop strips, the tracker's header controls and Settings rows.
export const PANELS: Record<string, ComponentType<SessionProps>> = {
  "forged.scorePanel": ScorePanel,
  "fate.sceneAspects": FateStrip,
  "fate.conflict": FateConflict,
  "dnd35.wizardSetting": Wizard35Setting,
  "adnd2e.wizardSetting": Wizard2eSetting,
};

const refOf = (spec: RulesetManifest["sheet"] | RulesetManifest["wizard"]) => (typeof spec === "string" ? spec : "");

// A sheet the manifest lays out (its sheet is a SheetSpec, not a Ref): the core's parts in the core's frame.
function ManifestSheet({ record, session }: SheetProps) {
  const manifest = rulesetOfRecord(record.data.ruleset);
  if (typeof manifest.sheet === "string") return null;
  return <SheetRenderer spec={manifest.sheet} record={record} session={session} ruleset={manifest.id} custom={CUSTOM_PARTS} formats={FORMATS} words={manifest.labels} features={manifest.features} />;
}

// The sheet for a character: its own game's (data.ruleset), C&C's when it has none.
export function sheetFor(record: TableRecord): ComponentType<SheetProps> {
  const spec = rulesetOfRecord(record.data.ruleset).sheet;
  if (typeof spec !== "string") return ManifestSheet;
  return SHEETS[spec] ?? CCSheet;
}
// The character wizard of the campaign's game.
export function wizardFor(ruleset: string): ComponentType<WizardProps> {
  const spec = rulesetFor(ruleset).wizard;
  if (spec && typeof spec !== "string") return ManifestWizard;
  return WIZARDS[refOf(spec)] ?? Wizard;
}
// A wizard the manifest lays out (its wizard is a WizardSpec): the core's frame and parts.
function ManifestWizard({ session, onDone }: WizardProps) {
  const spec = rulesetFor(session.ruleset).wizard;
  if (!spec || typeof spec === "string") return null;
  return <WizardRenderer spec={spec} session={session} onDone={onDone} functions={WIZARD_FUNCTIONS} />;
}
// The campaign's game (C&C's manifest for a name with none).
export const manifestOf = (ruleset: string) => rulesetFor(ruleset);
