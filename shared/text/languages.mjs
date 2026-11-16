// Chat languages (FG's chat language menu): a line spoken in Orc reads as Orc
// only to those whose characters know it; everyone else sees sounds in its
// place. The GM sees the words and who understood them.

const FANTASY = ["Common", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc", "Abyssal", "Celestial", "Draconic", "Infernal", "Primordial", "Sylvan", "Undercommon"];
// Each game's own list, as its books name them. A game not here starts with
// the GM's list and whatever its characters know.
const BY_GAME = {
  dnd5e: [...FANTASY.slice(0, 11), "Deep Speech", ...FANTASY.slice(11), "Druidic", "Thieves' Cant"],
  dnd35: ["Common", "Dwarven", "Elven", "Giant", "Gnome", "Goblin", "Gnoll", "Halfling", "Orc", "Abyssal", "Aquan", "Auran", "Celestial", "Draconic", "Ignan", "Infernal", "Sylvan", "Terran", "Undercommon", "Druidic"],
  adnd2e: ["Common", "Dwarvish", "Elvish", "Gnomish", "Halfling", "Orcish", "Goblin", "Hobgoblin", "Kobold", "Gnoll", "Ogre", "Giant", "Lizard Man", "Thieves' Cant"],
  cnc: ["Common", "Dwarf", "Elf", "Gnome", "Halfling", "Orc", "Goblin", "Kobold", "Gnoll", "Giant", "Draconic", "Sylvan", "Celestial", "Infernal", "Abyssal"],
  bfrpg: ["Common", "Dwarvish", "Elvish", "Halfling", "Gnomish", "Orcish", "Goblin", "Kobold", "Gnoll", "Ogre", "Lizard Man", "Draconic"],
  cairn: ["Common", "Elvish", "Dwarvish", "Goblin", "Fae", "Old Tongue"],
  mgt2: ["Galanglic", "Vilani", "Zdetl", "Oynprith", "Gvegh", "Trokh", "Anglic"],
};

export function gameLanguages(gameId) {
  return BY_GAME[String(gameId ?? "")] ?? [];
}

// What a character knows: a list, a "Common, Elvish" line, or the sheet's
// language rows (FG's languagelist).
export function knownLanguages(data) {
  const found = [];
  const add = (value) => {
    for (const part of String(value ?? "").split(/[,;\n]/)) {
      const name = part.replace(/\(.*?\)/g, "").trim();
      if (name && name.length <= 40) found.push(name);
    }
  };
  const listed = data?.languages;
  if (Array.isArray(listed)) for (const item of listed) add(typeof item === "string" ? item : item?.name);
  else if (typeof listed === "string") add(listed);
  if (data?.languagelist && typeof data.languagelist === "object") for (const row of Object.values(data.languagelist)) add(row?.name);
  const seen = new Set();
  return found.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Names match whatever their case, and a game's "Elven" is a book's "Elvish".
const STEM = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(ish|ic|en|an)$/, "");
export function sameLanguage(a, b) {
  const x = STEM(a);
  return Boolean(x) && x === STEM(b);
}
export function knows(data, language) {
  return knownLanguages(data).some((name) => sameLanguage(name, language));
}

// The sounds a listener hears instead: each word the same length or near it,
// the same word always the same sounds, each language its own.
const SOUNDS = {
  harsh: ["gra", "uk", "thak", "rok", "zug", "dur", "gol", "kar", "mog", "nar", "ruk", "sha", "tor", "vag", "ug", "ash"],
  soft: ["ae", "lia", "thal", "ren", "sil", "va", "iel", "na", "lor", "ith", "mae", "el", "syl", "ari", "en", "oth"],
  deep: ["khaz", "dum", "bar", "grim", "thor", "dun", "hak", "mor", "zar", "gund", "rak", "bel", "dor", "kar", "ul", "az"],
  other: ["xa", "vor", "ith", "zul", "kre", "nyx", "sa", "tek", "ul", "vra", "sho", "qua", "re", "mi", "to", "ka"],
};
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function soundsOf(language) {
  const key = STEM(language);
  if (/orc|goblin|gnoll|ogre|giant|kobold|hobgoblin|trokh/.test(key)) return SOUNDS.harsh;
  if (/elv|elf|sylv|fae|celest|halfl/.test(key)) return SOUNDS.soft;
  if (/dwar|gnom|terr|undercommon|vilani/.test(key)) return SOUNDS.deep;
  return SOUNDS.other;
}
export function garble(text, language) {
  const sounds = soundsOf(language);
  return String(text ?? "").replace(/[\p{L}\p{N}']+/gu, (word) => {
    let h = hash(`${STEM(language)}:${word.toLowerCase()}`);
    let out = "";
    while (out.length < Math.max(2, word.length - 1)) {
      out += sounds[h % sounds.length];
      h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0;
    }
    out = out.slice(0, word.length + 2);
    return word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase() ? out[0].toUpperCase() + out.slice(1) : out;
  });
}
