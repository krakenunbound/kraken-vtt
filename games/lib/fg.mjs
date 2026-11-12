// Writes Kraken's own books as Fantasy Grounds module folders (definition.xml,
// db.xml for the GM, client.xml for the players, pictures), so every reader
// Kraken has for FG modules — the Books window, a book's activation, an
// adventure's story, encounters and maps with walls — reads them unchanged.
// The XML is the reverse of Kraken's importer (electron/importers/fgModule.cjs,
// convert): a string is type="string", a number type="number", rich text
// type="formattedtext", a link type="windowreference", an object plain nested
// elements, and an array the same tag repeated (an image's layers and walls).
import fs from "node:fs";
import path from "node:path";

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Rich text (FG's formattedtext): a string of HTML-ish markup, kept as it is.
export const rich = (html) => ({ __rich: balanced(String(html)) });
// Rich text must nest properly: a crossed tag (<b><i></b></i>) makes FG's XML
// swallow every record after it, quietly. The build stops on one instead.
function balanced(html) {
  const open = [];
  for (const match of html.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/gi)) {
    const [, closing, tag, self] = match;
    if (self) continue;
    if (!closing) open.push(tag);
    else if (open.pop() !== tag) throw new Error(`Badly nested <${tag}> in: ${html.slice(Math.max(0, match.index - 80), match.index + 40)}`);
  }
  if (open.length) throw new Error(`Unclosed <${open.join(">, <")}> in: ${html.slice(0, 120)}`);
  return html;
}
// A link to another record (FG's windowreference).
export const link = (cls, recordname) => ({ __link: { class: cls, recordname } });
// Paragraphs from plain lines: blank-line separated, **bold** and *italic*,
// lines starting "- " as a list, "### " a heading.
export function md(text) {
  const blocks = String(text).trim().split(/\n\s*\n/);
  const inline = (line) =>
    escape(line)
      .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>")
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\*(.+?)\*/g, "<i>$1</i>");
  return rich(
    blocks
      .map((block) => {
        const lines = block.split("\n").map((line) => line.trim());
        if (lines.every((line) => line.startsWith("- "))) return `<list>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join("")}</list>`;
        if (lines.every((line) => /^\d+\. /.test(line))) return `<list>${lines.map((line) => `<li>${inline(line)}</li>`).join("")}</list>`;
        if (lines[0].startsWith("### ")) return `<h>${inline(lines[0].slice(4))}</h>${lines.length > 1 ? `<p>${lines.slice(1).map(inline).join(" ")}</p>` : ""}`;
        if (lines.every((line) => line.startsWith("|"))) {
          const rows = lines.filter((line) => !/^\|\s*-/.test(line)).map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
          return `<table>${rows.map((row, index) => `<tr${index === 0 ? ' decoration="underline"' : ""}>${row.map((cell) => `<td>${index === 0 ? `<b>${inline(cell)}</b>` : inline(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
        }
        return `<p>${lines.map(inline).join(" ")}</p>`;
      })
      .join(""),
  );
}

function element(tag, value, indent) {
  const pad = "\t".repeat(indent);
  if (value === undefined || value === null) return "";
  if (value && typeof value === "object" && "__rich" in value) return `${pad}<${tag} type="formattedtext">${value.__rich}</${tag}>\n`;
  if (value && typeof value === "object" && "__link" in value) return `${pad}<${tag} type="windowreference"><class>${escape(value.__link.class)}</class><recordname>${escape(value.__link.recordname)}</recordname></${tag}>\n`;
  if (Array.isArray(value)) return value.map((item) => element(tag, item, indent)).join("");
  if (typeof value === "number") return `${pad}<${tag} type="number">${value}</${tag}>\n`;
  if (typeof value === "boolean") return `${pad}<${tag} type="number">${value ? 1 : 0}</${tag}>\n`;
  if (typeof value === "object") return `${pad}<${tag}>\n${Object.entries(value).map(([key, inner]) => element(key, inner, indent + 1)).join("")}${pad}</${tag}>\n`;
  return `${pad}<${tag} type="string">${escape(value)}</${tag}>\n`;
}

// Numbered children, as FG keeps lists (id-00001, id-00002...).
export const ids = (list) => Object.fromEntries(list.map((item, index) => [`id-${String(index + 1).padStart(5, "0")}`, item]));
export const slug = (text) => { const tag = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40) || "x"; return /^[0-9]/.test(tag) ? `e${tag}` : tag; };

// A reference manual (FG's book): chapters, each with sections of pages.
// chapters: [{ name, sections: [{ name, pages: [{ name, text (md or rich), keywords?, blocks? }] }] }]
function referenceManual(moduleName, chapters) {
  const data = {};
  const index = { chapters: {} };
  let page = 0;
  chapters.forEach((chapter, c) => {
    const subchapters = {};
    chapter.sections.forEach((section, s) => {
      const refpages = {};
      section.pages.forEach((entry, p) => {
        const id = `p${String(++page).padStart(4, "0")}`;
        data[id] = { name: entry.name, ...(entry.blocks ? { blocks: entry.blocks } : { text: typeof entry.text === "string" ? md(entry.text) : entry.text }) };
        refpages[`page_${String(p).padStart(3, "0")}`] = { name: entry.name, keywords: entry.keywords ?? "", listlink: link("reference_manualtextwide", `reference.refmanualdata.${id}@${moduleName}`) };
      });
      subchapters[`sub_${String(s).padStart(3, "0")}`] = { name: section.name, refpages };
    });
    index.chapters[`chapter_${String(c).padStart(3, "0")}`] = { name: chapter.name, subchapters };
  });
  return { refmanualindex: index, refmanualdata: data };
}

// An image record (a map or a handout): picture path inside the module, its
// grid, and walls/doors given in picture pixels (top-left origin, y down), as
// [{ points: [x1, y1, x2, y2, ...], door?, secret?, closed? }].
export function imageRecord({ name, file, width, height, grid = 70, walls = [], category = "" }) {
  // FG's points: from the picture's centre, y up.
  const fg = (points) => {
    const out = [];
    for (let i = 0; i + 1 < points.length; i += 2) out.push(Math.round((points[i] - width / 2) * 10) / 10, Math.round((height / 2 - points[i + 1]) * 10) / 10);
    return out.join(",");
  };
  const occluder = walls.map((wall, index) => ({
    id: String(index),
    points: fg(wall.points),
    ...(wall.door ? { toggleable: true } : {}),
    ...(wall.closed ? { closed: true } : {}),
  }));
  return {
    name,
    ...(category ? { __category: category } : {}),
    image: {
      grid: grid ? "on" : "off",
      gridsize: `${grid || 70},${grid || 70}`,
      gridoffset: "0,0",
      layers: {
        layer: [
          {
            name,
            id: "0",
            parentid: "-1",
            type: "image",
            bitmap: file,
            matrix: "1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1",
            ...(occluder.length ? { occluders: { occluder } } : {}),
          },
        ],
      },
    },
  };
}

// A creature's art: its portrait and its map token, inside its own module
// (named with the module, so a copy of the record in a campaign or an
// adventure's encounter still finds them).
export const artKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const creatureArt = (name, moduleName) => ({ token: `tokens/${artKey(name)}.webp@${moduleName}`, picture: `images/npc/${artKey(name)}.webp@${moduleName}` });
export const creaturePictures = (records, artFolder) =>
  Object.fromEntries(records.flatMap((record) => [[`tokens/${artKey(record.name)}.webp`, `${artFolder}/tokens/${artKey(record.name)}.webp`], [`images/npc/${artKey(record.name)}.webp`, `${artFolder}/npc/${artKey(record.name)}.webp`]]));
// A page with pictures above its text (FG's image blocks, then a text block):
// files are paths inside the module ("images/npc/grave-hound.webp"), caption
// under each. Several pictures sit side by side.
export function pictured(text, files, caption = "") {
  const list = [].concat(files);
  const captions = [].concat(caption);
  const blocks = {};
  list.forEach((file, index) => {
    const name = captions[index] ?? captions[0] ?? "";
    blocks[`id-${String(index + 1).padStart(5, "0")}`] = {
      blocktype: "image",
      order: index + 1,
      align: "center",
      caption: name,
      image: { layers: { layer: [{ name: name || "Picture", id: "0", parentid: "-1", type: "image", bitmap: file }] } },
    };
  });
  blocks[`id-${String(list.length + 1).padStart(5, "0")}`] = { blocktype: "singletext", order: list.length + 1, text: typeof text === "string" ? md(text) : text };
  return blocks;
}

// A picture to show the players (no grid).
export const handout = (name, file, category = "Handouts") => imageRecord({ name, file: `images/${file}.webp`, width: 0, height: 0, grid: 0, category });

// Writes one module. spec: { name, displayName, category, ruleset, author,
// gm: { type: [records] }, players: { type: [records] }, reference: chapters
// (in the players' file when players is true), pictures: { "images/x.webp":
// source path }, thumbnail: source path }. A record may carry __category (its
// FG category) and __tag (its element name; else a slug of its name).
export function writeModule(outDir, spec) {
  const folder = path.join(outDir, spec.name);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.mkdirSync(folder, { recursive: true });
  const definition = `<?xml version="1.0" encoding="UTF-8"?>\n<root version="4.6" release="1">\n${element("name", spec.name, 1)}${element("displayname", spec.displayName ?? spec.name, 1)}${element("category", spec.category ?? "", 1)}${element("author", spec.author ?? "Kraken VTT", 1)}${element("ruleset", spec.ruleset, 1)}</root>\n`;
  fs.writeFileSync(path.join(folder, "definition.xml"), definition);
  const body = (records, reference) => {
    let out = "";
    for (const [type, list] of Object.entries(records ?? {})) {
      const byCategory = new Map();
      const used = new Set();
      for (const record of list) {
        const { __category = "", __tag, ...fields } = record;
        let tag = __tag ?? slug(fields.name ?? type);
        while (used.has(tag)) tag = `${tag}x`;
        used.add(tag);
        if (!byCategory.has(__category)) byCategory.set(__category, []);
        byCategory.get(__category).push(element(tag, fields, 3));
      }
      out += `\t<${type}>\n`;
      for (const [category, items] of byCategory) out += category ? `\t\t<category name="${escape(category)}">\n${items.join("")}\t\t</category>\n` : items.map((item) => item.replace(/^\t/gm, "")).join("");
      out += `\t</${type}>\n`;
    }
    if (reference) out += element("reference", referenceManual(spec.name, reference), 1);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<root version="4.6" release="1">\n${out}</root>\n`;
  };
  const reference = spec.reference ?? null;
  if (spec.gm || (reference && !spec.playersBook)) fs.writeFileSync(path.join(folder, "db.xml"), body(spec.gm, spec.playersBook ? null : reference));
  if (spec.players || (reference && spec.playersBook)) fs.writeFileSync(path.join(folder, "client.xml"), body(spec.players, spec.playersBook ? reference : null));
  for (const [inside, source] of Object.entries(spec.pictures ?? {})) {
    const target = path.join(folder, inside);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  if (spec.thumbnail) fs.copyFileSync(spec.thumbnail, path.join(folder, `thumbnail${path.extname(spec.thumbnail)}`));
  return folder;
}
