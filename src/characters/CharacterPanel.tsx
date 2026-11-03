import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { useEffect, useState } from "react";
import type { Session } from "../session/useSession";
import { Picture } from "./ArtPicker";
import { Wizard } from "./Wizard";
import { CCSheet } from "./CCSheet";

// dock: the player's side panel beside the map, with a picker in place of the list.
export function CharacterPanel({ session, dock = false, selected: chosen }: { session: Session; dock?: boolean; selected?: string | null }) {
  const characters = Object.values(session.records)
    .filter((record) => record.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (chosen) setSelected(chosen);
  }, [chosen]);
  const current = characters.find((record) => record.id === selected) ?? characters[0] ?? null;

  if (dock) {
    return (
      <section className="characters dock-characters" role="tabpanel">
        <div className="dock-picker">
          {characters.length > 1 ? (
            <select aria-label="Character" value={current?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>
              {characters.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="new-character-button" title="New character" aria-label="New character" onClick={() => setCreating(true)} data-action="new-character">
            <Icon name="add-character" size={22} />
          </button>
        </div>
        {creating ? (
          <Wizard
            session={session}
            onDone={(id) => {
              setCreating(false);
              if (id) setSelected(id);
            }}
          />
        ) : current ? (
          <CCSheet record={current} session={session} />
        ) : (
          <p className="hint">You have no character yet. Make one with the new character button.</p>
        )}
      </section>
    );
  }

  return (
    <section className="characters" role="tabpanel">
      <aside className="character-list">
        <button type="button" className="new-character-button" title="New character" aria-label="New character" onClick={() => setCreating(true)} data-action="new-character">
          <Icon name="add-character" size={22} />
        </button>
        {characters.length === 0 ? <p className="hint">No characters yet.</p> : null}
        <ul>
          {characters.map((record) => (
            <li key={record.id}>
              <button type="button" className={record.id === current?.id ? "selected" : ""} onClick={() => setSelected(record.id)} {...slotDrag({ kind: "sheet", record: record.id, label: record.name })}>
                <span className="chip-face">
                  {typeof record.data.portrait === "string" && record.data.portrait ? <Picture session={session} id={record.data.portrait} alt="" /> : record.name.slice(0, 1)}
                </span>
                <span className="list-name">
                  {record.name}
                  <small className="hint">{record.owner || "GM"}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {creating ? (
        <Wizard
          session={session}
          onDone={(id) => {
            setCreating(false);
            if (id) setSelected(id);
          }}
        />
      ) : current ? (
        <CCSheet record={current} session={session} />
      ) : null}
    </section>
  );
}
