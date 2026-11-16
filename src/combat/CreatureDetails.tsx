import type { Session } from "../session/useSession";
import { Icon } from "../ui/icons";
import { useWindows } from "../ui/Windows";

// FG's combat tracker sections for a creature (the GM's): space and reach,
// offense, defense, and each trait and action as a name that opens its text
// in place (FG opens a window for each). The whole record is one click away.
type Row = { name?: unknown; desc?: unknown };
const SPACE: Record<string, number> = { tiny: 2.5, small: 5, medium: 5, large: 10, huge: 15, gargantuan: 20 };
const LISTS: [string, string][] = [
  ["traits", "Traits"],
  ["actions", "Actions"],
  ["bonusactions", "Bonus actions"],
  ["reactions", "Reactions"],
  ["legendaryactions", "Legendary actions"],
  ["lairactions", "Lair actions"],
];
const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");
const rowsOf = (value: unknown): { name: string; desc: string }[] =>
  value && typeof value === "object"
    ? Object.values(value as Record<string, Row>)
        .filter((row) => row && typeof row === "object" && text(row.name))
        .map((row) => ({ name: text(row.name), desc: text(row.desc) }))
    : [];

export function CreatureDetails({ session, recordId, name }: { session: Session; recordId: string; name: string }) {
  const windows = useWindows();
  const record = session.records[recordId];
  if (!record || record.type !== "npc") return null;
  const data = record.data ?? {};
  const actions = rowsOf(data.actions);
  // Reach: the record's own, else the longest "reach N ft." among its actions, else 5 ft.
  const reaches = actions.map((row) => Number(/reach (\d+)\s*ft/i.exec(row.desc)?.[1])).filter(Number.isFinite);
  const space = Number(data.space) || SPACE[text(data.size).toLowerCase()] || 0;
  const reach = Number(data.reach) || (reaches.length ? Math.max(...reaches) : space ? 5 : 0);
  const fields = (pairs: [string, string][]) => pairs.filter(([, value]) => value && value !== "-");
  const offense = fields([
    ["Speed", text(data.speed)],
    ["Senses", text(data.senses)],
    ["Skills", text(data.skills)],
    ["Languages", text(data.languages)],
    ["CR", text(data.cr)],
  ]);
  const defense = fields([
    ["AC", [text(data.ac), text(data.actext)].filter(Boolean).join(" ")],
    ["Hit points", [text(data.hp), text(data.hd)].filter(Boolean).join(" ")],
    ["Saves", text(data.savingthrows)],
    ["Resistant", text(data.damageresistances)],
    ["Immune", text(data.damageimmunities)],
    ["Vulnerable", text(data.damagevulnerabilities)],
    ["Condition immune", text(data.conditionimmunities)],
  ]);
  const lists = LISTS.map(([key, label]) => [label, rowsOf(data[key])] as const).filter(([, rows]) => rows.length > 0);
  return (
    <div className="ct-creature" data-creature-details={recordId}>
      <div className="ct-creature-head">
        {space ? (
          <span className="ct-creature-chip" title="Space and reach">
            <Icon name="fit" size={13} /> {text(data.size) || "Space"} {space} ft · reach {reach} ft
          </span>
        ) : null}
        <button type="button" className="ghost" data-action="open-creature" title={`Open ${name}'s record (its whole stat block)`} onClick={() => windows.open("record", record.name, record.id)}>
          <Icon name="open" size={13} /> Record
        </button>
      </div>
      {offense.length ? (
        <dl className="ct-creature-part" aria-label="Offense">
          <dt className="ct-creature-title">
            <Icon name="damage" size={13} /> Offense
          </dt>
          {offense.map(([label, value]) => (
            <dd key={label}>
              <b>{label}</b> {value}
            </dd>
          ))}
        </dl>
      ) : null}
      {defense.length ? (
        <dl className="ct-creature-part" aria-label="Defense">
          <dt className="ct-creature-title">
            <Icon name="shield" size={13} /> Defense
          </dt>
          {defense.map(([label, value]) => (
            <dd key={label}>
              <b>{label}</b> {value}
            </dd>
          ))}
        </dl>
      ) : null}
      {lists.map(([label, rows]) => (
        <div key={label} className="ct-creature-part" aria-label={label}>
          <span className="ct-creature-title">{label}</span>
          {rows.map((row) => (
            <details key={row.name} className="ct-trait" data-trait={row.name}>
              <summary>{row.name}</summary>
              <p>{row.desc || "No text."}</p>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}
