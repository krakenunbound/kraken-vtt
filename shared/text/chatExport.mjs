// @ts-check
// A session's chat as a document (the Session Log's Export, kraken_chat_log
// export): Markdown or a standalone HTML page, each line in words: when, who,
// what was said or rolled (the roll's label, dice, what the modifier box
// added, the total), its link, a shared record's name.

/** @typedef {{ from?: string; text?: string; at?: number; kind?: string; to?: string[]; secret?: boolean; self?: boolean; roll?: { label?: string; formula?: string; total?: number | string; result?: string; mods?: { label?: string; value?: number }[] }; link?: { label?: string }; share?: { name?: string } }} LogLine */

const time = (/** @type {number | undefined} */ at) => (at ? new Date(at).toISOString().replace("T", " ").slice(0, 16) : "");
const escapeHtml = (/** @type {string} */ text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escapeMd = (/** @type {string} */ text) => text.replace(/([\\`*_[\]#|<>])/g, "\\$1");

/**
 * One line's words: { who, said } (said already plain).
 * @param {LogLine} line
 */
export function lineWords(line) {
  const who = line.kind === "story" ? "" : String(line.from ?? "");
  const roll = line.roll;
  let said = String(line.text ?? "");
  if (roll) {
    const mods = (roll.mods ?? []).map((mod) => `${mod.value !== undefined ? `${mod.value > 0 ? "+" : ""}${mod.value} ` : ""}${mod.label ?? ""}`.trim()).filter(Boolean);
    said = `${roll.label ? `${roll.label} ` : ""}(${roll.formula ?? ""}${mods.length ? `; ${mods.join(", ")}` : ""}) = ${roll.total ?? ""}${roll.result && !String(roll.label ?? "").includes(String(roll.result)) ? ` ${roll.result}` : ""}`.trim();
  }
  if (line.kind === "emote" && who) said = `${who} ${said}`;
  if (line.to?.length) said = `(to ${line.to.join(", ")}) ${said}`;
  if (line.link?.label && !said.includes(line.link.label)) said = `${said} [${line.link.label}]`.trim();
  if (line.share?.name) said = `${said} (shared: ${line.share.name})`.trim();
  return { who: line.kind === "emote" ? "" : who, said };
}

/**
 * @param {LogLine[]} lines
 * @param {string} title
 */
export function chatToMarkdown(lines, title) {
  const out = [`# ${escapeMd(title)}`, ""];
  for (const line of lines) {
    const { who, said } = lineWords(line);
    out.push(`- \`${time(line.at)}\` ${who ? `**${escapeMd(who)}**: ` : ""}${line.kind === "story" ? `*${escapeMd(said)}*` : escapeMd(said)}`);
  }
  return `${out.join("\n")}\n`;
}

/**
 * @param {LogLine[]} lines
 * @param {string} title
 */
export function chatToHtml(lines, title) {
  const rows = lines
    .map((line) => {
      const { who, said } = lineWords(line);
      const kind = line.roll ? "roll" : line.kind ?? "say";
      return `<li class="${escapeHtml(kind)}"><time>${escapeHtml(time(line.at))}</time> ${who ? `<b>${escapeHtml(who)}</b> ` : ""}<span>${escapeHtml(said)}</span></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; --ink: #1d1b18; --paper: #f7f3ea; --soft: #6b645a; --gold: #9a6b22; }
@media (prefers-color-scheme: dark) { :root { --ink: #ece6da; --paper: #15171b; --soft: #9a9285; --gold: #d2a15a; } }
body { margin: 0 auto; max-width: 52rem; padding: 24px 16px; font: 15px/1.5 Georgia, serif; color: var(--ink); background: var(--paper); }
h1 { font-size: 1.4rem; color: var(--gold); }
ol { list-style: none; padding: 0; }
li { padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--soft) 25%, transparent); }
time { color: var(--soft); font: 12px/1 ui-monospace, monospace; margin-right: 6px; }
li.roll span { color: var(--gold); }
li.story span { font-style: italic; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<ol>
${rows}
</ol>
</body>
</html>
`;
}
