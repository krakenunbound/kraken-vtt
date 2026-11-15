import { useState } from "react";
import * as bk from "../../shared/bookkeeping/bookkeeping.mjs";
import { parseSpell } from "../../shared/actions/parse.mjs";
import { rulesetOfRecord } from "../../shared/rulesets/registry.mjs";
import type { BookkeepingSpec } from "../../shared/rulesets/types";
import { useSheet, type Row } from "../core/sheet/context";
import { ACTION_DRAG } from "../effects/drops";
import { Icon } from "../ui/icons";
import { RestButtons } from "./RestButtons";
import "./bookkeeping.css";

// The sheet's Supplies (a core part, placed on the inventory's tab): what bookkeeping counts for
// this character, worked out from its inventory with the game's declaration
// (shared/<id>/bookkeeping.mjs): the load as a meter with its level and penalty, containers and
// their capacity, each launcher's ammunition (and what to pick up after a fight), consumables to
// use (or drag onto a creature), rations and water, light from the pack, exhaustion, the rests.
// Every button goes to the host (electron/bookkeeping.cjs), as kraken_bookkeeping and kraken_rest do.

type Item = { name?: string; count?: number; magazine?: number; loaded?: number; damage?: string; type?: string; location?: string };
const LIGHTS: [string, string, string][] = [
  ["torch", "Light a torch", "torch"],
  ["lantern", "Light the lantern (a flask of oil)", "lantern"],
  ["lamp", "Light the lamp (a flask of oil)", "lamp"],
  ["candle", "Light a candle", "candle"],
  ["flare", "Light a flare", "flare"],
  ["glowstick", "Crack a glowstick", "glowstick"],
  ["flashlight", "Switch on the hand torch", "flashlight"],
];

export function Supplies() {
  const sheet = useSheet();
  const { record, session, editable, gm } = sheet;
  const data = sheet.data;
  const decl = (rulesetOfRecord(data.ruleset)?.bookkeeping ?? null) as BookkeepingSpec | null;
  const switches = bk.switchesOf(session.options);
  const [status, setStatus] = useState("");
  if (!decl) return null;
  const act = (action: string, args: Record<string, unknown> = {}) =>
    void session
      .bookkeeping(record.id, action, args)
      .then(() => setStatus(""))
      .catch((error: unknown) => setStatus(error instanceof Error ? error.message : String(error)));
  const rows = bk.rowsOf(data) as [string, Item & Row][];
  const load = decl.encumbrance ? bk.encumbranceOf(decl, data, switches) : null;
  const containers = load?.containers ?? [];
  const launchers = decl.ammo && switches.ammo ? rows.flatMap(([key, row]) => {
    const kind = bk.ammoKindOf(decl, row);
    if (!kind || !(String(row.damage ?? "").trim() || /weapon/i.test(String(row.type ?? "")))) return [];
    const left = bk.ammoStacks(decl, data, kind, key).reduce((sum: number, [, item]: [string, Row]) => sum + bk.quantity(item), 0);
    return [{ key, name: String(row.name ?? ""), kind, left, magazine: Number(row.magazine) || 0, loaded: row.loaded === undefined ? Number(row.magazine) || 0 : Number(row.loaded) }];
  }) : [];
  const back = decl.ammo ? bk.recoverable(decl, data).filter((item: { back: number }) => item.back > 0) : [];
  const usable = decl.consumables && switches.consumables ? rows.flatMap(([key, row]) => {
    const info = bk.consumableOf(decl, row, parseSpell);
    return info ? [{ key, name: String(row.name ?? ""), info }] : [];
  }) : [];
  const food = decl.rations && switches.rations ? bk.supplies(decl, data) : null;
  const lights = decl.light && switches.light ? LIGHTS.map(([preset, label, icon]) => ({ preset, label, icon, found: bk.lightFrom(decl, data, preset) })).filter((item) => item.found && !item.found.missing) : [];
  const packs = rows.filter(([, row]) => bk.packContents(row).length > 0);
  const exhaustion = decl.exhaustion ? Math.max(0, Number(data[decl.exhaustion.path]) || 0) : 0;
  const empty = !load && !launchers.length && !back.length && !usable.length && !food && !lights.length && !packs.length && !decl.rest;
  if (empty) return null;
  return (
    <section className="cc-panel supplies" data-part="supplies" aria-label="Supplies">
      <h4>
        <Icon name="bag" size={14} /> Supplies
      </h4>
      {load ? <LoadMeter load={load} /> : null}
      {containers.length ? (
        <ul className="supplies-boxes" aria-label="Containers">
          {containers.map((box: { key: string; name: string; capacity: number; used: number; weightless: boolean; over: boolean; items: string[] }) => (
            <li key={box.key} data-container={box.key}>
              <span>
                {box.name}
                {box.weightless ? <small className="hint"> (its contents weigh nothing)</small> : null}
              </span>
              {box.capacity > 0 ? <meter min={0} max={box.capacity} high={box.capacity * 0.9} optimum={0} value={box.used} aria-label={`${box.name}: ${box.used} of ${box.capacity} ${load?.unit ?? ""}`} /> : null}
              <small className={box.over ? "supplies-warn" : "hint"}>
                {box.used} / {box.capacity} {load?.unit}
                {box.over ? ": too full" : ""}
              </small>
            </li>
          ))}
          {editable ? <PackInto rows={rows} containers={containers} act={act} /> : null}
        </ul>
      ) : null}
      {launchers.length || back.length ? (
        <div className="supplies-row" aria-label="Ammunition">
          <Icon name="arrow" size={14} title="Ammunition" />
          {launchers.map((item) => (
            <span key={item.key} className={item.magazine ? (item.loaded <= 0 ? "supplies-warn" : "") : item.left <= (decl.ammo ? (decl.ammo.low ?? 5) : 5) ? "supplies-warn" : ""} data-ammo={item.key} title={item.magazine ? `${item.loaded} of ${item.magazine} rounds in the magazine, ${item.left} spare magazines` : `${item.left} ${item.kind.label} to fire`}>
              {item.name}: {item.magazine ? `${item.loaded}/${item.magazine}, ${item.left} spare` : `${item.left} ${item.kind.label}`}
            </span>
          ))}
          {back.length && editable ? (
            <button type="button" className="supplies-act" data-action="recover-ammo" onClick={() => act("recover")} title="Pick up what can be found after the fight">
              Recover {back.map((item: { back: number; name: string }) => `${item.back} ${item.name}`).join(", ")}
            </button>
          ) : null}
        </div>
      ) : null}
      {usable.length ? (
        <ul className="supplies-use" aria-label="Consumables">
          {usable.map((item) => (
            <li
              key={item.key}
              data-consumable={item.key}
              draggable={editable}
              title={editable ? "Use it, or drag it onto a creature to use it on them" : undefined}
              onDragStart={(event) => {
                event.dataTransfer.setData(ACTION_DRAG, JSON.stringify({ kind: "use", recordId: record.id, item: item.key }));
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <span>
                {item.name} <small className="hint">{item.info.field === "count" ? `x${item.info.left}` : `${item.info.left} ${item.info.field}`}</small>
              </span>
              {editable ? (
                <button type="button" className="icon-button" data-action="use-item" disabled={item.info.left <= 0} onClick={() => act("use", { item: item.key })} aria-label={`Use ${item.name}`} title={item.info.heal ? `Use: heals ${item.info.heal.dice}${item.info.heal.bonus ? `+${item.info.heal.bonus}` : ""}` : "Use one"}>
                  <Icon name="flask" size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {food ? (
        <div className="supplies-row" aria-label="Rations and water">
          <Icon name="ration" size={14} title="Rations and water" />
          <span className={food.food <= 0 ? "supplies-warn" : ""} data-rations={food.food}>
            Food {food.food} day{food.food === 1 ? "" : "s"}
          </span>
          {food.water !== null ? (
            <span className={food.water <= 0 ? "supplies-warn" : ""} data-water={food.water}>
              Water {food.water} day{food.water === 1 ? "" : "s"}
            </span>
          ) : null}
          {food.hungry > 0 ? <span className="supplies-warn">{food.hungry} day{food.hungry === 1 ? "" : "s"} without food</span> : null}
          {food.thirsty > 0 ? <span className="supplies-warn">{food.thirsty} day{food.thirsty === 1 ? "" : "s"} without water</span> : null}
          {editable ? (
            <>
              <button type="button" className="icon-button" data-action="eat" onClick={() => act("eat")} aria-label="Eat today's ration" title="Eat and drink for today (once a day; a long rest does it too)">
                <Icon name="ration" size={14} />
              </button>
              {food.skins ? (
                <button type="button" className="icon-button" data-action="refill" onClick={() => act("refill")} aria-label="Fill the waterskins" title="Fill every waterskin (a stream, a well, a town)">
                  <Icon name="import" size={14} />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {lights.length && editable ? (
        <div className="supplies-row" aria-label="Light">
          <Icon name="flame" size={14} title="Light from the pack" />
          {lights.map((item) => (
            <button key={item.preset} type="button" className="supplies-act" data-action={`light-${item.preset}`} onClick={() => act("light", { preset: item.preset })} title={`${item.label}: on this character's token`}>
              {item.label.replace(/ \(.*\)$/, "")}
            </button>
          ))}
        </div>
      ) : null}
      {packs.length && editable ? (
        <div className="supplies-row" aria-label="Packs">
          <Icon name="package" size={14} title="Packs" />
          {packs.map(([key, row]) => (
            <button key={key} type="button" className="supplies-act" data-action="unpack" onClick={() => act("unpack", { item: key })} title="Take everything out of it onto the list">
              Unpack {String(row.name)}
            </button>
          ))}
        </div>
      ) : null}
      {decl.exhaustion ? (
        <div className="supplies-row" aria-label="Exhaustion" title={decl.exhaustion.text}>
          <Icon name="tired" size={14} title="Exhaustion" />
          <span className={exhaustion > 0 ? "supplies-warn" : ""} data-exhaustion={exhaustion}>
            Exhaustion {exhaustion}
            {exhaustion > 0 ? ` (d20 tests -${exhaustion * 2}, Speed -${exhaustion * 5} ft.)` : ""}
          </span>
          {gm ? (
            <>
              <button type="button" className="icon-button" data-action="exhaustion-down" disabled={exhaustion <= 0} onClick={() => act("exhaustion", { amount: -1 })} aria-label="One exhaustion level less" title="One level less">
                <Icon name="minus" size={14} />
              </button>
              <button type="button" className="icon-button" data-action="exhaustion-up" onClick={() => act("exhaustion", { amount: 1 })} aria-label="One exhaustion level more" title="One level more">
                <Icon name="plus" size={14} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {decl.rest && editable ? <RestButtons session={session} recordId={record.id} rests={decl.rest} hitDice={decl.rest.short?.hitDice ? Math.max(0, (Number(data.hitdice && (data.hitdice as Row).total) || 0) - (Number(data.hitdice && (data.hitdice as Row).used) || 0)) : null} onError={setStatus} /> : null}
      <p className="supplies-status" role="status">
        {status}
      </p>
    </section>
  );
}

// The load: a meter of what is carried against the most, its level, the penalty and the speed it leaves.
function LoadMeter({ load }: { load: NonNullable<ReturnType<typeof bk.encumbranceOf>> }) {
  const first = load.levels[0]?.at ?? load.max;
  const max = Math.max(load.max || 0, load.used, 1);
  const tone = load.off ? "" : (load.level?.tone ?? "");
  return (
    <div className={`supplies-load ${tone}`} data-load={load.level?.id ?? ""} data-load-used={load.used}>
      <label>
        <b>{load.label}</b>
        <meter min={0} max={max} low={Number.isFinite(first) ? first : max} high={Number.isFinite(first) ? Math.min(max, Math.max(first, max * 0.85)) : max} optimum={0} value={load.used} />
        <span>
          {load.used} / {load.max || "-"} {load.unit}
          {load.coins ? <small className="hint"> (coins {load.coins})</small> : null}
        </span>
      </label>
      <small className={tone === "bad" ? "supplies-warn" : "hint"}>
        {load.off ? "Not counted: the GM has switched encumbrance off." : load.level?.label}
        {!load.off && load.level?.speed !== null && load.level?.speed !== undefined && load.level.base ? ` · speed ${load.level.base} to ${load.level.speed}` : ""}
        {!load.off && load.level?.text ? ` · ${load.level.text}` : ""}
        {load.note ? ` ${load.note}` : ""}
      </small>
    </div>
  );
}

// An item put into a container (FG's location), or taken out.
function PackInto({ rows, containers, act }: { rows: [string, Item & Row][]; containers: { key: string; name: string }[]; act: (action: string, args: Record<string, unknown>) => void }) {
  const [item, setItem] = useState("");
  const [into, setInto] = useState("");
  const boxes = new Set(containers.map((box) => box.key));
  const choices = rows.filter(([key]) => !boxes.has(key));
  return (
    <li className="supplies-pack">
      <select aria-label="Item to put away" value={item} onChange={(event) => setItem(event.target.value)}>
        <option value="">Put away…</option>
        {choices.map(([key, row]) => (
          <option key={key} value={key}>
            {String(row.name ?? "")}
            {row.location ? ` (in ${row.location})` : ""}
          </option>
        ))}
      </select>
      <select aria-label="Into" value={into} onChange={(event) => setInto(event.target.value)}>
        <option value="">(carried loose)</option>
        {containers.map((box) => (
          <option key={box.key} value={box.key}>
            {box.name}
          </option>
        ))}
      </select>
      <button type="button" className="icon-button" data-action="pack" disabled={!item} onClick={() => act("pack", { item, into })} aria-label="Put it there" title="Put it there">
        <Icon name="accept" size={14} />
      </button>
    </li>
  );
}
