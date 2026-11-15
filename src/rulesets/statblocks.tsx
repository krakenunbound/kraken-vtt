import type { ComponentType } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { rulesetNamed } from "../../shared/rulesets/registry.mjs";
import { NpcMgt2 } from "../characters/NpcMgt2";

// A record type's own stat block in the record window (the manifest's
// records.<type>.statblock): Traveller's NPC block. Kept apart from
// src/rulesets/index.tsx so the record window does not pull in every sheet.
export const STATBLOCKS: Record<string, ComponentType<{ session: Session; record: TableRecord }>> = {
  "mgt2.npcBlock": NpcMgt2,
};

// The block that replaces the core's for this record type in this game, or null.
export function statblockFor(ruleset: string, type: string) {
  const ref = rulesetNamed(ruleset)?.records?.[type]?.statblock;
  return ref ? (STATBLOCKS[ref] ?? null) : null;
}
// A record type's word in this game (FG's per-ruleset record names), or undefined.
export const recordLabel = (ruleset: string, type: string) => rulesetNamed(ruleset)?.records?.[type]?.label;
