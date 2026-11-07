// Players' accounts on the GM's app (Foundry's users, kept by the host, not
// a company's server): one per player name, for every campaign this GM runs.
// A password is kept only as a salted scrypt hash; a browser that signed in
// keeps a token, of which only a SHA-256 is kept here. A player's characters
// belong to the account's name, so no one else can sit under it.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAX_ACCOUNTS = 500;
const MAX_TOKENS = 10;
const MIN_PASSWORD = 6;

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, max);
const key = (name) => clean(name, 24).toLowerCase();
const sha = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");

function hash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 32).toString("hex") };
}
function same(a, b) {
  const left = Buffer.from(String(a), "hex");
  const right = Buffer.from(String(b), "hex");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function createAccountStore(file) {
  /** @type {Map<string, { name: string, salt: string, hash: string, tokens: { hash: string, at: number }[], createdAt: number, seenAt: number | null }>} */
  const accounts = new Map();
  try {
    const parsed = file ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    for (const row of Array.isArray(parsed?.accounts) ? parsed.accounts : []) {
      const name = clean(row?.name, 24);
      if (!name || typeof row.salt !== "string" || typeof row.hash !== "string") continue;
      const tokens = (Array.isArray(row.tokens) ? row.tokens : []).filter((token) => token && typeof token.hash === "string").slice(-MAX_TOKENS);
      accounts.set(key(name), { name, salt: row.salt, hash: row.hash, tokens, createdAt: Number(row.createdAt) || Date.now(), seenAt: Number(row.seenAt) || null });
    }
  } catch {
    /* No accounts yet. */
  }
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ accounts: [...accounts.values()] }));
    fs.renameSync(temp, file);
  };
  const checkPassword = (password) => {
    if (String(password ?? "").length < MIN_PASSWORD) throw new Error(`A password is at least ${MIN_PASSWORD} characters.`);
    if (String(password).length > 200) throw new Error("That password is too long.");
  };
  // A new token for a browser that signed in: given out once, kept as a hash.
  const issue = (account) => {
    const token = crypto.randomBytes(24).toString("hex");
    account.tokens = [...account.tokens, { hash: sha(token), at: Date.now() }].slice(-MAX_TOKENS);
    account.seenAt = Date.now();
    save();
    return token;
  };

  return {
    // What the GM is shown: never a hash.
    list: () => [...accounts.values()].map(({ name, createdAt, seenAt, tokens }) => ({ name, createdAt, seenAt, devices: tokens.length })).sort((a, b) => a.name.localeCompare(b.name)),
    has: (name) => accounts.has(key(name)),
    // The account's own spelling of a name ("the kraken" signs in as "The Kraken").
    nameOf: (name) => accounts.get(key(name))?.name ?? null,
    // A player makes their account the first time they sit (or the GM makes one for them).
    // signIn: a player making their own (their browser gets a token); the GM making one ahead does not.
    create(name, password, { signIn = true } = {}) {
      const wanted = clean(name, 24);
      if (!wanted) throw new Error("Give the player's name.");
      if (accounts.has(key(wanted))) throw new Error(`${wanted} already has an account.`);
      if (accounts.size >= MAX_ACCOUNTS) throw new Error("There are too many accounts.");
      checkPassword(password);
      const account = { name: wanted, ...hash(password), tokens: [], createdAt: Date.now(), seenAt: null };
      accounts.set(key(wanted), account);
      if (!signIn) {
        save();
        return { name: account.name, token: "" };
      }
      return { name: account.name, token: issue(account) };
    },
    // Signing in: with the password, or a token a browser kept. A new token comes back.
    signIn(name, { password = "", token = "" } = {}) {
      const account = accounts.get(key(name));
      if (!account) return null;
      if (token && account.tokens.some((item) => same(item.hash, sha(token)))) {
        account.seenAt = Date.now();
        save();
        return { name: account.name, token };
      }
      if (password && same(hash(password, account.salt).hash, account.hash)) return { name: account.name, token: issue(account) };
      return null;
    },
    // A browser signs out: its token is forgotten.
    signOut(name, token) {
      const account = accounts.get(key(name));
      if (!account || !token) return false;
      const before = account.tokens.length;
      account.tokens = account.tokens.filter((item) => !same(item.hash, sha(token)));
      if (account.tokens.length !== before) save();
      return account.tokens.length !== before;
    },
    // The GM sets a new password (a player who forgot theirs); every browser is signed out.
    setPassword(name, password) {
      const account = accounts.get(key(name));
      if (!account) throw new Error(`No account named ${clean(name, 24)}.`);
      checkPassword(password);
      Object.assign(account, hash(password), { tokens: [] });
      save();
      return { name: account.name };
    },
    remove(name) {
      const account = accounts.get(key(name));
      if (!account) throw new Error(`No account named ${clean(name, 24)}.`);
      accounts.delete(key(name));
      save();
      return { name: account.name };
    },
  };
}

module.exports = { createAccountStore, MIN_PASSWORD };
