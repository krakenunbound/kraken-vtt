import { useMemo, useState } from "react";
import type { WizardPart, WizardSpec } from "../../../shared/rulesets/types";
import { priceOf } from "../../../shared/shop.mjs";
import type { Session, TableRecord } from "../../session/useSession";
import { useHostRolls } from "../../characters/hostRolls";
import { at, holds, num, type Row } from "../sheet/context";
import { WizardFrame } from "./WizardFrame";
import { moneyOf, StepView, type Ware, type WizardFunctions } from "./Steps";
import { tableRows, tablesOf, WizardCtx, type WizardContext } from "./context";

// A wizard laid out by its manifest (wizard: a WizardSpec): the core's frame,
// the game's steps of core parts, one spec they write into, and Finish, which
// sends the spec (as the game's build Ref shapes it) to build-character, as
// the hand-written wizards do, so kraken_build_character takes the same spec.

const flat = (parts: WizardPart[]): WizardPart[] => parts.flatMap((part) => (part.kind === "row" ? flat(part.parts) : [part]));

export function WizardRenderer({ spec: wizardSpec, session, onDone, functions }: { spec: WizardSpec; session: Session; onDone: (id: string | null) => void; functions: WizardFunctions }) {
  const parts = useMemo(() => wizardSpec.steps.flatMap((step) => flat(step.parts)), [wizardSpec]);
  const byType = useMemo(() => {
    const out = new Map<string, TableRecord[]>();
    for (const item of Object.values(session.records)) out.set(item.type, [...(out.get(item.type) ?? []), item]);
    for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [session.records]);
  // Each shop's wares: the records of its type with a price (in its unit), one of each name, by name.
  const wares = useMemo(() => {
    const out: Record<string, Ware[]> = {};
    for (const part of parts) {
      if (part.kind !== "shop") continue;
      out[part.into] = (byType.get(part.fromType) ?? [])
        .filter((item) => !(part.exclude && part.exclude.values.includes(String(at(item.data, part.exclude.path) ?? ""))) && priceOf(at(item.data, part.price.path)) !== null)
        .map((item) => ({ name: item.name, price: (priceOf(at(item.data, part.price.path)) ?? 0) / part.price.per, kind: part.type ? String(at(item.data, part.type) ?? "") : "" }))
        .filter((item, index, list) => list.findIndex((other) => other.name === item.name) === index)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [parts, byType]);
  const roller = useHostRolls(session, (label) => `${wizardSpec.chat}${label}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [spec, setSpec] = useState<Row>({});
  const choices = new Map(parts.flatMap((part) => (part.kind === "choose-record" ? [[part.into, part.fromType] as const] : [])));
  const failed = (error: unknown) => setProblem(error instanceof Error ? error.message : String(error));
  const wizard: WizardContext = {
    session,
    spec,
    get: (path) => at(spec, path),
    set: (values) => setSpec((now) => ({ ...now, ...(typeof values === "function" ? values(now) : values) })),
    busy,
    roll: async (formula, label) => {
      setBusy(true);
      setProblem("");
      try {
        return (await roller(formula, label)).total;
      } catch (error) {
        failed(error);
        return null;
      } finally {
        setBusy(false);
      }
    },
    many: async (work) => {
      setBusy(true);
      setProblem("");
      try {
        await work(async (formula, label) => (await roller(formula, label)).total);
      } catch (error) {
        failed(error);
      } finally {
        setBusy(false);
      }
    },
    lookup: (table, roll) => {
      const found = wizardSpec.tables ? (byType.get(wizardSpec.tables.type) ?? []).find((item) => String(item.data[wizardSpec.tables!.key] ?? "") === table) : undefined;
      return (found ? tableRows(found.data.rows) : []).find((row) => roll >= row.from && roll <= row.to)?.text ?? "";
    },
    recordsOf: (type) => byType.get(type) ?? [],
    chosen: (into) => (byType.get(choices.get(into) ?? "") ?? []).find((item) => item.name === at(spec, into)),
    wares,
  };
  // Ready: every part that rolls or chooses has its result (an optional roll, or a part its condition hides, aside), and no shop is overspent.
  const scope = { data: spec };
  const done = (part: WizardPart): boolean => {
    if (!holds(part.when, scope, { gm: false, editable: true })) return true;
    const value = at(spec, "into" in part ? part.into : "");
    switch (part.kind) {
      case "choose-record":
        return Boolean(wizard.chosen(part.into));
      case "record-tables": {
        const record = wizard.chosen(part.record);
        return Boolean(record) && tablesOf(record, part.path).every((_, index) => (value as Row | undefined)?.[index]);
      }
      case "roll":
        return Boolean(part.optional || value);
      case "roll-table":
        return part.rows.every((row) => (value as Row | undefined)?.[row.key]);
      case "roll-stats":
        return Boolean(value);
      case "shop":
        return Boolean(num(at(spec, part.gold.into))) && moneyOf(part, wizard, functions, wares[part.into] ?? []).left >= 0;
      default:
        return true;
    }
  };
  const ready = !busy && parts.every(done);
  const finish = async () => {
    const built = functions.builds[wizardSpec.finish.build]?.(spec, wizard);
    if (!built) return;
    setBusy(true);
    setProblem("");
    try {
      onDone(await session.buildCharacter(built));
    } catch (error) {
      failed(error);
    } finally {
      setBusy(false);
    }
  };
  if (wizardSpec.empty && !(byType.get(wizardSpec.empty.type) ?? []).length) return <p className="hint">{wizardSpec.empty.text}</p>;
  return (
    <WizardCtx.Provider value={wizard}>
      <WizardFrame hook={wizardSpec.hook} aria={wizardSpec.aria} title={wizardSpec.title} ready={ready} finishTitle={wizardSpec.finish.title} onFinish={() => void finish()} onCancel={() => onDone(null)} problem={problem}>
        {wizardSpec.steps.map((step, index) => (
          <StepView key={step.id} step={step} number={index + 1} functions={functions} />
        ))}
      </WizardFrame>
    </WizardCtx.Provider>
  );
}
