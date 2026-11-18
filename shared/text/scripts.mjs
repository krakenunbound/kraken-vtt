// The scripts chat languages are written in (FG gives each language a font).
// Each is a real old alphabet (Unicode's, drawn by Google's Noto fonts, OFL,
// bundled as @fontsource packages) used letter for letter: a line in Dwarvish
// is runes, Elvish Georgian's loops, Orc Old Turkic's hard angles: each
// script looks like the people who write it. Those who know the language read
// the script and its translation; the others see the script of its sounds
// (languages.mjs garble), so the words cannot be read back from it.

// id -> the font, the first letter of its Unicode block, how many letters it
// has to spread a..z over, and (Coptic) letters every other code point.
export const SCRIPTS = {
  runic: { name: "Runic", font: "Noto Sans Runic", start: 0x16a0, count: 75 },
  georgian: { name: "Georgian", font: "Noto Serif Georgian", start: 0x10d0, count: 33 },
  ogham: { name: "Ogham", font: "Noto Sans Ogham", start: 0x1681, count: 26, space: "\u1680", open: "\u169b", close: "\u169c" },
  "old-south-arabian": { name: "Old South Arabian", font: "Noto Sans Old South Arabian", start: 0x10a60, count: 29 },
  phoenician: { name: "Phoenician", font: "Noto Sans Phoenician", start: 0x10900, count: 22 },
  "old-hungarian": { name: "Old Hungarian", font: "Noto Sans Old Hungarian", start: 0x10c80, count: 51 },
  gothic: { name: "Gothic", font: "Noto Sans Gothic", start: 0x10330, count: 27 },
  coptic: { name: "Coptic", font: "Noto Sans Coptic", start: 0x2c80, count: 50, even: true },
  "old-italic": { name: "Old Italic", font: "Noto Sans Old Italic", start: 0x10300, count: 31 },
  "old-turkic": { name: "Old Turkic", font: "Noto Sans Old Turkic", start: 0x10c00, count: 73 },
  "old-persian": { name: "Old Persian cuneiform", font: "Noto Sans Old Persian", start: 0x103a0, count: 36 },
};

// Which script a language is written in, by the stem of its name (a game's
// "Elven" is a book's "Elvish"), chosen to fit the people: carved runes for
// dwarves and giants, flowing loops for elves, a tree-script for the fey,
// hard angles for orcs and goblins, clawed letters for dragons, a sacred
// hand for the heavens, wedges for the aberrations' Deep Speech. Common,
// Halfling and the like have none.
const BY_STEM = [
  [/^(dwar|giant|terr|gnom)/, "runic"],
  [/^(elv|elf)/, "georgian"],
  [/^(sylv|druid|fae)/, "ogham"],
  [/^(dracon|lizard)/, "old-south-arabian"],
  [/^infern/, "phoenician"],
  [/^abyss/, "old-hungarian"],
  [/^celest/, "coptic"],
  [/^undercommon/, "gothic"],
  [/^deepspeech/, "old-persian"],
  [/^(aqua|aura|igna|primordi)/, "old-italic"],
  [/^(orc|goblin|hobgoblin|gnoll|kobold|ogre)/, "old-turkic"],
];
export function scriptOf(language) {
  const stem = String(language ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return BY_STEM.find(([pattern]) => pattern.test(stem))?.[1] ?? null;
}

// The text written in a script: each letter a..z (either case) its letter of
// the script; spaces, digits and the rest as they are (Ogham joins its words
// with its own space mark, between its feather marks).
export function writeIn(text, scriptId) {
  const script = SCRIPTS[scriptId];
  if (!script) return String(text ?? "");
  let out = "";
  for (const char of String(text ?? "")) {
    const index = char.toLowerCase().charCodeAt(0) - 97;
    if (char.length === 1 && index >= 0 && index < 26) {
      let offset = Math.floor((index * script.count) / 26);
      if (script.even) offset -= offset % 2;
      out += String.fromCodePoint(script.start + offset);
    } else if (char === " " && script.space) out += script.space;
    else out += char;
  }
  return script.open ? `${script.open}${out}${script.close}` : out;
}
