import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { ACTIONS, APPROACHES, APPROACH_NAMES, CONSEQUENCE_NAMES, CONSEQUENCES, FREE_STUNTS, LADDER, MILESTONES, PYRAMID, SKILLS, aspectsOf, ladder, pyramidProblems, approachProblems, refreshOf, signed } from "../../shared/fate/rules.mjs";

// The Fate character sheet (Fate Core and Fate Accelerated, one sheet): who
// they are and their aspects on top; skills (or approaches) to roll with
// four Fate dice against an opposition, for any of the four actions; fate
// points and refresh; stress boxes and consequences; the last roll, with its
// aspects to invoke (+2 or a reroll, a fate point or a scene aspect's free
// invoke); stunts; milestones instead of experience. The host does the rest
// (electron/fate.cjs).

type Row = Record<string, unknown>;
const TABS = ["main", "stunts", "milestones", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const ASPECT_LABELS: Record<string, string> = { highconcept: "High Concept", trouble: "Trouble", a1: "Aspect", a2: "Aspect", a3: "Aspect" };
const LADDER_STEPS = [8, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2];
export type SceneAspect = { id: string; name: string; invokes: number; kind: string; by: string };
// The table's Fate state (the record the host keeps: electron/fate.cjs).
export function fateTableOf(session: Session) {
  const data = (session.records["fate-table"]?.data ?? {}) as Row;
  const aspects: SceneAspect[] = rows(data.aspects).map(([id, aspect]) => ({ id, name: String(aspect.name ?? ""), invokes: num(aspect.invokes), kind: String(aspect.kind ?? "situation"), by: String(aspect.by ?? "") }));
  return { aspects, gmpool: num(data.gmpool), conflict: String(data.conflict ?? "physical"), scene: String(data.scene ?? "") };
}

export function SheetFate({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const [action, setAction] = useState("overcome");
  const [opposition, setOpposition] = useState("2");
  const [newAspect, setNewAspect] = useState("");
  const [problem, setProblem] = useState("");
  const data = record.data as Row;
  const fae = data.game === "fae";
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const act = (name: string, args: Record<string, unknown> = {}) => {
    setProblem("");
    void session.fateAction(record.id, name, args).catch((error: unknown) => setProblem(error instanceof Error ? error.message : String(error)));
  };
  const aspects = (data.aspects ?? {}) as Row;
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const ratings = fae ? (APPROACHES as string[]).map((key) => ({ key, name: APPROACH_NAMES[key as keyof typeof APPROACH_NAMES], rating: num((data.approaches as Row | undefined)?.[key]) })) : Object.entries((data.skills ?? {}) as Record<string, number>).map(([name, rating]) => ({ key: name, name, rating: num(rating) })).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  const tracks = (Array.isArray(data.tracks) ? data.tracks : []) as { key: string; label: string; boxes: { value: number; marked: boolean }[] }[];
  const consequences = (data.consequences ?? {}) as Record<string, Row>;
  const last = (data.lastroll ?? null) as Row | null;
  const table = fateTableOf(session);
  const mine = aspectsOf(data) as { key: string; kind: string; name: string }[];
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const roll = (skill: string) => {
    if (!editable) return;
    if (action === "attack" && inFight && targetNames.length) {
      // In a conflict, an attack goes through the tracker: the target defends.
      session.ct("attack", { recordId: record.id, weapon: skill });
      return;
    }
    act("roll", { skill, action, ...(action === "attack" || action === "defend" || opposition === "" ? {} : { opposition: Number(opposition) }), ...(action === "advantage" && newAspect.trim() ? { aspect: newAspect.trim() } : {}) });
  };
  const status = String(data.status ?? "");

  return (
    <article className="cc-sheet sheet-5e sheet-fate" data-character={record.id} data-ruleset="fate" data-game={fae ? "fae" : "core"}>
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
            <label className="cc-labelled grow">
              <Field value={record.name} editable={editable} label="Name" className="cc-name" onSave={(value) => change("name", value)} />
              <small>Name · {fae ? "Fate Accelerated" : "Fate Core"}</small>
            </label>
            <div className="cc-boxes">
              <label className="cc-labelled cc-box fate-points" title="Fate points: spend one to invoke an aspect; a compel accepted gives one">
                <span className="cc-value" data-fatepoints={num(data.fatepoints)}>
                  {num(data.fatepoints)}
                </span>
                <small>Fate points</small>
              </label>
              <label className="cc-labelled cc-box" title={`Refresh: ${num(data.refreshbase) || 3}, less a point for each stunt past ${FREE_STUNTS}; your fate points come back up to it each session`}>
                <span className="cc-value" data-refresh={num(data.refresh)}>
                  {num(data.refresh)}
                </span>
                <small>Refresh</small>
              </label>
              {status ? (
                <label className="cc-labelled cc-box">
                  <span className="cc-value" data-fate-status={status} style={{ color: status === "Harmed" ? "#c08000" : "#c0392b" }}>
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
            <section className="cc-panel fate-aspects" aria-label="Aspects">
              {(["highconcept", "trouble", "a1", "a2", "a3"] as const).map((key) => (
                <label key={key} className="cc-labelled" data-aspect-key={key}>
                  <Field value={String(aspects[key] ?? "")} editable={editable} label={ASPECT_LABELS[key]} className="fate-aspect" onSave={(value) => change(`aspects.${key}`, value)} />
                  <small>{ASPECT_LABELS[key]}</small>
                </label>
              ))}
            </section>
            {editable ? (
              <section className="cc-panel cc-row fate-rollbar" aria-label="Roll">
                <label className="cc-inline" title="The four actions: overcome an obstacle, create an advantage (an aspect with a free invoke), attack, defend">
                  <select aria-label="Action" data-field="fate-action" value={action} onChange={(event) => setAction(event.target.value)}>
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
                    <select aria-label="Opposition" data-field="fate-opposition" value={opposition} onChange={(event) => setOpposition(event.target.value)}>
                      {LADDER_STEPS.map((step) => (
                        <option key={step} value={String(step)}>
                          {ladder(step)}
                        </option>
                      ))}
                      <option value="">none (active opposition)</option>
                    </select>
                  </label>
                ) : null}
                {action === "advantage" ? <input aria-label="New aspect" data-field="fate-new-aspect" placeholder="The aspect to create" value={newAspect} onChange={(event) => setNewAspect(event.target.value)} /> : null}
                {action === "attack" ? <small className="hint">{targetNames.length ? `at ${targetNames.join(", ")} (they defend)` : "Ctrl+click a token to target it, in a conflict"}</small> : null}
              </section>
            ) : null}
            <div className="cc-main-grid five-main">
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
            </div>
            {last && last.at ? (
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
            ) : null}
            {editable ? (
              <section className="cc-panel cc-row five-strip" aria-label="Compels">
                <span className="hint">Compelled?</span>
                <button type="button" data-action="compel-accept" title="Accept a compel on one of your aspects: a fate point" onClick={() => act("compel", { aspect: String(aspects.trouble ?? ""), accept: true })}>
                  Accept (+1 FP)
                </button>
                <button type="button" data-action="compel-refuse" disabled={num(data.fatepoints) < 1} title="Refuse the compel: pay a fate point" onClick={() => act("compel", { aspect: String(aspects.trouble ?? ""), accept: false })}>
                  Refuse (−1 FP)
                </button>
                {session.role === "dm" ? (
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
            ) : null}
            {problem ? <p className="error">{problem}</p> : null}
          </div>
        ) : null}

        {tab === "stunts" ? (
          <section className="cc-panel cc-page" data-tab-page="stunts">
            <p className="hint">
              {FREE_STUNTS} stunts are free; each one more costs a refresh (refresh {num(data.refresh)}, never below 1).
            </p>
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
            <label className="cc-labelled">
              <Field value={String(data.extras ?? "")} area editable={editable} label="Extras" onSave={(value) => change("extras", value)} />
              <small>Extras and what the party found (gear, allies, places: aspects or stunts to be)</small>
            </label>
          </section>
        ) : null}

        {tab === "milestones" ? (
          <section className="cc-panel cc-page" data-tab-page="milestones">
            <p className="hint">Fate has no experience: characters change at milestones.</p>
            {(["minor", "significant", "major"] as const).map((kind) => (
              <p key={kind} className="cc-inline">
                {session.role === "dm" || editable ? (
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
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            {!fae
              ? (["p1", "p2", "p3"] as const).map((key, index) => {
                  const phase = ((data.phases as Row | undefined)?.[key] ?? {}) as Row;
                  return (
                    <label key={key} className="cc-labelled">
                      <Field value={String(phase.story ?? "")} area editable={editable} label={`Phase ${index + 1}`} onSave={(value) => change(`phases.${key}.story`, value)} />
                      <small>
                        Phase {index + 1}: {String(phase.title ?? ["Your adventure", "Crossing paths", "Crossing paths again"][index])}
                        {phase.guest ? ` (with ${String(phase.guest)})` : ""}
                      </small>
                    </label>
                  );
                })
              : null}
            <label className="cc-labelled">
              <Field value={String(data.description ?? "")} area editable={editable} label="Description" onSave={(value) => change("description", value)} />
              <small>Description</small>
            </label>
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

// The Fate character wizard, the book's character creation in its order.
// Fate Core: high concept and trouble, a name, the phase trio (your
// adventure, crossing paths twice: an aspect each), the skill pyramid (one
// Great, two Good, three Fair, four Average), stunts (three free, two more
// at a refresh each), then refresh, stress and consequences worked out.
// Fate Accelerated: high concept, trouble and up to three more aspects, a
// name, the six approaches (+3, +2, +2, +1, +1, +0), stunts. Or a book's
// pregenerated character, taken as it is.
const SLOTS: number[] = Object.entries(PYRAMID).sort((a, b) => Number(b[0]) - Number(a[0])).flatMap(([rating, count]) => Array<number>(count as number).fill(Number(rating)));
export function WizardFate({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const fae = session.ruleset === "Fate Accelerated";
  const game = fae ? "fae" : "core";
  const records = Object.values(session.records);
  const pregens = records.filter((item) => item.type === "pregencharsheet" && (item.data.game ?? game) === game).sort((a, b) => a.name.localeCompare(b.name));
  const skillNames = useMemo(() => {
    const books = records.filter((item) => item.type === "fateskill" && !item.data.approach).map((item) => item.name);
    return books.length ? [...new Set(books)].sort() : [...(SKILLS as string[])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.records]);
  const bookStunts = useMemo(() => records.filter((item) => item.type === "fatestunt").map((item) => ({ name: item.name, skill: String(item.data.skill ?? ""), text: String(item.data.summary ?? "") })), [session.records]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [name, setName] = useState("");
  const [aspects, setAspects] = useState<Record<string, string>>({ highconcept: "", trouble: "", a1: "", a2: "", a3: "" });
  const [phases, setPhases] = useState<Record<string, { title: string; story: string; guest: string }>>({ p1: { title: "", story: "", guest: "" }, p2: { title: "", story: "", guest: "" }, p3: { title: "", story: "", guest: "" } });
  const [slots, setSlots] = useState<string[]>(SLOTS.map(() => ""));
  const [approaches, setApproaches] = useState<Record<string, number>>({ careful: 0, clever: 0, flashy: 0, forceful: 0, quick: 0, sneaky: 0 });
  const [stunts, setStunts] = useState<{ name: string; text: string; skill: string }[]>([]);
  const [stuntSearch, setStuntSearch] = useState("");
  const [ownStunt, setOwnStunt] = useState("");
  const [description, setDescription] = useState("");
  const skills = Object.fromEntries(slots.map((skill, index) => [skill, SLOTS[index]]).filter(([skill]) => skill));
  const wrong = fae ? approachProblems(approaches) : pyramidProblems(skills);
  const refresh = refreshOf({ stunts: Object.fromEntries(stunts.map((stunt, index) => [String(index), stunt])) });
  const physique = num(skills.Physique);
  const will = num(skills.Will);
  const boxes = (rating: number) => (rating >= 3 ? 4 : rating >= 1 ? 3 : 2);
  const ready = Boolean(aspects.highconcept.trim() && aspects.trouble.trim() && wrong.length === 0);
  const finish = async (spec: Record<string, unknown>) => {
    setBusy(true);
    setProblem("");
    try {
      onDone(await session.buildCharacter(spec));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const build = () =>
    finish({
      game,
      name: name.trim() || aspects.highconcept,
      aspects,
      ...(fae ? { approaches } : { skills, phases: Object.fromEntries(Object.entries(phases).map(([key, phase], index) => [key, { ...phase, aspect: aspects[`a${index + 1}`] }])) }),
      stunts,
      description,
    });
  const setAspect = (key: string, value: string) => setAspects({ ...aspects, [key]: value });
  const shownStunts = bookStunts.filter((stunt) => `${stunt.name} ${stunt.skill} ${stunt.text}`.toLowerCase().includes(stuntSearch.toLowerCase()) && !stunts.some((item) => item.name === stunt.name)).slice(0, 60);
  return (
    <section className="wizard-5e cc-panel" aria-label="Fate character wizard" data-wizard="fate" data-game={game}>
      <header className="cc-row">
        <b>New {fae ? "Fate Accelerated" : "Fate Core"} character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || !ready} title={wrong.length ? wrong.join(" ") : "Make the character"} onClick={() => void build()}>
          Finish
        </button>
      </header>
      {pregens.length ? (
        <div className="cc-inline fate-pregens">
          <span className="hint">Or take a pregenerated character as it is:</span>
          {pregens.map((item) => (
            <button key={item.id} type="button" className="ghost" data-pregen={item.name} disabled={busy} title={String(item.data.description ?? "")} onClick={() => void finish({ pregen: item.id, name: item.name.replace(/\s*\(Fate (Core|Accelerated)\)$/, "") })}>
              {item.name.replace(/\s*\(Fate (Core|Accelerated)\)$/, "")}
            </button>
          ))}
        </div>
      ) : null}

      <h4>1. High concept and trouble</h4>
      <p className="hint">{fae ? "Your high concept sums up who your character is; your trouble is what makes life complicated." : "Your high concept is a phrase that sums up what your character is about; your trouble is the thing that complicates their life."}</p>
      <div className="fate-wizard-aspects">
        <input aria-label="High concept" data-field="highconcept" placeholder="High concept: Swordmaster of the Quiet Order" value={aspects.highconcept} onChange={(event) => setAspect("highconcept", event.target.value)} />
        <input aria-label="Trouble" data-field="trouble" placeholder="Trouble: My Brother's Debts" value={aspects.trouble} onChange={(event) => setAspect("trouble", event.target.value)} />
        <input aria-label="Character name" data-field="name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      {fae ? (
        <>
          <h4>2. Another aspect (up to three; the rest can wait for play)</h4>
          <div className="fate-wizard-aspects">
            {(["a1", "a2", "a3"] as const).map((key, index) => (
              <input key={key} aria-label={`Aspect ${index + 1}`} data-field={key} placeholder="An aspect: a relationship, a belief, a catchphrase" value={aspects[key]} onChange={(event) => setAspect(key, event.target.value)} />
            ))}
          </div>
          <h4>3. Approaches</h4>
          <p className="hint">One Good (+3), two Fair (+2), two Average (+1), one Mediocre (+0).</p>
          <div className="fate-wizard-approaches">
            {(APPROACHES as string[]).map((key) => (
              <label key={key} className="cc-inline" data-approach={key}>
                <b>{APPROACH_NAMES[key as keyof typeof APPROACH_NAMES]}</b>
                <select aria-label={APPROACH_NAMES[key as keyof typeof APPROACH_NAMES]} value={approaches[key]} onChange={(event) => setApproaches({ ...approaches, [key]: Number(event.target.value) })}>
                  {[3, 2, 1, 0].map((value) => (
                    <option key={value} value={value}>
                      {ladder(value)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <h4>2. The phase trio</h4>
          {(["p1", "p2", "p3"] as const).map((key, index) => (
            <div key={key} className="fate-phase" data-phase={key}>
              <b>{["Phase one: your adventure", "Phase two: crossing paths", "Phase three: crossing paths again"][index]}</b>
              <input aria-label={`Phase ${index + 1} title`} placeholder="The story's title" value={phases[key].title} onChange={(event) => setPhases({ ...phases, [key]: { ...phases[key], title: event.target.value } })} />
              {index > 0 ? <input aria-label={`Phase ${index + 1} guest`} placeholder="Whose story you join" value={phases[key].guest} onChange={(event) => setPhases({ ...phases, [key]: { ...phases[key], guest: event.target.value } })} /> : null}
              <input aria-label={`Phase ${index + 1} aspect`} data-field={`a${index + 1}`} placeholder="The aspect it gives you" value={aspects[`a${index + 1}`]} onChange={(event) => setAspect(`a${index + 1}`, event.target.value)} />
            </div>
          ))}
          <h4>3. Skills</h4>
          <p className="hint">The pyramid: one Great (+4), two Good (+3), three Fair (+2), four Average (+1); every other skill Mediocre (+0).</p>
          <div className="fate-wizard-pyramid">
            {SLOTS.map((rating, index) => (
              <label key={index} className="cc-inline" data-slot={index}>
                <small>{ladder(rating)}</small>
                <select aria-label={`${ladder(rating)} skill ${index + 1}`} value={slots[index]} onChange={(event) => setSlots(slots.map((skill, at) => (at === index ? event.target.value : skill)))}>
                  <option value="">Choose…</option>
                  {skillNames
                    .filter((skill) => skill === slots[index] || !slots.includes(skill))
                    .map((skill) => (
                      <option key={skill} value={skill}>
                        {skill}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        </>
      )}

      <h4>{fae ? "4" : "4"}. Stunts</h4>
      <p className="hint">
        Three are free; up to two more cost a refresh each. Refresh: <b data-wizard-refresh={refresh}>{refresh}</b>
      </p>
      <ul className="five-items">
        {stunts.map((stunt, index) => (
          <li key={stunt.name} data-wizard-stunt={stunt.name}>
            <span>
              <b>{stunt.name}</b> <small className="hint">{stunt.text}</small>
            </span>
            <button type="button" className="ghost" aria-label={`Drop ${stunt.name}`} onClick={() => setStunts(stunts.filter((_, at) => at !== index))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {stunts.length < FREE_STUNTS + 2 ? (
        <>
          <div className="cc-inline">
            <input aria-label="Own stunt" placeholder="Your own: Name: what it does" value={ownStunt} onChange={(event) => setOwnStunt(event.target.value)} />
            <button
              type="button"
              disabled={!ownStunt.trim()}
              onClick={() => {
                const [stuntName, ...rest] = ownStunt.split(":");
                setStunts([...stunts, { name: stuntName.trim(), text: rest.join(":").trim(), skill: "" }]);
                setOwnStunt("");
              }}
            >
              Add
            </button>
            <input aria-label="Stunt search" placeholder="Search the books' stunts" value={stuntSearch} onChange={(event) => setStuntSearch(event.target.value)} />
          </div>
          <ul className="life-shop">
            {shownStunts.map((stunt) => (
              <li key={`${stunt.skill}-${stunt.name}`}>
                <span>
                  {stunt.name} <small className="hint">{stunt.skill ? `${stunt.skill} · ` : ""}{stunt.text}</small>
                </span>
                <button type="button" aria-label={`Take ${stunt.name}`} onClick={() => setStunts([...stunts, stunt])}>
                  Take
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h4>5. Refresh, stress and consequences</h4>
      <p className="hint" data-wizard-summary>
        Refresh {refresh}, {refresh} fate points to start.{" "}
        {fae ? "Stress: three boxes (1, 2, 3)." : `Physical stress ${boxes(physique)} boxes (Physique ${signed(physique)}), mental ${boxes(will)} (Will ${signed(will)}).`} Consequences: mild (2), moderate (4), severe (6){!fae && (physique >= 5 || will >= 5) ? ", and an extra mild" : ""}.
      </p>
      <textarea aria-label="Description" placeholder="What they look like, how they talk" value={description} onChange={(event) => setDescription(event.target.value)} />
      {wrong.length && (fae || Object.keys(skills).length) ? <p className="hint" data-wizard-problems>{wrong.join(" ")}</p> : null}
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
