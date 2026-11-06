import { useState } from "react";
import type { RosterEntry, Session } from "../session/useSession";
import { slotDrag } from "../ui/QuickSlots";
import { Picture } from "./ArtPicker";
import { canMakeBlank, createBlank, useCharacterFiles } from "./CharacterPanel";

// FG's Character Selection (charselect_client): what a player is shown on
// joining. Every character at the table as a card (portrait, name, level, and
// who holds it: "Server" when no one does). A card no one holds is taken with
// a click and becomes the player's; their own opens its sheet; one another
// player holds is shown but cannot be picked. Character Wizard makes a new one,
// Create a blank one to fill by hand,
// Import reads one from a file; the filter finds one by name.
// onWizard: the Character Wizard opens in the Characters window (it needs the room).
export function CharacterSelect({ session, onSheet, onWizard, onClose }: { session: Session; onSheet: (id: string, name: string) => void; onWizard: () => void; onClose: () => void }) {
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const done = (id: string, name: string) => {
    onSheet(id, name);
    onClose();
  };
  const files = useCharacterFiles(session, (id) => done(id, session.records[id]?.name ?? "Character"));
  const shown = session.roster.filter((entry) => entry.name.toLowerCase().includes(filter.trim().toLowerCase()));

  const pick = async (entry: RosterEntry) => {
    if (entry.owner === me && me) return done(entry.id, entry.name);
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

  return (
    <section className="charselect" data-window="charselect">
      <div className="charselect-buttons">
        <button type="button" className="charselect-wizard" data-action="new-character" onClick={() => {
            onWizard();
            onClose();
          }}>
          Character Wizard
        </button>
        {canMakeBlank(session) ? (
          <button
            type="button"
            className="ghost"
            data-action="charselect-create"
            title="A blank sheet, filled by hand: drag a race, a class, spells and gear onto it from the sidebar's lists (FG's Create)"
            onClick={() =>
              void createBlank(session)
                .then((id) => done(id, "New character"))
                .catch((error) => setStatus(error instanceof Error ? error.message : "Could not make the character."))
            }
          >
            Create
          </button>
        ) : null}
        <button type="button" className="ghost" data-action="charselect-import" onClick={files.open} title="Import a character (Kraken, Fantasy Grounds, Foundry or Roll20 file)">
          Import
        </button>
        {files.picker}
      </div>
      {status || files.status ? (
        <p className="hint" role="status">
          {status || files.status}
        </p>
      ) : null}
      <ul className="charselect-cards" {...files.drop}>
        {shown.map((entry) => {
          const mine = Boolean(me) && entry.owner === me;
          const free = !entry.owner;
          return (
            <li key={entry.id}>
              <button
                type="button"
                className={mine ? "charselect-card mine" : free ? "charselect-card free" : "charselect-card held"}
                data-charselect={entry.id}
                disabled={!mine && !free}
                title={mine ? `${entry.name}: open your sheet` : free ? `Take ${entry.name}` : `${entry.name} is ${entry.owner}'s`}
                onClick={() => void pick(entry)}
                {...(mine ? slotDrag({ kind: "sheet", record: entry.id, label: entry.name }) : {})}
              >
                <span className="charselect-face">{entry.portrait ? <Picture session={session} id={entry.portrait} alt="" /> : null}</span>
                <span className="charselect-text">
                  <b>{entry.name}</b>
                  <small>Level {entry.level}</small>
                  {entry.classes || entry.species ? <small>{[entry.species, entry.classes].filter(Boolean).join(" · ")}</small> : null}
                  <strong className="charselect-holder">{free ? "Server" : mine ? "Yours" : entry.owner}</strong>
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 ? <li className="hint">{session.roster.length ? "No character by that name." : "No characters yet. Make one with the Character Wizard."}</li> : null}
      </ul>
      <input className="charselect-filter" aria-label="Filter characters" placeholder="Filter by name" value={filter} onChange={(event) => setFilter(event.target.value)} />
    </section>
  );
}
