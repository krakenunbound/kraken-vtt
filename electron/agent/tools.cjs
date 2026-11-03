// Every action an agent can take in Kraken VTT. The MCP server exposes these,
// and the in-app assistant will call the same list. An agent acts as the GM.
//
// ctx gives the tools what they need from the app:
//   table()          the running table server, or null when not hosting
//   hosting()        { campaignId, port } or null
//   campaigns        { list(), create(input) }
//   ui(command)      asks the app window to do something (host, leave, ...)
//   window()         the main BrowserWindow, for screenshots and page text

const fgModule = require("../importers/fgModule.cjs");
const { siege, siegeLibrary, siegeCheck, levelUp } = require("../siege.cjs");
const party = require("../party.cjs");

function out(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function needTable(ctx) {
  const table = ctx.table();
  if (!table) throw new Error("Not hosting. Host a campaign first (kraken_host).");
  return table.agent;
}

function summary(record) {
  return { id: record.id, type: record.type, name: record.name, owner: record.owner, visibility: record.visibility, source: record.source };
}

const string = (description) => ({ type: "string", description });
const number = (description) => ({ type: "number", description });
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

const TOOLS = [
  {
    name: "kraken_status",
    description: "What Kraken VTT is doing: whether a campaign is hosted, its port, who is connected, the scene on the table, and how many records of each type exist. Call this first.",
    inputSchema: object({}),
    run(_args, ctx) {
      const table = ctx.table();
      const hosting = ctx.hosting();
      if (!table || !hosting) return out({ hosting: false, campaigns: ctx.campaigns.list().length });
      const counts = {};
      for (const record of table.agent.records.list()) counts[record.type] = (counts[record.type] ?? 0) + 1;
      const scene = table.agent.scene();
      return out({
        hosting: true,
        campaignId: hosting.campaignId,
        port: hosting.port,
        players: table.agent.players(),
        scene: scene ? { id: scene.id, name: scene.name, width: scene.width, height: scene.height } : null,
        records: counts,
      });
    },
  },
  {
    name: "kraken_campaigns",
    description: "List the GM's campaigns (id, name, ruleset, last played).",
    inputSchema: object({}),
    run: (_args, ctx) => out(ctx.campaigns.list()),
  },
  {
    name: "kraken_campaign_create",
    description: "Create a campaign. Returns its id.",
    inputSchema: object({ name: string("Campaign name"), ruleset: string("Ruleset, e.g. Castles & Crusades") }, ["name"]),
    run: (args, ctx) => out(ctx.campaigns.create({ name: args.name, ruleset: args.ruleset })),
  },
  {
    name: "kraken_host",
    description: "Host a campaign in the app window, as the GM pressing Play. The window joins as the DM.",
    inputSchema: object(
      {
        campaignId: string("Campaign id from kraken_campaigns"),
        port: number("Port, default 47300"),
        password: string("Table password; empty for a public game"),
      },
      ["campaignId"],
    ),
    run: async (args, ctx) => out(await ctx.ui({ kind: "host", campaignId: args.campaignId, port: args.port ?? 47300, password: args.password ?? "" })),
  },
  {
    name: "kraken_leave",
    description: "Stop hosting (saves the campaign first). Connected players are disconnected.",
    inputSchema: object({}),
    run: async (_args, ctx) => out(await ctx.ui({ kind: "leave" })),
  },
  {
    name: "kraken_records_list",
    description: "List records (characters, NPCs, items, notes...). Filter by type, owner (player name, \"\" for the GM) or part of the name.",
    inputSchema: object({
      type: string("Record type, e.g. character"),
      source: string("Module the records came from; \"\" for the campaign's own"),
      owner: string("Owner's player name; \"\" for GM-owned"),
      name: string("Part of the name, any case"),
      limit: number("Most to return, default 200"),
    }),
    run(args, ctx) {
      const { records } = needTable(ctx);
      const rows = records.list({ type: args.type, owner: args.owner, name: args.name, source: args.source });
      const limit = Math.max(1, Math.min(5000, Number(args.limit) || 200));
      return out({ total: rows.length, records: rows.slice(0, limit).map(summary) });
    },
  },
  {
    name: "kraken_record_get",
    description: "Read one record with all its data.",
    inputSchema: object({ id: string("Record id") }, ["id"]),
    run(args, ctx) {
      const record = needTable(ctx).records.get(args.id);
      if (!record) throw new Error(`No record ${args.id}.`);
      return out(record);
    },
  },
  {
    name: "kraken_record_create",
    description: "Create a record. visibility: gm (GM only, the default), owner (GM and the owning player), all (everyone).",
    inputSchema: object(
      {
        type: string("Record type, e.g. character, npc, item, note"),
        name: string("Name"),
        owner: string("Owning player's name; empty for the GM"),
        visibility: { type: "string", enum: ["gm", "owner", "all"] },
        data: { type: "object", description: "The record's fields (any JSON)" },
        id: string("Optional id; generated if empty"),
      },
      ["type"],
    ),
    run: (args, ctx) => out(needTable(ctx).records.create(args, needTable(ctx).seat)),
  },
  {
    name: "kraken_record_update",
    description: "Change a record. data deep-merges into the existing data (a null value deletes a key) unless replace is true.",
    inputSchema: object(
      {
        id: string("Record id"),
        name: string("New name"),
        owner: string("New owner"),
        visibility: { type: "string", enum: ["gm", "owner", "all"] },
        data: { type: "object", description: "Fields to change" },
        replace: { type: "boolean", description: "Replace data entirely" },
      },
      ["id"],
    ),
    run(args, ctx) {
      const agent = needTable(ctx);
      const { id, replace, ...patch } = args;
      return out(agent.records.update(id, patch, agent.seat, { replace: replace === true }));
    },
  },
  {
    name: "kraken_record_delete",
    description: "Delete a record.",
    inputSchema: object({ id: string("Record id") }, ["id"]),
    run(args, ctx) {
      const agent = needTable(ctx);
      return out(summary(agent.records.remove(args.id, agent.seat)));
    },
  },
  {
    name: "kraken_fg_modules",
    description: "List the Fantasy Grounds modules installed on this computer (names usable with kraken_import_fg_module).",
    inputSchema: object({ filter: string("Part of the name, any case") }),
    run(args) {
      const want = String(args.filter ?? "").toLowerCase();
      return out(fgModule.listModules().filter((name) => name.toLowerCase().includes(want)));
    },
  },
  {
    name: "kraken_import_fg_module",
    description: "Import a Fantasy Grounds module the GM owns (by name from kraken_fg_modules, or a .mod path) into the hosted campaign as records. Re-importing replaces the earlier import. Records keep FG's field names; record.data.fgPath is the FG database path.",
    inputSchema: object({ module: string("Module name or path") }, ["module"]),
    run(args, ctx) {
      const agent = needTable(ctx);
      return out(fgModule.importModule(agent.records, agent.seat, args.module));
    },
  },
  {
    name: "kraken_build_character",
    description:
      "Build a SIEGE (Castles & Crusades) character from a spec, like the FG SC C&C wizard's buildFromSpec, into the hosted campaign. Needs the game's modules imported (kraken_import_fg_module: the Player's Handbook, and the Adventurer's Backpack for its classes). Spec: { name, race, class, level, scores: { strength: final score, ... }, primes: [chosen primes; the class prime is added], gold (gp before buying), gear: [[item name, count]], worn: [names], packed: [names], container, spells: [names in preference order], alignment, deity, gender, age, height, weight, appearance, notes }. owner: the player who plays it.",
    inputSchema: object(
      {
        spec: { type: "object", description: "The character spec" },
        owner: string("Owning player's name; empty for the GM"),
      },
      ["spec"],
    ),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const { builder } = await siege();
      const library = siegeLibrary(agent.records);
      if (library.packages.length === 0) throw new Error("No SIEGE packages in this campaign. Import the game's modules first (kraken_import_fg_module).");
      const { character, report } = builder.buildFromSpec(args.spec, library);
      if (!character) return out({ created: false, report });
      const record = agent.records.create(
        { type: "character", name: character.name || "Unnamed character", owner: args.owner ?? "", visibility: args.owner ? "owner" : "gm", data: character },
        agent.seat,
      );
      return out({ created: true, id: record.id, hp: report.hp, coinleft: report.coinleft, problems: report.problems, auto: report.auto, skipped: report.skipped });
    },
  },
  {
    name: "kraken_character_refresh",
    description: "Recompute a character's derived numbers (modifiers, level, BtH, AC, XP to next level, slots, package abilities and powers) after its scores, packages or gear changed.",
    inputSchema: object({ id: string("Character record id") }, ["id"]),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const record = agent.records.get(args.id);
      if (!record) throw new Error(`No record ${args.id}.`);
      const { engine } = await siege();
      const derived = engine.derive(record.data, siegeLibrary(agent.records).game);
      const updated = agent.records.update(args.id, { data: derived }, agent.seat, { replace: true });
      return out({ id: updated.id, level: derived.level, bth: derived.bth, hp: derived.hp?.total, ac: derived.ac?.total, expnext: derived.expnext });
    },
  },
  {
    name: "kraken_level_up",
    description: "Raise a character one level in its class. The host rolls the new level's hit points in front of the table, then the sheet is rebuilt (BtH, hit dice, XP to next level, slots, class abilities). Experience is not checked: the GM may level a character early.",
    inputSchema: object({ id: string("Character record id"), package: string("Package key under packages, when the character has more than one class") }, ["id"]),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const record = agent.records.get(args.id);
      if (!record) throw new Error(`No record ${args.id}.`);
      const { record: updated, gain, level } = await levelUp(agent, record, args.package);
      return out({ id: updated.id, level, gain, hp: updated.data.hp.total, bth: updated.data.bth, expnext: updated.data.expnext });
    },
  },
  {
    name: "kraken_siege_check",
    description: "Make a SIEGE attribute check or save for a character in front of the table: d20 + attribute modifier + level (when added) + bonus, against the challenge base (prime 12 / secondary 18 by default) + challenge level. Goes to chat.",
    inputSchema: object(
      {
        id: string("Character record id"),
        attribute: { type: "string", enum: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] },
        cl: number("Challenge level, default 0"),
        bonus: number("Extra modifier, default 0"),
        addLevel: { type: "boolean", description: "Add the character's level (default: the game's SIEGE_ADD_LEVEL)" },
        label: string("What the check is for"),
      },
      ["id", "attribute"],
    ),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const record = agent.records.get(args.id);
      if (!record) throw new Error(`No record ${args.id}.`);
      return out(await siegeCheck(agent, record, args));
    },
  },
  {
    name: "kraken_roll",
    description: "Roll dice in front of the table (the result goes to chat). Formulas: 1d20+3, 3d6, 4d6dl1 (drop lowest), 2d20kh1 (keep highest), d%.",
    inputSchema: object({ formula: string("Dice formula"), label: string("What the roll is for"), as: string("Name shown in chat, default Agent") }, ["formula"]),
    run: (args, ctx) => out(needTable(ctx).roll(args.formula, args.label, args.as || "Agent")),
  },
  {
    name: "kraken_dice_force",
    description: "Fix the next die results, in order (for tests and parity runs). Each value is used for the next die rolled, whatever its size.",
    inputSchema: object({ values: { type: "array", items: { type: "integer" } } }, ["values"]),
    run: (args, ctx) => out({ queued: needTable(ctx).dice.force(args.values) }),
  },
  {
    name: "kraken_dice_clear",
    description: "Drop any fixed die results still queued.",
    inputSchema: object({}),
    run(_args, ctx) {
      needTable(ctx).dice.clearForced();
      return out({ queued: 0 });
    },
  },
  {
    name: "kraken_chat_send",
    description: "Post a chat message to the table.",
    inputSchema: object({ text: string("Message"), as: string("Name shown, default Agent") }, ["text"]),
    run: (args, ctx) => out(needTable(ctx).say(args.text, args.as || "Agent")),
  },
  {
    name: "kraken_chat_log",
    description: "Recent chat, including roll results.",
    inputSchema: object({ count: number("How many lines, default 20") }),
    run: (args, ctx) => out(needTable(ctx).chatLog(args.count)),
  },
  {
    name: "kraken_players",
    description: "Who is connected: id, name, role (dm or player).",
    inputSchema: object({}),
    run(_args, ctx) {
      return out({ players: needTable(ctx).players() });
    },
  },
  {
    name: "kraken_map",
    description:
      "The scene on the table: its grid, whether line of sight is on, every token (id, name, square col/row, size in squares, owner, faction, hidden, health) and every door (id, state 0 closed / 1 open / 2 locked, secret). Squares count from the top-left of the map, col across and row down.",
    inputSchema: object({}),
    run(_args, ctx) {
      const { map } = needTable(ctx);
      const scene = map.scene();
      if (!scene) return out({ scene: null });
      const view = map.viewFor({ role: "dm", name: "Agent" }, "");
      return out({
        scene: { id: scene.id, name: scene.name, grid: scene.grid, cols: Math.round(scene.width / scene.grid.size), rows: Math.round(scene.height / scene.grid.size), walls: scene.walls.length, adventureLights: scene.lights.length },
        lights: map.lights().length,
        sight: view.sight,
        tokens: view.tokens.map((token) => ({ ...token, ...map.squareOf(token), color: undefined, mine: undefined })),
        doors: view.doors.map(({ id, state, secret }) => ({ id, state, secret })),
      });
    },
  },
  {
    name: "kraken_token_place",
    description:
      "Put a token on the scene: a character or NPC record (recordId), or a plain token by name. A character gets one token per scene (placing it again returns the one there). col/row is its top-left square; without them it goes near the middle, on the nearest free square.",
    inputSchema: object({
      recordId: string("Record id (character or npc)"),
      name: string("Name, for a token with no record"),
      col: number("Square across, from 0"),
      row: number("Square down, from 0"),
      squares: number("Size in squares (default from the record's space, else 1)"),
      faction: { type: "string", enum: ["friend", "neutral", "foe", "none"] },
      hidden: { type: "boolean", description: "Hidden from players" },
    }),
    run(args, ctx) {
      const agent = needTable(ctx);
      const token = agent.map.place(args, agent.seat);
      return out({ ...token, ...agent.map.squareOf(token) });
    },
  },
  {
    name: "kraken_token_move",
    description:
      "Move a token to a square (col/row, its top-left square). asPlayer: move it the way its owner would, stopped by walls and closed doors when line of sight is on; the answer says whether a wall stopped it.",
    inputSchema: object({ id: string("Token id"), col: number("Square across"), row: number("Square down"), asPlayer: { type: "boolean" } }, ["id", "col", "row"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const token = map.tokens().find((item) => item.id === args.id);
      if (!token) throw new Error(`No token ${args.id}.`);
      const to = map.squareCenter(args.col, args.row, token.squares);
      const moved = map.move(args.id, to, seat, { collide: args.asPlayer ? map.sightOn() : false });
      return out({ id: moved.token.id, ...map.squareOf(moved.token), blocked: moved.blocked });
    },
  },
  {
    name: "kraken_token_update",
    description:
      "Change a token: name, hidden from players, size in squares, faction, owner (player name), a carried light (a preset: candle, lamp, torch, lantern, light, a game light profile name such as Torch, none; or {bright, dim, color} in feet), and its sight in the dark in feet (vision; null goes back to the character's senses).",
    inputSchema: object({
      id: string("Token id"),
      light: { description: "Preset name, or {bright, dim, color} in feet, or none" },
      vision: { type: ["number", "null"], description: "Sight in the dark, feet" },
      name: string("Name"),
      hidden: { type: "boolean" },
      squares: number("Size in squares"),
      faction: { type: "string", enum: ["friend", "neutral", "foe", "none"] },
      owner: string("Player who may move it"),
    }, ["id"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const { id, ...patch } = args;
      return out(map.update(id, patch, seat));
    },
  },
  {
    name: "kraken_combat",
    description:
      "The combat tracker (SiegeCore rules: d10 initiative, high to low; unconscious enemies lose their turns; effect durations count down each round; the dying bleed). action view (default); add (recordId of a character or NPC, count, hidden, place: also put tokens on the map; or entry {name, faction, hp, ac, init}); add-party; init (which: an entry id, npcs or all); next (next turn); round (next round); end (removeNpcs); update (id, patch {name, faction, init, initresult, hp, wounds, ac, hidden}); remove (id); damage / heal (id, amount); effect (id, effect {label, duration in rounds, gmOnly}); effect-remove (id, effectId); target (id: the attacker entry, targetId, on true/false); clear-targets (id); attack / damage-roll (a character: recordId + weapon = its inventory key; an NPC: id + weapon = its attack key from view's attacks): SiegeCore's attack, one d20 per target against its AC (equal hits), damage rolled once and put on every target; save (id, attribute, cl): a SIEGE save; cast (recordId, power: its powers key, castAction: the power's actions key): spends a slot, targets save against the caster level, damage halves or cancels on a save, effects land on those who failed, healing goes to the targets.",
    inputSchema: object({
      action: { type: "string", enum: ["view", "add", "add-party", "init", "next", "round", "end", "update", "remove", "damage", "heal", "effect", "effect-remove", "target", "clear-targets", "attack", "damage-roll", "save", "cast"] },
      targetId: string("target: the entry to target"),
      on: { type: "boolean", description: "target: add (true) or drop (false)" },
      weapon: string("attack / damage-roll: inventory key (character) or attack key (NPC)"),
      attribute: string("save: strength, dexterity, constitution, intelligence, wisdom or charisma"),
      cl: number("save: the challenge level"),
      power: string("cast: the character's powers key"),
      castAction: string("cast: the power's actions key"),
      id: string("Tracker entry id"),
      recordId: string("Character or NPC record id"),
      count: number("How many of that NPC"),
      hidden: { type: "boolean" },
      place: { type: "boolean", description: "Also place tokens on the map" },
      entry: { type: "object" },
      which: string("init: an entry id, npcs or all"),
      removeNpcs: { type: "boolean" },
      patch: { type: "object" },
      amount: number("Damage or healing"),
      effect: { type: "object", properties: { label: { type: "string" }, duration: { type: "number" }, gmOnly: { type: "boolean" } }, additionalProperties: false },
      effectId: string("Effect id"),
    }),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const { combat, seat, map } = agent;
      const action = args.action ?? "view";
      if (action === "add") {
        const added = await combat.add(args.entry ?? { recordId: args.recordId, count: args.count, hidden: args.hidden }, seat);
        if (args.place && map.scene()) {
          for (const entry of Array.isArray(added) ? added : [added]) {
            if (entry.tokenId) continue;
            const token = map.place({ recordId: entry.recordId, name: entry.name, hidden: entry.hidden, faction: entry.faction, allowSecond: false }, seat);
            combat.update(entry.id, { tokenId: token.id }, seat);
          }
        }
      } else if (action === "add-party") {
        for (const member of (await party.partyView(agent)).members) await combat.add({ recordId: member.id }, seat);
      } else if (action === "init") await combat.rollInit(args.which ?? "all", seat);
      else if (action === "next") await combat.next(seat);
      else if (action === "round") await combat.nextRound(seat);
      else if (action === "end") combat.end(seat, { removeNpcs: Boolean(args.removeNpcs) });
      else if (action === "update") combat.update(args.id, args.patch ?? {}, seat);
      else if (action === "remove") combat.remove(args.id, seat);
      else if (action === "damage") await combat.damage(args.id, args.amount, seat);
      else if (action === "heal") await combat.heal(args.id, args.amount, seat);
      else if (action === "effect") combat.addEffect(args.id, args.effect ?? {}, seat);
      else if (action === "effect-remove") combat.removeEffect(args.id, args.effectId, seat);
      else if (action === "target") combat.target(args.id, args.targetId, args.on ?? true, seat);
      else if (action === "clear-targets") combat.clearTargets(args.id, seat);
      else if (action === "attack") return out({ results: await combat.attack(args.recordId ? { recordId: args.recordId } : { entryId: args.id }, args.weapon, seat, "Agent"), combat: combat.viewFor(seat) });
      else if (action === "save") return out({ save: await combat.save(args.id, args.attribute, args.cl ?? 0, "Agent"), combat: combat.viewFor(seat) });
      else if (action === "cast") return out({ cast: await combat.cast(args.recordId, args.power, args.castAction ?? "", seat, "Agent"), combat: combat.viewFor(seat) });
      else if (action === "damage-roll") return out({ damage: await combat.damageRoll(args.recordId ? { recordId: args.recordId } : { entryId: args.id }, args.weapon, seat, "Agent"), combat: combat.viewFor(seat) });
      return out(combat.viewFor(seat));
    },
  },
  {
    name: "kraken_party",
    description:
      "The party sheet: members (in party order: hp, wounds, AC, level, XP), the party inventory (every member's items with who carries them), the parcel (coins and items waiting to be handed out), quests and encounters with their XP, marching order and watches.",
    inputSchema: object({}),
    async run(_args, ctx) {
      return out(await party.partyView(needTable(ctx)));
    },
  },
  {
    name: "kraken_party_edit",
    description:
      "Change the party sheet. members: the character ids in party order (or allPlayers: every character a player owns). parcel coins: { GP: 30, SP: 12 } (amounts to hand out). parcelItem: add an item to the parcel {name, count, assign: \"Name, Name\", itemId: an item record to copy}. quest / encounter: add {name, xp}. marching: character ids front to back.",
    inputSchema: object({
      members: { type: "array", items: { type: "string" } },
      allPlayers: { type: "boolean" },
      coins: { type: "object", additionalProperties: { type: "number" } },
      parcelItem: { type: "object", properties: { name: { type: "string" }, count: { type: "number" }, assign: { type: "string" }, itemId: { type: "string" } }, additionalProperties: false },
      quest: { type: "object", properties: { name: { type: "string" }, xp: { type: "number" } }, additionalProperties: false },
      encounter: { type: "object", properties: { name: { type: "string" }, xp: { type: "number" } }, additionalProperties: false },
      marching: { type: "array", items: { type: "string" } },
    }),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const record = party.partyRecord(agent);
      const patch = {};
      const key = () => `id-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      if (args.allPlayers) {
        patch.members = agent.records
          .list({ type: "character" })
          .filter((item) => item.owner)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((item) => item.id);
      }
      if (args.members) patch.members = args.members.filter((id) => agent.records.get(id)?.type === "character");
      if (args.coins) patch.parcel = { ...(patch.parcel ?? {}), coins: args.coins };
      if (args.parcelItem) {
        const source = args.parcelItem.itemId ? agent.records.get(args.parcelItem.itemId) : null;
        patch.parcel = {
          ...(patch.parcel ?? {}),
          items: { [key()]: { name: args.parcelItem.name || source?.name || "Item", count: Math.max(1, Number(args.parcelItem.count) || 1), assign: args.parcelItem.assign ?? "", ...(source ? { item: source.data } : {}) } },
        };
      }
      if (args.quest) patch.quests = { [key()]: { name: args.quest.name ?? "Quest", xp: Number(args.quest.xp) || 0, awarded: 0 } };
      if (args.encounter) patch.encounters = { [key()]: { name: args.encounter.name ?? "Encounter", xp: Number(args.encounter.xp) || 0, awarded: 0 } };
      if (args.marching) patch.order = { marching: args.marching };
      if (patch.members) agent.records.update(record.id, { data: { members: null } }, agent.seat);
      agent.records.update(record.id, { data: patch }, agent.seat);
      return out(await party.partyView(agent));
    },
  },
  {
    name: "kraken_party_award",
    description: "Award XP to the party, split as FG does (the last member gets what is left). xp: an amount; or kind quests / encounters with an optional id, to award what is not awarded yet.",
    inputSchema: object({ xp: number("XP to split"), kind: { type: "string", enum: ["quests", "encounters"] }, id: string("One quest or encounter") }),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const xp = args.kind ? await party.awardEntries(agent, args.kind, args.id) : await party.awardXP(agent, args.xp);
      return out({ awarded: xp, party: (await party.partyView(agent)).members.map(({ name, exp }) => ({ name, exp })) });
    },
  },
  {
    name: "kraken_party_distribute",
    description: "Hand out the parcel: assigned items to the people named, then each coin split evenly across the party with the remainder left in the parcel (FG's Distribute).",
    inputSchema: object({}),
    async run(_args, ctx) {
      const agent = needTable(ctx);
      await party.distribute(agent);
      return out(await party.partyView(agent));
    },
  },
  {
    name: "kraken_party_group_check",
    description: "SiegeCore's group check or save: every party member rolls the attribute against the CL in front of the table, and chat sums up who succeeded.",
    inputSchema: object({ kind: { type: "string", enum: ["check", "save"] }, attribute: { type: "string", enum: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] }, cl: number("Challenge level") }, ["attribute"]),
    async run(args, ctx) {
      return out(await party.groupCheck(needTable(ctx), args.kind ?? "check", args.attribute, args.cl ?? 0));
    },
  },
  {
    name: "kraken_scene_settings",
    description:
      "The scene's map settings: darkness (0 day .. 1 pitch black; from 0.5 players see only lit places and their darkvision; null returns to the adventure's own), the grid (show, alpha, color), and weather (type: none, rain, storm, snow, blizzard, fog, clouds, sandstorm, embers, ash, leaves, water; intensity 0..1; direction in degrees the wind blows toward). Call with nothing to read them.",
    inputSchema: object({
      darkness: { type: ["number", "null"] },
      grid: { type: "object", properties: { show: { type: "boolean" }, alpha: { type: "number" }, color: { type: "string" } }, additionalProperties: false },
      weather: { type: "object", properties: { type: { type: "string" }, intensity: { type: "number" }, direction: { type: "number" } }, additionalProperties: false },
    }),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const settings = Object.keys(args).length > 0 ? map.updateSettings(args, seat) : map.settings();
      return out({ ...settings, darknessNow: map.darkness(), lightProfiles: map.lightProfiles().map((row) => ({ name: row.name, radius: row.radius })) });
    },
  },
  {
    name: "kraken_table_options",
    description:
      "The table's own options. towerReveal: a roll a player drops in the dice tower is shown to that player too (as FG, it is otherwise the GM's alone; the player sees only what went in). Call with nothing to read them.",
    inputSchema: object({ towerReveal: { type: "boolean" } }),
    run(args, ctx) {
      const agent = needTable(ctx);
      return out(Object.keys(args).length > 0 ? agent.setOptions(args) : agent.options());
    },
  },
  {
    name: "kraken_light",
    description:
      "Lights on the scene. action list; place (x, y in scene pixels or col/row, bright and dim in feet, color, or a preset: candle, lamp, torch, lantern, light); update (id and any of x, y, bright, dim, color, on, hidden); remove (id).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "place", "update", "remove"] },
      id: string("Light id"),
      x: number("Scene pixels across"),
      y: number("Scene pixels down"),
      col: number("Square across"),
      row: number("Square down"),
      bright: number("Bright radius, feet"),
      dim: number("Dim radius, feet"),
      color: string("CSS colour"),
      preset: string("candle, lamp, torch, lantern, light"),
      on: { type: "boolean" },
      hidden: { type: "boolean" },
    }, ["action"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const { action, id, col, row, ...rest } = args;
      if (Number.isFinite(col) && Number.isFinite(row)) Object.assign(rest, map.squareCenter(col, row, 1));
      if (action === "list") return out(map.lights());
      if (action === "place") return out(map.placeLight(rest, seat));
      if (action === "update") return out(map.updateLight(id, rest, seat));
      map.removeLight(id, seat);
      return out({ removed: id });
    },
  },
  {
    name: "kraken_token_remove",
    description: "Take a token off the scene.",
    inputSchema: object({ id: string("Token id") }, ["id"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      return out({ removed: map.remove(args.id, seat).id });
    },
  },
  {
    name: "kraken_door",
    description: "Open, close or lock a door on the scene (ids from kraken_map).",
    inputSchema: object({ id: string("Door (wall) id"), state: { type: "string", enum: ["open", "closed", "locked"] } }, ["id", "state"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const state = map.setDoor(args.id, { closed: 0, open: 1, locked: 2 }[args.state], seat);
      return out({ id: args.id, state });
    },
  },
  {
    name: "kraken_line_of_sight",
    description:
      "Turn line of sight on or off for the scene (on: players see only what their tokens see, and walls stop their tokens), lock or unlock player token movement, and report what a player sees now: the tokens and doors shown to them.",
    inputSchema: object({ on: { type: "boolean" }, lockMovement: { type: "boolean", description: "Stop players moving their tokens (FG's token lock)" }, player: string("Player name to look through") }),
    run(args, ctx) {
      const agent = needTable(ctx);
      if (args.on !== undefined) agent.map.setSight(args.on);
      if (args.lockMovement !== undefined) agent.map.setLocked(args.lockMovement);
      const view = args.player ? agent.viewFor(args.player) : null;
      if (view) view.dark = view.darkness;
      return out({
        sight: agent.map.sightOn(),
        lockMovement: agent.map.lockedNow(),
        ...(view ? { player: args.player, sees: view.tokens.map((token) => token.name), doors: view.doors.map((door) => door.id), limited: Boolean(view.vision) } : {}),
      });
    },
  },
  {
    name: "kraken_ui_screenshot",
    description: "Screenshot the GM's app window.",
    inputSchema: object({}),
    async run(_args, ctx) {
      const win = ctx.window();
      if (!win) throw new Error("The app window is closed.");
      const image = await win.webContents.capturePage();
      const size = image.getSize();
      const scaled = size.width > 1600 ? image.resize({ width: 1600 }) : image;
      return { content: [{ type: "image", data: scaled.toPNG().toString("base64"), mimeType: "image/png" }] };
    },
  },
  {
    name: "kraken_ui_text",
    description: "The visible text of the GM's app window.",
    inputSchema: object({}),
    async run(_args, ctx) {
      const win = ctx.window();
      if (!win) throw new Error("The app window is closed.");
      return out(await win.webContents.executeJavaScript("document.body ? document.body.innerText : ''"));
    },
  },
  {
    name: "kraken_ui_eval",
    description: "Run JavaScript in the GM's app window and return the result (for driving or inspecting the UI). window.__kraken has the session handle.",
    inputSchema: object({ code: string("An expression, or statements ending in a value") }, ["code"]),
    async run(args, ctx) {
      const win = ctx.window();
      if (!win) throw new Error("The app window is closed.");
      // Try the code as an expression; only if that does not parse, as statements.
      const source = JSON.stringify(String(args.code));
      const value = await win.webContents.executeJavaScript(
        `(async () => {
          const AsyncFunction = (async () => {}).constructor;
          let fn;
          try { fn = new AsyncFunction("return (" + ${source} + ");"); }
          catch (error) { if (!(error instanceof SyntaxError)) throw error; fn = new AsyncFunction(${source}); }
          return await fn();
        })()`,
        true,
      );
      return out(value === undefined ? "undefined" : value);
    },
  },
];

function listTools() {
  return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

async function callTool(name, args, ctx) {
  const tool = TOOLS.find((item) => item.name === name);
  if (!tool) throw new Error(`Unknown tool ${name}.`);
  return tool.run(args && typeof args === "object" ? args : {}, ctx);
}

module.exports = { listTools, callTool };
