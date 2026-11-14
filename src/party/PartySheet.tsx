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
  /** Cairn: its attributes, slots, Fatigue, state, Scars and Growth (no experience). */
  cairn?: { str: number; dex: number; wil: number; fatigue: number; slots: number; status: string; scars: string[]; growth: string[] };
  /** Fate: fate points and refresh, the high concept and trouble, consequences, milestones (no experience or coin). */
  fate?: { game: string; fatepoints: number; refresh: number; highconcept: string; trouble: string; status: string; consequences: string[]; milestones: string[]; skillpoints: number };
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
// Cairn's books price everything in gold pieces.
// Fate has no coin: a parcel is things found (each written into a character's extras).
const coinsFor = (ruleset: string) => (/^Fate /.test(ruleset) ? [] : ruleset === "Traveller" ? ["MCr", "Cr"] : ruleset === "Apeira Astra" ? ["Cr"] : ruleset === "Descending Darkness" ? ["GC"] : ruleset === "Cairn" ? ["GP"] : ["PP", "GP", "EP", "SP", "CP"]);
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
  // Cairn has no experience: its tab is the party's Growth (Scars and what has changed).
  const cairn = session.ruleset === "Cairn";
  // Fate has milestones instead of experience: its tab gives the party one.
  const fate = /^Fate /.test(session.ruleset);
  const visibleTabs = (gm ? TABS : TABS.filter((item) => item.id !== "xp")).map((item) => (cairn && item.id === "xp" ? { ...item, label: "Growth" } : fate && item.id === "xp" ? { ...item, label: "Milestones" } : item));
  const attributes = cairn ? ["str", "dex", "wil"] : fate ? (session.ruleset === "Fate Accelerated" ? ["careful", "clever", "flashy", "forceful", "quick", "sneaky"] : ["Athletics", "Notice", "Will", "Physique", "Stealth", "Investigate", "Lore", "Rapport"]) : ATTRIBUTES;
  const groupStat = attributes.includes(checkStat) ? checkStat : attributes[0];

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
                  {member.fate ? (
                    // Fate: no hit points, armour or experience: fate points and refresh, the high concept, milestones.
                    <>
                      <span className="party-stat" title={`${member.fate.highconcept}${member.fate.trouble ? `; trouble: ${member.fate.trouble}` : ""}${member.fate.consequences.length ? `; consequences: ${member.fate.consequences.join(", ")}` : ""}`} data-fate-member={member.id}>
                        <small>Fate points</small>
                        {member.fate.fatepoints}/{member.fate.refresh}
                      </span>
                      <span className="party-stat" title={member.fate.milestones.join("; ") || "No milestones yet"}>
                        <small>Milestones</small>
                        {member.fate.milestones.length}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="party-stat" title="Hit points">
                        <small>HP</small>
                        {current}/{member.hp}
                      </span>
                      <span className="party-stat" title="Armour class">
                        <small>AC</small>
                        {member.ac}
                      </span>
                    </>
                  )}
                  {member.fate ? null : member.cairn ? (
                    <span className="party-stat" title={`STR ${member.cairn.str}, DEX ${member.cairn.dex}, WIL ${member.cairn.wil}; ${member.cairn.slots} of 10 slots, ${member.cairn.fatigue} Fatigue${member.cairn.status ? `; ${member.cairn.status}` : ""}`} data-cairn-member={member.id}>
                      <small>STR/DEX/WIL</small>
                      {member.cairn.str}/{member.cairn.dex}/{member.cairn.wil}
                    </span>
                  ) : (
                    <span className="party-stat" title="Experience / next level">
                      <small>XP</small>
                      {member.exp}
                      {member.expnext ? `/${member.expnext}` : ""}
                    </span>
                  )}
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
                <select aria-label="Attribute" value={groupStat} onChange={(event) => setCheckStat(event.target.value)}>
                  {attributes.map((stat) => (
                    <option key={stat} value={stat}>
                      {stat[0].toUpperCase() + stat.slice(1)}
                    </option>
                  ))}
                </select>
                <label title={fate ? "The opposition on the ladder (2: Fair)" : undefined}>
                  {fate ? "vs" : "CL"} <input type="number" min={0} value={checkCl} onChange={(event) => setCheckCl(Number(event.target.value) || 0)} style={{ width: "3.5rem" }} />
                </label>
                <button type="button" onClick={() => session.partyGroup("check", groupStat, checkCl)} disabled={party.members.length === 0}>
                  Group check
                </button>
                <button type="button" onClick={() => session.partyGroup("save", groupStat, checkCl)} disabled={party.members.length === 0}>
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

      {tab === "xp" && gm && cairn ? (
        <div className="party-xp" data-cairn-growth>
          <p className="hint">Cairn has no experience points: characters grow from what happens to them. Write a change on a character (its sheet's Growth tab), or here.</p>
          <ul className="sheet-list">
            {party.members.map((member) => (
              <li key={member.id}>
                <b>{member.name}</b>
                <small className="hint">
                  {member.cairn?.scars.length ? `Scars: ${member.cairn.scars.join(", ")}. ` : ""}
                  {member.cairn?.growth.length ? `Growth: ${member.cairn.growth.join("; ")}` : "No growth yet."}
                </small>
              </li>
            ))}
          </ul>
          <form
            className="parcel-add"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const who = String(form.get("who") ?? "");
              const text = String(form.get("text") ?? "").trim();
              if (who && text) void session.cairnAction(who, "growth", { text });
              event.currentTarget.reset();
            }}
          >
            <select name="who" aria-label="Who grows">
              {party.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <input name="text" placeholder="What changed, and why" aria-label="Growth" />
            <button type="submit" disabled={party.members.length === 0}>
              Add growth
            </button>
          </form>
        </div>
      ) : null}

      {tab === "xp" && gm && fate ? (
        <div className="party-xp" data-fate-milestones>
          <p className="hint">Fate has no experience points: characters change at milestones. A minor one at a session's end; a significant one at a scenario's (a skill point); a major one at an arc's (a refresh more).</p>
          <ul className="sheet-list">
            {party.members.map((member) => (
              <li key={member.id}>
                <b>{member.name}</b> <small className="hint">{member.fate?.milestones.length ? member.fate.milestones.join("; ") : "No milestones yet."}</small>
              </li>
            ))}
          </ul>
          <p className="cc-inline">
            {(["minor", "significant", "major"] as const).map((kind) => (
              <button key={kind} type="button" data-action={`party-milestone-${kind}`} disabled={party.members.length === 0} onClick={() => party.members.forEach((member) => void session.fateAction(member.id, "milestone", { kind }))}>
                Everyone: a {kind} milestone
              </button>
            ))}
          </p>
        </div>
      ) : null}

      {tab === "xp" && gm && !cairn && !fate ? (
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
