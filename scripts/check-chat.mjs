// The chat's commands on the host, as FG's and Foundry's: whispers reach the
// one they are to and the GM, and nobody else; emotes, actions, out of
// character and moods; the GM's story text and speaking as an NPC (refused
// from players); Foundry's roll modes (the GM and you, the GM alone, you
// alone); /kick, /vote and /save; FG's and Foundry's dice forms; the agent's.
import "./loopback.mjs";
import { WebSocket } from "ws";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { createDice } = require("../electron/dice.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const lines = [];
    const errors = [];
    const events = [];
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") lines.push(msg);
      if (msg.type === "error") errors.push(msg.reason);
      events.push(msg);
      if (msg.type === "ok") resolve({ ws, you: msg.you, lines, errors, events, send: (body) => ws.send(JSON.stringify(body)), closed: new Promise((done) => ws.on("close", done)) });
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const last = (seat) => seat.lines.at(-1);

// FG's and Foundry's dice forms.
{
  const dice = createDice({ seed: "chat" });
  dice.force([2, 5, 6, 3]);
  assert(dice.roll("4d6d1").total === 14, "4d6d1 drops the lowest (FG)");
  dice.force([2, 5, 6, 3]);
  assert(dice.roll("4d6k3").total === 14, "4d6k3 keeps the highest three (FG)");
  dice.force([6, 6, 2]);
  assert(dice.roll("1d6!").total === 14 && dice.roll("1d6x").terms[0].rolls.length >= 1, "1d6! explodes");
  dice.force([1, 4]);
  assert(dice.roll("1d6r1").total === 4, "1d6r1 rerolls a 1");
  dice.force([7, 2, 9, 10]);
  assert(dice.roll("4d10cs>=7").total === 3, "4d10cs>=7 counts successes");
  dice.force([1, 2, 3, 3]);
  assert(dice.roll("4dF").total === 1, "4dF is Fate: -1, 0, +1, +1");
  for (const bad of ["1d1!", "3d6q", "2d6+"]) {
    let threw = false;
    try {
      dice.roll(bad);
    } catch {
      threw = true;
    }
    assert(threw, `${bad} is refused`);
  }
}

const saves = [];
const server = createTableServer({ onChange: (kind) => kind === "save" && saves.push(kind) });
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const gm = await connect(port, { name: "GM", hostToken });
  const ann = await connect(port, { name: "Ann" });
  const bob = await connect(port, { name: "Bob" });
  const cal = await connect(port, { name: "Sir Aldric" });

  // A whisper: Ann and the GM see it, Bob does not.
  const before = { bob: bob.lines.length, cal: cal.lines.length };
  gm.send({ type: "chat", text: "The door is trapped.", to: ["Ann"] });
  await settle();
  assert(last(ann).text === "The door is trapped." && last(ann).to[0] === "Ann" && last(gm).text === "The door is trapped.", "the whisper reaches Ann and the GM");
  assert(bob.lines.length === before.bob && cal.lines.length === before.cal, "nobody else");
  ann.send({ type: "chat", text: "I check it.", to: ["GM"] });
  await settle();
  assert(last(gm).text === "I check it." && bob.lines.length === before.bob, "a whisper to the GM");
  bob.send({ type: "chat", text: "Psst", to: ["Sir Aldric"] });
  await settle();
  assert(last(cal).text === "Psst" && last(gm).text === "Psst" && last(ann).text !== "Psst", "the GM sees players' whispers too, as in FG");

  // Kinds of line; the GM's alone refused from players.
  ann.send({ type: "chat", text: "draws her sword", kind: "emote" });
  await settle();
  assert(last(bob).kind === "emote" && last(bob).from === "Ann", "an emote");
  ann.send({ type: "chat", text: "Get out!", kind: "mood", mood: "angry" });
  await settle();
  assert(last(bob).kind === "mood" && last(bob).mood === "angry", "a mood");
  bob.send({ type: "chat", text: "brb", kind: "ooc" });
  await settle();
  assert(last(ann).kind === "ooc", "out of character");
  const storyBefore = bob.lines.length;
  ann.send({ type: "chat", text: "And then the dragon died.", kind: "story" });
  await settle();
  assert(ann.errors.some((reason) => reason.includes("GM")) && bob.lines.length === storyBefore, "a player cannot tell the story");
  gm.send({ type: "chat", text: "The wind howls.", kind: "story" });
  await settle();
  assert(last(bob).kind === "story" && last(bob).gm, "the GM's story text");
  gm.send({ type: "chat", text: "Who goes there?", as: "Gate Guard" });
  ann.send({ type: "chat", text: "Me, the king!", as: "The King" });
  await settle();
  const [guard, king] = bob.lines.slice(-2);
  assert(guard.from === "Gate Guard" && king.from === "Ann", "the GM speaks as an NPC (/id); a player cannot");

  // Foundry's roll modes.
  const rolls = { ann: ann.lines.length, bob: bob.lines.length, gm: gm.lines.length };
  ann.send({ type: "roll", formula: "1d20", label: "Sneak", mode: "gm" });
  await settle();
  assert(last(ann).roll && last(ann).shownTo === "Ann" && last(gm).roll?.label === "Sneak" && bob.lines.length === rolls.bob, "/gmroll: the GM and Ann");
  ann.send({ type: "roll", formula: "1d20", label: "Listen", mode: "blind" });
  await settle();
  assert(!last(ann).roll && last(ann).tower && last(gm).roll?.label === "[BLIND] Listen" && bob.lines.length === rolls.bob, "/blindroll: the GM alone; Ann sees that she rolled");
  ann.send({ type: "roll", formula: "1d20", label: "Hunch", mode: "self" });
  await settle();
  assert(last(ann).roll?.label === "Hunch" && last(ann).self && last(gm).roll?.label !== "Hunch" && bob.lines.length === rolls.bob, "/selfroll: Ann alone");
  ann.send({ type: "roll", formula: "4d6d1", label: "Strength" });
  await settle();
  assert(last(bob).roll?.label === "Strength" && last(bob).roll.terms[0].kept.filter(Boolean).length === 3, "/roll 4d6d1 for everyone");

  // /vote: a question; answers counted for everyone, one each.
  bob.send({ type: "vote", question: "Rest here tonight?" });
  await settle();
  const vote = last(ann).vote;
  assert(vote && vote.question === "Rest here tonight?" && vote.yes.length === 0, "a vote");
  ann.send({ type: "vote-cast", id: vote.id, choice: "yes" });
  bob.send({ type: "vote-cast", id: vote.id, choice: "no" });
  ann.send({ type: "vote-cast", id: vote.id, choice: "no" });
  await settle();
  const tally = cal.events.filter((event) => event.type === "vote").at(-1);
  assert(tally.yes.length === 0 && [...tally.no].sort().join() === "Ann,Bob", `one answer each, changed when asked again: ${JSON.stringify(tally)}`);

  // /save and /kick are the GM's.
  ann.send({ type: "save" });
  await settle();
  assert(saves.length === 0, "a player cannot save");
  gm.send({ type: "save" });
  await settle();
  assert(saves.length === 1, "the GM saves the campaign now");
  ann.send({ type: "kick", name: "Bob" });
  await settle();
  assert(ann.errors.some((reason) => reason.includes("GM")), "a player cannot kick");
  gm.send({ type: "kick", name: "bob" });
  await Promise.race([bob.closed, settle().then(settle)]);
  assert(bob.events.some((event) => event.type === "kicked") && bob.ws.readyState !== WebSocket.OPEN, "the GM kicks Bob");
  assert(server.agent.players().every((seat) => seat.name !== "Bob"), "Bob has left the table");

  // The agent: whisper, emote, vote, kick, save.
  const tool = async (name, args) => JSON.parse((await callTool(name, args, { table: () => server })).content[0].text);
  await tool("kraken_chat_send", { text: "A cold draught.", to: ["Sir Aldric"], as: "Narrator" });
  await settle();
  assert(last(cal).text === "A cold draught." && last(ann).text !== "A cold draught.", "the agent whispers");
  await tool("kraken_chat_send", { text: "The torches gutter.", kind: "story" });
  await settle();
  assert(last(ann).kind === "story", "the agent tells the story");
  await tool("kraken_vote", { question: "Fight or flee?" });
  await settle();
  assert(last(ann).vote?.question === "Fight or flee?" && (await tool("kraken_vote", {})).votes.length === 2, "the agent asks and reads votes");
  await tool("kraken_save", {});
  assert(saves.length === 2, "the agent saves");
  assert((await tool("kraken_kick", { name: "Sir Aldric" })).kicked === "Sir Aldric", "the agent kicks");

  // A whisper is kept in the history for those it was to, and only them.
  const again = await connect(port, { name: "Ann" });
  const history = again.events.find((event) => event.type === "ok").chat;
  assert(history.some((line) => line.text === "The door is trapped.") && !history.some((line) => line.text === "Psst"), "Ann's history has her whisper, not Bob's to Sir Aldric");
  for (const seat of [gm, ann, again]) seat.ws.close();
  console.log("CHAT_OK");
} finally {
  await server.stop();
}
