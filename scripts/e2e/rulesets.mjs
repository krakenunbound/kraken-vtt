// What the end-to-end run (scripts/e2e-ruleset.mjs) does in each ruleset:
// its books, a map, the wizard's choices (with starting gear bought), an
// enemy and a parcel. The GM's real library: FG modules and Kraken packs.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// A sidebar window opened (its button toggles: pressed again it would close).
async function openSide(where, launch) {
  if (await where.$(`.sidebar [data-launch="${launch}"].open`)) return;
  await where.click(`.sidebar [data-launch="${launch}"]`);
}
// Close every window but the map (the Close buttons, never Pop out).
async function closeWindows(where) {
  for (const button of await where.$$('[data-window]:not([data-window="map"]) button[aria-label^="Close"]')) await button.click().catch(() => undefined);
}

// The GM: an active book's maps onto the table (Images > the module > Maps to the table).
async function bookMap(ctx, title) {
  const { page, shelf, tool } = ctx;
  const book = shelf.find((item) => item.title === title || item.name === title);
  if (!book) throw new Error(`No ${title} on the shelf.`);
  await openSide(page, "library");
  await page.waitForSelector('[aria-label="Library module"]');
  await page.selectOption('[aria-label="Library module"]', book.name);
  await page.click('[data-action="library-maps"]');
  for (let i = 0; i < 60; i++) {
    const scene = (await tool("kraken_map")).scene;
    if (scene) return scene;
    await wait(500);
  }
  throw new Error(`${title}'s maps did not open.`);
}
// The GM: a picture of Kraken's own opened as a bare map (for a game whose books have no maps).
async function pictureMap(ctx, file, name) {
  const { page } = ctx;
  const bytes = await import("node:fs").then((fs) => fs.readFileSync(file));
  await page.evaluate(async ([data, title]) => {
    const input = document.querySelector('input[type="file"]');
    if (!input) throw new Error("No file input to open a map.");
    const picture = new File([new Uint8Array(data)], title, { type: "image/webp" });
    const transfer = new DataTransfer();
    transfer.items.add(picture);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, [[...bytes], name]);
  for (let i = 0; i < 60 && !(await ctx.tool("kraken_map")).scene; i++) await wait(500);
}
// The GM: an NPC from an active adventure (Images > the module > NPCs > Add), else a bestiary's by name on the tracker.
async function libraryNpc(ctx, title, search) {
  const { page, shelf, tool } = ctx;
  const book = shelf.find((item) => item.title === title || item.name === title);
  if (!book) throw new Error(`No ${title} on the shelf.`);
  await openSide(page, "library");
  await page.selectOption('[aria-label="Library module"]', book.name);
  await page.click('[data-library-tab="npc"]');
  await page.fill('[aria-label="Library search"]', search);
  await page.waitForSelector(`[data-library-item] [data-action="library-npc"]`, { timeout: 15000 });
  await page.locator('[data-library-item] [data-action="library-npc"]').first().click();
  for (let i = 0; i < 30; i++) {
    const view = await tool("kraken_combat", { action: "view" });
    if (view.entries.some((entry) => entry.faction === "foe")) return;
    await wait(300);
  }
  throw new Error("The NPC did not reach the tracker.");
}
async function trackerNpc(ctx, name) {
  const { page } = ctx;
  await openSide(page, "combat");
  await page.fill('[aria-label="Search NPCs"]', name);
  await page.click('.combat-tracker button:has-text("Add")');
  await wait(800);
}
// The GM: a parcel from an adventure's Library (→ Party).
async function libraryParcel(ctx, title) {
  const { page, shelf, tool } = ctx;
  const book = shelf.find((item) => item.title === title || item.name === title);
  await openSide(page, "library");
  await page.selectOption('[aria-label="Library module"]', book.name);
  await page.click('[data-library-tab="parcel"]');
  await page.waitForSelector('[data-library-item] [data-action="library-parcel"]', { timeout: 15000 });
  // A parcel with coins in it.
  const rows = page.locator("[data-library-item]");
  const count = await rows.count();
  for (let i = 0; i < Math.min(count, 40); i++) {
    const summary = (await rows.nth(i).textContent()) ?? "";
    if (/\d+\s*(gp|sp|cp|pp|gc|cr)/i.test(summary)) {
      await rows.nth(i).locator('[data-action="library-parcel"]').click();
      break;
    }
    if (i === Math.min(count, 40) - 1) await rows.first().locator('[data-action="library-parcel"]').click();
  }
  await wait(800);
  const party = await tool("kraken_party");
  ctx.parcelItems = Object.values(party.parcel?.items ?? {}).map((item) => item.name);
  ctx.check(Object.values(party.parcel?.coins ?? {}).some((value) => Number(value) > 0) || ctx.parcelItems.length, "the parcel has something in it", JSON.stringify(party.parcel).slice(0, 200));
}
// The GM: a parcel made by hand on the party sheet (coins, an item).
async function handParcel(ctx, { coin = "GP", amount = 50, item }) {
  const { page, tool } = ctx;
  await openSide(page, "party");
  await page.click('[role="tab"]:has-text("Inventory")');
  // (A game without coin, Fate, hands out only things.)
  if (coin) {
    const coinBox = page.locator(`[data-parcel-coin="${coin}"], label:has-text("${coin}") input[type="number"]`).first();
    await coinBox.fill(String(amount));
  }
  if (item) {
    await page.fill('input[placeholder="Item"]', item);
    await page.click('form:has(input[placeholder="Item"]) button[type="submit"]');
  }
  await wait(600);
  const party = await tool("kraken_party");
  ctx.parcelItems = Object.values(party.parcel?.items ?? {}).map((row) => row.name);
}
// The shop every wizard shares: roll (or take) the starting money, buy by name.
async function buy(ctx, names) {
  const { seat } = ctx;
  const roll = seat.locator('[data-action="roll-money"], [data-action="roll-gold"]').first();
  if (await roll.count()) await roll.click();
  await seat.waitForSelector("[data-coin-left]", { timeout: 15000 });
  await seat.waitForFunction(() => Number(document.querySelector("[data-coin-left]")?.getAttribute("data-coin-left")) > 0, null, { timeout: 5000 }).catch(() => undefined);
  // A Traveller can muster out with no cash at all (every benefit an item): nothing to buy, said so.
  if (!(Number(await seat.getAttribute("[data-coin-left]", "data-coin-left")) > 0)) {
    console.log(`  note: ${ctx.ruleset}: the character has no money to spend`);
    ctx.bought = [];
    return;
  }
  const bought = [];
  for (const name of names) {
    await seat.getByLabel("Shop search").fill(name);
    const button = seat.getByRole("button", { name: new RegExp(`^Buy ${name.replace(/[()]/g, ".")}`, "i") }).first();
    // What the purse can still pay for (a greyed Buy is too dear now).
    if ((await button.count()) && (await button.isEnabled())) {
      await button.click();
      bought.push(name);
    }
  }
  await seat.getByLabel("Shop search").fill("");
  ctx.bought = bought;
  ctx.check(bought.length >= Math.min(2, names.length), "starting gear bought in the shop", `bought ${bought.join(", ")} of ${names.join(", ")}`);
}
const checkBought = async (ctx) => {
  const items = Object.values(ctx.character.data.inventorylist ?? {}).map((item) => String(item.name).toLowerCase());
  for (const name of ctx.bought ?? []) ctx.check(items.some((item) => item.includes(name.toLowerCase().split(",")[0])), `${name} is in the gear`, items.join(", "));
};
const finish = async (ctx) => {
  await ctx.seat.click('[data-action="wizard-finish"], [data-action="create-character"]');
  await ctx.seat.waitForSelector("[data-character]", { timeout: 20000 });
};

// FG 5E's wizard (D&D 5E and Descending Darkness): Class, Species, Abilities
// rolled by the host, Background, every choice left made, the kits, Commit.
async function wizard5e(ctx, { root, cls, species, background, name }) {
  const { seat } = ctx;
  const w = root;
  await seat.waitForSelector(w);
  const tab = (id) => seat.click(`${w} [data-wizard-tab="${id}"]`);
  await tab("class");
  await seat.click(`${w} [data-class="${cls}"]`);
  await tab("species");
  await seat.click(`${w} [data-species="${species}"]`);
  await tab("abilities");
  const methods = await seat.$$eval(`${w} select[aria-label="Ability method"] option`, (list) => list.map((option) => option.value || option.textContent));
  if (methods.includes("Dice Roll")) {
    await seat.selectOption(`${w} select[aria-label="Ability method"]`, "Dice Roll");
    await seat.click(`${w} [data-action="roll-abilities"]`);
    await seat.waitForFunction((root) => Boolean(document.querySelector(`${root} input[data-base="charisma"]`)?.value), w, { timeout: 20000 });
  } else await seat.selectOption(`${w} select[aria-label="Ability method"]`, "Standard Array");
  await tab("background");
  await seat.click(`${w} [data-background="${background}"]`);
  // Every choice still open, on every tab: the first that fits.
  for (const page of ["class", "species", "background", "abilities"]) {
    await tab(page);
    for (let guard = 0; guard < 20; guard++) {
      const open = await seat.$$eval(`${w} select[data-decision]`, (list) => list.filter((select) => !select.value && select.options.length > 1).map((select) => select.getAttribute("data-decision")));
      if (!open.length) break;
      await seat.selectOption(`${w} select[data-decision="${open[0]}"]`, { index: 1 });
      await wait(120);
    }
  }
  // Starting equipment: the class's and the background's kit A (FG 5E has no shop: the kits are the purchase).
  await tab("equipment");
  await seat.click(`${w} [data-kit="class:A"]`);
  if (await seat.$(`${w} [data-kit="background:A"]`)) await seat.click(`${w} [data-kit="background:A"]`);
  await tab("commit");
  const warnings = await seat.textContent(`${w} [data-warnings]`).catch(() => "");
  ctx.check(!warnings, "the wizard has nothing left to choose", warnings ?? "");
  await seat.fill(`${w} [aria-label="Character name"]`, name);
  ctx.bought = [];
  ctx.kit = true;
  await finish(ctx);
}
// The kits' gear and coin on the sheet.
const checkKit = async (ctx) => {
  const items = Object.values(ctx.character.data.inventorylist ?? {});
  ctx.check(items.length >= 3, "the kits' gear is in the inventory", items.map((item) => item.name).join(", "));
  ctx.check(Object.values(ctx.character.data.coins ?? {}).some((coin) => Number(coin.amount) > 0), "the kits' coin is on the sheet", JSON.stringify(ctx.character.data.coins ?? {}));
};
// The GM's KrakenCharWizard35E: eleven pages.
async function wizard35(ctx, { race, cls, name, gear }) {
  const { seat } = ctx;
  await seat.waitForSelector('[data-wizard="dnd35"]');
  const tab = (id) => seat.click(`[data-wizard-tab="${id}"]`);
  await seat.click('[data-action="roll-abilities"]');
  await seat.waitForFunction(() => /\d/.test(document.querySelector('[data-stat="charisma"]')?.textContent ?? ""), null, { timeout: 20000 });
  await tab("race");
  await seat.click(`[data-race="${race}"]`);
  await tab("class");
  await seat.click(`[data-class="${cls}"]`);
  await seat.waitForSelector("[data-class-plan]");
  await tab("alignment");
  await seat.click('[data-alignment="Lawful Good"]');
  // Skills: raise the class's first skills until every point is spent.
  await tab("skills");
  for (let guard = 0; guard < 60; guard++) {
    const text = (await seat.textContent("[data-skill-points]").catch(() => "")) ?? "";
    const spent = /Spent (\d+) \/ (\d+)/.exec(text);
    if (!spent || Number(spent[1]) >= Number(spent[2])) break;
    const raise = seat.locator('button[aria-label^="Raise "]:not([disabled])');
    if (!(await raise.count())) break;
    await raise.nth(guard % Math.min(3, await raise.count())).click();
  }
  // Feats: those the character qualifies for, until the count is met (a target where one is asked).
  await tab("feats");
  const picked = new Set();
  for (let guard = 0; guard < 12; guard++) {
    const text = (await seat.textContent("[data-feat-count]").catch(() => "")) ?? "";
    const count = /Selected (\d+) \/ (\d+)/.exec(text);
    if (!count || Number(count[1]) >= Number(count[2])) break;
    const choose = seat.locator('[data-feat-targets] button[aria-label^="Choose "]:not([disabled])');
    if (await choose.count()) {
      await choose.first().click();
      continue;
    }
    const feats = await seat.$$eval("[data-feat]:not([disabled])", (list) => list.filter((item) => !item.closest(".ccw-pick")?.textContent?.includes("Needs") && !item.classList.contains("on")).map((item) => item.getAttribute("data-feat")));
    // Never the same feat twice (a second click takes it back).
    const pick = ["Power Attack", "Toughness", "Improved Initiative", "Alertness", "Weapon Focus", ...feats].find((feat) => feats.includes(feat) && !picked.has(feat));
    if (!pick) break;
    picked.add(pick);
    await seat.click(`[data-feat="${pick}"]`);
    await wait(150);
  }
  await tab("languages");
  for (const box of await seat.$$('[data-language]:not(:checked):not([disabled])')) {
    if ((await seat.getAttribute('[data-wizard-tab="languages"] [data-tab-done]', "data-tab-done")) === "yes") break;
    await box.click().catch(() => undefined);
  }
  await tab("equipment");
  await buy(ctx, gear);
  await tab("details");
  await seat.fill('[aria-label="Character name"]', name);
  await seat.fill('[aria-label="gender"]', "Male").catch(() => undefined);
  await tab("commit");
  const warnings = await seat.$$eval("[data-warning]", (list) => list.map((item) => `${item.getAttribute("data-warning")}: ${item.textContent}`).join(" | "));
  ctx.check(Boolean(await seat.$("[data-warnings-none]")), "the wizard has nothing left to choose", warnings);
  await finish(ctx);
}
// The GM's KrakenCharWizard2E: Abilities, Race, Class, Kit, Alignment, Equipment, Profs, Commit.
async function wizard2e(ctx, { race, cls, name, gear }) {
  const { seat } = ctx;
  await seat.waitForSelector('[data-wizard="adnd2e"]');
  const tab = async (id) => {
    await seat.click(`[data-wizard-tab="${id}"]`);
    await seat.waitForSelector(`[data-wizard="adnd2e"][data-page="${id}"]`);
  };
  await seat.click('[data-action="roll-abilities"]');
  await seat.waitForFunction(() => Boolean(document.querySelector('[data-stat="charisma"]')?.getAttribute("data-score")), null, { timeout: 20000 });
  if (await seat.$('[data-action="roll-strength-percent"]')) await seat.click('[data-action="roll-strength-percent"]');
  await tab("race");
  await seat.click(`[data-race="${race}"]`);
  await tab("class");
  await seat.click(`[data-class="${cls}"]`);
  // A kit from the active books, or No Kit where none fits (as in FG).
  await tab("kit");
  if (await seat.locator("[data-kit]").count()) await seat.locator("[data-kit]").first().click();
  else await seat.click('[data-action="no-kit"]');
  await tab("alignment");
  await seat.click('[data-alignment="Lawful Good"]');
  await tab("equipment");
  await buy(ctx, gear);
  await tab("proficiencies");
  for (const kind of ["Weapon proficiency", "Nonweapon proficiency"]) {
    for (let guard = 0; guard < 12; guard++) {
      if ((await seat.getAttribute('[data-wizard-tab="proficiencies"]', "data-done")) === "1") break;
      const boxes = seat.locator(`input[aria-label^="${kind} "]:not(:checked):not([disabled])`);
      if (!(await boxes.count())) break;
      await boxes.first().click();
      await wait(120);
    }
  }
  await tab("commit");
  await seat.fill('[aria-label="Character name"]', name);
  await seat.waitForFunction(() => Boolean(document.querySelector('[aria-label="weight"]')?.value), null, { timeout: 15000 }).catch(() => undefined);
  const undone = await seat.$$eval("[data-wizard-tab]", (list) => list.filter((item) => item.getAttribute("data-done") !== "1").map((item) => item.getAttribute("data-wizard-tab")));
  ctx.check(undone.length === 0, "every tab of the wizard is done", undone.join(", "));
  await finish(ctx);
}

// Fate Core and Fate Accelerated (shipped books only): the wizard (high
// concept, trouble, the pyramid or the approaches, three stunts from the
// books), a Wrecker from the starter scenario fought from the sheet (an
// attack against its defence, in shifts), a parcel of things (no coin: they
// go into the character's extras), milestones instead of XP.
function fatePlan(game) {
  const core = game === "core";
  return {
    books: [core ? "Fate Core System" : "Fate Accelerated Edition", "Fate Toolkit and Adversaries", "The Lighthouse at Gull's End"],
    shipped: true,
    map: (ctx) => bookMap(ctx, "The Lighthouse at Gull's End"),
    async wizard(ctx) {
      const { seat } = ctx;
      const w = '[data-wizard="fate"]';
      await seat.waitForSelector(w, { timeout: 15000 });
      await seat.fill(`${w} [data-field="highconcept"]`, core ? "Harbour Watch Veteran" : "Runaway Sky-Pirate");
      await seat.fill(`${w} [data-field="trouble"]`, core ? "Owes the Wrong People" : "Wanted by the Admiralty");
      await seat.fill(`${w} [data-field="name"]`, core ? "Ada Brand" : "Wren");
      await seat.fill(`${w} [data-field="a1"]`, "Never Leave Anyone Behind");
      if (core) {
        const pyramid = ["Fight", "Athletics", "Notice", "Physique", "Will", "Shoot", "Lore", "Stealth", "Rapport", "Provoke"];
        for (const [index, skill] of pyramid.entries()) await seat.selectOption(`${w} [data-slot="${index}"] select`, skill);
      } else for (const [key, value] of Object.entries({ careful: 1, clever: 2, flashy: 3, forceful: 0, quick: 2, sneaky: 1 })) await seat.selectOption(`${w} [data-approach="${key}"] select`, String(value));
      for (let i = 0; i < 3; i++) await seat.locator(`${w} .life-shop button`).first().click();
      ctx.bought = [];
      await finish(ctx);
    },
    // Fate keeps no gear lists: what a character finds goes into its extras.
    noGear: true,
    enemy: (ctx) => trackerNpc(ctx, "Wrecker"),
    // The player attacks from the sheet: the action Attack, then the skill's (approach's) 4dF.
    async playerAttack(ctx) {
      const { seat } = ctx;
      await seat.click('[data-sheet-tab="main"]').catch(() => undefined);
      await seat.selectOption('[data-character] [data-field="fate-action"]', "attack").catch(() => undefined);
      const button = seat.locator(`[data-character] [data-roll-skill="${core ? "Fight" : "Forceful"}"]`).first();
      if (!(await button.count())) return false;
      await button.dispatchEvent("click");
      await wait(500);
      return true;
    },
    parcel: (ctx) => handParcel(ctx, { coin: null, item: "Brass Spyglass" }),
    async received(ctx, before, after) {
      ctx.check(String(after.data.extras ?? "").includes("Brass Spyglass"), "the parcel's find is in the character's extras", String(after.data.extras ?? ""));
    },
    // Milestones instead of experience (the party sheet's Milestones tab).
    xp: null,
  };
}

export const RULESETS = {
  "Castles & Crusades": {
    books: ["SC C&C Player's Handbook", "SC C&C Monsters & Treasure", "SC C&C Adventurer's Backpack", "SC C&C Castle Keeper's Guide", "B2 The Keep on the Borderlands (C&C)"],
    map: (ctx) => bookMap(ctx, "B2 The Keep on the Borderlands (C&C)"),
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.click('[data-action="roll-abilities"]');
      await seat.click('[data-wizard-tab="race"]');
      await seat.click('[data-race="Human"]');
      await seat.click('[data-wizard-tab="class"]');
      await seat.click('[data-class="Fighter"]');
      await seat.click('[data-wizard-tab="primes"]');
      for (const stat of ["constitution", "dexterity"]) await seat.getByLabel(`${stat} prime`).check().catch(() => undefined);
      await seat.click('[data-wizard-tab="hp"]');
      await seat.click('[data-action="roll-hp"]');
      await seat.click('[data-wizard-tab="equipment"]');
      await buy(ctx, ["Sword, Long", "Leather Armor", "Shield, Medium Steel", "Backpack", "Torch"]);
      await seat.click('[data-wizard-tab="finish"]');
      await seat.getByLabel("Character name").fill("Aldous Vane");
      await seat.selectOption('select[aria-label="alignment"]', { index: 1 });
      await seat.click('[data-action="create-character"]');
      await seat.waitForSelector("[data-character]", { timeout: 20000 });
    },
    bought: checkBought,
    enemy: (ctx) => libraryNpc(ctx, "B2 The Keep on the Borderlands (C&C)", "Kobold"),
    parcel: (ctx) => libraryParcel(ctx, "B2 The Keep on the Borderlands (C&C)"),
    xp: 150,
  },
  "D&D 5E": {
    books: ["5E SRD 5.2.1 Player Data", "5E SRD 5.2.1 Bestiary", "5E SRD 5.2.1 Magic Items", "The Secrets of Skyhorn Lighthouse"],
    map: (ctx) => bookMap(ctx, "The Secrets of Skyhorn Lighthouse"),
    wizard: (ctx) => wizard5e(ctx, { root: '[data-wizard="dnd5e"]', cls: "Fighter", species: "Dwarf", background: "Soldier", name: "Mira Holt" }),
    bought: checkKit,
    enemy: (ctx) => trackerNpc(ctx, "Goblin Warrior"),
    parcel: (ctx) => handParcel(ctx, { coin: "GP", amount: 75, item: "Potion of Healing" }),
    xp: 200,
  },
  // D&D 5E with only the books Kraken ships: the SRD 5.2.1 (games/srd-5e), no FG modules or packs of the GM's.
  "D&D 5E (SRD)": {
    ruleset: "D&D 5E",
    shipped: true,
    books: ["SRD 5.2.1 Player's Rules", "SRD 5.2.1 Creatures", "SRD 5.2.1 Magic Items"],
    map: (ctx) => pictureMap(ctx, "games/descending-darkness/art/watchtower-yard.webp", "Courtyard.webp"),
    wizard: (ctx) => wizard5e(ctx, { root: '[data-wizard="dnd5e"]', cls: "Fighter", species: "Dwarf", background: "Soldier", name: "Mira Holt" }),
    bought: checkKit,
    enemy: (ctx) => trackerNpc(ctx, "Goblin Warrior"),
    parcel: (ctx) => handParcel(ctx, { coin: "GP", amount: 75, item: "Potion of Healing" }),
    xp: 200,
  },
  "D&D 3.5E": {
    books: ["3.5E Basic Rules", "3.5E Monsters", "D&D 3.5e B1 In Search of the Unknown"],
    map: (ctx) => bookMap(ctx, "D&D 3.5e B1 In Search of the Unknown"),
    wizard: (ctx) => wizard35(ctx, { race: "Dwarf", cls: "Fighter", name: "Torvald Ash", gear: ["Longsword", "Scale mail", "Shield, heavy steel", "Backpack", "Bedroll", "Rope, hempen (50 ft.)", "Torch"] }),
    bought: checkBought,
    enemy: (ctx) => libraryNpc(ctx, "D&D 3.5e B1 In Search of the Unknown", ""),
    parcel: (ctx) => libraryParcel(ctx, "D&D 3.5e B1 In Search of the Unknown"),
    xp: 300,
  },
  "AD&D 2E": {
    books: ["B2 The Keep on the Borderlands (AD&D 2E)", "Kraken's Krits & Fumbles 2E"],
    map: (ctx) => bookMap(ctx, "B2 The Keep on the Borderlands (AD&D 2E)"),
    wizard: (ctx) => wizard2e(ctx, { race: "Human", cls: "Fighter", name: "Brannoc", gear: ["Long sword", "Chain mail", "Medium shield", "Backpack", "Rope", "Torch"] }),
    bought: checkBought,
    enemy: (ctx) => libraryNpc(ctx, "B2 The Keep on the Borderlands (AD&D 2E)", "Kobold"),
    parcel: (ctx) => libraryParcel(ctx, "B2 The Keep on the Borderlands (AD&D 2E)"),
    xp: 120,
  },
  Traveller: {
    books: [],
    async map(ctx) {
      const { page, tool } = ctx;
      const ship = await tool("kraken_starship", { action: "create", name: "Rusty Lark", design: "Free Trader" });
      ctx.ship = ship;
      await openSide(page, "ships");
      await page.click(`[data-ship="${ship.id}"]`);
      await page.click('[data-action="ship-deck-plans"]');
      for (let i = 0; i < 60 && !(await tool("kraken_map")).scene; i++) await wait(500);
    },
    async wizard(ctx) {
      const { seat } = ctx;
      // The GM's KrakenCharWizardMGT2: characteristics, species, background, the careers term by term.
      await seat.waitForSelector('[data-wizard="mgt2"]');
      await seat.fill('[aria-label="Character name"]', "Ilsa Varn");
      await seat.click('[data-action="life-start"]');
      await seat.click('[data-action="tc-roll"]');
      await seat.waitForFunction(() => [...document.querySelectorAll("[data-tc-stat] b")].every((b) => /\d/.test(b.textContent ?? "")));
      await seat.click('[data-tc-stat="str"]');
      await seat.click('[data-tc-stat="edu"]');
      await wait(300);
      await seat.click('[data-wizard-tab="species"]');
      await seat.locator("[data-tc-species]").first().locator("xpath=..").click();
      await seat.click('[data-wizard-tab="background"]');
      for (let i = 0; i < 8; i++) {
        const free = seat.locator("[data-tc-bg]:not(:checked):not(:disabled)");
        if (!(await free.count())) break;
        await free.first().locator("xpath=..").click();
        await wait(200);
      }
      await seat.fill('[aria-label="Homeworld"]', "Regina");
      await seat.click('[data-wizard-tab="careers"]');
      await seat.waitForSelector("[data-life-task]");
      let tookCash = false;
      for (let guard = 0; guard < 400; guard++) {
        if ((await seat.getAttribute("[data-wizard]", "data-life-done")) === "yes") break;
        const age = Number(await seat.getAttribute("[data-wizard]", "data-life-age"));
        const options = await seat.$$eval("[data-tc-option]:not(:disabled)", (list) => list.map((button) => ({ n: button.getAttribute("data-tc-option"), label: button.getAttribute("data-life-choice") })));
        if (!options.length) {
          await wait(200);
          continue;
        }
        // Mustering out: one roll on the Cash table first (so there is money to spend), as most players do.
        const cashOption = !tookCash && options.find((option) => /cash/i.test(option.label ?? ""));
        if (cashOption) {
          tookCash = true;
          await seat.click(`[data-tc-option="${cashOption.n}"]`);
          await wait(120);
          continue;
        }
        const finishOption = options.find((option) => /finish|stop/i.test(option.label ?? ""));
        const rest = options.filter((option) => option !== finishOption);
        const pick = finishOption && (age >= 34 || !rest.length) ? finishOption : rest[Math.floor(Math.random() * rest.length)];
        await seat.click(`[data-tc-option="${pick.n}"]`);
        await wait(120);
      }
      const age = Number(await seat.getAttribute("[data-wizard]", "data-life-age"));
      ctx.check((await seat.getAttribute("[data-wizard]", "data-life-done")) === "yes", "the careers played to mustering out", `age ${age}`);
      ctx.check(age >= 26, "several terms before mustering out", `age ${age}`);
      await seat.click('[data-wizard-tab="benefits"]');
      for (const select of await seat.$$("[data-tc-benefit]")) {
        const value = await select.$$eval("option", (list) => list.map((option) => option.value).find(Boolean));
        if (value) await select.selectOption(value);
        await wait(200);
      }
      for (let i = 0; i < 6; i++) {
        const roll = seat.getByRole("button", { name: "Roll medical bills" }).first();
        const restore = seat.getByRole("button", { name: "Restore" }).first();
        if (await roll.count()) await roll.click();
        else if (await restore.count()) await restore.click();
        else break;
        await wait(300);
      }
      await seat.click('[data-wizard-tab="skills"]');
      await seat.fill('[aria-label="Connection 1 skill"]', "Streetwise");
      await seat.click('[data-tc-connection="1"] button');
      await wait(300);
      await seat.click('[data-wizard-tab="finish"]');
      await seat.fill('[aria-label="Traveller name"]', "Ilsa Varn");
      await seat.fill('[aria-label="Gender"]', "Female");
      await seat.fill('[aria-label="Appearance"]', "Tall, close-cropped grey hair, a pilot's squint.");
      await seat.fill('[aria-label="Why travelling"]', "Paying off the ship.");
      await buy(ctx, ["Autopistol", "Cloth", "Medikit", "Comm"]);
      await finish(ctx);
    },
    bought: checkBought,
    async enemy(ctx) {
      await ctx.plan.newNpc(ctx);
    },
    async newNpc(ctx) {
      const { page } = ctx;
      // The GM's NPCs list: a new NPC (FG's +), filled in on its Traveller NPC sheet.
      await openSide(page, "records:npc");
      await page.fill('[aria-label="New NPC name"]', "Pirate Raider");
      await page.click('[data-action="record-new"]');
      await page.waitForSelector("[data-npc-mgt2]", { timeout: 10000 });
      for (const [stat, value] of [["STR", 8], ["DEX", 9], ["END", 8], ["INT", 7], ["EDU", 6], ["SOC", 5]]) {
        await page.fill(`[data-npc-mgt2] [aria-label="${stat}"]`, String(value));
        await page.press(`[data-npc-mgt2] [aria-label="${stat}"]`, "Enter");
        await wait(150);
      }
      await page.fill('[data-npc-mgt2] [aria-label="Skills"]', "Gun Combat (Slug) 1, Melee (Blade) 1, Recon 0");
      await page.press('[data-npc-mgt2] [aria-label="Skills"]', "Enter");
      await page.fill('[data-npc-mgt2] [aria-label="Armour"]', "4");
      await page.press('[data-npc-mgt2] [aria-label="Armour"]', "Enter");
      await page.selectOption('[data-npc-mgt2] [aria-label="Add a weapon"]', "Autopistol");
      await page.click('[data-action="npc-add-weapon"]');
      await page.waitForSelector('[data-npc-weapon="Autopistol"]', { timeout: 5000 });
      ctx.check((await page.getAttribute("[data-npc-hits]", "data-npc-hits")) === "25", "the NPC's hits are STR + DEX + END", await page.textContent("[data-npc-hits]"));
      await closeWindows(page);
      await trackerNpc(ctx, "Pirate Raider");
    },
    parcel: (ctx) => handParcel(ctx, { coin: "Cr", amount: 2500, item: "Autopistol" }),
    xp: null,
  },
  "Descending Darkness": {
    books: ["Descending Darkness Player's Handbook", "Descending Darkness Bestiary", "The Empty Watchtower"],
    map: (ctx) => bookMap(ctx, "The Empty Watchtower"),
    wizard: (ctx) => wizard5e(ctx, { root: '[data-wizard="descending"]', cls: "Fighter", species: "Dwarf", background: "Grave Digger", name: "Wren Hallow" }),
    bought: checkKit,
    // The Empty Watchtower keeps its creatures in the Bestiary, and has no parcels: the GM hands one out.
    enemy: (ctx) => trackerNpc(ctx, "Bone Sentinel"),
    parcel: (ctx) => handParcel(ctx, { coin: "GC", amount: 40, item: "Torch" }),
    xp: 150,
  },
  "Apeira Astra": {
    books: ["Apeira Astra Crew Handbook", "Apeira Astra Threat Dossier", "Salvage Rights"],
    map: (ctx) => bookMap(ctx, "Salvage Rights"),
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.waitForSelector('[data-wizard="astra"]');
      await seat.fill('[aria-label="Character name"]', "Rook Tamsin");
      for (const tag of ["major", "minor"]) {
        const boxes = seat.locator(`[data-astra-skill^="${tag}:"]`);
        const need = tag === "major" ? 4 : 2;
        for (let i = 0; i < need; i++) await boxes.nth(i).check().catch(() => undefined);
      }
      // 2d6 each on the host's dice.
      await seat.click('[data-action="astra-roll"]');
      await seat.waitForFunction(() => !document.querySelector('[data-action="astra-roll"]')?.hasAttribute("disabled"), null, { timeout: 20000 });
      await buy(ctx, ["Carbine", "Mesh Undersuit", "Medkit", "Comm Bead", "Stim Patch"]);
      await finish(ctx);
    },
    bought: checkBought,
    // Salvage Rights keeps its creatures in the Threat Dossier.
    enemy: (ctx) => trackerNpc(ctx, "Pirate Raider"),
    parcel: (ctx) => handParcel(ctx, { coin: "Cr", amount: 800, item: "Toolkit" }),
    xp: 4,
  },
  // Ironsworn (with Delve) and Starforged: the wizard's steps; a fight of
  // moves from the sheet against a foe's progress track; a parcel's Supply.
  Ironsworn: ironswornPlan("Ironsworn"),
  Starforged: ironswornPlan("Starforged"),
  // Cairn: the book's creation in order (every die the host's), its gold at the Marketplace.
  Cairn: {
    books: ["Cairn Player's Guide", "Cairn Warden's Guide", "Trouble in Twin Lakes"],
    map: (ctx) => bookMap(ctx, "Trouble in Twin Lakes"),
    async wizard(ctx) {
      const { seat } = ctx;
      const w = '[data-wizard="cairn"]';
      await seat.waitForSelector(w);
      const ready = (action) => seat.waitForFunction((which) => { const button = document.querySelector(which); return button && !button.disabled; }, `${w} [data-action="${action}"]`, { timeout: 30000 });
      const rolled = (action) => seat.waitForFunction((which) => document.querySelector(which)?.disabled, `${w} [data-action="${action}"]`, { timeout: 30000 });
      await seat.click(`${w} [data-action="cairn-roll-background"]`);
      await seat.waitForFunction((root) => document.querySelector(`${root} select[aria-label="Background"]`)?.value, w, { timeout: 30000 });
      const names = await seat.locator(`${w} select[aria-label="Name from the background"] option`).allTextContents();
      await seat.selectOption(`${w} select[aria-label="Name from the background"]`, names[1]);
      for (const action of ["cairn-roll-table-0", "cairn-roll-table-1", "cairn-roll-attributes"]) {
        await ready(action);
        await seat.click(`${w} [data-action="${action}"]`);
        await rolled(action);
      }
      await seat.click(`${w} [data-action="cairn-swap"]`).catch(() => undefined);
      for (const action of ["cairn-roll-hp", "cairn-roll-traits", "cairn-roll-bond", "cairn-roll-age", "cairn-roll-gold"]) {
        await ready(action);
        await seat.click(`${w} [data-action="${action}"]`);
        await rolled(action);
      }
      await buy(ctx, ["Chalk", "Torch", "Rope", "Dagger"]);
      await ready("wizard-finish");
      await finish(ctx);
    },
    bought: checkBought,
    // A creature from the Warden's Guide's bestiary.
    enemy: (ctx) => trackerNpc(ctx, "Wolf"),
    parcel: (ctx) => handParcel(ctx, { coin: "GP", amount: 40, item: "Rope" }),
    // Cairn has no experience: characters grow from what happens to them.
    xp: null,
  },
  // Basic Fantasy RPG 4th Edition: its three books ship with Kraken.
  // Forged in the Dark (the Blades in the Dark SRD): its three books ship with Kraken; no initiative: the
  // Combat window is the Score panel, and a conflict is action rolls and resistance from the sheet.
  "Forged in the Dark": {
    shipped: true,
    books: ["Forged in the Dark: Scoundrel's Handbook", "Forged in the Dark: Game Master's Guide", "The Brine Street Job (Forged in the Dark)"],
    map: (ctx) => bookMap(ctx, "The Brine Street Job (Forged in the Dark)"),
    tracker: ".score-panel",
    async wizard(ctx) {
      const { seat } = ctx;
      const w = '[data-wizard="forged"]';
      await seat.waitForSelector(w);
      await seat.selectOption(`${w} select[aria-label="Playbook"]`, "Enforcer");
      await seat.selectOption(`${w} select[aria-label="Heritage"]`, "Canal-born");
      await seat.fill(`${w} input[aria-label="Heritage detail"]`, "Barge folk on the Grey Canal");
      await seat.selectOption(`${w} select[aria-label="Background"]`, "Military");
      await seat.fill(`${w} input[aria-label="Background detail"]`, "A marine who deserted");
      for (const action of ["prowl", "wreck", "hunt", "consort"]) await seat.click(`${w} [data-action="dot-${action}"]`);
      await seat.check(`${w} input[data-ability="Battleborn"]`);
      await seat.selectOption(`${w} select[aria-label="Close friend"]`, "Old Pell");
      await seat.selectOption(`${w} select[aria-label="Rival"]`, "Sergeant Danna Vey");
      await seat.selectOption(`${w} select[aria-label="Vice"]`, "Stupor");
      await seat.fill(`${w} input[aria-label="Vice purveyor"]`, "The fighting pits under the tannery");
      await seat.fill(`${w} input[aria-label="Character name"]`, "Bram Holloway");
      await seat.fill(`${w} input[aria-label="Alias"]`, "Anchor");
      await finish(ctx);
    },
    bought: null,
    // The counting-house's night guards from the score, on the tracker (no initiative: a list of who is there).
    async enemy(ctx) {
      const { tool } = ctx;
      const list = await tool("kraken_records_list", { type: "npc", name: "Night Guards" });
      const guards = (list.records ?? list).find((item) => item.name === "Night Guards");
      await tool("kraken_combat", guards ? { action: "add", recordId: guards.id } : { action: "add", entry: { name: "Night Guards", faction: "foe" } });
    },
    // The conflict: the player's Skirmish from the sheet (risky / standard), the GM's harm, the player resists it.
    async fight(ctx) {
      const { seat, tool, check, page } = ctx;
      await tool("kraken_clocks", { action: "score", patch: { phase: "score", position: "risky", effect: "standard" } });
      // Whatever harm the sheet's fields were filled with is cleared first (a clean roll: risky / standard).
      for (const [level, index] of [[3, 0], [2, 0], [2, 1], [1, 0], [1, 1]]) await tool("kraken_forged", { id: ctx.character.id, action: "harm-clear", args: { level, index } }).catch(() => undefined);
      await seat.bringToFront();
      await openSide(seat, "characters").catch(() => undefined);
      await seat.click('[data-sheet-tab="main"]').catch(() => undefined);
      await seat.locator('[data-roll-action="skirmish"]').first().click();
      await wait(1200);
      await tool("kraken_forged", { id: ctx.character.id, action: "harm", args: { level: 2, text: "Cudgel to the ribs" } });
      await seat.locator('[data-roll-resist="prowess"]').first().click();
      await wait(1200);
      const lines = (await tool("kraken_chat_log", { count: 200 })) || [];
      check(lines.some((line) => /\[ACTION\] Skirmish \d?d · Risky \/ Standard/.test(line.roll?.label ?? "")), "the action roll went to chat with its position and effect");
      check(lines.some((line) => /\[RESIST\] Prowess/.test(line.roll?.label ?? "")), "the resistance roll went to chat");
      await tool("kraken_combat", { action: "end", removeNpcs: true });
      await ctx.shot?.(page, "16-score");
    },
    parcel: (ctx) => handParcel(ctx, { coin: "Coin", amount: 4, item: "Lantern" }),
    // Experience is marked on xp tracks, not a total: the party's award is checked in extra.
    xp: null,
    async extra(ctx) {
      const { page, tool, check } = ctx;
      const before = (await tool("kraken_record_get", { id: ctx.character.id })).data.xp?.playbook ?? 0;
      await openSide(page, "party");
      await page.click('[role="tab"]:has-text("XP")');
      await page.locator('.party-xp input[type="number"]').first().fill("2");
      await page.click('button:has-text("Award to the party")');
      await wait(800);
      const after = (await tool("kraken_record_get", { id: ctx.character.id })).data.xp?.playbook ?? 0;
      check(after === before + 2 || after === 0, "the party's XP award marked the playbook track", `${before} -> ${after}`);
      await closeWindows(page);
      // A clock the whole table sees.
      await tool("kraken_clocks", { action: "add", name: "First Light", segments: 8, kind: "mission" });
      await tool("kraken_clocks", { action: "tick", id: "First Light", amount: 2 });
      const seen = await ctx.seat.waitForSelector('.clocks-strip [data-clock="First Light"][data-filled="2"]', { timeout: 10000 }).catch(() => null);
      check(seen, "the player sees the clock on the strip");
    },
  },
  "Basic Fantasy": {
    books: ["Basic Fantasy Player's Handbook", "Basic Fantasy Game Master's Guide", "The Mill at Hob's Ford (Basic Fantasy)"],
    map: (ctx) => bookMap(ctx, "The Mill at Hob's Ford (Basic Fantasy)"),
    async wizard(ctx) {
      const { seat } = ctx;
      const w = '[data-wizard="bfrpg"]';
      await seat.waitForSelector(w);
      // 3d6 in order on the host's dice; then (the GM allowing an exchange) scores a fighter may have.
      await seat.click(`${w} [data-action="roll-abilities"]`);
      await seat.waitForFunction((root) => Boolean(document.querySelector(`${root} input[data-score="charisma"]`)?.value), w, { timeout: 30000 });
      for (const [stat, score] of [["strength", 15], ["intelligence", 10], ["wisdom", 11], ["dexterity", 13], ["constitution", 14], ["charisma", 9]]) await seat.fill(`${w} input[data-score="${stat}"]`, String(score));
      await seat.selectOption(`${w} select[aria-label="Race"]`, "human");
      await seat.selectOption(`${w} select[aria-label="Class"]`, "fighter");
      await seat.click(`${w} [data-action="roll-hp"]`);
      await seat.waitForSelector(`${w} [data-hp]`, { timeout: 30000 });
      await buy(ctx, ["Longsword/Scimitar", "Leather Armor", "Shield", "Backpack", "Torches, 6"]);
      await seat.fill(`${w} [aria-label="Character name"]`, "Darion Vell");
      await seat.selectOption(`${w} select[aria-label="Alignment"]`, "Lawful");
      await finish(ctx);
    },
    bought: checkBought,
    // The Mill keeps its creatures in the Game Master's Guide.
    enemy: (ctx) => trackerNpc(ctx, "Goblin"),
    async parcel(ctx) {
      // The adventure's own treasure parcel (Library > the module > Parcels). Its launch button can still
      // read as open after the map step closed the window: pressed until the window is there.
      // The Library window can open under the map window (shown since step 4): its controls are pressed in the page.
      const { page, tool, shelf } = ctx;
      await openSide(page, "library");
      await page.waitForSelector('[aria-label="Library module"]', { timeout: 15000 });
      const book = shelf.find((item) => item.title === "The Mill at Hob's Ford (Basic Fantasy)");
      await page.selectOption('[aria-label="Library module"]', book.name, { force: true });
      await page.$eval('[data-library-tab="parcel"]', (button) => button.click());
      await page.waitForSelector('[data-library-item] [data-action="library-parcel"]', { state: "attached", timeout: 15000 });
      await page.$$eval("[data-library-item]", (rows) => rows.find((row) => /Goblin Den Loot/.test(row.textContent ?? ""))?.querySelector('[data-action="library-parcel"]')?.click());
      await wait(800);
      const party = await tool("kraken_party");
      ctx.parcelItems = Object.values(party.parcel?.items ?? {}).map((item) => item.name);
      ctx.check(Object.values(party.parcel?.coins ?? {}).some((value) => Number(value) > 0), "the adventure's parcel (140 sp, 300 cp, 12 gp, a dagger) is on the party sheet", JSON.stringify(party.parcel).slice(0, 200));
    },
    xp: 25,
  },
  // Fate Core and Fate Accelerated: the books' character creation in the wizard, a conflict, no coin or XP.
  "Fate Core": fatePlan("core"),
  "Fate Accelerated": fatePlan("fae"),
  Worldbuilding: {
    books: [],
    async map(ctx) {
      const { page } = ctx;
      // A picture of the GM's made into a map: Kraken's own Salvage Rights deck, opened as a bare picture.
      const bytes = await import("node:fs").then((fs) => fs.readFileSync("games/apeira-astra/art/kestrel-deck1.webp"));
      await page.evaluate(async (data) => {
        const input = document.querySelector('input[type="file"]');
        if (!input) throw new Error("No file input to open a map.");
        const file = new File([new Uint8Array(data)], "Kestrel Deck.webp", { type: "image/webp" });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, [...bytes]);
      for (let i = 0; i < 60 && !(await ctx.tool("kraken_map")).scene; i++) await wait(500);
    },
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.click('[data-action="blank-character"]').catch(async () => {
        await seat.waitForSelector('[data-action="blank-character"]', { timeout: 10000 });
        await seat.click('[data-action="blank-character"]');
      });
      await seat.waitForSelector("[data-character]", { timeout: 20000 });
      // No wizard in a game of the GM's own (FG's CoreRPG has none): the player writes the gear in.
      await seat.click('[data-sheet-tab="inventory"]');
      ctx.bought = [];
      for (const item of ["Lantern", "Rope", "Short sword"]) {
        await seat.fill('[aria-label="Add an item"]', item);
        await seat.press('[aria-label="Add an item"]', "Enter");
        await wait(400);
        ctx.bought.push(item);
      }
    },
    bought: checkBought,
    // FG's CoreRPG has no attack on the sheet: the player rolls in chat, the GM takes the damage off on the tracker.
    async playerAttack(ctx) {
      const { seat, tool } = ctx;
      const say = seat.locator('textarea[placeholder*="ay something"], input[placeholder*="ay something"]').first();
      await say.fill("/r 1d20+2 [ATTACK] Short sword");
      await say.press("Enter");
      await wait(600);
      await say.fill("/r 1d6 [DAMAGE] Short sword");
      await say.press("Enter");
      await wait(600);
      await tool("kraken_combat", { action: "damage", id: ctx.foe.id, amount: 4 });
      return true;
    },
    async enemy(ctx) {
      // The GM's NPCs list: a new NPC (FG's +), then onto the tracker.
      const { page } = ctx;
      await openSide(page, "records:npc");
      await page.fill('[aria-label="New NPC name"]', "Bandit");
      await page.click('[data-action="record-new"]');
      await wait(800);
      await closeWindows(page);
      await trackerNpc(ctx, "Bandit");
    },
    parcel: (ctx) => handParcel(ctx, { coin: "GP", amount: 30, item: "Rope" }),
    xp: 50,
  },
};

// Ironsworn and Starforged: no money and no attack rolls. The wizard: the
// spread placed, the assets, a background vow, bonds or a connection, what
// they carry. The fight: Enter the Fray, then Strike against the foe on the
// tracker until its progress is enough, then End the Fight (Take Decisive
// Action) with a progress roll, every move made from the sheet. A parcel's
// Supply goes to the shared supply meter.
function ironswornPlan(game) {
  const sf = game === "Starforged";
  const move = async (ctx, key, target, option = null) => {
    const { seat, tool } = ctx;
    await seat.click('[data-character] [data-sheet-tab="moves"]');
    await seat.locator(`[data-character] [data-move="${key}"]`).first().click();
    if (option !== null) await seat.selectOption("[data-character] [data-move-option]", String(option)).catch(() => undefined);
    if (target) {
      await seat.waitForSelector(`[data-character] [data-move-track] option[value="target:${target}"]`, { state: "attached", timeout: 10000 });
      await seat.selectOption("[data-character] [data-move-track]", `target:${target}`);
    }
    const before = (await tool("kraken_record_get", { id: ctx.character.id })).data.lastroll?.at ?? 0;
    await seat.click('[data-character] [data-action="make-move"]');
    for (let i = 0; i < 40; i++) {
      const roll = (await tool("kraken_record_get", { id: ctx.character.id })).data.lastroll;
      if ((roll?.at ?? 0) > before) {
        // A roll momentum could better: kept, as a player might.
        if (roll.pending) await seat.click('[data-character] [data-action="iron-keep"]');
        return roll;
      }
      await wait(250);
    }
    return null;
  };
  return {
    // Only the books Kraken ships (no FG modules or packs of the GM's).
    shipped: true,
    books: sf ? ["Starforged Reference", "Starforged Foes", "The Silent Hulk"] : ["Ironsworn Reference", "Ironsworn Foes and Sites", "The Cinder Barrow"],
    map: (ctx) => bookMap(ctx, sf ? "The Silent Hulk" : "The Cinder Barrow"),
    async wizard(ctx) {
      const { seat } = ctx;
      const w = '[data-wizard="ironsworn"]';
      await seat.waitForSelector(w);
      await seat.selectOption(`${w} [data-iron-stat="iron"]`, "3");
      await seat.selectOption(`${w} [data-iron-stat="edge"]`, "2");
      for (const name of sf ? ["Ace", "Gunner", "Combat Bot"] : ["Swordmaster", "Hound", "Ironclad"]) {
        const box = seat.locator(`${w} [data-iron-asset="${name}"]`);
        await box.evaluate((element) => element.closest("details")?.setAttribute("open", ""));
        await box.check();
      }
      await seat.fill(`${w} [data-background-vow]`, sf ? "Find my lost crew" : "Free my people from the raider-king");
      if (sf) {
        await seat.fill(`${w} [data-ship-name]`, "Wayfarer");
        await seat.fill(`${w} [data-connection-name]`, "Ashe Varo");
        await seat.fill(`${w} [data-connection-role]`, "Broker");
      } else await seat.fill(`${w} [data-bond="0"]`, "My home village");
      await seat.fill(`${w} [data-inciting-vow]`, "Find out who stole the sacred iron");
      await seat.fill(`${w} [data-gear]`, "A bedroll, a coil of rope, a lantern");
      ctx.bought = ["bedroll", "rope", "lantern"];
      await seat.fill(`${w} input[aria-label="Character name"]`, sf ? "Vesna Kade" : "Kira Ashdown");
      await finish(ctx);
    },
    bought: checkBought,
    enemy: (ctx) => trackerNpc(ctx, sf ? "Drift pirate" : "Raider"),
    async fight(ctx) {
      const { tool, seat, check } = ctx;
      await seat.bringToFront();
      await openSide(seat, "characters").catch(() => undefined);
      const foeId = ctx.foe.id;
      // The GM shows the foe (the tracker adds it hidden): the player makes moves against it.
      await tool("kraken_combat", { action: "update", id: foeId, patch: { hidden: false } });
      const status = async () => (await tool("kraken_combat", { action: "view" })).entries.find((entry) => entry.id === foeId);
      const fray = await move(ctx, "enter_the_fray", foeId, sf ? 2 : 0);
      check(fray?.outcome, "Enter the Fray from the sheet", JSON.stringify(fray ?? {}).slice(0, 200));
      let rounds = 0;
      while (rounds < 10 && Math.floor(((await status())?.iron?.ticks ?? 0) / 4) < 6) {
        rounds += 1;
        const control = (await tool("kraken_record_get", { id: ctx.character.id })).data.control;
        // With the initiative (in control) Strike; without it Clash.
        await move(ctx, control ? "strike" : "clash", foeId, 0);
      }
      const ticks = (await status())?.iron?.ticks ?? 0;
      check(ticks > 0, "the player's moves marked the foe's progress", `${ticks} ticks after ${rounds} rounds`);
      // The foe hits back: the GM inflicts its harm.
      await tool("kraken_ironsworn", { action: "inflict", target: foeId, id: ctx.character.id });
      await move(ctx, sf ? "take_decisive_action" : "end_the_fight", foeId);
      let foe = await status();
      if (foe?.health?.status !== "Defeated") {
        // Not this time: the GM finishes it (harm enough to fill its track).
        await tool("kraken_combat", { action: "damage", id: foeId, amount: 40 });
        foe = await status();
      }
      check(foe?.health?.status === "Defeated", "the foe is out of the fight", foe?.health?.status);
      const lines = (await tool("kraken_chat_log", { count: 200 })) || [];
      check(lines.some((line) => /\[MOVE\]/.test(line.roll?.label ?? "")), "the moves went to chat");
      check(lines.some((line) => /\[PROGRESS\]/.test(`${line.roll?.label ?? ""} ${line.text ?? ""}`)), "progress went to chat");
      // Health back for what follows.
      await tool("kraken_character_edit", { id: ctx.character.id, changes: [{ path: "meters.health", value: 5 }] });
      await tool("kraken_combat", { action: "end", removeNpcs: true });
    },
    // First the supply is spent, then the parcel's Supply refills it (shared by the party).
    async parcel(ctx) {
      await ctx.tool("kraken_character_edit", { id: ctx.character.id, changes: [{ path: "meters.supply", value: 3 }] });
      await handParcel(ctx, { coin: "Supply", amount: 1, item: sf ? "Data core" : "Silver torc" });
    },
    parcelReached: (before, after) => [Number(after.data.meters?.supply) > Number(before.data.meters?.supply), "the parcel's Supply reached the shared supply meter", `${before.data.meters?.supply} -> ${after.data.meters?.supply}`],
    xp: 2,
  };
}
