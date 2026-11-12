// What the end-to-end run (scripts/e2e-ruleset.mjs) does in each ruleset:
// its books, a map, the wizard's choices (with starting gear bought), an
// enemy and a parcel. The GM's real library: FG modules and Kraken packs.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The GM: an active book's maps onto the table (Images > the module > Maps to the table).
async function bookMap(ctx, title) {
  const { page, shelf, tool } = ctx;
  const book = shelf.find((item) => item.title === title || item.name === title);
  if (!book) throw new Error(`No ${title} on the shelf.`);
  await page.click('.sidebar [data-launch="library"]');
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
// The GM: an NPC from an active adventure (Images > the module > NPCs > Add), else a bestiary's by name on the tracker.
async function libraryNpc(ctx, title, search) {
  const { page, shelf, tool } = ctx;
  const book = shelf.find((item) => item.title === title || item.name === title);
  if (!book) throw new Error(`No ${title} on the shelf.`);
  await page.click('.sidebar [data-launch="library"]');
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
  await page.click('.sidebar [data-launch="combat"]');
  await page.fill('[aria-label="Search NPCs"]', name);
  await page.click('.combat-tracker button:has-text("Add")');
  await wait(800);
}
// The GM: a parcel from an adventure's Library (→ Party).
async function libraryParcel(ctx, title) {
  const { page, shelf, tool } = ctx;
  const book = shelf.find((item) => item.title === title || item.name === title);
  await page.click('.sidebar [data-launch="library"]');
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
  ctx.parcelItems = (party.parcel?.items ?? []).map((item) => item.name);
  ctx.check(Object.values(party.parcel?.coins ?? {}).some((value) => Number(value) > 0) || ctx.parcelItems.length, "the parcel has something in it", JSON.stringify(party.parcel).slice(0, 200));
}
// The GM: a parcel made by hand on the party sheet (coins, an item).
async function handParcel(ctx, { coin = "GP", amount = 50, item }) {
  const { page, tool } = ctx;
  await page.click('.sidebar [data-launch="party"]');
  await page.click('[role="tab"]:has-text("Inventory")');
  const coinBox = page.locator(`[data-parcel-coin="${coin}"], label:has-text("${coin}") input[type="number"]`).first();
  await coinBox.fill(String(amount));
  if (item) {
    await page.fill('input[placeholder="Item"]', item);
    await page.click('form:has(input[placeholder="Item"]) button[type="submit"]');
  }
  await wait(600);
  const party = await tool("kraken_party");
  ctx.parcelItems = (party.parcel?.items ?? []).map((row) => row.name);
}
// The shop every wizard shares: roll (or take) the starting money, buy by name.
async function buy(ctx, names) {
  const { seat } = ctx;
  const roll = seat.locator('[data-action="roll-money"], [data-action="roll-gold"]').first();
  if (await roll.count()) await roll.click();
  await seat.waitForFunction(() => Number(document.querySelector("[data-coin-left]")?.getAttribute("data-coin-left")) > 0, null, { timeout: 15000 });
  const bought = [];
  for (const name of names) {
    await seat.getByLabel("Shop search").fill(name);
    const button = seat.getByRole("button", { name: new RegExp(`^Buy ${name.replace(/[()]/g, ".")}`, "i") }).first();
    if (await button.count()) {
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
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.waitForSelector('[data-wizard="dnd5e"]');
      await seat.fill('[aria-label="Character name"]', "Mira Holt");
      await seat.selectOption('[aria-label="Class"]', { label: "Fighter" }).catch(() => seat.selectOption('[aria-label="Class"]', "Fighter"));
      await ctx.plan.wizardMore?.(ctx);
      const skills = seat.locator("[data-wizard-skill]");
      for (let i = 0; i < (await skills.count()) && !(await seat.locator('[data-action="wizard-finish"]').isEnabled()); i++) await skills.nth(i).check().catch(() => undefined);
      await buy(ctx, ["Longsword", "Chain Mail", "Shield", "Backpack"]);
      await finish(ctx);
    },
    bought: checkBought,
    enemy: (ctx) => trackerNpc(ctx, "Goblin Warrior"),
    parcel: (ctx) => handParcel(ctx, { coin: "GP", amount: 75, item: "Potion of Healing" }),
    xp: 200,
  },
  "D&D 3.5E": {
    books: ["3.5E Basic Rules", "3.5E Monsters", "D&D 3.5e B1 In Search of the Unknown"],
    map: (ctx) => bookMap(ctx, "D&D 3.5e B1 In Search of the Unknown"),
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.waitForSelector('[data-wizard="dnd35"]');
      await seat.fill('[aria-label="Character name"]', "Torvald Ash");
      await seat.selectOption('[aria-label="Class"]', "Fighter").catch(() => undefined);
      await buy(ctx, ["Longsword", "Chainmail", "Shield, heavy steel", "Backpack"]);
      await finish(ctx);
    },
    bought: checkBought,
    enemy: (ctx) => libraryNpc(ctx, "D&D 3.5e B1 In Search of the Unknown", ""),
    parcel: (ctx) => libraryParcel(ctx, "D&D 3.5e B1 In Search of the Unknown"),
    xp: 300,
  },
  "AD&D 2E": {
    books: ["B2 The Keep on the Borderlands (AD&D 2E)", "Kraken's Krits & Fumbles 2E"],
    map: (ctx) => bookMap(ctx, "B2 The Keep on the Borderlands (AD&D 2E)"),
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.waitForSelector('[data-wizard="adnd2e"]');
      await seat.fill('[aria-label="Character name"]', "Brannoc");
      await seat.selectOption('[aria-label="Race"]', "Human");
      await seat.selectOption('[aria-label="Class"]', "Fighter");
      await buy(ctx, ["Long sword", "Chain mail", "Shield", "Backpack"]);
      await finish(ctx);
    },
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
      await page.click('.sidebar [data-launch="ships"]');
      await page.click(`[data-ship="${ship.id}"]`);
      await page.click('[data-action="ship-deck-plans"]');
      for (let i = 0; i < 60 && !(await tool("kraken_map")).scene; i++) await wait(500);
    },
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.waitForSelector('[data-wizard="mgt2"]');
      await seat.fill('[aria-label="Character name"]', "Ilsa Varn");
      await seat.click('[data-action="life-start"]');
      // Answer the lifepath at random, staying in for several terms.
      for (let guard = 0; guard < 300; guard++) {
        if (await seat.$('[data-life-question="build"]')) break;
        const kind = await seat.getAttribute("[data-life-question]", "data-life-question").catch(() => null);
        if (!kind) {
          await wait(200);
          continue;
        }
        if (kind === "arrange") await seat.click('[data-life-answer="keep"]');
        else if (kind === "pick") {
          const boxes = seat.locator("[data-life-pick]");
          const need = Number(/of (\d+)/.exec((await seat.textContent('[data-life-answer="pick"]')) ?? "")?.[1] ?? 1);
          for (let i = 0; i < need; i++) await boxes.nth(i).check();
          await seat.click('[data-life-answer="pick"]');
        } else if (kind === "career") {
          await seat.click('[data-life-career="Merchant"]');
          await seat.locator("[data-life-assignment]").first().check();
          await seat.click('[data-life-answer="career"]');
        } else {
          const options = await seat.$$eval("[data-life-choice]", (list) => list.map((item) => item.getAttribute("data-life-choice")));
          const terms = Number(await seat.getAttribute("[data-life-age]", "data-life-age").catch(() => 18));
          const prefer = options.includes("Another term") && terms < 34 ? "Another term" : options.includes("Finish") && terms >= 30 ? "Finish" : options.includes("Another career") ? "Another career" : options.includes("Straight into a career") ? "Straight into a career" : options[Math.floor(Math.random() * options.length)];
          await seat.click(`[data-life-choice="${prefer}"]`);
        }
        await wait(150);
      }
      const age = Number(await seat.getAttribute("[data-life-age]", "data-life-age"));
      ctx.check(age >= 26, "several terms before mustering out", `age ${age}`);
      await buy(ctx, ["Autopistol", "Cloth", "Medikit", "Comm"]);
      await finish(ctx);
    },
    bought: checkBought,
    async enemy(ctx) {
      await ctx.plan.newNpc(ctx);
    },
    async newNpc(ctx) {
      const { page } = ctx;
      await page.click('.sidebar [data-launch="records"][data-payload="npc"], .sidebar [title="NPCs"]').catch(() => undefined);
      await page.click('[data-action="record-new"]');
      await page.fill('[aria-label="NPC name"]', "Pirate Raider");
      await page.click('[data-action="record-create"]');
      await wait(800);
      await trackerNpc(ctx, "Pirate Raider");
    },
    parcel: (ctx) => handParcel(ctx, { coin: "Cr", amount: 2500, item: "Autopistol" }),
    xp: 2,
  },
  "Descending Darkness": {
    books: ["Descending Darkness Player's Handbook", "Descending Darkness Bestiary", "The Empty Watchtower"],
    map: (ctx) => bookMap(ctx, "The Empty Watchtower"),
    async wizard(ctx) {
      const { seat } = ctx;
      await seat.waitForSelector('[data-wizard="descending"]');
      await seat.fill('[aria-label="Character name"]', "Wren Hallow");
      await seat.selectOption('[aria-label="Class"]', "Fighter").catch(() => undefined);
      const skills = seat.locator("[data-wizard-skill]");
      for (let i = 0; i < (await skills.count()) && !(await seat.locator('[data-action="wizard-finish"]').isEnabled()); i++) await skills.nth(i).check().catch(() => undefined);
      await buy(ctx, ["Longsword", "Mail Shirt", "Shield", "Backpack"]);
      await finish(ctx);
    },
    bought: checkBought,
    enemy: (ctx) => libraryNpc(ctx, "The Empty Watchtower", ""),
    parcel: (ctx) => libraryParcel(ctx, "The Empty Watchtower"),
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
      await buy(ctx, ["Carbine", "Mesh Undersuit", "Medkit", "Comm Bead"]);
      await finish(ctx);
    },
    bought: checkBought,
    enemy: (ctx) => libraryNpc(ctx, "Salvage Rights", ""),
    parcel: (ctx) => handParcel(ctx, { coin: "Cr", amount: 800, item: "Toolkit" }),
    xp: 4,
  },
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
    },
    enemy: (ctx) => trackerNpc(ctx, "Bandit"),
    parcel: (ctx) => handParcel(ctx, { coin: "GP", amount: 30, item: "Rope" }),
    xp: 50,
  },
};
