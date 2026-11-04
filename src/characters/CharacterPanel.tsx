import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { useEffect, useRef, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { toFgXml, toKrakenFile } from "../../shared/siege/interchange.mjs";
import { Picture } from "./ArtPicker";
import { Wizard } from "./Wizard";
import { CCSheet } from "./CCSheet";
import { Sheet5e, Wizard5e } from "./Sheet5e";

// Characters in and out: Import reads a file from another table (Kraken,
// Fantasy Grounds XML, Foundry or Roll20 JSON; dropping one on the list does
// the same), Export saves the shown character as Kraken's file or FG's XML.
function useCharacterFiles(session: Session, onImported: (id: string) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const importFile = async (file: File) => {
    setStatus(`Reading ${file.name}…`);
    try {
      const id = await session.importCharacter(await file.text());
      setStatus(`Imported ${file.name}. What did not match is in the character's notes.`);
      onImported(id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import that file.");
    }
  };
  const picker = (
    <input
      ref={input}
      type="file"
      hidden
      accept=".json,.xml,application/json,text/xml"
      data-action="import-character-file"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void importFile(file);
      }}
    />
  );
  const drop = {
    onDragOver: (event: React.DragEvent) => {
      if (event.dataTransfer.types.includes("Files")) event.preventDefault();
    },
    onDrop: (event: React.DragEvent) => {
      const file = event.dataTransfer.files?.[0];
      if (!file) return;
      event.preventDefault();
      void importFile(file);
    },
  };
  return { picker, drop, status, setStatus, open: () => input.current?.click() };
}

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name.replace(/[\/:*?"<>|]+/g, "_");
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FileButtons({ files, current }: { files: ReturnType<typeof useCharacterFiles>; current: TableRecord | null }) {
  const [menu, setMenu] = useState(false);
  return (
    <span className="character-files">
      <button type="button" className="character-file-button" title="Import a character (Kraken, Fantasy Grounds, Foundry or Roll20 file)" aria-label="Import character" data-action="import-character" onClick={files.open}>
        <Icon name="import" size={18} />
      </button>
      <button type="button" className="character-file-button" title={current ? `Export ${current.name}` : "Export"} aria-label="Export character" data-action="export-character" disabled={!current} onClick={() => setMenu(!menu)}>
        <Icon name="export" size={18} />
      </button>
      {menu && current ? (
        <span className="character-export-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            data-export="kraken"
            onClick={() => {
              setMenu(false);
              save(`${current.name}.kraken.json`, toKrakenFile(current), "application/json");
            }}
          >
            Kraken file (.json)
          </button>
          <button
            type="button"
            role="menuitem"
            data-export="fg"
            onClick={() => {
              setMenu(false);
              save(`${current.name}.xml`, toFgXml(current), "application/xml");
            }}
          >
            Fantasy Grounds (.xml)
          </button>
        </span>
      ) : null}
      {files.picker}
    </span>
  );
}

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
  const files = useCharacterFiles(session, (id) => {
    setCreating(false);
    setSelected(id);
  });
  const status = files.status ? (
    <p className="hint character-file-status" role="status" onClick={() => files.setStatus("")}>
      {files.status}
    </p>
  ) : null;

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
          <FileButtons files={files} current={current} />
        </div>
        {status}
        {creating ? (
          session.ruleset === "D&D 5E" ? (
            <Wizard5e
              session={session}
              onDone={(id) => {
                setCreating(false);
                if (id) setSelected(id);
              }}
            />
          ) : (
            <Wizard
              session={session}
              onDone={(id) => {
                setCreating(false);
                if (id) setSelected(id);
              }}
            />
          )
        ) : current ? (
          current.data.ruleset === "dnd5e" ? <Sheet5e record={current} session={session} /> : <CCSheet record={current} session={session} />
        ) : (
          <p className="hint">You have no character yet. Make one with the new character button.</p>
        )}
      </section>
    );
  }

  return (
    <section className="characters" role="tabpanel">
      <aside className="character-list" {...files.drop}>
        <div className="character-list-buttons">
          <button type="button" className="new-character-button" title="New character" aria-label="New character" onClick={() => setCreating(true)} data-action="new-character">
            <Icon name="add-character" size={22} />
          </button>
          <FileButtons files={files} current={current} />
        </div>
        {status}
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
        session.ruleset === "D&D 5E" ? (
          <Wizard5e
            session={session}
            onDone={(id) => {
              setCreating(false);
              if (id) setSelected(id);
            }}
          />
        ) : (
          <Wizard
            session={session}
            onDone={(id) => {
              setCreating(false);
              if (id) setSelected(id);
            }}
          />
        )
      ) : current ? (
        current.data.ruleset === "dnd5e" ? <Sheet5e record={current} session={session} /> : <CCSheet record={current} session={session} />
      ) : null}
    </section>
  );
}
