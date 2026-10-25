import { Position } from "@xyflow/react";

export interface Point {
  x: number;
  y: number;
}

/** Distance between the lines of edges that join the same two nodes. */
export const LANE_SPACING = 14;
/** Straight run out of each handle before an S-shaped route turns (xyflow's smooth-step default). */
const STUB = 20;
/** Shortest straight run any lane keeps out of its handle. */
const MIN_RUN = 6;
/** Shortest a lane's segment may get before the whole group is squeezed closer together. */
const MIN_SEGMENT = 1;

/**
 * Sideways offset of lane `index` of `count` from the centre line its group
 * shares, positive to the right of the edge's own direction of travel. Lanes
 * are numbered across the pair's canonical direction (lower node id to
 * higher), so an edge pointing the other way flips the sign and still lands
 * in its own lane.
 */
export function laneOffset(index: number, count: number, reversed: boolean): number {
  const offset = (index - (count - 1) / 2) * LANE_SPACING;
  return reversed ? -offset : offset;
}

/** Largest |laneOffset| in a group of `count` lanes. */
export function laneSpread(count: number): number {
  return ((count - 1) / 2) * LANE_SPACING;
}

/**
 * Corner points of one lane between two handles on opposite sides of an axis.
 *
 * Every lane of a group is an offset of one centre line: the route xyflow's
 * smooth-step edge takes (a Z through the midpoint when the target is far
 * enough ahead, an S that first runs out of each handle when it isn't, or a
 * straight line when the handles line up). Offsets of one line stay parallel,
 * so lanes never cross or overlap. When a segment is too short for the
 * group's full `spread`, every lane is squeezed by the same factor instead of
 * doubling back.
 */
export function lanePoints(
  source: Point,
  target: Point,
  sourcePos: Position,
  offset: number,
  spread: number,
): Point[] {
  const centre = centreLine(source, target, sourcePos, Math.max(STUB, spread + MIN_RUN));
  const scale = spread > 0 ? Math.min(1, maxSpread(centre) / spread) : 1;
  return offsetLine(centre, offset * scale);
}

/** A lane's SVG path with rounded corners, plus a fallback label point at its middle. */
export function lanePath(
  source: Point,
  target: Point,
  sourcePos: Position,
  offset: number,
  spread: number,
  radius: number,
): [path: string, labelX: number, labelY: number] {
  const points = lanePoints(source, target, sourcePos, offset, spread);
  const a = points[Math.floor((points.length - 1) / 2)]!;
  const b = points[Math.ceil((points.length - 1) / 2)]!;
  return [roundedPath(points, radius), (a.x + b.x) / 2, (a.y + b.y) / 2];
}

function centreLine(s: Point, t: Point, sourcePos: Position, stub: number): Point[] {
  const alongX = sourcePos === Position.Left || sourcePos === Position.Right;
  const dir = sourcePos === Position.Right || sourcePos === Position.Bottom ? 1 : -1;
  // u runs along the axis the handles face, v across it.
  const [su, sv, tu, tv] = alongX ? [s.x, s.y, t.x, t.y] : [s.y, s.x, t.y, t.x];
  const at = (u: number, v: number): Point => (alongX ? { x: u, y: v } : { x: v, y: u });
  if (Math.abs(tv - sv) < 1) return [at(su, sv), at(tu, tv)];
  if ((tu - su) * dir > 2 * stub) {
    const cu = (su + tu) / 2;
    return [at(su, sv), at(cu, sv), at(cu, tv), at(tu, tv)];
  }
  const a = su + dir * stub;
  const b = tu - dir * stub;
  const cv = (sv + tv) / 2;
  return simplify([at(su, sv), at(a, sv), at(a, cv), at(b, cv), at(b, tv), at(tu, tv)]);
}

/** Drops repeated points and points in the middle of a straight run. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    const straight =
      prev &&
      last &&
      Math.sign(last.x - prev.x) === Math.sign(p.x - last.x) &&
      Math.sign(last.y - prev.y) === Math.sign(p.y - last.y);
    if (straight) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Unit direction of each segment, along its dominant axis. */
function directions(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const dx = points[i + 1]!.x - points[i]!.x;
    const dy = points[i + 1]!.y - points[i]!.y;
    out.push(Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
  }
  return out;
}

/** `points` moved `d` to the right of the direction of travel; corners move diagonally. */
function offsetLine(points: Point[], d: number): Point[] {
  const dirs = directions(points);
  return points.map((p, i) => {
    let nx = 0;
    let ny = 0;
    // Right-hand normal of (x, y) in screen coordinates (y down) is (-y, x).
    for (const u of [dirs[i - 1], dirs[i]]) {
      if (!u) continue;
      nx -= u.y;
      ny += u.x;
    }
    return { x: p.x + d * nx, y: p.y + d * ny };
  });
}

/** Largest offset every segment of `points` can take without shrinking below MIN_SEGMENT. */
function maxSpread(points: Point[]): number {
  const unit = offsetLine(points, 1);
  let max = Infinity;
  directions(points).forEach((u, k) => {
    const a = points[k]!;
    const b = points[k + 1]!;
    const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    // How much the segment lengthens per unit of offset (negative: shortens).
    const growth =
      (unit[k + 1]!.x - b.x - (unit[k]!.x - a.x)) * u.x +
      (unit[k + 1]!.y - b.y - (unit[k]!.y - a.y)) * u.y;
    if (growth !== 0) max = Math.min(max, Math.max(0, (length - MIN_SEGMENT) / Math.abs(growth)));
  });
  return max;
}

/** Orthogonal path through `points`, each corner rounded (capped at half the shorter side). */
function roundedPath(points: Point[], radius: number): string {
  const first = points[0]!;
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i + 1 < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const r = Math.min(
      radius,
      (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 2,
      (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)) / 2,
    );
    const inX = Math.sign(b.x - a.x);
    const inY = Math.sign(b.y - a.y);
    const outX = Math.sign(c.x - b.x);
    const outY = Math.sign(c.y - b.y);
    d += ` L${b.x - inX * r} ${b.y - inY * r} Q${b.x} ${b.y} ${b.x + outX * r} ${b.y + outY * r}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${last.x} ${last.y}`;
}
