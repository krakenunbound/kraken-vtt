// The agent's tools for the campaign's own content (electron/content.cjs):
// the same functions the table's messages call, as the GM.
const content = require("../content.cjs");

const out = (value) => ({ content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const string = (description) => ({ type: "string", description });
const number = (description) => ({ type: "number", description });
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
function needTable(ctx) {
  const table = ctx.table();
  if (!table) throw new Error("Not hosting. Host a campaign first (kraken_host).");
  return table.agent;
}
const LINK = { type: "object", description: "A Kraken link (as a quick slot holds one): { kind: picture, book, file, label } or { kind: book, book, page, label }, or any other link" };
const BLOCKS = { type: "array", description: "The pages in order: { kind: text, text (FG's formatted text) } | { kind: image, link } | { kind: page, link }", items: { type: "object" } };

const TOOLS = [
  {
    name: "kraken_record_duplicate",
    description:
      "FG's Duplicate and Copy to campaign, as a record's right-click menu and its window: a copy of a campaign record named \"<name> (copy)\" (id), or a book's record copied into the campaign under its own name (id of an active book's record, or book + path for a record a book's page links to). The copy is the campaign's own (no book), hidden from the players, with a new id; edit it with kraken_record_update.",
    inputSchema: object({ id: string("The record to copy"), name: string("The copy's name (default: \"<name> (copy)\", or the book record's name)"), book: string("A book's id (with path)"), path: string("A record's FG path in that book") }),
    run: async (args, ctx) => out(await content.copyRecord(needTable(ctx), args)),
  },
  {
    name: "kraken_story",
    description:
      "The campaign's story (FG's story records, with the Story Template's pages): its chapters are the list's categories. action create (name, chapter, order, blocks or text, visibility); copy (path: an adventure's story entry, as kraken_library list kind story gives it, copied into the campaign); set (id: name, chapter, order, blocks: the whole list of pages); add-block (id, kind text|image|page, text (FG's formatted text: <p>, <h>, <b>, <i>, <u>, <list><li>, <table><tr><td>, <frame> for boxed read-aloud text, <link class recordname>) or link, at); remove-block (id, at). Share it with kraken_record_update visibility (all, or a list of players' names).",
    inputSchema: object(
      {
        action: { type: "string", enum: ["create", "copy", "set", "add-block", "remove-block"] },
        id: string("The story record (set, add-block, remove-block)"),
        name: string("Its name"),
        chapter: string("Its chapter (the story list's category)"),
        order: number("Its place in the chapter"),
        text: string("FG's formatted text (create: the first page; add-block)"),
        blocks: BLOCKS,
        kind: { type: "string", enum: ["text", "image", "page"] },
        link: LINK,
        at: number("A page's index (add-block: where; remove-block: which)"),
        path: string("copy: the story entry's FG path"),
        visibility: { description: "gm, all, or a list of players' names", anyOf: [{ type: "string", enum: ["gm", "all"] }, { type: "array", items: { type: "string" } }] },
      },
      ["action"],
    ),
    run: (args, ctx) => out(content.storyAction(needTable(ctx), args)),
  },
  {
    name: "kraken_table",
    description:
      "Random tables, as FG's: action roll (id, or name, or path for an adventure's table; column: a column's label or number, default every column; dice: other dice, as /rollon -d; hide: the GM's eyes only, as /rollon -hide; output parcel: the results into a new treasure parcel). A result's [2d6] is rolled into it, [3x] rolls the tables it links three times, [Other Table] and a result linking a table roll them too (ten deep at most); the table's \"hide roll results\" keeps it the GM's. create (name, dice, mod, data: FG's table fields); edit (id: name, dice, mod, resultscols, labels [..], rows [{ from, to, results: [text or { result, resultlink }] }], hiderollresults 0/1, output); import (FG's Import Table: name, text pasted, delimiter \"\" (simple: \"1-3 words\", columns two spaces apart) or , | : ;, header (first row the column labels), ranges (first column the ranges)). Returns the roll's results, nested ones too.",
    inputSchema: object(
      {
        action: { type: "string", enum: ["roll", "create", "edit", "import"] },
        id: string("The table record"),
        name: string("A table's name (roll by name, create, import, edit)"),
        path: string("roll: an adventure's table by its FG path (kraken_library list kind table)"),
        column: string("roll: a column's label or number"),
        dice: string("roll: other dice (2d6); create, edit: the table's die (d20, d100)"),
        hide: { type: "boolean", description: "roll: for the GM alone" },
        output: { type: "string", enum: ["", "parcel"], description: "roll: the results into a treasure parcel; edit: the table's own output" },
        mod: number("The table's modifier"),
        resultscols: number("edit: how many columns"),
        labels: { type: "array", items: { type: "string" }, description: "edit: the columns' labels" },
        rows: { type: "array", items: { type: "object" }, description: "edit: every row, { from, to, results }" },
        hiderollresults: number("edit: 1 to keep its rolls the GM's"),
        data: { type: "object", description: "create: FG's table fields; roll: a table's fields as read from a book's page (a rulebook's table, which the campaign does not copy in), with name" },
        text: string("import: the pasted table"),
        delimiter: { type: "string", enum: ["", ",", "|", ":", ";"] },
        header: { type: "boolean" },
        ranges: { type: "boolean" },
      },
      ["action"],
    ),
    run: (args, ctx) => out(content.tableAction(needTable(ctx), args, needTable(ctx).seat, "GM")),
  },
  {
    name: "kraken_item_identify",
    description:
      "FG's Identified toggle (the GM's): on false makes an item unidentified (the players then see only its unidentified name and notes: name, notes set them; the host strips the rest from every player's screen, the party sheet and chat), on true identifies it. id: an item record; or a character, the party (\"party\": its parcel) or a treasure parcel with item: the row's key in its gear or parcel.",
    inputSchema: object({ id: string("An item, a character, \"party\" or a treasure parcel"), item: string("The row's key in that character's gear, the party's parcel or the treasure parcel"), on: { type: "boolean", description: "true: identified (default); false: unidentified" }, name: string("The unidentified name (nonid_name)"), notes: string("The unidentified notes (nonid_notes)") }, ["id"]),
    run: (args, ctx) => out(content.identify(needTable(ctx), args)),
  },
  {
    name: "kraken_encounter",
    description:
      "The campaign's encounters (FG's battle records), as the encounter window: action create (name); add-npc (id, npc: an NPC record, count: a number or dice rolled when it is added (a random encounter: 1d4+1), faction friend|neutral|foe; as an NPC dropped on it); set-npc (id, row, count, faction); remove-npc (id, row); xp (the total from its creatures, the game's own field); place (Place on this map: the open map's tokens of its creatures, where they stand now, kept as its spots on that map; spots { row: [{ x, y }] } to give them); run (Add to tracker: its NPCs onto the combat tracker, counts rolled, tokens hidden at its spots when this map has them; place false: tracker only); end (End encounter: its XP onto the party sheet's Encounters to award; xp to give another total).",
    inputSchema: object(
      {
        action: { type: "string", enum: ["create", "add-npc", "set-npc", "remove-npc", "xp", "place", "run", "end"] },
        id: string("The encounter"),
        name: string("create: its name"),
        npc: string("add-npc: an NPC record's id"),
        count: string("A number or dice"),
        faction: { type: "string", enum: ["friend", "neutral", "foe"] },
        row: string("The NPC's row key"),
        spots: { type: "object", description: "place: { row: [{ x, y }] } (map pixels)" },
        place: { type: "boolean" },
        xp: number("end: the XP to give, instead of its total"),
      },
      ["action"],
    ),
    run: async (args, ctx) => out(await content.encounterAction(needTable(ctx), args, "Agent")),
  },
  {
    name: "kraken_parcel",
    description:
      "Treasure parcels (FG's): action create (name); add (id: item (an item record: its whole record, identified or not) and count, or name for a plain item; or coin (the game's money: GP, Cr, Supply...) and amount); remove (id, key of an item row, coin true for a coin row); party (id: into the party sheet's parcel to hand out, as a parcel dropped on the party sheet); character (id, character: its items into that sheet's gear, its coins into the purse, as a parcel dropped on a sheet). A table rolled with output parcel fills a new one.",
    inputSchema: object(
      {
        action: { type: "string", enum: ["create", "add", "remove", "party", "character"] },
        id: string("The parcel"),
        name: string("create: its name; add: a plain item's name"),
        item: string("add: an item record's id"),
        count: number("add: how many"),
        coin: string("add: a coin's name"),
        amount: number("add: how many coins"),
        key: string("remove: the row's key"),
        character: string("character: the character's id"),
      },
      ["action"],
    ),
    run: async (args, ctx) => out(await content.parcelAction(needTable(ctx), args, "Agent")),
  },
  {
    name: "kraken_quest",
    description: "Quests (FG's quest records): action create (name, xp, text (FG's formatted text), status open|done, visibility); set (id: name, xp, text, status); party (id: onto the party sheet's XP tab, to award there with kraken_party_award, as a quest dropped on that tab).",
    inputSchema: object({ action: { type: "string", enum: ["create", "set", "party"] }, id: string("The quest"), name: string("Its name"), xp: number("Its XP"), text: string("Its text"), status: { type: "string", enum: ["open", "done"] }, visibility: { type: "string", enum: ["gm", "all"] } }, ["action"]),
    run: (args, ctx) => out(content.questAction(needTable(ctx), args)),
  },
];

module.exports = { TOOLS };
