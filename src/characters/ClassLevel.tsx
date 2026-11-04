import { useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { classKey, classPackages, isRaceClass, multiRule } from "../../shared/siege/combine.mjs";

type Row = Record<string, unknown>;
const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const capital = (text: string) => `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

// FG's Class & Level (the level-up wizard's first page): each class with its
// level and what it is (multi-class, supporting, dual, reclass), Level Up on
// those that can rise, and Change Class (the Adventurer's Backpack): Add Class
// (dual class: the combination table and a prime the character has) or Reclass.
export function ClassLevel({ record, session, editable }: { record: TableRecord; session: Session; editable: boolean }) {
  const [changing, setChanging] = useState(false);
  const data = record.data as Row;
  const own = classPackages(data) as [string, Row][];
  const books = Object.values(session.records)
    .filter((item) => item.type === "siegepackage" && String((item.data as Row).packagetype).toLowerCase() === "class")
    .map((item) => item.data as Row)
    .filter((pkg, index, all) => Object.values(pkg.levels ?? {}).length > 0 && all.findIndex((other) => other.name === pkg.name) === index)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const noteOf = (pkg: Row) =>
    pkg.ccreclassorigin ? "abandoned (reclass): no longer advances" : pkg.ccreclass ? "reclass" : pkg.ccdualclass ? "dual class (no hit points)" : pkg.ccdualorigin ? "original class" : pkg.ccsupport ? "supporting class: rises with the principal class" : pkg.ccprincipal ? "principal class (enhanced)" : pkg.ccmulti ? "multi-class: all its classes rise together" : "";
  const canLevel = (pkg: Row) => !pkg.ccreclassorigin && !pkg.ccsupport;
  const current = own.length === 1 ? own[0][1] : null;
  const refusal = own.length === 0 ? "The character has no class yet: use the Character Wizard." : own.length > 1 ? "The character already has two classes (dual classed or reclassed)." : current && isRaceClass(current.name) ? "A race class (dwarf, elf, gnome, halfling) cannot be combined with another class (Adventurer's Backpack)." : "";
  const plus = Object.values((data.ccplus as Record<string, Row>) ?? {});
  return (
    <section className="cc-panel cc-classlevel" aria-label="Class and level">
      <h4>Classes</h4>
      {own.map(([key, pkg]) => (
        <div key={key} className="cc-class-row" data-class-row={String(pkg.name)}>
          <b>{String(pkg.name)}</b>
          <span className="cc-num">{String(pkg.level ?? 1)}</span>
          <small className="hint">{noteOf(pkg)}</small>
          {editable && canLevel(pkg) ? (
            <button type="button" data-action="level-up-class" onClick={() => session.levelUp(record.id, key)} title={`Level up ${String(pkg.name)}`}>
              Level Up
            </button>
          ) : (
            <span />
          )}
        </div>
      ))}
      {plus.map((row) => (
        <div key={String(row.name)} className="cc-class-row">
          <b>{String(row.name)}</b>
          <span className="cc-num">0</span>
          <small className="hint">class plus (zero level)</small>
          <span />
        </div>
      ))}
      {editable ? (
        <>
          <h4>
            Change Class (Adventurer's Backpack){" "}
            {!refusal ? (
              <button type="button" data-action="change-class-open" onClick={() => setChanging(!changing)}>
                {changing ? "Cancel" : "Change…"}
              </button>
            ) : null}
          </h4>
          {refusal ? (
            <p className="hint">{refusal}</p>
          ) : changing && current ? (
            <>
              <p className="hint">Add a class (dual class) or Reclass. Letters are the Adventurer's Backpack combination tables: A allowed, S impractical, U unusual (Castle Keeper's agreement), E/G/H/O race limits.</p>
              <div className="cc-change-list">
                {books
                  .filter((pkg) => classKey(pkg.name) !== classKey(current.name) && !isRaceClass(pkg.name))
                  .map((pkg) => {
                    const rule = multiRule(current.name, pkg.name, data.race);
                    const primes = STATS.filter((stat) => Number((pkg.primes as Row | undefined)?.[stat]) === 1);
                    const held = primes.length === 0 || primes.some((stat) => Number((data.attributes as Record<string, Row> | undefined)?.[stat]?.prime) === 1);
                    const why = !rule.allowed ? rule.words : !held ? `Dual class needs a prime the character has (${capital(primes[0])} is not prime); reclass swaps primes.` : rule.words;
                    return (
                      <div key={String(pkg.name)} className="cc-change-row" data-change-row={String(pkg.name)}>
                        <b>{String(pkg.name)}</b>
                        <small>
                          {rule.code ? `[${rule.code}] ` : ""}
                          {why}
                        </small>
                        {rule.allowed && held ? (
                          <button type="button" data-action="dual-class" onClick={() => session.changeClass(record.id, "dual", String(pkg.name))} title="Keep your class and add this one at 1st level (experience is split)">
                            Add Class
                          </button>
                        ) : (
                          <span />
                        )}
                        <button type="button" data-action="reclass" onClick={() => session.changeClass(record.id, "reclass", String(pkg.name))} title="Abandon the current class for this one (Adventurer's Backpack)">
                          Reclass
                        </button>
                      </div>
                    );
                  })}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
