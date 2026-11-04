// FG's Library for an adventure module (B2 The Keep on the Borderlands, C&C),
// on a live table: lists of NPCs, encounters, parcels and tables; an
// encounter onto the combat tracker with its tokens where FG placed them on
// the open FG map (kraken_open_fg_module's scene); B2's NPCs (official C&C
// fields) as the tracker reads them; a parcel into the party's parcel; a
// table rolled on the host's fixed dice. Skipped without the module.
import "./loopback.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { callTool } = require("../electron/agent/tools.cjs");
const { listModules } = require("../electron/importers/fgModule.cjs");
const { fgModuleBundle } = require("../electron/importers/fgMaps.cjs");

const B2 = "B2 The Keep on the Borderlands (C&C)";
if (!listModules().includes(B2)) {
  console.log("skip library: no", B2);
  process.exit(0);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const server = createTableServer();
try {
  await server.listen({ port: 0, password: "" });
  const ctx = { table: () => server };
  const tool = async (name, args = {}) => {
    const result = await callTool(name, args, ctx);
    if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
    return JSON.parse(result.content[0].text);
  };
  const agent = server.agent;
  const counts = {};
  for (const kind of ["npc", "battle", "parcel", "table"]) counts[kind] = (await tool("kraken_library", { action: "list", module: B2, kind })).length;
  assert(counts.npc === 143 && counts.battle === 69 && counts.parcel === 137 && counts.table === 9, `B2's library: ${JSON.stringify(counts)}`);

  // The Keep's interior as the table's scene, as kraken_open_fg_module opens it.
  const bundle = fgModuleBundle(B2, { only: ["Keep on the Borderlands - Interior"] });
  const [id, extra] = Object.entries(bundle.extras)[0];
  agent.map.seed(id, extra);
  agent.map.setScene({ id, name: "Keep interior", width: extra.frame.width, height: extra.frame.height, padding: 0, backgroundColor: "#000", grid: { size: 36, type: 1, color: "#000", alpha: 0.2, distance: 5, units: "ft" }, walls: [], lights: [], tokens: [] });
  assert(agent.map.labels().length > 20 && agent.map.groups().every((group) => group.players === false), `pins seeded in GM-only groups: ${agent.map.labels().length}`);

  // The vault's pit vipers: four on the tracker, four hidden tokens where FG had them.
  const vipers = (await tool("kraken_library", { action: "list", module: B2, kind: "battle", search: "pit vipers" }))[0];
  const added = await tool("kraken_library", { action: "battle", path: vipers.path });
  assert(added.added.length === 4, `four vipers: ${added.added.join(", ")}`);
  const tokens = agent.map.tokens().filter((token) => token.name.startsWith("Pit Viper"));
  assert(tokens.length === 4 && tokens.every((token) => token.hidden), `four hidden viper tokens: ${tokens.length}`);
  const xs = tokens.map((token) => Math.round(token.x));
  assert(Math.max(...xs) - Math.min(...xs) <= 72 && xs.every((x) => x > 0 && x < extra.frame.width), `placed together, on the map: ${xs.join(", ")}`);
  const viper = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.name.startsWith("Pit Viper"));
  assert(viper.hp > 0 && viper.ac > 10, `a viper's hit points and armour class from B2's fields: hp ${viper.hp}, AC ${viper.ac}`);

  // Area targeting (an area spell): from the first viper, everyone within 15 feet of it.
  const first = tokens[0];
  const vipersOnTracker = (await tool("kraken_combat", { action: "view" })).entries.filter((entry) => entry.name.startsWith("Pit Viper"));
  const area = await tool("kraken_combat", { action: "target-area", id: vipersOnTracker[0].id, x: first.x, y: first.y, radius: 15 });
  assert(area.targets.length === 3, `the other three vipers are in the area: ${area.targets.join(", ")}`);
  const none = await tool("kraken_combat", { action: "target-area", id: vipersOnTracker[0].id, x: first.x, y: first.y, radius: 15, faction: "friend" });
  assert(none.targets.length === 0, "no friends in it");

  // An orc leader from B2: its attack parsed, its base to hit its hit dice.
  const leader = (await tool("kraken_library", { action: "list", module: B2, kind: "npc", search: "Orc Leader (Tribe B)" }))[0];
  await tool("kraken_library", { action: "npc", path: leader.path });
  const record = agent.records.list({ type: "npc" }).find((item) => item.name === "Orc Leader (Tribe B)");
  assert(record.data.attacks.a01.damage === "1d8+2" && record.data.bth === 4 && record.data.ac.total === 17 && record.data.primeset === "physical", `orc leader: ${JSON.stringify(record.data.attacks)} bth ${record.data.bth}`);

  // A parcel into the party's parcel.
  const chain = (await tool("kraken_library", { action: "list", module: B2, kind: "parcel", search: "silver chain" }))[0];
  await tool("kraken_library", { action: "parcel", path: chain.path });
  const parcel = (await tool("kraken_party")).parcel;
  assert(Object.values(parcel.items).some((item) => /silver chain/i.test(item.name)), "the chain is in the parcel");

  // The rumor table: a fixed 3 gives row 3.
  const rumors = (await tool("kraken_library", { action: "list", module: B2, kind: "table", search: "Rumor" }))[0];
  agent.dice.force([3]);
  const rolled = await tool("kraken_library", { action: "table", path: rumors.path });
  assert(rolled.roll === 3 && /Tribes of different creatures/.test(rolled.result), `rumor 3: ${JSON.stringify(rolled)}`);
  console.log(`ok library: B2's ${counts.npc} NPCs, ${counts.battle} encounters, ${counts.parcel} parcels, ${counts.table} tables; the pit vipers on the tracker and hidden on the Keep's map where FG placed them; an area target takes the other three; an orc leader converted; a parcel to the party; the rumor table rolled`);
} finally {
  await server.stop();
}
