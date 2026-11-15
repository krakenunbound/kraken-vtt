import type { MapToken } from "../session/useSession";

// What a token wears (FG's token options, as the host chose for this seat):
// its health as a bar or a dot (always, or while the pointer is over it), its
// name (on hover, always, or none), and its elevation when it is off the ground.
export function TokenBadges({ token, span, labelSize, units }: { token: MapToken; span: number; labelSize: number; units: string }) {
  const show = token.healthShow ?? "dot";
  const hover = show.endsWith("hover");
  const health = token.health;
  const hurt = health ? Math.min(1, Math.max(0, health.percent)) : 0;
  return (
    <>
      {health && show.startsWith("bar") ? (
        <i
          className={hover ? "health-bar hover-only" : "health-bar"}
          role="meter"
          aria-label={`Health: ${health.status}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((1 - hurt) * 100)}
          data-status={health.status}
          title={health.status}
          style={{ height: Math.max(3, span * 0.07) }}
        >
          <b style={{ inlineSize: `${(1 - hurt) * 100}%`, background: health.color }} />
        </i>
      ) : health ? (
        <i className={hover ? "health-dot hover-only" : "health-dot"} data-status={health.status} title={health.status} style={{ background: health.color, width: span * 0.18, height: span * 0.18 }} />
      ) : null}
      {token.elevation ? (
        <span className="token-elevation" data-elevation={token.elevation} title={`Elevation ${token.elevation} ${units}`} style={{ fontSize: Math.max(span * 0.16, labelSize * 0.8) }}>
          {token.elevation > 0 ? "▲" : "▼"}
          {Math.abs(token.elevation)}
        </span>
      ) : null}
      {token.name && token.namesShow !== "off" ? (
        <span className={token.namesShow === "always" ? "token-name always" : "token-name"} style={{ fontSize: labelSize }}>
          {token.name}
        </span>
      ) : token.name && token.mine ? (
        <span className="token-name" style={{ fontSize: labelSize }}>
          {token.name}
        </span>
      ) : null}
    </>
  );
}
