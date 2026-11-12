// Starting money and the shop, for every ruleset's character wizard: prices
// read as the books write them ("15 gp", "5 sp", "20 gc", "300 cr", "Cr500"),
// a purse in the smallest coin (copper; a credit is a credit), what is left
// as coins in the game's own money. Plain functions, the host's and the
// wizard's.

// A coin's worth in copper; gold crowns (Descending Darkness) are gold pieces.
export const COIN = { pp: 1000, gp: 100, gc: 100, ep: 50, sp: 10, cp: 1 };

// "15 gp" -> 1500 (copper); "300 cr" / "Cr300" / "MCr 1" -> 300 credits. null: no price.
export function priceOf(text, credits = false) {
  const source = String(text ?? "").toLowerCase().replace(/,/g, "").trim();
  if (!source) return null;
  if (credits) {
    const mcr = /^mcr\s*([\d.]+)/.exec(source) ?? /([\d.]+)\s*mcr$/.exec(source);
    if (mcr) return Math.round(Number(mcr[1]) * 1e6);
    const kcr = /^kcr\s*([\d.]+)/.exec(source) ?? /([\d.]+)\s*kcr$/.exec(source);
    if (kcr) return Math.round(Number(kcr[1]) * 1000);
    const cr = /^cr\s*([\d.]+)/.exec(source) ?? /^([\d.]+)\s*(cr|credits?)?$/.exec(source);
    return cr ? Math.round(Number(cr[1])) : null;
  }
  const match = /^([\d.]+)\s*(pp|gp|gc|ep|sp|cp)\b/.exec(source);
  if (!match) return null;
  return Math.round(Number(match[1]) * COIN[match[2]]);
}

// Money as people say it: 1525 copper -> "15 gp 2 sp 5 cp" (gc for crowns); credits "Cr1,500".
export function moneyText(amount, { credits = false, gold = "gp" } = {}) {
  const value = Math.max(0, Math.round(Number(amount) || 0));
  if (credits) return `Cr${value.toLocaleString("en-US")}`;
  const gp = Math.floor(value / 100);
  const sp = Math.floor((value % 100) / 10);
  const cp = value % 10;
  return [gp ? `${gp} ${gold}` : "", sp ? `${sp} sp` : "", cp ? `${cp} cp` : ""].filter(Boolean).join(" ") || `0 ${gold}`;
}

// What is left as a sheet's coins (FG's coin list): gold, silver, copper; or credits.
export function coinsOf(amount, { credits = false, gold = "gp" } = {}) {
  const value = Math.max(0, Math.round(Number(amount) || 0));
  if (credits) return { "id-00001": { name: "Cr", amount: value } };
  return {
    "id-00001": { name: gold.toUpperCase() === "GC" ? "gc" : "gp", amount: Math.floor(value / 100) },
    "id-00002": { name: "sp", amount: Math.floor((value % 100) / 10) },
    "id-00003": { name: "cp", amount: value % 10 },
  };
}

// The starting money a class gives, as a dice formula times a multiplier
// ("4d4 x 10 gp", "3d6x10", "(1d4+1)x10"), or a fixed sum ("(B) 75 GP").
export function moneyPlan(text) {
  const source = String(text ?? "").replace(/,/g, "");
  const fixed = /\(B\)\s*([\d.]+)\s*(gp|gc|cr)/i.exec(source);
  if (fixed) return { fixed: Number(fixed[1]), formula: "", times: 1 };
  const dice = /\(?\s*(\d*d\d+(?:\s*[+-]\s*\d+)?)\s*\)?\s*(?:[x×*]\s*(\d+))?/i.exec(source);
  if (dice) return { fixed: 0, formula: dice[1].replace(/\s+/g, ""), times: Number(dice[2]) || 1 };
  const plain = /([\d.]+)\s*(gp|gc|cr)/i.exec(source);
  return plain ? { fixed: Number(plain[1]), formula: "", times: 1 } : null;
}

// A cart against a catalog and a purse: what was bought, spent, left.
// catalog: [{ name, cost (in the purse's unit) }]; cart: [[name, count]].
export function checkout(cart, catalog, purse) {
  const problems = [];
  let spent = 0;
  const bought = [];
  for (const [name, countIn] of cart ?? []) {
    const count = Math.max(1, Math.min(99, Math.round(Number(countIn) || 1)));
    const item = catalog.find((entry) => String(entry.name).toLowerCase() === String(name).toLowerCase());
    if (!item || !Number.isFinite(item.cost)) {
      problems.push(`${name} is not for sale.`);
      continue;
    }
    spent += item.cost * count;
    bought.push({ ...item, count });
  }
  if (spent > purse) problems.push(`That costs ${spent}, more than the ${purse} there is.`);
  return { bought, spent, left: Math.max(0, purse - spent), problems };
}
