import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Session } from "../session/useSession";
import { Picture } from "../characters/ArtPicker";
import { diceStore } from "../dice/diceStore";
import { Icon } from "../ui/icons";

// Whose turn it is, for every seat (FG's turn and round overlays, done as a
// card): the acting creature's portrait, its name under it, and a round marker
// when a round begins. A player's own turn has the big banner instead. A
// creature the players may not see never shows on their screens.
export function TurnCard({ session }: { session: Session }) {
  const settings = useSyncExternalStore(diceStore.subscribe, diceStore.settings);
  const { round, active, entries } = session.combat;
  const entry = entries.find((item) => item.id === active) ?? null;
  const [shown, setShown] = useState<{ key: string; newRound: boolean } | null>(null);
  const last = useRef({ key: "", round: 0 });
  useEffect(() => {
    const key = round > 0 && entry ? `${round}:${entry.id}` : "";
    if (key && key !== last.current.key && settings.turnCard !== false && !(entry?.mine && session.role !== "dm" && settings.turnBanner !== false)) {
      setShown({ key, newRound: round !== last.current.round });
    }
    if (!key) setShown(null);
    last.current = { key, round };
  }, [round, entry?.id]);
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), 3200);
    return () => window.clearTimeout(timer);
  }, [shown]);
  if (!shown || !entry) return null;
  const record = entry.recordId ? session.records[entry.recordId] : null;
  const portrait = typeof record?.data?.portrait === "string" ? (record.data.portrait as string) : null;
  const tokenArt = session.map.tokens.find((token) => token.id === entry.tokenId || (entry.recordId && token.recordId === entry.recordId))?.art;
  return (
    <div key={shown.key} className={`turn-card faction-${entry.faction}`} role="status" data-turn-card={entry.name} onClick={() => setShown(null)}>
      {shown.newRound ? (
        <span className="turn-card-round" data-turn-round={round}>
          <Icon name="flag" size={14} /> Round {round}
        </span>
      ) : null}
      <span className="turn-card-face">
        {portrait ? (
          <Picture session={session} id={portrait} alt="" still />
        ) : tokenArt ? (
          <img src={tokenArt} alt="" />
        ) : record && record.type === "npc" && (record.data.token || record.data.picture) ? (
          <img src={session.recordArtUrl(record.id)} alt="" />
        ) : (
          <b>{entry.name.slice(0, 1)}</b>
        )}
      </span>
      <span className="turn-card-name">
        {entry.name}
        <small>{entry.mine ? "your turn" : "takes their turn"}</small>
      </span>
    </div>
  );
}
