import type { ComponentType } from "react";
import type { BoxSpec, Part, RollSpec, StepSpec } from "../../../shared/rulesets/types";
import { Field } from "../fields/Field";
import { at, fill, holds, num, rows, textOf, useSheet, type Row, type Scope } from "../sheet/context";
import { FieldView, LabelledField } from "./FieldView";

// The core parts a manifest arranges on a sheet's tabs (docs/core-ui-design.md
// 4.2): a stat block, derived boxes, a list, coins, load, notes, advancement,
// a heading or a hint, a row of parts side by side, and a game's own part
// (custom) where nothing here fits. Each writes the shared look (the five-*
// and cc-* styles every sheet uses) and the data-* hooks the manifest names.

export type CustomPart = ComponentType<{ props?: Record<string, unknown> }>;
export type Format = (row: Row) => string;

export function PartView({ spec, custom, formats }: { spec: Part; custom: Record<string, CustomPart>; formats: Record<string, Format> }) {
  const sheet = useSheet();
  const scope: Scope = { data: sheet.data };
  if (spec.gm && !sheet.gm) return null;
  if (!holds(spec.when, scope, sheet)) return null;
  switch (spec.part) {
    case "row":
      return (
        <div className={spec.className}>
          {spec.parts.map((part, index) => (
            <PartView key={index} spec={part} custom={custom} formats={formats} />
          ))}
        </div>
      );
    case "statBlock":
      return <StatBlock spec={spec} />;
    case "derived":
      return <Derived spec={spec} />;
    case "list":
      return <List spec={spec} formats={formats} />;
    case "coins":
      return <Coins spec={spec} />;
    case "load":
      return <Load spec={spec} />;
    case "notes":
      return spec.className ? (
        <div className={spec.className}>
          {spec.fields.map((field) => (
            <LabelledField key={field.path} spec={field} scope={scope} />
          ))}
        </div>
      ) : (
        <>
          {spec.fields.map((field) => (
            <LabelledField key={field.path} spec={field} scope={scope} />
          ))}
        </>
      );
    case "advancement":
      return (
        <p className="cc-inline" title={spec.title}>
          {spec.rolls.map((roll) => (
            <StepButton key={roll.hook} spec={roll} />
          ))}
        </p>
      );
    case "heading":
      return (
        <h4>
          {spec.text} {spec.targets ? sheet.targets.length ? <small className="hint">at {sheet.targets.join(", ")}</small> : <small className="hint">Ctrl+click a token to target it</small> : null}
        </h4>
      );
    case "hint":
      return <p className="hint">{fill(spec.text, scope)}</p>;
    case "custom": {
      const Custom = custom[spec.component];
      return Custom ? <Custom props={spec.props} /> : null;
    }
  }
}

// A button that sends an action (rest, a growth roll, + and - on a count).
function StepButton({ spec, scope }: { spec: StepSpec; scope?: Scope }) {
  const sheet = useSheet();
  const here = scope ?? { data: sheet.data };
  return (
    <button type="button" data-action={spec.hook} title={spec.title} disabled={spec.disabled ? holds(spec.disabled, here, sheet) : false} onClick={() => sheet.act(spec.action)}>
      {spec.label}
    </button>
  );
}

function RollButton({ roll, scope, className }: { roll: RollSpec; scope: Scope; className?: string }) {
  const sheet = useSheet();
  const key = String(scope.extra?.key ?? "");
  return (
    <button
      type="button"
      className={className}
      disabled={!sheet.editable}
      title={roll.title ? textOf(roll.title, scope, sheet.modifiers) : undefined}
      aria-label={roll.aria ? textOf(roll.aria, scope, sheet.modifiers) : undefined}
      {...{ [`data-${roll.hook}`]: key }}
      onClick={() => sheet.editable && sheet.act(roll.action, { key })}
    >
      {textOf(roll.label, scope, sheet.modifiers)}
    </button>
  );
}

// Scores in rows (FG's ability block): a short name, a column per value, a roll.
function StatBlock({ spec }: { spec: Extract<Part, { part: "statBlock" }> }) {
  const sheet = useSheet();
  return (
    <section className={`cc-panel five-abilities${spec.className ? ` ${spec.className}` : ""}`} aria-label={spec.label}>
      <div className="five-ability-head">
        <span />
        {spec.columns.map((column) => (
          <small key={column.label}>{column.label}</small>
        ))}
        {spec.roll ? <small>{spec.roll.column}</small> : null}
      </div>
      {spec.rows.map((row) => {
        const scope: Scope = { data: sheet.data, extra: { key: row.key, label: row.label, short: row.short ?? row.label } };
        return (
          <div key={row.key} className="five-ability" {...{ [`data-${spec.hook}`]: row.key }}>
            <b title={row.label}>{row.short ?? row.label}</b>
            {spec.columns.map((column) => (
              <FieldView key={column.label} spec={{ ...column.field, path: column.path.replace("{key}", row.key) }} scope={scope} />
            ))}
            {spec.roll ? <RollButton roll={spec.roll} scope={scope} className="cc-bonus" /> : null}
          </div>
        );
      })}
    </section>
  );
}

// Big derived boxes (HP, Armor, Fatigue): a number from the host's derive(), small fields beside it, + and -.
function Derived({ spec }: { spec: Extract<Part, { part: "derived" }> }) {
  return (
    <section className={`cc-panel five-defence${spec.className ? ` ${spec.className}` : ""}`}>
      {spec.boxes.map((box) => (
        <DerivedBox key={box.label} box={box} />
      ))}
    </section>
  );
}
function DerivedBox({ box }: { box: BoxSpec }) {
  const sheet = useSheet();
  const scope: Scope = { data: sheet.data };
  const value = num(at(sheet.data, box.path));
  const shown = box.show === "remaining" ? value - num(at(sheet.data, box.minus ?? "")) : value;
  const hook = box.hook ? { "data-stat": box.hook } : {};
  return (
    <div className="five-big" title={box.title ? textOf(box.title, scope, sheet.modifiers) : undefined}>
      <small>{box.label}</small>
      {box.show === "shield" ? (
        <span className="cc-shield" {...hook}>
          {shown}
        </span>
      ) : (
        <span {...hook} style={{ color: box.danger && shown <= 0 ? "#c0392b" : undefined }}>
          {box.show === "remaining" ? (
            <>
              {shown} / {value}
            </>
          ) : (
            shown
          )}
        </span>
      )}
      {box.fields?.length ? (
        <span className="cc-inline">
          {box.fields.map((field) => (
            <FieldWithWord key={field.path} field={field} scope={scope} />
          ))}
        </span>
      ) : null}
      {box.warn && holds(box.warn.when, scope, sheet) ? <span className="hint">{box.warn.text}</span> : null}
      {box.steps?.length && sheet.editable ? (
        <span className="cc-inline">
          {box.steps.map((step) => (
            <StepButton key={step.hook} spec={step} />
          ))}
        </span>
      ) : null}
    </div>
  );
}
function FieldWithWord({ field, scope }: { field: NonNullable<BoxSpec["fields"]>[number]; scope: Scope }) {
  return (
    <>
      {field.before ? `${field.before} ` : null}
      <FieldView spec={field} scope={scope} />{" "}
    </>
  );
}

// A list of the record's id-* rows (FG's windowlist): a leading select or check, the name and
// its details, the row's buttons, drop it; a line to add one; a sheet-wide choice its buttons read.
function List({ spec, formats }: { spec: Extract<Part, { part: "list" }>; formats: Record<string, Format> }) {
  const sheet = useSheet();
  const { editable, modifiers } = sheet;
  const items = rows(at(sheet.data, spec.path));
  const modifier = spec.modifier ? <ModifierView spec={spec.modifier} /> : null;
  return (
    <>
      {spec.label ? <h4>{spec.label}</h4> : null}
      {modifier && spec.modifier?.place === "top" ? modifier : null}
      <ul className={spec.className ?? "five-items"} {...(spec.count ? { [`data-${spec.count}`]: items.length } : {})}>
        {items.map(([key, item]) => {
          const scope: Scope = { row: item, extra: { key }, data: sheet.data };
          const name = String(at(item, spec.name.path) ?? spec.name.else ?? "");
          const details = (spec.details ?? []).filter((detail) => holds(detail.when, scope, sheet)).map((detail) => (detail.format ? (formats[detail.format]?.(item) ?? "") : fill(detail.text ?? "", scope))).filter(Boolean);
          const title = spec.name.title?.map((path) => String(at(item, path) ?? "")).find(Boolean) ?? (spec.name.title ? "" : undefined);
          const words = (
            <>
              {spec.name.bold ? <b>{name}</b> : name}
              {/* A list with details always has their line (empty or not), as every list on the hand-made sheets did. */}
              {spec.details ? (
                <>
                  {" "}
                  <small className="hint">{details.join(spec.sep ?? " · ")}</small>
                </>
              ) : null}
            </>
          );
          return (
            <li key={key} {...{ [`data-${spec.hook}`]: key }}>
              {spec.select ? <FieldView spec={spec.select} scope={scope} base={`${spec.path}.${key}`} /> : null}
              {spec.check ? (
                <label className="cc-inline">
                  <FieldView spec={spec.check} scope={scope} base={`${spec.path}.${key}`} /> {words}
                </label>
              ) : spec.name.flat ? (
                words
              ) : (
                <span title={title}>{words}</span>
              )}
              {(spec.rowActions ?? [])
                .filter((action) => holds(action.when, scope, sheet))
                .map((action) => (
                  <button key={action.hook} type="button" className={action.className} data-action={action.hook} disabled={!editable} title={action.title ? textOf(action.title, scope, modifiers) : undefined} onClick={() => sheet.act(action.action, { key })}>
                    {textOf(action.label, scope, modifiers)}
                  </button>
                ))}
              {editable && spec.remove ? (
                <button type="button" className="ghost" title={spec.remove.title} aria-label={textOf(spec.remove.aria, scope, modifiers)} onClick={() => (spec.remove?.action ? sheet.act(spec.remove.action, { key }) : sheet.change(`${spec.path}.${key}`, null))}>
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {spec.empty && items.length === 0 ? <p className="hint">{spec.empty}</p> : null}
      {editable && spec.add ? (
        <AddLine add={spec.add} before={spec.modifier?.place === "bottom" ? modifier : null} />
      ) : null}
    </>
  );
}
function AddLine({ add, before }: { add: NonNullable<Extract<Part, { part: "list" }>["add"]>; before: React.ReactNode }) {
  const sheet = useSheet();
  const line = (
    <label className={before ? "cc-labelled grow" : "cc-labelled"}>
      <Field value="" editable={sheet.editable} label={add.label} onSave={(value) => value.trim() && sheet.act(add.action, { value })} />
      <small>{add.note}</small>
    </label>
  );
  return before ? (
    <p className="cc-inline">
      {before}
      {line}
    </p>
  ) : (
    line
  );
}
function ModifierView({ spec }: { spec: NonNullable<Extract<Part, { part: "list" }>["modifier"]> }) {
  const sheet = useSheet();
  const value = sheet.modifiers[spec.key];
  return spec.kind === "check" ? (
    <label className="cc-inline" title={spec.title}>
      <input type="checkbox" checked={Boolean(value)} onChange={(event) => sheet.setModifier(spec.key, event.target.checked)} /> {spec.label}
    </label>
  ) : (
    <label className="cc-inline" title={spec.title}>
      <select className="cc-field" aria-label={spec.label} value={String(value ?? "")} onChange={(event) => sheet.setModifier(spec.key, event.target.value)}>
        {(spec.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// The coins (FG's coin list): an amount to type per coin.
function Coins({ spec }: { spec: Extract<Part, { part: "coins" }> }) {
  const sheet = useSheet();
  const coins = rows(at(sheet.data, spec.path));
  const none = spec.none && !coins.some(([, coin]) => new RegExp(spec.none?.unless ?? "", "i").test(String(coin.name ?? spec.none?.unless)));
  return (
    <div className={spec.className ?? "five-coins"}>
      {coins.map(([key, coin]) => (
        <label key={key} className="cc-inline">
          <Field value={num(coin.amount)} number editable={sheet.editable} label={`${String(coin.name ?? "GP")} coins`} onSave={(value) => sheet.change(`${spec.path}.${key}.amount`, Number(value) || 0)} /> {String(coin.name ?? "gp").toLowerCase()}
        </label>
      ))}
      {none ? <span className="hint">{spec.none?.text}</span> : null}
    </div>
  );
}

// Load (Cairn's slots): what is used of what there is, and its breakdown.
function Load({ spec }: { spec: Extract<Part, { part: "load" }> }) {
  const sheet = useSheet();
  const used = num(at(sheet.data, spec.used));
  return (
    <p className="cc-inline" {...{ [`data-${spec.hook}`]: used }}>
      <b>
        Slots {used} / {spec.total}
      </b>
      <small className="hint">{fill(spec.text, { data: sheet.data })}</small>
    </p>
  );
}
