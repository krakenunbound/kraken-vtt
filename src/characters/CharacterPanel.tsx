import { Icon } from "../ui/icons";
import { useEffect, useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { ArtPicker, Picture } from "./ArtPicker";
import { Wizard } from "./Wizard";

// SIEGE character sheet (Castles & Crusades on the SIEGE engine). The host
// derives every number (shared/siege/engine.mjs); the sheet shows them and
// sends checks to the host to roll.

const STATS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;
const SHORT: Record<(typeof STATS)[number], string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

type Row = Record<string, unknown>;

function rows(node: unknown): Row[] {
  if (!node || typeof node !== "object") return [];
  return Object.values(node as Record<string, unknown>).filter((value): value is Row => Boolean(value) && typeof value === "object");
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function field(data: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Row)[key] : undefined), data);
}

const RANGED = /\b(bow|crossbow|sling|dart|javelin|blowgun)\b/i;

// The character sheet, as FG lays one out: the portrait and who they are,
// a ribbon of vitals, the attributes as tiles that roll a check, and tabs for
// combat, gear and powers.
function Sheet({ record, session }: { record: TableRecord; session: Session }) {
  const [cl, setCl] = useState(0);
  const [rollKind, setRollKind] = useState<"check" | "save">("check");
  const [tab, setTab] = useState<"main" | "gear" | "powers" | "notes">("main");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const data = record.data as Row;
  const canRoll = session.role === "dm" || record.owner === session.players.find((seat) => seat.id === session.selfId)?.name;
  const packages = rows(data.packages);
  const classes = packages.filter((pkg) => String(pkg.packagetype).toLowerCase() === "class");
  const inventory = rows(data.inventorylist);
  const coins = rows(data.coins).filter((coin) => num(coin.amount) > 0);
  const total = num(field(data, "hp.total"));
  const current = total - num(field(data, "hp.wounds"));
  const exp = num(data.exp);
  const next = num(data.expnext);
  const ready = next > 0 && exp >= next;
  const weapons = Object.entries((data.inventorylist ?? {}) as Record<string, Row>).filter(([, item]) => item && num(item.carried) === 2 && String(item.damage ?? "").trim() !== "");
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const health = current <= 0 ? "#6C2DC7" : current / Math.max(1, total) < 0.5 ? "#e07a6a" : "#56b33f";
  const languages = rows(data.languagelist).map((row) => String(row.name));
  const slots = ((data.slots ?? {}) as Record<string, Row>);
  const powerEntries = Object.entries((data.powers ?? {}) as Record<string, Row>)
    .filter(([, power]) => power && typeof power === "object")
    .sort(([, a], [, b]) => num(a.level) - num(b.level) || String(a.name).localeCompare(String(b.name)));

  return (
    <article className="sheet" data-character={record.id}>
      <header className="sheet-head">
        <div className="portrait-frames">
          <button
            type="button"
            className="portrait-frame"
            data-action="pick-portrait"
            disabled={!canRoll}
            title={canRoll ? "Click to choose a portrait" : record.name}
            onClick={() => setPicking("portrait")}
          >
            {typeof data.portrait === "string" && data.portrait ? <Picture session={session} id={data.portrait} alt={record.name} /> : <span>{record.name.slice(0, 1)}</span>}
          </button>
          <button
            type="button"
            className="token-frame"
            data-action="pick-token"
            disabled={!canRoll}
            title={canRoll ? "Click to choose a token (the portrait is used without one)" : "Token"}
            onClick={() => setPicking("token")}
          >
            {typeof data.token === "string" && data.token ? (
              <Picture session={session} id={data.token} alt="Token" />
            ) : typeof data.portrait === "string" && data.portrait ? (
              <Picture session={session} id={data.portrait} alt="Token" />
            ) : (
              <span>Token</span>
            )}
          </button>
        </div>
        {picking ? (
          <ArtPicker
            session={session}
            kind={picking}
            current={typeof data[picking] === "string" ? String(data[picking]) : undefined}
            onClose={() => setPicking(null)}
            onPick={(id) => {
              void session.op({ op: "update", id: record.id, patch: { data: { [picking]: id } } });
              setPicking(null);
            }}
          />
        ) : null}
        <div className="sheet-title">
          <h2>{record.name}</h2>
          <p className="sheet-who">
            {String(data.race ?? "")} {classes.map((pkg) => `${String(pkg.name)} ${num(pkg.level)}`).join(" / ")}
          </p>
          <p className="sheet-sub">
            {[data.alignment, data.deity, data.size].filter(Boolean).map(String).join(" · ")}
            {record.owner ? ` · played by ${record.owner}` : ""}
          </p>
        </div>
        <div className="level-badge" title="Level">
          <small>Level</small>
          <b data-stat="level">{num(data.level)}</b>
        </div>
      </header>

      <dl className="sheet-stats vitals">
        <div className="vital hp" title={`${current} of ${total} hit points`}>
          <dt>Hit points</dt>
          <dd data-stat="hp">
            {current}/{total}
          </dd>
          <span className="bar">
            <i style={{ width: `${Math.max(0, Math.min(100, (current / Math.max(1, total)) * 100))}%`, background: health }} />
          </span>
        </div>
        <div className="vital">
          <dt>Armour</dt>
          <dd data-stat="ac">{num(field(data, "ac.total"))}</dd>
        </div>
        <div className="vital">
          <dt>To hit</dt>
          <dd data-stat="bth">{signed(num(data.bth))}</dd>
        </div>
        <div className="vital">
          <dt>Speed</dt>
          <dd>{String(data.speed ?? "—")}</dd>
        </div>
        <div className="vital xp" title={next ? `${exp} of ${next} XP for the next level` : `${exp} XP`}>
          <dt>Experience</dt>
          <dd data-stat="exp">
            {exp} / {next || "—"}
          </dd>
          <span className="bar">
            <i style={{ width: `${next ? Math.min(100, (exp / next) * 100) : 0}%` }} />
          </span>
        </div>
        {canRoll && next > 0 ? (
          <div className="vital">
            <dt>{ready ? "Ready!" : "\u00a0"}</dt>
            <dd>
              <button
                type="button"
                data-action="level-up"
                className={ready ? "play-button" : ""}
                disabled={session.role !== "dm" && !ready}
                title={ready ? "Enough experience for the next level" : "The GM can level a character early"}
                onClick={() => session.levelUp(record.id)}
              >
                Level up
              </button>
            </dd>
          </div>
        ) : null}
      </dl>

      <section className="sheet-attributes" aria-label="Attributes">
        {STATS.map((stat) => {
          const row = (field(data, `attributes.${stat}`) ?? {}) as Row;
          const prime = num(row.prime) === 1;
          const body = (
            <>
              <span className="attr-name">
                {SHORT[stat]}
                {prime ? <span className="prime-mark" title="Prime">P</span> : null}
              </span>
              <span className="attr-score">{num(row.score)}</span>
              <span className="attr-bonus">{signed(num(row.bonus))}</span>
            </>
          );
          return canRoll ? (
            <button
              key={stat}
              type="button"
              className={prime ? "attr prime" : "attr"}
              data-attr={stat}
              onClick={() => {
                // A save in a fight goes through the tracker (its effects count); otherwise the sheet rolls it.
                const entry = session.combat.entries.find((item) => item.recordId === record.id);
                if (rollKind === "save" && entry) session.ct("save", { id: entry.id, attribute: stat, cl });
                else session.siegeCheck(record.id, stat, cl, rollKind === "save");
              }}
              aria-label={`${stat} ${rollKind}`}
              title={`Roll a ${stat} ${rollKind} against CL ${cl}`}
            >
              {body}
            </button>
          ) : (
            <div key={stat} className={prime ? "attr prime" : "attr"} data-attr={stat}>
              {body}
            </div>
          );
        })}
        {canRoll ? (
          <div className="cl-box">
            <span className="segmented" role="radiogroup" aria-label="Roll">
              <button type="button" aria-pressed={rollKind === "check"} onClick={() => setRollKind("check")}>
                Check
              </button>
              <button type="button" aria-pressed={rollKind === "save"} onClick={() => setRollKind("save")}>
                Save
              </button>
            </span>
            <label title="Challenge level">
              at CL
              <input type="number" value={cl} min={-10} max={30} onChange={(event) => setCl(Number(event.target.value) || 0)} aria-label="Challenge level" />
            </label>
          </div>
        ) : null}
      </section>

      <nav className="sheet-tabs" role="tablist">
        {(["main", "gear", "powers", "notes"] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {id === "main" ? "Combat" : id === "gear" ? "Gear" : id === "powers" ? "Spells & powers" : "Notes"}
          </button>
        ))}
      </nav>

      {tab === "main" ? (
        <section aria-label="Combat" className="sheet-panel">
          <ul className="sheet-list attacks">
            {weapons.length === 0 ? <li className="hint">No weapon in hand.</li> : null}
            {weapons.map(([key, item]) => {
              const ranged = String(item.attacktype ?? "").toLowerCase() === "ranged" || RANGED.test(String(item.name));
              const bonus = num(field(data, `attack.${ranged ? "ranged" : "melee"}.total`)) + num(item.bthbonus);
              return (
                <li key={key}>
                  <span className="attack-name">
                    {String(item.name)}
                    <small>{ranged ? "ranged" : "melee"}</small>
                  </span>
                  {canRoll ? (
                    <>
                      <button type="button" data-action="attack" onClick={() => session.ct("attack", { recordId: record.id, weapon: key })} title={targetNames.length ? `Attack ${targetNames.join(", ")}` : "No target: Ctrl+click a token to target it"}>
                        Attack {signed(bonus)}
                      </button>
                      <button type="button" data-action="damage" onClick={() => session.ct("damage-roll", { recordId: record.id, weapon: key })} title={targetNames.length ? `Damage ${targetNames.join(", ")}` : "Roll damage"}>
                        Damage {String(item.damage)}
                      </button>
                    </>
                  ) : (
                    <span className="hint">
                      {signed(bonus)} · {String(item.damage)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="target-line">
            {targetNames.length > 0 ? (
              <>
                Targeting <b>{targetNames.join(", ")}</b>
              </>
            ) : inFight ? (
              <span className="hint">No target. Ctrl+click a token on the map to target it.</span>
            ) : (
              <span className="hint">Not in the fight: attacks roll without a target.</span>
            )}
          </p>
          <p className="hint">Other attacks: grapple {signed(num(field(data, "attack.grapple.total")))}, overbear {signed(num(field(data, "attack.overbear.total")))}, touch {signed(num(field(data, "attack.touch.total")))}.</p>
          {data.senses ? <p className="hint">Senses: {String(data.senses)}</p> : null}
        </section>
      ) : null}

      {tab === "gear" ? (
        <section aria-label="Gear" className="sheet-panel">
          <ul className="sheet-list">
            {inventory.map((item, index) => (
              <li key={index} data-carried={num(item.carried)}>
                <span>
                  {num(item.count) > 1 ? `${num(item.count)} × ` : ""}
                  {String(item.name)}
                </span>
                <span className="hint">{num(item.carried) === 2 ? "equipped" : item.location ? `in ${String(item.location)}` : num(item.carried) === 0 ? "left behind" : ""}</span>
              </li>
            ))}
          </ul>
          <p className="coin-row">
            {coins.length === 0 ? <span className="hint">No coin.</span> : null}
            {coins.map((coin, index) => (
              <span key={index} className="coin">
                {num(coin.amount)} <small>{String(coin.name).toUpperCase()}</small>
              </span>
            ))}
          </p>
        </section>
      ) : null}

      {tab === "powers" ? (
        <section aria-label="Powers" className="sheet-panel">
          {Object.keys(slots).length > 0 ? (
            <div className="slot-row" aria-label="Spells left today">
              {Object.entries(slots)
                .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                .map(([key, slot]) => (
                  <span key={key} className="slot-level" title={`Level ${key.slice(1)}: ${num(slot.max) - num(slot.used)} of ${num(slot.max)} left`}>
                    <small>L{key.slice(1)}</small>
                    {Array.from({ length: num(slot.max) }, (_, index) => (
                      <i key={index} className={index < num(slot.max) - num(slot.used) ? "pip" : "pip spent"} />
                    ))}
                  </span>
                ))}
              {session.role === "dm" ? (
                <button type="button" className="link" onClick={() => void session.op({ op: "update", id: record.id, patch: { data: { slots: Object.fromEntries(Object.keys(slots).map((key) => [key, { used: 0 }])) } } })}>
                  Rest: restore spells
                </button>
              ) : null}
            </div>
          ) : null}
          {targetNames.length > 0 ? (
            <p className="target-line">
              Casting at <b>{targetNames.join(", ")}</b>
            </p>
          ) : null}
          {powerEntries.length === 0 ? <p className="hint">None.</p> : null}
          <ul className="sheet-list powers">
            {powerEntries.map(([key, power]) => {
              const actions = Object.entries((power.actions ?? {}) as Record<string, Row>);
              return (
                <li key={key} className="power-row">
                  <span className="power-name">
                    <b>{String(power.name)}</b>
                    <small>
                      {power.packagesource ? "class ability" : `level ${num(power.level)}`}
                      {power.range ? ` · ${String(power.range)}` : ""}
                      {power.duration ? ` · ${String(power.duration)}` : ""}
                      {power.savetext && power.savetext !== "none" ? ` · save: ${String(power.savetext)}` : ""}
                    </small>
                    {power.shortdescription ? <small className="power-text">{String(power.shortdescription)}</small> : null}
                  </span>
                  {canRoll ? (
                    <span className="power-actions">
                      {actions.length === 0 ? (
                        <button
                          type="button"
                          data-action="cast"
                          title={[power.damage && `damage ${String(power.damage)}`, power.heal && `heals ${String(power.heal)}`, power.save && `${String(power.save)} save (${String(power.saveeffect || "negates")})`].filter(Boolean).join(" · ") || "Cast: spends the spell and says so"}
                          onClick={() => session.ct("cast", { recordId: record.id, power: key })}
                        >
                          Cast
                          <small>{String(power.damage || power.heal || "").replace(/CL/g, String(num(data.level) || 1)) || " "}</small>
                        </button>
                      ) : null}
                      {actions.map(([actionKey, action]) => (
                        <button
                          key={actionKey}
                          type="button"
                          data-action="cast"
                          title={[action.damage && `damage ${String(action.damage)}`, action.heal && `heals ${String(action.heal)}`, action.effect && `effect: ${String(action.effect)}`, action.save && `${String(action.save)} save (${String(action.saveeffect || "negates")})`]
                            .filter(Boolean)
                            .join(" · ")}
                          onClick={() => session.ct("cast", { recordId: record.id, power: key, action: actionKey })}
                        >
                          {String(action.name || "Cast")}
                          <small>{String(action.damage || action.heal || "") || (action.effect ? "effect" : "")}</small>
                        </button>
                      ))}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {tab === "notes" ? (
        <section aria-label="Notes" className="sheet-panel notes">
          <dl className="notes-list">
            {[
              ["Languages", languages.join(", ")],
              ["Age", data.age],
              ["Height", data.height],
              ["Weight", data.weight],
              ["Appearance", data.appearance],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{String(label)}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
          </dl>
          {data.notes ? <p className="notes-text">{String(data.notes).replace(/<[^>]+>/g, " ")}</p> : null}
        </section>
      ) : null}
    </article>
  );
}

// dock: the player's side panel beside the map, with a picker in place of the list.
export function CharacterPanel({ session, dock = false, selected: chosen }: { session: Session; dock?: boolean; selected?: string | null }) {
  const characters = Object.values(session.records)
    .filter((record) => record.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (chosen) setSelected(chosen);
  }, [chosen]);
  const current = characters.find((record) => record.id === selected) ?? characters[0] ?? null;

  if (dock) {
    return (
      <section className="characters dock-characters" role="tabpanel">
        <div className="dock-picker">
          {characters.length > 1 ? (
            <select aria-label="Character" value={current?.id ?? ""} onChange={(event) => setSelected(event.target.value)}>
              {characters.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.name}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className="new-character-button" title="New character" aria-label="New character" onClick={() => setCreating(true)} data-action="new-character">
            <Icon name="add-character" size={22} />
          </button>
        </div>
        {creating ? (
          <Wizard
            session={session}
            onDone={(id) => {
              setCreating(false);
              if (id) setSelected(id);
            }}
          />
        ) : current ? (
          <Sheet record={current} session={session} />
        ) : (
          <p className="hint">You have no character yet. Make one with the new character button.</p>
        )}
      </section>
    );
  }

  return (
    <section className="characters" role="tabpanel">
      <aside className="character-list">
        <button type="button" className="new-character-button" title="New character" aria-label="New character" onClick={() => setCreating(true)} data-action="new-character">
          <Icon name="add-character" size={22} />
        </button>
        {characters.length === 0 ? <p className="hint">No characters yet.</p> : null}
        <ul>
          {characters.map((record) => (
            <li key={record.id}>
              <button type="button" className={record.id === current?.id ? "selected" : ""} onClick={() => setSelected(record.id)}>
                <span className="chip-face">
                  {typeof record.data.portrait === "string" && record.data.portrait ? <Picture session={session} id={record.data.portrait} alt="" /> : record.name.slice(0, 1)}
                </span>
                <span className="list-name">
                  {record.name}
                  <small className="hint">{record.owner || "GM"}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {creating ? (
        <Wizard
          session={session}
          onDone={(id) => {
            setCreating(false);
            if (id) setSelected(id);
          }}
        />
      ) : current ? (
        <Sheet record={current} session={session} />
      ) : null}
    </section>
  );
}
