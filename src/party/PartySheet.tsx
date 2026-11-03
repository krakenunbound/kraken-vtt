import { useState } from "react";
import { Picture } from "../characters/ArtPicker";
import type { Session } from "../session/useSession";

export type PartyMember = {
  id: string;
  name: string;
  owner: string;
  portrait: string | null;
  race: string;
  classes: string;
  level: number;
  hp: number;
  wounds: number;
  ac: number;
  exp: number;
  expnext: number;
  coins: { name: string; amount: number }[];
};
type Entry = { name: string; xp: number; awarded?: number };
export type PartyView = {
  members: PartyMember[];
  inventory: { name: string; count: number; carriedBy: Record<string, number> }[];
  parcel: { coins: Record<string, number>; items: Record<string, { name: string; count: number; assign?: string }> };
  quests: Record<string, Entry>;
  encounters: Record<string, Entry>;
  order: { marching: string[]; watches: Record<string, { name: string; members: string[] }> };
};

const ATTRIBUTES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const COINS = ["PP", "GP", "EP", "SP", "CP"];
const TABS = [
  { id: "main", label: "Main" },
  { id: "inventory", label: "Inventory" },
  { id: "order", label: "Order" },
  { id: "xp", label: "XP" },
] as const;

function newKey() {
  return `id-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// FG's party sheet. The GM edits it (the party record); players see it.
export function PartySheet({ session, compact = false }: { session: Session; compact?: boolean }) {
  const party = session.party;
  const gm = session.role === "dm";
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("main");
  const [checkStat, setCheckStat] = useState("strength");
  const [checkCl, setCheckCl] = useState(0);
  const [xp, setXp] = useState(0);
  const [itemName, setItemName] = useState("");
  const [itemCount, setItemCount] = useState(1);
  const [entryName, setEntryName] = useState("");
  const [entryXp, setEntryXp] = useState(0);
  const patch = (data: Record<string, unknown>) => void session.op({ op: "update", id: "party", patch: { data } }).catch(() => undefined);
  if (!party) return <p className="hint">The party sheet is on its way.</p>;

  const characters = Object.values(session.records).filter((record) => record.type === "character");
  const nonMembers = characters.filter((record) => !party.members.some((member) => member.id === record.id));
  const visibleTabs = gm ? TABS : TABS.filter((item) => item.id !== "xp");

  return (
    <section className={compact ? "party-sheet compact" : "party-sheet"} data-party-members={party.members.length}>
      <nav className="party-tabs" role="tablist">
        {visibleTabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "main" ? (
        <div className="party-main">
          {party.members.length === 0 ? <p className="hint">No one is in the party yet.</p> : null}
          <ul className="party-members">
            {party.members.map((member) => {
              const current = member.hp - member.wounds;
              return (
                <li key={member.id} data-member={member.id}>
                  <span className="party-face">{member.portrait ? <Picture session={session} id={member.portrait} alt="" /> : member.name.slice(0, 1)}</span>
                  <span className="party-who">
                    <b>{member.name}</b>
                    <small>
                      {member.race} {member.classes}
                      {member.owner ? ` · ${member.owner}` : ""}
                    </small>
                  </span>
                  <span className="party-stat" title="Hit points">
                    <small>HP</small>
                    {current}/{member.hp}
                  </span>
                  <span className="party-stat" title="Armour class">
                    <small>AC</small>
                    {member.ac}
                  </span>
                  <span className="party-stat" title="Experience / next level">
                    <small>XP</small>
                    {member.exp}
                    {member.expnext ? `/${member.expnext}` : ""}
                  </span>
                  {gm ? (
                    <button type="button" className="party-remove" title="Take out of the party" onClick={() => patch({ members: party.members.filter((item) => item.id !== member.id).map((item) => item.id) })}>
                      ×
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {gm ? (
            <div className="party-controls">
              {nonMembers.length > 0 ? (
                <select
                  aria-label="Add to the party"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) patch({ members: [...party.members.map((item) => item.id), event.target.value] });
                  }}
                >
                  <option value="">Add a character…</option>
                  {nonMembers.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.name}
                      {record.owner ? ` (${record.owner})` : ""}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="party-group" aria-label="Group check">
                <select aria-label="Attribute" value={checkStat} onChange={(event) => setCheckStat(event.target.value)}>
                  {ATTRIBUTES.map((stat) => (
                    <option key={stat} value={stat}>
                      {stat[0].toUpperCase() + stat.slice(1)}
                    </option>
                  ))}
                </select>
                <label>
                  CL <input type="number" min={0} value={checkCl} onChange={(event) => setCheckCl(Number(event.target.value) || 0)} style={{ width: "3.5rem" }} />
                </label>
                <button type="button" onClick={() => session.partyGroup("check", checkStat, checkCl)} disabled={party.members.length === 0}>
                  Group check
                </button>
                <button type="button" onClick={() => session.partyGroup("save", checkStat, checkCl)} disabled={party.members.length === 0}>
                  Group save
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div className="party-inventory">
          {gm ? (
            <div className="party-parcel">
              <h3>Parcel to hand out</h3>
              <div className="parcel-coins">
                {COINS.map((coin) => (
                  <label key={coin}>
                    {coin}
                    <input type="number" min={0} value={party.parcel.coins?.[coin] ?? 0} onChange={(event) => patch({ parcel: { coins: { [coin]: Math.max(0, Number(event.target.value) || 0) } } })} />
                  </label>
                ))}
              </div>
              <ul className="sheet-list">
                {Object.entries(party.parcel.items ?? {}).map(([id, item]) => (
                  <li key={id}>
                    <span>
                      {item.name} ×{item.count}
                    </span>
                    <input
                      aria-label={`Who gets ${item.name}`}
                      placeholder="Give to (names, comma separated)"
                      value={item.assign ?? ""}
                      onChange={(event) => patch({ parcel: { items: { [id]: { assign: event.target.value } } } })}
                    />
                    <button type="button" onClick={() => patch({ parcel: { items: { [id]: null } } })} title="Take out of the parcel">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="parcel-add"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!itemName.trim()) return;
                  patch({ parcel: { items: { [newKey()]: { name: itemName.trim(), count: Math.max(1, itemCount), assign: "" } } } });
                  setItemName("");
                  setItemCount(1);
                }}
              >
                <input placeholder="Item" value={itemName} onChange={(event) => setItemName(event.target.value)} list="party-item-names" />
                <datalist id="party-item-names">
                  {Object.values(session.records)
                    .filter((record) => record.type === "item")
                    .slice(0, 400)
                    .map((record) => (
                      <option key={record.id} value={record.name} />
                    ))}
                </datalist>
                <input type="number" min={1} value={itemCount} onChange={(event) => setItemCount(Number(event.target.value) || 1)} style={{ width: "4rem" }} />
                <button type="submit">Add</button>
              </form>
              <button type="button" className="play-button" onClick={() => session.partyDistribute()} disabled={party.members.length === 0}>
                Distribute
              </button>
            </div>
          ) : null}
          <h3>Party inventory</h3>
          <ul className="sheet-list">
            {party.inventory.length === 0 ? <li className="hint">Nothing carried yet.</li> : null}
            {party.inventory.map((row) => (
              <li key={row.name}>
                <span>
                  {row.name} ×{row.count}
                </span>
                <small className="hint">
                  {Object.entries(row.carriedBy)
                    .map(([who, count]) => `${who} ${count}`)
                    .join(", ")}
                </small>
              </li>
            ))}
          </ul>
          <h3>Coins</h3>
          <ul className="sheet-list">
            {party.members.map((member) => (
              <li key={member.id}>
                <span>{member.name}</span>
                <small>{member.coins.map((coin) => `${coin.amount} ${coin.name}`).join(", ") || "—"}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "order" ? (
        <div className="party-order">
          <h3>Marching order</h3>
          <ol className="marching">
            {(party.order.marching?.length ? party.order.marching : party.members.map((member) => member.id))
              .map((id) => party.members.find((member) => member.id === id))
              .filter((member): member is PartyMember => Boolean(member))
              .map((member, index, list) => (
                <li key={member.id}>
                  <span>{member.name}</span>
                  {gm ? (
                    <span className="order-buttons">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Move ${member.name} forward`}
                        onClick={() => {
                          const ids = list.map((item) => item.id);
                          [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                          patch({ order: { marching: ids } });
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === list.length - 1}
                        aria-label={`Move ${member.name} back`}
                        onClick={() => {
                          const ids = list.map((item) => item.id);
                          [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]];
                          patch({ order: { marching: ids } });
                        }}
                      >
                        ↓
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
          </ol>
          <h3>Watches</h3>
          {[1, 2, 3].map((number) => {
            const key = `watch-${number}`;
            const watch = party.order.watches?.[key] ?? { name: `Watch ${number}`, members: [] };
            return (
              <div key={key} className="watch">
                <b>{watch.name}</b>
                {party.members.map((member) => (
                  <label key={member.id} className="check">
                    <input
                      type="checkbox"
                      disabled={!gm}
                      checked={watch.members.includes(member.id)}
                      onChange={(event) =>
                        patch({
                          order: {
                            watches: {
                              [key]: { name: watch.name, members: event.target.checked ? [...watch.members, member.id] : watch.members.filter((id) => id !== member.id) },
                            },
                          },
                        })
                      }
                    />
                    {member.name}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "xp" && gm ? (
        <div className="party-xp">
          <form
            className="xp-award"
            onSubmit={(event) => {
              event.preventDefault();
              if (xp > 0) session.partyAwardXP(xp);
              setXp(0);
            }}
          >
            <label>
              XP <input type="number" min={0} value={xp} onChange={(event) => setXp(Number(event.target.value) || 0)} style={{ width: "6rem" }} />
            </label>
            <button type="submit" disabled={party.members.length === 0}>
              Award to the party
            </button>
          </form>
          {(["encounters", "quests"] as const).map((kind) => (
            <div key={kind} className="xp-list">
              <h3>
                {kind === "encounters" ? "Encounters" : "Quests"}
                <button type="button" onClick={() => session.partyAward(kind)} disabled={!Object.values(party[kind]).some((entry) => !entry.awarded)}>
                  Award
                </button>
              </h3>
              <ul className="sheet-list">
                {Object.entries(party[kind]).map(([id, entry]) => (
                  <li key={id} className={entry.awarded ? "awarded" : ""}>
                    <span>{entry.name}</span>
                    <span>{entry.xp} XP</span>
                    {entry.awarded ? <small className="hint">awarded</small> : <button type="button" onClick={() => session.partyAward(kind, id)}>Award</button>}
                    <button type="button" onClick={() => patch({ [kind]: { [id]: null } })} title="Remove">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <form
            className="parcel-add"
            onSubmit={(event) => {
              event.preventDefault();
              if (!entryName.trim()) return;
              const kind = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-kind") === "quests" ? "quests" : "encounters";
              patch({ [kind]: { [newKey()]: { name: entryName.trim(), xp: Math.max(0, entryXp), awarded: 0 } } });
              setEntryName("");
              setEntryXp(0);
            }}
          >
            <input placeholder="Encounter or quest" value={entryName} onChange={(event) => setEntryName(event.target.value)} />
            <input type="number" min={0} value={entryXp} onChange={(event) => setEntryXp(Number(event.target.value) || 0)} style={{ width: "5rem" }} aria-label="XP" />
            <button type="submit" data-kind="encounters">
              Add encounter
            </button>
            <button type="submit" data-kind="quests">
              Add quest
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
