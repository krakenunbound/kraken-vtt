// A full play test in the real app: a C&C campaign with the rulebooks and B2
// The Keep on the Borderlands; four characters for four test players, on the
// party sheet and the combat tracker; B2's Caves of Chaos on the table; the
// kobold ambush from FG's Library; rounds of initiative, attacks, damage,
// saves, spells and effects; treasure to the party and XP; a test player in
// Chrome looking at what they see. Nothing stops at the first problem: every
// problem is noted, and the list is written to the scratchpad.
//   node scripts/playtest-b2.mjs [out.json]
import "./loopback.mjs";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { _electron as electron, chromium } from "playwright-core";

const OUT = process.argv[2] ?? path.join(tmpdir(), "kraken-playtest-b2.json");
const B2 = "B2 The Keep on the Borderlands (C&C)";
const problems = [];
const notes = [];
const problem = (area, text, detail = "") => {
  problems.push({ area, text, detail: String(detail).slice(0, 600) });
  console.log(`PROBLEM [${area}] ${text}${detail ? ` -- ${String(detail).slice(0, 300)}` : ""}`);
};
const note = (text) => {
  notes.push(text);
  console.log(`· ${text}`);
};
const check = (condition, area, text, detail = "") => {
  if (!condition) problem(area, text, detail);
  return Boolean(condition);
};

const profile = mkdtempSync(path.join(tmpdir(), "kraken-playtest-"));
const env = { ...process.env, KRAKEN_AGENT_FILE: path.join(profile, "agent.json"), KRAKEN_AGENT_PORT: "0" };
const app = await electron.launch({ args: [".", "--mute-audio", `--user-data-dir=${profile}`], cwd: process.cwd(), env });
const page = await app.firstWindow();
await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => undefined);
await page.waitForSelector("text=My Campaigns");
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => message.type() === "error" && pageErrors.push(`console: ${message.text()}`));
const child = spawn(process.execPath, ["electron/agent/mcp-stdio.cjs"], { env, stdio: ["pipe", "pipe", "inherit"] });
const answers = new Map();
readline.createInterface({ input: child.stdout }).on("line", (line) => {
  const message = JSON.parse(line);
  answers.get(message.id)?.(message);
});
let nextId = 0;
function rpc(method, params) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 180000);
    answers.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
async function tool(name, args = {}) {
  const started = Date.now();
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  const took = Date.now() - started;
  if (took > 5000) problem("speed", `${name} took ${(took / 1000).toFixed(1)} s`, JSON.stringify(args).slice(0, 120));
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}
// A tool call whose failure is a problem to note, not the end of the test.
async function attempt(area, label, name, args) {
  try {
    return await tool(name, args);
  } catch (error) {
    problem(area, `${label} failed`, error.message);
    return null;
  }
}
const settle = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));
let browser = null;

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "playtest", version: "1" } });
  const port = 47410;
  const campaign = await tool("kraken_campaign_create", { name: "B2 play test", ruleset: "Castles & Crusades" });
  await tool("kraken_host", { campaignId: campaign.id, port, password: "" });
  await page.waitForSelector("text=Hosting");

  // --- The books --------------------------------------------------------------
  const books = await tool("kraken_books", { action: "list" });
  const want = ["Player's Handbook", "Monsters & Treasure", "Keep on the Borderlands"];
  for (const part of want) {
    const book = books.books?.find((item) => item.title?.includes(part) || item.name?.includes(part)) ?? (Array.isArray(books) ? books.find((item) => item.title?.includes(part) || item.name?.includes(part)) : null);
    if (!check(book, "books", `${part} is not on the shelf`)) continue;
    const started = Date.now();
    await attempt("books", `activating ${part}`, "kraken_books", { action: "activate", book: book.id });
    note(`activated ${book.title ?? book.name} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  await settle(3000);

  // --- The party ----------------------------------------------------------------
  const specs = [
    { owner: "Player One", spec: { name: "Thorin Ironfist", race: "Dwarf", class: "Fighter", level: 2, scores: { strength: 17, dexterity: 12, constitution: 15, intelligence: 10, wisdom: 11, charisma: 8 }, primes: ["constitution"], gold: 200, gear: [["Sword, Long", 1], ["Scale Mail", 1], ["Shield, Medium Steel", 1], ["Crossbow, Light", 1], ["Bolts (12)", 1], ["Backpack", 1], ["Torch", 3]], alignment: "Lawful Good" } },
    { owner: "Player Two", spec: { name: "Brother Aldo", race: "Human", class: "Cleric", level: 2, scores: { strength: 13, dexterity: 10, constitution: 14, intelligence: 11, wisdom: 16, charisma: 12 }, primes: ["strength", "constitution"], gold: 200, gear: [["Mace, Heavy", 1], ["Mail Shirt", 1], ["Shield, Medium Steel", 1], ["Holy Symbol, Wooden", 1], ["Backpack", 1]], spells: ["Bless", "Cure Light Wounds"], alignment: "Lawful Good" } },
    { owner: "Player Three", spec: { name: "Elara Moonwhisper", race: "Elf", class: "Wizard", level: 2, scores: { strength: 9, dexterity: 15, constitution: 12, intelligence: 17, wisdom: 12, charisma: 11 }, primes: ["dexterity"], gold: 60, gear: [["Staff", 1], ["Dagger", 2], ["Backpack", 1]], spells: ["Magic Missile", "Sleep", "Shield"], alignment: "Chaotic Good" } },
    { owner: "Player Four", spec: { name: "Pip Underbough", race: "Halfling", class: "Rogue", level: 2, scores: { strength: 10, dexterity: 17, constitution: 13, intelligence: 12, wisdom: 11, charisma: 14 }, primes: ["wisdom"], gold: 120, gear: [["Sword, Short", 1], ["Leather Armor", 1], ["Sling", 1], ["Backpack", 1]], alignment: "Neutral" } },
  ];
  const party = [];
  for (const { owner, spec } of specs) {
    const built = await attempt("characters", `building ${spec.name}`, "kraken_build_character", { spec, owner });
    if (!built) continue;
    check((built.problems ?? []).length === 0, "characters", `${spec.name} built with problems`, (built.problems ?? []).join("; "));
    const record = (await tool("kraken_record_get", { id: built.id })).data;
    check(record.hp?.total > 0 && record.ac?.total >= 10, "characters", `${spec.name} has no hit points or AC`, JSON.stringify({ hp: record.hp, ac: record.ac?.total }));
    party.push({ id: built.id, name: spec.name, owner, data: record });
    note(`${spec.name}: level ${record.level}, HP ${record.hp?.total}, AC ${record.ac?.total}, BtH ${record.bth}, powers ${Object.keys(record.powers ?? {}).length}`);
  }
  check(party.length === 4, "characters", `only ${party.length} of 4 characters were built`);
  await attempt("party", "the party sheet", "kraken_party_edit", { allPlayers: true });
  const sheet = await tool("kraken_party");
  check(sheet.members?.length === party.length, "party", `the party sheet has ${sheet.members?.length} members, not ${party.length}`);

  // --- The maps -----------------------------------------------------------------
  const started = Date.now();
  const maps = await attempt("maps", "opening B2's Caves of Chaos", "kraken_open_fg_module", { module: B2, maps: ["The Caves of Chaos"] });
  note(`B2's Caves of Chaos opened in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  await settle(2000);
  if (maps) {
    const caves = maps.scenes.find((scene) => scene.name === "The Caves of Chaos");
    check(caves && caves.walls > 1000, "maps", "the caves have too few walls", JSON.stringify(caves));
    const scenes = await tool("kraken_scenes", {});
    const onTable = JSON.stringify(scenes);
    if (!onTable.includes("The Caves of Chaos")) problem("maps", "the caves are not in the scene list", onTable.slice(0, 200));
    if (!/"current"\s*:\s*\{[^}]*Caves of Chaos/.test(onTable) && !onTable.includes('"on":"The Caves of Chaos"')) await attempt("maps", "switching to the caves", "kraken_scenes", { scene: "The Caves of Chaos" });
    await settle(1500);
  }
  const labels = await attempt("maps", "listing the map pins", "kraken_label", { action: "list" });
  const kobold = labels?.labels?.find((label) => label.text === "A. Kobold Lair");
  check(kobold, "maps", "the A. Kobold Lair pin is missing");

  // --- Tokens at the kobold lair ------------------------------------------------
  const at = kobold ? { x: kobold.x, y: kobold.y } : null;
  for (const [index, member] of party.entries()) {
    const placed = await attempt("tokens", `placing ${member.name}`, "kraken_token_place", { recordId: member.id, ...(at ? { x: at.x - 120 + index * 36, y: at.y + 160 } : {}) });
    member.token = placed?.id ?? placed?.token?.id;
  }
  const mapNow = await tool("kraken_map");
  check((mapNow.tokens ?? []).filter((token) => party.some((member) => member.id === token.recordId)).length === party.length, "tokens", "not every character has a token", JSON.stringify((mapNow.tokens ?? []).map((token) => token.name)));

  // --- The kobold ambush ---------------------------------------------------------
  const battles = await attempt("library", "listing encounters", "kraken_library", { action: "list", module: B2, kind: "battle", search: "Kobold ambush" });
  const ambush = battles?.[0];
  check(ambush, "library", "the kobold ambush encounter is missing");
  for (const member of party) await attempt("combat", `adding ${member.name} to the tracker`, "kraken_combat", { action: "add", recordId: member.id });
  if (ambush) {
    const added = await attempt("library", "adding the ambush", "kraken_library", { action: "battle", path: ambush.path });
    note(`ambush: ${added?.added?.join(", ")}`);
    const hidden = (await tool("kraken_map")).tokens.filter((token) => /kobold/i.test(token.name));
    check(hidden.length > 0, "library", "the ambush placed no kobold tokens on the map");
    for (const token of hidden) await attempt("tokens", `revealing ${token.name}`, "kraken_token_update", { id: token.id, hidden: false });
  }
  let view = await tool("kraken_combat", { action: "view" });
  const foes = view.entries.filter((entry) => !party.some((member) => member.id === entry.recordId));
  check(foes.length > 0, "combat", "no foes on the tracker");
  check(foes.every((entry) => entry.hp > 0 && entry.ac > 0), "combat", "a foe has no hit points or AC", JSON.stringify(foes.map((entry) => [entry.name, entry.hp, entry.ac])));
  check(foes.every((entry) => (entry.attacks ?? []).length > 0), "combat", "a foe has no attacks", JSON.stringify(foes.map((entry) => [entry.name, entry.attacks?.length])));

  // --- Initiative and rounds ---------------------------------------------------
  await attempt("combat", "rolling initiative", "kraken_combat", { action: "init", which: "all" });
  view = await tool("kraken_combat", { action: "view" });
  check(view.entries.every((entry) => Number.isFinite(entry.initresult) || Number.isFinite(entry.init)), "combat", "an entry has no initiative");
  const entryOf = (member) => view.entries.find((entry) => entry.recordId === member.id);
  const weaponOf = (member) => Object.entries(member.data.inventorylist ?? {}).find(([, item]) => Number(item.carried) === 2 && String(item.damage ?? "").trim())?.[0];
  const classOf = (member) => Object.values(member.data.packages ?? {}).find((pkg) => String(pkg.packagetype).toLowerCase() === "class")?.name ?? "";
  const powerOf = (member, name) => Object.entries(member.data.powers ?? {}).find(([, power]) => power.name === name)?.[0];
  for (let round = 1; round <= 3; round += 1) {
    view = await tool("kraken_combat", { action: "view" });
    const living = view.entries.filter((entry) => !party.some((member) => member.id === entry.recordId) && entry.wounds < entry.hp);
    if (living.length === 0) {
      note(`the kobolds are down after round ${round - 1}`);
      break;
    }
    for (const member of party) {
      const me = entryOf(member);
      const foe = living[0];
      if (!me || !foe) continue;
      await attempt("combat", `${member.name} targets ${foe.name}`, "kraken_combat", { action: "target", id: me.id, targetId: foe.id, on: true });
      if (classOf(member) === "Wizard") {
        // Round 1: Sleep on the kobolds; then Magic Missile.
        const sleep = round === 1 ? powerOf(member, "Sleep") : null;
        if (sleep) {
          const cast = await attempt("spells", "Sleep", "kraken_combat", { action: "cast", recordId: member.id, power: sleep });
          note(`Sleep: ${JSON.stringify(cast?.cast?.results ?? cast?.cast?.saves ?? []).slice(0, 240)}`);
          continue;
        }
        const missile = powerOf(member, "Magic Missile");
        if (check(missile, "spells", `${member.name} has no Magic Missile`)) {
          const cast = await attempt("spells", "Magic Missile", "kraken_combat", { action: "cast", recordId: member.id, power: missile });
          check(cast?.cast?.results?.some((item) => item.damage > 0), "spells", "Magic Missile did no damage", JSON.stringify(cast?.cast).slice(0, 300));
        }
        continue;
      }
      if (classOf(member) === "Cleric" && round === 1) {
        // Bless on the party: the cleric targets the others first.
        const bless = powerOf(member, "Bless");
        if (check(bless, "spells", `${member.name} has no Bless`)) {
          await attempt("combat", "clearing the cleric's targets", "kraken_combat", { action: "clear-targets", id: me.id });
          for (const ally of party) if (entryOf(ally)) await attempt("combat", `the cleric targets ${ally.name}`, "kraken_combat", { action: "target", id: me.id, targetId: entryOf(ally).id, on: true });
          const cast = await attempt("spells", "Bless", "kraken_combat", { action: "cast", recordId: member.id, power: bless });
          check((cast?.cast?.results ?? []).filter((item) => item.effect).length >= 3, "spells", "Bless did not land on the party", JSON.stringify(cast?.cast).slice(0, 300));
          await attempt("combat", "clearing the cleric's targets", "kraken_combat", { action: "clear-targets", id: me.id });
        }
        continue;
      }
      if (classOf(member) === "Cleric" && round === 2) {
        const thorinEntry = entryOf(party[0]);
        const cure = powerOf(member, "Cure Light Wounds");
        if (thorinEntry && cure) {
          await attempt("combat", "the cleric targets Thorin", "kraken_combat", { action: "target", id: me.id, targetId: thorinEntry.id, on: true });
          const seen = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === thorinEntry.id);
          // The dice decide: a Thorin already dead (wounds to -10) is not healed by a cure, as C&C's rules say.
          const dead = /dead/i.test(String(seen?.health?.status ?? ""));
          const before = dead ? 0 : seen?.wounds ?? 0;
          if (dead) note("Thorin fell to -10 before the cleric's turn: dead, so Cure Light Wounds is not expected to heal him");
          const cast = await attempt("spells", "Cure Light Wounds", "kraken_combat", { action: "cast", recordId: member.id, power: cure });
          const afterWounds = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === thorinEntry.id)?.wounds ?? 0;
          note(`Cure Light Wounds on Thorin: wounds ${before} -> ${afterWounds} ${JSON.stringify(cast?.cast?.results ?? []).slice(0, 120)}`);
          if (before > 0) check(afterWounds < before, "spells", "Cure Light Wounds healed nothing", JSON.stringify(cast?.cast).slice(0, 300));
          await attempt("combat", "clearing the cleric's targets", "kraken_combat", { action: "clear-targets", id: me.id });
          continue;
        }
      }
      const weapon = weaponOf(member);
      if (!check(weapon, "combat", `${member.name} has no weapon in hand`)) continue;
      const swing = await attempt("combat", `${member.name}'s attack`, "kraken_combat", { action: "attack", recordId: member.id, weapon });
      const result = swing?.results?.[0];
      check(result && Number.isFinite(result.total), "combat", `${member.name}'s attack gave no total`, JSON.stringify(swing?.results));
      if (result?.hit) {
        const hit = await attempt("combat", `${member.name}'s damage`, "kraken_combat", { action: "damage-roll", recordId: member.id, weapon });
        check(hit?.damage?.total > 0, "combat", `${member.name}'s damage was 0`, JSON.stringify(hit?.damage));
      }
    }
    // The kobolds strike back: each living kobold at Thorin.
    view = await tool("kraken_combat", { action: "view" });
    const thorin = entryOf(party[0]);
    for (const foe of view.entries.filter((entry) => !party.some((member) => member.id === entry.recordId) && entry.wounds < entry.hp)) {
      const attack = foe.attacks?.[0];
      if (!attack || !thorin) continue;
      await attempt("combat", `${foe.name} targets Thorin`, "kraken_combat", { action: "target", id: foe.id, targetId: thorin.id, on: true });
      const swing = await attempt("combat", `${foe.name}'s attack`, "kraken_combat", { action: "attack", id: foe.id, weapon: attack.key });
      if (swing?.results?.[0]?.hit) await attempt("combat", `${foe.name}'s damage`, "kraken_combat", { action: "damage-roll", id: foe.id, weapon: attack.key });
    }
    // A save for the rogue against a trap (dexterity, CL 1).
    if (round === 1) {
      const pip = entryOf(party[3]);
      if (pip) {
        const saved = await attempt("saves", "Pip's dexterity save", "kraken_combat", { action: "save", id: pip.id, attribute: "dexterity", cl: 1 });
        check(saved?.save && typeof saved.save.success === "boolean", "saves", "the save gave no result", JSON.stringify(saved?.save));
      }
      // An effect: Thorin hasted the old way (ATK +1) for 3 rounds.
      if (thorin) await attempt("effects", "an ATK effect", "kraken_combat", { action: "effect", id: thorin.id, effect: { label: "Battle fury; ATK: 1", duration: 3 } });
    }
    for (let turn = 0; turn < view.entries.length; turn += 1) await attempt("combat", "next turn", "kraken_combat", { action: "next" });
  }
  view = await tool("kraken_combat", { action: "view" });
  check(view.round >= 2, "combat", `the round counter is ${view.round} after the turns`);
  const thorinNow = entryOf(party[0]);
  const fury = thorinNow?.effects?.find((effect) => effect.label.startsWith("Battle fury"));
  check(!fury || fury.duration < 3, "effects", "the effect's duration did not count down", JSON.stringify(fury));
  const downed = view.entries.filter((entry) => !party.some((member) => member.id === entry.recordId) && entry.wounds >= entry.hp);
  note(`after the fight: ${downed.length} of ${view.entries.length - party.length} foes down; party wounds ${party.map((member) => entryOf(member)?.wounds ?? "?").join(", ")}`);
  // FG's SiegeCore turns on negative hit points, so CoreRPG lets wounds pile up
  // past death as a dead kobold is hit again (Kraken does the same); what is
  // caught here is a heap such as the old instant death's 999 wounds.
  const absurd = view.entries.filter((entry) => !party.some((member) => member.id === entry.recordId) && entry.wounds > entry.hp + 200);
  check(absurd.length === 0, "combat", "a foe has absurd wounds", JSON.stringify(absurd.map(({ name, hp, wounds, health }) => ({ name, hp, wounds, status: health?.status }))));
  const chat = await tool("kraken_chat_log", { count: 200 });
  note(`chat: ${chat.length} lines; krits ${chat.filter((line) => /KRAKEN (CRITICAL|FUMBLE)/.test(line.text ?? "")).length}; sleep/effects ${chat.filter((line) => /Effect \[/.test(line.text ?? "")).length}`);
  check(chat.some((line) => (line.roll?.label ?? line.text ?? "").startsWith("[ATTACK]")), "chat", "no [ATTACK] lines in chat");
  check(chat.some((line) => /\[CAST\]/.test(line.text ?? "")), "chat", "no [CAST] lines in chat");

  // --- Treasure and experience ----------------------------------------------------
  const parcels = await attempt("library", "listing parcels", "kraken_library", { action: "list", module: B2, kind: "parcel" });
  if (parcels?.length) await attempt("library", "a parcel to the party", "kraken_library", { action: "parcel", path: parcels[0].path });
  await attempt("party", "coins into the parcel", "kraken_party_edit", { coins: { GP: 40 } });
  await attempt("party", "an encounter's XP", "kraken_party_edit", { encounter: { name: "Kobold ambush", xp: 120 } });
  const after = await tool("kraken_party");
  note(`party parcel: ${JSON.stringify(after.parcel).slice(0, 200)}`);

  // --- Phase 2: area Sleep, a kill, XP, the parcel handed out, a level up ---------------
  view = await tool("kraken_combat", { action: "view" });
  const standing = view.entries.filter((entry) => !party.some((member) => member.id === entry.recordId) && entry.wounds < entry.hp);
  const elara = party.find((member) => classOf(member) === "Wizard");
  const mapTokens = (await tool("kraken_map")).tokens;
  const tokenOf = (entry) => mapTokens.find((token) => token.id === entry.tokenId) ?? mapTokens.find((token) => token.recordId === entry.recordId);
  if (elara && standing.length >= 2) {
    const centre = tokenOf(standing[0]);
    if (check(centre, "tokens", "a standing kobold has no token")) {
      const area = await attempt("spells", "area target for Sleep", "kraken_combat", { action: "target-area", id: entryOf(elara).id, x: centre.x, y: centre.y, radius: 30, faction: "foe" });
      note(`area target: ${area?.targets?.join(", ")}`);
      check((area?.targets ?? []).length >= 2, "spells", "the area target took fewer than two kobolds", JSON.stringify(area?.targets));
      // A fresh day's slots for the test, then Sleep on the area.
      await attempt("spells", "resetting Elara's slots", "kraken_record_update", { id: elara.id, data: { slots: { l1: { used: 0 } } } });
      const sleep = powerOf(elara, "Sleep");
      const cast = sleep ? await attempt("spells", "Sleep on the area", "kraken_combat", { action: "cast", recordId: elara.id, power: sleep }) : null;
      const slept = (cast?.cast?.results ?? []).filter((item) => item.effect);
      note(`Sleep on the area: ${slept.map((item) => item.target).join(", ")}`);
      check(slept.length >= 2, "spells", "Sleep on the area put fewer than two kobolds to sleep", JSON.stringify(cast?.cast).slice(0, 300));
    }
  }
  // Thorin finishes one off: the tracker should call it dead.
  view = await tool("kraken_combat", { action: "view" });
  const victim = view.entries.find((entry) => !party.some((member) => member.id === entry.recordId) && entry.wounds < entry.hp);
  if (victim) {
    await attempt("combat", "a killing blow", "kraken_combat", { action: "damage", id: victim.id, amount: victim.hp + 12 });
    const dead = (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === victim.id);
    note(`killed ${victim.name}: health ${JSON.stringify(dead?.health)}`);
    check(/dead/i.test(JSON.stringify(dead?.health ?? "")), "combat", `${victim.name} at ${dead?.hp - dead?.wounds} hit points is not shown dead`, JSON.stringify(dead?.health));
  }
  // The encounter's XP split between the party.
  const expBefore = (await tool("kraken_party")).members.map((member) => member.exp ?? 0);
  const award = await attempt("party", "awarding the encounter's XP", "kraken_party_award", { kind: "encounters" });
  const expAfter = award?.party?.map((member) => member.exp ?? 0) ?? [];
  note(`XP: ${expBefore.join("/")} -> ${expAfter.join("/")}`);
  check(expAfter.reduce((a, b) => a + b, 0) - expBefore.reduce((a, b) => a + b, 0) === 120, "party", "the encounter's 120 XP was not split between the party", `${expBefore} -> ${expAfter}`);
  // The parcel: the item to Pip, the coin shared.
  const parcelNow = (await tool("kraken_party")).parcel;
  const item = Object.values(parcelNow.items ?? {})[0];
  if (item) await attempt("party", "assigning the parcel item", "kraken_party_edit", { parcelItem: { name: item.name, count: 1, assign: "Pip Underbough" } });
  const handed = await attempt("party", "handing out the parcel", "kraken_party_distribute", {});
  note(`hand-out: ${JSON.stringify(handed).slice(0, 240)}`);
  const pipNow = (await tool("kraken_record_get", { id: party[3]?.id })).data;
  check(Object.values(pipNow.inventorylist ?? {}).some((row) => row.name === item?.name), "party", "Pip did not get the parcel item", JSON.stringify(Object.values(pipNow.inventorylist ?? {}).map((row) => row.name)));
  // A level up once there is XP enough: Thorin to 3.
  const thorinRecord = (await tool("kraken_record_get", { id: party[0].id })).data;
  await attempt("characters", "giving Thorin his next level's XP", "kraken_character_edit", { id: party[0].id, changes: [{ path: "exp", value: Number(thorinRecord.expnext) || 4001 }] });
  const levelled = await attempt("characters", "Thorin's level up", "kraken_level_up", { id: party[0].id });
  const thorinAfter = (await tool("kraken_record_get", { id: party[0].id })).data;
  note(`Thorin: level ${thorinRecord.level} -> ${thorinAfter.level}, HP ${thorinRecord.hp?.total} -> ${thorinAfter.hp?.total}, BtH ${thorinRecord.bth} -> ${thorinAfter.bth} ${JSON.stringify(levelled ?? {}).slice(0, 80)}`);
  check(thorinAfter.level === thorinRecord.level + 1 && thorinAfter.hp.total > thorinRecord.hp.total, "characters", "Thorin did not level up", `${thorinRecord.level} -> ${thorinAfter.level}`);

  // --- Phase 3 (alpha.21 to .25): the party moved as one, facing, an image layer, the caves' own sound, light spoiling deepvision ---
  const partyTokens = (await tool("kraken_map")).tokens.filter((token) => party.some((member) => member.id === token.recordId));
  const grouped = await attempt("tokens", "moving the party together", "kraken_token_move", { ids: partyTokens.map((token) => token.id), dcol: 0, drow: 1 });
  note(`the party moved as one: ${JSON.stringify((grouped ?? []).map((item) => [item.col, item.row, item.blocked]))}`);
  check(grouped?.length === partyTokens.length, "tokens", "the party did not move together", JSON.stringify(grouped).slice(0, 200));
  const thorinToken = partyTokens.find((token) => token.recordId === party[0]?.id);
  if (thorinToken) {
    const faced = await attempt("tokens", "turning Thorin to face the lair", "kraken_token_update", { id: thorinToken.id, facing: 0 });
    check(faced?.facing === 0, "tokens", "Thorin's facing did not take", JSON.stringify(faced).slice(0, 120));
  }
  const circle = path.join(process.cwd(), "public", "decals", "Arcane Circle.webp");
  const layer = kobold ? await attempt("tiles", "an image layer by the lair", "kraken_tile", { action: "add", file: circle, x: kobold.x - 60, y: kobold.y + 60, width: 120, height: 120, name: "Rune circle" }) : null;
  check(layer?.id, "tiles", "no image layer");
  await attempt("sound", "a cave loop", "kraken_sound", { action: "ambience", do: "add", id: "ambience/Cave" });
  const caveSound = await attempt("sound", "keeping the caves' sound", "kraken_sound", { action: "scene", do: "keep" });
  check(caveSound?.kept?.ambience?.length === 1, "sound", "the caves did not keep their sound", JSON.stringify(caveSound).slice(0, 200));
  // Deepvision in the dark; a torch in hand spoils it (C&C PHB).
  await attempt("map", "pitch dark", "kraken_scene_settings", { darkness: 1 });
  if (thorinToken) await attempt("map", "Thorin lights a torch", "kraken_token_update", { id: thorinToken.id, light: "torch" });

  // --- A test player in Chrome ------------------------------------------------------
  browser = await chromium.launch({ executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`, headless: true });
  const seat = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const seatErrors = [];
  seat.on("pageerror", (error) => seatErrors.push(error.message));
  await seat.goto(`http://127.0.0.1:${port}/`);
  await seat.fill('input[name="name"]', "Player One");
  await seat.fill('input[name="account-password"]', "test-pass");
  await seat.click('button[type="submit"]');
  const loaded = await seat.waitForSelector(".map-toolbar", { timeout: 30000 }).then(() => true).catch(() => false);
  check(loaded, "player", "the player's map did not load");
  await settle(2500);
  const playerView = await seat.evaluate(() => ({
    tokens: [...document.querySelectorAll(".token")].map((node) => node.getAttribute("title") || node.textContent || ""),
    labels: document.querySelectorAll("[data-label]").length,
    walls: document.querySelectorAll("[data-wall], .wall-line").length,
    sight: document.querySelector(".viewport")?.getAttribute("data-sight"),
  }));
  note(`the player sees: ${JSON.stringify(playerView).slice(0, 300)}`);
  check(playerView.labels === 0, "player", "the player sees the GM-only map pins", playerView.labels);
  check(playerView.tokens.some((title) => /Thorin/.test(title)), "player", "the player does not see their own token", JSON.stringify(playerView.tokens));
  const phase3 = await seat.evaluate(() => ({ tiles: document.querySelectorAll(".map-tile").length, spoiled: Boolean(document.querySelector(".map-chip.spoiled")), facing: document.querySelector('.token .token-facing')?.getAttribute("data-facing") ?? null }));
  note(`phase 3 for the player: ${JSON.stringify(phase3)}`);
  check(phase3.tiles >= 1, "tiles", "the player does not see the image layer", JSON.stringify(phase3));
  check(phase3.spoiled, "map", "the player is not told the torch spoils Thorin's deepvision", JSON.stringify(phase3));
  check(phase3.facing === "0", "tokens", "the player does not see Thorin's facing", JSON.stringify(phase3));
  await seat.screenshot({ path: path.join(tmpdir(), "kraken-playtest-player.png") });
  if (thorinToken) await attempt("map", "Thorin puts the torch out", "kraken_token_update", { id: thorinToken.id, light: "none" });
  await attempt("map", "daylight again", "kraken_scene_settings", { darkness: null });
  await page.screenshot({ path: path.join(tmpdir(), "kraken-playtest-gm.png") });
  // The player's sheet: their character, with its numbers.
  await seat.click('[data-launch="characters"]').catch(() => problem("player", "the player has no Characters button"));
  await settle(1000);
  check(await seat.$('[data-character]'), "player", "the player's sheet did not open");
  for (const text of seatErrors) problem("player", "a page error in the player's browser", text);
} catch (error) {
  problem("test", "the play test stopped early", error.stack ?? error.message);
} finally {
  for (const text of pageErrors.slice(0, 20)) problem("gm-window", "an error in the GM's window", text);
  writeFileSync(OUT, JSON.stringify({ problems, notes }, null, 2));
  console.log(`\n${problems.length} problems, ${notes.length} notes -> ${OUT}`);
  await browser?.close().catch(() => undefined);
  child.kill();
  await app.close().catch(() => undefined);
}
