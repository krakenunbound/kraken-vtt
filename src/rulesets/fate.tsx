import type { Session } from "../session/useSession";
import { Field } from "../core/fields/Field";
import { useSheet } from "../core/sheet/context";
import { ACTIONS, APPROACHES, APPROACH_NAMES, CONSEQUENCE_NAMES, CONSEQUENCES, LADDER, MILESTONES, SKILLS, aspectsOf, ladder, signed } from "../../shared/fate/rules.mjs";

// Fate's own parts, where no core part fits (docs/core-ui-design.md 4.4, level 3):
// the roll bar and the skills (or approaches) it rolls, stress and consequences,
// the last roll with its aspects to invoke, compels, the host's refusal, the
// stunts list and its add line, and the milestones. The header, the aspects,
// the hints, the extras and the Notes page are the core's, laid out by
// shared/fate/manifest.mjs. The roll bar's action, opposition and new aspect
// are sheet modifiers, so they stay while the sheet is open, tab to tab.

type Row = Record<string, unknown>;
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const LADDER_STEPS = [8, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2];
export type SceneAspect = { id: string; name: string; invokes: number; kind: string; by: string };
// The table's Fate state (the record the host keeps: electron/fate.cjs).
export function fateTableOf(session: Session) {
  const data = (session.records["fate-table"]?.data ?? {}) as Row;
  const aspects: SceneAspect[] = rows(data.aspects).map(([id, aspect]) => ({ id, name: String(aspect.name ?? ""), invokes: num(aspect.invokes), kind: String(aspect.kind ?? "situation"), by: String(aspect.by ?? "") }));
  return { aspects, gmpool: num(data.gmpool), conflict: String(data.conflict ?? "physical"), scene: String(data.scene ?? "") };
}

// The tracker's header: a physical or a mental conflict (which skill orders the turns, which defends).
export function FateConflict({ session }: { session: Session }) {
  return (
    <select aria-label="Conflict" data-action="fate-conflict" value={fateTableOf(session).conflict} onChange={(event) => void session.fateAction(null, "conflict", { kind: event.target.value })}>
      <option value="physical">Physical conflict</option>
      <option value="mental">Mental conflict</option>
    </select>
  );
}

// The sheet's character, who may type, and Fate's message to the host: a refusal goes to the sheet's error line.
function useFate() {
  const sheet = useSheet();
  const { record, session, setModifier, modifiers } = sheet;
  const act = (name: string, args: Record<string, unknown> = {}) => {
    setModifier("problem", "");
    void session.fateAction(record.id, name, args).catch((error: unknown) => setModifier("problem", error instanceof Error ? error.message : String(error)));
  };
  const data = record.data as Row;
  const fae = data.game === "fae";
  const action = String(modifiers.action ?? "overcome");
  const opposition = String(modifiers.opposition ?? "2");
  const newAspect = String(modifiers.newAspect ?? "");
  return { ...sheet, act, data, fae, action, opposition, newAspect };
}

// The roll bar: the action, the opposition on the ladder, an advantage's new aspect, an attack's targets.
export function FateRollBar() {
  const { editable, action, opposition, newAspect, setModifier, targets } = useFate();
  if (!editable) return null;
  return (
    <section className="cc-panel cc-row fate-rollbar" aria-label="Roll">
      <label className="cc-inline" title="The four actions: overcome an obstacle, create an advantage (an aspect with a free invoke), attack, defend">
        <select aria-label="Action" data-field="fate-action" value={action} onChange={(event) => setModifier("action", event.target.value)}>
          {Object.entries(ACTIONS).map(([key, name]) => (
            <option key={key} value={key}>
              {name as string}
            </option>
          ))}
        </select>
      </label>
      {action === "overcome" || action === "advantage" ? (
        <label className="cc-inline" title="The opposition on the ladder (passive opposition: the GM says how hard)">
          vs
          <select aria-label="Opposition" data-field="fate-opposition" value={opposition} onChange={(event) => setModifier("opposition", event.target.value)}>
            {LADDER_STEPS.map((step) => (
              <option key={step} value={String(step)}>
                {ladder(step)}
              </option>
            ))}
            <option value="">none (active opposition)</option>
          </select>
        </label>
      ) : null}
      {action === "advantage" ? <input aria-label="New aspect" data-field="fate-new-aspect" placeholder="The aspect to create" value={newAspect} onChange={(event) => setModifier("newAspect", event.target.value)} /> : null}
      {action === "attack" ? <small className="hint">{targets.length ? `at ${targets.join(", ")} (they defend)` : "Ctrl+click a token to target it, in a conflict"}</small> : null}
    </section>
  );
}

// The skills (Fate Core, best first) or the six approaches (Fate Accelerated), each rolled with the bar's action.
export function FateSkills() {
  const { record, session, editable, data, fae, act, action, opposition, newAspect, targets } = useFate();
  const ratings = fae ? (APPROACHES as string[]).map((key) => ({ key, name: APPROACH_NAMES[key as keyof typeof APPROACH_NAMES], rating: num((data.approaches as Row | undefined)?.[key]) })) : Object.entries((data.skills ?? {}) as Record<string, number>).map(([name, rating]) => ({ key: name, name, rating: num(rating) })).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const roll = (skill: string) => {
    if (!editable) return;
    if (action === "attack" && inFight && targets.length) {
      // In a conflict, an attack goes through the tracker: the target defends.
      session.ct("attack", { recordId: record.id, weapon: skill });
      return;
    }
    act("roll", { skill, action, ...(action === "attack" || action === "defend" || opposition === "" ? {} : { opposition: Number(opposition) }), ...(action === "advantage" && newAspect.trim() ? { aspect: newAspect.trim() } : {}) });
  };
  return (
    <section className="cc-panel fate-skills" aria-label={fae ? "Approaches" : "Skills"}>
      <h4>{fae ? "Approaches" : "Skills"}</h4>
      {ratings.map((item) => (
        <div key={item.key} className="fate-skill" data-skill={item.name}>
          <span className="fate-rating" title={ladder(item.rating)}>
            {signed(item.rating)}
          </span>
          <b>{item.name}</b>
          <small className="hint">{(LADDER as Record<string, string>)[String(item.rating)] ?? ""}</small>
          <button type="button" className="cc-bonus fate-roll" disabled={!editable} data-roll-skill={item.name} title={`${ACTIONS[action as keyof typeof ACTIONS]} with ${item.name}: four Fate dice ${signed(item.rating)}`} onClick={() => roll(fae ? item.key : item.name)}>
            4dF
          </button>
        </div>
      ))}
      {!fae ? <p className="hint">Unlisted skills are Mediocre (+0).</p> : null}
    </section>
  );
}

// Stress boxes to mark and consequences to write in, recover and clear; the end of a scene and a new session.
export function FateHarm() {
  const { editable, data, act } = useFate();
  const tracks = (Array.isArray(data.tracks) ? data.tracks : []) as { key: string; label: string; boxes: { value: number; marked: boolean }[] }[];
  const consequences = (data.consequences ?? {}) as Record<string, Row>;
  return (
    <section className="cc-panel fate-harm" aria-label="Stress and consequences">
      <h4>Stress</h4>
      {tracks.map((track) => (
        <div key={track.key} className="fate-track" data-track={track.key}>
          <small>{track.label}</small>
          {track.boxes.map((box) => (
            <button key={box.value} type="button" className={box.marked ? "fate-box marked" : "fate-box"} data-stress-box={`${track.key}-${box.value}`} disabled={!editable} title={`A ${box.value}-point box: it takes a hit of ${box.value} shift${box.value === 1 ? "" : "s"} (one box a hit)`} onClick={() => act("stress", { track: track.key, box: box.value, on: !box.marked })}>
              {box.value}
            </button>
          ))}
        </div>
      ))}
      <h4>Consequences</h4>
      {Object.entries(consequences).map(([key, row]) => (
        <div key={key} className="fate-consequence" data-consequence={key}>
          <small title={`Takes ${CONSEQUENCES[key as keyof typeof CONSEQUENCES]} shifts`}>
            {CONSEQUENCE_NAMES[key as keyof typeof CONSEQUENCE_NAMES] ?? key} ({CONSEQUENCES[key as keyof typeof CONSEQUENCES]})
          </small>
          <Field value={String(row.text ?? "")} editable={editable} label={`${key} consequence`} onSave={(value) => act("consequence", { key, text: value })} />
          {editable && String(row.text ?? "") ? (
            <button type="button" className="ghost" data-action="recover" title={num(row.recovering) ? "Recovered: clear it" : "Start recovering (a mild after a scene, moderate after a session, severe after a scenario)"} onClick={() => act("recover", { key, done: Boolean(num(row.recovering)) })}>
              {num(row.recovering) ? "Clear" : "Recover"}
            </button>
          ) : null}
        </div>
      ))}
      {editable ? (
        <p className="cc-inline">
          <button type="button" data-action="clear-stress" title="The scene is over: every stress box clears" onClick={() => act("clear-stress")}>
            Clear stress
          </button>
          <button type="button" data-action="fate-refresh" title="A new session: fate points back up to the refresh" onClick={() => act("refresh")}>
            Refresh
          </button>
        </p>
      ) : null}
    </section>
  );
}

// The last roll, and the aspects to invoke on it: the character's own (a fate point) and the scene's (a free invoke too).
export function FateLastRoll() {
  const { session, editable, data, act } = useFate();
  const last = (data.lastroll ?? null) as Row | null;
  if (!last || !last.at) return null;
  const table = fateTableOf(session);
  const mine = aspectsOf(data) as { key: string; kind: string; name: string }[];
  return (
    <section className="cc-panel fate-last" aria-label="Last roll" data-last-total={num(last.total)}>
      <h4>
        Last roll: {String(last.label ?? "")} {signed(num(last.rating))}
        {num(last.invokes) ? ` +${num(last.invokes) * 2} invoked` : ""} = <b>{ladder(num(last.total))}</b>
        {last.outcome ? <small className="hint"> · {titled(String(last.outcome) === "style" ? "succeed with style" : String(last.outcome))}{num(last.shifts) ? ` (${signed(num(last.shifts))})` : ""}</small> : null}
      </h4>
      {editable ? (
        <>
          <p className="hint">Invoke an aspect on it: +2 or a reroll, for a fate point (you have {num(data.fatepoints)}), or a free invoke.</p>
          <ul className="fate-invokes">
            {mine.map((aspect) => (
              <li key={aspect.key} data-invoke-aspect={aspect.name}>
                <span title={aspect.kind}>{aspect.name}</span>
                <button type="button" data-action="fate-invoke" disabled={num(data.fatepoints) < 1} title="+2 for a fate point" onClick={() => act("invoke", { aspect: aspect.name, mode: "bonus" })}>
                  +2
                </button>
                <button type="button" data-action="fate-reroll" disabled={num(data.fatepoints) < 1} title="Reroll the dice for a fate point" onClick={() => act("invoke", { aspect: aspect.name, mode: "reroll" })}>
                  Reroll
                </button>
              </li>
            ))}
            {table.aspects.map((aspect) => (
              <li key={aspect.id} data-invoke-scene={aspect.name}>
                <span title={`${aspect.kind}${aspect.by ? `, ${aspect.by}'s` : ""}`}>
                  <i>{aspect.name}</i> {aspect.invokes ? <small className="hint">({aspect.invokes} free)</small> : null}
                </span>
                {aspect.invokes > 0 ? (
                  <button type="button" data-action="fate-free-invoke" title="+2 with a free invoke" onClick={() => act("invoke", { aspect: aspect.name, id: aspect.id, mode: "bonus", free: true })}>
                    +2 free
                  </button>
                ) : null}
                <button type="button" data-action="fate-invoke" disabled={num(data.fatepoints) < 1} title="+2 for a fate point" onClick={() => act("invoke", { aspect: aspect.name, mode: "bonus" })}>
                  +2
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

// A compel on the trouble, accepted (a fate point) or refused (one paid); the GM gives or takes a fate point.
export function FateCompels() {
  const { editable, gm, data, act } = useFate();
  if (!editable) return null;
  const aspects = (data.aspects ?? {}) as Row;
  return (
    <section className="cc-panel cc-row five-strip" aria-label="Compels">
      <span className="hint">Compelled?</span>
      <button type="button" data-action="compel-accept" title="Accept a compel on one of your aspects: a fate point" onClick={() => act("compel", { aspect: String(aspects.trouble ?? ""), accept: true })}>
        Accept (+1 FP)
      </button>
      <button type="button" data-action="compel-refuse" disabled={num(data.fatepoints) < 1} title="Refuse the compel: pay a fate point" onClick={() => act("compel", { aspect: String(aspects.trouble ?? ""), accept: false })}>
        Refuse (−1 FP)
      </button>
      {gm ? (
        <>
          <button type="button" data-action="gm-fatepoint" title="Give a fate point" onClick={() => act("fatepoints", { amount: 1 })}>
            +1 FP
          </button>
          <button type="button" data-action="gm-fatepoint-take" title="Take a fate point" onClick={() => act("fatepoints", { amount: -1 })}>
            −1 FP
          </button>
        </>
      ) : null}
    </section>
  );
}

// The host's refusal of the last thing asked.
export function FateProblem() {
  const { modifiers } = useSheet();
  const problem = String(modifiers.problem ?? "");
  return problem ? <p className="error">{problem}</p> : null;
}

// The stunts, each dropped by its ×, and a new one typed as "Name: what it does".
export function FateStunts() {
  const { editable, data, act } = useFate();
  return (
    <>
      <ul className="five-items">
        {rows(data.stunts).map(([key, stunt]) => (
          <li key={key} data-stunt={key}>
            <span>
              <b>{String(stunt.name ?? "")}</b> {stunt.skill ? <small className="hint">({String(stunt.skill)})</small> : null} <small>{String(stunt.text ?? "")}</small>
            </span>
            {editable ? (
              <button type="button" className="ghost" aria-label={`Remove ${String(stunt.name)}`} onClick={() => act("stunt-remove", { key })}>
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <label className="cc-labelled">
          <Field value="" editable={editable} label="New stunt" onSave={(value) => value.trim() && act("stunt-add", { name: value.split(":")[0].trim(), text: value.includes(":") ? value.slice(value.indexOf(":") + 1).trim() : "" })} />
          <small>A new stunt: "Name: what it does" (Enter to add); or drag one from the books' Stunts</small>
        </label>
      ) : null}
    </>
  );
}

// The three milestones, a skill point to spend, and the milestones reached.
export function FateMilestones() {
  const { editable, data, fae, act } = useFate();
  const ratings = fae ? [] : Object.keys((data.skills ?? {}) as Record<string, number>).map((name) => ({ name, rating: num((data.skills as Row)[name]) })).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  return (
    <>
      {(["minor", "significant", "major"] as const).map((kind) => (
        <p key={kind} className="cc-inline">
          {editable ? (
            <button type="button" data-action={`milestone-${kind}`} onClick={() => act("milestone", { kind })}>
              {titled(kind)} milestone
            </button>
          ) : null}
          <small className="hint">{MILESTONES[kind]}</small>
        </p>
      ))}
      {num(data.skillpoints) > 0 && editable ? (
        <p className="cc-inline" data-skillpoints={num(data.skillpoints)}>
          <b>{num(data.skillpoints)} skill point{num(data.skillpoints) === 1 ? "" : "s"}:</b>
          {(fae ? (APPROACHES as string[]) : [...new Set([...ratings.map((item) => item.name), ...(SKILLS as string[])])]).map((name) => (
            <button key={name} type="button" className="ghost" data-skill-up={name} onClick={() => act("skill-up", { skill: name })}>
              {fae ? APPROACH_NAMES[name as keyof typeof APPROACH_NAMES] : name} +1
            </button>
          ))}
        </p>
      ) : null}
      <ul className="five-items">
        {rows(data.milestones).map(([key, entry]) => (
          <li key={key}>
            <span>
              <b>{titled(String(entry.kind ?? "minor"))}</b> {String(entry.text ?? "")}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
