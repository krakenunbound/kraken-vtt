import { useState } from "react";
import type { Session } from "../session/useSession";
import { COHORT_HARM, CREW_XP, EDGES, FLAWS, GANG_TYPES, REPUTATIONS, ROMAN, STATUS_WORDS, titled } from "../../shared/forged/rules.mjs";

// Forged in the Dark's crew sheet, on the party sheet's Crew tab: the whole
// table's. With no crew yet, the crew wizard (the book's steps: a crew type,
// a reputation and a lair, hunting grounds and the deal with the faction
// there, a special ability, two more upgrades and the factions they touched,
// a favorite contact). Then the sheet: Tier, hold, rep and turf, heat and
// the wanted level, coin and the vault, crew xp, special abilities,
// upgrades, contacts, cohorts, the claim map and faction status. The host
// keeps it on the party record (electron/forged.cjs).

type Row = Record<string, unknown>;
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const list = (node: unknown): Row[] => (Array.isArray(node) ? (node as Row[]) : node && typeof node === "object" ? (Object.values(node as Record<string, unknown>).filter((row) => row && typeof row === "object") as Row[]) : []);
type Crew = { name: string; type: string; reputation: string; lair: string; huntingGrounds: string; huntingOp: string; tier: number; hold: string; rep: number; turf: number; heat: number; wanted: number; coin: number; vault: number; xp: number; boxes: number; advances: number; abilities: Row[]; upgrades: Record<string, number>; contacts: Row[]; cohorts: Row[]; claims: string[]; factions: Record<string, { tier: number; hold: string; status: number }>; xptrigger?: string; operations?: string; notes?: string };

function Track({ count, filled, label, mark = "", onSet }: { count: number; filled: number; label: string; mark?: string; onSet?: (value: number) => void }) {
  return (
    <span className={`forged-boxes ${mark}`} role="group" aria-label={label} data-filled={filled}>
      {Array.from({ length: count }, (_, index) => (
        <button key={index} type="button" className={index < filled ? "on" : ""} disabled={!onSet} aria-label={`${label} ${index + 1}`} onClick={() => onSet?.(index + 1 === filled ? index : index + 1)} />
      ))}
    </span>
  );
}

export function CrewSheet({ session }: { session: Session }) {
  const crew = (session.records.party?.data?.crew ?? null) as Crew | null;
  if (!crew) return <CrewWizard session={session} />;
  return <CrewView session={session} crew={crew} />;
}

function CrewView({ session, crew }: { session: Session; crew: Crew }) {
  const gm = session.role === "dm";
  const act = (action: string, args: Record<string, unknown> = {}) => session.forgedAction("", action, args);
  const records = Object.values(session.records);
  const type = records.find((item) => item.type === "crewtype" && item.name === crew.type);
  const general = records.filter((item) => item.type === "forgedtable" && item.data.group === "upgrades").flatMap((item) => list(item.data.rows));
  const upgrades = [...list(type?.data.upgrades), ...general];
  const claimMap = list(type?.data.claims);
  const typeAbilities = list(type?.data.abilities).filter((ability) => !crew.abilities.some((owned) => owned.name === ability.name));
  const [upgrade, setUpgrade] = useState("");
  const [ability, setAbility] = useState("");
  const [faction, setFaction] = useState("");
  const [cohortKind, setCohortKind] = useState("gang");
  const [cohortType, setCohortType] = useState("Thugs");
  const repCap = 12 - Math.min(6, num(crew.turf));
  const held = (name: string, index: number) => crew.claims.filter((claim) => claim === name).length > claimMap.slice(0, index).filter((row) => row.name === name).length;
  return (
    <section className="crew-sheet" data-crew={crew.name} data-crew-type={crew.type}>
      <header className="cc-row crew-head">
        <b className="crew-name">{crew.name}</b>
        <small>
          {crew.type} · {crew.reputation || "no reputation"} · lair: {crew.lair || "?"} · hunting grounds: {crew.huntingGrounds || "?"}
          {crew.huntingOp ? ` (${crew.huntingOp})` : ""}
        </small>
      </header>
      <div className="crew-stats">
        <span className="party-stat" data-crew-tier={crew.tier}>
          <small>Tier</small>
          {ROMAN[crew.tier] ?? crew.tier}
        </span>
        <span className="party-stat" data-crew-hold={crew.hold}>
          <small>Hold</small>
          {titled(crew.hold)}
        </span>
        <span className="party-stat" data-crew-coin={crew.coin} title={`The vault holds ${crew.vault}`}>
          <small>Coin</small>
          {crew.coin}/{crew.vault}
        </span>
        <span className="party-stat" data-crew-wanted={crew.wanted}>
          <small>Wanted</small>
          {crew.wanted}
        </span>
        {gm ? (
          <span className="cc-inline">
            <button type="button" data-action="crew-coin-plus" title="+1 coin to the crew" onClick={() => act("crew-coin", { amount: 1 })}>
              +1 coin
            </button>
            <button type="button" data-action="crew-coin-minus" disabled={crew.coin < 1} onClick={() => act("crew-coin", { amount: -1 })}>
              −1 coin
            </button>
            <button type="button" data-action="develop" disabled={crew.rep < repCap} title={crew.hold === "weak" ? "A full rep tracker: hold becomes strong" : `A full rep tracker: Tier ${ROMAN[crew.tier + 1]} for ${(crew.tier + 1) * 8} coin`} onClick={() => act("develop")}>
              Develop
            </button>
          </span>
        ) : null}
      </div>
      <p className="crew-track">
        <b>Rep</b> <Track count={repCap} filled={crew.rep} label="rep" onSet={gm ? (value) => act("crew-edit", { rep: value }) : undefined} /> <small>{crew.rep}/{repCap} (turf {crew.turf})</small>
      </p>
      <p className="crew-track">
        <b>Heat</b> <Track count={9} filled={crew.heat} label="heat" mark="heat" onSet={gm ? (value) => act("crew-edit", { heat: value }) : undefined} /> <small>{crew.heat}/9</small>
      </p>
      <p className="crew-track">
        <b>Crew xp</b> <Track count={CREW_XP} filled={crew.xp} label="crew xp" mark="xp" onSet={gm ? (value) => act("crew-edit", { xp: value }) : undefined} />
        <button type="button" data-action="crew-xp" title={crew.xptrigger ?? ""} onClick={() => act("crew-xp", { amount: 1 })}>
          +1
        </button>
        {crew.xptrigger ? <small className="hint">{crew.xptrigger}</small> : null}
      </p>
      <div className="crew-columns">
        <section className="cc-panel" aria-label="Crew special abilities">
          <h4>Special abilities</h4>
          <ul className="forged-abilities">
            {crew.abilities.map((item) => (
              <li key={String(item.name)} data-crew-ability={String(item.name)}>
                <b>{String(item.name)}.</b> {String(item.text ?? "")}
              </li>
            ))}
          </ul>
          {num(crew.advances) > 0 || gm ? (
            <p className="cc-inline">
              {num(crew.advances) > 0 ? <b>A crew advance!</b> : null}
              <select aria-label="New crew ability" value={ability} onChange={(event) => setAbility(event.target.value)}>
                <option value="">A special ability...</option>
                {typeAbilities.map((item) => (
                  <option key={String(item.name)} value={String(item.name)}>
                    {String(item.name)}
                  </option>
                ))}
              </select>
              <button type="button" data-action="crew-advance-ability" disabled={!ability} onClick={() => act("crew-advance", { ability })}>
                Take it
              </button>
              <button type="button" data-action="crew-advance-upgrades" onClick={() => act("crew-advance", {})}>
                Or two upgrade boxes
              </button>
            </p>
          ) : null}
          <h4>Upgrades {num(crew.boxes) ? <small>({crew.boxes} boxes to mark)</small> : null}</h4>
          <ul className="crew-upgrades">
            {Object.entries(crew.upgrades).map(([name, boxes]) => (
              <li key={name} data-upgrade={name} title={String(upgrades.find((row) => row.name === name)?.text ?? "")}>
                {name} <small>{"■".repeat(Math.max(1, num(boxes)))}</small>
              </li>
            ))}
          </ul>
          {num(crew.boxes) > 0 || gm ? (
            <p className="cc-inline">
              <select aria-label="Upgrade" value={upgrade} onChange={(event) => setUpgrade(event.target.value)}>
                <option value="">An upgrade...</option>
                {upgrades.map((row) => (
                  <option key={String(row.name)} value={String(row.name)} title={String(row.text ?? "")}>
                    {String(row.name)}
                  </option>
                ))}
              </select>
              {upgrade === "Cohort" ? (
                <>
                  <select aria-label="Cohort kind" value={cohortKind} onChange={(event) => setCohortKind(event.target.value)}>
                    <option value="gang">Gang</option>
                    <option value="expert">Expert</option>
                  </select>
                  <input aria-label="Cohort type" value={cohortType} onChange={(event) => setCohortType(event.target.value)} list="forged-gang-types" style={{ width: "7rem" }} />
                  <datalist id="forged-gang-types">
                    {Object.keys(GANG_TYPES).map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </>
              ) : null}
              <button type="button" data-action="crew-upgrade" disabled={!upgrade} onClick={() => act("upgrade", { name: upgrade, ...(upgrade === "Cohort" ? { cohort: { kind: cohortKind, type: cohortType } } : {}) })}>
                Mark
              </button>
            </p>
          ) : null}
        </section>
        <section className="cc-panel" aria-label="Contacts and cohorts">
          <h4>Contacts</h4>
          <ul>
            {crew.contacts.map((contact) => (
              <li key={String(contact.name)} data-contact={String(contact.name)}>
                {num(contact.favorite) ? "▲ " : ""}
                <b>{String(contact.name)}</b>, {String(contact.text ?? "")}
              </li>
            ))}
          </ul>
          <h4>Cohorts</h4>
          <ul>
            {crew.cohorts.map((cohort) => (
              <li key={String(cohort.id)} data-cohort={String(cohort.name)}>
                <b>{String(cohort.name)}</b> ({String(cohort.kind)}, {String(cohort.type)}; quality {crew.tier + (cohort.kind === "expert" ? 1 : 0)}
                {cohort.kind === "gang" ? `, scale ${crew.tier}` : ""}){Array.isArray(cohort.edges) && cohort.edges.length ? ` · ${(cohort.edges as string[]).join(", ")}` : ""}
                {Array.isArray(cohort.flaws) && cohort.flaws.length ? ` / ${(cohort.flaws as string[]).join(", ")}` : ""}
                <select aria-label={`${String(cohort.name)} harm`} value={num(cohort.harm)} onChange={(event) => act("cohort", { id: cohort.id, harm: Number(event.target.value) })}>
                  {COHORT_HARM.map((word: string, level: number) => (
                    <option key={level} value={level}>
                      {word || "Unharmed"}
                    </option>
                  ))}
                </select>
                <button type="button" data-action="cohort-roll" title="Send them: their quality rolled" onClick={() => act("cohort-roll", { id: cohort.id })}>
                  Roll
                </button>
              </li>
            ))}
          </ul>
          <small className="hint" title={`Edges: ${Object.keys(EDGES).join(", ")}. Flaws: ${Object.keys(FLAWS).join(", ")}.`}>
            A new cohort is the Cohort upgrade (two boxes).
          </small>
        </section>
      </div>
      <section className="cc-panel" aria-label="Claims">
        <h4>Claims</h4>
        <div className="crew-claims">
          {claimMap.slice(0, 7).map((row, index) => (
            <ClaimCell key={`a${index}`} row={row} held={held(String(row.name), index)} gm={gm} act={act} />
          ))}
          <span className="crew-claim lair" title="Your lair: claims are seized along the paths from it">
            Lair
          </span>
          {claimMap.slice(7).map((row, index) => (
            <ClaimCell key={`b${index}`} row={row} held={held(String(row.name), index + 7)} gm={gm} act={act} />
          ))}
        </div>
      </section>
      <section className="cc-panel" aria-label="Faction status">
        <h4>Factions</h4>
        <ul className="crew-factions">
          {Object.entries(crew.factions).map(([name, entry]) => (
            <li key={name} data-faction={name} data-status={entry.status}>
              <b>{name}</b> <small>Tier {ROMAN[entry.tier] ?? entry.tier}, {entry.hold}</small> <span className={entry.status < 0 ? "bad" : entry.status > 0 ? "good" : ""}>{entry.status > 0 ? `+${entry.status}` : entry.status} {STATUS_WORDS[String(entry.status) as unknown as keyof typeof STATUS_WORDS]}</span>
              {gm ? (
                <>
                  <button type="button" aria-label={`${name} status down`} disabled={entry.status <= -3} onClick={() => act("status", { faction: name, change: -1 })}>
                    −
                  </button>
                  <button type="button" aria-label={`${name} status up`} disabled={entry.status >= 3} onClick={() => act("status", { faction: name, change: 1 })}>
                    +
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {gm ? (
          <p className="cc-inline">
            <input aria-label="New faction" placeholder="Another faction" value={faction} onChange={(event) => setFaction(event.target.value)} />
            <button type="button" data-action="faction-add" disabled={!faction.trim()} onClick={() => act("status", { faction: faction.trim(), status: 0 })}>
              Add
            </button>
          </p>
        ) : null}
      </section>
    </section>
  );
}

function ClaimCell({ row, held, gm, act }: { row: Row; held: boolean; gm: boolean; act: (action: string, args?: Record<string, unknown>) => unknown }) {
  return (
    <button type="button" className={`crew-claim${held ? " held" : ""}${row.turf ? " turf" : ""}`} data-claim={String(row.name)} data-held={held ? 1 : 0} disabled={!gm} title={`${String(row.name)}: ${String(row.text ?? "")}${gm ? (held ? " (click: lose it)" : " (click: seize it)") : ""}`} onClick={() => act("claim", { name: row.name, on: !held })}>
      {String(row.name)}
    </button>
  );
}

// The crew wizard (anyone at the table may make the crew; the host checks the coin).
function CrewWizard({ session }: { session: Session }) {
  const records = Object.values(session.records);
  const types = records.filter((item) => item.type === "crewtype").sort((a, b) => a.name.localeCompare(b.name));
  const factions = records.filter((item) => item.type === "forgedtable" && item.data.group === "factions").flatMap((item) => list(item.data.rows)).map((row) => String(row.name));
  const general = records.filter((item) => item.type === "forgedtable" && item.data.group === "upgrades").flatMap((item) => list(item.data.rows));
  const [typeName, setTypeName] = useState("");
  const [name, setName] = useState("");
  const [reputation, setReputation] = useState("");
  const [lair, setLair] = useState("");
  const [huntingGrounds, setHuntingGrounds] = useState("");
  const [huntingOp, setHuntingOp] = useState("");
  const [huntingFaction, setHuntingFaction] = useState("");
  const [huntingDeal, setHuntingDeal] = useState("pay1");
  const [ability, setAbility] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [helped, setHelped] = useState("");
  const [harmed, setHarmed] = useState("");
  const [contact, setContact] = useState("");
  const [friendly, setFriendly] = useState("");
  const [unfriendly, setUnfriendly] = useState("");
  const type = types.find((item) => item.name === typeName);
  const starting = String(type?.data.startingupgrades ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const upgrades = [...list(type?.data.upgrades), ...general].filter((row) => !starting.includes(String(row.name)) && !/^(mastery|composed|hardened)$/i.test(String(row.name)));
  const boxes = picked.reduce((sum, upgrade) => sum + (/^cohort/i.test(upgrade) ? 2 : 1), 0);
  const abilities = list(type?.data.abilities);
  const chosenAbility = ability || String(abilities[0]?.name ?? "");
  const contacts = list(type?.data.contacts);
  const operations = String(type?.data.operations ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const cost = (huntingDeal === "pay1" ? 1 : huntingDeal === "pay2" ? 2 : 0);
  const ready = Boolean(type && reputation && chosenAbility && boxes === 2 && contact && name.trim() && cost <= 2);
  // A faction: one the active books name (the GM's adventure may keep them to itself), or any the GM tells you.
  const factionPick = (label: string, value: string, set: (value: string) => void) => <input aria-label={label} placeholder={`${label} (the GM names it)`} list="forged-factions" value={value} onChange={(event) => set(event.target.value)} />;
  if (types.length === 0) return <p className="hint">No crew types yet: the GM makes the Forged in the Dark Scoundrel's Handbook active (Modules).</p>;
  return (
    <section className="wizard-5e cc-panel" aria-label="Crew wizard" data-wizard="forged-crew">
      <header className="cc-row">
        <b>A new crew</b>
        <span className="me-spacer" />
        <button
          type="button"
          data-action="crew-finish"
          disabled={!ready}
          onClick={() =>
            session.forgedAction("", "crew-build", { name: name.trim(), type: typeName, reputation, lair, huntingGrounds, huntingOp, huntingFaction, huntingDeal, ability: chosenAbility, upgrades: picked, upgradeHelped: helped, upgradeHarmed: harmed, contact, contactFriendly: friendly, contactUnfriendly: unfriendly })
          }
        >
          Make the crew
        </button>
      </header>
      <datalist id="forged-factions">
        {factions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <ol className="forged-steps">
        <li>
          <b>Choose a crew type.</b> Tier 0, strong hold, 0 rep, 2 coin.
          <select
            aria-label="Crew type"
            value={typeName}
            onChange={(event) => {
              setTypeName(event.target.value);
              setAbility("");
              setPicked([]);
              setContact("");
              setHuntingOp("");
            }}
          >
            <option value="">Choose...</option>
            {types.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          {type ? <small className="hint">XP: {String(type.data.xptrigger ?? "")} Starting upgrades: {starting.join(", ")}.</small> : null}
        </li>
        <li>
          <b>Choose a reputation and a lair.</b>
          <select aria-label="Reputation" value={reputation} onChange={(event) => setReputation(event.target.value)}>
            <option value="">Reputation...</option>
            {REPUTATIONS.map((item: string) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input aria-label="Lair" placeholder="A flooded chapel by the tanneries" value={lair} onChange={(event) => setLair(event.target.value)} />
        </li>
        <li>
          <b>Establish your hunting grounds</b> and deal with the faction that claims them.
          <input aria-label="Hunting grounds" placeholder="Three blocks of Brine Street" value={huntingGrounds} onChange={(event) => setHuntingGrounds(event.target.value)} />
          <select aria-label="Favored operation" value={huntingOp} onChange={(event) => setHuntingOp(event.target.value)}>
            <option value="">Operation...</option>
            {operations.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {factionPick("Claimed by", huntingFaction, setHuntingFaction)}
          <select aria-label="Hunting grounds deal" value={huntingDeal} onChange={(event) => setHuntingDeal(event.target.value)}>
            <option value="pay1">Pay them 1 coin</option>
            <option value="pay2">Pay 2 coin: +1 status</option>
            <option value="refuse">Pay nothing: -1 status</option>
          </select>
        </li>
        <li>
          <b>Choose a special ability.</b>
          {abilities.map((item) => (
            <label key={String(item.name)} className="forged-choice">
              <input type="radio" name="forged-crew-ability" data-crew-ability={String(item.name)} checked={chosenAbility === item.name} onChange={() => setAbility(String(item.name))} /> <b>{String(item.name)}.</b> <small>{String(item.text ?? "")}</small>
            </label>
          ))}
        </li>
        <li>
          <b>Assign two more upgrades</b> ({boxes}/2 boxes; a cohort takes two).
          <div className="crew-upgrade-picks">
            {upgrades.map((row) => (
              <label key={String(row.name)} className="inline-check" title={String(row.text ?? "")}>
                <input type="checkbox" data-upgrade={String(row.name)} checked={picked.includes(String(row.name))} onChange={(event) => setPicked(event.target.checked ? [...picked, String(row.name)] : picked.filter((item) => item !== row.name))} /> {String(row.name)}
              </label>
            ))}
          </div>
          {factionPick("A faction helped", helped, setHelped)}
          {factionPick("A faction was harmed", harmed, setHarmed)}
        </li>
        <li>
          <b>Choose a favorite contact.</b>
          <select aria-label="Favorite contact" value={contact} onChange={(event) => setContact(event.target.value)}>
            <option value="">Choose...</option>
            {contacts.map((row) => (
              <option key={String(row.name)} value={String(row.name)}>
                {String(row.name)}, {String(row.text ?? "")}
              </option>
            ))}
          </select>
          {factionPick("Friendly with them", friendly, setFriendly)}
          {factionPick("Unfriendly with them", unfriendly, setUnfriendly)}
        </li>
        <li>
          <b>Name the crew.</b>
          <input aria-label="Crew name" placeholder="The Lamplighters" value={name} onChange={(event) => setName(event.target.value)} />
        </li>
      </ol>
    </section>
  );
}
