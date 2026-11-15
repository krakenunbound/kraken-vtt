import { itemSlots } from "../../shared/cairn/rules.mjs";
import { num, useSheet, type Row } from "../core/sheet/context";
import { listOf, rowFor, tablesOf, type WizardContext } from "../core/wizard/context";

// Cairn's own parts, where no core part fits (docs/core-ui-design.md 4.4,
// level 3): the rest strip. Everything else on the Cairn sheet is the core's,
// laid out by shared/cairn/manifest.mjs.

// Rest and recovery: a short rest, a night's rest, a week's rest, Deprived,
// and Stabilize while dying. The owner's and the GM's.
export function CairnRest() {
  const { data, editable, act } = useSheet();
  if (!editable) return null;
  const cairn = (action: string, args?: Record<string, unknown>) => act({ message: "cairn", action, args });
  return (
    <section className="cc-panel cc-row five-strip" aria-label="Rest">
      <button type="button" data-action="cairn-rest" title="A few moments' rest and a drink of water: HP back (not while deprived)" onClick={() => cairn("rest")}>
        Short rest
      </button>
      <button type="button" data-action="cairn-sleep" title="A full night's rest in a safe spot: HP back and every Fatigue gone" onClick={() => cairn("sleep")}>
        Night's rest
      </button>
      <button type="button" data-action="cairn-recover" title="A week's rest with a healer: STR, DEX and WIL back to their maximum" onClick={() => cairn("recover")}>
        A week's rest
      </button>
      <label className="cc-inline" title="Deprived: lacking food, water or rest. No recovery of HP, attributes or Fatigue.">
        <input type="checkbox" checked={Boolean(num(data.deprived))} data-action="cairn-deprived" onChange={(event) => cairn("deprived", { on: event.target.checked })} /> Deprived
      </label>
      {data.critical === "dying" ? (
        <button type="button" data-action="cairn-stabilize" title="Aid (bandages): stable, out of danger" onClick={() => cairn("stabilize")}>
          Stabilize
        </button>
      ) : null}
    </section>
  );
}

// An item's slots, as the rules count them (bulky 2, petty 0).
export const cairnItemSlots = (item: Record<string, unknown>) => {
  const slots = itemSlots(item);
  return `${slots} slot${slots === 1 ? "" : "s"}`;
};

// The wizard's own rules (shared/cairn/manifest.mjs wizard):
// A background rolled on the d20 table: its row names one (spelled loosely: "Barber-surgeon"), or the roll counts down the list.
export const cairnBackgroundOfRoll = (total: number, names: string[], text: string) => {
  const picked = text || names[(total - 1) % names.length];
  const loose = (name: string) => name.replace(/[-\s]/g, "").toLowerCase();
  return names.find((name) => name.toLowerCase() === picked.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ")) ?? names.find((name) => loose(name) === loose(picked));
};
// The gold a background's table results bring ("+20 gp", "take 10 gp", "an extra 5 gp").
export const cairnBackgroundGold = (spec: Row, wizard: WizardContext) => {
  const results = (spec.results ?? {}) as Row;
  return tablesOf(wizard.chosen("background"), "tables").reduce((sum, table, index) => {
    const match = /(?:\+\s*|take\s+|extra\s+)(\d+)\s*gp\b/i.exec(rowFor(table, results[index])?.text ?? "");
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
};
// What build-character takes (kraken_build_character's Cairn spec): the name (else the background's first), each table's roll, the cart.
export const cairnBuild = (spec: Row, wizard: WizardContext) => {
  const chosen = wizard.chosen("background");
  if (!chosen || !spec.attributes) return null;
  const results = (spec.results ?? {}) as Row;
  return {
    name: String(spec.name ?? "") || listOf(chosen.data.names)[0] || chosen.name,
    background: chosen.name,
    attributes: spec.attributes,
    hp: spec.hp ?? 0,
    age: spec.age ?? 0,
    gold: spec.gold ?? 0,
    traits: spec.traits ?? {},
    bond: spec.bond ?? "",
    omen: spec.omen ?? "",
    results: tablesOf(chosen, "tables").map((_, index) => ({ table: index, roll: results[index] })),
    buy: Object.entries((spec.buy ?? {}) as Record<string, number>),
  };
};
