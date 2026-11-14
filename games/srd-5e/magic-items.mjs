// SRD 5.2.1 Magic Items: the Magic Items chapter (categories, rarity,
// attunement, crafting, sentient items) and every magic item A to Z as an FG
// 5E item record (type, subtype, rarity, attunement, its text), for the GM to
// hand out in parcels and on the party sheet.
import { md } from "../lib/fg.mjs";
import { CATEGORY, MAGIC_ITEMS_BOOK, RULESET, data, frontMatter } from "./common.mjs";

const ITEMS_DATA = data("magic-items");
const reference = data("reference");

export const MAGIC_ITEMS = ITEMS_DATA.map((item) => ({
  name: item.name,
  type: item.type,
  subtype: item.subtype,
  rarity: item.rarity,
  ...(item.attunement ? { attunement: item.attunement } : {}),
  properties: "Magic",
  cost: "",
  description: md(`*${item.line}*\n\n${item.text}`),
  __category: item.type === "Wondrous Item" ? "Wondrous Items" : `${item.type}s`.replace(/ys$/, "ies").replace(/Staffs$/, "Staffs"),
}));

const chapter = reference.find((entry) => entry.name === "Magic Items");

export const MAGIC_ITEMS_SPEC = {
  name: MAGIC_ITEMS_BOOK,
  displayName: MAGIC_ITEMS_BOOK,
  category: CATEGORY,
  ruleset: RULESET,
  author: "Kraken VTT",
  gm: { item: MAGIC_ITEMS },
  reference: [frontMatter(`The SRD 5.2.1's Magic Items chapter and its ${MAGIC_ITEMS.length} magic items, each an item record once the book is active: for parcels, treasure and the party sheet.`), ...(chapter ? [chapter] : [])],
};
