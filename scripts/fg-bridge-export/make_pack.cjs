// Make a pack from a module folder with Maelstrom's own pack maker.
// node make_pack.cjs <module folder> <packs folder>
const path = require("path");
const electron = path.join(__dirname, "..", "..", "electron");
const { makePack } = require(path.join(electron, "packs.cjs"));
const { readModule } = require(path.join(electron, "importers", "fgModule.cjs"));
const { describe } = require(path.join(electron, "books.cjs"));
const [source, folder] = process.argv.slice(2);
console.log(JSON.stringify(makePack(source, { read: (file) => readModule(file), describe, folder })));
