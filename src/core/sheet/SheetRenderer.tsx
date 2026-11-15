import { useMemo, useState } from "react";
import type { ActionCall, Part, SheetSpec } from "../../../shared/rulesets/types";
import type { Session, TableRecord } from "../../session/useSession";
import { canEdit, SheetFrame } from "../frame/SheetFrame";
import { messageSender } from "../sender";
import { FieldView } from "../parts/FieldView";
import { PartView, type CustomPart, type Format } from "../parts/Parts";
import { at, holds, num, setFormatters, SheetCtx, textOf, type Row, type SheetContext } from "./context";

// A sheet laid out by its manifest (FG's arrange level: the ruleset lists its
// tabs and fills each with core parts bound to record paths). The frame, the
// header's identity boxes and the tab rail are the core's (SheetFrame); every
// part sends an edit through the host's whitelist or a ruleset message.

// The modifiers a sheet's lists and strip offer, at their starting values (a check off, a select on its first option, a number 0).
function startingModifiers(parts: Part[], into: Record<string, unknown> = {}) {
  for (const part of parts) {
    if (part.part === "row") startingModifiers(part.parts, into);
    if (part.part === "list" && part.modifier) into[part.modifier.key] = part.modifier.kind === "check" ? false : (part.modifier.options?.[0]?.value ?? "");
    if (part.part === "strip")
      for (const item of part.items) {
        if (item.kind === "modifier") into[item.key] = item.start ?? 0;
        if (item.kind === "choice") into[item.key] = item.start ?? item.options[0]?.value ?? "";
      }
  }
  return into;
}

// The game's words in every text of the sheet: "{@species}" is the manifest's labels.species (a variant's own:
// Descending Darkness's "Kin" where 5E says "Species"), as FG's string resources.
function withWords<T>(value: T, words: Record<string, string>): T {
  if (typeof value === "string") return value.replace(/\{@(\w+)\}/g, (whole, word: string) => words[word] ?? whole) as T;
  if (Array.isArray(value)) return value.map((item) => withWords(item, words)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withWords(item, words)])) as T;
  return value;
}

// Bookkeeping's Supplies at the end of the tab that holds the inventory list, unless the manifest places it.
const hasPart = (parts: Part[], test: (part: Part) => boolean): boolean => parts.some((part) => test(part) || (part.part === "row" && hasPart(part.parts, test)));
function withSupplies(spec: SheetSpec): SheetSpec {
  if (spec.tabs.some((tab) => hasPart(tab.parts, (part) => part.part === "supplies"))) return spec;
  const at = spec.tabs.findIndex((tab) => hasPart(tab.parts, (part) => part.part === "list" && part.path === "inventorylist"));
  if (at < 0) return spec;
  return { ...spec, tabs: spec.tabs.map((tab, index) => (index === at ? { ...tab, parts: [...tab.parts, { part: "supplies" }] } : tab)) };
}

// The same objects every render when a game has no words or features, so the spec and the context stay memoised.
const NO_WORDS: Record<string, string> = {};
const NO_FEATURES: string[] = [];

export function SheetRenderer({ spec: given, record, session, ruleset, custom, formats, words = NO_WORDS, features = NO_FEATURES }: { spec: SheetSpec; record: TableRecord; session: Session; ruleset: string; custom: Record<string, CustomPart>; formats: Record<string, Format>; words?: Record<string, string>; features?: string[] }) {
  const spec = useMemo(() => withSupplies(withWords(given, words)), [given, words]);
  // The game's formatters, for a text that names one ({ format }).
  setFormatters(formats);
  const [tab, setTab] = useState(spec.tabs[0]?.id ?? "main");
  const [modifiers, setModifiers] = useState<Record<string, unknown>>(() => startingModifiers([...(spec.top ?? []), ...spec.tabs.flatMap((item) => item.parts)]));
  const data = record.data as Row;
  const editable = canEdit(record, session);
  const gm = session.role === "dm";
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targets = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter((name): name is string => Boolean(name));
  const context: SheetContext = useMemo(() => {
    const change = (path: string, value: unknown) => void session.editCharacter(record.id, [{ path, value }]);
    const act = (call: ActionCall, given: { key?: string; value?: unknown } = {}) => {
      if ("roll" in call) {
        const key = String(given.key ?? call.key ?? "");
        const bonus = call.bonus ? num(modifiers[call.bonus]) : 0;
        // The sheet's DC and advantage, when the roll takes them (5E, 3.5E).
        const more: Record<string, unknown> = {};
        if (call.dc) more.dc = num(modifiers[call.dc]);
        if (call.advantage) more.advantage = String(modifiers[call.advantage] ?? "");
        // A save in a fight goes through the tracker (its effects count); else straight to chat.
        if (call.fight && call.roll === "save" && inFight) {
          const { dc, ...rest } = more;
          session.ct("save", { id: inFight.id, attribute: key, cl: call.dc ? dc : bonus, ...rest });
        } else session.siegeCheck(record.id, call.keyAs === "skill" ? "" : key, 0, false, { kind: call.roll, ...(call.keyAs === "skill" ? { skill: key } : {}), ...(call.bonus ? { bonus } : {}), ...more });
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
      const send = messageSender(session, call.message);
      // The host's refusal shown on the sheet (problem: the modifier its error line reads), cleared when sent.
      const problem = call.problem;
      if (problem) setModifiers((now) => ({ ...now, [problem]: "" }));
      if (send)
        void Promise.resolve(send(record.id, call.action, args)).catch((error: unknown) => {
          if (problem) setModifiers((now) => ({ ...now, [problem]: error instanceof Error ? error.message : String(error) }));
        });
    };
    return { record, session, data, editable, gm, change, act, modifiers, setModifier: (key, value) => setModifiers((now) => ({ ...now, [key]: value })), targets, features, formats };
  }, [record, session, data, editable, gm, modifiers, targets.join("\u0000"), inFight?.id, features, formats]);
  const shownTabs = spec.tabs.filter((item) => !item.gm || gm);
  const page = shownTabs.find((item) => item.id === tab) ?? shownTabs[0];
  const scope = { data };
  const parts = page?.parts.map((part, index) => <PartView key={`${page.id}-${index}`} spec={part} custom={custom} formats={formats} />);
  const art = spec.art === undefined ? undefined : (Array.isArray(spec.art) ? spec.art : [spec.art]).map((path) => at(data, path)).find((value) => value !== undefined && value !== null);
  return (
    <SheetCtx.Provider value={context}>
      <SheetFrame
        record={record}
        session={session}
        editable={editable}
        className={spec.className ? `cc-sheet ${spec.className}` : "cc-sheet"}
        attrs={{ "data-ruleset": ruleset, ...Object.fromEntries((spec.attrs ?? []).map((attr) => [`data-${attr.name}`, textOf(attr.value, scope, modifiers)])) }}
        artRace={spec.art === undefined ? undefined : String(art ?? "")}
        tabs={shownTabs.map((item) => (item.label ? { id: item.id, label: item.label } : item.id))}
        tab={page?.id ?? ""}
        onTab={setTab}
        boxes={[
          ...spec.header.identity
            .filter((field) => holds(field.when, scope, context))
            .map((field) => (
              <label key={field.path} className="cc-labelled cc-box">
                <FieldView spec={field} scope={scope} />
                <small>{field.note ?? textOf(field.label, scope, modifiers)}</small>
              </label>
            )),
          // A game's own boxes after them (a button in the header).
          ...(spec.header.custom ?? []).map((ref) => {
            const Custom = custom[ref];
            return Custom ? <Custom key={ref} /> : null;
          }),
        ]}
      >
        {(spec.top ?? []).map((part, index) => (
          <PartView key={`top-${index}`} spec={part} custom={custom} formats={formats} />
        ))}
        {page ? (
          page.page === "none" ? (
            parts
          ) : page.page === "panel" ? (
            <section className={page.pageClass ?? "cc-panel cc-page"} data-tab-page={page.id}>
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
