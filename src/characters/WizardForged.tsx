import { useState } from "react";
import type { Session } from "../session/useSession";
import { Boxes } from "../rulesets/forged";
import { ACTIONS_BY_ATTRIBUTE, ATTRIBUTES, VICES, titled } from "../../shared/forged/rules.mjs";

type Row = Record<string, unknown>;
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const list = (node: unknown): Row[] => (Array.isArray(node) ? (node as Row[]) : rows(node).map(([, row]) => row));

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
          <p className="forged-step"><b>Choose a playbook.</b></p>
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
          <p className="forged-step"><b>Choose a heritage</b> and write a detail about your family life.</p>
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
          <p className="forged-step"><b>Choose a background</b> and write a detail of your own.</p>
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
          <p className="forged-step"><b>Assign four action dots</b>: one for your heritage, one for your background, two anywhere. None above 2. <span className="forged-left" data-dots-left={4 - added}>{4 - added} left</span></p>
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
          <p className="forged-step"><b>Choose a special ability</b> (the first is a good default).</p>
          {abilities.map((item) => (
            <label key={String(item.name)} className="forged-choice">
              <input type="radio" name="forged-ability" data-ability={String(item.name)} checked={chosenAbility === item.name} onChange={() => setAbility(String(item.name))} /> <b>{String(item.name)}.</b> <small>{String(item.text ?? "")}</small>
            </label>
          ))}
        </li>
        <li>
          <p className="forged-step"><b>Choose one close friend and one rival.</b></p>
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
          <p className="forged-step"><b>Choose your vice</b>, describe it, and name your purveyor and where to find them.</p>
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
          <p className="forged-step"><b>Record your name, alias, and look.</b></p>
          <input aria-label="Character name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
          <input aria-label="Alias" placeholder="Alias" value={alias} onChange={(event) => setAlias(event.target.value)} />
          <input aria-label="Look" placeholder="Tall, scarred, a long grey coat" value={look} onChange={(event) => setLook(event.target.value)} />
        </li>
      </ol>
    </section>
  );
}
