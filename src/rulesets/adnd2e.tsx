import { classKey } from "../../shared/adnd2e/rules.mjs";
import { type Row } from "../core/sheet/context";

// AD&D 2E's formatter (docs/core-ui-design.md 4.4, level 3): a class's key for
// its level's data-stat. The sheet is the core's parts, arranged its own way by
// shared/adnd2e/manifest.mjs; what each ability's table gives at its score is
// there too, as small boxes (ABILITY_BOXES).

export const adnd2eClassKey = (row: Row) => classKey(String(row.name));
