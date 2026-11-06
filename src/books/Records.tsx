import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";

// FG's campaign lists (the sidebar's Campaign and Character groups, each a
// master index): the records of this campaign and its active books, a list per
// kind, grouped by category. The GM sees them all and shares one with the
// players or hides it again (FG's Share and Unshare, and the list's sharing
// icon); the All / Shared button shows only what is shared. A player sees only
// what is shared with them (FG's player lists), read only. A name opens the
// record; it is a link (drag it to a quick slot, a note or a story).

// The lists, in FG's order: what a record's type (and, for C&C's packages, its
// package type) is listed under.
const LISTS: { id: string; label: string; group: string }[] = [
  { id: "npc", label: "NPCs", group: "Campaign" },
  { id: "item", label: "Items", group: "Campaign" },
  { id: "background", label: "Backgrounds", group: "Character" },
  { id: "class", label: "Classes", group: "Character" },
  { id: "class_specialization", label: "Subclasses", group: "Character" },
  { id: "feat", label: "Feats", group: "Character" },
  { id: "skill", label: "Skills", group: "Character" },
  { id: "race", label: "Species", group: "Character" },
  { id: "race_subrace", label: "Subspecies", group: "Character" },
  { id: "spell", label: "Spells", group: "Character" },
  { id: "siegepackage:class", label: "Classes", group: "Character" },
  { id: "siegepackage:race", label: "Races", group: "Character" },
  { id: "siegepackage", label: "Packages", group: "Character" },
  { id: "siegepower", label: "Spells", group: "Character" },
];
// Not lists: what has its own window (characters, the party, notes) or is the game's own setup.
const NOT_LISTED = new Set(["character", "party", "note", "siegegame"]);

export function listOf(record: TableRecord) {
  if (record.type === "siegepackage") {
    const kind = String(record.data.packagetype ?? "").toLowerCase();
    if (kind === "class" || kind === "race") return `siegepackage:${kind}`;
  }
  return record.type;
}
function listLabel(id: string) {
  return LISTS.find((item) => item.id === id)?.label ?? id.replace(/^siegepackage:/, "").replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

const shared = (record: TableRecord) => record.visibility === "all";
const LIMIT = 400;

// The lists the sidebar shows in a group (FG's Campaign and Character
// categories): those this table has records for, in FG's order.
// A game's own word for a list (Descending Darkness calls species "Kin").
const GAME_WORDS: Record<string, Record<string, string>> = { "Descending Darkness": { race: "Kin" }, "Apeira Astra": { race: "Origins", class: "Paths", item: "Gear", npc: "Threats" } };
export function sidebarLists(records: Record<string, TableRecord>, group: string, ruleset = "") {
  const present = new Set<string>();
  for (const record of Object.values(records)) if (!NOT_LISTED.has(record.type)) present.add(listOf(record));
  return LISTS.filter((item) => item.group === group && present.has(item.id)).map((item) => ({ id: item.id, label: GAME_WORDS[ruleset]?.[item.id] ?? item.label }));
}
export { listLabel };

// only: the sidebar's list (one window a list, as FG's); without it, every
// list with a button for each.
export function RecordsWindow({ session, onOpen, only }: { session: Session; onOpen: (record: TableRecord) => void; only?: string }) {
  const gm = session.role === "dm";
  const all = useMemo(() => Object.values(session.records).filter((record) => !NOT_LISTED.has(record.type)), [session.records]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of all) map.set(listOf(record), (map.get(listOf(record)) ?? 0) + 1);
    return map;
  }, [all]);
  const lists = [...LISTS.filter((item) => counts.has(item.id)).map((item) => item.id), ...[...counts.keys()].filter((id) => !LISTS.some((item) => item.id === id)).sort()];
  const [chosen, setChosen] = useState("");
  const list = only ?? (lists.includes(chosen) ? chosen : lists[0] ?? "");
  const [search, setSearch] = useState("");
  const [sharedOnly, setSharedOnly] = useState(false);
  const [status, setStatus] = useState("");
  const wanted = search.trim().toLowerCase();
  const rows = all
    .filter((record) => listOf(record) === list && (!wanted || record.name.toLowerCase().includes(wanted)) && (!sharedOnly || shared(record)))
    .sort((a, b) => a.name.localeCompare(b.name));
  // FG's master index: under each book's name (the campaign's own first),
  // then the book's own categories.
  const groups = new Map<string, Map<string, TableRecord[]>>();
  for (const record of rows.slice(0, LIMIT)) {
    const book = record.source || "Campaign";
    const category = typeof record.data.fgCategory === "string" && record.data.fgCategory !== book ? record.data.fgCategory : "";
    const inBook = groups.get(book) ?? new Map<string, TableRecord[]>();
    inBook.set(category, [...(inBook.get(category) ?? []), record]);
    groups.set(book, inBook);
  }
  const books = [...groups.keys()].sort((a, b) => (a === "Campaign" ? -1 : b === "Campaign" ? 1 : a.localeCompare(b)));
  const share = async (record: TableRecord, on: boolean) => {
    try {
      await session.op({ op: "update", id: record.id, patch: { visibility: on ? "all" : "gm" } });
      setStatus(on ? `${record.name} is shared with the players.` : `${record.name} is hidden from the players.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not change that.");
    }
  };

  return (
    <div className={only ? "records-window single" : "records-window"} data-window="records" data-records-only={only}>
      {only ? null : <nav className="records-lists" aria-label="Lists">
        {lists.length === 0 ? <p className="hint">{gm ? "Nothing yet: make a book active (Books) or add NPCs and items." : "The GM has shared nothing yet."}</p> : null}
        {lists.map((id) => (
          <button key={id} type="button" className={id === list ? "on" : ""} aria-pressed={id === list} data-records-list={id} onClick={() => setChosen(id)}>
            {listLabel(id)} <small>{counts.get(id)}</small>
          </button>
        ))}
      </nav>}
      <section className="records-main">
        <div className="records-head">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" aria-label="Search the list" />
          {gm ? (
            <button type="button" className={sharedOnly ? "on" : ""} aria-pressed={sharedOnly} data-action="records-shared-only" title="Filter by sharing mode" onClick={() => setSharedOnly(!sharedOnly)}>
              {sharedOnly ? "Shared" : "All"}
            </button>
          ) : null}
        </div>
        {status ? (
          <p className="hint" role="status">
            {status}
          </p>
        ) : null}
        <div className="records-list">
          {books.map((book) => (
            <section key={book} data-records-book={book}>
              <h4>{book}</h4>
              {[...(groups.get(book) ?? [])].map(([category, items]) => (
              <Fragment key={category}>
              {category ? <h5 className="records-category">{category}</h5> : null}
              {items.map((record) => (
                <div key={record.id} className="records-row" data-record-row={record.id}>
                  {gm ? (
                    <button
                      type="button"
                      className={shared(record) ? "records-share on" : record.visibility === "owner" && record.owner ? "records-share some" : "records-share"}
                      data-action="record-share"
                      aria-pressed={shared(record)}
                      title={shared(record) ? "Shared with the players: click to hide it (FG's Unshare)" : record.visibility === "owner" && record.owner ? `Shared with ${record.owner}: click to share with everyone` : "Hidden from the players: click to share it (FG's Share)"}
                      onClick={() => void share(record, !shared(record))}
                    >
                      <Icon name={shared(record) ? "eye" : "eye-off"} size={15} />
                    </button>
                  ) : null}
                  <button type="button" className="records-name" title={`Open ${record.name}`} onClick={() => onOpen(record)} {...slotDrag({ kind: "record", record: record.id, label: record.name })}>
                    {record.name}
                  </button>
                </div>
              ))}
              </Fragment>
              ))}
            </section>
          ))}
          {rows.length > LIMIT ? <p className="hint">{rows.length - LIMIT} more: search to narrow the list.</p> : null}
          {list && rows.length === 0 ? <p className="hint">{sharedOnly ? "Nothing in this list is shared." : wanted ? "Nothing by that name." : gm ? "Nothing here yet: make a book active (Modules)." : "The GM has shared nothing here yet."}</p> : null}
        </div>
      </section>
    </div>
  );
}

// FG's formatted text, as elements: only the tags FG's text uses, never raw
// HTML (a record's text comes from a module or another seat).
const TAGS: Record<string, string> = { p: "p", b: "b", strong: "b", i: "i", em: "i", u: "u", h: "h4", list: "ul", ul: "ul", ol: "ol", li: "li", table: "table", tr: "tr", td: "td", th: "th", frame: "blockquote", linklist: "ul" };
function nodes(parent: Node, key = "n"): ReactNode[] {
  const out: ReactNode[] = [];
  parent.childNodes.forEach((child, index) => {
    const id = `${key}.${index}`;
    if (child.nodeType === 3 || child.nodeType === 4) out.push(child.nodeValue ?? "");
    if (child.nodeType !== 1) return;
    const tag = (child as Element).tagName.toLowerCase();
    if (tag === "br") return void out.push(<br key={id} />);
    const inner = nodes(child, id);
    if (tag === "link") return void out.push(<span key={id} className="record-link">{inner.length ? inner : "Link"}</span>);
    const html = TAGS[tag];
    if (!html) return void out.push(<Fragment key={id}>{inner}</Fragment>);
    if (tag === "linklist") return void out.push(<ul key={id}>{inner.map((item, n) => <li key={n}>{item}</li>)}</ul>);
    const Tag = html as "p";
    out.push(tag === "table" ? <table key={id}><tbody>{inner}</tbody></table> : <Tag key={id}>{inner}</Tag>);
  });
  return out;
}
export function FormattedText({ text }: { text: string }) {
  const content = useMemo(() => {
    const xml = new DOMParser().parseFromString(`<root>${text}</root>`, "application/xml");
    const root = xml.getElementsByTagName("parsererror").length ? new DOMParser().parseFromString(text, "text/html").body : xml.documentElement;
    return nodes(root);
  }, [text]);
  return <div className="formatted-text">{content}</div>;
}

// The fields a record window leaves out: FG's bookkeeping, or shown on their own.
const HIDDEN = new Set(["name", "fgPath", "fgCategory", "version", "picture", "public", "token", "isidentified", "locked", "ccgen", "nonid_name", "nonidentified", "abilities", "packagetype", "token3Dflat", "text"]);
const LABELS: Record<string, string> = { castingtime: "Casting time", ac: "AC", hp: "Hit points", hd: "Hit dice", cr: "Challenge", xp: "XP", acbonus: "AC bonus", bth: "BtH", subtype: "Subtype", damagetype: "Damage type" };
const labelOf = (key: string) => LABELS[key] ?? key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
const isText = (value: unknown) => typeof value === "string" && /<\/?(p|b|i|h|list|li|table|frame|linklist)\b/.test(value);
const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

// One record, read only (FG's record window as a player sees it; the GM's
// with the share button). Its short fields as a table, a creature's abilities
// in a row, its actions and traits as lists, its text as FG wrote it.
export function RecordWindow({ session, id }: { session: Session; id: string }) {
  const record = session.records[id];
  if (!record) return <p className="hint record-window">This is not shown to you any more.</p>;
  const gm = session.role === "dm";
  const data = record.data ?? {};
  const fields: [string, string][] = [];
  const texts: [string, string][] = [];
  const lists: [string, { name: string; desc: string }[]][] = [];
  for (const [key, value] of Object.entries(data)) {
    // FG's bookkeeping as values: a list it keeps elsewhere (true), an unused number (0).
    if (HIDDEN.has(key) || value === null || value === undefined || value === "" || value === true || value === 0) continue;
    if (isText(value)) texts.push([key, String(value)]);
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") fields.push([key, String(value === false ? "No" : value)]);
    else if (typeof value === "object") {
      const rows = Object.values(value as Record<string, unknown>).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && typeof (row as { name?: unknown }).name === "string");
      if (rows.length && rows.every((row) => typeof row.desc === "string" || typeof row.description === "string" || typeof row.text === "string"))
        lists.push([key, rows.map((row) => ({ name: String(row.name), desc: String(row.desc ?? row.description ?? row.text ?? "") }))]);
    }
  }
  const abilities = data.abilities && typeof data.abilities === "object" ? (data.abilities as Record<string, { score?: number; bonus?: number } | undefined>) : null;
  return (
    <article className="record-window" data-record={record.id}>
      <header>
        <h3 {...slotDrag({ kind: "record", record: record.id, label: record.name })}>{record.name}</h3>
        <small className="hint">
          {listLabel(listOf(record))}
          {record.source ? ` · ${record.source}` : ""}
          {typeof data.fgCategory === "string" ? ` · ${data.fgCategory}` : ""}
        </small>
        {gm ? (
          <button
            type="button"
            className={shared(record) ? "records-share on" : "records-share"}
            data-action="record-share"
            aria-pressed={shared(record)}
            onClick={() => void session.op({ op: "update", id: record.id, patch: { visibility: shared(record) ? "gm" : "all" } })}
          >
            <Icon name={shared(record) ? "eye" : "eye-off"} size={15} /> {shared(record) ? "Shared" : "Share with the players"}
          </button>
        ) : null}
      </header>
      {abilities && STATS.some((stat) => abilities[stat]) ? (
        <div className="record-abilities">
          {STATS.map((stat) => (
            <span key={stat}>
              <b>{stat.slice(0, 3).toUpperCase()}</b> {abilities[stat]?.score ?? "-"}
              {abilities[stat]?.bonus !== undefined ? ` (${Number(abilities[stat]?.bonus) >= 0 ? "+" : ""}${abilities[stat]?.bonus})` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {fields.length ? (
        <dl className="record-fields">
          {fields.map(([key, value]) => (
            <Fragment key={key}>
              <dt>{labelOf(key)}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
      {lists.map(([key, rows]) => (
        <section key={key} className="record-list">
          <h4>{labelOf(key)}</h4>
          {rows.map((row, index) => (
            <p key={index}>
              <b>{row.name}.</b> {isText(row.desc) ? <FormattedText text={row.desc} /> : row.desc}
            </p>
          ))}
        </section>
      ))}
      {texts.map(([key, value]) => (
        <section key={key} className="record-text">
          {texts.length > 1 || key !== "description" ? <h4>{labelOf(key)}</h4> : null}
          <FormattedText text={value} />
        </section>
      ))}
    </article>
  );
}
