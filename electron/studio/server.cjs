const fs = require("fs");
const path = require("path");
const http = require("http");
const assets = require("./assets.cjs");

// Map Studio's local web server, a Node port of Map Studio's server.py, so the
// editor runs inside Kraken without Python. It serves the editor (webRoot) and
// the same /api endpoints with the same request and response shapes and status
// codes: artwork, projects, portable zips, the demo, Dungeondraft packs, FG maps
// (fgMaps.cjs, read only: a book's map opened in the editor). Kraken's editor
// makes maps for Kraken: no Fantasy Grounds or Foundry export (the stand-alone
// Map Studio does those).
// It listens on 127.0.0.1 only and refuses writes started by another origin.
//
// createStudioServer({ webRoot, dataDir, packsDir, examplesDir, fgDataFolder, ddFolders, port })
// resolves to { port, url, close() } once it is listening. The catalogue is
// read in the background; API calls wait for it, the editor's files do not.

const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
};

function reply(res, data, mime, status = 200, filename = null) {
  const headers = {
    "Content-Type": mime,
    "Content-Length": String(data.length),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": mime === "application/json" ? "no-store" : "no-cache",
  };
  if (filename) headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  res.writeHead(status, headers);
  res.end(data);
}

function json(res, data, status = 200) {
  reply(res, Buffer.from(JSON.stringify(data)), "application/json", status);
}

// Python's str(KeyError('project')) is "'project'"; other errors are their message.
function errorText(e) {
  return e && e.message !== undefined ? String(e.message) : String(e);
}

// data['field'] in Python: a missing field is a KeyError the user sees as 400.
function field(data, key) {
  if (data === null || typeof data !== "object" || !(key in data)) throw new Error(`'${key}'`);
  return data[key];
}

function parseJson(raw) {
  return JSON.parse(raw.toString("utf8"));
}

// Python's parse_qs: blank values are dropped, the first of each name is kept.
function query(url) {
  const out = {};
  for (const [k, v] of url.searchParams) if (v !== "" && !(k in out)) out[k] = v;
  return out;
}

const pyInt = (value) => {
  const s = String(value ?? 0).trim();
  if (!/^[+-]?\d+$/.test(s)) throw new Error(`invalid literal for int() with base 10: '${value}'`);
  return parseInt(s, 10);
};

// fgMaps (fg_maps.py, ported separately) is required on first use, so this
// server runs before that port exists.
const fgMaps = () => require("./fgMaps.cjs");
// fgMaps takes the FG data folder (Kraken's own fgDataFolder) as its last options argument.
const fgOptions = () => ({ dataFolder: assets.config?.fgDataFolder || undefined });

async function openFgMap(kind, key, file, mapPath, n) {
  // Assumes fgMaps.openMap(kind, key, file, path, n, registerAsset, fxSettings, fxBlur)
  // mirrors fg_maps.open_map, with registerAsset(source, ref, name, data, [w, h]) -> asset id
  // (synchronous here) and a project (or a promise of one) as its result.
  const project = await fgMaps().openMap(kind, key, file, mapPath, pyInt(n), assets.registerFgArt, assets.FX_SETTINGS, assets.FX_BLUR, fgOptions());
  return { project, assets: project.objects.map((o) => assets.publicAsset(assets.getAsset(o.assetId))) };
}

// server.py's export_foundry: the checked project, its picture and (with layers) each object's art.

// Kraken's side (set by createStudioServer's kraken option): an image's master
// opened in the editor by a token, and the editor's work saved back into it.
let kraken = null;

async function handleGet(req, res, url, webRoot) {
  if (url.pathname === "/api/kraken/open") {
    if (!kraken) return json(res, { error: "Map Studio is not running inside Kraken." }, 400);
    await assets.whenReady();
    return json(res, await kraken.open(url.searchParams.get("token") || ""));
  }
  const pathname = decodeURIComponent(url.pathname);
  const q = query(url);
  if (pathname.startsWith("/api/")) await assets.whenReady();
  if (pathname === "/api/assets") return json(res, assets.assetListing());
  if (pathname === "/api/dd/packs") return json(res, assets.ddScan().listPacks());
  if (pathname === "/api/dd/pack") return json(res, { assets: await assets.registerDdPack(q.key || "") });

  if (pathname === "/api/subscription") return json(res, assets.subscriptionStatus());
  if (pathname === "/api/projects") return json(res, { projects: assets.listProjects() });
  if (pathname.startsWith("/api/projects/")) {
    const parts = pathname.split("/");
    if (parts.length === 5 && parts[4] === "thumbnail") {
      const thumb = assets.projectThumbnail(parts[3]);
      return thumb ? reply(res, thumb, "image/webp") : json(res, { error: "Not found" }, 404);
    }
    if (parts.length === 4) return json(res, { project: assets.loadProject(parts[3]) });
    return json(res, { error: "Not found" }, 404);
  }
  if (pathname === "/api/demo") return json(res, { project: await assets.demoProject() });
  if (pathname.startsWith("/api/asset/")) {
    const key = pathname.slice(pathname.lastIndexOf("/") + 1);
    if (q.thumb) return reply(res, await assets.thumbnail(key), "image/webp");
    const [raw, ext] = await assets.assetBytes(key);
    return reply(res, raw, assets.mimeFor(ext));
  }
  // The editor's own files, never anything outside webRoot.
  const root = path.resolve(webRoot);
  const target = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
  const inside = target === root || target.startsWith(root + path.sep);
  let isFile = false;
  try {
    isFile = inside && fs.statSync(target).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) return json(res, { error: "Not found" }, 404);
  return reply(res, await fs.promises.readFile(target), STATIC_MIME[path.extname(target).toLowerCase()] || "application/octet-stream");
}

async function handlePost(req, res, url, raw) {
  await assets.whenReady();
  const pathname = url.pathname;
  if (pathname === "/api/upload") return json(res, { asset: await assets.imageImport(raw, url.searchParams.get("name") || "Artwork") });
  // Saved to Kraken: the image's master (walls, lights, weather) and, when it paints art, its picture.
  if (pathname === "/api/kraken/save") {
    if (!kraken) return json(res, { error: "Map Studio is not running inside Kraken." }, 400);
    const data = parseJson(raw);
    const project = assets.validateProject(field(data, "project"));
    return json(res, await kraken.save(String(data.token ?? ""), project, typeof data.image === "string" ? data.image : ""));
  }
  if (pathname === "/api/import") return json(res, { project: await assets.importPortable(raw) });
  if (pathname === "/api/projects") {
    const data = parseJson(raw);
    return json(res, await assets.saveProject(field(data, "project"), data.thumbnail));
  }




  if (pathname === "/api/portable") {
    const data = parseJson(raw);
    return reply(res, await assets.portableProject(field(data, "project")), "application/zip", 200, "KrakenMap.kraken.zip");
  }
  return json(res, { error: "Not found" }, 404);
}

// Reads exactly Content-Length bytes, as the Python handler does.
function readBody(req, length) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let got = 0;
    req.on("data", (chunk) => {
      if (got < length) chunks.push(chunk.subarray(0, length - got));
      got += chunk.length;
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function createStudioServer({ webRoot, dataDir, packsDir = null, examplesDir = null, fgDataFolder = null, ddFolders = null, packFolders = null, port = 0, maxBody = null, kraken: krakenSide = null } = {}) {
  if (!webRoot) throw new Error("Map Studio needs its web folder.");
  kraken = krakenSide;
  if (maxBody) assets.limits.MAX_BODY = maxBody;
  // Started now; a failure shows up as an error on each API call.
  assets.configure({ dataDir, packsDir, examplesDir, fgDataFolder, ddFolders, packFolders }).catch(() => {});

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (req.method === "GET") return await handleGet(req, res, url, webRoot);
      if (req.method !== "POST") {
        req.resume();
        return json(res, { error: "Unsupported method" }, 501);
      }
      // Local-only app: refuse browser requests started by a different origin.
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) {
        req.resume();
        return json(res, { error: "Cross-origin writes are disabled." }, 403);
      }
      const length = Number.parseInt(req.headers["content-length"] || "0", 10) || 0;
      if (length <= 0 || length > assets.limits.MAX_BODY) {
        // Drained, not read, so the client sees the answer instead of a reset connection.
        req.resume();
        res.setHeader("Connection", "close");
        return json(res, { error: "Request is empty or too large (100 MB maximum)." }, 400);
      }
      return await handlePost(req, res, url, await readBody(req, length));
    } catch (e) {
      if (res.headersSent) return res.destroy();
      return json(res, { error: errorText(e) }, 400);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const actual = server.address().port;
  return {
    port: actual,
    url: `http://127.0.0.1:${actual}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

module.exports = { createStudioServer };
