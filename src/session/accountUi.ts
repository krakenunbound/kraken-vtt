// Layout and interface settings follow the person, not the browser: everything this screen keeps under "kraken-"
// (windows' places, the sidebar, the chat's size, the UI scale, the map's toolbar, quick slots' place, dice tray...)
// is kept by the GM's app with their account (prefs.ui) and comes back wherever they sit down next, the app or
// Chrome. What belongs to this device alone stays here: signing in, the tables this browser joined, an unsent line.
import { restoreUiScale } from "../ui/chatCommands";

const LOCAL_ONLY = /^kraken-(signin:|recent-games|chat-draft)/;
const synced = (key: string) => key.startsWith("kraken-") && !LOCAL_ONLY.test(key) && key.length <= 120;
const MAX_VALUE = 20000;

let send: ((ui: Record<string, string | null>) => void) | null = null;
let applying = false;
let pending: Record<string, string | null> = {};
let timer: number | undefined;

function flush() {
  timer = undefined;
  const patch = pending;
  pending = {};
  if (send && Object.keys(patch).length) send(patch);
}
function queue(key: string, value: string | null) {
  if (applying || !send || !synced(key) || (value !== null && value.length > MAX_VALUE)) return;
  pending[key] = value;
  if (timer === undefined) timer = window.setTimeout(flush, 600);
}

// Every change to this screen's settings, as it is made, goes to the account.
let installed = false;
function install() {
  if (installed) return;
  installed = true;
  const proto = Storage.prototype;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;
  proto.setItem = function (key: string, value: string) {
    setItem.call(this, key, value);
    if (this === window.localStorage) queue(String(key), String(value));
  };
  proto.removeItem = function (key: string) {
    removeItem.call(this, key);
    if (this === window.localStorage) queue(String(key), null);
  };
}

// On sitting down: the account's settings onto this screen (before the desktop draws), and this screen's own
// that the account has never had go up to it (the first device seeds the account).
export function adoptAccountUi(ui: unknown, sender: (patch: Record<string, string | null>) => void) {
  install();
  send = sender;
  const kept = ui && typeof ui === "object" ? (ui as Record<string, unknown>) : {};
  applying = true;
  try {
    for (const [key, value] of Object.entries(kept)) {
      if (!synced(key)) continue;
      if (typeof value === "string") {
        if (window.localStorage.getItem(key) !== value) window.localStorage.setItem(key, value);
      } else if (value === null) window.localStorage.removeItem(key);
    }
  } catch {
    /* storage refused: this screen keeps its own */
  } finally {
    applying = false;
  }
  restoreUiScale();
  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (key && synced(key) && !(key in kept)) queue(key, window.localStorage.getItem(key));
    }
  } catch {
    /* nothing to send */
  }
}
// The account's settings changed from another of their screens (both open at once).
export function accountUiChanged(ui: unknown) {
  if (!ui || typeof ui !== "object") return;
  applying = true;
  try {
    for (const [key, value] of Object.entries(ui as Record<string, unknown>)) {
      if (!synced(key)) continue;
      if (typeof value === "string" && window.localStorage.getItem(key) !== value) window.localStorage.setItem(key, value);
    }
  } catch {
    /* storage refused */
  } finally {
    applying = false;
  }
}
