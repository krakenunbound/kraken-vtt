const fs = require("fs");
const path = require("path");
const { unzipSync, strFromU8 } = require("fflate");
const { DOMParser } = require("@xmldom/xmldom");
const { readModule, modulePicture } = require("./importers/fgModule.cjs");

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
// campaign; Worldbuilding (no rules) takes only those, never another game's.
const FG_RULESETS = {
  "Castles & Crusades": ["SiegeCore", "CnCRPG"],
  // FG's 5E ruleset's modules (the SRD 5.2.1's player book, bestiary, magic items).
  "D&D 5E": ["5E"],
  Worldbuilding: [],
};
const ANY = new Set(["", "any", "corerpg"]);
function fitsRuleset(info, ruleset) {
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
  return ADVENTURE.test(words) && !/player'?s'? (guide|handbook)/i.test(words);
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

// What a module is, from its definition.xml (and whether it has a book).
function describe(file) {
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
  const cover = ["thumbnail.png", "thumbnail.jpg", "thumbnail.webp"].find((item) => get(item)) ?? "";
  return {
    id: path.basename(file).replace(/\.mod$/i, ""),
    name,
    title: field("displayname") || name,
    category: field("category") || "Other",
    ruleset: field("ruleset"),
    author: field("author"),
    hasBook,
    cover,
  };
}

// FG's formatted text, as HTML Kraken shows: only these tags, text escaped,
// and links turned into Kraken's own (a page, a picture, or plain text).
const TAGS = { p: "p", b: "b", strong: "b", i: "i", em: "i", u: "u", h: "h3", list: "ul", li: "li", table: "table", tr: "tr", td: "td", th: "th", frame: "blockquote", linklist: "ul" };
const escape = (text) => String(text).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

function toHtml(formatted, resolve) {
  const root = parse(`<root>${formatted ?? ""}</root>`);
  if (!root) return `<p>${escape(formatted ?? "")}</p>`;
  const walk = (node) => {
    let out = "";
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3 || child.nodeType === 4) out += escape(child.nodeValue);
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
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
        if (linkClass === "sound_context") {
          out += `<span class="book-link dead sound-context">${text}</span>`;
          continue;
        }
        const target = resolve(linkClass, recordname);
        if (target?.page) out += `<a class="book-link" data-book="${escape(target.book)}" data-page="${escape(target.page)}">${text}</a>`;
        else if (target?.file) out += `<a class="book-link picture" data-book="${escape(target.book)}" data-file="${escape(target.file)}" data-name="${escape(target.name)}">${text}</a>`;
        else out += `<span class="book-link dead">${text}</span>`;
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
      out += tag === "linklist" ? `<ul${className}>${inner.replace(/(<a [^]*?<\/a>|<span class="book-link dead">[^]*?<\/span>)/g, "<li>$1</li>")}</ul>` : `<${html}${className}${span}>${inner}</${html}>`;
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

function createBookShelf({ folder, cache = "" }) {
  let known = null;
  const opened = new Map(); // id -> the read book, the last few

  function load() {
    if (known) return known;
    let saved = {};
    try {
      saved = cache ? JSON.parse(fs.readFileSync(cache, "utf8")) : {};
    } catch {
      /* first time */
    }
    const next = {};
    let entries = [];
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (!(entry.isFile() && /\.mod$/i.test(entry.name)) && !(entry.isDirectory() && fs.existsSync(path.join(file, "definition.xml")))) continue;
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      const key = `${entry.name}|${stat.size}|${Math.round(stat.mtimeMs)}`;
      if (saved[key]) {
        next[key] = saved[key];
        continue;
      }
      try {
        const info = describe(file);
        if (info) next[key] = { ...info, file };
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
    known = new Map(Object.values(next).map((info) => [info.id, info]));
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
      return null;
    };
  }

  function publicInfo(id) {
    const found = info(id);
    if (!found) return null;
    const { file, playerBook, ...rest } = found;
    return { ...rest, adventure: isAdventure(rest), forPlayers: !isAdventure(rest) && forPlayers(rest) };
  }

  return {
    folder,
    // Every module, as FG's Modules window: by category, with its cover.
    list: () => [...load().values()].map(({ file, playerBook, ...rest }) => ({ ...rest, adventure: isAdventure(rest), forPlayers: !isAdventure(rest) && forPlayers(rest) })).sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)),
    info: publicInfo,
    // Where a module is on this computer (to load its records).
    file: (id) => info(id)?.file ?? null,
    refresh() {
      known = null;
      opened.clear();
    },
    cover(id) {
      const found = info(id);
      return found?.cover ? modulePicture(found.cover, found.file) : null;
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
      return { ...publicInfo(id), chapters, pictures };
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
    // A picture from a book (a page's, or one of its maps).
    picture(id, file) {
      const found = info(id);
      return found && PICTURES.test(String(file)) ? modulePicture(String(file), found.file) : null;
    },
  };
}

module.exports = { createBookShelf, toHtml, fitsRuleset, forPlayers, isAdventure };
