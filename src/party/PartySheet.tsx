import { useState } from "react";
import { Picture } from "../characters/ArtPicker";
import { Icon } from "../ui/icons";
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
  order: { marching: string[]; watches: Record<string, { name: string; members: string[] }>; formation: { facing: number; slots: { x: number; y: number; id: string }[] } };
};

const ATTRIBUTES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
// A parcel's coins in the ruleset's money (FG's coin list): credits for Traveller (MCr and Cr, as FG's MGT2) and Apeira Astra, gold crowns for Descending Darkness.
const coinsFor = (ruleset: string) => (ruleset === "Traveller" ? ["MCr", "Cr"] : ruleset === "Apeira Astra" ? ["Cr"] : ruleset === "Descending Darkness" ? ["GC"] : ["PP", "GP", "EP", "SP", "CP"]);
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
                  <span className="party-face">{member.portrait ? <Picture session={session} id={member.portrait} alt="" still /> : member.name.slice(0, 1)}</span>
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
                {[...new Set([...coinsFor(session.ruleset), ...Object.keys(party.parcel.coins ?? {}).filter((coin) => Number(party.parcel.coins?.[coin]) > 0)])].map((coin) => (
                  <label key={coin}>
                    {coin}
                    <input type="number" min={0} data-parcel-coin={coin} aria-label={`Parcel ${coin}`} value={party.parcel.coins?.[coin] ?? 0} onChange={(event) => patch({ parcel: { coins: { [coin]: Math.max(0, Number(event.target.value) || 0) } } })} />
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

      {tab === "order" ? <OrderTab session={session} party={party} /> : null}

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

// FG's party sheet Order tab: the watch order and the marching formation (a 7
// by 7 grid; FG's PartyFormationManager). Everyone drags their own
// characters' tokens into a watch or a slot; the GM moves anyone, and fills,
// turns and clears the formation. The host keeps it, and the marching order
// follows it, front to back.
const RANGE = 3;
const ARROWS = ["\u25b2", "\u25b6", "\u25bc", "\u25c0"];
function OrderTab({ session, party }: { session: Session; party: PartyView }) {
  const gm = session.role === "dm";
  const [dragging, setDragging] = useState("");
  const [over, setOver] = useState("");
  const formation = party.order.formation ?? { facing: 0, slots: [] };
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const mine = (member: PartyMember) => gm || member.owner === me;
  const byId = new Map(party.members.map((member) => [member.id, member]));
  const token = (member: PartyMember, size = 44) => (
    <span className="order-token" style={{ width: size, height: size }} title={member.name}>
      {member.portrait ? <Picture session={session} id={member.portrait} alt="" still /> : <b>{member.name.slice(0, 1)}</b>}
    </span>
  );
  const draggable = (member: PartyMember) =>
    mine(member)
      ? {
          draggable: true,
          onDragStart: (event: React.DragEvent) => {
            event.dataTransfer.setData("text/kraken-member", member.id);
            event.dataTransfer.effectAllowed = "move";
            setDragging(member.id);
          },
          onDragEnd: () => {
            setDragging("");
            setOver("");
          },
        }
      : {};
  const dropZone = (name: string, drop: (id: string) => void) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragging) return;
      event.preventDefault();
      setOver(name);
    },
    onDragLeave: () => setOver((current) => (current === name ? "" : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/kraken-member") || dragging;
      setOver("");
      setDragging("");
      if (id) drop(id);
    },
  });
  const watches = [1, 2, 3].map((number) => ({ number, ...(party.order.watches?.[`watch-${number}`] ?? { name: `Watch ${number}`, members: [] }) }));
  const onWatch = new Set(watches.flatMap((watch) => watch.members));
  const placed = new Set(formation.slots.map((slot) => slot.id));
  const yours = party.members.filter(mine);
  const facingLabel = ["up", "right", "down", "left"][formation.facing] ?? "up";
  if (party.members.length === 0) return <p className="hint">The party has no members yet. The GM adds them on the Main tab.</p>;
  return (
    <div className="party-order-grid">
      <div className="order-tokens" aria-label="Your characters">
        <span className="hint">{gm ? "Drag a token into a watch or a slot." : "Drag your character into a watch or a slot."}</span>
        {yours.map((member) => (
          <span key={member.id} className={placed.has(member.id) || onWatch.has(member.id) ? "order-pick placed" : "order-pick"} data-order-token={member.id} {...draggable(member)}>
            {token(member, 36)}
            <small>{member.name}</small>
          </span>
        ))}
      </div>
      <section className="order-watch">
        <h3>Watch Order</h3>
        {watches.map((watch) => (
          <div key={watch.number} className={over === `watch-${watch.number}` ? "order-watch-slot over" : "order-watch-slot"} data-watch={watch.number} {...dropZone(`watch-${watch.number}`, (id) => session.partyOrder({ action: "watch", id, watch: watch.number }))}>
            <b>{["1st", "2nd", "3rd"][watch.number - 1]} watch</b>
            <div className="order-watch-members">
              {watch.members
                .map((id) => byId.get(id))
                .filter((member): member is PartyMember => Boolean(member))
                .map((member) => (
                  <span key={member.id} className="order-watcher" {...draggable(member)}>
                    {token(member, 30)}
                    <small>{member.name}</small>
                    {mine(member) ? (
                      <button type="button" className="order-remove" aria-label={`Take ${member.name} off watch`} onClick={() => session.partyOrder({ action: "watch", id: member.id, watch: 0 })}>
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              {watch.members.length === 0 ? <span className="hint">Drop here</span> : null}
            </div>
          </div>
        ))}
      </section>
      <section className="order-formation">
        <h3>Formation</h3>
        <div className={`formation-board facing-${formation.facing}`} title={`The party faces ${facingLabel}`}>
          <span className="formation-arrow" aria-label={`Facing ${facingLabel}`}>
            {ARROWS[formation.facing]}
          </span>
          <div className="formation-slots">
            {Array.from({ length: (RANGE * 2 + 1) ** 2 }, (_, index) => {
              const x = (index % (RANGE * 2 + 1)) - RANGE;
              const y = RANGE - Math.floor(index / (RANGE * 2 + 1));
              const slot = formation.slots.find((item) => item.x === x && item.y === y);
              const member = slot ? byId.get(slot.id) : undefined;
              const name = `${x},${y}`;
              return (
                <div
                  key={name}
                  className={`formation-slot${over === name ? " over" : ""}${x === 0 && y === 0 ? " middle" : ""}`}
                  data-slot={name}
                  {...dropZone(name, (id) => session.partyOrder({ action: "place", id, x, y }))}
                  onDoubleClick={() => member && mine(member) && session.partyOrder({ action: "remove", id: member.id })}
                >
                  {member ? (
                    <span {...draggable(member)} data-slot-member={member.id}>
                      {token(member)}
                    </span>
                  ) : x === 0 && y === 0 ? (
                    <span className="formation-middle" aria-hidden>
                      {"\u2316"}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        {gm ? (
          <div className="formation-buttons">
            {[1, 2, 3].map((columns) => (
              <button key={columns} type="button" title={`Fill the party ${columns} abreast`} data-fill={columns} onClick={() => session.partyOrder({ action: "fill", columns })}>
                {columns}×
              </button>
            ))}
            <button type="button" title="Turn the formation left" aria-label="Turn left" data-rotate="left" onClick={() => session.partyOrder({ action: "rotate", direction: "left" })}>
              {"\u21ba"}
            </button>
            <button type="button" title="Turn the formation right" aria-label="Turn right" data-rotate="right" onClick={() => session.partyOrder({ action: "rotate", direction: "right" })}>
              {"\u21bb"}
            </button>
            <button type="button" className="formation-clear" title="Clear the formation" aria-label="Clear the formation" data-clear onClick={() => session.partyOrder({ action: "clear" })}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ) : (
          <p className="hint">Double-click your token to take it out.</p>
        )}
        <p className="hint order-marching">
          Marching order: {party.order.marching.map((id) => byId.get(id)?.name).filter(Boolean).join(", ") || "nobody placed yet"}
        </p>
      </section>
    </div>
  );
}
