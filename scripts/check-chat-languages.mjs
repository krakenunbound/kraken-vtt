// Chat languages (FG's chat language menu): a line spoken in Orc reads as Orc
// to the seats whose characters know it (and to who said it); the others get
// its sounds, the same length or near it, never the words; the GM sees the
// words and who understood. A player may speak only a language their
// character knows; the GM any. The agent's chat tool speaks one too, and the
// GM's own list is a table option. A seat joining later reads the same.
import "./loopback.mjs";
import { WebSocket } from "ws";
import { createRequire } from "node:module";
import { garble, knownLanguages, knows, sameLanguage, gameLanguages } from "../shared/text/languages.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

const done = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const seat = { ws, lines: [], errors: [], joinChat: [], send: (body) => ws.send(JSON.stringify(body)) };
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") seat.lines.push(msg);
      if (msg.type === "error") seat.errors.push(msg.reason);
      if (msg.type === "no") reject(new Error(`join refused: ${msg.reason}`));
      if (msg.type === "ok") {
        seat.joinChat = msg.chat ?? [];
        resolve(seat);
      }
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
const last = (seat) => seat.lines[seat.lines.length - 1];

// The rules alone.
assert(knownLanguages({ languages: ["Common", "Orc"] }).join() === "Common,Orc", "a list");
assert(knownLanguages({ languages: "Common, Elvish (read only); Dwarvish" }).join() === "Common,Elvish,Dwarvish", "a line");
assert(knownLanguages({ languagelist: { "id-1": { name: "Goblin" } } }).join() === "Goblin", "the sheet's rows");
assert(sameLanguage("Elven", "Elvish") && sameLanguage("orc", "Orcish") && !sameLanguage("Orc", "Elvish"), "names match across books");
assert(knows({ languages: ["Dwarven"] }, "Dwarvish"), "a 3.5E name is a 5E name");
const said = "We attack at dawn, Grukk!";
const sounds = garble(said, "Orc");
assert(sounds !== said && !/attack|dawn|Grukk/i.test(sounds) && sounds === garble(said, "Orc") && sounds !== garble(said, "Elvish"), `its sounds: ${sounds}`);
assert(/,/.test(sounds) && /!$/.test(sounds), "the sounds keep the line's stops");
assert(gameLanguages("dnd5e").includes("Orc") && gameLanguages("dnd5e").includes("Thieves' Cant") && gameLanguages("fate").length === 0, "each game's own list");
done.push("what a character knows, names across books, the sounds in place of words, each game's list");

const server = createTableServer({ ruleset: "D&D 5E" });
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  agent.records.create({ type: "character", name: "Grukk", owner: "Ann", visibility: "owner", data: { ruleset: "dnd5e", languages: ["Common", "Orc"] } }, agent.seat);
  agent.records.create({ type: "character", name: "Liriel", owner: "Bob", visibility: "owner", data: { ruleset: "dnd5e", languages: ["Common", "Elvish"] } }, agent.seat);
  const gm = await connect(port, { name: "GM", hostToken });
  const ann = await connect(port, { name: "Ann" });
  const bob = await connect(port, { name: "Bob" });
  await settle();

  ann.send({ type: "chat", text: said, as: "Grukk", lang: "Orc" });
  await settle();
  assert(last(gm).text === said && last(gm).lang === "Orc" && last(gm).understood?.join() === "Grukk", `the GM reads it and who understood: ${JSON.stringify(last(gm))}`);
  assert(last(ann).text === said && !last(ann).garbled && !last(ann).understood, "who said it reads it");
  assert(last(bob).garbled && last(bob).lang === "Orc" && last(bob).text === garble(said, "Orc") && !last(bob).understood, `Bob hears only Orc: ${JSON.stringify(last(bob))}`);
  done.push("a player's Orc: the GM reads it and who understood, the speaker reads it, the rest hear its sounds");

  ann.send({ type: "chat", text: "Mae govannen", as: "Grukk", lang: "Elvish" });
  await settle();
  assert(ann.errors.some((reason) => /does not speak Elvish/.test(reason)) && last(bob).text !== "Mae govannen", "a player cannot speak what their character does not know");
  done.push("a language the character does not know is refused");

  gm.send({ type: "chat", text: "The guard eyes you", as: "Elf Guard", lang: "Elvish" });
  await settle();
  assert(last(bob).text === "The guard eyes you" && !last(bob).garbled, "Bob's elf reads the GM's Elvish");
  assert(last(ann).garbled && !/guard/i.test(last(ann).text), "Ann's orc does not");
  assert(last(gm).understood?.join() === "Liriel", "the GM sees Liriel understood");
  done.push("the GM speaks any language; each seat reads it by its characters");

  await tool("kraken_chat_send", { text: "Halt, who goes there", as: "Orc Sentry", lang: "orc" });
  await settle();
  assert(last(ann).text === "Halt, who goes there" && last(bob).garbled && last(gm).understood?.join() === "Grukk", "the agent's chat tool speaks a language");
  const options = await tool("kraken_table_options", { languages: ["Old Imperial", " Thieves' Cant ", ""] });
  assert(options.languages?.join("|") === "Old Imperial|Thieves' Cant", `the GM's own list: ${JSON.stringify(options.languages)}`);
  done.push("the agent's chat_send lang and the GM's languages option");

  const carl = await connect(port, { name: "Carl" });
  const heard = carl.joinChat.filter((line) => line.lang);
  assert(heard.length >= 3 && heard.every((line) => !line.understood), "a seat joining later never sees who understood");
  const orcLine = heard.find((line) => line.lang === "Orc" && line.from === "Grukk");
  assert(orcLine && orcLine.text !== said, "nor the words of a language its characters do not know");
  done.push("the chat a joining seat is sent is heard the same way");

  for (const seat of [gm, ann, bob, carl]) seat.ws.close();
  console.log(`check-chat-languages: ${done.length} groups passed`);
  for (const line of done) console.log(`  ok ${line}`);
} finally {
  await server.stop();
}
