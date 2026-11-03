import { useState } from "react";
import { Picture } from "../characters/ArtPicker";
import type { CombatEntry, Session } from "../session/useSession";
import { Icon } from "../ui/icons";

const FACTION_LABEL = { friend: "Friend", neutral: "Neutral", foe: "Foe" } as const;

function focusToken(tokenId: string | null) {
  if (tokenId) window.dispatchEvent(new CustomEvent("kraken:focus-token", { detail: tokenId }));
}

// One row: whose turn, initiative, the creature, its defence and health,
// and its effects. The GM edits it in place.
function Row({ entry, session, active }: { entry: CombatEntry; session: Session; active: boolean }) {
  const gm = session.role === "dm";
  const [amount, setAmount] = useState("");
  const [effect, setEffect] = useState("");
  const [rounds, setRounds] = useState("");
  const [open, setOpen] = useState(false);
  const record = entry.recordId ? session.records[entry.recordId] : null;
  const portrait = typeof record?.data?.portrait === "string" ? (record.data.portrait as string) : null;
  const tokenArt = session.map.tokens.find((token) => token.id === entry.tokenId || (entry.recordId && token.recordId === entry.recordId))?.art;
  const apply = (kind: "damage" | "heal") => {
    const value = Number(amount);
    if (value > 0) session.ct(kind, { id: entry.id, amount: value });
    setAmount("");
  };

  return (
    <li className={["ct-row", `faction-${entry.faction}`, active ? "active" : "", entry.hidden ? "hidden-entry" : ""].filter(Boolean).join(" ")} data-ct={entry.id}>
      <div className="ct-main">
        <span className="ct-turn" aria-label={active ? "Their turn" : undefined}>
          {active ? <Icon name="next" size={16} /> : null}
        </span>
        {gm ? (
          <input
            className="ct-init"
            aria-label={`${entry.name} initiative`}
            type="number"
            value={entry.initresult}
            onChange={(event) => session.ct("update", { id: entry.id, patch: { initresult: Number(event.target.value) || 0 } })}
          />
        ) : (
          <span className="ct-init">{entry.initresult}</span>
        )}
        <button type="button" className="ct-face" title="Find on the map" onClick={() => focusToken(entry.tokenId ?? session.map.tokens.find((token) => token.recordId === entry.recordId)?.id ?? null)}>
          {portrait ? (
            <Picture session={session} id={portrait} alt="" />
          ) : tokenArt ? (
            <img src={tokenArt} alt="" />
          ) : record && record.type === "npc" && (record.data.token || record.data.picture) ? (
            <img src={session.recordArtUrl(record.id)} alt="" onError={(event) => (event.currentTarget.style.display = "none")} />
          ) : (
            <span>{entry.name.slice(0, 1)}</span>
          )}
        </button>
        <span className="ct-name">
          <b>{entry.name}</b>
          <small>
            {FACTION_LABEL[entry.faction]}
            {entry.hidden ? " · hidden" : ""}
          </small>
        </span>
        {entry.ac !== undefined ? (
          <span className="ct-stat" title="Armour class">
            <Icon name="shield" size={14} />
            {entry.ac}
          </span>
        ) : null}
        {entry.hp !== undefined ? (
          <span className="ct-stat ct-hp" title={`${entry.health.status}: ${(entry.hp ?? 0) - (entry.wounds ?? 0)} of ${entry.hp}`} style={{ color: entry.health.color }}>
            <Icon name="heart" size={14} />
            {(entry.hp ?? 0) - (entry.wounds ?? 0)}/{entry.hp}
          </span>
        ) : (
          <span className="ct-status" style={{ borderColor: entry.health.color, color: entry.health.color }}>
            {entry.health.status}
          </span>
        )}
        {gm ? (
          <span className="ct-tools">
            <button type="button" title={entry.hidden ? "Show to players" : "Hide from players"} onClick={() => session.ct("update", { id: entry.id, patch: { hidden: !entry.hidden } })}>
              <Icon name={entry.hidden ? "eye-off" : "eye"} size={16} />
            </button>
            <button
              type="button"
              title="The creature whose turn it is targets this one"
              disabled={!session.combat.active || session.combat.active === entry.id}
              onClick={() => session.ct("target", { sourceId: session.combat.active, targetId: entry.id })}
            >
              <Icon name="target" size={16} />
            </button>
            <button type="button" title="More" aria-expanded={open} onClick={() => setOpen(!open)}>
              <Icon name="settings" size={16} />
            </button>
          </span>
        ) : entry.mine ? (
          <span className="ct-tools">
            <button type="button" title="Roll my initiative" onClick={() => session.ct("init", { which: entry.id })}>
              d10
            </button>
          </span>
        ) : null}
      </div>
      {entry.targets.length > 0 || (gm && entry.attacks?.length) ? (
        <div className="ct-actions">
          {entry.attacks?.map((attack) => (
            <span key={attack.key} className="ct-attack">
              <button type="button" onClick={() => session.ct("attack", { id: entry.id, weapon: attack.key })} title={`${attack.name}: attack`}>
                {attack.name} {attack.bonus >= 0 ? "+" : ""}
                {attack.bonus}
              </button>
              {attack.damage ? (
                <button type="button" onClick={() => session.ct("damage-roll", { id: entry.id, weapon: attack.key })} title={`${attack.name}: damage`}>
                  {attack.damage}
                </button>
              ) : null}
            </span>
          ))}
          {entry.targets.map((id) => {
            const target = session.combat.entries.find((item) => item.id === id);
            return target ? (
              <span key={id} className="ct-target" title={`${entry.name} targets ${target.name}`}>
                → {target.name}
                {gm || entry.mine ? (
                  <button type="button" aria-label={`Drop ${target.name}`} onClick={() => session.ct("target", { sourceId: entry.id, targetId: target.id, on: false })}>
                    ×
                  </button>
                ) : null}
              </span>
            ) : null;
          })}
        </div>
      ) : null}
      {entry.effects.length > 0 ? (
        <div className="ct-effects">
          {entry.effects.map((item) => (
            <span key={item.id} className="ct-effect" title={item.duration ? `${item.duration} round${item.duration === 1 ? "" : "s"} left` : "Until removed"}>
              {item.label}
              {item.duration ? <small>{item.duration}</small> : null}
              {gm ? (
                <button type="button" aria-label={`Remove ${item.label}`} onClick={() => session.ct("effect-remove", { id: entry.id, effectId: item.id })}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {gm && open ? (
        <div className="ct-more">
          <form
            className="ct-adjust"
            onSubmit={(event) => {
              event.preventDefault();
              apply("damage");
            }}
          >
            <input aria-label="Amount" type="number" min={0} value={amount} placeholder="0" onChange={(event) => setAmount(event.target.value)} />
            <button type="submit" className="danger">
              Damage
            </button>
            <button type="button" onClick={() => apply("heal")}>
              Heal
            </button>
          </form>
          <form
            className="ct-adjust"
            onSubmit={(event) => {
              event.preventDefault();
              if (!effect.trim()) return;
              session.ct("effect", { id: entry.id, effect: { label: effect.trim(), duration: Number(rounds) || 0 } });
              setEffect("");
              setRounds("");
            }}
          >
            <input aria-label="Effect" value={effect} placeholder="Effect, e.g. Bless; ATK: 1" onChange={(event) => setEffect(event.target.value)} />
            <input aria-label="Rounds" type="number" min={0} value={rounds} placeholder="rnds" onChange={(event) => setRounds(event.target.value)} style={{ width: "4.2rem" }} />
            <button type="submit">Add effect</button>
          </form>
          <div className="ct-adjust">
            <label>
              Bonus
              <input type="number" value={entry.init ?? 0} onChange={(event) => session.ct("update", { id: entry.id, patch: { init: Number(event.target.value) || 0 } })} style={{ width: "3.6rem" }} />
            </label>
            {entry.recordId && session.records[entry.recordId]?.type === "character" ? null : (
              <>
                <label>
                  HP
                  <input type="number" value={entry.hp ?? 0} onChange={(event) => session.ct("update", { id: entry.id, patch: { hp: Number(event.target.value) || 0 } })} style={{ width: "4rem" }} />
                </label>
                <label>
                  AC
                  <input type="number" value={entry.ac ?? 10} onChange={(event) => session.ct("update", { id: entry.id, patch: { ac: Number(event.target.value) || 0 } })} style={{ width: "3.6rem" }} />
                </label>
              </>
            )}
            <select aria-label="Faction" value={entry.faction} onChange={(event) => session.ct("update", { id: entry.id, patch: { faction: event.target.value } })}>
              <option value="friend">Friend</option>
              <option value="neutral">Neutral</option>
              <option value="foe">Foe</option>
            </select>
            <button type="button" onClick={() => session.ct("init", { which: entry.id })}>
              Roll init
            </button>
            <button type="button" className="danger" onClick={() => session.ct("remove", { id: entry.id })}>
              <Icon name="trash" size={14} /> Remove
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// FG's combat tracker: the round, everyone in initiative order with the
// active one marked, and the GM's controls along the bottom.
export function CombatTracker({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const { combat } = session;
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(1);
  const [place, setPlace] = useState(true);
  const npcs = Object.values(session.records)
    .filter((record) => record.type === "npc" && (!search || record.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60);
  const mine = combat.entries.find((entry) => entry.mine && entry.id === combat.active);

  return (
    <div className="combat-tracker" data-round={combat.round}>
      <header className="ct-head">
        <span className="ct-round">
          <Icon name="flag" size={16} /> {combat.round > 0 ? `Round ${combat.round}` : "Not started"}
        </span>
        {gm ? (
          <span className="ct-head-tools">
            <button type="button" onClick={() => session.ct("init", { which: "npcs" })} disabled={combat.entries.length === 0}>
              Roll NPC init
            </button>
            <button type="button" onClick={() => session.ct("init", { which: "all" })} disabled={combat.entries.length === 0}>
              Roll all
            </button>
            <button type="button" className="play-button" data-action="next-turn" onClick={() => session.ct("next")} disabled={combat.entries.length === 0}>
              {combat.round > 0 ? "Next turn" : "Start combat"} <Icon name="next" size={14} />
            </button>
          </span>
        ) : mine ? (
          <button type="button" className="play-button" onClick={() => session.ct("next")}>
            End my turn <Icon name="next" size={14} />
          </button>
        ) : null}
      </header>
      <ol className="ct-list">
        {combat.entries.length === 0 ? <li className="hint">No one is in the fight yet.</li> : null}
        {combat.entries.map((entry) => (
          <Row key={entry.id} entry={entry} session={session} active={entry.id === combat.active} />
        ))}
      </ol>
      {gm ? (
        <footer className="ct-foot">
          <div className="ct-add">
            <input type="search" placeholder="Add a creature: search NPCs" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search NPCs" list="ct-npcs" />
            <datalist id="ct-npcs">
              {npcs.map((record) => (
                <option key={record.id} value={record.name} />
              ))}
            </datalist>
            <input type="number" min={1} max={20} value={count} onChange={(event) => setCount(Math.max(1, Number(event.target.value) || 1))} aria-label="How many" style={{ width: "3.6rem" }} />
            <label className="check">
              <input type="checkbox" checked={place} onChange={(event) => setPlace(event.target.checked)} /> tokens
            </label>
            <button
              type="button"
              onClick={() => {
                const match = Object.values(session.records).find((record) => record.type === "npc" && record.name.toLowerCase() === search.trim().toLowerCase());
                if (match) session.ct("add", { recordId: match.id, count, place });
                else if (search.trim()) session.ct("add", { entry: { name: search.trim(), faction: "foe", hp: 1, ac: 10 }, count });
                setSearch("");
              }}
            >
              <Icon name="plus" size={14} /> Add
            </button>
            <button type="button" onClick={() => session.ct("add-party")}>
              Add the party
            </button>
          </div>
          <div className="ct-add">
            <button type="button" onClick={() => session.ct("round")} disabled={combat.round === 0}>
              Next round
            </button>
            <button type="button" onClick={() => session.ct("end", { removeNpcs: false })} disabled={combat.round === 0}>
              End combat
            </button>
            <button type="button" className="danger" onClick={() => session.ct("end", { removeNpcs: true })} disabled={combat.entries.length === 0}>
              Clear NPCs
            </button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
