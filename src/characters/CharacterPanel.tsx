import { useState } from "react";
import type { Session, TableRecord } from "../session/useSession";
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

function Sheet({ record, session }: { record: TableRecord; session: Session }) {
  const [cl, setCl] = useState(0);
  const data = record.data as Row;
  const canRoll = session.role === "dm" || record.owner === session.players.find((seat) => seat.id === session.selfId)?.name;
  const packages = rows(data.packages);
  const classes = packages.filter((pkg) => String(pkg.packagetype).toLowerCase() === "class");
  const inventory = rows(data.inventorylist);
  const powers = rows(data.powers).sort((a, b) => num(a.level) - num(b.level) || String(a.name).localeCompare(String(b.name)));
  const coins = rows(data.coins)
    .filter((coin) => num(coin.amount) > 0)
    .map((coin) => `${num(coin.amount)} ${String(coin.name)}`)
    .join(", ");
  const hp = num(field(data, "hp.total")) - num(field(data, "hp.wounds"));

  return (
    <article className="sheet" data-character={record.id}>
      <header className="sheet-head">
        <div>
          <h2>{record.name}</h2>
          <p>
            {String(data.race ?? "")} {classes.map((pkg) => `${String(pkg.name)} ${num(pkg.level)}`).join(" / ")}
            {data.alignment ? ` · ${String(data.alignment)}` : ""}
          </p>
        </div>
        <dl className="sheet-stats">
          <div>
            <dt>HP</dt>
            <dd data-stat="hp">
              {hp}/{num(field(data, "hp.total"))}
            </dd>
          </div>
          <div>
            <dt>AC</dt>
            <dd data-stat="ac">{num(field(data, "ac.total"))}</dd>
          </div>
          <div>
            <dt>BtH</dt>
            <dd data-stat="bth">{signed(num(data.bth))}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd data-stat="level">{num(data.level)}</dd>
          </div>
          <div>
            <dt>XP</dt>
            <dd data-stat="exp">
              {num(data.exp)} / {num(data.expnext) || "—"}
            </dd>
          </div>
          {canRoll && num(data.expnext) > 0 ? (
            <div>
              <dt>{num(data.exp) >= num(data.expnext) ? "Ready" : "\u00a0"}</dt>
              <dd>
                <button
                  type="button"
                  data-action="level-up"
                  className={num(data.exp) >= num(data.expnext) ? "play-button" : ""}
                  disabled={session.role !== "dm" && num(data.exp) < num(data.expnext)}
                  title={num(data.exp) >= num(data.expnext) ? "Enough experience for the next level" : "The GM can level a character early"}
                  onClick={() => session.levelUp(record.id)}
                >
                  Level up
                </button>
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      <section className="sheet-attributes" aria-label="Attributes">
        {STATS.map((stat) => {
          const row = (field(data, `attributes.${stat}`) ?? {}) as Row;
          const prime = num(row.prime) === 1;
          return (
            <div key={stat} className={prime ? "attr prime" : "attr"} data-attr={stat}>
              <span className="attr-name">
                {SHORT[stat]}
                {prime ? <span className="prime-mark" title="Prime">P</span> : null}
              </span>
              <span className="attr-score">{num(row.score)}</span>
              <span className="attr-bonus">{signed(num(row.bonus))}</span>
              {canRoll ? (
                <button type="button" onClick={() => session.siegeCheck(record.id, stat, cl)} aria-label={`${stat} check`}>
                  Check
                </button>
              ) : null}
            </div>
          );
        })}
        {canRoll ? (
          <label className="cl-box">
            CL
            <input type="number" value={cl} min={-10} max={30} onChange={(event) => setCl(Number(event.target.value) || 0)} aria-label="Challenge level" />
          </label>
        ) : null}
      </section>

      <div className="sheet-columns">
        <section aria-label="Gear">
          <h3>Gear</h3>
          <ul className="sheet-list">
            {inventory.map((item, index) => (
              <li key={index} data-carried={num(item.carried)}>
                <span>
                  {num(item.count) > 1 ? `${num(item.count)} × ` : ""}
                  {String(item.name)}
                </span>
                <span className="hint">{num(item.carried) === 2 ? "equipped" : item.location ? `in ${String(item.location)}` : ""}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Coin: {coins || "none"}</p>
        </section>
        <section aria-label="Powers">
          <h3>Spells and powers</h3>
          {powers.length === 0 ? <p className="hint">None.</p> : null}
          <ul className="sheet-list">
            {powers.map((power, index) => (
              <li key={index}>
                <span>{String(power.name)}</span>
                <span className="hint">{power.packagesource ? "class" : `level ${num(power.level)}`}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

export function CharacterPanel({ session }: { session: Session }) {
  const characters = Object.values(session.records)
    .filter((record) => record.type === "character")
    .sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = characters.find((record) => record.id === selected) ?? characters[0] ?? null;

  return (
    <section className="characters" role="tabpanel">
      <aside className="character-list">
        <h1>Characters</h1>
        <button type="button" className="play-button" onClick={() => setCreating(true)} data-action="new-character">
          New character
        </button>
        {characters.length === 0 ? <p className="hint">No characters yet.</p> : null}
        <ul>
          {characters.map((record) => (
            <li key={record.id}>
              <button type="button" className={record.id === current?.id ? "selected" : ""} onClick={() => setSelected(record.id)}>
                {record.name}
                <span className="hint">{record.owner || "GM"}</span>
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
