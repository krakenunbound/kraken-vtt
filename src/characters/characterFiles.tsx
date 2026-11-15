import { useEffect, useRef, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { toFgXml, toKrakenFile } from "../../shared/siege/interchange.mjs";
import { manifestOf } from "../rulesets";
import { Icon } from "../ui/icons";

// Characters in and out, and a blank one: what Character Selection offers
// (FG's charselect: its + , its import, and in edit mode each card's export).

// Import reads a file from another table (Kraken, Fantasy Grounds XML, Foundry
// or Roll20 JSON; dropping one on the list does the same).
export function useCharacterFiles(session: Session, onImported: (id: string) => void) {
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

// Export a character as Kraken's file or FG's XML (FG's button_exportchar). The menu closes on a
// click elsewhere or Escape.
export function ExportButton({ record }: { record: TableRecord }) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  // The menu sits in the top layer beside the button (right of it, else left), so the card list's
  // scrolling neither clips it nor puts it over the character's name.
  useEffect(() => {
    if (!menu) return;
    const pop = list.current;
    const at = box.current?.getBoundingClientRect();
    if (pop && at) {
      pop.showPopover?.();
      const width = pop.offsetWidth;
      pop.style.left = `${at.right + 4 + width <= window.innerWidth ? at.right + 4 : Math.max(4, at.left - 4 - width)}px`;
      pop.style.top = `${Math.min(at.top, window.innerHeight - pop.offsetHeight - 4)}px`;
    }
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setMenu(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);
  return (
    <span className="character-files" ref={box}>
      <button type="button" className="character-file-button" title={`Export ${record.name}`} aria-label={`Export ${record.name}`} data-action="export-character" onClick={() => setMenu(!menu)}>
        <Icon name="export" size={16} />
      </button>
      {menu ? (
        <span className="character-export-menu" role="menu" popover="manual" ref={list}>
          <button
            type="button"
            role="menuitem"
            data-export="kraken"
            onClick={() => {
              setMenu(false);
              save(`${record.name}.kraken.json`, toKrakenFile(record), "application/json");
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
              save(`${record.name}.xml`, toFgXml(record), "application/xml");
            }}
          >
            Fantasy Grounds (.xml)
          </button>
        </span>
      ) : null}
    </span>
  );
}

// A blank character (FG's Create): scores of 10, nothing else; the GM's or
// this player's. It is filled by hand: a race, a class, spells and gear
// dragged onto it from the sidebar's lists, scores typed. Only in a game whose
// manifest allows it (C&C, Worldbuilding); the others make one with the wizard.
export const canMakeBlank = (session: Session) => Boolean(manifestOf(session.ruleset).blank);
export async function createBlank(session: Session, name = "New character") {
  const gm = session.role === "dm";
  const attributes = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: 10, prime: 0 }]));
  return session.op({ op: "create", input: { type: "character", name, visibility: gm ? "gm" : "owner", data: { attributes, level: 0, hp: { total: 0, wounds: 0 } } } });
}
