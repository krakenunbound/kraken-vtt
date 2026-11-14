import { useMemo, useState } from "react";
import { useHostRolls } from "./hostRolls";
import { priceOf } from "../../shared/shop.mjs";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { slotDrag } from "../ui/QuickSlots";
import { ArtPicker, Picture } from "./ArtPicker";
import { Field } from "./CCSheet";
import { BODY_SLOTS, PACK_SLOTS, SHORT, SLOTS, STAT_NAMES, STATS, TRAITS, TRAIT_NAMES, itemSlots } from "../../shared/cairn/rules.mjs";

// The Cairn character sheet, in Kraken's sheet style: who they are on top,
// tabs down the right (Main, Inventory, Combat, Character, Growth, Notes).
// Click an attribute to save against it (a d20 at or under, in front of the
// table). The inventory keeps its ten slots (four on the body, six in the
// backpack, Fatigue one each). Cairn has no experience: the Growth tab keeps
// the Scars, what has changed and the Downtime milestones. The host works
// every number out again (shared/cairn/rules.mjs) and does the rest, the
// spells and the scars (electron/cairn.cjs).

type Row = Record<string, unknown>;
const TABS = ["main", "inventory", "combat", "character", "growth", "notes"] as const;
type Tab = (typeof TABS)[number];
const rows = (node: unknown): [string, Row][] =>
  node && typeof node === "object" ? Object.entries(node as Record<string, unknown>).filter((entry): entry is [string, Row] => Boolean(entry[1]) && typeof entry[1] === "object") : [];
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const titled = (word: string) => word[0].toUpperCase() + word.slice(1);
const stat = (key: string) => STAT_NAMES[key as keyof typeof STAT_NAMES];
const short = (key: string) => SHORT[key as keyof typeof SHORT];

export function SheetCairn({ record, session }: { record: TableRecord; session: Session }) {
  const [tab, setTab] = useState<Tab>("main");
  const [picking, setPicking] = useState<"portrait" | "token" | null>(null);
  const [danger, setDanger] = useState(false);
  const [mode, setMode] = useState("");
  const data = record.data as Row;
  const me = session.players.find((seat) => seat.id === session.selfId)?.name;
  const editable = session.role === "dm" || (record.owner !== "" && record.owner === me);
  const change = (path: string, value: unknown) => session.editCharacter(record.id, [{ path, value }]);
  const numberAt = (path: string) => (value: string) => change(path, Number(value) || 0);
  const act = (action: string, args: Record<string, unknown> = {}) => void session.cairnAction(record.id, action, args).catch(() => undefined);
  const attributes = (data.attributes ?? {}) as Record<string, Row>;
  const hp = (data.hp ?? {}) as Row;
  const ac = (data.ac ?? {}) as Row;
  const slots = (data.slots ?? {}) as Row;
  const traits = (data.traits ?? {}) as Row;
  const portrait = typeof data.portrait === "string" ? data.portrait : "";
  const current = num(hp.total) - num(hp.wounds);
  const status = String(data.status ?? "");
  const inFight = session.combat.entries.find((entry) => entry.recordId === record.id);
  const targetNames = (inFight?.targets ?? []).map((id) => session.combat.entries.find((entry) => entry.id === id)?.name).filter(Boolean);
  const save = (key: string) => editable && session.siegeCheck(record.id, key, 0, false, { kind: "save" });
  const items = rows(data.inventorylist);
  const gp = rows(data.coins).find(([, coin]) => /gp/i.test(String(coin.name ?? "gp")));

  return (
    <article className="cc-sheet sheet-5e sheet-cairn" data-character={record.id} data-ruleset="cairn">
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
                <span className="cc-value" data-stat="background">{String(data.background ?? "")}</span>
                <small>Background</small>
              </label>
              <label className="cc-labelled cc-box">
                <Field value={num(data.age)} number editable={editable} label="Age" onSave={numberAt("age")} />
                <small>Age</small>
              </label>
              {status ? (
                <label className="cc-labelled cc-box">
                  <span className="cc-value" data-cairn-status={status} style={{ color: "#c0392b" }}>
                    {status}
                  </span>
                  <small>State</small>
                </label>
              ) : null}
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

        {tab === "main" ? (
          <div className="cc-page" data-tab-page="main">
            <div className="cc-main-grid five-main">
              <section className="cc-panel five-abilities cairn-stats" aria-label="Attributes">
                <div className="five-ability-head">
                  <span />
                  <small>Now</small>
                  <small>Max</small>
                  <small>Save</small>
                </div>
                {STATS.map((key: string) => {
                  const row = attributes[key] ?? {};
                  return (
                    <div key={key} className="five-ability" data-attribute={key}>
                      <b title={stat(key)}>{short(key)}</b>
                      <Field value={num(row.score)} number editable={editable} label={`${key} now`} onSave={numberAt(`attributes.${key}.score`)} />
                      <Field value={num(row.max)} number editable={editable} label={`${key} max`} onSave={numberAt(`attributes.${key}.max`)} />
                      <button type="button" className="cc-bonus" disabled={!editable} title={`Save ${stat(key)}: a d20 at or under ${num(row.score)} (a 1 always succeeds, a 20 always fails)`} aria-label={`${key} save`} data-roll-save={key} onClick={() => save(key)}>
                        d20
                      </button>
                    </div>
                  );
                })}
              </section>
              <section className="cc-panel five-defence">
                <div className="five-big" title="Hit Protection: how well you avoid harm. Damage past it comes off STR. A full inventory takes it to 0.">
                  <small>HP</small>
                  <span data-stat="hp" style={{ color: current <= 0 ? "#c0392b" : undefined }}>
                    {current} / {num(hp.total)}
                  </span>
                  <span className="cc-inline">
                    Lost <Field value={num(hp.wounds)} number editable={editable} label="HP lost" onSave={numberAt("hp.wounds")} /> Max <Field value={num(hp.max)} number editable={editable} label="HP max" onSave={numberAt("hp.max")} />
                  </span>
                  {data.encumbered ? <span className="hint">A full inventory: HP 0</span> : null}
                </div>
                <div className="five-big" title={`Armor comes off every hit (3 at most)${ac.armor ? `: ${String(ac.armor)}` : ""}`}>
                  <small>Armor</small>
                  <span className="cc-shield" data-stat="ac">
                    {num(ac.total)}
                  </span>
                </div>
                <div className="five-big" title="Fatigue: one slot each, until a safe night's rest">
                  <small>Fatigue</small>
                  <span data-stat="fatigue">{num(data.fatigue)}</span>
                  {editable ? (
                    <span className="cc-inline">
                      <button type="button" data-action="fatigue-add" title="Add a Fatigue (it takes a free slot)" onClick={() => act("fatigue", { amount: 1 })}>
                        +
                      </button>
                      <button type="button" data-action="fatigue-remove" title="Remove a Fatigue" disabled={num(data.fatigue) <= 0} onClick={() => act("fatigue", { amount: -1 })}>
                        −
                      </button>
                    </span>
                  ) : null}
                </div>
              </section>
            </div>
            {editable ? (
              <section className="cc-panel cc-row five-strip" aria-label="Rest">
                <button type="button" data-action="cairn-rest" title="A few moments' rest and a drink of water: HP back (not while deprived)" onClick={() => act("rest")}>
                  Short rest
                </button>
                <button type="button" data-action="cairn-sleep" title="A full night's rest in a safe spot: HP back and every Fatigue gone" onClick={() => act("sleep")}>
                  Night's rest
                </button>
                <button type="button" data-action="cairn-recover" title="A week's rest with a healer: STR, DEX and WIL back to their maximum" onClick={() => act("recover")}>
                  A week's rest
                </button>
                <label className="cc-inline" title="Deprived: lacking food, water or rest. No recovery of HP, attributes or Fatigue.">
                  <input type="checkbox" checked={Boolean(num(data.deprived))} data-action="cairn-deprived" onChange={(event) => act("deprived", { on: event.target.checked })} /> Deprived
                </label>
                {data.critical === "dying" ? (
                  <button type="button" data-action="cairn-stabilize" title="Aid (bandages): stable, out of danger" onClick={() => act("stabilize")}>
                    Stabilize
                  </button>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === "inventory" ? (
          <section className="cc-panel cc-page" data-tab-page="inventory">
            <p className="cc-inline" data-slots={num(slots.used)}>
              <b>
                Slots {num(slots.used)} / {SLOTS}
              </b>
              <small className="hint">
                body {num(slots.body)}/{BODY_SLOTS} · backpack {num(slots.pack)}/{PACK_SLOTS} · Fatigue {num(slots.fatigue)}
                {num(slots.coins) ? ` · coin ${num(slots.coins)}` : ""} · bulky 2, petty 0
              </small>
            </p>
            <ul className="five-items">
              {items.map(([key, item]) => (
                <li key={key} data-item={key}>
                  <select className="cc-field" value={item.carried === undefined ? 1 : num(item.carried)} disabled={!editable} aria-label={`${String(item.name)} carried`} title="On the body or in hand, in the backpack, or left elsewhere (a mule, a cart, camp)" onChange={(event) => change(`inventorylist.${key}.carried`, Number(event.target.value))}>
                    <option value={2}>Body</option>
                    <option value={1}>Pack</option>
                    <option value={0}>Away</option>
                  </select>
                  <span title={String(item.text ?? item.note ?? "")}>
                    {String(item.name)}{" "}
                    <small className="hint">
                      {[item.damage ? String(item.damage) : "", item.armor ? `${num(item.armor)} Armor` : "", item.uses !== undefined ? `${num(item.uses)} uses` : "", item.charges !== undefined ? `${num(item.charges)} charges` : "", `${itemSlots(item)} slot${itemSlots(item) === 1 ? "" : "s"}`, item.kind ? String(item.kind) : ""].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  {editable && ["spellbook", "scroll", "relic"].includes(String(item.kind ?? "")) ? (
                    <button type="button" data-action="cast" title={item.kind === "spellbook" ? "Read it aloud with both hands: +1 Fatigue (in danger, a WIL save first)" : item.kind === "scroll" ? "Read it: no Fatigue, the scroll is gone" : "Use the relic: a charge"} onClick={() => act("cast", { item: key, danger })}>
                      {item.kind === "relic" ? "Use" : "Cast"}
                    </button>
                  ) : editable && (num(item.uses) > 0 || num(item.charges) > 0) ? (
                    <button type="button" data-action="use" title="Spend a use" onClick={() => act("use", { item: key })}>
                      Use
                    </button>
                  ) : null}
                  {editable ? (
                    <button type="button" className="ghost" title="Drop it" aria-label={`Drop ${String(item.name)}`} onClick={() => change(`inventorylist.${key}`, null)}>
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {editable ? (
              <p className="cc-inline">
                <label className="cc-inline" title="Casting in danger (in a fight) or deprived: a WIL save first">
                  <input type="checkbox" checked={danger} onChange={(event) => setDanger(event.target.checked)} /> In danger
                </label>
                <label className="cc-labelled grow">
                  <Field value="" editable={editable} label="Add an item" onSave={(value) => value.trim() && act("item-add", { text: value })} />
                  <small>Add an item, as the books write it: Rope (25ft), Bow (d6, bulky)</small>
                </label>
              </p>
            ) : null}
            <div className="five-coins">
              {rows(data.coins).map(([key, coin]) => (
                <label key={key} className="cc-inline">
                  <Field value={num(coin.amount)} number editable={editable} label={`${String(coin.name ?? "GP")} coins`} onSave={numberAt(`coins.${key}.amount`)} /> {String(coin.name ?? "gp").toLowerCase()}
                </label>
              ))}
              {!gp ? <span className="hint">No gold.</span> : null}
            </div>
          </section>
        ) : null}

        {tab === "combat" ? (
          <section className="cc-panel cc-page" data-tab-page="combat">
            <h4>
              Attacks {targetNames.length ? <small className="hint">at {targetNames.join(", ")}</small> : <small className="hint">Ctrl+click a token to target it</small>}
            </h4>
            <p className="hint">Attacks always hit: the die, less the target's Armor, off HP and then STR.</p>
            <label className="cc-inline">
              <select className="cc-field" aria-label="Attack modifier" value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="">Normal</option>
                <option value="impaired">Impaired: d4 (cover, bound hands)</option>
                <option value="enhanced">Enhanced: d12 (a helpless foe, a daring move)</option>
              </select>
            </label>
            <ul className="five-attacks">
              {rows(data.attacks).map(([key, attack]) => (
                <li key={key} data-attack={key}>
                  <b>{String(attack.name)}</b> <small className="hint">{[attack.blast ? "blast" : "", attack.bulky ? "bulky" : "", attack.ignoresarmor ? "ignores armor" : ""].filter(Boolean).join(", ")}</small>
                  <button type="button" data-action="attack" disabled={!editable} title="Attack: it hits; the die less Armor" onClick={() => session.ct("attack", { recordId: record.id, weapon: key, ...(mode ? { mode } : {}) })}>
                    {mode === "impaired" ? "d4" : mode === "enhanced" ? "d12" : String(attack.damage)}
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">Two weapons (d6+d6) roll both and keep the best. In the first round, save DEX to act (the tracker asks).</p>
          </section>
        ) : null}

        {tab === "character" ? (
          <section className="cc-panel cc-page" data-tab-page="character">
            <div className="cairn-traits">
              {TRAITS.map((key: string) => (
                <label key={key} className="cc-labelled">
                  <Field value={String(traits[key] ?? "")} editable={editable} label={TRAIT_NAMES[key as keyof typeof TRAIT_NAMES]} onSave={(value) => change(`traits.${key}`, value)} />
                  <small>{TRAIT_NAMES[key as keyof typeof TRAIT_NAMES]}</small>
                </label>
              ))}
            </div>
            <label className="cc-labelled">
              <Field value={String(data.bond ?? "")} area editable={editable} label="Bond" onSave={(value) => change("bond", value)} />
              <small>Bond</small>
            </label>
            <label className="cc-labelled">
              <Field value={String(data.omen ?? "")} area editable={editable} label="Omen" onSave={(value) => change("omen", value)} />
              <small>Omen</small>
            </label>
            <label className="cc-labelled">
              <Field value={String(data.history ?? "")} area editable={editable} label="Background history" onSave={(value) => change("history", value)} />
              <small>From the background's tables</small>
            </label>
          </section>
        ) : null}

        {tab === "growth" ? (
          <section className="cc-panel cc-page" data-tab-page="growth">
            <p className="hint">Cairn has no experience: a character grows from what happens to them. Scars, changes and Downtime milestones are kept here.</p>
            <h4>Scars</h4>
            <ul className="five-items" data-scars={rows(data.scars).length}>
              {rows(data.scars).map(([key, scar]) => (
                <li key={key} data-scar={key}>
                  <span>
                    <b>{String(scar.name ?? "Scar")}</b> <small className="hint">{String(scar.text ?? "")}</small>
                  </span>
                  {editable && num(scar.pending) ? (
                    <button type="button" data-action="scar-recover" title="Recovered (mended, over it): roll what the scar gives" onClick={() => act("scar-recover", { scar: key })}>
                      Recover
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <h4>Growth</h4>
            <ul className="five-items">
              {rows(data.growth).map(([key, entry]) => (
                <li key={key} data-growth={key}>
                  <span>{String(entry.text ?? "")}</span>
                  {editable ? (
                    <button type="button" className="ghost" aria-label="Remove" onClick={() => change(`growth.${key}`, null)}>
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {editable ? (
              <label className="cc-labelled">
                <Field value="" editable={editable} label="New growth" onSave={(value) => value.trim() && act("growth", { text: value })} />
                <small>What changed, and why (Enter to add)</small>
              </label>
            ) : null}
            {session.role === "dm" ? (
              <p className="cc-inline" title="Growth by a roll: keep it if it beats the maximum (the Warden's call)">
                {(["hp", "str", "dex", "wil"] as const).map((key) => (
                  <button key={key} type="button" data-action={`grow-${key}`} onClick={() => act("growth-roll", { to: key, roll: key === "hp" ? "1d6" : "3d6", how: "higher", reason: "Growth" })}>
                    Reroll {key.toUpperCase()}
                  </button>
                ))}
              </p>
            ) : null}
            <h4>Milestones</h4>
            <ul className="five-items">
              {rows(data.milestones).map(([key, entry]) => (
                <li key={key} data-milestone={key}>
                  <label className="cc-inline">
                    <input type="checkbox" checked={Boolean(num(entry.done))} disabled={!editable} onChange={(event) => act("milestone", { key, done: event.target.checked })} /> {String(entry.name ?? "")}
                  </label>
                  {editable ? (
                    <button type="button" className="ghost" aria-label="Remove milestone" onClick={() => act("milestone", { key, remove: true })}>
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {editable ? (
              <label className="cc-labelled">
                <Field value="" editable={editable} label="New milestone" onSave={(value) => value.trim() && act("milestone", { name: value })} />
                <small>A Downtime milestone (Enter to add)</small>
              </label>
            ) : null}
          </section>
        ) : null}

        {tab === "notes" ? (
          <section className="cc-panel cc-page" data-tab-page="notes">
            <label className="cc-labelled">
              <Field value={String(data.appearance ?? "")} editable={editable} label="Appearance" onSave={(value) => change("appearance", value)} />
              <small>Appearance</small>
            </label>
            <Field value={String(data.notes ?? "")} area editable={editable} label="Notes" onSave={(value) => change("notes", value)} />
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

// The Cairn character wizard, the book's Character Creation in its order:
// a background (rolled d20 or chosen), a name from its list, its starting
// gear, a roll on each of its tables; STR, DEX and WIL 3d6 in order (two may
// be swapped once); Hit Protection 1d6; the traits (d10 each), a Bond (d20),
// the age (2d20+10) and, for the youngest, an Omen (d20); 3d6 gold pieces
// and the Marketplace. Every die is the host's, in chat for the table.
type Background = { id: string; name: string; names: string[]; gear: string[]; tables: { name: string; rows: { from: number; to: number; text: string }[] }[]; quote: string };
export function WizardCairn({ session, onDone }: { session: Session; onDone: (id: string | null) => void }) {
  const records = Object.values(session.records);
  const backgrounds: Background[] = useMemo(
    () =>
      records
        .filter((item) => item.type === "background")
        .map((item) => ({
          id: item.id,
          name: item.name,
          names: String(item.data.names ?? "").split(",").map((name) => name.trim()).filter(Boolean),
          gear: rows(item.data.gear).map(([, line]) => String(line.text ?? "")),
          tables: rows(item.data.tables).map(([, table]) => ({ name: String(table.name ?? ""), rows: rows(table.rows).map(([, row]) => ({ from: num(row.from), to: num(row.to), text: String(row.text ?? "") })) })),
          quote: String(item.data.quote ?? ""),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records],
  );
  const tableOf = (group: string) => {
    const found = records.find((item) => item.type === "cairntable" && String(item.data.group ?? "") === group);
    return found ? rows(found.data.rows).map(([, row]) => ({ from: num(row.from), to: num(row.to), text: String(row.text ?? "") })) : [];
  };
  const lookup = (group: string, roll: number) => tableOf(group).find((row) => roll >= row.from && roll <= row.to)?.text ?? "";
  const roller = useHostRolls(session, (label) => `[CHARGEN] ${label}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [background, setBackground] = useState("");
  const [name, setName] = useState("");
  const [results, setResults] = useState<Record<number, number>>({});
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [swapA, setSwapA] = useState("str");
  const [swapB, setSwapB] = useState("dex");
  const [hp, setHp] = useState(0);
  const [traits, setTraits] = useState<Record<string, string>>({});
  const [bond, setBond] = useState("");
  const [age, setAge] = useState(0);
  const [youngest, setYoungest] = useState(false);
  const [omen, setOmen] = useState("");
  const [gold, setGold] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const chosen = backgrounds.find((item) => item.name === background);
  const roll = async (formula: string, label: string) => {
    setBusy(true);
    setProblem("");
    try {
      return (await roller(formula, label)).total;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const many = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem("");
    try {
      await work();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  // The Marketplace (gear, weapons, armor, transport: not services or hirelings), in gold pieces.
  const wares = useMemo(
    () =>
      records
        .filter((item) => item.type === "item" && !["Service", "Hireling", "Spellbook", "Relic"].includes(String(item.data.type ?? "")) && priceOf(item.data.cost) !== null)
        .map((item) => ({ name: item.name, price: (priceOf(item.data.cost) ?? 0) / 100, kind: String(item.data.type ?? "") }))
        .filter((item, index, list) => list.findIndex((other) => other.name === item.name) === index)
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.records],
  );
  const bonusGold = chosen ? chosen.tables.reduce((sum, table, index) => {
    const row = table.rows.find((item) => results[index] >= item.from && results[index] <= item.to);
    const match = /(?:\+\s*|take\s+|extra\s+)(\d+)\s*gp\b/i.exec(row?.text ?? "");
    return sum + (match ? Number(match[1]) : 0);
  }, 0) : 0;
  const purse = gold + bonusGold;
  const spent = Object.entries(cart).reduce((sum, [ware, count]) => sum + (wares.find((item) => item.name === ware)?.price ?? 0) * count, 0);
  const left = purse - spent;
  const tablesDone = chosen ? chosen.tables.every((_, index) => results[index]) : false;
  const ready = Boolean(chosen && tablesDone && scores && hp && gold && age && bond && TRAITS.every((key: string) => traits[key]));
  const finish = async () => {
    if (!chosen || !scores) return;
    setBusy(true);
    setProblem("");
    try {
      const id = await session.buildCharacter({ name: name || chosen.names[0] || chosen.name, background: chosen.name, attributes: scores, hp, age, gold, traits, bond, omen, results: chosen.tables.map((_, index) => ({ table: index, roll: results[index] })), buy: Object.entries(cart) });
      onDone(id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  if (backgrounds.length === 0) return <p className="hint">No backgrounds yet: the GM makes the Cairn Player's Guide active (Modules).</p>;
  return (
    <section className="wizard-5e cc-panel" aria-label="Cairn character wizard" data-wizard="cairn">
      <header className="cc-row">
        <b>New Cairn character</b>
        <span className="me-spacer" />
        <button type="button" className="ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="button" data-action="wizard-finish" disabled={busy || !ready || left < 0} title="Every step rolled first" onClick={() => void finish()}>
          Finish
        </button>
      </header>

      <h4>1. Background</h4>
      <div className="cc-inline">
        <select value={background} aria-label="Background" onChange={(event) => (setBackground(event.target.value), setResults({}), setName(""))}>
          <option value="">Choose a background…</option>
          {backgrounds.map((item) => (
            <option key={item.id}>{item.name}</option>
          ))}
        </select>
        <button
          type="button"
          data-action="cairn-roll-background"
          disabled={busy}
          onClick={() =>
            void roll("1d20", "Background (d20)").then((total) => {
              if (!total) return;
              const picked = lookup("backgrounds", total) || backgrounds[(total - 1) % backgrounds.length].name;
              const match = backgrounds.find((item) => item.name.toLowerCase() === picked.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ")) ?? backgrounds.find((item) => item.name.replace(/[-\s]/g, "").toLowerCase() === picked.replace(/[-\s]/g, "").toLowerCase());
              if (match) {
                setBackground(match.name);
                setResults({});
                setName("");
              }
            })
          }
        >
          Roll d20
        </button>
      </div>
      {chosen ? (
        <>
          <p className="hint">{chosen.quote}</p>
          <label className="cc-inline">
            Name
            <select value={name} aria-label="Name from the background" onChange={(event) => setName(event.target.value)}>
              <option value="">Choose a name…</option>
              {chosen.names.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <input value={name} aria-label="Character name" placeholder="or your own" onChange={(event) => setName(event.target.value)} />
          </label>
          <p className="hint">Starting gear: a backpack, {chosen.gear.join(", ")}.</p>
          {chosen.tables.map((table, index) => {
            const row = table.rows.find((item) => results[index] >= item.from && results[index] <= item.to);
            return (
              <div key={table.name} className="cairn-table" data-cairn-table={index}>
                <b>{table.name}</b>{" "}
                <button type="button" data-action={`cairn-roll-table-${index}`} disabled={busy || Boolean(results[index])} onClick={() => void roll("1d6", `${chosen.name}: ${table.name}`).then((total) => total && setResults((now) => ({ ...now, [index]: total })))}>
                  {results[index] ? `Rolled ${results[index]}` : "Roll d6"}
                </button>
                {row ? <p className="hint">{row.text}</p> : null}
              </div>
            );
          })}
        </>
      ) : null}

      <h4>2. Attributes and Hit Protection</h4>
      <div className="cc-inline">
        <button
          type="button"
          data-action="cairn-roll-attributes"
          disabled={busy || Boolean(scores)}
          onClick={() =>
            void many(async () => {
              const out: Record<string, number> = {};
              for (const key of STATS as string[]) out[key] = (await roller("3d6", `${stat(key)} (3d6)`)).total;
              setScores(out);
            })
          }
        >
          Roll 3d6 in order
        </button>
        {scores
          ? (STATS as string[]).map((key) => (
              <span key={key} className="cc-box" data-wizard-score={key}>
                {short(key)} <b>{scores[key]}</b>
              </span>
            ))
          : null}
        {scores && !swapped ? (
          <span className="cc-inline" title="You may swap any two of the results">
            <select aria-label="Swap" value={swapA} onChange={(event) => setSwapA(event.target.value)}>
              {(STATS as string[]).map((key) => (
                <option key={key} value={key}>
                  {short(key)}
                </option>
              ))}
            </select>
            ↔
            <select aria-label="With" value={swapB} onChange={(event) => setSwapB(event.target.value)}>
              {(STATS as string[]).map((key) => (
                <option key={key} value={key}>
                  {short(key)}
                </option>
              ))}
            </select>
            <button type="button" data-action="cairn-swap" disabled={swapA === swapB} onClick={() => (setScores({ ...scores, [swapA]: scores[swapB], [swapB]: scores[swapA] }), setSwapped(true))}>
              Swap
            </button>
          </span>
        ) : null}
        <button type="button" data-action="cairn-roll-hp" disabled={busy || Boolean(hp)} onClick={() => void roll("1d6", "Hit Protection (1d6)").then((total) => total && setHp(total))}>
          {hp ? `HP ${hp}` : "Roll HP (1d6)"}
        </button>
      </div>

      <h4>3. Traits, Bond, Age{youngest ? ", Omen" : ""}</h4>
      <div className="cc-inline">
        <button
          type="button"
          data-action="cairn-roll-traits"
          disabled={busy || TRAITS.every((key: string) => traits[key])}
          onClick={() =>
            void many(async () => {
              const out: Record<string, string> = {};
              for (const key of TRAITS as string[]) out[key] = lookup(key, (await roller("1d10", `${TRAIT_NAMES[key as keyof typeof TRAIT_NAMES]} (d10)`)).total);
              setTraits(out);
            })
          }
        >
          Roll the traits (d10 each)
        </button>
        <button type="button" data-action="cairn-roll-bond" disabled={busy || Boolean(bond)} onClick={() => void roll("1d20", "Bond (d20)").then((total) => total && setBond(lookup("bonds", total)))}>
          Roll a Bond (d20)
        </button>
        <button type="button" data-action="cairn-roll-age" disabled={busy || Boolean(age)} onClick={() => void roll("2d20+10", "Age (2d20+10)").then((total) => total && setAge(total))}>
          {age ? `Age ${age}` : "Roll the age (2d20+10)"}
        </button>
        <label className="cc-inline" title="The youngest character rolls an Omen and reads it aloud">
          <input type="checkbox" checked={youngest} onChange={(event) => setYoungest(event.target.checked)} /> The youngest
        </label>
        {youngest ? (
          <button type="button" data-action="cairn-roll-omen" disabled={busy || Boolean(omen)} onClick={() => void roll("1d20", "Omen (d20)").then((total) => total && setOmen(lookup("omens", total)))}>
            Roll an Omen (d20)
          </button>
        ) : null}
      </div>
      {TRAITS.some((key: string) => traits[key]) ? <p className="hint" data-wizard-traits>{(TRAITS as string[]).map((key) => `${TRAIT_NAMES[key as keyof typeof TRAIT_NAMES]}: ${traits[key]}`).join(" · ")}</p> : null}
      {bond ? <p className="hint">Bond: {bond}</p> : null}
      {omen ? <p className="hint">Omen (read it aloud): {omen}</p> : null}

      <h4>4. Gold and the Marketplace</h4>
      <div className="cc-inline">
        <button type="button" data-action="cairn-roll-gold" disabled={busy || Boolean(gold)} onClick={() => void roll("3d6", "Gold pieces (3d6)").then((total) => total && setGold(total))}>
          {gold ? `${gold} gp rolled` : "Roll 3d6 gold pieces"}
        </button>
        <span>
          Purse {purse} gp{bonusGold ? ` (${bonusGold} from the background)` : ""} · spent {spent} · <b data-coin-left={left}>{left} gp left</b>
        </span>
      </div>
      <input aria-label="Shop search" placeholder="Search the Marketplace" value={search} onChange={(event) => setSearch(event.target.value)} />
      <ul className="life-shop">
        {wares
          .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 80)
          .map((item) => (
            <li key={item.name}>
              <span>
                {item.name} <small className="hint">{item.price} gp{item.kind ? ` · ${item.kind}` : ""}</small>
              </span>
              {cart[item.name] ? <b>x{cart[item.name]}</b> : null}
              <button type="button" aria-label={`Buy ${item.name}`} disabled={!gold || item.price > left} onClick={() => setCart({ ...cart, [item.name]: (cart[item.name] ?? 0) + 1 })}>
                Buy
              </button>
              {cart[item.name] ? (
                <button type="button" aria-label={`Return ${item.name}`} onClick={() => setCart(Object.fromEntries(Object.entries({ ...cart, [item.name]: cart[item.name] - 1 }).filter(([, count]) => count > 0)))}>
                  Return
                </button>
              ) : null}
            </li>
          ))}
      </ul>
      {problem ? <p className="error">{problem}</p> : null}
    </section>
  );
}
