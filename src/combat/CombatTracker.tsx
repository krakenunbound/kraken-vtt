import { useState } from "react";
import { Picture } from "../characters/ArtPicker";
import type { CombatEntry, Session } from "../session/useSession";
import { Icon } from "../ui/icons";

const FACTION_LABEL = { friend: "Friend", neutral: "Neutral", foe: "Foe" } as const;
// AD&D 2E's five saving throws.
const SAVE_LABELS: Record<string, string> = { paralyzation: "Paralyzation, Poison, Death", rod: "Rod, Staff, Wand", petrification: "Petrification, Polymorph", breath: "Breath Weapon", spell: "Spell", str: "STR check", dex: "DEX check", end: "END check", int: "INT check", edu: "EDU check", soc: "SOC check", brawn: "Brawn check", reflex: "Reflex check", grit: "Grit check", intellect: "Intellect check", training: "Training check", presence: "Presence check" };

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
  const [saveStat, setSaveStat] = useState("wisdom");
  const saveChoices = session.ruleset === "D&D 3.5E" ? ["fortitude", "reflex", "will"] : session.ruleset === "AD&D 2E" ? ["paralyzation", "rod", "petrification", "breath", "spell"] : session.ruleset === "Traveller" ? ["str", "dex", "end", "int", "edu", "soc"] : session.ruleset === "Apeira Astra" ? ["brawn", "reflex", "grit", "intellect", "training", "presence"] : ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
  const saveChoice = saveChoices.includes(saveStat) ? saveStat : saveChoices[saveChoices.length - 1];
  const [saveCl, setSaveCl] = useState("0");
  const record = entry.recordId ? session.records[entry.recordId] : null;
  // A player's own character (the one that steadies a dying ally in Descending Darkness).
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const myCharacterId = gm ? "" : (Object.values(session.records).find((item) => item.type === "character" && item.owner === me)?.id ?? "");
  const portrait = typeof record?.data?.portrait === "string" ? (record.data.portrait as string) : null;
  const tokenArt = session.map.tokens.find((token) => token.id === entry.tokenId || (entry.recordId && token.recordId === entry.recordId))?.art;
  const apply = (kind: "damage" | "heal") => {
    const value = Number(amount);
    if (value > 0) session.ct(kind, { id: entry.id, amount: value });
    setAmount("");
  };

  return (
    <li
      className={["ct-row", `faction-${entry.faction}`, active ? "active" : "", entry.hidden ? "hidden-entry" : ""].filter(Boolean).join(" ")}
      data-ct={entry.id}
      // The GM drags a creature onto the map: its token goes where it falls (FG's tracker to the map).
      draggable={gm}
      onDragStart={(event) => {
        if (!gm || (event.target as HTMLElement).closest("input, button:not(.ct-face)")) return;
        event.dataTransfer.setData("application/x-kraken-ct", entry.id);
        event.dataTransfer.effectAllowed = "copyMove";
      }}
      // A damage or healing roll from chat dropped here applies to this creature (FG's drop on the tracker).
      onDragOver={(event) => {
        if (gm && [...event.dataTransfer.types].some((type) => type === "application/x-kraken-damage" || type === "application/x-kraken-turn")) event.preventDefault();
      }}
      onDrop={(event) => {
        // The turn arrow dropped here: their turn now.
        const turn = event.dataTransfer.getData("application/x-kraken-turn");
        if (gm && turn) {
          event.preventDefault();
          event.stopPropagation();
          if (turn !== entry.id) session.ct("set-turn", { id: entry.id });
          return;
        }
        const raw = event.dataTransfer.getData("application/x-kraken-damage");
        if (!gm || !raw) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          const roll = JSON.parse(raw) as { amount: number; heal?: boolean };
          if (roll.amount > 0) session.ct(roll.heal ? "heal" : "damage", { id: entry.id, amount: roll.amount });
        } catch {
          /* not a roll */
        }
      }}
    >
      <div className="ct-main">
        {gm ? (
          // FG's turn arrow: the GM drags it to anyone, or clicks here, to make it their turn.
          <button
            type="button"
            className={active ? "ct-turn on" : "ct-turn"}
            data-action="set-turn"
            aria-label={active ? `${entry.name}'s turn` : `Make it ${entry.name}'s turn`}
            title={active ? "Their turn: drag the arrow to someone else to make it theirs" : "Make it their turn"}
            draggable={active}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.setData("application/x-kraken-turn", entry.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => !active && session.ct("set-turn", { id: entry.id })}
          >
            {active ? <Icon name="next" size={16} /> : null}
          </button>
        ) : (
          <span className="ct-turn" aria-label={active ? "Their turn" : undefined}>
            {active ? <Icon name="next" size={16} /> : null}
          </span>
        )}
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
            <Picture session={session} id={portrait} alt="" still />
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
          <span className="ct-stat ct-hp" title={`${entry.health.status}: ${(entry.hp ?? 0) - (entry.wounds ?? 0)} of ${entry.hp}${entry.temp ? `, ${entry.temp} temporary` : ""}`} style={{ color: entry.health.color }}>
            <Icon name="heart" size={14} />
            {(entry.hp ?? 0) - (entry.wounds ?? 0)}/{entry.hp}
            {entry.temp ? <span className="ct-temp"> (+{entry.temp})</span> : null}
          </span>
        ) : (
          <span className="ct-status" style={{ borderColor: entry.health.color, color: entry.health.color }}>
            {entry.health.status}
          </span>
        )}
        {session.ruleset === "AD&D 2E" && entry.health.status === "Dying" && (gm || myCharacterId) ? (
          // 2E: binding the wounds stops the dying's bleeding.
          <button type="button" className="ct-death-save" data-action="stabilize" title="Bind their wounds: unconscious, no longer losing a hit point each round" onClick={() => session.ct("stabilize", { id: entry.id, ...(myCharacterId ? { recordId: myCharacterId } : {}) })}>
            Bind wounds
          </button>
        ) : null}
        {session.ruleset === "AD&D 2E" && entry.turns && (gm || entry.mine) && session.combat.active === entry.id ? (
          // 2E: a cleric (a paladin from 3rd level) turns the undead it targets, or every undead foe.
          <button type="button" className="ct-death-save" data-action="turn-undead" title={`Turn undead as a level ${entry.turns} cleric: target the undead first, or every undead foe is tried`} onClick={() => session.ct("turn-undead", { id: entry.id, ...(entry.recordId ? { recordId: entry.recordId } : {}) })}>
            Turn undead
          </button>
        ) : null}
        {session.ruleset === "Descending Darkness" && entry.health.status === "Dying" && (gm || myCharacterId) ? (
          // Descending Darkness: an ally steadies the dying (Wisdom 12); the GM's call without one.
          <button type="button" className="ct-death-save" data-action="stabilize" title="Steady them: an ally's Wisdom check against 12 stops the bleeding" onClick={() => session.ct("stabilize", { id: entry.id, ...(myCharacterId ? { recordId: myCharacterId } : {}) })}>
            Steady
          </button>
        ) : null}
        {session.ruleset === "D&D 5E" && entry.health.status === "Dying" && (gm || entry.mine) ? (
          // 5E: a Dying character's death saving throw.
          <button type="button" className="ct-death-save" data-action="death-save" title={`Death saves: ${entry.deathsaves?.success ?? 0} successes, ${entry.deathsaves?.failure ?? 0} failures`} onClick={() => session.ct("death-save", { id: entry.id })}>
            Death save {entry.deathsaves ? `(${entry.deathsaves.success}✓ ${entry.deathsaves.failure}✗)` : ""}
          </button>
        ) : null}
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
      {entry.targets.length > 0 || (gm && (entry.attacks?.length || entry.powers?.length)) ? (
        <div className="ct-actions">
          {entry.attacks?.map((attack) => (
            <span key={attack.key} className="ct-attack">
              <button type="button" onClick={() => session.ct("attack", { id: entry.id, weapon: attack.key })} title={attack.thaco !== undefined ? `${attack.name}: attack (THAC0 ${attack.thaco}${attack.bonus ? `, ${attack.bonus > 0 ? "+" : ""}${attack.bonus} to hit` : ""})` : `${attack.name}: attack`}>
                {attack.thaco !== undefined ? (
                  <>
                    {attack.name}
                    {attack.bonus ? ` ${attack.bonus > 0 ? "+" : ""}${attack.bonus}` : ""}
                  </>
                ) : (
                  <>
                    {attack.name} {attack.bonus >= 0 ? "+" : ""}
                    {attack.bonus}
                  </>
                )}
              </button>
              {attack.bonuses && attack.bonuses.length > 1 ? (
                <button type="button" data-full-attack={attack.key} onClick={() => session.ct("attack", { id: entry.id, weapon: attack.key, full: true })} title={`${attack.name}: full attack (${attack.bonuses.map((bonus) => (bonus >= 0 ? `+${bonus}` : bonus)).join("/")}) at the first target`}>
                  Full
                </button>
              ) : null}
              {attack.damage ? (
                <button type="button" onClick={() => session.ct("damage-roll", { id: entry.id, weapon: attack.key })} title={`${attack.name}: damage`}>
                  {attack.damage}
                </button>
              ) : null}
            </span>
          ))}
          {session.ruleset === "AD&D 2E" && gm && (entry.attacks?.length ?? 0) > 1 ? (
            // 2E: a creature's whole round (claw, claw, bite) at its first target.
            <span className="ct-attack">
              <button type="button" data-full-attack="all" onClick={() => session.ct("attack", { id: entry.id, weapon: "0", full: true })} title="Every attack this round, at the first target">
                All attacks
              </button>
            </span>
          ) : null}
          {entry.powers?.map((power) => (
            <span key={power.key} className="ct-attack ct-power">
              <button
                type="button"
                data-action="npc-cast"
                disabled={power.uses > 0 && power.used >= power.uses}
                onClick={() => session.ct("cast", { id: entry.id, power: power.key })}
                title={`${power.name}: use it on ${entry.name}'s targets${power.save ? ` (save: ${power.save})` : ""}${power.uses ? `; ${power.uses - power.used} of ${power.uses} left today` : ""}`}
              >
                ✦ {power.name}
                {power.uses ? ` ${power.uses - power.used}/${power.uses}` : ""}
              </button>
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
            <select aria-label="Save" value={saveChoice} onChange={(event) => setSaveStat(event.target.value)}>
              {saveChoices.map((stat) => (
                <option key={stat} value={stat}>
                  {SAVE_LABELS[stat] ?? `${stat[0].toUpperCase() + stat.slice(1)} save`}
                </option>
              ))}
            </select>
            <label>
              {session.ruleset === "AD&D 2E" ? "Mod" : session.ruleset === "Traveller" || session.ruleset === "Apeira Astra" ? "DM" : session.ruleset === "D&D 5E" || session.ruleset === "Descending Darkness" || session.ruleset === "D&D 3.5E" ? "DC" : "CL"}
              <input type="number" value={saveCl} onChange={(event) => setSaveCl(event.target.value)} style={{ width: "3.6rem" }} aria-label={session.ruleset === "AD&D 2E" ? "Save modifier" : session.ruleset === "Traveller" || session.ruleset === "Apeira Astra" ? "Check DM" : session.ruleset === "D&D 5E" || session.ruleset === "D&D 3.5E" ? "Save DC" : "Save CL"} />
            </label>
            <button type="button" onClick={() => session.ct("save", { id: entry.id, attribute: saveChoice, cl: Number(saveCl) || 0 })}>
              {session.ruleset === "Traveller" || session.ruleset === "Apeira Astra" ? "Roll check" : "Roll save"}
            </button>
          </div>
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
  const [dropping, setDropping] = useState(false);
  const npcs = Object.values(session.records)
    .filter((record) => record.type === "npc" && (!search || record.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60);
  const mine = combat.entries.find((entry) => entry.mine && entry.id === combat.active);

  return (
    <div
      className={dropping ? "combat-tracker dropping" : "combat-tracker"}
      data-round={combat.round}
      onDragOver={(event) => {
        if (!gm || ![...event.dataTransfer.types].includes("application/x-kraken-record")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        const recordId = event.dataTransfer.getData("application/x-kraken-record");
        if (!gm || !recordId) return;
        event.preventDefault();
        session.ct("add", { recordId, count: 1, place });
      }}
    >
      <header className="ct-head">
        <span className="ct-round" data-round={combat.round}>
          {gm && combat.round > 1 ? (
            <button type="button" className="ghost ct-round-step" data-action="round-back" title="Round back: undo the turn changes back to the last turn of the round before (effects that ran out come back, ongoing damage is healed)" aria-label="Round back" onClick={() => session.ct("round-back")}>
              ‹
            </button>
          ) : null}
          <Icon name="flag" size={16} /> {combat.round > 0 ? `Round ${combat.round}` : "Not started"}
          {gm && combat.round > 0 ? (
            <button type="button" className="ghost ct-round-step" data-action="round-next" title="Next round: the rest of this round passes, and the first in the order starts" aria-label="Next round" onClick={() => session.ct("round")}>
              ›
            </button>
          ) : null}
        </span>
        {gm ? (
          <span className="ct-head-tools">
            <button type="button" onClick={() => session.ct("init", { which: "npcs" })} disabled={combat.entries.length === 0}>
              Roll NPC init
            </button>
            <button type="button" onClick={() => session.ct("init", { which: "all" })} disabled={combat.entries.length === 0}>
              Roll all
            </button>
            {combat.round > 0 ? (
              <button type="button" data-action="prev-turn" title="Back: undo the last turn change (effects that ran out come back, ongoing damage is healed); what happened during the turn stays" onClick={() => session.ct("prev")}>
                <span className="flip"><Icon name="next" size={14} /></span> Back
              </button>
            ) : null}
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
