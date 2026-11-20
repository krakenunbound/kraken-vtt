import { Field } from "../core/fields/Field";
import { useState } from "react";
import { ArtPicker, Picture } from "../characters/ArtPicker";
import { Icon } from "../ui/icons";
import { hasLink, linkFrom, TOKEN_DRAG } from "../ui/QuickSlots";
import type { Session } from "../session/useSession";
import { CrewSheet } from "./CrewSheet";
import { carriesCreatureDrop, dropOnCreature } from "../effects/drops";
import { has, rulesetFor } from "../../shared/rulesets/registry.mjs";
import { RestParty } from "../bookkeeping/RestParty";
import { INVENTORY_DRAG, STASH_DRAG } from "../core/parts/Parts";

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
  /** FG's party sheet: abilities with their bonuses, Hit Dice left, passive Perception and senses (the games that have them). */
  abilities?: { key: string; score: number; bonus: number }[];
  hitdice?: { die: string; total: number; used: number };
  passive?: number;
  senses?: string[];
  /** Cairn: its attributes, slots, Fatigue, state, Scars and Growth (no experience). */
  cairn?: { str: number; dex: number; wil: number; fatigue: number; slots: number; status: string; scars: string[]; growth: string[] };
  /** Fate: fate points and refresh, the high concept and trouble, consequences, milestones (no experience or coin). */
  fate?: { game: string; fatepoints: number; refresh: number; highconcept: string; trouble: string; status: string; consequences: string[]; milestones: string[]; skillpoints: number };
  coins: { name: string; amount: number }[];
  /** Forged in the Dark: the playbook, stress and trauma, harm, xp, stash. */
  forged?: { playbook: string; alias: string; stress: number; stressmax: number; traumas: string[]; harm: string[]; xp: Record<string, number>; stash: number; status: string };
};
type Entry = { name: string; xp: number; awarded?: number };
// A coin as a coin (the GM asked for better than FG's lists): platinum, gold, electrum, silver,
// copper, a credit chip, a gem; another game's money a bronze coin with its name.
const METAL: [RegExp, string][] = [
  [/^pp$|plat/i, "platinum"],
  [/^(gp|gc)$|gold|crown/i, "gold"],
  [/^ep$|electrum/i, "electrum"],
  [/^sp$|silver|shield/i, "silver"],
  [/^cp$|copper|penn/i, "copper"],
  [/^(cr|mcr|kcr)$|credit/i, "credit"],
  [/gem|jewel/i, "gem"],
];
export function Coin({ name, amount }: { name: string; amount?: number }) {
  const metal = METAL.find(([test]) => test.test(name.trim()))?.[1] ?? "bronze";
  return (
    <span className={`coin coin-${metal}`} title={amount === undefined ? name : `${amount} ${name}`}>
      <i aria-hidden="true">{metal === "gem" ? "" : name.slice(0, 2).toUpperCase()}</i>
      {amount === undefined ? null : <b>{amount.toLocaleString()}</b>}
    </span>
  );
}

// A bar with its numbers on it (FG's HP and HD bars): green to red as it empties.
function Meter({ label, value, max, kind }: { label: string; value: number; max: number; kind: "hp" | "hd" }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className={`party-meter meter-${kind}${kind === "hp" && share <= 0.25 ? " low" : kind === "hp" && share <= 0.5 ? " mid" : ""}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} title={`${label}: ${value} of ${max}`}>
      <i style={{ inlineSize: `${share * 100}%` }} />
      <b>
        {label} {value}/{max}
      </b>
    </span>
  );
}

export type PartyView = {
  members: PartyMember[];
  inventory: { name: string; count: number; carriedBy: Record<string, number> }[];
  parcel: { coins: Record<string, number>; items: Record<string, { name: string; count: number; assign?: string }> };
  // The party's name and its token for big maps (an art id), the GM's to choose.
  name?: string;
  token?: string;
  // The stash the players trade through: put in from a sheet, taken out onto a sheet.
  stash?: { id: string; name: string; count: number; from: string }[];
  quests: Record<string, Entry>;
  encounters: Record<string, Entry>;
  order: { marching: string[]; watches: Record<string, { name: string; members: string[] }>; formation: { facing: number; slots: { x: number; y: number; id: string }[] } };
};

const ATTRIBUTES = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
// A parcel's coins are the game's money (its manifest's party.currency, FG's coin list): credits for
// Traveller (MCr and Cr, as FG's MGT2) and Apeira Astra, gold crowns for Descending Darkness, gold
// pieces for Cairn; none for Fate (a parcel is things found, each written into a character's extras);
// Supply for Ironsworn and Starforged (it goes to the shared supply meter).
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
  const [tab, setTab] = useState<(typeof TABS)[number]["id"] | "crew">("main");
  const [checkStat, setCheckStat] = useState("strength");
  const [checkCl, setCheckCl] = useState(0);
  const [groupKind, setGroupKind] = useState<"check" | "save" | "skill">("check");
  const [groupMode, setGroupMode] = useState<"roll" | "ask">("roll");
  const [xp, setXp] = useState(0);
  const [itemName, setItemName] = useState("");
  const [itemCount, setItemCount] = useState(1);
  const [entryName, setEntryName] = useState("");
  const [entryXp, setEntryXp] = useState(0);
  const patch = (data: Record<string, unknown>) => void session.op({ op: "update", id: "party", patch: { data } }).catch(() => undefined);
  if (!party) return <p className="hint">The party sheet is on its way.</p>;

  const characters = Object.values(session.records).filter((record) => record.type === "character");
  const nonMembers = characters.filter((record) => !party.members.some((member) => member.id === record.id));
  // The campaign's game: its money, its kind of experience, its own tabs (docs/core-ui-design.md, 4.2).
  const game = rulesetFor(session.ruleset);
  // Growth instead of experience (Cairn: Scars and what has changed), or milestones (Fate): the tab says so.
  const growth = game.party.xp === "growth";
  const milestones = game.party.xp === "milestone";
  // A game's own tabs first (Forged in the Dark: the crew sheet).
  const ownTabs = (game.party.tabs ?? []).filter((item) => item.first && (!item.feature || has(game, item.feature)) && (!item.gm || gm));
  const crew = ownTabs.some((item) => item.id === "crew");
  const visibleTabs: { id: (typeof TABS)[number]["id"] | "crew"; label: string }[] = [...ownTabs.map((item) => ({ id: item.id as "crew", label: item.label })), ...(gm ? TABS : TABS.filter((item) => item.id !== "xp")).map((item) => (growth && item.id === "xp" ? { ...item, label: "Growth" } : milestones && item.id === "xp" ? { ...item, label: "Milestones" } : item))];
  const attributes = game.party.groupCheck ? game.party.groupCheck.stats : ATTRIBUTES;
  // The opposition on Fate's ladder instead of a challenge level.
  const ladder = has(game, "fatePoints");
  // The game's group rolls (its manifest), or its attributes as a check and a save (C&C; Fate: its skills).
  const declared = game.party.groupCheck ? game.party.groupCheck.rolls : undefined;
  const asOptions = attributes.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }));
  const groupRolls = declared?.length ? declared : ladder ? [{ kind: "check" as const, label: "Check", options: asOptions }] : [{ kind: "check" as const, label: "Check", options: asOptions }, { kind: "save" as const, label: "Save", options: asOptions }];
  const groupRoll = groupRolls.find((item) => item.kind === groupKind) ?? groupRolls[0];
  const groupChoice = groupRoll?.options.some((option) => option.value === checkStat) ? checkStat : groupRoll?.options[0]?.value ?? "";
  // C&C's challenge level; every other game's DC.
  const cl = !declared && !ladder;

  return (
    <section
      className={compact ? "party-sheet compact" : "party-sheet"}
      data-party-members={party.members.length}
      // FG's party sheet: a character dragged in (from Character Selection, the Characters list, a portrait) joins the party.
      onDragOver={(event) => {
        if (gm && event.dataTransfer.types.includes("application/x-kraken-record")) event.preventDefault();
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData("application/x-kraken-record");
        if (!gm || !id || session.records[id]?.type !== "character" || party.members.some((member) => member.id === id)) return;
        event.preventDefault();
        patch({ members: [...party.members.map((item) => item.id), id] });
      }}
    >
      <nav className="party-tabs" role="tablist">
        {visibleTabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "crew" && crew ? <CrewSheet session={session} /> : null}

      {tab === "main" ? (
        <div className="party-main">
          <PartyToken session={session} name={party.name ?? "Party"} token={party.token ?? ""} gm={gm} />
          {party.members.length === 0 ? (
            <p className="hint empty-state">
              <b>No one is in the party yet</b>
              {gm
                ? characters.length
                  ? "Drag a character here from Character Selection (Characters in the sidebar), or choose one below: their hit points, armour and coins gather here."
                  : "There are no characters yet: make them in Character Selection (Characters in the sidebar), then drag them here."
                : "The GM adds characters to the party."}
            </p>
          ) : null}
          <ul className="party-members">
            {party.members.map((member) => {
              const current = member.hp - member.wounds;
              return (
                <li
                  key={member.id}
                  data-member={member.id}
                  // Dragged onto a map (the table's, or Map Studio's Play test), the character's token goes there.
                  draggable={gm}
                  onDragStart={(event) => {
                    if (!gm || (event.target as HTMLElement).closest("input, button, select")) return;
                    event.dataTransfer.setData("application/x-kraken-record", member.id);
                    event.dataTransfer.setData(TOKEN_DRAG, JSON.stringify({ name: member.name, record: member.id, art: session.recordArtUrl(member.id, "token") }));
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  // An effect or a roll dropped on a member lands on that character (its token or tracker entry).
                  onDragOver={(event) => {
                    if (carriesCreatureDrop([...event.dataTransfer.types])) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (!carriesCreatureDrop([...event.dataTransfer.types])) return;
                    event.preventDefault();
                    dropOnCreature(event.dataTransfer, { recordId: member.id }, { ct: session.ct, effects: session.effects }, session.role === "dm");
                  }}
                >
                  <span className="party-face">{member.portrait ? <Picture session={session} id={member.portrait} alt="" still /> : member.name.slice(0, 1)}</span>
                  <span className="party-who">
                    <b>{member.name}</b>
                    <small>
                      {[[member.race, member.classes].filter(Boolean).join(" "), member.owner].filter(Boolean).join(" · ")}
                    </small>
                    {member.abilities?.length ? (
                      <span className="party-abilities" data-party-abilities={member.id}>
                        {member.abilities.map((ability) => (
                          <span key={ability.key} className="party-ability" title={`${ability.key} ${ability.score}`}>
                            <small>{ability.key}</small>
                            {ability.score}
                            <i className={ability.bonus > 0 ? "up" : ability.bonus < 0 ? "down" : ""}>{ability.bonus >= 0 ? `+${ability.bonus}` : ability.bonus}</i>
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {member.passive || member.senses?.length ? (
                      <small className="party-senses">
                        <Icon name="eye" size={12} /> {[member.passive ? `Passive Perception ${member.passive}` : "", ...(member.senses ?? [])].filter(Boolean).join(" · ")}
                      </small>
                    ) : null}
                  </span>
                  {!member.fate && member.hp > 0 ? (
                    <span className="party-bars">
                      <Meter label="HP" value={current} max={member.hp} kind="hp" />
                      {member.hitdice ? <Meter label={`HD${member.hitdice.die ? ` ${member.hitdice.die}` : ""}`} value={member.hitdice.total - member.hitdice.used} max={member.hitdice.total} kind="hd" /> : null}
                    </span>
                  ) : null}
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
                      <span className="party-stat" title="Armour class">
                        <small>AC</small>
                        {member.ac}
                      </span>
                    </>
                  )}
                  {member.fate ? null : member.forged ? (
                    <span className="party-stat" title={`${member.forged.playbook}${member.forged.alias ? ` "${member.forged.alias}"` : ""}: stress ${member.forged.stress}/${member.forged.stressmax}, trauma ${member.forged.traumas.join(", ") || "none"}${member.forged.harm.length ? `; harm: ${member.forged.harm.join(", ")}` : ""}; stash ${member.forged.stash}${member.forged.status ? `; ${member.forged.status}` : ""}`} data-forged-member={member.id}>
                      <small>Stress</small>
                      {member.forged.stress}/{member.forged.stressmax}
                    </span>
                  ) : member.cairn ? (
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
              {/* Who is here tonight: every character of a player at the table joins, and the GM's own (no player holds
                  them); one whose player is not here leaves. */}
              <button
                type="button"
                data-action="party-from-here"
                title="Add every character of the players at the table now and your own (the GM's: characters no player holds), and take out those whose player is not here"
                onClick={() => {
                  const here = new Set(session.players.filter((seat) => seat.role === "player" && !seat.lost).map((seat) => seat.name));
                  const keep = party.members.filter((member) => {
                    const owner = session.records[member.id]?.owner;
                    return !owner || here.has(owner);
                  });
                  // The GM's own characters (no player holds them) join too: a GM may run one in the party.
                  const joining = characters.filter((record) => (!record.owner || here.has(record.owner)) && !keep.some((member) => member.id === record.id));
                  patch({ members: [...keep.map((member) => member.id), ...joining.map((record) => record.id)] });
                }}
              >
                Party from who's here
              </button>
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
              {/* Forged in the Dark has no group checks: a group action is on the Score panel. */}
              {game.party.groupCheck === false ? null : (
                // The group roll (FG's party sheet roll): a check, save or skill, rolled for them now or asked of the players.
                <div className="party-group" aria-label="Group roll" data-party-roll={groupKind}>
                  <select aria-label="Roll kind" value={groupKind} onChange={(event) => setGroupKind(event.target.value as "check" | "save" | "skill")}>
                    {groupRolls.map((item) => (
                      <option key={item.kind} value={item.kind}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select aria-label="What they roll" value={groupChoice} onChange={(event) => setCheckStat(event.target.value)}>
                    {(groupRoll?.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <label title={ladder ? "The opposition on the ladder (2: Fair)" : "The DC (0: none)"}>
                    {ladder ? "vs" : cl ? "CL" : "DC"} <input type="number" min={0} value={checkCl} onChange={(event) => setCheckCl(Number(event.target.value) || 0)} style={{ width: "3.5rem" }} />
                  </label>
                  <span className="party-roll-mode" role="group" aria-label="Who rolls">
                    <button type="button" aria-pressed={groupMode === "roll"} data-party-mode="roll" title="Roll for them: the host rolls every member's sheet roll now" onClick={() => setGroupMode("roll")}>
                      <Icon name="d20" size={14} />
                    </button>
                    <button type="button" aria-pressed={groupMode === "ask"} data-party-mode="ask" title="Ask the players: a card in chat each owner rolls from (their own modifier box); you can roll for anyone offline" onClick={() => setGroupMode("ask")}>
                      <Icon name="chat" size={14} />
                    </button>
                  </span>
                  <button type="button" className="play-button" data-action="party-roll" onClick={() => session.partyRoll({ kind: groupKind, ...(groupKind === "skill" ? { skill: groupChoice } : { attribute: groupChoice }), dc: checkCl, mode: groupMode })} disabled={party.members.length === 0 || !groupChoice}>
                    {groupMode === "ask" ? "Ask" : "Roll"}
                  </button>
                </div>
              )}
            </div>
          ) : null}
          {gm && party.members.length ? <RestParty session={session} /> : null}
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div className="party-inventory">
          {gm ? (
            <div
              className="party-parcel"
              data-parcel-drop
              title="Drop a treasure parcel here: its coins and items join the parcel"
              onDragOver={(event) => {
                if (hasLink(event)) event.preventDefault();
              }}
              onDrop={(event) => {
                const link = linkFrom(event);
                const record = link && link.kind === "record" ? session.records[link.record] : null;
                if (record?.type !== "treasureparcel") return;
                event.preventDefault();
                void session.content("parcel", { action: "party", id: record.id });
              }}
            >
              <h3>Parcel to hand out</h3>
              <div className="parcel-coins">
                {[...new Set([...(session.options.currencies?.length ? session.options.currencies : game.party.currency), ...Object.keys(party.parcel.coins ?? {}).filter((coin) => Number(party.parcel.coins?.[coin]) > 0)])].map((coin) => (
                  <label key={coin}>
                    <Coin name={coin} />
                    {/* Sent when it is left or on Enter (each keystroke waiting on the host's echo lost letters). */}
                    <Field value={party.parcel.coins?.[coin] ?? 0} number editable label={`Parcel ${coin}`} onSave={(text) => patch({ parcel: { coins: { [coin]: Math.max(0, Number(text) || 0) } } })} />
                  </label>
                ))}
              </div>
              <ul className="sheet-list">
                {Object.entries(party.parcel.items ?? {}).map(([id, item]) => (
                  <li key={id}>
                    <span>
                      {item.name} ×{item.count}
                    </span>
                    <Field value={item.assign ?? ""} editable label={`Who gets ${item.name}`} onSave={(text) => patch({ parcel: { items: { [id]: { assign: text } } } })} />
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
          <PartyStash session={session} stash={party.stash ?? []} />
          <h3>Party inventory</h3>
          <ul className="sheet-list">
            {party.inventory.length === 0 ? <li className="hint empty-state">Nothing carried yet. What the party's characters carry is listed here.</li> : null}
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
            {party.members.length === 0 ? <li className="hint empty-state">Each member's purse shows here.</li> : null}
            {party.members.map((member) => (
              <li key={member.id}>
                <span>{member.name}</span>
                <span className="coin-row" data-member-coins={member.id}>
                  {member.coins.length ? member.coins.map((coin) => <Coin key={coin.name} name={coin.name} amount={coin.amount} />) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "order" ? <OrderTab session={session} party={party} /> : null}

      {tab === "xp" && gm && growth ? (
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

      {tab === "xp" && gm && milestones ? (
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

      {tab === "xp" && gm && !growth && !milestones ? (
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
                {Object.keys(party[kind]).length === 0 ? <li className="hint empty-state">{kind === "encounters" ? "No encounters yet: add one below with its XP." : "No quests yet: add one below with its XP."}</li> : null}
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
          {/* FG's XP tab: quests and encounters dropped on it from their lists (an encounter's XP from its creatures). */}
          <div
            className="xp-drop record-drop"
            data-xp-drop
            onDragOver={(event) => {
              if (hasLink(event)) event.preventDefault();
            }}
            onDrop={(event) => {
              const link = linkFrom(event);
              const record = link && link.kind === "record" ? session.records[link.record] : null;
              if (record?.type !== "quest" && record?.type !== "battle") return;
              event.preventDefault();
              void (record.type === "quest" ? session.content("quest", { action: "party", id: record.id }) : session.content("encounter", { action: "end", id: record.id }));
            }}
          >
            <span className="hint">Drop a quest (Quests) or an encounter (Encounters) here.</span>
            <form
              className="parcel-add"
              onSubmit={(event) => {
                event.preventDefault();
                if (!entryName.trim()) return;
                // A new quest record, onto the XP tab at once (it is in the Quests list, to write up and share).
                void session
                  .content<{ id: string }>("quest", { action: "create", name: entryName.trim(), xp: Math.max(0, entryXp) })
                  .then((quest) => session.content("quest", { action: "party", id: quest.id }));
                setEntryName("");
                setEntryXp(0);
              }}
            >
              <input placeholder="A new quest" aria-label="New quest name" value={entryName} onChange={(event) => setEntryName(event.target.value)} />
              <input type="number" min={0} value={entryXp} onChange={(event) => setEntryXp(Number(event.target.value) || 0)} style={{ width: "5rem" }} aria-label="XP" />
              <button type="submit" data-kind="quests">
                New quest
              </button>
            </form>
          </div>
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

// The party's stash, where the players trade: drag an item from your character's inventory here to put it in;
// drag one from here onto your inventory (or press Take) to have it. Chat says who put and took what.
function PartyStash({ session, stash }: { session: Session; stash: NonNullable<PartyView["stash"]> }) {
  const [over, setOver] = useState(false);
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  // Take: into the player's own character (the first they hold).
  const mine = Object.values(session.records).find((record) => record.type === "character" && record.owner && record.owner.toLowerCase() === me.toLowerCase());
  return (
    <section
      className={over ? "party-stash drop-over" : "party-stash"}
      data-party-stash
      aria-label="Party stash"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(INVENTORY_DRAG)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const [character, key] = event.dataTransfer.getData(INVENTORY_DRAG).split("|");
        if (!character || !key) return;
        event.preventDefault();
        session.partyStash({ action: "put", character, key });
      }}
    >
      <h3>Party stash</h3>
      <p className="hint">Drag an item from your character's inventory here to share it; drag it from here onto an inventory (or press Take) to have it.</p>
      <ul className="sheet-list">
        {stash.length === 0 ? <li className="hint empty-state">Nothing in the stash.</li> : null}
        {stash.map((entry) => (
          <li
            key={entry.id}
            data-stash-item={entry.id}
            draggable
            title={`Put in by ${entry.from || "someone"}: drag it onto an inventory to take it`}
            onDragStart={(event) => {
              event.dataTransfer.setData(STASH_DRAG, entry.id);
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <span>
              {entry.name} {entry.count > 1 ? `×${entry.count}` : ""}
            </span>
            <small className="hint">from {entry.from || "?"}</small>
            {mine ? (
              <button type="button" data-action="stash-take" title={`Into ${mine.name}'s gear`} onClick={() => session.partyStash({ action: "take", id: entry.id, character: mine.id })}>
                Take
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// The party's token, for a big map (a city, a region): where the party is. The GM chooses it (banners, flags,
// groups of adventurers: the art library's Party folder, or any token) and drags it onto the map; one a map, and
// dropped again it moves there. Players see it.
function PartyToken({ session, name, token, gm }: { session: Session; name: string; token: string; gm: boolean }) {
  const [picking, setPicking] = useState(false);
  const [named, setNamed] = useState(name);
  const save = (data: Record<string, unknown>) => void session.op({ op: "update", id: "party", patch: { data } }).catch(() => undefined);
  if (!gm && !token) return null;
  return (
    <section className="party-token" data-party-token aria-label="Party token">
      <div
        className="party-token-face"
        draggable={gm && Boolean(token)}
        title={gm ? (token ? "Drag onto a map: the party's place (one a map; drag again to move it)" : "Choose a token first") : name}
        onDragStart={(event) => {
          event.dataTransfer.setData("application/x-kraken-record", "party");
          event.dataTransfer.setData(TOKEN_DRAG, JSON.stringify({ name, record: "party", art: session.recordArtUrl("party", "token") }));
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        {token ? <Picture session={session} id={token} alt={name} still /> : <Icon name="flag" size={28} />}
      </div>
      <div className="party-token-info">
        {gm ? (
          <input
            aria-label="Party name"
            value={named}
            maxLength={80}
            onChange={(event) => setNamed(event.target.value)}
            onBlur={() => named.trim() && named.trim() !== name && void session.op({ op: "update", id: "party", patch: { name: named.trim() } }).catch(() => undefined)}
            onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as HTMLInputElement).blur()}
          />
        ) : (
          <b>{name}</b>
        )}
        {gm ? (
          <span className="party-token-actions">
            <button type="button" data-action="party-token-choose" onClick={() => setPicking(true)}>
              {token ? "Change token" : "Choose a token"}
            </button>
            {token ? <small className="hint">Drag it onto a map to mark where the party is.</small> : null}
          </span>
        ) : null}
      </div>
      {picking ? (
        <ArtPicker
          session={session}
          kind="token"
          current={token || undefined}
          race="Party"
          onPick={(id) => {
            save({ token: id ?? "" });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </section>
  );
}
