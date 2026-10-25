import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import {
  LANE_SPACING,
  laneOffset,
  lanePoints,
  laneSpread,
  type Point,
} from "../src/architecture/edges/lanePath";

interface Route {
  name: string;
  source: Point;
  target: Point;
  sourcePos: Position;
  targetPos: Position;
}

const right = (name: string, source: Point, target: Point): Route => ({
  name,
  source,
  target,
  sourcePos: Position.Right,
  targetPos: Position.Left,
});

const roomy: Route[] = [
  right("Z, target ahead and below", { x: 0, y: 0 }, { x: 200, y: 100 }),
  right("Z, target ahead and above", { x: 0, y: 100 }, { x: 200, y: 0 }),
  right("Z, 45px apart", { x: 0, y: 0 }, { x: 45, y: 100 }),
  right("S, target 30px ahead", { x: 0, y: 0 }, { x: 30, y: 120 }),
  right("S, target 40px behind", { x: 0, y: 0 }, { x: -40, y: 150 }),
  right("straight", { x: 0, y: 0 }, { x: 150, y: 0 }),
  {
    name: "Z, vertical handles",
    source: { x: 0, y: 0 },
    target: { x: -120, y: 200 },
    sourcePos: Position.Bottom,
    targetPos: Position.Top,
  },
];

type Segment = [Point, Point];

const segments = (points: Point[]): Segment[] =>
  points.slice(1).map((p, i) => [points[i]!, p]);

const heading = ([a, b]: Segment) => [Math.sign(b.x - a.x), Math.sign(b.y - a.y)];

/** Exact for axis-aligned segments, touching included. */
const touches = ([a, b]: Segment, [c, d]: Segment) =>
  Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <=
    Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) &&
  Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <=
    Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));

/** Every lane of a group, traced source → target; odd lanes point the other way. */
function group(r: Route, count: number): Point[][] {
  const spread = laneSpread(count);
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0
      ? lanePoints(r.source, r.target, r.sourcePos, laneOffset(i, count, false), spread)
      : lanePoints(r.target, r.source, r.targetPos, laneOffset(i, count, true), spread).reverse(),
  );
}

function expectSeparateLanes(r: Route, count: number): Point[][] {
  const lanes = group(r, count);
  const centre = lanePoints(r.source, r.target, r.sourcePos, 0, laneSpread(count));
  const alongX = r.sourcePos === Position.Right || r.sourcePos === Position.Left;
  const along = (p: Point) => (alongX ? p.x : p.y);
  for (const lane of lanes) {
    // Ends stay on their node's side.
    expect(along(lane[0]!)).toBe(along(r.source));
    expect(along(lane[lane.length - 1]!)).toBe(along(r.target));
    // Same shape as the centre line: no segment vanishes or doubles back.
    expect(segments(lane).map(heading)).toEqual(segments(centre).map(heading));
  }
  for (let i = 0; i < lanes.length; i++) {
    for (let j = i + 1; j < lanes.length; j++) {
      for (const a of segments(lanes[i]!)) {
        for (const b of segments(lanes[j]!)) expect(touches(a, b)).toBe(false);
      }
    }
  }
  return lanes;
}

describe("lanePoints", () => {
  for (const r of roomy) {
    for (const count of [2, 3, 4]) {
      it(`keeps ${count} lanes parallel at full spacing: ${r.name}`, () => {
        const lanes = expectSeparateLanes(r, count);
        for (let i = 1; i < lanes.length; i++) {
          lanes[i]!.forEach((p, k) => {
            const q = lanes[i - 1]![k]!;
            expect(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y))).toBeCloseTo(LANE_SPACING);
          });
        }
      });
    }
  }

  it("squeezes lanes together instead of doubling back when the route is too flat", () => {
    const flat = right("flat S", { x: 0, y: 0 }, { x: 30, y: 10 });
    const lanes = expectSeparateLanes(flat, 2);
    const gap = Math.abs(lanes[1]![0]!.y - lanes[0]![0]!.y);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(LANE_SPACING);
  });
});
