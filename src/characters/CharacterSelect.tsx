import { useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { slotDrag } from "../ui/QuickSlots";
import { Icon } from "../ui/icons";
import { Picture } from "./ArtPicker";
import { canMakeBlank, createBlank, ExportButton, useCharacterFiles } from "./characterFiles";

// FG's Character Selection, what the sidebar's Characters opens for everyone:
// the GM's charselect_host (every character at the table) and a player's
// charselect_client (every character they may take or hold). Each character is
// a card: portrait, name, level, and who holds it ("Server" when no one does).
// A card opens its sheet in its own window; a player takes a card no one holds
// with a click; another player's is shown but cannot be picked. Along the top,
// as FG's list controls: the pencil (edit mode: each card's Export, and the
// GM's Delete), New character (the Character Wizard), Create (a blank one, in
// a game that has them), Import (a file; dropping one on the list does the
// same), and the filter.
// onSheet: open a character's sheet window. onWizard: the Character Wizard (in a window of its own).
type Card = { id: string; name: string; owner: string; portrait: string | null; species: string; classes: string; level: number };

export function CharacterSelect({ session, onSheet, onWizard, onClose }: { session: Session; onSheet: (id: string, name: string) => void; onWizard: () => void; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(false);
  const gm = session.role === "dm";
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  // The GM keeps the list open (FG's host list); a player's closes once they have picked.
  const done = (id: string, name: string) => {
    onSheet(id, name);
    if (!gm) onClose();
  };
  const files = useCharacterFiles(session, (id) => done(id, session.records[id]?.name ?? "Character"));
  const roster = new Map(session.roster.map((entry) => [entry.id, entry]));
  // The GM: every character record. A player: the table's roster (theirs, free ones, others' shown held).
  const cards: Card[] = gm
    ? Object.values(session.records)
        .filter((record) => record.type === "character")
        .map((record) => {
          const entry = roster.get(record.id);
          return { id: record.id, name: record.name, owner: record.owner, portrait: entry?.portrait ?? (typeof record.data.portrait === "string" ? record.data.portrait : null), species: entry?.species ?? "", classes: entry?.classes ?? "", level: entry?.level ?? Number(record.data.level ?? 0) };
        })
    : session.roster;
  const shown = cards.filter((entry) => entry.name.toLowerCase().includes(filter.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  const pick = async (entry: Card) => {
    if (gm || (entry.owner === me && me)) return done(entry.id, entry.name);
    if (entry.owner) return;
    setStatus(`Taking ${entry.name}…`);
    try {
      await session.takeCharacter(entry.id);
      setStatus("");
      done(entry.id, entry.name);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not take ${entry.name}.`);
    }
  };
  const remove = (entry: Card) => {
    if (!window.confirm(`Delete ${entry.name}? This cannot be undone.`)) return;
    void session.op({ op: "delete", id: entry.id }).catch((error) => setStatus(error instanceof Error ? error.message : `Could not delete ${entry.name}.`));
  };

  return (
    <section className="charselect" data-window="charselect">
      <div className="charselect-buttons">
        <button type="button" className={editing ? "character-file-button on" : "character-file-button"} data-action="charselect-edit" aria-pressed={editing} aria-label="Edit the list" title="Edit the list: export a character, or (the GM) delete one" onClick={() => setEditing(!editing)}>
          <Icon name="pen" size={15} />
        </button>
        <button
          type="button"
          className="charselect-wizard"
          data-action="new-character"
          title="Make a new character with the Character Wizard"
          onClick={() => {
            onWizard();
            if (!gm) onClose();
          }}
        >
          <Icon name="add-character" size={16} /> New character
        </button>
        {canMakeBlank(session) ? (
          <button
            type="button"
            className="ghost"
            data-action="blank-character"
            title="A blank sheet, filled by hand: drag a race, a class, spells and gear onto it from the sidebar's lists"
            onClick={() =>
              void createBlank(session)
                .then((id) => done(id, "New character"))
                .catch((error) => setStatus(error instanceof Error ? error.message : "Could not make the character."))
            }
          >
            Create
          </button>
        ) : null}
        <button type="button" className="ghost" data-action="import-character" onClick={files.open} title="Import a character (a Maelstrom, XML, Foundry or Roll20 file)">
          <Icon name="import" size={15} /> Import
        </button>
        {files.picker}
        <input className="charselect-filter" aria-label="Filter characters" placeholder="Filter by name" value={filter} onChange={(event) => setFilter(event.target.value)} />
      </div>
      {status || files.status ? (
        <p className="hint character-file-status" role="status" onClick={() => (setStatus(""), files.setStatus(""))}>
          {status || files.status}
        </p>
      ) : null}
      <ul className="charselect-cards" {...files.drop}>
        {shown.map((entry) => {
          const mine = gm || (Boolean(me) && entry.owner === me);
          const free = !entry.owner;
          const record: TableRecord | undefined = session.records[entry.id];
          return (
            <li key={entry.id} className="charselect-item">
              <button
                type="button"
                className={mine ? "charselect-card mine" : free ? "charselect-card free" : "charselect-card held"}
                data-charselect={entry.id}
                disabled={!mine && !free}
                title={mine ? `${entry.name}: open the sheet` : free ? `Take ${entry.name}` : `${entry.name} is ${entry.owner}'s`}
                onClick={() => void pick(entry)}
                {...(mine ? slotDrag({ kind: "sheet", record: entry.id, label: entry.name }) : {})}
              >
                <span className="charselect-face">{entry.portrait ? <Picture session={session} id={entry.portrait} alt="" still /> : null}</span>
                <span className="charselect-text">
                  <b>{entry.name}</b>
                  <small>Level {entry.level}</small>
                  {entry.classes || entry.species ? <small>{[entry.species, entry.classes].filter(Boolean).join(" · ")}</small> : null}
                  <strong className="charselect-holder">{free ? "Server" : gm ? `Owned by ${entry.owner}` : mine ? "Yours" : entry.owner}</strong>
                </span>
              </button>
              {editing && mine && record ? (
                <span className="charselect-tools">
                  <ExportButton record={record} />
                  {gm ? (
                    <button type="button" className="character-file-button" data-action="delete-character" aria-label={`Delete ${entry.name}`} title={`Delete ${entry.name}`} onClick={() => remove(entry)}>
                      <Icon name="trash" size={15} />
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className="hint empty-state">{cards.length ? "No character by that name." : "No characters yet. Make one with New character above (the Character Wizard), or import one."}</li>
        ) : null}
      </ul>
    </section>
  );
}
