// What may be dropped on a creature (a token, a tracker row, a sheet, a party
// row), as FG's drops on a creature: a chat roll (damage by its type, healing,
// an attack against its defence, an effect line), a sheet's action (an attack,
// a damage roll, a spell: rolled against that creature only), or an entry from
// the Effects list. Shared by every drop target so they all behave the same.
import type { RollDrop } from "../ui/ChatDock";

export const ROLL_DRAG = "application/x-kraken-roll";
// A sheet's action: { kind: "attack" | "damage" | "cast", recordId, weapon?, power? }
// (the sheets' buttons emit it after core-UI stage 3; the Cards window's card is the same idea).
export const ACTION_DRAG = "application/x-kraken-action";
// An Effects list entry: { preset } (a list id) or { effect: { label, duration, icon } }.
export const EFFECT_DRAG = "application/x-kraken-effect";
export const CREATURE_DROPS = [ROLL_DRAG, ACTION_DRAG, EFFECT_DRAG];

export type ActionDrop = { kind: "attack" | "damage" | "cast" | "use"; recordId?: string; entryId?: string; weapon?: string; power?: string; item?: string };
// An item used on the creature it is dropped on (a potion dragged from the sheet's Supplies: bookkeeping's use).
let itemUser: ((recordId: string, item: string, to: DropTarget) => void) | null = null;
export const setItemUser = (use: typeof itemUser) => {
  itemUser = use;
};
export type EffectDrop = { preset?: string; effect?: { label: string; duration?: number; icon?: string } };
// Where it lands: a tracker entry, a token or a character record.
export type DropTarget = { entryId?: string; tokenId?: string; recordId?: string };
type Senders = { ct: (action: string, payload?: Record<string, unknown>) => void; effects?: (action: string, payload?: Record<string, unknown>) => void; entryOfRecord?: (recordId: string) => string | undefined };

export const carriesCreatureDrop = (types: readonly string[]) => CREATURE_DROPS.some((type) => types.includes(type));

// Applies a drop to a creature. Returns false when the drag held none of these.
export function dropOnCreature(data: DataTransfer, to: DropTarget, send: Senders, gm: boolean): boolean {
  const read = <T>(type: string): T | null => {
    try {
      const raw = data.getData(type);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const effect = read<EffectDrop>(EFFECT_DRAG);
  if (effect && send.effects) {
    send.effects("apply", { to, ...(effect.preset ? { preset: effect.preset } : { effect: effect.effect }) });
    return true;
  }
  const roll = read<RollDrop>(ROLL_DRAG);
  if (roll && gm) {
    const target = to.entryId ? { targetId: to.entryId } : { tokenId: to.tokenId };
    if (roll.kind === "effect" && roll.label && send.effects) send.effects("apply", { to, effect: { label: roll.label } });
    else if (roll.card && (roll.kind === "damage" || roll.kind === "heal")) send.ct("apply-card", { card: roll.card, ...target, mult: 1 });
    else send.ct("apply-roll", { ...target, roll });
    return true;
  }
  const action = read<ActionDrop>(ACTION_DRAG);
  if (action?.kind === "use") {
    if (action.recordId && action.item) itemUser?.(action.recordId, action.item, to);
    return true;
  }
  if (action) {
    // FG's drop of an action on a creature: that creature becomes the only target, then it is rolled.
    const source = action.entryId ?? (action.recordId ? send.entryOfRecord?.(action.recordId) : undefined);
    if (source) {
      send.ct("clear-targets", { id: source });
      send.ct("target", { sourceId: source, ...(to.entryId ? { targetId: to.entryId } : { tokenId: to.tokenId }), on: true });
    }
    if (action.kind === "attack") send.ct("attack", { recordId: action.recordId, weapon: action.weapon });
    else if (action.kind === "damage") send.ct("damage-roll", { recordId: action.recordId, weapon: action.weapon });
    else if (action.kind === "cast") send.ct("cast", { recordId: action.recordId, power: action.power });
    return true;
  }
  return false;
}

// The drop handlers for an element that stands for a creature (a sheet's portrait).
type DropSession = { role: string | null; ct: Senders["ct"]; effects: NonNullable<Senders["effects"]>; combat: { entries: { id: string; recordId?: string | null }[] } };
export function creatureDrop(session: DropSession, to: DropTarget) {
  return {
    onDragOver: (event: { dataTransfer: DataTransfer; preventDefault: () => void }) => {
      if (carriesCreatureDrop([...event.dataTransfer.types])) event.preventDefault();
    },
    onDrop: (event: { dataTransfer: DataTransfer; preventDefault: () => void; stopPropagation: () => void }) => {
      if (!carriesCreatureDrop([...event.dataTransfer.types])) return;
      event.preventDefault();
      event.stopPropagation();
      dropOnCreature(event.dataTransfer, to, { ct: session.ct, effects: session.effects, entryOfRecord: (recordId) => session.combat.entries.find((item) => item.recordId === recordId)?.id }, session.role === "dm");
    },
  };
}
