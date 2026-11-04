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
const { siege, siegeLibrary, siegeCheck, levelUp, changeClass } = require("../siege.cjs");
const party = require("../party.cjs");
const { editCharacter: siegeEdit, importCharacter, exportCharacter } = require("../siege.cjs");
const fs = require("fs");

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
    name: "kraken_campaign_ruleset",
    description: "Change a campaign's ruleset (Castles & Crusades, or Worldbuilding for no rules), as the campaign screen's Ruleset menu. It decides the campaign's books. Not while that campaign is hosted.",
    inputSchema: object({ campaignId: string("Campaign id from kraken_campaigns"), ruleset: string("Castles & Crusades or Worldbuilding") }, ["campaignId", "ruleset"]),
    run: (args, ctx) => out(ctx.campaigns.setRuleset({ id: args.campaignId, ruleset: args.ruleset })),
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
    description: "Roll dice in front of the table (the result goes to chat), or for the GM's eyes only (secret, as the GM's dice tower). Formulas: 1d20+3, 3d6, 4d6dl1 (drop lowest), 2d20kh1 (keep highest), d%.",
    inputSchema: object({ formula: string("Dice formula"), label: string("What the roll is for"), as: string("Name shown in chat, default Agent"), secret: { type: "boolean", description: "Only the GM sees it" } }, ["formula"]),
    run: (args, ctx) => out(needTable(ctx).roll(args.formula, args.label, args.as || "Agent", args.secret === true)),
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
    description:
      "Post a chat message to the table, as FG's chat commands do: kind say (default), emote (/emote: \"Agent nods\"), action (/action), ooc (/ooc), story (/story: the GM's narration, no name) or mood (/mood, with mood); to: whisper it to these players only (the GM sees every whisper, as FG's); as: the name shown (/id: an NPC speaking).",
    inputSchema: object(
      {
        text: string("Message"),
        as: string("Name shown, default Agent"),
        kind: { type: "string", enum: ["say", "emote", "action", "ooc", "story", "mood"] },
        mood: string("For kind mood: angry, laughing..."),
        to: { type: "array", items: { type: "string" }, description: "Player names to whisper to" },
      },
      ["text"],
    ),
    run: (args, ctx) =>
      out(
        needTable(ctx).say(args.text, args.as || "Agent", false, {
          ...(args.kind && args.kind !== "say" ? { kind: args.kind } : {}),
          ...(args.kind === "mood" && args.mood ? { mood: String(args.mood).slice(0, 24) } : {}),
          ...(Array.isArray(args.to) && args.to.length ? { to: args.to.map((name) => String(name).slice(0, 24)).slice(0, 12) } : {}),
        }),
      ),
  },
  {
    name: "kraken_books",
    description:
      "The GM's books, as FG's Library: the Fantasy Grounds modules on this computer that fit the campaign's ruleset (rulebooks, adventures), read inside Kraken. action list (every module that fits: id, title, category, hasBook, adventure, active, shared, forPlayers); activate / deactivate (book: active for this campaign, as FG's Activation; a player's book starts shared, the GM's books (monsters, the GM's guide, adventures) do not); contents (book: its chapters, sections and pages, and its pictures and maps); page (book, page: a page's text as HTML and its pictures); share / unshare (book: the players may read it, or not; never an adventure, whose pictures and maps the GM shows one at a time with show); show (book, file, name: show the players a picture or map from it; it opens as a tab on their screens); hide (id, or \"all\"); shared (what the players have now); sound (book, page, soundAction bind: a sound for one of the page's sound links, key = the link's data-sound-key; unbind (key); add: a sound in the story after a paragraph, block = its index (-1 at the top); remove (id); sound = a sound or folder id, as kraken_sound list); sounds (every sound kept in the books).",
    inputSchema: object(
      {
        action: { type: "string", enum: ["list", "activate", "deactivate", "contents", "page", "share", "unshare", "show", "hide", "shared", "sound", "sounds"] },
        soundAction: { type: "string", enum: ["bind", "unbind", "add", "remove"] },
        key: string("A sound link's key (bind, unbind)"),
        block: number("The paragraph a sound goes after (add); -1 for the top"),
        sound: string("A sound or folder id (bind, add)"),
        label: string("What the sound is called on the page"),
        book: string("A book's id (from list)"),
        page: string("A page's id (from contents)"),
        file: string("A picture's file in the book (from contents or a page)"),
        name: string("What the players see the picture called"),
        id: string("A shown picture's id (hide), or all"),
        search: string("Part of a title or category (list)"),
      },
      ["action"],
    ),
    run(args, ctx) {
      const table = needTable(ctx);
      const action = args.action;
      if (action === "list") {
        const wanted = String(args.search ?? "").toLowerCase();
        return out(table.books().filter((item) => !wanted || `${item.title} ${item.category}`.toLowerCase().includes(wanted)));
      }
      if (action === "activate" || action === "deactivate") return out(table.activateBook(args.book, action === "activate"));
      if (action === "contents") return out(table.bookContents(args.book));
      if (action === "page") return out(table.bookPage(args.book, args.page));
      if (action === "share" || action === "unshare") return out(table.shareBook(args.book, action === "share"));
      if (action === "show") return out(table.showImage(args.book, args.file, args.name));
      if (action === "sound") return out(table.setBookSound({ ...args, action: args.soundAction, id: args.id }));
      if (action === "sounds") return out(table.bookSounds());
      if (action === "hide") return out(table.hideImage(args.id ?? "all"));
      return out(table.shelf());
    },
  },
  {
    name: "kraken_party_order",
    description:
      "The party's watch order and marching formation, as FG's party sheet Order tab: a 7 by 7 grid (x and y from -3 to 3; with the party facing up, y 3 is the front) and three watches. action place (character, x, y: into a slot; onto another member swaps them), remove (character), watch (character, watch 1 to 3, or 0 for none), fill (columns 1, 2 or 3: the unplaced members into a column that wide from the front, then around the middle), rotate (direction left or right: the formation and its facing a quarter turn), clear. Returns the order: marching (front to back), watches, formation { facing 0 up 1 right 2 down 3 left, slots }.",
    inputSchema: object(
      {
        action: { type: "string", enum: ["place", "remove", "watch", "fill", "rotate", "clear"] },
        character: string("A party member's id or name"),
        x: number("Slot column, -3 (left) to 3 (right)"),
        y: number("Slot row, -3 (back) to 3 (front)"),
        watch: number("1 to 3, or 0 for none"),
        columns: number("1, 2 or 3 abreast"),
        direction: { type: "string", enum: ["left", "right"] },
      },
      ["action"],
    ),
    run(args, ctx) {
      const table = needTable(ctx);
      const wanted = String(args.character ?? "").toLowerCase();
      const found = wanted ? table.records.list({ type: "character" }).find((record) => record.id === args.character || record.name.toLowerCase() === wanted) : null;
      if (wanted && !found) throw new Error(`No character "${args.character}".`);
      return out(party.changeOrder(table, table.seat, { ...args, id: found?.id }));
    },
  },
  {
    name: "kraken_draw",
    description: "Drawing on the open scene, for everyone, as the map toolbar's pen, and the GM's paint (the map editor's Paint tab): action list (the lines: id, who drew it, colour, width, points, shape, fill, group), draw (points: [x, y, x, y, ...] in scene pixels, colour #rrggbb, width; the GM also: shape free, line, rect or ellipse (points: two corners), poly (closed), fill #rrggbb and fillAlpha 0..1, alpha 0..1, group: a layer group (made if new; a group players may not see keeps its paint with the GM)), erase (id), clear (every line).",
    inputSchema: object(
      {
        action: { type: "string", enum: ["list", "draw", "erase", "clear"] },
        points: { type: "array", items: { type: "number" }, description: "x, y, x, y, ... in scene pixels" },
        color: string("#rrggbb"),
        width: number("Line width in scene pixels"),
        id: string("A line's id (erase)"),
        shape: { type: "string", enum: ["free", "line", "rect", "ellipse", "poly"] },
        fill: string("#rrggbb fill (rect, ellipse, poly)"),
        fillAlpha: number("0..1"),
        alpha: number("Line opacity 0..1"),
        group: string("Layer group"),
      },
      ["action"],
    ),
    run(args, ctx) {
      const table = needTable(ctx);
      if (args.action === "draw") return out(table.map.draw({ points: args.points, color: args.color, width: args.width, shape: args.shape, fill: args.fill, fillAlpha: args.fillAlpha, alpha: args.alpha, group: args.group }, table.seat));
      if (args.action === "erase") {
        table.map.erase(String(args.id ?? ""), table.seat);
        return out({ erased: args.id });
      }
      if (args.action === "clear") {
        table.map.clearDrawings(table.seat);
        return out({ cleared: true });
      }
      return out(table.map.drawings());
    },
  },
  {
    name: "kraken_quickslots",
    description: "A seat's quick slots (the bar along the bottom of the table: ten things kept at hand, opened with a click): the GM's, or a player's by name. Read them, or set slots to a list of ten (null for an empty slot): { kind: book, book (id), page (id, optional), label } | { kind: picture, book, file, label } | { kind: sheet, record (character id), label }.",
    inputSchema: object({ seat: string("A player's name; empty for the GM"), slots: { type: "array", description: "Ten slots, or leave out to read" } }),
    run(args, ctx) {
      return out(needTable(ctx).quickSlots(args.seat || "@gm", args.slots));
    },
  },
  {
    name: "kraken_character_edit",
    description:
      "Change a character as typed on its sheet (FG's C&C sheet), then every number is worked out again by the rules. changes: [{ path, value }], path one of: name; playername, gender, age, height, weight, size, alignment, deity, origin, appearance, notes, specialdefenses, specialmovement, senses, speed (text); attributes.<strength|dexterity|...>.score or .prime (0/1); hp.wounds, hp.temp, hp.nonlethal; exp; initiative.misc; attack.<melee|ranged|grapple|...>.misc; ac.misc, ac.natural, ac.deflection, ac.size; coins.<id>.amount; inventorylist.<id>.count, .location, .carried (0 left behind, 1 carried, 2 worn or in hand); inventorylist.<id> = null drops it; languages.add = a language; languagelist.<id> = null removes one.",
    inputSchema: object({ id: string("The character's record id"), changes: { type: "array", items: { type: "object" } } }, ["id", "changes"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      const record = table.records.get(args.id);
      if (!record || record.type !== "character") throw new Error(`No character "${args.id}".`);
      const updated = await siegeEdit(table, record, args.changes, table.seat);
      return out({ id: updated.id, name: updated.name, level: updated.data.level, hp: updated.data.hp, ac: updated.data.ac?.total, attributes: updated.data.attributes });
    },
  },
  {
    name: "kraken_class_change",
    description:
      "Change a character's classes at a level up (the Adventurer's Backpack, as FG's level-up wizard). mode dual: keep the class and add another at 1st level (the combination table must allow it, and the character must already have one of its primes); from then on experience is split between the classes and only the original class gains hit points (on the Multi-Class Hit Die). mode reclass: abandon the class for another (no table or prime needed; primes swap); the old class loses a level (two when leaving a cleric, druid or paladin for a class serving no deity) and that level's hit points; the new class starts at 1st with fixed hit points (the Reclass Hit Point Modification) until it passes the old one. Only for a character with one class.",
    inputSchema: object({ id: string("The character's record id"), mode: { type: "string", enum: ["dual", "reclass"] }, className: string("The class to add or change to") }, ["id", "mode", "className"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      const record = table.records.get(args.id);
      if (!record || record.type !== "character") throw new Error(`No character "${args.id}".`);
      const { record: updated, summary } = await changeClass(table, record, args.mode, args.className, "Agent");
      return out({ summary, level: updated.data.level, exp: updated.data.exp, expnext: updated.data.expnext, expnextsource: updated.data.expnextsource, hp: updated.data.hp, packages: Object.values(updated.data.packages ?? {}).map((pkg) => ({ name: pkg.name, level: pkg.level })) });
    },
  },
  {
    name: "kraken_character_import",
    description:
      "Bring a character in from another table: a Kraken export (.kraken.json), a Fantasy Grounds character XML (an SC C&C character comes over whole; another ruleset's is mapped), a Foundry VTT actor's Export Data JSON or a Roll20 character JSON. A character from another game becomes a C&C character with this campaign's books (race, class, level, scores, hit points and spells through the builder; gear and coin as they were); what did not match is listed in its notes. Give path (a file on this computer) or text (its contents). owner: the player it is for (empty for the GM).",
    inputSchema: object({ path: string("A character file on this computer"), text: string("The file's contents, instead of path"), owner: string("The player's name it is for") }),
    async run(args, ctx) {
      const table = needTable(ctx);
      const body = args.text ?? (args.path ? fs.readFileSync(String(args.path), "utf8") : "");
      const { record, format, report } = await importCharacter(table, body, { owner: String(args.owner ?? "").slice(0, 24) });
      return out({ id: record.id, name: record.name, format, report, level: record.data.level, race: record.data.race, hp: record.data.hp, ac: record.data.ac?.total });
    },
  },
  {
    name: "kraken_character_export",
    description: "A character as a file to take to another table: format kraken (JSON, the whole sheet; Kraken imports it back as it was) or fg (a Fantasy Grounds character XML, for FG's SC C&C sheet). Give path to write it there; otherwise the text comes back.",
    inputSchema: object({ id: string("The character's record id"), format: { type: "string", enum: ["kraken", "fg"] }, path: string("Where to write the file") }, ["id"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      const record = table.records.get(args.id);
      if (!record || record.type !== "character") throw new Error(`No character "${args.id}".`);
      const file = await exportCharacter(record, args.format === "fg" ? "fg" : "kraken");
      if (args.path) {
        fs.writeFileSync(String(args.path), file.text, "utf8");
        return out({ path: String(args.path), bytes: file.text.length, format: args.format ?? "kraken" });
      }
      return out({ file: file.file, format: args.format ?? "kraken", text: file.text });
    },
  },
  {
    name: "kraken_sound",
    description:
      "Sound for the table, as Syrinscape in FG, from the GM's sounds (assets/sounds: oneshots, sfx, ambience, music; a folder plays one of its sounds at random). Every seat hears it, each at its own volumes. action list (kind, search: what there is, by folder); play (id or folder, e.g. \"oneshots/Doors/Wooden Door\" or \"sfx/Weapons/Sword/Hit\"); stop (stops one-shots and effects); ambience (add, remove, volume or clear loops; id, volume 0..1); music (play an id or a folder, next, stop, volume); triggers (the chat's sound triggers: read them, or set triggers to a list, or \"default\"); scape (what is playing now).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "play", "stop", "ambience", "music", "triggers", "scape"] },
      kind: { type: "string", enum: ["oneshots", "sfx", "ambience", "music"] },
      search: string("Part of a name or folder (list)"),
      id: string("A sound's id, or a folder"),
      volume: number("0 to 1"),
      do: { type: "string", enum: ["add", "remove", "volume", "clear", "play", "next", "stop"], description: "For ambience and music" },
      loop: { type: "boolean", description: "Music: loop the track (default true)" },
      triggers: { description: "A list of { name, on: attack|spellattack|save|cast|heal|damage|roll|text, match, result: any|hit|miss|crit|fumble|success|failure, sound, enabled }, or \"default\"" },
    }),
    run(args, ctx) {
      const agent = needTable(ctx);
      const library = agent.sounds();
      const action = args.action ?? "scape";
      if (action === "list") {
        if (!library) return out({ sounds: [], note: "This table has no sound library." });
        const wanted = String(args.search ?? "").toLowerCase();
        const groups = library.groups(args.kind).filter((group) => !wanted || group.id.toLowerCase().includes(wanted));
        return out({ folder: library.folder, groups, sounds: library.list(args.kind).filter((item) => !wanted || item.id.toLowerCase().includes(wanted)).slice(0, 200) });
      }
      if (action === "play") return out({ playing: agent.playSound(String(args.id ?? ""), args.volume) });
      if (action === "stop") {
        return out({ stopped: true, ...(agent.stopSounds ? agent.stopSounds() : {}) });
      }
      if (action === "ambience") return out(agent.ambience(args.do ?? "add", args.id, args.volume));
      if (action === "music") return out(agent.music(args.do ?? "play", args.id, { volume: args.volume, loop: args.loop }));
      if (action === "triggers") return out({ triggers: args.triggers !== undefined ? agent.setTriggers(args.triggers) : agent.triggers() });
      return out(agent.soundscape());
    },
  },
  {
    name: "kraken_kick",
    description: "FG's /kick: send a player away from the table (they can join again).",
    inputSchema: object({ name: string("The player's name") }, ["name"]),
    run(args, ctx) {
      const gone = needTable(ctx).kick(args.name);
      if (!gone) throw new Error(`Nobody called ${args.name} is at the table.`);
      return out({ kicked: gone });
    },
  },
  {
    name: "kraken_vote",
    description: "FG's /vote: ask the table a yes-or-no question (everyone answers in chat and sees the count), or with no question, read the votes so far.",
    inputSchema: object({ question: string("The question") }),
    run(args, ctx) {
      const agent = needTable(ctx);
      if (args.question) return out({ vote: agent.vote(args.question) });
      return out({ votes: agent.votes() });
    },
  },
  {
    name: "kraken_save",
    description: "FG's /save: save the campaign now.",
    inputSchema: object({}),
    run(_args, ctx) {
      needTable(ctx).save();
      return out({ saved: true });
    },
  },
  {
    name: "kraken_chat_log",
    description: "Recent chat, including roll results (the table's record, also lines the GM has cleared). clear: true clears the GM's chat window, as /clear; it stays cleared when the GM comes back.",
    inputSchema: object({ count: number("How many lines, default 20"), clear: { type: "boolean", description: "Clear the GM's chat window (/clear)" } }),
    run: (args, ctx) => out(args.clear ? needTable(ctx).clearChat() : needTable(ctx).chatLog(args.count)),
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
      "The combat tracker (SiegeCore rules: d10 initiative, high to low; unconscious enemies lose their turns; effect durations count down each round; the dying bleed). action view (default); add (recordId of a character or NPC, count, hidden, place: also put tokens on the map; or entry {name, faction, hp, ac, init}); add-party; init (which: an entry id, npcs or all); next (next turn); round (next round); end (removeNpcs); update (id, patch {name, faction, init, initresult, hp, wounds, ac, hidden}); remove (id); damage / heal (id, amount); effect (id, effect {label, duration in rounds, gmOnly}); effect-remove (id, effectId); target (id: the attacker entry, targetId, on true/false); clear-targets (id); attack / damage-roll (a character: recordId + weapon = its inventory key; an NPC: id + weapon = its attack key from view's attacks): SiegeCore's attack, one d20 per target against its AC (equal hits), damage rolled once and put on every target; save (id, attribute, cl): a SIEGE save; cast (recordId, power: its powers key, castAction: the power's actions key): spends a slot, targets save against the caster level, damage halves or cancels on a save, effects land on those who failed, healing goes to the targets. krits: critical hits and fumbles (the Castle Keeper's Guide options as Kraken Krits & Fumbles: a natural 20 rolls the critical table, a natural 1 the fumble table, and the result is applied: effects, damage, the next damage roll at maximum or doubled; ranged attacks use up ammunition; spells with spell resistance on are checked first). settings: { mode opt5|opt6|opt1|opt4, crit/fumble always|half|third|off, auto yes|no, npc yes|no, show all|gm, death gm|apply } (omit to read them). krit-test: roll a critical (kind crit) or fumble (kind fumble) for id against targetId (table, roll to fix the result).",
    inputSchema: object({
      action: { type: "string", enum: ["view", "add", "add-party", "init", "next", "round", "end", "update", "remove", "damage", "heal", "effect", "effect-remove", "target", "clear-targets", "attack", "damage-roll", "save", "cast", "krits", "krit-test"] },
      targetId: string("target: the entry to target"),
      on: { type: "boolean", description: "target: add (true) or drop (false)" },
      weapon: string("attack / damage-roll: inventory key (character) or attack key (NPC)"),
      attribute: string("save: strength, dexterity, constitution, intelligence, wisdom or charisma"),
      cl: number("save: the challenge level"),
      power: string("cast: the powers key of the character (recordId) or of the NPC on the tracker (id); an NPC's caster level is its hit dice and its uses per day are counted"),
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
      settings: { type: "object", description: "krits: the choices to change" },
      kind: { type: "string", enum: ["crit", "fumble"], description: "krit-test" },
      table: string("krit-test: a table key (opt5_crit, opt6_fumble...)"),
      roll: number("krit-test: the table roll"),
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
      else if (action === "cast") return out({ cast: await combat.cast(args.recordId ? { recordId: args.recordId } : { entryId: args.id }, args.power, args.castAction ?? "", seat, "Agent"), combat: combat.viewFor(seat) });
      else if (action === "krits") return out(await combat.krits(args.settings, seat));
      else if (action === "krit-test") return out({ krit: await combat.kritTest(args.kind, args.id, args.targetId, seat, args.table || args.roll ? { table: args.table, roll: args.roll } : undefined), combat: combat.viewFor(seat) });
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
      "The table's own options. towerReveal: a roll a player drops in the dice tower is shown to that player too (as FG, it is otherwise the GM's alone; the player sees only what went in). decal: the background decal (kraken_decal chooses one). Call with nothing to read them.",
    inputSchema: object({ towerReveal: { type: "boolean" } }),
    run(args, ctx) {
      const agent = needTable(ctx);
      return out(Object.keys(args).length > 0 ? agent.setOptions(args) : agent.options());
    },
  },
  {
    name: "kraken_decal",
    description:
      "The table's background and the GM's chat picture, as FG's: the decal (the picture in the middle, behind everything when no map is up) and the wallpaper (the tiles behind the desktop, FG's desktop theme), shown to every seat and saved with the campaign; and kind gmicon, the GM's chat picture beside everything the GM says (the Kraken GM Icon set, or the GM's own; it follows the GM into new campaigns; \"\" shows the name alone). kind decal (default), wallpaper or gmicon. action view (default): what is up now; list: what can be chosen (Kraken's own, a set for each game: D&D 5e, D&D 3.5e, AD&D 2e, AD&D, D&D, Castles & Crusades, Pathfinder 1e and 2e, Traveller 2e; the GM's assets folder; FG's), filtered by search (a game's name works); set: put one up (id from list; for a decal \"kraken\" is the Kraken emblem; \"\" is none, or a plain desktop); import: copy a picture from this computer (path) into the GM's assets folder, so every campaign can use it, and put it up.",
    inputSchema: object({
      kind: { type: "string", enum: ["decal", "wallpaper", "gmicon"] },
      action: { type: "string", enum: ["view", "list", "set", "import"] },
      id: string("Decal or wallpaper id (set)"),
      path: string("Full path of a .png, .webp, .jpg or .gif (import)"),
      search: string("Part of the name, group or game (list)"),
    }),
    run(args, ctx) {
      const agent = needTable(ctx);
      const wallpaper = args.kind === "wallpaper";
      const gmIcon = args.kind === "gmicon";
      const key = wallpaper ? "wallpaper" : gmIcon ? "gmIcon" : "decal";
      const library = wallpaper ? agent.wallpapers() : gmIcon ? agent.gmIcons() : agent.decals();
      const action = args.action ?? "view";
      if (action === "list") {
        const wanted = String(args.search ?? "").toLowerCase();
        const all = [...(wallpaper || gmIcon ? [] : [{ id: "kraken", name: "Kraken", group: "Kraken" }]), ...(library ? library.list() : [])];
        return out({ [`${key}s`]: all.filter((item) => !wanted || `${item.group} ${item.name} ${item.ruleset ?? ""}`.toLowerCase().includes(wanted)), folder: library?.folder ?? null });
      }
      if (action === "set") return out({ [key]: agent.setOptions({ [key]: String(args.id ?? "") })[key] });
      if (action === "import") {
        if (!library) throw new Error(`This table has no ${key} library.`);
        const item = library.addFile(String(args.path ?? ""));
        agent.setOptions({ [key]: item.id });
        return out({ imported: item, [key]: item.id });
      }
      return out({ [key]: agent.options()[key] });
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
    name: "kraken_wall",
    description:
      "Walls on the scene (the GM's map editor: FG's line-of-sight layer with Foundry's senses). action list (near: {x, y, r} to narrow, kind); add (points [x1, y1, x2, y2, ...] in scene pixels, or cells [[col, row], ...] for square corners; consecutive points make a chain; closed: true joins the last to the first; kind: wall, terrain (see into, not through), door, secret (a door players never see), toggle (the GM switches it on and off), window (see through, blocks movement; players may open it; windowStyle proximity: see through only within 2 squares, as Foundry), illusion (blocks sight only: curtains), invisible (blocks movement only), ethereal (blocks sight, not movement), shadow (blocks light only); or the senses sight, light, sound (0 none, 10 limited, 20 normal, 30 proximity, 40 distance), move (0, 20), dir (0 both, 1 left, 2 right: one way), door (0, 1, 2), ds (0 closed, 1 open, 2 locked), toggle (none, gm, players), threshold (feet), hidden (toggled off)); update (id or ids, and any field; a new kind brings its senses); remove (id or ids); split (id, x, y); clear; close_doors (every door and window shut, locks kept). Undo with kraken_map_undo.",
    inputSchema: object({
      action: { type: "string", enum: ["list", "add", "update", "remove", "split", "clear", "close_doors"] },
      id: string("Wall id"),
      ids: { type: "array", items: { type: "string" } },
      points: { type: "array", items: { type: "number" }, description: "x1, y1, x2, y2, ... in scene pixels" },
      cells: { type: "array", items: { type: "array", items: { type: "number" } }, description: "[[col, row], ...] grid corners, instead of points" },
      closed: { type: "boolean" },
      kind: { type: "string", enum: ["wall", "terrain", "door", "secret", "toggle", "window", "illusion", "invisible", "ethereal", "shadow"] },
      windowStyle: { type: "string", enum: ["through", "proximity"] },
      sight: number("0, 10, 20, 30, 40"),
      light: number("0, 10, 20, 30, 40"),
      sound: number("0, 10, 20, 30, 40"),
      move: number("0 or 20"),
      dir: number("0 both, 1 left, 2 right"),
      door: number("0, 1 door, 2 secret"),
      ds: number("0 closed, 1 open, 2 locked"),
      toggle: { type: "string", enum: ["none", "gm", "players"] },
      threshold: number("Feet (proximity and distance walls)"),
      hidden: { type: "boolean" },
      x: number("split: scene pixels across"),
      y: number("split: scene pixels down"),
      near: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, r: { type: "number" } } },
    }, ["action"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const { action, id, ids, cells, near, windowStyle, ...rest } = args;
      const which = ids ?? (id ? [id] : []);
      if (action === "list") {
        let list = map.walls();
        if (args.kind) list = list.filter((wall) => wall.kind === args.kind);
        if (near) list = list.filter((wall) => Math.min(Math.hypot(wall.x1 - near.x, wall.y1 - near.y), Math.hypot(wall.x2 - near.x, wall.y2 - near.y)) <= (near.r ?? 200));
        const byKind = {};
        for (const wall of map.walls()) byKind[wall.kind] = (byKind[wall.kind] ?? 0) + 1;
        return out({ total: map.walls().length, byKind, walls: list.slice(0, 500) });
      }
      const fields = { ...rest };
      delete fields.x;
      delete fields.y;
      // Foundry's window: sight and light pass only within 2 squares.
      if (args.kind === "window" && windowStyle === "proximity") Object.assign(fields, { sight: 30, light: 30, threshold: 2 * map.units(), toggle: "none" });
      if (action === "add") {
        let points = args.points;
        if (cells) {
          const size = map.squareCenter(1, 0, 1).x - map.squareCenter(0, 0, 1).x;
          const origin = map.squareCenter(0, 0, 1);
          points = cells.flatMap(([col, row]) => [origin.x - size / 2 + col * size, origin.y - size / 2 + row * size]);
        }
        const made = map.addWalls({ ...fields, points }, seat);
        return out({ added: made.length, ids: made.map((wall) => wall.id), walls: made });
      }
      if (action === "update") {
        delete fields.points;
        return out({ walls: map.updateWalls(which, fields, seat) });
      }
      if (action === "remove") {
        map.removeWalls(which, seat);
        return out({ removed: which });
      }
      if (action === "split") return out({ walls: map.splitWall(which[0], args.x, args.y, seat) });
      if (action === "clear") {
        map.clearWalls(seat);
        return out({ cleared: true });
      }
      map.closeDoors(seat);
      return out({ closed: true });
    },
  },
  {
    name: "kraken_mask",
    description:
      "The GM's mask over the map (FG's Mask tab): players see black where it is on, and are sent no tokens or doors under it. action list; on (Add Global Mask); off (Remove Global Mask); reveal or hide (a shape: points [x1, y1, ...] in scene pixels, or rect {x, y, width, height}, or cells [[col, row], ...] for whole squares; later shapes win; reveal turns the mask on); remove (id of a shape); clear (every shape). Undo with kraken_map_undo.",
    inputSchema: object({
      action: { type: "string", enum: ["list", "on", "off", "reveal", "hide", "remove", "clear"] },
      points: { type: "array", items: { type: "number" } },
      rect: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } },
      cells: { type: "array", items: { type: "array", items: { type: "number" } } },
      id: string("A shape's id (remove)"),
    }, ["action"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      if (args.action === "list") return out(map.mask());
      const shapes = [];
      if (args.points) shapes.push(args.points);
      if (args.rect) {
        const { x, y, width, height } = args.rect;
        shapes.push([x, y, x + width, y, x + width, y + height, x, y + height]);
      }
      for (const [col, row] of args.cells ?? []) {
        const centre = map.squareCenter(col, row, 1);
        const half = (map.squareCenter(1, 0, 1).x - map.squareCenter(0, 0, 1).x) / 2;
        shapes.push([centre.x - half, centre.y - half, centre.x + half, centre.y - half, centre.x + half, centre.y + half, centre.x - half, centre.y + half]);
      }
      if ((args.action === "reveal" || args.action === "hide") && shapes.length === 0) throw new Error("Give points, rect or cells.");
      let mask = null;
      if (shapes.length) for (const points of shapes) mask = map.setMask({ action: args.action, points }, seat);
      else mask = map.setMask({ action: args.action, id: args.id }, seat);
      return out({ on: mask.on, shapes: mask.shapes.length });
    },
  },
  {
    name: "kraken_label",
    description:
      "Text on the map (FG's Text tab): labels, numbers and pins. action list; add (x, y in scene pixels or col/row; text; font Bebas Neue, Cinzel, Georgia, Signika, Arial, Courier New; size in squares (1); color; rotation; anchor; outline {width, color}; shadow {offset, blur, color}; hidden; group (a layer group, made if new); icon pin, trap, door, chest for a map pin; link {kind: record, id} to open a record from it); number (places the group's next number, default group Numbers; never reused unless renumbered, as FG); update (id and fields); remove (id); renumber (group, start: 1). Players never get hidden text, text in a group they may not see, text under the mask, or a link to a record they may not open.",
    inputSchema: object({
      action: { type: "string", enum: ["list", "add", "number", "update", "remove", "renumber"] },
      id: string("Text id"),
      x: number("Scene pixels across"),
      y: number("Scene pixels down"),
      col: number("Square across"),
      row: number("Square down"),
      text: string("The words"),
      font: string("Bebas Neue, Cinzel, Georgia, Signika, Arial, Courier New"),
      size: number("Squares high (1)"),
      color: string("#rrggbb"),
      rotation: number("Degrees"),
      anchor: { type: "string", enum: ["center", "top", "bottom", "left", "right"] },
      outline: { type: "object" },
      shadow: { type: "object" },
      hidden: { type: "boolean" },
      group: string("Layer group (folder) name"),
      icon: { type: "string", enum: ["", "pin", "trap", "door", "chest"] },
      link: { type: "object" },
      start: number("renumber: the first number"),
    }, ["action"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const { action, id, col, row, start, ...fields } = args;
      if (Number.isFinite(col) && Number.isFinite(row)) Object.assign(fields, map.squareCenter(col, row, 1));
      if (action === "list") return out({ labels: map.labels(), groups: map.groups() });
      if (action === "add") return out(map.addLabel(fields, seat));
      if (action === "number") return out(map.addLabel({ ...fields, numbering: true }, seat));
      if (action === "update") return out(map.updateLabel(id, fields, seat));
      if (action === "renumber") return out(map.renumber(fields.group, seat, start ?? 1));
      map.removeLabel(id, seat);
      return out({ removed: id });
    },
  },
  {
    name: "kraken_map_group",
    description: "Layer groups on the scene (FG's layer folders): everything in a group (text now; paint and FX to come) is shown or not, seen by players or not, locked or not, all at once. action list; update (name and any of shown, players, locked, prefix for its numbers, name to rename; made if new); remove (name; its things leave the group).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "update", "remove"] },
      name: string("The group"),
      rename: string("A new name"),
      shown: { type: "boolean" },
      players: { type: "boolean" },
      locked: { type: "boolean" },
      prefix: string("Prefix for numbers (A for A1, A2...)"),
    }, ["action"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      if (args.action === "list") return out(map.groups());
      if (args.action === "remove") {
        map.removeGroup(args.name, seat);
        return out({ removed: args.name });
      }
      const { action: _a, name, rename, ...patch } = args;
      return out(map.updateGroup(name, { ...patch, ...(rename ? { name: rename } : {}) }, seat));
    },
  },
  {
    name: "kraken_fx",
    description:
      "FX layers on the scene (FG's FX tab): several at once, each rain, storm, snow, blizzard, fog, clouds, sandstorm, embers, ash, leaves or water, with FG's sliders amount, intensity, speed (0..1) and direction (degrees the wind blows toward), and a mask it fills (mode inside: only there, as water in a river) or leaves clear (outside: everywhere but there, as rain not under a roof). action list; add (type, name, amount, intensity, speed, direction, mask {use, mode, polygons: [[x1, y1, ...], ...]} or maskRect {x, y, width, height}, group, players false for the GM's eyes only); update (id and fields); remove (id).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "add", "update", "remove"] },
      id: string("FX layer id"),
      type: { type: "string", enum: ["rain", "storm", "snow", "blizzard", "fog", "clouds", "sandstorm", "embers", "ash", "leaves", "water"] },
      name: string("A name for the list"),
      amount: number("0..1"),
      intensity: number("0..1"),
      speed: number("0..1"),
      direction: number("Degrees"),
      mask: { type: "object" },
      maskRect: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } },
      maskMode: { type: "string", enum: ["inside", "outside"] },
      group: string("Layer group"),
      players: { type: "boolean" },
      shown: { type: "boolean" },
    }, ["action"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const { action, id, maskRect, maskMode, ...fields } = args;
      if (maskRect) {
        const { x, y, width, height } = maskRect;
        fields.mask = { use: true, mode: maskMode ?? "inside", polygons: [[x, y, x + width, y, x + width, y + height, x, y + height]] };
      } else if (maskMode) fields.mask = { ...(fields.mask ?? {}), mode: maskMode };
      if (action === "list") return out(map.fx());
      if (action === "add") return out(map.addFx(fields, seat));
      if (action === "update") return out(map.updateFx(id, fields, seat));
      map.removeFx(id, seat);
      return out({ removed: id });
    },
  },
  {
    name: "kraken_map_undo",
    description: "Undo the last edit to the scene's walls or mask in the map editor (up to 50 back).",
    inputSchema: object({}),
    run(_args, ctx) {
      const { map, seat } = needTable(ctx);
      return out({ undone: map.undo(seat) });
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
    name: "kraken_ping",
    description: "Ping a square on the map, as the GM clicking to point something out: everyone at the table sees it flash there.",
    inputSchema: object({ col: number("Square across, from the left"), row: number("Square down, from the top") }, ["col", "row"]),
    run(args, ctx) {
      const at = needTable(ctx).ping(Number(args.col), Number(args.row));
      return out({ pinged: { col: args.col, row: args.row }, x: at.x, y: at.y });
    },
  },
  {
    name: "kraken_open_adventure",
    description: "Open a prepared map bundle (an adventure .zip on this computer, with scenes, walls, lights and tokens) on the table, as the GM's Open map button. It is saved with the campaign; kraken_scenes lists and switches its scenes.",
    inputSchema: object({ path: string("Full path of the .zip") }, ["path"]),
    async run(args, ctx) {
      needTable(ctx);
      const fs = require("fs");
      const file = String(args.path ?? "");
      if (!/\.zip$/i.test(file) || !fs.existsSync(file)) throw new Error("No .zip at that path.");
      return out(await ctx.ui({ kind: "open-adventure", name: require("path").basename(file), bytes: new Uint8Array(fs.readFileSync(file)) }, 60000));
    },
  },
  {
    name: "kraken_open_fg_module",
    description:
      "Put an FG adventure module's maps on the table (B1 In Search of the Unknown, B2 The Keep on the Borderlands...): every map becomes a scene with its picture, FG's walls (doors, see-through and one-way walls), lights, grid, FX layers (rain, clouds, water in its mask) and FG's shortcuts as map pins in two GM-only layer groups (Map keys, Encounters) linked to the story entries and encounters. maps: names to take only some (part of the name); without, the module's playable maps (FG's Maps and Region map, or with a grid or walls; handouts and portraits stay in Images & Maps), all: true for every picture. The first map goes on the table; kraken_scenes switches.",
    inputSchema: object({ module: string("The module's name, as FG lists it"), maps: { type: "array", items: { type: "string" } }, all: { type: "boolean" } }, ["module"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      const { fgModuleBundle } = require("../importers/fgMaps.cjs");
      const bundle = fgModuleBundle(String(args.module), { only: args.maps, all: Boolean(args.all) });
      for (const [id, extra] of Object.entries(bundle.extras)) table.map.seed(id, extra);
      const opened = await ctx.ui({ kind: "open-adventure", name: bundle.name, bytes: new Uint8Array(bundle.bytes) }, 120000);
      return out({ opened, scenes: bundle.scenes });
    },
  },
  {
    name: "kraken_library",
    description:
      "FG's Library of an adventure module (B1, B2... read in place): action list (kind npc, battle (FG's encounters), parcel (treasure parcels) or table; search); npc (path: put the NPC on the combat tracker, count); battle (path: the encounter's NPCs onto the tracker, and when its FG map is open (kraken_open_fg_module) their tokens where FG placed them, hidden until revealed; place false: tracker only); parcel (path: its coins and items into the party sheet's parcel to hand out); table (path: roll it on the host's dice; the result goes to chat).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "npc", "battle", "parcel", "table"] },
      module: string("The module's name (list)"),
      kind: { type: "string", enum: ["npc", "battle", "parcel", "table"] },
      search: string("Part of the name (list)"),
      path: string("The record's FG path, as list gives it"),
      count: number("npc: how many"),
      place: { type: "boolean", description: "battle: place tokens on the open map (default true)" },
    }, ["action"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      const library = require("../library.cjs");
      if (args.action === "list") return out(library.list(String(args.module ?? ""), args.kind, args.search ?? ""));
      if (args.action === "npc") {
        const record = library.ensureNpc(table, String(args.path));
        return out({ added: await table.combat.add({ recordId: record.id, count: args.count }, table.seat), record: record.id });
      }
      if (args.action === "battle") return out(await library.addBattle(table, String(args.path), { place: args.place !== false }));
      if (args.action === "parcel") return out(library.giveParcel(table, String(args.path), party));
      return out(library.rollTable(table, String(args.path), "Agent"));
    },
  },
  {
    name: "kraken_scenes",
    description: "The adventures and scenes the GM has open, and which is on the table. Give adventure and/or scene (name or id) to put another on the table for everyone.",
    inputSchema: object({ adventure: string("Adventure name"), scene: string("Scene name or id") }),
    run: async (args, ctx) => out(await ctx.ui({ kind: "scenes", adventure: args.adventure, scene: args.scene })),
  },
  {
    name: "kraken_art",
    description:
      "The GM's art library (portraits and tokens found in the FG data folder), as the art pickers show it. Filter by kind and part of the name or group. A character's picture is its record's data.portrait (an id from here; kraken_record_update), a token's its data.token.",
    inputSchema: object({ kind: { type: "string", enum: ["portrait", "token"] }, search: string("Part of the name or group"), limit: number("At most this many, default 50") }),
    run(args, ctx) {
      const wanted = String(args.search ?? "").toLowerCase();
      const found = needTable(ctx).art(args.kind).filter((item) => !wanted || `${item.group} ${item.name}`.toLowerCase().includes(wanted));
      return out({ total: found.length, art: found.slice(0, Math.max(1, Math.min(500, Number(args.limit) || 50))) });
    },
  },
  {
    name: "kraken_windows",
    description:
      "The GM's windows: list them, or open, close, pop out (to a window of its own, for another monitor) or dock back a window. Kinds: characters, party, combat, players, settings, decals (the background decal picker), wallpapers (the desktop wallpaper picker), gmicons (the GM icon picker), krits (critical hits and fumbles), dice (this seat's dice: sets, colours, design, material, effects), sound (one-shots, effects, ambience, music, chat triggers, volumes), sheet (a character's sheet: give record, its id or name).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "open", "close", "popout", "dock"] },
      kind: { type: "string", enum: ["characters", "party", "combat", "players", "settings", "decals", "wallpapers", "gmicons", "krits", "library", "dice", "sound", "sheet", "books", "book", "images", "picture", "notes", "note"] },
      record: string("For a sheet: the character's record id or name"),
    }),
    run: async (args, ctx) => out(await ctx.ui({ kind: "windows", action: args.action ?? "list", window: args.kind, record: args.record })),
  },
  {
    name: "kraken_dice_settings",
    description:
      "The GM's own 3D dice, as FG's dice skins and more (everyone at the table sees the roller's dice as set here): show the dice rolling on the table, sound and volume (0..1); a ready-made set (preset: Classic Ruby, Dragonhide, Starfall, Ancient Bone, Magma Vein, Leviathan, Frost Glass, Molten Gold, Arcane Pearl, Obsidian, Carrara, Oak and Iron, Rune Steel, Kraken Deep), or the parts: body, accent (the second colour of two-colour designs) and ink (the numbers) as #rrggbb; design (classic = solid, marble, swirl, speckle, stripes, wood, runes, dragonhide, starfall, bone, magma, leviathan); material (plastic = resin, glass, metal, pearl, stone, wood); font for the numbers (classic, bold, runic = carved capitals, script); effect as they roll (none, sparkles, fire, frost, arcane, shadow, glow); crit: a natural 20 flares gold and a 1 red. A preset first, then any parts on top of it. Without arguments, reads them. Who sees a dice-tower result is kraken_table_options.",
    inputSchema: object({
      show: { type: "boolean" },
      sound: { type: "boolean" },
      volume: number("0 to 1"),
      preset: string("Preset name"),
      body: string("Dice colour, #rrggbb"),
      accent: string("Second colour, #rrggbb"),
      ink: string("Numbers colour, #rrggbb"),
      design: { type: "string", enum: ["classic", "marble", "swirl", "speckle", "stripes", "wood", "runes", "dragonhide", "starfall", "bone", "magma", "leviathan"] },
      material: { type: "string", enum: ["plastic", "glass", "metal", "pearl", "stone", "wood"] },
      font: { type: "string", enum: ["classic", "bold", "runic", "script"] },
      effect: { type: "string", enum: ["none", "sparkles", "fire", "frost", "arcane", "shadow", "glow"] },
      crit: { type: "boolean" },
    }),
    run: async (args, ctx) => out(await ctx.ui({ kind: "dice-settings", patch: args })),
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
