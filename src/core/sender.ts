import type { Session } from "../session/useSession";

// A ruleset message's sender: the manifest's host.message ("cairn") is the
// session's <message>Action (session.cairnAction(recordId, action, args)).
// A game whose session sender is the message's own name takes the action
// first (session.ironsworn(action, recordId, args)). Null for a message the
// session has no sender for.
export function messageSender(session: Session, message: string): ((id: string, action: string, args?: Record<string, unknown>) => unknown) | null {
  const fields = session as unknown as Record<string, unknown>;
  const send = fields[`${message}Action`];
  if (typeof send === "function") return (id, action, args) => (send as (...rest: unknown[]) => unknown).call(session, id, action, args);
  const named = fields[message];
  return typeof named === "function" ? (id, action, args) => (named as (...rest: unknown[]) => unknown).call(session, action, id, args) : null;
}
