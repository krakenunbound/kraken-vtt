import { diagonalRule, pathDistance } from "../../shared/map/geometry.mjs";
import type { HeldToken, MapRegion, MapToken, MoveRequest } from "../session/useSession";
import { Icon } from "../ui/icons";
import { terrainCostAt, type TerrainArea } from "./Ruler";

type GridScene = Parameters<typeof pathDistance>[0];
type Overlay = { width: number; height: number; scale: number };

// This turn's path (on the combat tracker): where each token went since its
// turn began, faint, with how far that was in all. The host sends a path to
// the GM and the token's owner only.
export function TokenPaths({ tokens, scene, diagonal, units, terrain, width, height, scale }: Overlay & { tokens: MapToken[]; scene: GridScene; diagonal: unknown; units: string; terrain?: TerrainArea[] }) {
  const walked = tokens.filter((token) => (token.path?.length ?? 0) >= 4);
  if (!walked.length) return null;
  return (
    <>
      <svg className="overlay measure token-paths" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {walked.map((token) => (
          <polyline key={token.id} data-path={token.id} points={(token.path ?? []).join(" ")} fill="none" stroke={token.color} strokeOpacity={0.45} strokeWidth={Math.max(3 / scale, 2)} strokeDasharray={`${2 / scale} ${6 / scale}`} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      {walked.map((token) => {
        const points = token.path ?? [];
        const { total } = pathDistance(scene, points, diagonalRule(diagonal), terrainCostAt(terrain));
        return (
          <span key={token.id} className="measure-label path-total" data-path-total={total} style={{ left: points[0], top: points[1], fontSize: 11 / scale, borderColor: token.color }}>
            {total} {units} this turn
          </span>
        );
      })}
    </>
  );
}

// Moves waiting for the GM while movement is locked (FG's TokenMoveManager):
// a ghost line from the token to where its player wants it.
export function MoveRequestGhosts({ requests, tokens, width, height, scale }: Overlay & { requests: MoveRequest[] | undefined; tokens: MapToken[] }) {
  if (!requests?.length) return null;
  return (
    <svg className="overlay measure move-requests" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {requests.map((request) => {
        const token = tokens.find((item) => item.id === request.id);
        const color = token?.color ?? "#ffd36b";
        return (
          <g key={request.id} data-move-request={request.id}>
            <line x1={request.from.x} y1={request.from.y} x2={request.to.x} y2={request.to.y} stroke={color} strokeWidth={3 / scale} strokeDasharray={`${10 / scale} ${6 / scale}`} />
            <circle cx={request.to.x} cy={request.to.y} r={((token?.squares ?? 1) * 18) / Math.max(scale, 0.2)} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2 / scale} />
          </g>
        );
      })}
    </svg>
  );
}

// The GM's approval strip: each waiting move with Accept and Cancel, and all of them at once.
export function MoveApprovals({ requests, approve }: { requests: MoveRequest[] | undefined; approve?: (ids: string[] | "all", accept: boolean) => void }) {
  if (!requests?.length || !approve) return null;
  return (
    <div className="move-approvals" role="group" aria-label="Moves waiting for you" onPointerDown={(event) => event.stopPropagation()}>
      <strong>Moves waiting</strong>
      {requests.map((request) => (
        <span key={request.id} className="move-approval" data-move-approval={request.id}>
          {request.name} <small>({request.by})</small>
          <button type="button" className="tool" aria-label={`Accept ${request.name}'s move`} title={`Accept: ${request.name} moves as ${request.by} asked`} onClick={() => approve([request.id], true)}>
            <Icon name="accept" size={16} />
          </button>
          <button type="button" className="tool" aria-label={`Cancel ${request.name}'s move`} title="Cancel: it stays where it is" onClick={() => approve([request.id], false)}>
            <Icon name="close" size={16} />
          </button>
        </span>
      ))}
      {requests.length > 1 ? (
        <>
          <button type="button" className="tool" data-action="approve-all" aria-label="Accept every move" title="Accept every move" onClick={() => approve("all", true)}>
            <Icon name="accept" size={16} /> all
          </button>
          <button type="button" className="tool" data-action="cancel-all" aria-label="Cancel every move" title="Cancel every move" onClick={() => approve("all", false)}>
            <Icon name="close" size={16} /> all
          </button>
        </>
      ) : null}
    </div>
  );
}

const REGION_COLOR: Record<string, string> = { trap: "#e53935", pit: "#8e24aa", difficult: "#f9a825", teleport: "#00acc1" };
// The GM's view of the regions (players never get traps, pits, teleports or notes):
// a faint outline in its kind's colour and its name.
// A player's view: the traps the GM has shown them, where they are (nothing of what they do).
export function RevealedTraps({ traps, width, height, scale }: Overlay & { traps: { id: string; kind: string; points: number[] }[] | undefined }) {
  if (!traps?.length) return null;
  return (
    <svg className="overlay regions revealed-traps" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-revealed-traps={traps.length}>
      {traps.map((trap) => (
        <polygon key={trap.id} data-revealed-trap={trap.id} points={trap.points.join(" ")} fill={trap.kind === "pit" ? "#8e24aa" : "#e53935"} fillOpacity={0.16} stroke={trap.kind === "pit" ? "#8e24aa" : "#e53935"} strokeWidth={2.5 / scale} strokeDasharray={`${8 / scale} ${5 / scale}`} />
      ))}
    </svg>
  );
}

// The GM's Traps sprung strip: each token a trap holds, what the trap does and what is rolled so far;
// roll its save and its damage, apply them (half or none on a save, the effect on a failed one: the
// token goes on), or let it go as it is.
export function TrapsSprung({ held, act }: { held: HeldToken[] | undefined; act?: (action: string, payload?: Record<string, unknown>) => void }) {
  if (!held?.length || !act) return null;
  return (
    <div className="move-approvals traps-sprung" role="group" aria-label="Traps sprung" onPointerDown={(event) => event.stopPropagation()}>
      <strong>Traps sprung</strong>
      {held.map(({ tokenId, name, held: state, region }) => {
        const trap = region?.trap ?? {};
        const save = state.save ? `save ${state.save.total}${state.save.success === true ? " made" : state.save.success === false ? " failed" : ""}` : "";
        const damage = state.damage ? `${state.damage.total} damage` : "";
        const what = [trap.save ? `${trap.save.attribute.toUpperCase()}${trap.save.dc !== undefined ? ` ${trap.save.dc}` : ""}${trap.half ? " half" : ""}` : "", trap.damage ? `${trap.damage}${trap.damageType ? ` ${trap.damageType}` : ""}` : "", trap.effect?.label ?? ""].filter(Boolean).join(", ");
        const go = (action: string) => act(action, { tokenId });
        return (
          <span key={tokenId} className="move-approval trap-held" data-trap-held={tokenId} title={`${state.name}${region?.note ? `: ${region.note}` : ""}`}>
            {name} <small>({state.name}{what ? `: ${what}` : ""})</small>
            {save || damage ? <small className="trap-rolled" data-trap-rolled={tokenId}>{[save, damage].filter(Boolean).join(", ")}</small> : null}
            {trap.save && !state.save ? (
              <button type="button" className="tool" data-trap-action="save" onClick={() => go("save")} title={`Roll ${name}'s save against it`}>
                Save
              </button>
            ) : null}
            {trap.damage && !state.damage ? (
              <button type="button" className="tool" data-trap-action="damage" onClick={() => go("damage")} title={`Roll its damage (${trap.damage}), for your eyes`}>
                Damage
              </button>
            ) : null}
            {trap.damage || trap.effect || trap.save ? (
              <button type="button" className="tool" data-trap-action="apply" onClick={() => go("apply")} title="Apply it: what is still to roll is rolled, the damage (half or none on a save) and the effect go on, and the token goes on">
                <Icon name="accept" size={16} /> Apply
              </button>
            ) : null}
            <button type="button" className="tool" data-trap-action="release" onClick={() => go("release")} aria-label={`Let ${name} go`} title="Let them go as they are (nothing applied)">
              <Icon name="close" size={16} />
            </button>
          </span>
        );
      })}
    </div>
  );
}

export function RegionShapes({ regions, width, height, scale, reveal }: Overlay & { regions: MapRegion[] | undefined; reveal?: (id: string, on: boolean) => void }) {
  if (!regions?.length) return null;
  return (
    <svg className="overlay regions" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" data-regions={regions.length}>
      {regions.map((region) => {
        const color = REGION_COLOR[region.kind] ?? "#e53935";
        const xs = region.points.filter((_, index) => index % 2 === 0);
        const ys = region.points.filter((_, index) => index % 2 === 1);
        return (
          <g key={region.id} data-region={region.id} data-region-kind={region.kind} opacity={region.on ? 1 : 0.4}>
            <title>{`${region.name}${region.note ? `: ${region.note}` : ""}`}</title>
            <polygon points={region.points.join(" ")} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={2 / scale} strokeDasharray={`${8 / scale} ${5 / scale}`} />
            <text x={Math.min(...xs) + 4 / scale} y={Math.min(...ys) + 14 / scale} fontSize={12 / scale} fill="#fff" stroke="#000" strokeWidth={3 / scale} paintOrder="stroke">
              {region.kind === "difficult" ? `${region.name} ×${region.cost ?? 2}` : `${region.kind === "teleport" ? "⇢" : "⚠"} ${region.name}`}
            </text>
            {reveal && (region.kind === "trap" || region.kind === "pit") ? (
              <g
                className={region.revealed ? "region-reveal on" : "region-reveal"}
                data-region-reveal={region.id}
                // Just outside its top right corner: a token standing in it (the one it caught) never covers it.
                transform={`translate(${Math.max(...xs) - 9 / scale} ${Math.min(...ys) - 22 / scale}) scale(${1 / scale})`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  reveal(region.id, !region.revealed);
                }}
              >
                <title>{region.revealed ? "Shown to the players (its outline): click to hide it" : "Hidden from the players: click to show them where it is"}</title>
                <rect width={18} height={18} rx={4} />
                <path d={region.revealed ? "M2 9 Q9 2 16 9 Q9 16 2 9 Z M9 6.5 A2.5 2.5 0 1 0 9 11.5 A2.5 2.5 0 1 0 9 6.5" : "M2 9 Q9 2 16 9 Q9 16 2 9 Z M3 15 L15 3"} />
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
