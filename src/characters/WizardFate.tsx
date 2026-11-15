import { useMemo, useState } from "react";
import type { Session } from "../session/useSession";
import { has, rulesetFor } from "../../shared/rulesets/registry.mjs";
import { APPROACHES, APPROACH_NAMES, FREE_STUNTS, PYRAMID, SKILLS, ladder, pyramidProblems, approachProblems, refreshOf, signed } from "../../shared/fate/rules.mjs";

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

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
  const fae = has(rulesetFor(session.ruleset), "approaches");
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
