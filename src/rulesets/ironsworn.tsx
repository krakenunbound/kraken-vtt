import { useMemo, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Field } from "../core/fields/Field";
import { ProgressBoxes } from "../core/parts/ProgressBoxes";
import { useSheet } from "../core/sheet/context";
import { FormattedText } from "../books/Records";
import { DEBILITIES, LEGACY, RANK_NAMES, RANKS, TRACK_KINDS, boxes, signed } from "../../shared/ironsworn/rules.mjs";

// Ironsworn's and Starforged's own parts, where no core part fits
// (docs/core-ui-design.md 4.4, level 3): the initiative (or position) button
// in the header, the last move over every tab (its dice, Burn or Keep, its
// choices) and the host's refusal under it, the debilities (impacts), and the
// Moves, Progress and Assets pages. Moves come from the campaign's active
// Reference book: pick one, its option, adds, a track or a foe on the
// tracker, and Roll; the host rolls in front of the table, applies what the
// outcome plainly does and leaves its choices here. The progress tracks draw
// the core's ProgressBoxes. Everything else on the sheet is the core's, laid
// out by shared/ironsworn/manifest.mjs.

type Row = Record<string, unknown>;
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const OUTCOME: Record<string, string> = { strong: "Strong hit", weak: "Weak hit", miss: "Miss" };
// The move a track's progress roll makes.
const PROGRESS_MOVE: Record<string, string> = { vow: "fulfill_your_vow", journey: "reach_your_destination", fight: "end_the_fight", site: "locate_your_objective", expedition: "finish_an_expedition", scene: "finish_the_scene", connection: "forge_a_bond" };

// The sheet's character, who may type, and its game's message to the host: a refusal goes to the sheet's error line
// (the "problem" modifier, which the manifest's own buttons use too).
function useIron() {
  const { record, session, editable, change, setModifier } = useSheet();
  const act: Act = (action, args = {}) => {
    setModifier("problem", "");
    return session.ironsworn(action, record.id, args).catch((error: unknown) => {
      setModifier("problem", error instanceof Error ? error.message : String(error));
      return null;
    });
  };
  return { record, session, editable, act, change };
}

// The header's initiative (Ironsworn) or position (Starforged) button.
export function IronControl() {
  const { record, editable, act } = useIron();
  const sf = record.data.game === "starforged";
  const control = Boolean(record.data.control);
  const controlWord = sf ? (control ? "In control" : "In a bad spot") : control ? "Initiative" : "No initiative";
  return (
    <button type="button" className={`cc-labelled cc-box iron-control${control ? " on" : ""}`} data-action="iron-control" data-control={control ? "1" : "0"} disabled={!editable} title={sf ? "In control or in a bad spot (a fight's position)" : "Who has the initiative in a fight"} onClick={() => void act("control", { on: !control })}>
      <span className="cc-value">{controlWord}</span>
      <small>{sf ? "Position" : "Initiative"}</small>
    </button>
  );
}

// The last move over every tab, and the host's refusal of the last thing asked.
export function IronLastRoll() {
  const iron = useIron();
  return <LastRoll record={iron.record} session={iron.session} editable={iron.editable} act={iron.act} />;
}
export function IronProblem() {
  const { modifiers } = useSheet();
  const problem = String(modifiers.problem ?? "");
  return problem ? <p className="error" data-iron-problem>{problem}</p> : null;
}

// Debilities (Ironsworn) or impacts (Starforged): each a box the host marks.
export function IronDebilities() {
  const { record, editable, act } = useIron();
  const data = record.data as Row;
  const game = data.game === "starforged" ? "starforged" : "classic";
  const sf = game === "starforged";
  const marks = (sf ? data.impacts : data.debilities) as Record<string, boolean> | undefined;
  return (
    <section className="cc-panel iron-debilities" aria-label={sf ? "Impacts" : "Debilities"}>
      <h4>{sf ? "Impacts" : "Debilities"}</h4>
      {(DEBILITIES[game] as { key: string; name: string; group: string }[]).map((item) => (
        <label key={item.key} className="cc-inline" title={item.group}>
          <input type="checkbox" checked={Boolean(marks?.[item.key])} disabled={!editable} data-debility={item.key} onChange={(event) => void act("debility", { key: item.key, on: event.target.checked })} />
          {item.name}
        </label>
      ))}
    </section>
  );
}

// The Moves, Progress and Assets pages.
export function IronMoves() {
  const iron = useIron();
  return <MovesPanel record={iron.record} session={iron.session} editable={iron.editable} act={iron.act} />;
}
export function IronProgress() {
  const iron = useIron();
  return <ProgressPanel record={iron.record} session={iron.session} editable={iron.editable} act={iron.act} change={iron.change} />;
}
export function IronAssets() {
  const iron = useIron();
  return <AssetsPanel record={iron.record} session={iron.session} editable={iron.editable} act={iron.act} change={iron.change} />;
}
// What they carry: one more thing, typed and added.
export function IronCarryLine() {
  const { editable, change } = useIron();
  return editable ? <AddLine placeholder="Something else they carry" onAdd={(text) => change("inventory.add", text)} /> : null;
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
      <input placeholder={placeholder} value={text} data-add-line={action ?? placeholder} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && add()} />
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
