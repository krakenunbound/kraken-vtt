// Runs every check and app check in turn, each with a time limit, and prints
// PASS / FAIL / TIMEOUT per script, then DONE. Run from the project folder.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

const LIMIT = 300000;
const files = readdirSync("scripts")
  .filter((name) => /^(check|verify)-.*\.mjs$/.test(name) || name === "playtest-b2.mjs")
  .sort((a, b) => (a.startsWith("check") === b.startsWith("check") ? a.localeCompare(b) : a.startsWith("check") ? -1 : 1));
for (const name of files) {
  const started = Date.now();
  // check-tiles is TypeScript-flavoured: tsx, as the project runs it.
  const [cmd, args] = name === "check-tiles.mjs" ? [process.execPath, ["node_modules/tsx/dist/cli.mjs", `scripts/${name}`]] : [process.execPath, [`scripts/${name}`]];
  const result = await new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: "TIMEOUT", out });
    }, LIMIT);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
  const last = result.out.trim().split("\n").slice(-2).join(" | ").slice(0, 260);
  const mark = result.code === 0 ? "PASS" : result.code === "TIMEOUT" ? "TIMEOUT" : "FAIL";
  console.log(`${mark} ${name} (${Math.round((Date.now() - started) / 1000)}s): ${last}`);
}
console.log("DONE");
