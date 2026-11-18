import { RestParty } from "../bookkeeping/RestParty";
import { useState, type ReactNode } from "react";
import { has, rulesetFor } from "../../shared/rulesets/registry.mjs";
import { PANELS } from "../rulesets";
import { Picture } from "../characters/ArtPicker";
import type { CombatEntry, Session } from "../session/useSession";
import { Icon } from "../ui/icons";
import { TOKEN_DRAG } from "../ui/QuickSlots";
import { FateLine } from "./FateLine";
import { CreatureDetails } from "./CreatureDetails";
import { BuffBar } from "../effects/BuffBar";
import { carriesCreatureDrop, dropOnCreature } from "../effects/drops";
import { TrackerButtons, wordsOf, textOfWords } from "../core/tracker/actions";
import { ProgressBoxes } from "../core/parts/ProgressBoxes";
import { RANK_NAMES, RANKS } from "../../shared/ironsworn/rules.mjs";

// The save box of a game whose manifest names none (C&C's six attributes against a CL).
const CORE_SAVES = { keys: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"], modLabel: "CL", modAria: "Save CL", button: "Roll save" };

const FACTION_LABEL = { friend: "Friend", neutral: "Neutral", foe: "Foe", none: "No side" } as const;
// FG's faction button: a click moves it on, foe to neutral to friend to none.
const FACTION_NEXT = { foe: "neutral", neutral: "friend", friend: "none", none: "foe" } as const;

// A button that asks once before it acts (FG's second click), with a Cancel to change your mind.
function ConfirmButton({ label, ask, onConfirm, className = "", disabled = false, action }: { label: ReactNode; ask: string; onConfirm: () => void; className?: string; disabled?: boolean; action?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className={className} disabled={disabled} data-action={action} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  return (
    <span className="ct-confirm" role="group" aria-label={ask}>
      <button
        type="button"
        className="danger"
        data-action={action ? `${action}-yes` : undefined}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {ask}
      </button>
      <button type="button" className="ghost" data-action={action ? `${action}-no` : undefined} onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}
// AD&D 2E's five saving throws.
const SAVE_LABELS: Record<string, string> = { death: "Death Ray or Poison", wands: "Magic Wands", paralysis: "Paralysis or Petrify", spells: "Spells",paralyzation:"Paralyzation, Poison, Death", rod: "Rod, Staff, Wand", petrification: "Petrification, Polymorph", breath: "Breath Weapon", spell: "Spell", str: "STR check", dex: "DEX check", end: "END check", int: "INT check", edu: "EDU check", soc: "SOC check", brawn: "Brawn check", reflex: "Reflex check", grit: "Grit check", intellect: "Intellect check", training: "Training check", presence: "Presence check" };

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
  // The GM's save box: the stats the game saves with, the modifier's word, the button (its manifest's tracker.saves).
  const saves = rulesetFor(session.ruleset).tracker?.saves ?? CORE_SAVES;
  const saveChoices = saves.keys;
  const saveChoice = saveChoices.includes(saveStat) ? saveStat : saveChoices[saveChoices.length - 1];
  const [saveCl, setSaveCl] = useState("0");
  const record = entry.recordId ? session.records[entry.recordId] : null;
  // A player's own character (the one that steadies a dying ally in Descending Darkness).
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const myCharacterId = gm ? "" : (Object.values(session.records).find((item) => item.type === "character" && item.owner === me)?.id ?? "");
  // The game's tracker (its manifest): its row buttons, its initiative's words, its attacks.
  const manifest = rulesetFor(session.ruleset);
  const tracker = manifest.tracker;
  const scope = { session, gm, myCharacterId, entry };
  const portrait = typeof record?.data?.portrait === "string" ? (record.data.portrait as string) : null;
  const tokenArt = session.map.tokens.find((token) => token.id === entry.tokenId || (entry.recordId && token.recordId === entry.recordId))?.art;
  // Who aims at this creature (the GM sees everyone's; a player their own creatures'), each in its token's colour.
  const aimers = session.combat.entries
    .filter((item) => item.targets?.includes(entry.id))
    .map((item) => ({ id: item.id, name: item.name, color: session.map.tokens.find((token) => token.id === item.tokenId || (item.recordId && token.recordId === item.recordId))?.color || "#ff5a4d" }));
  const apply = (kind: "damage" | "heal") => {
    const value = Number(amount);
    if (value > 0) session.ct(kind, { id: entry.id, amount: value });
    setAmount("");
  };

  return (
    <li
      className={["ct-row", `faction-${entry.faction}`, active ? "active" : "", entry.hidden ? "hidden-entry" : "", aimers.length ? "targeted" : ""].filter(Boolean).join(" ")}
      data-ct={entry.id}
      data-targeted={aimers.length || undefined}
      // Ctrl+click a row targets that creature (or drops it), as on its token (FG's tracker targeting).
      onClickCapture={(event) => {
        if (!(event.ctrlKey || event.metaKey) || (event.target as HTMLElement).closest("input, select, textarea")) return;
        event.preventDefault();
        event.stopPropagation();
        session.ct("target", { targetId: entry.id });
      }}
      // The GM drags a creature onto the map: its token goes where it falls (FG's tracker to the map).
      draggable={gm}
      onDragStart={(event) => {
        if (!gm || (event.target as HTMLElement).closest("input, button:not(.ct-face)")) return;
        event.dataTransfer.setData("application/x-kraken-ct", entry.id);
        event.dataTransfer.setData(TOKEN_DRAG, JSON.stringify({ name: entry.name, record: entry.recordId ?? null, ct: entry.id, art: entry.recordId ? session.recordArtUrl(entry.recordId, "token") : "" }));
        event.dataTransfer.effectAllowed = "copyMove";
      }}
      // A damage or healing roll from chat dropped here applies to this creature (FG's drop on the tracker).
      onDragOver={(event) => {
        if (carriesCreatureDrop([...event.dataTransfer.types])) event.preventDefault();
        if (gm && [...event.dataTransfer.types].some((type) => type === "application/x-kraken-damage" || type === "application/x-kraken-turn")) event.preventDefault();
      }}
      onDrop={(event) => {
        // An effect from the Effects list, a chat roll (by its type: damage, healing, an attack), a sheet's action.
        if (carriesCreatureDrop([...event.dataTransfer.types])) {
          event.preventDefault();
          event.stopPropagation();
          dropOnCreature(event.dataTransfer, { entryId: entry.id }, { ct: session.ct, effects: session.effects, entryOfRecord: (recordId) => session.combat.entries.find((item) => item.recordId === recordId)?.id }, gm);
          return;
        }
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
          <b>
            {entry.name}
            {aimers.length ? (
              <span className="ct-targeted" title={`Targeted by ${aimers.map((aimer) => aimer.name).join(", ")}`} aria-label={`Targeted by ${aimers.map((aimer) => aimer.name).join(", ")}`}>
                {aimers.slice(0, 4).map((aimer) => (
                  <i key={aimer.id} style={{ color: aimer.color }} />
                ))}
              </span>
            ) : null}
          </b>
          <small>
            {gm ? (
              <button type="button" className={`ct-faction faction-${entry.faction}`} data-action="faction-cycle" title="Click to change its side: foe, neutral, friend, none" aria-label={`${FACTION_LABEL[entry.faction]}: change side`} onClick={() => session.ct("update", { id: entry.id, patch: { faction: FACTION_NEXT[entry.faction] } })}>
                <i aria-hidden="true" />
                {FACTION_LABEL[entry.faction]}
              </button>
            ) : (
              FACTION_LABEL[entry.faction]
            )}
            {entry.hidden ? " · hidden" : ""}
          </small>
        </span>
        <BuffBar session={session} at={{ entryId: entry.id }} compact />
        {entry.ac !== undefined && !entry.fate && !entry.iron ? (
          <span className="ct-stat" title="Armour class">
            <Icon name="shield" size={14} />
            {entry.ac}
          </span>
        ) : null}
        {entry.cairn ? (
          // Cairn: STR now (damage past HP comes off it); a detachment is marked.
          <span className="ct-stat" data-cairn-str={entry.cairn.str} title={`STR ${entry.cairn.str} of ${entry.cairn.max}${entry.cairn.detachment ? " · a detachment" : ""}${entry.cairn.lostTurn ? " · loses the first turn (failed DEX save)" : ""}`}>
            STR {entry.cairn.str}
            {entry.cairn.detachment ? " ⚑" : ""}
          </span>
        ) : null}
        {entry.iron && entry.iron.rank ? (
          // Ironsworn: a foe is its rank and its progress track (harm marks it), not hit points.
          <span className="ct-iron" data-iron-rank={entry.iron.rank} data-iron-ticks={entry.iron.ticks ?? 0}>
            {gm ? (
              <select className="cc-field" value={entry.iron.rank} aria-label={`${entry.name} rank`} title={`Inflicts ${entry.iron.harm ?? 2} harm`} onChange={(event) => void session.ironsworn("foe-rank", "", { target: entry.id, rank: event.target.value })}>
                {(RANKS as string[]).map((rank) => (
                  <option key={rank} value={rank}>
                    {RANK_NAMES[rank as keyof typeof RANK_NAMES]}
                  </option>
                ))}
              </select>
            ) : (
              <small>{RANK_NAMES[entry.iron.rank as keyof typeof RANK_NAMES]}</small>
            )}
            <ProgressBoxes ticks={entry.iron.ticks ?? 0} label={`${entry.name}'s progress`} />
            {gm && !entry.iron.defeated ? (
              <>
                <button type="button" data-action="foe-mark" title="Mark progress (one harm, by its rank)" onClick={() => void session.ironsworn("foe-mark", "", { target: entry.id, times: 1 })}>
                  +
                </button>
                <select
                  className="cc-field"
                  value=""
                  aria-label={`${entry.name} inflicts harm on`}
                  title={`Inflict its harm (${entry.iron.harm ?? 2}) on a character: health down, then Endure Harm`}
                  data-action="foe-inflict"
                  onChange={(event) => event.target.value && void session.ironsworn("inflict", "", { target: entry.id, id: event.target.value })}
                >
                  <option value="">Harm…</option>
                  {session.combat.entries
                    .filter((item) => item.iron && !item.iron.rank && item.recordId)
                    .map((item) => (
                      <option key={item.id} value={item.recordId ?? ""}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </>
            ) : null}
          </span>
        ) : entry.iron ? (
          // Ironsworn: a character's initiative (in control) and momentum.
          <span className="ct-iron" data-iron-control={entry.iron.control ? "1" : "0"} title={tracker?.control?.title}>
            <b className={entry.iron.control ? "iron-on" : ""}>{entry.iron.control ? tracker?.control?.on : tracker?.control?.off}</b>
            <small> · momentum {entry.iron.momentum ?? 0} · health {entry.iron.health ?? 0} · spirit {entry.iron.spirit ?? 0}</small>
          </span>
        ) : null}
        {entry.iron ? (
          <span className="ct-status" style={{ borderColor: entry.health.color, color: entry.health.color }}>
            {entry.health.status}
          </span>
        ) : entry.hp !== undefined && !entry.fate ? (
          <span className="ct-stat ct-hp" title={`${entry.health.status}: ${(entry.hp ?? 0) - (entry.wounds ?? 0)} of ${entry.hp}${entry.temp ? `, ${entry.temp} temporary` : ""}`} style={{ color: entry.health.color }}>
            <Icon name="heart" size={14} />
            {(entry.hp ?? 0) - (entry.wounds ?? 0)}/{entry.hp}
            {entry.temp ? <span className="ct-temp"> (+{entry.temp})</span> : null}
          </span>
        ) : entry.health.status ? (
          <span className="ct-status" style={{ borderColor: entry.health.color, color: entry.health.color }}>
            {entry.health.status}
            {entry.bar !== undefined ? (
              // The share of its hit points left (the GM's Settings show players a bar).
              <span className="ct-bar" role="meter" aria-label={`${entry.name}'s health`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(entry.bar * 100)}>
                <span style={{ width: `${Math.round(entry.bar * 100)}%`, background: entry.health.color }} />
              </span>
            ) : null}
          </span>
        ) : null}
        {entry.delayed ? (
          <span className="ct-delayed" title="Delaying: out of the order until Act now">
            Delaying
          </span>
        ) : null}
        {(gm || entry.mine) && session.combat.active === entry.id && !entry.delayed ? (
          // FG's and Foundry's Delay: this creature waits; the turn passes on.
          <button type="button" className="ct-delay" data-action="delay" title="Delay: wait, out of the order, and act later with Act now" aria-label={`${entry.name}: delay`} onClick={() => session.ct("delay", { id: entry.id })}>
            <Icon name="hourglass" size={15} />
          </button>
        ) : null}
        {(gm || entry.mine) && entry.delayed ? (
          <button type="button" className="ct-act-now play-button" data-action="act-now" title="Act now: take the turn at once, after the one acting; this becomes its initiative" aria-label={`${entry.name}: act now`} onClick={() => session.ct("act-now", { id: entry.id })}>
            <Icon name="next" size={15} />
          </button>
        ) : null}
        {/* The game's row buttons (a dying character's save, Turn undead on the cleric's turn, an NPC's morale), as its manifest lists them. */}
        <TrackerButtons actions={tracker?.rowActions} scope={scope} className="ct-death-save" />
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
            <button type="button" title={tracker?.initiative?.ownTitle ?? "Roll my initiative"} onClick={() => session.ct("init", { which: entry.id })}>
              {tracker?.initiative?.own ?? "d10"}
            </button>
          </span>
        ) : null}
      </div>
      {entry.fate ? <FateLine entry={entry} session={session} /> : null}
      {entry.targets.length > 0 || (gm && (entry.attacks?.length || entry.powers?.length)) ? (
        <div className="ct-actions">
          {tracker?.attacks
            ? entry.attacks?.map((attack) => {
                // Attacks that always hit (Cairn): the die less Armor, with the game's die modes beside it.
                const style = tracker.attacks!;
                const words = { ...scope, entry: attack as unknown as CombatEntry };
                return (
                  <span key={attack.key} className="ct-attack" {...{ [`data-${style.attr}`]: attack.key }}>
                    <button type="button" data-action={style.hook} onClick={() => session.ct("attack", { id: entry.id, weapon: attack.key })} title={textOfWords(style.title, words)}>
                      {wordsOf(style.label, words)}
                    </button>
                    {style.modes.map((mode) => (
                      <button key={mode.mode} type="button" data-mode={mode.mode} onClick={() => session.ct("attack", { id: entry.id, weapon: attack.key, mode: mode.mode })} title={mode.title}>
                        {mode.label}
                      </button>
                    ))}
                  </span>
                );
              })
            : entry.attacks?.map((attack) => (
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
          {has(manifest, "multiAttack") && gm && (entry.attacks?.length ?? 0) > 1 ? (
            // A creature's whole round (claw, claw, bite) at its first target (2E, Basic Fantasy).
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
          {record?.type === "npc" ? <CreatureDetails session={session} recordId={record.id} name={entry.name} /> : null}
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
              {saves.modLabel}
              <input type="number" value={saveCl} onChange={(event) => setSaveCl(event.target.value)} style={{ width: "3.6rem" }} aria-label={saves.modAria} />
            </label>
            <button type="button" onClick={() => session.ct("save", { id: entry.id, attribute: saveChoice, cl: Number(saveCl) || 0 })}>
              {saves.button}
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
              <option value="none">No side</option>
            </select>
            <button type="button" onClick={() => session.ct("init", { which: entry.id })}>
              Roll init
            </button>
            <ConfirmButton className="danger" action="remove-entry" label={<><Icon name="trash" size={14} /> Remove</>} ask={`Remove ${entry.name}`} onConfirm={() => session.ct("remove", { id: entry.id })} />
          </div>
        </div>
      ) : null}
    </li>
  );
}

// FG's combat tracker: the round, everyone in initiative order with the
// active one marked, and the GM's controls along the bottom.
// FG's round counter: typed in (Enter or leaving the box), forwards or back.
function RoundBox({ round, onSet }: { round: number; onSet: (round: number) => void }) {
  const [draft, setDraft] = useState(String(round));
  const [was, setWas] = useState(round);
  if (was !== round) {
    setWas(round);
    setDraft(String(round));
  }
  const commit = () => {
    const next = Math.round(Number(draft));
    if (Number.isFinite(next) && next >= 1 && next !== round) onSet(next);
    else setDraft(String(round));
  };
  return (
    <label className="ct-round-box">
      Round{" "}
      <input type="number" min={1} value={draft} aria-label="Round" data-action="set-round" title="Type a round to put the counter right (nothing is undone)" onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && commit()} />
    </label>
  );
}

export function CombatTracker({ session }: { session: Session }) {
  // A game may replace the tracker with a window of its own, as FG 2E's CTA (Forged in the Dark has no initiative: its Score panel).
  const Replaced = PANELS[rulesetFor(session.ruleset).tracker?.replace ?? ""];
  if (Replaced) return <Replaced session={session} />;
  return <InitiativeTracker session={session} />;
}
function InitiativeTracker({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const { combat } = session;
  // The game's tracker (its manifest): the roll-all button's words, header controls and buttons.
  const tracker = rulesetFor(session.ruleset).tracker;
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
          <Icon name="flag" size={16} /> {gm && combat.round > 0 ? <RoundBox round={combat.round} onSet={(round) => session.ct("set-round", { round })} /> : combat.round > 0 ? `Round ${combat.round}` : "Not started"}
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
            <button type="button" data-action="init-all" onClick={() => session.ct("init", { which: "all" })} disabled={combat.entries.length === 0} title={tracker?.initiative?.rollAllTitle}>
              {tracker?.initiative?.rollAll ?? "Roll all"}
            </button>
            {(tracker?.headerParts ?? []).map((ref) => {
              const Part = PANELS[ref];
              return Part ? <Part key={ref} session={session} /> : null;
            })}
            <TrackerButtons actions={tracker?.headerActions} scope={{ session, gm, myCharacterId: "" }} />
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
            <ConfirmButton className="danger" action="clear-npcs" label="Clear NPCs" ask="End and remove every NPC" disabled={combat.entries.length === 0} onConfirm={() => session.ct("end", { removeNpcs: true })} />
            <ConfirmButton action="remove-foes" label="Delete foes" ask="Delete every foe" disabled={!combat.entries.some((entry) => entry.faction === "foe")} onConfirm={() => session.ct("remove-faction", { faction: "foe" })} />
            <ConfirmButton action="remove-nonfriend" label="Delete non-friendly" ask="Delete all but friends" disabled={!combat.entries.some((entry) => entry.faction !== "friend")} onConfirm={() => session.ct("remove-faction", { faction: "nonfriend" })} />
            <ConfirmButton action="clear-effects" label="Clear effects" ask="Take off every effect" disabled={!combat.entries.some((entry) => entry.effects.length > 0)} onConfirm={() => session.ct("clear-effects")} />
          </div>
          {/* The fight is over: the party may rest (the calendar moves on). */}
          {combat.round === 0 ? <RestParty session={session} className="ct-add ct-rest" /> : null}
        </footer>
      ) : null}
    </div>
  );
}
