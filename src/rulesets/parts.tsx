import type { CustomPart, Format } from "../core/parts/Parts";
import { CairnRest, cairnItemSlots } from "./cairn";

// The level-3 parts a manifest places inside the core frame ({ part: "custom",
// component: "<ruleset>.<name>" }) and the formatters a list's details name
// ({ format: "<ruleset>.<name>" }). scripts/check-manifests.mjs checks every
// Ref a manifest names is one of these (or a component in index.tsx).
export const CUSTOM_PARTS: Record<string, CustomPart> = {
  "cairn.restStrip": CairnRest,
};
export const FORMATS: Record<string, Format> = {
  "cairn.itemSlots": cairnItemSlots,
};
