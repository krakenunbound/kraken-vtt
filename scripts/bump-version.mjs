// The alpha test version: npm run bump moves 0.1.0-alpha.N to N+1
// (package.json and package-lock.json), shown on the home screen, the
// table's menu bar and /about.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const files = ["package.json", "package-lock.json"].filter((file) => existsSync(file));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const match = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(pkg.version);
const next = match ? `${match[1]}-alpha.${Number(match[2]) + 1}` : `${pkg.version.replace(/-.*$/, "")}-alpha.1`;
for (const file of files) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = next;
  if (json.packages?.[""]) json.packages[""].version = next;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(next);
