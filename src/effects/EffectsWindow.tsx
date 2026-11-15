// The Effects window (FG's, from the sidebar): this game's conditions, buffs and
// debuffs, lights (a torch, a lantern, the Light spell; a flashlight and a
// glowstick in the modern games), and the GM's own effects kept in the
// campaign. Every entry drags onto a token, a tracker row, a sheet or a party
// row ("everything is a link"); a click puts it on the creature whose turn it
// is (the GM) or on your own character (a player). The GM makes, changes and
// deletes their own, and chooses what players may put on themselves.
import { useMemo, useState } from "react";
import type { Session } from "../session/useSession";
import { EffectGlyph } from "../table/TokenFx";
import { presetsFor } from "../../shared/actions/effects.mjs";
import { rulesetFor } from "../../shared/rulesets/registry.mjs";
import { EFFECT_DRAG, type DropTarget } from "./drops";
import "./effects.css";

type Item = { id: string; kind: string; label: string; icon: string; text: string; burn?: number | null; duration?: number; custom?: boolean; recordId?: string };
const GROUPS: [string, string][] = [
  ["condition", "Conditions"],
  ["buff", "Buffs"],
  ["debuff", "Debuffs"],
  ["light", "Lights"],
];
const ICONS = ["generic", "buff", "debuff", "light", "fire", "cold", "poison", "sleep", "fear", "stun", "paralysis", "charm", "blind", "deaf", "invisible", "prone", "restrained", "grappled", "entangled", "haste", "slow", "bleed", "confused", "stone", "concentration"];

export function EffectsWindow({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id?: string; label: string; kind: string; icon: string; duration: string; burn: string; text: string } | null>(null);
  const roundSeconds = rulesetFor(session.ruleset).actions?.roundSeconds ?? 6;
  const allowed = session.options.playerEffects ?? "conditions";
  const items: Item[] = useMemo(() => {
    const own = Object.values(session.records)
      .filter((record) => record.type === "effect")
      .map((record) => {
        const data = record.data as Record<string, unknown>;
        return { id: `custom:${record.id}`, recordId: record.id, kind: String(data.kind ?? "buff"), label: String(data.label ?? record.name), icon: String(data.icon || "generic"), text: String(data.text ?? ""), duration: Number(data.duration) || 0, burn: Number(data.burn) || null, custom: true };
      });
    return [...(presetsFor(rulesetFor(session.ruleset).actions) as Item[]), ...own];
  }, [session.records, session.ruleset]);
  const may = (item: Item) => gm || allowed === "all" || (allowed === "conditions" && (item.kind === "condition" || item.kind === "light")) || (allowed === "lights" && item.kind === "light");
  const shown = items.filter((item) => may(item) && (!search || item.label.toLowerCase().includes(search.toLowerCase()) || item.text.toLowerCase().includes(search.toLowerCase())));
  // A click's creature: the GM's whose turn it is; a player's own character (on the tracker, else its token).
  const clickTarget = (): DropTarget | null => {
    if (gm) return session.combat.active ? { entryId: session.combat.active } : null;
    const entry = session.combat.entries.find((item) => item.mine);
    if (entry) return { entryId: entry.id };
    const token = session.map.tokens.find((item) => item.mine);
    return token ? { tokenId: token.id } : null;
  };
  const time = (item: Item) => (item.kind === "light" ? (item.burn ? `burns ${item.burn >= 60 ? `${Math.round(item.burn / 60)} h` : `${item.burn} min`}` : "until put out") : item.duration ? `${item.duration} rounds` : "");

  return (
    <div className="effects-window" data-effects-window>
      <div className="effects-head">
        <input type="search" placeholder="Find an effect" aria-label="Find an effect" value={search} onChange={(event) => setSearch(event.target.value)} />
        {gm ? (
          <>
            <label className="effects-option" title="What players may put on their own characters from this list">
              Players may add{" "}
              <select aria-label="What players may add" value={allowed} onChange={(event) => session.setTableOptions({ playerEffects: event.target.value as "none" })}>
                <option value="none">nothing</option>
                <option value="lights">lights</option>
                <option value="conditions">lights and conditions</option>
                <option value="all">everything</option>
              </select>
            </label>
            <button type="button" className="effects-new" data-action="effect-new" onClick={() => setEditing({ label: "", kind: "buff", icon: "buff", duration: "10", burn: "", text: "" })}>
              New effect
            </button>
          </>
        ) : (
          <p className="muted">Drag one onto your character{allowed === "none" ? " (the GM has not allowed any)" : ""}.</p>
        )}
      </div>
      {editing ? (
        <form
          className="effects-edit"
          aria-label={editing.id ? "Change the effect" : "A new effect"}
          onSubmit={(event) => {
            event.preventDefault();
            session.effects("save", { effect: { id: editing.id, label: editing.label, kind: editing.kind, icon: editing.icon, duration: Number(editing.duration) || 0, burn: Number(editing.burn) || null, text: editing.text } });
            setEditing(null);
          }}
        >
          <label>
            Name and parts
            <input required placeholder="Hex; DMG: 1d6 necrotic" value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} aria-describedby="effect-parts-help" />
          </label>
          <small id="effect-parts-help" className="muted">
            Parts after the name, separated by ";": a condition (Prone), ATK: 1d4, SAVE: 2, AC: -2, DMG: 1d6 fire, RESIST: fire, LIGHT: 20/40 #ff9e3d flicker.
          </small>
          <div className="effects-edit-row">
            <label>
              Kind
              <select value={editing.kind} onChange={(event) => setEditing({ ...editing, kind: event.target.value })}>
                {GROUPS.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name.replace(/s$/, "")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Icon
              <select value={editing.icon} onChange={(event) => setEditing({ ...editing, icon: event.target.value })}>
                {ICONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rounds
              <input type="number" min={0} value={editing.duration} onChange={(event) => setEditing({ ...editing, duration: event.target.value })} />
            </label>
            {editing.kind === "light" ? (
              <label>
                Burns (minutes)
                <input type="number" min={0} value={editing.burn} onChange={(event) => setEditing({ ...editing, burn: event.target.value })} />
              </label>
            ) : null}
          </div>
          <label>
            What it does
            <input value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} />
          </label>
          <div className="effects-edit-row">
            <button type="submit">Save</button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {[...GROUPS, ["own", "Your own"] as [string, string]].map(([group, title]) => {
        const list = shown.filter((item) => (group === "own" ? item.custom : !item.custom && item.kind === group));
        if (!list.length) return null;
        return (
          <section key={group} className="effects-group" aria-label={title}>
            <h3>{title}</h3>
            <ul>
              {list.map((item) => (
                <li
                  key={item.id}
                  className={`effects-item kind-${item.kind}`}
                  data-effect-preset={item.id}
                  draggable
                  title={`${item.text}${time(item) ? ` (${time(item)})` : ""}. Drag it onto a token, a tracker row, a sheet or a party row.`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(EFFECT_DRAG, JSON.stringify({ preset: item.id }));
                    event.dataTransfer.setData("text/plain", item.label);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <button
                    type="button"
                    className="effects-apply"
                    onClick={() => {
                      const to = clickTarget();
                      if (to) session.effects("apply", { to, preset: item.id });
                    }}
                    title={gm ? "Put it on the creature whose turn it is (or drag it onto anyone)" : "Put it on your character"}
                  >
                    <EffectGlyph icon={item.icon} size={18} />
                    <span>{item.label.split(";")[0]}</span>
                    {time(item) ? <small>{time(item)}</small> : null}
                  </button>
                  {gm && item.custom ? (
                    <>
                      <button type="button" className="icon-button" aria-label={`Change ${item.label.split(";")[0]}`} title="Change it" onClick={() => setEditing({ id: item.id, label: item.label, kind: item.kind, icon: item.icon, duration: String(item.duration ?? 0), burn: item.burn ? String(item.burn) : "", text: item.text })}>
                        ✎
                      </button>
                      <button type="button" className="icon-button" aria-label={`Delete ${item.label.split(";")[0]}`} title="Delete it" onClick={() => session.effects("delete", { id: item.recordId })}>
                        ✕
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="muted effects-foot">A round here is {roundSeconds} seconds of game time: lights burn down as the calendar moves on, and round by round in a fight.</p>
    </div>
  );
}
