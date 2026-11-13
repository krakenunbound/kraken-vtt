// Which saved table maps come back when a campaign is hosted again
// (shared/table/restore.mjs): a book's map only while its book is active,
// whether the book is named by its name or by its file's whole path (Windows
// backslashes or forward slashes); the GM's own picture or bundle always.
// The first case is a real campaign's saved map that kept reopening.
import { bookTail, restoreAllowed } from "../shared/table/restore.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const VAULT = "Vault of the Kraken 3.5e (DM Guide)";
const books = [
  { id: VAULT, name: VAULT, title: VAULT, active: false },
  { id: "D&D 3.5e B2 The Keep on the Borderlands", name: "D&D 3.5e B2 The Keep on the Borderlands", title: "B2", active: true },
];
const windowsPath = { adventure: "C:\\Users\\GM\\Documents\\Kraken VTT\\Packs\\" + VAULT + ".kpack", sceneId: "fg-c-users-the-krak-map-10-shellstep-shell-tongue-village" };
assert(bookTail(windowsPath.adventure) === VAULT, `a Windows path's book: ${bookTail(windowsPath.adventure)}`);
assert(bookTail("C:/Users/GM/Packs/" + VAULT + ".kpack") === VAULT, "a forward-slash path's book");
assert(bookTail(VAULT) === VAULT, "a book's own name");
assert(restoreAllowed(windowsPath, books) === false, "an inactive book's map by its Windows path does not come back");
assert(restoreAllowed({ ...windowsPath, adventure: "C:/x/" + VAULT + ".kpack" }, books) === false, "nor by a forward-slash path");
assert(restoreAllowed({ adventure: VAULT, sceneId: "fg-vault-map-10" }, books) === false, "nor by its name");
assert(restoreAllowed(windowsPath, []) === false, "a book's map whose book is not on the shelf does not come back");
assert(restoreAllowed({ adventure: "Some Book", sceneId: "fg-some-book-map" }, books) === false, "a book map matching no book does not come back");
assert(restoreAllowed({ adventure: "D&D 3.5e B2 The Keep on the Borderlands", sceneId: "fg-d-d-3-5e-b2-the--keep" }, books) === true, "an active book's map comes back");
assert(restoreAllowed({ adventure: "cover", sceneId: "pic-12biyla" }, books) === true, "the GM's own picture comes back");
assert(restoreAllowed({ adventure: "My Dungeon", sceneId: "scene-abc" }, books) === true, "the GM's own bundle comes back");
console.log("ok restore: an inactive book's map stays away by its name or its file's path (either slash), or with its book gone; an active book's map, the GM's picture and bundle come back");
