// The buff and debuff bar (an MMO's, on FG's effects): a creature's effects as
// icons with the rounds left, the tooltip saying what each does, who put it on
// and how long it has; a click opens its menu (put a light out or light it
// again, take it off; the GM also changes its time); + puts one on from the
// Effects list. Shown on the sheet frame and the tracker row: a player sees
// their own creatures', the GM everyone's. It takes drops like a token does.
import { useId, useRef, type ReactNode } from "react";
import type { Session, TrackedEffect } from "../session/useSession";
import { EffectGlyph } from "../table/TokenFx";
import { lightOf, presetsFor, visualOf } from "../../shared/actions/effects.mjs";
import { rulesetFor } from "../../shared/rulesets/registry.mjs";
import { carriesCreatureDrop, dropOnCreature, EFFECT_DRAG, type DropTarget } from "./drops";
import "./effects.css";

// A popover anchored to its button (CSS anchor positioning where the browser has it,
// else placed under the button when it opens), opened by the button's command (or, in a
// browser without invoker commands, by a click).
export function Pop({ label, button, className, children }: { label: string; button: ReactNode; className?: string; children: ReactNode }) {
  const id = `pop-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        {...({ commandfor: id, command: "toggle-popover" } as Record<string, string>)}
        onClick={() => {
          if (!("command" in HTMLButtonElement.prototype)) ref.current?.togglePopover();
        }}
      >
        {button}
      </button>
      <div
        ref={ref}
        id={id}
        className="effect-pop"
        {...({ popover: "auto" } as Record<string, string>)}
        onToggle={(event) => {
          const open = (event as unknown as { newState?: string }).newState === "open";
          // No anchor positioning: under the button, kept on the screen.
          if (open && ref.current && trigger.current && !CSS.supports("position-area: block-end")) {
            const at = trigger.current.getBoundingClientRect();
            ref.current.style.position = "fixed";
            ref.current.style.margin = "0";
            ref.current.style.left = `${Math.max(4, Math.min(window.innerWidth - ref.current.offsetWidth - 4, at.left))}px`;
            ref.current.style.top = `${Math.min(window.innerHeight - ref.current.offsetHeight - 4, at.bottom + 4)}px`;
          }
        }}
      >
        {children}
      </div>
    </>
  );
}

// Who the bar is for: a tracker entry, a token, or a character (its entry, else its token).
function effectsFor(session: Session, at: DropTarget): { list: TrackedEffect[]; to: DropTarget; mine: boolean } | null {
  const entry = at.entryId ? session.combat.entries.find((item) => item.id === at.entryId) : at.recordId ? session.combat.entries.find((item) => item.recordId === at.recordId) : null;
  if (entry) return { list: entry.effects ?? [], to: { entryId: entry.id }, mine: session.role === "dm" || Boolean(entry.mine) };
  const token = at.tokenId ? session.map.tokens.find((item) => item.id === at.tokenId) : at.recordId ? session.map.tokens.find((item) => item.recordId === at.recordId) : null;
  if (token) return { list: token.effects?.list ?? [], to: { tokenId: token.id }, mine: session.role === "dm" || token.mine };
  return null;
}

export function BuffBar({ session, at, compact = false }: { session: Session; at: DropTarget; compact?: boolean }) {
  const found = effectsFor(session, at);
  if (!found || !found.mine) return null;
  const { list, to } = found;
  const gm = session.role === "dm";
  const presets = presetsFor(rulesetFor(session.ruleset).actions);
  const allowed = session.options.playerEffects ?? "conditions";
  const offered = presets.filter((item) => gm || allowed === "all" || (allowed === "conditions" && (item.kind === "condition" || item.kind === "light")) || (allowed === "lights" && item.kind === "light"));
  return (
    <div
      className={compact ? "buff-bar compact" : "buff-bar"}
      role="group"
      aria-label="Effects"
      data-buff-bar={to.entryId ?? to.tokenId}
      onDragOver={(event) => {
        if (carriesCreatureDrop([...event.dataTransfer.types])) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dropOnCreature(event.dataTransfer, to, { ct: session.ct, effects: session.effects }, gm);
      }}
    >
      {list.map((effect) => {
        const badge = visualOf([effect]).badges[0];
        const light = lightOf(effect.label);
        const name = effect.label.split(";")[0].trim();
        return (
          <Pop
            key={effect.id}
            label={badge?.title ?? name}
            className={`buff tone-${badge?.tone ?? "neutral"}${effect.paused ? " paused" : ""}`}
            button={
              <>
                <EffectGlyph icon={badge?.icon ?? "generic"} size={compact ? 14 : 18} />
                {effect.duration > 0 ? <small className="buff-rounds">{effect.duration > 99 ? `${Math.round((effect.duration * (rulesetFor(session.ruleset).actions?.roundSeconds ?? 6)) / 60)}m` : effect.duration}</small> : null}
              </>
            }
          >
            <div className="effect-pop-body" data-effect={effect.id}>
              <b>{name}</b>
              <p>{badge?.title}</p>
              {effect.source ? <p className="muted">From {effect.source}</p> : null}
              <div className="effect-pop-actions">
                {light ? (
                  <button type="button" data-action={effect.paused ? "relight" : "snuff"} onClick={() => session.effects(effect.paused ? "relight" : "snuff", { to, effectId: effect.id })}>
                    {effect.paused ? "Light it again" : "Put it out"}
                  </button>
                ) : null}
                {gm ? (
                  <label>
                    Rounds{" "}
                    <input
                      type="number"
                      min={0}
                      defaultValue={effect.duration}
                      aria-label={`${name}: rounds left`}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                        session.effects("update", { to, effectId: effect.id, patch: { duration: Number((event.target as HTMLInputElement).value) || 0 } });
                      }}
                    />
                  </label>
                ) : null}
                <button type="button" data-action="effect-remove" onClick={() => session.effects("remove", { to, effectId: effect.id })}>
                  Take it off
                </button>
              </div>
            </div>
          </Pop>
        );
      })}
      {offered.length ? (
        <Pop label="Put on an effect" className="buff add" button={<span aria-hidden="true">+</span>}>
          <div className="effect-pop-body effect-pick" role="list">
            {offered.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                data-preset={item.id}
                draggable
                onDragStart={(event) => (event.dataTransfer.setData(EFFECT_DRAG, JSON.stringify({ preset: item.id })), event.dataTransfer.setData("text/plain", item.label))}
                title={item.text}
                onClick={() => session.effects("apply", { to, preset: item.id })}
              >
                <EffectGlyph icon={item.icon} size={16} /> {item.label.split(";")[0]}
              </button>
            ))}
          </div>
        </Pop>
      ) : null}
    </div>
  );
}
