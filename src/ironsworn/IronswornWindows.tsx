import { useMemo, useState } from "react";
import type { Session } from "../session/useSession";
import { RANK_NAMES, RANKS } from "../../shared/ironsworn/rules.mjs";

// Ironsworn's and Starforged's Oracles window: every table of the campaign's
// active Reference (the CC BY oracles), by category, searchable; a click
// rolls it on the host's dice for the whole table (the tables a row sends you
// to are rolled too). Ask the Oracle's odds sit on top. Players and the GM
// alike: these games are often played without one.
export function OraclesWindow({ session }: { session: Session }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string>("");
  const [last, setLast] = useState<{ name: string; roll: number; result: string; also: string[] } | null>(null);
  const [problem, setProblem] = useState("");
  const oracles = useMemo(
    () => Object.values(session.records).filter((record) => record.type === "ironoracle").sort((a, b) => String(a.data.fgCategory ?? "").localeCompare(String(b.data.fgCategory ?? "")) || a.name.localeCompare(b.name)),
    [session.records],
  );
  const ask = oracles.filter((record) => /ask_the_oracle\./.test(String(record.data.oracleid ?? "")));
  const want = search.trim().toLowerCase();
  const shown = oracles.filter((record) => !want || `${String(record.data.fgCategory ?? "")} ${record.name}`.toLowerCase().includes(want));
  const categories = [...new Set(shown.map((record) => String(record.data.fgCategory ?? "")))];
  const roll = async (id: string) => {
    setProblem("");
    try {
      const result = (await session.ironsworn("oracle", "", { oracle: id })) as { oracle?: string; roll?: number; result?: string; also?: { result: string }[] };
      setLast({ name: String(result.oracle ?? ""), roll: Number(result.roll ?? 0), result: String(result.result ?? ""), also: (result.also ?? []).map((item) => item.result) });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };
  if (oracles.length === 0) return <p className="hint">No oracles yet: the GM makes the game's Reference book active (Modules).</p>;
  return (
    <div className="iron-oracles" data-oracles={oracles.length}>
      <div className="cc-inline iron-ask">
        <b>Ask the Oracle</b>
        {ask.map((record) => (
          <button key={record.id} type="button" data-ask={record.name} onClick={() => void roll(record.id)}>
            {record.name}
          </button>
        ))}
      </div>
      {last ? (
        <p className="iron-oracle-result" data-oracle-result={last.roll}>
          <b>{last.name}</b> {last.roll}: {last.result}
          {last.also.length ? <span className="hint"> · {last.also.join(" · ")}</span> : null}
        </p>
      ) : null}
      {problem ? <p className="error">{problem}</p> : null}
      <input placeholder="Search the oracles" aria-label="Oracle search" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="iron-oracle-list">
        {categories.map((category) => (
          <details key={category} open={Boolean(want) || open === category} onToggle={(event) => (event.currentTarget.open ? setOpen(category) : undefined)}>
            <summary>{category || "Oracles"}</summary>
            {shown
              .filter((record) => String(record.data.fgCategory ?? "") === category)
              .map((record) => (
                <button key={record.id} type="button" className="iron-oracle" data-oracle={`${category}: ${record.name}`} title={String(record.data.description ?? "")} onClick={() => void roll(record.id)}>
                  {record.name} <small className="hint">{String(record.data.dice ?? "d100")}</small>
                </button>
              ))}
          </details>
        ))}
      </div>
    </div>
  );
}

// Delve's sites (the GM's): a theme and a domain make the site's feature and
// danger tables (theme first, then domain, then Reveal a Danger); rolled for
// the table; a character can take the site's progress track.
export function DelveWindow({ session }: { session: Session }) {
  const sites = Object.values(session.records).filter((record) => record.type === "irondelve");
  const themes = sites.filter((record) => record.data.kind === "theme").sort((a, b) => a.name.localeCompare(b.name));
  const domains = sites.filter((record) => record.data.kind === "domain").sort((a, b) => a.name.localeCompare(b.name));
  const characters = Object.values(session.records).filter((record) => record.type === "character" && record.data.ruleset === "ironsworn");
  const [theme, setTheme] = useState(themes[0]?.name ?? "");
  const [domain, setDomain] = useState(domains[0]?.name ?? "");
  const [rank, setRank] = useState("dangerous");
  const [name, setName] = useState("");
  const [who, setWho] = useState("");
  const [result, setResult] = useState("");
  const [problem, setProblem] = useState("");
  const themeRecord = themes.find((record) => record.name === theme);
  const domainRecord = domains.find((record) => record.name === domain);
  const roll = async (what: "feature" | "danger") => {
    setProblem("");
    try {
      const out = (await session.ironsworn("site", "", { theme, domain, what })) as { roll?: number; result?: string; from?: string };
      setResult(`${what === "danger" ? "Danger" : "Feature"} ${out.roll}: ${out.result} (${out.from})`);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };
  if (sites.length === 0) return <p className="hint">No Delve themes yet: make Ironsworn Foes and Sites active (Modules).</p>;
  return (
    <div className="iron-delve" data-delve>
      <p className="cc-inline">
        <label>
          Theme{" "}
          <select value={theme} aria-label="Delve theme" onChange={(event) => setTheme(event.target.value)}>
            {themes.map((record) => (
              <option key={record.id}>{record.name}</option>
            ))}
          </select>
        </label>
        <label>
          Domain{" "}
          <select value={domain} aria-label="Delve domain" onChange={(event) => setDomain(event.target.value)}>
            {domains.map((record) => (
              <option key={record.id}>{record.name}</option>
            ))}
          </select>
        </label>
      </p>
      <p className="hint">
        {String(themeRecord?.data.summary ?? "")} {String(domainRecord?.data.summary ?? "")}
      </p>
      <p className="cc-inline">
        <button type="button" data-action="delve-feature" onClick={() => void roll("feature")}>
          Roll a feature
        </button>
        <button type="button" data-action="delve-danger" onClick={() => void roll("danger")}>
          Reveal a danger
        </button>
      </p>
      {result ? <p className="iron-oracle-result" data-delve-result>{result}</p> : null}
      {problem ? <p className="error">{problem}</p> : null}
      <h4>Discover a site</h4>
      <p className="cc-inline">
        <input placeholder="The site's name" value={name} onChange={(event) => setName(event.target.value)} />
        <select value={rank} aria-label="Site rank" onChange={(event) => setRank(event.target.value)}>
          {(RANKS as string[]).map((value) => (
            <option key={value} value={value}>
              {RANK_NAMES[value as keyof typeof RANK_NAMES]}
            </option>
          ))}
        </select>
        <select value={who} aria-label="Site for" onChange={(event) => setWho(event.target.value)}>
          <option value="">for…</option>
          {characters.map((record) => (
            <option key={record.id} value={record.id}>
              {record.name}
            </option>
          ))}
        </select>
        <button type="button" data-action="delve-site" disabled={!who} onClick={() => void session.ironsworn("site-add", who, { theme, domain, rank, name }).catch((error: unknown) => setProblem(error instanceof Error ? error.message : String(error)))}>
          Add its track
        </button>
      </p>
    </div>
  );
}
