// The dice, chat and combat flow on the host (docs/feature-parity.md D3-D10):
// links on chat lines (each player opens only what they may see; an
// unidentified item by its unidentified name) and the GM's Share; speakers'
// portraits (a character, a creature the GM speaks or rolls as); the party's
// group roll for checks, saves and skills, rolled for them or asked of the
// players (each owner rolls their own with their modifier box, the GM anyone's,
// a summary at the end); group initiative by kind; skip turns, NPC numbering;
// creatures' health in the tracker from the token option; Delay and Act now.
import "./loopback.mjs";
import { WebSocket } from "ws";
import { createRequire } from "node:module";

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
    const seat = { ws, lines: [], errors: [], prompts: [], combat: null, records: new Map(), send: (body) => ws.send(JSON.stringify(body)) };
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "chat") seat.lines.push(msg);
      if (msg.type === "error") seat.errors.push(msg.reason);
      if (msg.type === "prompt") seat.prompts.push(msg.prompt);
      if (msg.type === "combat") seat.combat = msg.combat;
      if (msg.type === "record") seat.records.set(msg.record.id, msg.record);
      if (msg.type === "no") reject(new Error(`join refused: ${msg.reason}`));
      if (msg.type === "ok") {
        for (const record of msg.records ?? []) seat.records.set(record.id, record);
        if (msg.combat) seat.combat = msg.combat;
        resolve(seat);
      }
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
const lastLine = (seat, test = () => true) => [...seat.lines].reverse().find(test);

// The Session Log's archive (the backend's is the campaign folder's chat-logs).
const store = new Map();
const archive = { save: (id, lines) => store.set(id, lines), read: (id) => store.get(id) ?? null };
const server = createTableServer({ ruleset: "D&D 5E", archive });
let stopped = false;
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const agent = server.agent;
  const ctx = { table: () => server };
  const tool = async (name, args) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const ct = (args) => tool("kraken_combat", args);
  const gm = await connect(port, { name: "GM", hostToken });
  const ann = await connect(port, { name: "a test player" });
  const bob = await connect(port, { name: "Bob" });

  const abilities = Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => [stat, { score: 12, bonus: 1, save: 1 }]));
  const hero = agent.records.create({ type: "character", name: "Hagar", owner: "a test player", visibility: "owner", data: { ruleset: "dnd5e", level: 1, prof: 2, hp: { total: 12, wounds: 0 }, abilities, skills: { stealth: { name: "Stealth", total: 1 } } } }, agent.seat);
  const mira = agent.records.create({ type: "character", name: "Mira", owner: "Bob", visibility: "owner", data: { ruleset: "dnd5e", level: 1, prof: 2, hp: { total: 10, wounds: 0 }, abilities, skills: { stealth: { name: "Stealth", total: 1 } } } }, agent.seat);
  const secret = agent.records.create({ type: "item", name: "Sword of Kas", visibility: ["a test player"], data: { isidentified: 0, nonid_name: "Black sword", nonid_notes: "<p>A cold black blade.</p>", description: "<p>The vampire's own blade.</p>" } }, agent.seat);
  await settle();

  // D3: a link on a line; Ann may open the item (shared with her), Bob may not; both see the unidentified name.
  gm.send({ type: "chat", text: "Look at this", link: { kind: "record", record: secret.id, label: "Sword of Kas" } });
  await settle();
  const annLink = lastLine(ann, (line) => line.link);
  const bobLink = lastLine(bob, (line) => line.link);
  assert(annLink?.link.record === secret.id && annLink.link.label === "Black sword", `a player sees the link by the unidentified name: ${JSON.stringify(annLink?.link)}`);
  assert(ann.records.has(secret.id) && !bob.records.has(secret.id), "the item is Ann's to open, not Bob's (the chip opens only what the host sent the seat)");
  assert(lastLine(gm, (line) => line.link)?.link.label === "Sword of Kas", "the GM sees its real name");
  assert(bobLink?.link.label === "Black sword", "Bob sees the line too, the name hidden");
  // The GM's Share: the record's words as the players know it.
  gm.send({ type: "chat", text: "", link: { kind: "record", record: secret.id, label: "Sword of Kas" }, share: true });
  await settle();
  const shared = lastLine(bob, (line) => line.share);
  assert(shared && shared.share.name === "Black sword" && /cold black blade/.test(shared.share.text) && !/vampire/.test(JSON.stringify(shared)), `the share is the unidentified item's: ${JSON.stringify(shared?.share)}`);
  ann.send({ type: "chat", text: "Mine", link: { kind: "record", record: secret.id, label: "x" }, share: true });
  await settle();
  assert(!lastLine(gm, (line) => line.text === "Mine")?.share, "a player's line carries the link but never a share");
  const viaTool = await tool("kraken_chat_send", { text: "The sword", link: { kind: "record", record: secret.id, label: "Sword of Kas" }, share: true });
  assert(viaTool.share?.name === "Black sword", "kraken_chat_send's share");
  done.push("D3 links on lines, per-player visibility, unidentified names, the GM's Share (and the tool)");

  // D4: speaker portraits: a player speaking as their character, the GM as an NPC (/id), a tracker roll for a creature.
  const goblin = agent.records.create({ type: "npc", name: "Goblin", data: { hp: 7, ac: 13 } }, agent.seat);
  ann.send({ type: "chat", text: "I draw my axe", as: "Hagar" });
  gm.send({ type: "chat", text: "Grr!", as: "Goblin" });
  await settle();
  assert(lastLine(bob, (line) => line.text === "I draw my axe")?.recordId === hero.id, "a character's line carries its record");
  assert(lastLine(bob, (line) => line.text === "Grr!")?.recordId === goblin.id, "the GM speaking as an NPC: its record");
  ann.send({ type: "chat", text: "Hagar the GM?", as: "Goblin" });
  await settle();
  assert(!lastLine(gm, (line) => line.text === "Hagar the GM?")?.recordId || lastLine(gm, (line) => line.text === "Hagar the GM?")?.recordId === hero.id, "a player cannot speak as the GM's NPC");
  done.push("D4 speakers' records on lines (character, the GM's NPC)");

  // D6: the party's group roll: a 5E skill, rolled for them; then asked of the players.
  await tool("kraken_party_edit", { members: [hero.id, mira.id] });
  let party = await tool("kraken_party", {});
  if (!party.members?.length) {
    // The party's members by the party record (older tool forms).
    agent.records.update("party", { data: { members: [hero.id, mira.id] } }, agent.seat);
    party = await tool("kraken_party", {});
  }
  assert(party.members.length === 2, `two members: ${JSON.stringify(party.members)}`);
  agent.dice.force([15, 4]);
  const rolled = await tool("kraken_party_group_check", { kind: "skill", skill: "stealth", dc: 12 });
  assert(rolled.of === 2 && rolled.passed === 1 && /Group skill: Stealth \(DC 12\): 1 of 2 succeed/.test(rolled.line), `a group Stealth check: ${rolled.line}`);
  const asked = await tool("kraken_party_group_check", { kind: "save", attribute: "dexterity", dc: 13, mode: "ask" });
  await settle();
  const card = lastLine(ann, (line) => line.prompt)?.prompt;
  assert(card && card.id === asked.prompt && card.rows.length === 2 && card.label === "Group save: Dexterity (DC 13)", `the asked card: ${JSON.stringify(card)}`);
  // Bob may not roll Hagar's; Ann rolls hers, with her modifier box (+2).
  bob.send({ type: "party-prompt-roll", prompt: card.id, member: hero.id });
  await settle();
  assert(bob.errors.some((reason) => /not yours/.test(reason)), "a player rolls only their own row");
  ann.send({ type: "modifiers", action: "add", value: 2, label: "Bless" });
  await settle();
  agent.dice.force([10]);
  ann.send({ type: "party-prompt-roll", prompt: card.id, member: hero.id });
  await settle(250);
  let update = bob.prompts.at(-1);
  const annRow = update?.rows.find((row) => row.id === hero.id);
  assert(annRow?.total === 10 + 1 + 2 && annRow.success === true, `Ann's row: 10 + 1 + her +2 = 13 against 13: ${JSON.stringify(annRow)}`);
  const annRoll = lastLine(gm, (line) => line.roll && /GROUP SAVE/.test(line.roll.label))?.roll;
  assert(annRoll?.mods?.some((mod) => mod.label === "Bless"), "her roll lists her modifier");
  ann.send({ type: "party-prompt-roll", prompt: card.id, member: hero.id });
  await settle();
  assert(ann.errors.some((reason) => /rolled already/.test(reason)), "a row is rolled once");
  // The GM rolls for Bob's (offline, say) through the tool.
  agent.dice.force([3]);
  await tool("kraken_party_group_check", { action: "prompt-roll", prompt: card.id, member: mira.id });
  await settle();
  update = ann.prompts.at(-1);
  assert(update.done && update.rows.every((row) => row.total !== undefined), "every row rolled");
  assert(/Group save: Dexterity \(DC 13\): 1 of 2 succeed\. Failed: Mira\./.test(lastLine(bob, (line) => /Group save/.test(line.text) && !line.prompt)?.text ?? ""), "the summary line");
  done.push("D6 group skill rolled for them; a save asked of the players (own rows only, the modifier box, once each, the GM for anyone, the summary)");

  // D7: group initiative by kind: three goblins share one roll; Hagar rolls his own.
  for (let i = 0; i < 3; i += 1) await ct({ action: "add", recordId: goblin.id });
  await ct({ action: "add", recordId: hero.id });
  let view = await ct({ action: "view" });
  assert(view.entries.filter((entry) => /^Goblin \d$/.test(entry.name)).length === 3, `NPC numbering appends: ${view.entries.map((entry) => entry.name)}`);
  await tool("kraken_table_options", { initGroup: "kind" });
  agent.dice.force([14, 6]);
  const before = agent.chatLog(400).filter((line) => /^\[INIT\]/.test(line.roll?.label ?? "")).length;
  await ct({ action: "init", which: "all" });
  view = await ct({ action: "view" });
  const goblins = view.entries.filter((entry) => /^Goblin/.test(entry.name));
  const inits = agent.chatLog(400).filter((line) => /^\[INIT\]/.test(line.roll?.label ?? "")).length - before;
  assert(inits === 2 && new Set(goblins.map((entry) => entry.initresult)).size === 1, `one roll for the goblins, one for Hagar: ${inits} rolls, ${goblins.map((entry) => entry.initresult)}`);
  await tool("kraken_table_options", { initGroup: "each" });
  done.push("D7 initiative by kind: the copies share one roll");

  // D10: random numbering; the tracker's health from the token option; skip; Delay and Act now.
  await tool("kraken_table_options", { npcNumbering: "random" });
  const added = await ct({ action: "add", recordId: goblin.id });
  view = await ct({ action: "view" });
  const fourth = view.entries.find((entry) => entry.name.startsWith("Goblin") && !goblins.some((item) => item.id === entry.id));
  assert(fourth && /^Goblin \d+$/.test(fourth.name) && added, `a random number: ${fourth?.name}`);
  await tool("kraken_table_options", { npcNumbering: "append" });
  const goblinRow = (seat) => seat.combat.entries.find((entry) => entry.id === goblins[0].id);
  await ct({ action: "damage", id: goblins[0].id, amount: 3 });
  for (const [shows, test] of [
    ["off", (row) => row.health.status === "" && row.hp === undefined && row.bar === undefined],
    ["dot", (row) => row.health.status !== "" && row.hp === undefined && row.bar === undefined],
    ["bar", (row) => row.health.status !== "" && row.hp === undefined && Math.abs(row.bar - 4 / 7) < 0.01],
    ["numbers", (row) => row.hp === 7 && row.wounds === 3 && row.ac === undefined],
  ]) {
    await tool("kraken_table_options", { healthNpc: shows });
    await settle();
    assert(test(goblinRow(bob)), `players' tracker with health ${shows}: ${JSON.stringify(goblinRow(bob))}`);
  }
  assert(goblinRow(gm).hp === 7 && goblinRow(gm).ac !== undefined, "the GM always sees the numbers");
  await tool("kraken_table_options", { healthNpc: "dot" });
  // Delay: on its own turn the goblin waits; Act now brings it back after the one acting.
  await ct({ action: "set-turn", id: goblins[1].id });
  await ct({ action: "delay", id: goblins[1].id });
  view = await ct({ action: "view" });
  assert(view.active !== goblins[1].id && view.entries.find((entry) => entry.id === goblins[1].id).delayed, "Delay: the turn passes, the row marked");
  const acting = view.active;
  // A player may not delay a creature.
  ann.send({ type: "ct", action: "act-now", id: goblins[1].id });
  await settle();
  assert(ann.errors.some((reason) => /not yours/.test(reason)), "a player cannot act now for the GM's creature");
  await ct({ action: "act-now", id: goblins[1].id });
  view = await ct({ action: "view" });
  const again = view.entries.find((entry) => entry.id === goblins[1].id);
  assert(view.active === goblins[1].id && !again.delayed && again.initresult === view.entries.find((entry) => entry.id === acting).initresult, "Act now: its turn now, the initiative of the one acting");
  await ct({ action: "next" });
  view = await ct({ action: "view" });
  assert(view.active !== acting && view.active !== goblins[1].id, `after it, the order goes on past the one it cut in after (${view.entries.find((entry) => entry.id === view.active)?.name})`);
  // Skip turns: off keeps a dead goblin's turn.
  await ct({ action: "damage", id: goblins[2].id, amount: 50 });
  await tool("kraken_table_options", { skipDead: "off" });
  await ct({ action: "set-turn", id: goblins[2].id });
  view = await ct({ action: "view" });
  assert(view.active === goblins[2].id, "set-turn to the dead goblin");
  await tool("kraken_table_options", { skipDead: "enemies" });
  done.push("D10 random numbering, the tracker's health off/dot/bar/numbers for players, Delay and Act now, skip turns");

  // D8: a table rolled by a player (/rollon) follows their roll mode; its result's link rides on the card.
  agent.records.create({ type: "table", name: "Rumours", visibility: "all", data: { dice: "d2", mod: 0, resultscols: 1, tablerows: { "id-1": { fromrange: 1, torange: 1, results: { "id-1": { result: "The mill is haunted" } } }, "id-2": { fromrange: 2, torange: 2, results: { "id-1": { result: "Sir Aldric owes money" } } } } } }, agent.seat);
  await settle();
  ann.send({ type: "modifiers", action: "mode", mode: "gm" });
  await settle();
  const bobBefore = bob.lines.length;
  agent.dice.force([1]);
  ann.send({ type: "table-roll", action: "roll", name: "Rumours", req: 9 });
  await settle(250);
  const rumour = lastLine(gm, (line) => /^\[TABLE\] Rumours/.test(line.roll?.label ?? ""));
  assert(rumour?.secret && rumour.shownTo === "a test player" && bob.lines.length === bobBefore && /haunted/.test(rumour.roll.label), `a player's /rollon in GM-and-me mode: ${JSON.stringify(rumour)}`);
  ann.send({ type: "modifiers", action: "mode", mode: "public" });
  await settle();
  done.push("D8 a player's table roll follows their roll mode");

  // The Session Log: this sitting's lines, exported as Markdown and HTML; archived when the table closes, read back after.
  const sessions = await tool("kraken_chat_log", { action: "sessions" });
  assert(sessions.length === 1 && sessions[0].current && sessions[0].lines > 10, `one session so far: ${JSON.stringify(sessions)}`);
  const md = await tool("kraken_chat_log", { action: "export", format: "md" });
  assert(md.file.endsWith(".md") && /^# session of/.test(md.text) && /Look at this/.test(md.text) && /\(1d20\+?[^)]*\) = \d+/.test(md.text), `the Markdown: ${md.text.slice(0, 200)}`);
  const html = await tool("kraken_chat_log", { action: "export", format: "html" });
  assert(/^<!doctype html>/.test(html.text) && /<li class="roll">/.test(html.text) && !/<script/i.test(html.text), "the HTML page");
  ann.send({ type: "chat-log", action: "sessions", req: 5 });
  await settle();
  for (const seat of [gm, ann, bob]) seat.ws.close();
  const saved = server.persisted();
  await server.stop();
  stopped = true;
  assert(store.size === 1, "the sitting's chat archived when the table closed");
  const reopened = createTableServer({ ruleset: "D&D 5E", archive, saved });
  const logged = reopened.agent.sessionLog({ action: "sessions" });
  const old = logged.find((item) => !item.current);
  assert(logged.length === 2 && old.lines >= sessions[0].lines, `the old session read back: ${JSON.stringify(logged)}`);
  const oldMd = reopened.agent.sessionLog({ action: "export", id: old.id, format: "md" });
  assert(/Look at this/.test(oldMd.text), "its export after a restart");
  await reopened.stop();
  done.push("the Session Log: sessions, Markdown and HTML exports, archived on close and read back after a restart");

  console.log(`check-chat-flow: ${done.length} groups passed`);
  for (const line of done) console.log(`  ok ${line}`);
} finally {
  if (!stopped) await server.stop();
}
