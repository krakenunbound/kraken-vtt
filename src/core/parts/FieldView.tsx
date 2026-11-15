import type { FieldSpec } from "../../../shared/rulesets/types";
import { Field } from "../fields/Field";
import { at, fill, num, rows, textOf, useSheet, type Scope } from "../sheet/context";

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
      return <Field value={num(value)} number editable={typing} label={label} onSave={(text) => save(Number(text) || 0)} />;
    case "text":
      return <Field value={String(value ?? "")} editable={typing} label={label} onSave={(text) => save(text)} />;
    case "textarea":
      return <Field value={spec.lines ? (Array.isArray(value) ? value.map(String).join("\n") : "") : String(value ?? "")} area editable={typing} label={label} onSave={(text) => save(text)} />;
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
        ? (sheet.formats[spec.format]?.(scope.data) ?? "")
        : spec.join
          ? rows(raw).map(([, row]) => fill(spec.join?.item ?? "", { row, data: {} })).join(spec.join.sep)
          : spec.show
            ? fill(spec.show, scope)
            : fill(`{${spec.path}}`, scope) || String(value ?? "");
      return (
        <span className="cc-value" title={title} style={spec.color ? { color: spec.color } : undefined} {...attrs}>
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
    <label className={className}>
      <FieldView spec={spec} scope={scope} base={base} />
      <small>{spec.note ?? textOf(spec.label, scope, modifiers)}</small>
    </label>
  );
}
