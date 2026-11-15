// Kraken's logs: what went wrong, kept on disk for the GM (Settings > Open logs)
// and a bug report. One file per process in <userData>/logs (backend.log for
// the table server and the rest of the backend, window.log for the window and
// its page), each at most 1 MB, the last three kept (name.log, name.1.log, name.2.log).
const fs = require("fs");
const path = require("path");
const util = require("util");

const MAX_BYTES = 1024 * 1024;
const KEEP = 3;

function createLog(folder, name) {
  const file = path.join(folder, `${name}.log`);
  let checked = 0;
  const rotate = () => {
    try {
      if (fs.statSync(file).size < MAX_BYTES) return;
    } catch {
      return;
    }
    for (let index = KEEP - 1; index >= 1; index--) {
      const from = index === 1 ? file : path.join(folder, `${name}.${index - 1}.log`);
      const to = path.join(folder, `${name}.${index}.log`);
      try {
        if (fs.existsSync(from)) fs.renameSync(from, to);
      } catch {
        /* in use: next time */
      }
    }
  };
  function write(level, ...parts) {
    try {
      fs.mkdirSync(folder, { recursive: true });
      // Every 50 lines, the size is looked at.
      if (checked++ % 50 === 0) rotate();
      const text = parts.map((part) => (typeof part === "string" ? part : util.inspect(part, { depth: 4, breakLength: 160 }))).join(" ");
      fs.appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase()} ${text.replace(/\r?\n/g, "\n    ")}\n`);
    } catch {
      /* a log must never break the app */
    }
  }
  // console.error and console.warn go to the log too (and still to the console).
  function capture(target = console) {
    for (const level of ["error", "warn"]) {
      const original = target[level].bind(target);
      target[level] = (...parts) => {
        write(level, ...parts);
        original(...parts);
      };
    }
    process.on("uncaughtExceptionMonitor", (error) => write("fatal", error?.stack ?? String(error)));
  }
  // The last lines of this log (and its older files when there are too few).
  function tail(lines = 100) {
    const out = [];
    for (let index = 0; index < KEEP && out.length < lines; index++) {
      const from = index === 0 ? file : path.join(folder, `${name}.${index}.log`);
      try {
        out.unshift(...fs.readFileSync(from, "utf8").split("\n").filter(Boolean).slice(-(lines - out.length)));
      } catch {
        /* none yet */
      }
    }
    return out.slice(-lines);
  }
  return { file, folder, write, capture, tail };
}

module.exports = { createLog, MAX_BYTES };
