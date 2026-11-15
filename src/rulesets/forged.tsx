import { useMemo } from "react";
import { Field } from "../core/fields/Field";
import { useSheet } from "../core/sheet/context";
import { ClockFace } from "../notes/ClocksWindow";
import { ofGame } from "../../shared/rulesets/registry.mjs";
import { ACTION_WORDS, ACTIONS, ACTIONS_BY_ATTRIBUTE, ATTRIBUTES, EFFECTS, FLASHBACK, HARM_PENALTY, OVERINDULGENCE, POSITIONS, RESIST_WORDS, TRAUMAS, XP_TRACKS, titled } from "../../shared/forged/rules.mjs";

// Forged in the Dark's own parts, where no core part fits (docs/core-ui-design.md
// 4.4, level 3): the action roll's bar (position and effect from the Score
// panel, changeable here; assistance, pushing, the Devil's Bargain, a clock to
// tick), the attributes with their actions to roll and resist, stress and
// trauma, harm and the healing clock, armor and coin, load and items, the
// playbook's xp and special abilities, friends and rivals, downtime and
// long-term projects. The header and the Notes page are the core's, laid out
// by shared/forged/manifest.mjs. Every choice the sheet keeps while it is open
// (the roll bar's, the xp track shared by the Playbook and Downtime pages...)
// is a sheet modifier, so it stays tab to tab, as the hand-made sheet's did.

type Row = Record<string, unknown>;
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const list = (node: unknown): Row[] => (Array.isArray(node) ? (node as Row[]) : rows(node).map(([, row]) => row));

// Boxes in a row (stress, xp, heat): click one to set the count to it (again to clear it).
export function Boxes({ count, filled, onSet, label, disabled, kind = "" }: { count: number; filled: number; onSet?: (value: number) => void; label: string; disabled?: boolean; kind?: string }) {
  return (
    <span className={`forged-boxes ${kind}`} role="group" aria-label={label} data-filled={filled}>
      {Array.from({ length: count }, (_, index) => (
        <button key={index} type="button" className={index < filled ? "on" : ""} disabled={disabled || !onSet} aria-label={`${label} ${index + 1}`} onClick={() => onSet?.(index + 1 === filled ? index : index + 1)} />
      ))}
    </span>
  );
}

// The sheet modifiers this sheet keeps, at the values the hand-made sheet started with.
const START = { position: "", effect: "", assist: "", pushDice: false, pushEffect: false, pushHarm: false, bargain: "", bonus: 0, clock: "", trauma: "Cold", overindulge: "Attract Trouble", track: "playbook", workOn: "study", heatWith: "consort", asset: "", quality: 2, flash: 1, pay: "", pick: "" };
type Kept = typeof START;

function useForged() {
  const sheet = useSheet();
  const { record, session, modifiers, setModifier } = sheet;
  const data = record.data as Row;
  const kept = <K extends keyof Kept>(key: K): Kept[K] => (modifiers[key] === undefined ? START[key] : (modifiers[key] as Kept[K]));
  const keep = <K extends keyof Kept>(key: K, value: Kept[K]) => setModifier(key, value);
  const act = (action: string, args: Record<string, unknown> = {}) => session.forgedAction(record.id, action, args);
  const pay = kept("pay");
  const paid = pay ? { pay } : {};
  return { ...sheet, data, kept, keep, act, paid };
}

// The position and effect a roll takes: the bar's, else the Score panel's.
function usePosition() {
  const { session, kept } = useForged();
  const score = session.clocks.score;
  return { pos: kept("position") || score.position || "risky", eff: kept("effect") || score.effect || "standard" };
}

// The action roll's bar (the owner's): position, effect, assist, pushes, a bargain, bonus dice, a clock.
export function ForgedRollBar() {
  const { record, session, editable, data, kept, keep } = useForged();
  const { pos, eff } = usePosition();
  if (!editable) return null;
  const others = Object.values(session.records).filter((item) => item.type === "character" && ofGame(item, String(record.data.ruleset)) && item.id !== record.id);
  const pushDice = kept("pushDice");
  return (
    <section className="cc-panel forged-rollbar" aria-label="Action roll">
      <label>
        <small>Position</small>
        <select aria-label="Roll position" value={pos} onChange={(event) => keep("position", event.target.value)}>
          {POSITIONS.map((item: string) => (
            <option key={item} value={item}>
              {titled(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <small>Effect</small>
        <select aria-label="Roll effect" value={eff} onChange={(event) => keep("effect", event.target.value)}>
          {EFFECTS.map((item: string) => (
            <option key={item} value={item}>
              {titled(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <small>Assist (+1d)</small>
        <select aria-label="Assisted by" value={kept("assist")} onChange={(event) => keep("assist", event.target.value)}>
          <option value="">No one</option>
          {others.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="inline-check" title="+1d for 2 stress">
        <input type="checkbox" data-push="dice" checked={pushDice} onChange={(event) => keep("pushDice", event.target.checked)} /> Push +1d
      </label>
      <label className="inline-check" title="+1 effect for 2 stress">
        <input type="checkbox" data-push="effect" checked={kept("pushEffect")} onChange={(event) => keep("pushEffect", event.target.checked)} /> Push +effect
      </label>
      {(data.penalties as Row | undefined)?.needHelp ? (
        <label className="inline-check" title="Severe harm: act anyway for 2 stress (or have someone assist)">
          <input type="checkbox" data-push="harm" checked={kept("pushHarm")} onChange={(event) => keep("pushHarm", event.target.checked)} /> Push through harm
        </label>
      ) : null}
      <label className="grow">
        <small>Devil's Bargain (+1d)</small>
        <input aria-label="Devil's Bargain" data-transient placeholder="The price, whatever the roll" value={kept("bargain")} disabled={pushDice} onChange={(event) => keep("bargain", event.target.value)} />
      </label>
      <label>
        <small>Bonus</small>
        <input type="number" aria-label="Bonus dice" min={-3} max={3} value={kept("bonus")} onChange={(event) => keep("bonus", Number(event.target.value) || 0)} style={{ width: "3rem" }} />
      </label>
      <label>
        <small>Tick clock</small>
        <select aria-label="Clock to tick" value={kept("clock")} onChange={(event) => keep("clock", event.target.value)}>
          <option value="">None</option>
          {session.clocks.clocks.filter((item) => !item.locked).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <small className="hint">Click an action to roll it; an attribute to resist.</small>
    </section>
  );
}

// The three attributes: each resisted, its xp, its actions (the GM sets their dots) rolled with the bar, an advance's dot.
export function ForgedAttributes() {
  const { editable, gm, data, kept, keep, act, change } = useForged();
  const { pos, eff } = usePosition();
  const actions = (data.actions ?? {}) as Record<string, number>;
  const attributes = (data.attributes ?? {}) as Record<string, number>;
  const xp = (data.xp ?? {}) as Record<string, number>;
  const advances = (data.advances ?? {}) as Record<string, number>;
  const roll = (action: string) => {
    if (!editable) return;
    const assist = kept("assist");
    const bargain = kept("bargain");
    const bonus = kept("bonus");
    const clock = kept("clock");
    const pushDice = kept("pushDice");
    act("action-roll", { action, position: pos, effect: eff, ...(assist ? { assist } : {}), pushDice, pushEffect: kept("pushEffect"), ...(kept("pushHarm") ? { pushIncapacitated: true } : {}), ...(bargain.trim() && !pushDice ? { bargain: bargain.trim() } : {}), ...(bonus ? { bonus } : {}), ...(clock ? { clock } : {}) });
    for (const key of ["pushDice", "pushEffect", "pushHarm", "bargain", "assist", "bonus"] as const) keep(key, START[key]);
  };
  return (
    <div className="forged-attributes">
      {ATTRIBUTES.map((attribute: string) => (
        <section key={attribute} className="cc-panel forged-attribute" data-attribute={attribute}>
          <header>
            <button type="button" className="forged-resist" disabled={!editable} data-roll-resist={attribute} title={`Resist ${RESIST_WORDS[attribute as keyof typeof RESIST_WORDS]}: ${num(attributes[attribute])}d, 6 stress less the highest die`} onClick={() => act("resist", { attribute })}>
              {titled(attribute)} <b>{num(attributes[attribute])}</b>
            </button>
            <Boxes count={XP_TRACKS[attribute as keyof typeof XP_TRACKS]} filled={num(xp[attribute])} label={`${attribute} xp`} disabled={!editable} onSet={(value) => change(`xp.${attribute}`, value)} kind="xp" />
          </header>
          {ACTIONS_BY_ATTRIBUTE[attribute as keyof typeof ACTIONS_BY_ATTRIBUTE].map((action: string) => (
            <div key={action} className="forged-action" data-action-row={action}>
              <Boxes count={4} filled={num(actions[action])} label={`${action} rating`} disabled={!gm} onSet={(value) => change(`actions.${action}`, value)} kind="dots" />
              <button type="button" className="forged-roll" disabled={!editable} data-roll-action={action} title={`${titled(action)}: you ${ACTION_WORDS[action as keyof typeof ACTION_WORDS]} (${Math.max(0, num(actions[action]))}d)`} onClick={() => roll(action)}>
                {titled(action)}
              </button>
            </div>
          ))}
          {num(advances[attribute]) > 0 && editable ? (
            <small className="forged-advance">
              An advance: a dot in{" "}
              {ACTIONS_BY_ATTRIBUTE[attribute as keyof typeof ACTIONS_BY_ATTRIBUTE].map((action: string) => (
                <button key={action} type="button" data-action="advance-dot" onClick={() => act("advance", { action })}>
                  {titled(action)}
                </button>
              ))}
            </small>
          ) : null}
        </section>
      ))}
    </div>
  );
}

// Stress and trauma (a trauma to mark, a flashback's stress), harm and the healing clock, armor, coin and stash.
export function ForgedCondition() {
  const { editable, data, kept, keep, act, change } = useForged();
  const harm = (data.harm ?? { 1: ["", ""], 2: ["", ""], 3: [""] }) as Record<string, string[]>;
  const armor = (data.armor ?? {}) as Record<string, number>;
  const traumas = (Array.isArray(data.traumas) ? data.traumas : []) as string[];
  const abilities = list(data.abilities);
  const items = rows(data.inventorylist);
  const coin = num(rows(data.coins).find(([, row]) => /coin/i.test(String(row.name ?? "")))?.[1].amount);
  const usesSpecial = abilities.some((ability) => /special armor/i.test(String(ability.text ?? "")));
  const carried = items.filter(([, item]) => num(item.carried) > 0);
  const hasArmor = carried.some(([, item]) => item.armor === "armor" || /^armor$/i.test(String(item.name)));
  const hasHeavy = carried.some(([, item]) => item.armor === "heavy" || /heavy armor/i.test(String(item.name)));
  const trauma = kept("trauma");
  const flash = kept("flash");
  return (
    <div className="forged-condition">
      <section className="cc-panel" aria-label="Stress and trauma">
        <h4>
          Stress {num(data.stress)}/{num(data.stressmax) || 9}
        </h4>
        <Boxes count={num(data.stressmax) || 9} filled={num(data.stress)} label="stress" disabled={!editable} onSet={(value) => change("stress", value)} kind="stress" />
        <h4>
          Trauma {traumas.length}/{num(data.traumamax) || 4}
        </h4>
        <p className="forged-traumas">
          {traumas.length ? traumas.map((name) => <span key={name} title={TRAUMAS[name as keyof typeof TRAUMAS] ?? ""}>{name}</span>) : <small className="hint">None</small>}
        </p>
        {num(data.traumaPending) > 0 && editable ? (
          <p className="cc-inline" data-trauma-pending>
            <b>Trauma!</b>
            <select aria-label="Trauma condition" value={trauma} onChange={(event) => keep("trauma", event.target.value)}>
              {Object.keys(TRAUMAS).filter((name) => !traumas.includes(name)).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button type="button" data-action="mark-trauma" onClick={() => act("trauma", { condition: trauma })}>
              Mark
            </button>
          </p>
        ) : null}
        {editable ? (
          <p className="cc-inline" title="A flashback's stress: 0 easy, 1 complex, 2 elaborate">
            <select aria-label="Flashback stress" value={flash} onChange={(event) => keep("flash", Number(event.target.value))}>
              {[0, 1, 2, 3].map((cost) => (
                <option key={cost} value={cost} title={FLASHBACK[Math.min(2, cost) as 0 | 1 | 2]}>
                  {cost} stress
                </option>
              ))}
            </select>
            <button type="button" data-action="flashback" onClick={() => act("flashback", { stress: flash })}>
              Flashback
            </button>
          </p>
        ) : null}
      </section>
      <section className="cc-panel forged-harm" aria-label="Harm">
        <h4>Harm</h4>
        {[3, 2, 1].map((level) => (
          <div key={level} className="forged-harm-row" data-harm-level={level}>
            <b>{level}</b>
            {(harm[level] ?? []).map((text, index) => (
              <Field key={index} value={text} editable={editable} label={`Harm ${level} ${index + 1}`} onSave={(value) => change(`harm.${level}.${index}`, value)} />
            ))}
            <small>{HARM_PENALTY[level as 1 | 2 | 3]}</small>
          </div>
        ))}
        {data.fatal ? <p style={{ color: "#c0392b" }}>Fatal: {String(data.fatal)}</p> : null}
        <div className="cc-inline" title="Recovery fills the healing clock: when full, every harm is a level less">
          <ClockFace clock={{ name: "Healing", segments: num(data.healingsize) || 4, filled: num(data.healing), kind: "project", locked: false }} size={40} />
          <small>Healing clock</small>
        </div>
      </section>
      <section className="cc-panel forged-armor" aria-label="Armor">
        <h4>Armor</h4>
        {(["armor", "heavy", "special"] as const).map((kind) => (
          <label key={kind} className="inline-check">
            <input type="checkbox" data-armor={kind} checked={Boolean(num(armor[kind]))} disabled={!editable || Boolean(num(armor[kind])) || (kind === "armor" && !hasArmor) || (kind === "heavy" && !hasHeavy) || (kind === "special" && !usesSpecial)} onChange={() => act("armor", { kind })} /> {kind === "armor" ? "Armor" : kind === "heavy" ? "Heavy" : "Special"}
          </label>
        ))}
        <h4>
          Coin {coin} · Stash {num(data.stash)}
        </h4>
        {editable ? (
          <p className="cc-inline">
            <button type="button" data-action="stash-in" disabled={coin < 1} title="1 coin into the stash" onClick={() => act("stash", { amount: 1 })}>
              Stash 1
            </button>
            <button type="button" data-action="stash-out" disabled={num(data.stash) < 2} title="2 stash for 1 coin" onClick={() => act("stash", { amount: -1 })}>
              Take 1 out
            </button>
          </p>
        ) : null}
      </section>
    </div>
  );
}

// The load chosen and what is carried.
export function ForgedLoad() {
  const { editable, data, act } = useForged();
  const items = rows(data.inventorylist);
  const limits = (data.loadlimits ?? { light: 3, normal: 5, heavy: 6 }) as Record<string, number>;
  return (
    <section className="cc-panel forged-load" aria-label="Load and items">
      <h4>
        Load {num(data.loadused)}
        {data.load ? `/${limits[String(data.load)]}` : ""} · {String(data.loadword ?? "")}
        {editable ? (
          <select aria-label="Load" value={String(data.load ?? "")} onChange={(event) => act("load", { load: event.target.value })}>
            <option value="">Choose a load</option>
            {(["light", "normal", "heavy"] as const).map((load) => (
              <option key={load} value={load}>
                {titled(load)} ({limits[load]})
              </option>
            ))}
          </select>
        ) : null}
      </h4>
      <ul className="forged-items">
        {items.map(([key, item]) => (
          <li key={key} data-item={String(item.name)} title={String(item.text ?? "")}>
            <label className="inline-check">
              <input type="checkbox" checked={Boolean(num(item.carried))} disabled={!editable} onChange={() => act("item", { key })} /> {String(item.name)}
            </label>
            <small>{num(item.load) || (item.free ? 0 : 0)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The playbook's xp (a track to mark), its special abilities (an advance's new one) and friends and rivals.
export function ForgedPlaybook() {
  const { session, editable, data, kept, keep, act, change } = useForged();
  const xp = (data.xp ?? {}) as Record<string, number>;
  const advances = (data.advances ?? {}) as Record<string, number>;
  const abilities = list(data.abilities);
  const friends = list(data.friends);
  const playbook = Object.values(session.records).find((item) => item.type === "playbook" && item.name === data.playbook);
  const newAbilities = useMemo(() => list(playbook?.data.abilities).filter((ability) => !abilities.some((owned) => owned.name === ability.name)), [playbook, abilities]);
  const track = kept("track");
  const pick = kept("pick");
  return (
    <>
      <section className="cc-panel">
        <h4>
          {String(data.playbook ?? "")} xp <Boxes count={XP_TRACKS.playbook} filled={num(xp.playbook)} label="playbook xp" disabled={!editable} onSet={(value) => change("xp.playbook", value)} kind="xp" />
        </h4>
        <p className="hint">
          Mark xp at the end of the session (1, or 2 if it happened a lot): {String(data.xptrigger ?? "your playbook's trigger")}; you expressed your beliefs, drives, heritage, or background; you struggled with issues from your vice or traumas.
        </p>
        {editable ? (
          <p className="cc-inline">
            <select aria-label="Xp track" value={track} onChange={(event) => keep("track", event.target.value)}>
              {Object.keys(XP_TRACKS).map((name) => (
                <option key={name} value={name}>
                  {titled(name)}
                </option>
              ))}
            </select>
            <button type="button" data-action="mark-xp" onClick={() => act("xp", { track, amount: 1 })}>
              +1 xp
            </button>
            <button type="button" data-action="mark-xp-2" onClick={() => act("xp", { track, amount: 2 })}>
              +2 xp
            </button>
          </p>
        ) : null}
      </section>
      <section className="cc-panel" aria-label="Special abilities">
        <h4>Special abilities</h4>
        <ul className="forged-abilities">
          {abilities.map((ability) => (
            <li key={String(ability.name)} data-ability={String(ability.name)}>
              <b>{String(ability.name)}.</b> {String(ability.text ?? "")}
            </li>
          ))}
        </ul>
        {(num(advances.playbook) > 0 || session.role === "dm") && newAbilities.length && editable ? (
          <p className="cc-inline">
            {num(advances.playbook) > 0 ? <b>An advance!</b> : null}
            <select aria-label="New special ability" value={pick} onChange={(event) => keep("pick", event.target.value)}>
              <option value="">Choose a special ability</option>
              {newAbilities.map((ability) => (
                <option key={String(ability.name)} value={String(ability.name)}>
                  {String(ability.name)}
                </option>
              ))}
            </select>
            <button type="button" data-action="advance-ability" disabled={!pick} onClick={() => pick && act("advance", { ability: pick })}>
              Take it
            </button>
          </p>
        ) : null}
      </section>
      <section className="cc-panel" aria-label="Friends and rivals">
        <h4>Friends and rivals</h4>
        <ul className="forged-friends">
          {friends.map((friend) => (
            <li key={String(friend.name)} data-friend={String(friend.name)} data-bond={String(friend.bond ?? "")}>
              <span className="forged-bond">{friend.bond === "friend" ? "▲" : friend.bond === "rival" ? "▼" : "·"}</span> <b>{String(friend.name)}</b>, {String(friend.text ?? "")}
              {editable ? (
                <select aria-label={`${String(friend.name)} bond`} value={String(friend.bond ?? "")} onChange={(event) => act("friend", { name: friend.name, bond: event.target.value })}>
                  <option value="">-</option>
                  <option value="friend">Friend</option>
                  <option value="rival">Rival</option>
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// Downtime: the activities used and what pays for one more, the activities, and long-term projects.
export function ForgedDowntime() {
  const { editable, data, kept, keep, act, paid } = useForged();
  const actions = (data.actions ?? {}) as Record<string, number>;
  const projects = rows(data.projects);
  const downtime = (data.downtime ?? {}) as Row;
  const overindulge = kept("overindulge");
  const quality = kept("quality");
  const track = kept("track");
  const heatWith = kept("heatWith");
  const asset = kept("asset");
  const workOn = kept("workOn");
  return (
    <>
      <section className="cc-panel">
        <h4>
          Downtime activities: {num(downtime.used)} used (two free; more cost 1 coin or 1 rep each)
        </h4>
        {editable ? (
          <p className="cc-inline">
            <small>A paid activity:</small>
            <select aria-label="Pay for an activity" value={kept("pay")} onChange={(event) => keep("pay", event.target.value)}>
              <option value="">Free</option>
              <option value="coin">1 coin</option>
              <option value="rep">1 crew rep</option>
            </select>
          </p>
        ) : null}
      </section>
      {editable ? (
        <section className="cc-panel forged-downtime">
          <p className="cc-inline">
            <button type="button" data-action="vice" disabled={Boolean(num(downtime.indulged))} title={`Your lowest attribute's dice: clear stress equal to the highest (${String(data.vice ?? "")}${data.purveyor ? ` at ${String(data.purveyor)}` : ""})`} onClick={() => act("vice", { overindulge, ...paid })}>
              Indulge vice
            </button>
            <small>If I overindulge:</small>
            <select aria-label="Overindulgence" value={overindulge} onChange={(event) => keep("overindulge", event.target.value)}>
              {Object.keys(OVERINDULGENCE).map((name) => (
                <option key={name} value={name} title={OVERINDULGENCE[name as keyof typeof OVERINDULGENCE]}>
                  {name}
                </option>
              ))}
            </select>
          </p>
          <p className="cc-inline">
            <button type="button" data-action="recover" title="A healer of this quality rolls: the healing clock ticks" onClick={() => act("recover", { quality, ...paid })}>
              Recover
            </button>
            <small>healer's quality</small>
            <input type="number" min={0} max={6} aria-label="Healer quality" value={quality} onChange={(event) => keep("quality", Number(event.target.value) || 0)} style={{ width: "3rem" }} />
            <button type="button" data-action="tough-it-out" title="No treatment: 0d and 1 stress" onClick={() => act("recover", { tough: true, ...paid })}>
              Tough it out
            </button>
          </p>
          <p className="cc-inline">
            <button type="button" data-action="train" title="+1 xp on a track (2 with the crew's Training); once a track a downtime" onClick={() => act("train", { track, ...paid })}>
              Train
            </button>
            <select aria-label="Train track" value={track} onChange={(event) => keep("track", event.target.value)}>
              {Object.keys(XP_TRACKS).map((name) => (
                <option key={name} value={name}>
                  {titled(name)}
                </option>
              ))}
            </select>
          </p>
          <p className="cc-inline">
            <button type="button" data-action="reduce-heat" title="The crew's heat: 1-3 one, 4/5 two, 6 three, critical five" onClick={() => act("reduce-heat", { action: heatWith, ...paid })}>
              Reduce heat
            </button>
            <select aria-label="Reduce heat with" value={heatWith} onChange={(event) => keep("heatWith", event.target.value)}>
              {ACTIONS.map((action: string) => (
                <option key={action} value={action}>
                  {titled(action)} {num(actions[action])}
                </option>
              ))}
            </select>
          </p>
          <p className="cc-inline">
            <button type="button" data-action="acquire" title="The crew's Tier rolled: the asset's quality" onClick={() => act("acquire", { asset, ...paid })}>
              Acquire asset
            </button>
            <input aria-label="Asset" data-transient placeholder="A fast boat, a forger, fine lockpicks..." value={asset} onChange={(event) => keep("asset", event.target.value)} />
          </p>
        </section>
      ) : null}
      <section className="cc-panel" aria-label="Long-term projects">
        <h4>Long-term projects</h4>
        {projects.map(([key, project]) => (
          <div key={key} className="cc-inline forged-project" data-project={String(project.name)}>
            <ClockFace clock={{ name: String(project.name), segments: num(project.segments) || 8, filled: num(project.filled), kind: "project", locked: false }} size={40} />
            <b>{String(project.name)}</b> {num(project.filled)}/{num(project.segments)}
            {editable ? (
              <>
                <select aria-label="Work with" value={workOn} onChange={(event) => keep("workOn", event.target.value)}>
                  {ACTIONS.map((action: string) => (
                    <option key={action} value={action}>
                      {titled(action)} {num(actions[action])}
                    </option>
                  ))}
                </select>
                <button type="button" data-action="project-work" disabled={num(project.filled) >= num(project.segments)} onClick={() => act("project", { project: key, action: workOn, ...paid })}>
                  Work on it
                </button>
              </>
            ) : null}
          </div>
        ))}
        {editable ? (
          <label className="cc-labelled">
            <Field value="" editable={editable} label="New project" onSave={(value) => value.trim() && act("project", { name: value.trim(), segments: 8 })} />
            <small>A new long-term project (8 segments; Enter to start)</small>
          </label>
        ) : null}
      </section>
    </>
  );
}
