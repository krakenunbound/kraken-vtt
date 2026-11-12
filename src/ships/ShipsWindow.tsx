import { useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Field } from "../characters/CCSheet";
import { CRITICALS, CRITICAL_WORDS, DESIGNS, RANGES, WEAPONS, signed } from "../../shared/starships/rules.mjs";

// Starships, in the 2d6 games (Traveller, Apeira Astra): the campaign's ships
// down the left, the chosen one's sheet on the right. The GM makes a ship from
// one of Kraken's designs and changes anything; a player takes a station (a
// gun, the helm, sensors) with their own character and fires the gun they man
// at a ship on the tracker. The host works the numbers (shared/starships).

type Row = Record<string, unknown>;
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const STATIONS = ["pilot", "engineer", "sensors", "captain"] as const;

type OpenMaps = (bytes: Uint8Array, name: string) => Promise<unknown>;

export function ShipsWindow({ session, openMaps }: { session: Session; openMaps?: OpenMaps }) {
  const gm = session.role === "dm";
  const ships = Object.values(session.records)
    .filter((record) => record.type === "starship")
    .sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState("");
  const [design, setDesign] = useState(DESIGNS[1].class);
  const [problem, setProblem] = useState("");
  const current = ships.find((ship) => ship.id === selected) ?? ships[0];
  const create = async () => {
    setProblem("");
    try {
      const id = await session.shipAction({ action: "create", name, design });
      setSelected(id);
      setName("");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="ships-window" data-ships>
      <aside className="ships-list">
        <ul>
          {ships.map((ship) => (
            <li key={ship.id}>
              <button type="button" className={ship.id === current?.id ? "active" : ""} data-ship={ship.id} onClick={() => setSelected(ship.id)}>
                <b>{ship.name}</b>
                <small className="hint">
                  {String(ship.data.class ?? "")} · hull {num((ship.data.hull as Row)?.max) - num((ship.data.hull as Row)?.damage)}/{num((ship.data.hull as Row)?.max)}
                </small>
              </button>
            </li>
          ))}
        </ul>
        {ships.length === 0 ? <p className="hint">{gm ? "No ships yet: make one below." : "No ships yet."}</p> : null}
        {gm ? (
          <div className="ships-new">
            <input value={name} placeholder="Ship's name" aria-label="Ship name" onChange={(event) => setName(event.target.value)} />
            <select value={design} aria-label="Ship design" onChange={(event) => setDesign(event.target.value)}>
              {DESIGNS.map((item: { class: string; tons: number }) => (
                <option key={item.class} value={item.class}>
                  {item.class} ({item.tons} tons)
                </option>
              ))}
            </select>
            <button type="button" data-action="ship-create" onClick={() => void create()}>
              New ship
            </button>
            {problem ? <p className="error">{problem}</p> : null}
          </div>
        ) : null}
      </aside>
      {current ? <ShipSheet key={current.id} session={session} ship={current} openMaps={openMaps} /> : null}
    </section>
  );
}

function ShipSheet({ session, ship, openMaps }: { session: Session; ship: TableRecord; openMaps?: OpenMaps }) {
  const gm = session.role === "dm";
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const data = ship.data as Row;
  const hull = (data.hull ?? {}) as Row;
  const crew = (data.crew ?? {}) as Record<string, string>;
  const criticals = (data.criticals ?? {}) as Record<string, number>;
  const [rangeChoice, setRange] = useState("");
  const [targetId, setTargetId] = useState("");
  const [adding, setAdding] = useState("");
  const [problem, setProblem] = useState("");
  const edit = (changes: { path: string; value: unknown }[]) => {
    setProblem("");
    session.shipAction({ action: "edit", id: ship.id, changes }).catch((error) => setProblem(error instanceof Error ? error.message : String(error)));
  };
  const numberAt = (path: string) => (value: string) => edit([{ path, value: Number(value) || 0 }]);
  const characters = Object.values(session.records).filter((record) => record.type === "character");
  // Who may sit in a station: the GM anyone; a player their own characters (and the one already there, to see it).
  const choices = (current: string) => characters.filter((who) => gm || who.owner === me || who.id === current);
  const canSet = (current: string) => gm || !current || characters.find((who) => who.id === current)?.owner === me;
  const entry = session.combat.entries.find((item) => item.recordId === ship.id);
  const targets = session.combat.entries.filter((item) => item.ship && item.id !== entry?.id);
  const target = targets.find((item) => item.id === targetId) ?? targets[0];
  const left = num(hull.max) - num(hull.damage);
  // With both ships' tokens on the map, the range is the map's (unless the GM picks a band).
  const onMap = (recordId?: string | null) => Boolean(recordId) && session.map.tokens.some((token) => token.recordId === recordId);
  const range = rangeChoice || (onMap(ship.id) && onMap(target?.recordId) ? "map" : "Short");
  // The players' ship goes on the tracker as a friend.
  const crewedByPlayers = [...Object.values(crew), ...rows(data.weapons).map(([, weapon]) => String(weapon.gunner ?? ""))].some((id) => Boolean(id) && Boolean(characters.find((who) => who.id === id)?.owner));
  const fire = (key: string) => {
    if (!entry || !target) return;
    setProblem("");
    session.ct("ship-attack", { id: entry.id, weapon: key, targetId: target.id, range });
  };
  const stationSelect = (label: string, path: string, current: string) => (
    <select className="cc-field" value={current} aria-label={label} disabled={!canSet(current)} data-station={path} onChange={(event) => edit([{ path, value: event.target.value }])}>
      <option value="">(empty)</option>
      {choices(current).map((who) => (
        <option key={who.id} value={who.id}>
          {who.name}
        </option>
      ))}
    </select>
  );
  return (
    <article className="cc-panel ship-sheet" data-ship-sheet={ship.id}>
      <header className="cc-row">
        <Field value={ship.name} editable={gm} label="Ship name" className="cc-name" onSave={(value) => edit([{ path: "name", value }])} />
        <span className="hint">
          {String(data.class ?? "")} · {num(data.tons)} tons · TL{num(data.tl)}
        </span>
        <span className="me-spacer" />
        {gm && openMaps ? (
          <button
            type="button"
            data-action="ship-deck-plans"
            title="Its decks as maps, with walls and doors (the same each time: tokens placed on them stay)"
            onClick={() => {
              setProblem("");
              void import("./deckRender")
                .then(({ makeDeckBundle }) => makeDeckBundle({ id: ship.id, name: ship.name, data: ship.data as Record<string, unknown> }))
                .then((made) => openMaps(made.bytes, made.name))
                .catch((error) => setProblem(error instanceof Error ? error.message : String(error)));
            }}
          >
            Deck plans
          </button>
        ) : null}
        {gm && session.map.sceneId && !session.map.tokens.some((token) => token.recordId === ship.id) ? (
          <button type="button" data-action="ship-to-map" title="Its token on the open map (by its tonnage: 1 to 3 squares)" onClick={() => session.placeToken(ship.id)}>
            On the map
          </button>
        ) : null}
        {gm && !entry ? (
          <button type="button" data-action="ship-to-tracker" onClick={() => session.ct("add", { recordId: ship.id, faction: crewedByPlayers ? "friend" : "foe" })}>
            To the tracker
          </button>
        ) : null}
      </header>
      <section className="ship-numbers">
        <div className="ship-hull" title="Hull points: the ship is destroyed at 0">
          <small>Hull</small>
          <span data-ship-stat="hull" style={{ color: left <= 0 ? "#c0392b" : undefined }}>
            {left} / {num(hull.max)}
          </span>
          <span className="ship-bar">
            <span style={{ width: `${Math.max(0, Math.min(100, (left / Math.max(1, num(hull.max))) * 100))}%` }} />
          </span>
          {gm ? (
            <span className="cc-inline">
              Damage <Field value={num(hull.damage)} number editable label="Hull damage" onSave={numberAt("hull.damage")} />
            </span>
          ) : null}
          {left <= 0 ? <b className="error">Destroyed</b> : null}
        </div>
        {[
          ["Armour", "armour", data.armour],
          ["Thrust", "thrust", data.thrust],
          ["Jump", "jump", data.jump],
          ["Sensors", "sensors", data.sensors],
          ["Computer", "computer", data.computer],
        ].map(([label, key, value]) => (
          <label key={String(key)} className="cc-labelled cc-box" data-ship-stat={String(key)}>
            <Field value={num(value)} number editable={gm} label={String(label)} onSave={numberAt(String(key))} />
            <small>{String(label)}</small>
          </label>
        ))}
        <label className="cc-labelled cc-box" title="Sensors and computer, less their criticals: a DM to every attack">
          <span className="cc-value" data-ship-stat="fire">{signed(num(data.fireControl))}</span>
          <small>Fire control</small>
        </label>
      </section>

      <h4>Crew</h4>
      <div className="ship-stations">
        {STATIONS.map((station) => (
          <label key={station} className="cc-inline">
            {station[0].toUpperCase() + station.slice(1)} {stationSelect(`${station} station`, `crew.${station}`, String(crew[station] ?? ""))}
          </label>
        ))}
      </div>

      <h4>
        Weapons{" "}
        {entry ? (
          <small className="hint">
            at{" "}
            <select className="cc-field" value={target?.id ?? ""} aria-label="Target ship" onChange={(event) => setTargetId(event.target.value)}>
              {targets.length === 0 ? <option value="">(no ship to fire at)</option> : null}
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>{" "}
            <select className="cc-field" value={range} aria-label="Range" onChange={(event) => setRange(event.target.value)}>
              <option value="map">By the map</option>
              {(RANGES as [string, number][]).map(([band, dm]) => (
                <option key={band} value={band}>
                  {band} {dm ? signed(dm) : ""}
                </option>
              ))}
            </select>
          </small>
        ) : (
          <small className="hint">put the ship on the tracker to fight</small>
        )}
      </h4>
      <ul className="ship-weapons">
        {rows(data.weapons).map(([key, weapon]) => {
          const gunner = String(weapon.gunner ?? "");
          const mine = gm || characters.find((who) => who.id === gunner)?.owner === me;
          return (
            <li key={key} data-ship-weapon={key} className={weapon.disabled ? "disabled" : ""}>
              <span className="ship-weapon-name">
              <b>{String(weapon.name)}</b>
              <small className="hint">
                {String(weapon.mount ?? "")} · {String(weapon.damage)} · to {String(weapon.range)}
                {num(weapon.dm) ? ` · ${signed(num(weapon.dm))}` : ""}
                {num(weapon.ap) ? ` · AP ${num(weapon.ap)}` : ""}
                {weapon.disabled ? " · disabled" : ""}
              </small>
              </span>
              {stationSelect(`${String(weapon.name)} gunner`, `weapons.${key}.gunner`, gunner)}
              <button type="button" data-action="ship-fire" disabled={!entry || !target || !mine || Boolean(weapon.disabled)} title="2d6 + the gunner's skill and DM + the weapon's DM + fire control + the range, against 8" onClick={() => fire(key)}>
                Fire
              </button>
              {gm ? (
                <>
                  <button type="button" className="ghost" title={weapon.disabled ? "Repaired" : "Disabled"} aria-label={`${String(weapon.name)} disabled`} onClick={() => edit([{ path: `weapons.${key}.disabled`, value: !weapon.disabled }])}>
                    {weapon.disabled ? "Repair" : "Disable"}
                  </button>
                  <button type="button" className="ghost" aria-label={`Remove ${String(weapon.name)}`} onClick={() => edit([{ path: `weapons.${key}`, value: null }])}>
                    ×
                  </button>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
      {gm ? (
        <p className="cc-inline">
          <select className="cc-field" value={adding} aria-label="Add a ship weapon" onChange={(event) => setAdding(event.target.value)}>
            <option value="">Add a weapon…</option>
            {(WEAPONS as unknown[][]).map((row) => (
              <option key={String(row[0])} value={String(row[0])}>
                {String(row[0])} ({String(row[1])}, to {String(row[2])})
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!adding}
            data-action="ship-add-weapon"
            onClick={() => {
              edit([{ path: "weapons.add", value: { name: adding } }]);
              setAdding("");
            }}
          >
            Add
          </button>
        </p>
      ) : null}

      {gm || Object.values(criticals).some((value) => num(value) > 0) ? <h4>Critical hits</h4> : null}
      <ul className="ship-criticals">
        {(CRITICALS as [number, string, string][]).map(([roll, system, label]) =>
          gm || num(criticals[system]) > 0 ? (
            <li key={system} data-critical={system} className={num(criticals[system]) > 0 ? "hit" : ""}>
              <small className="hint">{roll}</small> {label}{" "}
              {gm ? <Field value={num(criticals[system])} number editable label={`${label} severity`} onSave={numberAt(`criticals.${system}`)} /> : <b>{num(criticals[system])}</b>}
              {num(criticals[system]) > 0 ? <small className="hint"> {(CRITICAL_WORDS as Record<string, (n: number) => string>)[system](num(criticals[system]))}</small> : null}
            </li>
          ) : null,
        )}
      </ul>
      <Field value={String(data.notes ?? "")} area editable={gm} label="Ship notes" onSave={(value) => edit([{ path: "notes", value }])} />
      {problem ? <p className="error">{problem}</p> : null}
    </article>
  );
}
