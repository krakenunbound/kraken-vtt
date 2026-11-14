import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { ClockFace } from "../notes/ClocksWindow";
import { ACTION_WORDS, ACTIONS, ACTIONS_BY_ATTRIBUTE, ATTRIBUTES, EFFECTS, FLASHBACK, HARM_PENALTY, OVERINDULGENCE, POSITIONS, RESIST_WORDS, TRAUMAS, VICES, XP_TRACKS, titled } from "../../shared/forged/rules.mjs";

// The Forged in the Dark character sheet (the Blades in the Dark SRD), in
// Kraken's sheet style: who they are on top, tabs down the right (Main,
// Playbook, Downtime, Notes). Main is the roll: the position and effect the
// GM set (the Score panel's, changeable here), assistance, pushing, the
// Devil's Bargain, a clock to tick; then click an action to roll its dice on
// the table's 3D dice (the highest die read), or an attribute to resist.
// Stress and trauma, harm and the healing clock, armor, load and items, coin
// and stash. The host does the rest (electron/forged.cjs).

type Row = Record<string, unknown>;
const TABS = ["main", "playbook", "downtime", "notes"] as const;
type Tab = (typeof TABS)[number];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const list = (node: unknown): Row[] => (Array.isArray(node) ? (node as Row[]) : rows(node).map(([, row]) => row));

// Boxes in a row (stress, xp, heat): click one to set the count to it (again to clear it).
function Boxes({ count, filled, onSet, label, disabled, kind = "" }: { count: number; filled: number; onSet?: (value: number) => void; label: string; disabled?: boolean; kind?: string }) {
  return (
    <span className={`forged-boxes ${kind}`} role="group" aria-label={label} data-filled={filled}>
      {Array.from({ length: count }, (_, index) => (
        <button key={index} type="button" className={index < filled ? "on" : ""} disabled={disabled || !onSet} aria-label={`${label} ${index + 1}`} onClick={() => onSet?.(index + 1 === filled ? index : index + 1)} />
      ))}
    </span>
  );
}

export function SheetForged({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const score = session.clocks.score;
  const [position, setPosition] = useState("");
  const [effect, setEffect] = useState("");
  const [assist, setAssist] = useState("");
  const [pushDice, setPushDice] = useState(false);
  const [pushEffect, setPushEffect] = useState(false);
  const [pushHarm, setPushHarm] = useState(false);
  const [bargain, setBargain] = useState("");
  const [bonus, setBonus] = useState(0);
  const [clock, setClock] = useState("");
  const [trauma, setTrauma] = useState("Cold");
  const [overindulge, setOverindulge] = useState("Attract Trouble");
  const [track, setTrack] = useState("playbook");
  const [workOn, setWorkOn] = useState("study");
  const [heatWith, setHeatWith] = useState("consort");
  const [asset, setAsset] = useState("");
  const [quality, setQuality] = useState(2);
  const [flash, setFlash] = useState(1);
  const [pay, setPay] = useState("");
  const data = record.data as Row;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const act = (action: string, args: Record<string, unknown> = {}) => session.forgedAction(record.id, action, args);
  const actions = (data.actions ?? {}) as Record<string, number>;
  const attributes = (data.attributes ?? {}) as Record<string, number>;
  const xp = (data.xp ?? {}) as Record<string, number>;
  const advances = (data.advances ?? {}) as Record<string, number>;
  const harm = (data.harm ?? { 1: ["", ""], 2: ["", ""], 3: [""] }) as Record<string, string[]>;
  const armor = (data.armor ?? {}) as Record<string, number>;
  const traumas = (Array.isArray(data.traumas) ? data.traumas : []) as string[];
  const abilities = list(data.abilities);
  const friends = list(data.friends);
  const items = rows(data.inventorylist);
  const projects = rows(data.projects);
  const downtime = (data.downtime ?? {}) as Row;
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const status = String(data.status ?? "");
  const coin = num(rows(data.coins).find(([, row]) => /coin/i.test(String(row.name ?? "")))?.[1].amount);
  const others = Object.values(session.records).filter((item) => item.type === "character" && item.data.ruleset === "forged" && item.id !== record.id);
  const playbook = Object.values(session.records).find((item) => item.type === "playbook" && item.name === data.playbook);
  const usesSpecial = abilities.some((ability) => /special armor/i.test(String(ability.text ?? "")));
  const carried = items.filter(([, item]) => num(item.carried) > 0);
  const hasArmor = carried.some(([, item]) => item.armor === "armor" || /^armor$/i.test(String(item.name)));
  const hasHeavy = carried.some(([, item]) => item.armor === "heavy" || /heavy armor/i.test(String(item.name)));
  const pos = position || score.position || "risky";
  const eff = effect || score.effect || "standard";
  const limits = (data.loadlimits ?? { light: 3, normal: 5, heavy: 6 }) as Record<string, number>;
  const roll = (action: string) => {
    if (!editable) return;
    act("action-roll", { action, position: pos, effect: eff, ...(assist ? { assist } : {}), pushDice, pushEffect, ...(pushHarm ? { pushIncapacitated: true } : {}), ...(bargain.trim() && !pushDice ? { bargain: bargain.trim() } : {}), ...(bonus ? { bonus } : {}), ...(clock ? { clock } : {}) });
    setPushDice(false);
    setPushEffect(false);
    setPushHarm(false);
    setBargain("");
    setAssist("");
    setBonus(0);
  };
  const newAbilities = useMemo(() => list(playbook?.data.abilities).filter((ability) => !abilities.some((owned) => owned.name === ability.name)), [playbook, abilities]);
  const [pick, setPick] = useState("");

  return (
    <article className="cc-sheet sheet-5e sheet-forged" data-character={record.id} data-ruleset="forged">
      <div className="cc-body">
        <header className="cc-head">
          <div className="cc-portrait-frame">
            <button type="button" className="cc-portrait" data-action="pick-portrait" disabled={!editable} title={editable ? "Click to choose a portrait" : record.name} onClick={() => setPicking("portrait")} {...slotDrag({ kind: "sheet", record: record.id, label: record.name })}>
              {portrait ? <Picture session={session} id={portrait} alt={record.name} /> : <span>{record.name.slice(0, 1)}</span>}
            </button>
            <button type="button" className="cc-token" data-action="pick-token" disabled={!editable} title="Token" onClick={() => setPicking("token")}>
              {typeof data.token === "string" && data.token ? <Picture session={session} id={data.token} alt="Token" /> : portrait ? <Picture session={session} id={portrait} alt="Token" /> : <Icon name="character" size={18} />}
            </button>
          </div>
          <div className="cc-identity">
            <div className="cc-row">
              <label className="cc-labelled grow">
                <Field value={record.name} editable={editable} label="Name" className="cc-name" onSave={(value) => change("name", value)} />
                <small>Name</small>
              </label>
              <label className="cc-labelled">
                <Field value={String(data.alias ?? "")} editable={editable} label="Alias" onSave={(value) => change("alias", value)} />
                <small>Alias</small>
              </label>
            </div>
            <div className="cc-boxes">
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="playbook">{String(data.playbook ?? "")}</span>
                <small>Playbook</small>
              </label>
              <label className="cc-labelled cc-box">
                <Field value={String(data.heritage ?? "")} editable={editable} label="Heritage" onSave={(value) => change("heritage", value)} />
                <small>Heritage</small>
              </label>
              <label className="cc-labelled cc-box">
                <Field value={String(data.background ?? "")} editable={editable} label="Background" onSave={(value) => change("background", value)} />
                <small>Background</small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value" title={String(VICES[String(data.vice ?? "") as keyof typeof VICES] ?? "")}>{String(data.vice ?? "")}</span>
                <small>Vice</small>
              </label>
              {status ? (
                <label className="cc-labelled cc-box">
                  <span className="cc-value" data-forged-status={status} style={{ color: "#c0392b" }}>
                    {status}
                  </span>
                  <small>State</small>
                </label>
              ) : null}
            </div>
          </div>
          {picking ? (
            <ArtPicker
              session={session}
              kind={picking}
              current={typeof data[picking] === "string" ? String(data[picking]) : undefined}
              race=""
              onClose={() => setPicking(null)}
              onPick={(id) => {
                void session.op({ op: "update", id: record.id, patch: { data: { [picking]: id } } });
                setPicking(null);
              }}
            />
          ) : null}
        </header>

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            {editable ? (
              <section className="cc-panel forged-rollbar" aria-label="Action roll">
                <label>
                  <small>Position</small>
                  <select aria-label="Roll position" value={pos} onChange={(event) => setPosition(event.target.value)}>
                    {POSITIONS.map((item: string) => (
                      <option key={item} value={item}>
                        {titled(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <small>Effect</small>
                  <select aria-label="Roll effect" value={eff} onChange={(event) => setEffect(event.target.value)}>
                    {EFFECTS.map((item: string) => (
                      <option key={item} value={item}>
                        {titled(item)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <small>Assist (+1d)</small>
                  <select aria-label="Assisted by" value={assist} onChange={(event) => setAssist(event.target.value)}>
                    <option value="">No one</option>
                    {others.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-check" title="+1d for 2 stress">
                  <input type="checkbox" data-push="dice" checked={pushDice} onChange={(event) => setPushDice(event.target.checked)} /> Push +1d
                </label>
                <label className="inline-check" title="+1 effect for 2 stress">
                  <input type="checkbox" data-push="effect" checked={pushEffect} onChange={(event) => setPushEffect(event.target.checked)} /> Push +effect
                </label>
                {(data.penalties as Row | undefined)?.needHelp ? (
                  <label className="inline-check" title="Severe harm: act anyway for 2 stress (or have someone assist)">
                    <input type="checkbox" data-push="harm" checked={pushHarm} onChange={(event) => setPushHarm(event.target.checked)} /> Push through harm
                  </label>
                ) : null}
                <label className="grow">
                  <small>Devil's Bargain (+1d)</small>
                  <input aria-label="Devil's Bargain" data-transient placeholder="The price, whatever the roll" value={bargain} disabled={pushDice} onChange={(event) => setBargain(event.target.value)} />
                </label>
                <label>
                  <small>Bonus</small>
                  <input type="number" aria-label="Bonus dice" min={-3} max={3} value={bonus} onChange={(event) => setBonus(Number(event.target.value) || 0)} style={{ width: "3rem" }} />
                </label>
                <label>
                  <small>Tick clock</small>
                  <select aria-label="Clock to tick" value={clock} onChange={(event) => setClock(event.target.value)}>
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
            ) : null}
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
                      <Boxes count={4} filled={num(actions[action])} label={`${action} rating`} disabled={session.role !== "dm"} onSet={(value) => change(`actions.${action}`, value)} kind="dots" />
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
                    <select aria-label="Trauma condition" value={trauma} onChange={(event) => setTrauma(event.target.value)}>
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
                    <select aria-label="Flashback stress" value={flash} onChange={(event) => setFlash(Number(event.target.value))}>
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
          </div>
        ) : null}

        {tab === "playbook" ? (
          <div className="cc-page" data-tab-page="playbook">
            <section className="cc-panel">
              <h4>
                {String(data.playbook ?? "")} xp <Boxes count={XP_TRACKS.playbook} filled={num(xp.playbook)} label="playbook xp" disabled={!editable} onSet={(value) => change("xp.playbook", value)} kind="xp" />
              </h4>
              <p className="hint">
                Mark xp at the end of the session (1, or 2 if it happened a lot): {String(data.xptrigger ?? "your playbook's trigger")}; you expressed your beliefs, drives, heritage, or background; you struggled with issues from your vice or traumas.
              </p>
              {editable ? (
                <p className="cc-inline">
                  <select aria-label="Xp track" value={track} onChange={(event) => setTrack(event.target.value)}>
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
                  <select aria-label="New special ability" value={pick} onChange={(event) => setPick(event.target.value)}>
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
          </div>
        ) : null}

        {tab === "downtime" ? (
          <div className="cc-page" data-tab-page="downtime">
            <section className="cc-panel">
              <h4>
                Downtime activities: {num(downtime.used)} used (two free; more cost 1 coin or 1 rep each)
              </h4>
              {editable ? (
                <p className="cc-inline">
                  <small>A paid activity:</small>
                  <select aria-label="Pay for an activity" value={pay} onChange={(event) => setPay(event.target.value)}>
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
                  <button type="button" data-action="vice" disabled={Boolean(num(downtime.indulged))} title={`Your lowest attribute's dice: clear stress equal to the highest (${String(data.vice ?? "")}${data.purveyor ? ` at ${String(data.purveyor)}` : ""})`} onClick={() => act("vice", { overindulge, ...(pay ? { pay } : {}) })}>
                    Indulge vice
                  </button>
                  <small>If I overindulge:</small>
                  <select aria-label="Overindulgence" value={overindulge} onChange={(event) => setOverindulge(event.target.value)}>
                    {Object.keys(OVERINDULGENCE).map((name) => (
                      <option key={name} value={name} title={OVERINDULGENCE[name as keyof typeof OVERINDULGENCE]}>
                        {name}
                      </option>
                    ))}
                  </select>
                </p>
                <p className="cc-inline">
                  <button type="button" data-action="recover" title="A healer of this quality rolls: the healing clock ticks" onClick={() => act("recover", { quality, ...(pay ? { pay } : {}) })}>
                    Recover
                  </button>
                  <small>healer's quality</small>
                  <input type="number" min={0} max={6} aria-label="Healer quality" value={quality} onChange={(event) => setQuality(Number(event.target.value) || 0)} style={{ width: "3rem" }} />
                  <button type="button" data-action="tough-it-out" title="No treatment: 0d and 1 stress" onClick={() => act("recover", { tough: true, ...(pay ? { pay } : {}) })}>
                    Tough it out
                  </button>
                </p>
                <p className="cc-inline">
                  <button type="button" data-action="train" title="+1 xp on a track (2 with the crew's Training); once a track a downtime" onClick={() => act("train", { track, ...(pay ? { pay } : {}) })}>
                    Train
                  </button>
                  <select aria-label="Train track" value={track} onChange={(event) => setTrack(event.target.value)}>
                    {Object.keys(XP_TRACKS).map((name) => (
                      <option key={name} value={name}>
                        {titled(name)}
                      </option>
                    ))}
                  </select>
                </p>
                <p className="cc-inline">
                  <button type="button" data-action="reduce-heat" title="The crew's heat: 1-3 one, 4/5 two, 6 three, critical five" onClick={() => act("reduce-heat", { action: heatWith, ...(pay ? { pay } : {}) })}>
                    Reduce heat
                  </button>
                  <select aria-label="Reduce heat with" value={heatWith} onChange={(event) => setHeatWith(event.target.value)}>
                    {ACTIONS.map((action: string) => (
                      <option key={action} value={action}>
                        {titled(action)} {num(actions[action])}
                      </option>
                    ))}
                  </select>
                </p>
                <p className="cc-inline">
                  <button type="button" data-action="acquire" title="The crew's Tier rolled: the asset's quality" onClick={() => act("acquire", { asset, ...(pay ? { pay } : {}) })}>
                    Acquire asset
                  </button>
                  <input aria-label="Asset" data-transient placeholder="A fast boat, a forger, fine lockpicks..." value={asset} onChange={(event) => setAsset(event.target.value)} />
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
                      <select aria-label="Work with" value={workOn} onChange={(event) => setWorkOn(event.target.value)}>
                        {ACTIONS.map((action: string) => (
                          <option key={action} value={action}>
                            {titled(action)} {num(actions[action])}
                          </option>
                        ))}
                      </select>
                      <button type="button" data-action="project-work" disabled={num(project.filled) >= num(project.segments)} onClick={() => act("project", { project: key, action: workOn, ...(pay ? { pay } : {}) })}>
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
          </div>
        ) : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            {(
              [
                ["look", "Look"],
                ["heritagedetail", "Heritage: family life"],
                ["backgrounddetail", "Background: before the crew"],
                ["vicedetail", "Vice"],
                ["purveyor", "Vice purveyor (name and where)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="cc-labelled">
                <Field value={String(data[key] ?? "")} editable={editable} label={label} onSave={(value) => change(key, value)} />
                <small>{label}</small>
              </label>
            ))}
            <Field value={String(data.notes ?? "")} area editable={editable} label="Notes" onSave={(value) => change("notes", value)} />
          </section>
        ) : null}
      </div>
      <nav className="cc-tabs" role="tablist" aria-label="Sheet">
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-sheet-tab={id} onClick={() => setTab(id)}>
            {titled(id)}
          </button>
        ))}
      </nav>
    </article>
  );
}

// The character wizard, in the book's order: a playbook (its three dots), a
// heritage and a background (with a detail each), four more action dots (one
// for the heritage, one for the background, two anywhere; none above 2), a
// special ability (the first is a good default), a close friend and a rival,
// a vice and its purveyor, a name, an alias and a look.
export function WizardForged({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const playbooks = records.filter((item) => item.type === "playbook").sort((a, b) => a.name.localeCompare(b.name));
  const tableOf = (group: string) => records.filter((item) => item.type === "forgedtable" && item.data.group === group).flatMap((item) => list(item.data.rows));
  const heritages = tableOf("heritages");
  const backgrounds = tableOf("backgrounds");
  const [playbookName, setPlaybookName] = useState("");
  const [heritage, setHeritage] = useState("");
  const [heritageDetail, setHeritageDetail] = useState("");
  const [background, setBackground] = useState("");
  const [backgroundDetail, setBackgroundDetail] = useState("");
  const [dots, setDots] = useState<Record<string, number>>({});
  const [ability, setAbility] = useState("");
  const [friend, setFriend] = useState("");
  const [rival, setRival] = useState("");
  const [vice, setVice] = useState("");
  const [viceDetail, setViceDetail] = useState("");
  const [purveyor, setPurveyor] = useState("");
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [look, setLook] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const playbook = playbooks.find((item) => item.name === playbookName);
  const base = (playbook?.data.actions ?? {}) as Record<string, number>;
  const added = Object.values(dots).reduce((sum, value) => sum + value, 0);
  const abilities = list(playbook?.data.abilities);
  const friends = list(playbook?.data.friends);
  const chosenAbility = ability || String(abilities[0]?.name ?? "");
  const ready = Boolean(playbook && heritage && background && added === 4 && chosenAbility && friend && rival && friend !== rival && vice && name.trim());
  const dot = (action: string, by: number) => {
    const next = Math.max(0, (dots[action] ?? 0) + by);
    if (by > 0 && (added >= 4 || num(base[action]) + next > 2)) return;
    setDots({ ...dots, [action]: next });
  };
  const finish = async () => {
    if (!playbook) return;
    setBusy(true);
    setProblem("");
    try {
      const id = await session.buildCharacter({ name: name.trim(), playbook: playbook.name, heritage, heritageDetail, background, backgroundDetail, dots, ability: chosenAbility, friend, rival, vice, viceDetail, purveyor, alias, look });
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (playbooks.length === 0) return <p className="hint">No playbooks yet: the GM makes the Forged in the Dark Scoundrel's Handbook active (Modules).</p>;
  return (
    <section className="wizard-5e cc-panel" aria-label="Forged in the Dark character wizard" data-wizard="forged">
      <header className="cc-row">
        <b>New scoundrel</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || !ready} title={ready ? "Make the scoundrel" : "Every step first"} onClick={() => void finish()}>
          Finish
        </button>
      </header>
      {problem ? <p className="hint" style={{ color: "#c0392b" }}>{problem}</p> : null}
      <ol className="forged-steps">
        <li>
          <b>Choose a playbook.</b>
          <select
            aria-label="Playbook"
            value={playbookName}
            onChange={(event) => {
              setPlaybookName(event.target.value);
              setDots({});
              setAbility("");
              setFriend("");
              setRival("");
            }}
          >
            <option value="">Choose...</option>
            {playbooks.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}: {String(item.data.short ?? "")}
              </option>
            ))}
          </select>
          {playbook ? (
            <small className="hint">
              {Object.entries(base)
                .filter(([, value]) => num(value) > 0)
                .map(([action, value]) => `${titled(action)} ${value}`)
                .join(", ")}
              . XP: {String(playbook.data.xptrigger ?? "")}
            </small>
          ) : null}
        </li>
        <li>
          <b>Choose a heritage</b> and write a detail about your family life.
          <select aria-label="Heritage" value={heritage} onChange={(event) => setHeritage(event.target.value)}>
            <option value="">Choose...</option>
            {heritages.map((row) => (
              <option key={String(row.name)} value={String(row.name)} title={String(row.text ?? "")}>
                {String(row.name)}
              </option>
            ))}
          </select>
          <input aria-label="Heritage detail" placeholder="Ore miners, now war refugees" value={heritageDetail} onChange={(event) => setHeritageDetail(event.target.value)} />
        </li>
        <li>
          <b>Choose a background</b> and write a detail of your own.
          <select aria-label="Background" value={background} onChange={(event) => setBackground(event.target.value)}>
            <option value="">Choose...</option>
            {backgrounds.map((row) => (
              <option key={String(row.name)} value={String(row.name)} title={String(row.text ?? "")}>
                {String(row.name)}
              </option>
            ))}
          </select>
          <input aria-label="Background detail" placeholder="Labor: hunter, mutineer" value={backgroundDetail} onChange={(event) => setBackgroundDetail(event.target.value)} />
        </li>
        <li>
          <b>Assign four action dots</b>: one for your heritage, one for your background, two anywhere. None above 2. <span data-dots-left={4 - added}>{4 - added} left.</span>
          <div className="forged-wizard-dots">
            {ATTRIBUTES.map((attribute: string) => (
              <div key={attribute}>
                <small>{titled(attribute)}</small>
                {ACTIONS_BY_ATTRIBUTE[attribute as keyof typeof ACTIONS_BY_ATTRIBUTE].map((action: string) => (
                  <span key={action} className="cc-inline" data-dot-action={action}>
                    <button type="button" aria-label={`${action} minus`} disabled={!(dots[action] ?? 0)} onClick={() => dot(action, -1)}>
                      −
                    </button>
                    <Boxes count={2} filled={num(base[action]) + (dots[action] ?? 0)} label={`${action} dots`} disabled />
                    <button type="button" aria-label={`${action} plus`} data-action={`dot-${action}`} disabled={!playbook || added >= 4 || num(base[action]) + (dots[action] ?? 0) >= 2} onClick={() => dot(action, 1)}>
                      +
                    </button>
                    {titled(action)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </li>
        <li>
          <b>Choose a special ability</b> (the first is a good default).
          {abilities.map((item) => (
            <label key={String(item.name)} className="forged-choice">
              <input type="radio" name="forged-ability" data-ability={String(item.name)} checked={chosenAbility === item.name} onChange={() => setAbility(String(item.name))} /> <b>{String(item.name)}.</b> <small>{String(item.text ?? "")}</small>
            </label>
          ))}
        </li>
        <li>
          <b>Choose one close friend and one rival.</b>
          <select aria-label="Close friend" value={friend} onChange={(event) => setFriend(event.target.value)}>
            <option value="">A close friend...</option>
            {friends.map((row) => (
              <option key={String(row.name)} value={String(row.name)}>
                ▲ {String(row.name)}, {String(row.text ?? "")}
              </option>
            ))}
          </select>
          <select aria-label="Rival" value={rival} onChange={(event) => setRival(event.target.value)}>
            <option value="">A rival...</option>
            {friends.map((row) => (
              <option key={String(row.name)} value={String(row.name)}>
                ▼ {String(row.name)}, {String(row.text ?? "")}
              </option>
            ))}
          </select>
        </li>
        <li>
          <b>Choose your vice</b>, describe it, and name your purveyor and where to find them.
          <select aria-label="Vice" value={vice} onChange={(event) => setVice(event.target.value)}>
            <option value="">Choose...</option>
            {Object.entries(VICES).map(([key, words]) => (
              <option key={key} value={key} title={String(words)}>
                {key}
              </option>
            ))}
          </select>
          <input aria-label="Vice detail" placeholder="Dice in the back room" value={viceDetail} onChange={(event) => setViceDetail(event.target.value)} />
          <input aria-label="Vice purveyor" placeholder="Old Tam at the Drowned Bell" value={purveyor} onChange={(event) => setPurveyor(event.target.value)} />
        </li>
        <li>
          <b>Record your name, alias, and look.</b>
          <input aria-label="Character name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <input aria-label="Alias" placeholder="Alias" value={alias} onChange={(event) => setAlias(event.target.value)} />
          <input aria-label="Look" placeholder="Tall, scarred, a long grey coat" value={look} onChange={(event) => setLook(event.target.value)} />
        </li>
      </ol>
    </section>
  );
}
