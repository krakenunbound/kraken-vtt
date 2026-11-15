// Players on the internet without the GM touching the router: the table's
// port opened on the router while Kraken hosts, and closed again when it stops.
// UPnP (an Internet Gateway Device found by SSDP, asked by SOAP) first, then
// NAT-PMP (RFC 6886) at the network's gateway. Node's own dgram and http, no
// dependency. Tests point it at a fake gateway (KRAKEN_UPNP_LOCATION,
// KRAKEN_NATPMP_GATEWAY); a test run (KRAKEN_E2E) never touches a real router.
const dgram = require("dgram");
const http = require("http");
const os = require("os");

const SSDP = { address: "239.255.255.250", port: 1900 };
const SEARCH_TARGETS = ["urn:schemas-upnp-org:device:InternetGatewayDevice:1", "urn:schemas-upnp-org:device:InternetGatewayDevice:2", "urn:schemas-upnp-org:service:WANIPConnection:1"];
const SERVICES = ["urn:schemas-upnp-org:service:WANIPConnection:2", "urn:schemas-upnp-org:service:WANIPConnection:1", "urn:schemas-upnp-org:service:WANPPPConnection:1"];
const DESCRIPTION = "Kraken VTT";

// The LOCATION headers of the gateways that answer an SSDP search (a few seconds at most).
function discover(timeout = 2500) {
  const fixed = process.env.KRAKEN_UPNP_LOCATION;
  if (fixed) return Promise.resolve([fixed]);
  if (process.env.KRAKEN_E2E === "1") return Promise.resolve([]);
  return new Promise((resolve) => {
    const found = new Set();
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const done = () => {
      try {
        socket.close();
      } catch {
        /* closed */
      }
      resolve([...found]);
    };
    socket.on("error", done);
    socket.on("message", (data) => {
      const location = /^location:\s*(\S+)/im.exec(data.toString("utf8"))?.[1];
      if (location && /^http:\/\//i.test(location)) found.add(location);
    });
    socket.bind(0, () => {
      for (const target of SEARCH_TARGETS) {
        const search = Buffer.from(["M-SEARCH * HTTP/1.1", `HOST: ${SSDP.address}:${SSDP.port}`, 'MAN: "ssdp:discover"', "MX: 2", `ST: ${target}`, "", ""].join("\r\n"));
        socket.send(search, SSDP.port, SSDP.address, () => undefined);
      }
    });
    setTimeout(done, timeout);
  });
}

function request(url, { method = "GET", headers = {}, body = "" } = {}, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { ...headers, ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}) }, timeout }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8").slice(0, 200000) }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("The router did not answer.")));
    if (body) req.write(body);
    req.end();
  });
}

const tag = (xml, name) => new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`, "i").exec(xml)?.[1]?.trim() ?? "";

// The gateway's WAN connection service: its control address and type.
async function controlOf(location) {
  const { text } = await request(location);
  for (const service of SERVICES) {
    const at = text.indexOf(service);
    if (at < 0) continue;
    const block = text.slice(text.lastIndexOf("<service>", at), text.indexOf("</service>", at));
    const path = tag(block, "controlURL");
    if (!path) continue;
    const base = tag(text, "URLBase") || location;
    return { url: new URL(path, base).toString(), service };
  }
  throw new Error("The router has no port mapping service.");
}

async function soap(control, action, args) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${control.service}">${Object.entries(args)
    .map(([key, value]) => `<${key}>${String(value).replace(/[<>&]/g, "")}</${key}>`)
    .join("")}</u:${action}></s:Body></s:Envelope>`;
  const answer = await request(control.url, { method: "POST", headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: `"${control.service}#${action}"` }, body });
  if (answer.status !== 200) throw new Error(tag(answer.text, "errorDescription") || `The router refused (${tag(answer.text, "errorCode") || answer.status}).`);
  return answer.text;
}

// This computer's address on the router's network (the one that shares its first three parts), else the first.
function localAddressFor(host) {
  const all = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
  if (host === "127.0.0.1") return "127.0.0.1";
  const prefix = String(host).split(".").slice(0, 3).join(".");
  return all.find((address) => address.startsWith(`${prefix}.`)) ?? all[0] ?? "";
}

async function upnpMap(port) {
  const locations = await discover();
  let lastError = null;
  for (const location of locations) {
    try {
      const control = await controlOf(location);
      const client = localAddressFor(new URL(location).hostname);
      const mapping = { NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP", NewInternalPort: port, NewInternalClient: client, NewEnabled: 1, NewPortMappingDescription: DESCRIPTION };
      let renew = null;
      try {
        await soap(control, "AddPortMapping", { ...mapping, NewLeaseDuration: 0 });
      } catch {
        // Some routers take only leases with an end: a day, renewed every twelve hours while hosting.
        await soap(control, "AddPortMapping", { ...mapping, NewLeaseDuration: 86400 });
        renew = setInterval(() => soap(control, "AddPortMapping", { ...mapping, NewLeaseDuration: 86400 }).catch(() => undefined), 12 * 3600_000);
        renew.unref?.();
      }
      let external = "";
      try {
        external = tag(await soap(control, "GetExternalIPAddress", {}), "NewExternalIPAddress");
      } catch {
        /* the address is looked up elsewhere too */
      }
      return { method: "UPnP", external, remove: () => (clearInterval(renew), soap(control, "DeletePortMapping", { NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP" }).then(() => undefined)) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No router answered UPnP.");
}

// NAT-PMP: two UDP messages to the gateway (port 5351).
function natPmpAsk(gateway, message, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("No NAT-PMP gateway answered."));
    }, timeout);
    socket.on("error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
    socket.on("message", (data) => {
      clearTimeout(timer);
      socket.close();
      resolve(data);
    });
    socket.send(message, gateway.port, gateway.host);
  });
}
function natPmpGateways() {
  const fixed = process.env.KRAKEN_NATPMP_GATEWAY;
  if (fixed) {
    const [host, port] = fixed.split(":");
    return [{ host, port: Number(port) || 5351 }];
  }
  if (process.env.KRAKEN_E2E === "1") return [];
  // The usual gateway: the network's .1.
  const all = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal && /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(item.address));
  return [...new Set(all.map((item) => item.address.split(".").slice(0, 3).join(".") + ".1"))].map((host) => ({ host, port: 5351 }));
}
function natPmpMapping(port, lifetime) {
  const message = Buffer.alloc(12);
  message.writeUInt8(0, 0);
  message.writeUInt8(2, 1); // TCP
  message.writeUInt16BE(port, 4);
  message.writeUInt16BE(lifetime ? port : 0, 6);
  message.writeUInt32BE(lifetime, 8);
  return message;
}
async function natPmpMap(port) {
  let lastError = null;
  for (const gateway of natPmpGateways()) {
    try {
      const answer = await natPmpAsk(gateway, natPmpMapping(port, 7200));
      if (answer.length < 16 || answer.readUInt8(1) !== 130) throw new Error("The gateway's NAT-PMP answer was not understood.");
      const code = answer.readUInt16BE(2);
      if (code !== 0) throw new Error(`The gateway refused the port (NAT-PMP ${code}).`);
      let external = "";
      try {
        const address = await natPmpAsk(gateway, Buffer.from([0, 0]));
        if (address.length >= 12 && address.readUInt16BE(2) === 0) external = [8, 9, 10, 11].map((at) => address.readUInt8(at)).join(".");
      } catch {
        /* looked up elsewhere too */
      }
      // The lease is renewed while hosting (every hour of its two).
      const renew = setInterval(() => natPmpAsk(gateway, natPmpMapping(port, 7200)).catch(() => undefined), 3600_000);
      renew.unref?.();
      return {
        method: "NAT-PMP",
        external,
        remove: () => {
          clearInterval(renew);
          return natPmpAsk(gateway, natPmpMapping(port, 0)).then(() => undefined);
        },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No NAT-PMP gateway found.");
}

// Open the port: { ok, method, external, port } or { ok: false, error }; remove() closes it again.
async function openPort(port) {
  const tried = [];
  for (const attempt of [upnpMap, natPmpMap]) {
    try {
      const mapped = await attempt(port);
      return { ok: true, method: mapped.method, external: mapped.external, port, remove: mapped.remove };
    } catch (error) {
      tried.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { ok: false, port, error: `Your router did not open the port by itself (${tried.join("; ")}). Forward TCP port ${port} to this computer in the router's settings, or turn on UPnP there.` };
}

module.exports = { openPort, discover, localAddressFor };
