import { useEffect, useRef, useState, type FormEvent } from "react";
import { BRAND } from "../../shared/brand.mjs";
import { emblemKey, RulesetEmblem } from "./RulesetEmblem";
import { UpdateNotice } from "./UpdateNotice";
import { CampaignMenu } from "./CampaignMenu";
import { LivingEmblem, Mark } from "../ui/Emblem";
import type { KrakenCampaign, KrakenNetwork } from "../kraken";
import "@fontsource/cinzel/latin-500.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import { Backdrop, BackdropDots, randomTheme } from "./Backdrop";
import { forgetSignIn, savedSignIn } from "../session/useSession";
import { campaignRulesets } from "../../shared/rulesets/registry.mjs";
import "./setup.css";
import { Icon } from "../ui/icons";
import { ReleaseNotes } from "./ReleaseNotes";

type HostInput = { name: string; port: number; password: string; lan: boolean; cloud: boolean; upnp?: boolean; campaignId: string };
// accountPassword: the player's own password (their account at that table).
type JoinInput = { name: string; address: string; port: number; password: string; accountPassword?: string };

const EMPTY_NET: KrakenNetwork = { v4: [], v6: [], externalV4: "", externalV6: "" };

// The games this screen has joined, newest first, for a quick way back in.
type RecentGame = { name: string; address: string; port: number; password: string; at: number };
const RECENT_KEY = "kraken-recent-games";
function recentGames(): RecentGame[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((game) => game && typeof game.address === "string" && Number.isInteger(game.port)).slice(0, 8) : [];
  } catch {
    return [];
  }
}
function saveRecentGames(list: RecentGame[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* this screen only */
  }
}
function rememberGame(game: RecentGame) {
  saveRecentGames([game, ...recentGames().filter((other) => !(other.address === game.address && other.port === game.port))]);
}

// The rulesets a campaign can be made with: every manifest's names, each with its blurb (shared/rulesets).
const RULESETS = campaignRulesets();

const RELATIVE = typeof Intl !== "undefined" && "RelativeTimeFormat" in Intl ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;

function ago(stamp: number): string {
  const days = Math.round((stamp - Date.now()) / 86400000);
  if (!RELATIVE) return new Date(stamp).toLocaleDateString();
  if (days === 0) {
    const hours = Math.round((stamp - Date.now()) / 3600000);
    return hours === 0 ? "just now" : RELATIVE.format(hours, "hour");
  }
  if (Math.abs(days) < 30) return RELATIVE.format(days, "day");
  if (Math.abs(days) < 365) return RELATIVE.format(Math.round(days / 30), "month");
  return RELATIVE.format(Math.round(days / 365), "year");
}

function formatPlayed(campaign: KrakenCampaign): string {
  if (!campaign.playedAt) return `Begun ${ago(campaign.createdAt)}, not played yet.`;
  const when = new Date(campaign.playedAt).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return `Last played ${when}.`;
}

// Each campaign's own colour, from its name.
function hueOf(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function Crest({ name }: { name: string }) {
  const hue = hueOf(name);
  const initials = name
    .split(/\s+/)
    .filter((word) => /^[a-z0-9]/i.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
  return (
    <svg className="crest" viewBox="0 0 40 46" aria-hidden="true">
      <defs>
        <linearGradient id={`crest-${hue}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 45% 34%)`} />
          <stop offset="1" stopColor={`hsl(${hue} 50% 14%)`} />
        </linearGradient>
      </defs>
      <path d="M20 1 L38 7 V22 C38 33 30 40 20 45 C10 40 2 33 2 22 V7 Z" fill={`url(#crest-${hue})`} stroke="#d9b06a" strokeWidth="1.4" />
      <path d="M20 5 L34 9.6 V22 C34 31 27.5 36.6 20 40.6 C12.5 36.6 6 31 6 22 V9.6 Z" fill="none" stroke="#d9b06a" strokeOpacity="0.35" strokeWidth="0.8" />
      <text x="20" y="27" textAnchor="middle" className="crest-letters">
        {initials || "K"}
      </text>
    </svg>
  );
}

// Puts text on the clipboard: the page's own clipboard first, the app's
// (Electron's) when the page may not write it. True when it got there.
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The app's clipboard below.
  }
  try {
    if (!window.kraken?.copy) return false;
    return (await window.kraken.copy(text)) !== false;
  } catch {
    return false;
  }
}

// Help on the start screen (as FG's launcher has): the wiki's quickstart and pages, the release
// notes, a bug report, the community and the Discord server, in the system's browser (a player's: a new tab).
const WIKI = "https://krakenunbound.github.io/maelstrom-vtt/";
const REPO = "https://github.com/krakenunbound/maelstrom-vtt";
const DISCORD = "https://discord.gg/8jj4v8UdXr";
// Each its own icon and colour (Kraken's ink: violet, ember, sea), none of FG's.
const HELP_LINKS = [
  { label: "Quickstart guide", href: `${WIKI}quickstart.html`, title: "From a new campaign to the first fight, in ten steps", icon: "play", tone: "sea" },
  { label: "Tutorials", href: `${WIKI}tutorials.html`, title: "Short walkthroughs: revealing monsters, running a fight, range, languages, treasure, group saves", icon: "levelup", tone: "violet" },
  { label: "Wiki", href: WIKI, title: "Every part of Maelstrom, for GMs and players", icon: "book", tone: "ember" },
  { label: "Game guides", href: `${WIKI}games.html`, title: "The games Maelstrom plays, and their sheets and rules", icon: "d20", tone: "sea" },
  { label: "Release notes", href: `${REPO}/releases`, title: "What each version brought, read here", icon: "bell", tone: "violet", notes: true },
  { label: "Report a bug", href: `${REPO}/issues/new`, title: "Tell us what went wrong (a GitHub account is needed)", icon: "warning", tone: "ember" },
  { label: "Community", href: `${REPO}/discussions`, title: "Questions, ideas and tables looking for players", icon: "players", tone: "sea" },
  { label: "Discord", href: DISCORD, title: "Chat with other GMs and players, get help, find a table", icon: "chat", tone: "violet" },
];
function HelpLinks() {
  const [notes, setNotes] = useState(false);
  return (
    <nav className="help-links rise" aria-label="Help">
      {HELP_LINKS.map((link) =>
        link.notes ? (
          <button key={link.label} type="button" className={`help-link tone-${link.tone}`} title={link.title} data-help-link={link.label} onClick={() => setNotes(true)}>
            <span className="help-icon" aria-hidden="true">
              <Icon name={link.icon} size={15} />
            </span>
            {link.label}
          </button>
        ) : (
          <a key={link.label} className={`help-link tone-${link.tone}`} href={link.href} target="_blank" rel="noopener noreferrer" title={link.title} data-help-link={link.label}>
            <span className="help-icon" aria-hidden="true">
              <Icon name={link.icon} size={15} />
            </span>
            {link.label}
          </a>
        ),
      )}
      <ReleaseNotes open={notes} onClose={() => setNotes(false)} allUrl={`${REPO}/releases`} />
    </nav>
  );
}

// The link a player clicks (pasted into Discord or an email): it opens the table in their browser.
// IPv6 goes in brackets; a link-local one (fe80::) needs this computer's own zone and does not work as a link.
export function tableLink(address: string, port: number | string) {
  if (!address) return "";
  if (address.includes(":")) return /^fe80:/i.test(address) ? "" : `http://[${address}]:${port}/`;
  return `http://${address}:${port}/`;
}

function CopyAddress({ label, value, port }: { label: string; value: string; port?: number | string }) {
  const [state, setState] = useState<"" | "copied" | "failed">("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const link = port ? tableLink(value, port) : "";
  const shown = link || value;
  const copy = async () => {
    const ok = await copyText(shown);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState(""), 1800);
  };
  return (
    <p className="addr">
      <span className="addr-label">{label}</span>
      {value ? (
        <>
          <span className="secret" data-link={link || undefined}>{shown}</span>
          <button type="button" className={state ? `addr-copy ${state}` : "addr-copy"} title={link ? "Copy the link: pasted into Discord or an email, a click opens the table in a browser" : undefined} aria-label={`Copy ${label} ${shown}`} aria-live="polite" onClick={() => void copy()}>
            {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy"}
          </button>
        </>
      ) : (
        <span className="hint">None</span>
      )}
    </p>
  );
}

export function SetupScreen({
  busy,
  error,
  canHost,
  onHost,
  onJoin,
}: {
  busy: boolean;
  error: string | null;
  canHost: boolean;
  onHost: (input: HostInput) => Promise<unknown>;
  onJoin: (input: JoinInput) => Promise<boolean | void>;
}) {
  // Opened in a browser from the host's address: this page is a player's way in.
  const inBrowser = !window.kraken && window.location.protocol.startsWith("http");
  // In a browser at the table's own address: whether this browser is signed in there.
  const browserTable = inBrowser ? `${window.location.hostname}:${window.location.port || (window.location.protocol === "https:" ? "443" : "80")}` : "";
  const [signIn, setSignIn] = useState(() => (browserTable ? savedSignIn(browserTable) : null));
  // Home: the two ways in, side by side; then a campaign to run, or a game to join.
  const [mode, setMode] = useState<"home" | "campaigns" | "join">(inBrowser ? "join" : "home");
  // A different painted scene each time Kraken opens; the dots show them all.
  const [theme, setTheme] = useState(randomTheme);
  const [recent, setRecent] = useState<RecentGame[]>(() => recentGames());
  const [joinFill, setJoinFill] = useState<RecentGame | null>(null);
  const [rows, setRows] = useState<KrakenCampaign[]>([]);
  const [network, setNetwork] = useState<KrakenNetwork>(EMPTY_NET);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ruleset, setRuleset] = useState(RULESETS[0].name);
  // The rulesets: found by a part of the name or blurb once there are many;
  // each with the GM's own picture for it, if they keep one.
  const [rulesetQuery, setRulesetQuery] = useState("");
  const [rulesetLogos, setRulesetLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    void window.kraken
      ?.rulesetLogos?.()
      .then((found) => setRulesetLogos(found.logos))
      .catch(() => undefined);
  }, []);
  const rulesetsShown = RULESETS.filter((item) => !rulesetQuery || `${item.name} ${item.blurb}`.toLowerCase().includes(rulesetQuery.toLowerCase()));
  const chosen = RULESETS.find((item) => item.name === ruleset);
  const [beckon, setBeckon] = useState(0);
  const newName = useRef<HTMLInputElement>(null);
  const [lanOn, setLanOn] = useState(true);
  const [cloudOn, setCloudOn] = useState(false);
  // Internet play: the router asked to open the port by itself (UPnP / NAT-PMP).
  const [upnpOn, setUpnpOn] = useState(true);
  // An invite link's table password (its #pw= fragment: never sent to the server), taken out of the address bar.
  const [invitePassword] = useState(() => {
    if (!inBrowser) return "";
    // Kept for this tab (a reload, or the join screen again after a drop, still has it).
    const key = `kraken-invite:${window.location.host}`;
    const found = /(?:^#|&)pw=([^&]*)/.exec(window.location.hash);
    if (!found) {
      try {
        return window.sessionStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    }
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      /* the address bar keeps it */
    }
    let password = found[1];
    try {
      password = decodeURIComponent(found[1]);
    } catch {
      /* as it is */
    }
    try {
      window.sessionStorage.setItem(key, password);
    } catch {
      /* this tab only */
    }
    return password;
  });
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    window.kraken
      ?.campaigns()
      .then((list) => {
        if (!cancel) setRows(list);
      })
      .catch(() => undefined);
    window.kraken
      ?.network()
      .then((info) => {
        if (!cancel) setNetwork(info);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  // The campaign menu open, and where; the list read again after a change (a copy selected).
  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);
  async function reloadCampaigns(select?: string) {
    const list = await window.kraken?.campaigns().catch(() => null);
    if (!list) return;
    setRows(list);
    if (select) setSelectedId(select);
    else setSelectedId((current) => (current && list.some((item) => item.id === current) ? current : null));
  }
  const shown = rows
    .filter((campaign) => campaign.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.playedAt ?? b.createdAt) - (a.playedAt ?? a.createdAt));
  const selected = rows.find((campaign) => campaign.id === selectedId) ?? null;
  // The port in the host form (the links to give players carry it).
  const [hostPort, setHostPort] = useState<string>("");
  useEffect(() => setHostPort(String(selected?.port ?? "")), [selected?.id, selected?.port]);
  const alert = localError || error;

  // "New campaign": the form comes into view (below the list in a narrow
  // window), its name ready to type, and it glows to say here.
  function newCampaign() {
    setSelectedId(null);
    setBeckon((count) => count + 1);
  }
  useEffect(() => {
    if (!beckon) return;
    const input = newName.current;
    if (!input) return;
    input.closest("form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    input.focus({ preventScroll: true });
  }, [beckon]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("new-campaign") || "");
    setLocalError(null);
    try {
      if (!window.kraken) throw new Error("Campaigns are stored in the Maelstrom VTT app.");
      const campaign = await window.kraken.saveCampaign({ name, ruleset: String(data.get("new-ruleset") || ruleset) });
      setRows((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
      setSelectedId(campaign.id);
      form.reset();
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Could not create that campaign.");
    }
  }

  async function play(event: FormEvent<HTMLFormElement>, campaign: KrakenCampaign) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const port = Number(data.get("port"));
    const password = String(data.get("password") || "");
    const name = String(data.get("dm-name") || "").trim() || "DM";
    setLocalError(null);
    if (!lanOn && !cloudOn) {
      setLocalError("Turn on LAN or Internet.");
      return;
    }
    try {
      const touched = await window.kraken?.touchCampaign({ id: campaign.id, port, gmName: name });
      if (touched) setRows((current) => current.map((item) => (item.id === touched.id ? touched : item)));
    } catch {
      /* The table can still start if the date stamp fails. */
    }
    await onHost({ name, port, password, lan: lanOn, cloud: cloudOn, upnp: cloudOn && upnpOn, campaignId: campaign.id });
  }

  // Joining; a game joined is kept for a quick way back.
  async function join(game: JoinInput) {
    setLocalError(null);
    try {
      // Only a game that let us in is kept, without the player's own password
      // (the host gave this browser a token for that).
      if ((await onJoin(game)) === false) {
        // A sign-in the table no longer takes is gone: the password is asked again.
        if (browserTable) setSignIn(savedSignIn(browserTable));
        return;
      }
      const { accountPassword: _secret, ...kept } = game;
      rememberGame({ ...kept, at: Date.now() });
      setRecent(recentGames());
    } catch {
      /* the error shows */
    }
  }
  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void join({
      name: String(data.get("name") || "Player"),
      address: String(data.get("address") || ""),
      port: Number(data.get("port")),
      password: String(data.get("password") || ""),
      accountPassword: String(data.get("account-password") || ""),
    });
  }
  function forget(game: RecentGame) {
    saveRecentGames(recentGames().filter((other) => !(other.address === game.address && other.port === game.port)));
    setRecent(recentGames());
  }
  const recentList = (compact: boolean) =>
    recent.length > 0 ? (
      <div className={compact ? "recent-games compact" : "recent-games"}>
        {compact ? null : <h2>Recent games</h2>}
        {recent.slice(0, compact ? 3 : 8).map((game) => (
          <div key={`${game.address}:${game.port}`} className="recent-game" data-recent={`${game.address}:${game.port}`}>
            <button
              type="button"
              className="recent-join"
              disabled={busy}
              title={`Join ${game.address}:${game.port} as ${game.name}`}
              onClick={(event) => {
                event.stopPropagation();
                void join(game);
              }}
            >
              <b>{game.name}</b>
              <small>
                {game.address}:{game.port}
                {game.password ? " · password" : ""} · {ago(game.at)}
              </small>
            </button>
            {compact ? null : (
              <>
                <button type="button" className="ghost recent-fill" title="Fill the form with it, to change something first" onClick={() => setJoinFill(game)}>
                  Edit
                </button>
                <button type="button" className="ghost recent-forget" aria-label={`Forget ${game.address}:${game.port}`} title="Forget it" onClick={() => forget(game)}>
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    ) : null;

  const alertLine = alert ? (
    <p className="error" role="alert">
      {alert}
    </p>
  ) : null;

  return (
    <div className={`setup setup-${mode}`}>
      <Backdrop theme={theme} />
      <BackdropDots theme={theme} onPick={setTheme} />
      <header className="setup-bar">
        <div className="brand">
          <Mark /> {BRAND.short} <span className="brand-sub">{BRAND.sub}</span> <span className="brand-version" title="Alpha test version">{__KRAKEN_VERSION__}</span>
        </div>
        {inBrowser || mode === "home" ? null : (
          <button type="button" className="join-toggle" data-action="home" onClick={() => setMode("home")}>
            ‹ Home
          </button>
        )}
      </header>
      {/* A new Kraken: on the start screen only, never once a campaign is open. */}
      {inBrowser ? null : <UpdateNotice />}

      {mode === "home" ? (
        <main className="home-stage">
          <div className="home-hero rise">
            <LivingEmblem size={170} />
            <div>
              <p className="hero-kicker">Virtual tabletop</p>
              <h1 className="hero-title">{BRAND.short}</h1>
              <p className="hero-tag">Gather your party. The tide is turning.</p>
            </div>
          </div>
          <div className="home-cards">
            <button type="button" className="home-card glass rise" data-action="campaigns-mode" onClick={() => setMode("campaigns")}>
              <span className="home-card-icon" aria-hidden>
                <Mark />
              </span>
              <h2>My Campaigns</h2>
              <p>Run a game: create a campaign, or load one, and host it for your players.</p>
              <span className="home-card-meta">{rows.length === 0 ? "No campaigns yet" : `${rows.length} campaign${rows.length === 1 ? "" : "s"}${shown[0] ? ` · last: ${shown[0].name}` : ""}`}</span>
              <span className="home-card-go">Create or load ›</span>
            </button>
            <div className="home-card glass rise" role="button" tabIndex={0} data-action="join-mode" onClick={() => setMode("join")} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setMode("join")}>
              <span className="home-card-icon join" aria-hidden>
                ⚔
              </span>
              <h2>Join a Game</h2>
              <p>Sit at someone's table: the address and port your GM gives you, and the password if there is one.</p>
              {recentList(true) ?? <span className="home-card-meta">Games you join are kept here</span>}
              <span className="home-card-go">Connect ›</span>
            </div>
          </div>
          <HelpLinks />
          {alertLine}
        </main>
      ) : mode === "join" ? (
        <main className="join-stage">
          <form key={joinFill ? `${joinFill.address}:${joinFill.port}` : "new"} className="join-panel glass" data-form="join" onSubmit={submitJoin}>
            <LivingEmblem size={170} />
            <h1>Take your seat</h1>
            {inBrowser ? (
              <p className="join-lede">
                The table at <span className="secret">{window.location.host}</span> is waiting. Leave the table password blank when the game is public.
              </p>
            ) : (
              <p className="join-lede">Use the address and port from your GM. Leave the table password blank when the game is public.</p>
            )}
            {signIn ? (
              // Signed in here before: the token this browser kept is enough.
              <p className="join-signed-in" data-signed-in={signIn.name}>
                <input type="hidden" name="name" value={signIn.name} />
                Signed in as <b>{signIn.name}</b>.{" "}
                <button
                  type="button"
                  className="link-button"
                  data-action="join-sign-out"
                  onClick={() => {
                    forgetSignIn(browserTable);
                    setSignIn(null);
                  }}
                >
                  Not you? Sign out
                </button>
              </p>
            ) : (
              <>
                <label className="field">
                  <span>Your name</span>
                  <input name="name" defaultValue={joinFill?.name ?? (inBrowser ? recent.find((game) => game.address === window.location.hostname)?.name ?? "" : "Player")} placeholder="What does the table call you?" maxLength={24} autoComplete="username" required={inBrowser} />
                </label>
                <label className="field">
                  <span>Your password</span>
                  <input name="account-password" type="password" placeholder="Yours alone: it keeps your characters yours" autoComplete="current-password" minLength={4} maxLength={200} required />
                </label>
                <p className="hint">The first time at this table, choose one. Next time this browser remembers you.</p>
              </>
            )}
            {inBrowser ? (
              <>
                <input type="hidden" name="address" value={window.location.hostname} />
                <input type="hidden" name="port" value={window.location.port || (window.location.protocol === "https:" ? "443" : "80")} />
              </>
            ) : (
              <div className="field-pair">
                <label className="field">
                  <span>Address</span>
                  <input name="address" placeholder="192.168.1.20" required autoComplete="off" defaultValue={joinFill?.address ?? ""} />
                </label>
                <label className="field port">
                  <span>Port</span>
                  <input name="port" type="number" min={1} max={65535} defaultValue={joinFill?.port ?? 47300} required />
                </label>
              </div>
            )}
            <label className="field">
              <span>Table password</span>
              <input name="password" type="text" placeholder="The GM's, blank if the game is public" autoComplete="off" defaultValue={joinFill?.password ?? invitePassword} />
            </label>
            <button type="submit" className="play-button grand" disabled={busy}>
              {busy ? "Joining…" : "Take your seat"}
            </button>
            {alertLine}
          </form>
          {inBrowser ? null : recentList(false)}
        </main>
      ) : (
        <main className="campaign-stage">
          <section className="campaign-column glass">
            <div className="campaign-hero">
              <LivingEmblem size={150} />
              <div className="hero-words">
                <p className="hero-kicker">Virtual tabletop</p>
                <p className="hero-title">{BRAND.short}</p>
                <p className="hero-line">Gather your party. The tide is turning.</p>
              </div>
            </div>
            <div className="campaign-headline">
              <h1>My Campaigns</h1>
              <input className="campaign-search" aria-label="Search by name" placeholder="Search…" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="campaign-list" role="list">
              {shown.length === 0 ? (
                <p className="campaign-empty">{rows.length === 0 ? "No campaigns yet. Begin your first one." : "No campaign by that name."}</p>
              ) : null}
              {shown.map((campaign, index) => (
                <div key={campaign.id} role="listitem" className="campaign-card-row" onContextMenu={(event) => {
                  event.preventDefault();
                  setMenuFor({ id: campaign.id, x: event.clientX, y: event.clientY });
                }}>
                <button
                  type="button"
                  className={campaign.id === selectedId ? "campaign-card selected" : "campaign-card"}
                  style={{ animationDelay: `${index * 60}ms` }}
                  data-campaign={campaign.name}
                  onClick={() => setSelectedId(campaign.id === selectedId ? null : campaign.id)}
                >
                  <Crest name={campaign.name} />
                  <span className="card-words">
                    <span className="card-name">{campaign.name}</span>
                    <span className="card-meta">
                      <span className="ruleset-chip"><RulesetEmblem name={campaign.ruleset} picture={rulesetLogos[emblemKey(campaign.ruleset)]} size={16} />{campaign.ruleset}</span>
                      <span>{campaign.playedAt ? `played ${ago(campaign.playedAt)}` : "not played yet"}</span>
                    </span>
                  </span>
                  <span className="card-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
                {window.kraken?.manageCampaign ? (
                  <>
                    <button
                      type="button"
                      className="campaign-more"
                      data-action="campaign-menu"
                      aria-haspopup="menu"
                      aria-expanded={menuFor?.id === campaign.id}
                      aria-label={`More for ${campaign.name}`}
                      title="Rename, duplicate, export, backups, open folder, delete"
                      onClick={(event) => {
                        const box = event.currentTarget.getBoundingClientRect();
                        setMenuFor(menuFor?.id === campaign.id ? null : { id: campaign.id, x: box.left, y: box.bottom + 4 });
                      }}
                    >
                      ⋯
                    </button>
                    <CampaignMenu
                      campaign={campaign}
                      open={menuFor?.id === campaign.id}
                      anchor={menuFor?.id === campaign.id ? menuFor : null}
                      onOpenChange={(open) => !open && setMenuFor((current) => (current?.id === campaign.id ? null : current))}
                      onError={setLocalError}
                      onChanged={(select) => void reloadCampaigns(select)}
                    />
                  </>
                ) : null}
                </div>
              ))}
            </div>
            <button type="button" className="new-campaign" data-action="new-campaign" onClick={newCampaign}>
              <span aria-hidden="true">+</span> New campaign
            </button>
          </section>

          <section className="campaign-side">
            {selected ? (
              <form key={selected.id} className="campaign-detail glass rise" data-form="play" onSubmit={(event) => void play(event, selected)}>
                <div className="detail-head">
                  <Crest name={selected.name} />
                  <RulesetEmblem name={selected.ruleset} picture={rulesetLogos[emblemKey(selected.ruleset)]} size={40} />
                  <div>
                    <h2>{selected.name}</h2>
                    <p>
                      <select
                        className="ruleset-chip ruleset-select"
                        aria-label="Ruleset"
                        title="The campaign's ruleset: it decides its books"
                        value={selected.ruleset}
                        onChange={(event) => {
                          const ruleset = event.target.value;
                          void window.kraken
                            ?.setCampaignRuleset({ id: selected.id, ruleset })
                            .then((changed) => setRows((current) => current.map((item) => (item.id === changed.id ? changed : item))))
                            .catch((reason: Error) => setLocalError(reason.message));
                        }}
                      >
                        {[...new Set([...RULESETS.map((item) => item.name), selected.ruleset])].map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>{" "}
                      {formatPlayed(selected)}
                    </p>
                  </div>
                </div>
                <div className="detail-grid">
                  <label className="field">
                    <span>Your name</span>
                    <input name="dm-name" defaultValue={selected.gmName || "DM"} maxLength={24} autoComplete="nickname" />
                  </label>
                  <label className="field port">
                    <span>Port</span>
                    <input name="port" type="number" min={1} max={65535} defaultValue={selected.port} required onChange={(event) => setHostPort(event.target.value)} />
                  </label>
                </div>
                <label className="field">
                  <span>Password</span>
                  <input name="password" type="text" placeholder="Set a password" autoComplete="off" />
                </label>
                <p className="hint">Leave the password blank for a public game.</p>
                <div className="field">
                  <span>Players connect over</span>
                  <div className="toggles">
                    <label className={lanOn ? "toggle on" : "toggle"}>
                      <input type="checkbox" name="lan" checked={lanOn} onChange={(event) => setLanOn(event.target.checked)} />
                      <strong>LAN</strong>
                      <small>Your home or local network</small>
                    </label>
                    <label className={cloudOn ? "toggle on" : "toggle"}>
                      <input type="checkbox" name="cloud" checked={cloudOn} onChange={(event) => setCloudOn(event.target.checked)} />
                      <strong>Internet</strong>
                      <small>Players anywhere: your router's port opened for you, or by hand</small>
                    </label>
                  </div>
                  {cloudOn ? (
                    <label className="upnp-toggle hint">
                      <input type="checkbox" name="upnp" data-action="upnp" checked={upnpOn} onChange={(event) => setUpnpOn(event.target.checked)} /> Open the port on my router by itself (UPnP), and close it when I stop
                    </label>
                  ) : null}
                </div>
                <details className="addr-block">
                  <summary>Addresses to give your players</summary>
                  <p className="addr-heading">On your network</p>
                  {network.v4.length === 0 ? <CopyAddress label="IPv4" value="" /> : null}
                  {network.v4.map((address) => (
                    <CopyAddress key={address} label="IPv4" value={address} port={hostPort} />
                  ))}
                  {network.v6.map((address) => (
                    <CopyAddress key={address} label="IPv6" value={address} port={hostPort} />
                  ))}
                  <p className="addr-heading">On the internet</p>
                  <CopyAddress label="IPv4" value={network.externalV4} port={hostPort} />
                  <CopyAddress label="IPv6" value={network.externalV6} port={hostPort} />
                  <p className="hint">Copy gives a link: paste it into Discord or an email, and a click opens the table in your players' browsers. On this computer: {tableLink("127.0.0.1", hostPort)}</p>
                </details>
                <div className="play-row">
                  {!canHost ? <p className="hint">Hosting runs in the Maelstrom VTT app.</p> : null}
                  <button type="submit" className="play-button grand" data-action="play" disabled={busy || !canHost || (!lanOn && !cloudOn)}>
                    {busy ? "Raising the table…" : "Play"}
                  </button>
                </div>
                {alertLine}
              </form>
            ) : (
              <form key={`create-${beckon}`} className={beckon ? "campaign-create glass rise beckon" : "campaign-create glass rise"} data-form="create" onSubmit={(event) => void createCampaign(event)}>
                <h2>Begin a new campaign</h2>
                <label className="field">
                  <span>Name</span>
                  <input ref={newName} name="new-campaign" placeholder="The Keep on the Borderlands" aria-label="New campaign name" maxLength={80} required />
                </label>
                <div className="field">
                  <span className="ruleset-head">
                    Ruleset
                    {RULESETS.length > 9 ? <input className="ruleset-search" aria-label="Find a ruleset" placeholder="Find a ruleset…" value={rulesetQuery} onChange={(event) => setRulesetQuery(event.target.value)} /> : null}
                  </span>
                  <input type="hidden" name="new-ruleset" value={ruleset} />
                  <div className="ruleset-tiles" role="radiogroup" aria-label="Ruleset">
                    {rulesetsShown.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        role="radio"
                        aria-checked={ruleset === item.name}
                        className={ruleset === item.name ? "ruleset-tile on" : "ruleset-tile"}
                        data-ruleset={item.name}
                        title={item.blurb}
                        onClick={() => setRuleset(item.name)}
                      >
                        <RulesetEmblem name={item.name} picture={rulesetLogos[emblemKey(item.name)]} />
                        <span className="ruleset-words">
                          <strong>{item.name}</strong>
                          <small>{item.blurb}</small>
                        </span>
                      </button>
                    ))}
                    {rulesetsShown.length === 0 ? <p className="hint">No ruleset by that name.</p> : null}
                  </div>
                  {chosen ? (
                    <p className="ruleset-about" data-ruleset-about={chosen.name}>
                      <b>{chosen.name}.</b> {chosen.blurb}
                    </p>
                  ) : null}
                </div>
                <button type="submit" className="play-button grand" data-action="create">
                  Create campaign
                </button>
                {alertLine}
              </form>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
