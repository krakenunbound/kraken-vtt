import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Session, TableRecord } from "../session/useSession";
import { Icon } from "../ui/icons";
import { cardsFor, restChanges, SCHOOLS } from "../../shared/cards/cards.mjs";
import { cardsStore } from "./cardsStore";
import "./cards.css";

// Ability cards: a character's spells and weapons laid out as cards, the way
// some tables use printed spell cards. Click a card to turn it over (its text,
// Cast or Attack); drag it onto a creature's token to target it and use it.
// A spell card goes grey and tips over when no slot of its level is left;
// Long rest stands them all up again. The cards only show the sheet.

export type Card = ReturnType<typeof cardsFor>[number];
export const CARD_DRAG = "application/x-kraken-card";
const SPARK_COUNT = 14;

function useMine(session: Session) {
  const me = session.players.find((seat) => seat.id === session.selfId)?.name ?? "";
  const gm = session.role === "dm";
  return Object.values(session.records)
    .filter((record) => record.type === "character" && (gm || (me !== "" && record.owner === me)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function CardsWindow({ session, characterId }: { session: Session; characterId?: string }) {
  const characters = useMine(session);
  const [chosen, setChosen] = useState(characterId ?? "");
  const character = characters.find((item) => item.id === chosen) ?? characters[0] ?? null;
  const settings = useSyncExternalStore(cardsStore.subscribe, cardsStore.settings);
  if (!character) return <p className="hint cards-empty">No character of yours to lay out yet.</p>;
  return (
    <div className={`cards-window layout-${settings.layout}${settings.effects ? "" : " still"}`} data-cards={character.id}>
      <header className="cards-bar">
        {characters.length > 1 ? (
          <select aria-label="Whose cards" data-action="cards-character" value={character.id} onChange={(event) => setChosen(event.target.value)}>
            {characters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : (
          <b>{character.name}</b>
        )}
        <span className="cards-bar-gap" />
        <button type="button" className="ghost" data-action="cards-layout" title="Lay the cards out in rows, or fan them as a hand" onClick={() => cardsStore.set({ layout: settings.layout === "fan" ? "spread" : "fan" })}>
          {settings.layout === "fan" ? "Spread" : "Fan"}
        </button>
        <RestButton session={session} character={character} />
      </header>
      <Hand session={session} character={character} />
    </div>
  );
}

function RestButton({ session, character }: { session: Session; character: TableRecord }) {
  const changes = restChanges(character.data);
  return (
    <button
      type="button"
      className="ghost"
      data-action="cards-rest"
      disabled={changes.length === 0}
      title="Long rest: every spell slot back (and concentration ends)"
      onClick={() => session.editCharacter(character.id, changes)}
    >
      <Icon name="sun" size={14} /> Long rest
    </button>
  );
}

function Hand({ session, character }: { session: Session; character: TableRecord }) {
  const spells = useMemo(() => Object.values(session.records).filter((record) => record.type === "spell"), [session.records]);
  const cards = useMemo(() => cardsFor(character.data, spells) as Card[], [character.data, spells]);
  // Cards that just stood up again (a rest): they turn back over one after another.
  const wasSpent = useRef(new Map<string, boolean>());
  const [restored, setRestored] = useState<string[]>([]);
  useEffect(() => {
    const back = cards.filter((card) => wasSpent.current.get(card.id) && !card.spent).map((card) => card.id);
    wasSpent.current = new Map(cards.map((card) => [card.id, card.spent]));
    if (back.length === 0) return;
    setRestored(back);
    const timer = window.setTimeout(() => setRestored([]), 600 + back.length * 90);
    return () => window.clearTimeout(timer);
  }, [cards]);
  if (cards.length === 0) return <p className="hint cards-empty">{character.name} has no spells or weapons to lay out.</p>;
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const group = card.kind === "weapon" ? "Weapons" : card.level === 0 ? "Cantrips" : `Level ${card.level}`;
    groups.set(group, [...(groups.get(group) ?? []), card]);
  }
  return (
    <div className="cards-hand">
      {[...groups.entries()].map(([group, list]) => (
        <section key={group} className="cards-row" data-group={group}>
          <h4>
            {group}
            {list[0].pool ? <Pips pool={list[0].pool} /> : null}
          </h4>
          <div className="cards-row-cards" style={{ ["--count" as string]: list.length }}>
            {list.map((card, index) => (
              <AbilityCard key={card.id} session={session} character={character} card={card} index={index} restoredAt={restored.indexOf(card.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Pips({ pool }: { pool: { max: number; used: number } }) {
  return (
    <span className="cards-pips" title={`${pool.max - pool.used} of ${pool.max} slots left`}>
      {Array.from({ length: pool.max }, (_, i) => (
        <i key={i} className={i < pool.max - pool.used ? "on" : ""} />
      ))}
    </span>
  );
}

// One card: front (picture, name, level), back (its words and what it does).
export function AbilityCard({ session, character, card, index, restoredAt = -1 }: { session: Session; character: TableRecord; card: Card; index: number; restoredAt?: number }) {
  const [flipped, setFlipped] = useState(false);
  const [casting, setCasting] = useState(0);
  const [hover, setHover] = useState(false);
  const face = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const school = SCHOOLS[card.school as keyof typeof SCHOOLS] ?? SCHOOLS.evocation;
  const still = card.art && card.recordId ? session.recordArtUrl(card.recordId, "portrait") : "";
  const moving = card.art && card.recordId ? session.recordArtUrl(card.recordId, "card") : "";

  useEffect(() => {
    if (!casting) return;
    const timer = window.setTimeout(() => setCasting(0), 1400);
    return () => window.clearTimeout(timer);
  }, [casting]);
  // Used from the map (dropped on a token): it flares here too.
  useEffect(() => {
    const onUsed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === card.id) setCasting(Date.now());
    };
    window.addEventListener("kraken-card-used", onUsed);
    return () => window.removeEventListener("kraken-card-used", onUsed);
  }, [card.id]);
  // The loop plays only under the pointer, so a hand of cards costs nothing at rest.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (hover) void element.play().catch(() => undefined);
    else element.pause();
  }, [hover]);

  const entry = session.combat.entries.find((item) => item.recordId === character.id);
  const use = (event?: React.MouseEvent) => {
    event?.stopPropagation();
    setCasting(Date.now());
    if (card.kind === "spell") session.ct("cast", { recordId: character.id, power: card.name });
    else session.ct("attack", { recordId: character.id, weapon: card.weapon });
  };
  const damage = (event: React.MouseEvent) => {
    event.stopPropagation();
    session.ct("damage-roll", { recordId: character.id, weapon: card.weapon });
  };
  // The foil follows the pointer.
  const onMove = (event: React.PointerEvent) => {
    const box = face.current?.getBoundingClientRect();
    if (!box) return;
    face.current!.style.setProperty("--mx", `${((event.clientX - box.left) / box.width) * 100}%`);
    face.current!.style.setProperty("--my", `${((event.clientY - box.top) / box.height) * 100}%`);
    face.current!.style.setProperty("--tilt-x", `${((event.clientY - box.top) / box.height - 0.5) * -10}deg`);
    face.current!.style.setProperty("--tilt-y", `${((event.clientX - box.left) / box.width - 0.5) * 12}deg`);
  };
  const classes = ["kcard", flipped ? "flipped" : "", card.spent ? "spent" : "", casting ? "casting" : "", card.concentrating ? "concentrating" : "", restoredAt >= 0 ? "restored" : "", hover ? "hover" : ""].filter(Boolean).join(" ");
  return (
    <div
      ref={face}
      className={classes}
      data-card={card.id}
      data-kind={card.kind}
      data-spent={card.spent ? "yes" : "no"}
      style={{ ["--school" as string]: school.color, ["--i" as string]: index, ["--rest-delay" as string]: `${Math.max(0, restoredAt) * 90}ms` }}
      role="button"
      tabIndex={0}
      aria-label={`${card.name}${card.spent ? " (no slot left)" : ""}: turn over`}
      onClick={() => setFlipped((value) => !value)}
      onContextMenu={(event) => {
        event.preventDefault();
        setFlipped((value) => !value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setFlipped((value) => !value);
        }
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerMove={onMove}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(CARD_DRAG, JSON.stringify({ id: card.id, recordId: character.id, entryId: entry?.id ?? "", kind: card.kind, name: card.name, weapon: card.weapon ?? "" }));
        if (card.recordId) event.dataTransfer.setData("text/kraken-slot", JSON.stringify({ kind: "record", record: card.recordId, label: card.name }));
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="kcard-inner">
        <div className="kcard-face kcard-front">
          <div className="kcard-art">
            {still ? <img src={still} alt="" draggable={false} loading="lazy" onError={(event) => (event.currentTarget.style.display = "none")} /> : null}
            {moving && hover ? <video ref={video} src={moving} muted loop playsInline onError={(event) => (event.currentTarget.style.display = "none")} /> : null}
            <span className="kcard-glyph">
              <Icon name={school.glyph} size={56} />
            </span>
          </div>
          <span className="kcard-level" title={card.kind === "weapon" ? "Weapon" : card.level ? `Level ${card.level}` : "Cantrip"}>
            {card.kind === "weapon" ? <Icon name="combat" size={14} /> : card.level || "∞"}
          </span>
          {card.concentration ? (
            <span className="kcard-conc" title="Concentration">
              C
            </span>
          ) : null}
          <div className="kcard-title">
            <b>{card.name}</b>
            <small>{card.kind === "weapon" ? card.range : `${card.school[0].toUpperCase()}${card.school.slice(1)} · ${card.castingtime || "Action"}`}</small>
          </div>
          <div className="kcard-foil" />
        </div>
        <div className="kcard-face kcard-back">
          <b className="kcard-back-name">{card.name}</b>
          <dl className="kcard-facts">
            {card.castingtime ? (
              <>
                <dt>Time</dt>
                <dd>{card.castingtime}</dd>
              </>
            ) : null}
            {card.range ? (
              <>
                <dt>Range</dt>
                <dd>{card.range}</dd>
              </>
            ) : null}
            {card.duration ? (
              <>
                <dt>Lasts</dt>
                <dd>{card.duration}</dd>
              </>
            ) : null}
          </dl>
          <p className="kcard-text">{card.text || "No description in the books."}</p>
          <div className="kcard-actions">
            {card.kind === "spell" ? (
              <button type="button" data-action="card-cast" disabled={card.spent} title={card.spent ? "No slot of this level left" : card.slot && card.slot > card.level ? `Cast with a level ${card.slot} slot` : "Cast it"} onClick={use}>
                Cast
              </button>
            ) : (
              <>
                <button type="button" data-action="card-attack" onClick={use}>
                  Attack
                </button>
                <button type="button" data-action="card-damage" onClick={damage}>
                  Damage
                </button>
              </>
            )}
            {card.concentrating ? (
              <button
                type="button"
                className="ghost"
                data-action="card-end-concentration"
                title="Stop concentrating on it"
                onClick={(event) => {
                  event.stopPropagation();
                  session.editCharacter(character.id, [{ path: "concentration", value: "" }]);
                }}
              >
                End
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {casting ? (
        <div key={casting} className="kcard-sparks" data-sparks={card.sparks} aria-hidden="true">
          {Array.from({ length: SPARK_COUNT }, (_, i) => (
            <i key={i} style={{ ["--s" as string]: i, ["--x" as string]: `${(i * 37) % 100}%`, ["--d" as string]: `${(i * 53) % 400}ms` }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
