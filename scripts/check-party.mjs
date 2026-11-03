// The party sheet, by CoreRPG's rules (PartyXPManager, PartyLootManager) and
// SiegeCore's group check: XP split with the remainder to the last member,
// quests and encounters awarded once, coins split with the remainder left in
// the parcel, assigned items handed out, a group check summed up in chat,
// and only the GM may do any of it.
import "./loopback.mjs";
import { createRequire } from "node:module";
import { WebSocket } from "ws";
import { xpShares, coinShares, assignedShares } from "../shared/party/party.mjs";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// CoreRPG's arithmetic.
assert(xpShares(10, ["a", "b", "c"]).map((s) => s.amount).join() === "3,3,4", "10 XP over 3: 3, 3, 4");
assert(xpShares(7, ["a", "b"]).map((s) => s.amount).join() === "4,3", "7 XP over 2: round(3.5) = 4, last 3");
assert(xpShares(2, ["a", "b", "c"]).map((s) => s.amount).join() === "0,0,2", "fewer XP than members: the last gets it");
assert(xpShares(11, ["a", "b", "c"]).map((s) => s.amount).join() === "4,4,3", "11 over 3: 4, 4, 3");
assert(coinShares(31, 3).each === 10 && coinShares(31, 3).left === 1 && coinShares(2, 3).each === 0, "coins: floor share, remainder stays");
assert(assignedShares(1, "A, B").error && assignedShares(5, "A; B").each === 2, "items: more names than items is refused");
console.log("ok party rules");

const server = createTableServer();
const sockets = [];
try {
  const info = await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => JSON.parse((await callTool(name, args, ctx)).content[0].text);
  const agent = server.agent;
  const character = (name, owner, wisdom) =>
    agent.records.create(
      {
        type: "character",
        name,
        owner,
        visibility: "owner",
        data: { level: 1, exp: 0, hp: { total: 10, wounds: 0 }, attributes: { wisdom: { score: wisdom, prime: 0 } }, coins: { "id-00001": { name: "GP", amount: 5 } } },
      },
      agent.seat,
    );
  const ann = character("Aldric", "Ann", 13);
  const bob = character("Borin", "Bob", 9);
  const cy = character("Cyra", "Cy", 16);

  const join = (name, hostToken) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${info.port}`);
      const inbox = [];
      ws.on("message", (raw) => inbox.push(JSON.parse(raw.toString())));
      ws.on("error", reject);
      ws.on("open", () => ws.send(JSON.stringify({ type: "join", name, password: "", hostToken })));
      const poll = setInterval(() => {
        if (inbox.some((m) => m.type === "ok")) {
          clearInterval(poll);
          resolve({ ws, inbox });
        }
      }, 10);
    });
  const latest = async (seat, test, label) => {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const found = [...seat.inbox].reverse().find(test);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    throw new Error(`waiting for ${label}`);
  };
  const player = await join("Ann");
  sockets.push(player.ws);

  const view = await tool("kraken_party_edit", { allPlayers: true });
  assert(view.members.map((m) => m.name).join() === "Aldric,Borin,Cyra", `members ${view.members.map((m) => m.name)}`);

  // XP: 10 over three is 3, 3 and 4 (the last gets the remainder), with FG's lines.
  await tool("kraken_party_award", { xp: 10 });
  const exp = () => [ann, bob, cy].map((record) => agent.records.get(record.id).data.exp).join();
  assert(exp() === "3,3,4", `XP after 10: ${exp()}`);
  const log = agent.chatLog(10).map((line) => line.text);
  assert(log.includes("[3 XP] -> Aldric") && log.includes("[4 XP] -> Cyra") && log.includes("Awarded XP to the Party. (10)"), `XP chat ${JSON.stringify(log)}`);

  // Quests and encounters are awarded once.
  await tool("kraken_party_edit", { quest: { name: "Rescue the miller", xp: 9 } });
  await tool("kraken_party_edit", { encounter: { name: "Kobolds", xp: 6 } });
  await tool("kraken_party_award", { kind: "quests" });
  assert(exp() === "6,6,7", `XP after the quest: ${exp()}`);
  let refused = false;
  try {
    await tool("kraken_party_award", { kind: "quests" });
  } catch {
    refused = true;
  }
  assert(refused, "an awarded quest is not awarded again");
  await tool("kraken_party_award", { kind: "encounters" });
  assert(exp() === "8,8,9", `XP after the encounter: ${exp()}`);

  // The parcel: coins split, remainder kept; assigned items handed out.
  await tool("kraken_party_edit", { coins: { GP: 31, SP: 2 } });
  await tool("kraken_party_edit", { parcelItem: { name: "Rope, Silk (50 ft.)", count: 2, assign: "Aldric, Borin" } });
  await tool("kraken_party_edit", { parcelItem: { name: "Potion of Healing", count: 1, assign: "Aldric, Cyra" } });
  const after = await tool("kraken_party_distribute");
  const gp = (record) => Object.values(agent.records.get(record.id).data.coins).find((coin) => coin.name === "GP").amount;
  assert(gp(ann) === 15 && gp(cy) === 15, `GP 5 + 10 each: ${gp(ann)}`);
  assert(after.parcel.coins.GP === 1 && after.parcel.coins.SP === 2, `remainders stay: ${JSON.stringify(after.parcel.coins)}`);
  const carries = (record, name) => Object.values(agent.records.get(record.id).data.inventorylist ?? {}).some((item) => item.name === name);
  assert(carries(ann, "Rope, Silk (50 ft.)") && carries(bob, "Rope, Silk (50 ft.)") && !carries(cy, "Rope, Silk (50 ft.)"), "rope to Aldric and Borin");
  assert(!carries(ann, "Potion of Healing") && Object.values(after.parcel.items).some((item) => item.name === "Potion of Healing"), "one potion for two names stays in the parcel");
  assert(after.inventory.find((row) => row.name === "Rope, Silk (50 ft.)")?.count === 2, "party inventory counts the rope twice");
  assert(agent.chatLog(20).some((line) => line.text === "[10 GP] -> Borin") && agent.chatLog(20).some((line) => line.text === "Distributed across the Party. [30 GP]"), "coin chat lines");

  // Group check: Wisdom (secondary for all, CC 18 + CL 2 = 20). d20 10, 3, 18 with
  // level 1: Aldric 10+1+1 = 12 fails, Borin 3-1+1 fails, Cyra 18+2+1 = 21 succeeds.
  agent.dice.force([10, 3, 18]);
  const group = await tool("kraken_party_group_check", { attribute: "wisdom", cl: 2 });
  assert(group.line === "Group check (Wisdom, CL 2): 1 of 3 succeed. Failed: Aldric, Borin.", group.line);

  // Players see the party, but cannot run it.
  const seen = await latest(player, (m) => m.type === "party" && m.party.members.length === 3, "the party reaches the player");
  assert(seen.party.members.some((m) => m.name === "Cyra" && m.exp === 9), "players see the members' XP");
  player.ws.send(JSON.stringify({ type: "party-award-xp", xp: 100 }));
  await latest(player, (m) => m.type === "error" && m.reason.includes("Only the GM"), "player award refused");
  player.ws.send(JSON.stringify({ type: "op", req: 4, op: "update", id: "party", patch: { data: { members: [] } } }));
  assert((await latest(player, (m) => m.type === "op-result" && m.req === 4, "op answer")).ok === false, "players cannot edit the party record");

  // Watch order and formation, as FG's Order tab: Ann places her own
  // character, not Bob's; a swap only with her own; the GM fills, turns, clears.
  const order = (body) => player.ws.send(JSON.stringify({ type: "party-order", ...body }));
  const partyOrder = () => agent.records.get("party").data.order;
  order({ action: "place", id: ann.id, x: 0, y: 3 });
  await latest(player, (m) => m.type === "party" && m.party.order.formation.slots.some((slot) => slot.id === ann.id && slot.y === 3), "Ann places her character at the front");
  order({ action: "place", id: bob.id, x: 1, y: 3 });
  await latest(player, (m) => m.type === "error" && /your own/.test(m.reason), "Ann cannot place Bob's character");
  await tool("kraken_party_order", { action: "place", character: "Borin", x: 0, y: 2 });
  order({ action: "place", id: ann.id, x: 0, y: 2 });
  await latest(player, (m) => m.type === "error" && /another player/.test(m.reason), "Ann cannot take Bob's slot");
  order({ action: "watch", id: ann.id, watch: 2 });
  await latest(player, (m) => m.type === "party" && m.party.order.watches["watch-2"]?.members.includes(ann.id), "Ann takes the second watch");
  order({ action: "fill", columns: 2 });
  await latest(player, (m) => m.type === "error" && /Only the GM/.test(m.reason), "a player cannot fill the formation");
  const filled = await tool("kraken_party_order", { action: "fill", columns: 1 });
  assert(filled.formation.slots.length === 3 && filled.marching[0] === ann.id && filled.marching[1] === bob.id, `the GM fills the rest; marching is front to back (${filled.marching})`);
  const turned = await tool("kraken_party_order", { action: "rotate", direction: "right" });
  assert(turned.formation.facing === 1 && turned.formation.slots.find((slot) => slot.id === ann.id).x === 3 && turned.marching[0] === ann.id, "turned right, the front is to the right and the order holds");
  // The GM swaps two members: dropped on a taken slot, they change places.
  const annAt = turned.formation.slots.find((slot) => slot.id === ann.id);
  const bobAt = turned.formation.slots.find((slot) => slot.id === bob.id);
  const swapped = await tool("kraken_party_order", { action: "place", character: "Borin", x: annAt.x, y: annAt.y });
  assert(swapped.formation.slots.find((slot) => slot.id === ann.id).x === bobAt.x && swapped.marching[0] === bob.id, "a drop on a taken slot swaps the two");
  assert((await tool("kraken_party_order", { action: "clear" })).formation.slots.length === 0 && partyOrder().watches["watch-2"].members.includes(ann.id), "clear empties the formation, not the watches");
  console.log("PARTY_OK");
} finally {
  for (const ws of sockets) ws.close();
  await server.stop();
}
