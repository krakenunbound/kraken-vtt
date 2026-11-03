// A small FG module with a book, for the book tests: two pages (a picture,
// formatted text, links), a map, a cover; and a module without a book.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";

export function makeBooks() {
  // A one-pixel PNG.
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const folder = mkdtempSync(path.join(tmpdir(), "kraken-books-"));
  const NAME = "Test Keep";
  const db = `<?xml version="1.0" encoding="UTF-8"?>
  <root>
    <image><keep><name type="string">The Keep (map)</name><image type="image"><layers><layer><name>keep</name><bitmap>images/keep.png</bitmap></layer></layers></image></keep></image>
    <reference>
      <refmanualindex><chapters>
        <id-00001><name type="string">The Keep</name><order type="number">1</order><subchapters>
          <id-00001><name type="string">Arriving</name><order type="number">1</order><refpages>
            <id-00001><name type="string">The Gate</name><order type="number">1</order><listlink type="windowreference"><class>reference_manualtextwide</class><recordname>reference.refmanualdata.gate@${NAME}</recordname></listlink></id-00001>
            <id-00002><name type="string">The Inn</name><order type="number">2</order><listlink type="windowreference"><class>reference_manualtextwide</class><recordname>reference.refmanualdata.inn@${NAME}</recordname></listlink></id-00002>
          </refpages></id-00001>
        </subchapters></id-00001>
      </chapters></refmanualindex>
      <refmanualdata>
        <gate><name type="string">The Gate</name><blocks>
          <id-00001><blocktype type="string">image</blocktype><order type="number">1</order><caption type="string">The keep from the road</caption><image type="image"><layers><layer><bitmap>images/keep.png</bitmap></layer></layers></image><imagelink type="windowreference"><class>imagewindow</class><recordname>image.keep@${NAME}</recordname></imagelink></id-00001>
          <id-00002><blocktype type="string">singletext</blocktype><order type="number">2</order><text type="formattedtext"><p>Two <b>guards</b> stand at the gate. &lt;script&gt;alert(1)&lt;/script&gt;</p><frame>Halt! Who goes there?</frame><linklist><link class="sound_context" recordname="">Sound: Context</link><link class="soundplay" recordname="ss|6041|mood||Forest ambience">Sound - Forest ambience</link></linklist><linklist><link class="reference_manualtextwide" recordname="reference.refmanualdata.inn@${NAME}">Page: The Inn</link><link class="imagewindow" recordname="image.keep@${NAME}">Map: The Keep</link></linklist><script>alert(2)</script></text></id-00002>
        </blocks></gate>
        <inn><name type="string">The Inn</name><blocks><id-00001><blocktype type="string">singletext</blocktype><order type="number">1</order><text type="formattedtext"><p>A warm fire.</p></text></id-00001></blocks></inn>
      </refmanualdata>
    </reference>
  </root>`;
  const definition = `<?xml version="1.0" encoding="UTF-8"?><root><name>${NAME}</name><displayname>The Test Keep</displayname><category>Test Adventures</category><author>Kraken</author><ruleset>CnCRPG</ruleset></root>`;
  writeFileSync(path.join(folder, "Test Keep.mod"), zipSync({ "definition.xml": strToU8(definition), "db.xml": strToU8(db), "thumbnail.png": PNG, "images/keep.png": PNG }));
  mkdirSync(path.join(folder, "Not A Book"), { recursive: true });
  writeFileSync(path.join(folder, "Not A Book", "definition.xml"), `<root><name>Not A Book</name><category>Maps</category></root>`);
  writeFileSync(path.join(folder, "Not A Book", "db.xml"), "<root><npc/></root>");
  // A players' book for the same game, and a book for another game.
  const small = (name, title, category, ruleset) => {
    const index = `<root><reference><refmanualindex><chapters><id-00001><name type="string">${title}</name><subchapters><id-00001><name type="string">${title}</name><refpages><id-00001><name type="string">First</name><listlink type="windowreference"><class>reference_manualtextwide</class><recordname>reference.refmanualdata.first@${name}</recordname></listlink></id-00001></refpages></id-00001></subchapters></id-00001></chapters></refmanualindex><refmanualdata><first><name type="string">First</name><text type="formattedtext"><p>Rules.</p></text></first></refmanualdata></reference><item><longsword><name type="string">Longsword</name><cost type="string">15 gp</cost></longsword></item></root>`;
    writeFileSync(path.join(folder, `${name}.mod`), zipSync({ "definition.xml": strToU8(`<root><name>${name}</name><displayname>${title}</displayname><category>${category}</category><ruleset>${ruleset}</ruleset></root>`), "client.xml": strToU8(index) }));
  };
  small("Test Handbook", "Test Player's Handbook", "Core Rules", "SiegeCore");
  small("Other Game", "Another Game's Handbook", "Core Rules", "5E");
  return folder;
}
