import { itemSlots } from "../../shared/cairn/rules.mjs";
import { num, useSheet } from "../core/sheet/context";

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
