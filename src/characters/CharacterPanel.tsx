import { useEffect, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { sheetFor, wizardFor } from "../rulesets";

// A character's window: its sheet (in its own game's layout), or the
// campaign game's character wizard. Only the character, as FG's charsheet:
// picking, making, importing and exporting characters is Character
// Selection's (CharacterSelect.tsx), which the sidebar's Characters opens.

// The sheet of a character's own game, and the campaign game's wizard (src/rulesets).
function CharacterSheet({ record, session }: { record: TableRecord; session: Session }) {
  const Sheet = sheetFor(record);
  return <Sheet record={record} session={session} />;
}
function ChosenWizard({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const Chosen = wizardFor(session.ruleset);
  return <Chosen session={session} onDone={onDone} />;
}

// selected: the character to show (else the first this seat can see).
// create: open on the creation wizard; when it finishes, the new character's sheet.
export function CharacterPanel({ session, selected: chosen, create = false, onTitle }: { session: Session; selected?: string | null; create?: boolean; onTitle?: (title: string) => void }) {
  const characters = Object.values(session.records)
    .filter((record) => record.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<string | null>(chosen ?? null);
  const [creating, setCreating] = useState(create);
  useEffect(() => {
    if (chosen) setSelected(chosen);
  }, [chosen]);
  const current = characters.find((record) => record.id === selected) ?? (creating ? null : characters[0]) ?? null;
  // Once the wizard is done the window shows a sheet, so it takes the character's name.
  const shownName = !creating && create && current ? current.name : "";
  useEffect(() => {
    if (shownName) onTitle?.(shownName);
  }, [shownName]);
  return (
    <section className="characters dock-characters" role="tabpanel">
      {creating ? (
        <ChosenWizard
          session={session}
          onDone={(id) => {
            setCreating(false);
            if (id) setSelected(id);
          }}
        />
      ) : current ? (
        <CharacterSheet record={current} session={session} />
      ) : (
        <p className="hint empty-state">No character here: make one, or take one, in Character Selection (the sidebar's Characters).</p>
      )}
    </section>
  );
}
