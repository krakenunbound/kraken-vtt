// Books, as FG's Library: a module's book (chapters, sections, pages with
// pictures and links) read through the host; only the modules for the
// campaign's ruleset; the GM makes books active for the campaign (FG's
// Activation), and a players' book starts open to the players; an adventure
// is never theirs to read (only the pictures the GM shows); a player reads
// only what is shared; a picture shown to the players opens as a
// tab for them; sharing is saved with the campaign; the agent does it all.
// Uses a small module made here, so it needs no FG modules.
import "./loopback.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { makeBooks } from "./fake-books.mjs";
import { WebSocket } from "ws";

const require = createRequire(import.meta.url);
const { createTableServer } = require("../electron/tableServer.cjs");
const { createBookShelf } = require("../electron/books.cjs");
const { callTool } = require("../electron/agent/tools.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const folder = makeBooks();
const books = createBookShelf({ folder, cache: path.join(folder, "cache.json") });
const list = books.list();
assert(list.length === 4 && list.find((item) => item.id === "Test Keep")?.hasBook === true && list.find((item) => item.id === "Not A Book")?.hasBook === false, `the shelf lists the modules, books or not: ${JSON.stringify(list)}`);
assert(list.find((item) => item.id === "Test Handbook").forPlayers === true && list.find((item) => item.id === "Test Keep").adventure === true, "a players' handbook is the players'; an adventure is the GM's");
const keep = list.find((item) => item.id === "Test Keep");
assert(keep.title === "The Test Keep" && keep.category === "Test Adventures" && keep.cover === "thumbnail.png", "a module's title, category and cover");
const contents = books.contents("Test Keep");
assert(contents.chapters[0].name === "The Keep" && contents.chapters[0].sections[0].pages.map((page) => page.id).join() === "gate,inn", `chapters, sections, pages in order: ${JSON.stringify(contents.chapters)}`);
assert(contents.pictures.length === 1 && contents.pictures[0].file === "images/keep.png", "its pictures and maps");
const gate = books.page("Test Keep", "gate");
const text = gate.blocks.find((block) => block.kind === "text").html;
assert(gate.blocks[0].kind === "picture" && gate.blocks[0].file === "images/keep.png" && gate.blocks[0].caption === "The keep from the road", "a picture block");
assert(text.includes("<b>guards</b>") && text.includes('<blockquote class="frame">Halt!'), `formatted text as HTML: ${text}`);
assert(!/<script/i.test(text) && text.includes("&lt;script&gt;"), "no script gets through; its text is escaped");
assert(text.includes('data-page="inn"') && text.includes('data-file="images/keep.png"'), "links go to a page and to a picture");

// Worldbuilding (no rules) takes only the books for any game, never another game's.
{
  const { fitsRuleset } = require("../electron/books.cjs");
  const fits = (ruleset) => list.filter((item) => fitsRuleset(item, ruleset)).map((item) => item.id).sort().join();
  assert(fits("Worldbuilding") === "Not A Book", `Worldbuilding: only any game's (${fits("Worldbuilding")})`);
  assert(fits("Castles & Crusades") === "Not A Book,Test Handbook,Test Keep", `C&C: its own and any game's (${fits("Castles & Crusades")})`);
}
const server = createTableServer({ books, ruleset: "Castles & Crusades" });
const tool = async (name, args) => JSON.parse((await callTool(name, args, { table: () => server })).content[0].text);
function connect(port, join) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const events = [];
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      events.push(msg);
      if (msg.type === "ok") resolve({ ws, you: msg.you, ok: msg, events, send: (body) => ws.send(JSON.stringify(body)) });
    });
    ws.on("error", reject);
    ws.on("open", () => ws.send(JSON.stringify({ type: "join", ...join })));
  });
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
try {
  const { port, hostToken } = await server.listen({ port: 0, password: "" });
  const base = `http://127.0.0.1:${port}`;
  const get = (seat, route) => fetch(`${base}${route}${route.includes("?") ? "&" : "?"}token=${seat.you.assetToken}`);
  const gm = await connect(port, { name: "GM", hostToken });
  const player = await connect(port, { name: "A test player" });
  const book = encodeURIComponent("Test Keep");

  const gmShelf = (await (await get(gm, "/book/list")).json()).books;
  assert(gmShelf.length === 3 && !gmShelf.some((item) => item.id === "Other Game"), `the GM sees the modules for the campaign's game, not another game's: ${gmShelf.map((item) => item.id)}`);
  assert(gmShelf.every((item) => !item.active), "none is active in a new campaign");
  assert((await get(gm, `/book/page?book=Other%20Game&page=first`)).status === 404, "another game's book is not this campaign's");
  gm.send({ type: "book-activate", book: "Other Game" });
  await settle();
  assert(gm.events.some((event) => event.type === "error" && /5E/.test(event.reason)), "another game's book cannot be made active");

  // Activation: the handbook opens to the players at once, the adventure not.
  gm.send({ type: "book-activate", book: "Test Handbook" });
  gm.send({ type: "book-activate", book: "Test Keep" });
  await settle();
  const activated = (await (await get(gm, "/book/list")).json()).books;
  assert(activated.find((item) => item.id === "Test Keep").active && !activated.find((item) => item.id === "Test Keep").shared, "an active adventure stays the GM's");
  assert(activated.find((item) => item.id === "Test Handbook").shared, "an active players' handbook is open to the players");
  assert((await (await get(player, "/book/list")).json()).books.map((item) => item.id).join() === "Test Handbook", "the player's shelf: the handbook, not the adventure");
  const loaded = server.agent.records.list({ source: "Test Handbook" });
  assert(loaded.length === 1 && loaded[0].type === "item", `an active module's rules records (its gear) are loaded into the campaign, not its book pages (${loaded.map((record) => record.type)})`);
  const reopenedWith = createTableServer({ books, ruleset: "Castles & Crusades", saved: { books: server.persisted().books } });
  assert(reopenedWith.agent.records.list({ source: "Test Handbook" }).length === 0, "opening the campaign does not wait for the books");
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert(reopenedWith.agent.records.list({ source: "Test Handbook" }).length === 1, "a book active when the campaign opens has its records soon after");
  gm.send({ type: "book-activate", book: "Test Handbook", active: false });
  await settle();
  assert((await (await get(player, "/book/list")).json()).books.length === 0, "a book made inactive leaves the player's shelf");
  assert(server.agent.records.list({ source: "Test Handbook" }).length === 0, "made inactive, its records are taken out");
  assert((await (await get(player, "/book/list")).json()).books.length === 0, "a player sees no GM's book until the GM shares it");
  assert((await get(player, `/book/page?book=${book}&page=gate`)).status === 404, "a player cannot read a book not shared");
  assert((await get(player, `/book/picture?book=${book}&file=images/keep.png`)).status === 404, "nor see its pictures");
  assert((await get(gm, `/book/page?book=${book}&page=gate`)).ok && (await get(gm, `/book/cover?book=${book}`)).headers.get("content-type") === "image/png", "the GM reads pages and covers");

  player.send({ type: "book-share", book: "Test Handbook" });
  await settle();
  assert(player.events.some((event) => event.type === "error"), "a player cannot share books");
  gm.send({ type: "book-share", book: "Test Keep" });
  await settle();
  assert(gm.events.some((event) => event.type === "error" && /adventure/.test(event.reason)), "an adventure cannot be opened to the players");
  assert((await get(player, `/book/page?book=${book}&page=inn`)).status === 404, "the player cannot read the adventure");
  gm.send({ type: "book-share", book: "Test Handbook" });
  await settle();
  assert(player.events.some((event) => event.type === "books" && event.shared.includes("Test Handbook")), "the players hear a book is open to them");
  assert((await (await get(player, "/book/list")).json()).books.map((item) => item.id).join() === "Test Handbook", "a shared book is on the player's shelf");
  assert((await (await get(player, "/book/page?book=Test%20Handbook&page=first")).json()).name === "First", "and the player reads it");
  gm.send({ type: "book-share", book: "Test Handbook", shared: false });
  await settle();
  assert((await get(player, "/book/page?book=Test%20Handbook&page=first")).status === 404, "unshared, it is closed again");

  // A picture shown to the players: a tab on their screens, and only that picture.
  gm.send({ type: "image-share", book: "Test Keep", file: "images/keep.png", name: "The Keep" });
  await settle();
  const shown = player.events.find((event) => event.type === "image-shown");
  const state = player.events.filter((event) => event.type === "books").at(-1);
  assert(shown && state.images.some((item) => item.id === shown.id && item.name === "The Keep"), "the player is shown the picture");
  assert((await get(player, `/book/picture?book=${book}&file=images/keep.png`)).ok, "and can see it");
  assert((await get(player, `/book/page?book=${book}&page=gate`)).status === 404, "but not read the book");
  gm.send({ type: "image-share", book: "Test Keep", file: "../../secret.png", name: "x" });
  await settle();
  assert(gm.events.some((event) => event.type === "error" && /no such picture/i.test(event.reason)), "only a picture in the book can be shown");

  // Saved with the campaign.
  const reopened = createTableServer({ books, saved: server.persisted() });
  assert(reopened.agent.shelf().images.length === 1, "shown pictures are saved with the campaign");
  const late = await connect(port, { name: "Late player" });
  assert(late.ok.books.images.length === 1, "a player who joins later has the pictures shown");

  // Quick slots: each seat its own, kept with the campaign; junk is dropped.
  player.send({ type: "quickslots", slots: [{ kind: "book", book: "Test Handbook", page: "first", label: "Rules" }, { kind: "virus", label: "x" }, null, { kind: "picture", book: "Test Keep", file: "images/keep.png", label: "Keep" }] });
  await settle();
  const mine = player.events.filter((event) => event.type === "quickslots").at(-1)?.slots;
  assert(mine?.length === 10 && mine[0].page === "first" && mine[1] === null && mine[3].kind === "picture", `a player's slots, cleaned: ${JSON.stringify(mine)}`);
  assert(server.agent.quickSlots("@gm").every((slot) => slot === null), "the GM's slots are the GM's own");
  assert(server.agent.quickSlots("A test player")[0].label === "Rules", "the agent reads a player's slots");
  const later = createTableServer({ books, ruleset: "Castles & Crusades", saved: server.persisted() });
  assert(later.agent.quickSlots("A test player")[3].file === "images/keep.png", "slots are kept with the campaign");
  assert((await tool("kraken_quickslots", { slots: [{ kind: "sheet", record: "id-1", label: "Aldric" }] }))[0].kind === "sheet", "the agent sets the GM's slots");

  // Notes, as FG's Player Notes: a player's own, shared when they say so.
  const other = await connect(port, { name: "Another player" });
  const op = (seat, body) =>
    new Promise((resolve) => {
      const req = Math.floor(Math.random() * 1e9);
      seat.ws.on("message", function answer(data) {
        const msg = JSON.parse(data.toString());
        if (msg.type === "op-result" && msg.req === req) {
          seat.ws.off("message", answer);
          resolve(msg);
        }
      });
      seat.send({ type: "op", req, ...body });
    });
  const made = await op(player, { op: "create", input: { type: "note", name: "Clues", visibility: "owner", data: { text: "The innkeeper lies.", links: [{ kind: "sound", sound: "ambience/Tavern", soundKind: "ambience", label: "Tavern" }] } } });
  assert(made.ok, `a player makes a note (${JSON.stringify(made)})`);
  const note = server.agent.records.get(made.id);
  assert(note.owner === "A test player" && note.visibility === "owner", "the note is its writer's");
  assert(!(await op(other, { op: "update", id: made.id, patch: { name: "Mine now" } })).ok, "another player cannot change it");
  assert((await op(player, { op: "update", id: made.id, patch: { visibility: "all" } })).ok && server.agent.records.get(made.id).visibility === "all", "its writer shares it with the table");
  assert((await op(player, { op: "update", id: made.id, patch: { visibility: "owner" } })).ok && server.agent.records.get(made.id).visibility === "owner", "and makes it theirs alone again");
  player.send({ type: "quickslots", slots: [{ kind: "note", record: made.id, label: "Clues" }, { kind: "sound", sound: "ambience/Tavern", soundKind: "ambience", label: "Tavern" }] });
  await settle();
  const slotted = player.events.filter((event) => event.type === "quickslots").at(-1).slots;
  assert(slotted[0]?.kind === "note" && slotted[1]?.kind === "sound", `quick slots keep notes and sounds (${JSON.stringify(slotted.slice(0, 2))})`);
  other.ws.close();

  // The agent.
  assert((await tool("kraken_books", { action: "list", search: "keep" })).length === 1, "the agent lists books");
  await tool("kraken_books", { action: "deactivate", book: "Test Handbook" });
  assert((await tool("kraken_books", { action: "activate", book: "Test Handbook" })).shared.includes("Test Handbook"), "the agent makes a book active");
  assert(!(await tool("kraken_books", { action: "deactivate", book: "Test Handbook" })).active.includes("Test Handbook"), "and inactive");
  assert((await tool("kraken_books", { action: "contents", book: "Test Keep" })).chapters.length === 1, "reads a book's contents");
  assert((await tool("kraken_books", { action: "page", book: "Test Keep", page: "inn" })).name === "The Inn", "reads a page");
  assert((await tool("kraken_books", { action: "share", book: "Test Handbook" })).shared.includes("Test Handbook"), "opens a book to the players");
  const agentShown = await tool("kraken_books", { action: "show", book: "Test Keep", file: "images/keep.png", name: "The Keep" });
  assert(agentShown.id === shown.id, "showing the same picture again keeps one tab");
  assert((await tool("kraken_books", { action: "hide", id: "all" })).images.length === 0, "hides every picture");
  for (const seat of [gm, player, late]) seat.ws.close();
  console.log(`BOOKS_OK the ruleset's books, activation (players' books open, the GM's not), chapters, pages, pictures and links; sharing a book and a picture; saved; the agent`);
} finally {
  await server.stop();
}
