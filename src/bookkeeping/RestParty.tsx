import { useState } from "react";
import type { Session } from "../session/useSession";
import { rulesetFor } from "../../shared/rulesets/registry.mjs";
import { RestButtons } from "./RestButtons";
import "./bookkeeping.css";

// Rest the party (the GM's, on the party sheet and under the combat tracker once the fight is over):
// every member takes the game's short or long rest, and the calendar moves on by it.
export function RestParty({ session, className = "party-rest" }: { session: Session; className?: string }) {
  const rests = rulesetFor(session.ruleset ?? "").bookkeeping?.rest;
  const [line, setLine] = useState("");
  if (!rests || session.role !== "dm") return null;
  return (
    <div className={className} data-part="rest-party">
      <RestButtons session={session} rests={rests} party onError={setLine} onDone={setLine} />
      {line ? (
        <p className="hint" role="status">
          {line}
        </p>
      ) : null}
    </div>
  );
}
