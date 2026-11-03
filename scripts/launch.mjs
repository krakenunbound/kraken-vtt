// What "Kraken VTT.bat" runs: installs packages the first time, rebuilds the
// interface when its source is newer than the last build, then opens the app
// and lets this console go.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  const result = spawnSync(npm, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`\n"npm ${args.join(" ")}" failed.`);
    process.exit(1);
  }
}

function newest(entry) {
  if (!existsSync(entry)) return 0;
  const stat = statSync(entry);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return readdirSync(entry).reduce((latest, name) => Math.max(latest, newest(path.join(entry, name))), stat.mtimeMs);
}

if (!existsSync(path.join(root, "node_modules", "electron"))) {
  console.log("First run: installing packages...");
  run(["install"]);
}

const built = path.join(root, "dist", "index.html");
const sources = ["src", "shared", "public", "index.html", "vite.config.ts", "package.json"].map((name) => path.join(root, name));
if (!existsSync(built) || Math.max(...sources.map(newest)) > statSync(built).mtimeMs || process.argv.includes("--build")) {
  console.log("Building the interface...");
  run(["run", "build"]);
}

const electron = createRequire(import.meta.url)("electron");
console.log("Opening Kraken VTT...");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, [root], { cwd: root, env, detached: true, stdio: "ignore" }).unref();
