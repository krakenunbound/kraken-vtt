// The agent's tools for the dice, chat and combat flow: the modifier stack
// and its keys, chat links and shares, the session log, ask-the-players
// prompts. The same host functions the table's messages call, as the GM.

const out = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const string = (description) => ({ type: "string", description });
const number = (description) => ({ type: "number", description });
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
function needTable(ctx) {
  const table = ctx.table();
  if (!table) throw new Error("Not hosting. Host a campaign first (kraken_host).");
  return table.agent;
}

const TOOLS = [
  {
    name: "kraken_modifiers",
    description:
      "The modifier box beside the dice tray (FG's modifier stack), one per seat: up to six labelled numbers and their total, and the game's keys (5E: adv, dis, plus2, minus2, opp, cover, scover, crit, max, half; Traveller and Apeira Astra: boon, bane; see the chat bar's chips). Every roll the seat starts next reads it (the tray, /roll, a sheet's checks and saves, the tracker's attacks, saves and damage, a cast: every roll of that one action), and what it used is cleared: the numbers, and each key a roll read (ADV only by a d20 roll, Crit only by damage). The card lists what applied. action view; add (value, label: a slot, as a number dropped on the box or /mod); remove (index, as its right-click); set (value: the box's own number); clear; key (key, on: true/false, or a toggle). who: a player's stack (default the GM's, which the agent's own rolls read).",
    inputSchema: object(
      {
        action: { type: "string", enum: ["view", "add", "remove", "set", "clear", "key"] },
        value: number("The number (add, set)"),
        label: string("What the number is for (add), as FG's slot label"),
        index: number("The slot to take off (remove), from 0"),
        key: string("The key's id (key)"),
        on: { type: "boolean", description: "key: on or off (left out: toggled)" },
        who: string("A player's name: their stack (default the GM's)"),
      },
      [],
    ),
    run: (args, ctx) => out(needTable(ctx).modifiers({ ...args, action: args.action ?? "view" }, args.who || "@gm")),
  },
];

module.exports = { TOOLS };
