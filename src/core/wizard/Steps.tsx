import { useState, type ReactNode } from "react";
import type { WizardPart, WizardStep } from "../../../shared/rulesets/types";
import { at, holds, num, type Row } from "../sheet/context";
import { listOf, rowFor, tablesOf, useWizard, type WizardContext } from "./context";

// The wizard's parts (docs/core-ui-design.md 4.2, as built in 7.8). Each
// writes into the spec at its `into`; a roll button is the host's dice and is
// greyed while a roll is out and once its result is in.

// A game's own logic a part names (a Ref): how a table's result names a record, money a choice brings, the build.
export type WizardFunctions = {
  picks: Record<string, (total: number, names: string[], text: string) => string | undefined>;
  bonuses: Record<string, (spec: Row, wizard: WizardContext) => number>;
  builds: Record<string, (spec: Row, wizard: WizardContext) => Record<string, unknown> | null>;
};
export type Ware = { name: string; price: number; kind: string };

// "{value}", "{label}" and the like, filled in.
const words = (template: string, values: Record<string, unknown>) => template.replace(/\{([a-z]+)\}/g, (whole, key: string) => (key in values ? String(values[key] ?? "") : whole));
// A text with "{path}" values, as separate text nodes (the literal words and each value), as JSX writes them.
function pieces(template: string, read: (path: string) => unknown): string[] {
  const out: string[] = [];
  template.split(/(\{[^{}]+\})/).forEach((piece, index) => {
    if (index % 2 === 0) {
      if (piece) out.push(piece);
      return;
    }
    const value = read(piece.slice(1, -1));
    out.push(typeof value === "string" || typeof value === "number" ? String(value) : listOf(value).join(", "));
  });
  return out;
}
const scopeOf = (wizard: WizardContext) => ({ data: wizard.spec });

// The step: its number and title (and the words its condition adds), then its parts.
export function StepView({ step, number, functions }: { step: WizardStep; number: number; functions: WizardFunctions }) {
  const wizard = useWizard();
  return (
    <>
      <h4>
        {`${number}. ${step.title}`}
        {step.more ? (holds(step.more.when, scopeOf(wizard), { gm: false, editable: true }) ? step.more.text : "") : null}
      </h4>
      {step.parts.map((part, index) => (
        <WizardPartView key={index} part={part} functions={functions} />
      ))}
    </>
  );
}

export function WizardPartView({ part, functions }: { part: WizardPart; functions: WizardFunctions }) {
  const wizard = useWizard();
  if (!holds(part.when, scopeOf(wizard), { gm: false, editable: true })) return null;
  const { busy, get, set, roll } = wizard;
  switch (part.kind) {
    case "row":
      return (
        <div className="cc-inline">
          {part.parts.map((inner, index) => (
            <WizardPartView key={index} part={inner} functions={functions} />
          ))}
        </div>
      );
    case "choose-record": {
      const options = wizard.recordsOf(part.fromType);
      const reset = Object.fromEntries((part.resets ?? []).map((path) => [path, undefined]));
      const pick = part.roll ? functions.picks[part.roll.pick] : undefined;
      return (
        <div className="cc-inline">
          <select value={String(get(part.into) ?? "")} aria-label={part.aria} onChange={(event) => set({ [part.into]: event.target.value, ...reset })}>
            <option value="">{part.placeholder}</option>
            {options.map((item) => (
              <option key={item.id}>{item.name}</option>
            ))}
          </select>
          {part.roll ? (
            <button
              type="button"
              data-action={part.roll.hook}
              disabled={busy}
              title={part.roll.title}
              onClick={() =>
                void roll(part.roll!.formula, part.roll!.label).then((total) => {
                  if (!total || !pick) return;
                  const name = pick(total, options.map((item) => item.name), wizard.lookup(part.roll!.table, total));
                  if (name) set({ [part.into]: name, ...reset });
                })
              }
            >
              {part.roll.button}
            </button>
          ) : null}
        </div>
      );
    }
    case "text": {
      const value = String(get(part.into) ?? "");
      const list = part.options ? listOf(at(wizard.chosen(part.options.record)?.data, part.options.list)) : [];
      return (
        <label className="cc-inline">
          {part.label}
          {part.options ? (
            <select value={value} aria-label={part.aria} onChange={(event) => set({ [part.into]: event.target.value })}>
              <option value="">{part.placeholder}</option>
              {list.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          ) : null}
          {part.free ? <input value={value} aria-label={part.free.aria} placeholder={part.free.placeholder} onChange={(event) => set({ [part.into]: event.target.value })} /> : null}
        </label>
      );
    }
    case "record-tables": {
      const record = wizard.chosen(part.record);
      const results = (get(part.into) ?? {}) as Row;
      return (
        <>
          {tablesOf(record, part.path).map((table, index) => {
            const row = rowFor(table, results[index]);
            return (
              <div key={table.name} className={part.className} {...(part.attr ? { [`data-${part.attr}`]: index } : {})}>
                <b>{table.name}</b>{" "}
                <button
                  type="button"
                  data-action={`${part.hook}${index}`}
                  disabled={busy || Boolean(results[index])}
                  onClick={() => void roll(part.formula, words(part.label, { record: record?.name, table: table.name })).then((total) => total && set((now) => ({ [part.into]: { ...((now[part.into] ?? {}) as Row), [index]: total } })))}
                >
                  {results[index] ? words(part.done, { value: results[index] }) : part.button}
                </button>
                {row ? <p className="hint">{row.text}</p> : null}
              </div>
            );
          })}
        </>
      );
    }
    case "roll": {
      const value = get(part.into);
      return (
        <button type="button" data-action={part.hook} disabled={busy || Boolean(value)} title={part.title} onClick={() => void roll(part.formula, part.label).then((total) => total && set({ [part.into]: part.table ? wizard.lookup(part.table, total) : total }))}>
          {value && part.done ? words(part.done, { value }) : part.button}
        </button>
      );
    }
    case "roll-table": {
      const value = (get(part.into) ?? {}) as Row;
      return (
        <button
          type="button"
          data-action={part.hook}
          disabled={busy || part.rows.every((row) => value[row.key])}
          title={part.title}
          onClick={() =>
            void wizard.many(async (roller) => {
              const out: Record<string, string> = {};
              for (const row of part.rows) out[row.key] = wizard.lookup(words(part.table, { key: row.key }), await roller(part.formula, words(part.label, { label: row.label })));
              set({ [part.into]: out });
            })
          }
        >
          {part.button}
        </button>
      );
    }
    case "roll-stats":
      return <RollStats part={part} />;
    case "check":
      return (
        <label className="cc-inline" title={part.title}>
          <input type="checkbox" checked={Boolean(get(part.into))} onChange={(event) => set({ [part.into]: event.target.checked })} />
          {` ${part.label}`}
        </label>
      );
    case "shop":
      return <Shop part={part} functions={functions} />;
    case "hint": {
      let text: ReactNode;
      if (part.join) {
        const values = (get(part.join.path) ?? {}) as Row;
        text = part.join.rows.map((row) => words(part.join!.text, { label: row.label, value: values[row.key] })).join(part.join.sep);
      } else if (part.record) {
        const record = wizard.chosen(part.record);
        if (!record) return null;
        text = pieces(part.text ?? "", (path) => at(record.data, path));
      } else text = pieces(part.text ?? "", get);
      return (
        <p className="hint" {...(part.attr ? { [`data-${part.attr}`]: true } : {})}>
          {text}
        </p>
      );
    }
  }
}

// Scores rolled in order, then (once) two of them swapped.
function RollStats({ part }: { part: Extract<WizardPart, { kind: "roll-stats" }> }) {
  const { busy, get, set, many } = useWizard();
  const scores = get(part.into) as Record<string, number> | undefined;
  const [swapped, setSwapped] = useState(false);
  const [swapA, setSwapA] = useState(part.swap?.start[0] ?? "");
  const [swapB, setSwapB] = useState(part.swap?.start[1] ?? "");
  return (
    <>
      <button
        type="button"
        data-action={part.hook}
        disabled={busy || Boolean(scores)}
        title={part.title}
        onClick={() =>
          void many(async (roller) => {
            const out: Record<string, number> = {};
            for (const stat of part.stats) out[stat.key] = await roller(part.formula, words(part.label, { label: stat.label }));
            set({ [part.into]: out });
          })
        }
      >
        {part.button}
      </button>
      {scores
        ? part.stats.map((stat) => (
            <span key={stat.key} className="cc-box" data-wizard-score={stat.key}>
              {stat.short} <b>{scores[stat.key]}</b>
            </span>
          ))
        : null}
      {scores && part.swap && !swapped ? (
        <span className="cc-inline" title={part.swap.title}>
          <select aria-label={part.swap.aria[0]} value={swapA} onChange={(event) => setSwapA(event.target.value)}>
            {part.stats.map((stat) => (
              <option key={stat.key} value={stat.key}>
                {stat.short}
              </option>
            ))}
          </select>
          ↔
          <select aria-label={part.swap.aria[1]} value={swapB} onChange={(event) => setSwapB(event.target.value)}>
            {part.stats.map((stat) => (
              <option key={stat.key} value={stat.key}>
                {stat.short}
              </option>
            ))}
          </select>
          <button type="button" data-action={part.swap.hook} disabled={swapA === swapB} onClick={() => (set({ [part.into]: { ...scores, [swapA]: scores[swapB], [swapB]: scores[swapA] } }), setSwapped(true))}>
            {part.swap.button}
          </button>
        </span>
      ) : null}
    </>
  );
}

// What a shop holds and what its buyer has left: the purse rolled (plus what a choice brings), less the cart.
export function moneyOf(part: Extract<WizardPart, { kind: "shop" }>, wizard: WizardContext, functions: WizardFunctions, wares: Ware[]) {
  const gold = num(wizard.get(part.gold.into));
  const bonus = part.gold.bonus ? (functions.bonuses[part.gold.bonus]?.(wizard.spec, wizard) ?? 0) : 0;
  const cart = (wizard.get(part.into) ?? {}) as Record<string, number>;
  const purse = gold + bonus;
  const spent = Object.entries(cart).reduce((sum, [ware, count]) => sum + (wares.find((item) => item.name === ware)?.price ?? 0) * count, 0);
  return { gold, bonus, cart, purse, spent, left: purse - spent };
}

function Shop({ part, functions }: { part: Extract<WizardPart, { kind: "shop" }>; functions: WizardFunctions }) {
  const wizard = useWizard();
  const { busy, set, roll } = wizard;
  const wares = wizard.wares[part.into] ?? [];
  const { gold, bonus, cart, purse, spent, left } = moneyOf(part, wizard, functions, wares);
  const [search, setSearch] = useState("");
  const unit = part.price.unit;
  return (
    <>
      <div className="cc-inline">
        <button type="button" data-action={part.gold.hook} disabled={busy || Boolean(gold)} title={part.gold.title} onClick={() => void roll(part.gold.formula, part.gold.label).then((total) => total && set({ [part.gold.into]: total }))}>
          {gold && part.gold.done ? words(part.gold.done, { value: gold }) : part.gold.button}
        </button>
        <span>
          Purse {purse}
          {` ${unit}`}
          {bonus && part.gold.bonusText ? words(part.gold.bonusText, { value: bonus }) : ""} · spent {spent} · <b data-coin-left={left}>
            {left}
            {` ${unit} left`}
          </b>
        </span>
      </div>
      <input aria-label={part.search.aria} placeholder={part.search.placeholder} value={search} onChange={(event) => setSearch(event.target.value)} />
      <ul className="life-shop">
        {wares
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, part.limit)
          .map((item) => (
            <li key={item.name}>
              <span>
                {item.name} <small className="hint">
                  {item.price}
                  {` ${unit}`}
                  {item.kind ? ` · ${item.kind}` : ""}
                </small>
              </span>
              {cart[item.name] ? <b>x{cart[item.name]}</b> : null}
              <button type="button" aria-label={`Buy ${item.name}`} disabled={!gold || item.price > left} onClick={() => set({ [part.into]: { ...cart, [item.name]: (cart[item.name] ?? 0) + 1 } })}>
                Buy
              </button>
              {cart[item.name] ? (
                <button type="button" aria-label={`Return ${item.name}`} onClick={() => set({ [part.into]: Object.fromEntries(Object.entries({ ...cart, [item.name]: cart[item.name] - 1 }).filter(([, count]) => count > 0)) })}>
                  Return
                </button>
              ) : null}
            </li>
          ))}
      </ul>
    </>
  );
}
