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
const { siege, siegeLibrary, siegeCheck, levelUp, changeClass, dropOnCharacter } = require("../siege.cjs");
const dnd5e = require("../dnd5e.cjs");
const dnd35 = require("../dnd35.cjs");
const adnd2e = require("../adnd2e.cjs");
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
    inputSchema: object({ name: string("Campaign name"), ruleset: string("Ruleset: Castles & Crusades, D&D 5E, D&D 3.5E (each played from the campaign's active books: the GM's rulebooks, or an SRD), AD&D 2E, Traveller (Mongoose 2E), Descending Darkness, Apeira Astra or Worldbuilding") }, ["name"]),
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
    name: "kraken_characters",
    description:
      "FG's character list and Character Selection. roster: every character at the table (name, portrait, species, class, level, owner, whether the owner is seated); what the portrait bar shows. give: hand a character to a player (owner = their name; they see it and it is theirs, as when they pick it in Character Selection). release: take it back (no one holds it; it is listed again for players to pick).",
    inputSchema: object(
      {
        action: { type: "string", enum: ["roster", "give", "release"] },
        id: string("Character record id (give, release)"),
        owner: string("The player's name (give)"),
      },
      ["action"],
    ),
    run(args, ctx) {
      const agent = needTable(ctx);
      if (args.action === "roster") return out({ roster: agent.roster() });
      const record = agent.records.get(args.id ?? "");
      if (!record || record.type !== "character") throw new Error(`No character ${args.id ?? ""}.`);
      if (args.action === "give") {
        if (!args.owner) throw new Error("give needs owner: the player's name.");
        agent.records.update(record.id, { owner: args.owner, visibility: "owner" }, agent.seat);
      } else if (args.action === "release") agent.records.update(record.id, { owner: "", visibility: "gm" }, agent.seat);
      else throw new Error("action is roster, give or release.");
      return out({ roster: agent.roster() });
    },
  },
  {
    name: "kraken_accounts",
    description:
      "Players' accounts (kept by the GM's app for all its campaigns, as Foundry's users): a player's name with an account needs its password to sit at the table, and their characters belong to it. list: every account (name, when made, last seen, signed-in browsers, seated now). create: make one for a player ahead of time (name, password, at least 6 characters). password: set a new password for a player who forgot theirs (every browser of theirs is signed out). remove: delete an account (its characters keep their owner's name). Passwords are never shown.",
    inputSchema: object(
      {
        action: { type: "string", enum: ["list", "create", "password", "remove"] },
        name: string("The player's name"),
        password: string("create and password: the password to set"),
      },
      ["action"],
    ),
    run: (args, ctx) => out(needTable(ctx).accounts(args)),
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
      "Build a character into the hosted campaign by its ruleset. Traveller (Mongoose 2E): spec { name, species, homeworld, characteristics {str, dex, end, int, edu, soc: 2 to 15}, careers [{name (Agent, Army, Citizen, Drifter, Entertainer, Marine, Merchant, Navy, Noble, Prisoner, Rogue, Scholar, Scout), terms, rank}] (or career, terms, rank), skills {'Gun Combat (Slug)': 1, 'Pilot (Small Craft)': 2, 'Vacc Suit': 0} or 'Gun Combat (Slug) 1, Vacc Suit 0', gear [names: the books' items or Kraken's weapons and armour: Autopistol, Laser Rifle, Blade, Cloth, Vacc Suit, Combat Armour...], credits, age (else 18 + 4 a term), notes }; returns upp, physical (STR + DEX + END), armour, initiative, skills, attacks. AD&D 2E (what the 2E character wizard sends): spec { name, race (Human, Dwarf, Elf, Gnome, Half-Elf, Halfling), class (Fighter, Paladin, Ranger, Cleric, Druid, Thief, Bard, Mage, the specialist wizards Abjurer, Conjurer, Diviner, Enchanter, Illusionist, Invoker, Necromancer, Transmuter, or a multi-class: Fighter/Thief), level, levels {class: level} (a multi-class's own, each capped by the race), dual {class: the first class, level: its level} (a human dual-class; class is the new one), scores {strength..charisma before the race's adjustments, strengthPercent for a warrior's 18} (or array: six scores, put in the class's order; else 16,15,14,13,12,10, the class's minimums met), hpRolls {class: [the hit die rolled for 2nd level, 3rd...]} (1st level is the die's highest; without rolls the average), alignment, kit (its name), gear [names, or [name, count]: the books' items or Kraken's weapons and armor: Long sword, Chain mail, Medium shield, Arrows (12)], money (gp left after shopping, laid out as GP/SP/CP; a priest keeps 3 gp, the rest goes to his order) or coins {pp, gp, ep, sp, cp}, weapons [proficiencies], specialize (a fighter's weapon), weaponSlots (a kit's own count), nonweapon [proficiencies], languages [all known], skills {openlocks: points...}, spells [names], deity, gender, age, agemax, height, weight, size, appearance, personalitytraits, ideals, bonds, flaws, notes }, or { pregen: the id of a book's pregenerated character (type pregencharsheet), name } to take it as it is; returns hp, ac, thaco, saves. D&D 3.5E (as the 3.5E character wizard makes one): spec { name, race, class, level (or classes [{name, level}] for a multiclass plan), scores {strength..charisma} before the race's adjustments (or array: six scores, put in the class's order; else the standard 15,14,13,12,10,8), increases {stat: n} (the ability increases of every 4th level; else +1 to the class's first ability), feats [names, a target in brackets: Weapon Focus (longsword)], skills {name: ranks, half ranks for cross-class: 'Craft (alchemy)': 2}, gear [item names or [name, count], as the books' or in other words: Heavy steel shield], gold (gp left over: goes on the sheet as gp, sp, cp), spells [names or {name, class, level}: spells known or a wizard's spellbook], languages [names; the race's own are added], alignment, choices {deity, domains [names], channel (Turn Undead or Rebuke Undead), school (Generalist or a school), prohibited [schools], familiar, companion, mount, combatstyle (Archery or Two-Weapon Combat), favoredenemies [types], febonus [types], roguespecials [names]}, deity, gender, age, height, weight, appearance, notes, fill (default true: feats, skills and gear not given are filled with the class's usual ones; false: exactly what is given) }, from the campaign's active 3.5E books (classes, races, feats, gear, spells, cleric domains): hit points as FG adds each level (the die's highest at 1st, then its average + Con), every 0-level spell in a wizard's spellbook, a cleric's, druid's, paladin's or ranger's whole class list for the levels it casts plus domain spells, the choices as class features; returns hp, ac, bab, saves. D&D 5E and Descending Darkness (as FG 5E's character wizard commits one, from the campaign's active books): spec { name, species, ancestry (a lineage: High Elf), size, class, subclass, background, level, scores {strength..charisma: before a kin's adjustments}, increases {stat: n} (a background's +2/+1, Ability Score Improvements, misc), skills [the class's choices], speciesSkills, backgroundSkills, expertise, languages, tools, feats [names; a background's own feat is added], kits {class: 'A'|'B'|'C', background: 'A'|'B'} (the books' starting kits: their items and coin), gear [[item name, count]] (more items, free; armor and shields worn), coins {GP: n, SP: n} (Descending Darkness: {GC: n}), wealth (a Legacy class's rolled starting gold, instead of kits), gold, spells [names], alignment, notes, warnings }; returns hp, ac. Castles & Crusades: build a SIEGE character from a spec, like the FG SC C&C wizard's buildFromSpec, into the hosted campaign. Needs the game's modules imported (kraken_import_fg_module: the Player's Handbook, and the Adventurer's Backpack for its classes). Spec: { name, race, class, level, scores: { strength: final score, ... }, primes: [chosen primes; the class prime is added], gold (gp before buying), gear: [[item name, count]], worn: [names], packed: [names], container, spells: [names in preference order], alignment, deity, gender, age, height, weight, appearance, notes }. owner: the player who plays it.",
    inputSchema: object(
      {
        spec: { type: "object", description: "The character spec" },
        owner: string("Owning player's name; empty for the GM"),
      },
      ["spec"],
    ),
    async run(args, ctx) {
      const agent = needTable(ctx);
      if (agent.ruleset?.() === "Apeira Astra") {
        const { record, problems } = await require("../astra.cjs").buildAstra(agent, args.spec, args.owner ?? "", agent.seat);
        return out({ created: true, id: record.id, stamina: record.data.hp.total, armour: record.data.ac.total, skills: record.data.skills, problems });
      }
      if (require("../mgt2.cjs").isMgt2Ruleset(agent.ruleset?.())) {
        const { record, problems } = await require("../mgt2.cjs").buildMgt2(agent, args.spec, args.owner ?? "", agent.seat);
        return out({ created: true, id: record.id, upp: record.data.upp, age: record.data.age, physical: record.data.hp.total, armour: record.data.ac.total, initiative: record.data.initiative.total, skills: Object.fromEntries(Object.entries(record.data.skills).map(([key, row]) => [row.name ?? key, row.level])), attacks: Object.values(record.data.attacks).map((attack) => `${attack.name} ${attack.bonus >= 0 ? "+" : ""}${attack.bonus} ${attack.damage}`), problems });
      }
      if (adnd2e.is2eRuleset(agent.ruleset?.())) {
        const { record, problems } = await adnd2e.build2e(agent, args.spec, args.owner ?? "", agent.seat);
        return out({ created: true, id: record.id, hp: record.data.hp.total, ac: record.data.ac.total, thaco: record.data.thaco, saves: Object.fromEntries(Object.entries(record.data.saves).map(([key, save]) => [key, save.total])), problems });
      }
      if (dnd35.is35Ruleset(agent.ruleset?.())) {
        const { record, problems } = await dnd35.build35(agent, args.spec, args.owner ?? "", agent.seat);
        return out({ created: true, id: record.id, hp: record.data.hp.total, ac: record.data.ac.total, bab: record.data.bab, saves: Object.fromEntries(Object.entries(record.data.saves).map(([key, save]) => [key, save.total])), problems });
      }
      if (dnd5e.isD20Ruleset(agent.ruleset?.())) {
        const { record, problems } = await dnd5e.build5e(agent, args.spec, args.owner ?? "", agent.seat);
        return out({ created: true, id: record.id, hp: record.data.hp.total, ac: record.data.ac.total, problems });
      }
      const { builder } = await siege();
      const library = siegeLibrary(agent.records);
      if (library.packages.length === 0) throw new Error("No SIEGE packages in this campaign. Import the game's modules first (kraken_import_fg_module).");
      const { character, report } = builder.buildFromSpec(args.spec, library);
      if (!character) return out({ created: false, report });
      const record = agent.records.create(
        { type: "character", name: character.name || "Unnamed character", owner: args.owner ?? "", visibility: args.owner ? "owner" : "gm", data: require("../characterArt.cjs").withArt(character, args.spec, agent.art) },
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
      if (adnd2e.is2e(record)) {
        const derived = (await adnd2e.rules2e()).derive(record.data);
        const updated = agent.records.update(args.id, { data: derived }, agent.seat, { replace: true });
        return out({ id: updated.id, level: derived.level, thaco: derived.thaco, hp: derived.hp.total, ac: derived.ac.total, expnext: derived.expnext });
      }
      if (dnd35.is35(record)) {
        const derived = (await dnd35.rules35()).derive(record.data);
        const updated = agent.records.update(args.id, { data: derived }, agent.seat, { replace: true });
        return out({ id: updated.id, level: derived.level, bab: derived.bab, hp: derived.hp.total, ac: derived.ac.total, expnext: derived.expnext });
      }
      if (dnd5e.is5e(record)) {
        const derived = (await dnd5e.rules5e()).derive(record.data);
        const updated = agent.records.update(args.id, { data: derived }, agent.seat, { replace: true });
        return out({ id: updated.id, level: derived.level, prof: derived.prof, hp: derived.hp.total, ac: derived.ac.total, expnext: derived.expnext });
      }
      const { engine } = await siege();
      const derived = engine.derive(record.data, siegeLibrary(agent.records).game);
      const updated = agent.records.update(args.id, { data: derived }, agent.seat, { replace: true });
      return out({ id: updated.id, level: derived.level, bth: derived.bth, hp: derived.hp?.total, ac: derived.ac?.total, expnext: derived.expnext });
    },
  },
  {
    name: "kraken_level_up",
    description: "Raise a character one level in its class. The host rolls the new level's hit points in front of the table, then the sheet is rebuilt (BtH, hit dice, XP to next level, slots, class abilities). Experience is not checked: the GM may level a character early.",
    inputSchema: object({ id: string("Character record id"), package: string("Package key under packages, when the character has more than one class (AD&D 2E: the class's name, for a multi-class character)") }, ["id"]),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const record = agent.records.get(args.id);
      if (!record) throw new Error(`No record ${args.id}.`);
      const { record: updated, gain, level } = await levelUp(agent, record, args.package);
      return out({ id: updated.id, level, gain, hp: updated.data.hp.total, ...(dnd5e.is5e(updated) ? { prof: updated.data.prof } : dnd35.is35(updated) ? { bab: updated.data.bab } : adnd2e.is2e(updated) ? { thaco: updated.data.thaco } : { bth: updated.data.bth }), expnext: updated.data.expnext });
    },
  },
  {
    name: "kraken_character_improve",
    description:
      "Apeira Astra: spend a character's experience to improve it (the sheet's Improve): skill (its next level: costs that level x 2, a new skill at 0 costs 1; at most 4) or attribute (a characteristic +1: costs 6; at most 15). The character must have the experience (the GM gives it with kraken_character_edit exp). Chat says what was bought.",
    inputSchema: object({ id: string("Character record id"), skill: string("A skill's name, as Pilot or Zero-G"), attribute: { type: "string", enum: ["brawn", "reflex", "grit", "intellect", "training", "presence"] } }, ["id"]),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const record = agent.records.get(args.id);
      if (!record) throw new Error(`No record ${args.id}.`);
      const { record: updated, cost, now } = await require("../astra.cjs").improveAstra(agent, record, { skill: args.skill ?? "", attribute: args.attribute ?? "" }, agent.seat, "Agent");
      return out({ id: updated.id, now, cost, exp: updated.data.exp, skills: updated.data.skills, characteristics: updated.data.characteristics });
    },
  },
  {
    name: "kraken_siege_check",
    description: "Make a check or save for a character in front of the table, by the campaign's ruleset. Traveller: a task, 2d6 + the characteristic's DM + the skill's level (untrained -3, less Jack-of-all-Trades) + bonus, against dc (the difficulty's number: Simple 2, Easy 4, Routine 6, Average 8 (default), Difficult 10, Very Difficult 12, Formidable 14); skill its name ('Gun Combat (Slug)', 'Pilot (Small Craft)'), attribute a characteristic (str, dex, end, int, edu, soc) to roll alone or to use instead of the skill's usual one; advantage boon or bane (3d6, the best or worst two); returns the Effect. Apeira Astra: a task, 2d6 + skill + characteristic against 8. Castles & Crusades: a SIEGE attribute check or save, d20 + attribute modifier + level (when added) + bonus, against the challenge base (prime 12 / secondary 18 by default) + challenge level. D&D 5E: kind check (an ability), save, or skill (skill: its name), d20 + modifier (+ proficiency) + bonus, against dc; advantage or disadvantage rolls 2d20. AD&D 2E: kind save (attribute paralyzation, rod, petrification, breath or spell: d20 + bonus at or above the number), check (attribute an ability: d20 at or under the score, a bonus comes off the die) or skill (skill a thief skill's key: openlocks, pickpockets...: d100 at or under). Goes to chat.",
    inputSchema: object(
      {
        id: string("Character record id"),
        attribute: string("The attribute: strength..charisma (d20 games), a 2E save, Traveller's str, dex, end, int, edu, soc, Apeira Astra's brawn..presence"),
        cl: number("C&C: challenge level, default 0"),
        bonus: number("Extra modifier, default 0"),
        addLevel: { type: "boolean", description: "Add the character's level (default: the game's SIEGE_ADD_LEVEL)" },
        label: string("What the check is for"),
        kind: { type: "string", enum: ["check", "save", "skill"], description: "5E: an ability check, a saving throw, or a skill" },
        skill: string("5E: the skill (Perception, Stealth...)"),
        dc: number("5E: the difficulty class"),
        advantage: { type: "string", enum: ["", "advantage", "disadvantage", "boon", "bane"] },
      },
      ["id"],
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
    async run(args, ctx) {
      const table = needTable(ctx);
      const action = args.action;
      if (action === "list") {
        const wanted = String(args.search ?? "").toLowerCase();
        return out(table.books().filter((item) => !wanted || `${item.title} ${item.category}`.toLowerCase().includes(wanted)));
      }
      if (action === "activate" || action === "deactivate") return out(await table.activateBook(args.book, action === "activate"));
      if (action === "contents") return out(await table.bookContents(args.book));
      if (action === "page") return out(await table.bookPage(args.book, args.page));
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
    description: "Drawing on the open scene, for everyone, as the map toolbar's pen, and the GM's paint (the map editor's Paint tab): action list (the lines: id, who drew it, colour, width, points, shape, fill, group), draw (points: [x, y, x, y, ...] in scene pixels, colour #rrggbb, width; the GM also: shape free, line, rect or ellipse (points: two corners), poly (closed), fill #rrggbb and fillAlpha 0..1, alpha 0..1, group: a layer group (made if new; a group players may not see keeps its paint with the GM)), resize (id, points: a shape's two points moved, as its handles dragged), erase (id), clear (every line). Shapes, for players too (the pen's shapes, in their colour, measured as drawn): line, arrow (direction and aim), rect (a square: two corners), circle (its centre, then a point on its edge: the radius), cone (its point, then the middle of its far end; as wide there as it is long).",
    inputSchema: object(
      {
        action: { type: "string", enum: ["list", "draw", "resize", "erase", "clear"] },
        points: { type: "array", items: { type: "number" }, description: "x, y, x, y, ... in scene pixels" },
        color: string("#rrggbb"),
        width: number("Line width in scene pixels"),
        id: string("A line's id (erase)"),
        shape: { type: "string", enum: ["free", "line", "arrow", "rect", "ellipse", "circle", "cone", "poly"] },
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
      if (args.action === "resize") return out(table.map.reshape(String(args.id ?? ""), args.points, table.seat));
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
    description: "A seat's quick slots (the bar along the bottom of the table: ten things kept at hand, opened with a click): the GM's, or a player's by name. Read them, or set slots to a list of ten (null for an empty slot): { kind: book, book (id), page (id, optional), label } | { kind: picture, book, file, label } | { kind: sheet, record (character id), label } | { kind: dice, formula (3d6, 1d20+2), label } (rolled with a click, as dice dropped on it from the tray) | { kind: macro, text (a chat line: /roll 4d6k3), label } (run as if typed). press: a slot's index (0-9; the key 1-9, 0) uses it as the seat's click does (the GM's own bar).",
    inputSchema: object({ seat: string("A player's name; empty for the GM"), slots: { type: "array", description: "Ten slots, or leave out to read" }, press: number("The GM's slot to use (0-9), as its click or number key") }),
    async run(args, ctx) {
      if (Number.isInteger(args.press)) return out(await ctx.ui({ kind: "quickslots", action: "press", index: args.press }));
      return out(needTable(ctx).quickSlots(args.seat || "@gm", args.slots));
    },
  },
  {
    name: "kraken_traveller_lifepath",
    description:
      "Traveller's character wizard: the GM's own FG extension KrakenCharWizardMGT2 run in Kraken (its term engine and career tables, read from the GM's FG extensions folder), for an owner (a player's name; empty for the GM), every roll the table's dice. action start (name); view (the pages: tab, stats, species, background, task {title, text, options [{label, disabled, roll}]}, log, benefits (items to choose), injuries, connections, packages, warnings, done); call fn with args: rollCharacteristics, swapScores (a, b), selectSpecies (path), toggleBackground (skill, true/false), showTab ('careers' starts the terms), chooseOption (n: the task's option, 1-based), retryRoll, chooseBenefitItem (benefit index, item path), rollMedical (injury index), settleMedical (index, restore true/false), setConnection (slot, key, value), applyConnection (slot, skill), setPackage (name), togglePackageSkill (n, on), applyPackage, startOver; details (build {name, gender, homeworld, appearance, why}); build (when done: build {name..., buy [[item, count]] bought with the final cash from the wizard's items}); cancel.",
    inputSchema: object({ action: { type: "string", enum: ["start", "view", "call", "details", "build", "cancel"] }, owner: string("The player's name; empty for the GM"), name: string("start: the Traveller's name"), fn: string("call: the wizard's step"), args: { type: "array" }, build: { type: "object" } }, ["action"]),
    async run(args, ctx) {
      const agent = needTable(ctx);
      return out(await require("../mgt2.cjs").lifeAction(agent, args.owner ?? "", { action: args.action, name: args.name, fn: args.fn, args: args.args, build: args.build }, agent.seat));
    },
  },
  {
    name: "kraken_starship",
    description:
      "Starships in a Traveller or Apeira Astra campaign (Kraken's own designs and ship combat). action designs (the designs: class, tons, armour, thrust, jump, weapons), list (the campaign's ships), create (name, design: Courier, Free Trader, Salvage Tug, Patrol Cutter, Fighter, Corsair; visibility all or gm), edit (id, changes [{path, value}]: name, class, notes, cargo, tons, hull.max, hull.damage, armour, thrust, jump, sensors, computer, fuel, criticals.<system> (sensors, power, fuel, weapon, armour, hull, mdrive, cargo, jdrive, crew, computer: severity), weapons.add {name: Pulse Laser, Beam Laser, Particle Beam, Missile Rack, Railgun Barbette, Mass Driver; mount}, weapons.<key> null (remove), weapons.<key>.disabled, weapons.<key>.gunner (a character's id), crew.pilot / crew.engineer / crew.sensors / crew.captain (a character's id)). A ship goes on the tracker with kraken_combat add (recordId); it fights with kraken_combat ship-attack (id: the ship's entry, weapon: its weapons key, targetId: the ship it fires at, range: Adjacent ... Distant): 2d6 + the gunner's task DM (Traveller: Gunner (Turret) + DEX; Apeira Astra: Gunnery + Intellect; no gunner -3) + the weapon's DM + fire control (sensors + computer) + the range's DM, against 8; damage the weapon's dice + Effect - armour (less AP) off the hull; an Effect of 6+ that does damage is a critical hit (2d6: the system; severity up). Its initiative is 2d6 + the pilot's Pilot task DM + Thrust. place (id, col, row) puts its token on the open map (Kraken's picture of the design, 1 to 3 squares by tonnage); ship-attack range map reads the range from the two tokens. deck-plan (id) draws the ship's decks as maps (bridge, staterooms, galley, turrets, airlock, holds, engineering, a lift between decks; walls and doors) and opens them in the GM's Kraken.",
    inputSchema: object({ action: { type: "string", enum: ["designs", "list", "create", "edit", "deck-plan", "place"] }, id: string("edit, deck-plan, place: the ship's record id"), name: string("create: the ship's name"), design: string("create: the design"), visibility: { type: "string", enum: ["all", "gm"] }, changes: { type: "array", items: { type: "object" } }, col: number("place: the token's left square"), row: number("place: its top square") }, ["action"]),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const ships = require("../starships.cjs");
      const rules = await ships.rulesShips();
      if (args.action === "designs") return out(rules.DESIGNS.map((design) => ({ ...design, hull: rules.hullFor(design.tons), weapons: design.weapons.map(([name]) => name) })));
      if (args.action === "list") return out(agent.records.list({ type: "starship" }).map((ship) => ({ id: ship.id, name: ship.name, class: ship.data.class, hull: `${ship.data.hull.max - ship.data.hull.damage}/${ship.data.hull.max}`, armour: ship.data.armour, thrust: ship.data.thrust, state: ship.data.state, criticals: ship.data.criticals, weapons: Object.entries(ship.data.weapons ?? {}).map(([key, weapon]) => ({ key, name: weapon.name, gunner: weapon.gunner, disabled: weapon.disabled })), crew: ship.data.crew })));
      if (args.action === "create") {
        const ship = await ships.createShip(agent, { name: args.name ?? "", design: args.design ?? "Free Trader", visibility: args.visibility ?? "all" }, agent.seat);
        return out({ id: ship.id, name: ship.name, hull: ship.data.hull, armour: ship.data.armour, thrust: ship.data.thrust, weapons: Object.keys(ship.data.weapons) });
      }
      const record = agent.records.get(String(args.id ?? ""));
      if (!record || record.type !== "starship") throw new Error("No such ship.");
      // Its deck plans, drawn by the GM's Kraken and opened as a map (one scene a deck).
      if (args.action === "deck-plan") return out(await ctx.ui({ kind: "deck-plan", ship: { id: record.id, name: record.name, data: record.data } }, 60000));
      // Its token on the open map (sized by its tonnage).
      if (args.action === "place") {
        const token = agent.map.place({ recordId: record.id, ...(Number.isFinite(args.col) ? { col: args.col, row: args.row } : {}) }, agent.seat);
        return out({ token: { id: token.id, squares: token.squares, ...agent.map.squareOf(token) } });
      }
      const updated = await ships.editShip(agent, record, args.changes, agent.seat);
      return out({ id: updated.id, name: updated.name, data: updated.data });
    },
  },
  {
    name: "kraken_character_edit",
    description:
      "Change a character as typed on its sheet (FG's C&C sheet), then every number is worked out again by the rules. changes: [{ path, value }], path one of: name; playername, gender, age, height, weight, size, alignment, deity, origin, appearance, notes, specialdefenses, specialmovement, senses, speed (text); attributes.<strength|dexterity|...>.score or .prime (0/1); hp.wounds, hp.temp, hp.nonlethal; exp; initiative.misc; attack.<melee|ranged|grapple|...>.misc; ac.misc, ac.natural, ac.deflection, ac.size; coins.<id>.amount; inventorylist.<id>.count, .location, .carried (0 left behind, 1 carried, 2 worn or in hand); inventorylist.<id> = null drops it; inventory.add (an item by name: a new row, carried); languages.add = a language; languagelist.<id> = null removes one.",
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
    name: "kraken_cards",
    description:
      "Ability cards (the Cards window, a player's option in Settings): a character's spells and weapons as cards. list: the cards, each { id, kind spell|weapon, name, level, school, spent (no slot of its level or higher left), slot (the slot a cast would use), pool (that level's slots), concentration, concentrating }. use: a card as its Cast or Attack button does (targetId: make that tracker entry the character's only target first, as dropping the card on its token). damage: a weapon card's Damage. rest: a long rest from the window (every slot back, concentration ends). end-concentration: stop concentrating. Open the window with kraken_windows window cards.",
    inputSchema: object(
      {
        action: { type: "string", enum: ["list", "use", "damage", "rest", "end-concentration"] },
        id: string("The character's record id, or its name"),
        card: string("use / damage: the card's id from list (spell:<name> or weapon:<key>)"),
        targetId: string("use: a combat tracker entry to target first"),
      },
      ["action", "id"],
    ),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const { combat, seat } = agent;
      const wanted = String(args.id ?? "").toLowerCase();
      const record = agent.records.get(args.id) ?? agent.records.list({ type: "character" }).find((item) => item.name.toLowerCase() === wanted);
      if (!record || record.type !== "character") throw new Error(`No character "${args.id}".`);
      const cards = await import(require("url").pathToFileURL(require("path").join(__dirname, "..", "..", "shared", "cards", "cards.mjs")).href);
      const list = () => cards.cardsFor(agent.records.get(record.id).data, agent.records.list({ type: "spell" }));
      const action = args.action;
      if (action === "list") return out({ character: record.name, cards: list().map(({ text, ...card }) => card) });
      if (action === "rest") {
        const changes = cards.restChanges(record.data);
        if (changes.length) await siegeEdit(agent, record, changes, seat);
        return out({ rested: record.name, cards: list().map(({ id, spent }) => ({ id, spent })) });
      }
      if (action === "end-concentration") {
        await siegeEdit(agent, record, [{ path: "concentration", value: "" }], seat);
        return out({ concentration: "" });
      }
      const card = list().find((item) => item.id === args.card);
      if (!card) throw new Error(`No card "${args.card ?? ""}". Cards: ${list().map((item) => item.id).join(", ")}`);
      if (action === "damage") {
        if (card.kind !== "weapon") throw new Error("Damage is a weapon card's.");
        return out({ damage: await combat.damageRoll({ recordId: record.id }, card.weapon, seat, "Agent") });
      }
      if (card.spent) throw new Error(`${record.name} has no slot of level ${card.level} or higher left for ${card.name}.`);
      if (args.targetId) {
        const entry = combat.entries().find((item) => item.recordId === record.id);
        if (!entry) throw new Error(`${record.name} is not on the combat tracker.`);
        combat.clearTargets(entry.id, seat);
        combat.target(entry.id, args.targetId, true, seat);
      }
      const result = card.kind === "spell" ? await combat.cast({ recordId: record.id }, card.name, "", seat, "Agent") : await combat.attack({ recordId: record.id }, card.weapon, seat, "Agent");
      return out({ used: card.id, result, cards: list().map(({ id, spent, concentrating }) => ({ id, spent, concentrating })) });
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
    name: "kraken_character_drop",
    description:
      "Drop a record on a character sheet, as dragging it from a list (Classes, Races, Spells, Items) onto the sheet in FG: a race or class package goes into the packages at 1st level (its primes set; a class gives 1st level's hit points; a race replaces the old race), a spell or power into the powers (bound to the one class that casts it), an item into the gear (equipped when it is worn or a weapon). Chat says what was added. A second class is refused (that is dual class or reclass at a level up: kraken_class_change). A 5E sheet takes items only. record: the record's id, or its name (with type to tell same-named records apart).",
    inputSchema: object({ id: string("The character's record id"), record: string("The record to drop: its id or name"), type: { type: "string", enum: ["siegepackage", "siegepower", "item"] } }, ["id", "record"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      const character = table.records.get(args.id);
      if (!character || character.type !== "character") throw new Error(`No character "${args.id}".`);
      const wanted = String(args.record).toLowerCase();
      const source =
        table.records.get(args.record) ??
        table.records.list(args.type ? { type: args.type } : {}).find((item) => item.type !== "character" && item.name.toLowerCase() === wanted);
      if (!source) throw new Error(`No record "${args.record}".`);
      const { record: updated, added, summary } = await dropOnCharacter(table, character, source, "Agent");
      return out({ added, summary, race: updated.data.race, level: updated.data.level, hp: updated.data.hp, packages: Object.values(updated.data.packages ?? {}).map((pkg) => ({ name: pkg.name, type: pkg.packagetype, level: pkg.level })), powers: Object.values(updated.data.powers ?? {}).map((power) => power.name), gear: Object.values(updated.data.inventorylist ?? {}).map((item) => `${item.name} x${item.count}${Number(item.carried) === 2 ? " (equipped)" : ""}`) });
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
      "Sound for the table, as Syrinscape in FG, from the GM's sounds (assets/sounds: oneshots, sfx, ambience, music; a folder plays one of its sounds at random). Every seat hears it, each at its own volumes. action list (kind, search: what there is, by folder); play (id or folder, e.g. \"oneshots/Doors/Wooden Door\" or \"sfx/Weapons/Sword/Hit\"); stop (stops one-shots and effects); ambience (add, remove, volume or clear loops; id, volume 0..1); music (play an id or a folder, next, stop, volume); triggers (the chat's sound triggers: read them, or set triggers to a list, or \"default\"); scape (what is playing now); scene (the open scene's own sound, as Syrinscape's moods per map: do keep makes what plays now the scene's, started whenever the scene is opened; clear; play; without do, reads it). A creature's natural attack (an orc's bite, a wolf's claws) plays its own attack sound from sfx/Monsters or sfx/Animals, and a creature killed its death cry.",
    inputSchema: object({
      action: { type: "string", enum: ["list", "play", "stop", "ambience", "music", "triggers", "scape", "scene"] },
      kind: { type: "string", enum: ["oneshots", "sfx", "ambience", "music"] },
      search: string("Part of a name or folder (list)"),
      id: string("A sound's id, or a folder"),
      volume: number("0 to 1"),
      do: { type: "string", enum: ["add", "remove", "volume", "clear", "play", "next", "stop", "keep", "view"], description: "For ambience, music and scene" },
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
      if (action === "scene") return out(agent.sceneSound(args.do ?? "view"));
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
      "The scene on the table: its grid, whether line of sight is on, every token (id, name, square col/row, size in squares, owner, faction, hidden, health) and every door (id, state 0 closed / 1 open / 2 locked, secret). Squares count from the top-left of the map, col across and row down. share: true shares the map with the players, as the GM's Share button (FG's Share): it opens on every player's screen, even where a player closed it; share: false stops sharing it (the players are sent no map until it is shared again).",
    inputSchema: object({ share: { type: "boolean" } }),
    run(args, ctx) {
      const table = needTable(ctx);
      const { map } = table;
      // share true: the players see it (opened on their screens); false: they are sent no map (FG's Share off).
      if (args?.share !== undefined) return out(table.shareMap(Boolean(args.share)));
      const scene = map.scene();
      if (!scene) return out({ scene: null });
      const view = map.viewFor({ role: "dm", name: "Agent" }, "");
      return out({
        scene: { id: scene.id, name: scene.name, grid: scene.grid, cols: Math.round(scene.width / scene.grid.size), rows: Math.round(scene.height / scene.grid.size), walls: scene.walls.length, adventureLights: scene.lights.length },
        lights: map.lights().length,
        sight: view.sight,
        tokens: view.tokens.map((token) => ({ ...token, ...map.squareOf(token), color: undefined, mine: undefined })),
        doors: view.doors.map(({ id, group, state, secret }) => ({ id, group, state, secret })),
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
      "Move a token to a square (col/row, its top-left square), or several together (a group dragged as one, as Foundry's multi-select): ids and dcol/drow, the squares across and down each moves. asPlayer: move them the way their owner would, stopped by walls and closed doors when line of sight is on; the answer says whether a wall stopped one.",
    inputSchema: object({ id: string("Token id"), col: number("Square across"), row: number("Square down"), ids: { type: "array", items: { type: "string" }, description: "Several tokens moved together" }, dcol: number("Squares across each moves (with ids)"), drow: number("Squares down each moves (with ids)"), asPlayer: { type: "boolean" } }),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      if (Array.isArray(args.ids)) {
        const step = map.squareSize();
        const moves = args.ids.map((id) => {
          const token = map.tokens().find((item) => item.id === id);
          if (!token) throw new Error(`No token ${id}.`);
          return { id, x: token.x + (args.dcol ?? 0) * step, y: token.y + (args.drow ?? 0) * step };
        });
        const moved = map.moveMany(moves, seat, { collide: args.asPlayer ? map.sightOn() : false });
        return out(moved.map((item) => ({ id: item.token.id, ...map.squareOf(item.token), blocked: item.blocked })));
      }
      if (args.id === undefined || args.col === undefined || args.row === undefined) throw new Error("Give id, col and row (or ids with dcol and drow).");
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
      "Change a token: name, hidden from players, size in squares, faction, owner (player name), facing (degrees clockwise from up, as FG's token orientation; null: not turned), a carried light (a preset: candle, lamp, torch, lantern, light, a game light profile name such as Torch, none; or {bright, dim, color} in feet), and its sight in the dark in feet (vision; null goes back to the character's senses).",
    inputSchema: object({
      id: string("Token id"),
      light: { description: "Preset name, or {bright, dim, color} in feet, or none" },
      vision: { type: ["number", "null"], description: "Sight in the dark, feet" },
      name: string("Name"),
      hidden: { type: "boolean" },
      squares: number("Size in squares"),
      faction: { type: "string", enum: ["friend", "neutral", "foe", "none"] },
      owner: string("Player who may move it"),
      facing: { type: ["number", "null"], description: "Degrees clockwise from up" },
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
      "The combat tracker (SiegeCore rules: d10 initiative, high to low; unconscious enemies lose their turns; effect durations count down each round; the dying bleed). action view (default); place-token (id, x, y: the entry's token onto the open map at that point, tied to it; moved there if it has one); add (recordId of a character or NPC, count, hidden, place: also put tokens on the map; or entry {name, faction, hp, ac, init}); add-party; init (which: an entry id, npcs or all); next (next turn); round (next round); prev (the turn before: the GM's correction, its start not run again); round-back (the round counter back one); set-turn (id: make it that entry's turn, as FG's turn arrow dragged to it); end (removeNpcs); update (id, patch {name, faction, init, initresult, hp, wounds, ac, hidden}); remove (id); damage / heal (id, amount); effect (id, effect {label, duration in rounds, gmOnly}); effect-remove (id, effectId); target (id: the attacker entry, targetId, on true/false); clear-targets (id); attack / damage-roll (a character: recordId + weapon = its inventory key; an NPC: id + weapon = its attack key from view's attacks): SiegeCore's attack, one d20 per target against its AC (equal hits), damage rolled once and put on every target; save (id, attribute, cl): a SIEGE save; cast (recordId, power: its powers key, castAction: the power's actions key): spends a slot, targets save against the caster level, damage halves or cancels on a save, effects land on those who failed, healing goes to the targets. target-area: the source (id) targets everyone whose token is within radius feet of x, y (faction to narrow), for an area spell. krits: critical hits and fumbles (the Castle Keeper's Guide options as Kraken Krits & Fumbles: a natural 20 rolls the critical table, a natural 1 the fumble table, and the result is applied: effects, damage, the next damage roll at maximum or doubled; ranged attacks use up ammunition; spells with spell resistance on are checked first). settings: { mode opt5|opt6|opt1|opt4, crit/fumble always|half|third|off, auto yes|no, npc yes|no, show all|gm, death gm|apply } (omit to read them). krit-test: roll a critical (kind crit) or fumble (kind fumble) for id against targetId (table, roll to fix the result). In a D&D 5E campaign the tracker plays FG's 5E rules instead: init d20 + DEX; attack d20 + bonus against AC, a natural 20 a CRITICAL HIT (the next damage roll doubles its dice), a natural 1 an AUTOMATIC MISS, no krits; save (id, attribute, cl = the DC); cast (recordId or id, power = the spell's name): a slot of its level (or the lowest free above), attack roll or save against the caster's DC, damage (cantrips scale, half on a save where the spell says), healing, effects; a creature at 0 hit points is dead, a character Dying: death-save (id) rolls its death saving throw. In a Descending Darkness campaign the same d20 rules, but a Dying character has no death saves: it loses 1 Health each of its turns, and stabilize (id, recordId: the ally steadying them) rolls that ally's Wisdom against 12 to stop it; dead at minus its maximum Health. In a D&D 3.5E campaign the tracker plays FG's 3.5E rules: init d20 + its bonus; attack (weapon: a character's attacks key, an NPC's attack by its place, 0 the first) d20 + bonus against AC, a natural 20 hits and a 1 misses, a roll in the weapon's threat range (19-20, 18-20) that hits is CONFIRMED by a second roll to be a CRITICAL HIT, full true rolls every iterative bonus at the first target; damage-roll rolls each hit, a critical rolled x2/x3/x4 (dice and bonuses), at least 1; save (id, attribute fortitude, reflex or will, cl = the DC), a natural 20 saves and a 1 fails; at 0 hit points Disabled, -1 to -9 Dying (each turn 10% to become Stable, else 1 more lost), dead at -10; no krits. In an AD&D 2E campaign the tracker plays 2E: init d10 + modifiers, the LOWEST first; attack d20 + to-hit against THAC0 - the target's AC (AC effects lower it), a natural 20 hits and a 1 misses; full true: an NPC's every attack (claw, claw, bite) or a warrior's 3/2 or 2/1 at the first target; damage-roll rolls each hit's damage by the target's size (Small or Medium, or Large for an NPC whose size is L, H or G), at least 1; save (id, attribute paralyzation, rod, petrification, breath or spell, cl = a modifier added to the roll), d20 at or above the save's number; a creature dies at 0, a character at 0 to -9 is Dying (a hit point lost each round), stabilize (id, recordId) binds the wounds (no roll); dead at -10; turn-undead (recordId of a cleric, or a paladin from 3rd level, or id; undead: entry ids, else its targets, else every undead foe): one d20 against the turning table for each undead's type (by name, else its hit dice), 2d6 undead affected weakest first, T turned for 3d4 rounds (an effect), D destroyed (D*: 2d4 more); krits come from the GM's Krits & Fumbles 2E book when it is active (its Critical Hit and Fumble tables, then the attack kind's table: slashing, piercing, bludgeoning, missile, natural), the row applied (extra damage, maximum or an extra die on the next damage roll, AC and to-hit penalties, GRANTATK: the next attack against it gains, prone or a save against it), the rest left to the GM; krit-test takes entryRoll, attackKind and roll.",
    inputSchema: object({
      action: { type: "string", enum: ["view", "add", "add-party", "init", "next", "round", "prev", "round-back", "set-turn", "end", "update", "remove", "damage", "heal", "effect", "effect-remove", "target", "clear-targets", "attack", "damage-roll", "save", "cast", "krits", "krit-test", "target-area", "death-save", "stabilize", "turn-undead", "ship-attack", "place-token"] },
      targetId: string("target: the entry to target"),
      on: { type: "boolean", description: "target: add (true) or drop (false)" },
      weapon: string("attack / damage-roll: inventory key (character) or attack key (NPC)"),
      attribute: string("save: strength, dexterity, constitution, intelligence, wisdom or charisma (3.5E: fortitude, reflex or will; 2E: paralyzation, rod, petrification, breath or spell)"),
      full: { type: "boolean", description: "attack (3.5E): a full attack, every iterative bonus (+11/+6/+1) at the first target; (2E): a full round, an NPC's every attack or a warrior's 3/2 or 2/1" },
      cl: number("save: the challenge level (5E: the DC)"),
      advantage: { type: "string", enum: ["", "advantage", "disadvantage"], description: "save (5E): roll with advantage or disadvantage; the tracker's effects still count" },
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
      roll: number("krit-test: the table roll (2E: the kind's table)"),
      entryRoll: number("krit-test, 2E: the Critical Hit / Fumble entry table's roll (5-6: a complication)"),
      attackKind: { type: "string", enum: ["slashing", "piercing", "bludgeoning", "missile", "natural"], description: "krit-test, 2E: which kind's table" },
      undead: { type: "array", items: { type: "string" }, description: "turn-undead: the undead entries' ids (default: the turner's targets, else every undead foe)" },
      range: { type: "string", enum: ["map", "Adjacent", "Close", "Short", "Medium", "Long", "Very Long", "Distant"], description: "ship-attack: the range band, or map: from the squares between the two ships' tokens (0 Adjacent, 1 Close, up to 3 Short, 8 Medium, 20 Long, 50 Very Long, more Distant)" },
      x: number("target-area: scene pixels across"),
      y: number("target-area: scene pixels down"),
      radius: number("target-area: feet (Sleep: 15 ft radius, a fireball 20)"),
      faction: { type: "string", enum: ["foe", "friend", "neutral"], description: "target-area: only these" },
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
      else if (action === "prev") combat.previous(seat);
      else if (action === "round-back") combat.roundBack(seat);
      else if (action === "set-turn") combat.setTurn(String(args.id ?? ""), seat);
      else if (action === "end") combat.end(seat, { removeNpcs: Boolean(args.removeNpcs) });
      else if (action === "update") combat.update(args.id, args.patch ?? {}, seat);
      else if (action === "remove") combat.remove(args.id, seat);
      else if (action === "place-token") {
        const entry = combat.entries().find((item) => item.id === args.id);
        if (!entry) throw new Error(`No entry ${args.id}.`);
        const old = entry.tokenId ? map.tokens().find((token) => token.id === entry.tokenId) : null;
        if (old) map.move(old.id, { x: Number(args.x), y: Number(args.y) }, seat, { snap: true });
        else {
          const token = map.place({ recordId: entry.recordId, name: entry.name, x: Number(args.x), y: Number(args.y), hidden: entry.hidden, faction: entry.faction, allowSecond: true }, seat);
          combat.update(entry.id, { tokenId: token.id }, seat);
        }
      }
      else if (action === "damage") await combat.damage(args.id, args.amount, seat);
      else if (action === "heal") await combat.heal(args.id, args.amount, seat);
      else if (action === "effect") combat.addEffect(args.id, args.effect ?? {}, seat);
      else if (action === "effect-remove") combat.removeEffect(args.id, args.effectId, seat);
      else if (action === "target") combat.target(args.id, args.targetId, args.on ?? true, seat);
      else if (action === "clear-targets") combat.clearTargets(args.id, seat);
      else if (action === "death-save") return out({ deathSave: await combat.deathSave(args.id, seat), combat: combat.viewFor(seat) });
      else if (action === "stabilize") return out({ stabilize: await combat.stabilize(args.id, args.recordId ?? "", seat), combat: combat.viewFor(seat) });
      else if (action === "ship-attack") return out({ shot: await combat.shipAttack(args.id, String(args.weapon ?? ""), args.targetId ?? "", args.range ?? "Short", seat, "Agent"), combat: combat.viewFor(seat) });
      else if (action === "turn-undead") return out({ turn: await combat.turnUndead(args.id ?? "", args.recordId ?? "", Array.isArray(args.undead) ? args.undead : null, seat), combat: combat.viewFor(seat) });
      else if (action === "target-area") {
        const per = map.units() > 0 ? (map.squareCenter(1, 0, 1).x - map.squareCenter(0, 0, 1).x) / map.units() : 10;
        return out({ targets: combat.targetArea(args.id, { x: args.x, y: args.y, radius: (args.radius ?? 0) * per, faction: args.faction ?? null }, seat, (entry) => map.tokens().find((token) => token.id === entry.tokenId) ?? map.tokens().find((token) => entry.recordId && token.recordId === entry.recordId) ?? null), combat: combat.viewFor(seat) });
      }
      else if (action === "attack") return out({ results: await combat.attack(args.recordId ? { recordId: args.recordId } : { entryId: args.id }, args.weapon, seat, "Agent", { full: Boolean(args.full) }), combat: combat.viewFor(seat) });
      else if (action === "save") return out({ save: await combat.save(args.id, args.attribute, args.cl ?? 0, "Agent", undefined, args.advantage ?? ""), combat: combat.viewFor(seat) });
      else if (action === "cast") return out({ cast: await combat.cast(args.recordId ? { recordId: args.recordId } : { entryId: args.id }, args.power, args.castAction ?? "", seat, "Agent"), combat: combat.viewFor(seat) });
      else if (action === "krits") return out(await combat.krits(args.settings, seat));
      else if (action === "krit-test") return out({ krit: await combat.kritTest(args.kind, args.id, args.targetId, seat, args.table || args.roll || args.entryRoll || args.attackKind ? { table: args.table, roll: args.roll, entryRoll: args.entryRoll, kind: args.attackKind } : undefined), combat: combat.viewFor(seat) });
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
      "The scene's map settings: darkness (0 day .. 1 pitch black; from 0.5 players see only lit places and their darkvision; null returns to the adventure's own), the grid (the map editor's Grid tab: show, alpha, color, type square/hexrow/hexcol/none, size in pixels, offsetX and offsetY in pixels, distance per square and units, style solid/dashed/dotted, thickness; null for a field goes back to the scene's own), and weather (type: none, rain, storm, snow, blizzard, fog, clouds, sandstorm, embers, ash, leaves, water; intensity 0..1; direction in degrees the wind blows toward). Call with nothing to read them.",
    inputSchema: object({
      darkness: { type: ["number", "null"] },
      grid: {
        type: "object",
        properties: {
          show: { type: "boolean" },
          alpha: { type: ["number", "null"] },
          color: { type: ["string", "null"] },
          type: { type: ["string", "null"], enum: ["square", "hexrow", "hexcol", "none", null] },
          size: { type: ["number", "null"] },
          offsetX: { type: ["number", "null"] },
          offsetY: { type: ["number", "null"] },
          distance: { type: ["number", "null"] },
          units: { type: ["string", "null"] },
          style: { type: "string", enum: ["solid", "dashed", "dotted"] },
          thickness: { type: "number" },
        },
        additionalProperties: false,
      },
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
      "The table's own options. towerReveal: a roll a player drops in the dice tower is shown to that player too (as FG, it is otherwise the GM's alone; the player sees only what went in). towerExternal: the dice tower stands on the table apart from the chat (every seat; each places it where they like), else it is docked in the chat's dice tray. towerStyle: how the tower looks for every seat (kraken_tower lists the looks). motd: the message of the day (FG's), shown to each player as they join: { text, links: quick-slot links (a map: {kind: picture, book, file, label}, a record: {kind: record, record, label}, a book page, a note) }; text \"\" for none. decal: the background decal (kraken_decal chooses one). clearTargets: when a creature's targets clear: never (FG), action (after its spell, or its attack's damage), turn (at the end of its turn). diceHold: how long landed 3D dice lie on the table before they fade, in seconds (0.5 to 60, default 2.6), for every seat. wizard35: the D&D 3.5E character wizard's options (FG's KrakenCharWizard35E options): methods, the ability score methods players may pick (1 4d6 drop lowest arranged, 2 3d6 in order, 3 the standard array 15,14,13,12,10,8, 4 typed by hand; default all four); rollLock: the scores cannot be rolled again; lowReroll: a 4d6 score under 8 may be rerolled once with 3d6, the result stands; vault: the Vault of the Kraken's poor or secondhand gear is free in the wizard's shop. wizard2e: the AD&D 2E character wizard's options, as the FG extension's: rollLock (abilities rolled once only, no re-rolls), methods (the PHB ability methods players may pick: 1 = 3d6 in order, 2 = 3d6 twice keep higher, 3 = 3d6 x6 arrange, 4 = 3d6 x12 keep best 6, 5 = 4d6 drop lowest, 6 = all 8s then place 7d6; none: Method V), gold (starting gold above 1st level: phb one roll, perlevel one roll a level, xlevel one roll times the level). A partial wizard35 or wizard2e changes only what it names. Call with nothing to read them.",
    inputSchema: object({
      towerReveal: { type: "boolean" },
      towerExternal: { type: "boolean" },
      towerStyle: { type: "string" },
      motd: { type: "object", properties: { text: { type: "string" }, links: { type: "array" } } },
      clearTargets: { type: "string", enum: ["never", "action", "turn"] },
      diceHold: { type: "number" },
      wizard35: { type: "object", properties: { methods: { type: "array", items: { type: "number" } }, rollLock: { type: "boolean" }, lowReroll: { type: "boolean" }, vault: { type: "boolean" } } },
      wizard2e: { type: "object", properties: { rollLock: { type: "boolean" }, methods: { type: "array", items: { type: "number" } }, gold: { type: "string", enum: ["phb", "perlevel", "xlevel"] } } },
    }),
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
    name: "kraken_tower",
    description:
      "The dice tower. Its look, for every seat (the GM's choice, saved with the campaign): action list (Kraken's drawn looks: stone, oak, obsidian, frost, brass, bone; and the GM's own tower pictures, from the towers assets folder), style (id: one of those), import (path: a picture on this computer, copied into the towers folder and put up). The external tower on the GM's own screen (Settings: External dice tower), as its right-click menu: view (its place x,y in screen pixels, locked, on); lock (fixed where it stands, or at x,y when given: it cannot be dragged); unlock; place (x, y: move it there); on and off (the tower itself, as a click on it).",
    inputSchema: object({
      action: { type: "string", enum: ["view", "list", "style", "import", "lock", "unlock", "place", "on", "off"] },
      id: string("style: a look's id from list"),
      path: string("import: full path of a .png, .webp, .jpg or .gif"),
      x: number("lock or place: screen pixels from the left"),
      y: number("lock or place: screen pixels from the top"),
    }),
    async run(args, ctx) {
      const agent = needTable(ctx);
      const action = args.action ?? "view";
      const looks = ["stone", "oak", "obsidian", "frost", "brass", "bone"];
      if (action === "list") {
        const library = agent.towers();
        return out({ style: agent.options().towerStyle, drawn: looks, pictures: library ? library.list() : [], folder: library?.folder ?? null });
      }
      if (action === "style") return out({ style: agent.setOptions({ towerStyle: String(args.id ?? "") }).towerStyle });
      if (action === "import") {
        const library = agent.towers();
        if (!library) throw new Error("This table has no towers folder.");
        const item = library.addFile(String(args.path ?? ""));
        return out({ imported: item, style: agent.setOptions({ towerStyle: item.id }).towerStyle });
      }
      return out(await ctx.ui({ kind: "tower", action, x: args.x, y: args.y }));
    },
  },
  {
    name: "kraken_dice_packs",
    description:
      "Dice packs: more dice sets for every seat, made by the GM or an agent and dropped in Documents/Kraken VTT/Dice (a folder, or a .zip of one, holding dice.json and the pictures its sets wear; the format, with examples, is that folder's README.md and the kraken-content skill). action list: the installed packs, each with its sets (each a whole dice look, usable as kraken_dice_settings preset by name) and its problems; check (path): read a pack anywhere (a folder or .zip being made) as Kraken would, its sets and problems, without installing it; folder: the Dice folder's path.",
    inputSchema: object({ action: { type: "string", enum: ["list", "check", "folder"] }, path: string("check: a pack folder or .zip") }),
    run(args, ctx) {
      const packs = needTable(ctx).dicePacks();
      if (!packs) throw new Error("This table has no dice packs folder.");
      if (args.action === "check") return out(packs.check(args.path));
      if (args.action === "folder") return out({ folder: packs.folder });
      packs.refresh();
      return out({ folder: packs.folder, packs: packs.list() });
    },
  },
  {
    name: "kraken_death_markers",
    description:
      "Death markers (FG's): when a creature dies on the combat tracker, a marker is left on the map where its token stood, for everyone, under the tokens: blood in a colour, a skull or a tombstone. Characters and friends leave none. action view (default): the settings (on; default: the set for a type not named; byType: creature type -> set, as in Settings > Death Markers) and the markers on the open map; sets: the marker sets (id, name, tint, how many pictures); set: settings (on, default, byType: {undead: \"blood-violet\", construct: \"blood-black\", ...}; \"\" for the default's); place (x, y, set, variant, rotation, size: one by hand); remove (id); clear (every marker on the open map).",
    inputSchema: object({
      action: { type: "string", enum: ["view", "sets", "set", "place", "remove", "clear"] },
      on: { type: "boolean" },
      default: string("The set for a creature type not named"),
      byType: { type: "object", description: "Creature type (lower case) -> set id" },
      id: string("A marker's id (remove)"),
      x: number("Scene pixels"),
      y: number("Scene pixels"),
      set: string("A set id (place)"),
      variant: number("Which of the set's pictures"),
      rotation: number("Degrees"),
      size: number("In squares"),
    }),
    run(args, ctx) {
      const table = needTable(ctx);
      const { MARKER_SETS } = require("../../shared/map/deathMarkers.mjs");
      const action = args.action ?? "view";
      if (action === "sets") return out(MARKER_SETS.map(({ id, name, tint, count }) => ({ id, name, tint, count })));
      if (action === "set") {
        const now = table.options().deathMarkers;
        const patch = { ...now, ...(typeof args.on === "boolean" ? { on: args.on } : {}), ...(args.default ? { default: args.default } : {}), ...(args.byType ? { byType: { ...now.byType, ...args.byType } } : {}) };
        return out(table.setOptions({ deathMarkers: patch }).deathMarkers);
      }
      if (action === "place") return out(table.map.addDeathMarker({ x: args.x, y: args.y, set: args.set, variant: args.variant, rotation: args.rotation, size: args.size }, table.seat));
      if (action === "remove") {
        table.map.removeDeathMarker(String(args.id ?? ""), table.seat);
        return out({ removed: args.id });
      }
      if (action === "clear") {
        table.map.clearDeathMarkers(table.seat);
        return out({ cleared: true });
      }
      return out({ settings: table.options().deathMarkers, markers: table.map.deathMarkers() });
    },
  },
  {
    name: "kraken_calendar",
    description:
      "The campaign's calendar (FG's Calendar, with Kraken Calendar Notes): which calendar (each game's own by default: gregorian, greyhawk (2E, 3.5E, C&C), harptos (5E), golarion (Pathfinder), imperial (Traveller: 045-1105), waning (Descending Darkness), astra (Apeira Astra)), today's date and the time, and notes on days. action view (default): the date (year; day: the day of the year, 0 the first), the time, today in words, the notes (each: year, day, by: \"\" the GM's or a player's name, colour, text, shown: a GM note the players see / a player's note the whole table sees); set (calendar, year, month (1-based, a festival counts as a month as FG lists it), day (1-based in the month), hour, minute); advance (days, hours, minutes; negative goes back; midnight turns the day); note-add (text, and year, month, day: today if left out; shown false: the GM's alone); note-update (id, text, shown); note-remove (id); say (today's date and time in chat).",
    inputSchema: object({
      action: { type: "string", enum: ["view", "set", "advance", "note-add", "note-update", "note-remove", "say"] },
      calendar: string("A calendar id"),
      year: number("Year"),
      month: number("Month, 1-based"),
      day: number("Day of the month, 1-based"),
      hour: number("0-23"),
      minute: number("0-59"),
      days: number("advance: days"),
      hours: number("advance: hours"),
      minutes: number("advance: minutes"),
      text: string("A note's words"),
      shown: { type: "boolean", description: "A GM note: the players see it (default true)" },
      id: string("A note's id"),
    }),
    run(args, ctx) {
      const table = needTable(ctx);
      const cal = table.calendar();
      const seat = table.seat;
      const lib = require("../../shared/calendars.mjs");
      const now = cal.view(seat);
      // A month and day (1-based) as the day of the year, in the calendar named or the one in use.
      const dayOf = (calendarId, year) => (args.month !== undefined || args.day !== undefined ? lib.dayOfYear(lib.calendarOf(calendarId), year, (args.month ?? 1) - 1, args.day ?? 1) : undefined);
      const action = args.action ?? "view";
      if (action === "set") {
        const id = args.calendar ?? now.id;
        const year = args.year ?? (args.calendar ? lib.calendarOf(id).year : now.year);
        return out(cal.set({ ...(args.calendar ? { id } : {}), ...(args.year !== undefined ? { year } : {}), ...(dayOf(id, year) !== undefined ? { day: dayOf(id, year) } : {}), hour: args.hour, minute: args.minute }, seat));
      }
      if (action === "advance") return out(cal.advance({ days: args.days, hours: args.hours, minutes: args.minutes }, seat));
      if (action === "note-add") {
        const year = args.year ?? now.year;
        return out(cal.addNote({ year, day: dayOf(now.id, year) ?? now.day, text: args.text, shown: args.shown }, seat));
      }
      if (action === "note-update") return out(cal.updateNote(String(args.id ?? ""), { ...(args.text !== undefined ? { text: args.text } : {}), ...(args.shown !== undefined ? { shown: args.shown } : {}) }, seat));
      if (action === "note-remove") {
        cal.removeNote(String(args.id ?? ""), seat);
        return out({ removed: args.id });
      }
      if (action === "say") {
        table.say(`[DATE] ${now.today}`, "Calendar");
        return out({ said: now.today });
      }
      return out(now);
    },
  },
  {
    name: "kraken_read_aloud",
    description: "FG's read-aloud: read boxed text to the table (an adventure's <frame> text, or any words): it goes to chat as read-aloud and shows over the map for everyone as a speech bubble. text; title (the page or story it is from, optional).",
    inputSchema: object({ text: string("The words to read"), title: string("Where they are from") }, ["text"]),
    run(args, ctx) {
      return out(needTable(ctx).readAloud(args.text, args.title));
    },
  },
  {
    name: "kraken_light",
    description:
      "Lights on the scene. action list; place (x, y in scene pixels or col/row, bright and dim in feet, color, or a preset: candle, lamp, torch, lantern, light; angle 1-360 and rotation 0-359 degrees for a beam (FG's lantern bullseye: 60); animation none, flicker, pulse, flash or torch, and speed 0..1); update (id and any of those, on, hidden); remove (id).",
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
      angle: number("Degrees of the beam (360: all round)"),
      rotation: number("Degrees the beam points (0: east, 90: south)"),
      animation: { type: "string", enum: ["none", "flicker", "pulse", "flash", "torch"] },
      speed: number("Animation speed 0..1"),
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
      "Walls on the scene (the GM's map editor: FG's line-of-sight layer with Foundry's senses). action move (ids, dx, dy: walls dragged); move_point (from {x, y}, to {x, y}, ids optional: a corner dragged, every wall end there going with it); add with group (a door drawn as a box: its sides open as one); action list (near: {x, y, r} to narrow, kind); add (points [x1, y1, x2, y2, ...] in scene pixels, or cells [[col, row], ...] for square corners; consecutive points make a chain; closed: true joins the last to the first; kind: wall, terrain (see into, not through), door, secret (a door players never see), toggle (the GM switches it on and off), window (see through, blocks movement; players may open it; windowStyle proximity: see through only within 2 squares, as Foundry), illusion (blocks sight only: curtains), invisible (blocks movement only), ethereal (blocks sight, not movement), shadow (blocks light only); or the senses sight, light, sound (0 none, 10 limited, 20 normal, 30 proximity, 40 distance), move (0, 20), dir (0 both, 1 left, 2 right: one way), door (0, 1, 2), ds (0 closed, 1 open, 2 locked), toggle (none, gm, players), threshold (feet), hidden (toggled off)); update (id or ids, and any field; a new kind brings its senses); remove (id or ids); split (id, x, y); clear; close_doors (every door and window shut, locks kept). Undo with kraken_map_undo.",
    inputSchema: object({
      action: { type: "string", enum: ["list", "add", "update", "remove", "split", "move", "move_point", "clear", "close_doors"] },
      id: string("Wall id"),
      dx: number("move: scene pixels right (the walls in ids, dragged)"),
      dy: number("move: scene pixels down"),
      from: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, description: "move_point: the corner (every wall end there, of ids or of any)" },
      to: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, description: "move_point: where it goes" },
      group: string("add: the door these sides make (a door box opens as one)"),
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
      const { action, id, ids, cells, near, windowStyle, dx: _dx, dy: _dy, from: _from, to: _to, ...rest } = args;
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
      if (action === "move") return out({ walls: map.moveWalls(which, args.dx, args.dy, seat) });
      if (action === "move_point") return out({ walls: map.movePoint(args.from, args.to, which, seat) });
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
    description: "Layer groups on the scene (FG's layer folders): everything in a group (text, image layers, paint, FX) is shown or not, seen by players or not, locked or not, all at once. action list; update (name and any of shown, players, locked, prefix for its numbers, name to rename; made if new); remove (name; its things leave the group).",
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
    name: "kraken_tile",
    description:
      "Image layers on the scene (FG's image layers, Foundry's tiles): pictures placed on the map, drawn in list order (first at the bottom), each below the tokens (level below, as FG) or over them (level above: roofs and tree tops, faded on a seat's screen while one of its tokens is under). Coordinates are scene pixels from the map's top-left (the tile's top-left corner); rotation in degrees about its centre. action list (this scene's layers); library (the tile pictures there are: ids lib/...); add (src: a library id, or file: a picture on this computer to copy into the library; x, y, width, height in scene pixels, rotation, alpha 0..1, flipX, flipY, level, hidden (the GM's eyes only), locked, group, name); update (id and fields); order (id, where: up, down, top, bottom, or an index); remove (id).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "library", "add", "update", "order", "remove"] },
      id: string("Image layer id"),
      src: string("A tile library picture id (lib/...)"),
      file: string("add: a picture file on this computer, copied into the tile library"),
      name: string("A name for the layer list"),
      x: number("Left, scene pixels"),
      y: number("Top, scene pixels"),
      width: number("Pixels"),
      height: number("Pixels"),
      rotation: number("Degrees"),
      alpha: number("Opacity 0..1"),
      flipX: { type: "boolean" },
      flipY: { type: "boolean" },
      level: { type: "string", enum: ["below", "above"] },
      hidden: { type: "boolean" },
      locked: { type: "boolean" },
      group: string("Layer group"),
      where: { description: "order: up, down, top, bottom, or an index", oneOf: [{ type: "string", enum: ["up", "down", "top", "bottom"] }, { type: "integer" }] },
    }, ["action"]),
    run(args, ctx) {
      const table = needTable(ctx);
      const { map, seat } = table;
      const { action, id, file, where, ...fields } = args;
      const library = table.tiles?.();
      if (action === "list") return out(map.tiles());
      if (action === "library") return out(library ? library.list() : []);
      if (action === "add") {
        if (file) {
          if (!library) throw new Error("There is no tile library here.");
          fields.src = library.addFile(String(file)).id;
        }
        return out(map.addTile(fields, seat));
      }
      if (action === "update") {
        if (file) {
          if (!library) throw new Error("There is no tile library here.");
          fields.src = library.addFile(String(file)).id;
        }
        return out(map.updateTile(id, fields, seat));
      }
      if (action === "order") return out(map.orderTile(id, where, seat));
      map.removeTile(id, seat);
      return out({ removed: id });
    },
  },
  {
    name: "kraken_fx",
    description:
      "FX layers on the scene (FG's FX tab): several at once, each rain, storm, snow, blizzard, fog, clouds, sandstorm, embers, ash, leaves or water, with FG's sliders amount, intensity, speed (0..1) and direction (degrees the wind blows toward), and a mask it fills (mode inside: only there, as water in a river) or leaves clear (outside: everywhere but there, as rain not under a roof). action list; add (type, name, amount, intensity, speed, direction, mask {use, mode, polygons: [[x1, y1, ...], ...]} or maskRect {x, y, width, height}, group, players false for the GM's eyes only); update (id and fields); remove (id); paint (id, area: one more painted area for its mask, as the FX tab's tools: {polygon: [x1, y1, ...]} a shape, {rect: {x, y, width, height}}, or {stroke: {width, points: [x1, y1, ...]}} a brush stroke; the areas add up, the mask turns on; soft: the edge's fade in map pixels); erase-area (id, area: the index of a painted area, shapes first then strokes, or \"last\"). A river or lake: type water, painted with the brush along it.",
    inputSchema: object({
      action: { type: "string", enum: ["list", "add", "update", "remove", "paint", "erase-area"] },
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
      area: { description: "paint: {polygon} | {rect} | {stroke: {width, points}}; erase-area: an index or \"last\"" },
      soft: number("paint: the mask's soft edge, map pixels (0..200)"),
      group: string("Layer group"),
      players: { type: "boolean" },
      shown: { type: "boolean" },
    }, ["action"]),
    run(args, ctx) {
      const { map, seat } = needTable(ctx);
      const { action, id, maskRect, maskMode, area, soft, ...fields } = args;
      if (action === "paint" || action === "erase-area") {
        const layer = map.fx().find((item) => item.id === id);
        if (!layer) throw new Error(`No effect ${id}.`);
        const polygons = [...layer.mask.polygons];
        const strokes = [...(layer.mask.strokes ?? [])];
        if (action === "paint") {
          if (area?.rect) {
            const { x, y, width, height } = area.rect;
            polygons.push([x, y, x + width, y, x + width, y + height, x, y + height]);
          } else if (Array.isArray(area?.polygon)) polygons.push(area.polygon);
          else if (area?.stroke) strokes.push({ width: area.stroke.width ?? 60, points: area.stroke.points ?? [] });
          else throw new Error("What area? {polygon}, {rect} or {stroke: {width, points}}.");
          return out(map.updateFx(id, { mask: { use: true, polygons, strokes, ...(soft !== undefined ? { soft } : {}), ...(maskMode ? { mode: maskMode } : {}) } }, seat));
        }
        const total = polygons.length + strokes.length;
        const index = area === "last" || area === undefined ? total - 1 : Number(area);
        if (!(index >= 0 && index < total)) throw new Error(`No area ${area}: the mask has ${total}.`);
        if (index < polygons.length) polygons.splice(index, 1);
        else strokes.splice(index - polygons.length, 1);
        return out(map.updateFx(id, { mask: { use: polygons.length + strokes.length > 0, polygons, strokes } }, seat));
      }
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
    description: "Open a map on the table, as the GM's Open map button: a prepared map bundle (an adventure .zip on this computer, with scenes, walls, lights and tokens), or a bare picture (.png, .jpg, .webp, .gif: one scene with a 100 px square grid and nothing on it, built up with kraken_scene_settings grid, kraken_wall, kraken_light, kraken_label, kraken_tile...; the same picture opened again keeps what was made for it). It is saved with the campaign; kraken_scenes lists and switches its scenes.",
    inputSchema: object({ path: string("Full path of the .zip or picture") }, ["path"]),
    async run(args, ctx) {
      needTable(ctx);
      const fs = require("fs");
      const file = String(args.path ?? "");
      if (!/\.(zip|png|jpe?g|webp|gif)$/i.test(file) || !fs.existsSync(file)) throw new Error("No .zip or picture at that path.");
      return out(await ctx.ui({ kind: "open-adventure", name: require("path").basename(file), bytes: new Uint8Array(fs.readFileSync(file)) }, 60000));
    },
  },
  {
    name: "kraken_image",
    description:
      "FG's image window (the GM's): any picture of a book opened to edit, the same master wherever it is opened (its walls, doors, lights, paint and effects are kept by its id in the campaign; kraken_wall, kraken_light, kraken_draw and the other map tools work on it while it is open). The players do not see it until it is put in play. action open (book: the book's name or id; name: the picture's name as the Images list (kraken_library action list kind image) shows it, or file: its picture file in the book); play (put it on the table: the players see it); test (on: a play test, a test token on it and the GM's view a player's: walls, doors and light as a player meets them; off ends it); make (Assets' Make it a map: book and file, a picture of an active book or art pack, record or not (kraken_books contents lists its assets); it joins Campaign > Images and opens to edit); preview (on: the player vision preview, the GM's view as the players see it, their tokens' sight, the light and the dark; off ends it); close (back to the table's map); studio (open the open image in Map Studio, Kraken's map maker: art, walls, doors, lights, weather; its Save to Kraken writes them into the image).",
    inputSchema: object({ action: { type: "string", enum: ["open", "make", "play", "test", "preview", "close", "studio"] }, book: string("open: the book's name or id"), name: string("open: the picture's name"), file: string("open: the picture's file in the book"), on: { type: "boolean" } }, ["action"]),
    async run(args, ctx) {
      needTable(ctx);
      return out(await ctx.ui({ kind: "image", action: args.action, book: args.book, name: args.name, file: args.file, on: args.on }, 60000));
    },
  },
  {
    name: "kraken_studio",
    description:
      "Map Studio's asset packs (the GM's Settings > Map Studio art): which folders it reads. action settings: read them; with dungeondraftFolders and/or packFolders (lists of folder paths on the GM's computer), set them and read the art again. dungeondraftFolders: folders of Dungeondraft packs (.dungeondraft_pack); packFolders: folders of art packs (.mod) beyond Fantasy Grounds' modules folder (which is read anyway). Nothing is assumed: a GM with none has none. found says which folders exist.",
    inputSchema: object({ action: { type: "string", enum: ["settings"] }, dungeondraftFolders: { type: "array", items: { type: "string" } }, packFolders: { type: "array", items: { type: "string" } } }, ["action"]),
    async run(args, ctx) {
      if (!ctx.studio) throw new Error("Map Studio runs in the Kraken app.");
      const change = args.dungeondraftFolders !== undefined || args.packFolders !== undefined ? { ...(args.dungeondraftFolders !== undefined ? { dungeondraftFolders: args.dungeondraftFolders } : {}), ...(args.packFolders !== undefined ? { packFolders: args.packFolders } : {}) } : null;
      return out(await ctx.studio.settings(change));
    },
  },
  {
    name: "kraken_updates",
    description:
      "Kraken's updater, as the start screen shows it (the GM's rules: it looks for a new version once, when Kraken starts, never during a game; downloads and installs only when asked, never while a campaign is hosted). action status: what it found (status off, checking, current, available (version, notes), downloading (percent), ready, error); download: fetch the new version; install: Kraken closes, the installer runs and the new version opens.",
    inputSchema: object({ action: { type: "string", enum: ["status", "download", "install"] } }, ["action"]),
    async run(args, ctx) {
      if (!ctx.updater) throw new Error("Updates are the Kraken app's.");
      return out(await ctx.updater(args.action ?? "status"));
    },
  },
  {
    name: "kraken_open_fg_module",
    description:
      "Put an FG adventure module's maps on the table (B1 In Search of the Unknown, B2 The Keep on the Borderlands...): every map becomes a scene with its picture, FG's walls (doors, see-through and one-way walls), lights, grid, FX layers (rain, clouds, water in its mask) and FG's shortcuts as map pins in two GM-only layer groups (Map keys, Encounters) linked to the story entries and encounters. maps: names to take only some (part of the name); without, the module's playable maps (FG's Maps and Region map, or with a grid or walls; handouts and portraits stay in Images & Maps), all: true for every picture. The first map goes on the table; kraken_scenes switches.",
    inputSchema: object({ module: string("The module's name, as FG lists it"), maps: { type: "array", items: { type: "string" } }, all: { type: "boolean" } }, ["module"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      // Only an active book's maps.
      table.requireActiveBook?.(String(args.module ?? ""));
      const { fgModuleBundle } = require("../importers/fgMaps.cjs");
      const bundle = fgModuleBundle(String(args.module), { only: args.maps, all: Boolean(args.all) });
      // The maps' image layers: their pictures into the tile library first.
      for (const [id, extra] of Object.entries(bundle.extras)) table.map.seed(id, { ...extra, tiles: table.storeTiles ? table.storeTiles(extra.tiles) : [] });
      const opened = await ctx.ui({ kind: "open-adventure", name: bundle.name, bytes: new Uint8Array(bundle.bytes) }, 120000);
      return out({ opened, scenes: bundle.scenes });
    },
  },
  {
    name: "kraken_library",
    description:
      "FG's Library of an adventure module (B1, B2... read in place): action list (kind map (its maps: name, picture file, grid; kraken_open_fg_module with maps: [its name] puts that one on the table), npc, battle (FG's encounters), parcel (treasure parcels), table or story (FG's story entries); search); story (path: a story entry's text); npc (path: put the NPC on the combat tracker, count); battle (path: the encounter's NPCs onto the tracker, and when its FG map is open (kraken_open_fg_module) their tokens where FG placed them, hidden until revealed; place false: tracker only); parcel (path: its coins and items into the party sheet's parcel to hand out); table (path: roll it on the host's dice; the result goes to chat).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "npc", "battle", "parcel", "table", "story"] },
      module: string("The module's name (list)"),
      kind: { type: "string", enum: ["image", "map", "npc", "battle", "parcel", "table", "story"] },
      search: string("Part of the name (list)"),
      path: string("The record's FG path, as list gives it"),
      count: number("npc: how many"),
      place: { type: "boolean", description: "battle: place tokens on the open map (default true)" },
    }, ["action"]),
    async run(args, ctx) {
      const table = needTable(ctx);
      const library = require("../library.cjs");
      // Only an active book's lists and records.
      table.requireActiveBook?.(args.action === "list" ? String(args.module ?? "") : String(args.path ?? "").split("@").slice(1).join("@") || String(args.module ?? ""));
      if (args.action === "list") return out(library.list(String(args.module ?? ""), args.kind, args.search ?? ""));
      if (args.action === "story") return out(library.storyEntry(String(args.path ?? "")));
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
      "The GM's windows: list them, or open, close, pop out (to a window of its own, for another monitor) or dock back a window. Kinds: map (the open map in its own window, as FG's image window, with its tools and settings; it opens by itself when a map opens and never pops out), assistant (the GM's DM assistant chat), characters, party, combat, players, settings, decals (the background decal picker), wallpapers (the desktop wallpaper picker), gmicons (the GM icon picker), krits (critical hits and fumbles), dice (this seat's dice: sets, colours, design, material, effects), sound (one-shots, effects, ambience, music, chat triggers, volumes), sheet (a character's sheet: give record, its id or name), charselect (Character Selection), records (FG's campaign lists: NPCs, items, spells, classes...; the GM shares one with kraken_record_update visibility all, hides it with gm), record (one record: give record, its id or name). cards (the ability cards, when this seat turned them on in Settings).",
    inputSchema: object({
      action: { type: "string", enum: ["list", "open", "close", "popout", "dock"] },
      kind: { type: "string", enum: ["assistant", "characters", "party", "combat", "players", "settings", "decals", "wallpapers", "gmicons", "krits", "library", "dice", "sound", "sheet", "books", "book", "images", "picture", "notes", "note", "charselect", "records", "record", "adventure", "story", "map", "cards", "imagelist", "studio", "assets", "towers", "deathmarkers", "calendar", "motd"] },
      record: string("For a sheet: the character's record id or name; for a record: its id or name"),
    }),
    run: async (args, ctx) => out(await ctx.ui({ kind: "windows", action: args.action ?? "list", window: args.kind, record: args.record })),
  },
  {
    name: "kraken_sidebar",
    description:
      "The sidebar on the right of the GM's screen, as FG's: the tools along the top (combat tracker, assistant, players, settings), then categories that fold away: Library (Modules = book activation, Books, Sound Sets), Player (Characters, Packages, Party, Notes), Campaign (Encounters, Images, Items, NPCs, Parcels, Tables: every active book's or adventure's, each under the book's name), World (Story: every active adventure's story entries, each opening its text) and Character (Classes, Races, Spells...: drag one onto a character sheet, or kraken_character_drop). action list: the buttons and categories, which are open or folded, and the state; state: 0 icons and names, 1 icons only (categories cut to four letters), as the arrow at the bottom toggles; fold: fold a category (group, its name) away, or open it again with folded false; press: press a button (entry: its id from list, such as records:npc or adventure:battle, or its name) to open or close its window.",
    inputSchema: object({
      action: { type: "string", enum: ["list", "state", "fold", "press"] },
      state: { type: "number", enum: [0, 1] },
      group: string("A category: Library, Player, Campaign, World or Character"),
      folded: { type: "boolean" },
      entry: string("A button: its id (list) or its name"),
    }),
    run: async (args, ctx) => out(await ctx.ui({ kind: "sidebar", action: args.action ?? "list", state: args.state, group: args.group, folded: args.folded, entry: args.entry })),
  },
  {
    name: "kraken_dice_settings",
    description:
      "The GM's own 3D dice, as FG's dice skins and more (everyone at the table sees the roller's dice as set here): show the dice rolling on the table, sound and volume (0..1); a ready-made set (preset; the Gilded Die's: Cores Aether Core, Emerald Cut, Frostcrystal, Obsidian Glass, Voidglass, Ghost; Relics Reliquary, Rose Window, Classic Ruby, Gilded, Bloodstone, Champion; Wilds Dragonhide, Wyrmscale, Behemoth, Ancient Bone, Gravewrought, Leviathan, Magma Vein; Classes Arcane Seal, Wizard, Bard, Necromancer, Goblin Scrap; Worlds Starfall, Imperial, Mythos; Kraken's: Frost Glass, Molten Gold, Arcane Pearl, Obsidian, Carrara, Oak and Iron, Rune Steel, Kraken Deep), or the parts: body, accent (the second colour of two-colour designs) and ink (the numbers) as #rrggbb; design (classic = solid, marble, swirl, speckle, stripes, wood, runes, dragonhide, starfall, bone, magma, leviathan, and the Gilded Die's aether, emerald, frost, obsidian, void, ghost, reliquary, rosewindow, gilded, bloodstone, hero, monster, wyrm, undead, arcane, wizard, bard, necromancer, goblin, traveller, mythos); material (plastic = resin, glass, metal, pearl, stone, wood, design = the design's own finish: inner crystals, enamel or stained-glass inlays, the reliquary's gems); font for the numbers (classic, bold, runic = carved capitals, script, glow, metal = gilt, engrave); pips: a d6 shows pips; effect as they roll (none, sparkles, fire, frost, arcane, shadow, glow, and the Gilded Die's trails: aura = soft glow, wisp = ectoplasm, spark, embers, holy = rising motes, charge = charged orb, notes = rising music, ion = ion streak; these settle as a ring of sparks and burst on the highest face); crit: a natural 20 flares gold and a 1 red. A preset first, then any parts on top of it. set: which dice the preset and parts change, as FG's dice sets: mine (default), npc (the GM's dice for the creatures they roll for: NPC attacks, saves and checks from the tracker) or damage (every damage roll); same true puts that set back to 'as my dice'. Without arguments, reads them. Who sees a dice-tower result is kraken_table_options.",
    inputSchema: object({
      show: { type: "boolean" },
      sound: { type: "boolean" },
      volume: number("0 to 1"),
      preset: string("Preset name, or a dice pack set's name (kraken_dice_packs list)"),
      body: string("Dice colour, #rrggbb"),
      accent: string("Second colour, #rrggbb"),
      ink: string("Numbers colour, #rrggbb"),
      design: { type: "string", enum: ["classic", "marble", "swirl", "speckle", "stripes", "wood", "runes", "dragonhide", "starfall", "bone", "magma", "leviathan", "aether", "reliquary", "rosewindow", "gilded", "emerald", "frost", "obsidian", "bloodstone", "arcane", "void", "hero", "monster", "wizard", "bard", "necromancer", "goblin", "wyrm", "ghost", "undead", "traveller", "mythos"] },
      material: { type: "string", enum: ["plastic", "glass", "metal", "pearl", "stone", "wood", "design"] },
      font: { type: "string", enum: ["classic", "bold", "runic", "script", "glow", "metal", "engrave"] },
      pips: { type: "boolean" },
      effect: { type: "string", enum: ["none", "sparkles", "fire", "frost", "arcane", "shadow", "glow", "aura", "wisp", "spark", "embers", "holy", "charge", "notes", "ion"] },
      crit: { type: "boolean" },
      set: { type: "string", enum: ["mine", "npc", "damage"] },
      same: { type: "boolean", description: "With set npc or damage: back to as my dice (with character: back to its player's dice)" },
      color: string("Your colour on the map (pings and ink), #rrggbb; empty for the table's colour for your name"),
      character: string("A character (record id or name): set that character's own dice (the character tier, kept on it; every roll made as it uses them) instead of the GM's. Takes preset and the look parts, set mine or damage, same"),
      who: string("With color, turnSound or turnBanner: a player's name, to set that player's (their user settings) instead of the GM's"),
      turnSound: { type: "boolean", description: "When this person's turn comes round on the combat tracker: a bell (Settings > You at the table)" },
      turnBanner: { type: "boolean", description: "When this person's turn comes round: a banner across their screen" },
    }),
    async run(args, ctx) {
      if (args.character) {
        const table = needTable(ctx);
        const wanted = String(args.character).toLowerCase();
        const record = table.records.get(args.character) ?? table.records.list({ type: "character" }).find((item) => item.name.toLowerCase() === wanted);
        if (!record || record.type !== "character") throw new Error(`No character "${args.character}".`);
        const key = args.set === "damage" ? "damage" : "look";
        if (args.same) {
          const updated = table.records.update(record.id, { data: { dice: { [key]: null } } }, table.seat);
          return out({ character: updated.name, dice: updated.data.dice ?? null });
        }
        // The GM's screen works the look out (presets and parts, from what the character has now).
        const base = record.data?.dice?.[key] ?? record.data?.dice?.look ?? null;
        const { look: worked } = await ctx.ui({ kind: "dice-settings", patch: { ...args, resolve: true, base } });
        const look = table.diceLook(worked);
        if (!look) throw new Error("That is not a whole dice look: give a preset, or body, ink and design.");
        const updated = table.records.update(record.id, { data: { dice: { [key]: look } } }, table.seat);
        return out({ character: updated.name, dice: updated.data.dice });
      }
      if (args.who !== undefined && args.who !== "" && args.who !== "GM") {
        const table = needTable(ctx);
        const patch = { ...(args.color !== undefined ? { color: args.color ? args.color : null } : {}), ...(typeof args.turnSound === "boolean" ? { turnSound: args.turnSound } : {}), ...(typeof args.turnBanner === "boolean" ? { turnBanner: args.turnBanner } : {}) };
        return out({ who: args.who, prefs: table.prefs(args.who, patch) });
      }
      return out(await ctx.ui({ kind: "dice-settings", patch: args }));
    },
  },
  {
    name: "kraken_assistant",
    description:
      "The GM's DM assistant (the sidebar's Assistant window: Claude driving these same tools for the GM): action view (the conversation so far, whether it is working, whether it has an API key), ask (text: what the GM says to it; waits for its answer), stop (after the round under way), reset (a fresh conversation). The key is set in its window or ANTHROPIC_API_KEY, never here.",
    inputSchema: object({ action: { type: "string", enum: ["view", "ask", "stop", "reset"] }, text: string("ask: what to say to the assistant") }),
    async run(args, ctx) {
      const assistant = ctx.assistant?.();
      if (!assistant) throw new Error("The assistant runs in the Kraken app.");
      const action = args.action ?? "view";
      if (action === "ask") return out(await assistant.ask(args.text));
      if (action === "stop") return out(assistant.stop());
      if (action === "reset") return out(assistant.reset());
      return out(assistant.view());
    },
  },
  {
    name: "kraken_packs",
    description:
      "Kraken packs (the Books window's Packs tab): the GM's Fantasy Grounds books made into Kraken's own files (.kpack, one per book: its pages, records, maps with walls, pictures), kept in one folder (Documents/Kraken VTT/Packs) that can be copied to any computer, where the books open with no Fantasy Grounds. action list (ruleset: a Kraken ruleset such as \"Castles & Crusades\" or \"D&D 3.5E\", empty for every game: each FG module, its pack (current or older than the module), and packs with no module here; making: the pack being made, how far); make (books: module ids or names, or [\"all\"] for every listed one without a current pack; made one at a time in the background, then they show on the shelf); folder (where the packs are). Packs hold the GM's own books: never share them.",
    inputSchema: object({ action: { type: "string", enum: ["list", "make", "folder"] }, ruleset: string("A Kraken ruleset (list, make all); empty for every game"), books: { type: "array", items: { type: "string" }, description: "make: module ids or names, or [\"all\"]" } }),
    async run(args, ctx) {
      if (!ctx.packs) throw new Error("Packs are made in the Kraken app.");
      const action = args.action ?? "list";
      if (action === "folder") return out({ folder: ctx.packs.view({}).folder });
      if (action === "make") {
        const wanted = Array.isArray(args.books) ? args.books.map(String) : [];
        if (wanted.length === 0) throw new Error("Name the books to make packs of, or [\"all\"].");
        const ids = wanted.includes("all") ? ctx.packs.view({ ruleset: args.ruleset ?? "" }).books.filter((book) => !book.packOnly && !book.pack?.current && !book.state).map((book) => book.id) : wanted;
        return out(ctx.packs.make(ids));
      }
      return out(ctx.packs.view({ ruleset: args.ruleset ?? "" }));
    },
  },
  {
    name: "kraken_ui_screenshot",
    description: "Screenshot the GM's app window.",
    inputSchema: object({}),
    async run(_args, ctx) {
      // The window is the window's process's (the backend asks it).
      const data = await ctx.windowOp("screenshot");
      return { content: [{ type: "image", data, mimeType: "image/png" }] };
    },
  },
  {
    name: "kraken_ui_text",
    description: "The visible text of the GM's app window.",
    inputSchema: object({}),
    async run(_args, ctx) {
      return out(await ctx.windowOp("text"));
    },
  },
  {
    name: "kraken_ui_eval",
    description: "Run JavaScript in the GM's app window and return the result (for driving or inspecting the UI). window.__kraken has the session handle.",
    inputSchema: object({ code: string("An expression, or statements ending in a value") }, ["code"]),
    async run(args, ctx) {
      return out(await ctx.windowOp("eval", { code: String(args.code) }));
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
