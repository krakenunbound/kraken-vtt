import { Fragment, type ComponentType } from "react";
import type { BoxSpec, Part, Path, RollSpec, StatBlockSpec, StepSpec } from "../../../shared/rulesets/types";
import { Icon } from "../../ui/icons";
import { Field } from "../fields/Field";
import { at, fill, holds, nodesOf, num, rows, signed, textOf, useSheet, type Format, type Row, type Scope } from "../sheet/context";
import { FieldView, LabelledField } from "./FieldView";
export type { Format };

// The core parts a manifest arranges on a sheet's tabs (docs/core-ui-design.md
// 4.2): a stat block, derived boxes, a list, coins, load, notes, advancement,
// a heading or a hint, a row of parts side by side, and a game's own part
// (custom) where nothing here fits. Each writes the shared look (the five-*
// and cc-* styles every sheet uses) and the data-* hooks the manifest names.

// A game's own part: given its props, and (inside a list or skills row) the row and its key.
export type CustomPart = ComponentType<{ props?: Record<string, unknown>; row?: Row; rowKey?: string }>;

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
      return <Derived spec={spec} custom={custom} />;
    case "strip":
      return <Strip spec={spec} />;
    case "tags": {
      const words = spec.from.flatMap((path) => {
        const value = at(sheet.data, path);
        return Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
      }).filter(Boolean);
      return words.length ? (
        <p className="five-list" data-list={spec.hook}>
          <b>{spec.label}:</b> {words.join(", ")}
        </p>
      ) : null;
    }
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
    case "heading": {
      // A heading given as nodes is written exactly as they are (its own space before the hint).
      const space = typeof spec.text === "string" ? " " : null;
      return (
        <h4>
          {typeof spec.text === "string" ? spec.text : nodesOf(spec.text, scope, sheet.modifiers)}
          {spec.targets ? (
            <>
              {space}
              {sheet.targets.length ? <small className="hint">at {sheet.targets.join(", ")}</small> : <small className="hint">Ctrl+click a token to target it</small>}
            </>
          ) : spec.hint ? (
            <>
              {space}
              <small className="hint">{nodesOf(spec.hint, scope, sheet.modifiers)}</small>
            </>
          ) : null}
        </h4>
      );
    }
    case "hint":
      return <p className={spec.plain ? undefined : "hint"}>{nodesOf(spec.text, scope, sheet.modifiers)}</p>;
    case "skills":
      return <Skills spec={spec} custom={custom} />;
    case "track":
      return <Track spec={spec} />;
    case "button":
      return <StepButton spec={spec} />;
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
    <button type="button" className={spec.className} aria-label={spec.aria} data-action={spec.hook} title={spec.title?.includes("{") ? fill(spec.title, here) : spec.title} disabled={spec.disabled ? holds(spec.disabled, here, sheet) : false} onClick={() => sheet.act(spec.action)}>
      {spec.label}
    </button>
  );
}

function RollButton({ roll, scope, className: base }: { roll: RollSpec; scope: Scope; className?: string }) {
  const className = roll.className ?? base;
  const sheet = useSheet();
  const key = String(scope.extra?.key ?? "");
  // What goes as the roll's key: the row's key, or (send) a skill's name.
  const sent = roll.send ? textOf(roll.send, scope, sheet.modifiers) : key;
  const off = !sheet.editable || (roll.disabled ? holds(roll.disabled, scope, sheet) : false);
  return (
    <button
      type="button"
      className={className}
      disabled={off}
      title={roll.title ? textOf(roll.title, scope, sheet.modifiers) : undefined}
      aria-label={roll.aria ? textOf(roll.aria, scope, sheet.modifiers) : undefined}
      {...{ [`data-${roll.hook}`]: key }}
      onClick={() => sheet.editable && sheet.act(roll.action, { key: sent })}
    >
      {nodesOf(roll.label, scope, sheet.modifiers)}
    </button>
  );
}

// Scores in rows (FG's ability block): a short name, a column per value, a roll.
function StatBlock({ spec }: { spec: StatBlockSpec }) {
  return (
    <section className={`${spec.base ?? "cc-panel five-abilities"}${spec.className ? ` ${spec.className}` : ""}`} aria-label={spec.label}>
      <StatRows spec={spec} />
    </section>
  );
}
function StatRows({ spec }: { spec: StatBlockSpec }) {
  const sheet = useSheet();
  return (
    <>
      {spec.heading ? (
        <h4>
          {spec.heading.text}
          {spec.heading.hint ? (
            <>
              {" "}
              <small className="hint">{spec.heading.hint}</small>
            </>
          ) : null}
        </h4>
      ) : spec.head === false ? null : (
        <div className={spec.headClass ?? "five-ability-head"}>
          <span />
          {spec.columns.map((column) => (
            <small key={column.label}>{column.label}</small>
          ))}
          {spec.roll ? <small>{spec.roll.column}</small> : null}
        </div>
      )}
      {spec.rows.map((row) => {
        const scope: Scope = { data: sheet.data, extra: { key: row.key, label: row.label, short: row.short ?? row.label } };
        return (
          <div key={row.key} className={spec.rowClass ?? "five-ability"} {...{ [`data-${spec.hook}`]: row.key }} title={spec.rowTitle ? textOf(spec.rowTitle, scope, sheet.modifiers) : undefined}>
            {spec.nameSmall ? (
              // The name with a small after it while its condition holds, written as JSX wrote "STR {hurt ? <small> : null}".
              <b title={row.label}>
                {row.short ?? row.label}{" "}
                {holds(spec.nameSmall.when, scope, sheet) ? (
                  <small className={spec.nameSmall.className} {...(spec.nameSmall.attr ? { [`data-${spec.nameSmall.attr}`]: row.key } : {})}>
                    {nodesOf(spec.nameSmall.text, scope, sheet.modifiers)}
                  </small>
                ) : null}
              </b>
            ) : spec.plain ? (
              <b>{row.short ?? row.label}</b>
            ) : (
              <b title={row.label}>{row.short ?? row.label}</b>
            )}
            {spec.columns.map((column) => {
              if ("roll" in column) return <RollButton key={column.label} roll={column.roll} scope={scope} className="cc-bonus" />;
              const field = <FieldView spec={{ ...column.field, path: column.path.replace("{key}", row.key) }} scope={scope} />;
              if (!column.wrap) return <FieldView key={column.label} spec={{ ...column.field, path: column.path.replace("{key}", row.key) }} scope={scope} />;
              // A field in a span, with a second one after it while its condition holds (2E's 18/76 Strength).
              return (
                <span key={column.label} className={column.wrap}>
                  {field}
                  {column.extra && holds(column.extra.when, scope, sheet) ? (
                    <>
                      {column.extra.before}
                      <FieldView spec={column.extra.field} scope={scope} />
                    </>
                  ) : null}
                </span>
              );
            })}
            {spec.roll ? <RollButton roll={spec.roll} scope={scope} className="cc-bonus" /> : null}
            {spec.rowNote ? <small className={spec.rowNote.className}>{sheet.formats[spec.rowNote.format]?.((at(sheet.data, spec.rowNote.row.replace("{key}", row.key)) ?? {}) as Row, row.key)}</small> : null}
          </div>
        );
      })}
      {spec.inner ? (
        <div className={spec.inner.base} aria-label={spec.inner.label}>
          <StatRows spec={spec.inner} />
        </div>
      ) : null}
      {spec.notes
        ? ((at(sheet.data, spec.notes) ?? []) as string[]).map((note) => (
            <p key={note} className="hint">
              {note}
            </p>
          ))
        : null}
    </>
  );
}

// A record's rows each with a field, a name and a roll (thief abilities): "{name}" and the others from the row.
// Fixed rows (every skill of the game): each row's data at path.{key}, named by its label and note.
function Skills({ spec, custom }: { spec: Extract<Part, { part: "skills" }>; custom: Record<string, CustomPart> }) {
  const sheet = useSheet();
  const fixed = spec.rows;
  const list: [string, Row, { label: string; note?: string } | null][] = fixed ? fixed.map((item) => [item.key, (at(sheet.data, `${spec.path}.${item.key}`) ?? {}) as Row, item]) : rows(at(sheet.data, spec.path)).map(([key, row]) => [key, row, null]);
  // Rows in order of a field (a skill's name), as a hand-made sheet sorted them.
  if (spec.sort) list.sort((a, b) => String(at(a[1], spec.sort ?? "")).localeCompare(String(at(b[1], spec.sort ?? ""))));
  const More = spec.more ? custom[spec.more] : null;
  const body = (
    <>
      {spec.head ? (
        <div className={spec.head.className}>
          {spec.head.labels.map((label) => (
            <small key={label}>{label}</small>
          ))}
        </div>
      ) : null}
      {list.map(([key, row, named]) => {
        const scope: Scope = { row, extra: named ? { key, label: named.label, note: named.note ?? "" } : { key }, data: sheet.data };
        return (
          <div key={key} className={spec.rowClass ? textOf(spec.rowClass, scope, sheet.modifiers) : "five-skill"} {...{ [`data-${spec.hook}`]: key }} title={spec.rowTitle ? textOf(spec.rowTitle, scope, sheet.modifiers) : undefined}>
            <FieldView spec={spec.field} scope={scope} base={`${spec.path}.${key}`} />
            {named ? (
              <span>
                {spec.mark ? (holds(spec.mark.when, scope, sheet) ? spec.mark.text : "") : null}
                {named.label} <small className="hint">{named.note}</small>
              </span>
            ) : spec.note !== undefined || More ? (
              // The name, a small hint after it (its characteristic) and a game's own words (Astra's tricks).
              <span>
                {String(at(row, spec.name ?? "name") ?? "")} <small className="hint">{textOf(spec.note, scope, sheet.modifiers)}</small>
                {More ? <More row={row} rowKey={key} /> : null}
              </span>
            ) : (
              <span>{String(at(row, spec.name ?? "name") ?? "")}</span>
            )}
            <RollButton roll={spec.roll} scope={scope} className="cc-bonus" />
            {sheet.editable && spec.remove ? (
              <button type="button" className="ghost" title={spec.remove.title} aria-label={textOf(spec.remove.aria, scope, sheet.modifiers)} onClick={() => sheet.change(`${spec.path}.${key}`, null)}>
                ×
              </button>
            ) : null}
          </div>
        );
      })}
      {spec.empty && list.length === 0 ? <p className="hint">{spec.empty}</p> : null}
    </>
  );
  return spec.className ? <div className={spec.className}>{body}</div> : body;
}

// Boxes to tick off: a row for each count in max (a spell level's slots); a click ticks up to that box, or back to it.
// each: one such block per row of a list (a 2E character's casting classes), its max and used in the row.
function Track({ spec }: { spec: Extract<Part, { part: "track" }> }) {
  const sheet = useSheet();
  if (spec.each)
    return (
      <>
        {rows(at(sheet.data, spec.each)).map(([key, row]) => (
          <TrackBlock key={String(row.class ?? key)} spec={spec} scope={{ row, data: sheet.data }} node={row} base={`${spec.each}.${key}.${spec.used}`} />
        ))}
      </>
    );
  return <TrackBlock spec={spec} scope={{ data: sheet.data }} node={sheet.data} base={spec.used} />;
}
function TrackBlock({ spec, scope, node, base }: { spec: Extract<Part, { part: "track" }>; scope: Scope; node: Row; base: string }) {
  const sheet = useSheet();
  // A count of null shows no row; 0 shows none, or (zero) a row saying so.
  const maxes = ((): (number | null)[] => {
    const max = at(node, spec.max);
    return Array.isArray(max) ? max.map((value) => (value === null ? null : num(value))) : [num(max)];
  })();
  const usedOf = (index: number) => {
    const used = at(node, spec.used);
    return num(Array.isArray(used) ? used[index] : used);
  };
  const first = spec.first ?? 1;
  return (
    <div className={spec.className} {...(spec.attr ? { [`data-${spec.attr.name}`]: textOf(spec.attr.value, scope, sheet.modifiers) } : {})}>
      {spec.intro ? <p className="hint">{nodesOf(spec.intro, scope, sheet.modifiers)}</p> : null}
      {maxes.map((max, index) =>
        max !== null && (max > 0 || spec.zero) ? (
          <div key={index} className={spec.rowClass} {...{ [`data-${spec.rowHook}`]: index + first }}>
            <b>{spec.labels[index]}</b>
            {Array.from({ length: max }, (_, slot) => {
              const used = usedOf(index);
              return <button key={slot} type="button" className={slot < used ? "used" : ""} disabled={!sheet.editable} aria-label={textOf(spec.aria, { row: scope.row, data: sheet.data, extra: { label: spec.labels[index], n: slot + 1 } }, sheet.modifiers)} onClick={() => sheet.change(`${base}.${index}`, slot < used ? slot : slot + 1)} />;
            })}
            {max === 0 ? <small className="hint">{spec.zero}</small> : null}
          </div>
        ) : null,
      )}
      {spec.empty && maxes.every((max) => !max) ? <p className="hint">{spec.empty}</p> : null}
    </div>
  );
}

// Big derived boxes (HP, Armor, Fatigue): a number from the host's derive(), small fields beside it, + and -.
function Derived({ spec, custom }: { spec: Extract<Part, { part: "derived" }>; custom: Record<string, CustomPart> }) {
  const sheet = useSheet();
  const scope: Scope = { data: sheet.data };
  return (
    <section className={`cc-panel five-defence${spec.className ? ` ${spec.className}` : ""}`}>
      {spec.boxes.map((box, index) => {
        if (!holds(box.when, scope, sheet)) return null;
        if ("custom" in box) {
          // A game's own box (Descending Darkness's Dread, 5E's death saves).
          const Custom = custom[box.custom];
          return Custom ? <Custom key={box.custom} /> : null;
        }
        return <DerivedBox key={`${box.label}-${index}`} box={box} />;
      })}
      {spec.hint !== undefined ? <p className="hint">{textOf(spec.hint, scope, sheet.modifiers)}</p> : null}
    </section>
  );
}
function DerivedBox({ box }: { box: BoxSpec }) {
  const sheet = useSheet();
  const scope: Scope = { data: sheet.data };
  const value = num(at(sheet.data, box.path));
  const shown = box.show === "remaining" ? value + (box.plus ? num(at(sheet.data, box.plus)) : 0) - num(at(sheet.data, box.minus ?? "")) : value;
  const warn = box.warn && (box.warn.atZero ? shown <= 0 : holds(box.warn.when, scope, sheet));
  const hook = box.hook ? { "data-stat": box.hook } : {};
  // The first state the shown number is in (Dead, Dying, Stable, Disabled).
  const state = box.states?.find((item) => (item.atMost === undefined || shown <= item.atMost) && (item.under === undefined || shown < item.under) && (item.equals === undefined || shown === item.equals) && holds(item.when, scope, sheet));
  return (
    <div className="five-big" title={box.title ? textOf(box.title, scope, sheet.modifiers) : undefined} {...(box.attr ? { [`data-${box.attr.name}`]: box.attr.value } : {})}>
      <small>{Array.isArray(box.label) ? box.label.map((word, index) => <Fragment key={index}>{word}</Fragment>) : box.label}</small>
      {box.show === "shield" ? (
        <span className="cc-shield" {...hook}>
          {shown}
        </span>
      ) : box.show === "text" ? (
        <span {...hook} style={{ color: box.dangerWhen && holds(box.dangerWhen, scope, sheet) ? "#c0392b" : undefined }}>
          {typeof box.text === "string" || box.text === undefined ? fill(box.text ?? "", scope) : nodesOf(box.text, scope, sheet.modifiers)}
        </span>
      ) : box.show === "field" && box.field ? (
        <span {...hook}>
          <FieldView spec={box.field} scope={scope} />
          {box.suffix}
        </span>
      ) : (
        <span {...hook} style={{ color: box.danger && shown <= 0 ? "#c0392b" : undefined }}>
          {box.show === "remaining" ? (
            <>
              {shown} / {value}
            </>
          ) : box.format === "signed" ? (
            signed(shown)
          ) : box.suffix ? (
            <>
              {shown}
              {box.suffix}
            </>
          ) : (
            shown
          )}
        </span>
      )}
      {box.note ? <small className="hint">{textOf(box.note, scope, sheet.modifiers)}</small> : null}
      {box.fields?.length ? (
        <span className="cc-inline">
          {box.fields.map((field) => (
            <FieldWithWord key={field.path} field={field} scope={scope} />
          ))}
        </span>
      ) : null}
      {(box.lines ?? []).map((line, index) => (
        <span key={index} className="cc-inline">
          {line.items.map((item, place) => (
            <Fragment key={place}>
              {`${place ? (line.sep ?? " ") : ""}${item.before} `}
              {"field" in item ? (
                <FieldView spec={item.field} scope={scope} />
              ) : (
                <b {...(item.hook ? { "data-stat": item.hook } : {})}>{num(at(sheet.data, item.value))}</b>
              )}
            </Fragment>
          ))}
        </span>
      ))}
      {state ? (
        <span className="hint" data-status={state.status}>
          {state.text}
        </span>
      ) : null}
      {box.warn && warn ? (
        <span className="hint" {...(box.warn.attr ? { [`data-${box.warn.attr.name}`]: box.warn.attr.value } : {})}>
          {typeof box.warn.text === "string" ? box.warn.text : textOf(box.warn.text, scope, sheet.modifiers)}
        </span>
      ) : null}
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
          // A row's details read the row alone (as an FG list item's fields): an item with no "ac" never shows the character's.
          const own: Scope = { row: item, extra: { key }, data: {} };
          const details = (spec.details ?? []).filter((detail) => holds(detail.when, own, sheet)).map((detail) => (detail.format ? (formats[detail.format]?.(item) ?? "") : fill(detail.text ?? "", own))).filter(Boolean);
          const title = spec.name.title?.map((path) => String(at(item, path) ?? "")).find(Boolean) ?? (spec.name.title ? "" : undefined);
          const words = (
            <>
              {spec.name.bold ? <b>{name}</b> : name}
              {spec.name.after !== undefined ? textOf(spec.name.after, own, modifiers) : null}
              {/* A list with details always has their line (empty or not), as every list on the hand-made sheets did, unless hideEmpty. */}
              {spec.small ? (
                <>
                  {" "}
                  <small className="hint">{nodesOf(spec.small, own, modifiers)}</small>
                </>
              ) : spec.details && spec.hideEmpty && !details.length ? (
                <> </>
              ) : spec.details ? (
                <>
                  {" "}
                  <small className="hint">{details.join(spec.sep ?? " · ")}</small>
                </>
              ) : null}
            </>
          );
          // Small words after the name or after the buttons (2E's "(nonproficient)", 3.5E's critical range).
          const smalls = (place: "name" | "end") =>
            (spec.smalls ?? [])
              .filter((item) => item.place === place && holds(item.when, scope, sheet))
              .map((item, index) => (
                <small key={`${place}-${index}`} className="hint" title={item.title} {...(item.attr ? { [`data-${item.attr.name}`]: item.attr.value } : {})}>
                  {nodesOf(item.text, scope, modifiers)}
                </small>
              ));
          return (
            <li key={key} {...(spec.hook ? { [`data-${spec.hook}`]: key } : {})}>
              {spec.select ? <FieldView spec={spec.select} scope={scope} base={`${spec.path}.${key}`} /> : null}
              {(spec.fields ?? []).map((field) => (
                <FieldView key={field.path} spec={field} scope={scope} base={`${spec.path}.${key}`} />
              ))}
              {spec.check ? (
                <label className="cc-inline">
                  <FieldView spec={spec.check} scope={scope} base={`${spec.path}.${key}`} /> {words}
                </label>
              ) : spec.name.flat ? (
                words
              ) : (
                <span title={title}>{words}</span>
              )}
              {smalls("name")}
              {(spec.rowActions ?? [])
                .filter((action) => holds(action.when, scope, sheet))
                .map((action) => (
                  <button key={action.hook} type="button" className={action.className} data-action={action.hook} disabled={!editable} title={action.title ? textOf(action.title, scope, modifiers) : undefined} onClick={() => sheet.act(action.action, { key })}>
                    {nodesOf(action.label, scope, modifiers)}
                  </button>
                ))}
              {smalls("end")}
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

// The strip over every tab (FG's level and experience line): the level and its level-up (the owner once the
// experience is there, the GM any time), a level per class, the experience, values, the next roll's DC or modifier.
function Strip({ spec }: { spec: Extract<Part, { part: "strip" }> }) {
  const sheet = useSheet();
  const { data, editable, gm, session, record, modifiers } = sheet;
  return (
    <section className={spec.className ?? "cc-panel cc-row five-strip"}>
      {spec.items.map((item, index) => {
        const ready = (exp: Path, next: Path) => num(at(data, next)) > 0 && num(at(data, exp)) >= num(at(data, next));
        switch (item.kind) {
          case "level": {
            const level = num(at(data, item.path)) || (item.atLeast ?? 0);
            const scope: Scope = { data };
            return (
              <span key={index} className="cc-inline" title={item.hint ? fill(item.hint, scope) : undefined}>
                <b>Level</b> <span className="cc-num" data-stat="level">{level}</span>
                {editable && (ready(item.exp, item.next) || gm) && level < Number(item.max) ? (
                  <button type="button" className="cc-levelup" data-action="level-up" title={textOf(item.title, scope, modifiers)} onClick={() => session.levelUp(record.id)}>
                    <Icon name="add" size={14} />
                  </button>
                ) : null}
              </span>
            );
          }
          case "levels":
            return (
              <Fragment key={index}>
                {rows(at(data, item.path)).map(([, row]) => {
                  const scope: Scope = { row, data: {} };
                  const name = String(row.name);
                  return (
                    <span key={name} className="cc-inline" title={textOf(item.title, scope, modifiers)}>
                      <b>{name}</b> <span className="cc-num" data-stat={`level-${sheet.formats[item.hook]?.(row) ?? ""}`}>{num(row.level)}</span>
                      {editable && (ready(item.exp, item.next) || gm) && num(row.level) < item.max ? (
                        <button type="button" className="cc-levelup" data-action="level-up" data-level-class={name} title={textOf(item.buttonTitle, scope, modifiers)} onClick={() => session.levelUp(record.id, name)}>
                          <Icon name="add" size={14} />
                        </button>
                      ) : null}
                    </span>
                  );
                })}
              </Fragment>
            );
          case "xp": {
            const field = <Field value={num(at(data, item.path))} number editable={item.edit === "gm" ? gm : editable} label={item.label} onSave={(value) => sheet.change(item.path, Number(value) || 0)} />;
            const scope: Scope = { data };
            return (
              <span key={index} className="cc-inline">
                {item.shown ? (
                  // The experience as a number and its next, the GM's field after them, and a note (Basic Fantasy's).
                  <>
                    <b>{item.word ?? "XP"}</b>
                    {" "}
                    <span className="cc-num" data-stat={item.shown.hook}>
                      {num(at(data, item.path))}
                    </span>
                    {" / "}
                    <span className="cc-num">{num(at(data, item.next ?? "")) || "—"}</span>
                    {gm ? field : null}
                    {item.note && holds(item.note.when, scope, sheet) ? <small className="hint">{nodesOf(item.note.text, scope, modifiers)}</small> : null}
                  </>
                ) : item.next ? (
                  <>
                    <b>{item.word ?? "XP"}</b> {field} / <span className="cc-num">{num(at(data, item.next)) || "—"}</span>
                  </>
                ) : (
                  <>
                    <b>{item.word ?? "XP"}</b> {field}
                  </>
                )}
              </span>
            );
          }
          case "hint":
            return (
              <span key={index} className="hint">
                {item.text}
              </span>
            );
          case "value":
            return (
              <span key={index} className="cc-inline" title={item.title}>
                <b>{item.label}</b> <span className="cc-num" data-stat={item.hook}>{item.format === "signed" ? signed(num(at(data, item.path))) : num(at(data, item.path))}</span>
              </span>
            );
          case "modifier": {
            const input = <input type="number" className={item.input ?? "cc-field number"} value={num(modifiers[item.key])} min={item.min} max={item.max} aria-label={item.aria} style={item.width ? { width: `${item.width}em` } : undefined} onChange={(event) => sheet.setModifier(item.key, Number(event.target.value) || 0)} />;
            return (
              <label key={index} className="cc-inline" title={item.title}>
                {item.plain ? (
                  <>
                    {`${item.label} `}
                    {input}
                  </>
                ) : (
                  <>
                    <b>{item.label}</b> {input}
                  </>
                )}
              </label>
            );
          }
          case "choice": {
            // In a labelled box the box carries the title, as "<label title><b>Task</b><select>" did.
            const select = (
              <select key={index} className="cc-field" aria-label={item.aria} title={item.label ? undefined : item.title} value={String(modifiers[item.key] ?? "")} onChange={(event) => sheet.setModifier(item.key, item.number ? Number(event.target.value) : event.target.value)}>
                {item.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            );
            return item.label ? (
              <label key={index} className="cc-inline" title={item.title}>
                <b>{item.label}</b>
                {select}
              </label>
            ) : (
              select
            );
          }
        }
      })}
    </section>
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
        <CoinLine key={key} spec={spec} coin={coin} at={`${spec.path}.${key}.amount`} />
      ))}
      {none ? <span className="hint">{spec.none?.text}</span> : null}
    </div>
  );
}

// One coin: its amount and its word (the coin's name, or the game's fixed word), the word after the field or before it.
function CoinLine({ spec, coin, at: path }: { spec: Extract<Part, { part: "coins" }>; coin: Row; at: string }) {
  const sheet = useSheet();
  const field = <Field value={num(coin.amount)} number editable={sheet.editable} label={spec.aria ? textOf(spec.aria, { row: coin, data: sheet.data }, sheet.modifiers) : `${String(coin.name ?? "GP")} coins`} onSave={(value) => sheet.change(path, Number(value) || 0)} />;
  const word = spec.word ?? (spec.upper ? String(coin.name).toUpperCase() : String(coin.name ?? "gp").toLowerCase());
  return spec.before ? (
    <label className="cc-inline">
      {`${word} `}
      {field}
    </label>
  ) : spec.word ? (
    // A fixed word is one text node with its space (as "<Field /> credits" wrote it).
    <label className="cc-inline">
      {field}
      {` ${word}`}
    </label>
  ) : (
    <label className="cc-inline">
      {field} {word}
    </label>
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
