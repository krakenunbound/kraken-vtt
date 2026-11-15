import type { Cond, TrackerAction, Words } from "../../../shared/rulesets/types";
import type { CombatEntry, Session } from "../../session/useSession";
import { messageSender } from "../sender";

// The combat tracker's ruleset buttons, from the manifest's tracker
// (docs/core-ui-design.md 7.9): a row's actions (a dying character's save,
// Turn undead on the cleric's turn, an NPC's morale) and the GM's header
// buttons, each shown by a declarative condition on the row and the viewer.

export interface TrackerView {
  session: Session;
  gm: boolean;
  // The viewer's own character, for a player (the one that steadies a dying ally); "" for the GM.
  myCharacterId: string;
}
type Scope = TrackerView & { entry?: CombatEntry };

const look = (entry: CombatEntry | undefined, path: string): unknown => path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), entry);
const present = (value: unknown) => value !== undefined && value !== null && value !== "" && value !== false && value !== 0;

// A condition on a tracker row (its entry) and who is looking.
export function entryHolds(cond: Cond | undefined, scope: Scope): boolean {
  if (!cond) return true;
  const { entry, gm, session } = scope;
  if ("all" in cond) return cond.all.every((item) => entryHolds(item, scope));
  if ("any" in cond) return cond.any.some((item) => entryHolds(item, scope));
  if ("not" in cond) return !entryHolds(cond.not, scope);
  if ("gm" in cond) return gm;
  if ("viewerHasCharacter" in cond) return Boolean(scope.myCharacterId);
  if ("anyEntry" in cond) return session.combat.entries.some((item) => entryHolds(cond.anyEntry, { ...scope, entry: item }));
  if (!entry) return false;
  if ("gmOrMine" in cond) return gm || Boolean(entry.mine);
  if ("activeTurn" in cond) return session.combat.active === entry.id;
  if ("status" in cond) return (Array.isArray(cond.status) ? cond.status : [cond.status]).includes(entry.health.status);
  if ("faction" in cond) return cond.faction === "not-friend" ? entry.faction !== "friend" : entry.faction === cond.faction;
  if ("has" in cond) return present(look(entry, cond.has));
  if ("defined" in cond) return look(entry, cond.defined) !== undefined;
  if ("atLeast" in cond) return Number(look(entry, cond.atLeast.path)) >= cond.atLeast.value;
  return false;
}

// "{path}" (or "{path|0}") from the entry.
const fill = (text: string, entry: CombatEntry | undefined) =>
  text.replace(/\{([^{}|]+)(?:\|([^{}]*))?\}/g, (_, path: string, fallback?: string) => {
    const value = look(entry, path);
    return value === undefined || value === null ? (fallback ?? "") : String(value);
  });
// Words as text nodes: a list is one node per item, as JSX writes "Morale {morale}".
export function wordsOf(words: Words | undefined, scope: Scope): string[] {
  if (words === undefined) return [];
  if (Array.isArray(words)) return words.flatMap((item) => wordsOf(item, scope));
  if (typeof words === "string") return [fill(words, scope.entry)];
  return wordsOf(entryHolds(words.if, scope) ? words.then : words.else, scope);
}
export const textOfWords = (words: Words | undefined, scope: Scope) => (words === undefined ? undefined : wordsOf(words, scope).join(""));

// A button's call: a tracker message (with the row's entry), or a ruleset message on the row's record.
function press(action: TrackerAction, scope: Scope) {
  const { session, entry } = scope;
  const call = action.call;
  if ("ct" in call) {
    const extra = call.with === "record" ? entry?.recordId : call.with === "viewer" ? scope.myCharacterId : "";
    session.ct(call.ct, { ...(entry ? { id: entry.id } : {}), ...(call.args ?? {}), ...(extra ? { recordId: extra } : {}) });
    return;
  }
  const send = messageSender(session, call.message);
  if (send) void send(entry?.recordId ?? "", call.action);
}

// The manifest's buttons for one row (or the header, without an entry), in the manifest's order; className: their class unless they name one.
export function TrackerButtons({ actions, scope, className }: { actions: TrackerAction[] | undefined; scope: Scope; className?: string }) {
  return (
    <>
      {(actions ?? []).map((action) =>
        entryHolds(action.when, scope) ? (
          <button key={action.hook} type="button" className={action.className ?? className} data-action={action.hook} title={textOfWords(action.title, scope)} disabled={action.disabled ? entryHolds(action.disabled, scope) : undefined} onClick={() => press(action, scope)}>
            {wordsOf(action.label, scope)}
          </button>
        ) : null,
      )}
    </>
  );
}
