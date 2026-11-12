import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../session/useSession";
import { catalog } from "../../shared/mgt2/rules.mjs";

// The Traveller wizard: the GM's own FG extension KrakenCharWizardMGT2, its
// term engine run on the host (electron/tcwizard.cjs) and every roll the
// table's. Its pages as in FG: Characteristics (2D six times, swap),
// Species, Background (EDU DM + 3 skills at 0, homeworld), Careers (one
// term at a time: each step its rules text and buttons), Benefits (items
// within their Cr and TL limits, medical care), Skills (Connections, a skill
// package), Finish (name and details, warnings, Kraken's shop for the cash
// left, Create).

type Option = { label: string; tip?: string; disabled?: boolean; roll?: { dice?: string; mod?: number; target?: number; desc?: string } };
type Life = {
  tab: string;
  tabs: { key: string; alerts: string[] }[];
  started: boolean;
  done: boolean;
  canReroll: boolean;
  rolled: number;
  stats: { key: string; short: string; name: string; base?: number; value: number; dm: number }[];
  upp: string;
  age: number;
  species: { path: string; name: string; mods: string; text: string }[];
  speciesChosen?: string;
  background: string[];
  bg: Record<string, boolean>;
  bgChosen: number;
  bgAllowed: number;
  homeworld: string;
  task: { title?: string; text?: string; options: Option[] } | null;
  waiting: boolean;
  log: string[];
  careers: string;
  skills: Record<string, number>;
  skillText: string;
  skillWarnings: string[];
  benefits: { index: number; name: string; kind: string; item?: string; itemname?: string; choices?: { path: string; name: string; cost?: string; tl?: number }[] }[];
  benefitsText: string;
  injuries: { stat: string; points: number; cover?: number; cost?: number; settled?: boolean; restored?: boolean }[];
  finalCash: number;
  connections: { skill?: string; applied?: boolean; who?: string }[];
  packages: { name: string; text: string; skills: string[] }[];
  package: string;
  packagePicks: Record<string, boolean | string>;
  assoc: string;
  warnings: string[];
  name: string;
  gender: string;
  appearance: string;
  why: string;
};
const TITLES: Record<string, string> = { characteristics: "Characteristics", species: "Species", background: "Background", careers: "Careers", benefits: "Benefits", skills: "Skills", finish: "Finish" };
// The extension's own instructions for a page (its strings), as FG's Instructions panel.
const EXT = "KrakenCharWizardMGT2";
function Instructions({ session, tab }: { session: Session; tab: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    let live = true;
    void session.wizardText(EXT, "@string", [`tcwiz_steps_${tab}`]).then((result) => live && setText(result.values[0] ?? ""));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  return text ? (
    <details className="life-instructions" data-life-instructions={tab}>
      <summary>Instructions</summary>
      <p>{text}</p>
    </details>
  ) : null;
}
const list = <T,>(value: T[] | Record<string, T> | undefined | null): T[] => (Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []);

export function WizardMgt2({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const [life, setLife] = useState<Life | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("characteristics");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [swap, setSwap] = useState("");
  const [name, setName] = useState("");
  const act = async (body: Parameters<Session["lifeAction"]>[0]) => {
    setBusy(true);
    setProblem("");
    try {
      const result = await session.lifeAction(body);
      if (body.action === "build") return onDone(result.id || null);
      setLife((result.life as Life) ?? null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const call = (fn: string, ...args: unknown[]) => act({ action: "call", fn, args });
  useEffect(() => {
    void session
      .lifeAction({ action: "view" })
      .then((result) => setLife((result.life as Life) ?? null))
      .catch((error) => setProblem(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoaded(true));
  }, [session.lifeAction]);
  // The engine moves to Careers once it starts the terms.
  useEffect(() => {
    if (life?.tab && life.tab !== tab && life.tab === "careers") setTab("careers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [life?.tab]);
  const logRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [life?.log?.length]);

  const head = (
    <header className="cc-row">
      <b>New Traveller</b>
      <span className="me-spacer" />
      {life ? (
        <button type="button" className="ghost" data-action="life-restart" disabled={busy} onClick={() => void act({ action: "cancel" }).then(() => setLife(null))}>
          Start over
        </button>
      ) : null}
      <button type="button" className="ghost" onClick={() => onDone(null)}>
        Close
      </button>
    </header>
  );
  if (!loaded) return <section className="wizard-5e cc-panel wizard-mgt2" data-wizard="mgt2">{head}</section>;
  if (!life)
    return (
      <section className="wizard-5e cc-panel wizard-mgt2" aria-label="Traveller wizard" data-wizard="mgt2">
        {head}
        <p className="hint">The Traveller Character Wizard: characteristics, species, background, then careers a term at a time (qualification, training, survival, events, promotions, ageing), mustering out, and your benefits. Every roll goes to chat.</p>
        <p className="cc-inline">
          Name <input value={name} aria-label="Character name" onChange={(event) => setName(event.target.value)} />
          <button type="button" data-action="life-start" disabled={busy} onClick={() => void act({ action: "start", name })}>
            Begin
          </button>
        </p>
        {problem ? <p className="error">{problem}</p> : null}
      </section>
    );

  const go = (key: string) => {
    setTab(key);
    if (key === "careers" && !life.started) void call("showTab", "careers");
  };
  return (
    <section className="wizard-5e cc-panel wizard-mgt2" aria-label="Traveller wizard" data-wizard="mgt2" data-life-age={life.age} data-life-done={life.done ? "yes" : "no"}>
      {head}
      <nav className="ccw-tabs life-tabs" role="tablist">
        {life.tabs.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} data-wizard-tab={item.key} className={item.alerts.length ? "alert" : "ok"} title={item.alerts.join("\n") || "Done"} onClick={() => go(item.key)} disabled={item.key === "careers" && life.rolled < 6}>
            {TITLES[item.key] ?? item.key} {item.alerts.length ? "•" : "✓"}
          </button>
        ))}
      </nav>
      <div className="life-grid">
        <div className="life-page" data-life-page={tab} style={{ ["--life-art" as string]: `url(${session.wizardArtUrl(EXT, `art_${tab}.webp`)})` }}>
          <Instructions session={session} tab={tab} />
          {tab === "characteristics" ? (
            <>
              <p className="hint">Roll 2D six times, then swap any two scores (click one, then the other) until the first term begins.</p>
              <button type="button" data-action="tc-roll" disabled={busy || (life.rolled === 6 && !life.canReroll)} onClick={() => void call("rollCharacteristics")}>
                {life.rolled === 6 ? "Roll again" : "Roll characteristics"}
              </button>
              <div className="life-stats big">
                {life.stats.map((stat) => (
                  <button
                    key={stat.key}
                    type="button"
                    data-tc-stat={stat.key}
                    className={swap === stat.key ? "active" : ""}
                    disabled={life.started || stat.base === undefined}
                    title={stat.name}
                    onClick={() => {
                      if (!swap) return setSwap(stat.key);
                      void call("swapScores", swap, stat.key);
                      setSwap("");
                    }}
                  >
                    {stat.short} <b>{stat.value || "-"}</b> <small>{stat.dm >= 0 ? `+${stat.dm}` : stat.dm}</small>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {tab === "species" ? (
            <div className="life-choices-list">
              {life.species.map((item) => (
                <label key={item.path} className="cc-inline">
                  <input type="radio" name="species" data-tc-species={item.name} checked={life.speciesChosen === item.path} disabled={life.started} onChange={() => void call("selectSpecies", item.path)} />
                  <b>{item.name}</b> <small className="hint">{item.mods || "no modifiers"}</small>
                </label>
              ))}
            </div>
          ) : null}
          {tab === "background" ? (
            <>
              <p className="hint">
                Background skills at level 0: {life.bgChosen} of {life.bgAllowed} (EDU DM + 3).
              </p>
              <div className="wizard-5e-skills">
                {life.background.map((skill) => (
                  <label key={skill}>
                    <input type="checkbox" data-tc-bg={skill} checked={Boolean(life.bg?.[skill])} disabled={life.started || (!life.bg?.[skill] && life.bgChosen >= life.bgAllowed)} onChange={(event) => void call("toggleBackground", skill, event.target.checked)} />
                    {skill}
                  </label>
                ))}
              </div>
              <p className="cc-inline">
                Homeworld <input defaultValue={life.homeworld} aria-label="Homeworld" onBlur={(event) => void act({ action: "details", build: { homeworld: event.target.value } })} />
              </p>
            </>
          ) : null}
          {tab === "careers" ? (
            life.task ? (
              <div className="life-question" data-life-task>
                <p>
                  <b>{life.task.title}</b>
                </p>
                {life.task.text ? <p className="life-text">{life.task.text}</p> : null}
                <p className="cc-inline life-choices">
                  {life.task.options.map((option, index) => (
                    <button key={index} type="button" data-tc-option={index + 1} data-life-choice={option.label} disabled={busy || option.disabled} title={option.tip ?? ""} onClick={() => void call("chooseOption", index + 1)}>
                      {option.label}
                      {option.roll ? <small className="hint"> ({option.roll.dice ?? "2d6"}{option.roll.target ? ` ${option.roll.target}+` : ""}{option.roll.mod ? `, DM ${option.roll.mod >= 0 ? "+" : ""}${option.roll.mod}` : ""})</small> : null}
                    </button>
                  ))}
                </p>
              </div>
            ) : life.waiting ? (
              <button type="button" onClick={() => void call("retryRoll")}>
                The dice did not come back: roll again
              </button>
            ) : (
              <p className="hint">{life.done ? "Your careers are done: see Benefits and Skills, then Finish." : "Choose Careers to begin."}</p>
            )
          ) : null}
          {tab === "benefits" ? (
            <>
              <pre className="life-text" data-tc-benefits>{life.benefitsText || "No benefits yet."}</pre>
              {life.benefits
                .filter((item) => item.kind === "item")
                .map((item) => (
                  <label key={item.index} className="cc-inline">
                    {item.name}
                    <select aria-label={`Benefit ${item.index}`} data-tc-benefit={item.index} value={item.item ?? ""} onChange={(event) => void call("chooseBenefitItem", item.index, event.target.value || null)}>
                      <option value="">Choose…</option>
                      {list(item.choices).map((choice) => (
                        <option key={choice.path} value={choice.path}>
                          {choice.name} ({choice.cost}, TL{choice.tl ?? "-"})
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              {list(life.injuries).map((injury, index) => (
                <p key={index} className="cc-inline" data-tc-injury={index + 1}>
                  {injury.stat?.toUpperCase()} -{injury.points}
                  {injury.cover === undefined ? (
                    <button type="button" onClick={() => void call("rollMedical", index + 1)}>
                      Roll medical bills
                    </button>
                  ) : injury.settled ? (
                    <small className="hint">{injury.restored ? "restored" : "lived with"}</small>
                  ) : (
                    <>
                      <small className="hint">
                        employer pays {injury.cover}%, Cr{injury.cost} to you
                      </small>
                      <button type="button" onClick={() => void call("settleMedical", index + 1, true)}>
                        Restore
                      </button>
                      <button type="button" onClick={() => void call("settleMedical", index + 1, false)}>
                        Live with it
                      </button>
                    </>
                  )}
                </p>
              ))}
              <p className="hint">Cash after medical care: Cr{life.finalCash}</p>
            </>
          ) : null}
          {tab === "skills" ? <SkillsPage life={life} busy={busy} call={call} /> : null}
          {tab === "finish" ? <FinishPage life={life} busy={busy} onBuild={(build) => void act({ action: "build", build })} /> : null}
          {problem ? <p className="error">{problem}</p> : null}
        </div>
        <aside className="life-summary" data-life-summary>
          <div className="life-upp">
            <b data-life-upp>{life.upp}</b> <small className="hint">age {life.age}</small>
          </div>
          <pre className="life-text small">{life.careers}</pre>
          <p className="life-skills-text">{life.skillText}</p>
          <ol className="life-log" ref={logRef} data-life-log>
            {list(life.log).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}

function SkillsPage({ life, busy, call }: { life: Life; busy: boolean; call: (fn: string, ...args: unknown[]) => void }) {
  const [connection, setConnection] = useState(["", ""]);
  const pack = life.packages.find((item) => item.name === life.package);
  return (
    <>
      {life.skillWarnings?.length ? <p className="error">{list(life.skillWarnings).join("; ")}</p> : null}
      <h4>Connections</h4>
      <p className="hint">Up to two free skills, each from a link to another Traveller (not Jack-of-all-Trades, never above 3).</p>
      {[1, 2].map((slot) => {
        const done = list(life.connections)[slot - 1];
        return (
          <p key={slot} className="cc-inline" data-tc-connection={slot}>
            {done?.applied ? (
              <small className="hint">
                Connection {slot}: {done.skill}
              </small>
            ) : (
              <>
                <input placeholder="Skill" aria-label={`Connection ${slot} skill`} value={connection[slot - 1]} onChange={(event) => setConnection(connection.map((item, at) => (at === slot - 1 ? event.target.value : item)))} />
                <button type="button" disabled={busy || !life.done || !connection[slot - 1]} onClick={() => call("applyConnection", slot, connection[slot - 1])}>
                  Apply
                </button>
              </>
            )}
          </p>
        );
      })}
      <h4>Skill package</h4>
      <select aria-label="Skill package" value={life.package} onChange={(event) => call("setPackage", event.target.value)}>
        <option value="">None</option>
        {life.packages.map((item) => (
          <option key={item.name}>{item.name}</option>
        ))}
      </select>
      {pack ? (
        <>
          <p className="hint">{pack.text}</p>
          <div className="wizard-5e-skills">
            {pack.skills.map((skill, index) => (
              <label key={index}>
                <input type="checkbox" checked={Boolean(life.packagePicks?.[index + 1])} disabled={life.packagePicks?.[index + 1] === "applied"} onChange={(event) => call("togglePackageSkill", index + 1, event.target.checked)} />
                {skill}
              </label>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={() => call("applyPackage")}>
            Apply the package skills
          </button>
        </>
      ) : null}
    </>
  );
}

// Finish: who they are, the warnings, and starting gear bought with the cash left.
function FinishPage({ life, busy, onBuild }: { life: Life; busy: boolean; onBuild: (build: unknown) => void }) {
  const [form, setForm] = useState({ name: life.name, gender: life.gender, appearance: life.appearance, why: life.why });
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  type Ware = { name: string; cost: string; type: string; tl: number; price: number };
  const shop = useMemo<Ware[]>(() => (catalog() as unknown as Omit<Ware, "price">[]).map((item) => ({ ...item, name: String(item.name), price: Number(String(item.cost).replace(/[^0-9.]/g, "")) || 0 })), []);
  const spent = Object.entries(cart).reduce((sum, [itemName, count]) => sum + (shop.find((item: { name: string }) => item.name === itemName)?.price ?? 0) * count, 0);
  const left = Math.max(0, life.finalCash) - spent;
  const field = (key: keyof typeof form, label: string, area = false) => (
    <label>
      {label}
      {area ? <textarea aria-label={label} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /> : <input aria-label={label} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />}
    </label>
  );
  return (
    <>
      <div className="wizard-5e-grid">
        {field("name", "Traveller name")}
        {field("gender", "Gender")}
        {field("appearance", "Appearance", true)}
        {field("why", "Why travelling", true)}
      </div>
      {list(life.warnings).length ? (
        <ul className="life-warnings">
          {list(life.warnings).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <h4>
        Starting gear <small className="hint">Cash Cr{life.finalCash}, left </small>
        <b data-coin-left={left}>Cr{left}</b>
      </h4>
      <input aria-label="Shop search" placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
      <ul className="life-shop">
        {shop
          .filter((item: { name: string }) => item.name.toLowerCase().includes(search.toLowerCase()))
          .map((item: { name: string; cost: string; tl: number; type: string; price: number }) => (
            <li key={item.name}>
              <span>
                {item.name} <small className="hint">{item.cost} · TL{item.tl} · {item.type}</small>
              </span>
              {cart[item.name] ? <b>x{cart[item.name]}</b> : null}
              <button type="button" aria-label={`Buy ${item.name}`} disabled={item.price > left || !life.done} onClick={() => setCart({ ...cart, [item.name]: (cart[item.name] ?? 0) + 1 })}>
                Buy
              </button>
              {cart[item.name] ? (
                <button type="button" aria-label={`Return ${item.name}`} onClick={() => setCart(Object.fromEntries(Object.entries(cart).map(([key, count]) => [key, key === item.name ? count - 1 : count]).filter(([, count]) => Number(count) > 0)))}>
                  Return
                </button>
              ) : null}
            </li>
          ))}
      </ul>
      <button type="button" data-action="wizard-finish" disabled={busy || !life.done} onClick={() => onBuild({ ...form, buy: Object.entries(cart) })}>
        Create character
      </button>
    </>
  );
}
