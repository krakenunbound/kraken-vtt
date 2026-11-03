import { useEffect, useState, type FormEvent } from "react";
import { Emblem } from "../ui/Emblem";
import type { KrakenCampaign, KrakenNetwork } from "../kraken";

type HostInput = { name: string; port: number; password: string; lan: boolean; cloud: boolean; campaignId: string };
type JoinInput = { name: string; address: string; port: number; password: string };

const EMPTY_NET: KrakenNetwork = { v4: [], v6: [], externalV4: "", externalV6: "" };

function formatColumn(campaign: KrakenCampaign): string {
  const stamp = campaign.playedAt ?? campaign.createdAt;
  return new Date(stamp).toLocaleDateString();
}

function formatPlayed(campaign: KrakenCampaign): string {
  if (!campaign.playedAt) return "Not played yet.";
  const when = new Date(campaign.playedAt).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Last played on ${when}.`;
}

function CopyAddress({ label, value }: { label: string; value: string }) {
  if (!value) {
    return (
      <p className="addr">
        <span className="addr-label">{label}</span>
        <span className="hint">None</span>
      </p>
    );
  }
  return (
    <p className="addr">
      <span className="addr-label">{label}</span>
      <span className="secret">{value}</span>
      <button type="button" aria-label={`Copy ${label} ${value}`} onClick={() => void window.kraken?.copy(value)}>
        Copy
      </button>
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
  onJoin: (input: JoinInput) => Promise<void>;
}) {
  // Opened in a browser from the host's address: this page is a player's way in.
  const inBrowser = !window.kraken && window.location.protocol.startsWith("http");
  const [mode, setMode] = useState<"campaigns" | "join">(inBrowser ? "join" : "campaigns");
  const [rows, setRows] = useState<KrakenCampaign[]>([]);
  const [network, setNetwork] = useState<KrakenNetwork>(EMPTY_NET);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("new-campaign") || "");
    const ruleset = String(data.get("new-ruleset") || "");
    setLocalError(null);
    try {
      if (!window.kraken) throw new Error("Campaigns are stored in the Kraken VTT app.");
      const campaign = await window.kraken.saveCampaign({ name, ruleset });
      setRows((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
      setSelectedId(campaign.id);
      event.currentTarget.reset();
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
    const lan = lanOn;
    const cloud = cloudOn;
    setLocalError(null);
    if (!lan && !cloud) {
      setLocalError("Turn on LAN or Cloud.");
      return;
    }
    try {
      const touched = await window.kraken?.touchCampaign({ id: campaign.id, port });
      if (touched) {
        setRows((current) => current.map((item) => (item.id === touched.id ? touched : item)));
      }
    } catch {
      /* The table can still start if the date stamp fails. */
    }
    await onHost({ name, port, password, lan, cloud, campaignId: campaign.id });
  }

  function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLocalError(null);
    void onJoin({
      name: String(data.get("name") || "Player"),
      address: String(data.get("address") || ""),
      port: Number(data.get("port")),
      password: String(data.get("password") || ""),
    });
  }

  return (
    <div className="setup">
      <header className="topbar">
        <div className="brand">Kraken</div>
        {inBrowser ? null : (
          <button type="button" className="join-toggle" data-action="join-mode" onClick={() => setMode(mode === "join" ? "campaigns" : "join")}>
            {mode === "join" ? "My campaigns" : "Join a game"}
          </button>
        )}
      </header>

      {mode === "join" ? (
        <form className="join-panel" data-form="join" onSubmit={submitJoin}>
          <Emblem className="join-emblem" />
          <h1>Join the table</h1>
          {inBrowser ? (
            <p>
              Joining the table at <span className="secret">{window.location.host}</span>. Leave the password blank when the game is public.
            </p>
          ) : (
            <p>Use the address and port from the DM. Leave the password blank when the game is public.</p>
          )}
          <label>
            Your name
            <input name="name" defaultValue={inBrowser ? "" : "Player"} placeholder="Your name" maxLength={24} autoComplete="nickname" required={inBrowser} />
          </label>
          {inBrowser ? (
            <>
              <input type="hidden" name="address" value={window.location.hostname} />
              <input type="hidden" name="port" value={window.location.port || (window.location.protocol === "https:" ? "443" : "80")} />
            </>
          ) : (
            <>
              <label>
                Address
                <input name="address" placeholder="192.168.1.20" required autoComplete="off" />
              </label>
              <label>
                Port
                <input name="port" type="number" min={1} max={65535} defaultValue={47300} required />
              </label>
            </>
          )}
          <label>
            Password
            <input name="password" type="text" placeholder="Blank if the game is public" autoComplete="off" />
          </label>
          <button type="submit" className="play-button" disabled={busy}>
            {busy ? "Joining…" : "Take your seat"}
          </button>
          {alert ? (
            <p className="error" role="alert">
              {alert}
            </p>
          ) : null}
        </form>
      ) : (
        <>
          <div className="campaign-scroll">
            <h1>My Campaigns</h1>
            <input
              className="campaign-search"
              aria-label="Search by name"
              placeholder="Search by name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="campaign-table" role="table">
              <div className="campaign-head" role="row">
                <span role="columnheader">Campaign</span>
                <span role="columnheader">Ruleset</span>
                <span role="columnheader">Date</span>
              </div>
              {shown.length === 0 ? <p className="hint campaign-empty">No campaigns yet. Create one below.</p> : null}
              {shown.map((campaign) => (
                <div key={campaign.id}>
                  <button
                    type="button"
                    className={campaign.id === selectedId ? "campaign-row selected" : "campaign-row"}
                    data-campaign={campaign.name}
                    onClick={() => setSelectedId(campaign.id === selectedId ? null : campaign.id)}
                  >
                    <span>{campaign.name}</span>
                    <span>{campaign.ruleset}</span>
                    <span>{formatColumn(campaign)}</span>
                  </button>
                  {selected?.id === campaign.id ? (
                    <form key={campaign.id} className="campaign-detail" data-form="play" onSubmit={(event) => void play(event, campaign)}>
                      <div className="detail-title">
                        <strong>{campaign.name}</strong>
                        <span>{campaign.ruleset}</span>
                      </div>
                      <p>{formatPlayed(campaign)}</p>
                      <label className="conn-row">
                        <span>Password</span>
                        <input name="password" type="text" placeholder="Set password" autoComplete="off" />
                      </label>
                      <p className="hint">Leave the password blank for a public game. LAN and Cloud do not require one.</p>
                      <div className="conn-row">
                        <span>Connection</span>
                        <span className="checks">
                          <label>
                            <input
                              type="checkbox"
                              name="cloud"
                              checked={cloudOn}
                              onChange={(event) => setCloudOn(event.target.checked)}
                            />
                            Cloud
                          </label>
                          <label>
                            <input type="checkbox" name="lan" checked={lanOn} onChange={(event) => setLanOn(event.target.checked)} />
                            LAN
                          </label>
                        </span>
                      </div>
                      <label className="conn-row">
                        <span>Port</span>
                        <input name="port" type="number" min={1} max={65535} defaultValue={campaign.port} required />
                      </label>
                      <label className="conn-row">
                        <span>Your name</span>
                        <input name="dm-name" defaultValue="DM" maxLength={24} autoComplete="nickname" />
                      </label>
                      <div className="addr-block">
                        <p className="addr-heading">Internal addresses</p>
                        {network.v4.length === 0 ? <CopyAddress label="IPv4" value="" /> : null}
                        {network.v4.map((address) => (
                          <CopyAddress key={address} label="IPv4" value={address} />
                        ))}
                        {network.v6.length === 0 ? <CopyAddress label="IPv6" value="" /> : null}
                        {network.v6.map((address) => (
                          <CopyAddress key={address} label="IPv6" value={address} />
                        ))}
                        <p className="addr-heading">External addresses</p>
                        <CopyAddress label="IPv4" value={network.externalV4} />
                        <CopyAddress label="IPv6" value={network.externalV6} />
                        <p className="hint">Same computer: 127.0.0.1. Cloud players use an external address when that port can be reached.</p>
                      </div>
                      <div className="play-row">
                        {!canHost ? <p className="hint">Hosting runs in the Kraken VTT app.</p> : null}
                        <button type="submit" className="play-button" data-action="play" disabled={busy || !canHost || (!lanOn && !cloudOn)}>
                          {busy ? "Starting…" : "Play"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
            {alert ? (
              <p className="error" role="alert">
                {alert}
              </p>
            ) : null}
          </div>
          <form className="campaign-create" data-form="create" onSubmit={(event) => void createCampaign(event)}>
            <input name="new-campaign" placeholder="New campaign name" aria-label="New campaign name" maxLength={80} required />
            <input name="new-ruleset" placeholder="Ruleset" aria-label="Ruleset" defaultValue="Worldbuilding" maxLength={40} />
            <button type="submit" data-action="create">
              Create
            </button>
          </form>
        </>
      )}
    </div>
  );
}
