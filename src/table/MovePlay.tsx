import { diagonalRule, pathDistance } from "../../shared/map/geometry.mjs";
import type { MapRegion, MapToken, MoveRequest } from "../session/useSession";
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
            <Icon name="check" size={16} />
          </button>
          <button type="button" className="tool" aria-label={`Cancel ${request.name}'s move`} title="Cancel: it stays where it is" onClick={() => approve([request.id], false)}>
            <Icon name="close" size={16} />
          </button>
        </span>
      ))}
      {requests.length > 1 ? (
        <>
          <button type="button" className="tool" data-action="approve-all" aria-label="Accept every move" title="Accept every move" onClick={() => approve("all", true)}>
            <Icon name="check" size={16} /> all
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
export function RegionShapes({ regions, width, height, scale }: Overlay & { regions: MapRegion[] | undefined }) {
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
          </g>
        );
      })}
    </svg>
  );
}
