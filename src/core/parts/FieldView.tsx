import type { FieldSpec } from "../../../shared/rulesets/types";
import { Field } from "../fields/Field";
import { at, fill, nodesOf, num, rows, textOf, useSheet, type Scope } from "../sheet/context";

// One field of a manifest (FG's stringfield / numberfield / combobox, bound to
// a path): shown, typed into, picked or ticked. An edit goes to the host's
// whitelist (session.editCharacter); a field with an action sends that instead.
export function FieldView({ spec, scope, base = "" }: { spec: FieldSpec; scope: Scope; base?: string }) {
  const sheet = useSheet();
  const { editable, change, act, modifiers } = sheet;
  const path = base ? `${base}.${spec.path}` : spec.path;
  const raw = at(scope.row ?? scope.data, spec.path);
  const value = raw === undefined || raw === null || raw === "" || (spec.zeroIsEmpty && num(raw) === 0) ? spec.default : raw;
  const label = textOf(spec.label, scope, modifiers);
  const title = spec.title ? textOf(spec.title, scope, modifiers) : undefined;
  // Who types: the owner and the GM, the GM only (edit: "gm"), or no one.
  const typing = spec.edit === "gm" ? sheet.gm : editable && spec.edit !== "never";
  const save = (next: unknown) => (spec.action ? act(spec.action, { key: scope.extra?.key === undefined ? undefined : String(scope.extra.key), value: next }) : change(path, next));
  switch (spec.kind) {
    case "number":
      // A viewer who may not type sees a number box (a skill's level), where the sheet says so.
      if (spec.locked === "num" && !typing) return <span className="cc-num">{num(value)}</span>;
      return <Field value={num(value)} number editable={typing} label={label} onSave={(text) => save(Number(text) || 0)} />;
    case "text":
      return <Field value={String(value ?? "")} editable={typing} label={label} className={spec.fieldClass} onSave={(text) => save(text)} />;
    case "textarea":
      return <Field value={spec.lines ? (Array.isArray(value) ? value.map(String).join("\n") : "") : spec.plain ? String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : String(value ?? "")} area editable={typing} label={label} onSave={(text) => save(text)} />;
    case "select":
      return (
        <select className="cc-field" value={spec.number ? num(value) : String(value ?? "")} disabled={!typing} aria-label={label} title={title} onChange={(event) => save(spec.number ? Number(event.target.value) : event.target.value)}>
          {(spec.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "check":
      return <input type="checkbox" checked={Boolean(num(value))} disabled={!typing} aria-label={label} title={title} onChange={(event) => save(spec.action ? event.target.checked : event.target.checked ? 1 : 0)} />;
    default: {
      // Shown only (readonly, or no kind): the value, with its hook and its colour.
      const attrs: Record<string, string> = {};
      if (spec.hook) attrs["data-stat"] = spec.hook;
      if (spec.attr) attrs[spec.attr] = String(value ?? "");
      const shown = spec.format
        ? (sheet.formats[spec.format]?.(scope.data, undefined, scope.data) ?? "")
        : spec.join
          ? rows(raw).map(([, row]) => fill(spec.join?.item ?? "", { row, data: {} })).join(spec.join.sep)
          : Array.isArray(spec.show)
            ? nodesOf(spec.show, scope, modifiers)
            : spec.show
            ? textOf(spec.show, scope, modifiers)
            : fill(`{${spec.path}}`, scope) || String(value ?? "");
      return (
        <span className={spec.className ? `cc-value ${spec.className}` : "cc-value"} title={title} style={spec.color ? { color: textOf(spec.color, scope, modifiers) } : undefined} {...attrs}>
          {shown}
        </span>
      );
    }
  }
}

// A field in its labelled box (FG's label under the field), unless it is bare.
export function LabelledField({ spec, scope, base, className = "cc-labelled" }: { spec: FieldSpec; scope: Scope; base?: string; className?: string }) {
  const { modifiers } = useSheet();
  if (spec.bare) return <FieldView spec={spec} scope={scope} base={base} />;
  return (
    <label className={spec.box?.className ? `${className} ${spec.box.className}` : className} {...boxAttrs(spec, scope, modifiers)}>
      <FieldView spec={spec} scope={scope} base={base} />
      <small>{noteOf(spec, scope, modifiers)}</small>
    </label>
  );
}
// The words under a labelled field: its note (a list: one text node each), else its label.
export function noteOf(spec: FieldSpec, scope: Scope, modifiers: Record<string, unknown>) {
  if (Array.isArray(spec.note)) return nodesOf(spec.note, scope, modifiers);
  return spec.note ?? textOf(spec.label, scope, modifiers);
}
// The labelled box's title and data-* (box.title, box.attr), none when the field gives none.
export function boxAttrs(spec: FieldSpec, scope: Scope, modifiers: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (spec.box?.title !== undefined) attrs.title = textOf(spec.box.title, scope, modifiers);
  if (spec.box?.attr) attrs[`data-${spec.box.attr.name}`] = textOf(spec.box.attr.value, scope, modifiers);
  return attrs;
}
