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
const { siege, siegeLibrary, siegeCheck } = require("../siege.cjs");

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
    description: "Who is connected: id, name, role (dm or player), and where each pawn stands.",
    inputSchema: object({}),
    run(_args, ctx) {
      const agent = needTable(ctx);
      return out({ players: agent.players(), pawns: agent.pawns() });
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
