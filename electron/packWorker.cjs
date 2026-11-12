// A Kraken pack made off the backend's thread (packs.makePack): a big book's
// pictures are hundreds of megabytes, copied here while the table plays on.
const { parentPort, workerData } = require("worker_threads");
const { readModule } = require("./importers/fgModule.cjs");
const { describe } = require("./books.cjs");
const { makePack } = require("./packs.cjs");
try {
  const made = makePack(workerData.file, { read: (file) => readModule(file), describe, folder: workerData.folder, onProgress: (progress) => parentPort.postMessage({ progress }) });
  parentPort.postMessage({ ok: true, made });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
