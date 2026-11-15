import type { Session } from "../session/useSession";

// A ruleset message's sender: the manifest's host.message ("cairn") is the
// session's <message>Action (session.cairnAction(recordId, action, args)).
// Null for a message the session has no sender for.
export function messageSender(session: Session, message: string): ((id: string, action: string, args?: Record<string, unknown>) => unknown) | null {
  const send = (session as unknown as Record<string, unknown>)[`${message}Action`];
  return typeof send === "function" ? (id, action, args) => (send as (...rest: unknown[]) => unknown).call(session, id, action, args) : null;
}
