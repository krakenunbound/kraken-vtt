import { useState } from "react";
import type { Session } from "../session/useSession";
import { ACTIONS, EFFECTS, HEAT_EXPOSURE, PLANS, POSITIONS, titled } from "../../shared/forged/rules.mjs";
import { ClockFace } from "../notes/ClocksWindow";

// Forged in the Dark has no initiative: the Combat window is the Score panel.
// The GM sets the phase (free play, the score, downtime), the position and
// effect every action roll uses (risky / standard by default), the target and
// its Tier, the plan and its detail, and rolls the engagement (1d for luck,
// +/- a die for each major advantage and disadvantage: its result sets the
// starting position); a fortune roll; a group action; then downtime: payoff,
// heat (the wanted level at 9), the entanglement roll, the downtime phase's
// start and end. Every seat sees the panel and the clocks; a player rolls
// their own scoundrel's actions here or from the sheet.

export function ScorePanel({ session }: { session: Session }) {
  const gm = session.role === "dm";
  const score = session.clocks.score;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const scoundrels = Object.values(session.records).filter((record) => record.type === "character" && record.data.ruleset === "forged");
  const mine = scoundrels.filter((record) => gm || record.owner === me);
  const [who, setWho] = useState("");
  const [action, setAction] = useState("prowl");
  const [advantages, setAdvantages] = useState(0);
  const [disadvantages, setDisadvantages] = useState(0);
  const [fortuneDice, setFortuneDice] = useState(1);
  const [fortuneLabel, setFortuneLabel] = useState("");
  const [coin, setCoin] = useState(4);
  const [quiet, setQuiet] = useState(false);
  const [tithe, setTithe] = useState(false);
  const [exposure, setExposure] = useState(2);
  const [highProfile, setHighProfile] = useState(false);
  const [hostileTurf, setHostileTurf] = useState(false);
  const [killing, setKilling] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [clock, setClock] = useState("");
  const set = (patch: Record<string, unknown>) => session.clocksOp({ action: "score", patch });
  const crewAct = (name: string, args: Record<string, unknown> = {}) => session.forgedAction("", name, args);
  const roller = mine.find((record) => record.id === who) ?? mine[0];
  const shownClocks = session.clocks.clocks.filter((item) => !item.locked);
  const crew = (session.records.party?.data?.crew ?? null) as { name?: string; heat?: number; wanted?: number; tier?: number; rep?: number; coin?: number } | null;

  return (
    <section className="score-panel" data-score-phase={score.phase} data-position={score.position} data-effect={score.effect}>
      <header className="score-head">
        <div className="score-phase" role="group" aria-label="Phase">
          {(["free", "score", "downtime"] as const).map((phase) => (
            <button key={phase} type="button" className={score.phase === phase ? "active" : ""} data-phase={phase} disabled={!gm} onClick={() => set({ phase })}>
              {phase === "free" ? "Free play" : phase === "score" ? "The score" : "Downtime"}
            </button>
          ))}
        </div>
        {crew ? (
          <small className="hint" data-crew-line>
            {crew.name}: Tier {crew.tier ?? 0}, rep {crew.rep ?? 0}, heat {crew.heat ?? 0}/9, wanted {crew.wanted ?? 0}, coin {crew.coin ?? 0}
          </small>
        ) : (
          <small className="hint">No crew yet: make one on the party sheet's Crew tab.</small>
        )}
      </header>

      <div className="score-pe">
        <label>
          <small>Position</small>
          <select aria-label="Position" value={score.position} disabled={!gm} onChange={(event) => set({ position: event.target.value })}>
            {POSITIONS.map((item: string) => (
              <option key={item} value={item}>
                {titled(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <small>Effect</small>
          <select aria-label="Effect" value={score.effect} disabled={!gm} onChange={(event) => set({ effect: event.target.value })}>
            {EFFECTS.map((item: string) => (
              <option key={item} value={item}>
                {titled(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          <small>Target</small>
          <input aria-label="Target" defaultValue={score.target} key={`t${score.target}`} disabled={!gm} onBlur={(event) => event.target.value !== score.target && set({ target: event.target.value })} />
        </label>
        <label>
          <small>Tier</small>
          <input aria-label="Target Tier" type="number" min={0} max={6} value={score.targetTier} disabled={!gm} onChange={(event) => set({ targetTier: Number(event.target.value) || 0 })} style={{ width: "3.2rem" }} />
        </label>
      </div>

      <div className="score-plan">
        <label>
          <small>Plan</small>
          <select aria-label="Plan" value={score.plan} disabled={!gm} onChange={(event) => set({ plan: event.target.value })}>
            <option value="">(none yet)</option>
            {Object.entries(PLANS).map(([key, plan]) => (
              <option key={key} value={key} title={(plan as { words: string }).words}>
                {(plan as { name: string }).name}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          <small>{score.plan ? (PLANS as Record<string, { detail: string }>)[score.plan]?.detail : "Detail"}</small>
          <input aria-label="Plan detail" defaultValue={score.detail} key={`d${score.detail}`} disabled={!gm} onBlur={(event) => event.target.value !== score.detail && set({ detail: event.target.value })} />
        </label>
      </div>

      {gm ? (
        <div className="score-row" aria-label="Engagement roll">
          <b>Engagement</b>
          <label>
            +<input type="number" min={0} max={6} aria-label="Major advantages" value={advantages} onChange={(event) => setAdvantages(Number(event.target.value) || 0)} style={{ width: "3rem" }} />
          </label>
          <label>
            −<input type="number" min={0} max={6} aria-label="Major disadvantages" value={disadvantages} onChange={(event) => setDisadvantages(Number(event.target.value) || 0)} style={{ width: "3rem" }} />
          </label>
          <button type="button" data-action="engagement" title="1d for sheer luck, +1d a major advantage, -1d a disadvantage: the result sets the starting position" onClick={() => crewAct("engagement", { advantages, disadvantages, plan: score.plan, detail: score.detail, target: score.target, targetTier: score.targetTier })}>
            Roll {Math.max(0, 1 + advantages - disadvantages)}d
          </button>
          {score.engagement ? (
            <small data-engagement={score.engagement.result}>
              {titled(score.engagement.result)} ({score.engagement.highest}): {titled(score.engagement.position)}
            </small>
          ) : null}
        </div>
      ) : score.engagement ? (
        <p className="hint" data-engagement={score.engagement.result}>
          Engagement: {titled(score.engagement.result)} ({score.engagement.highest}), a {score.engagement.position} start.
        </p>
      ) : null}

      {mine.length ? (
        <div className="score-row" aria-label="Action roll">
          <b>Action roll</b>
          {mine.length > 1 ? (
            <select aria-label="Scoundrel" value={roller?.id ?? ""} onChange={(event) => setWho(event.target.value)}>
              {mine.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.name}
                </option>
              ))}
            </select>
          ) : (
            <span>{roller?.name}</span>
          )}
          <select aria-label="Action" value={action} onChange={(event) => setAction(event.target.value)}>
            {ACTIONS.map((item: string) => (
              <option key={item} value={item}>
                {titled(item)} {Number((roller?.data.actions as Record<string, number> | undefined)?.[item] ?? 0)}
              </option>
            ))}
          </select>
          <select aria-label="Tick clock" value={clock} onChange={(event) => setClock(event.target.value)} title="A success ticks this clock by the effect">
            <option value="">No clock</option>
            {shownClocks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button type="button" data-action="score-roll" disabled={!roller} onClick={() => roller && session.forgedAction(roller.id, "action-roll", { action, ...(clock ? { clock } : {}) })}>
            Roll ({titled(score.position)} / {titled(score.effect)})
          </button>
          <span className="cc-inline" title="A resistance roll: the attribute's dice, 6 stress less the highest">
            <small>Resist:</small>
            {(["insight", "prowess", "resolve"] as const).map((attribute) => (
              <button key={attribute} type="button" data-action={`score-resist-${attribute}`} disabled={!roller} onClick={() => roller && session.forgedAction(roller.id, "resist", { attribute })}>
                {titled(attribute)} {Number((roller?.data.attributes as Record<string, number> | undefined)?.[attribute] ?? 0)}
              </button>
            ))}
          </span>
        </div>
      ) : null}

      {gm ? (
        <>
          <div className="score-row" aria-label="Fortune roll">
            <b>Fortune</b>
            <input aria-label="Fortune label" placeholder="What is uncertain (a faction's move, information)" value={fortuneLabel} onChange={(event) => setFortuneLabel(event.target.value)} />
            <input type="number" min={0} max={8} aria-label="Fortune dice" value={fortuneDice} onChange={(event) => setFortuneDice(Number(event.target.value) || 0)} style={{ width: "3rem" }} />
            <button type="button" data-action="fortune" onClick={() => crewAct("fortune", { dice: fortuneDice, label: fortuneLabel })}>
              Roll
            </button>
          </div>
          {scoundrels.length > 1 ? (
            <div className="score-row" aria-label="Group action">
              <b>Group</b>
              <select aria-label="Group leader" value={who || scoundrels[0].id} onChange={(event) => setWho(event.target.value)}>
                {scoundrels.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name} leads
                  </option>
                ))}
              </select>
              {scoundrels.map((record) => (
                <label key={record.id} className="inline-check">
                  <input type="checkbox" checked={members.includes(record.id)} onChange={(event) => setMembers(event.target.checked ? [...members, record.id] : members.filter((id) => id !== record.id))} /> {record.name}
                </label>
              ))}
              <button type="button" data-action="group" onClick={() => crewAct("group", { leader: who || scoundrels[0].id, members, action, ...(clock ? { clock } : {}) })}>
                {titled(action)} together
              </button>
            </div>
          ) : null}
          <div className="score-row" aria-label="Payoff">
            <b>Payoff</b>
            <input type="number" min={0} max={20} aria-label="Payoff coin" value={coin} onChange={(event) => setCoin(Number(event.target.value) || 0)} style={{ width: "3.2rem" }} /> coin
            <label className="inline-check">
              <input type="checkbox" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} /> Kept quiet (no rep)
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={tithe} onChange={(event) => setTithe(event.target.checked)} /> Tithe
            </label>
            <button type="button" data-action="payoff" disabled={!crew} onClick={() => crewAct("payoff", { coin, quiet, tithe, targetTier: score.targetTier })}>
              Pay off
            </button>
          </div>
          <div className="score-row" aria-label="Heat">
            <b>Heat</b>
            <select aria-label="Exposure" value={exposure} onChange={(event) => setExposure(Number(event.target.value))}>
              {Object.entries(HEAT_EXPOSURE).map(([amount, words]) => (
                <option key={amount} value={amount}>
                  {amount}: {String(words)}
                </option>
              ))}
            </select>
            <label className="inline-check">
              <input type="checkbox" checked={highProfile} onChange={(event) => setHighProfile(event.target.checked)} /> High-profile
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={hostileTurf} onChange={(event) => setHostileTurf(event.target.checked)} /> Hostile turf
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={killing} onChange={(event) => setKilling(event.target.checked)} /> Killing
            </label>
            <button type="button" data-action="heat" disabled={!crew} onClick={() => crewAct("heat", { exposure, highProfile, hostileTurf, killing })}>
              Add heat
            </button>
            <button type="button" data-action="entanglement" disabled={!crew} title="The heat column, dice equal to the wanted level" onClick={() => crewAct("entanglement")}>
              Entanglement
            </button>
          </div>
          <div className="score-row" aria-label="Downtime">
            <b>Downtime</b>
            <button type="button" data-action="downtime-start" title="Two activities each, special armor back, cohorts heal, claims that earn pay out" onClick={() => crewAct("downtime-start")}>
              Begin downtime
            </button>
            <button type="button" data-action="downtime-end" title="Ignored vices cost stress equal to trauma; back to free play" onClick={() => crewAct("downtime-end")}>
              End downtime
            </button>
          </div>
        </>
      ) : null}

      {session.clocks.clocks.length ? (
        <div className="score-clocks">
          {session.clocks.clocks.map((item) => (
            <div key={item.id} className="score-clock" data-clock={item.name} title={`${item.name}: ${item.filled}/${item.segments}`}>
              <ClockFace clock={item} size={44} />
              <small>{item.name}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint">No clocks on the table{gm ? ": the Clocks window makes them" : ""}.</p>
      )}
    </section>
  );
}
