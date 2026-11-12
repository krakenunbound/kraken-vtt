import { useEffect, useRef } from "react";
import type { RollResult, Session } from "../session/useSession";

// A wizard's roll, made by the host (in chat for the table) and answered back:
// the roll carries a tag, and the chat line with that tag resolves it. All of
// chat is looked through while a roll is waited for (chat is trimmed, and
// several lines can land in one update), and a roll the host never answers
// fails after 30 seconds instead of leaving the wizard waiting.
export function useHostRolls(session: Session, labelOf: (label: string) => string = (label) => label) {
  const waiting = useRef(new Map<string, { resolve: (roll: RollResult) => void; reject: (error: Error) => void; timer: number }>());
  useEffect(() => {
    if (!waiting.current.size) return;
    for (const line of session.chat) {
      const tag = line.roll?.tag;
      const entry = tag ? waiting.current.get(tag) : undefined;
      if (tag && entry && line.roll) {
        waiting.current.delete(tag);
        window.clearTimeout(entry.timer);
        entry.resolve(line.roll);
      }
    }
  }, [session.chat]);
  useEffect(
    () => () => {
      for (const entry of waiting.current.values()) window.clearTimeout(entry.timer);
      waiting.current.clear();
    },
    [],
  );
  return (formula: string, label: string) =>
    new Promise<RollResult>((resolve, reject) => {
      const tag = `wiz-${Math.random().toString(36).slice(2)}`;
      const timer = window.setTimeout(() => {
        waiting.current.delete(tag);
        reject(new Error("The host did not answer the roll: try again."));
      }, 30000);
      waiting.current.set(tag, { resolve, reject, timer });
      session.roll(formula, labelOf(label), tag);
    });
}
