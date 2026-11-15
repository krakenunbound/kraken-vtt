import { useState } from "react";
import { MAX_MARKS, SKILLS, STAT_NAMES, STATS, signed, skillCost, trickChoices, tricksForSkill, tricksOf, unspentMarks } from "../../shared/astra/rules.mjs";
import type { ActionCall } from "../../shared/rulesets/types";
import { Icon } from "../ui/icons";
import { num, useSheet, type Row } from "../core/sheet/context";

// Apeira Astra's own parts, where no core part fits (docs/core-ui-design.md
// 4.4, level 3): the Marks panel (the GM's awards, at most six, each teaching a
// trick from the major and minor Paths), a trick's note beside the skill it
// names, the two pickers under the skills (an untrained task, Improve with
// experience) and a skill's total. Everything else on the sheet is the core's,
// laid out by shared/astra/manifest.mjs.

// A skill's task modifier: its level and its characteristic's.
export const astraSkillTotal = (row: Row, _key?: string, data: Row = {}) => signed(num(row.level) + num(((data.characteristics ?? {}) as Record<string, Row>)[String(row.stat)]?.dm));

// The tricks that name this skill, each a small note after it.
export function AstraTrickNotes({ rowKey = "" }: { rowKey?: string }) {
  const { data } = useSheet();
  return (
    <>
      {(tricksForSkill(data, rowKey) as { name: string; text: string }[]).map((trick) => (
        <small key={trick.name} className="astra-trick-note" data-trick-for={rowKey} title={`${trick.name}: ${trick.text}`}>
          ★ {trick.name}
        </small>
      ))}
    </>
  );
}

// Marks: the pips (spent on a trick, unspent), the GM's award and take back, the tricks learned (the GM may forget
// one), and a trick to learn with an unspent Mark (the Paths' tricks from the active Crew Handbook's Path records).
export function AstraMarks() {
  const { data, record, session, editable } = useSheet();
  const [learning, setLearning] = useState("");
  const gm = session.role === "dm";
  const marks = num(data.marks);
  const tricks = tricksOf(data) as { key: string; name: string; path: string; text: string }[];
  const unspent = unspentMarks(data) as number;
  const pathRecords = Object.values(session.records)
    .filter((item) => item.type === "class")
    .map((item) => ({ name: item.name, data: item.data }));
  const choices = (unspent > 0 ? trickChoices(data, pathRecords) : []) as { name: string; path: string; text: string }[];
  const chosen = choices.find((item) => item.name === learning) ?? choices[0];
  return (
    <section className="cc-panel astra-marks" aria-label="Marks" data-marks={marks} data-unspent={unspent}>
      <h4>
        Marks
        <span className="astra-mark-pips" title={`${marks} of ${MAX_MARKS} Marks${unspent ? `, ${unspent} unspent` : ""}`}>
          {Array.from({ length: MAX_MARKS }, (_, index) => (
            <i key={index} className={index < tricks.length ? "on" : index < marks ? "unspent" : ""} />
          ))}
        </span>
        <small className="hint" data-marks-count>
          {marks} of {MAX_MARKS}
          {unspent ? ` · ${unspent} to spend on a trick` : ""}
        </small>
        {gm ? (
          <button type="button" data-action="award-mark" disabled={marks >= MAX_MARKS} title={marks >= MAX_MARKS ? "Six Marks is a whole career" : "Award a Mark: they did something the port will repeat (at most one a session)"} onClick={() => void session.markCharacter(record.id, "award").catch(() => undefined)}>
            Award a Mark
          </button>
        ) : null}
        {gm && unspent > 0 ? (
          <button type="button" className="ghost" data-action="take-mark" title="Take back an unspent Mark" aria-label="Take back an unspent Mark" onClick={() => void session.markCharacter(record.id, "take").catch(() => undefined)}>
            <Icon name="minus" size={14} />
          </button>
        ) : null}
      </h4>
      {tricks.length ? (
        <ul className="astra-tricks">
          {tricks.map((trick) => (
            <li key={trick.key} data-trick={trick.name}>
              <span>
                <b>{trick.name}</b> <small className="hint">{trick.path}</small>
              </span>
              {gm ? (
                <button type="button" className="ghost" aria-label={`Forget ${trick.name}`} title="Forget this trick (its Mark is unspent again)" onClick={() => void session.markCharacter(record.id, "forget", trick.name).catch(() => undefined)}>
                  ×
                </button>
              ) : (
                <span />
              )}
              <p>{trick.text}</p>
            </li>
          ))}
        </ul>
      ) : marks === 0 ? (
        <p className="hint">No Marks yet. The GM awards one when a job is done and the port will repeat the story; each Mark teaches a trick from your Paths.</p>
      ) : null}
      {unspent > 0 && editable ? (
        choices.length ? (
          <div className="astra-learn">
            <select className="cc-field" aria-label="Trick to learn" value={chosen?.name ?? ""} onChange={(event) => setLearning(event.target.value)}>
              {choices.map((item) => (
                <option key={`${item.path}:${item.name}`} value={item.name}>
                  {item.name} ({item.path})
                </option>
              ))}
            </select>
            <button
              type="button"
              data-action="learn-trick"
              disabled={!chosen}
              title="Learn this trick with an unspent Mark"
              onClick={() => {
                if (chosen) void session.markCharacter(record.id, "learn", chosen.name).catch(() => undefined);
                setLearning("");
              }}
            >
              Learn
            </button>
            {chosen ? (
              <p className="hint" data-trick-preview>
                {chosen.text}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="hint">No trick left to learn from {Array.isArray(data.paths) ? data.paths.join(" and ") : "your Paths"} (or the Crew Handbook is not active).</p>
        )
      ) : null}
    </section>
  );
}

// Under the skills: an untrained task (-3), and Improve (spend experience on a skill's next level or a characteristic).
export function AstraSkillPickers({ props }: { props?: Record<string, unknown> }) {
  const { data, record, session, editable, act } = useSheet();
  const [untrained, setUntrained] = useState("");
  const [improving, setImproving] = useState("");
  if (!editable) return null;
  const skills = (data.skills ?? {}) as Record<string, Row>;
  const stats = (data.characteristics ?? {}) as Record<string, Row>;
  const roll = props?.roll as ActionCall;
  return (
    <>
      <p className="cc-inline">
        <select className="cc-field" value={untrained} aria-label="An untrained skill" onChange={(event) => setUntrained(event.target.value)}>
          <option value="">An untrained task (-3)…</option>
          {Object.entries(SKILLS)
            .filter(([key]) => !skills[key])
            .map(([key, [name]]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
        </select>
        <button type="button" disabled={!untrained} onClick={() => act(roll, { key: untrained })}>
          Roll
        </button>
      </p>
      <p className="cc-inline" title="Spend experience: a skill's next level costs that level x 2 (a new skill at 0 costs 1); a characteristic +1 costs 6">
        <select className="cc-field" value={improving} aria-label="Improve" onChange={(event) => setImproving(event.target.value)}>
          <option value="">Improve (spend experience)…</option>
          {Object.entries(SKILLS).map(([key, [name]]) => {
            const next = skills[key] ? num(skills[key].level) + 1 : 0;
            return next <= 4 ? (
              <option key={key} value={`skill:${key}`}>
                {name} {next} ({skillCost(next)})
              </option>
            ) : null;
          })}
          {STATS.map((stat: string) => (
            <option key={stat} value={`stat:${stat}`}>
              {STAT_NAMES[stat as keyof typeof STAT_NAMES]} {num(stats[stat]?.score) + 1} (6)
            </option>
          ))}
        </select>
        <button
          type="button"
          data-action="improve"
          disabled={!improving}
          onClick={() => {
            const [kind, key] = improving.split(":");
            void session.improveCharacter(record.id, kind === "skill" ? { skill: key } : { attribute: key }).catch(() => undefined);
            setImproving("");
          }}
        >
          Improve
        </button>
        <small className="hint">{num(data.exp)} to spend</small>
      </p>
    </>
  );
}
