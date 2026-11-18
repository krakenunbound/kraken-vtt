// FG rulesets that keep a book's records under <reference> (2E's
// reference.spelldata, 3.5E's reference.spells), often by <category>: every
// record must come out as its own record of its type, in its category, with
// the FG path that pages link to. A made-up module, no book content.
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { readModule } = require("../electron/importers/fgModule.cjs");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const folder = mkdtempSync(path.join(tmpdir(), "kraken-refsections-"));
try {
  writeFileSync(
    path.join(folder, "definition.xml"),
    `<?xml version="1.0" encoding="utf-8"?><root version="4.1"><name>Test Sections</name><ruleset>2E</ruleset></root>`,
  );
  const spell = (id, name) => `<${id}><name type="string">${name}</name><level type="number">1</level><description type="formattedtext"><p><b>${name}</b> <i>works</i>.</p></description></${id}>`;
  const item = (id, name) => `<${id}><name type="string">${name}</name><cost type="string">1 gp</cost></${id}>`;
  writeFileSync(
    path.join(folder, "db.xml"),
    `<?xml version="1.0" encoding="utf-8"?><root version="4.1"><reference>
      <spelldata><category name="Arcane">${spell("id-00001", "Light")}${spell("id-00002", "Sleep")}</category><category name="Divine">${spell("id-00003", "Bless")}</category></spelldata>
      <equipmentdata><category name="Armor">${item("id-00001", "Shield")}</category><category name="Gear">${item("id-00002", "Rope")}${item("id-00003", "Torch")}</category>${item("id-00004", "Bundle")}</equipmentdata>
      <hiddenstory>${`<id-00001><name type="string">Note</name><text type="formattedtext"><p>Hi</p></text></id-00001>`}</hiddenstory>
      <spells>${spell("id-00009", "Magic Missile")}</spells>
    </reference></root>`,
  );
  const { records } = readModule(folder);
  const byType = (type) => records.filter((record) => record.type === type);
  const spells = byType("spell");
  assert(spells.length === 4, `4 spells (3 in two categories, 1 3.5E-style), got ${spells.length}`);
  const sleep = spells.find((record) => record.name === "Sleep");
  assert(sleep?.data.fgPath === "reference.spelldata.id-00002@Test Sections", `Sleep keeps its FG path, got ${sleep?.data.fgPath}`);
  assert(sleep?.data.fgCategory === "Arcane", `Sleep stays in its category, got ${sleep?.data.fgCategory}`);
  assert(String(sleep?.data.description).includes("<b>Sleep</b>") && String(sleep?.data.description).includes("<i>works</i>"), "formatting kept");
  assert(spells.some((record) => record.data.fgPath === "reference.spells.id-00009@Test Sections"), "3.5E-style reference.spells still read");
  const items = byType("item");
  assert(items.length === 4, `4 items across categories and none, got ${items.length}`);
  assert(items.find((record) => record.name === "Torch")?.data.fgCategory === "Gear", "Torch in Gear");
  assert(byType("hiddenstory").length === 1, "story reference entry kept");
  console.log(`OK reference sections: ${spells.length} spells, ${items.length} items, categories kept`);
} finally {
  rmSync(folder, { recursive: true, force: true });
}
