import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { FormattedText } from "../books/Records";
import { DEBILITIES, LEGACY, RANK_NAMES, RANKS, SPREAD, STAT_NAMES, STATS, TRACK_KINDS, boxes, gameOf, signed } from "../../shared/ironsworn/rules.mjs";

// The Ironsworn and Starforged character sheet, in Kraken's sheet style:
// who they are on top, tabs down the right (Main, Moves, Progress, Assets,
// Notes). Moves come from the campaign's active Reference book (the CC BY
// moves): pick one, its option (the stat it rolls), adds, a track or a foe
// on the tracker, and Roll: the host rolls the action and challenge dice in
// front of the table, applies what the outcome plainly does and leaves its
// choices as buttons here; when momentum would do better, Burn or Keep.
// Progress tracks, bonds or legacies, assets bought with experience. The
// host works every number out again (shared/ironsworn/rules.mjs).

type Row = Record<string, unknown>;
const TABS = ["main", "moves", "progress", "assets", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const OUTCOME: Record<string, string> = { strong: "Strong hit", weak: "Weak hit", miss: "Miss" };
// The move a track's progress roll makes.
const PROGRESS_MOVE: Record<string, string> = { vow: "fulfill_your_vow", journey: "reach_your_destination", fight: "end_the_fight", site: "locate_your_objective", expedition: "finish_an_expedition", scene: "finish_the_scene", connection: "forge_a_bond" };

// Ten boxes of four ticks.
export function ProgressBoxes({ ticks, label }: { ticks: number; label?: string }) {
  return (
    <span className="iron-boxes" aria-label={label ?? `${boxes(ticks)} of 10 boxes`} data-ticks={ticks} title={`${ticks} ticks: ${boxes(ticks)} boxes`}>
      {Array.from({ length: 10 }, (_, index) => {
        const fill = Math.max(0, Math.min(4, ticks - index * 4));
        return <span key={index} className={`iron-box fill-${fill}`} />;
      })}
    </span>
  );
}

export function SheetIronsworn({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const [problem, setProblem] = useState("");
  const data = record.data as Row;
  const game = data.game === "starforged" ? "starforged" : "classic";
  const sf = game === "starforged";
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const act = (action: string, args: Record<string, unknown> = {}) => {
    setProblem("");
    return session.ironsworn(action, record.id, args).catch((error: unknown) => {
      setProblem(error instanceof Error ? error.message : String(error));
      return null;
    });
  };
  const stats = (data.stats ?? {}) as Record<string, number>;
  const meters = (data.meters ?? {}) as Record<string, number>;
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const experience = (data.experience ?? {}) as Row;
  const momentum = num(data.momentum);
  const marks = (sf ? data.impacts : data.debilities) as Record<string, boolean> | undefined;
  const control = Boolean(data.control);
  const controlWord = sf ? (control ? "In control" : "In a bad spot") : control ? "Initiative" : "No initiative";

  return (
    <article className="cc-sheet sheet-5e sheet-ironsworn" data-character={record.id} data-ruleset="ironsworn" data-game={game}>
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
              <small>Name</small>
            </label>
            <div className="cc-boxes">
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="momentum" data-momentum={momentum}>
                  {signed(momentum)}
                </span>
                <small>
                  Momentum (max {num(data.momentummax)}, reset {num(data.momentumreset)})
                </small>
              </label>
              <label className="cc-labelled cc-box">
                <span className="cc-value" data-stat="experience">
                  {num(experience.available)} / {num(experience.earned)}
                </span>
                <small>Experience to spend / earned</small>
              </label>
              <button type="button" className={`cc-labelled cc-box iron-control${control ? " on" : ""}`} data-action="iron-control" data-control={control ? "1" : "0"} disabled={!editable} title={sf ? "In control or in a bad spot (a fight's position)" : "Who has the initiative in a fight"} onClick={() => void act("control", { on: !control })}>
                <span className="cc-value">{controlWord}</span>
                <small>{sf ? "Position" : "Initiative"}</small>
              </button>
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

        <LastRoll record={record} session={session} editable={editable} act={act} />
        {problem ? <p className="error" data-iron-problem>{problem}</p> : null}

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <div className="cc-main-grid five-main">
              <section className="cc-panel five-abilities iron-stats" aria-label="Stats">
                {STATS.map((stat: string) => (
                  <div key={stat} className="five-ability" data-stat-row={stat}>
                    <b>{STAT_NAMES[stat as keyof typeof STAT_NAMES]}</b>
                    <button type="button" className="cc-bonus" disabled={!editable} title={`Roll +${stat}: d6 + ${num(stats[stat])} against two d10`} aria-label={`${stat} roll`} data-roll-stat={stat} onClick={() => session.siegeCheck(record.id, stat, 0, false, { kind: "check" })}>
                      {num(stats[stat])}
                    </button>
                  </div>
                ))}
              </section>
              <section className="cc-panel five-defence iron-meters">
                {["health", "spirit", "supply"].map((meter) => (
                  <div key={meter} className="five-big" data-meter={meter}>
                    <small>
                      {titled(meter)}
                      {meter === "supply" ? " (shared)" : ""}
                    </small>
                    <span data-stat={meter}>{num(meters[meter])} / 5</span>
                    {editable ? (
                      <span className="cc-inline">
                        <button type="button" aria-label={`${meter} down`} data-action={`${meter}-down`} onClick={() => void act("adjust", { what: meter, delta: -1 })}>
                          −
                        </button>
                        <button type="button" aria-label={`${meter} up`} data-action={`${meter}-up`} onClick={() => void act("adjust", { what: meter, delta: 1 })}>
                          +
                        </button>
                      </span>
                    ) : null}
                  </div>
                ))}
                <div className="five-big" data-meter="momentum">
                  <small>Momentum</small>
                  <span>{signed(momentum)}</span>
                  {editable ? (
                    <span className="cc-inline">
                      <button type="button" aria-label="momentum down" data-action="momentum-down" onClick={() => void act("adjust", { what: "momentum", delta: -1 })}>
                        −
                      </button>
                      <button type="button" aria-label="momentum up" data-action="momentum-up" onClick={() => void act("adjust", { what: "momentum", delta: 1 })}>
                        +
                      </button>
                      <button type="button" className="ghost" title={`Reset momentum to ${num(data.momentumreset)} (after burning it)`} onClick={() => void act("burn-reset")}>
                        Reset
                      </button>
                    </span>
                  ) : null}
                </div>
              </section>
            </div>
            <section className="cc-panel iron-debilities" aria-label={sf ? "Impacts" : "Debilities"}>
              <h4>{sf ? "Impacts" : "Debilities"}</h4>
              {(DEBILITIES[game] as { key: string; name: string; group: string }[]).map((item) => (
                <label key={item.key} className="cc-inline" title={item.group}>
                  <input type="checkbox" checked={Boolean(marks?.[item.key])} disabled={!editable} data-debility={item.key} onChange={(event) => void act("debility", { key: item.key, on: event.target.checked })} />
                  {item.name}
                </label>
              ))}
            </section>
          </div>
        ) : null}

        {tab === "moves" ? <MovesPanel record={record} session={session} editable={editable} act={act} /> : null}
        {tab === "progress" ? <ProgressPanel record={record} session={session} editable={editable} act={act} change={change} /> : null}
        {tab === "assets" ? <AssetsPanel record={record} session={session} editable={editable} act={act} change={change} /> : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            {sf ? (
              <div className="cc-boxes">
                <label className="cc-labelled">
                  <Field value={String(data.pronouns ?? "")} editable={editable} label="Pronouns" onSave={(value) => change("pronouns", value)} />
                  <small>Pronouns</small>
                </label>
                <label className="cc-labelled">
                  <Field value={String(data.callsign ?? "")} editable={editable} label="Callsign" onSave={(value) => change("callsign", value)} />
                  <small>Callsign</small>
                </label>
              </div>
            ) : null}
            <label className="cc-labelled">
              <Field value={String(data.look ?? "")} editable={editable} label="Look" onSave={(value) => change("look", value)} />
              <small>Look</small>
            </label>
            <label className="cc-labelled">
              <Field value={String(data.background ?? "")} area editable={editable} label={sf ? "Backstory" : "Background"} onSave={(value) => change("background", value)} />
              <small>{sf ? "Backstory" : "Background"}</small>
            </label>
            <h4>What they carry <small className="hint">Ironsworn has no money: wealth is supply; anything special is an asset</small></h4>
            <ul className="five-items">
              {rows(data.inventorylist).map(([key, item]) => (
                <li key={key} data-item={key}>
                  <span>
                    {String(item.name)}
                    {num(item.count) > 1 ? ` ×${num(item.count)}` : ""}
                  </span>
                  {editable ? (
                    <button type="button" className="ghost" aria-label={`Drop ${String(item.name)}`} onClick={() => change(`inventorylist.${key}`, null)}>
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {editable ? <AddLine placeholder="Something else they carry" onAdd={(text) => change("inventory.add", text)} /> : null}
            <label className="cc-labelled">
              <Field value={String(data.notes ?? "")} area editable={editable} label="Notes" onSave={(value) => change("notes", value)} />
              <small>Notes</small>
            </label>
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

// A line typed and added (Enter or the button): its input has no aria-label of its own (it is not a sheet field).
function AddLine({ placeholder, onAdd, action }: { placeholder: string; onAdd: (text: string) => void; action?: string }) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <p className="cc-inline">
      <input placeholder={placeholder} value={text} data-add-line={action ?? placeholder} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && add()} />
      <button type="button" data-action={action ?? "add-line"} disabled={!text.trim()} onClick={add}>
        Add
      </button>
    </p>
  );
}

type Act = (action: string, args?: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

// The last move: its dice and outcome; Burn or Keep while it waits; its choices.
function LastRoll({ record, session, editable, act }: { record: TableRecord; session: Session; editable: boolean; act: Act }) {
  const roll = record.data.lastroll as Row | undefined;
  if (!roll || !roll.move) return null;
  const challenge = Array.isArray(roll.challenge) ? (roll.challenge as number[]) : [];
  const choices = Array.isArray(roll.choices) ? (roll.choices as Row[]) : [];
  const applied = Array.isArray(roll.applied) ? (roll.applied as string[]) : [];
  const foes = session.combat.entries.filter((entry) => entry.iron?.rank && !entry.iron.defeated);
  const tracks = rows(record.data.tracks).filter(([, track]) => !track.done);
  return (
    <section className="cc-panel iron-last" data-last-roll={String(roll.outcome ?? "")} data-pending={roll.pending ? "1" : "0"}>
      <b>{String(roll.move)}</b>{" "}
      {roll.kind === "action" ? (
        <span className="hint">
          d6 {num(roll.die)}
          {roll.cancelled ? " (cancelled)" : ""} + {String(roll.statLabel)} {num(roll.statValue)}
          {num(roll.adds) ? ` ${signed(num(roll.adds))}` : ""} = {num(roll.score)} vs {challenge.join(" and ")}
        </span>
      ) : roll.kind === "progress" ? (
        <span className="hint">
          {String(roll.trackName ?? "")}: {num(roll.score)} progress vs {challenge.join(" and ")}
        </span>
      ) : null}{" "}
      {roll.outcome ? (
        <b className={`iron-outcome ${String(roll.outcome)}`} data-outcome={String(roll.outcome)}>
          {OUTCOME[String(roll.outcome)]}
          {roll.match ? " · match" : ""}
          {roll.burned ? " (momentum burned)" : ""}
        </b>
      ) : null}
      {roll.pending && editable ? (
        <span className="cc-inline">
          <button type="button" data-action="iron-burn" title="Your momentum becomes the action score, then resets" onClick={() => void act("resolve", { burn: true })}>
            Burn momentum ({OUTCOME[String(roll.burnOutcome)]})
          </button>
          <button type="button" data-action="iron-keep" onClick={() => void act("resolve", { burn: false })}>
            Keep the {OUTCOME[String(roll.outcome)].toLowerCase()}
          </button>
        </span>
      ) : null}
      {applied.length ? <p className="hint" data-applied>{applied.join(", ")}</p> : null}
      {!roll.pending && choices.length && editable ? (
        <div className="iron-choices">
          {choices.map((choice, index) => {
            const effects = (choice.effects ?? {}) as Row;
            const needsTrack = Boolean(effects.progress || effects.harm) && !roll.track && !roll.target;
            return (
              <ChoiceButton key={index} index={index} label={String(choice.label)} used={Boolean(choice.used)} needsTrack={needsTrack} tracks={tracks} foes={foes.map((entry) => ({ id: entry.id, name: entry.name }))} act={act} />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
function ChoiceButton({ index, label, used, needsTrack, tracks, foes, act }: { index: number; label: string; used: boolean; needsTrack: boolean; tracks: [string, Row][]; foes: { id: string; name: string }[]; act: Act }) {
  const [where, setWhere] = useState("");
  return (
    <span className="cc-inline">
      {needsTrack ? (
        <select className="cc-field" value={where} onChange={(event) => setWhere(event.target.value)} title="Mark progress on">
          <option value="">on…</option>
          {tracks.map(([key, track]) => (
            <option key={key} value={`track:${key}`}>
              {String(track.name)}
            </option>
          ))}
          {foes.map((foe) => (
            <option key={foe.id} value={`target:${foe.id}`}>
              {foe.name}
            </option>
          ))}
        </select>
      ) : null}
      <button type="button" data-action="iron-choose" data-choice={index} disabled={used || (needsTrack && !where)} onClick={() => void act("choose", { index, ...(where.startsWith("track:") ? { track: where.slice(6) } : where.startsWith("target:") ? { target: where.slice(7) } : {}) })}>
        {used ? "✓ " : ""}
        {label}
      </button>
    </span>
  );
}

// Every move of the game: pick one, its option, adds, what it is made against; Roll.
function MovesPanel({ record, session, editable, act }: { record: TableRecord; session: Session; editable: boolean; act: Act }) {
  const game = record.data.game === "starforged" ? "starforged" : "classic";
  const moves = useMemo(
    () =>
      Object.values(session.records)
        .filter((item) => item.type === "ironmove" && (String(item.data.game ?? game) === game))
        .sort((a, b) => String(a.data.fgCategory ?? "").localeCompare(String(b.data.fgCategory ?? "")) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records, game],
  );
  const [chosen, setChosen] = useState("");
  const [option, setOption] = useState(0);
  const [adds, setAdds] = useState(0);
  const [amount, setAmount] = useState(1);
  const [where, setWhere] = useState("");
  const [vowName, setVowName] = useState("");
  const [vowRank, setVowRank] = useState("dangerous");
  const [busy, setBusy] = useState(false);
  const move = moves.find((item) => item.id === chosen) ?? null;
  const md = (move?.data ?? {}) as Row;
  const options = rows(md.options).map(([, item]) => item);
  const stats = (record.data.stats ?? {}) as Record<string, number>;
  const meters = (record.data.meters ?? {}) as Record<string, number>;
  const valueOf = (roll: string) =>
    roll
      .split("|")
      .map((part) => {
        const [using, name] = part.split(":");
        return using === "stat" ? `${name} ${num(stats[name])}` : using === "condition_meter" ? `${name} ${num(meters[name])}` : name || using;
      })
      .join(" / ");
  const tracks = rows(record.data.tracks).filter(([, track]) => !track.done);
  const foes = session.combat.entries.filter((entry) => entry.iron?.rank && !entry.iron.defeated);
  const progress = md.rolltype === "progress_roll" || md.rolltype === "special_track";
  // A move that marks progress, or any combat move (made against a foe on the tracker).
  const marks = /mark progress|inflict/i.test(`${String(md.strong ?? "")} ${String(md.weak ?? "")}`) || /combat/i.test(String(move?.data.fgCategory ?? ""));
  const categories = [...new Set(moves.map((item) => String(item.data.fgCategory ?? "")))];
  const roll = async () => {
    if (!move) return;
    setBusy(true);
    await act("move", {
      move: move.id,
      option,
      adds,
      ...(md.suffer ? { amount } : {}),
      ...(where.startsWith("track:") ? { track: where.slice(6) } : where.startsWith("target:") ? { target: where.slice(7) } : where ? { track: where } : {}),
      ...(md.key === "swear_an_iron_vow" && vowName.trim() ? { vow: { name: vowName.trim(), rank: vowRank } } : {}),
    });
    setBusy(false);
    setVowName("");
  };
  if (moves.length === 0) return <p className="hint cc-page">No moves yet: the GM makes the {game === "starforged" ? "Starforged" : "Ironsworn"} Reference active (Modules).</p>;
  return (
    <section className="cc-panel cc-page iron-moves" data-tab-page="moves">
      <div className="iron-move-list">
        {categories.map((category) => (
          <div key={category}>
            <h4>{category}</h4>
            {moves
              .filter((item) => String(item.data.fgCategory ?? "") === category)
              .map((item) => (
                <button key={item.id} type="button" className={`iron-move${item.id === chosen ? " on" : ""}`} data-move={String(item.data.key ?? item.name)} onClick={() => (setChosen(item.id), setOption(0), setWhere(""))}>
                  {item.name}
                </button>
              ))}
          </div>
        ))}
      </div>
      {move ? (
        <div className="iron-move-panel" data-move-panel={String(md.key ?? "")}>
          <h4>
            {move.name} <small className="hint">{String(md.rolltype ?? "").replace(/_/g, " ")}</small>
          </h4>
          {typeof md.text === "string" ? <FormattedText text={md.text} /> : null}
          {editable ? (
            <div className="iron-move-roll">
              {md.rolltype === "action_roll" && options.length ? (
                <label>
                  Roll{" "}
                  <select className="cc-field" value={option} data-move-option onChange={(event) => setOption(Number(event.target.value))}>
                    {options.map((item, index) => (
                      <option key={index} value={index}>
                        {String(item.label || "")} (+{valueOf(String(item.roll ?? ""))}){item.method === "highest" ? ", the higher" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {md.rolltype === "action_roll" ? (
                <label>
                  Adds <input type="number" className="cc-field number" value={adds} data-move-adds onChange={(event) => setAdds(Number(event.target.value) || 0)} style={{ width: "3.5rem" }} />
                </label>
              ) : null}
              {md.suffer ? (
                <label>
                  {md.suffer === "momentum" ? "Momentum lost" : md.suffer === "asset" ? "Lost" : titled(String(md.suffer))} -
                  <input type="number" min={0} max={10} className="cc-field number" value={amount} data-move-amount onChange={(event) => setAmount(Number(event.target.value) || 0)} style={{ width: "3.5rem" }} />
                </label>
              ) : null}
              {md.key === "swear_an_iron_vow" ? (
                <>
                  <label>
                    Vow <input placeholder="What do you swear to do?" value={vowName} data-vow-name onChange={(event) => setVowName(event.target.value)} />
                  </label>
                  <select className="cc-field" value={vowRank} data-vow-rank onChange={(event) => setVowRank(event.target.value)}>
                    {(RANKS as string[]).map((rank) => (
                      <option key={rank} value={rank}>
                        {RANK_NAMES[rank as keyof typeof RANK_NAMES]}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {progress || marks || md.key === "reach_a_milestone" || md.key === "forsake_your_vow" ? (
                <label>
                  {progress ? "Against" : "Progress on"}{" "}
                  <select className="cc-field" value={where} data-move-track onChange={(event) => setWhere(event.target.value)}>
                    <option value="">{progress ? "choose a track…" : "(none)"}</option>
                    {tracks.map(([key, track]) => (
                      <option key={key} value={`track:${key}`}>
                        {String(track.name)} ({String(track.rank)}, {boxes(num(track.ticks))}/10)
                      </option>
                    ))}
                    {foes.map((entry) => (
                      <option key={entry.id} value={`target:${entry.id}`}>
                        {entry.name} ({entry.iron?.rank}, {boxes(num(entry.iron?.ticks))}/10)
                      </option>
                    ))}
                    {md.rolltype === "special_track" ? (
                      game === "starforged" ? (
                        (LEGACY as string[]).map((key) => (
                          <option key={key} value={key}>
                            {titled(key)} legacy
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="bonds">Bonds</option>
                          <option value="failure">Failure</option>
                        </>
                      )
                    ) : null}
                  </select>
                </label>
              ) : null}
              <button type="button" data-action="make-move" disabled={busy || (progress && !where)} onClick={() => void roll()}>
                {md.rolltype === "no_roll" ? "Make the move" : "Roll"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="hint">Choose a move.</p>
      )}
    </section>
  );
}

// Vows, journeys, fights, sites, expeditions, connections; bonds (Ironsworn) or legacies (Starforged); Delve's failure track.
function ProgressPanel({ record, session, editable, act, change }: { record: TableRecord; session: Session; editable: boolean; act: Act; change: (path: string, value: unknown) => void }) {
  const data = record.data as Row;
  const game = data.game === "starforged" ? "starforged" : "classic";
  const [name, setName] = useState("");
  const [kind, setKind] = useState("vow");
  const [rank, setRank] = useState("dangerous");
  const moves = Object.values(session.records).filter((item) => item.type === "ironmove" && String(item.data.game ?? game) === game);
  const moveId = (key: string) => moves.find((item) => item.data.key === key)?.id ?? "";
  const bonds = (data.bonds ?? {}) as Row;
  const legacy = (data.legacy ?? {}) as Record<string, Row>;
  return (
    <section className="cc-panel cc-page iron-progress" data-tab-page="progress">
      <ul className="iron-tracks">
        {rows(data.tracks).map(([key, track]) => (
          <li key={key} data-track={key} data-kind={String(track.kind)} className={track.done ? "done" : ""}>
            <div className="cc-inline">
              <b>{String(track.name)}</b>
              <small className="hint">
                {String(track.kind)} · {RANK_NAMES[String(track.rank) as keyof typeof RANK_NAMES] ?? String(track.rank)}
                {track.role ? ` · ${String(track.role)}` : ""}
                {track.done ? ` · ${String(track.done)}` : ""}
                {track.background ? " · background vow" : ""}
              </small>
            </div>
            <ProgressBoxes ticks={num(track.ticks)} />
            {editable ? (
              <span className="cc-inline">
                <button type="button" data-action="track-mark" title="Mark progress (by its rank)" onClick={() => void act("track-mark", { track: key, times: 1 })}>
                  Mark
                </button>
                <button type="button" className="ghost" title="Clear a mark" onClick={() => void act("track-mark", { track: key, times: -1 })}>
                  −
                </button>
                {PROGRESS_MOVE[String(track.kind)] && moveId(PROGRESS_MOVE[String(track.kind)]) && !track.done ? (
                  <button type="button" data-action="track-roll" title="The progress roll: its boxes against the challenge dice" onClick={() => void act("move", { move: moveId(PROGRESS_MOVE[String(track.kind)]), track: key })}>
                    {moves.find((item) => item.data.key === PROGRESS_MOVE[String(track.kind)])?.name}
                  </button>
                ) : null}
                <button type="button" className="ghost" aria-label={`Remove ${String(track.name)}`} onClick={() => void act("track-remove", { track: key })}>
                  ×
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <p className="cc-inline" data-new-track>
          <input placeholder="A new vow, journey, fight..." value={name} data-track-name onChange={(event) => setName(event.target.value)} />
          <select className="cc-field" value={kind} data-track-kind onChange={(event) => setKind(event.target.value)}>
            {(TRACK_KINDS[game] as [string, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select className="cc-field" value={rank} data-track-rank onChange={(event) => setRank(event.target.value)}>
            {(RANKS as string[]).map((value) => (
              <option key={value} value={value}>
                {RANK_NAMES[value as keyof typeof RANK_NAMES]}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-action="track-add"
            disabled={!name.trim()}
            onClick={() => {
              void act("track-add", { name: name.trim(), kind, rank });
              setName("");
            }}
          >
            Add
          </button>
        </p>
      ) : null}
      {game === "classic" ? (
        <>
          <h4>
            Bonds <small className="hint">{boxes(num(bonds.ticks))}/10 boxes · Write Your Epilogue rolls against it</small>
          </h4>
          <ProgressBoxes ticks={num(bonds.ticks)} label="Bonds" />
          <label className="cc-labelled">
            <Field value={String(bonds.list ?? "")} area editable={editable} label="Bonds" onSave={(value) => change("bonds.list", value)} />
            <small>Who and where you are bound to</small>
          </label>
          {editable ? <AddLine placeholder="A new bond (a tick on the track)" action="iron-bond" onAdd={(text) => void act("bond", { name: text })} /> : null}
          <h4>
            Failure <small className="hint">Delve: Learn from Your Failures</small>
          </h4>
          <ProgressBoxes ticks={num((data.failure as Row | undefined)?.ticks)} label="Failure" />
          {editable ? (
            <button type="button" className="ghost" onClick={() => void act("failure", { ticks: 1 })}>
              + a tick
            </button>
          ) : null}
        </>
      ) : (
        <>
          <h4>Legacies <small className="hint">2 experience a box (1 once a track is cleared)</small></h4>
          {(LEGACY as string[]).map((key) => (
            <div key={key} className="cc-inline" data-legacy={key}>
              <b style={{ minWidth: "6rem" }}>{titled(key)}</b>
              <ProgressBoxes ticks={num(legacy[key]?.ticks)} label={`${key} legacy`} />
              {num(legacy[key]?.cleared) ? <small className="hint">cleared ×{num(legacy[key]?.cleared)}</small> : null}
              {editable ? (
                <button type="button" className="ghost" title="Mark a tick" onClick={() => void act("legacy-mark", { track: key, ticks: 1 })}>
                  +
                </button>
              ) : null}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

// The character's assets (abilities marked, a companion's or vehicle's meter) and new ones bought with experience.
function AssetsPanel({ record, session, editable, act, change }: { record: TableRecord; session: Session; editable: boolean; act: Act; change: (path: string, value: unknown) => void }) {
  const data = record.data as Row;
  const game = data.game === "starforged" ? "starforged" : "classic";
  const [pick, setPick] = useState("");
  const available = num((data.experience as Row | undefined)?.available);
  const library = Object.values(session.records)
    .filter((item) => item.type === "ironasset" && String(item.data.game ?? game) === game)
    .sort((a, b) => String(a.data.category).localeCompare(String(b.data.category)) || a.name.localeCompare(b.name));
  return (
    <section className="cc-panel cc-page iron-assets" data-tab-page="assets">
      {rows(data.assets).map(([key, asset]) => {
        const source = library.find((item) => item.id === asset.record || item.data.assetid === asset.assetid);
        const abilities = rows(source?.data.abilities).map(([, ability]) => ability);
        const marked = Array.isArray(asset.abilities) ? (asset.abilities as boolean[]) : [];
        return (
          <div key={key} className="iron-asset" data-asset={key}>
            <h4>
              {String(asset.name)} <small className="hint">{String(asset.category ?? "")}</small>
            </h4>
            {source?.data.fieldlabel !== undefined ? (
              <label className="cc-labelled">
                <Field value={String((asset.fields as Row | undefined)?.name ?? "")} editable={editable} label={`${String(asset.name)} ${String(source?.data.fieldlabel ?? "name")}`} onSave={(value) => change(`assets.${key}.fields.name`, value)} />
                <small>{titled(String(source?.data.fieldlabel ?? "name"))}</small>
              </label>
            ) : null}
            <ol>
              {abilities.map((ability, index) => (
                <li key={index} className={marked[index] ? "on" : ""} data-ability={index}>
                  <span>{marked[index] ? "◆ " : "◇ "}</span>
                  {ability.name ? <b>{String(ability.name)}: </b> : null}
                  {String(ability.text ?? "")}
                  {!marked[index] && editable ? (
                    <button type="button" className="ghost" data-action="iron-upgrade" disabled={available < 2} title="Advance: 2 experience" onClick={() => void act("advance", { upgrade: key, ability: index })}>
                      Upgrade (2)
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
            {asset.max ? (
              <p className="cc-inline" data-asset-meter={num(asset.meter)}>
                {titled(String(asset.label ?? "health"))} {num(asset.meter)} / {num(asset.max)}
                {editable ? (
                  <>
                    <button type="button" aria-label={`${String(asset.name)} down`} onClick={() => void act("asset-meter", { asset: key, delta: -1 })}>
                      −
                    </button>
                    <button type="button" aria-label={`${String(asset.name)} up`} onClick={() => void act("asset-meter", { asset: key, delta: 1 })}>
                      +
                    </button>
                  </>
                ) : null}
                {Object.entries((asset.marks ?? {}) as Record<string, boolean>).map(([mark, on]) => (
                  <label key={mark} className="cc-inline">
                    <input type="checkbox" checked={on} disabled={!editable} onChange={(event) => change(`assets.${key}.marks.${mark}`, event.target.checked)} />
                    {mark}
                  </label>
                ))}
              </p>
            ) : null}
          </div>
        );
      })}
      {editable ? (
        <p className="cc-inline">
          <select className="cc-field" value={pick} data-asset-pick onChange={(event) => setPick(event.target.value)}>
            <option value="">A new asset (Advance: 3 experience)…</option>
            {library.map((item) => (
              <option key={item.id} value={item.id}>
                {String(item.data.category)}: {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-action="iron-advance"
            disabled={!pick || available < 3}
            onClick={() => {
              void act("advance", { asset: pick });
              setPick("");
            }}
          >
            Advance
          </button>
          <small className="hint">{available} to spend</small>
        </p>
      ) : null}
    </section>
  );
}

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
