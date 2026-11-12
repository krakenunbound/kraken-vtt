import { useEffect, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { catalog, npcStats } from "../../shared/mgt2/rules.mjs";

// A Traveller NPC as the GM keeps it (FG's MGT2 NPC sheet): the six
// characteristics, skills as a line of text, armour, weapons from Kraken's
// list (their damage and skill from it) and notes. The tracker fights with
// these: hits are STR + DEX + END, attacks are the weapons' (rules.npcStats).
const STATS = ["str", "dex", "end", "int", "edu", "soc"] as const;
type Row = { name?: string; damage?: string; skill?: string; traits?: string; range?: string };

function Text({ label, value, onSave, area = false }: { label: string; value: string; onSave: (value: string) => void; area?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft !== value) onSave(draft);
  };
  return area ? <textarea aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} /> : <input aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => event.key === "Enter" && save()} />;
}

export function NpcMgt2({ session, record }: { session: Session; record: TableRecord }) {
  const data = (record.data ?? {}) as Record<string, unknown>;
  const scores = (data.characteristics ?? {}) as Record<string, { score?: number } | undefined>;
  const weapons = (data.weapons ?? {}) as Record<string, Row>;
  const patch = (value: Record<string, unknown>) => void session.op({ op: "update", id: record.id, patch: { data: value } });
  const stats = npcStats(data) as { hp: number; ac: number; attacks: { name: string; bonus: number; damage: string }[]; scores: Record<string, number> | null };
  const list = (catalog() as { name: string; type: string; cost: string }[]).filter((item) => item.type === "Weapons");
  const [pick, setPick] = useState(list[0]?.name ?? "");
  return (
    <section className="npc-mgt2" data-npc-mgt2={record.id}>
      <div className="life-stats">
        {STATS.map((stat) => (
          <label key={stat} className="npc-stat">
            {stat.toUpperCase()}
            <Text label={stat.toUpperCase()} value={scores[stat]?.score === undefined ? "" : String(scores[stat]?.score)} onSave={(value) => patch({ characteristics: { [stat]: { score: Math.max(0, Math.min(20, Math.round(Number(value) || 0))) } } })} />
          </label>
        ))}
      </div>
      <p className="hint" data-npc-hits={stats.hp}>
        {stats.scores ? `Hits ${stats.hp} (STR + DEX + END)` : "Give STR, DEX and END for its hits."} · Armour {stats.ac}
        {stats.attacks.length ? ` · ${stats.attacks.map((attack) => `${attack.name} ${attack.bonus >= 0 ? "+" : ""}${attack.bonus}, ${attack.damage}`).join("; ")}` : ""}
      </p>
      <label className="cc-inline">
        Skills <Text label="Skills" value={typeof data.skills === "string" ? data.skills : ""} onSave={(value) => patch({ skills: value })} />
      </label>
      <label className="cc-inline">
        Armour <Text label="Armour" value={data.armour === undefined ? "" : String(data.armour)} onSave={(value) => patch({ armour: Math.max(0, Math.round(Number(value) || 0)) })} />
      </label>
      <h4>Weapons</h4>
      <ul className="npc-weapons">
        {Object.entries(weapons).map(([key, row]) => (
          <li key={key} data-npc-weapon={row.name}>
            {row.name} {row.damage ? <small className="hint">{row.damage}</small> : null}
            <button type="button" aria-label={`Remove ${row.name}`} onClick={() => patch({ weapons: { [key]: null } })}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <p className="cc-inline">
        <select aria-label="Add a weapon" value={pick} onChange={(event) => setPick(event.target.value)}>
          {list.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <button type="button" data-action="npc-add-weapon" onClick={() => patch({ weapons: { [`id-${Date.now().toString(36)}`]: { name: pick } } })}>
          Add
        </button>
      </p>
      <label>
        Notes
        <Text label="Notes" area value={typeof data.text === "string" ? data.text : ""} onSave={(value) => patch({ text: value })} />
      </label>
    </section>
  );
}
