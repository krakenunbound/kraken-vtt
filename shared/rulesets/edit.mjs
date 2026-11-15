// @ts-check
// A manifest's edit glob as the host's whitelist regex (docs/core-ui-design.md
// 4.7): "*" is one id-n key (a list's row), "#" a digit, "%" a word (a-z),
// "(a|b)" either. Used by the hosts (electron/<id>.cjs) and by
// scripts/check-manifests.mjs, so both read a manifest the same way.
/** @param {string} glob */
export const globRegex = (glob) => new RegExp(`^${glob.replace(/\./g, "\\.").replace(/\*/g, "id-\\d+").replace(/#/g, "\\d").replace(/%/g, "[a-z]+")}$`);
// A path that fits a glob, for testing that a sheet's field is allowed ("inventorylist.id-1.count").
/** @param {string} path */
export const samplePath = (path) => path.replace(/\*/g, "id-00001").replace(/#/g, "1").replace(/%/g, "word");
// The host's whitelist from a manifest's edit: text, number, string and list paths, and the rows it may drop.
/** @param {NonNullable<import("./types").RulesetManifest["edit"]>} edit */
export const editPaths = (edit) => ({
  text: (edit.text ?? []).map(globRegex),
  number: (edit.number ?? []).map(globRegex),
  string: (edit.string ?? []).map(globRegex),
  list: (edit.list ?? []).map(globRegex),
  remove: (edit.remove ?? []).length ? [globRegex(`(${(edit.remove ?? []).join("|")}).*`)] : [],
});
