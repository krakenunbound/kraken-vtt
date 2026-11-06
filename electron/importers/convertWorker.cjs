// A module converted off the backend's thread (fgModule.prepareModule): read
// once here, which writes its copy to the module cache, then done.
const { parentPort, workerData } = require("worker_threads");
const { readModule } = require("./fgModule.cjs");
try {
  readModule(workerData.file);
  parentPort.postMessage({ ok: true });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
}
