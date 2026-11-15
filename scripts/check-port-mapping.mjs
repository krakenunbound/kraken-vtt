// The router's port opened by itself (electron/portMapping.cjs), against fake
// gateways on this computer, never a real router: a UPnP Internet Gateway
// Device (its description and SOAP control) takes AddPortMapping, says the
// external address, and takes DeletePortMapping when hosting stops; one that
// refuses permanent leases gets a day's lease; with no UPnP answer, NAT-PMP at
// the gateway maps the port and unmaps it; with neither, the GM is told what
// to do by hand. And the QR encoder (src/ui/qr.ts): its codes decode to the
// invite links (OpenCV's decoder, when Python has it).
import "./loopback.mjs";
import { spawnSync } from "node:child_process";
import dgram from "node:dgram";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const results = [];

// --- A fake UPnP gateway.
function fakeGateway({ permanent = true } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/desc.xml") {
        res.writeHead(200, { "Content-Type": "text/xml" });
        res.end(`<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:1</deviceType><deviceList><device><deviceList><device><serviceList><service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/IPConn</controlURL></service></serviceList></device></deviceList></device></deviceList></device></root>`);
        return;
      }
      const action = /#(\w+)"/.exec(String(req.headers.soapaction ?? ""))?.[1] ?? "";
      const value = (name) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1] ?? "";
      calls.push({ action, port: value("NewExternalPort"), client: value("NewInternalClient"), lease: value("NewLeaseDuration"), description: value("NewPortMappingDescription") });
      if (action === "AddPortMapping" && !permanent && value("NewLeaseDuration") === "0") {
        res.writeHead(500);
        res.end("<s:Envelope><s:Body><s:Fault><detail><UPnPError><errorCode>725</errorCode><errorDescription>OnlyPermanentLeasesSupported</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/xml" });
      if (action === "GetExternalIPAddress") res.end("<s:Envelope><s:Body><u:GetExternalIPAddressResponse><NewExternalIPAddress>203.0.113.7</NewExternalIPAddress></u:GetExternalIPAddressResponse></s:Body></s:Envelope>");
      else res.end("<s:Envelope><s:Body/></s:Envelope>");
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, calls, location: `http://127.0.0.1:${server.address().port}/desc.xml` })));
}

const load = async () => {
  const url = new URL("../electron/portMapping.cjs", import.meta.url);
  url.search = `?${Math.random()}`;
  return (await import(url.href)).default;
};

process.env.KRAKEN_E2E = "1";
{
  const gateway = await fakeGateway();
  process.env.KRAKEN_UPNP_LOCATION = gateway.location;
  const { openPort } = await load();
  const opened = await openPort(47377);
  assert(opened.ok && opened.method === "UPnP" && opened.external === "203.0.113.7", `UPnP maps the port: ${JSON.stringify(opened)}`);
  const add = gateway.calls.find((call) => call.action === "AddPortMapping");
  assert(add && add.port === "47377" && add.client === "127.0.0.1" && add.lease === "0" && add.description === "Kraken VTT", `the mapping asked for: ${JSON.stringify(add)}`);
  await opened.remove();
  assert(gateway.calls.some((call) => call.action === "DeletePortMapping" && call.port === "47377"), "the mapping is removed when hosting stops");
  gateway.server.close();
  results.push("UPnP add, external address, delete");
}
{
  const gateway = await fakeGateway({ permanent: false });
  process.env.KRAKEN_UPNP_LOCATION = gateway.location;
  const { openPort } = await load();
  const opened = await openPort(47378);
  assert(opened.ok, `a router that wants a lease still maps it: ${JSON.stringify(opened)}`);
  assert(gateway.calls.filter((call) => call.action === "AddPortMapping").map((call) => call.lease).join(",") === "0,86400", `a day's lease after the refusal: ${JSON.stringify(gateway.calls)}`);
  await opened.remove();
  gateway.server.close();
  results.push("UPnP lease when permanent is refused");
}
{
  // No UPnP answer (nothing listens there): NAT-PMP at the gateway.
  process.env.KRAKEN_UPNP_LOCATION = "http://127.0.0.1:9/desc.xml";
  const seen = [];
  const pmp = dgram.createSocket("udp4");
  pmp.on("message", (message, from) => {
    seen.push([...message]);
    const opcode = message.readUInt8(1);
    if (opcode === 0) {
      const answer = Buffer.alloc(12);
      answer.writeUInt8(128, 1);
      Buffer.from([198, 51, 100, 9]).copy(answer, 8);
      pmp.send(answer, from.port, from.address);
      return;
    }
    const answer = Buffer.alloc(16);
    answer.writeUInt8(128 + opcode, 1);
    answer.writeUInt16BE(message.readUInt16BE(4), 8);
    answer.writeUInt16BE(message.readUInt16BE(6), 10);
    answer.writeUInt32BE(message.readUInt32BE(8), 12);
    pmp.send(answer, from.port, from.address);
  });
  await new Promise((resolve) => pmp.bind(0, "127.0.0.1", resolve));
  process.env.KRAKEN_NATPMP_GATEWAY = `127.0.0.1:${pmp.address().port}`;
  const { openPort } = await load();
  const opened = await openPort(47379);
  assert(opened.ok && opened.method === "NAT-PMP" && opened.external === "198.51.100.9", `NAT-PMP maps the port: ${JSON.stringify(opened)}`);
  const map = seen.find((bytes) => bytes[1] === 2);
  assert(map && ((map[4] << 8) | map[5]) === 47379, "the TCP port asked for");
  await opened.remove();
  const unmap = seen.filter((bytes) => bytes[1] === 2).at(-1);
  assert(unmap && unmap.slice(8, 12).every((byte) => byte === 0), "unmapped with a lifetime of 0");
  pmp.close();
  results.push("NAT-PMP map and unmap");
}
{
  process.env.KRAKEN_NATPMP_GATEWAY = "127.0.0.1:9";
  const { openPort } = await load();
  const failed = await openPort(47380);
  assert(!failed.ok && /Forward TCP port 47380/.test(failed.error), `with no router answering the GM is told what to do: ${failed.error}`);
  results.push("neither: what to do by hand");
}

// --- The QR codes of invite links, decoded.
const dir = mkdtempSync(path.join(tmpdir(), "kraken-qr-"));
const links = ["http://203.0.113.7:47300/#pw=dragon%20fire", "http://192.168.1.44:47433/", `http://203.0.113.7:47300/#pw=${"long-password-".repeat(5)}`];
const dump = path.join(dir, "dump.ts");
writeFileSync(dump, `import { qrModules } from ${JSON.stringify(path.resolve("src/ui/qr.ts"))};\nconsole.log(JSON.stringify(${JSON.stringify(links)}.map((text) => ({ text, rows: qrModules(text)!.map((row) => row.map((dark) => (dark ? "1" : "0")).join("")) }))));\n`);
const dumped = spawnSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), dump], { encoding: "utf8" });
assert(dumped.status === 0, `the QR encoder runs: ${dumped.stderr}`);
const decoder = path.join(dir, "decode.py");
writeFileSync(
  decoder,
  [
    "import json, sys",
    "import numpy as np, cv2",
    "out = []",
    "for item in json.loads(sys.stdin.read()):",
    "    rows = item['rows']",
    "    grid = np.pad(np.array([[0 if c == '1' else 255 for c in r] for r in rows], dtype=np.uint8), 4, constant_values=255)",
    "    image = cv2.resize(grid, (grid.shape[1] * 10, grid.shape[0] * 10), interpolation=cv2.INTER_NEAREST)",
    "    out.append(cv2.QRCodeDetector().detectAndDecode(image)[0])",
    "print(json.dumps(out))",
  ].join("\n"),
);
const decoded = spawnSync("python", ["-I", decoder], { input: dumped.stdout, encoding: "utf8" });
if (decoded.status === 0) {
  const texts = JSON.parse(decoded.stdout);
  assert(JSON.stringify(texts) === JSON.stringify(links), `the QR codes decode to the links: ${decoded.stdout}`);
  results.push("QR codes decode");
} else console.log(`(QR decoding skipped: Python with OpenCV is not here: ${decoded.stderr.split("\n").filter(Boolean).at(-1) ?? ""})`);

console.log(`PORT_MAPPING_OK ${results.join("; ")}`);
