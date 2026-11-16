import { useState } from "react";
import type { Session } from "../session/useSession";
import { keysFor, stackFor } from "../../shared/rulesets/modifiers.mjs";
import { rulesetFor } from "../../shared/rulesets/registry.mjs";
import { EFFECT_DRAG, ROLL_DRAG } from "../effects/drops";

// A number dragged onto the modifier box (FG's drag of a number): { value, label }.
export const NUMBER_DRAG = "application/x-kraken-number";

// What a drop on the box adds: a number, a chat roll's total, an effect's number
// ("Bless; ATK: 1d4" has none, "Aid; ATK: 2" has 2), or typed words such as "+2 Flanking".
function numberFrom(data: DataTransfer): { value: number; label: string } | null {
  const read = <T,>(type: string): T | null => {
    try {
      const raw = data.getData(type);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };
  const number = read<{ value: number; label?: string }>(NUMBER_DRAG);
  if (number && Number.isFinite(Number(number.value))) return { value: Math.round(Number(number.value)), label: String(number.label ?? "") };
  const roll = read<{ total?: number; name?: string }>(ROLL_DRAG);
  if (roll && Number.isFinite(Number(roll.total))) return { value: Math.round(Number(roll.total)), label: String(roll.name ?? "") };
  const effect = read<{ effect?: { label?: string } }>(EFFECT_DRAG);
  const words = effect?.effect?.label ?? data.getData("text/plain");
  const found = /([+-]?\d+)(?!\s*d)/.exec(String(words ?? "").replace(/\d+d\d+/gi, ""));
  if (!found) return null;
  const value = Number(found[1]);
  if (!Number.isFinite(value) || Math.abs(value) > 999) return null;
  const label = String(words).replace(found[0], "").replace(/[;:]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return { value, label };
}

// FG's modifier box beside the dice tray, kept by the host for this seat: its
// total, the labelled slots above it (six at most; right-click one to take it
// off), the wheel or the buttons for its own number, a right-click for quick
// values, and a number, a roll or an effect dropped on it adds a slot. Every
// roll this seat starts next reads it, then it clears.
export function ModifierBox({ session, onMenu }: { session: Session; onMenu: (x: number, y: number) => void }) {
  const stack = session.modifiers;
  const [over, setOver] = useState(false);
  if (!stackFor(rulesetFor(session.ruleset)).on) return null;
  const named = stack.slots.filter((slot) => slot.label).reduce((sum, slot) => sum + slot.value, 0);
  // The box's own number is its unnamed slot: the total less the named ones.
  const setTotal = (total: number) => session.modify({ action: "set", value: total - named });
  return (
    <div
      className={["modifier-box", stack.total || stack.slots.length ? "set" : "", over ? "drop" : ""].filter(Boolean).join(" ")}
      data-modifier-total={stack.total}
      title="Modifier for the next roll (FG's modifier box): every roll you start next reads it, then it clears. The wheel or the buttons change it; drop a number, a roll or an effect on it to add one; a right-click picks one"
      onWheel={(event) => setTotal(stack.total + (event.deltaY < 0 ? 1 : -1))}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
      onDragOver={(event) => {
        const types = [...event.dataTransfer.types];
        if (![NUMBER_DRAG, ROLL_DRAG, EFFECT_DRAG, "text/plain"].some((type) => types.includes(type))) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const found = numberFrom(event.dataTransfer);
        if (!found) return;
        event.preventDefault();
        event.stopPropagation();
        session.modify({ action: "add", value: found.value, label: found.label });
      }}
    >
      {stack.slots.length ? (
        <ul className="modifier-slots" aria-label="Modifiers on the next roll">
          {stack.slots.map((slot, index) => (
            <li
              key={`${index}-${slot.label}-${slot.value}`}
              data-modifier-slot={index}
              title="Right-click to take it off"
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                session.modify({ action: "remove", index });
              }}
            >
              <b>{slot.value > 0 ? `+${slot.value}` : slot.value}</b> {slot.label || "Modifier"}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" aria-label="Modifier down" onClick={() => setTotal(stack.total - 1)}>
        −
      </button>
      <span className="modifier-value">
        <input aria-label="Modifier" type="number" value={stack.total} onChange={(event) => setTotal(Math.round(Number(event.target.value) || 0))} />
        <small>Modifier</small>
      </span>
      <button type="button" aria-label="Modifier up" onClick={() => setTotal(stack.total + 1)}>
        +
      </button>
    </div>
  );
}

// The game's keys beside the box (FG's modifier window: ADV, DIS, +2, -2; 5E's
// cover and damage keys), each on until the next roll that reads it.
export function ModifierKeys({ session }: { session: Session }) {
  const keys = keysFor(rulesetFor(session.ruleset));
  // The GM's own modifiers (FG's Modifiers window): a click puts its number in the box.
  const presets = session.options.modifierPresets ?? [];
  if (!keys.length && !presets.length) return null;
  return (
    <div className="modifier-keys" role="group" aria-label="Modifier keys for the next roll">
      {keys.map((key) => {
        const on = session.modifiers.keys.includes(key.id);
        return (
          <button key={key.id} type="button" data-modifier-key={key.id} aria-pressed={on} title={`${key.tip}. Used by the next roll that reads it.`} onClick={() => session.modify({ action: "key", key: key.id, on: !on })}>
            {key.label}
          </button>
        );
      })}
      {presets.map((preset) => (
        <button key={preset.label} type="button" className="modifier-preset" data-modifier-preset={preset.label} title={`${preset.label}: ${preset.value >= 0 ? "+" : ""}${preset.value} into the modifier box`} onClick={() => session.modify({ action: "add", value: preset.value, label: preset.label })}>
          {preset.label} {preset.value >= 0 ? "+" : ""}
          {preset.value}
        </button>
      ))}
    </div>
  );
}
