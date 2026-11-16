// Builds the user wiki (docs/wiki/*.md) into a styled static site in site/ for GitHub
// Pages: one page per file, a sidebar in the order index.md links them (the current page
// marked), screenshots copied from docs/screenshots, links between pages as .html.
// Light or dark follows the reader's system. node scripts/build-wiki.mjs [outDir]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

// The repository (WIKI_ROOT when the script runs from elsewhere, as on GitHub's builder).
const root = path.resolve(process.env.WIKI_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const source = path.join(root, "docs", "wiki");
const out = path.resolve(root, process.argv[2] ?? "site");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const REPO = "https://github.com/krakenunbound/kraken-vtt";

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (text) => String(text).toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const files = fs.readdirSync(source).filter((name) => name.endsWith(".md"));
const pages = new Map(
  files.map((name) => {
    const text = fs.readFileSync(path.join(source, name), "utf8");
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? name.replace(/\.md$/, "");
    return [name, { name, text, title, html: name.replace(/\.md$/, ".html") }];
  }),
);
// The sidebar, in reading order: getting started, the GM's table, play, the rest; then any page not named here.
const ORDER = [
  "index.md", "quickstart.md", "tutorials.md", "installing-and-updates.md", "players-joining.md", "hosting-and-inviting.md", "campaigns-and-backups.md",
  "maps-and-scenes.md", "map-studio.md", "tokens-vision-and-lighting.md", "combat-tracker.md", "targeting-and-effects.md", "dice-and-chat.md",
  "character-sheets-and-wizards.md", "games.md", "records-books-and-packs.md", "story-notes-and-handouts.md", "bookkeeping-and-rest.md",
  "sound-and-music.md", "settings.md", "keyboard-and-mouse.md", "ai-agent-tools.md", "troubleshooting-and-faq.md", "release-notes.md",
];
const nav = [...new Set([...ORDER, ...[...pages.keys()].sort()])].filter((name) => pages.has(name));

const shots = new Set();
marked.use({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const id = slug(text);
      return depth === 1 ? `<h1>${text}</h1>\n` : `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      let target = href;
      const external = /^https?:/.test(href);
      if (!external) target = href.replace(/^\.\//, "").replace(/\.md(#|$)/, ".html$1");
      return `<a href="${escape(target)}"${title ? ` title="${escape(title)}"` : ""}${external ? ' rel="noopener" target="_blank"' : ""}>${text}</a>`;
    },
    image({ href, title, text }) {
      const file = path.basename(href);
      if (/screenshots\//.test(href)) shots.add(file);
      return `<figure><img src="screenshots/${escape(file)}" alt="${escape(text)}" loading="lazy" decoding="async">${text ? `<figcaption>${escape(text)}</figcaption>` : ""}</figure>`;
    },
  },
});

const CSS = `
:root {
  color-scheme: light dark;
  --sea: light-dark(#0b6f73, #3fd0c8);
  --sea-deep: light-dark(#06585e, #0a767a);
  --brass: light-dark(#8a5a12, #d6aa5c);
  --ink: light-dark(#1d2027, #e7e3d8);
  --muted: light-dark(#5b6170, #a6a397);
  --page: light-dark(#f6f3ec, #12151b);
  --panel: light-dark(#ffffff, #1a1e26);
  --edge: light-dark(#ddd6c6, #2c313c);
  --code: light-dark(#efe9dc, #232833);
  accent-color: var(--sea);
  scrollbar-color: light-dark(#9a9384, #4a505c) transparent;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 16px/1.65 system-ui, "Segoe UI", Roboto, sans-serif; }
a { color: var(--sea); text-underline-offset: 2px; }
a:hover { color: var(--brass); }
.skip { position: absolute; left: 12px; top: -48px; padding: 8px 12px; background: var(--sea-deep); color: #fff; border-radius: 6px; z-index: 10; }
.skip:focus { top: 12px; }
header.top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 14px; padding: 10px 22px; background: linear-gradient(90deg, #0b141a, #0e2a2e); color: #e9fbfa; border-bottom: 2px solid #d6aa5c; }
header.top .brand { display: flex; align-items: baseline; gap: 8px; color: inherit; text-decoration: none; font-family: Georgia, "Times New Roman", serif; font-size: 1.35rem; letter-spacing: 0.12em; text-transform: uppercase; }
header.top .brand small { font-family: system-ui, sans-serif; font-size: 0.7rem; letter-spacing: 0.08em; color: #d6aa5c; border: 1px solid #d6aa5c; border-radius: 999px; padding: 0 7px; }
header.top nav { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
header.top nav a { color: #e9fbfa; text-decoration: none; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 10px; border: 1px solid rgba(64, 200, 196, 0.55); border-radius: 6px; background: rgba(10, 118, 122, 0.55); }
header.top nav a:hover { background: rgba(16, 140, 144, 0.9); border-color: #d6aa5c; }
.layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); max-width: 1240px; margin: 0 auto; }
aside.side { position: sticky; top: 58px; align-self: start; max-height: calc(100dvh - 58px); overflow: auto; padding: 22px 14px 40px 22px; border-right: 1px solid var(--edge); }
aside.side ol { list-style: none; margin: 0; padding: 0; }
aside.side a { display: block; padding: 5px 10px; border-radius: 6px; color: var(--ink); text-decoration: none; font-size: 0.92rem; }
aside.side a:hover { background: color-mix(in srgb, var(--sea) 14%, transparent); }
aside.side a[aria-current="page"] { background: color-mix(in srgb, var(--sea) 22%, transparent); color: var(--sea); font-weight: 700; box-shadow: inset 3px 0 0 var(--brass); }
main { padding: 30px 44px 80px; min-width: 0; }
main h1 { font-family: Georgia, "Times New Roman", serif; font-size: 2.2rem; line-height: 1.2; margin: 0 0 18px; color: var(--ink); border-bottom: 2px solid var(--brass); padding-bottom: 10px; }
main h2 { font-family: Georgia, serif; font-size: 1.5rem; margin: 2.2em 0 0.5em; color: var(--sea); }
main h3 { font-size: 1.15rem; margin: 1.8em 0 0.4em; }
main h2, main h3 { scroll-margin-top: 70px; position: relative; }
.anchor { position: absolute; left: -1.1em; opacity: 0; text-decoration: none; color: var(--muted); }
h2:hover .anchor, h3:hover .anchor { opacity: 1; }
main p, main li { max-width: 74ch; }
main li + li { margin-top: 0.25em; }
code { font: 0.88em/1.4 ui-monospace, "Cascadia Code", Consolas, monospace; background: var(--code); padding: 0.1em 0.35em; border-radius: 4px; }
pre { background: var(--code); padding: 14px 16px; border-radius: 8px; overflow: auto; border: 1px solid var(--edge); }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: 1em 0; width: 100%; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--edge); padding: 7px 10px; text-align: left; vertical-align: top; }
th { background: color-mix(in srgb, var(--sea) 14%, var(--panel)); }
tr:nth-child(even) td { background: color-mix(in srgb, var(--edge) 25%, transparent); }
blockquote { margin: 1em 0; padding: 10px 16px; border-left: 4px solid var(--brass); background: color-mix(in srgb, var(--brass) 10%, transparent); border-radius: 0 8px 8px 0; }
figure { margin: 1.4em 0; }
figure img { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--edge); box-shadow: 0 6px 22px rgba(0, 0, 0, 0.25); }
figcaption { font-size: 0.85rem; color: var(--muted); margin-top: 6px; }
.pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 50px; padding-top: 18px; border-top: 1px solid var(--edge); }
.pager a { display: block; padding: 10px 14px; border: 1px solid var(--edge); border-radius: 8px; text-decoration: none; background: var(--panel); max-width: 48%; }
.pager small { display: block; color: var(--muted); }
footer.foot { text-align: center; color: var(--muted); font-size: 0.85rem; padding: 26px; border-top: 1px solid var(--edge); }
@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
  aside.side { position: static; max-height: none; border-right: 0; border-bottom: 1px solid var(--edge); padding: 14px 16px; }
  aside.side ol { display: flex; flex-wrap: wrap; gap: 4px; }
  aside.side a { padding: 4px 9px; border: 1px solid var(--edge); font-size: 0.85rem; }
  main { padding: 22px 16px 60px; }
  header.top { flex-wrap: wrap; padding: 10px 16px; }
  header.top nav { margin-left: 0; }
}
`;

function pageHtml(page, body, at) {
  const prev = nav[at - 1] ? pages.get(nav[at - 1]) : null;
  const next = nav[at + 1] ? pages.get(nav[at + 1]) : null;
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escape(page.title)}${page.name === "index.md" ? "" : " · Kraken VTT Wiki"}</title>
<meta name="description" content="${escape(plain.slice(page.title.length, page.title.length + 160).trim())}">
<link rel="stylesheet" href="wiki.css">
</head>
<body>
<a class="skip" href="#content">Skip to the page</a>
<header class="top">
  <a class="brand" href="index.html">Kraken <small>VTT wiki · ${escape(version)}</small></a>
  <nav aria-label="Kraken">
    <a href="quickstart.html">Quickstart</a>
    <a href="${REPO}/releases" rel="noopener">Download</a>
    <a href="${REPO}/issues/new" rel="noopener">Report a bug</a>
    <a href="${REPO}" rel="noopener">GitHub</a>
  </nav>
</header>
<div class="layout">
  <aside class="side">
    <nav aria-label="Wiki pages">
      <ol>
${nav.map((name) => `        <li><a href="${pages.get(name).html}"${name === page.name ? ' aria-current="page"' : ""}>${escape(name === "index.md" ? "Home" : pages.get(name).title)}</a></li>`).join("\n")}
      </ol>
    </nav>
  </aside>
  <main id="content">
${body}
    <nav class="pager" aria-label="Previous and next page">
      ${prev ? `<a href="${prev.html}" rel="prev"><small>Previous</small>${escape(prev.name === "index.md" ? "Home" : prev.title)}</a>` : "<span></span>"}
      ${next ? `<a href="${next.html}" rel="next"><small>Next</small>${escape(next.title)}</a>` : "<span></span>"}
    </nav>
  </main>
</div>
<footer class="foot">Kraken VTT · <a href="${REPO}" rel="noopener">source on GitHub</a> · PolyForm Shield licence</footer>
</body>
</html>
`;
}

// Emptied, not removed (a server may be serving it).
fs.mkdirSync(out, { recursive: true });
for (const entry of fs.readdirSync(out)) fs.rmSync(path.join(out, entry), { recursive: true, force: true });
fs.mkdirSync(path.join(out, "screenshots"), { recursive: true });
fs.writeFileSync(path.join(out, "wiki.css"), CSS.trimStart());
nav.forEach((name, at) => {
  const page = pages.get(name);
  fs.writeFileSync(path.join(out, page.html), pageHtml(page, marked.parse(page.text), at));
});
const missing = [];
for (const file of shots) {
  const from = path.join(root, "docs", "screenshots", file);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(out, "screenshots", file));
  else missing.push(file);
}
fs.writeFileSync(path.join(out, ".nojekyll"), "");
console.log(`wiki: ${nav.length} pages, ${shots.size} screenshots${missing.length ? `, missing: ${missing.join(", ")}` : ""} -> ${out}`);
if (missing.length) process.exitCode = 1;
