import { useMemo, useState } from "react";
import type { ActionCall, Part, SheetSpec } from "../../../shared/rulesets/types";
import type { Session, TableRecord } from "../../session/useSession";
import { canEdit, SheetFrame } from "../frame/SheetFrame";
import { FieldView } from "../parts/FieldView";
import { PartView, type CustomPart, type Format } from "../parts/Parts";
import { holds, SheetCtx, textOf, type Row, type SheetContext } from "./context";

// A sheet laid out by its manifest (FG's arrange level: the ruleset lists its
// tabs and fills each with core parts bound to record paths). The frame, the
// header's identity boxes and the tab rail are the core's (SheetFrame); every
// part sends an edit through the host's whitelist or a ruleset message.

// A ruleset message's sender (session.<message>Action).
function sender(session: Session, message: string): ((id: string, action: string, args: Record<string, unknown>) => unknown) | null {
  switch (message) {
    case "cairn":
      return session.cairnAction;
    case "fate":
      return session.fateAction;
    case "forged":
      return session.forgedAction;
    default:
      return null;
  }
}

// The modifiers a sheet's lists offer, at their starting values (a check off, a select on its first option).
function startingModifiers(parts: Part[], into: Record<string, unknown> = {}) {
  for (const part of parts) {
    if (part.part === "row") startingModifiers(part.parts, into);
    if (part.part === "list" && part.modifier) into[part.modifier.key] = part.modifier.kind === "check" ? false : (part.modifier.options?.[0]?.value ?? "");
  }
  return into;
}

export function SheetRenderer({ spec, record, session, ruleset, custom, formats }: { spec: SheetSpec; record: TableRecord; session: Session; ruleset: string; custom: Record<string, CustomPart>; formats: Record<string, Format> }) {
  const [tab, setTab] = useState(spec.tabs[0]?.id ?? "main");
  const [modifiers, setModifiers] = useState<Record<string, unknown>>(() => startingModifiers(spec.tabs.flatMap((item) => item.parts)));
  const data = record.data as Row;
  const editable = canEdit(record, session);
  const gm = session.role === "dm";
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targets = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter((name): name is string => Boolean(name));
  const context: SheetContext = useMemo(() => {
    const change = (path: string, value: unknown) => void session.editCharacter(record.id, [{ path, value }]);
    const act = (call: ActionCall, given: { key?: string; value?: unknown } = {}) => {
      if ("roll" in call) {
        session.siegeCheck(record.id, String(given.key ?? call.key ?? ""), 0, false, { kind: call.roll });
        return;
      }
      const args: Record<string, unknown> = { ...(call.args ?? {}) };
      if (call.key && given.key !== undefined) args[call.key] = given.key;
      if (call.value && given.value !== undefined) args[call.value] = given.value;
      for (const name of call.modifiers ?? []) if (modifiers[name] !== undefined && modifiers[name] !== "") args[name] = modifiers[name];
      if ("ct" in call) {
        session.ct(call.ct, { recordId: record.id, ...args });
        return;
      }
      const send = sender(session, call.message);
      if (send) void Promise.resolve(send(record.id, call.action, args)).catch(() => undefined);
    };
    return { record, session, data, editable, gm, change, act, modifiers, setModifier: (key, value) => setModifiers((now) => ({ ...now, [key]: value })), targets };
  }, [record, session, data, editable, gm, modifiers, targets.join("\u0000")]);
  const shownTabs = spec.tabs.filter((item) => !item.gm || gm);
  const page = shownTabs.find((item) => item.id === tab) ?? shownTabs[0];
  const scope = { data };
  const parts = page?.parts.map((part, index) => <PartView key={`${page.id}-${index}`} spec={part} custom={custom} formats={formats} />);
  return (
    <SheetCtx.Provider value={context}>
      <SheetFrame
        record={record}
        session={session}
        editable={editable}
        className={spec.className ? `cc-sheet ${spec.className}` : "cc-sheet"}
        attrs={{ "data-ruleset": ruleset }}
        tabs={shownTabs.map((item) => (item.label ? { id: item.id, label: item.label } : item.id))}
        tab={page?.id ?? ""}
        onTab={setTab}
        boxes={spec.header.identity
          .filter((field) => holds(field.when, scope, context))
          .map((field) => (
            <label key={field.path} className="cc-labelled cc-box">
              <FieldView spec={field} scope={scope} />
              <small>{field.note ?? textOf(field.label, scope, modifiers)}</small>
            </label>
          ))}
      >
        {page ? (
          page.page === "panel" ? (
            <section className="cc-panel cc-page" data-tab-page={page.id}>
              {parts}
            </section>
          ) : (
            <div className="cc-page" data-tab-page={page.id}>
              {parts}
            </div>
          )
        ) : null}
      </SheetFrame>
    </SheetCtx.Provider>
  );
}
