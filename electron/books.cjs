const fs = require("fs");
const path = require("path");
const { unzipSync, strFromU8 } = require("fflate");
const { DOMParser } = require("@xmldom/xmldom");
const { readModule, modulePicture } = require("./importers/fgModule.cjs");
const packs = require("./packs.cjs");

// The GM's books, as FG's Library: the Fantasy Grounds modules on this
// computer (the GM's own, read in place, never copied or shipped). A module
// with a reference manual is a book to read: its chapters, sections and pages
// (FG's refmanualindex and refmanualdata), with pictures and links; its
// pictures and maps are FG's Images & Maps. Players read only what the GM
// shares (the table server decides).
//
// The list is cached by file, size and time, so the folder is read in full
// once (about 5 s for 13 GB) and then only what changed.

const PICTURES = /\.(png|webp|jpe?g|gif)$/i;

// Which FG rulesets' modules fit a Kraken campaign's ruleset: the ruleset
// decides the books. A module for "Any" (or CoreRPG, or none named) fits every
// campaign; Worldbuilding (no rules) takes those, and the books of games
// Kraken has no rules for yet (Pathfinder, Savage Worlds...: their pages, story and
// maps), never the books of another of Kraken's games.
const FG_RULESETS = {
  "Castles & Crusades": ["SiegeCore", "CnCRPG"],
  // FG's 5E ruleset's modules (the SRD 5.2.1's player book, bestiary, magic
  // items), Kraken's own SRD 5.2.1 books among them (games/srd-5e: ruleset 5E).
  "D&D 5E": ["5E"],
  // The 3.5E ruleset's modules (FG's own and the GM's, Kraken35E's too).
  "D&D 3.5E": ["3.5E", "Kraken35E", "d20"],
  // FG's AD&D 2E ruleset's modules (the GM's B-series, Greyhawk, pregens).
  "AD&D 2E": ["2E"],
  // FG's Mongoose Traveller 2E ruleset's modules.
  Traveller: ["MGT2"],
  // Kraken's own games, with their books shipped in the app (games/modules).
  "Descending Darkness": ["Descending Darkness"],
  "Apeira Astra": ["Apeira Astra"],
  // Cairn Second Edition (CC BY-SA 4.0), its books shipped in the app (games/modules).
  Cairn: ["Cairn"],
  // Fate Core and Fate Accelerated (CC BY 3.0), their books shipped in the app
  // (games/modules): each its own book, the toolkit and the scenario ("Fate") both.
  "Fate Core": ["Fate Core", "Fate"],
  "Fate Accelerated": ["Fate Accelerated", "Fate"],
  Worldbuilding: [],
};
const ANY = new Set(["", "any", "corerpg"]);
const PLAYED = new Set(Object.entries(FG_RULESETS).flatMap(([name, fg]) => (name === "Worldbuilding" ? [] : [name, ...fg])).map((name) => name.toLowerCase()));
function fitsRuleset(info, ruleset) {
  // A Kraken pack says which Kraken ruleset it is for.
  // (A pack made before Kraken played its game names the game as FG did: "2E".)
  if (info?.kraken) return info.kraken === "Any" || info.kraken === ruleset || (FG_RULESETS[ruleset] ?? []).some((name) => name.toLowerCase() === info.kraken.toLowerCase()) || (ruleset === "Worldbuilding" && !PLAYED.has(info.kraken.toLowerCase()) && !PLAYED.has(String(info.ruleset ?? "").toLowerCase()));
  if (ruleset === "Worldbuilding") {
    const theirs = String(info.ruleset ?? "").toLowerCase();
    return ANY.has(theirs) || !PLAYED.has(theirs);
  }
  const wanted = FG_RULESETS[ruleset] ?? [String(ruleset ?? "")];
  const theirs = String(info.ruleset ?? "").toLowerCase();
  return ANY.has(theirs) || wanted.some((name) => name.toLowerCase() === theirs);
}

// An adventure (a module, a one-shot, a scenario) is the GM's alone: it is
// never opened to the players as a book; the GM shows them its pictures and
// maps, one at a time. Of the other books, a players' book (a Player's
// Handbook, a player's guide, gear and characters) starts open to the players
// when made active; the GM's (monsters, the GM's guide) starts closed, and
// the GM may open it.
const ADVENTURE = /\badventures?\b|\bmodules?\b|one-shot|scenario|encounters?\b|campaign\b/i;
function isAdventure(info) {
  const words = `${info.title} ${info.category}`;
  if (/player'?s'? (guide|handbook)/i.test(words)) return false;
  // By its name, or by what it holds: a module with story entries is an adventure, whatever it is called.
  return ADVENTURE.test(words) || Boolean(info.hasStory);
}
const GM_ONLY = /monster|bestiary|creature|codex|keeper|dungeon ?master|\bdm\b|\bgm\b|game ?master|\badventures?\b|module|encounter|scenario|campaign|one-shot|treasure|developer/i;
const PLAYERS = /player|handbook|adventurer|backpack|common room|character|pregen/i;
function forPlayers(info) {
  const words = `${info.title} ${info.category}`;
  const guide = /player'?s'? (guide|handbook|reference|core)/i.test(words);
  return guide || (PLAYERS.test(words) && !GM_ONLY.test(words));
}

function elements(node) {
  const out = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.nodeType === 1) out.push(child);
  return out;
}

function parse(text) {
  const doc = new DOMParser({ errorHandler: { warning: () => undefined, error: () => undefined, fatalError: () => undefined } }).parseFromString(text.replace(/^﻿/, ""), "text/xml");
  return doc?.documentElement ?? null;
}

// What a module is, from its definition.xml (and whether it has a book); a
// Kraken pack, from its own description.
const DESCRIBED = 2;
function describe(file) {
  if (packs.isPack(file)) {
    const manifest = packs.readManifest(file);
    return {
      id: path.basename(file).slice(0, -packs.EXTENSION.length),
      name: String(manifest.name ?? ""),
      title: String(manifest.title || manifest.name || ""),
      category: String(manifest.category || "Other"),
      ruleset: String(manifest.from?.ruleset ?? ""),
      kraken: String(manifest.ruleset || "Any"),
      author: String(manifest.author ?? ""),
      hasBook: Boolean(manifest.hasBook),
      hasStory: manifest.hasStory !== undefined ? Boolean(manifest.hasStory) : packHasStory(file),
      cover: String(manifest.cover ?? ""),
      pack: true,
    };
  }
  const stat = fs.statSync(file);
  let get;
  if (stat.isDirectory()) {
    get = (name) => {
      const at = path.join(file, name);
      return fs.existsSync(at) ? fs.readFileSync(at) : null;
    };
  } else {
    const zip = unzipSync(new Uint8Array(fs.readFileSync(file)), { filter: (entry) => /^(definition|db|client)\.xml$|^thumbnail\.(png|jpg|webp)$/i.test(entry.name) });
    get = (name) => zip[name] ?? null;
  }
  const definition = get("definition.xml");
  if (!definition) return null;
  const root = parse(strFromU8(definition));
  if (!root) return null;
  const field = (tag) => (elements(root).find((node) => node.tagName === tag)?.textContent ?? "").trim();
  const name = field("name") || path.basename(file, ".mod");
  const hasBook = ["db.xml", "client.xml"].some((part) => {
    const bytes = get(part);
    return bytes ? strFromU8(bytes).includes("<refmanualindex") : false;
  });
  // Story entries (FG's encounter records): the module is an adventure, whatever its name.
  const hasStory = ["db.xml", "client.xml"].some((part) => {
    const bytes = get(part);
    return bytes ? /<encounter[\s>]/.test(strFromU8(bytes)) : false;
  });
  const cover = ["thumbnail.png", "thumbnail.jpg", "thumbnail.webp"].find((item) => get(item)) ?? "";
  return {
    id: path.basename(file).replace(/\.mod$/i, ""),
    name,
    title: field("displayname") || name,
    category: field("category") || "Other",
    ruleset: field("ruleset"),
    author: field("author"),
    hasBook,
    hasStory,
    cover,
  };
}
// A pack made before packs said so: whether its records hold story entries.
function packHasStory(file) {
  try {
    return packs.readPack(file).records.some((record) => record.type === "encounter");
  } catch {
    return false;
  }
}

// FG's formatted text, as HTML Kraken shows: only these tags, text escaped,
// and links turned into Kraken's own (a page, a picture, or plain text).
const TAGS = { p: "p", b: "b", strong: "b", i: "i", em: "i", u: "u", h: "h3", list: "ul", li: "li", table: "table", tr: "tr", td: "td", th: "th", frame: "blockquote", linklist: "ul", sup: "sup", sub: "sub" };
const escape = (text) => String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

// A book's text that carries a superscript, subscript or line break as
// typed text ("Quarterstaff<sup>2</sup>", escaped in the module): shown as
// one, as the book meant (a fixed few, so nothing else gets through).
const typeset = (escaped) => escaped.replace(/&lt;(\/?)(sup|sub)&gt;/gi, (_, close, tag) => `<${close}${tag.toLowerCase()}>`).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
function toHtml(formatted, resolve) {
  const root = parse(`<root>${formatted ?? ""}</root>`);
  if (!root) return `<p>${escape(formatted ?? "")}</p>`;
  const walk = (node) => {
    let out = "";
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3 || child.nodeType === 4) out += typeset(escape(child.nodeValue));
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === "br") {
        out += "<br>";
        continue;
      }
      if (tag === "link") {
        const linkClass = child.getAttribute("class") || "";
        const recordname = child.getAttribute("recordname") || "";
        const text = walk(child) || "Link";
        // FG's sound links (Syrinscape's: ss|id|mood or element|type|name): a
        // sound of Kraken's own plays from them (matched by kind and name, or
        // the one the GM drops on it); FG's "Sound: Context" has no use here.
        if (linkClass === "soundplay") {
          const [, , type = "", subtype = "", ...name] = recordname.split("|");
          const kind = type === "mood" ? "ambience" : subtype === "music" ? "music" : type === "oneshot" ? "oneshots" : "sfx";
          out += `<a class="book-link sound" data-sound-key="${escape(recordname || text)}" data-sound-kind="${kind}" data-sound-name="${escape(name.join("|") || text)}">${text}</a>`;
          continue;
        }
        // A web link (FG's url class): the browser opens it (http and https only).
        if (linkClass === "url") {
          if (/^https?:\/\//i.test(recordname)) out += `<a class="book-link url" href="${escape(recordname)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
          else out += `<span class="book-link dead" data-kind="url">${text}</span>`;
          continue;
        }
        if (linkClass === "sound_context") {
          out += `<span class="book-link dead sound-context">${text}</span>`;
          continue;
        }
        const target = resolve(linkClass, recordname);
        if (target?.page) out += `<a class="book-link" data-book="${escape(target.book)}" data-page="${escape(target.page)}">${text}</a>`;
        else if (target?.file) out += `<a class="book-link picture" data-book="${escape(target.book)}" data-file="${escape(target.file)}" data-name="${escape(target.name)}">${text}</a>`;
        else if (target?.record) out += `<a class="book-link record" data-book="${escape(target.book)}" data-record="${escape(target.record)}" data-kind="${escape(linkClass)}" data-name="${escape(target.name)}">${text}</a>`;
        else out += `<span class="book-link dead" data-kind="${escape(linkClass)}">${text}</span>`;
        continue;
      }
      const html = TAGS[tag];
      if (!html) {
        out += walk(child);
        continue;
      }
      const span = tag === "td" && /^\d+$/.test(child.getAttribute("colspan") || "") ? ` colspan="${child.getAttribute("colspan")}"` : "";
      const className = tag === "frame" ? ' class="frame"' : tag === "linklist" ? ' class="links"' : "";
      const inner = walk(child);
      out += tag === "linklist" ? `<ul${className}>${inner.replace(/(<a [^]*?<\/a>|<span class="book-link dead"[^>]*>[^]*?<\/span>)/g, "<li>$1</li>")}</ul>` : `<${html}${className}${span}>${inner}</${html}>`;
    }
    return out;
  };
  return walk(root);
}

// The first picture file anywhere under an FG image value (its layers).
function bitmapIn(value) {
  if (!value || typeof value !== "object") return "";
  if (typeof value.bitmap === "string" && PICTURES.test(value.bitmap)) return value.bitmap;
  for (const inner of Object.values(value)) {
    const found = bitmapIn(inner);
    if (found) return found;
  }
  return "";
}

const byOrder = (object) => Object.values(object && typeof object === "object" ? object : {}).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

// also: more folders of modules (the books Kraken ships, content/modules).
// packsFolder: the GM's Kraken packs (Documents/Kraken VTT/Packs).
function createBookShelf({ folder, cache = "", also = [], packsFolder = "" }) {
  let known = null;
  let every = [];
  const opened = new Map(); // id -> the read book, the last few

  // The folders' own times: a book copied in or taken out changes them, so
  // the shelf reads again (a pack dropped into the packs folder shows at once).
  const folders = () => [folder, ...also, ...(packsFolder ? [packsFolder] : [])];
  const stamp = () => folders().map((dir) => {
    try {
      return Math.round(fs.statSync(dir).mtimeMs);
    } catch {
      return 0;
    }
  }).join("|");
  let stamped = "";
  function load() {
    if (known) {
      const now = stamp();
      if (now === stamped) return known;
      known = null;
      opened.clear();
    }
    stamped = stamp();
    let saved = {};
    try {
      saved = cache ? JSON.parse(fs.readFileSync(cache, "utf8")) : {};
    } catch {
      /* first time */
    }
    const next = {};
    const entries = [];
    for (const dir of folders()) {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) entries.push({ entry, dir });
      } catch {
        /* a folder not there */
      }
    }
    for (const { entry, dir } of entries) {
      const file = path.join(dir, entry.name);
      if (!(entry.isFile() && /\.(mod|kpack)$/i.test(entry.name)) && !(entry.isDirectory() && fs.existsSync(path.join(file, "definition.xml")))) continue;
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      // A folder module (Kraken's own books) changes inside: its XML files' times say so.
      const inner = entry.isDirectory() ? ["definition.xml", "db.xml", "client.xml"].map((name) => (fs.existsSync(path.join(file, name)) ? Math.round(fs.statSync(path.join(file, name)).mtimeMs) : 0)).join(".") : "";
      // DESCRIBED: what a description holds (a new field reads every book again).
      const key = `${DESCRIBED}|${entry.name}|${stat.size}|${Math.round(stat.mtimeMs)}${inner ? `|${inner}` : ""}`;
      if (saved[key]) {
        next[key] = saved[key];
        continue;
      }
      try {
        const info = describe(file);
        if (info) next[key] = { ...info, file, mtime: stat.mtimeMs };
      } catch {
        /* an unreadable module is left out */
      }
    }
    if (cache) {
      try {
        fs.mkdirSync(path.dirname(cache), { recursive: true });
        fs.writeFileSync(cache, JSON.stringify(next));
      } catch {
        /* the list still works */
      }
    }
    // A book that is both a Kraken pack and an FG module is shown once: the
    // pack, unless the module is newer (the GM changed it since).
    every = Object.values(next);
    const books = new Map();
    for (const info of every) {
      const other = books.get(info.name);
      if (!other) books.set(info.name, info);
      else {
        const [pack, module] = info.pack ? [info, other] : [other, info];
        if (pack.pack && !module.pack) books.set(info.name, packs.preferPack(pack.file, module.file) === pack.file ? pack : module);
      }
    }
    known = new Map([...books.values()].map((info) => [info.id, info]));
    return known;
  }

  // A book by its id (its file), or by its title or FG name, as the GM says it.
  const info = (id) => {
    const wanted = String(id ?? "");
    const all = load();
    return all.get(wanted) ?? [...all.values()].find((item) => item.title === wanted || item.name === wanted) ?? null;
  };
  // FG names a module by its own name (after "@"); Kraken by its file.
  const byName = (name) => [...load().values()].find((item) => item.name === name || item.id === name) ?? null;

  function read(id) {
    const found = info(id);
    if (!found) throw new Error(`No book "${id}".`);
    if (opened.has(found.id)) return opened.get(found.id);
    const module = readModule(found.file);
    const records = new Map(module.records.map((record) => [record.data.fgPath, record]));
    const book = { info: found, module, records };
    opened.set(found.id, book);
    if (opened.size > 3) opened.delete(opened.keys().next().value);
    return book;
  }

  // A record by its FG path: one of its own, or one kept inside another (a
  // 5E book's races in reference.racedata: reference.racedata.dwarf), found
  // under the container's categories too.
  function findRecord(book, fgPath) {
    const own = book.records.get(fgPath);
    if (own) return own;
    const [inner, moduleName = book.info.name] = String(fgPath).split("@");
    const cut = inner.lastIndexOf(".");
    if (cut < 0) return null;
    const container = book.records.get(`${inner.slice(0, cut)}@${moduleName}`);
    const key = inner.slice(cut + 1);
    const data = container?.data;
    if (!data || typeof data !== "object") return null;
    const groups = [data, ...[].concat(data.category ?? []).flatMap((group) => (group && typeof group === "object" ? [group] : []))];
    for (const group of groups) {
      const child = group[key];
      const title = child && typeof child === "object" ? child.name ?? child.description ?? child.title : null;
      if (typeof title === "string" && title.trim()) {
        const kind = inner.slice(0, cut).split(".").pop().replace(/data$|lists?$/, "") || container.type;
        return { id: `${container.id}:${key}`, type: kind, name: title.trim(), data: { ...child, fgPath: `${inner}@${moduleName}` } };
      }
    }
    return null;
  }
  // A link's target: a page of this book or another, or a picture.
  function resolver(book) {
    return (linkClass, recordname) => {
      const [inner, moduleName] = String(recordname).split("@");
      const other = moduleName ? byName(moduleName) : book.info;
      if (!other) return null;
      const page = /^reference\.refmanualdata\.([^.]+)$/.exec(inner);
      if (page) return { book: other.id, page: page[1] };
      if (/^image\./.test(inner) || linkClass === "imagewindow") {
        const target = other.id === book.info.id ? book : (() => {
          try {
            return read(other.id);
          } catch {
            return null;
          }
        })();
        const record = target?.records.get(`${inner}@${other.name}`);
        const file = bitmapIn(record?.data?.image);
        return file ? { book: other.id, file, name: record.name } : null;
      }
      // Any other record the book holds (a creature, spell, item, class, encounter, table): opened as FG opens it.
      const target = other.id === book.info.id ? book : (() => {
        try {
          return read(other.id);
        } catch {
          return null;
        }
      })();
      const record = target ? findRecord(target, `${inner}@${other.name}`) : null;
      return record ? { book: other.id, record: record.data.fgPath, name: record.name } : null;
    };
  }
  // One record of a book, by its FG path (a link's target): its name, type and fields.
  function bookRecord(id, fgPath) {
    const book = read(id);
    const record = findRecord(book, String(fgPath ?? ""));
    if (!record) return null;
    return { id: record.data.fgPath, type: record.type, name: record.name, source: book.info.title, data: record.data };
  }

  function publicInfo(id) {
    const found = info(id);
    if (!found) return null;
    const { file, playerBook, mtime, ...rest } = found;
    return { ...rest, adventure: isAdventure(rest), forPlayers: !isAdventure(rest) && forPlayers(rest) };
  }

  return {
    folder,
    // Every module, as FG's Modules window: by category, with its cover.
    list: () => [...load().values()].map(({ file, playerBook, mtime, ...rest }) => ({ ...rest, adventure: isAdventure(rest), forPlayers: !isAdventure(rest) && forPlayers(rest) })).sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)),
    info: publicInfo,
    // Where a module is on this computer (to load its records).
    file: (id) => info(id)?.file ?? null,
    // Every book file found, packs and FG modules alike, before the two are
    // put together (for the Packs list: which modules have a pack).
    files: () => {
      load();
      return every.map((item) => ({ ...item }));
    },
    refresh() {
      known = null;
      opened.clear();
    },
    // A book's cover: kept on disk once read (beside the shelf's list), so the
    // Books window never opens every module again to show them.
    cover(id) {
      const found = info(id);
      if (!found?.cover) return null;
      const mime = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" }[path.extname(found.cover).toLowerCase()];
      let kept = "";
      if (cache && mime) {
        try {
          const stat = fs.statSync(found.file);
          const name = require("crypto").createHash("sha1").update(`${found.file}|${stat.size}|${Math.round(stat.mtimeMs)}|${found.cover}`).digest("hex");
          kept = path.join(path.dirname(cache), "book-covers", `${name}${path.extname(found.cover).toLowerCase()}`);
          if (fs.existsSync(kept)) return { bytes: fs.readFileSync(kept), mime };
        } catch {
          kept = "";
        }
      }
      const picture = modulePicture(found.cover, found.file);
      if (picture && kept) {
        try {
          fs.mkdirSync(path.dirname(kept), { recursive: true });
          fs.writeFileSync(kept, picture.bytes);
        } catch {
          /* read from the module next time */
        }
      }
      return picture;
    },
    // The book's contents: chapters, their sections, and the pages in each.
    contents(id) {
      const book = read(id);
      const index = [...book.records.values()].find((record) => record.type === "refindex" && record.data.fgPath.startsWith("reference.refmanualindex@"));
      const chapters = byOrder(index?.data?.chapters).map((chapter) => ({
        name: String(chapter.name ?? ""),
        sections: byOrder(chapter.subchapters).map((section) => ({
          name: String(section.name ?? ""),
          pages: byOrder(section.refpages)
            .map((page) => ({ id: /refmanualdata\.([^.@]+)/.exec(page.listlink?.recordname ?? "")?.[1] ?? "", name: String(page.name ?? ""), keywords: String(page.keywords ?? "") }))
            .filter((page) => page.id),
        })),
      }));
      const pictures = [...book.records.values()]
        .filter((record) => record.type === "image")
        .map((record) => ({ name: record.name, category: record.data.fgCategory ?? "", file: bitmapIn(record.data.image) }))
        .filter((item) => item.file);
      // Every picture file the book holds (FG's Assets: an art pack's pictures too, record or not).
      const assets = (book.module.images ?? []).filter((name) => PICTURES.test(name));
      return { ...publicInfo(id), chapters, pictures, assets };
    },
    // One page: its blocks, text as safe HTML, pictures by file.
    page(id, pageId) {
      const book = read(id);
      const record = book.records.get(`reference.refmanualdata.${pageId}@${book.info.name}`);
      if (!record) throw new Error(`No page "${pageId}" in ${book.info.title}.`);
      const resolve = resolver(book);
      const blocks = [];
      const data = record.data;
      if (typeof data.text === "string") blocks.push({ kind: "text", html: toHtml(data.text, resolve) });
      for (const block of byOrder(data.blocks)) {
        const file = bitmapIn(block.image) || (typeof block.picture === "string" ? block.picture : "");
        if (file) {
          const link = block.imagelink?.recordname ? resolve("imagewindow", block.imagelink.recordname) : null;
          blocks.push({ kind: "picture", file, caption: String(block.caption ?? ""), align: String(block.align ?? "center"), scale: Number(block.scale) || 100, name: link?.name ?? String(block.caption ?? "") });
        }
        for (const key of ["text", "text2"]) if (typeof block[key] === "string" && block[key].trim()) blocks.push({ kind: "text", html: toHtml(block[key], resolve), frame: String(block.frame ?? "") });
      }
      return { book: book.info.id, id: pageId, name: record.name, blocks };
    },
    record: bookRecord,
    // A picture from a book (a page's, or one of its maps).
    picture(id, file) {
      const found = info(id);
      return found && PICTURES.test(String(file)) ? modulePicture(String(file), found.file) : null;
    },
  };
}

module.exports = { createBookShelf, toHtml, fitsRuleset, forPlayers, isAdventure, describe };
