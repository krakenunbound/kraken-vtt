import { useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { RANK_NAMES, RANKS, SPREAD, STAT_NAMES, STATS, gameOf } from "../../shared/ironsworn/rules.mjs";

// The Ironsworn and Starforged character wizard, moved unchanged from SheetIronsworn.tsx when the sheet went onto
// the core parts (shared/ironsworn/manifest.mjs).
type Row = Record<string, unknown>;
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];

// The character wizard, the game's steps: stats (3, 2, 2, 1, 1), assets
// (Ironsworn three; Starforged two paths, the starship and one more), the
// background vow, bonds or a first connection, the inciting vow, what they
// carry, name and look.
export function WizardIronsworn({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const game = gameOf(session.ruleset);
  const sf = game === "starforged";
  const assets = Object.values(session.records)
    .filter((item) => item.type === "ironasset" && String(item.data.game ?? game) === game)
    .sort((a, b) => String(a.data.category).localeCompare(String(b.data.category)) || a.name.localeCompare(b.name));
  const [name, setName] = useState("");
  const [look, setLook] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [callsign, setCallsign] = useState("");
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(STATS.map((stat: string, index: number) => [stat, SPREAD[index]])));
  const [chosen, setChosen] = useState<string[]>([]);
  const [shipName, setShipName] = useState("");
  const [vow, setVow] = useState("");
  const [vowRank, setVowRank] = useState(sf ? "epic" : "extreme");
  const [inciting, setInciting] = useState("");
  const [incitingRank, setIncitingRank] = useState("dangerous");
  const [bonds, setBonds] = useState(["", "", ""]);
  const [connection, setConnection] = useState({ name: "", role: "", rank: "dangerous" });
  const [background, setBackground] = useState("");
  const [gear, setGear] = useState(sf ? "" : "Bedroll, flint and steel, a waterskin");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const starship = assets.find((item) => /command vehicle/i.test(String(item.data.category)));
  const sorted = Object.values(values).sort((a, b) => b - a).join(",");
  const statsOk = sorted === SPREAD.join(",");
  const chosenRecords = chosen.map((id) => assets.find((item) => item.id === id)).filter(Boolean) as TableRecord[];
  const paths = chosenRecords.filter((item) => /path/i.test(String(item.data.category))).length;
  // Three chosen in either game (Starforged's starship comes on top).
  const need = 3;
  const assetsOk = sf ? chosenRecords.length === 3 && paths >= 2 : chosenRecords.length === 3;
  const canFinish = statsOk && assetsOk && Boolean(vow.trim());
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((item) => item !== id) : chosen.length < need ? [...chosen, id] : chosen);
  const finish = async () => {
    setBusy(true);
    setProblem("");
    try {
      const spec = {
        name: name || (sf ? "Spacer" : "Ironsworn"),
        look,
        background,
        ...(sf ? { pronouns, callsign } : {}),
        stats: values,
        assets: [...chosenRecords.map((item) => item.name), ...(sf && starship ? [{ name: starship.name, field: shipName }] : [])],
        backgroundVow: { name: vow, rank: vowRank },
        ...(inciting.trim() ? { incitingVow: { name: inciting, rank: incitingRank } } : {}),
        ...(sf ? (connection.name.trim() ? { connection } : {}) : { bonds }),
        gear: gear.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
      };
      const id = await session.buildCharacter(spec);
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (assets.length === 0) return <p className="hint">No assets yet: the GM makes the {sf ? "Starforged" : "Ironsworn"} Reference active (Modules).</p>;
  const groups = [...new Set(assets.filter((item) => !(sf && /command vehicle|deed/i.test(String(item.data.category)))).map((item) => String(item.data.category)))];
  return (
    <section className="wizard-5e cc-panel wizard-ironsworn" aria-label={`${sf ? "Starforged" : "Ironsworn"} character wizard`} data-wizard="ironsworn" data-game={game}>
      <header className="cc-row">
        <b>New {sf ? "Starforged" : "Ironsworn"} character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || !canFinish} title="Stats 3, 2, 2, 1, 1; the assets; a background vow" onClick={() => void finish()}>
          Finish
        </button>
      </header>
      <h4>1. Stats <small className="hint">3, 2, 2, 1 and 1, one to each {statsOk ? "✓" : "(not yet)"}</small></h4>
      <div className="wizard-5e-scores">
        {STATS.map((stat: string) => (
          <label key={stat}>
            {STAT_NAMES[stat as keyof typeof STAT_NAMES]}
            <select value={values[stat]} aria-label={`${stat} value`} data-iron-stat={stat} onChange={(event) => setValues({ ...values, [stat]: Number(event.target.value) })}>
              {[3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <h4>
        2. Assets{" "}
        <small className="hint">
          {sf ? `two paths and one more of any kind (${chosenRecords.length}/3, ${paths} paths); the Starship is yours` : `three of any kind (${chosenRecords.length}/3)`}
        </small>
      </h4>
      {sf && starship ? (
        <p className="cc-inline">
          <b>Starship</b> (command vehicle, everyone's){" "}
          <label>
            its name <input value={shipName} data-ship-name onChange={(event) => setShipName(event.target.value)} />
          </label>
        </p>
      ) : null}
      <div className="iron-wizard-assets">
        {groups.map((group) => (
          <details key={group} open={/path/i.test(group)}>
            <summary>{group}</summary>
            <div className="wizard-5e-skills">
              {assets
                .filter((item) => String(item.data.category) === group)
                .map((item) => (
                  <label key={item.id} title={rows(item.data.abilities).map(([, ability]) => String(ability.text ?? "")).join("\n\n")}>
                    <input type="checkbox" checked={chosen.includes(item.id)} data-iron-asset={item.name} disabled={!chosen.includes(item.id) && chosen.length >= need} onChange={() => toggle(item.id)} />
                    {item.name}
                  </label>
                ))}
            </div>
          </details>
        ))}
      </div>
      <h4>3. {sf ? "Backstory and background vow (epic)" : "Background vow (extreme or epic)"}</h4>
      <p className="cc-inline">
        <input placeholder="I swear to..." value={vow} data-background-vow onChange={(event) => setVow(event.target.value)} style={{ flex: 1 }} />
        {sf ? null : (
          <select value={vowRank} data-background-rank onChange={(event) => setVowRank(event.target.value)}>
            <option value="extreme">Extreme</option>
            <option value="epic">Epic</option>
          </select>
        )}
      </p>
      <textarea placeholder={sf ? "Your backstory" : "Your background"} value={background} onChange={(event) => setBackground(event.target.value)} rows={2} />
      {sf ? (
        <>
          <h4>4. Your first connection</h4>
          <p className="cc-inline">
            <input placeholder="Name" value={connection.name} data-connection-name onChange={(event) => setConnection({ ...connection, name: event.target.value })} />
            <input placeholder="Role (Broker, Navigator...)" value={connection.role} data-connection-role onChange={(event) => setConnection({ ...connection, role: event.target.value })} />
            <select value={connection.rank} onChange={(event) => setConnection({ ...connection, rank: event.target.value })}>
              {(RANKS as string[]).map((rank) => (
                <option key={rank} value={rank}>
                  {RANK_NAMES[rank as keyof typeof RANK_NAMES]}
                </option>
              ))}
            </select>
          </p>
        </>
      ) : (
        <>
          <h4>4. Bonds <small className="hint">up to three people or places; each a tick on the bonds track</small></h4>
          <p className="cc-inline">
            {bonds.map((bond, index) => (
              <input key={index} placeholder={`Bond ${index + 1}`} value={bond} data-bond={index} onChange={(event) => setBonds(bonds.map((item, at) => (at === index ? event.target.value : item)))} />
            ))}
          </p>
        </>
      )}
      <h4>5. The inciting incident <small className="hint">a first vow to start the story (optional)</small></h4>
      <p className="cc-inline">
        <input placeholder="I swear to..." value={inciting} data-inciting-vow onChange={(event) => setInciting(event.target.value)} style={{ flex: 1 }} />
        <select value={incitingRank} onChange={(event) => setIncitingRank(event.target.value)}>
          {(RANKS as string[]).map((rank) => (
            <option key={rank} value={rank}>
              {RANK_NAMES[rank as keyof typeof RANK_NAMES]}
            </option>
          ))}
        </select>
      </p>
      <h4>6. What you carry <small className="hint">in words: Ironsworn has no money</small></h4>
      <textarea value={gear} data-gear onChange={(event) => setGear(event.target.value)} rows={2} placeholder="A bow, a bedroll..." />
      <h4>7. Name and look</h4>
      <div className="wizard-5e-grid">
        <label>
          Name <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Character name" />
        </label>
        <label>
          Look <input value={look} onChange={(event) => setLook(event.target.value)} data-look />
        </label>
        {sf ? (
          <>
            <label>
              Pronouns <input value={pronouns} onChange={(event) => setPronouns(event.target.value)} />
            </label>
            <label>
              Callsign <input value={callsign} onChange={(event) => setCallsign(event.target.value)} />
            </label>
          </>
        ) : null}
      </div>
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
