// The spells a character knows (its `spells` list, one name a line), each with
// Cast: the host reads the book's spell from its words and casts it at the
// character's targets (3.5E and 2E: slots, saves, damage by caster level,
// effects; an area spell with no targets asks the map for its template). A
// spell's button also drags onto a creature, to cast at it alone.
import { useSheet } from "../sheet/context";
import { ACTION_DRAG } from "../../effects/drops";

const plain = (html: unknown) => {
  const source = html && typeof html === "object" ? ((html as { __rich?: unknown }).__rich ?? "") : html;
  return String(source ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

export function SpellCasts() {
  const { record, session, editable, data } = useSheet();
  const known = (Array.isArray(data.spells) ? data.spells : String(data.spells ?? "").split("\n")).map((name) => String(name).trim()).filter(Boolean);
  if (!known.length) return null;
  const book = Object.values(session.records).filter((item) => item.type === "spell" || item.type === "spelldesc");
  return (
    <ul className="five-spells core-spell-casts">
      {known.map((name) => {
        const spell = book.find((item) => item.name.toLowerCase() === name.toLowerCase());
        const level = spell ? String(spell.data.level ?? "") : "";
        return (
          <li key={name} data-spell={name}>
            <b>{name}</b> {level ? <small className="hint">{/^\d+$/.test(level) ? `level ${level}` : level}</small> : null}
            {editable ? (
              <button
                type="button"
                data-action="cast"
                title={spell ? "Cast it at your targets (an area spell with none: place its template on the map)" : "Not in the active books: the host cannot cast it"}
                disabled={!spell}
                draggable
                onDragStart={(event) => event.dataTransfer.setData(ACTION_DRAG, JSON.stringify({ kind: "cast", recordId: record.id, power: name }))}
                onClick={() => session.ct("cast", { recordId: record.id, power: name })}
              >
                Cast
              </button>
            ) : null}
            {spell ? <p className="hint">{plain(spell.data.shortdescription || spell.data.description).slice(0, 220)}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
