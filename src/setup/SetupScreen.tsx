import { useEffect, useRef, useState, type FormEvent } from "react";
import { LivingEmblem, Mark } from "../ui/Emblem";
import type { KrakenCampaign, KrakenNetwork } from "../kraken";
import "@fontsource/cinzel/latin-500.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import { Backdrop } from "./Backdrop";
import "./setup.css";

type HostInput = { name: string; port: number; password: string; lan: boolean; cloud: boolean; campaignId: string };
type JoinInput = { name: string; address: string; port: number; password: string };

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

// The rulesets a campaign can be made with.
const RULESETS = [
  { name: "Castles & Crusades", blurb: "SiegeCore rules: character sheets, the SIEGE engine, combat and spells." },
  { name: "Worldbuilding", blurb: "No game rules: maps, tokens, chat and dice for any system." },
];

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

function CopyAddress({ label, value }: { label: string; value: string }) {
  return (
    <p className="addr">
      <span className="addr-label">{label}</span>
      {value ? (
        <>
          <span className="secret">{value}</span>
          <button type="button" className="addr-copy" aria-label={`Copy ${label} ${value}`} onClick={() => void window.kraken?.copy(value)}>
            Copy
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
  // Home: the two ways in, side by side; then a campaign to run, or a game to join.
  const [mode, setMode] = useState<"home" | "campaigns" | "join">(inBrowser ? "join" : "home");
  const [recent, setRecent] = useState<RecentGame[]>(() => recentGames());
  const [joinFill, setJoinFill] = useState<RecentGame | null>(null);
  const [rows, setRows] = useState<KrakenCampaign[]>([]);
  const [network, setNetwork] = useState<KrakenNetwork>(EMPTY_NET);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ruleset, setRuleset] = useState(RULESETS[0].name);
  const [beckon, setBeckon] = useState(0);
  const newName = useRef<HTMLInputElement>(null);
  const [lanOn, setLanOn] = useState(true);
  const [cloudOn, setCloudOn] = useState(false);
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

  const shown = rows
    .filter((campaign) => campaign.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.playedAt ?? b.createdAt) - (a.playedAt ?? a.createdAt));
  const selected = rows.find((campaign) => campaign.id === selectedId) ?? null;
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
      if (!window.kraken) throw new Error("Campaigns are stored in the Kraken VTT app.");
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
    const name = String(data.get("dm-name") || "DM");
    setLocalError(null);
    if (!lanOn && !cloudOn) {
      setLocalError("Turn on LAN or Cloud.");
      return;
    }
    try {
      const touched = await window.kraken?.touchCampaign({ id: campaign.id, port });
      if (touched) setRows((current) => current.map((item) => (item.id === touched.id ? touched : item)));
    } catch {
      /* The table can still start if the date stamp fails. */
    }
    await onHost({ name, port, password, lan: lanOn, cloud: cloudOn, campaignId: campaign.id });
  }

  // Joining; a game joined is kept for a quick way back.
  async function join(game: { name: string; address: string; port: number; password: string }) {
    setLocalError(null);
    try {
      // Only a game that let us in is kept.
      if ((await onJoin(game)) === false) return;
      rememberGame({ ...game, at: Date.now() });
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
      <Backdrop scene={mode === "join" ? "hall" : "keep"} />
      <header className="setup-bar">
        <div className="brand">
          <Mark /> Kraken <span className="brand-sub">VTT</span> <span className="brand-version" title="Alpha test version">{__KRAKEN_VERSION__}</span>
        </div>
        {inBrowser || mode === "home" ? null : (
          <button type="button" className="join-toggle" data-action="home" onClick={() => setMode("home")}>
            ‹ Home
          </button>
        )}
      </header>

      {mode === "home" ? (
        <main className="home-stage">
          <div className="home-hero rise">
            <LivingEmblem size={170} />
            <div>
              <p className="hero-kicker">Virtual tabletop</p>
              <h1 className="hero-title">Kraken</h1>
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
          {alertLine}
        </main>
      ) : mode === "join" ? (
        <main className="join-stage">
          <form key={joinFill ? `${joinFill.address}:${joinFill.port}` : "new"} className="join-panel glass" data-form="join" onSubmit={submitJoin}>
            <LivingEmblem size={170} />
            <h1>Take your seat</h1>
            {inBrowser ? (
              <p className="join-lede">
                The table at <span className="secret">{window.location.host}</span> is waiting. Leave the password blank when the game is public.
              </p>
            ) : (
              <p className="join-lede">Use the address and port from your GM. Leave the password blank when the game is public.</p>
            )}
            <label className="field">
              <span>Your name</span>
              <input name="name" defaultValue={joinFill?.name ?? (inBrowser ? recent.find((game) => game.address === window.location.hostname)?.name ?? "" : "Player")} placeholder="What does the table call you?" maxLength={24} autoComplete="nickname" required={inBrowser} />
            </label>
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
              <span>Password</span>
              <input name="password" type="text" placeholder="Blank if the game is public" autoComplete="off" defaultValue={joinFill?.password ?? ""} />
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
                <p className="hero-title">Kraken</p>
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
                <button
                  key={campaign.id}
                  type="button"
                  role="listitem"
                  className={campaign.id === selectedId ? "campaign-card selected" : "campaign-card"}
                  style={{ animationDelay: `${index * 60}ms` }}
                  data-campaign={campaign.name}
                  onClick={() => setSelectedId(campaign.id === selectedId ? null : campaign.id)}
                >
                  <Crest name={campaign.name} />
                  <span className="card-words">
                    <span className="card-name">{campaign.name}</span>
                    <span className="card-meta">
                      <span className="ruleset-chip">{campaign.ruleset}</span>
                      <span>{campaign.playedAt ? `played ${ago(campaign.playedAt)}` : "not played yet"}</span>
                    </span>
                  </span>
                  <span className="card-arrow" aria-hidden="true">
                    ›
                  </span>
                </button>
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
                    <input name="dm-name" defaultValue="DM" maxLength={24} autoComplete="nickname" />
                  </label>
                  <label className="field port">
                    <span>Port</span>
                    <input name="port" type="number" min={1} max={65535} defaultValue={selected.port} required />
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
                      <strong>Cloud</strong>
                      <small>The internet, when the port is open</small>
                    </label>
                  </div>
                </div>
                <details className="addr-block">
                  <summary>Addresses to give your players</summary>
                  <p className="addr-heading">On your network</p>
                  {network.v4.length === 0 ? <CopyAddress label="IPv4" value="" /> : null}
                  {network.v4.map((address) => (
                    <CopyAddress key={address} label="IPv4" value={address} />
                  ))}
                  {network.v6.map((address) => (
                    <CopyAddress key={address} label="IPv6" value={address} />
                  ))}
                  <p className="addr-heading">On the internet</p>
                  <CopyAddress label="IPv4" value={network.externalV4} />
                  <CopyAddress label="IPv6" value={network.externalV6} />
                  <p className="hint">On this computer: 127.0.0.1. Players add the port, as http://address:port.</p>
                </details>
                <div className="play-row">
                  {!canHost ? <p className="hint">Hosting runs in the Kraken VTT app.</p> : null}
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
                  <span>Ruleset</span>
                  <input type="hidden" name="new-ruleset" value={ruleset} />
                  <div className="ruleset-tiles" role="radiogroup" aria-label="Ruleset">
                    {RULESETS.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        role="radio"
                        aria-checked={ruleset === item.name}
                        className={ruleset === item.name ? "ruleset-tile on" : "ruleset-tile"}
                        data-ruleset={item.name}
                        onClick={() => setRuleset(item.name)}
                      >
                        <strong>{item.name}</strong>
                        <small>{item.blurb}</small>
                      </button>
                    ))}
                  </div>
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
